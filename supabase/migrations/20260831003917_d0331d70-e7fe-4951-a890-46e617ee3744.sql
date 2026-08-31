do $do$
declare
  v_oid oid;
  v_src text;
  v_args text;
begin
  select p.oid, p.prosrc, pg_get_function_identity_arguments(p.oid)
    into v_oid, v_src, v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'erp' and p.proname = 'registar_entrega'
    and p.oid::regprocedure::text like '%date%';

  if v_oid is null then raise exception 'função não encontrada'; end if;

  v_src := replace(v_src,
    'ped.estado not in (''confirmado'',''em_preparacao'',''pronto'')',
    'ped.estado not in (''confirmado'',''em_preparacao'',''pronto'',''agendado'')');
  v_src := replace(v_src,
    'Só é possível entregar pedidos confirmados, em preparação ou prontos.',
    'Só é possível entregar pedidos confirmados, em preparação, prontos ou agendados.');

  execute format(
    'create or replace function erp.registar_entrega(%s) returns %s language plpgsql security definer set search_path to ''erp'', ''public'' as %L',
    pg_get_function_arguments(v_oid),
    pg_get_function_result(v_oid),
    v_src);
end $do$;