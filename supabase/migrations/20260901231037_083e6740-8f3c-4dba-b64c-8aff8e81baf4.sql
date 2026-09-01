-- ============================================================
-- Fase 11b — MRP: centros, roteiros, explosão BOM, planos
-- Acrescento. Nada do que existe é removido.
-- ============================================================

-- ---------- 1. centros de trabalho
create table erp.centros_trabalho (
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
  responsavel_id uuid references erp.utilizadores(id),
  capacidade_min_dia int not null default 480 check (capacidade_min_dia > 0),
  n_postos int not null default 1 check (n_postos > 0),
  eficiencia_pct numeric(5,2) not null default 100 check (eficiencia_pct > 0),
  ativo boolean not null default true
);
create index idx_centros_responsavel on erp.centros_trabalho (responsavel_id);

create table erp.centro_operadores (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  centro_id uuid not null references erp.centros_trabalho(id),
  utilizador_id uuid not null references erp.utilizadores(id),
  minutos_dia int not null default 480 check (minutos_dia > 0),
  unique (centro_id, utilizador_id)
);
create index idx_centro_oper_centro on erp.centro_operadores (centro_id);
create index idx_centro_oper_util on erp.centro_operadores (utilizador_id);

-- ---------- 2. roteiro por produto
create table erp.produto_roteiro (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  produto_id uuid not null references erp.produtos(id),
  etapa_id uuid not null references erp.etapas_producao(id),
  ordem int not null,
  tempo_setup_min int not null default 0 check (tempo_setup_min >= 0),
  tempo_unitario_min numeric(10,2) not null check (tempo_unitario_min >= 0),
  instrucoes text,
  unique (produto_id, etapa_id)
);
create index idx_roteiro_produto on erp.produto_roteiro (produto_id);
create index idx_roteiro_etapa on erp.produto_roteiro (etapa_id);

-- ---------- 3. planos de produção
create table erp.planos_producao (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  nome text not null,
  data_inicio date not null,
  data_fim date not null,
  estado text not null default 'rascunho'
    check (estado in ('rascunho','simulado','aprovado','em_producao','concluido','cancelado')),
  viavel boolean,
  simulado_em timestamptz,
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users(id),
  forcado boolean not null default false,
  justificacao_forcado text,
  notas text,
  check (data_fim >= data_inicio)
);
create index idx_planos_estado on erp.planos_producao (estado);

create table erp.plano_linhas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  plano_id uuid not null references erp.planos_producao(id),
  produto_id uuid not null references erp.produtos(id),
  quantidade int not null check (quantidade > 0),
  prioridade int not null default 5,
  urgente boolean not null default false,
  data_necessaria date,
  necessidade_ids uuid[],
  op_id uuid references erp.ordens_producao(id)
);
create index idx_plano_linhas_plano on erp.plano_linhas (plano_id);
create index idx_plano_linhas_produto on erp.plano_linhas (produto_id);
create index idx_plano_linhas_op on erp.plano_linhas (op_id);

create table erp.plano_carga (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  plano_id uuid not null references erp.planos_producao(id),
  centro_id uuid not null references erp.centros_trabalho(id),
  minutos_necessarios numeric(12,2) not null,
  minutos_disponiveis numeric(12,2) not null,
  ocupacao_pct numeric(6,2) not null,
  unique (plano_id, centro_id)
);
create index idx_plano_carga_plano on erp.plano_carga (plano_id);

-- ---------- grants, RLS e auditoria das tabelas novas
do $$
declare t text;
begin
  foreach t in array array['centros_trabalho','centro_operadores','produto_roteiro',
                           'planos_producao','plano_linhas','plano_carga']
  loop
    execute format('grant select, insert, update on erp.%I to authenticated', t);
    execute format('grant all on erp.%I to service_role', t);
    execute format('alter table erp.%I enable row level security', t);
    execute format($f$create policy %I on erp.%I for select to authenticated using (erp.pode_ver_producao())$f$, t || '_sel', t);
    execute format($f$create policy %I on erp.%I for insert to authenticated with check (erp.pode_gerir_producao())$f$, t || '_ins', t);
    execute format($f$create policy %I on erp.%I for update to authenticated using (erp.pode_gerir_producao()) with check (erp.pode_gerir_producao())$f$, t || '_upd', t);
    execute format('create trigger tg_campos_auditoria before insert or update on erp.%I for each row execute function erp.tg_campos_auditoria()', t);
    execute format('create trigger tg_auditoria after insert or update on erp.%I for each row execute function erp.tg_auditoria()', t);
    execute format('revoke delete on erp.%I from authenticated, anon', t);
  end loop;
end $$;

-- ---------- etapas passam a pertencer a um centro
alter table erp.etapas_producao
  add column if not exists centro_id uuid references erp.centros_trabalho(id);
create index if not exists idx_etapas_centro on erp.etapas_producao (centro_id);

insert into erp.centros_trabalho (codigo, nome, capacidade_min_dia, n_postos)
select e.codigo, e.nome, 480, 1
  from erp.etapas_producao e
 where e.eliminado_em is null
   and not exists (select 1 from erp.centros_trabalho c where c.codigo = e.codigo);

update erp.etapas_producao e
   set centro_id = c.id
  from erp.centros_trabalho c
 where c.codigo = e.codigo and e.centro_id is null;

-- ---------- ordens de produção e etapas: colunas novas
alter table erp.ordens_producao
  add column if not exists plano_id uuid references erp.planos_producao(id),
  add column if not exists destino text not null default 'cliente'
    check (destino in ('cliente','stock')),
  add column if not exists op_pai_id uuid references erp.ordens_producao(id);
create index if not exists idx_op_plano on erp.ordens_producao (plano_id);
create index if not exists idx_op_pai on erp.ordens_producao (op_pai_id);

alter table erp.op_etapas
  add column if not exists centro_id uuid references erp.centros_trabalho(id),
  add column if not exists minutos_previstos numeric(10,2),
  add column if not exists minutos_reais numeric(10,2);
create index if not exists idx_op_etapas_centro on erp.op_etapas (centro_id);

-- ---------- necessidades de compra passam a aceitar origem 'producao'
alter table erp.necessidades_compra drop constraint if exists necessidades_origem_ck;
alter table erp.necessidades_compra add constraint necessidades_origem_ck
  check (origem in ('venda','reposicao','manual','producao'));
alter table erp.necessidades_compra add column if not exists op_id uuid references erp.ordens_producao(id);

-- ============================================================
-- capacidade
-- ============================================================
create or replace function erp.capacidade_centro_dia(p_centro_id uuid)
 returns numeric language sql stable security definer set search_path to 'erp','public'
as $$
  select round(case
           when exists (select 1 from erp.centro_operadores o
                         where o.centro_id = c.id and o.eliminado_em is null)
             then (select sum(o.minutos_dia) from erp.centro_operadores o
                    where o.centro_id = c.id and o.eliminado_em is null)::numeric
             else (c.capacidade_min_dia * c.n_postos)::numeric
         end * c.eficiencia_pct / 100, 2)
    from erp.centros_trabalho c
   where c.id = p_centro_id and c.eliminado_em is null and c.ativo;
