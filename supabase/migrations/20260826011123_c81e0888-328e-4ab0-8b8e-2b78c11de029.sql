create extension if not exists pg_trgm with schema extensions;

-- ============================================================ tabelas
create table erp.fornecedores (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  nome text not null check (length(trim(nome)) >= 2),
  nif text,
  pais char(2) not null default 'PT',
  email_encomendas text check (email_encomendas ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone text,
  morada text,
  idioma char(2) not null default 'pt' check (idioma in ('pt','en','es','fr','pl')),
  metodo_envio text not null default 'email_manual'
    check (metodo_envio in ('email','email_manual','portal','whatsapp')),
  enviar_automatico boolean not null default false,
  prazo_dias int not null default 15 check (prazo_dias >= 0),
  valor_minimo_encomenda numeric(12,2) check (valor_minimo_encomenda >= 0),
  condicoes_pagamento text,
  observacoes text,
  ativo boolean not null default true,
  constraint fornecedores_auto_precisa_email
    check (not enviar_automatico or email_encomendas is not null)
);

create table erp.categorias (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  codigo text not null unique,
  nome text not null check (length(trim(nome)) >= 2),
  ordem int not null default 0,
  ativo boolean not null default true
);

create table erp.familias (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  categoria_id uuid not null references erp.categorias(id),
  codigo text not null,
  nome_interno text not null,
  nome_cliente text not null,
  ativo boolean not null default true,
  unique (categoria_id, codigo)
);

create type erp.tipo_fornecimento as enum ('stock','producao','compra');

create table erp.produtos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  cod_barras text not null unique,
  cod_modelo text,
  categoria_id uuid not null references erp.categorias(id),
  familia_id uuid references erp.familias(id),
  nome_cliente text not null check (length(trim(nome_cliente)) >= 2),
  nome_interno text,
  descricao text,
  tipo_fornecimento erp.tipo_fornecimento not null,
  fornecedor_id uuid references erp.fornecedores(id),
  prazo_producao_dias int check (prazo_producao_dias >= 0),
  prazo_fornecedor_dias int check (prazo_fornecedor_dias >= 0),
  n_colis int not null default 1 check (n_colis >= 1),
  volume_m3 numeric(10,3) check (volume_m3 >= 0),
  peso_kg numeric(10,2) check (peso_kg >= 0),
  preco_base numeric(12,2) check (preco_base >= 0),
  preco_promocional numeric(12,2) check (preco_promocional >= 0),
  custo_ultimo numeric(12,2) check (custo_ultimo >= 0),
  iva_pct numeric(5,2) not null default 23 check (iva_pct >= 0 and iva_pct <= 100),
  valor_montagem numeric(12,2) not null default 0 check (valor_montagem >= 0),
  montagem_obrigatoria boolean not null default false,
  tempo_montagem_min int check (tempo_montagem_min >= 0),
  permite_desconto boolean not null default true,
  margem_minima_pct numeric(5,2) check (margem_minima_pct >= 0 and margem_minima_pct <= 100),
  ponto_reposicao int check (ponto_reposicao >= 0),
  imagem_url text,
  vendavel boolean not null default true,
  ativo boolean not null default true,
  constraint produtos_producao_precisa_prazo
    check (tipo_fornecimento <> 'producao' or prazo_producao_dias is not null),
  constraint produtos_compra_precisa_fornecedor
    check (tipo_fornecimento <> 'compra'
           or (fornecedor_id is not null and prazo_fornecedor_dias is not null))
);
create index produtos_categoria_idx on erp.produtos (categoria_id);
create index produtos_familia_idx on erp.produtos (familia_id);
create index produtos_nome_trgm_idx on erp.produtos using gin (nome_cliente extensions.gin_trgm_ops);

create table erp.produto_colis (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  produto_id uuid not null references erp.produtos(id) on delete cascade,
  numero int not null check (numero >= 1),
  cod_barras_coli text,
  descricao text,
  unique (produto_id, numero)
);

