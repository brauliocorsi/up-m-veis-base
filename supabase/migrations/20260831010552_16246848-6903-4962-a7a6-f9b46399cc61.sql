-- 1. desconto de entrega no pedido
alter table erp.pedidos add column if not exists desconto_entrega numeric(12,2) not null default 0;

-- 2. registo de cada desconto dado na rua
create table if not exists erp.descontos_entrega (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_id uuid not null references erp.pedidos(id),
  paragem_id uuid references erp.rota_paragens(id),
  rota_id uuid references erp.rotas(id),
  valor numeric(12,2) not null,
  motivo text not null,
  concedido_por uuid
);
create index if not exists ix_desc_entrega_pedido on erp.descontos_entrega(pedido_id);
create index if not exists ix_desc_entrega_paragem on erp.descontos_entrega(paragem_id);
create index if not exists ix_desc_entrega_rota on erp.descontos_entrega(rota_id);
create index if not exists ix_desc_entrega_criado_por on erp.descontos_entrega(criado_por);
create index if not exists ix_desc_entrega_concedido_por on erp.descontos_entrega(concedido_por);

grant select on erp.descontos_entrega to authenticated;
grant all on erp.descontos_entrega to service_role;
alter table erp.descontos_entrega enable row level security;

drop policy if exists "descontos_entrega_select" on erp.descontos_entrega;
create policy "descontos_entrega_select" on erp.descontos_entrega
  for select to authenticated
  using (
    eliminado_em is null and (
      erp.perfil_atual() = any (array['adm','financeiro','escritorio','vendedora']::erp.perfil[])
      or erp.pedido_na_minha_rota(pedido_id)
    )
  );

drop trigger if exists t_desc_entrega_campos on erp.descontos_entrega;
create trigger t_desc_entrega_campos before insert or update on erp.descontos_entrega
  for each row execute function erp.tg_campos_auditoria();
drop trigger if exists t_desc_entrega_aud on erp.descontos_entrega;
create trigger t_desc_entrega_aud after insert or update on erp.descontos_entrega
  for each row execute function erp.tg_auditoria();

revoke delete on erp.descontos_entrega from authenticated;