$$;

create or replace function erp.dias_uteis(p_inicio date, p_fim date)
 returns int language sql stable security definer set search_path to 'erp','public'
as $$
  select count(*)::int from generate_series(p_inicio, p_fim, interval '1 day') d
   where erp.dia_util(d::date);
$$;

create or replace function erp.capacidade_centro_periodo(p_centro_id uuid, p_inicio date, p_fim date)
 returns numeric language sql stable security definer set search_path to 'erp','public'
as $$
  select coalesce(erp.capacidade_centro_dia(p_centro_id), 0) * erp.dias_uteis(p_inicio, p_fim);
$$;

-- ============================================================
-- explosão multinível da BOM — pára onde há stock
-- ============================================================
create or replace function erp.explodir_bom(p_produto_id uuid, p_quantidade numeric)
 returns table (
   nivel int, produto_id uuid, nome text,
   quantidade_necessaria numeric, stock_vendavel int, em_falta numeric, rota text
 ) language sql stable security definer set search_path to 'erp','public'
as $$
  with recursive arvore as (
    select 1 as nivel,
           c.componente_id as produto_id,
           (c.quantidade * p_quantidade)::numeric as necessario,
           greatest((c.quantidade * p_quantidade)::numeric - greatest(coalesce(s.vendavel, 0), 0), 0)::numeric as falta
      from erp.componentes c
      left join erp.stock_atual s on s.produto_id = c.componente_id
     where c.produto_id = p_produto_id and c.eliminado_em is null
    union all
    select a.nivel + 1,
           c.componente_id,
           (c.quantidade * a.falta)::numeric,
           greatest((c.quantidade * a.falta)::numeric - greatest(coalesce(s.vendavel, 0), 0), 0)::numeric
      from arvore a
      join erp.componentes c on c.produto_id = a.produto_id and c.eliminado_em is null
      left join erp.stock_atual s on s.produto_id = c.componente_id
     where a.nivel < 10 and a.falta > 0
  ), somado as (
    select nivel, produto_id, sum(necessario) as necessario, sum(falta) as falta
      from arvore group by nivel, produto_id
  )
  select s.nivel,
         s.produto_id,
         p.nome_cliente as nome,
         round(s.necessario, 3) as quantidade_necessaria,
         greatest(coalesce(st.vendavel, 0), 0)::int as stock_vendavel,
         round(s.falta, 3) as em_falta,
         case
           when s.falta <= 0 then 'stock'
           when exists (select 1 from erp.componentes x
                         where x.produto_id = s.produto_id and x.eliminado_em is null) then 'produzir'
           when p.tipo_fornecimento = 'producao' then 'produzir'
           else 'comprar'
         end as rota
    from somado s
    join erp.produtos p on p.id = s.produto_id
    left join erp.stock_atual st on st.produto_id = s.produto_id
   order by s.nivel, p.nome_cliente;
$$;

-- ============================================================
-- criação interna de OP (usada por criar_op, planos e sub-OPs)
-- ============================================================
create or replace function erp.criar_op_interna(
  p_produto_id uuid,
  p_necessidades uuid[] default null,
  p_quantidade int default null,
  p_data_prevista date default null,
  p_prioridade int default 5,
  p_observacoes text default null,
  p_plano_id uuid default null,
  p_destino text default 'cliente',
  p_op_pai_id uuid default null
) returns uuid language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  v_op uuid;
  v_qt int := 0;
  v_data date := p_data_prevista;
  n record;
  v_nome text;
begin
  select nome_cliente into v_nome from erp.produtos where id = p_produto_id and eliminado_em is null;
  if v_nome is null then raise exception 'Produto não encontrado.'; end if;

  if p_necessidades is not null and array_length(p_necessidades, 1) > 0 then
    for n in select * from erp.necessidades_producao
              where id = any (p_necessidades) and eliminado_em is null for update
    loop
      if n.produto_id <> p_produto_id then
        raise exception 'Todas as necessidades têm de ser do mesmo produto.';
      end if;
      if n.estado <> 'aberta' then
        raise exception 'Há necessidades que já não estão abertas.';
      end if;
      v_qt := v_qt + n.quantidade;
      if v_data is null or (n.data_necessaria is not null and n.data_necessaria < v_data) then
        v_data := coalesce(n.data_necessaria, v_data);
      end if;
    end loop;
  end if;

  v_qt := greatest(coalesce(p_quantidade, v_qt), v_qt);
  if coalesce(v_qt, 0) <= 0 then
    raise exception 'Indique a quantidade a produzir.';
  end if;

  insert into erp.ordens_producao (numero, produto_id, quantidade, data_prevista, prioridade,
                                   observacoes, plano_id, destino, op_pai_id)
  values (erp.proximo_numero('ordem_producao'), p_produto_id, v_qt, v_data,
          coalesce(p_prioridade, 5), nullif(trim(coalesce(p_observacoes, '')), ''),
          p_plano_id, coalesce(p_destino, 'cliente'), p_op_pai_id)
  returning id into v_op;

  -- etapas: se o produto tem roteiro, seguem o roteiro; senão, todas as etapas ativas
  if exists (select 1 from erp.produto_roteiro r
              where r.produto_id = p_produto_id and r.eliminado_em is null) then
    insert into erp.op_etapas (op_id, etapa_id, ordem, centro_id, minutos_previstos)
    select v_op, r.etapa_id, r.ordem, e.centro_id,
           round(r.tempo_setup_min + r.tempo_unitario_min * v_qt, 2)
      from erp.produto_roteiro r
      join erp.etapas_producao e on e.id = r.etapa_id
     where r.produto_id = p_produto_id and r.eliminado_em is null and e.eliminado_em is null
     order by r.ordem;
  else
    insert into erp.op_etapas (op_id, etapa_id, ordem, centro_id)
    select v_op, e.id, e.ordem, e.centro_id from erp.etapas_producao e
     where e.ativo and e.eliminado_em is null order by e.ordem;
  end if;

  update erp.ordens_producao o
     set etapa_atual_id = (select etapa_id from erp.op_etapas where op_id = v_op order by ordem limit 1)
   where o.id = v_op;

  if p_necessidades is not null then
    update erp.necessidades_producao
       set estado = 'convertida', op_id = v_op
     where id = any (p_necessidades) and eliminado_em is null and estado = 'aberta';
  end if;

  return v_op;
end $$;

create or replace function erp.criar_op(
  p_produto_id uuid,
  p_necessidades uuid[] default null,
  p_quantidade int default null,
  p_data_prevista date default null,
  p_prioridade int default 5,
  p_observacoes text default null
) returns uuid language plpgsql security definer set search_path to 'erp','public'
as $$
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem abrir ordens de produção.';
  end if;
  return erp.criar_op_interna(p_produto_id, p_necessidades, p_quantidade, p_data_prevista,
                              p_prioridade, p_observacoes, null,
                              case when p_necessidades is null or array_length(p_necessidades, 1) is null
                                   then 'cliente' else 'cliente' end, null);
