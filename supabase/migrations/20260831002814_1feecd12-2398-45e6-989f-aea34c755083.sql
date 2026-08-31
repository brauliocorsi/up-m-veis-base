ALTER TABLE erp.viaturas
  ALTER COLUMN atualizado_em DROP NOT NULL,
  ALTER COLUMN atualizado_em DROP DEFAULT;