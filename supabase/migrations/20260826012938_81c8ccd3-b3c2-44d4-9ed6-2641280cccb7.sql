-- ============================================================ auditoria para tabelas de id numerico
alter table erp.eventos alter column registo_id drop not null;
alter table erp.eventos add column if not exists registo_ref text;

create or replace function erp.tg_auditoria_ref()
returns trigger language plpgsql security definer set search_path = erp, public as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  select u.nome into v_nome from erp.utilizadores u where u.user_id = v_uid limit 1;
  insert into erp.eventos (tabela, registo_id, registo_ref, operacao, alteracoes, utilizador_id, utilizador_nome)
  values (TG_TABLE_NAME, null, NEW.id::text, 'INSERT', to_jsonb(NEW), v_uid, v_nome);
  return null;
end $$;

create or replace function erp.tg_bloquear_alteracao()
returns trigger language plpgsql as $$
begin
  raise exception 'O livro de movimentos de stock não pode ser alterado nem eliminado. Crie um movimento de correção com motivo.';
end $$;

-- ============================================================ tabelas
create type erp.tipo_movimento as enum
  ('entrada','saida','ajuste','quarentena_entrada','quarentena_saida','inventario_inicial');

create table erp.stock_movimentos (
  id bigserial primary key,
  produto_id uuid not null references erp.produtos(id),
  tipo erp.tipo_movimento not null,
  quantidade int not null check (quantidade <> 0),
  origem text not null check (origem in ('contagem','erp','manual')),
  ref_externa text,
  chave_idempotencia text not null unique,
  documento_tipo text,
  documento_id uuid,
  motivo text,
  ocorrido_em timestamptz not null default now(),
  registado_em timestamptz not null default now(),
  registado_por uuid references auth.users(id)
);
create index stock_movimentos_produto_idx on erp.stock_movimentos (produto_id, id);
create index stock_movimentos_ocorrido_idx on erp.stock_movimentos (ocorrido_em desc);
create index stock_movimentos_documento_idx on erp.stock_movimentos (documento_tipo, documento_id);

create table erp.reservas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  produto_id uuid not null references erp.produtos(id),
  quantidade int not null check (quantidade > 0),
  documento_tipo text not null,
  documento_id uuid not null,
  linha_id uuid,
  estado text not null default 'ativa'
    check (estado in ('ativa','consumida','libertada','expirada')),
  expira_em timestamptz,
  consumida_em timestamptz,
  libertada_em timestamptz,
  motivo_libertacao text
);
create index reservas_produto_ativa_idx on erp.reservas (produto_id) where estado = 'ativa';
create index reservas_documento_idx on erp.reservas (documento_tipo, documento_id);

create table erp.stock_atual (
  produto_id uuid primary key references erp.produtos(id),
  fisico int not null default 0 check (fisico >= 0),
  quarentena int not null default 0 check (quarentena >= 0),
  reservado int not null default 0 check (reservado >= 0),
  em_transito_compra int not null default 0 check (em_transito_compra >= 0),
  margem_seguranca int not null default 0 check (margem_seguranca >= 0),
  vendavel int generated always as
    (fisico - quarentena - reservado - margem_seguranca) stored,
  atualizado_em timestamptz not null default now()
);

create table erp.sync_estado (
  fonte text primary key,
  cursor text,
  ultima_sync_ok timestamptz,
  ultima_tentativa timestamptz,
  estado text not null default 'ok' check (estado in ('ok','atrasado','erro')),
  erro text,
  movimentos_processados bigint not null default 0,
  inventario_inicial_em timestamptz
);

create table erp.sync_pendentes (
  id bigserial primary key,
  payload jsonb not null,
  erro text,
  tentativas int not null default 0,
  resolvido_em timestamptz,
  criado_em timestamptz not null default now()
);

create table erp.reconciliacoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  executada_em timestamptz not null default now(),
  total_produtos int not null,
  divergencias int not null,
  estado text not null check (estado in ('limpa','com_divergencias','resolvida'))
);

