alter table erp.fabrica_outbox add column if not exists eliminado_em timestamptz;
alter table erp.fabrica_ordens add column if not exists eliminado_em timestamptz;
alter table erp.fabrica_eventos add column if not exists eliminado_em timestamptz;
alter table erp.fabrica_eventos add column if not exists criado_em timestamptz not null default now();
alter table erp.operacoes_chaves add column if not exists eliminado_em timestamptz;