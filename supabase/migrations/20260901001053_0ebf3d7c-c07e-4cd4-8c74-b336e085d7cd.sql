-- ============================================================
-- Fase 11 — Produção
-- ============================================================

create type erp.estado_op as enum ('planeada','em_curso','concluida','cancelada');

create sequence if not exists erp.seq_ordem_producao;

-- ---------- etapas de produção
create table erp.etapas_producao (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  codigo text not null unique,
  nome text not null,
  ordem int not null,
  permite_stock_intermedio boolean not null default false,
  exige_conferencia boolean not null default false,
  ativo boolean not null default true
);

grant select, insert, update on erp.etapas_producao to authenticated;
grant all on erp.etapas_producao to service_role;
alter table erp.etapas_producao enable row level security;
create policy etapas_prod_sel on erp.etapas_producao for select to authenticated using (erp.is_ativo());
create policy etapas_prod_ins on erp.etapas_producao for insert to authenticated
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));
create policy etapas_prod_upd on erp.etapas_producao for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']))
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));

-- ---------- ordens de produção
create table erp.ordens_producao (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  numero text not null unique,
  produto_id uuid not null references erp.produtos(id),
  quantidade int not null check (quantidade > 0),
  quantidade_produzida int not null default 0 check (quantidade_produzida >= 0),
  quantidade_refugo int not null default 0 check (quantidade_refugo >= 0),
  estado erp.estado_op not null default 'planeada',
  etapa_atual_id uuid references erp.etapas_producao(id),
  data_prevista date,
  data_inicio date,
  data_conclusao date,
  prioridade int not null default 5,
  observacoes text,
  check (quantidade_produzida <= quantidade)
);

create index idx_op_produto on erp.ordens_producao (produto_id);
create index idx_op_estado on erp.ordens_producao (estado);
create index idx_op_etapa_atual on erp.ordens_producao (etapa_atual_id);

grant select, insert, update on erp.ordens_producao to authenticated;
grant all on erp.ordens_producao to service_role;
alter table erp.ordens_producao enable row level security;
create policy op_sel on erp.ordens_producao for select to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao','financeiro']));
create policy op_ins on erp.ordens_producao for insert to authenticated
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));
create policy op_upd on erp.ordens_producao for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao']))
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao']));

-- ---------- necessidades de produção
create table erp.necessidades_producao (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_id uuid references erp.pedidos(id),
  item_id uuid references erp.pedido_itens(id),
  produto_id uuid not null references erp.produtos(id),
  quantidade int not null check (quantidade > 0),
  quantidade_reservada int not null default 0 check (quantidade_reservada >= 0),
  data_necessaria date,
  origem text not null default 'venda',
  estado text not null default 'aberta' check (estado in ('aberta','convertida','produzida','cancelada')),
  op_id uuid references erp.ordens_producao(id)
);

create index idx_necprod_produto on erp.necessidades_producao (produto_id);
create index idx_necprod_pedido on erp.necessidades_producao (pedido_id);
create index idx_necprod_item on erp.necessidades_producao (item_id);
create index idx_necprod_op on erp.necessidades_producao (op_id);
create index idx_necprod_estado on erp.necessidades_producao (estado);

grant select, insert, update on erp.necessidades_producao to authenticated;
grant all on erp.necessidades_producao to service_role;
alter table erp.necessidades_producao enable row level security;
create policy necprod_sel on erp.necessidades_producao for select to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao','financeiro']));
create policy necprod_ins on erp.necessidades_producao for insert to authenticated
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));
create policy necprod_upd on erp.necessidades_producao for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']))
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));

-- ---------- etapas de cada ordem
create table erp.op_etapas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  op_id uuid not null references erp.ordens_producao(id),
  etapa_id uuid not null references erp.etapas_producao(id),
  ordem int not null,
  estado text not null default 'pendente' check (estado in ('pendente','em_curso','concluida','bloqueada')),
  quantidade_ok int not null default 0 check (quantidade_ok >= 0),
  quantidade_refugo int not null default 0 check (quantidade_refugo >= 0),
  operador_id uuid references erp.utilizadores(id),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  conferida_por uuid references erp.utilizadores(id),
  conferida_em timestamptz,
  motivo_refugo text,
  observacoes text,
  unique (op_id, etapa_id)
);