create table erp.servicos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  codigo text not null unique,
  nome text not null check (length(trim(nome)) >= 2),
  tipo text not null check (tipo in ('montagem','entrega','transporte','assistencia','outro')),
  preco_base numeric(12,2) not null default 0 check (preco_base >= 0),
  iva_pct numeric(5,2) not null default 23 check (iva_pct >= 0 and iva_pct <= 100),
  permite_desconto boolean not null default false,
  ativo boolean not null default true
);

create table erp.clientes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  tipo text not null default 'particular' check (tipo in ('particular','empresa')),
  nome text not null check (length(trim(nome)) >= 3),
  nome_fiscal text,
  nif text,
  nif_estrangeiro boolean not null default false,
  nif_ok boolean,
  pais char(2) not null default 'PT',
  telefone_e164 text,
  telefone_alt text,
  email text,
  morada text,
  cp4 char(4) check (cp4 ~ '^[0-9]{4}$'),
  cp3 char(3) check (cp3 ~ '^[0-9]{3}$'),
  localidade text,
  concelho text,
  distrito text,
  observacoes text,
  ativo boolean not null default true
);
create index clientes_nif_idx on erp.clientes (nif);
create index clientes_telefone_idx on erp.clientes (telefone_e164);
create index clientes_email_idx on erp.clientes (lower(email));
create index clientes_nome_trgm_idx on erp.clientes using gin (nome extensions.gin_trgm_ops);

create table erp.clientes_duplicados_log (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  cliente_mantido uuid not null references erp.clientes(id),
  cliente_absorvido uuid not null references erp.clientes(id),
  regra text not null,
  score int not null,
  decisao text not null check (decisao in ('ignorado','unificado')),
  snapshot_absorvido jsonb not null
);

create table erp.regras_desconto (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  perfil erp.perfil not null unique,
  desconto_max_pct numeric(5,2) not null default 0 check (desconto_max_pct between 0 and 100),
  requer_aprovacao_acima_pct numeric(5,2) check (requer_aprovacao_acima_pct between 0 and 100),
  pode_alterar_preco boolean not null default false,
  pode_alterar_entrega boolean not null default false
);

-- ============================================================ helpers de permissao
create or replace function erp.pode_editar_catalogo()
returns boolean language sql stable security definer set search_path = erp, public as $$
  select exists (
    select 1 from erp.utilizadores u
    where u.user_id = auth.uid() and u.ativo and u.eliminado_em is null
      and u.perfil in ('adm','compras')
  )
$$;

create or replace function erp.pode_editar_clientes()
returns boolean language sql stable security definer set search_path = erp, public as $$
  select exists (
    select 1 from erp.utilizadores u
    where u.user_id = auth.uid() and u.ativo and u.eliminado_em is null
      and u.perfil in ('adm','vendedora','escritorio')
  )
$$;

-- ============================================================ NIF
create or replace function erp.nif_valido(nif text)
returns boolean language plpgsql immutable set search_path = erp, public as $$
declare soma int := 0; resto int; ctrl int; p1 text; p2 text; i int;
begin
  if nif is null or nif !~ '^[0-9]{9}$' then
    return false;
  end if;
  if nif = '999999990' then
    return true;
  end if;
  p1 := substr(nif, 1, 1);
  p2 := substr(nif, 1, 2);
  if p1 not in ('1','2','3','5','6','8','9')
     and p2 not in ('45','70','71','72','74','75','77','78','79','90','91','98','99') then
    return false;
  end if;
  for i in 1..8 loop
    soma := soma + substr(nif, i, 1)::int * (10 - i);
  end loop;
  resto := soma % 11;
  if resto < 2 then ctrl := 0; else ctrl := 11 - resto; end if;
  return ctrl = substr(nif, 9, 1)::int;
end $$;

-- ============================================================ normalizacao
create or replace function erp.normalizar_telefone(valor text, pais text default 'PT')
returns text language plpgsql immutable set search_path = erp, public as $$
declare d text;
begin
  if valor is null then return null; end if;
  d := regexp_replace(valor, '[^0-9+]', '', 'g');
  if d = '' then return null; end if;
  if left(d, 2) = '00' then d := '+' || substr(d, 3); end if;
  if left(d, 1) = '+' then return d; end if;
  if pais = 'PT' and length(d) = 9 then return '+351' || d; end if;
  if pais = 'PT' and length(d) = 12 and left(d, 3) = '351' then return '+' || d; end if;
  return '+' || d;
