-- ============================================================
-- Fase 7 — Financeiro
-- ============================================================

-- 1. Pagamentos: prazo-limite de confirmação e controlo de alertas
alter table erp.pagamentos
  add column if not exists data_limite_confirmacao timestamptz,
  add column if not exists alertado_em timestamptz;

create or replace function erp.tg_pagamentos_limite()
returns trigger language plpgsql security definer set search_path = erp, public as $$
declare v_horas integer;
begin
  if NEW.data_limite_confirmacao is null then
    select prazo_confirmacao_horas into v_horas from erp.formas_pagamento where id = NEW.forma_id;
    if v_horas is not null then
      NEW.data_limite_confirmacao := coalesce(NEW.criado_em, now()) + (v_horas || ' hours')::interval;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists t_pag_limite on erp.pagamentos;
create trigger t_pag_limite before insert on erp.pagamentos
  for each row execute function erp.tg_pagamentos_limite();

select set_config('erp.motor', '1', true);
update erp.pagamentos pg
   set data_limite_confirmacao = pg.criado_em + (f.prazo_confirmacao_horas || ' hours')::interval
  from erp.formas_pagamento f
 where f.id = pg.forma_id and f.prazo_confirmacao_horas is not null
   and pg.data_limite_confirmacao is null;
select set_config('erp.motor', '', true);

-- 2. Quem vê o lado financeiro e os custos
create or replace function erp.pode_ver_financeiro()
returns boolean language sql stable security definer set search_path = erp, public as $$
  select exists (
    select 1 from erp.utilizadores u
    where u.user_id = auth.uid() and u.ativo and u.eliminado_em is null
      and u.perfil in ('adm','financeiro','escritorio','compras')
  )
$$;

create or replace function erp.pode_ver_custos()
returns boolean language sql stable security definer set search_path = erp, public as $$
  select exists (
    select 1 from erp.utilizadores u
    where u.user_id = auth.uid() and u.ativo and u.eliminado_em is null
      and u.perfil in ('adm','financeiro')
  )
$$;

-- 3. Categorias de despesa (configuráveis)
create table if not exists erp.categorias_despesa (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  codigo text not null,
  nome text not null,
  ordem integer not null default 0,
  ativo boolean not null default true
);
create unique index if not exists ux_cat_despesa_codigo on erp.categorias_despesa(codigo)
  where eliminado_em is null;

-- 4. Despesas manuais
create table if not exists erp.despesas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  descricao text not null,
  categoria text not null,
  fornecedor_id uuid references erp.fornecedores(id),
  valor numeric(12,2) not null check (valor > 0),
  data_despesa date not null default current_date,
  data_vencimento date not null,
  recorrente boolean not null default false,
  periodicidade text check (periodicidade in ('mensal','trimestral','anual')),
  conta_pagar_id uuid references erp.contas_pagar(id),
  origem_id uuid references erp.despesas(id),
  comprovativo_url text
);
create index if not exists ix_despesas_fornecedor on erp.despesas(fornecedor_id);
create index if not exists ix_despesas_conta on erp.despesas(conta_pagar_id);
create index if not exists ix_despesas_origem on erp.despesas(origem_id);
create index if not exists ix_despesas_venc on erp.despesas(data_vencimento);

-- 5. Fecho financeiro do dia
create table if not exists erp.fechos_financeiros (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  data date not null,
  recebido_dinheiro numeric(12,2) not null default 0,
  recebido_outras numeric(12,2) not null default 0,
  pago numeric(12,2) not null default 0,
  por_receber numeric(12,2) not null default 0,
  por_pagar numeric(12,2) not null default 0,
  fechado_por uuid references auth.users(id),
  observacoes text
);
create unique index if not exists ux_fecho_dia on erp.fechos_financeiros(data)
  where eliminado_em is null;

-- 6. Contas a pagar: fornecedor opcional (despesas internas)
alter table erp.contas_pagar alter column fornecedor_id drop not null;
create index if not exists ix_cp_fornecedor on erp.contas_pagar(fornecedor_id);
create index if not exists ix_cp_venc on erp.contas_pagar(data_vencimento);

