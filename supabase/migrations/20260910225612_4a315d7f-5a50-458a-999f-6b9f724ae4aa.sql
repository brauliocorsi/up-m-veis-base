CREATE OR REPLACE FUNCTION erp.registar_entrega(p_pedido_id uuid, p_linhas jsonb, p_data date DEFAULT NULL::date, p_recebido_por text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'erp', 'public'
AS $function$
declare
  ped erp.pedidos%rowtype;
  it erp.pedido_itens%rowtype;
  l record;
  r record;
  v_entrega uuid;
  v_entregue int;
  v_falta int;
  v_rest numeric(12,2);
  v_seq int;
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
      v_rest := l.qt;
      v_seq := 0;

      -- consome todas as reservas ativas desta linha, pela ordem de criação
      for r in
        select * from erp.reservas
         where produto_id = it.produto_id
           and estado = 'ativa'
           and eliminado_em is null
           and (linha_id = it.id or id = it.reserva_id)
         order by criado_em
         for update
      loop
        exit when v_rest <= 0;
        if r.quantidade <= v_rest then
          perform erp.consumir_reserva(r.id);
          v_rest := v_rest - r.quantidade;
        else
          v_seq := v_seq + 1;
          update erp.reservas set quantidade = quantidade - v_rest where id = r.id;
          insert into erp.stock_movimentos
            (produto_id, tipo, quantidade, origem, chave_idempotencia,
             documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
          values (it.produto_id, 'saida', -v_rest, 'erp',
            'entrega:' || v_entrega || ':' || it.id || ':p' || v_seq, 'pedido', p_pedido_id,
            'Entrega parcial ao cliente', now(), auth.uid())
          on conflict (chave_idempotencia) do nothing;
          v_rest := 0;
        end if;
      end loop;

      -- o que não estava reservado sai directamente do stock
      if v_rest > 0 then
        insert into erp.stock_movimentos
          (produto_id, tipo, quantidade, origem, chave_idempotencia,
           documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
        values (it.produto_id, 'saida', -v_rest, 'erp',
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

  if v_por_entregar <= 0 and not v_em_rota then
    v_falta_pagar := erp.por_registar_pedido(p_pedido_id);
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

-- Correção dos dados da venda PED-2026-000014
do $$
declare
  r erp.reservas%rowtype;
begin
  perform set_config('erp.motor', '1', true);
  select * into r from erp.reservas
   where id = 'e7e2ea27-7a41-4db8-8581-1d8dcfde87be' and estado = 'ativa';
  if found then
    update erp.reservas set estado = 'consumida', consumida_em = now() where id = r.id;
    insert into erp.stock_movimentos
      (produto_id, tipo, quantidade, origem, chave_idempotencia,
       documento_tipo, documento_id, motivo, ocorrido_em)
    values (r.produto_id, 'saida', -r.quantidade, 'erp',
      r.documento_tipo || ':' || r.documento_id || ':saida:' || r.id,
      r.documento_tipo, r.documento_id, 'Entrega da reserva (correção)', now())
    on conflict (chave_idempotencia) do nothing;
  end if;
  perform set_config('erp.motor', '', true);
end $$;