end $$;

create or replace function erp.normalizar_nome(valor text)
returns text language sql immutable set search_path = erp, public as $$
  select nullif(regexp_replace(lower(trim(coalesce(valor, ''))), '\s+', ' ', 'g'), '')
$$;

create or replace function erp.normalizar_email(valor text)
returns text language sql immutable set search_path = erp, public as $$
  select nullif(lower(regexp_replace(coalesce(valor, ''), '\s', '', 'g')), '')
$$;

-- ============================================================ triggers de negocio
create or replace function erp.tg_clientes_normalizar()
returns trigger language plpgsql security definer set search_path = erp, public as $$
begin
  NEW.nome := regexp_replace(trim(NEW.nome), '\s+', ' ', 'g');
  NEW.nif := nullif(regexp_replace(coalesce(NEW.nif, ''), '\s', '', 'g'), '');
  NEW.email := erp.normalizar_email(NEW.email);
  NEW.telefone_e164 := erp.normalizar_telefone(NEW.telefone_e164, NEW.pais);
  NEW.telefone_alt := erp.normalizar_telefone(NEW.telefone_alt, NEW.pais);
  if NEW.nif is null then
    NEW.nif_ok := null;
  elsif NEW.nif_estrangeiro then
    NEW.nif_ok := true;
  else
    NEW.nif_ok := erp.nif_valido(NEW.nif);
  end if;
  return NEW;
end $$;

create trigger tg_clientes_normalizar before insert or update on erp.clientes
  for each row execute function erp.tg_clientes_normalizar();

create or replace function erp.tg_produtos_validar()
returns trigger language plpgsql security definer set search_path = erp, public as $$
begin
  if NEW.vendavel and NEW.preco_base is null then
    raise exception 'Produto sem preço definido não pode ficar vendável (fica sob consulta).';
  end if;
  if TG_OP = 'UPDATE' and NEW.cod_barras is distinct from OLD.cod_barras and not erp.is_adm() then
    raise exception 'Só a Administração pode alterar o código de barras.';
  end if;
  return NEW;
end $$;

create trigger tg_produtos_validar before insert or update on erp.produtos
  for each row execute function erp.tg_produtos_validar();

create or replace function erp.tg_produtos_colis()
returns trigger language plpgsql security definer set search_path = erp, public as $$
begin
  insert into erp.produto_colis (produto_id, numero)
  select NEW.id, g from generate_series(1, NEW.n_colis) g
  on conflict (produto_id, numero) do nothing;
  delete from erp.produto_colis where produto_id = NEW.id and numero > NEW.n_colis;
  return null;
end $$;

create trigger tg_produtos_colis after insert or update of n_colis on erp.produtos
  for each row execute function erp.tg_produtos_colis();

-- ============================================================ duplicados
create or replace function erp.clientes_semelhantes(
  p_nome text default null,
  p_nif text default null,
  p_telefone text default null,
  p_email text default null,
  p_cp4 text default null,
  p_excluir uuid default null
)
returns table (
  id uuid,
  nome text,
  nif text,
  telefone_e164 text,
  email text,
  cp4 text,
  localidade text,
  regra text,
  score int
)
language sql stable security definer set search_path = erp, public, extensions as $$
  with parametros as (
    select
      erp.normalizar_nome(p_nome) as nome_n,
      nullif(regexp_replace(coalesce(p_nif, ''), '\s', '', 'g'), '') as nif_n,
      erp.normalizar_telefone(p_telefone, 'PT') as tel_n,
      erp.normalizar_email(p_email) as email_n,
      nullif(trim(coalesce(p_cp4, '')), '') as cp4_n
  ),
  candidatos as (
    select c.id, c.nome, c.nif, c.telefone_e164, c.email, c.cp4, c.localidade,
      case
        when p.nif_n is not null and c.nif = p.nif_n and p.nif_n <> '999999990' then 'nif'
        when p.tel_n is not null and c.telefone_e164 = p.tel_n then 'telefone'
        when p.email_n is not null and lower(c.email) = p.email_n then 'email'
        when p.nome_n is not null and p.cp4_n is not null and c.cp4 = p.cp4_n
             and extensions.similarity(erp.normalizar_nome(c.nome), p.nome_n) >= 0.75 then 'nome_cp4'
        when p.nome_n is not null
             and extensions.similarity(erp.normalizar_nome(c.nome), p.nome_n) >= 0.85 then 'nome'
        else null
      end as regra
    from erp.clientes c, parametros p
    where c.eliminado_em is null
      and (p_excluir is null or c.id <> p_excluir)
  )
  select id, nome, nif, telefone_e164, email, cp4, localidade, regra,
    case regra
      when 'nif' then 100
      when 'telefone' then 90
      when 'email' then 85
      when 'nome_cp4' then 70
      when 'nome' then 50
    end as score
  from candidatos
  where regra is not null
  order by score desc, nome
  limit 20
