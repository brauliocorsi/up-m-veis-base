-- ============ registar_entrega (escritório, versão jsonb/date) ============
create or replace function erp.registar_entrega(p_pedido_id uuid, p_linhas jsonb, p_data date default null::date, p_recebido_por text default null::text, p_observacoes text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
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
  v_em_rota boolean := coalesce(current_setting('erp.entrega_rota', true), '') = '1';
  v_falta_pagar numeric(12,2);
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;

  select * into ped from erp.pedidos
   where id = p_pedido_id and eliminado_em is null for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if ped.estado not in ('confirmado','em_preparacao','pronto','agendado','entrega_parcial') then
    raise exception 'Só é possível entregar pedidos confirmados, em preparação, prontos, agendados ou em entrega parcial.';
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

  -- Fora da rota não se fecha uma venda com dinheiro em falta.
  if v_por_entregar <= 0 and not v_em_rota then
    select greatest(p.total - coalesce(p.total_pago, 0), 0)
      into v_falta_pagar
      from erp.pedidos p where p.id = p_pedido_id;
    if coalesce(v_falta_pagar, 0) > 0.004 then
      raise exception 'Esta venda ainda tem % € a receber. Registe o recebimento antes de marcar como entregue.',
        to_char(v_falta_pagar, 'FM999999990.00');
    end if;
  end if;

  v_tipo := case when v_por_entregar <= 0 then 'total' else 'parcial' end;
  update erp.entregas set tipo = v_tipo where id = v_entrega;

  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos
     set estado = case when v_por_entregar <= 0 then 'entregue'::erp.estado_pedido
                       else 'entrega_parcial'::erp.estado_pedido end
   where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  return jsonb_build_object('entrega_id', v_entrega, 'tipo', v_tipo,
    'por_entregar', greatest(v_por_entregar, 0));
end $function$;

-- ============ registar_entrega (versão jsonb/text) ============
create or replace function erp.registar_entrega(p_pedido_id uuid, p_itens jsonb, p_tipo text default 'domicilio'::text, p_nota text default null::text, p_recebido_por text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  v_uid uuid := erp.utilizador_atual();
  v_pedido erp.pedidos;
  v_entrega_id uuid;
  v_item jsonb;
  v_pedido_item erp.pedido_itens;
  v_qtd numeric(12,2);
  v_ja numeric(12,2);
  v_falta numeric(12,2);
  v_total_itens numeric(12,2);
  v_total_entregue numeric(12,2);
begin
  if v_uid is null then
    raise exception 'Sessão inválida.';
  end if;

  select * into v_pedido from erp.pedidos
   where id = p_pedido_id and eliminado_em is null;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;

  if v_pedido.estado not in ('confirmado','em_preparacao','pronto','agendado','entrega_parcial') then
    raise exception 'Só é possível entregar vendas confirmadas, em preparação, prontas, agendadas ou em entrega parcial.';
  end if;

  if p_tipo not in ('domicilio','levantamento') then
    raise exception 'Tipo de entrega inválido.';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Indique o que está a entregar.';
  end if;

  insert into erp.entregas (pedido_id, tipo, nota, recebido_por, criado_por, atualizado_por)
  values (p_pedido_id, p_tipo, nullif(trim(coalesce(p_nota,'')),''), nullif(trim(coalesce(p_recebido_por,'')),''), v_uid, v_uid)
  returning id into v_entrega_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    select * into v_pedido_item from erp.pedido_itens
     where id = (v_item->>'pedido_item_id')::uuid
       and pedido_id = p_pedido_id
       and eliminado_em is null;
    if not found then
      raise exception 'Linha da venda não encontrada.';
    end if;

    v_qtd := coalesce((v_item->>'quantidade')::numeric, 0);
    if v_qtd <= 0 then
      raise exception 'Quantidade inválida.';
    end if;

    select coalesce(sum(ei.quantidade),0) into v_ja
      from erp.entrega_itens ei
      join erp.entregas e on e.id = ei.entrega_id
     where ei.pedido_item_id = v_pedido_item.id
       and ei.eliminado_em is null
       and e.eliminado_em is null
       and e.revertida_em is null;

    v_falta := v_pedido_item.quantidade - v_ja;
    if v_qtd > v_falta then
      raise exception 'Está a entregar mais do que falta nesta linha.';
    end if;

    insert into erp.entrega_itens (entrega_id, pedido_item_id, quantidade, criado_por, atualizado_por)
    values (v_entrega_id, v_pedido_item.id, v_qtd, v_uid, v_uid);

    if v_pedido_item.produto_id is not null then
      perform erp.mover_stock(
        v_pedido_item.produto_id,
        -v_qtd,
        'venda',
        v_entrega_id,
        'Entrega da venda ' || v_pedido.numero
      );

      update erp.reservas
         set quantidade = greatest(quantidade - v_qtd, 0),
             atualizado_em = now(),
             atualizado_por = v_uid
       where pedido_item_id = v_pedido_item.id
         and eliminado_em is null;
    end if;
  end loop;

  select coalesce(sum(pi.quantidade),0) into v_total_itens
    from erp.pedido_itens pi
   where pi.pedido_id = p_pedido_id and pi.eliminado_em is null;

  select coalesce(sum(ei.quantidade),0) into v_total_entregue
    from erp.entrega_itens ei
    join erp.entregas e on e.id = ei.entrega_id
    join erp.pedido_itens pi on pi.id = ei.pedido_item_id
   where pi.pedido_id = p_pedido_id
     and ei.eliminado_em is null
     and e.eliminado_em is null
     and e.revertida_em is null;

  if v_total_entregue >= v_total_itens then
    update erp.pedidos
       set estado = 'entregue',
           data_entrega_real = current_date,
           atualizado_em = now(),
           atualizado_por = v_uid
     where id = p_pedido_id;
  else
    update erp.pedidos
       set estado = 'entrega_parcial',
           atualizado_em = now(),
           atualizado_por = v_uid
     where id = p_pedido_id;
  end if;

  return v_entrega_id;
end;
$function$;

-- ============ reverter_entrega ============
create or replace function erp.reverter_entrega(p_entrega_id uuid, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  ent erp.entregas%rowtype;
  l record;
  v_res_estado text;
  v_entregue_total int;
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

  select coalesce(sum(ei.quantidade), 0) into v_entregue_total
    from erp.entrega_itens ei
    join erp.entregas en on en.id = ei.entrega_id
    join erp.pedido_itens pi on pi.id = ei.pedido_item_id
   where pi.pedido_id = ent.pedido_id and pi.eliminado_em is null
     and ei.eliminado_em is null and en.eliminado_em is null
     and en.estado = 'registada';

  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos
     set estado = case when v_entregue_total > 0 then 'entrega_parcial'::erp.estado_pedido
                       else 'em_preparacao'::erp.estado_pedido end
   where id = ent.pedido_id
     and estado in ('entregue'::erp.estado_pedido, 'entrega_parcial'::erp.estado_pedido);
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);
end $function$;

-- ============ datas e agendamento aceitam entrega parcial ============
create or replace function erp.alterar_data_entrega(p_pedido_id uuid, p_data date, p_motivo_id uuid, p_nota text default null::text)
 returns date
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  ped erp.pedidos%rowtype;
  mot erp.motivos%rowtype;
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;

  select * into ped from erp.pedidos
   where id = p_pedido_id and eliminado_em is null for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if ped.estado not in ('confirmado','em_preparacao','pronto','agendado','entrega_parcial') then
    raise exception 'Só é possível alterar a data de vendas confirmadas, em preparação, prontas, agendadas ou em entrega parcial.';
  end if;

  if p_data is null then
    raise exception 'Indique a nova data de entrega.';
  end if;

  select * into mot from erp.motivos
   where id = p_motivo_id and eliminado_em is null and ativo
     and contexto = 'alteracao_data';
  if not found then
    raise exception 'Escolha um motivo válido para a alteração de data.';
  end if;
  if mot.exige_texto and nullif(trim(coalesce(p_nota,'')),'') is null then
    raise exception 'Este motivo exige uma explicação.';
  end if;

  if ped.data_entrega_prometida is not distinct from p_data then
    raise exception 'A nova data é igual à data atual.';
  end if;

  perform set_config('erp.motor', '1', true);

  update erp.pedidos
     set data_entrega_prometida = p_data,
         data_entrega_origem = 'manual',
         motivo_data_id = p_motivo_id,
         nota_data = nullif(trim(coalesce(p_nota,'')),'')
   where id = p_pedido_id;

  return p_data;
end;
$function$;

create or replace function erp.alterar_data_entrega(p_pedido_id uuid, p_data date, p_origem text default 'manual'::text, p_motivo_id uuid default null::uuid, p_nota text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  v_uid uuid := erp.utilizador_atual();
  v_pedido erp.pedidos;
begin
  if v_uid is null then
    raise exception 'Sessão inválida.';
  end if;

  select * into v_pedido from erp.pedidos
   where id = p_pedido_id and eliminado_em is null;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;

  if v_pedido.estado not in ('confirmado','em_preparacao','pronto','agendado','entrega_parcial') then
    raise exception 'Só é possível alterar a data de vendas confirmadas, em preparação, prontas, agendadas ou em entrega parcial.';
  end if;

  if p_data is null then
    raise exception 'Indique a nova data de entrega.';
  end if;

  update erp.pedidos
     set data_entrega_prometida = p_data,
         data_entrega_origem = p_origem,
         data_entrega_motivo_id = p_motivo_id,
         data_entrega_nota = nullif(trim(coalesce(p_nota,'')),''),
         atualizado_em = now(),
         atualizado_por = v_uid
   where id = p_pedido_id;
end;
$function$;
