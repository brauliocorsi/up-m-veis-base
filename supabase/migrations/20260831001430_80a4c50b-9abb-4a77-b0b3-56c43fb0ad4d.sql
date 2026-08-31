create or replace function erp.registar_entrega(
  p_pedido_id uuid,
  p_itens jsonb,
  p_tipo text default 'domicilio',
  p_nota text default null,
  p_recebido_por text default null
) returns uuid
language plpgsql
security definer
set search_path = erp, public
as $$
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

  if v_pedido.estado not in ('confirmado','em_preparacao','pronto','agendado') then
    raise exception 'Só é possível entregar vendas confirmadas, em preparação, prontas ou agendadas.';
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
  elsif v_pedido.estado not in ('agendado','em_preparacao') then
    update erp.pedidos
       set estado = 'em_preparacao',
           atualizado_em = now(),
           atualizado_por = v_uid
     where id = p_pedido_id;
  end if;

  return v_entrega_id;
end;
$$;

create or replace function erp.alterar_data_entrega(
  p_pedido_id uuid,
  p_data date,
  p_origem text default 'manual',
  p_motivo_id uuid default null,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path = erp, public
as $$
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

  if v_pedido.estado not in ('confirmado','em_preparacao','pronto','agendado') then
    raise exception 'Só é possível alterar a data de vendas confirmadas, em preparação, prontas ou agendadas.';
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
$$;