$$;

create or replace function erp.unificar_clientes(
  p_manter uuid,
  p_absorver uuid,
  p_regra text default 'manual',
  p_score int default 0,
  p_motivo text default 'Cliente duplicado unificado'
)
returns void language plpgsql security definer set search_path = erp, public as $$
declare
  v_snapshot jsonb;
  r record;
begin
  if not erp.is_adm() then
    raise exception 'Só a Administração pode unificar clientes.';
  end if;
  if p_manter = p_absorver then
    raise exception 'Escolha dois clientes diferentes.';
  end if;
  select to_jsonb(c) into v_snapshot from erp.clientes c where c.id = p_absorver;
  if v_snapshot is null then
    raise exception 'Cliente a absorver não encontrado.';
  end if;

  for r in
    select con.conrelid::regclass::text as tabela, att.attname as coluna
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'erp.clientes'::regclass
      and con.conrelid <> 'erp.clientes_duplicados_log'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', r.tabela, r.coluna, r.coluna)
      using p_manter, p_absorver;
  end loop;

  insert into erp.clientes_duplicados_log
    (cliente_mantido, cliente_absorvido, regra, score, decisao, snapshot_absorvido)
  values (p_manter, p_absorver, p_regra, p_score, 'unificado', v_snapshot);

  update erp.clientes
     set eliminado_em = now(), motivo_eliminacao = p_motivo, ativo = false
   where id = p_absorver;
end $$;

-- ============================================================ auditoria, views, RLS
do $$
declare t text;
begin
  foreach t in array array['fornecedores','categorias','familias','produtos','produto_colis',
                           'servicos','clientes','clientes_duplicados_log','regras_desconto'] loop
    execute format('create trigger tg_campos_auditoria before insert or update on erp.%I for each row execute function erp.tg_campos_auditoria()', t);
    execute format('create trigger tg_auditoria after insert or update on erp.%I for each row execute function erp.tg_auditoria()', t);
    execute format('create view erp.v_%s with (security_invoker = true) as select * from erp.%I where eliminado_em is null', t, t);
    execute format('alter table erp.%I enable row level security', t);
  end loop;
end $$;

-- ============================================================ grants
grant select, insert, update on erp.fornecedores, erp.categorias, erp.familias, erp.produtos,
  erp.produto_colis, erp.servicos, erp.clientes, erp.clientes_duplicados_log, erp.regras_desconto
  to authenticated;
grant select on erp.v_fornecedores, erp.v_categorias, erp.v_familias, erp.v_produtos,
  erp.v_produto_colis, erp.v_servicos, erp.v_clientes, erp.v_clientes_duplicados_log,
  erp.v_regras_desconto to authenticated;
grant all on erp.fornecedores, erp.categorias, erp.familias, erp.produtos, erp.produto_colis,
  erp.servicos, erp.clientes, erp.clientes_duplicados_log, erp.regras_desconto to service_role;
grant all on erp.v_fornecedores, erp.v_categorias, erp.v_familias, erp.v_produtos,
  erp.v_produto_colis, erp.v_servicos, erp.v_clientes, erp.v_clientes_duplicados_log,
  erp.v_regras_desconto to service_role;