drop view if exists erp.v_contas_pagar;
create view erp.v_contas_pagar as
select cp.*, f.nome as fornecedor_nome, o.numero as oc_numero,
       (cp.valor - cp.valor_pago) as em_divida,
       (cp.data_vencimento - current_date) as dias_para_vencer,
       d.id as despesa_id, d.recorrente, d.periodicidade
  from erp.contas_pagar cp
  left join erp.fornecedores f on f.id = cp.fornecedor_id
  left join erp.ordens_compra o on o.id = cp.oc_id
  left join erp.despesas d on d.conta_pagar_id = cp.id and d.eliminado_em is null
 where cp.eliminado_em is null;

-- 7. Auditoria, eliminação lógica e RLS nas novas tabelas
create trigger t_cat_despesa_campos before insert or update on erp.categorias_despesa
  for each row execute function erp.tg_campos_auditoria();
create trigger t_cat_despesa_aud after insert or update on erp.categorias_despesa
  for each row execute function erp.tg_auditoria();

create trigger t_despesas_campos before insert or update on erp.despesas
  for each row execute function erp.tg_campos_auditoria();
create trigger t_despesas_aud after insert or update on erp.despesas
  for each row execute function erp.tg_auditoria();

create trigger t_fechos_campos before insert or update on erp.fechos_financeiros
  for each row execute function erp.tg_campos_auditoria();
create trigger t_fechos_aud after insert or update on erp.fechos_financeiros
  for each row execute function erp.tg_auditoria();

alter table erp.categorias_despesa enable row level security;
alter table erp.despesas enable row level security;
alter table erp.fechos_financeiros enable row level security;

revoke delete on erp.categorias_despesa from authenticated;
revoke delete on erp.despesas from authenticated;
revoke delete on erp.fechos_financeiros from authenticated;

grant select, insert, update on erp.categorias_despesa to authenticated;
grant select, insert, update on erp.despesas to authenticated;
grant select, insert, update on erp.fechos_financeiros to authenticated;
grant all on erp.categorias_despesa to service_role;
grant all on erp.despesas to service_role;
grant all on erp.fechos_financeiros to service_role;

create policy cd_sel on erp.categorias_despesa for select to authenticated
  using (erp.pode_ver_financeiro());
create policy cd_ins on erp.categorias_despesa for insert to authenticated
  with check (erp.is_adm());
create policy cd_upd on erp.categorias_despesa for update to authenticated
  using (erp.is_adm()) with check (erp.is_adm());

create policy dsp_sel on erp.despesas for select to authenticated using (erp.pode_pagar());
create policy dsp_ins on erp.despesas for insert to authenticated with check (erp.pode_pagar());
create policy dsp_upd on erp.despesas for update to authenticated
  using (erp.pode_pagar()) with check (erp.pode_pagar());

create policy ff_sel on erp.fechos_financeiros for select to authenticated
  using (erp.pode_pagar());
create policy ff_ins on erp.fechos_financeiros for insert to authenticated
  with check (erp.pode_pagar());
create policy ff_upd on erp.fechos_financeiros for update to authenticated
  using (erp.pode_pagar()) with check (erp.pode_pagar());

insert into erp.categorias_despesa (codigo, nome, ordem)
values ('RENDAS','Rendas',1), ('COMBUSTIVEL','Combustível',2), ('SEGUROS','Seguros',3),
       ('SALARIOS','Salários',4), ('MANUTENCAO','Manutenção',5),
       ('ESCRITORIO','Material de escritório',6)
on conflict do nothing;

insert into erp.definicoes (chave, valor, descricao)
values ('limite_diferenca_caixa', '5'::jsonb,
        'Diferença de caixa, em euros, a partir da qual é gerado um alerta financeiro.')
on conflict do nothing;

-- 8. Confirmar pagamento (agora com referência)
drop function if exists erp.confirmar_pagamento(uuid, text);
create or replace function erp.confirmar_pagamento(
  p_pagamento_id uuid, p_referencia text default null, p_comprovativo_url text default null)
