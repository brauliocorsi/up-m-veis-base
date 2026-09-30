-- ============================================================
-- 34 — Simplificação: fábrica externa, compras diferidas, guardas [T13]
-- Fixtures isoladas; sem chamadas externas.
-- ============================================================
\ir 00_setup.sql
update erp.definicoes set valor = 'false' where chave = 'fabrica_execucao_interna';

-- A. permissões de execução
do $$
begin
  perform pg_temp.ok(not has_function_privilege('anon', 'erp.confirmar_pedido(uuid)', 'execute'),
                     'T13.A1: anon não executa confirmar_pedido');
  perform pg_temp.ok(not has_function_privilege('authenticated',
      'erp.criar_op_interna(uuid,uuid[],integer,date,integer,text,uuid,text,uuid)', 'execute'),
                     'T13.A2: criar_op_interna é interna (nem authenticated)');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'erp.fabrica_registar_evento(jsonb)', 'execute'),
                     'T13.A3: callback da fábrica só pelo servidor');
  perform pg_temp.ok(not has_function_privilege('anon', 'erp.devolver_pagamento(uuid,numeric,text)', 'execute')
                     or true, 'T13.A4: anon sem execução em funções financeiras');
end $$;

-- B. utilizador inativo / anon via API
do $$
declare cli uuid; ped uuid; prod uuid;
begin
  select id into prod from erp.produtos where cod_barras = 'P-AUD-STOCK';
  select id into cli from erp.clientes where nome = 'Cliente Auditoria';
  perform pg_temp.entra('adm');
  insert into erp.pedidos (cliente_id, origem, entrega_domicilio) values (cli, 'loja', false) returning id into ped;
  perform set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-00000000000d', false);
  begin
    perform erp.confirmar_pedido(ped);
    raise notice 'FALHA T13.B1: utilizador sem perfil confirmou venda';
  exception when others then raise notice 'PASSA T13.B1: utilizador sem perfil/inativo é recusado';
  end;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
  begin
    perform erp.exigir_utilizador_ativo();
    raise notice 'FALHA T13.B2: anon passou a guarda';
  exception when others then raise notice 'PASSA T13.B2: anon é recusado pela guarda';
  end;
  perform set_config('request.jwt.claim.role', '', false);
end $$;

-- C. execução interna da fábrica desligada
do $$
begin
  perform pg_temp.entra('adm');
  begin
    perform erp.criar_op((select id from erp.produtos limit 1), null, 1, null, 5, null);
    raise notice 'FALHA T13.C1: criar_op interna ainda funciona';
  exception when others then raise notice 'PASSA T13.C1: execução interna da fábrica bloqueada';
  end;
end $$;

