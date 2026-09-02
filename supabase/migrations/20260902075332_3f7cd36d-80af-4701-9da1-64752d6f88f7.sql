drop view if exists erp.v_etapas_producao;

create view erp.v_etapas_producao
 with (security_invoker = true) as
select e.id, e.codigo, e.nome, e.ordem, e.permite_stock_intermedio, e.exige_conferencia,
       e.ativo, e.centro_id, ct.nome as centro_nome,
       e.criado_em, e.atualizado_em
  from erp.etapas_producao e
  left join erp.centros_trabalho ct on ct.id = e.centro_id
 where e.eliminado_em is null;

grant select on erp.v_etapas_producao to authenticated;