returns void language plpgsql security definer set search_path = erp, public as $$
declare pag erp.pagamentos%rowtype; f erp.formas_pagamento%rowtype;
        v_comp text; v_ref text; v_caixa uuid;
begin
  if erp.perfil_atual() not in ('adm','financeiro','escritorio') then
    raise exception 'Só o escritório, o financeiro ou um administrador podem confirmar pagamentos.';
  end if;
  select * into pag from erp.pagamentos where id = p_pagamento_id and eliminado_em is null for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if pag.estado = 'confirmado' then raise exception 'Este pagamento já está confirmado.'; end if;
  if pag.estado in ('rejeitado','devolvido') then
    raise exception 'Este pagamento já foi encerrado e não pode ser confirmado.';
  end if;
  select * into f from erp.formas_pagamento where id = pag.forma_id;
  v_comp := coalesce(nullif(trim(coalesce(p_comprovativo_url,'')),''), pag.comprovativo_url);
  v_ref  := coalesce(nullif(trim(coalesce(p_referencia,'')),''), pag.referencia);
  if f.exige_comprovativo and coalesce(v_comp, '') = '' then
    raise exception 'A forma "%" exige comprovativo. Anexe-o antes de confirmar.', f.nome;
  end if;
  v_caixa := pag.caixa_id;
  if f.entra_caixa then
    v_caixa := erp.caixa_aberto(pag.recebido_por);
    if v_caixa is null then
      raise exception 'Abra o caixa do dia antes de registar recebimentos em dinheiro.';
    end if;
  end if;
  perform set_config('erp.motor', '1', true);
  update erp.pagamentos set estado = 'confirmado', data_confirmacao = now(),
    confirmado_por = auth.uid(), comprovativo_url = v_comp, referencia = v_ref,
    caixa_id = v_caixa, motivo_rejeicao = null
  where id = p_pagamento_id;
  perform set_config('erp.motor', '', true);
end $$;

-- 9. Despesas: criar (com conta a pagar) e gerar a recorrência seguinte
create or replace function erp.criar_despesa(
  p_descricao text, p_categoria text, p_valor numeric, p_data_vencimento date,
  p_fornecedor_id uuid default null, p_data_despesa date default null,
  p_recorrente boolean default false, p_periodicidade text default null,
  p_comprovativo_url text default null, p_origem_id uuid default null)
returns uuid language plpgsql security definer set search_path = erp, public as $$
declare v_conta uuid; v_despesa uuid;
begin
  if not erp.pode_pagar() then
    raise exception 'Só o Financeiro e a Administração podem registar despesas.';
  end if;
  if coalesce(trim(coalesce(p_descricao,'')),'') = '' then
    raise exception 'Escreva a descrição da despesa.';
  end if;
  if p_valor is null or p_valor <= 0 then raise exception 'O valor da despesa tem de ser positivo.'; end if;
  if p_recorrente and coalesce(p_periodicidade,'') not in ('mensal','trimestral','anual') then
    raise exception 'Escolha a periodicidade da despesa recorrente.';
  end if;

  insert into erp.contas_pagar (fornecedor_id, descricao, categoria, valor, data_vencimento)
  values (p_fornecedor_id, p_descricao, p_categoria, round(p_valor,2), p_data_vencimento)
  returning id into v_conta;

  insert into erp.despesas (descricao, categoria, fornecedor_id, valor, data_despesa,
    data_vencimento, recorrente, periodicidade, conta_pagar_id, origem_id, comprovativo_url)
  values (p_descricao, p_categoria, p_fornecedor_id, round(p_valor,2),
    coalesce(p_data_despesa, current_date), p_data_vencimento, p_recorrente,
    case when p_recorrente then p_periodicidade else null end, v_conta, p_origem_id,
    p_comprovativo_url)
  returning id into v_despesa;

  return v_despesa;
end $$;