create index idx_op_etapas_op on erp.op_etapas (op_id);
create index idx_op_etapas_etapa on erp.op_etapas (etapa_id);
create index idx_op_etapas_operador on erp.op_etapas (operador_id);
create index idx_op_etapas_conferida_por on erp.op_etapas (conferida_por);
create index idx_op_etapas_estado on erp.op_etapas (estado);

grant select, insert, update on erp.op_etapas to authenticated;
grant all on erp.op_etapas to service_role;
alter table erp.op_etapas enable row level security;
create policy op_etapas_sel on erp.op_etapas for select to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao','financeiro']));
create policy op_etapas_ins on erp.op_etapas for insert to authenticated
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));
create policy op_etapas_upd on erp.op_etapas for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao']))
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao']));

-- ---------- componentes (lista de materiais)
create table erp.componentes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  produto_id uuid not null references erp.produtos(id),
  componente_id uuid not null references erp.produtos(id),
  quantidade numeric(12,3) not null check (quantidade > 0),
  unidade text not null default 'un',
  etapa_id uuid references erp.etapas_producao(id),
  observacoes text,
  unique (produto_id, componente_id),
  check (produto_id <> componente_id)
);

create index idx_componentes_produto on erp.componentes (produto_id);
create index idx_componentes_componente on erp.componentes (componente_id);
create index idx_componentes_etapa on erp.componentes (etapa_id);

grant select, insert, update on erp.componentes to authenticated;
grant all on erp.componentes to service_role;
alter table erp.componentes enable row level security;
create policy componentes_sel on erp.componentes for select to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao','financeiro']));
create policy componentes_ins on erp.componentes for insert to authenticated
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));
create policy componentes_upd on erp.componentes for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']))
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));

-- ---------- consumos de material por etapa
create table erp.op_consumos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  op_id uuid not null references erp.ordens_producao(id),
  op_etapa_id uuid references erp.op_etapas(id),
  componente_id uuid not null references erp.produtos(id),
  quantidade_prevista int not null check (quantidade_prevista > 0),
  quantidade_consumida int not null default 0 check (quantidade_consumida >= 0),
  quantidade_falta int not null default 0 check (quantidade_falta >= 0),
  movimento_id bigint references erp.stock_movimentos(id),
  regularizado_em timestamptz,
  observacoes text
);

create index idx_op_consumos_op on erp.op_consumos (op_id);
create index idx_op_consumos_etapa on erp.op_consumos (op_etapa_id);
create index idx_op_consumos_componente on erp.op_consumos (componente_id);
create index idx_op_consumos_movimento on erp.op_consumos (movimento_id);

