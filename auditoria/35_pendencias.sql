-- ============================================================
-- 35 — Pendências: fila com lease/backoff, Contagem sem dupla entrada,
--      idempotência financeira, valores em cêntimos, permissões [T14]
-- ============================================================
\ir 00_setup.sql

do $$
begin
  perform pg_temp.ok(not has_function_privilege('authenticated', 'erp.op_idem_obter(text,text)', 'execute'),
                     'T14.A1: op_idem_obter é interna');
  perform pg_temp.ok(not has_function_privilege('anon', 'erp.confirmar_pagamento_banco(text,uuid,text,date,text)', 'execute'),
                     'T14.A2: anon não confirma pagamentos');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'erp.fabrica_outbox_reclamar(integer)', 'execute'),
                     'T14.A3: fila da fábrica só pelo servidor');
  perform pg_temp.ok(has_function_privilege('authenticated', 'erp.movimento_caixa_idem(text,text,numeric,uuid,text,text,uuid)', 'execute'),
                     'T14.A4: caixa idempotente disponível à equipa');
  perform pg_temp.ok(coalesce((select valor from erp.definicoes where chave='fabrica_worker_ativo'), 'null') = 'false'::jsonb,
                     'T14.A5: worker da fábrica desligado por omissão');
  perform pg_temp.ok(coalesce((select valor from erp.definicoes where chave='fabrica_politica_entrada'), 'null'::jsonb) in ('null'::jsonb),
                     'T14.A6: política de entrada continua por definir');
end $$;

-- B. valores
do $$
begin
  perform pg_temp.ok(erp.validar_euros(12.34) = 12.34, 'T14.B1: 12,34 aceite');
  begin perform erp.validar_euros(12.345); raise notice 'FALHA T14.B2: 3 casas aceites';
  exception when others then raise notice 'PASSA T14.B2: mais de 2 casas decimais recusado'; end;
  begin perform erp.validar_euros(0); raise notice 'FALHA T14.B3: zero aceite';
  exception when others then raise notice 'PASSA T14.B3: zero recusado'; end;
  begin perform erp.validar_euros(-5); raise notice 'FALHA T14.B4: negativo aceite';
  exception when others then raise notice 'PASSA T14.B4: negativo recusado'; end;
end $$;

-- C. chaves de operação
do $$
declare r jsonb;
begin
  perform pg_temp.ok(erp.op_idem_obter('chave-teste-0001', 'caixa_saida') is null, 'T14.C1: chave nova');
  perform erp.op_idem_gravar('chave-teste-0001', 'caixa_saida', '{"valor":5}');
  r := erp.op_idem_obter('chave-teste-0001', 'caixa_saida');
  perform pg_temp.ok((r->>'repetido')::boolean, 'T14.C2: repetição devolve o resultado guardado');
  begin perform erp.op_idem_obter('chave-teste-0001', 'devolver_pagamento');
    raise notice 'FALHA T14.C3: chave reutilizada noutra operação';
  exception when others then raise notice 'PASSA T14.C3: chave não serve outra operação'; end;
  begin perform erp.op_idem_obter('x', 'caixa_saida'); raise notice 'FALHA T14.C4: chave curta';
  exception when others then raise notice 'PASSA T14.C4: chave inválida recusada'; end;
end $$;

