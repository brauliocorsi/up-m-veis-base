-- 1. Tabela de custos, separada do catálogo
create table if not exists erp.produto_custos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null unique references erp.produtos(id),
  custo_ultimo numeric(12,2) check (custo_ultimo >= 0),
  margem_minima_pct numeric(5,2),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users(id),
  eliminado_em timestamptz,
  eliminado_por uuid references auth.users(id),
  motivo_eliminacao text
);

create trigger tg_produto_custos_campos before insert or update on erp.produto_custos
  for each row execute function erp.tg_campos_auditoria();
create trigger tg_produto_custos_aud after insert or update on erp.produto_custos
  for each row execute function erp.tg_auditoria();

alter table erp.produto_custos enable row level security;

create policy produto_custos_select on erp.produto_custos for select to authenticated
  using (erp.perfil_atual() in ('financeiro','adm','compras'));
create policy produto_custos_insert on erp.produto_custos for insert to authenticated
  with check (erp.perfil_atual() in ('financeiro','adm','compras'));
create policy produto_custos_update on erp.produto_custos for update to authenticated
  using (erp.perfil_atual() in ('financeiro','adm','compras'))
  with check (erp.perfil_atual() in ('financeiro','adm','compras'));

grant select, insert, update on erp.produto_custos to authenticated;
grant all on erp.produto_custos to service_role;
revoke delete on erp.produto_custos from authenticated;

create or replace view erp.v_produto_custos with (security_invoker = true) as
  select * from erp.produto_custos where eliminado_em is null;
grant select on erp.v_produto_custos to authenticated;

-- 2. Migrar valores existentes
insert into erp.produto_custos (produto_id, custo_ultimo, margem_minima_pct)
select p.id, p.custo_ultimo, p.margem_minima_pct
  from erp.produtos p
 where p.custo_ultimo is not null or p.margem_minima_pct is not null
on conflict (produto_id) do nothing;

-- 3. Actualizar quem lê os custos, antes de largar as colunas
create or replace function erp.definir_custos(
  p_produto_id uuid,
  p_custo numeric,
  p_margem_minima_pct numeric
) returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
begin
  if erp.perfil_atual() not in ('financeiro','adm','compras') then
    raise exception 'Não tem permissão para alterar custos.';
  end if;
  if not exists (select 1 from erp.produtos where id = p_produto_id and eliminado_em is null) then
    raise exception 'Produto não encontrado.';
  end if;
  if p_custo is not null and p_custo < 0 then
    raise exception 'O custo não pode ser negativo.';
  end if;
  insert into erp.produto_custos (produto_id, custo_ultimo, margem_minima_pct)
  values (p_produto_id, p_custo, p_margem_minima_pct)
  on conflict (produto_id) do update
     set custo_ultimo = excluded.custo_ultimo,
         margem_minima_pct = excluded.margem_minima_pct,
         eliminado_em = null,
         eliminado_por = null,
         motivo_eliminacao = null;
end $$;

grant execute on function erp.definir_custos(uuid, numeric, numeric) to authenticated;

create or replace function erp.criar_oc(p_fornecedor_id uuid, p_necessidade_ids uuid[])
 returns uuid
 language plpgsql
 security definer
 set search_path to 'erp','public'
as $function$
declare
  forn erp.fornecedores%rowtype;
  n record;
  v_oc uuid;
  v_linha int := 0;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem criar ordens de compra.';
  end if;
  select * into forn from erp.fornecedores where id = p_fornecedor_id and eliminado_em is null;
  if forn.id is null then raise exception 'Fornecedor não encontrado.'; end if;
  if not forn.ativo then raise exception 'O fornecedor "%" está inativo.', forn.nome; end if;
  if p_necessidade_ids is null or array_length(p_necessidade_ids, 1) is null then
    raise exception 'Escolha pelo menos uma necessidade.';
  end if;

  insert into erp.ordens_compra (numero, fornecedor_id, data_prevista)
  values ('RASC-' || lpad(nextval('erp.seq_oc_rascunho')::text, 6, '0'),
          p_fornecedor_id,
          erp.somar_dias_uteis(current_date, forn.prazo_dias))
  returning id into v_oc;

  for n in
    select nc.id, nc.estado, nc.fornecedor_id, nc.produto_id, nc.quantidade, nc.item_id,
           pr.nome_cliente, pc.custo_ultimo
      from erp.necessidades_compra nc
      join erp.produtos pr on pr.id = nc.produto_id
      left join erp.produto_custos pc on pc.produto_id = pr.id and pc.eliminado_em is null
     where nc.id = any(p_necessidade_ids)
       and nc.eliminado_em is null
     order by nc.criado_em
  loop
    if n.estado <> 'aberta' then
      raise exception 'A necessidade do produto "%" já não está aberta.', n.nome_cliente;
    end if;
    if n.fornecedor_id is not null and n.fornecedor_id <> p_fornecedor_id then
      raise exception 'A necessidade do produto "%" pertence a outro fornecedor.', n.nome_cliente;
    end if;
    v_linha := v_linha + 1;
    insert into erp.oc_itens (oc_id, linha, produto_id, descricao, quantidade,
                              custo_unitario, data_prevista_item, necessidade_id, pedido_item_id)
    values (v_oc, v_linha, n.produto_id, n.nome_cliente, n.quantidade,
            coalesce(n.custo_ultimo, 0),
            erp.somar_dias_uteis(current_date, forn.prazo_dias), n.id, n.item_id);

    update erp.necessidades_compra
       set estado = 'encomendada', oc_id = v_oc
     where id = n.id;
  end loop;

  if v_linha = 0 then raise exception 'Nenhuma das necessidades escolhidas pode ser encomendada.'; end if;
  perform erp.recalcular_oc(v_oc);
  return v_oc;
