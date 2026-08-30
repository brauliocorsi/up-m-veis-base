-- ============================================================
-- 22 — Stock, reservas e a venda
-- ============================================================
\ir 00_setup.sql

do $$
declare prod uuid; cli uuid; ped uuid; item uuid; res uuid;
        fis int; rsv int; disp int; tot numeric;
begin
  perform pg_temp.entra('adm');
  select id into prod from erp.produtos where cod_barras = 'P-AUD-STOCK';
  select id into cli  from erp.clientes where nome = 'Cliente Auditoria';

  -- entrada de stock
  perform erp.ajuste_manual(prod, 10, 'Entrada de auditoria');
  select fisico, reservado into fis, rsv from erp.stock_atual where produto_id = prod;
  perform pg_temp.ok(fis = 10, 'S1: ajuste manual soma ao stock físico');
  perform pg_temp.ok(rsv = 0,  'S2: stock reservado começa a zero');

  -- reserva
  res := erp.reservar(prod, 3, 'auditoria', gen_random_uuid());
  select fisico, reservado into fis, rsv from erp.stock_atual where produto_id = prod;
  perform pg_temp.ok(fis = 10 and rsv = 3, 'S3: reserva não muda o físico, só o reservado');

  -- reserva acima do disponível é recusada
  begin
    perform erp.reservar(prod, 99, 'auditoria', gen_random_uuid());
    raise notice 'FALHA S4: reserva acima do disponível foi aceite';
  exception when others then raise notice 'PASSA S4: reserva acima do disponível recusada';
  end;

  -- libertar devolve ao disponível
  perform erp.libertar_reserva(res, 'Auditoria');
  select reservado into rsv from erp.stock_atual where produto_id = prod;
  perform pg_temp.ok(rsv = 0, 'S5: libertar reserva devolve as unidades');

  -- movimentos são imutáveis
  begin
    update erp.stock_movimentos set quantidade = 1
     where produto_id = prod and quantidade = 10;
    raise notice 'FALHA S6: movimento de stock foi alterado';
  exception when others then raise notice 'PASSA S6: movimentos de stock são imutáveis';
  end;

  -- venda: orçamento com uma linha calcula totais no servidor
  insert into erp.pedidos (cliente_id, origem) values (cli, 'loja') returning id into ped;
  insert into erp.pedido_itens (pedido_id, linha, produto_id, descricao, quantidade, preco_unitario)
  values (ped, 1, prod, 'Produto Auditoria Stock', 2, 100) returning id into item;
  select total into tot from erp.pedidos where id = ped;
  perform pg_temp.ok(tot > 0, 'V1: totais do pedido calculados no servidor');

  -- remover linha recalcula para zero e mantém na lixeira
  perform erp.remover_item(item, 'Auditoria');
  select total into tot from erp.pedidos where id = ped;
  perform pg_temp.ok(tot = 0, 'V2: remover linha recalcula o total para zero');
  perform pg_temp.ok(exists (select 1 from erp.pedido_itens where id = item and eliminado_em is not null),
                     'V3: linha removida fica na lixeira');

  -- confirmar sem linhas é recusado
  begin
    perform erp.confirmar_pedido(ped);
    raise notice 'FALHA V4: pedido sem linhas foi confirmado';
  exception when others then raise notice 'PASSA V4: pedido sem linhas não confirma';
  end;

  -- confirmar em loja reserva o stock e numera
  insert into erp.pedido_itens (pedido_id, linha, produto_id, descricao, quantidade, preco_unitario)
  values (ped, 2, prod, 'Produto Auditoria Stock', 2, 100);
  update erp.pedidos set entrega_domicilio = false,
    data_entrega_prevista = erp.calcular_data_entrega(ped) where id = ped;
  begin
    perform erp.confirmar_pedido(ped);
    select reservado into rsv from erp.stock_atual where produto_id = prod;
    perform pg_temp.ok(rsv = 2, 'V5: confirmar a venda reserva as unidades vendidas');
    perform pg_temp.ok((select numero from erp.pedidos where id = ped) like 'PED-%',
                       'V6: pedido confirmado recebe número PED-');
    perform pg_temp.ok((select estado from erp.pedidos where id = ped) <> 'orcamento',
                       'V7: pedido confirmado sai do estado orçamento');
  exception when others then
    raise notice 'FALHA V5/V6/V7: confirmar_pedido falhou (%)', sqlerrm;
  end;

  -- dia útil e feriados
  perform pg_temp.ok(erp.dia_util(date '2026-01-03') = false, 'D1: sábado não é dia útil');
  perform pg_temp.ok(erp.somar_dias_uteis(date '2026-01-02', 1) > date '2026-01-02',
                     'D2: somar dias úteis avança a data');
end $$;
