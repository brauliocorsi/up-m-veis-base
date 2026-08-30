drop policy if exists cp_sel on erp.contas_pagar;
create policy cp_sel on erp.contas_pagar for select to authenticated
  using (erp.pode_ver_financeiro());

grant execute on function erp.criar_despesa(text, text, numeric, date, uuid, date, boolean, text, text, uuid) to authenticated;
grant execute on function erp.fechar_dia_financeiro(date, text) to authenticated;
grant execute on function erp.gerar_alertas_financeiros() to authenticated;
grant execute on function erp.confirmar_pagamento(uuid, text, text) to authenticated;
grant execute on function erp.pode_ver_financeiro() to authenticated;
grant execute on function erp.pode_ver_custos() to authenticated;