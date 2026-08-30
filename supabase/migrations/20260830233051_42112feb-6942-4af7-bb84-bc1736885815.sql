drop view erp.v_formas_pagamento;
create view erp.v_formas_pagamento
with (security_invoker = true) as
 SELECT id, criado_em, criado_por, atualizado_em, atualizado_por, eliminado_em,
    eliminado_por, motivo_eliminacao, codigo, nome, momento, estado_inicial,
    exige_comprovativo, prazo_confirmacao_horas, taxa_pct, entra_caixa,
    e_numerario, ordem, ativo
   FROM erp.formas_pagamento
  WHERE eliminado_em IS NULL;
grant select on erp.v_formas_pagamento to authenticated;
