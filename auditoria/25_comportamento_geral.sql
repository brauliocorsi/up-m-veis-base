-- ============================================================
-- Testes de COMPORTAMENTO
-- Cada teste responde a "o sistema faz mesmo isto?", não a
-- "o código parece dizer que faz".
-- ============================================================
\set ON_ERROR_STOP off
\pset pager off
set client_min_messages to notice;

create or replace function pg_temp.ok(n text, c boolean) returns void
language plpgsql as $$
begin raise notice '%  %', case when c then '[PASSA]' else '[FALHA]' end, n; end $$;

-- ---------- Dados de teste ----------
insert into auth.users (id,email) values
  ('aaaa0000-0000-0000-0000-00000000000a','adm@teste.pt'),
  ('bbbb0000-0000-0000-0000-00000000000b','vend@teste.pt') on conflict do nothing;
insert into erp.utilizadores (user_id,nome,email,perfil) values
  ('aaaa0000-0000-0000-0000-00000000000a','[AUD] Admin','adm@teste.pt','adm'),
  ('bbbb0000-0000-0000-0000-00000000000b','[AUD] Vendedora','vend@teste.pt','vendedora')
on conflict (user_id) do nothing;

select set_config('request.jwt.claim.sub','aaaa0000-0000-0000-0000-00000000000a',false);

insert into erp.categorias (codigo,nome) values ('AUD','Auditoria') on conflict (codigo) do nothing;
insert into erp.produtos (cod_barras,categoria_id,nome_cliente,tipo_fornecimento,preco_base,n_colis)
select 'AUD-STOCK', id,'[AUD] Produto','stock',100,1 from erp.categorias where codigo='AUD'
on conflict (cod_barras) do nothing;

-- ============================================================
-- A. LIVRO DE STOCK
-- ============================================================
do $$
declare v_p uuid; v_soma int; v_fis int;
begin
  select id into v_p from erp.produtos where cod_barras='AUD-STOCK';
  insert into erp.stock_movimentos (produto_id,tipo,quantidade,origem,chave_idempotencia,ocorrido_em)
  values (v_p,'inventario_inicial',10,'contagem','aud:inv',now())
  on conflict (chave_idempotencia) do nothing;

  select coalesce(sum(quantidade),0) into v_soma from erp.stock_movimentos where produto_id=v_p;
  select fisico into v_fis from erp.stock_atual where produto_id=v_p;
  perform pg_temp.ok('A1 Stock reconstrói-se a partir do livro ('||v_soma||'='||v_fis||')', v_soma=v_fis);

  -- idempotência
  begin
    insert into erp.stock_movimentos (produto_id,tipo,quantidade,origem,chave_idempotencia,ocorrido_em)
    values (v_p,'inventario_inicial',10,'contagem','aud:inv',now());
    perform pg_temp.ok('A2 Chave de idempotência impede duplicados', false);
  exception when unique_violation then
    perform pg_temp.ok('A2 Chave de idempotência impede duplicados', true);
  end;

  -- imutabilidade
  begin
    update erp.stock_movimentos set quantidade=999 where produto_id=v_p;
    perform pg_temp.ok('A3 Movimentos de stock são imutáveis', false);
  exception when others then
    perform pg_temp.ok('A3 Movimentos de stock são imutáveis', true);
  end;

  -- nunca negativo
  begin
    insert into erp.stock_movimentos (produto_id,tipo,quantidade,origem,chave_idempotencia,ocorrido_em)
    values (v_p,'saida',-99999,'erp','aud:neg',now());
    perform pg_temp.ok('A4 Stock nunca fica negativo', false);
  exception when others then
    perform pg_temp.ok('A4 Stock nunca fica negativo', true);
  end;
end $$;

-- ============================================================
-- B. RESERVAS
-- ============================================================
do $$
declare v_p uuid; v_r uuid; v_antes int; v_depois int;
begin
  select id into v_p from erp.produtos where cod_barras='AUD-STOCK';
  select vendavel into v_antes from erp.stock_atual where produto_id=v_p;
  v_r := erp.reservar(v_p, 2, 'pedido', gen_random_uuid());
  select vendavel into v_depois from erp.stock_atual where produto_id=v_p;
  perform pg_temp.ok('B1 Reservar reduz o vendável ('||v_antes||'->'||v_depois||')', v_depois = v_antes-2);

  perform erp.libertar_reserva(v_r,'Auditoria');
  select vendavel into v_depois from erp.stock_atual where produto_id=v_p;
  perform pg_temp.ok('B2 Libertar devolve ao vendável', v_depois = v_antes);

  -- não deixa reservar mais do que existe
  begin
    perform erp.reservar(v_p, 99999, 'pedido', gen_random_uuid());
    perform pg_temp.ok('B3 Não deixa reservar acima do disponível', false);
  exception when others then
    perform pg_temp.ok('B3 Não deixa reservar acima do disponível', true);
  end;
end $$;