create table erp.reconciliacao_divergencias (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text,
  reconciliacao_id uuid not null references erp.reconciliacoes(id),
  produto_id uuid not null references erp.produtos(id),
  fisico_erp int not null,
  fisico_contagem int not null,
  diferenca int not null,
  estado text not null default 'aberta'
    check (estado in ('aberta','regularizada','ignorada')),
  movimento_regularizacao bigint references erp.stock_movimentos(id),
  resolvido_por uuid references auth.users(id),
  resolvido_em timestamptz,
  nota text
);
create index recon_div_reconciliacao_idx on erp.reconciliacao_divergencias (reconciliacao_id);

insert into erp.sync_estado (fonte, estado) values ('contagem', 'ok');

-- ============================================================ triggers de stock
create or replace function erp.tg_stock_movimento_aplicar()
returns trigger language plpgsql security definer set search_path = erp, public as $$
begin
  insert into erp.stock_atual (produto_id) values (NEW.produto_id)
  on conflict (produto_id) do nothing;

  if NEW.tipo in ('quarentena_entrada','quarentena_saida') then
    update erp.stock_atual
       set quarentena = quarentena + NEW.quantidade,
           atualizado_em = now()
     where produto_id = NEW.produto_id;
  else
    update erp.stock_atual
       set fisico = fisico + NEW.quantidade,
           atualizado_em = now()
     where produto_id = NEW.produto_id;
  end if;
  return null;
end $$;

create trigger tg_aplicar after insert on erp.stock_movimentos
  for each row execute function erp.tg_stock_movimento_aplicar();
create trigger tg_imutavel before update or delete on erp.stock_movimentos
  for each row execute function erp.tg_bloquear_alteracao();
create trigger tg_auditoria after insert on erp.stock_movimentos
  for each row execute function erp.tg_auditoria_ref();

create or replace function erp.tg_reservas_recalcular()
returns trigger language plpgsql security definer set search_path = erp, public as $$
declare
  v_produto uuid := coalesce(NEW.produto_id, OLD.produto_id);
begin
  insert into erp.stock_atual (produto_id) values (v_produto)
  on conflict (produto_id) do nothing;

  update erp.stock_atual s
     set reservado = coalesce((
           select sum(r.quantidade) from erp.reservas r
            where r.produto_id = v_produto and r.estado = 'ativa' and r.eliminado_em is null
         ), 0),
         atualizado_em = now()
   where s.produto_id = v_produto;
  return null;
end $$;

create trigger tg_recalcular after insert or update or delete on erp.reservas
  for each row execute function erp.tg_reservas_recalcular();

-- ============================================================ motor de reservas
create or replace function erp.reservar(
  p_produto_id uuid,
  p_quantidade int,
  p_documento_tipo text,
  p_documento_id uuid,
  p_linha_id uuid default null,
  p_expira_em timestamptz default null
) returns uuid
language plpgsql security definer set search_path = erp, public as $$
declare
  v_vendavel int;
  v_nome text;
  v_id uuid;
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade a reservar tem de ser pelo menos 1.';
  end if;

  select nome_cliente into v_nome from erp.produtos where id = p_produto_id;
  if v_nome is null then
    raise exception 'Produto não encontrado.';
  end if;

  insert into erp.stock_atual (produto_id) values (p_produto_id)
  on conflict (produto_id) do nothing;

  select vendavel into v_vendavel
    from erp.stock_atual
   where produto_id = p_produto_id
     for update;

  if v_vendavel < p_quantidade then
    if v_vendavel <= 0 then
      raise exception 'Não há unidades disponíveis de %.', v_nome;
    elsif v_vendavel = 1 then
      raise exception 'Só há 1 unidade disponível de %.', v_nome;
    else
      raise exception 'Só há % unidades disponíveis de %.', v_vendavel, v_nome;
    end if;
  end if;

  insert into erp.reservas (produto_id, quantidade, documento_tipo, documento_id, linha_id, expira_em)
  values (p_produto_id, p_quantidade, p_documento_tipo, p_documento_id, p_linha_id, p_expira_em)
  returning id into v_id;

  return v_id;
