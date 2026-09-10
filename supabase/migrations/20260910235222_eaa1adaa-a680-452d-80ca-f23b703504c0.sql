drop index if exists erp.ux_caixas_dia;
create unique index if not exists ux_caixas_dia_sem_rota
  on erp.caixas (utilizador_id, data)
  where eliminado_em is null and rota_id is null;