create or replace function erp.tg_conta_paga_recorrencia()
returns trigger language plpgsql security definer set search_path = erp, public as $$
declare d erp.despesas%rowtype; v_prox date; v_raiz uuid; v_conta uuid;
begin
  if NEW.estado <> 'paga' or coalesce(OLD.estado,'') = 'paga' then return NEW; end if;
  select * into d from erp.despesas
   where conta_pagar_id = NEW.id and eliminado_em is null and recorrente limit 1;
  if not found then return NEW; end if;

  v_prox := case d.periodicidade
    when 'mensal' then d.data_vencimento + interval '1 month'
    when 'trimestral' then d.data_vencimento + interval '3 months'
    else d.data_vencimento + interval '1 year' end::date;
  v_raiz := coalesce(d.origem_id, d.id);

  if exists (
    select 1 from erp.despesas x
     where coalesce(x.origem_id, x.id) = v_raiz
       and x.data_vencimento = v_prox and x.eliminado_em is null
  ) then return NEW; end if;

  insert into erp.contas_pagar (fornecedor_id, descricao, categoria, valor, data_vencimento)
  values (d.fornecedor_id, d.descricao, d.categoria, d.valor, v_prox)
  returning id into v_conta;

  insert into erp.despesas (descricao, categoria, fornecedor_id, valor, data_despesa,
    data_vencimento, recorrente, periodicidade, conta_pagar_id, origem_id)
  values (d.descricao, d.categoria, d.fornecedor_id, d.valor, v_prox, v_prox,
    true, d.periodicidade, v_conta, v_raiz);

  return NEW;
end $$;

drop trigger if exists t_cp_recorrencia on erp.contas_pagar;
create trigger t_cp_recorrencia after update on erp.contas_pagar
  for each row execute function erp.tg_conta_paga_recorrencia();

-- 10. Vistas: contas a receber e financiadores
create or replace view erp.v_despesas as
select d.*, f.nome as fornecedor_nome, c.estado as conta_estado,
       c.valor_pago as conta_valor_pago
  from erp.despesas d
  left join erp.fornecedores f on f.id = d.fornecedor_id
  left join erp.contas_pagar c on c.id = d.conta_pagar_id
 where d.eliminado_em is null;

create or replace view erp.v_categorias_despesa as
select c.* from erp.categorias_despesa c where c.eliminado_em is null;

create or replace view erp.v_fechos_financeiros as
select f.* from erp.fechos_financeiros f where f.eliminado_em is null;

create or replace view erp.v_contas_receber as
select pg.id, pg.pedido_id, pg.forma_id, pg.valor, pg.taxa_pct, pg.valor_liquido,
       pg.estado, pg.data_prevista, pg.criado_em, pg.data_limite_confirmacao,
       pg.referencia, pg.comprovativo_url, pg.recebido_por, pg.observacoes,
       f.nome as forma_nome, f.codigo as forma_codigo, f.momento as forma_momento,
       f.exige_comprovativo, f.entra_caixa, f.prazo_confirmacao_horas,
       p.numero as pedido_numero, p.total as pedido_total, p.estado as pedido_estado,
       p.data_entrega_prevista, p.vendedor_id,
       cl.nome as cliente_nome, u.nome as recebido_por_nome, v.nome as vendedor_nome,
       (pg.data_limite_confirmacao is not null and now() > pg.data_limite_confirmacao) as em_atraso
  from erp.pagamentos pg
  join erp.formas_pagamento f on f.id = pg.forma_id
  join erp.pedidos p on p.id = pg.pedido_id
  join erp.clientes cl on cl.id = p.cliente_id
  left join erp.utilizadores u on u.id = pg.recebido_por
  left join erp.utilizadores v on v.id = p.vendedor_id
 where pg.eliminado_em is null
   and pg.estado in ('pendente','pendente_confirmacao')
   and p.eliminado_em is null
   and p.estado <> 'cancelado';