end $$;

create or replace function erp.libertar_reserva(p_reserva_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = erp, public as $$
declare v_estado text;
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;

  select estado into v_estado from erp.reservas where id = p_reserva_id for update;
  if v_estado is null then
    raise exception 'Reserva não encontrada.';
  end if;
  if v_estado <> 'ativa' then
    raise exception 'Esta reserva já não está ativa.';
  end if;

  update erp.reservas
     set estado = 'libertada', libertada_em = now(), motivo_libertacao = p_motivo
   where id = p_reserva_id;
end $$;

create or replace function erp.consumir_reserva(p_reserva_id uuid)
returns bigint language plpgsql security definer set search_path = erp, public as $$
declare
  r record;
  v_mov bigint;
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;

  select * into r from erp.reservas where id = p_reserva_id for update;
  if r.id is null then
    raise exception 'Reserva não encontrada.';
  end if;
  if r.estado <> 'ativa' then
    raise exception 'Esta reserva já não está ativa.';
  end if;

  update erp.reservas
     set estado = 'consumida', consumida_em = now()
   where id = p_reserva_id;

  insert into erp.stock_movimentos
    (produto_id, tipo, quantidade, origem, chave_idempotencia,
     documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
  values
    (r.produto_id, 'saida', -r.quantidade, 'erp',
     r.documento_tipo || ':' || r.documento_id || ':saida:' || r.id,
     r.documento_tipo, r.documento_id, 'Entrega da reserva', now(), auth.uid())
  on conflict (chave_idempotencia) do nothing
  returning id into v_mov;

  return v_mov;
end $$;

create or replace function erp.expirar_reservas()
returns int language plpgsql security definer set search_path = erp, public as $$
declare v_n int;
begin
  with expiradas as (
    update erp.reservas
       set estado = 'expirada', libertada_em = now(),
           motivo_libertacao = 'Reserva expirada automaticamente'
     where estado = 'ativa'
       and expira_em is not null
       and expira_em < now()
    returning 1
  )
  select count(*) into v_n from expiradas;
  return v_n;
end $$;

create or replace function erp.ajuste_manual(
  p_produto_id uuid,
  p_quantidade int,
  p_motivo text,
  p_tipo erp.tipo_movimento default 'ajuste'
) returns bigint
language plpgsql security definer set search_path = erp, public as $$
declare v_id bigint;
begin
  if not erp.is_adm() then
    raise exception 'Só a Administração pode fazer ajustes manuais de stock.';
  end if;
  if p_quantidade is null or p_quantidade = 0 then
    raise exception 'Indique uma quantidade diferente de zero.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'O motivo do ajuste é obrigatório.';
  end if;

  insert into erp.stock_movimentos
    (produto_id, tipo, quantidade, origem, chave_idempotencia, motivo, ocorrido_em, registado_por)
  values
    (p_produto_id, p_tipo, p_quantidade, 'manual',
     'manual:' || gen_random_uuid()::text, trim(p_motivo), now(), auth.uid())
  returning id into v_id;

  return v_id;
end $$;

-- ============================================================ sincronizacao
create or replace function erp.registar_movimentos_contagem(p_movimentos jsonb)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare
  m jsonb;
  v_produto uuid;
  v_id bigint;
  v_processados int := 0;
  v_ignorados int := 0;
  v_ultimo text := null;
  v_desconhecidos text[] := '{}';
  v_tipo erp.tipo_movimento;
  v_qtd int;
begin
  if not (erp.is_adm() or auth.role() = 'service_role') then
    raise exception 'Só a Administração pode registar movimentos do Contagem.';
  end if;

  for m in select value from jsonb_array_elements(coalesce(p_movimentos, '[]'::jsonb)) as t(value)
           order by (value ->> 'id')::bigint
  loop
    select id into v_produto from erp.produtos
     where cod_barras = (m ->> 'produto_codigo') and eliminado_em is null;

    if v_produto is null then
      v_desconhecidos := v_desconhecidos || (m ->> 'produto_codigo');
      v_ultimo := m ->> 'id';
      continue;
    end if;

    v_tipo := (m ->> 'tipo')::erp.tipo_movimento;
    v_qtd := (m ->> 'quantidade')::int;
    if v_qtd = 0 then
      v_ultimo := m ->> 'id';
      continue;
    end if;

    insert into erp.stock_movimentos
      (produto_id, tipo, quantidade, origem, ref_externa, chave_idempotencia,
       motivo, ocorrido_em)
    values
      (v_produto, v_tipo, v_qtd, 'contagem', m ->> 'id', 'contagem:' || (m ->> 'id'),
       m ->> 'referencia', coalesce((m ->> 'ocorrido_em')::timestamptz, now()))
    on conflict (chave_idempotencia) do nothing
    returning id into v_id;

    if v_id is null then
      v_ignorados := v_ignorados + 1;
    else
      v_processados := v_processados + 1;
    end if;
    v_ultimo := m ->> 'id';
  end loop;

  if v_ultimo is not null then
    update erp.sync_estado
       set cursor = v_ultimo,
           ultima_sync_ok = now(),
           ultima_tentativa = now(),
           estado = 'ok',
           erro = null,
           movimentos_processados = movimentos_processados + v_processados
     where fonte = 'contagem';
  else
    update erp.sync_estado
       set ultima_sync_ok = now(), ultima_tentativa = now(), estado = 'ok', erro = null
     where fonte = 'contagem';
  end if;

  return jsonb_build_object(
    'processados', v_processados,
    'ignorados', v_ignorados,
    'cursor', v_ultimo,
    'desconhecidos', to_jsonb(v_desconhecidos)
  );
end $$;

create or replace function erp.registar_falha_sync(p_erro text, p_payload jsonb default null)
returns void language plpgsql security definer set search_path = erp, public as $$
begin
  if not (erp.is_adm() or auth.role() = 'service_role') then
    raise exception 'Sem permissão para registar falhas de sincronização.';
  end if;

  update erp.sync_estado
     set ultima_tentativa = now(), estado = 'erro', erro = p_erro
   where fonte = 'contagem';

  if p_payload is not null then
    insert into erp.sync_pendentes (payload, erro, tentativas) values (p_payload, p_erro, 1);
  end if;
end $$;

create or replace function erp.avaliar_saude_sync()
returns void language plpgsql security definer set search_path = erp, public as $$
begin
  update erp.sync_estado
     set estado = case
           when ultima_sync_ok is null then 'erro'
           when ultima_sync_ok < now() - interval '1 hour' then 'erro'
           when ultima_sync_ok < now() - interval '15 minutes' then 'atrasado'
           else estado
         end
   where fonte = 'contagem' and estado <> 'erro';
end $$;

create or replace function erp.aplicar_inventario_inicial(
  p_linhas jsonb,
  p_cursor text,
  p_confirmacao text default null
) returns jsonb
language plpgsql security definer set search_path = erp, public as $$
declare
  l jsonb;
  v_produto uuid;
  v_ja timestamptz;
  v_n int := 0;
  v_desconhecidos text[] := '{}';
begin
  if not erp.is_adm() then
    raise exception 'Só a Administração pode arrancar o inventário inicial.';
  end if;

  select inventario_inicial_em into v_ja from erp.sync_estado where fonte = 'contagem';
  if v_ja is not null and coalesce(upper(trim(p_confirmacao)), '') <> 'REPETIR INVENTARIO' then
    raise exception 'O inventário inicial já foi feito em %. Para repetir, escreva REPETIR INVENTARIO na confirmação.', to_char(v_ja, 'DD/MM/YYYY HH24:MI');
  end if;

  for l in select value from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) as t(value) loop
    select id into v_produto from erp.produtos
     where cod_barras = (l ->> 'produto_codigo') and eliminado_em is null;

    if v_produto is null then
      v_desconhecidos := v_desconhecidos || (l ->> 'produto_codigo');
      continue;
    end if;

    if coalesce((l ->> 'fisico')::int, 0) <> 0 then
      insert into erp.stock_movimentos
        (produto_id, tipo, quantidade, origem, chave_idempotencia, motivo, ocorrido_em, registado_por)
      values
        (v_produto, 'inventario_inicial', (l ->> 'fisico')::int, 'contagem',
         'inventario:' || v_produto::text || ':' || coalesce(p_cursor, 'inicial'),
         'Inventário inicial do Contagem', now(), auth.uid())
      on conflict (chave_idempotencia) do nothing;
    end if;

    if coalesce((l ->> 'quarentena')::int, 0) <> 0 then
      insert into erp.stock_movimentos
        (produto_id, tipo, quantidade, origem, chave_idempotencia, motivo, ocorrido_em, registado_por)
      values
        (v_produto, 'quarentena_entrada', (l ->> 'quarentena')::int, 'contagem',
         'inventario_quar:' || v_produto::text || ':' || coalesce(p_cursor, 'inicial'),
         'Quarentena no inventário inicial', now(), auth.uid())
      on conflict (chave_idempotencia) do nothing;
    end if;

    v_n := v_n + 1;
  end loop;

  update erp.sync_estado
     set cursor = coalesce(p_cursor, cursor),
         inventario_inicial_em = now(),
         ultima_sync_ok = now(),
         ultima_tentativa = now(),
         estado = 'ok',
         erro = null
   where fonte = 'contagem';

  return jsonb_build_object('produtos', v_n, 'desconhecidos', to_jsonb(v_desconhecidos));
end $$;

-- ============================================================ reconciliacao
create or replace function erp.registar_reconciliacao(p_linhas jsonb)
returns uuid language plpgsql security definer set search_path = erp, public as $$
declare
  l jsonb;
  v_id uuid;
  v_produto uuid;
  v_fisico_erp int;
  v_fisico_ct int;
  v_total int := 0;
  v_div int := 0;
begin
  if not (erp.is_adm() or auth.role() = 'service_role') then
    raise exception 'Só a Administração pode correr a reconciliação.';
  end if;

  insert into erp.reconciliacoes (total_produtos, divergencias, estado)
  values (0, 0, 'limpa') returning id into v_id;

  for l in select value from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) as t(value) loop
    select id into v_produto from erp.produtos
     where cod_barras = (l ->> 'produto_codigo') and eliminado_em is null;
    continue when v_produto is null;

    v_total := v_total + 1;
    v_fisico_ct := coalesce((l ->> 'fisico')::int, 0);
    select coalesce(fisico, 0) into v_fisico_erp from erp.stock_atual where produto_id = v_produto;
    v_fisico_erp := coalesce(v_fisico_erp, 0);

    if v_fisico_erp <> v_fisico_ct then
      v_div := v_div + 1;
      insert into erp.reconciliacao_divergencias
        (reconciliacao_id, produto_id, fisico_erp, fisico_contagem, diferenca)
      values (v_id, v_produto, v_fisico_erp, v_fisico_ct, v_fisico_ct - v_fisico_erp);
    end if;
  end loop;

  update erp.reconciliacoes
     set total_produtos = v_total,
         divergencias = v_div,
         estado = case when v_div = 0 then 'limpa' else 'com_divergencias' end
   where id = v_id;

  return v_id;
