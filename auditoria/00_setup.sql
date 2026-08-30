-- ============================================================
-- Setup partilhado dos testes de comportamento (incluído com \ir)
-- Cria utilizadores de teste e dados base. Idempotente.
-- ============================================================

-- contas de autenticação falsas
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'adm@auditoria.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'vendedora@auditoria.test'),
  ('cccccccc-0000-0000-0000-000000000003', 'compras@auditoria.test')
on conflict do nothing;

insert into erp.utilizadores (user_id, nome, email, perfil, ativo)
select u.id, v.nome, v.email, v.perfil::erp.perfil, true
from auth.users u
join (values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'Adm Auditoria',    'adm@auditoria.test',       'adm'),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'Vendedora Auditoria','vendedora@auditoria.test','vendedora'),
  ('cccccccc-0000-0000-0000-000000000003'::uuid, 'Compras Auditoria', 'compras@auditoria.test',  'compras')
) as v(uid, nome, email, perfil) on v.uid = u.id
where not exists (select 1 from erp.utilizadores x where x.user_id = u.id);

-- dados base de catálogo
insert into erp.categorias (codigo, nome)
select 'AUD', 'Categoria Auditoria'
where not exists (select 1 from erp.categorias where codigo = 'AUD');

insert into erp.fornecedores (nome, codigo, prazo_dias)
select 'Fornecedor Auditoria', 'FOR-AUD', 10
where not exists (select 1 from erp.fornecedores where codigo = 'FOR-AUD');

insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento, preco_base)
select 'P-AUD-STOCK', c.id, 'Produto Auditoria Stock', 'stock', 100
from erp.categorias c where c.codigo = 'AUD'
  and not exists (select 1 from erp.produtos where cod_barras = 'P-AUD-STOCK');

insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento,
                          fornecedor_id, prazo_fornecedor_dias, preco_base, custo_ultimo)
select 'P-AUD-COMPRA', c.id, 'Produto Auditoria Compra', 'compra', f.id, 10, 100, 50
from erp.categorias c, erp.fornecedores f
where c.codigo = 'AUD' and f.codigo = 'FOR-AUD'
  and not exists (select 1 from erp.produtos where cod_barras = 'P-AUD-COMPRA');

insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento,
                          fornecedor_id, prazo_fornecedor_dias, preco_base, custo_ultimo)
select 'P-AUD-K', c.id, 'Produto Auditoria K', 'compra', f.id, 10, 100, 50
from erp.categorias c, erp.fornecedores f
where c.codigo = 'AUD' and f.codigo = 'FOR-AUD'
  and not exists (select 1 from erp.produtos where cod_barras = 'P-AUD-K');

insert into erp.clientes (nome, telefone_e164)
select 'Cliente Auditoria', '+351912345678'
where not exists (select 1 from erp.clientes where nome = 'Cliente Auditoria');

-- auxiliares de asserção
create or replace function pg_temp.ok(cond boolean, nome text) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASSA %', nome;
  else raise notice 'FALHA %', nome; end if;
end $$;

create or replace function pg_temp.ok_excecao(sql text, nome text) returns void language plpgsql as $$
begin
  execute sql;
  raise notice 'FALHA % (devia ter falhado)', nome;
exception when others then
  raise notice 'PASSA %', nome;
end $$;

-- entra como utilizador: pg_temp.entra('adm'|'vendedora'|'compras'|'ninguem')
create or replace function pg_temp.entra(quem text) returns void language plpgsql as $$
declare uid uuid;
begin
  uid := case quem
    when 'adm'       then 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    when 'vendedora' then 'bbbbbbbb-0000-0000-0000-000000000002'::uuid
    when 'compras'   then 'cccccccc-0000-0000-0000-000000000003'::uuid
    else null end;
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
end $$;