create or replace view erp.v_financiadores as
select f.codigo as forma_codigo, f.nome as forma_nome,
       pg.estado,
       count(*) as n_pagamentos,
       sum(pg.valor) as bruto,
       sum(round(pg.valor * coalesce(f.taxa_pct,0) / 100, 2)) as taxa,
       sum(coalesce(pg.valor_liquido, pg.valor - round(pg.valor * coalesce(f.taxa_pct,0) / 100, 2))) as liquido
  from erp.pagamentos pg
  join erp.formas_pagamento f on f.id = pg.forma_id
 where pg.eliminado_em is null
   and coalesce(f.taxa_pct, 0) > 0
 group by f.codigo, f.nome, pg.estado;

-- 11. Conciliação
create or replace view erp.v_conciliacao_caixa as
select c.id as caixa_id, c.data, c.utilizador_id, c.utilizador_nome, c.estado,
       c.saldo_abertura, c.total_dinheiro, c.total_saidas, c.total_sangrias,
       (c.saldo_abertura + c.total_dinheiro - c.total_saidas - c.total_sangrias) as esperado,
       c.saldo_contado as contado,
       case when c.saldo_contado is null then null
            else c.saldo_contado - (c.saldo_abertura + c.total_dinheiro - c.total_saidas - c.total_sangrias)
       end as diferenca,
       c.justificacao_diferenca
  from erp.v_caixas c;

create or replace view erp.v_conciliacao_vendas as
select p.id as pedido_id, p.numero, p.estado, p.confirmado_em, p.data_entrega_prevista,
       p.vendedor_id, v.nome as vendedor_nome, cl.nome as cliente_nome, p.total,
       coalesce(t.confirmado, 0) as recebido_confirmado,
       coalesce(t.pendente, 0) as pendente_confirmacao,
       coalesce(t.entrega, 0) as a_receber_entrega,
       round(p.total - coalesce(t.confirmado,0) - coalesce(t.pendente,0) - coalesce(t.entrega,0), 2) as divergencia
  from erp.pedidos p
  left join erp.utilizadores v on v.id = p.vendedor_id
  left join erp.clientes cl on cl.id = p.cliente_id
  left join lateral (
    select sum(case when pg.estado = 'confirmado' then pg.valor else 0 end) as confirmado,
           sum(case when pg.estado in ('pendente','pendente_confirmacao')
                     and coalesce(f.momento,'') <> 'entrega' then pg.valor else 0 end) as pendente,
           sum(case when pg.estado in ('pendente','pendente_confirmacao')
                     and f.momento = 'entrega' then pg.valor else 0 end) as entrega
      from erp.pagamentos pg
      join erp.formas_pagamento f on f.id = pg.forma_id
     where pg.pedido_id = p.id and pg.eliminado_em is null
  ) t on true
 where p.eliminado_em is null
   and p.estado not in ('orcamento','cancelado');

-- 12. Fluxo de caixa previsto (8 semanas)
create or replace view erp.v_fluxo_previsto as
with semanas as (
  select (date_trunc('week', current_date)::date + (n * 7)) as semana
    from generate_series(0, 7) as n
)
select s.semana,
       (s.semana + 6) as fim_semana,
       coalesce((
         select sum(pg.valor) from erp.pagamentos pg
         join erp.formas_pagamento f on f.id = pg.forma_id
         join erp.pedidos p on p.id = pg.pedido_id
        where pg.eliminado_em is null and p.eliminado_em is null
          and p.estado not in ('orcamento','cancelado')
          and pg.estado in ('pendente','pendente_confirmacao')
          and coalesce(pg.data_prevista, p.data_entrega_prevista, pg.criado_em::date)
              between s.semana and s.semana + 6
       ), 0) as a_receber,
       coalesce((
         select sum(cp.valor - cp.valor_pago) from erp.contas_pagar cp
          where cp.eliminado_em is null and cp.estado in ('pendente','paga_parcial')
            and cp.data_vencimento between s.semana and s.semana + 6
       ), 0) as a_pagar
  from semanas s;