end $$;

create or replace function erp.resolver_divergencia(
  p_divergencia_id uuid,
  p_acao text,
  p_nota text default null
) returns void
language plpgsql security definer set search_path = erp, public as $$
declare
  d record;
  v_mov bigint;
begin
  if not erp.is_adm() then
    raise exception 'Só a Administração pode resolver divergências.';
  end if;
  if p_acao not in ('regularizar','ignorar') then
    raise exception 'Ação inválida.';
  end if;

  select * into d from erp.reconciliacao_divergencias where id = p_divergencia_id for update;
  if d.id is null then
    raise exception 'Divergência não encontrada.';
  end if;
  if d.estado <> 'aberta' then
    raise exception 'Esta divergência já foi resolvida.';
  end if;
  if p_acao = 'ignorar' and coalesce(length(trim(p_nota)), 0) < 3 then
    raise exception 'Para ignorar uma divergência é obrigatório escrever uma nota.';
  end if;

  if p_acao = 'regularizar' then
    insert into erp.stock_movimentos
      (produto_id, tipo, quantidade, origem, chave_idempotencia, motivo, ocorrido_em, registado_por)
    values
      (d.produto_id, 'ajuste', d.diferenca, 'erp',
       'reconciliacao:' || d.id::text,
       coalesce(nullif(trim(p_nota), ''), 'Regularização por reconciliação com o Contagem'),
       now(), auth.uid())
    returning id into v_mov;
  end if;

  update erp.reconciliacao_divergencias
     set estado = case when p_acao = 'regularizar' then 'regularizada' else 'ignorada' end,
         movimento_regularizacao = v_mov,
         resolvido_por = auth.uid(),
         resolvido_em = now(),
         nota = nullif(trim(p_nota), '')
   where id = p_divergencia_id;

  update erp.reconciliacoes r
     set estado = 'resolvida'
   where r.id = d.reconciliacao_id
     and not exists (
       select 1 from erp.reconciliacao_divergencias x
        where x.reconciliacao_id = r.id and x.estado = 'aberta'
     );
