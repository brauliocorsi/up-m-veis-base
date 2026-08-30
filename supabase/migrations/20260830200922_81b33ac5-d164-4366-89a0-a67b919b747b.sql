-- ============================================================
-- Fase 8 — Entrega e Faturação
-- ============================================================

-- ------------------------------------------------------------ entregas
create table erp.entregas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_id uuid not null references erp.pedidos(id),
  data_entrega date not null default current_date,
  tipo text not null check (tipo in ('total','parcial')),
  entregue_por uuid references erp.utilizadores(id),
  recebido_por_nome text,
  observacoes text,
  assinatura_url text,
  estado text not null default 'registada' check (estado in ('registada','revertida')),
  revertida_em timestamptz,
  revertida_por uuid,
  motivo_reversao text
);
create index entregas_pedido_ix on erp.entregas(pedido_id);
create index entregas_data_ix on erp.entregas(data_entrega);
create index entregas_estado_ix on erp.entregas(estado);

grant select, insert, update on erp.entregas to authenticated;
grant all on erp.entregas to service_role;
alter table erp.entregas enable row level security;
create policy entregas_sel on erp.entregas for select to authenticated using (erp.is_ativo());
create policy entregas_ins on erp.entregas for insert to authenticated with check (erp.is_ativo());
create policy entregas_upd on erp.entregas for update to authenticated using (erp.is_ativo()) with check (erp.is_ativo());

create trigger t_entregas_campos before insert or update on erp.entregas
  for each row execute function erp.tg_campos_auditoria();
create trigger t_entregas_aud after insert or update on erp.entregas
  for each row execute function erp.tg_auditoria();

-- ------------------------------------------------------- entrega_itens
create table erp.entrega_itens (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  entrega_id uuid not null references erp.entregas(id),
  pedido_item_id uuid not null references erp.pedido_itens(id),
  quantidade int not null check (quantidade > 0),
  motivo_nao_entrega text,
  estado_anterior erp.estado_item,
  reserva_id uuid
);
create index entrega_itens_entrega_ix on erp.entrega_itens(entrega_id);
create index entrega_itens_item_ix on erp.entrega_itens(pedido_item_id);

grant select, insert, update on erp.entrega_itens to authenticated;
grant all on erp.entrega_itens to service_role;
alter table erp.entrega_itens enable row level security;
create policy entrega_itens_sel on erp.entrega_itens for select to authenticated using (erp.is_ativo());
create policy entrega_itens_ins on erp.entrega_itens for insert to authenticated with check (erp.is_ativo());
create policy entrega_itens_upd on erp.entrega_itens for update to authenticated using (erp.is_ativo()) with check (erp.is_ativo());

create trigger t_entrega_itens_campos before insert or update on erp.entrega_itens
  for each row execute function erp.tg_campos_auditoria();
create trigger t_entrega_itens_aud after insert or update on erp.entrega_itens
  for each row execute function erp.tg_auditoria();

-- --------------------------------------------------- documentos fiscais
create table erp.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_id uuid not null references erp.pedidos(id),
  entrega_id uuid references erp.entregas(id),
  tipo text not null check (tipo in ('guia_transporte','fatura','fatura_recibo','recibo','nota_credito')),
  estado text not null default 'pendente'
    check (estado in ('pendente','emitido','comunicado_at','anulado','erro')),
  numero text,
  serie text,
  codigo_at text,
  atcud text,
  valor numeric(12,2),
  data_emissao timestamptz,
  data_comunicacao timestamptz,
  chave_idempotencia text not null unique,
  url_pdf text,
  erro text,
  tentativas int not null default 0,
  emitido_por uuid references auth.users(id)
);
create index docfis_pedido_ix on erp.documentos_fiscais(pedido_id);
create index docfis_entrega_ix on erp.documentos_fiscais(entrega_id);
create index docfis_estado_ix on erp.documentos_fiscais(estado);

grant select, insert, update on erp.documentos_fiscais to authenticated;
grant all on erp.documentos_fiscais to service_role;
alter table erp.documentos_fiscais enable row level security;
create policy docfis_sel on erp.documentos_fiscais for select to authenticated using (erp.is_ativo());
create policy docfis_ins on erp.documentos_fiscais for insert to authenticated
  with check (erp.is_ativo() and erp.perfil_atual() in ('adm','financeiro','escritorio'));
