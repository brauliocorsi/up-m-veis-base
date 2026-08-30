-- ============================================================
-- Testes de COMPORTAMENTO — Fase 8 (Entrega e Faturação)
--
-- O que interessa: o stock só sai na entrega, uma entrega
-- parcial não fecha o pedido, entregar mais do que o pedido é
-- impossível, reverter devolve o stock e o mesmo documento
-- fiscal não se registra duas vezes.
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
  v_adm uuid; v_vend uuid;
  v_vend_perfil uuid;
  v_cliente uuid; v_produto uuid; v_pedido uuid; v_item uuid;
  v_entrega1 uuid; v_entrega2 uuid; v_doc uuid;
  v_res jsonb; v_erro text; v_num numeric; v_txt text; v_n integer;
begin
  -- ---------------------------------------------------------- dados de apoio
  insert into auth.users (id, email) values (gen_random_uuid(), 'aud.adm8@teste.local')
    returning id into v_adm;
  insert into auth.users (id, email) values (gen_random_uuid(), 'aud.vend8@teste.local')
    returning id into v_vend;

  insert into erp.utilizadores (user_id, nome, email, perfil, ativo)
  values (v_adm, 'Aud ADM 8', 'aud.adm8@teste.local', 'adm', true),
         (v_vend, 'Aud Vendedora 8', 'aud.vend8@teste.local', 'vendedora', true);

  select id into v_vend_perfil from erp.utilizadores where user_id = v_vend;

  perform set_config('request.jwt.claim.sub', v_adm::text, true);

  insert into erp.clientes (nome, telefone_e164, tipo)
  values ('Cliente Entregas 8', '+351911000888', 'particular') returning id into v_cliente;

  insert into erp.categorias (codigo, nome) values ('AUDE8', 'Auditoria Entregas')
    on conflict (codigo) do nothing;
  insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento,
                            preco_base, n_colis)
  select 'AUD-ENT8', id, '[AUD] Sofá Entregas', 'stock', 200.00, 1
    from erp.categorias where codigo = 'AUDE8'
  returning id into v_produto;

  -- stock inicial: 10 unidades
  perform erp.ajuste_manual(v_produto, 10, 'auditoria fase 8');

  insert into erp.zonas_entrega (nome, cp_inicio, cp_fim, valor_base, dias_rota)
    values ('[AUD8] Zona', '4591', '4599', 30, '{3,4,5,6,7}') on conflict do nothing;

  insert into erp.pedidos (cliente_id, vendedor_id, estado, total, origem, morada_entrega,
                           cp4_entrega, cp3_entrega, localidade_entrega, data_entrega_prevista)
  values (v_cliente, v_vend_perfil, 'orcamento', 0, 'loja', 'Rua da Auditoria 8',
          '4591', '000', 'Paços de Ferreira', current_date + 20)
  returning id into v_pedido;

  insert into erp.pedido_itens (pedido_id, linha, produto_id, descricao, quantidade, preco_unitario)
  values (v_pedido, 1, v_produto, '[AUD] Sofá Entregas', 4, 200.00)
  returning id into v_item;

  perform erp.confirmar_pedido(v_pedido);

  -- ------------------------------------------------- E1: confirmar não tira stock
  select fisico into v_num from erp.stock_atual where produto_id = v_produto;
  perform pg_temp.verificar('E1 Confirmar reserva mas não tira stock físico', '10', v_num::text);
  select reservado into v_num from erp.stock_atual where produto_id = v_produto;
  perform pg_temp.verificar('E1b Confirmar reservou as 4 unidades', '4', v_num::text);

  -- --------------------------------------------- E2: entregar mais do que falta
  begin
    perform erp.registar_entrega(
      v_pedido,
      jsonb_build_array(jsonb_build_object('pedido_item_id', v_item, 'quantidade', 5)),
      current_date, 'Cliente', null);
    perform pg_temp.verificar('E2 Recusa entregar mais do que falta', 'erro', 'aceitou');
  exception when others then
    perform pg_temp.verificar('E2 Recusa entregar mais do que falta', 'erro', 'erro');
  end;

  -- ---------------------------------------------------- E3: entrega parcial
  v_res := erp.registar_entrega(
    v_pedido,
    jsonb_build_array(jsonb_build_object('pedido_item_id', v_item, 'quantidade', 3,
                                        'motivo_nao_entrega', 'faltou espaço na carrinha')),
    current_date, 'Sr. Cliente', 'entrega parcial de auditoria');
  v_entrega1 := (v_res->>'entrega_id')::uuid;
  perform pg_temp.verificar('E3 Entrega parcial é marcada como parcial', 'parcial', v_res->>'tipo');
  perform pg_temp.verificar('E3b Ficou 1 unidade por entregar', '1', v_res->>'por_entregar');

  select fisico into v_num from erp.stock_atual where produto_id = v_produto;
  perform pg_temp.verificar('E4 Stock físico saiu só na entrega (10-3)', '7', v_num::text);

  select coalesce(sum(-quantidade), 0) into v_num from erp.stock_movimentos
   where produto_id = v_produto and tipo = 'saida';
  perform pg_temp.verificar('E4b Movimento de saída de 3 unidades', '3', abs(v_num)::text);

  select estado::text into v_txt from erp.pedidos where id = v_pedido;
  perform pg_temp.verificar('E5 Entrega parcial não fecha o pedido', 'false',
                            (v_txt = 'entregue')::text);

  -- --------------------------------------------------- E6: entrega final
  v_res := erp.registar_entrega(
    v_pedido,
    jsonb_build_array(jsonb_build_object('pedido_item_id', v_item, 'quantidade', 1)),
    current_date, 'Sr. Cliente', null);
  v_entrega2 := (v_res->>'entrega_id')::uuid;
  perform pg_temp.verificar('E6 Última entrega é total', 'total', v_res->>'tipo');
  select estado::text into v_txt from erp.pedidos where id = v_pedido;
  perform pg_temp.verificar('E6b Pedido fica entregue', 'entregue', v_txt);
  select fisico into v_num from erp.stock_atual where produto_id = v_produto;
  perform pg_temp.verificar('E6c Stock físico final (10-4)', '6', v_num::text);
  select reservado into v_num from erp.stock_atual where produto_id = v_produto;
  perform pg_temp.verificar('E6d Reserva consumida', '0', v_num::text);
  select estado::text into v_txt from erp.pedido_itens where id = v_item;
  perform pg_temp.verificar('E6e Linha fica entregue', 'entregue', v_txt);

  -- ------------------------------------------- E7: reversão exige motivo
  begin
    perform erp.reverter_entrega(v_entrega2, '');
    perform pg_temp.verificar('E7 Reversão exige motivo', 'erro', 'aceitou');
  exception when others then
    perform pg_temp.verificar('E7 Reversão exige motivo', 'erro', 'erro');
  end;

  -- ------------------------------------------- E8: reversão devolve stock
  perform erp.reverter_entrega(v_entrega2, 'cliente devolveu por defeito no tecido');
  select fisico into v_num from erp.stock_atual where produto_id = v_produto;
  perform pg_temp.verificar('E8 Reverter devolve o stock (6+1)', '7', v_num::text);
  select estado from erp.entregas where id = v_entrega2 into v_txt;
  perform pg_temp.verificar('E8b Entrega revertida fica no histórico', 'revertida', v_txt);
  select estado::text into v_txt from erp.pedidos where id = v_pedido;
  perform pg_temp.verificar('E8c Pedido deixa de estar entregue', 'false',
                            (v_txt = 'entregue')::text);

  -- --------------------------------------- E9: documento fiscal e duplicados
  v_doc := erp.registar_documento_fiscal(v_pedido, 'fatura', null, 'FT-8-1', 'A', 800.00,
                                         now(), 'AAA111', 'ATCUD-8', null);
  select estado_fiscal into v_txt from erp.v_pedidos where id = v_pedido;
  perform pg_temp.verificar('E9 Pedido passa a faturado', 'faturado', v_txt);

  begin
    perform erp.registar_documento_fiscal(v_pedido, 'fatura', null, 'FT-8-1', 'A', 800.00,
                                          now(), 'AAA111', 'ATCUD-8', null);
    select count(*) into v_n from erp.documentos_fiscais
     where pedido_id = v_pedido and tipo = 'fatura' and eliminado_em is null;
    perform pg_temp.verificar('E10 Mesma fatura não duplica', '1', v_n::text);
  exception when others then
    perform pg_temp.verificar('E10 Mesma fatura não duplica', '1', '1');
  end;

  perform erp.anular_documento_fiscal(v_doc, 'erro no NIF do cliente');
  select estado into v_txt from erp.documentos_fiscais where id = v_doc;
  perform pg_temp.verificar('E11 Documento anulado fica anulado', 'anulado', v_txt);

  -- ------------------------------------- E12: vendedora também pode entregar
  perform set_config('request.jwt.claim.sub', v_vend::text, true);
  begin
    v_res := erp.registar_entrega(
      v_pedido,
      jsonb_build_array(jsonb_build_object('pedido_item_id', v_item, 'quantidade', 1)),
      current_date, 'Sr. Cliente', 'entrega feita pela vendedora');
    perform pg_temp.verificar('E12 Vendedora ativa pode registar entregas', 'sim', 'sim');
  exception when others then
    perform pg_temp.verificar('E12 Vendedora ativa pode registar entregas', 'sim', SQLERRM);
  end;
  perform set_config('request.jwt.claim.sub', v_adm::text, true);

  -- ------------------------------------- E13: entregue por receber e alertas
  select count(*) into v_n from erp.v_entregue_por_receber where pedido_id = v_pedido;
  perform pg_temp.verificar('E13 Entregue sem pagamento aparece em "entregue por receber"',
                            '1', v_n::text);

  perform erp.gerar_alertas_faturacao(0);
  perform pg_temp.verificar('E14 Alertas de faturação correm sem erro', 'sim', 'sim');

  -- ---------------------------------------------------------- limpeza
  perform set_config('erp.motor', '1', true);
  delete from erp.alertas where referencia_id in (v_pedido, v_entrega1, v_entrega2, v_doc);
  update erp.documentos_fiscais set eliminado_em = now(), motivo_eliminacao = 'auditoria'
   where pedido_id = v_pedido;
  update erp.entregas set eliminado_em = now(), motivo_eliminacao = 'auditoria'
   where pedido_id = v_pedido;
  update erp.pedidos set eliminado_em = now(), motivo_eliminacao = 'auditoria' where id = v_pedido;
  update erp.produtos set eliminado_em = now(), motivo_eliminacao = 'auditoria' where id = v_produto;
  update erp.clientes set eliminado_em = now(), motivo_eliminacao = 'auditoria' where id = v_cliente;
  perform set_config('erp.motor', '', true);
  update erp.utilizadores set eliminado_em = now(), ativo = false,
    motivo_eliminacao = 'auditoria' where user_id in (v_adm, v_vend);

exception when others then
  v_erro := SQLERRM;
  insert into resultado values ('ERRO FATAL', 'sem erro', v_erro, false);
  raise notice 'FALHA · ERRO FATAL: %', v_erro;
end $$;

select teste, esperado, obtido, case when passou then 'PASSOU' else 'FALHOU' end as estado
  from resultado order by teste;

select count(*) filter (where passou) || '/' || count(*) as resumo from resultado;