end $$;

-- ============================================================ auditoria, views, RLS
do $$
declare t text;
begin
  foreach t in array array['reservas','reconciliacoes','reconciliacao_divergencias'] loop
    execute format('create trigger tg_campos_auditoria before insert or update on erp.%I for each row execute function erp.tg_campos_auditoria()', t);
    execute format('create trigger tg_auditoria after insert or update on erp.%I for each row execute function erp.tg_auditoria()', t);
    execute format('create view erp.v_%s with (security_invoker = true) as select * from erp.%I where eliminado_em is null', t, t);
    execute format('alter table erp.%I enable row level security', t);
  end loop;
end $$;

alter table erp.stock_movimentos enable row level security;
alter table erp.stock_atual enable row level security;
alter table erp.sync_estado enable row level security;
alter table erp.sync_pendentes enable row level security;

create view erp.v_stock_movimentos with (security_invoker = true) as
  select m.*, p.cod_barras, p.nome_cliente
    from erp.stock_movimentos m
    join erp.produtos p on p.id = m.produto_id;

create view erp.v_stock_atual with (security_invoker = true) as
  select s.*, (s.vendavel + s.em_transito_compra) as prometivel
    from erp.stock_atual s;

create view erp.v_stock with (security_invoker = true) as
  select p.id as produto_id,
         p.cod_barras,
         p.nome_cliente,
         p.categoria_id,
         p.ponto_reposicao,
         p.tipo_fornecimento,
         coalesce(s.fisico, 0) as fisico,
         coalesce(s.quarentena, 0) as quarentena,
         coalesce(s.reservado, 0) as reservado,
         coalesce(s.em_transito_compra, 0) as em_transito_compra,
         coalesce(s.margem_seguranca, 0) as margem_seguranca,
         coalesce(s.vendavel, 0) as vendavel,
         coalesce(s.vendavel, 0) + coalesce(s.em_transito_compra, 0) as prometivel,
         s.atualizado_em
    from erp.produtos p
    left join erp.stock_atual s on s.produto_id = p.id
   where p.eliminado_em is null;

