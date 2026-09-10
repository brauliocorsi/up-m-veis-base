create or replace view erp.v_stock with (security_invoker = true) as
  select p.id as produto_id,
         p.cod_barras,
         p.nome_cliente,
         p.categoria_id,
         p.ponto_reposicao,
         p.tipo_fornecimento,
         coalesce(s.fisico, 0) as fisico,
         coalesce(s.quarentena, 0) as quarentena,
         coalesce(s.reservado, 0) as reservado,
         coalesce(s.em_transito_compra, 0) as em_transito_compra,
         coalesce(s.margem_seguranca, 0) as margem_seguranca,
         coalesce(s.vendavel, 0) as vendavel,
         coalesce(s.vendavel, 0) + coalesce(s.em_transito_compra, 0) as prometivel,
         s.atualizado_em,
         coalesce(e.encomendado, 0) as encomendado,
         coalesce(d.entregue, 0) as entregue
    from erp.produtos p
    left join erp.stock_atual s on s.produto_id = p.id
    left join lateral (
      select sum(i.quantidade - i.quantidade_recebida)::int as encomendado
        from erp.oc_itens i
        join erp.ordens_compra oc on oc.id = i.oc_id
       where i.produto_id = p.id
         and i.eliminado_em is null
         and oc.eliminado_em is null
         and oc.estado in ('pronta_enviar','enviada','confirmada','recebida_parcial')
    ) e on true
    left join lateral (
      select sum(ei.quantidade)::int as entregue
        from erp.entrega_itens ei
        join erp.entregas en on en.id = ei.entrega_id
        join erp.pedido_itens pi on pi.id = ei.pedido_item_id
       where pi.produto_id = p.id
         and ei.eliminado_em is null
         and en.eliminado_em is null
         and en.estado = 'registada'
    ) d on true
   where p.eliminado_em is null;

grant select on erp.v_stock to authenticated;