-- ============================================================
-- Fase 9 — Rotas e área do entregador
-- Prefixo [T9] nos dados, para não colidir com as outras suites.
-- ============================================================
\set ON_ERROR_STOP off
set client_min_messages to notice;

create or replace function pg_temp.ok(n text,c boolean) returns void
language plpgsql as $$
begin raise notice '%  %', case when c then '[PASSA]' else '[FALHA]' end, n; end $$;

insert into auth.users (id,email) values
  ('dddd0000-0000-0000-0000-00000000000d','ent1@teste.pt'),
  ('eeee0000-0000-0000-0000-00000000000e','ent2@teste.pt') on conflict do nothing;
insert into erp.utilizadores (user_id,nome,email,perfil) values
  ('dddd0000-0000-0000-0000-00000000000d','[T9] Entregador Um','ent1@teste.pt','entregador'),
  ('eeee0000-0000-0000-0000-00000000000e','[T9] Entregador Dois','ent2@teste.pt','entregador')
on conflict (user_id) do nothing;
update erp.utilizadores set ativo = true, eliminado_em = null
 where email in ('ent1@teste.pt','ent2@teste.pt');

select set_config('request.jwt.claim.sub','aaaa0000-0000-0000-0000-00000000000a',false);

do $$
declare v_e1 uuid; v_e2 uuid;
begin
  select id into v_e1 from erp.utilizadores where email='ent1@teste.pt';
  select id into v_e2 from erp.utilizadores where email='ent2@teste.pt';
  insert into erp.rotas (data,nome,responsavel_id) values
    (current_date,'[T9] Rota Norte',  v_e1),
    (current_date,'[T9] Rota Lisboa', v_e2)
  on conflict do nothing;
  perform pg_temp.ok('R0 Rotas de teste criadas para dois entregadores',
    (select count(distinct responsavel_id) from erp.rotas where nome like '[T9]%') = 2);
end $$;

do $$
declare v_perfil text;
begin
  perform set_config('request.jwt.claim.sub','dddd0000-0000-0000-0000-00000000000d',false);
  select erp.perfil_atual()::text into v_perfil;
  if v_perfil is distinct from 'entregador' then
    perform pg_temp.ok('R1 GUARDA: identidade é mesmo um entregador (perfil='||
      coalesce(v_perfil,'NENHUM')||') — os testes seguintes NÃO são válidos', false);
    return;
  end if;
  perform pg_temp.ok('R1 Identidade confirmada: entregador ativo', true);
end $$;

begin;
select set_config('request.jwt.claim.sub','dddd0000-0000-0000-0000-00000000000d',true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from erp.rotas r
   where r.nome like '[T9]%' and r.responsavel_id <> erp.utilizador_atual();
  perform pg_temp.ok('R2 Entregador não vê NENHUMA rota de outro ('||n||')', n = 0);

  select count(*) into n from erp.rotas r
   join erp.utilizadores u on u.id = r.responsavel_id
   where u.email = 'ent2@teste.pt';
  perform pg_temp.ok('R3 Entregador NÃO vê a rota de outro ('||n||')', n = 0);

  begin
    select count(*) into n from erp.v_contas_pagar;
    perform pg_temp.ok('R4 Entregador não lê contas a pagar ('||n||')', n = 0);
  exception when insufficient_privilege then
    perform pg_temp.ok('R4 Entregador não lê contas a pagar', true); end;

  begin
    select count(*) into n from erp.produto_custos;
    perform pg_temp.ok('R5 Entregador não lê custos ('||n||')', n = 0);
  exception when insufficient_privilege then
    perform pg_temp.ok('R5 Entregador não lê custos', true); end;

  begin
    select count(*) into n from erp.v_oc_itens;
    perform pg_temp.ok('R6 Entregador não lê compras ('||n||')', n = 0);
  exception when insufficient_privilege then
    perform pg_temp.ok('R6 Entregador não lê compras', true); end;

  begin
    update erp.rotas set estado = 'em_curso'
     where responsavel_id = (select id from erp.utilizadores where email='ent2@teste.pt');
    perform pg_temp.ok('R7 Entregador não altera a rota de outro',
      not exists (select 1 from erp.rotas r join erp.utilizadores u on u.id=r.responsavel_id
                  where u.email='ent2@teste.pt' and r.estado='em_curso'));
  exception when insufficient_privilege then
    perform pg_temp.ok('R7 Entregador não altera a rota de outro', true); end;
end $$;
commit;

select set_config('request.jwt.claim.sub','aaaa0000-0000-0000-0000-00000000000a',false);

do $$
declare v_rota uuid; v_prev numeric; v_prev2 numeric;
begin
  select id into v_rota from erp.rotas where nome = '[T9] Rota Norte';
  select previsto_receber into v_prev from erp.rotas where id = v_rota;
  perform pg_temp.ok('R8 Rota tem campo de previsto ('||coalesce(v_prev::text,'nulo')||')',
    v_prev is not null);

  select previsto_receber into v_prev2 from erp.rotas where id = v_rota;
  perform pg_temp.ok('R9 Previsto estável entre leituras', v_prev = v_prev2);
end $$;

select pg_temp.ok('R10 Rota tem realizado e envelope',
  (select count(*) from information_schema.columns
    where table_schema='erp' and table_name='rotas'
      and column_name in ('realizado_recebido','realizado_saidas','valor_envelope','diferenca')) = 4);

select pg_temp.ok('R11 Assistência liga-se ao pedido e ao item',
  (select count(*) from information_schema.columns
    where table_schema='erp' and table_name='assistencias'
      and column_name in ('pedido_id','pedido_item_id')) = 2);

select pg_temp.ok('R12 Paragem regista desfecho e reagendamento',
  (select count(*) from information_schema.columns
    where table_schema='erp' and table_name='rota_paragens'
      and column_name in ('desfecho','data_reagendamento')) = 2);

select pg_temp.ok('R13 Views de rotas com security_invoker',
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='erp' and c.relkind='v' and c.relname like '%rota%'
      and coalesce((select option_value from pg_options_to_table(c.reloptions)
                    where option_name='security_invoker'),'false') <> 'true'));