-- 3. o desconto de entrega abate ao total da venda
create or replace function erp.recalcular_pedido(p_pedido_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  ped erp.pedidos%rowtype;
  cup erp.cupoes%rowtype;
  zona erp.zonas_entrega%rowtype;
  r record;
  v_subtotal numeric(12,2) := 0;
  v_desc_linhas numeric(12,2) := 0;
  v_base numeric(12,2) := 0;
  v_desc_cab numeric(12,2) := 0;
  v_desc_cupao numeric(12,2) := 0;
  v_montagem numeric(12,2) := 0;
  v_entrega numeric(12,2) := 0;
  v_iva numeric(12,2) := 0;
  v_volume numeric := 0;
  v_iva_geral numeric := 23;
  v_pct numeric := 0;
  v_pct_cupao numeric := 0;
  v_entrega_gratis boolean := false;
  v_zona uuid;
begin
  perform set_config('erp.recalculo', '1', true);
  select * into ped from erp.pedidos where id = p_pedido_id for update;
  if not found then perform set_config('erp.recalculo', '', true); return; end if;

  update erp.pedido_itens i
  set total_linha = greatest(
        round(i.quantidade * i.preco_unitario, 2)
        - case when i.desconto_pct > 0
            then round(round(i.quantidade * i.preco_unitario, 2) * i.desconto_pct / 100, 2)
            else least(i.desconto_valor, round(i.quantidade * i.preco_unitario, 2)) end, 0)
  where i.pedido_id = p_pedido_id and i.eliminado_em is null;

  select
    coalesce(sum(i.total_linha), 0),
    coalesce(sum(round(i.quantidade * i.preco_unitario, 2) - i.total_linha), 0),
    coalesce(sum(case when i.produto_id is not null and coalesce(p.permite_desconto, true)
                      then i.total_linha else 0 end), 0),
    coalesce(sum(case when i.montagem_incluida
                      then round(i.valor_montagem_unit * i.quantidade, 2) else 0 end), 0),
    coalesce(sum(coalesce(p.volume_m3, 0) * i.quantidade), 0)
  into v_subtotal, v_desc_linhas, v_base, v_montagem, v_volume
  from erp.pedido_itens i
  left join erp.produtos p on p.id = i.produto_id
  where i.pedido_id = p_pedido_id and i.eliminado_em is null;

  v_pct := ped.desconto_cabecalho_pct;
  if v_pct > 0 and v_base > 0 then
    select coalesce(sum(round(i.total_linha * v_pct / 100, 2)), 0) into v_desc_cab
    from erp.pedido_itens i
    left join erp.produtos p on p.id = i.produto_id
    where i.pedido_id = p_pedido_id and i.eliminado_em is null
      and i.produto_id is not null and coalesce(p.permite_desconto, true);
  end if;

  if ped.cupao_id is not null then
    select * into cup from erp.cupoes where id = ped.cupao_id;
    if found then
      if cup.tipo = 'entrega_gratis' then
        v_entrega_gratis := true;
      elsif cup.tipo = 'percentagem' then
        v_pct_cupao := cup.valor;
        v_desc_cupao := round(greatest(v_base - v_desc_cab, 0) * cup.valor / 100, 2);
      else
        v_desc_cupao := least(cup.valor, greatest(v_base - v_desc_cab, 0));
      end if;
      if not cup.acumulavel and v_desc_cupao > 0 and v_desc_cab > 0 then
        if cup.tipo = 'percentagem' then
          v_desc_cupao := round(v_base * cup.valor / 100, 2);
        else
          v_desc_cupao := least(cup.valor, v_base);
        end if;
        if v_desc_cupao >= v_desc_cab then v_desc_cab := 0; else v_desc_cupao := 0; end if;
      end if;
    end if;
  end if;

  v_zona := ped.zona_entrega_id;
  if ped.entrega_domicilio and v_zona is null then
    v_zona := erp.zona_por_cp4(ped.cp4_entrega);
  end if;
  if ped.valor_entrega_origem = 'manual' then
    v_entrega := ped.valor_entrega;
  elsif not ped.entrega_domicilio then
    v_entrega := 0;
  elsif v_zona is not null then
    select * into zona from erp.zonas_entrega where id = v_zona;
    v_entrega := greatest(zona.valor_min, round(zona.valor_base + zona.valor_por_m3 * v_volume, 2));
    if zona.gratis_acima is not null and (v_subtotal - v_desc_cab - v_desc_cupao) >= zona.gratis_acima then
      v_entrega := 0;
    end if;
  end if;
  if v_entrega_gratis then v_entrega := 0; end if;

  select coalesce((valor #>> '{}')::numeric, 23) into v_iva_geral
  from erp.definicoes where chave = 'iva_pct' and eliminado_em is null;

  for r in
    select i.total_linha, i.iva_pct, i.montagem_incluida, i.quantidade, i.valor_montagem_unit,
           (i.produto_id is not null and coalesce(p.permite_desconto, true)) as descontavel
    from erp.pedido_itens i
    left join erp.produtos p on p.id = i.produto_id
    where i.pedido_id = p_pedido_id and i.eliminado_em is null
  loop
    declare
      v_liq numeric(12,2) := r.total_linha;
    begin
      if r.descontavel and v_base > 0 then
        v_liq := v_liq - round(r.total_linha / v_base * (v_desc_cab + v_desc_cupao), 2);
      end if;
      if r.montagem_incluida then
        v_liq := v_liq + round(r.valor_montagem_unit * r.quantidade, 2);
      end if;
      v_iva := v_iva + round(greatest(v_liq, 0) * r.iva_pct / 100, 2);
    end;
  end loop;
  v_iva := v_iva + round(v_entrega * coalesce(v_iva_geral, 23) / 100, 2);

  update erp.pedidos set
    subtotal = v_subtotal,
    desconto_linhas = v_desc_linhas,
    desconto_cabecalho = v_desc_cab,
    desconto_cupao = v_desc_cupao,
    valor_montagem = v_montagem,
    valor_entrega = v_entrega,
    zona_entrega_id = v_zona,
    total_sem_iva = v_subtotal - v_desc_cab - v_desc_cupao + v_montagem + v_entrega,
    total_iva = v_iva,
    total = greatest(v_subtotal - v_desc_cab - v_desc_cupao + v_montagem + v_entrega + v_iva
                     - coalesce(ped.desconto_entrega, 0), 0),
    data_entrega_prevista = case when ped.data_entrega_origem = 'manual'
      then ped.data_entrega_prevista else erp.calcular_data_entrega(p_pedido_id) end
  where id = p_pedido_id;

  perform set_config('erp.recalculo', '', true);
end $function$;

-- 4. desconto dado pelo entregador na paragem
create or replace function erp.aplicar_desconto_entrega(
  p_paragem_id uuid, p_valor numeric, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  par erp.rota_paragens%rowtype; r erp.rotas%rowtype;
  v_pend numeric(12,2); v_desc numeric(12,2);
begin
  select * into par from erp.rota_paragens where id = p_paragem_id and eliminado_em is null for update;
  if not found then raise exception 'Paragem não encontrada.'; end if;
  r := erp.rota_editavel(par.rota_id);
  if par.desfecho is not null then raise exception 'Esta paragem já está fechada.'; end if;
  if coalesce(trim(coalesce(p_motivo,'')), '') = '' then
    raise exception 'Escreva o motivo do desconto.';
  end if;
  v_desc := round(coalesce(p_valor, 0), 2);
  if v_desc <= 0 then raise exception 'Indique o valor do desconto.'; end if;
  v_pend := erp.pendente_pedido(par.pedido_id);
  if v_desc > v_pend + 0.004 then
    raise exception 'Esta venda só tem % € por receber. O desconto não pode ser maior.',
      to_char(v_pend, 'FM999999990.00');
  end if;

  insert into erp.descontos_entrega (pedido_id, paragem_id, rota_id, valor, motivo, concedido_por)
  values (par.pedido_id, par.id, r.id, v_desc, trim(p_motivo), erp.utilizador_atual());

  perform set_config('erp.motor', '1', true);
  update erp.pedidos set desconto_entrega = coalesce(desconto_entrega, 0) + v_desc
   where id = par.pedido_id;
  perform set_config('erp.motor', '', true);

  perform erp.recalcular_pedido(par.pedido_id);

  update erp.rota_paragens set previsto_receber = erp.pendente_pedido(par.pedido_id)
   where id = par.id;

  return jsonb_build_object('desconto', v_desc,
    'falta_receber', erp.pendente_pedido(par.pedido_id));
end $function$;

-- 5. retirar produto na entrega: sai da venda e abate ao valor a receber
create or replace function erp.retirar_item_entrega(
  p_paragem_id uuid, p_pedido_item_id uuid, p_quantidade integer, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  par erp.rota_paragens%rowtype; r erp.rotas%rowtype; it erp.pedido_itens%rowtype;
  v_entregue int; v_disp int; v_qt int; v_res_qt int; v_res_estado text; v_nova int;
begin
  select * into par from erp.rota_paragens where id = p_paragem_id and eliminado_em is null for update;
  if not found then raise exception 'Paragem não encontrada.'; end if;
  r := erp.rota_editavel(par.rota_id);
  if par.desfecho is not null then raise exception 'Esta paragem já está fechada.'; end if;
  if coalesce(trim(coalesce(p_motivo,'')), '') = '' then
    raise exception 'Escreva o motivo de retirar o produto.';
  end if;

  select * into it from erp.pedido_itens
   where id = p_pedido_item_id and pedido_id = par.pedido_id and eliminado_em is null for update;
  if not found then raise exception 'Linha da venda não encontrada.'; end if;

  select coalesce(sum(ei.quantidade), 0) into v_entregue
    from erp.entrega_itens ei
    join erp.entregas en on en.id = ei.entrega_id
   where ei.pedido_item_id = it.id and ei.eliminado_em is null
     and en.eliminado_em is null and en.estado = 'registada';

  v_disp := it.quantidade - v_entregue;
  v_qt := coalesce(p_quantidade, v_disp);
  if v_qt <= 0 then raise exception 'Indique quantas unidades vai retirar.'; end if;
  if v_qt > v_disp then
    raise exception 'Esta linha só tem % unidade(s) por entregar.', greatest(v_disp, 0);
  end if;

  v_nova := it.quantidade - v_qt;

  if it.reserva_id is not null then
    select estado, quantidade into v_res_estado, v_res_qt
      from erp.reservas where id = it.reserva_id for update;
    if v_res_estado = 'ativa' then
      if coalesce(v_res_qt, 0) - v_qt <= 0 then
        update erp.reservas
           set estado = 'libertada', libertada_em = now(),
               motivo_libertacao = 'Produto retirado na entrega: ' || trim(p_motivo)
         where id = it.reserva_id;
      else
        update erp.reservas set quantidade = v_res_qt - v_qt where id = it.reserva_id;
      end if;
    end if;
  end if;

  perform set_config('erp.motor', '1', true);
  if v_nova <= 0 then
    update erp.pedido_itens
       set eliminado_em = now(), eliminado_por = auth.uid(),
           motivo_eliminacao = 'Retirado na entrega: ' || trim(p_motivo)
     where id = it.id;
  else
    update erp.pedido_itens
       set quantidade = v_nova,
           nota = concat_ws(' · ', nullif(it.nota, ''),
             'Retiradas ' || v_qt || ' unidade(s) na entrega: ' || trim(p_motivo))
     where id = it.id;
  end if;
  perform set_config('erp.motor', '', true);

  perform erp.recalcular_pedido(par.pedido_id);
  perform erp.recalcular_total_pago(par.pedido_id);

  update erp.rota_paragens set previsto_receber = erp.pendente_pedido(par.pedido_id)
   where id = par.id;

  return jsonb_build_object('retiradas', v_qt,
    'falta_receber', erp.pendente_pedido(par.pedido_id));
end $function$;

-- 6. validação: não se fecha uma entrega total com dinheiro em falta
create or replace function erp.registar_desfecho_paragem(p_paragem_id uuid, p_desfecho text, p_linhas jsonb DEFAULT NULL::jsonb, p_motivo_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text, p_data_reagendamento date DEFAULT NULL::date, p_recebido_por text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  par erp.rota_paragens%rowtype; r erp.rotas%rowtype; v_res jsonb; v_entrega uuid;
  v_exige boolean; v_falta numeric(12,2); v_total_por_entregar int; v_pedidas int;
begin
  select * into par from erp.rota_paragens where id = p_paragem_id and eliminado_em is null for update;
  if not found then raise exception 'Paragem não encontrada.'; end if;
  r := erp.rota_editavel(par.rota_id);
  if par.desfecho is not null then raise exception 'Esta paragem já está fechada.'; end if;
  if p_desfecho not in ('entregue','parcial','reagendada','cancelada','ausente') then
    raise exception 'Desfecho inválido.';
  end if;

  if p_desfecho in ('reagendada','cancelada','ausente') then
    if p_motivo_id is null then raise exception 'Indique o motivo da lista.'; end if;
    select exige_texto into v_exige from erp.motivos where id = p_motivo_id;
    if coalesce(v_exige, false) and coalesce(trim(coalesce(p_motivo,'')), '') = '' then
      raise exception 'Este motivo exige uma explicação escrita.';
    end if;
  end if;

  if p_desfecho in ('entregue','parcial') then
    if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
      raise exception 'Indique o que foi entregue.';
    end if;

    -- entrega total: o dinheiro tem de estar resolvido antes de fechar
    select coalesce(sum(i.quantidade), 0)
         - coalesce((
             select sum(ei.quantidade) from erp.entrega_itens ei
               join erp.entregas en on en.id = ei.entrega_id
               join erp.pedido_itens pi on pi.id = ei.pedido_item_id
              where pi.pedido_id = par.pedido_id and pi.eliminado_em is null
                and ei.eliminado_em is null and en.eliminado_em is null
                and en.estado = 'registada'), 0)
      into v_total_por_entregar
      from erp.pedido_itens i
     where i.pedido_id = par.pedido_id and i.eliminado_em is null;

    select coalesce(sum((e->>'quantidade')::int), 0) into v_pedidas
      from jsonb_array_elements(p_linhas) e;

    if v_pedidas >= v_total_por_entregar then
      v_falta := erp.pendente_pedido(par.pedido_id);
      if coalesce(v_falta, 0) > 0.004 then
        raise exception 'Faltam receber % €. Registe o recebimento, retire um produto ou aplique um desconto antes de fechar a entrega.',
          to_char(v_falta, 'FM999999990.00');
      end if;
    end if;

    perform set_config('erp.entrega_rota', '1', true);
    v_res := erp.registar_entrega(par.pedido_id, p_linhas, r.data, p_recebido_por, p_motivo);
    perform set_config('erp.entrega_rota', '', true);
    v_entrega := (v_res->>'entrega_id')::uuid;
  end if;

  if p_desfecho = 'reagendada' then
    if p_data_reagendamento is null then
      raise exception 'Indique a data combinada com o cliente.';
    end if;
    perform set_config('erp.recalculo', '1', true);
    update erp.pedidos
       set data_entrega_prevista = p_data_reagendamento,
           data_entrega_prometida = p_data_reagendamento,
           data_entrega_origem = 'manual', motivo_data_id = p_motivo_id,
           nota_data = nullif(trim(coalesce(p_motivo,'')),'')
     where id = par.pedido_id;
    perform set_config('erp.recalculo', '', true);
  end if;

  update erp.rota_paragens
     set desfecho = p_desfecho, motivo_id = p_motivo_id,
         motivo = nullif(trim(coalesce(p_motivo,'')),''),
         data_reagendamento = p_data_reagendamento,
         entrega_id = v_entrega, concluida_em = now()
   where id = p_paragem_id;

  return jsonb_build_object('paragem_id', p_paragem_id, 'desfecho', p_desfecho,
    'entrega_id', v_entrega);
end $function$;

-- 7. cartão do entregador: itens, montagens e valores
create or replace view erp.v_rota_paragens as
 select rp.id, rp.criado_em, rp.criado_por, rp.atualizado_em, rp.atualizado_por,
    rp.eliminado_em, rp.eliminado_por, rp.motivo_eliminacao,
    rp.rota_id, rp.pedido_id, rp.ordem, rp.previsto_receber, rp.desfecho,
    rp.data_reagendamento, rp.motivo_id, rp.motivo, rp.entrega_id, rp.concluida_em,
    r.data as rota_data, r.nome as rota_nome, r.estado as rota_estado, r.responsavel_id,
    p.numero as pedido_numero, p.estado as pedido_estado, p.total, p.total_pago,
    erp.pendente_pedido(p.id) as pendente,
    p.morada_entrega, p.localidade_entrega, p.cp4_entrega, p.cp3_entrega,
    p.contacto_entrega, p.notas_entrega, p.entrega_domicilio,
    c.nome as cliente, c.telefone_e164 as cliente_telefone, c.telefone_alt as cliente_telefone_alt,
    m.descricao as motivo_descricao, rp.excedeu_capacidade,
    coalesce(it.n_itens, 0)::int as n_itens,
    coalesce(it.n_montagens, 0)::int as n_montagens,
    coalesce(p.desconto_entrega, 0) as desconto_entrega
   from erp.rota_paragens rp
     join erp.rotas r on r.id = rp.rota_id
     join erp.pedidos p on p.id = rp.pedido_id
     left join erp.clientes c on c.id = p.cliente_id
     left join erp.motivos m on m.id = rp.motivo_id
     left join lateral (
       select sum(i.quantidade)::int as n_itens,
              sum(case when i.montagem_incluida then i.quantidade else 0 end)::int as n_montagens
         from erp.pedido_itens i
        where i.pedido_id = p.id and i.eliminado_em is null
     ) it on true
  where rp.eliminado_em is null;

alter view erp.v_rota_paragens set (security_invoker = true);
grant select on erp.v_rota_paragens to authenticated;

create or replace view erp.v_descontos_entrega as
 select d.id, d.criado_em, d.criado_por, d.pedido_id, d.paragem_id, d.rota_id,
        d.valor, d.motivo, d.concedido_por,
        p.numero as pedido_numero, u.nome as concedido_nome, r.nome as rota_nome, r.data as rota_data
   from erp.descontos_entrega d
   join erp.pedidos p on p.id = d.pedido_id
   left join erp.utilizadores u on u.id = d.concedido_por
   left join erp.rotas r on r.id = d.rota_id
  where d.eliminado_em is null;
alter view erp.v_descontos_entrega set (security_invoker = true);
grant select on erp.v_descontos_entrega to authenticated;

grant execute on function erp.aplicar_desconto_entrega(uuid, numeric, text) to authenticated;
grant execute on function erp.retirar_item_entrega(uuid, uuid, integer, text) to authenticated;