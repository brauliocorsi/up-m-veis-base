DROP TABLE public.zz_teste;

REVOKE DELETE ON erp.pedido_itens FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp REVOKE DELETE ON TABLES FROM authenticated, anon;

REVOKE SELECT ON erp.calendario, erp.definicoes, erp.formas_pagamento,
                 erp.motivos, erp.utilizadores, erp.zonas_entrega FROM anon;
REVOKE SELECT ON erp.v_calendario, erp.v_definicoes, erp.v_formas_pagamento,
                 erp.v_motivos, erp.v_utilizadores, erp.v_zonas_entrega FROM anon;

CREATE TRIGGER t_cupao_usos_aud AFTER INSERT OR UPDATE ON erp.cupao_usos
  FOR EACH ROW EXECUTE FUNCTION erp.tg_auditoria();
CREATE TRIGGER t_necessidades_aud AFTER INSERT OR UPDATE ON erp.necessidades_compra
  FOR EACH ROW EXECUTE FUNCTION erp.tg_auditoria();

CREATE INDEX IF NOT EXISTS ix_pagamentos_forma      ON erp.pagamentos(forma_id);
CREATE INDEX IF NOT EXISTS ix_pagamentos_caixa      ON erp.pagamentos(caixa_id);
CREATE INDEX IF NOT EXISTS ix_pagamentos_recebido   ON erp.pagamentos(recebido_por);
CREATE INDEX IF NOT EXISTS ix_caixamov_pedido       ON erp.caixa_movimentos(pedido_id);
CREATE INDEX IF NOT EXISTS ix_caixamov_pagamento    ON erp.caixa_movimentos(pagamento_id);
CREATE INDEX IF NOT EXISTS ix_caixamov_forma        ON erp.caixa_movimentos(forma_id);
CREATE INDEX IF NOT EXISTS ix_cupao_usos_cupao      ON erp.cupao_usos(cupao_id);
CREATE INDEX IF NOT EXISTS ix_cupao_usos_cliente    ON erp.cupao_usos(cliente_id);
CREATE INDEX IF NOT EXISTS ix_cupao_usos_pedido     ON erp.cupao_usos(pedido_id);
CREATE INDEX IF NOT EXISTS ix_necessidades_produto  ON erp.necessidades_compra(produto_id);
CREATE INDEX IF NOT EXISTS ix_necessidades_forn     ON erp.necessidades_compra(fornecedor_id);
CREATE INDEX IF NOT EXISTS ix_pedido_itens_servico  ON erp.pedido_itens(servico_id);
CREATE INDEX IF NOT EXISTS ix_pedido_itens_reserva  ON erp.pedido_itens(reserva_id);
CREATE INDEX IF NOT EXISTS ix_dup_mantido           ON erp.clientes_duplicados_log(cliente_mantido);
CREATE INDEX IF NOT EXISTS ix_dup_absorvido         ON erp.clientes_duplicados_log(cliente_absorvido);