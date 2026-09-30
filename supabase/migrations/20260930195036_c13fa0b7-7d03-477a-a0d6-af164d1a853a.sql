alter table erp.contagem_fabrica_ignorados add column if not exists eliminado_em timestamptz;
alter table erp.nota_versoes add column if not exists eliminado_em timestamptz;