create policy docfis_upd on erp.documentos_fiscais for update to authenticated
  using (erp.is_ativo() and erp.perfil_atual() in ('adm','financeiro','escritorio'))
  with check (erp.is_ativo() and erp.perfil_atual() in ('adm','financeiro','escritorio'));

create trigger t_docfis_campos before insert or update on erp.documentos_fiscais
  for each row execute function erp.tg_campos_auditoria();
create trigger t_docfis_aud after insert or update on erp.documentos_fiscais
  for each row execute function erp.tg_auditoria();

-- ------------------------------------------------------ registar entrega
create or replace function erp.registar_entrega(
  p_pedido_id uuid,
  p_linhas jsonb,
  p_data date default null,
  p_recebido_por text default null,
  p_observacoes text default null
) returns jsonb
language plpgsql security definer set search_path to 'erp','public' as $$
declare
  ped erp.pedidos%rowtype;
  it erp.pedido_itens%rowtype;
  l record;
  v_entrega uuid;
  v_entregue int;
  v_falta int;
  v_res_estado text;
  v_res_qt int;
  v_por_entregar int;
  v_tipo text;
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;

  select * into ped from erp.pedidos
   where id = p_pedido_id and eliminado_em is null for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if ped.estado not in ('confirmado','em_preparacao','pronto') then
    raise exception 'Só é possível entregar pedidos confirmados, em preparação ou prontos.';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Indique as linhas a entregar.';
  end if;

  insert into erp.entregas (pedido_id, data_entrega, tipo, entregue_por,
    recebido_por_nome, observacoes)
  values (p_pedido_id, coalesce(p_data, current_date), 'parcial', erp.utilizador_atual(),
    nullif(trim(coalesce(p_recebido_por,'')),''), nullif(trim(coalesce(p_observacoes,'')),''))
  returning id into v_entrega;

  perform set_config('erp.motor', '1', true);

  for l in
    select (e->>'pedido_item_id')::uuid as item_id,
           (e->>'quantidade')::int as qt,
           nullif(trim(coalesce(e->>'motivo_nao_entrega','')),'') as motivo
      from jsonb_array_elements(p_linhas) e
  loop
    if l.qt is null or l.qt <= 0 then
      raise exception 'A quantidade a entregar tem de ser pelo menos 1.';
    end if;

    select * into it from erp.pedido_itens
     where id = l.item_id and pedido_id = p_pedido_id and eliminado_em is null for update;
    if not found then raise exception 'Linha do pedido não encontrada.'; end if;

    select coalesce(sum(ei.quantidade), 0) into v_entregue
      from erp.entrega_itens ei
      join erp.entregas en on en.id = ei.entrega_id
     where ei.pedido_item_id = it.id and ei.eliminado_em is null
       and en.eliminado_em is null and en.estado = 'registada';
    v_falta := it.quantidade - v_entregue;
    if l.qt > v_falta then
      raise exception 'A linha "%" só tem % unidade(s) por entregar.',
        it.descricao, greatest(v_falta, 0);
    end if;

    insert into erp.entrega_itens (entrega_id, pedido_item_id, quantidade,
      motivo_nao_entrega, estado_anterior, reserva_id)
    values (v_entrega, it.id, l.qt, l.motivo, it.estado, it.reserva_id);

    if it.produto_id is not null then
      v_res_estado := null; v_res_qt := null;
      if it.reserva_id is not null then
        select estado, quantidade into v_res_estado, v_res_qt
          from erp.reservas where id = it.reserva_id for update;
      end if;

      if v_res_estado = 'ativa' and v_res_qt <= l.qt then
        -- última parte da reserva: consumir (cria a saída de stock)
        perform erp.consumir_reserva(it.reserva_id);
      elsif v_res_estado = 'ativa' then
        update erp.reservas set quantidade = quantidade - l.qt where id = it.reserva_id;
        insert into erp.stock_movimentos
          (produto_id, tipo, quantidade, origem, chave_idempotencia,
           documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
        values (it.produto_id, 'saida', -l.qt, 'erp',
          'entrega:' || v_entrega || ':' || it.id, 'pedido', p_pedido_id,
          'Entrega parcial ao cliente', now(), auth.uid())
        on conflict (chave_idempotencia) do nothing;
      else
        insert into erp.stock_movimentos
          (produto_id, tipo, quantidade, origem, chave_idempotencia,
           documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
        values (it.produto_id, 'saida', -l.qt, 'erp',
          'entrega:' || v_entrega || ':' || it.id, 'pedido', p_pedido_id,
          'Entrega ao cliente', now(), auth.uid())
        on conflict (chave_idempotencia) do nothing;
      end if;
    end if;

    if v_entregue + l.qt >= it.quantidade then
      update erp.pedido_itens set estado = 'entregue' where id = it.id;
    end if;
  end loop;

  select coalesce(sum(i.quantidade), 0)
       - coalesce((
           select sum(ei.quantidade) from erp.entrega_itens ei
             join erp.entregas en on en.id = ei.entrega_id
             join erp.pedido_itens pi on pi.id = ei.pedido_item_id
            where pi.pedido_id = p_pedido_id and pi.eliminado_em is null
              and ei.eliminado_em is null and en.eliminado_em is null
              and en.estado = 'registada'), 0)
    into v_por_entregar
    from erp.pedido_itens i
   where i.pedido_id = p_pedido_id and i.eliminado_em is null;

  v_tipo := case when v_por_entregar <= 0 then 'total' else 'parcial' end;
  update erp.entregas set tipo = v_tipo where id = v_entrega;

  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos
     set estado = case when v_por_entregar <= 0 then 'entregue'::erp.estado_pedido
                       else 'em_preparacao'::erp.estado_pedido end
   where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  return jsonb_build_object('entrega_id', v_entrega, 'tipo', v_tipo,
    'por_entregar', greatest(v_por_entregar, 0));
end $$;

revoke all on function erp.registar_entrega(uuid, jsonb, date, text, text) from public;
grant execute on function erp.registar_entrega(uuid, jsonb, date, text, text) to authenticated, service_role;

-- ------------------------------------------------------ reverter entrega
create or replace function erp.reverter_entrega(p_entrega_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path to 'erp','public' as $$
declare
  ent erp.entregas%rowtype;
  l record;
  v_res_estado text;
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indique o motivo da devolução.';
  end if;

  select * into ent from erp.entregas
   where id = p_entrega_id and eliminado_em is null for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  if ent.estado <> 'registada' then
    raise exception 'Esta entrega já foi revertida.';
  end if;

  perform set_config('erp.motor', '1', true);

  for l in
    select ei.*, i.produto_id
      from erp.entrega_itens ei
      join erp.pedido_itens i on i.id = ei.pedido_item_id
     where ei.entrega_id = p_entrega_id and ei.eliminado_em is null
  loop
    if l.produto_id is not null then
      insert into erp.stock_movimentos
        (produto_id, tipo, quantidade, origem, chave_idempotencia,
         documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
      values (l.produto_id, 'entrada', l.quantidade, 'erp',
        'entrega:' || p_entrega_id || ':rev:' || l.pedido_item_id, 'pedido', ent.pedido_id,
        'Devolução de entrega: ' || p_motivo, now(), auth.uid())
      on conflict (chave_idempotencia) do nothing;

      if l.reserva_id is not null then
        select estado into v_res_estado from erp.reservas where id = l.reserva_id for update;
        if v_res_estado = 'consumida' then
          update erp.reservas
             set estado = 'ativa', consumida_em = null, quantidade = l.quantidade
           where id = l.reserva_id;
        elsif v_res_estado = 'ativa' then
          update erp.reservas set quantidade = quantidade + l.quantidade
           where id = l.reserva_id;
        end if;
      end if;
    end if;

    update erp.pedido_itens
       set estado = coalesce(l.estado_anterior, 'pendente'::erp.estado_item)
     where id = l.pedido_item_id;
  end loop;

  update erp.entregas
     set estado = 'revertida', revertida_em = now(),
         revertida_por = erp.utilizador_atual(), motivo_reversao = p_motivo
   where id = p_entrega_id;

  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos set estado = 'em_preparacao'::erp.estado_pedido
   where id = ent.pedido_id and estado = 'entregue'::erp.estado_pedido;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);
end $$;

revoke all on function erp.reverter_entrega(uuid, text) from public;
grant execute on function erp.reverter_entrega(uuid, text) to authenticated, service_role;

-- ------------------------------------------------ documentos fiscais (manual)
create or replace function erp.registar_documento_fiscal(
  p_pedido_id uuid,
  p_tipo text,
  p_entrega_id uuid default null,
  p_numero text default null,
  p_serie text default null,
  p_valor numeric default null,
  p_data_emissao timestamptz default null,
  p_codigo_at text default null,
  p_atcud text default null,
  p_url_pdf text default null
) returns uuid
language plpgsql security definer set search_path to 'erp','public' as $$
declare v_id uuid; v_chave text; v_estado text;
begin
  if not erp.is_ativo() or erp.perfil_atual() not in ('adm','financeiro','escritorio') then
    raise exception 'Não tem permissão para registar documentos fiscais.';
  end if;
  if not exists (select 1 from erp.pedidos where id = p_pedido_id and eliminado_em is null) then
    raise exception 'Pedido não encontrado.';
  end if;
  if p_tipo not in ('guia_transporte','fatura','fatura_recibo','recibo','nota_credito') then
    raise exception 'Tipo de documento inválido.';
  end if;

  v_chave := p_pedido_id::text || ':' || p_tipo || ':' || coalesce(p_entrega_id::text, '-');
  v_estado := case when coalesce(trim(coalesce(p_numero,'')),'') = '' then 'pendente' else 'emitido' end;

  begin
    insert into erp.documentos_fiscais (pedido_id, entrega_id, tipo, estado, numero, serie,
      codigo_at, atcud, valor, data_emissao, url_pdf, chave_idempotencia, emitido_por)
    values (p_pedido_id, p_entrega_id, p_tipo, v_estado,
      nullif(trim(coalesce(p_numero,'')),''), nullif(trim(coalesce(p_serie,'')),''),
      nullif(trim(coalesce(p_codigo_at,'')),''), nullif(trim(coalesce(p_atcud,'')),''),
      case when p_valor is null then null else round(p_valor, 2) end,
      case when v_estado = 'emitido' then coalesce(p_data_emissao, now()) else p_data_emissao end,
      nullif(trim(coalesce(p_url_pdf,'')),''), v_chave, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Já existe um documento deste tipo para este pedido e entrega.';
  end;

  return v_id;
end $$;

revoke all on function erp.registar_documento_fiscal(uuid, text, uuid, text, text, numeric, timestamptz, text, text, text) from public;
grant execute on function erp.registar_documento_fiscal(uuid, text, uuid, text, text, numeric, timestamptz, text, text, text) to authenticated, service_role;

create or replace function erp.anular_documento_fiscal(p_documento_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path to 'erp','public' as $$
begin
  if not erp.is_ativo() or erp.perfil_atual() not in ('adm','financeiro','escritorio') then
    raise exception 'Não tem permissão para anular documentos fiscais.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indique o motivo da anulação.';
  end if;
  update erp.documentos_fiscais
     set estado = 'anulado', erro = p_motivo
   where id = p_documento_id and eliminado_em is null and estado <> 'anulado';
  if not found then
    raise exception 'Documento não encontrado ou já anulado.';
  end if;
end $$;

revoke all on function erp.anular_documento_fiscal(uuid, text) from public;
grant execute on function erp.anular_documento_fiscal(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------------ views
create or replace view erp.v_entregas as
select e.id, e.criado_em, e.criado_por, e.atualizado_em, e.atualizado_por,
       e.eliminado_em, e.eliminado_por, e.motivo_eliminacao,
       e.pedido_id, e.data_entrega, e.tipo, e.entregue_por, e.recebido_por_nome,
       e.observacoes, e.assinatura_url, e.estado, e.revertida_em, e.revertida_por,
       e.motivo_reversao,
       p.numero as pedido_numero, p.estado as pedido_estado, p.total as pedido_total,
       p.total_pago as pedido_total_pago, p.vendedor_id, p.cp4_entrega, p.zona_entrega_id,
       p.origem as pedido_origem, p.data_entrega_prevista,
       c.nome as cliente_nome, c.telefone_e164 as cliente_telefone, c.nif as cliente_nif,
       u.nome as entregue_por_nome, v.nome as vendedor_nome, z.nome as zona_nome,
       (select count(*) from erp.entrega_itens ei
         where ei.entrega_id = e.id and ei.eliminado_em is null) as n_linhas,
       (select coalesce(sum(ei.quantidade), 0) from erp.entrega_itens ei
         where ei.entrega_id = e.id and ei.eliminado_em is null) as unidades
  from erp.entregas e
  join erp.pedidos p on p.id = e.pedido_id
  join erp.clientes c on c.id = p.cliente_id
  left join erp.utilizadores u on u.id = e.entregue_por
  left join erp.utilizadores v on v.id = p.vendedor_id
  left join erp.zonas_entrega z on z.id = p.zona_entrega_id
 where e.eliminado_em is null;
alter view erp.v_entregas set (security_invoker = true);

create or replace view erp.v_entrega_itens as
select ei.id, ei.criado_em, ei.criado_por, ei.atualizado_em, ei.atualizado_por,
       ei.eliminado_em, ei.eliminado_por, ei.motivo_eliminacao,
       ei.entrega_id, ei.pedido_item_id, ei.quantidade, ei.motivo_nao_entrega,
       ei.estado_anterior, ei.reserva_id,
       i.pedido_id, i.linha, i.descricao, i.produto_id, i.servico_id,
       i.quantidade as quantidade_pedida, i.estado as estado_item,
       e.data_entrega, e.estado as entrega_estado
  from erp.entrega_itens ei
  join erp.pedido_itens i on i.id = ei.pedido_item_id
  join erp.entregas e on e.id = ei.entrega_id
 where ei.eliminado_em is null;
alter view erp.v_entrega_itens set (security_invoker = true);

-- linhas por entregar (ecrã de entrega)
create or replace view erp.v_pedido_entrega as
select i.id as pedido_item_id, i.pedido_id, i.linha, i.descricao, i.produto_id,
       i.servico_id, i.quantidade, i.estado, i.reserva_id, i.total_linha,
       coalesce((
         select sum(ei.quantidade) from erp.entrega_itens ei
           join erp.entregas en on en.id = ei.entrega_id
          where ei.pedido_item_id = i.id and ei.eliminado_em is null
            and en.eliminado_em is null and en.estado = 'registada'), 0)::int as qt_entregue,
       (i.quantidade - coalesce((
         select sum(ei.quantidade) from erp.entrega_itens ei
           join erp.entregas en on en.id = ei.entrega_id
          where ei.pedido_item_id = i.id and ei.eliminado_em is null
            and en.eliminado_em is null and en.estado = 'registada'), 0))::int as qt_por_entregar,
       p.numero as pedido_numero, p.estado as pedido_estado
  from erp.pedido_itens i
  join erp.pedidos p on p.id = i.pedido_id
 where i.eliminado_em is null and p.eliminado_em is null;
alter view erp.v_pedido_entrega set (security_invoker = true);

create or replace view erp.v_documentos_fiscais as
select d.id, d.criado_em, d.criado_por, d.atualizado_em, d.atualizado_por,
       d.eliminado_em, d.eliminado_por, d.motivo_eliminacao,
       d.pedido_id, d.entrega_id, d.tipo, d.estado, d.numero, d.serie,
       d.codigo_at, d.atcud, d.valor, d.data_emissao, d.data_comunicacao,
       d.chave_idempotencia, d.url_pdf, d.erro, d.tentativas, d.emitido_por,
       p.numero as pedido_numero, p.total as pedido_total, p.estado as pedido_estado,
       c.nome as cliente_nome, c.nif as cliente_nif,
       e.data_entrega,
       (d.valor is not null and d.valor <> p.total) as valor_divergente
  from erp.documentos_fiscais d
  join erp.pedidos p on p.id = d.pedido_id
  join erp.clientes c on c.id = p.cliente_id
  left join erp.entregas e on e.id = d.entrega_id
 where d.eliminado_em is null;
alter view erp.v_documentos_fiscais set (security_invoker = true);

-- lista de pedidos: acrescenta estado fiscal, entrega e detalhe do pendente
create or replace view erp.v_pedidos as
 SELECT p.id, p.criado_em, p.criado_por, p.atualizado_em, p.atualizado_por,
    p.eliminado_em, p.eliminado_por, p.motivo_eliminacao, p.numero, p.tipo, p.origem,
    p.cliente_id, p.vendedor_id, p.estado, p.data_entrega_prevista,
    p.data_entrega_prometida, p.data_entrega_origem, p.motivo_data_id, p.nota_data,
    p.entrega_domicilio, p.morada_entrega, p.cp4_entrega, p.cp3_entrega,
    p.localidade_entrega, p.zona_entrega_id, p.contacto_entrega, p.notas_entrega,
    p.subtotal, p.desconto_linhas, p.desconto_cabecalho_pct, p.desconto_cabecalho,
    p.cupao_id, p.desconto_cupao, p.valor_montagem, p.valor_entrega,
    p.valor_entrega_origem, p.total_sem_iva, p.total_iva, p.total, p.total_pago,
    p.observacoes, p.observacoes_internas, p.confirmado_em, p.confirmado_por,
    p.cancelado_em, p.cancelado_por, p.motivo_cancelamento_id, p.nota_cancelamento,
    p.reaberto_em, p.reaberto_por, p.nota_reabertura, p.estado_pagamento,
    c.nome AS cliente_nome,
    c.telefone_e164 AS cliente_telefone,
    c.nif AS cliente_nif,
    u.nome AS vendedor_nome,
    z.nome AS zona_nome,
    ( SELECT count(*) AS count
           FROM erp.pedido_itens i
          WHERE i.pedido_id = p.id AND i.eliminado_em IS NULL) AS n_itens,
    GREATEST(p.total - p.total_pago, 0::numeric) AS falta_pagar,
    -- fase 8
    case
      when exists (select 1 from erp.documentos_fiscais d where d.pedido_id = p.id
                    and d.eliminado_em is null and d.eliminado_em is null
                    and d.tipo = 'nota_credito' and d.estado in ('emitido','comunicado_at'))
        then 'nota_credito'
      when exists (select 1 from erp.documentos_fiscais d where d.pedido_id = p.id
                    and d.eliminado_em is null
                    and d.tipo in ('fatura','fatura_recibo') and d.estado in ('emitido','comunicado_at'))
        then 'faturado'
      when exists (select 1 from erp.documentos_fiscais d where d.pedido_id = p.id
                    and d.eliminado_em is null
                    and d.tipo = 'guia_transporte' and d.estado in ('emitido','comunicado_at'))
        then 'guia_emitida'
      else 'sem_documento'
    end as estado_fiscal,
    (select max(e.data_entrega) from erp.entregas e
      where e.pedido_id = p.id and e.eliminado_em is null and e.estado = 'registada') as data_entrega_efetiva,
    coalesce((select sum(i.quantidade) from erp.pedido_itens i
               where i.pedido_id = p.id and i.eliminado_em is null), 0)
      - coalesce((select sum(ei.quantidade) from erp.entrega_itens ei
                   join erp.entregas en on en.id = ei.entrega_id
                   join erp.pedido_itens i2 on i2.id = ei.pedido_item_id
                  where i2.pedido_id = p.id and i2.eliminado_em is null
                    and ei.eliminado_em is null and en.eliminado_em is null
                    and en.estado = 'registada'), 0) as unidades_por_entregar,
    coalesce((select sum(pg.valor) from erp.pagamentos pg
               where pg.pedido_id = p.id and pg.eliminado_em is null
                 and pg.estado in ('pendente','pendente_confirmacao')), 0)::numeric(12,2)
      as pendente_confirmacao,
    coalesce((select sum(pg.valor) from erp.pagamentos pg
               join erp.formas_pagamento f on f.id = pg.forma_id
               where pg.pedido_id = p.id and pg.eliminado_em is null
                 and pg.estado in ('pendente','pendente_confirmacao')
                 and f.momento = 'entrega'), 0)::numeric(12,2) as a_receber_entrega
   FROM erp.pedidos p
     JOIN erp.clientes c ON c.id = p.cliente_id
     LEFT JOIN erp.utilizadores u ON u.id = p.vendedor_id
     LEFT JOIN erp.zonas_entrega z ON z.id = p.zona_entrega_id
  WHERE p.eliminado_em IS NULL;
alter view erp.v_pedidos set (security_invoker = true);

-- entregue por receber (lista de cobranças)
create or replace view erp.v_entregue_por_receber as
select p.id as pedido_id, p.numero, p.estado, p.total, p.total_pago,
       (p.total - p.total_pago)::numeric(12,2) as falta_pagar,
       p.vendedor_id, p.criado_em, p.confirmado_em,
       c.nome as cliente_nome, c.telefone_e164 as cliente_telefone, c.nif as cliente_nif,
       u.nome as vendedor_nome,
       (select max(e.data_entrega) from erp.entregas e
         where e.pedido_id = p.id and e.eliminado_em is null and e.estado = 'registada')
         as data_entrega_efetiva,
       (current_date - (select max(e.data_entrega) from erp.entregas e
         where e.pedido_id = p.id and e.eliminado_em is null and e.estado = 'registada'))
         as dias_desde_entrega
  from erp.pedidos p
  join erp.clientes c on c.id = p.cliente_id
  left join erp.utilizadores u on u.id = p.vendedor_id
 where p.eliminado_em is null
   and p.estado = 'entregue'
   and p.total - p.total_pago > 0;
alter view erp.v_entregue_por_receber set (security_invoker = true);

-- --------------------------------------------------- alertas de faturação
create or replace function erp.gerar_alertas_faturacao(p_dias int default 3)
returns integer
language plpgsql security definer set search_path to 'erp','public' as $$
declare n integer := 0; r record;
begin
  -- entregue há mais de N dias sem fatura
  for r in
    select p.id, p.numero, ep.data_entrega_efetiva
      from erp.pedidos p
      join (select e.pedido_id, max(e.data_entrega) as data_entrega_efetiva
              from erp.entregas e
             where e.eliminado_em is null and e.estado = 'registada'
             group by e.pedido_id) ep on ep.pedido_id = p.id
     where p.eliminado_em is null
       and current_date - ep.data_entrega_efetiva > p_dias
       and not exists (select 1 from erp.documentos_fiscais d
                        where d.pedido_id = p.id and d.eliminado_em is null
                          and d.tipo in ('fatura','fatura_recibo')
                          and d.estado in ('emitido','comunicado_at'))
  loop
    if not exists (select 1 from erp.alertas a where a.referencia_id = r.id
                     and a.referencia_tipo = 'entrega_sem_fatura' and a.eliminado_em is null) then
      insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
      values ('financeiro', 'Entrega sem fatura',
        'O pedido ' || r.numero || ' foi entregue em ' ||
        to_char(r.data_entrega_efetiva, 'DD/MM/YYYY') || ' e ainda não está faturado.',
        'entrega_sem_fatura', r.id);
      n := n + 1;
    end if;
  end loop;

  -- guia emitida sem código AT
  for r in
    select d.id, p.numero from erp.documentos_fiscais d
      join erp.pedidos p on p.id = d.pedido_id
     where d.eliminado_em is null and d.tipo = 'guia_transporte'
       and d.estado in ('emitido','comunicado_at')
       and coalesce(d.codigo_at, '') = ''
  loop
    if not exists (select 1 from erp.alertas a where a.referencia_id = r.id
                     and a.referencia_tipo = 'guia_sem_codigo_at' and a.eliminado_em is null) then
      insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
      values ('escritorio', 'Guia sem código AT',
        'A guia de transporte do pedido ' || r.numero || ' não tem código da AT.',
        'guia_sem_codigo_at', r.id);
      n := n + 1;
    end if;
  end loop;

  -- documento com valor diferente do total do pedido
  for r in
    select d.id, p.numero, d.valor, p.total from erp.documentos_fiscais d
      join erp.pedidos p on p.id = d.pedido_id
     where d.eliminado_em is null and d.tipo in ('fatura','fatura_recibo')
       and d.estado in ('emitido','comunicado_at')
       and d.valor is not null and d.valor <> p.total
  loop
    if not exists (select 1 from erp.alertas a where a.referencia_id = r.id
                     and a.referencia_tipo = 'fatura_valor_divergente' and a.eliminado_em is null) then
      insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
      values ('financeiro', 'Fatura com valor diferente',
        'A fatura do pedido ' || r.numero || ' tem ' ||
        to_char(r.valor, 'FM999999990.00') || ' € e o pedido tem ' ||
        to_char(r.total, 'FM999999990.00') || ' €.',
        'fatura_valor_divergente', r.id);
      n := n + 1;
    end if;
  end loop;

  return n;
end $$;

revoke all on function erp.gerar_alertas_faturacao(int) from public;
grant execute on function erp.gerar_alertas_faturacao(int) to authenticated, service_role;

do $$
begin
  perform cron.schedule('erp_alertas_faturacao', '20 7 * * *',
    $cmd$select erp.gerar_alertas_faturacao(3)$cmd$);
exception when others then
  raise notice 'Agendamento automático não disponível: %', sqlerrm;
end $$;