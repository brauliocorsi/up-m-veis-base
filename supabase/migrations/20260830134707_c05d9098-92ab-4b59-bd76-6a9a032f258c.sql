alter table erp.stock_movimentos
  drop constraint if exists stock_movimentos_origem_check;

alter table erp.stock_movimentos
  add constraint stock_movimentos_origem_check
  check (origem = any (array['contagem','erp','manual','compra']));

-- Verificação
select pg_get_constraintdef(oid) as restricao_atual
from pg_constraint where conname = 'stock_movimentos_origem_check';