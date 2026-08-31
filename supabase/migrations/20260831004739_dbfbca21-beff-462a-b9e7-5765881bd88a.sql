CREATE OR REPLACE VIEW erp.v_caixas
WITH (security_invoker = true) AS
 SELECT c.id,
    c.criado_em,
    c.criado_por,
    c.atualizado_em,
    c.atualizado_por,
    c.eliminado_em,
    c.eliminado_por,
    c.motivo_eliminacao,
    c.utilizador_id,
    c.data,
    c.estado,
    c.saldo_abertura,
    c.saldo_esperado,
    c.saldo_contado,
    c.diferenca,
    c.justificacao_diferenca,
    c.aberto_em,
    c.fechado_em,
    c.fechado_por,
    c.reaberto_em,
    c.reaberto_por,
    c.motivo_reabertura,
    u.nome AS utilizador_nome,
    COALESCE(t.dinheiro, 0::numeric) AS total_dinheiro,
    COALESCE(t.multibanco, 0::numeric) AS total_multibanco,
    COALESCE(t.mbway, 0::numeric) AS total_mbway,
    COALESCE(t.transferencia, 0::numeric) AS total_transferencia,
    COALESCE(t.saidas, 0::numeric) AS total_saidas,
    COALESCE(t.sangrias, 0::numeric) AS total_sangrias,
    COALESCE(t.n_movimentos, 0::bigint) AS n_movimentos,
    c.rota_id,
    r.nome AS rota_nome,
    r.data AS rota_data,
    r.estado::text AS rota_estado
   FROM erp.caixas c
     LEFT JOIN erp.utilizadores u ON u.id = c.utilizador_id
     LEFT JOIN erp.rotas r ON r.id = c.rota_id
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN m.tipo = 'recebimento'::text AND f.codigo = 'DINHEIRO'::text THEN m.valor
                    ELSE 0::numeric
                END) AS dinheiro,
            sum(
                CASE
                    WHEN m.tipo = 'recebimento'::text AND f.codigo = 'MULTIBANCO'::text THEN m.valor
                    ELSE 0::numeric
                END) AS multibanco,
            sum(
                CASE
                    WHEN m.tipo = 'recebimento'::text AND f.codigo = 'MBWAY'::text THEN m.valor
                    ELSE 0::numeric
                END) AS mbway,
            sum(
                CASE
                    WHEN m.tipo = 'recebimento'::text AND f.codigo = 'TRANSFERENCIA'::text THEN m.valor
                    ELSE 0::numeric
                END) AS transferencia,
            sum(
                CASE
                    WHEN m.tipo = 'saida'::text THEN m.valor
                    ELSE 0::numeric
                END) AS saidas,
            sum(
                CASE
                    WHEN m.tipo = 'sangria'::text THEN m.valor
                    ELSE 0::numeric
                END) AS sangrias,
            count(*) AS n_movimentos
           FROM erp.caixa_movimentos m
             LEFT JOIN erp.formas_pagamento f ON f.id = m.forma_id
          WHERE m.caixa_id = c.id AND m.eliminado_em IS NULL) t ON true
  WHERE c.eliminado_em IS NULL;

GRANT SELECT ON erp.v_caixas TO authenticated;