-- 13. Margens (só financeiro e administração)
create or replace view erp.v_margem_itens as
select i.id as item_id, i.pedido_id, p.numero as pedido_numero, p.confirmado_em,
       p.vendedor_id, v.nome as vendedor_nome,
       i.descricao, i.quantidade, i.preco_unitario, i.total_linha,
       coalesce(pr.custo_ultimo, 0) as custo_unitario,
       round(coalesce(pr.custo_ultimo,0) * i.quantidade, 2) as custo_total,
       round(i.total_linha - coalesce(pr.custo_ultimo,0) * i.quantidade, 2) as margem,
       case when i.total_linha > 0
            then round(100 * (i.total_linha - coalesce(pr.custo_ultimo,0) * i.quantidade) / i.total_linha, 2)
            else null end as margem_pct
  from erp.pedido_itens i
  join erp.pedidos p on p.id = i.pedido_id
  left join erp.produtos pr on pr.id = i.produto_id
  left join erp.utilizadores v on v.id = p.vendedor_id
 where i.eliminado_em is null and p.eliminado_em is null
   and p.estado not in ('orcamento','cancelado')
   and erp.pode_ver_custos();

create or replace view erp.v_margem_pedidos as
select m.pedido_id, m.pedido_numero, m.confirmado_em, m.vendedor_id, m.vendedor_nome,
       sum(m.total_linha) as vendido, sum(m.custo_total) as custo,
       sum(m.margem) as margem,
       case when sum(m.total_linha) > 0
            then round(100 * sum(m.margem) / sum(m.total_linha), 2) else null end as margem_pct
  from erp.v_margem_itens m
 group by 1,2,3,4,5;

-- 14. Relatórios
create or replace view erp.v_rel_vendas as
select p.id as pedido_id, p.numero, p.estado, p.origem, p.confirmado_em,
       coalesce(p.confirmado_em::date, p.criado_em::date) as data,
       p.vendedor_id, v.nome as vendedor_nome, cl.nome as cliente_nome,
       p.total, p.total_pago, p.estado_pagamento,
       (select string_agg(distinct f.nome, ', ') from erp.pagamentos pg
          join erp.formas_pagamento f on f.id = pg.forma_id
         where pg.pedido_id = p.id and pg.eliminado_em is null) as formas
  from erp.pedidos p
  left join erp.utilizadores v on v.id = p.vendedor_id
  left join erp.clientes cl on cl.id = p.cliente_id
 where p.eliminado_em is null and p.estado not in ('orcamento','cancelado');

create or replace view erp.v_rel_recebimentos as
select coalesce(pg.data_confirmacao::date, pg.data_prevista, pg.criado_em::date) as data,
       f.nome as forma_nome, f.codigo as forma_codigo, pg.estado,
       count(*) as n_pagamentos, sum(pg.valor) as valor
  from erp.pagamentos pg
  join erp.formas_pagamento f on f.id = pg.forma_id
 where pg.eliminado_em is null
 group by 1,2,3,4;

create or replace view erp.v_rel_contas_pagar as
select coalesce(cp.categoria, 'Sem categoria') as categoria, cp.estado,
       cp.data_vencimento, cp.data_pagamento,
       count(*) as n_contas, sum(cp.valor) as valor, sum(cp.valor_pago) as valor_pago,
       sum(cp.valor - cp.valor_pago) as em_divida
  from erp.contas_pagar cp
 where cp.eliminado_em is null
 group by 1,2,3,4;

create or replace view erp.v_rel_atraso_fornecedores as
select o.fornecedor_id, f.nome as fornecedor_nome, o.id as oc_id, o.numero,
       o.data_prevista as prometido, max(r.data) as recebido,
       (max(r.data) - o.data_prevista) as dias_atraso, o.estado
  from erp.ordens_compra o
  join erp.fornecedores f on f.id = o.fornecedor_id
  left join erp.oc_recebimentos r on r.oc_id = o.id and r.eliminado_em is null
 where o.eliminado_em is null
 group by o.fornecedor_id, f.nome, o.id, o.numero, o.data_prevista, o.estado;

create or replace view erp.v_rel_cupoes as
select c.id as cupao_id, c.codigo, c.tipo, c.valor as valor_regra,
       count(u.id) as usos, coalesce(sum(u.desconto), 0) as desconto_total
  from erp.cupoes c
  left join erp.cupao_usos u on u.cupao_id = c.id and u.eliminado_em is null
 where c.eliminado_em is null
 group by 1,2,3,4;

