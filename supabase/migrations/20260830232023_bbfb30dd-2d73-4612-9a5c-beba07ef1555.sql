CREATE OR REPLACE VIEW erp.v_conciliacao_movimentos
WITH (security_invoker = true) AS
SELECT
  cm.id,
  c.data                          AS data,
  cm.criado_em                    AS ocorrido_em,
  cm.tipo                         AS tipo,
  cm.valor                        AS valor,
  cm.sentido                      AS sentido,
  (cm.valor * cm.sentido)         AS valor_assinado,
  cm.forma_id                     AS forma_id,
  f.nome                          AS forma_nome,
  f.codigo                        AS forma_codigo,
  cm.pagamento_id                 AS pagamento_id,
  cm.pedido_id                    AS pedido_id,
  p.numero                        AS pedido_numero,
  cl.nome                         AS cliente_nome,
  c.id                            AS caixa_id,
  c.rota_id                       AS rota_id,
  r.nome                          AS rota_nome,
  c.utilizador_id                 AS utilizador_id,
  u.nome                          AS utilizador_nome,
  m.descricao                     AS motivo_descricao,
  cm.descricao                    AS descricao,
  cm.comprovativo_url             AS comprovativo_url
FROM erp.caixa_movimentos cm
JOIN erp.caixas c ON c.id = cm.caixa_id
LEFT JOIN erp.formas_pagamento f ON f.id = cm.forma_id
LEFT JOIN erp.motivos m ON m.id = cm.motivo_id
LEFT JOIN erp.pedidos p ON p.id = cm.pedido_id
LEFT JOIN erp.clientes cl ON cl.id = p.cliente_id
LEFT JOIN erp.rotas r ON r.id = c.rota_id
LEFT JOIN erp.utilizadores u ON u.id = c.utilizador_id
WHERE cm.eliminado_em IS NULL;

CREATE OR REPLACE VIEW erp.v_conciliacao_dias
WITH (security_invoker = true) AS
SELECT
  c.data                                                               AS data,
  count(*)                                                             AS n_movimentos,
  coalesce(sum(cm.valor) FILTER (WHERE cm.sentido > 0), 0)::numeric(12,2) AS entradas,
  coalesce(sum(cm.valor) FILTER (WHERE cm.sentido < 0), 0)::numeric(12,2) AS saidas,
  coalesce(sum(cm.valor * cm.sentido), 0)::numeric(12,2)               AS saldo
FROM erp.caixa_movimentos cm
JOIN erp.caixas c ON c.id = cm.caixa_id
WHERE cm.eliminado_em IS NULL
GROUP BY c.data;

GRANT SELECT ON erp.v_conciliacao_movimentos TO authenticated;
GRANT SELECT ON erp.v_conciliacao_dias TO authenticated;