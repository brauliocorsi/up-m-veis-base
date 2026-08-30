-- ============================================================
-- Regressão: views não podem contornar o RLS
-- Bug real encontrado a 30/08/2026 — 24 views sem security_invoker
-- deixavam qualquer utilizador ler contas a pagar e custos de compra.
-- ============================================================

create or replace function pg_temp.ok(n text,c boolean) returns void language plpgsql as $$
begin raise notice '%  %', case when c then '[PASSA]' else '[FALHA]' end, n; end $$;

select pg_temp.ok('V1 Todas as views do erp têm security_invoker',
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='erp' and c.relkind='v'
      and coalesce((select option_value from pg_options_to_table(c.reloptions)
                    where option_name='security_invoker'),'false') <> 'true'
      -- exceção deliberada: expõe estado de fornecimento sem custos
      and c.relname <> 'v_fornecimento_linha'));

select pg_temp.ok('V2 A exceção não expõe custos',
  not exists (select 1 from information_schema.columns
              where table_schema='erp' and table_name='v_fornecimento_linha'
                and (column_name ilike '%custo%' or column_name ilike '%margem%'
                     or column_name = 'total_linha')));

select pg_temp.ok('V3 Custos não estão em erp.produtos',
  not exists (select 1 from information_schema.columns
              where table_schema='erp' and table_name='produtos'
                and (column_name ilike '%custo%' or column_name ilike '%margem%')));

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbb0000-0000-0000-0000-00000000000b',true);

do $$
declare n int;
begin
  select count(*) into n from erp.v_contas_pagar;
  perform pg_temp.ok('V4 Vendedora não lê contas a pagar ('||n||')', n=0);
  select count(*) into n from erp.v_oc_itens;
  perform pg_temp.ok('V5 Vendedora não lê custos de compra ('||n||')', n=0);
  select count(*) into n from erp.produto_custos;
  perform pg_temp.ok('V6 Vendedora não lê custos de produto ('||n||')', n=0);
exception when insufficient_privilege then
  perform pg_temp.ok('V4-V6 Vendedora sem acesso a dados de custo', true);
end $$;

commit;
