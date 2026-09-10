create or replace view erp.v_pedidos with (security_invoker = true) as
select
  p.id, p.criado_em, p.criado_por, p.atualizado_em, p.atualizado_por,
  p.eliminado_em, p.eliminado_por, p.motivo_eliminacao,
  p.numero, p.tipo, p.origem, p.cliente_id, p.vendedor_id, p.estado,
  p.data_entrega_prevista, p.data_entrega_prometida, p.data_entrega_origem,
  p.motivo_data_id, p.nota_data, p.entrega_domicilio,
  p.morada_entrega, p.cp4_entrega, p.cp3_entrega, p.localidade_entrega,
  p.zona_entrega_id, p.contacto_entrega, p.notas_entrega,
  p.subtotal, p.desconto_linhas, p.desconto_cabecalho_pct, p.desconto_cabecalho,
  p.cupao_id, p.desconto_cupao, p.valor_montagem, p.valor_entrega, p.valor_entrega_origem,
  p.total_sem_iva, p.total_iva, p.total, p.total_pago,
  p.observacoes, p.observacoes_internas,
  p.confirmado_em, p.confirmado_por,
  p.cancelado_em, p.cancelado_por, p.motivo_cancelamento_id, p.nota_cancelamento,
  p.reaberto_em, p.reaberto_por, p.nota_reabertura,
  p.estado_pagamento,
  c.nome as cliente_nome,
  c.telefone_e164 as cliente_telefone,
  c.nif as cliente_nif,
  u.nome as vendedor_nome,
  z.nome as zona_nome,
  (select count(*) from erp.pedido_itens i
    where i.pedido_id = p.id and i.eliminado_em is null) as n_itens,
  greatest(p.total - p.total_pago, 0::numeric) as falta_pagar,
  case
    when exists (select 1 from erp.documentos_fiscais d
      where d.pedido_id = p.id and d.eliminado_em is null
        and d.tipo = 'nota_credito' and d.estado in ('emitido','comunicado_at')) then 'nota_credito'
    when exists (select 1 from erp.documentos_fiscais d
      where d.pedido_id = p.id and d.eliminado_em is null
        and d.tipo in ('fatura','fatura_recibo') and d.estado in ('emitido','comunicado_at')) then 'faturado'
    when exists (select 1 from erp.documentos_fiscais d
      where d.pedido_id = p.id and d.eliminado_em is null
        and d.tipo = 'guia_transporte' and d.estado in ('emitido','comunicado_at')) then 'guia_emitida'
    else 'sem_documento'
  end as estado_fiscal,
  (select max(e.data_entrega) from erp.entregas e
    where e.pedido_id = p.id and e.eliminado_em is null and e.estado = 'registada') as data_entrega_efetiva,
  coalesce((select sum(i.quantidade) from erp.pedido_itens i
    where i.pedido_id = p.id and i.eliminado_em is null), 0::bigint)
  - coalesce((select sum(ei.quantidade)
    from erp.entrega_itens ei
    join erp.entregas en on en.id = ei.entrega_id
    join erp.pedido_itens i2 on i2.id = ei.pedido_item_id
    where i2.pedido_id = p.id and i2.eliminado_em is null
      and ei.eliminado_em is null and en.eliminado_em is null and en.estado = 'registada'), 0::bigint)
  as unidades_por_entregar,
  coalesce((select sum(pg.valor) from erp.pagamentos pg
    where pg.pedido_id = p.id and pg.eliminado_em is null
      and pg.estado in ('pendente','pendente_confirmacao')), 0::numeric)::numeric(12,2) as pendente_confirmacao,
  coalesce((select sum(pg.valor) from erp.pagamentos pg
    join erp.formas_pagamento f on f.id = pg.forma_id
    where pg.pedido_id = p.id and pg.eliminado_em is null
      and pg.estado in ('pendente','pendente_confirmacao') and f.momento = 'entrega'), 0::numeric)::numeric(12,2) as a_receber_entrega,
  (select count(*) from erp.pedido_itens i
    where i.pedido_id = p.id and i.eliminado_em is null
      and i.estado <> 'cancelado') as linhas_ativas,
  (select count(*) from erp.pedido_itens i
    where i.pedido_id = p.id and i.eliminado_em is null
      and i.estado <> 'cancelado'
      and i.estado in ('reservado','separado','entregue')) as linhas_prontas,
  exists (select 1 from erp.pedido_itens i
    where i.pedido_id = p.id and i.eliminado_em is null and i.estado <> 'cancelado')
  and not exists (select 1 from erp.pedido_itens i
    where i.pedido_id = p.id and i.eliminado_em is null and i.estado <> 'cancelado'
      and i.estado not in ('reservado','separado','entregue'))
  as disponivel_entrega
from erp.pedidos p
join erp.clientes c on c.id = p.cliente_id
left join erp.utilizadores u on u.id = p.vendedor_id
left join erp.zonas_entrega z on z.id = p.zona_entrega_id
where p.eliminado_em is null;