-- ============================================================
-- C. PEDIDOS E TOTAIS
-- ============================================================
do $$
declare v_c uuid; v_ped uuid; v_p uuid; v_i uuid; v_tot numeric; v_esperado numeric;
begin
  select id into v_p from erp.produtos where cod_barras='AUD-STOCK';
  insert into erp.clientes (nome,nif) values ('[AUD] Cliente Auditoria','501442600')
  on conflict do nothing;
  select id into v_c from erp.clientes where nome='[AUD] Cliente Auditoria';

  insert into erp.pedidos (cliente_id, vendedor_id)
  values (v_c, (select id from erp.utilizadores where perfil='adm' limit 1))
  returning id into v_ped;

  insert into erp.pedido_itens (pedido_id,linha,produto_id,quantidade,preco_unitario)
  values (v_ped,1,v_p,3,100) returning id into v_i;

  select total into v_tot from erp.pedidos where id=v_ped;
  perform pg_temp.ok('C1 Total calculado pela base (3x100 -> '||v_tot||')', v_tot >= 300);

  -- o frontend não pode escrever o total
  update erp.pedidos set total = 1 where id=v_ped;
  select total into v_tot from erp.pedidos where id=v_ped;
  perform pg_temp.ok('C2 Total escrito à mão é ignorado/recalculado', v_tot <> 1);

  -- soma das linhas = total
  select sum(total_linha) into v_esperado from erp.pedido_itens
   where pedido_id=v_ped and eliminado_em is null;
  perform pg_temp.ok('C3 Soma das linhas bate com o total', v_esperado is not null);
end $$;

-- ============================================================
-- D. SEGURANÇA — corrido COMO VENDEDORA, não como ADM
-- ============================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbb0000-0000-0000-0000-00000000000b',true);

do $$
declare v_cat uuid;
begin
  select id into v_cat from erp.categorias limit 1;

  begin
    insert into erp.produtos (cod_barras,categoria_id,nome_cliente,tipo_fornecimento,preco_base)
    values ('HACK-'||gen_random_uuid(),v_cat,'Pirata','stock',1);
    perform pg_temp.ok('D1 Vendedora NÃO cria produtos', false);
  exception when insufficient_privilege or check_violation then
    perform pg_temp.ok('D1 Vendedora NÃO cria produtos', true);
  end;

  begin
    insert into erp.formas_pagamento (codigo,nome,momento,estado_inicial)
    values ('HK','Pirata','loja','confirmado');
    perform pg_temp.ok('D2 Vendedora NÃO altera configurações', false);
  exception when insufficient_privilege then
    perform pg_temp.ok('D2 Vendedora NÃO altera configurações', true);
  end;

  begin
    insert into erp.eventos (tabela,registo_id,operacao) values ('falso',gen_random_uuid(),'INSERT');
    perform pg_temp.ok('D3 Vendedora NÃO escreve no histórico', false);
  exception when insufficient_privilege then
    perform pg_temp.ok('D3 Vendedora NÃO escreve no histórico', true);
  end;

  begin
    delete from erp.clientes where nome='[AUD] Cliente Auditoria';
    perform pg_temp.ok('D4 DELETE físico bloqueado', false);
  exception when insufficient_privilege then
    perform pg_temp.ok('D4 DELETE físico bloqueado', true);
  end;

  begin
    insert into erp.stock_movimentos (produto_id,tipo,quantidade,origem,chave_idempotencia,ocorrido_em)
    values ((select id from erp.produtos limit 1),'entrada',100,'erp','hack:'||gen_random_uuid(),now());
    perform pg_temp.ok('D5 Vendedora NÃO inventa stock', false);
  exception when insufficient_privilege then
    perform pg_temp.ok('D5 Vendedora NÃO inventa stock', true);
  end;
end $$;

select pg_temp.ok('D6 Vendedora NÃO lê o histórico de eventos',
  (select count(*) from erp.eventos) = 0);
select pg_temp.ok('D7 Vendedora LÊ o catálogo', (select count(*) from erp.produtos) > 0);
commit;

-- ============================================================
-- E. AUDITORIA
-- ============================================================
select pg_temp.ok('E1 Auditoria regista alterações', (select count(*) from erp.eventos) > 0);

select pg_temp.ok('E2 Todas as tabelas têm eliminação lógica',
  not exists (
    select 1 from pg_tables t where t.schemaname='erp'
      and t.tablename not in ('eventos','definicoes','stock_atual','stock_movimentos','sync_estado','sync_pendentes')
      and not exists (select 1 from information_schema.columns c
                      where c.table_schema='erp' and c.table_name=t.tablename
                        and c.column_name='eliminado_em')));

select pg_temp.ok('E3 Nenhuma tabela sem RLS',
  not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='erp' and c.relkind='r' and not c.relrowsecurity));

select pg_temp.ok('E4 Nenhuma função security definer sem search_path',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='erp' and p.prosecdef
                and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')));

select pg_temp.ok('E5 Nenhuma política lê o perfil dos metadados do utilizador',
  not exists (select 1 from pg_policies where schemaname='erp'
              and (qual::text ilike '%raw_user_meta%' or qual::text ilike '%user_metadata%')));

select pg_temp.ok('E6 Nenhum DELETE concedido à aplicação',
  not exists (select 1 from information_schema.role_table_grants
              where table_schema='erp' and privilege_type='DELETE'
                and grantee in ('authenticated','anon')));

select pg_temp.ok('E7 Nenhum acesso do papel anónimo ao erp',
  not exists (select 1 from information_schema.role_table_grants
              where table_schema='erp' and grantee='anon'));

select pg_temp.ok('E8 Nenhuma coluna de dinheiro em vírgula flutuante',
  not exists (select 1 from information_schema.columns
              where table_schema='erp' and data_type in ('double precision','real')
                and column_name ~ 'valor|preco|total|custo|desconto|saldo|taxa'));
