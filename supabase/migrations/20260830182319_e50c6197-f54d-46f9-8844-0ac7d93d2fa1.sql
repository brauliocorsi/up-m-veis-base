do $$
declare v record;
begin
  for v in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'erp' and c.relkind = 'v'
      and c.relname <> 'v_fornecimento_linha'
  loop
    execute format('alter view erp.%I set (security_invoker = true)', v.relname);
  end loop;
end $$;