grant select, insert, update on erp.op_consumos to authenticated;
grant all on erp.op_consumos to service_role;
alter table erp.op_consumos enable row level security;
create policy op_consumos_sel on erp.op_consumos for select to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao','financeiro']));
create policy op_consumos_upd on erp.op_consumos for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']))
  with check (erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']));

-- ---------- auditoria e campos automáticos
do $$
declare t text;
begin
  foreach t in array array['etapas_producao','ordens_producao','necessidades_producao','op_etapas','componentes','op_consumos']
  loop
    execute format('create trigger tg_campos_auditoria before insert or update on erp.%I for each row execute function erp.tg_campos_auditoria()', t);
    execute format('create trigger tg_auditoria after insert or update on erp.%I for each row execute function erp.tg_auditoria()', t);
    execute format('revoke delete on erp.%I from authenticated, anon', t);
  end loop;
end $$;

-- ---------- numeração
create or replace function erp.proximo_numero(tipo text)
 returns text
 language plpgsql
 security definer
 set search_path to 'erp','public'
as $function$
declare n bigint; pre text;
begin
  case tipo
    when 'pedido' then n := nextval('erp.seq_pedido'); pre := 'PED';
    when 'orcamento' then n := nextval('erp.seq_orcamento'); pre := 'ORC';
    when 'ordem_compra' then n := nextval('erp.seq_ordem_compra'); pre := 'OC';
    when 'pedido_compra' then n := nextval('erp.seq_pedido_compra'); pre := 'PC';
    when 'recibo' then n := nextval('erp.seq_recibo'); pre := 'REC';
    when 'ordem_producao' then n := nextval('erp.seq_ordem_producao'); pre := 'OP';
    else raise exception 'Tipo de documento desconhecido: %', tipo;
  end case;
  return pre || '-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
end $function$;

-- ---------- origem de movimentos de stock passa a aceitar produção
alter table erp.stock_movimentos drop constraint stock_movimentos_origem_check;
alter table erp.stock_movimentos add constraint stock_movimentos_origem_check
  check (origem = any (array['contagem','erp','manual','compra','producao']));

-- ---------- etapas semeadas
insert into erp.etapas_producao (codigo, nome, ordem, permite_stock_intermedio, exige_conferencia) values
  ('CORTE','Corte',1,true,true),
  ('COSTURA','Costura',2,true,true),
  ('ESTRUTURA','Estrutura / casco',3,true,true),
  ('BRANCO','Branco (colagem de espuma)',4,true,false),
  ('ESTOFAGEM','Estofagem',5,false,false),
  ('QUALIDADE','Qualidade',6,false,true),
  ('EMBALAGEM','Embalagem e etiquetagem',7,false,false);

-- ---------- permissões auxiliares
create or replace function erp.pode_ver_producao() returns boolean
 language sql stable security definer set search_path to 'erp','public'
as $$ select erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao','financeiro']) $$;

create or replace function erp.pode_gerir_producao() returns boolean
 language sql stable security definer set search_path to 'erp','public'
as $$ select erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras']) $$;

create or replace function erp.pode_registar_producao() returns boolean
 language sql stable security definer set search_path to 'erp','public'
as $$ select erp.is_ativo() and erp.perfil_atual()::text = any (array['adm','escritorio','compras','producao']) $$;

-- ---------- proteção contra ciclos na lista de materiais
create or replace function erp.componente_gera_ciclo(p_produto_id uuid, p_componente_id uuid)
 returns boolean language plpgsql stable security definer set search_path to 'erp','public'
as $$
declare v boolean;
begin
  if p_produto_id = p_componente_id then return true; end if;
  with recursive descida as (
    select c.componente_id from erp.componentes c
     where c.produto_id = p_componente_id and c.eliminado_em is null
    union
    select c.componente_id from erp.componentes c
      join descida d on d.componente_id = c.produto_id
     where c.eliminado_em is null
  )
  select exists (select 1 from descida where componente_id = p_produto_id) into v;
  return coalesce(v, false);
end $$;

create or replace function erp.tg_componentes_ciclo() returns trigger
 language plpgsql security definer set search_path to 'erp','public'
as $$
begin
  if NEW.eliminado_em is null and erp.componente_gera_ciclo(NEW.produto_id, NEW.componente_id) then
    raise exception 'Este componente criaria um ciclo: o produto acabaria por ser componente de si próprio.';
  end if;
  return NEW;
end $$;

create trigger tg_ciclo before insert or update on erp.componentes
  for each row execute function erp.tg_componentes_ciclo();

-- ============================================================
-- confirmar_pedido: três ramos (stock / compra / produção)
-- ============================================================
create or replace function erp.confirmar_pedido(p_pedido_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'erp','public'
as $function$
declare
  ped erp.pedidos%rowtype;
  cli erp.clientes%rowtype;
  cup erp.cupoes%rowtype;
  it record;
  v_reserva uuid;
  v_numero text;
  v_usos integer;
  v_sep int;
begin
  select * into ped from erp.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if ped.estado <> 'orcamento' then raise exception 'Este pedido já foi confirmado.'; end if;

  perform erp.recalcular_pedido(p_pedido_id);
  select * into ped from erp.pedidos where id = p_pedido_id;
  perform set_config('erp.motor', '1', true);

  if not exists (select 1 from erp.pedido_itens where pedido_id = p_pedido_id and eliminado_em is null) then
    raise exception 'O pedido não tem linhas.';
  end if;

  select * into cli from erp.clientes where id = ped.cliente_id and eliminado_em is null;
  if cli.id is null then raise exception 'O cliente do pedido já não existe.'; end if;
  if coalesce(cli.telefone_e164, '') = '' then
    raise exception 'O cliente precisa de telefone para confirmar o pedido.';
  end if;
  if ped.entrega_domicilio and coalesce(ped.morada_entrega, '') = '' then
    raise exception 'Indique a morada de entrega.';
  end if;
  if ped.entrega_domicilio and ped.zona_entrega_id is null then
    raise exception 'O código postal indicado não pertence a nenhuma zona de entrega.';
  end if;
  if ped.data_entrega_prevista is null then
    raise exception 'Falta a data de entrega.';
  end if;

  if ped.cupao_id is not null then
    select * into cup from erp.cupoes where id = ped.cupao_id for update;
    if not cup.ativo or cup.eliminado_em is not null then
      raise exception 'O cupão "%" já não está ativo.', cup.codigo;
    end if;
    if current_date < cup.valido_de or (cup.valido_ate is not null and current_date > cup.valido_ate) then
      raise exception 'O cupão "%" está fora do prazo.', cup.codigo;
    end if;
    if cup.minimo_compra is not null and ped.subtotal < cup.minimo_compra then
      raise exception 'O cupão "%" exige uma compra mínima de % €.', cup.codigo, cup.minimo_compra;
    end if;
    if cup.usos_max is not null and cup.usos_atuais >= cup.usos_max then
      raise exception 'O cupão "%" já atingiu o limite de utilizações.', cup.codigo;
    end if;
    select count(*) into v_usos from erp.cupao_usos u
      where u.cupao_id = cup.id and u.cliente_id = ped.cliente_id and u.eliminado_em is null;
    if v_usos >= cup.usos_por_cliente then
      raise exception 'Este cliente já usou o cupão "%".', cup.codigo;
    end if;
  end if;

  select coalesce((select (valor #>> '{}')::int from erp.definicoes
                    where chave = 'dias_separacao' and eliminado_em is null), 0)
    into v_sep;

  -- fornecimento: stock reserva, compra gera necessidade de compra, produção gera necessidade de produção
  for it in
    select i.*, p.tipo_fornecimento as forn, p.nome_cliente, p.fornecedor_id
    from erp.pedido_itens i join erp.produtos p on p.id = i.produto_id
    where i.pedido_id = p_pedido_id and i.eliminado_em is null and i.produto_id is not null
    order by i.linha
  loop
    if it.forn = 'stock' then
      v_reserva := erp.reservar(it.produto_id, it.quantidade, 'pedido', p_pedido_id, it.id, null);
      update erp.pedido_itens set reserva_id = v_reserva, estado = 'reservado',
        data_prevista = ped.data_entrega_prevista where id = it.id;
    elsif it.forn = 'producao' then
      update erp.pedido_itens set estado = 'encomendado',
        data_prevista = ped.data_entrega_prevista where id = it.id;
      insert into erp.necessidades_producao (pedido_id, item_id, produto_id, quantidade, data_necessaria)
      values (p_pedido_id, it.id, it.produto_id, it.quantidade,
              ped.data_entrega_prevista - v_sep);
    else
      update erp.pedido_itens set estado = 'encomendado',
        data_prevista = ped.data_entrega_prevista where id = it.id;
      insert into erp.necessidades_compra (pedido_id, item_id, produto_id, fornecedor_id, quantidade)
      values (p_pedido_id, it.id, it.produto_id, it.fornecedor_id, it.quantidade);
    end if;
  end loop;

  update erp.pedido_itens set data_prevista = ped.data_entrega_prevista, estado = 'pendente'
  where pedido_id = p_pedido_id and eliminado_em is null and servico_id is not null;

  if ped.cupao_id is not null then
    insert into erp.cupao_usos (cupao_id, pedido_id, cliente_id, desconto)
    values (ped.cupao_id, p_pedido_id, ped.cliente_id, ped.desconto_cupao)
    on conflict (pedido_id, cupao_id) do nothing;
    update erp.cupoes set usos_atuais = usos_atuais + 1 where id = ped.cupao_id;
  end if;

  v_numero := erp.proximo_numero('pedido');
  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos set
    numero = v_numero, tipo = 'pedido', estado = 'confirmado',
    data_entrega_prometida = data_entrega_prevista,
    confirmado_em = now(), confirmado_por = auth.uid()
  where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  return jsonb_build_object('pedido_id', p_pedido_id, 'numero', v_numero);
end $function$;