end $function$;

create or replace function erp.criar_oc_linhas(p_fornecedor_id uuid, p_linhas jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'erp','public'
as $function$
declare
  forn erp.fornecedores%rowtype;
  l record;
  n record;
  v_oc uuid;
  v_linha int := 0;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem criar ordens de compra.';
  end if;
  select * into forn from erp.fornecedores where id = p_fornecedor_id and eliminado_em is null;
  if forn.id is null then raise exception 'Fornecedor não encontrado.'; end if;
  if not forn.ativo then raise exception 'O fornecedor "%" está inativo.', forn.nome; end if;
  if p_linhas is null or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Escolha pelo menos uma necessidade.';
  end if;

  insert into erp.ordens_compra (numero, fornecedor_id, data_prevista)
  values ('RASC-' || lpad(nextval('erp.seq_oc_rascunho')::text, 6, '0'),
          p_fornecedor_id,
          erp.somar_dias_uteis(current_date, forn.prazo_dias))
  returning id into v_oc;

  for l in select (x->>'necessidade_id')::uuid as necessidade_id,
                  (x->>'quantidade')::int as quantidade
             from jsonb_array_elements(p_linhas) x
  loop
    select nc.id, nc.estado, nc.fornecedor_id, nc.produto_id, nc.quantidade, nc.item_id,
           pr.nome_cliente, pc.custo_ultimo
      into n
      from erp.necessidades_compra nc
      join erp.produtos pr on pr.id = nc.produto_id
      left join erp.produto_custos pc on pc.produto_id = pr.id and pc.eliminado_em is null
     where nc.id = l.necessidade_id and nc.eliminado_em is null
       for update of nc;
    if n.id is null then raise exception 'Necessidade não encontrada.'; end if;
    if n.estado <> 'aberta' then
      raise exception 'A necessidade do produto "%" já não está aberta.', n.nome_cliente;
    end if;
    if n.fornecedor_id is not null and n.fornecedor_id <> p_fornecedor_id then
      raise exception 'A necessidade do produto "%" pertence a outro fornecedor.', n.nome_cliente;
    end if;
    if coalesce(l.quantidade, 0) < n.quantidade then
      raise exception 'A quantidade a comprar de "%" não pode ser inferior a % unidade(s).',
        n.nome_cliente, n.quantidade;
    end if;

    v_linha := v_linha + 1;
    insert into erp.oc_itens (oc_id, linha, produto_id, descricao, quantidade,
                              custo_unitario, data_prevista_item, necessidade_id, pedido_item_id)
    values (v_oc, v_linha, n.produto_id, n.nome_cliente, l.quantidade,
            coalesce(n.custo_ultimo, 0),
            erp.somar_dias_uteis(current_date, forn.prazo_dias), n.id, n.item_id);

    update erp.necessidades_compra
       set estado = 'encomendada', oc_id = v_oc
     where id = n.id;
  end loop;

  if v_linha = 0 then raise exception 'Nenhuma das necessidades escolhidas pode ser encomendada.'; end if;
  perform erp.recalcular_oc(v_oc);
  return v_oc;
end $function$;

create or replace function erp.converter_pedido_compra(p_id uuid, p_fornecedor_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'erp','public'
as $function$
declare
  pc erp.pedidos_compra%rowtype;
  forn erp.fornecedores%rowtype;
  i record;
  v_oc uuid;
  v_linha int := 0;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem converter pedidos em ordens de compra.';
  end if;
  select * into pc from erp.pedidos_compra where id = p_id and eliminado_em is null for update;
  if pc.id is null then raise exception 'Pedido de compra não encontrado.'; end if;
  if pc.estado <> 'aprovado' then raise exception 'Só um pedido de compra aprovado pode ser convertido.'; end if;
  select * into forn from erp.fornecedores where id = p_fornecedor_id and eliminado_em is null;
  if forn.id is null then raise exception 'Fornecedor não encontrado.'; end if;

  insert into erp.ordens_compra (numero, fornecedor_id, data_prevista, observacoes)
  values ('RASC-' || lpad(nextval('erp.seq_oc_rascunho')::text, 6, '0'), p_fornecedor_id,
          erp.somar_dias_uteis(current_date, forn.prazo_dias),
          'Pedido de compra ' || pc.numero || ': ' || pc.justificacao)
  returning id into v_oc;

  for i in select pci.produto_id, pci.descricao_livre, pci.quantidade, pci.custo_estimado,
                  pr.nome_cliente, pcu.custo_ultimo
             from erp.pedidos_compra_itens pci
             left join erp.produtos pr on pr.id = pci.produto_id
             left join erp.produto_custos pcu on pcu.produto_id = pr.id and pcu.eliminado_em is null
            where pci.pedido_compra_id = p_id and pci.eliminado_em is null
            order by pci.criado_em
  loop
    v_linha := v_linha + 1;
    insert into erp.oc_itens (oc_id, linha, produto_id, descricao, quantidade, custo_unitario,
                              data_prevista_item)
    values (v_oc, v_linha, i.produto_id,
            coalesce(i.nome_cliente, i.descricao_livre), i.quantidade,
            case when i.custo_estimado > 0 then i.custo_estimado else coalesce(i.custo_ultimo, 0) end,
            erp.somar_dias_uteis(current_date, forn.prazo_dias));
  end loop;

  update erp.pedidos_compra set estado = 'convertido', oc_id = v_oc where id = p_id;
  perform erp.recalcular_oc(v_oc);
  return v_oc;
end $function$;

-- 4. Recriar as views sem as colunas do catálogo
drop view if exists erp.v_margem_pedidos;
drop view if exists erp.v_margem_itens;
drop view if exists erp.v_produtos;

create view erp.v_produtos with (security_invoker = true) as
  select id, criado_em, criado_por, atualizado_em, atualizado_por, eliminado_em, eliminado_por,
         motivo_eliminacao, cod_barras, cod_modelo, categoria_id, familia_id, nome_cliente,
         nome_interno, descricao, tipo_fornecimento, fornecedor_id, prazo_producao_dias,
         prazo_fornecedor_dias, n_colis, volume_m3, peso_kg, preco_base, preco_promocional,
         iva_pct, valor_montagem, montagem_obrigatoria, tempo_montagem_min, permite_desconto,
         ponto_reposicao, imagem_url, vendavel, ativo
    from erp.produtos
   where eliminado_em is null;
grant select on erp.v_produtos to authenticated;

alter table erp.produtos drop column custo_ultimo;
alter table erp.produtos drop column margem_minima_pct;

create view erp.v_margem_itens with (security_invoker = true) as
  select i.id as item_id,
         i.pedido_id,
         p.numero as pedido_numero,
         p.confirmado_em,
         p.vendedor_id,
         v.nome as vendedor_nome,
         i.descricao,
         i.quantidade,
         i.preco_unitario,
         i.total_linha,
         coalesce(pc.custo_ultimo, 0::numeric) as custo_unitario,
         round(coalesce(pc.custo_ultimo, 0::numeric) * i.quantidade::numeric, 2) as custo_total,
         round(i.total_linha - coalesce(pc.custo_ultimo, 0::numeric) * i.quantidade::numeric, 2) as margem,
         case when i.total_linha > 0::numeric
              then round(100::numeric * (i.total_linha - coalesce(pc.custo_ultimo, 0::numeric) * i.quantidade::numeric) / i.total_linha, 2)
              else null::numeric end as margem_pct
    from erp.pedido_itens i
    join erp.pedidos p on p.id = i.pedido_id
    left join erp.produtos pr on pr.id = i.produto_id
    left join erp.produto_custos pc on pc.produto_id = pr.id and pc.eliminado_em is null
    left join erp.utilizadores v on v.id = p.vendedor_id
   where i.eliminado_em is null and p.eliminado_em is null
     and p.estado <> all (array['orcamento'::erp.estado_pedido, 'cancelado'::erp.estado_pedido])
     and erp.pode_ver_custos();
grant select on erp.v_margem_itens to authenticated;

create view erp.v_margem_pedidos with (security_invoker = true) as
  select pedido_id,
         pedido_numero,
         confirmado_em,
         vendedor_id,
         vendedor_nome,
         sum(total_linha) as vendido,
         sum(custo_total) as custo,
         sum(margem) as margem,
         case when sum(total_linha) > 0::numeric
              then round(100::numeric * sum(margem) / sum(total_linha), 2)
              else null::numeric end as margem_pct
    from erp.v_margem_itens m
   group by pedido_id, pedido_numero, confirmado_em, vendedor_id, vendedor_nome;
grant select on erp.v_margem_pedidos to authenticated;