-- 15. Fecho financeiro do dia
create or replace function erp.fechar_dia_financeiro(p_data date default current_date,
                                                    p_observacoes text default null)
returns uuid language plpgsql security definer set search_path = erp, public as $$
declare v_dinheiro numeric(12,2); v_outras numeric(12,2); v_pago numeric(12,2);
        v_receber numeric(12,2); v_pagar numeric(12,2); v_id uuid;
begin
  if not erp.pode_pagar() then
    raise exception 'Só o Financeiro e a Administração podem fechar o dia.';
  end if;
  select coalesce(sum(case when f.entra_caixa then pg.valor else 0 end), 0),
         coalesce(sum(case when f.entra_caixa then 0 else pg.valor end), 0)
    into v_dinheiro, v_outras
    from erp.pagamentos pg join erp.formas_pagamento f on f.id = pg.forma_id
   where pg.eliminado_em is null and pg.estado = 'confirmado'
     and pg.data_confirmacao::date = p_data;

  select coalesce(sum(valor_pago), 0) into v_pago from erp.contas_pagar
   where eliminado_em is null and data_pagamento = p_data;

  select coalesce(sum(valor), 0) into v_receber from erp.v_contas_receber;
  select coalesce(sum(valor - valor_pago), 0) into v_pagar from erp.contas_pagar
   where eliminado_em is null and estado in ('pendente','paga_parcial');

  select id into v_id from erp.fechos_financeiros
   where data = p_data and eliminado_em is null;

  if v_id is null then
    insert into erp.fechos_financeiros (data, recebido_dinheiro, recebido_outras, pago,
      por_receber, por_pagar, fechado_por, observacoes)
    values (p_data, v_dinheiro, v_outras, v_pago, v_receber, v_pagar, auth.uid(), p_observacoes)
    returning id into v_id;
  else
    update erp.fechos_financeiros
       set recebido_dinheiro = v_dinheiro, recebido_outras = v_outras, pago = v_pago,
           por_receber = v_receber, por_pagar = v_pagar, fechado_por = auth.uid(),
           observacoes = coalesce(p_observacoes, observacoes)
     where id = v_id;
  end if;
  return v_id;
end $$;

