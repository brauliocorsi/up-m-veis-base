ALTER TYPE erp.perfil ADD VALUE IF NOT EXISTS 'entregador';

ALTER TABLE erp.motivos DROP CONSTRAINT motivos_contexto_check;
ALTER TABLE erp.motivos ADD CONSTRAINT motivos_contexto_check CHECK (contexto = ANY (ARRAY[
  'cancelamento','alteracao_data','eliminacao','saida_caixa','desconto_excecional','reabertura',
  'nao_entrega','reagendamento','saida_rota','assistencia']));

INSERT INTO erp.motivos (contexto, descricao, exige_texto, ordem, ativo) VALUES
  ('nao_entrega', 'Cliente ausente', false, 1, true),
  ('nao_entrega', 'Morada errada', true, 2, true),
  ('nao_entrega', 'Cliente recusou a entrega', true, 3, true),
  ('nao_entrega', 'Sem acesso ao local', true, 4, true),
  ('reagendamento', 'Cliente pediu outra data', false, 1, true),
  ('reagendamento', 'Falta de material', false, 2, true),
  ('reagendamento', 'Viatura ou rota sem tempo', false, 3, true),
  ('saida_rota', 'Combustível', false, 1, true),
  ('saida_rota', 'Portagens', false, 2, true),
  ('saida_rota', 'Ferramenta ou material', true, 3, true),
  ('saida_rota', 'Refeição da equipa', false, 4, true),
  ('assistencia', 'Peça danificada no transporte', true, 1, true),
  ('assistencia', 'Defeito de fábrica', true, 2, true),
  ('assistencia', 'Peça em falta', true, 3, true),
  ('assistencia', 'Montagem incorreta', true, 4, true);