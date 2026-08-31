-- ============================================================
-- Fase 10 — Planeamento de rotas
-- ============================================================

-- 0. Novo estado de pedido -----------------------------------
alter type erp.estado_pedido add value if not exists 'agendado' after 'pronto';

-- 1. Viaturas ------------------------------------------------
create table if not exists erp.viaturas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  nome text not null,
  matricula text unique,
  cubicagem_m3 numeric(10,2) not null check (cubicagem_m3 > 0),
  peso_max_kg numeric(10,2) check (peso_max_kg > 0),
  consumo_l_100km numeric(5,2) check (consumo_l_100km >= 0),
  observacoes text,
  ativa boolean not null default true
);

grant select, insert, update on erp.viaturas to authenticated;
grant all on erp.viaturas to service_role;
revoke delete on erp.viaturas from authenticated;
alter table erp.viaturas enable row level security;

drop policy if exists viaturas_select on erp.viaturas;
create policy viaturas_select on erp.viaturas for select to authenticated using (erp.is_ativo());
drop policy if exists viaturas_insert on erp.viaturas;
create policy viaturas_insert on erp.viaturas for insert to authenticated
  with check (erp.is_ativo() and erp.perfil_atual()::text in ('adm','escritorio'));
drop policy if exists viaturas_update on erp.viaturas;
create policy viaturas_update on erp.viaturas for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text in ('adm','escritorio'))
  with check (erp.is_ativo() and erp.perfil_atual()::text in ('adm','escritorio'));

drop trigger if exists t_viaturas_campos on erp.viaturas;
create trigger t_viaturas_campos before insert or update on erp.viaturas
  for each row execute function erp.tg_campos_auditoria();
drop trigger if exists t_viaturas_aud on erp.viaturas;
create trigger t_viaturas_aud after insert or update on erp.viaturas
  for each row execute function erp.tg_auditoria();

create index if not exists ix_viaturas_ativa on erp.viaturas(ativa) where eliminado_em is null;

-- 2. Modelos de rota -----------------------------------------
create table if not exists erp.rota_templates (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  nome text not null,
  periodicidade text not null check (periodicidade in ('semanal','quinzenal','mensal')),
  dias_semana int[] not null check (array_length(dias_semana, 1) >= 1),
  semana_referencia date,
  max_entregas int check (max_entregas > 0),
  max_minutos_montagem int check (max_minutos_montagem > 0),
  viatura_id uuid references erp.viaturas(id),
  responsavel_id uuid references erp.utilizadores(id),
  cp_inicio char(4),
  cp_fim char(4),
  zonas_entrega_ids uuid[],
  ativo boolean not null default true
);

grant select, insert, update on erp.rota_templates to authenticated;
grant all on erp.rota_templates to service_role;
revoke delete on erp.rota_templates from authenticated;
alter table erp.rota_templates enable row level security;

drop policy if exists rota_templates_select on erp.rota_templates;
create policy rota_templates_select on erp.rota_templates for select to authenticated
  using (erp.is_ativo());
drop policy if exists rota_templates_insert on erp.rota_templates;
create policy rota_templates_insert on erp.rota_templates for insert to authenticated
  with check (erp.is_ativo() and erp.perfil_atual()::text in ('adm','escritorio'));
drop policy if exists rota_templates_update on erp.rota_templates;
create policy rota_templates_update on erp.rota_templates for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual()::text in ('adm','escritorio'))
  with check (erp.is_ativo() and erp.perfil_atual()::text in ('adm','escritorio'));

drop trigger if exists t_rota_templates_campos on erp.rota_templates;
create trigger t_rota_templates_campos before insert or update on erp.rota_templates
  for each row execute function erp.tg_campos_auditoria();
drop trigger if exists t_rota_templates_aud on erp.rota_templates;
create trigger t_rota_templates_aud after insert or update on erp.rota_templates
  for each row execute function erp.tg_auditoria();