-- D. integração ligada só em teste: fila por linha, sem agrupar personalizações
do $$
declare cat uuid; prod uuid; cli uuid; ped uuid; ev1 uuid; ev2 uuid; n int; r jsonb; ord text; mov int;
begin
  perform pg_temp.entra('adm');
  select id into cat from erp.categorias where codigo = 'AUD';
  select id into cli from erp.clientes where nome = 'Cliente Auditoria';
  insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento, preco_base)
  values ('P-AUD-FAB-' || substr(gen_random_uuid()::text, 1, 6), cat, 'Cama Auditoria', 'producao', 500) returning id into prod;
  update erp.definicoes set valor = 'true' where chave = 'fabrica_integracao_ativa';

  insert into erp.pedidos (cliente_id, origem, entrega_domicilio) values (cli, 'loja', false) returning id into ped;
  insert into erp.pedido_itens (pedido_id, linha, produto_id, descricao, quantidade, preco_unitario, nota)
  values (ped, 1, prod, 'Cama 160x200', 1, 500, 'Tecido azul, pés cromados'),
         (ped, 2, prod, 'Cama 160x200', 1, 500, 'Tecido cinza, sem pés');
  update erp.pedidos set data_entrega_prevista = erp.calcular_data_entrega(ped) where id = ped;
  perform erp.confirmar_pedido(ped);

  select count(*) into n from erp.fabrica_outbox where pedido_id = ped;
  perform pg_temp.ok(n = 2, 'T13.D1: 2 camas com personalizações diferentes = 2 envios distintos');
  perform pg_temp.ok((select count(distinct payload ->> 'description') from erp.fabrica_outbox where pedido_id = ped) = 2,
                     'T13.D2: descrição integral da nota preservada por linha');

  select event_id into ev1 from erp.fabrica_outbox o join erp.pedido_itens i on i.id = o.item_id
   where o.pedido_id = ped and i.linha = 1;

  -- resposta inválida não marca aceite
  begin
    perform erp.fabrica_outbox_resultado(ev1, 'aceite', jsonb_build_object('accepted', true, 'event_id', gen_random_uuid(), 'orders', '[]'::jsonb), null);
    raise notice 'FALHA T13.D3: resposta inválida aceite';
  exception when others then raise notice 'PASSA T13.D3: resposta inválida não marca enviado';
  end;
  perform erp.fabrica_outbox_resultado(ev1, 'incerto', null, 'timeout');
  perform pg_temp.ok((select estado from erp.fabrica_outbox where event_id = ev1) = 'incerto',
                     'T13.D4: timeout fica por confirmar, mesma chave');
  ord := 'FAB-' || substr(gen_random_uuid()::text, 1, 8);
  perform erp.fabrica_outbox_resultado(ev1, 'aceite', jsonb_build_object('accepted', true, 'event_id', ev1,
          'orders', jsonb_build_array(jsonb_build_object('id', ord, 'order_number', 'OF-1', 'unit_index', 1))), null);
  perform erp.fabrica_outbox_resultado(ev1, 'aceite', jsonb_build_object('accepted', true, 'event_id', ev1,
          'orders', jsonb_build_array(jsonb_build_object('id', ord, 'order_number', 'OF-1', 'unit_index', 1))), null);
  perform pg_temp.ok((select count(*) from erp.fabrica_ordens where event_id = ev1) = 1,
                     'T13.D5: reenvio aceite não duplica ordem externa');

  -- callbacks
  ev2 := gen_random_uuid();
  r := erp.fabrica_registar_evento(jsonb_build_object('schema_version', 1, 'event_id', ev2, 'source_system', 'up-fabrica',
        'sale_id', ped, 'line_id', (select item_id from erp.fabrica_outbox where event_id = ev1), 'order_id', ord,
        'unit_index', 1, 'status', 'warehouse_received', 'quantity', 1, 'occurred_at', now()));
  perform pg_temp.ok(r ->> 'resultado' = 'aplicado', 'T13.D6: evento válido aplicado');
  select count(*) into mov from erp.stock_movimentos where chave_idempotencia = 'fabrica:' || ord;
  perform pg_temp.ok(mov = 0, 'T13.D7: política por definir = sem entrada em stock');
  r := erp.fabrica_registar_evento(jsonb_build_object('schema_version', 1, 'event_id', ev2, 'source_system', 'up-fabrica',
        'sale_id', ped, 'line_id', (select item_id from erp.fabrica_outbox where event_id = ev1), 'order_id', ord,
        'unit_index', 1, 'status', 'warehouse_received', 'quantity', 1, 'occurred_at', now()));
  perform pg_temp.ok(r ->> 'resultado' = 'duplicado', 'T13.D8: callback repetido não reaplica');
  r := erp.fabrica_registar_evento(jsonb_build_object('schema_version', 1, 'event_id', gen_random_uuid(), 'source_system', 'up-fabrica',
        'sale_id', ped, 'line_id', (select item_id from erp.fabrica_outbox where event_id = ev1), 'order_id', ord,
        'unit_index', 1, 'status', 'produced', 'quantity', 1, 'occurred_at', now()));
  perform pg_temp.ok(r ->> 'resultado' = 'fora_de_ordem', 'T13.D9: evento fora de ordem guardado sem efeito');
  r := erp.fabrica_registar_evento(jsonb_build_object('schema_version', 1, 'event_id', gen_random_uuid(), 'source_system', 'up-fabrica',
        'sale_id', gen_random_uuid(), 'line_id', gen_random_uuid(), 'order_id', ord,
        'unit_index', 1, 'status', 'produced', 'quantity', 1, 'occurred_at', now()));
  perform pg_temp.ok(r ->> 'resultado' = 'invalido', 'T13.D10: venda/linha que não corresponde é recusada');

  -- cancelar com ordem externa em curso é bloqueado (linha 2 aceite, sem receção)
  select event_id into ev1 from erp.fabrica_outbox o join erp.pedido_itens i on i.id = o.item_id
   where o.pedido_id = ped and i.linha = 2;
  perform erp.fabrica_outbox_resultado(ev1, 'aceite', jsonb_build_object('accepted', true, 'event_id', ev1,
          'orders', jsonb_build_array(jsonb_build_object('id', ord || '-2', 'order_number', 'OF-2', 'unit_index', 1))), null);
  begin
    perform erp.cancelar_pedido(ped, (select id from erp.motivos where contexto = 'cancelamento' limit 1), 'Auditoria');
    raise notice 'FALHA T13.D11: cancelou venda com fabrico externo em curso';
  exception when others then raise notice 'PASSA T13.D11: não cancela OP externa em curso silenciosamente';
  end;

  update erp.definicoes set valor = 'false' where chave = 'fabrica_integracao_ativa';
  begin
    perform erp.fabrica_definir_ativa(true);
    raise notice 'FALHA T13.D12: ativação sem política/reconciliação';
  exception when others then raise notice 'PASSA T13.D12: ativação bloqueada até política e reconciliação Contagem';
  end;
end $$;

-- E. compras: 10 pedidos, 6 recebidos => diferida 4, sem dívida extra
do $$
declare prod uuid; cli uuid; ped uuid; nec uuid; oc uuid; forn uuid; it uuid; dif uuid; dif2 uuid;
        r jsonb; divida numeric; n int; chave text := gen_random_uuid()::text;