grant execute on function erp.pode_editar_catalogo() to authenticated;
grant execute on function erp.pode_editar_clientes() to authenticated;
grant execute on function erp.nif_valido(text) to authenticated, anon;
grant execute on function erp.normalizar_telefone(text, text) to authenticated;
grant execute on function erp.normalizar_nome(text) to authenticated;
grant execute on function erp.normalizar_email(text) to authenticated;
grant execute on function erp.clientes_semelhantes(text, text, text, text, text, uuid) to authenticated;
grant execute on function erp.unificar_clientes(uuid, uuid, text, int, text) to authenticated;

-- ============================================================ politicas
do $$
declare t text;
begin
  foreach t in array array['fornecedores','categorias','familias','produtos','produto_colis','servicos'] loop
    execute format('create policy %I on erp.%I for select to authenticated using (erp.is_ativo())', t || '_select', t);
    execute format('create policy %I on erp.%I for insert to authenticated with check (erp.pode_editar_catalogo())', t || '_insert', t);
    execute format('create policy %I on erp.%I for update to authenticated using (erp.pode_editar_catalogo()) with check (erp.pode_editar_catalogo())', t || '_update', t);
  end loop;
end $$;

create policy clientes_select on erp.clientes for select to authenticated
  using (erp.is_ativo());
create policy clientes_insert on erp.clientes for insert to authenticated
  with check (erp.pode_editar_clientes());
create policy clientes_update on erp.clientes for update to authenticated
  using (erp.pode_editar_clientes()) with check (erp.pode_editar_clientes());

create policy dupl_select on erp.clientes_duplicados_log for select to authenticated
  using (erp.is_adm());
create policy dupl_insert on erp.clientes_duplicados_log for insert to authenticated
  with check (erp.is_adm());
create policy dupl_update on erp.clientes_duplicados_log for update to authenticated
  using (erp.is_adm()) with check (erp.is_adm());

create policy regras_desconto_select on erp.regras_desconto for select to authenticated
  using (erp.is_ativo());
create policy regras_desconto_insert on erp.regras_desconto for insert to authenticated
  with check (erp.is_adm());
create policy regras_desconto_update on erp.regras_desconto for update to authenticated
  using (erp.is_adm()) with check (erp.is_adm());

-- ============================================================ dados iniciais
insert into erp.categorias (codigo, nome, ordem) values
  ('CAM', 'Camas', 10),
  ('SOF', 'Sofás', 20),
  ('CO', 'Cortinas', 30),
  ('MOV', 'Móveis', 40);

insert into erp.familias (categoria_id, codigo, nome_interno, nome_cliente)
select c.id, f.codigo, f.nome_interno, f.nome_cliente
from erp.categorias c
join (values
  ('CAM', 'COX', 'Coxim', 'Almofadada'),
  ('CAM', 'ALO', 'Alongada', 'Cabeceira Alta'),
  ('CAM', 'SOM', 'Sommier', 'Baú'),
  ('SOF', 'FIX', 'Fixo', 'Sofá Fixo'),
  ('SOF', 'CHA', 'Chaise', 'Sofá com Chaise'),
  ('CO', 'PAI', 'Painel', 'Cortina de Painel'),
  ('MOV', 'REV', 'Revenda', 'Móveis')
) as f(cat, codigo, nome_interno, nome_cliente) on f.cat = c.codigo;

insert into erp.servicos (codigo, nome, tipo, preco_base, permite_desconto) values
  ('MONT', 'Montagem', 'montagem', 0, false),
  ('ENTR', 'Entrega', 'entrega', 0, false),
  ('TRESP', 'Transporte especial', 'transporte', 0, true),
  ('SUBSE', 'Subida sem elevador', 'outro', 0, true);

insert into erp.regras_desconto (perfil, desconto_max_pct, requer_aprovacao_acima_pct, pode_alterar_preco, pode_alterar_entrega) values
  ('vendedora', 5, 5, false, false),
  ('escritorio', 10, 10, false, true),
  ('financeiro', 0, 0, false, false),
  ('compras', 0, 0, false, false),
  ('adm', 100, null, true, true);

notify pgrst, 'reload schema';