create index if not exists ix_rota_templates_ativo on erp.rota_templates(ativo) where eliminado_em is null;
create index if not exists ix_rota_templates_viatura on erp.rota_templates(viatura_id);
create index if not exists ix_rota_templates_responsavel on erp.rota_templates(responsavel_id);

-- 3. Rotas: capacidade e origem ------------------------------
alter table erp.rotas add column if not exists template_id uuid references erp.rota_templates(id);
alter table erp.rotas add column if not exists viatura_id uuid references erp.viaturas(id);
alter table erp.rotas add column if not exists max_entregas int check (max_entregas > 0);
alter table erp.rotas add column if not exists max_minutos_montagem int check (max_minutos_montagem > 0);
alter table erp.rotas add column if not exists cancelada_em timestamptz;
alter table erp.rotas add column if not exists motivo_cancelamento text;

alter table erp.rotas drop constraint if exists rotas_estado_check;
alter table erp.rotas add constraint rotas_estado_check
  check (estado in ('planeada','em_curso','concluida','fechada','conferida','cancelada'));

create unique index if not exists ux_rotas_template_data
  on erp.rotas(template_id, data) where template_id is not null and eliminado_em is null;
create index if not exists ix_rotas_viatura on erp.rotas(viatura_id);
create index if not exists ix_rotas_template on erp.rotas(template_id);

alter table erp.rota_paragens add column if not exists excedeu_capacidade boolean not null default false;

alter table erp.pedidos add column if not exists data_entrega_agendada date;

-- 4. Registo de alterações depois do arranque -----------------
create table if not exists erp.rota_alteracoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  rota_id uuid not null references erp.rotas(id),
  tipo text not null check (tipo in ('adicionou','retirou')),
  pedido_id uuid references erp.pedidos(id),
  descricao text
);

grant select on erp.rota_alteracoes to authenticated;
grant all on erp.rota_alteracoes to service_role;
alter table erp.rota_alteracoes enable row level security;
drop policy if exists rota_alteracoes_select on erp.rota_alteracoes;
create policy rota_alteracoes_select on erp.rota_alteracoes for select to authenticated
  using (erp.is_ativo() and (erp.perfil_atual()::text <> 'entregador'
         or exists (select 1 from erp.rotas r where r.id = rota_alteracoes.rota_id
                      and r.responsavel_id = erp.utilizador_atual())));

drop trigger if exists t_rota_alteracoes_campos on erp.rota_alteracoes;
create trigger t_rota_alteracoes_campos before insert or update on erp.rota_alteracoes
  for each row execute function erp.tg_campos_auditoria();
create index if not exists ix_rota_alteracoes_rota on erp.rota_alteracoes(rota_id);
create index if not exists ix_rota_alteracoes_pedido on erp.rota_alteracoes(pedido_id);

-- 5. Ocupação -------------------------------------------------
create or replace view erp.v_rota_ocupacao
with (security_invoker = true) as
select r.id as rota_id,
       r.data,
       r.nome,
       r.estado,
       r.max_entregas,
       r.max_minutos_montagem,
       r.viatura_id,
       v.nome as viatura,
       v.cubicagem_m3 as viatura_cubicagem_m3,
       v.peso_max_kg as viatura_peso_max_kg,
       coalesce(o.entregas, 0)::int as entregas,
       coalesce(o.montagem_min, 0)::int as montagem_min,
       coalesce(o.cubicagem_m3, 0)::numeric(12,2) as cubicagem_m3,
       coalesce(o.peso_kg, 0)::numeric(12,2) as peso_kg
  from erp.rotas r
  left join erp.viaturas v on v.id = r.viatura_id
  left join lateral (
    select count(distinct rp.id) as entregas,
           coalesce(sum(pi.quantidade * coalesce(pr.tempo_montagem_min, 0)), 0) as montagem_min,
           coalesce(sum(pi.quantidade * coalesce(pr.volume_m3, 0)), 0) as cubicagem_m3,
           coalesce(sum(pi.quantidade * coalesce(pr.peso_kg, 0)), 0) as peso_kg
      from erp.rota_paragens rp
      left join erp.pedido_itens pi on pi.pedido_id = rp.pedido_id and pi.eliminado_em is null
      left join erp.produtos pr on pr.id = pi.produto_id
     where rp.rota_id = r.id and rp.eliminado_em is null
  ) o on true
 where r.eliminado_em is null;