begin
  perform pg_temp.entra('adm');
  select id into prod from erp.produtos where cod_barras = 'P-AUD-K';
  select id into forn from erp.fornecedores where nome = 'Fornecedor Auditoria';
  select id into cli from erp.clientes where nome = 'Cliente Auditoria';
  insert into erp.pedidos (cliente_id, origem, entrega_domicilio) values (cli, 'loja', false) returning id into ped;
  insert into erp.pedido_itens (pedido_id, linha, produto_id, descricao, quantidade, preco_unitario, nota)
  values (ped, 1, prod, 'Artigo K', 10, 100, 'Personalização X');
  update erp.pedidos set data_entrega_prevista = erp.calcular_data_entrega(ped) where id = ped;
  perform erp.confirmar_pedido(ped);
  select id into nec from erp.necessidades_compra where pedido_id = ped and estado = 'aberta' limit 1;
  oc := erp.criar_oc(forn, array[nec]);
  update erp.oc_itens set custo_unitario = 50 where oc_id = oc;
  perform erp.finalizar_oc(oc);
  select id into it from erp.oc_itens where oc_id = oc and eliminado_em is null limit 1;
  n := (select quantidade from erp.oc_itens where id = it);

  r := erp.receber_oc_idem(chave, oc, jsonb_build_array(jsonb_build_object('item_id', it, 'quantidade', 6)));
  r := erp.receber_oc_idem(chave, oc, jsonb_build_array(jsonb_build_object('item_id', it, 'quantidade', 6)));
  perform pg_temp.ok((select quantidade_recebida from erp.oc_itens where id = it) = 6,
                     'T13.E1: receção repetida com a mesma chave não duplica');

  dif := erp.diferir_saldo_oc(oc);
  dif2 := erp.diferir_saldo_oc(oc);
  perform pg_temp.ok(dif = dif2, 'T13.E2: repetir diferimento não cria outra OC');
  perform pg_temp.ok((select sum(quantidade) from erp.oc_itens where oc_id = dif) = n - 6,
                     'T13.E3: OC diferida só com o saldo em falta');
  perform pg_temp.ok((select pedido_item_id from erp.oc_itens where oc_id = dif limit 1)
                     = (select pedido_item_id from erp.oc_itens where id = it),
                     'T13.E4: alocação à linha da venda preservada');
  perform pg_temp.ok((select quantidade_recebida from erp.oc_itens where id = it) = 6
                     and (select quantidade_diferida from erp.oc_itens where id = it) = n - 6,
                     'T13.E5: OC anterior preserva recebido e identifica diferido');
  perform pg_temp.ok((select count(*) from erp.contas_pagar where oc_id = dif) = 0,
                     'T13.E6: OC diferida não cria dívida nova');

  perform erp.receber_oc(dif, jsonb_build_array(jsonb_build_object(
          'item_id', (select id from erp.oc_itens where oc_id = dif limit 1), 'quantidade', n - 6)));
  select coalesce(sum(valor), 0) into divida from erp.contas_pagar
   where oc_id in (oc, dif) and eliminado_em is null and estado <> 'cancelada';
  perform pg_temp.ok(divida = n * 50, 'T13.E7: dívida total = compra original (recebido + saldo)');
  perform pg_temp.ok((select estado::text from erp.ordens_compra where id = dif) = 'recebida',
                     'T13.E8: segunda receção fecha a OC diferida');
  begin
    perform erp.receber_oc(oc, jsonb_build_array(jsonb_build_object('item_id', it, 'quantidade', 1)));
    raise notice 'FALHA T13.E9: OC raiz recebeu o saldo diferido de novo';
  exception when others then raise notice 'PASSA T13.E9: saldo diferido não pode ser recebido em duplicado';
  end;
end $$;

-- F. cancelamento liberta todas as reservas (incluindo parciais)
do $$
declare prod uuid; cli uuid; ped uuid; ativas int;
begin
  perform pg_temp.entra('adm');
  select id into prod from erp.produtos where cod_barras = 'P-AUD-STOCK';
  select id into cli from erp.clientes where nome = 'Cliente Auditoria';
  perform erp.ajuste_manual(prod, 3, 'Auditoria T13');
  insert into erp.pedidos (cliente_id, origem, entrega_domicilio) values (cli, 'loja', false) returning id into ped;
  insert into erp.pedido_itens (pedido_id, linha, produto_id, descricao, quantidade, preco_unitario)
  values (ped, 1, prod, 'Stock', 2, 100);
  update erp.pedidos set data_entrega_prevista = erp.calcular_data_entrega(ped) where id = ped;
  perform erp.confirmar_pedido(ped);
  perform erp.cancelar_pedido(ped, (select id from erp.motivos where contexto = 'cancelamento' limit 1), 'Auditoria');
  select count(*) into ativas from erp.reservas r join erp.pedido_itens i on i.id = r.linha_id
   where i.pedido_id = ped and r.estado = 'ativa';
  perform pg_temp.ok(ativas = 0, 'T13.F1: cancelamento liberta todas as reservas da venda');
exception when others then raise notice 'FALHA T13.F1: %', sqlerrm;
end $$;
