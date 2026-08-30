-- ============================================================
-- Testes de COMPORTAMENTO — Fase 7 (Financeiro)
--
-- Responde a "o sistema faz mesmo isto?", não a "o código
-- parece dizer que faz". Cria os seus próprios dados, verifica
-- o efeito real e limpa no fim.
-- ============================================================

\set ON_ERROR_STOP on
set search_path = erp, public;

create temporary table if not exists resultado (
  teste text, esperado text, obtido text, passou boolean
);

create or replace function pg_temp.verificar(p_teste text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
declare ok boolean;
begin
  ok := coalesce(p_esperado, '') = coalesce(p_obtido, '');
  insert into resultado values (p_teste, p_esperado, p_obtido, ok);
  if ok then
    raise notice 'PASSA · %', p_teste;
  else
    raise notice 'FALHA · % (esperado %, obtido %)', p_teste, p_esperado, p_obtido;
  end if;
end $$;

do $$
declare
  v_adm uuid; v_vend uuid; v_esc uuid;
  v_cliente uuid; v_produto uuid; v_pedido uuid;
  v_forma_transf uuid; v_forma_dinheiro uuid;
  v_pag uuid; v_pag2 uuid; v_conta uuid; v_despesa uuid;
  v_erro text; v_num numeric; v_txt text; v_n integer;
begin
  -- ---------------------------------------------------------- dados de apoio
  insert into auth.users (id, email) values (gen_random_uuid(), 'aud.adm7@teste.local')
    returning id into v_adm;
  insert into auth.users (id, email) values (gen_random_uuid(), 'aud.vend7@teste.local')
    returning id into v_vend;
  insert into auth.users (id, email) values (gen_random_uuid(), 'aud.esc7@teste.local')
    returning id into v_esc;

  insert into erp.utilizadores (user_id, nome, email, perfil, ativo)
  values (v_adm, 'Aud ADM 7', 'aud.adm7@teste.local', 'adm', true),
         (v_vend, 'Aud Vendedora 7', 'aud.vend7@teste.local', 'vendedora', true),
         (v_esc, 'Aud Escritorio 7', 'aud.esc7@teste.local', 'escritorio', true);

  perform set_config('request.jwt.claim.sub', v_adm::text, true);

  select id into v_forma_transf from erp.formas_pagamento
   where exige_comprovativo and eliminado_em is null limit 1;
  select id into v_forma_dinheiro from erp.formas_pagamento
   where entra_caixa and eliminado_em is null limit 1;

  insert into erp.clientes (nome, telefone, tipo)
  values ('Cliente Financeiro 7', '911000777', 'particular') returning id into v_cliente;

  insert into erp.produtos (sku, nome, preco_venda, custo_ultimo, tipo_fornecimento)
  values ('AUD-FIN7', 'Produto Financeiro 7', 100.00, 40.00, 'stock') returning id into v_produto;

  insert into erp.pedidos (cliente_id, vendedor_id, estado, total, origem)
  values (v_cliente, (select id from erp.utilizadores where user_id = v_vend),
          'confirmado', 200.00, 'loja')
  returning id into v_pedido;

  insert into erp.pagamentos (pedido_id, forma_id, valor, estado)
  values (v_pedido, v_forma_transf, 200.00, 'pendente_confirmacao')
  returning id into v_pag;

  -- A — o prazo-limite de confirmação é preenchido automaticamente
  select case when data_limite_confirmacao is null then 'sem limite' else 'com limite' end
    into v_txt from erp.pagamentos where id = v_pag;
  perform pg_temp.verificar('A · prazo-limite calculado', 'com limite', v_txt);

  -- B — confirmar sem comprovativo é impossível
  begin
    perform erp.confirmar_pagamento(v_pag, 'REF-1', null);
    v_txt := 'confirmou';
  exception when others then v_txt := 'recusou';
  end;
  perform pg_temp.verificar('B · confirmar sem comprovativo', 'recusou', v_txt);

  -- C — confirmar com comprovativo funciona e guarda a referência
  perform erp.confirmar_pagamento(v_pag, 'REF-1', 'https://exemplo/comp.pdf');
  select estado || '/' || coalesce(referencia, '') into v_txt
    from erp.pagamentos where id = v_pag;
  perform pg_temp.verificar('C · confirmar com comprovativo', 'confirmado/REF-1', v_txt);

  -- D — confirmar duas vezes é impossível
  begin
    perform erp.confirmar_pagamento(v_pag, 'REF-1', 'https://exemplo/comp.pdf');
    v_txt := 'confirmou';
  exception when others then v_txt := 'recusou';
  end;
  perform pg_temp.verificar('D · dupla confirmação', 'recusou', v_txt);

  -- E — o total pago do pedido reflete o recebimento
  select total_pago into v_num from erp.pedidos where id = v_pedido;
  perform pg_temp.verificar('E · total pago do pedido', '200.00', to_char(v_num, 'FM999990.00'));

  -- F — devolução retira do total pago e o pedido volta a parcial/por pagar
  perform erp.devolver_pagamento(v_pag, 'Cliente desistiu');
  select to_char(total_pago, 'FM999990.00') || '/' || estado_pagamento into v_txt
    from erp.pedidos where id = v_pedido;
  perform pg_temp.verificar('F · devolução baixa o total pago', '0.00/por_pagar', v_txt);

  -- G — a devolução não altera o valor confirmado do pagamento
  select to_char(valor, 'FM999990.00') into v_txt from erp.pagamentos where id = v_pag;
  perform pg_temp.verificar('G · valor preservado na devolução', '200.00', v_txt);

  -- H — conciliação identifica o pedido divergente
  insert into erp.pagamentos (pedido_id, forma_id, valor, estado)
  values (v_pedido, v_forma_transf, 120.00, 'pendente_confirmacao') returning id into v_pag2;
  select to_char(divergencia, 'FM999990.00') into v_txt
    from erp.v_conciliacao_vendas where pedido_id = v_pedido;
  perform pg_temp.verificar('H · divergência identifica pedido', '80.00', v_txt);

  -- I — coberto na totalidade dá zero divergência
  insert into erp.pagamentos (pedido_id, forma_id, valor, estado)
  values (v_pedido, v_forma_transf, 80.00, 'pendente_confirmacao');
  select to_char(divergencia, 'FM999990.00') into v_txt
    from erp.v_conciliacao_vendas where pedido_id = v_pedido;
  perform pg_temp.verificar('I · sem divergências dá zero', '0.00', v_txt);

  -- J — despesa manual cria conta a pagar
  select id into v_despesa from (
    select erp.criar_despesa('Renda armazém 7', 'Rendas', 300.00,
      current_date, null, current_date, true, 'mensal') as id) t;
  select conta_pagar_id into v_conta from erp.despesas where id = v_despesa;
  perform pg_temp.verificar('J · despesa cria conta a pagar', 'sim',
    case when v_conta is null then 'não' else 'sim' end);

  -- K — pagamento parcial mantém paga_parcial
  perform erp.registar_pagamento_conta(v_conta, 100.00, current_date, 'DOC-1', null);
  select estado into v_txt from erp.contas_pagar where id = v_conta;
  perform pg_temp.verificar('K · pagamento parcial', 'paga_parcial', v_txt);

  -- L — completar o pagamento marca paga
  perform erp.registar_pagamento_conta(v_conta, 200.00, current_date, 'DOC-2', null);
  select estado into v_txt from erp.contas_pagar where id = v_conta;
  perform pg_temp.verificar('L · pagamento completo', 'paga', v_txt);

  -- M — despesa recorrente paga gera a conta do período seguinte
  select count(*) into v_n from erp.despesas
   where coalesce(origem_id, id) = v_despesa
     and data_vencimento = (current_date + interval '1 month')::date;
  perform pg_temp.verificar('M · recorrência gera conta seguinte', '1', v_n::text);

  -- N — a recorrência não se repete se a conta for atualizada de novo
  update erp.contas_pagar set observacoes = 'toque' where id = v_conta;
  select count(*) into v_n from erp.despesas
   where coalesce(origem_id, id) = v_despesa
     and data_vencimento = (current_date + interval '1 month')::date;
  perform pg_temp.verificar('N · recorrência não duplica', '1', v_n::text);

  -- O — fluxo de caixa previsto tem 8 semanas
  select count(*) into v_n from erp.v_fluxo_previsto;
  perform pg_temp.verificar('O · fluxo de 8 semanas', '8', v_n::text);

  -- P — o fluxo soma o que está por receber e por pagar
  select to_char(sum(a_receber), 'FM99999990.00') into v_txt from erp.v_fluxo_previsto;
  perform pg_temp.verificar('P · fluxo soma o por receber',
    to_char((select coalesce(sum(valor),0) from erp.v_contas_receber
              where coalesce(data_prevista, data_entrega_prevista, criado_em::date)
                    between date_trunc('week', current_date)::date
                        and date_trunc('week', current_date)::date + 55),
            'FM99999990.00'), v_txt);

  -- Q — fecho do dia guarda a fotografia e não duplica
  perform erp.fechar_dia_financeiro(current_date, 'Teste');
  perform erp.fechar_dia_financeiro(current_date, 'Teste 2');
  select count(*) into v_n from erp.fechos_financeiros
   where data = current_date and eliminado_em is null;
  perform pg_temp.verificar('Q · um fecho por dia', '1', v_n::text);

  -- R — alertas financeiros são idempotentes
  perform erp.gerar_alertas_financeiros();
  perform erp.gerar_alertas_financeiros();
  select count(*) into v_n from erp.alertas
   where referencia_tipo = 'conta_vencida' and referencia_id = v_conta and eliminado_em is null;
  perform pg_temp.verificar('R · alertas sem duplicados', '0', v_n::text);

  -- S — vendedora não vê o financeiro
  perform set_config('request.jwt.claim.sub', v_vend::text, true);
  perform pg_temp.verificar('S · vendedora sem financeiro', 'false',
    erp.pode_ver_financeiro()::text);
  perform pg_temp.verificar('S2 · vendedora sem custos', 'false', erp.pode_ver_custos()::text);
  perform pg_temp.verificar('S3 · vendedora não paga', 'false', erp.pode_pagar()::text);

  -- T — vendedora não consegue registar despesas
  begin
    perform erp.criar_despesa('Despesa proibida', 'Rendas', 10.00, current_date);
    v_txt := 'criou';
  exception when others then v_txt := 'recusou';
  end;
  perform pg_temp.verificar('T · vendedora não cria despesas', 'recusou', v_txt);

  -- U — escritório vê financeiro mas não vê custos nem margens
  perform set_config('request.jwt.claim.sub', v_esc::text, true);
  perform pg_temp.verificar('U · escritório vê financeiro', 'true',
    erp.pode_ver_financeiro()::text);
  perform pg_temp.verificar('U2 · escritório sem custos', 'false', erp.pode_ver_custos()::text);
  select count(*) into v_n from erp.v_margem_pedidos;
  perform pg_temp.verificar('U3 · escritório sem margens', '0', v_n::text);

  -- V — ADM vê margens com o custo do produto
  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  perform pg_temp.verificar('V · ADM vê custos', 'true', erp.pode_ver_custos()::text);

  -- ---------------------------------------------------------- limpeza
  delete from erp.alertas where referencia_id in (
    select id from erp.contas_pagar where id = v_conta
    union all select v_pedido union all select v_pag);
  update erp.despesas set eliminado_em = now(), motivo_eliminacao = 'auditoria'
   where coalesce(origem_id, id) = v_despesa;
  update erp.contas_pagar set eliminado_em = now(), motivo_eliminacao = 'auditoria'
   where id in (select conta_pagar_id from erp.despesas where coalesce(origem_id, id) = v_despesa);
  update erp.fechos_financeiros set eliminado_em = now(), motivo_eliminacao = 'auditoria'
   where data = current_date;
  perform set_config('erp.motor', '1', true);
  update erp.pagamentos set eliminado_em = now(), motivo_eliminacao = 'auditoria'
   where pedido_id = v_pedido;
  perform set_config('erp.motor', '', true);
  update erp.pedidos set eliminado_em = now(), motivo_eliminacao = 'auditoria' where id = v_pedido;
  update erp.produtos set eliminado_em = now(), motivo_eliminacao = 'auditoria' where id = v_produto;
  update erp.clientes set eliminado_em = now(), motivo_eliminacao = 'auditoria' where id = v_cliente;
  update erp.utilizadores set eliminado_em = now(), ativo = false,
    motivo_eliminacao = 'auditoria' where user_id in (v_adm, v_vend, v_esc);

exception when others then
  v_erro := SQLERRM;
  insert into resultado values ('ERRO FATAL', 'sem erro', v_erro, false);
  raise notice 'FALHA · ERRO FATAL: %', v_erro;
end $$;

select teste, esperado, obtido, case when passou then 'PASSOU' else 'FALHOU' end as estado
  from resultado order by teste;

select count(*) filter (where passou) || '/' || count(*) as resumo from resultado;