grant select on erp.v_rota_ocupacao to authenticated;

create or replace view erp.v_viaturas
with (security_invoker = true) as
select v.* from erp.viaturas v where v.eliminado_em is null;
grant select on erp.v_viaturas to authenticated;

create or replace view erp.v_rota_templates
with (security_invoker = true) as
select t.*, v.nome as viatura, u.nome as responsavel
  from erp.rota_templates t
  left join erp.viaturas v on v.id = t.viatura_id
  left join erp.utilizadores u on u.id = t.responsavel_id
 where t.eliminado_em is null;
grant select on erp.v_rota_templates to authenticated;

-- v_rotas: acrescentar as colunas novas no fim
create or replace view erp.v_rotas
with (security_invoker = true) as
 SELECT r.id, r.criado_em, r.criado_por, r.atualizado_em, r.atualizado_por,
    r.eliminado_em, r.eliminado_por, r.motivo_eliminacao, r.data, r.nome,
    r.responsavel_id, r.viatura, r.estado, r.previsto_entregas, r.previsto_receber,
    r.realizado_entregas, r.realizado_recebido, r.realizado_dinheiro, r.realizado_saidas,
    r.esperado_envelope, r.valor_envelope, r.aberta_em, r.fechada_em, r.fechada_por,
    r.conferida_em, r.conferida_por, r.valor_conferido, r.diferenca,
    r.justificacao_diferenca, r.observacoes,
    u.nome AS responsavel,
    ( SELECT count(*) FROM erp.rota_paragens rp
       WHERE rp.rota_id = r.id AND rp.eliminado_em IS NULL) AS paragens,
    ( SELECT count(*) FROM erp.rota_paragens rp
       WHERE rp.rota_id = r.id AND rp.eliminado_em IS NULL AND rp.desfecho IS NOT NULL) AS paragens_fechadas,
    erp.caixa_da_rota(r.id) AS caixa_id,
    r.template_id, r.viatura_id, r.max_entregas, r.max_minutos_montagem,
    r.cancelada_em, r.motivo_cancelamento,
    t.nome AS template_nome,
    vi.nome AS viatura_nome,
    vi.cubicagem_m3 AS viatura_cubicagem_m3,
    oc.entregas AS ocup_entregas, oc.montagem_min AS ocup_montagem_min,
    oc.cubicagem_m3 AS ocup_cubicagem_m3, oc.peso_kg AS ocup_peso_kg
   FROM erp.rotas r
     LEFT JOIN erp.utilizadores u ON u.id = r.responsavel_id
     LEFT JOIN erp.rota_templates t ON t.id = r.template_id
     LEFT JOIN erp.viaturas vi ON vi.id = r.viatura_id
     LEFT JOIN erp.v_rota_ocupacao oc ON oc.rota_id = r.id
  WHERE r.eliminado_em IS NULL;
grant select on erp.v_rotas to authenticated;

-- 6. Datas geradas por um modelo ------------------------------
create or replace function erp.datas_template(
  p_periodicidade text, p_dias_semana int[], p_semana_referencia date,
  p_de date default null, p_ate date default null)
returns setof date
language plpgsql stable
set search_path to 'erp','public'
as $$
declare
  v_de date := coalesce(p_de, current_date);
  v_ate date := coalesce(p_ate, coalesce(p_de, current_date) + 42);
  d date;
  v_ref date := coalesce(p_semana_referencia, date_trunc('week', coalesce(p_de, current_date))::date);
  v_dow int;