-- 16. Alertas financeiros automáticos
create or replace function erp.gerar_alertas_financeiros()
returns integer language plpgsql security definer set search_path = erp, public as $$
declare n integer := 0; r record; v_limite numeric;
begin
  select coalesce((valor #>> '{}')::numeric, 5) into v_limite
    from erp.definicoes where chave = 'limite_diferenca_caixa' and eliminado_em is null;
  v_limite := coalesce(v_limite, 5);

  -- Transferências pendentes fora do prazo
  for r in select cr.id, cr.pedido_numero, cr.valor from erp.v_contas_receber cr
            where cr.em_atraso and cr.forma_momento <> 'entrega'
  loop
    if not exists (select 1 from erp.alertas a where a.referencia_id = r.id
                     and a.referencia_tipo = 'pagamento_atraso' and a.eliminado_em is null) then
      insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
      values ('financeiro', 'Pagamento pendente fora do prazo',
              'O pagamento de ' || to_char(r.valor, 'FM999999990.00') || ' € do pedido ' ||
              r.pedido_numero || ' passou o prazo de confirmação.', 'pagamento_atraso', r.id);
      update erp.pagamentos set alertado_em = now() where id = r.id;
      n := n + 1;
    end if;
  end loop;

  -- Pedidos entregues com valor por receber
  for r in select p.id, p.numero, (p.total - p.total_pago) as falta from erp.pedidos p
            where p.eliminado_em is null and p.estado = 'entregue'
              and p.total - p.total_pago > 0
  loop
    if not exists (select 1 from erp.alertas a where a.referencia_id = r.id
                     and a.referencia_tipo = 'entrega_por_receber' and a.eliminado_em is null) then
      insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
      values ('financeiro', 'Entrega com valor por receber',
              'O pedido ' || r.numero || ' foi entregue e faltam ' ||
              to_char(r.falta, 'FM999999990.00') || ' €.', 'entrega_por_receber', r.id);
      n := n + 1;
    end if;
  end loop;

  -- Contas a pagar vencidas
  for r in select cp.id, cp.descricao, (cp.valor - cp.valor_pago) as falta from erp.contas_pagar cp
            where cp.eliminado_em is null and cp.estado in ('pendente','paga_parcial')
              and cp.data_vencimento < current_date
  loop
    if not exists (select 1 from erp.alertas a where a.referencia_id = r.id
                     and a.referencia_tipo = 'conta_vencida' and a.eliminado_em is null) then
      insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
      values ('financeiro', 'Conta a pagar vencida',
              r.descricao || ' — faltam ' || to_char(r.falta, 'FM999999990.00') || ' €.',
              'conta_vencida', r.id);
      n := n + 1;
    end if;
  end loop;

  -- Caixas fechados com diferença acima do limite
  for r in select c.caixa_id, c.utilizador_nome, c.diferenca, c.data from erp.v_conciliacao_caixa c
            where c.estado = 'fechado' and c.diferenca is not null and abs(c.diferenca) > v_limite
  loop
    if not exists (select 1 from erp.alertas a where a.referencia_id = r.caixa_id
                     and a.referencia_tipo = 'caixa_diferenca' and a.eliminado_em is null) then
      insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
      values ('financeiro', 'Caixa fechado com diferença',
              'O caixa de ' || coalesce(r.utilizador_nome, 'equipa') || ' em ' ||
              to_char(r.data, 'DD/MM/YYYY') || ' fechou com ' ||
              to_char(r.diferenca, 'FM999999990.00') || ' € de diferença.',
              'caixa_diferenca', r.caixa_id);
      n := n + 1;
    end if;
  end loop;

  -- Pedidos em divergência
  for r in select p.id, p.numero from erp.pedidos p
            where p.eliminado_em is null and p.estado_pagamento = 'em_divergencia'
  loop
    if not exists (select 1 from erp.alertas a where a.referencia_id = r.id
                     and a.referencia_tipo = 'pedido_divergencia' and a.eliminado_em is null) then
      insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
      values ('financeiro', 'Pedido em divergência',
              'O pedido ' || r.numero || ' tem valor recebido acima do total.',
              'pedido_divergencia', r.id);
      n := n + 1;
    end if;
  end loop;

  return n;
end $$;

-- 17. Grants das vistas
grant select on erp.v_despesas, erp.v_categorias_despesa, erp.v_fechos_financeiros,
  erp.v_contas_receber, erp.v_financiadores, erp.v_conciliacao_caixa,
  erp.v_conciliacao_vendas, erp.v_fluxo_previsto, erp.v_margem_itens,
  erp.v_margem_pedidos, erp.v_rel_vendas, erp.v_rel_recebimentos,
  erp.v_rel_contas_pagar, erp.v_rel_atraso_fornecedores, erp.v_rel_cupoes,
  erp.v_contas_pagar to authenticated;
grant select on erp.v_despesas, erp.v_categorias_despesa, erp.v_fechos_financeiros,
  erp.v_contas_receber, erp.v_financiadores, erp.v_conciliacao_caixa,
  erp.v_conciliacao_vendas, erp.v_fluxo_previsto, erp.v_margem_itens,
  erp.v_margem_pedidos, erp.v_rel_vendas, erp.v_rel_recebimentos,
  erp.v_rel_contas_pagar, erp.v_rel_atraso_fornecedores, erp.v_rel_cupoes,
  erp.v_contas_pagar to service_role;

-- 18. Job diário de alertas financeiros
select cron.unschedule('up-vendas-alertas-financeiros')
 where exists (select 1 from cron.job where jobname = 'up-vendas-alertas-financeiros');
select cron.schedule('up-vendas-alertas-financeiros', '15 7 * * *',
  $$select erp.gerar_alertas_financeiros()$$);