end $$;

-- ============================================================
-- planos: criar, linhas, agrupar, simular, aprovar
-- ============================================================
create or replace function erp.criar_plano(p_nome text, p_data_inicio date, p_data_fim date, p_notas text default null)
 returns uuid language plpgsql security definer set search_path to 'erp','public'
as $$
declare v_id uuid;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem criar planos de produção.';
  end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Dê um nome ao plano.'; end if;
  if p_data_fim < p_data_inicio then raise exception 'A data de fim é anterior à de início.'; end if;
  insert into erp.planos_producao (nome, data_inicio, data_fim, notas)
  values (trim(p_nome), p_data_inicio, p_data_fim, nullif(trim(coalesce(p_notas, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

/* Junta as necessidades abertas do período (e as atrasadas) numa linha por produto. */
create or replace function erp.agrupar_necessidades_no_plano(p_plano_id uuid)
 returns int language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  pl erp.planos_producao%rowtype;
  g record;
  v_linhas int := 0;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem montar planos.';
  end if;
  select * into pl from erp.planos_producao where id = p_plano_id and eliminado_em is null for update;
  if pl.id is null then raise exception 'Plano não encontrado.'; end if;
  if pl.estado not in ('rascunho','simulado') then
    raise exception 'Só se alteram linhas num plano em rascunho.';
  end if;

  for g in
    select n.produto_id,
           sum(n.quantidade)::int as quantidade,
           min(n.data_necessaria) as data_necessaria,
           array_agg(n.id) as ids
      from erp.necessidades_producao n
     where n.eliminado_em is null and n.estado = 'aberta'
       and (n.data_necessaria is null or n.data_necessaria <= pl.data_fim)
       and not exists (
         select 1 from erp.plano_linhas l
          where l.eliminado_em is null and l.necessidade_ids && array[n.id])
     group by n.produto_id
  loop
    insert into erp.plano_linhas (plano_id, produto_id, quantidade, data_necessaria,
                                  necessidade_ids, urgente)
    values (p_plano_id, g.produto_id, g.quantidade, g.data_necessaria, g.ids,
            g.data_necessaria is not null and g.data_necessaria < current_date);
    v_linhas := v_linhas + 1;
  end loop;

  update erp.planos_producao set estado = 'rascunho', viavel = null where id = p_plano_id;
  return v_linhas;
end $$;

create or replace function erp.gravar_plano_linha(
  p_id uuid, p_plano_id uuid, p_produto_id uuid, p_quantidade int,
  p_prioridade int default 5, p_urgente boolean default false, p_data_necessaria date default null
) returns uuid language plpgsql security definer set search_path to 'erp','public'
as $$
declare v_id uuid; v_estado text;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem montar planos.';
  end if;
  select estado into v_estado from erp.planos_producao where id = p_plano_id and eliminado_em is null;
  if v_estado is null then raise exception 'Plano não encontrado.'; end if;
  if v_estado not in ('rascunho','simulado') then raise exception 'Este plano já não se altera.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'A quantidade tem de ser maior que zero.'; end if;

  if p_id is null then
    insert into erp.plano_linhas (plano_id, produto_id, quantidade, prioridade, urgente, data_necessaria)
    values (p_plano_id, p_produto_id, p_quantidade, coalesce(p_prioridade, 5),
            coalesce(p_urgente, false), p_data_necessaria)
    returning id into v_id;
  else
    update erp.plano_linhas
       set produto_id = p_produto_id, quantidade = p_quantidade,
           prioridade = coalesce(p_prioridade, 5), urgente = coalesce(p_urgente, false),
           data_necessaria = p_data_necessaria
     where id = p_id and eliminado_em is null and op_id is null
    returning id into v_id;
    if v_id is null then raise exception 'Linha não encontrada ou já com ordem criada.'; end if;
  end if;
  update erp.planos_producao set viavel = null where id = p_plano_id;
  return v_id;
end $$;

create or replace function erp.remover_plano_linha(p_id uuid, p_motivo text default 'Retirada do plano')
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
declare l erp.plano_linhas%rowtype;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem montar planos.';
  end if;
  select * into l from erp.plano_linhas where id = p_id and eliminado_em is null;
  if l.id is null then raise exception 'Linha não encontrada.'; end if;
  if l.op_id is not null then raise exception 'Esta linha já tem ordem de produção.'; end if;
  update erp.plano_linhas set eliminado_em = now(), eliminado_por = auth.uid(),
         motivo_eliminacao = p_motivo where id = p_id;
  update erp.planos_producao set viavel = null where id = l.plano_id;
end $$;

/* Simulação: só calcula carga. Não cria ordens, movimentos nem necessidades. */
create or replace function erp.simular_plano(p_plano_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  pl erp.planos_producao%rowtype;
  v_viavel boolean;
  v_res jsonb;
begin
  if not erp.pode_ver_producao() then
    raise exception 'Não tem permissão para simular planos de produção.';
  end if;
  select * into pl from erp.planos_producao where id = p_plano_id and eliminado_em is null for update;
  if pl.id is null then raise exception 'Plano não encontrado.'; end if;
  if pl.estado in ('cancelado','concluido') then raise exception 'Este plano já está fechado.'; end if;

  delete from erp.plano_carga where plano_id = p_plano_id;

  insert into erp.plano_carga (plano_id, centro_id, minutos_necessarios, minutos_disponiveis, ocupacao_pct)
  with linhas as (
    select l.produto_id, l.quantidade::numeric as quantidade
      from erp.plano_linhas l
     where l.plano_id = p_plano_id and l.eliminado_em is null
  ), necessario as (
    select produto_id, sum(quantidade) as qt from linhas group by produto_id
    union all
    select b.produto_id, sum(ceil(b.em_falta)) as qt
      from linhas l
      cross join lateral erp.explodir_bom(l.produto_id, l.quantidade) b
     where b.rota = 'produzir' and b.em_falta > 0
     group by b.produto_id
  ), agrupado as (
    select produto_id, sum(qt) as qt from necessario group by produto_id
  ), carga as (
    select e.centro_id,
           sum(r.tempo_setup_min + r.tempo_unitario_min * a.qt)::numeric as minutos
      from agrupado a
      join erp.produto_roteiro r on r.produto_id = a.produto_id and r.eliminado_em is null
      join erp.etapas_producao e on e.id = r.etapa_id and e.eliminado_em is null
     where e.centro_id is not null
     group by e.centro_id
  )
  select p_plano_id, c.centro_id, round(c.minutos, 2),
         round(coalesce(d.disp, 0), 2),
         case when coalesce(d.disp, 0) = 0 then 999.99
              else round(least(c.minutos / d.disp * 100, 9999), 2) end
    from carga c
    cross join lateral (select erp.capacidade_centro_periodo(c.centro_id, pl.data_inicio, pl.data_fim) as disp) d;

  select not exists (select 1 from erp.plano_carga
                      where plano_id = p_plano_id and minutos_necessarios > minutos_disponiveis)
    into v_viavel;

  update erp.planos_producao
     set estado = case when estado = 'rascunho' then 'simulado' else estado end,
         viavel = v_viavel, simulado_em = now()
   where id = p_plano_id;

  select jsonb_build_object(
           'viavel', v_viavel,
           'centros', coalesce(jsonb_agg(jsonb_build_object(
             'centro', c.nome,
             'minutos_necessarios', pc.minutos_necessarios,
             'minutos_disponiveis', pc.minutos_disponiveis,
             'ocupacao_pct', pc.ocupacao_pct,
             'excesso', greatest(pc.minutos_necessarios - pc.minutos_disponiveis, 0)
           ) order by pc.ocupacao_pct desc), '[]'::jsonb))
    into v_res
    from erp.plano_carga pc join erp.centros_trabalho c on c.id = pc.centro_id
   where pc.plano_id = p_plano_id;

  return v_res;
end $$;

/* Aprovação: tudo ou nada. OPs por linha, sub-OPs a produzir, compras em falta. */
create or replace function erp.aprovar_plano(p_plano_id uuid, p_justificacao text default null)
 returns jsonb language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  pl erp.planos_producao%rowtype;
  l record;
  b record;
  v_op uuid;
  v_ops int := 0;
  v_subops int := 0;
  v_compras int := 0;
  v_forcado boolean := false;
  v_forn uuid;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem aprovar planos.';
  end if;
  select * into pl from erp.planos_producao where id = p_plano_id and eliminado_em is null for update;
  if pl.id is null then raise exception 'Plano não encontrado.'; end if;
  if pl.estado not in ('rascunho','simulado') then raise exception 'Este plano já foi aprovado ou fechado.'; end if;
  if not exists (select 1 from erp.plano_linhas where plano_id = p_plano_id and eliminado_em is null) then
    raise exception 'O plano não tem linhas.';
  end if;
  if pl.simulado_em is null or pl.viavel is null then
    raise exception 'Simule o plano antes de aprovar.';
  end if;
  if pl.viavel = false then
    if coalesce(trim(p_justificacao), '') = '' then
      raise exception 'Este plano não cabe na capacidade. Escreva a justificação para o aprovar assim mesmo.';
    end if;
    v_forcado := true;
  end if;

  for l in
    select * from erp.plano_linhas
     where plano_id = p_plano_id and eliminado_em is null and op_id is null
     order by urgente desc, prioridade, data_necessaria nulls last
  loop
    v_op := erp.criar_op_interna(
      l.produto_id,
      case when l.necessidade_ids is not null and array_length(l.necessidade_ids, 1) > 0
           then l.necessidade_ids else null end,
      l.quantidade, l.data_necessaria, l.prioridade,
      'Plano ' || pl.nome, p_plano_id,
      case when l.necessidade_ids is not null and array_length(l.necessidade_ids, 1) > 0
           then 'cliente' else 'stock' end,
      null);
    update erp.plano_linhas set op_id = v_op where id = l.id;
    v_ops := v_ops + 1;

    for b in select * from erp.explodir_bom(l.produto_id, l.quantidade::numeric)
              where em_falta > 0
    loop
      if b.rota = 'produzir' then
        perform erp.criar_op_interna(b.produto_id, null, ceil(b.em_falta)::int,
                                     l.data_necessaria, l.prioridade,
                                     'Componente do plano ' || pl.nome, p_plano_id, 'stock', v_op);
        v_subops := v_subops + 1;
      elsif b.rota = 'comprar' then
        select fornecedor_id into v_forn from erp.produtos where id = b.produto_id;
        insert into erp.necessidades_compra (produto_id, fornecedor_id, quantidade, origem, op_id)
        values (b.produto_id, v_forn, ceil(b.em_falta)::int, 'producao', v_op);
        v_compras := v_compras + 1;
      end if;
    end loop;
  end loop;

  update erp.planos_producao
     set estado = 'aprovado', aprovado_em = now(), aprovado_por = auth.uid(),
         forcado = v_forcado,
         justificacao_forcado = case when v_forcado then trim(p_justificacao) else justificacao_forcado end
   where id = p_plano_id;

  return jsonb_build_object('ops', v_ops, 'sub_ops', v_subops, 'compras', v_compras, 'forcado', v_forcado);
end $$;

-- ============================================================
-- centros e roteiros: gravação
-- ============================================================
create or replace function erp.gravar_centro(
  p_id uuid, p_codigo text, p_nome text, p_responsavel_id uuid,
  p_capacidade_min_dia int, p_n_postos int, p_eficiencia_pct numeric, p_ativo boolean
) returns uuid language plpgsql security definer set search_path to 'erp','public'
as $$
declare v_id uuid;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem gerir centros de trabalho.';
  end if;
  if coalesce(trim(p_codigo), '') = '' or coalesce(trim(p_nome), '') = '' then
    raise exception 'O centro precisa de código e nome.';
  end if;
  if p_id is null then
    insert into erp.centros_trabalho (codigo, nome, responsavel_id, capacidade_min_dia, n_postos, eficiencia_pct, ativo)
    values (upper(trim(p_codigo)), trim(p_nome), p_responsavel_id, coalesce(p_capacidade_min_dia, 480),
            coalesce(p_n_postos, 1), coalesce(p_eficiencia_pct, 100), coalesce(p_ativo, true))
    returning id into v_id;
  else
    update erp.centros_trabalho
       set codigo = upper(trim(p_codigo)), nome = trim(p_nome), responsavel_id = p_responsavel_id,
           capacidade_min_dia = coalesce(p_capacidade_min_dia, 480), n_postos = coalesce(p_n_postos, 1),
           eficiencia_pct = coalesce(p_eficiencia_pct, 100), ativo = coalesce(p_ativo, true)
     where id = p_id and eliminado_em is null
    returning id into v_id;
    if v_id is null then raise exception 'Centro de trabalho não encontrado.'; end if;
  end if;
  return v_id;
end $$;

create or replace function erp.gravar_centro_operador(p_centro_id uuid, p_utilizador_id uuid, p_minutos_dia int)
 returns uuid language plpgsql security definer set search_path to 'erp','public'
as $$
declare v_id uuid;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem atribuir operadores.';
  end if;
  insert into erp.centro_operadores (centro_id, utilizador_id, minutos_dia)
  values (p_centro_id, p_utilizador_id, coalesce(p_minutos_dia, 480))
  on conflict (centro_id, utilizador_id) do update
     set minutos_dia = coalesce(p_minutos_dia, 480), eliminado_em = null,
         eliminado_por = null, motivo_eliminacao = null
  returning id into v_id;
  return v_id;
end $$;

create or replace function erp.remover_centro_operador(p_id uuid, p_motivo text default 'Saiu do centro')
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem retirar operadores.';
  end if;
  update erp.centro_operadores set eliminado_em = now(), eliminado_por = auth.uid(),
         motivo_eliminacao = p_motivo where id = p_id and eliminado_em is null;
end $$;

create or replace function erp.ligar_etapa_centro(p_etapa_id uuid, p_centro_id uuid)
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem alterar etapas.';
  end if;
  update erp.etapas_producao set centro_id = p_centro_id where id = p_etapa_id and eliminado_em is null;
end $$;

create or replace function erp.gravar_roteiro(
  p_id uuid, p_produto_id uuid, p_etapa_id uuid, p_ordem int,
  p_tempo_setup_min int, p_tempo_unitario_min numeric, p_instrucoes text
) returns uuid language plpgsql security definer set search_path to 'erp','public'
as $$
declare v_id uuid;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem definir roteiros.';
  end if;
  if p_id is null then
    insert into erp.produto_roteiro (produto_id, etapa_id, ordem, tempo_setup_min, tempo_unitario_min, instrucoes)
    values (p_produto_id, p_etapa_id, coalesce(p_ordem, 1), coalesce(p_tempo_setup_min, 0),
            coalesce(p_tempo_unitario_min, 0), nullif(trim(coalesce(p_instrucoes, '')), ''))
    on conflict (produto_id, etapa_id) do update
       set ordem = coalesce(p_ordem, 1), tempo_setup_min = coalesce(p_tempo_setup_min, 0),
           tempo_unitario_min = coalesce(p_tempo_unitario_min, 0),
           instrucoes = nullif(trim(coalesce(p_instrucoes, '')), ''),
           eliminado_em = null, eliminado_por = null, motivo_eliminacao = null
    returning id into v_id;
  else
    update erp.produto_roteiro
       set produto_id = p_produto_id, etapa_id = p_etapa_id, ordem = coalesce(p_ordem, 1),
           tempo_setup_min = coalesce(p_tempo_setup_min, 0),
           tempo_unitario_min = coalesce(p_tempo_unitario_min, 0),
           instrucoes = nullif(trim(coalesce(p_instrucoes, '')), '')
     where id = p_id and eliminado_em is null
    returning id into v_id;
    if v_id is null then raise exception 'Roteiro não encontrado.'; end if;
  end if;
  return v_id;
end $$;

create or replace function erp.remover_roteiro(p_id uuid, p_motivo text default 'Retirado do roteiro')
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem definir roteiros.';
  end if;
  update erp.produto_roteiro set eliminado_em = now(), eliminado_por = auth.uid(),
         motivo_eliminacao = p_motivo where id = p_id and eliminado_em is null;
end $$;

-- ============================================================
-- etapas: sub-OPs bloqueiam, minutos reais, faltas geram compra/sub-OP
-- ============================================================
create or replace function erp.iniciar_etapa(p_op_etapa_id uuid)
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  et erp.op_etapas%rowtype;
  ant record;
  sub record;
begin
  if not erp.pode_registar_producao() then
    raise exception 'Não tem permissão para registar trabalho de produção.';
  end if;

  select * into et from erp.op_etapas where id = p_op_etapa_id and eliminado_em is null for update;
  if et.id is null then raise exception 'Etapa não encontrada.'; end if;
  if et.estado = 'concluida' then raise exception 'Esta etapa já está concluída.'; end if;

  for ant in
    select oe.*, e.nome, e.exige_conferencia
      from erp.op_etapas oe join erp.etapas_producao e on e.id = oe.etapa_id
     where oe.op_id = et.op_id and oe.ordem < et.ordem and oe.eliminado_em is null
  loop
    if ant.estado <> 'concluida' then
      raise exception 'A etapa "%" ainda não está concluída.', ant.nome;
    end if;
    if ant.exige_conferencia and ant.conferida_por is null then
      raise exception 'A etapa "%" precisa de conferência antes de continuar.', ant.nome;
    end if;
  end loop;

  -- sub-OPs dos componentes desta etapa têm de estar concluídas
  for sub in
    select o.numero, p.nome_cliente
      from erp.ordens_producao o
      join erp.produtos p on p.id = o.produto_id
     where o.op_pai_id = et.op_id and o.eliminado_em is null
       and o.estado in ('planeada','em_curso')
       and exists (select 1 from erp.componentes c
                    where c.produto_id = (select produto_id from erp.ordens_producao where id = et.op_id)
                      and c.componente_id = o.produto_id and c.etapa_id = et.etapa_id
                      and c.eliminado_em is null)
  loop
    raise exception 'Falta concluir a ordem % de "%" antes desta etapa.', sub.numero, sub.nome_cliente;
  end loop;

  update erp.op_etapas
     set estado = 'em_curso', iniciada_em = coalesce(iniciada_em, now()),
         operador_id = coalesce(operador_id, erp.utilizador_atual())
   where id = p_op_etapa_id;

  update erp.ordens_producao
     set estado = case when estado = 'planeada' then 'em_curso'::erp.estado_op else estado end,
         data_inicio = coalesce(data_inicio, current_date),
         etapa_atual_id = et.etapa_id
   where id = et.op_id;
end $$;

create or replace function erp.concluir_etapa(
  p_op_etapa_id uuid,
  p_quantidade_ok int,
  p_quantidade_refugo int default 0,
  p_motivo_refugo text default null,
  p_observacoes text default null
) returns jsonb language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  et erp.op_etapas%rowtype;
  op erp.ordens_producao%rowtype;
  c record;
  v_prev int;
  v_disp int;
  v_cons int;
  v_falta int;
  v_mov bigint;
  v_chave text;
  v_faltas jsonb := '[]'::jsonb;
  v_tem_bom boolean;
  v_forn uuid;
begin
  if not erp.pode_registar_producao() then
    raise exception 'Não tem permissão para registar trabalho de produção.';
  end if;

  select * into et from erp.op_etapas where id = p_op_etapa_id and eliminado_em is null for update;
  if et.id is null then raise exception 'Etapa não encontrada.'; end if;
  if et.estado = 'concluida' then raise exception 'Esta etapa já está concluída.'; end if;
  if coalesce(p_quantidade_ok, 0) < 0 or coalesce(p_quantidade_refugo, 0) < 0 then
    raise exception 'As quantidades não podem ser negativas.';
  end if;
  if coalesce(p_quantidade_ok, 0) + coalesce(p_quantidade_refugo, 0) = 0 then
    raise exception 'Indique quantas peças ficaram boas.';
  end if;
  if coalesce(p_quantidade_refugo, 0) > 0 and coalesce(trim(p_motivo_refugo), '') = '' then
    raise exception 'Escreva o motivo do refugo.';
  end if;

  select * into op from erp.ordens_producao where id = et.op_id for update;
  if op.estado = 'cancelada' then raise exception 'Esta ordem de produção está cancelada.'; end if;

  perform set_config('erp.motor', '1', true);

  for c in
    select co.componente_id, co.quantidade, p.nome_cliente, p.fornecedor_id, p.tipo_fornecimento
      from erp.componentes co
      join erp.produtos p on p.id = co.componente_id
     where co.produto_id = op.produto_id and co.eliminado_em is null and co.etapa_id = et.etapa_id
  loop
    v_prev := ceil(c.quantidade * coalesce(p_quantidade_ok, 0))::int;
    if v_prev <= 0 then continue; end if;

    insert into erp.stock_atual (produto_id) values (c.componente_id) on conflict (produto_id) do nothing;
    select greatest(coalesce(fisico, 0), 0) into v_disp from erp.stock_atual
      where produto_id = c.componente_id for update;

    v_cons := least(v_prev, coalesce(v_disp, 0));
    v_falta := v_prev - v_cons;
    v_mov := null;

    if v_cons > 0 then
      v_chave := 'op:' || et.op_id::text || ':etapa:' || et.id::text || ':' || c.componente_id::text;
      insert into erp.stock_movimentos (produto_id, tipo, quantidade, origem, chave_idempotencia,
                                        documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
      values (c.componente_id, 'saida', -v_cons, 'producao', v_chave,
              'ordem_producao', et.op_id, 'Consumo na ordem de produção ' || op.numero, now(), auth.uid())
      on conflict (chave_idempotencia) do nothing
      returning id into v_mov;
      if v_mov is null then
        select id into v_mov from erp.stock_movimentos where chave_idempotencia = v_chave;
      end if;
    end if;

    insert into erp.op_consumos (op_id, op_etapa_id, componente_id, quantidade_prevista,
                                 quantidade_consumida, quantidade_falta, movimento_id)
    values (et.op_id, et.id, c.componente_id, v_prev, v_cons, v_falta, v_mov);

    if v_falta > 0 then
      v_faltas := v_faltas || jsonb_build_object('componente', c.nome_cliente, 'falta', v_falta);

      select exists (select 1 from erp.componentes x
                      where x.produto_id = c.componente_id and x.eliminado_em is null)
        into v_tem_bom;

      if v_tem_bom then
        -- avisa e resolve: sub-OP automática, sem bloquear a fábrica
        if not exists (select 1 from erp.ordens_producao o
                        where o.op_pai_id = et.op_id and o.produto_id = c.componente_id
                          and o.eliminado_em is null and o.estado in ('planeada','em_curso')) then
          perform erp.criar_op_interna(c.componente_id, null, v_falta, op.data_prevista,
                                       op.prioridade, 'Falta na ordem ' || op.numero,
                                       op.plano_id, 'stock', et.op_id);
        end if;
      else
        select fornecedor_id into v_forn from erp.produtos where id = c.componente_id;
        if not exists (select 1 from erp.necessidades_compra n
                        where n.op_id = et.op_id and n.produto_id = c.componente_id
                          and n.eliminado_em is null and n.estado = 'aberta') then
          insert into erp.necessidades_compra (produto_id, fornecedor_id, quantidade, origem, op_id)
          values (c.componente_id, v_forn, v_falta, 'producao', et.op_id);
        end if;
      end if;
    end if;
  end loop;

  update erp.op_etapas
     set estado = 'concluida',
         quantidade_ok = coalesce(p_quantidade_ok, 0),
         quantidade_refugo = coalesce(p_quantidade_refugo, 0),
         motivo_refugo = nullif(trim(coalesce(p_motivo_refugo, '')), ''),
         observacoes = nullif(trim(coalesce(p_observacoes, '')), ''),
         operador_id = coalesce(operador_id, erp.utilizador_atual()),
         iniciada_em = coalesce(iniciada_em, now()),
         concluida_em = now(),
         minutos_reais = round(extract(epoch from (now() - coalesce(iniciada_em, now()))) / 60.0, 2)
   where id = p_op_etapa_id;

  update erp.ordens_producao
     set estado = case when estado = 'planeada' then 'em_curso'::erp.estado_op else estado end,
         data_inicio = coalesce(data_inicio, current_date),
         quantidade_refugo = quantidade_refugo + coalesce(p_quantidade_refugo, 0),
         etapa_atual_id = coalesce(
           (select oe.etapa_id from erp.op_etapas oe
             where oe.op_id = et.op_id and oe.eliminado_em is null and oe.estado <> 'concluida'
             order by oe.ordem limit 1), et.etapa_id)
   where id = et.op_id;

  perform set_config('erp.motor', '', true);

  return jsonb_build_object('faltas', v_faltas);
end $$;

-- ============================================================
-- concluir_op: destino 'stock' não reserva a ninguém
-- ============================================================
create or replace function erp.concluir_op(p_op_id uuid, p_quantidade int)
 returns jsonb language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  op erp.ordens_producao%rowtype;
  pendente record;
  n record;
  v_chave text;
  v_restante int;
  v_qt_venda int;
  v_reservada int;
  v_falta int;
  v_reservar int;
  v_reserva uuid;
  v_reservado_total int := 0;
begin
  if not erp.pode_registar_producao() then
    raise exception 'Não tem permissão para fechar ordens de produção.';
  end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Indique a quantidade produzida.'; end if;

  select * into op from erp.ordens_producao where id = p_op_id and eliminado_em is null for update;
  if op.id is null then raise exception 'Ordem de produção não encontrada.'; end if;
  if op.estado = 'cancelada' then raise exception 'Esta ordem está cancelada.'; end if;
  if op.estado = 'concluida' then raise exception 'Esta ordem já está concluída.'; end if;
  if op.quantidade_produzida + p_quantidade > op.quantidade then
    raise exception 'Só faltam % unidades nesta ordem.', op.quantidade - op.quantidade_produzida;
  end if;

  select e.nome into pendente
    from erp.op_etapas oe join erp.etapas_producao e on e.id = oe.etapa_id
   where oe.op_id = p_op_id and oe.eliminado_em is null
     and (oe.estado <> 'concluida' or (e.exige_conferencia and oe.conferida_por is null))
   order by oe.ordem limit 1;
  if pendente.nome is not null then
    raise exception 'Falta concluir ou conferir a etapa "%".', pendente.nome;
  end if;

  perform set_config('erp.motor', '1', true);

  v_chave := 'op:' || p_op_id::text || ':' || (op.quantidade_produzida + p_quantidade)::text;
  insert into erp.stock_movimentos (produto_id, tipo, quantidade, origem, chave_idempotencia,
                                    documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
  values (op.produto_id, 'entrada', p_quantidade, 'producao', v_chave,
          'ordem_producao', p_op_id, 'Produção concluída na ordem ' || op.numero, now(), auth.uid())
  on conflict (chave_idempotencia) do nothing;

  v_restante := p_quantidade;

  if op.destino <> 'stock' then
    for n in
      select np.* from erp.necessidades_producao np
       where np.op_id = p_op_id and np.eliminado_em is null and np.estado in ('convertida','aberta')
       order by np.data_necessaria nulls last, np.criado_em
    loop
      exit when v_restante <= 0;
      if n.item_id is null then continue; end if;

      select pi.quantidade into v_qt_venda from erp.pedido_itens pi
        where pi.id = n.item_id and pi.eliminado_em is null;
      if v_qt_venda is null then continue; end if;

      select coalesce(sum(r.quantidade), 0) into v_reservada from erp.reservas r
        where r.linha_id = n.item_id and r.estado = 'ativa' and r.eliminado_em is null;

      v_falta := greatest(v_qt_venda - v_reservada, 0);
      v_reservar := least(v_restante, v_falta);
      if v_reservar <= 0 then continue; end if;

      v_reserva := erp.reservar(op.produto_id, v_reservar, 'pedido', n.pedido_id, n.item_id, null);
      v_reservada := v_reservada + v_reservar;
      v_restante := v_restante - v_reservar;
      v_reservado_total := v_reservado_total + v_reservar;

      update erp.pedido_itens
         set reserva_id = coalesce(reserva_id, v_reserva),
             estado = case when v_reservada >= v_qt_venda then 'reservado'::erp.estado_item else estado end
       where id = n.item_id;

      update erp.necessidades_producao
         set quantidade_reservada = quantidade_reservada + v_reservar,
             estado = case when quantidade_reservada + v_reservar >= n.quantidade
                           then 'produzida' else estado end
       where id = n.id;
    end loop;
  end if;

  update erp.ordens_producao
     set quantidade_produzida = quantidade_produzida + p_quantidade,
         estado = case when quantidade_produzida + p_quantidade >= quantidade
                       then 'concluida'::erp.estado_op else 'em_curso'::erp.estado_op end,
         data_conclusao = case when quantidade_produzida + p_quantidade >= quantidade
                               then current_date else data_conclusao end
   where id = p_op_id;

  if op.destino <> 'stock' then
    for n in
      select distinct np.pedido_id from erp.necessidades_producao np
       where np.op_id = p_op_id and np.pedido_id is not null and np.eliminado_em is null
    loop
      if exists (select 1 from erp.pedidos where id = n.pedido_id and estado = 'confirmado')
         and not exists (
           select 1 from erp.pedido_itens pi
            where pi.pedido_id = n.pedido_id and pi.eliminado_em is null
              and pi.produto_id is not null
              and pi.estado not in ('reservado','recebido','separado','entregue'))
      then
        perform set_config('erp.recalculo', '1', true);
        update erp.pedidos set estado = 'pronto' where id = n.pedido_id;
        perform set_config('erp.recalculo', '', true);
      end if;
    end loop;
  end if;

  perform set_config('erp.motor', '', true);

  return jsonb_build_object('produzido', p_quantidade, 'reservado', v_reservado_total,
                            'sobra', p_quantidade - v_reservado_total);
end $$;

create or replace function erp.regularizar_consumo(p_consumo_id uuid, p_nota text default null)
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
begin
  if not erp.pode_registar_producao() then
    raise exception 'Não tem permissão para regularizar consumos.';
  end if;
  update erp.op_consumos
     set regularizado_em = now(),
         observacoes = nullif(trim(coalesce(p_nota, '')), '')
   where id = p_consumo_id and eliminado_em is null and regularizado_em is null;
end $$;

-- ============================================================
-- Vistas novas e atualizadas (security_invoker = true)
-- ============================================================
create or replace view erp.v_centros_trabalho
 with (security_invoker = true) as
select c.id, c.codigo, c.nome, c.responsavel_id, r.nome as responsavel_nome,
       c.capacidade_min_dia, c.n_postos, c.eficiencia_pct, c.ativo,
       (select count(*) from erp.centro_operadores o
         where o.centro_id = c.id and o.eliminado_em is null)::int as operadores,
       erp.capacidade_centro_dia(c.id) as capacidade_dia,
       (select count(*) from erp.etapas_producao e
         where e.centro_id = c.id and e.eliminado_em is null)::int as etapas,
       c.criado_em, c.atualizado_em
  from erp.centros_trabalho c
  left join erp.utilizadores r on r.id = c.responsavel_id
 where c.eliminado_em is null;

create or replace view erp.v_centro_operadores
 with (security_invoker = true) as
select o.id, o.centro_id, c.nome as centro_nome, o.utilizador_id, u.nome as utilizador_nome,
       u.perfil::text as utilizador_perfil, o.minutos_dia, o.criado_em
  from erp.centro_operadores o
  join erp.centros_trabalho c on c.id = o.centro_id
  join erp.utilizadores u on u.id = o.utilizador_id
 where o.eliminado_em is null and c.eliminado_em is null;

create or replace view erp.v_produto_roteiro
 with (security_invoker = true) as
select r.id, r.produto_id, p.nome_cliente as produto_nome, r.etapa_id, e.nome as etapa_nome,
       e.centro_id, ct.nome as centro_nome, r.ordem, r.tempo_setup_min, r.tempo_unitario_min,
       r.instrucoes, r.criado_em, r.atualizado_em
  from erp.produto_roteiro r
  join erp.produtos p on p.id = r.produto_id
  join erp.etapas_producao e on e.id = r.etapa_id
  left join erp.centros_trabalho ct on ct.id = e.centro_id
 where r.eliminado_em is null;

create or replace view erp.v_planos_producao
 with (security_invoker = true) as
select pl.id, pl.nome, pl.data_inicio, pl.data_fim, pl.estado, pl.viavel, pl.simulado_em,
       pl.aprovado_em, pl.forcado, pl.justificacao_forcado, pl.notas,
       erp.dias_uteis(pl.data_inicio, pl.data_fim) as dias_uteis,
       (select count(*) from erp.plano_linhas l
         where l.plano_id = pl.id and l.eliminado_em is null)::int as linhas,
       (select coalesce(sum(l.quantidade), 0) from erp.plano_linhas l
         where l.plano_id = pl.id and l.eliminado_em is null)::int as unidades,
       (select count(*) from erp.plano_carga pc
         where pc.plano_id = pl.id and pc.minutos_necessarios > pc.minutos_disponiveis)::int as centros_em_excesso,
       pl.criado_em, pl.atualizado_em
  from erp.planos_producao pl
 where pl.eliminado_em is null;

create or replace view erp.v_plano_linhas
 with (security_invoker = true) as
select l.id, l.plano_id, l.produto_id, p.nome_cliente as produto_nome, p.cod_barras,
       l.quantidade, l.prioridade, l.urgente, l.data_necessaria,
       coalesce(array_length(l.necessidade_ids, 1), 0) as vendas,
       l.necessidade_ids, l.op_id, o.numero as op_numero, l.criado_em
  from erp.plano_linhas l
  join erp.produtos p on p.id = l.produto_id
  left join erp.ordens_producao o on o.id = l.op_id
 where l.eliminado_em is null;

create or replace view erp.v_plano_carga
 with (security_invoker = true) as
select pc.id, pc.plano_id, pc.centro_id, c.codigo as centro_codigo, c.nome as centro_nome,
       pc.minutos_necessarios, pc.minutos_disponiveis, pc.ocupacao_pct,
       greatest(pc.minutos_necessarios - pc.minutos_disponiveis, 0) as excesso_minutos,
       (pc.minutos_necessarios > pc.minutos_disponiveis) as acima_capacidade
  from erp.plano_carga pc
  join erp.centros_trabalho c on c.id = pc.centro_id
 where pc.eliminado_em is null;

create or replace view erp.v_consumos_falta
 with (security_invoker = true) as
select oc.id, oc.op_id, o.numero as op_numero, o.estado as op_estado,
       oc.componente_id, k.nome_cliente as componente_nome, k.tipo_fornecimento as componente_tipo,
       oc.quantidade_prevista, oc.quantidade_consumida, oc.quantidade_falta,
       e.nome as etapa_nome, coalesce(s.vendavel, 0) as stock_vendavel,
       exists (select 1 from erp.ordens_producao so
                where so.op_pai_id = oc.op_id and so.produto_id = oc.componente_id
                  and so.eliminado_em is null) as tem_sub_op,
       exists (select 1 from erp.necessidades_compra n
                where n.op_id = oc.op_id and n.produto_id = oc.componente_id
                  and n.eliminado_em is null) as tem_necessidade_compra,
       oc.criado_em
  from erp.op_consumos oc
  join erp.ordens_producao o on o.id = oc.op_id
  join erp.produtos k on k.id = oc.componente_id
  left join erp.op_etapas oe on oe.id = oc.op_etapa_id
  left join erp.etapas_producao e on e.id = oe.etapa_id
  left join erp.stock_atual s on s.produto_id = oc.componente_id
 where oc.eliminado_em is null and oc.quantidade_falta > 0 and oc.regularizado_em is null;

drop view if exists erp.v_ordens_producao;
create view erp.v_ordens_producao
 with (security_invoker = true) as
select o.id, o.numero, o.produto_id, p.nome_cliente as produto_nome, p.cod_barras,
       o.quantidade, o.quantidade_produzida, o.quantidade_refugo,
       greatest(o.quantidade - o.quantidade_produzida, 0) as falta,
       o.estado, o.etapa_atual_id, e.nome as etapa_atual_nome,
       o.data_prevista, o.data_inicio, o.data_conclusao, o.prioridade, o.observacoes,
       o.destino, o.plano_id, pl.nome as plano_nome, o.op_pai_id, opai.numero as op_pai_numero,
       (select count(*) from erp.ordens_producao so
         where so.op_pai_id = o.id and so.eliminado_em is null)::int as sub_ops,
       case when o.estado in ('planeada','em_curso') and o.data_prevista is not null
                 and o.data_prevista < current_date
            then current_date - o.data_prevista else 0 end as dias_atraso,
       (select count(*) from erp.necessidades_producao n
         where n.op_id = o.id and n.eliminado_em is null) as necessidades,
       (select count(*) from erp.op_consumos oc
         where oc.op_id = o.id and oc.quantidade_falta > 0 and oc.regularizado_em is null
           and oc.eliminado_em is null) as consumos_em_falta,
       o.criado_em, o.atualizado_em
  from erp.ordens_producao o
  join erp.produtos p on p.id = o.produto_id
  left join erp.etapas_producao e on e.id = o.etapa_atual_id
  left join erp.planos_producao pl on pl.id = o.plano_id
  left join erp.ordens_producao opai on opai.id = o.op_pai_id
 where o.eliminado_em is null;

-- chão de fábrica: por centro, sem preços, custos ou clientes
drop view if exists erp.v_chao_fabrica;
create view erp.v_chao_fabrica
 with (security_invoker = true) as
select oe.id as op_etapa_id, oe.op_id, o.numero as op_numero,
       o.produto_id, p.nome_cliente as produto_nome, p.cod_barras,
       o.quantidade, o.quantidade_produzida, o.prioridade, o.data_prevista,
       oe.etapa_id, e.codigo as etapa_codigo, e.nome as etapa_nome, e.exige_conferencia,
       coalesce(oe.centro_id, e.centro_id) as centro_id, ct.nome as centro_nome,
       oe.minutos_previstos, oe.minutos_reais,
       oe.ordem, oe.estado, oe.quantidade_ok, oe.quantidade_refugo,
       oe.operador_id, u.nome as operador_nome, oe.iniciada_em,
       (select count(*) from erp.op_etapas a
         where a.op_id = oe.op_id and a.ordem < oe.ordem and a.eliminado_em is null
           and a.estado <> 'concluida') as etapas_anteriores_pendentes,
       (select count(*) from erp.ordens_producao so
         join erp.componentes c on c.componente_id = so.produto_id
             and c.produto_id = o.produto_id and c.etapa_id = oe.etapa_id
             and c.eliminado_em is null
        where so.op_pai_id = oe.op_id and so.eliminado_em is null
          and so.estado in ('planeada','em_curso')) as sub_ops_pendentes
  from erp.op_etapas oe
  join erp.ordens_producao o on o.id = oe.op_id
  join erp.produtos p on p.id = o.produto_id
  join erp.etapas_producao e on e.id = oe.etapa_id
  left join erp.centros_trabalho ct on ct.id = coalesce(oe.centro_id, e.centro_id)
  left join erp.utilizadores u on u.id = oe.operador_id
 where oe.eliminado_em is null and o.eliminado_em is null
   and o.estado in ('planeada','em_curso') and oe.estado <> 'concluida'
   and (
     erp.perfil_atual()::text <> 'producao'
     or exists (select 1 from erp.centro_operadores co
                 where co.centro_id = coalesce(oe.centro_id, e.centro_id)
                   and co.utilizador_id = erp.utilizador_atual()
                   and co.eliminado_em is null)
   );

grant select on erp.v_centros_trabalho, erp.v_centro_operadores, erp.v_produto_roteiro,
                erp.v_planos_producao, erp.v_plano_linhas, erp.v_plano_carga,
                erp.v_consumos_falta to authenticated;
grant select on erp.v_ordens_producao, erp.v_chao_fabrica to authenticated;

grant execute on function erp.capacidade_centro_dia(uuid) to authenticated;
grant execute on function erp.dias_uteis(date, date) to authenticated;
grant execute on function erp.capacidade_centro_periodo(uuid, date, date) to authenticated;
grant execute on function erp.explodir_bom(uuid, numeric) to authenticated;
grant execute on function erp.criar_plano(text, date, date, text) to authenticated;
grant execute on function erp.agrupar_necessidades_no_plano(uuid) to authenticated;
grant execute on function erp.gravar_plano_linha(uuid, uuid, uuid, int, int, boolean, date) to authenticated;
grant execute on function erp.remover_plano_linha(uuid, text) to authenticated;
grant execute on function erp.simular_plano(uuid) to authenticated;
grant execute on function erp.aprovar_plano(uuid, text) to authenticated;
grant execute on function erp.gravar_centro(uuid, text, text, uuid, int, int, numeric, boolean) to authenticated;
grant execute on function erp.gravar_centro_operador(uuid, uuid, int) to authenticated;
grant execute on function erp.remover_centro_operador(uuid, text) to authenticated;
grant execute on function erp.ligar_etapa_centro(uuid, uuid) to authenticated;
grant execute on function erp.gravar_roteiro(uuid, uuid, uuid, int, int, numeric, text) to authenticated;
grant execute on function erp.remover_roteiro(uuid, text) to authenticated;
grant execute on function erp.regularizar_consumo(uuid, text) to authenticated;
revoke execute on function erp.criar_op_interna(uuid, uuid[], int, date, int, text, uuid, text, uuid) from authenticated, anon;
