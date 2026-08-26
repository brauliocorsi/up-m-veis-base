create schema if not exists erp;

grant usage on schema erp to authenticated, anon, service_role;

create type erp.perfil as enum ('vendedora','escritorio','compras','financeiro','adm');

-- ---------------------------------------------------------------- auditoria
create table erp.eventos (
  id bigserial primary key,
  tabela text not null,
  registo_id uuid not null,
  operacao text not null check (operacao in ('INSERT','UPDATE','ELIMINACAO','RESTAURO')),
  alteracoes jsonb,
  utilizador_id uuid,
  utilizador_nome text,
  ocorrido_em timestamptz not null default now()
);
create index eventos_tabela_registo_idx on erp.eventos (tabela, registo_id);
create index eventos_ocorrido_idx on erp.eventos (ocorrido_em desc);

-- ---------------------------------------------------------------- tabelas
create table erp.utilizadores (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  user_id uuid not null unique references auth.users(id) on delete restrict,
  nome text not null check (length(trim(nome)) >= 3),
  email text not null,
  telefone text,
  perfil erp.perfil not null default 'vendedora',
  ativo boolean not null default true
);

create table erp.formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  codigo text not null unique,
  nome text not null check (length(trim(nome)) > 0),
  momento text not null check (momento in ('loja','entrega','antecipado','financiador')),
  estado_inicial text not null check (estado_inicial in ('confirmado','pendente_confirmacao','pendente')),
  exige_comprovativo boolean not null default false,
  prazo_confirmacao_horas int check (prazo_confirmacao_horas > 0),
  taxa_pct numeric(5,2) not null default 0 check (taxa_pct >= 0 and taxa_pct <= 100),
  entra_caixa boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true
);

create table erp.zonas_entrega (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  nome text not null check (length(trim(nome)) > 0),
  cp_inicio char(4) not null check (cp_inicio ~ '^[0-9]{4}$'),
  cp_fim char(4) not null check (cp_fim ~ '^[0-9]{4}$'),
  valor_base numeric(12,2) not null default 0 check (valor_base >= 0),
  valor_por_m3 numeric(12,2) not null default 0 check (valor_por_m3 >= 0),
  valor_min numeric(12,2) not null default 0 check (valor_min >= 0),
  gratis_acima numeric(12,2) check (gratis_acima is null or gratis_acima >= 0),
  dias_rota int[] not null default '{2,3,4,5,6}',
  ativo boolean not null default true,
  check (cp_fim >= cp_inicio)
);

create table erp.calendario (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  data date not null unique,
  tipo text not null check (tipo in ('feriado','paragem_fabrica','fim_semana_excecional')),
  descricao text not null check (length(trim(descricao)) > 0)
);

create table erp.motivos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  contexto text not null check (contexto in ('cancelamento','alteracao_data','eliminacao','saida_caixa','desconto_excecional','reabertura')),
  descricao text not null check (length(trim(descricao)) > 0),
  exige_texto boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true
);

create table erp.definicoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  chave text not null unique,
  valor jsonb not null,
  descricao text
);

-- ---------------------------------------------------------------- sequencias
create sequence erp.seq_pedido start 1;
create sequence erp.seq_orcamento start 1;
create sequence erp.seq_ordem_compra start 1;
create sequence erp.seq_recibo start 1;

create or replace function erp.proximo_numero(tipo text)
returns text language plpgsql security definer set search_path = erp, public as $$
declare n bigint; pre text;
begin
  case tipo
    when 'pedido' then n := nextval('erp.seq_pedido'); pre := 'PED';
    when 'orcamento' then n := nextval('erp.seq_orcamento'); pre := 'ORC';
    when 'ordem_compra' then n := nextval('erp.seq_ordem_compra'); pre := 'OC';
    when 'recibo' then n := nextval('erp.seq_recibo'); pre := 'REC';
    else raise exception 'Tipo de documento desconhecido: %', tipo;
  end case;
  return pre || '-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function erp.perfil_atual()
returns erp.perfil language sql stable security definer set search_path = erp, public as $$
  select u.perfil from erp.utilizadores u
  where u.user_id = auth.uid() and u.ativo and u.eliminado_em is null limit 1
$$;

create or replace function erp.is_adm()
returns boolean language sql stable security definer set search_path = erp, public as $$
  select exists (
    select 1 from erp.utilizadores u
    where u.user_id = auth.uid() and u.perfil = 'adm' and u.ativo and u.eliminado_em is null
  )
$$;

create or replace function erp.is_ativo()
returns boolean language sql stable security definer set search_path = erp, public as $$
  select exists (
    select 1 from erp.utilizadores u
    where u.user_id = auth.uid() and u.ativo and u.eliminado_em is null
  )
$$;