create view erp.v_sync_estado with (security_invoker = true) as
  select e.*,
         case
           when e.estado = 'erro' then 'erro'
           when e.ultima_sync_ok is null then 'erro'
           when e.ultima_sync_ok < now() - interval '1 hour' then 'erro'
           when e.ultima_sync_ok < now() - interval '15 minutes' then 'atrasado'
           else 'ok'
         end as estado_calculado,
         extract(epoch from (now() - e.ultima_sync_ok))::bigint as segundos_desde_sync
    from erp.sync_estado e;

create view erp.v_sync_pendentes with (security_invoker = true) as
  select * from erp.sync_pendentes where resolvido_em is null;

create view erp.v_reservas_detalhe with (security_invoker = true) as
  select r.*, p.cod_barras, p.nome_cliente
    from erp.reservas r
    join erp.produtos p on p.id = r.produto_id
   where r.eliminado_em is null;

create view erp.v_reconciliacao_divergencias_detalhe with (security_invoker = true) as
  select d.*, p.cod_barras, p.nome_cliente
    from erp.reconciliacao_divergencias d
    join erp.produtos p on p.id = d.produto_id
   where d.eliminado_em is null;

-- ============================================================ grants
grant select on erp.stock_movimentos, erp.stock_atual, erp.reservas,
  erp.reconciliacoes, erp.reconciliacao_divergencias, erp.sync_estado, erp.sync_pendentes
  to authenticated;
