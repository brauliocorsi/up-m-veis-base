-- ============================================================
-- 10 — Verificações estruturais (corre como superuser)
-- Regras de arquitetura: RLS em tudo, auditoria em tudo,
-- DELETE revogado, views v_, search_path fixo, FKs indexadas.
-- Cada verificação devolve linhas só quando há problemas.
-- ============================================================

\echo 'Tabelas erp sem RLS ativo:'
select schemaname, tablename from pg_tables t
where schemaname = 'erp'
  and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = t.schemaname and c.relname = t.tablename and c.relrowsecurity);

\echo 'Tabelas erp sem colunas de auditoria (criado_em/eliminado_em):'
select t.table_name from information_schema.tables t
where t.table_schema = 'erp' and t.table_type = 'BASE TABLE'
  and (not exists (select 1 from information_schema.columns c
                   where c.table_schema='erp' and c.table_name=t.table_name and c.column_name='criado_em')
    or not exists (select 1 from information_schema.columns c
                   where c.table_schema='erp' and c.table_name=t.table_name and c.column_name='eliminado_em'));

\echo 'Tabelas erp sem trigger de auditoria (tg_auditoria/tg_auditoria_ref):'
select c.relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'erp' and c.relkind = 'r'
  and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal
                  and g.tgname ilike '%auditoria%');

\echo 'GRANT de DELETE a roles da aplicação (não pode haver):'
select table_schema, table_name, grantee
from information_schema.role_table_grants
where table_schema = 'erp' and privilege_type = 'DELETE'
  and grantee in ('anon','authenticated','service_role');

\echo 'SELECT a anon em tabelas erp com dados de utilizador:'
select table_name from information_schema.role_table_grants
where table_schema = 'erp' and privilege_type = 'SELECT' and grantee = 'anon'
  and table_name in ('utilizadores','eventos','pagamentos','pedidos','clientes');

\echo 'Funções security definer sem search_path fixo:'
select p.proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'erp' and p.prosecdef
  and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');

\echo 'Chaves estrangeiras sem índice na coluna:'
with fks as (
  select conrelid, conname, unnest(conkey) as attnum from pg_constraint
  where contype = 'f' and connamespace = 'erp'::regnamespace
)
select distinct c.relname, f.conname
from fks f join pg_class c on c.oid = f.conrelid
where not exists (
  select 1 from pg_index i
  where i.indrelid = f.conrelid and (i.indkey::int[])[0] = f.attnum
);

\echo 'Constraint de origem dos movimentos de stock tem de aceitar compra:'
select conname from pg_constraint
where conrelid = 'erp.stock_movimentos'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%compra%';

\echo 'Views v_ por tabela principal (têm de existir):'
select nome from (values
  ('v_pedidos'),('v_pedido_itens'),('v_stock_atual'),('v_ordens_compra'),
  ('v_oc_itens'),('v_contas_pagar'),('v_pagamentos'),('v_necessidades_compra')
) as v(nome)
where not exists (select 1 from pg_views where schemaname = 'erp' and viewname = v.nome);

\echo 'Fim das verificações estruturais (linhas acima = problemas).'
