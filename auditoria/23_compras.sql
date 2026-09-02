-- ============================================================
-- 23 — Compras, receções e contas a pagar
-- ============================================================
\ir 00_setup.sql

do $$
declare prod uuid; cli uuid; ped uuid; nec uuid; oc uuid; forn uuid;
        it uuid; fis int; rsv int; r jsonb; num text;
begin
  perform pg_temp.entra('adm');
  select id into prod from erp.produtos where cod_barras = 'P-AUD-COMPRA';
  select id into forn from erp.fornecedores where nome = 'Fornecedor Auditoria';
  select id into cli  from erp.clientes where nome = 'Cliente Auditoria';

  -- venda de produto sem stock gera necessidade de compra
  insert into erp.pedidos (cliente_id, origem, entrega_domicilio) values (cli, 'loja', false) returning id into ped;
  insert into erp.pedido_itens (pedido_id, linha, produto_id, descricao, quantidade, preco_unitario)
  values (ped, 1, prod, 'Produto Auditoria Compra', 5, 100);
  update erp.pedidos set data_entrega_prevista = erp.calcular_data_entrega(ped) where id = ped;
  perform erp.confirmar_pedido(ped);

  select id into nec from erp.necessidades_compra
   where pedido_id = ped and eliminado_em is null limit 1;
  perform pg_temp.ok(nec is not null, 'K1: venda sem stock gera necessidade de compra');

  -- ordem de compra
  oc := erp.criar_oc(forn, array[nec]);
  perform pg_temp.ok(oc is not null, 'K2: necessidade vira ordem de compra');

  r := erp.finalizar_oc(oc);
  perform pg_temp.ok(r ->> 'numero' is not null, 'K3: finalizar a OC atribui número');

  -- finalizar duas vezes é recusado
  begin
    perform erp.finalizar_oc(oc);
    raise notice 'FALHA K4: OC finalizada duas vezes';
  exception when others then raise notice 'PASSA K4: OC não finaliza duas vezes';
  end;

  select id into it from erp.oc_itens where oc_id = oc and eliminado_em is null limit 1;

  -- receção parcial: 3 de 5
  perform erp.receber_oc(oc, jsonb_build_array(jsonb_build_object('item_id', it, 'quantidade', 3)));
  select fisico, reservado into fis, rsv from erp.stock_atual where produto_id = prod;
  perform pg_temp.ok(fis = 3, 'K5: receção de compra entra no stock físico');
  perform pg_temp.ok(rsv = 3, 'K6: material recebido é reservado ao cliente');
  perform pg_temp.ok((select estado from erp.ordens_compra where id = oc)::text = 'recebida_parcial',
                     'K7: OC parcialmente recebida fica recebida_parcial');
  perform pg_temp.ok(exists (select 1 from erp.contas_pagar where eliminado_em is null
                             and descricao ilike '%' || (select numero from erp.ordens_compra where id = oc) || '%'),
                     'K8: receção cria conta a pagar');

  -- cancelar depois de receber é recusado
  begin
    perform erp.cancelar_oc(oc, (select id from erp.motivos where contexto='cancelamento' limit 1), 'Auditoria');
    raise notice 'FALHA K9: OC com receção foi cancelada';
  exception when others then raise notice 'PASSA K9: OC com receção não pode ser cancelada';
  end;

  -- receber o resto
  perform erp.receber_oc(oc, jsonb_build_array(jsonb_build_object('item_id', it, 'quantidade', 2)));
  perform pg_temp.ok((select estado from erp.ordens_compra where id = oc)::text = 'recebida',
                     'K10: receção completa marca a OC como recebida');
  perform pg_temp.ok((select estado from erp.pedidos where id = ped)::text = 'pronto',
                     'K11: venda fica pronta quando o material chega');

  -- excesso de receção recusado
  begin
    perform erp.receber_oc(oc, jsonb_build_array(jsonb_build_object('item_id', it, 'quantidade', 1)));
    raise notice 'FALHA K12: receção acima do encomendado foi aceite';
  exception when others then raise notice 'PASSA K12: receção acima do encomendado recusada';
  end;
end $$;

-- segurança por perfil: vendedora não compra
do $$
declare oc uuid;
begin
  perform pg_temp.entra('vendedora');
  perform pg_temp.ok(not erp.pode_comprar(), 'K13: vendedora não tem permissão de compras');
  perform pg_temp.ok(not erp.pode_pagar(),   'K14: vendedora não tem permissão de pagamentos');
end $$;