begin
  d := v_de;
  while d <= v_ate loop
    v_dow := extract(dow from d)::int + 1;  -- 1=domingo … 7=sábado
    if v_dow = any(p_dias_semana) then
      if p_periodicidade = 'semanal' then
        return next d;
      elsif p_periodicidade = 'quinzenal' then
        if (floor((d - date_trunc('week', v_ref)::date) / 7.0)::int) % 2 = 0 then
          return next d;
        end if;
      elsif p_periodicidade = 'mensal' then
        -- primeira ocorrência do dia da semana em cada mês
        if extract(day from d)::int <= 7 then
          return next d;
        end if;
      end if;
    end if;
    d := d + 1;
  end loop;
end $$;

grant execute on function erp.datas_template(text, int[], date, date, date) to authenticated;

-- 7. Geração das rotas ----------------------------------------
create or replace function erp.gerar_rotas_templates(p_semanas int default 6)
returns int
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare t erp.rota_templates%rowtype; d date; v_n int := 0;
begin
  for t in select * from erp.rota_templates
            where ativo and eliminado_em is null loop
    for d in select * from erp.datas_template(t.periodicidade, t.dias_semana,
                            t.semana_referencia, current_date, current_date + (p_semanas * 7)) loop
      if not exists (select 1 from erp.rotas r
                      where r.template_id = t.id and r.data = d and r.eliminado_em is null) then
        insert into erp.rotas (data, nome, responsavel_id, estado, template_id, viatura_id,
                               max_entregas, max_minutos_montagem, previsto_entregas, previsto_receber)
        values (d, t.nome, t.responsavel_id, 'planeada', t.id, t.viatura_id,
                t.max_entregas, t.max_minutos_montagem, 0, 0);
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end $$;

grant execute on function erp.gerar_rotas_templates(int) to authenticated;

-- 8. Recalcular o previsto enquanto planeada ------------------
create or replace function erp.recalcular_previsto_rota(p_rota_id uuid)
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare v_n int; v_total numeric(12,2);
begin
  select count(*), coalesce(sum(previsto_receber), 0) into v_n, v_total
    from erp.rota_paragens where rota_id = p_rota_id and eliminado_em is null;
  update erp.rotas set previsto_entregas = v_n, previsto_receber = v_total
   where id = p_rota_id and estado = 'planeada';
end $$;

-- 9. Criar uma rota vazia --------------------------------------
create or replace function erp.criar_rota(
  p_nome text, p_data date, p_responsavel_id uuid default null,
  p_viatura_id uuid default null, p_template_id uuid default null,
  p_max_entregas int default null, p_max_minutos_montagem int default null)
returns uuid
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare v_rota uuid;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem planear rotas.';
  end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Dê um nome à rota.'; end if;
  if p_data is null then raise exception 'Indique a data da rota.'; end if;
  if p_responsavel_id is not null and not exists (
       select 1 from erp.utilizadores u where u.id = p_responsavel_id
        and u.ativo and u.eliminado_em is null) then
    raise exception 'O responsável da rota tem de ser um utilizador ativo.';
  end if;
  insert into erp.rotas (data, nome, responsavel_id, estado, viatura_id, template_id,
                         max_entregas, max_minutos_montagem, previsto_entregas, previsto_receber)
  values (p_data, trim(p_nome), p_responsavel_id, 'planeada', p_viatura_id, p_template_id,
          p_max_entregas, p_max_minutos_montagem, 0, 0)
  returning id into v_rota;
  return v_rota;
end $$;

grant execute on function erp.criar_rota(text, date, uuid, uuid, uuid, int, int) to authenticated;

-- 10. Definir viatura / responsável ---------------------------
create or replace function erp.definir_viatura_rota(p_rota_id uuid, p_viatura_id uuid)
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem alterar a viatura.';
  end if;
  perform erp.rota_editavel(p_rota_id);
  if p_viatura_id is not null and not exists (
       select 1 from erp.viaturas v where v.id = p_viatura_id and v.ativa and v.eliminado_em is null) then
    raise exception 'Escolha uma viatura ativa.';
  end if;
  update erp.rotas set viatura_id = p_viatura_id where id = p_rota_id;