grant select on erp.v_stock, erp.v_stock_atual, erp.v_stock_movimentos, erp.v_reservas,
  erp.v_reservas_detalhe, erp.v_reconciliacoes, erp.v_reconciliacao_divergencias,
  erp.v_reconciliacao_divergencias_detalhe, erp.v_sync_estado, erp.v_sync_pendentes
  to authenticated;
grant update on erp.sync_pendentes to authenticated;
grant all on erp.stock_movimentos, erp.stock_atual, erp.reservas, erp.reconciliacoes,
  erp.reconciliacao_divergencias, erp.sync_estado, erp.sync_pendentes to service_role;
grant usage, select on sequence erp.stock_movimentos_id_seq, erp.sync_pendentes_id_seq to service_role;
grant all on erp.v_stock, erp.v_stock_atual, erp.v_stock_movimentos, erp.v_reservas,
  erp.v_reservas_detalhe, erp.v_reconciliacoes, erp.v_reconciliacao_divergencias,
  erp.v_reconciliacao_divergencias_detalhe, erp.v_sync_estado, erp.v_sync_pendentes
  to service_role;

grant execute on function erp.reservar(uuid, int, text, uuid, uuid, timestamptz) to authenticated;
grant execute on function erp.libertar_reserva(uuid, text) to authenticated;
grant execute on function erp.consumir_reserva(uuid) to authenticated;
grant execute on function erp.expirar_reservas() to authenticated, service_role;
grant execute on function erp.ajuste_manual(uuid, int, text, erp.tipo_movimento) to authenticated;
grant execute on function erp.registar_movimentos_contagem(jsonb) to authenticated, service_role;
grant execute on function erp.registar_falha_sync(text, jsonb) to authenticated, service_role;
grant execute on function erp.avaliar_saude_sync() to authenticated, service_role;
grant execute on function erp.aplicar_inventario_inicial(jsonb, text, text) to authenticated;
grant execute on function erp.registar_reconciliacao(jsonb) to authenticated, service_role;
grant execute on function erp.resolver_divergencia(uuid, text, text) to authenticated;

-- ============================================================ politicas
create policy stock_movimentos_select on erp.stock_movimentos for select to authenticated
  using (erp.is_ativo());

create policy stock_atual_select on erp.stock_atual for select to authenticated
  using (erp.is_ativo());

create policy reservas_select on erp.reservas for select to authenticated
  using (erp.is_ativo());

create policy reconciliacoes_select on erp.reconciliacoes for select to authenticated
  using (erp.is_ativo());
create policy reconciliacoes_insert on erp.reconciliacoes for insert to authenticated
  with check (erp.is_adm());
create policy reconciliacoes_update on erp.reconciliacoes for update to authenticated
  using (erp.is_adm()) with check (erp.is_adm());

create policy recon_div_select on erp.reconciliacao_divergencias for select to authenticated
  using (erp.is_ativo());
create policy recon_div_update on erp.reconciliacao_divergencias for update to authenticated
  using (erp.is_adm()) with check (erp.is_adm());

create policy sync_estado_select on erp.sync_estado for select to authenticated
  using (erp.is_ativo());

create policy sync_pendentes_select on erp.sync_pendentes for select to authenticated
  using (erp.is_adm());
create policy sync_pendentes_update on erp.sync_pendentes for update to authenticated
  using (erp.is_adm()) with check (erp.is_adm());