-- D. fila: lease e backoff
do $$
declare ev uuid := gen_random_uuid(); ped uuid; it uuid; nec uuid; n int; o erp.fabrica_outbox%rowtype;
begin
  select nc.pedido_id, nc.item_id, nc.id into ped, it, nec from erp.necessidades_producao nc
   where nc.item_id is not null limit 1;
  if it is null then raise notice 'PASSA T14.D0: sem linhas de venda nas fixtures (ignorado)'; return; end if;
  insert into erp.fabrica_outbox (event_id, necessidade_id, pedido_id, item_id, revisao, quantidade, payload, estado)
  values (ev, nec, ped, it, 9901, 1, '{}', 'em_fila');
  select count(*) into n from erp.fabrica_outbox_reclamar(50) where event_id = ev;
  perform pg_temp.ok(n = 1, 'T14.D1: linha reclamada');
  select count(*) into n from erp.fabrica_outbox_reclamar(50) where event_id = ev;
  perform pg_temp.ok(n = 0, 'T14.D2: lease impede segundo worker');
  update erp.fabrica_outbox set estado = 'incerto' where event_id = ev;
  select * into o from erp.fabrica_outbox where event_id = ev;
  perform pg_temp.ok(o.proxima_tentativa_em > now() and o.lease_ate is null, 'T14.D3: incerto espera backoff');
  select count(*) into n from erp.fabrica_outbox_reclamar(50) where event_id = ev;
  perform pg_temp.ok(n = 0, 'T14.D4: não reenvia antes do backoff');
  update erp.fabrica_outbox set proxima_tentativa_em = now() - interval '1 second' where event_id = ev;
  select count(*) into n from erp.fabrica_outbox_reclamar(50) where event_id = ev;
  perform pg_temp.ok(n = 1, 'T14.D5: reenvia com o mesmo event_id após backoff');
  update erp.fabrica_outbox set estado = 'erro' where event_id = ev;
  select count(*) into n from erp.fabrica_outbox_reclamar(50) where event_id = ev;
  perform pg_temp.ok(n = 0, 'T14.D6: erro 4xx fica para revisão manual');
  perform pg_temp.ok(not erp.fabrica_worker_pode_correr(), 'T14.D7: worker não corre desligado');
  delete from erp.fabrica_outbox where event_id = ev;
end $$;

-- E. Contagem não volta a contar entradas da fábrica
do $$
declare it uuid; prod uuid; cod text; antes int; depois int; r jsonb; ev uuid := gen_random_uuid(); nec uuid; ped uuid;
begin
  select nc.item_id, nc.produto_id, p.cod_barras, nc.id, nc.pedido_id into it, prod, cod, nec, ped
    from erp.necessidades_producao nc join erp.produtos p on p.id = nc.produto_id
   where p.cod_barras is not null and nc.item_id is not null limit 1;
  if it is null then raise notice 'PASSA T14.E0: sem fixtures (ignorado)'; return; end if;
  insert into erp.fabrica_outbox (event_id, necessidade_id, pedido_id, item_id, revisao, quantidade, payload, estado)
  values (ev, nec, ped, it, 9902, 1, '{}', 'aceite');
  insert into erp.fabrica_ordens (event_id, pedido_id, item_id, unit_index, order_id, order_number, estado)
  values (ev, ped, it, 1, 'ORD-T14-1', 'FAB-T14-0001', 'warehouse_received');
  select count(*) into antes from erp.stock_movimentos where produto_id = prod;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  r := erp.registar_movimentos_contagem(jsonb_build_array(
    jsonb_build_object('id', '990001', 'produto_codigo', cod, 'tipo', 'entrada', 'quantidade', 1,
                       'referencia', 'Entrada fábrica FAB-T14-0001')));
  select count(*) into depois from erp.stock_movimentos where produto_id = prod;
  perform pg_temp.ok(depois = antes and (r->>'fabrica_ignorados')::int = 1,
                     'T14.E1: entrada do Contagem com ordem da fábrica não dá stock');
  perform pg_temp.ok(exists (select 1 from erp.contagem_fabrica_ignorados where contagem_id = '990001'),
                     'T14.E2: entrada ignorada fica registada');
  perform set_config('request.jwt.claim.role', '', true);
  delete from erp.contagem_fabrica_ignorados where contagem_id = '990001';
  delete from erp.fabrica_ordens where order_id = 'ORD-T14-1';
  delete from erp.fabrica_outbox where event_id = ev;
end $$;