-- ---------------------------------------------------------------- triggers
create or replace function erp.tg_campos_auditoria()
returns trigger language plpgsql security definer set search_path = erp, public as $$
begin
  if TG_OP = 'INSERT' then
    NEW.criado_em := now();
    NEW.criado_por := coalesce(auth.uid(), NEW.criado_por);
    NEW.atualizado_em := null;
    NEW.atualizado_por := null;
    NEW.eliminado_em := null;
    NEW.eliminado_por := null;
    NEW.motivo_eliminacao := null;
  else
    NEW.criado_em := OLD.criado_em;
    NEW.criado_por := OLD.criado_por;
    NEW.atualizado_em := now();
    NEW.atualizado_por := coalesce(auth.uid(), OLD.atualizado_por);
    if OLD.eliminado_em is null and NEW.eliminado_em is not null then
      NEW.eliminado_em := now();
      NEW.eliminado_por := coalesce(auth.uid(), NEW.eliminado_por);
    elsif NEW.eliminado_em is null then
      NEW.eliminado_por := null;
      NEW.motivo_eliminacao := null;
    else
      NEW.eliminado_em := OLD.eliminado_em;
      NEW.eliminado_por := OLD.eliminado_por;
    end if;
  end if;
  return NEW;
end $$;

create or replace function erp.tg_auditoria()
returns trigger language plpgsql security definer set search_path = erp, public as $$
declare
  v_alt jsonb := '{}'::jsonb;
  v_novo jsonb;
  v_velho jsonb;
  k text;
  v_op text;
  v_uid uuid := auth.uid();
  v_nome text;
begin
  select u.nome into v_nome from erp.utilizadores u where u.user_id = v_uid limit 1;
  v_novo := to_jsonb(NEW);

  if TG_OP = 'INSERT' then
    v_op := 'INSERT';
    v_alt := v_novo;
  else
    v_velho := to_jsonb(OLD);
    if OLD.eliminado_em is null and NEW.eliminado_em is not null then
      v_op := 'ELIMINACAO';
    elsif OLD.eliminado_em is not null and NEW.eliminado_em is null then
      v_op := 'RESTAURO';
    else
      v_op := 'UPDATE';
    end if;
    for k in select jsonb_object_keys(v_novo) loop
      if (v_novo -> k) is distinct from (v_velho -> k) then
        v_alt := v_alt || jsonb_build_object(k, jsonb_build_object('antes', v_velho -> k, 'depois', v_novo -> k));
      end if;
    end loop;
    if v_alt = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into erp.eventos (tabela, registo_id, operacao, alteracoes, utilizador_id, utilizador_nome)
  values (TG_TABLE_NAME, NEW.id, v_op, v_alt, v_uid, v_nome);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['utilizadores','formas_pagamento','zonas_entrega','calendario','motivos','definicoes'] loop
    execute format('create trigger tg_campos_auditoria before insert or update on erp.%I for each row execute function erp.tg_campos_auditoria()', t);
    execute format('create trigger tg_auditoria after insert or update on erp.%I for each row execute function erp.tg_auditoria()', t);
    execute format('create view erp.v_%s with (security_invoker = true) as select * from erp.%I where eliminado_em is null', t, t);
    execute format('alter table erp.%I enable row level security', t);
  end loop;
end $$;

alter table erp.eventos enable row level security;

-- ---------------------------------------------------------------- grants
grant select, insert, update on all tables in schema erp to authenticated;
grant select on all tables in schema erp to anon;
grant all on all tables in schema erp to service_role;
grant usage, select on all sequences in schema erp to authenticated, service_role;
revoke delete on all tables in schema erp from authenticated, anon;
revoke all on erp.eventos from authenticated, anon;
grant select on erp.eventos to authenticated;
grant execute on function erp.proximo_numero(text) to authenticated;
grant execute on function erp.perfil_atual() to authenticated;
grant execute on function erp.is_adm() to authenticated;
grant execute on function erp.is_ativo() to authenticated;

-- ---------------------------------------------------------------- politicas
create policy utilizadores_select on erp.utilizadores for select to authenticated
  using (erp.is_adm() or (user_id = auth.uid()));
create policy utilizadores_insert on erp.utilizadores for insert to authenticated
  with check (erp.is_adm());
create policy utilizadores_update on erp.utilizadores for update to authenticated
  using (erp.is_adm()) with check (erp.is_adm());

create policy eventos_select on erp.eventos for select to authenticated
  using (erp.is_adm());

do $$
declare t text;
begin
  foreach t in array array['formas_pagamento','zonas_entrega','calendario','motivos','definicoes'] loop
    execute format('create policy %I on erp.%I for select to authenticated using (erp.is_ativo())', t || '_select', t);
    execute format('create policy %I on erp.%I for insert to authenticated with check (erp.is_adm())', t || '_insert', t);
    execute format('create policy %I on erp.%I for update to authenticated using (erp.is_adm()) with check (erp.is_adm())', t || '_update', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- expor schema na API
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, erp';
notify pgrst, 'reload config';