end $$;
grant execute on function erp.definir_viatura_rota(uuid, uuid) to authenticated;

create or replace function erp.definir_responsavel_rota(p_rota_id uuid, p_responsavel_id uuid)
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem alterar o responsável.';
  end if;
  perform erp.rota_editavel(p_rota_id);
  if not exists (select 1 from erp.utilizadores u where u.id = p_responsavel_id
                   and u.ativo and u.eliminado_em is null) then
    raise exception 'O responsável da rota tem de ser um utilizador ativo.';
  end if;
  update erp.rotas set responsavel_id = p_responsavel_id where id = p_rota_id;
end $$;
grant execute on function erp.definir_responsavel_rota(uuid, uuid) to authenticated;

create or replace function erp.definir_limites_rota(
  p_rota_id uuid, p_max_entregas int, p_max_minutos_montagem int)
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem alterar os limites.';
  end if;
  perform erp.rota_editavel(p_rota_id);
  update erp.rotas set max_entregas = p_max_entregas,
                       max_minutos_montagem = p_max_minutos_montagem
   where id = p_rota_id;
end $$;
grant execute on function erp.definir_limites_rota(uuid, int, int) to authenticated;

-- 11. Agendar / desagendar ------------------------------------
create or replace function erp.agendar_entrega(
  p_pedido_id uuid, p_rota_id uuid, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare
  ped erp.pedidos%rowtype; r erp.rotas%rowtype;
  v_prev numeric(12,2); v_ordem int; v_excede boolean := false;
  v_avisos text[] := '{}'; oc record;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem agendar entregas.';
  end if;

  select * into ped from erp.pedidos where id = p_pedido_id and eliminado_em is null for update;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if ped.estado not in ('confirmado','em_preparacao','pronto') then
    raise exception 'Só é possível agendar vendas confirmadas, em preparação ou prontas.';
  end if;

  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado in ('fechada','conferida','concluida','cancelada') then
    raise exception 'Esta rota já não aceita entregas.';
  end if;
  if r.estado = 'em_curso' and not p_confirmar then
    raise exception 'A rota já arrancou. Confirme que quer acrescentar esta paragem.';
  end if;

  if exists (select 1 from erp.rota_paragens rp join erp.rotas r2 on r2.id = rp.rota_id
              where rp.pedido_id = p_pedido_id and rp.eliminado_em is null
                and rp.desfecho is null and r2.estado in ('planeada','em_curso')) then
    raise exception 'Esta venda já está agendada numa rota.';
  end if;

  select coalesce(max(ordem), 0) + 1 into v_ordem
    from erp.rota_paragens where rota_id = p_rota_id and eliminado_em is null;

  select coalesce(sum(pg.valor), 0) into v_prev from erp.pagamentos pg
   where pg.pedido_id = p_pedido_id and pg.eliminado_em is null
     and pg.estado in ('pendente','pendente_confirmacao');
  if v_prev = 0 then v_prev := erp.pendente_pedido(p_pedido_id); end if;

  -- capacidade: avisa, não bloqueia
  select * into oc from erp.v_rota_ocupacao where rota_id = p_rota_id;
  if r.max_entregas is not null and coalesce(oc.entregas, 0) + 1 > r.max_entregas then
    v_excede := true;
    v_avisos := v_avisos || format('Máximo de entregas ultrapassado (%s/%s).',
                                   coalesce(oc.entregas, 0) + 1, r.max_entregas);
  end if;
  if r.max_minutos_montagem is not null then
    if coalesce(oc.montagem_min, 0) > r.max_minutos_montagem then
      v_excede := true;
      v_avisos := v_avisos || 'Tempo de montagem acima do limite da rota.';
    end if;
  end if;

  insert into erp.rota_paragens (rota_id, pedido_id, ordem, previsto_receber, excedeu_capacidade)
  values (p_rota_id, p_pedido_id, v_ordem, v_prev, v_excede);

  perform set_config('erp.recalculo', '1', true);
  perform set_config('erp.motor', '1', true);
  update erp.pedidos
     set estado = 'agendado'::erp.estado_pedido,
         data_entrega_agendada = r.data
   where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  if r.estado = 'planeada' then
    perform erp.recalcular_previsto_rota(p_rota_id);
  else
    insert into erp.rota_alteracoes (rota_id, tipo, pedido_id, descricao)
    values (p_rota_id, 'adicionou', p_pedido_id,
            format('Paragem acrescentada com a rota em curso (%s).', ped.numero));
  end if;

  return jsonb_build_object('rota_id', p_rota_id, 'data', r.data,
    'excedeu_capacidade', v_excede, 'avisos', to_jsonb(v_avisos));
end $$;

grant execute on function erp.agendar_entrega(uuid, uuid, boolean) to authenticated;

create or replace function erp.desagendar_entrega(
  p_pedido_id uuid, p_motivo text default null, p_confirmar boolean default false)
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare rp erp.rota_paragens%rowtype; r erp.rotas%rowtype;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem desagendar entregas.';
  end if;
  select p.* into rp from erp.rota_paragens p
    join erp.rotas r2 on r2.id = p.rota_id
   where p.pedido_id = p_pedido_id and p.eliminado_em is null and p.desfecho is null
     and r2.estado in ('planeada','em_curso')
   order by p.criado_em desc limit 1;
  if not found then raise exception 'Esta venda não está agendada.'; end if;

  select * into r from erp.rotas where id = rp.rota_id for update;
  if r.estado = 'em_curso' and not p_confirmar then
    raise exception 'A rota já arrancou. Confirme que quer retirar esta paragem.';
  end if;

  update erp.rota_paragens
     set eliminado_em = now(), eliminado_por = erp.utilizador_atual(),
         motivo_eliminacao = coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Desagendada')
   where id = rp.id;

  perform set_config('erp.recalculo', '1', true);
  perform set_config('erp.motor', '1', true);
  update erp.pedidos set estado = 'pronto'::erp.estado_pedido, data_entrega_agendada = null
   where id = p_pedido_id and estado = 'agendado'::erp.estado_pedido;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  if r.estado = 'planeada' then
    perform erp.recalcular_previsto_rota(rp.rota_id);
  else
    insert into erp.rota_alteracoes (rota_id, tipo, pedido_id, descricao)
    values (rp.rota_id, 'retirou', p_pedido_id,
            coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Paragem retirada com a rota em curso.'));
  end if;
end $$;

grant execute on function erp.desagendar_entrega(uuid, text, boolean) to authenticated;

-- 12. Reordenar paragens ---------------------------------------
create or replace function erp.reordenar_paragens(p_rota_id uuid, p_ordem uuid[])
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare i int := 0; v_id uuid;
begin
  perform erp.rota_editavel(p_rota_id);
  foreach v_id in array p_ordem loop
    i := i + 1;
    update erp.rota_paragens set ordem = i
     where id = v_id and rota_id = p_rota_id and eliminado_em is null;
  end loop;
end $$;
grant execute on function erp.reordenar_paragens(uuid, uuid[]) to authenticated;

-- 13. Arrancar / cancelar rota ---------------------------------
create or replace function erp.arrancar_rota(p_rota_id uuid)
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare r erp.rotas%rowtype; v_n int; v_total numeric(12,2); v_caixa uuid;
begin
  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado <> 'planeada' then raise exception 'Só é possível arrancar uma rota planeada.'; end if;
  if r.responsavel_id is null then raise exception 'Escolha o entregador antes de arrancar.'; end if;
  if r.responsavel_id <> erp.utilizador_atual()
     and erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Esta rota é de outra pessoa.';
  end if;

  select count(*), coalesce(sum(previsto_receber), 0) into v_n, v_total
    from erp.rota_paragens where rota_id = p_rota_id and eliminado_em is null;
  if v_n = 0 then raise exception 'A rota não tem paragens.'; end if;

  update erp.rotas
     set estado = 'em_curso', aberta_em = coalesce(aberta_em, now()),
         previsto_entregas = v_n, previsto_receber = v_total
   where id = p_rota_id;

  v_caixa := erp.caixa_da_rota(p_rota_id);
  if v_caixa is null then
    insert into erp.caixas (utilizador_id, data, saldo_abertura, saldo_esperado, rota_id)
    values (r.responsavel_id, r.data, 0, 0, p_rota_id);
  end if;
end $$;
grant execute on function erp.arrancar_rota(uuid) to authenticated;

create or replace function erp.cancelar_rota(p_rota_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare r erp.rotas%rowtype; rp record;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem cancelar rotas.';
  end if;
  if nullif(trim(coalesce(p_motivo,'')),'') is null then
    raise exception 'Explique porque está a cancelar a rota.';
  end if;
  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado <> 'planeada' then
    raise exception 'Só é possível cancelar rotas ainda planeadas.';
  end if;

  for rp in select * from erp.rota_paragens
             where rota_id = p_rota_id and eliminado_em is null loop
    update erp.rota_paragens
       set eliminado_em = now(), eliminado_por = erp.utilizador_atual(),
           motivo_eliminacao = 'Rota cancelada: ' || trim(p_motivo)
     where id = rp.id;
    perform set_config('erp.recalculo', '1', true);
    perform set_config('erp.motor', '1', true);
    update erp.pedidos set estado = 'pronto'::erp.estado_pedido, data_entrega_agendada = null
     where id = rp.pedido_id and estado = 'agendado'::erp.estado_pedido;
    perform set_config('erp.recalculo', '', true);
    perform set_config('erp.motor', '', true);
  end loop;

  update erp.rotas
     set estado = 'cancelada', cancelada_em = now(), motivo_cancelamento = trim(p_motivo),
         previsto_entregas = 0, previsto_receber = 0
   where id = p_rota_id;
end $$;
grant execute on function erp.cancelar_rota(uuid, text) to authenticated;

-- 14. Vendas por agendar e rotas sugeridas ---------------------
create or replace view erp.v_pedidos_por_agendar
with (security_invoker = true) as
select p.id, p.numero, p.estado, p.cliente_id, c.nome as cliente,
       p.data_entrega_prevista, p.data_entrega_prometida,
       p.morada_entrega, p.localidade_entrega, p.cp4_entrega, p.cp3_entrega,
       p.entrega_domicilio, p.zona_entrega_id, p.total, p.total_pago,
       erp.pendente_pedido(p.id) as pendente,
       greatest(0, (current_date - coalesce(p.confirmado_em::date, p.criado_em::date)))::int as dias_pronto,
       coalesce(oi.montagem_min, 0)::int as montagem_min,
       coalesce(oi.cubicagem_m3, 0)::numeric(12,2) as cubicagem_m3,
       coalesce(oi.peso_kg, 0)::numeric(12,2) as peso_kg
  from erp.pedidos p
  left join erp.clientes c on c.id = p.cliente_id
  left join lateral (
    select coalesce(sum(pi.quantidade * coalesce(pr.tempo_montagem_min, 0)), 0) as montagem_min,
           coalesce(sum(pi.quantidade * coalesce(pr.volume_m3, 0)), 0) as cubicagem_m3,
           coalesce(sum(pi.quantidade * coalesce(pr.peso_kg, 0)), 0) as peso_kg
      from erp.pedido_itens pi
      left join erp.produtos pr on pr.id = pi.produto_id
     where pi.pedido_id = p.id and pi.eliminado_em is null
  ) oi on true
 where p.eliminado_em is null
   and p.estado in ('confirmado','em_preparacao','pronto')
   and not exists (
     select 1 from erp.rota_paragens rp join erp.rotas r on r.id = rp.rota_id
      where rp.pedido_id = p.id and rp.eliminado_em is null and rp.desfecho is null
        and r.estado in ('planeada','em_curso'));
grant select on erp.v_pedidos_por_agendar to authenticated;

create or replace function erp.rotas_sugeridas(p_pedido_id uuid)
returns table (
  rota_id uuid, data date, nome text, estado text, responsavel text,
  viatura text, max_entregas int, entregas int, max_minutos_montagem int,
  montagem_min int, cubicagem_m3 numeric, viatura_cubicagem_m3 numeric,
  serve_zona boolean, excede boolean)
language plpgsql stable
security definer
set search_path to 'erp','public'
as $$
declare v_cp4 char(4); v_zona uuid; v_mont int; v_cub numeric(12,2);
begin
  select coalesce(p.cp4_entrega, c.cp4), p.zona_entrega_id
    into v_cp4, v_zona
    from erp.pedidos p left join erp.clientes c on c.id = p.cliente_id
   where p.id = p_pedido_id and p.eliminado_em is null;

  select coalesce(sum(pi.quantidade * coalesce(pr.tempo_montagem_min, 0)), 0),
         coalesce(sum(pi.quantidade * coalesce(pr.volume_m3, 0)), 0)
    into v_mont, v_cub
    from erp.pedido_itens pi left join erp.produtos pr on pr.id = pi.produto_id
   where pi.pedido_id = p_pedido_id and pi.eliminado_em is null;

  return query
  select r.id, r.data, r.nome, r.estado, u.nome, vi.nome,
         r.max_entregas, oc.entregas, r.max_minutos_montagem, oc.montagem_min,
         oc.cubicagem_m3, vi.cubicagem_m3,
         coalesce(
           (t.cp_inicio is not null and v_cp4 is not null and v_cp4 between t.cp_inicio and t.cp_fim)
           or (t.zonas_entrega_ids is not null and v_zona = any(t.zonas_entrega_ids)), false),
         (r.max_entregas is not null and oc.entregas + 1 > r.max_entregas)
         or (r.max_minutos_montagem is not null and oc.montagem_min + v_mont > r.max_minutos_montagem)
         or (vi.cubicagem_m3 is not null and oc.cubicagem_m3 + v_cub > vi.cubicagem_m3)
    from erp.rotas r
    join erp.v_rota_ocupacao oc on oc.rota_id = r.id
    left join erp.rota_templates t on t.id = r.template_id
    left join erp.utilizadores u on u.id = r.responsavel_id
    left join erp.viaturas vi on vi.id = r.viatura_id
   where r.eliminado_em is null and r.estado = 'planeada' and r.data >= current_date
   order by
     (case when coalesce(
        (t.cp_inicio is not null and v_cp4 is not null and v_cp4 between t.cp_inicio and t.cp_fim)
        or (t.zonas_entrega_ids is not null and v_zona = any(t.zonas_entrega_ids)), false)
      then 0 else 1 end),
     r.data asc,
     (coalesce(r.max_entregas, 99) - oc.entregas) desc
   limit 30;
end $$;
grant execute on function erp.rotas_sugeridas(uuid) to authenticated;

-- 15. Estados: aceitar 'agendado' onde já se aceitava 'pronto' --
create or replace function erp.rota_editavel(p_rota_id uuid)
returns erp.rotas
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare r erp.rotas%rowtype;
begin
  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado in ('fechada','conferida') then
    raise exception 'A rota já foi fechada. Não aceita alterações.';
  end if;
  if r.estado = 'cancelada' then
    raise exception 'Esta rota foi cancelada.';
  end if;
  if r.responsavel_id is not null and r.responsavel_id <> erp.utilizador_atual()
     and erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Esta rota é de outra pessoa.';
  end if;
  return r;
end $$;

-- 16. Tarefa diária de geração ---------------------------------
select cron.unschedule('up-vendas-gerar-rotas')
 where exists (select 1 from cron.job where jobname = 'up-vendas-gerar-rotas');
select cron.schedule('up-vendas-gerar-rotas', '10 5 * * *',
  $$select erp.gerar_rotas_templates(6);$$);