select set_config('request.jwt.claim.sub','aaaa0000-0000-0000-0000-00000000000a',false);
do $$
declare v_c uuid; v_ped uuid; v_prod uuid; v_li uuid; v_rota uuid; v_par uuid; v_e1 uuid;
        v_tot numeric; v_din uuid; v_mb uuid; v_trf uuid; v_res jsonb;
begin
  select id into v_prod from erp.produtos where cod_barras='AUD-STOCK';
  select id into v_e1 from erp.utilizadores where email='ent1@teste.pt';
  select id into v_din from erp.formas_pagamento where codigo='DINHEIRO';
  select id into v_mb  from erp.formas_pagamento where codigo='MULTIBANCO';
  select id into v_trf from erp.formas_pagamento where codigo='TRANSFERENCIA';

  insert into erp.clientes (nome,nif,telefone_e164,morada,cp4,cp3,localidade)
  values ('[T9] Cliente Ciclo','999999990','+351912111000','R C','4590','000','PF') returning id into v_c;
  insert into erp.pedidos (cliente_id,vendedor_id,morada_entrega,cp4_entrega,cp3_entrega,
                           localidade_entrega,data_entrega_prevista)
  values (v_c,(select id from erp.utilizadores where perfil='adm' and ativo limit 1),
          'R C','4590','000','PF',current_date) returning id into v_ped;
  insert into erp.pedido_itens (pedido_id,linha,produto_id,quantidade,preco_unitario)
  values (v_ped,1,v_prod,1,300) returning id into v_li;
  perform erp.confirmar_pedido(v_ped);
  select total into v_tot from erp.pedidos where id=v_ped;

  insert into erp.pagamentos (pedido_id, forma_id, valor)
  values (v_ped, (select id from erp.formas_pagamento where codigo='ENTREGA'), v_tot);

  v_rota := erp.abrir_rota('[T9] Rota Ciclo', v_e1, jsonb_build_array(v_ped::text), current_date, 'C1');
  select id into v_par from erp.rota_paragens where rota_id=v_rota limit 1;
  perform erp.registar_desfecho_paragem(v_par,'entregue',
    jsonb_build_array(jsonb_build_object('pedido_item_id',v_li,'quantidade',1)),null,null,null,'Sr. C');

  perform erp.registar_recebimento_entrega(v_par, jsonb_build_array(
    jsonb_build_object('forma_id',v_din,'valor',50),
    jsonb_build_object('forma_id',v_mb, 'valor',150),
    jsonb_build_object('forma_id',v_trf,'valor',v_tot-200)));
  perform pg_temp.ok('T2 Recebimento aceite apesar do marcador pagar-na-entrega', true);
  perform pg_temp.ok('T3 Marcador consumido, total_pago não excede o total',
    (select total_pago from erp.pedidos where id=v_ped) <= v_tot);

  perform erp.registar_saida_rota(v_rota, 12.50,
    (select id from erp.motivos where contexto='saida_caixa' limit 1),'Portagem',null);

  v_res := erp.contas_da_rota(v_rota);
  perform pg_temp.ok('T4 Envelope conta SÓ numerário: 50 − 12,50 = 37,50 (deu '||
    (v_res->>'esperado_envelope')||')', (v_res->>'esperado_envelope')::numeric = 37.50);

  perform erp.fechar_rota(v_rota, 37.50, null);
  perform pg_temp.ok('T5 Rota fecha quando as contas batem',
    (select estado from erp.rotas where id=v_rota) = 'fechada');

  begin
    perform erp.registar_saida_rota(v_rota, 5,
      (select id from erp.motivos where contexto='saida_caixa' limit 1),'Após fecho',null);
    perform pg_temp.ok('T6 Rota fechada é imutável', false);
  exception when others then perform pg_temp.ok('T6 Rota fechada é imutável', true); end;
exception when others then
  perform pg_temp.ok('T CICLO FALHOU: '||SQLERRM, false);
end $$;
