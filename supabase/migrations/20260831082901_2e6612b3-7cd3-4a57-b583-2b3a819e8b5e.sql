-- 1) novo estado
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'erp' and t.typname = 'estado_pedido' and e.enumlabel = 'entrega_parcial'
  ) then
    alter type erp.estado_pedido add value 'entrega_parcial' before 'entregue';
  end if;
end $$;
