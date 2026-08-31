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
  if ped.estado not in ('confirmado','em_preparacao','pronto','agendado') then
    raise exception 'Só é possível entregar pedidos confirmados, em preparação, prontos ou agendados.';
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
                       else 'em_preparacao'::erp.estado_pedido end
   where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  return jsonb_build_object('entrega_id', v_entrega, 'tipo', v_tipo,
    'por_entregar', greatest(v_por_entregar, 0));
end $function$;

CREATE OR REPLACE FUNCTION erp.registar_desfecho_paragem(p_paragem_id uuid, p_desfecho text, p_linhas jsonb DEFAULT NULL::jsonb, p_motivo_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text, p_data_reagendamento date DEFAULT NULL::date, p_recebido_por text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'erp', 'public'
AS $function$
declare
  par erp.rota_paragens%rowtype; r erp.rotas%rowtype; v_res jsonb; v_entrega uuid;
  v_exige boolean;
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
    -- na rua o dinheiro é recebido na paragem, logo depois da entrega
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