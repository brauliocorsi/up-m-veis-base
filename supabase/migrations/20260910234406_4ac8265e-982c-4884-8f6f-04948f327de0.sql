create or replace view erp.v_pedidos with (security_invoker = true) as
 SELECT p.id,
    p.criado_em,
    p.criado_por,
    p.atualizado_em,
    p.atualizado_por,
    p.eliminado_em,
    p.eliminado_por,
    p.motivo_eliminacao,
    p.numero,
    p.tipo,
    p.origem,
    p.cliente_id,
    p.vendedor_id,
    p.estado,
    p.data_entrega_prevista,
    p.data_entrega_prometida,
    p.data_entrega_origem,
    p.motivo_data_id,
    p.nota_data,
    p.entrega_domicilio,
    p.morada_entrega,
    p.cp4_entrega,
    p.cp3_entrega,
    p.localidade_entrega,
    p.zona_entrega_id,
    p.contacto_entrega,
    p.notas_entrega,
    p.subtotal,
    p.desconto_linhas,
    p.desconto_cabecalho_pct,
    p.desconto_cabecalho,
    p.cupao_id,
    p.desconto_cupao,
    p.valor_montagem,
    p.valor_entrega,
    p.valor_entrega_origem,
    p.total_sem_iva,
    p.total_iva,
    p.total,
    p.total_pago,
    p.observacoes,
    p.observacoes_internas,
    p.confirmado_em,
    p.confirmado_por,
    p.cancelado_em,
    p.cancelado_por,
    p.motivo_cancelamento_id,
    p.nota_cancelamento,
    p.reaberto_em,
    p.reaberto_por,
    p.nota_reabertura,
    p.estado_pagamento,
    c.nome AS cliente_nome,
    c.telefone_e164 AS cliente_telefone,
    c.nif AS cliente_nif,
    u.nome AS vendedor_nome,
    z.nome AS zona_nome,
    ( SELECT count(*) AS count
           FROM erp.pedido_itens i
          WHERE i.pedido_id = p.id AND i.eliminado_em IS NULL) AS n_itens,
    GREATEST(p.total - p.total_pago, 0::numeric) AS falta_pagar,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM erp.documentos_fiscais d
              WHERE d.pedido_id = p.id AND d.eliminado_em IS NULL AND d.tipo = 'nota_credito'::text AND (d.estado = ANY (ARRAY['emitido'::text, 'comunicado_at'::text])))) THEN 'nota_credito'::text
            WHEN (EXISTS ( SELECT 1
               FROM erp.documentos_fiscais d
              WHERE d.pedido_id = p.id AND d.eliminado_em IS NULL AND (d.tipo = ANY (ARRAY['fatura'::text, 'fatura_recibo'::text])) AND (d.estado = ANY (ARRAY['emitido'::text, 'comunicado_at'::text])))) THEN 'faturado'::text
            WHEN (EXISTS ( SELECT 1
               FROM erp.documentos_fiscais d
              WHERE d.pedido_id = p.id AND d.eliminado_em IS NULL AND d.tipo = 'guia_transporte'::text AND (d.estado = ANY (ARRAY['emitido'::text, 'comunicado_at'::text])))) THEN 'guia_emitida'::text
            ELSE 'sem_documento'::text
        END AS estado_fiscal,
    ( SELECT max(e.data_entrega) AS max
           FROM erp.entregas e
          WHERE e.pedido_id = p.id AND e.eliminado_em IS NULL AND e.estado = 'registada'::text) AS data_entrega_efetiva,
    COALESCE(( SELECT sum(i.quantidade) AS sum
           FROM erp.pedido_itens i
          WHERE i.pedido_id = p.id AND i.eliminado_em IS NULL), 0::bigint) - COALESCE(( SELECT sum(ei.quantidade) AS sum
           FROM erp.entrega_itens ei
             JOIN erp.entregas en ON en.id = ei.entrega_id
             JOIN erp.pedido_itens i2 ON i2.id = ei.pedido_item_id
          WHERE i2.pedido_id = p.id AND i2.eliminado_em IS NULL AND ei.eliminado_em IS NULL AND en.eliminado_em IS NULL AND en.estado = 'registada'::text), 0::bigint) AS unidades_por_entregar,
    COALESCE(( SELECT sum(pg.valor) AS sum
           FROM erp.pagamentos pg
          WHERE pg.pedido_id = p.id AND pg.eliminado_em IS NULL AND (pg.estado = ANY (ARRAY['pendente'::text, 'pendente_confirmacao'::text]))), 0::numeric)::numeric(12,2) AS pendente_confirmacao,
    COALESCE(( SELECT sum(pg.valor) AS sum
           FROM erp.pagamentos pg
             JOIN erp.formas_pagamento f ON f.id = pg.forma_id
          WHERE pg.pedido_id = p.id AND pg.eliminado_em IS NULL AND (pg.estado = ANY (ARRAY['pendente'::text, 'pendente_confirmacao'::text])) AND f.momento = 'entrega'::text), 0::numeric)::numeric(12,2) AS a_receber_entrega,
    ( SELECT count(*) AS count
           FROM erp.pedido_itens i
          WHERE i.pedido_id = p.id AND i.eliminado_em IS NULL AND i.estado <> 'cancelado'::erp.estado_item) AS linhas_ativas,
    ( SELECT count(*) AS count
           FROM erp.pedido_itens i
          WHERE i.pedido_id = p.id AND i.eliminado_em IS NULL AND i.estado <> 'cancelado'::erp.estado_item AND (i.estado = ANY (ARRAY['reservado'::erp.estado_item, 'separado'::erp.estado_item, 'entregue'::erp.estado_item]))) AS linhas_prontas,
    (EXISTS ( SELECT 1
           FROM erp.pedido_itens i
          WHERE i.pedido_id = p.id AND i.eliminado_em IS NULL AND i.estado <> 'cancelado'::erp.estado_item)) AND NOT (EXISTS ( SELECT 1
           FROM erp.pedido_itens i
          WHERE i.pedido_id = p.id AND i.eliminado_em IS NULL AND i.estado <> 'cancelado'::erp.estado_item AND (i.estado <> ALL (ARRAY['reservado'::erp.estado_item, 'separado'::erp.estado_item, 'entregue'::erp.estado_item])))) AS disponivel_entrega,
    ( SELECT count(*) FROM erp.rota_paragens rp
        WHERE rp.pedido_id = p.id AND rp.eliminado_em IS NULL AND rp.desfecho = 'reagendada'::text) AS reagendamentos,
    ( SELECT rp.data_reagendamento FROM erp.rota_paragens rp
        WHERE rp.pedido_id = p.id AND rp.eliminado_em IS NULL AND rp.desfecho = 'reagendada'::text
        ORDER BY rp.concluida_em DESC NULLS LAST LIMIT 1) AS data_reagendamento,
    ( (EXISTS ( SELECT 1 FROM erp.rota_paragens rp
          WHERE rp.pedido_id = p.id AND rp.eliminado_em IS NULL AND rp.desfecho = 'reagendada'::text))
      AND NOT (EXISTS ( SELECT 1 FROM erp.rota_paragens rp
          WHERE rp.pedido_id = p.id AND rp.eliminado_em IS NULL AND rp.desfecho IS NULL))
      AND p.estado <> ALL (ARRAY['entregue'::erp.estado_pedido, 'cancelado'::erp.estado_pedido, 'orcamento'::erp.estado_pedido]) ) AS precisa_remarcacao
   FROM erp.pedidos p
     JOIN erp.clientes c ON c.id = p.cliente_id
     LEFT JOIN erp.utilizadores u ON u.id = p.vendedor_id
     LEFT JOIN erp.zonas_entrega z ON z.id = p.zona_entrega_id
  WHERE p.eliminado_em IS NULL;