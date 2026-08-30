create or replace function erp.receber_oc(p_oc_id uuid, p_linhas jsonb, p_doc text default null,
                                          p_observacoes text default null)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare
  ped_id_v uuid;
  v_qt_venda int;
  v_qt_reservada int;
  v_qt_falta int;
  v_qt_reservar int;
  oc erp.ordens_compra%rowtype;
  v_receb uuid;
  l record;
  it erp.oc_itens%rowtype;
  v_mov bigint;
  v_chave text;
  v_reserva uuid;
  v_total numeric(12,2) := 0;
  v_unidades int := 0;
  v_falta int;
  v_prazo int;
  ped record;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem receber ordens de compra.';
  end if;

  select * into oc from erp.ordens_compra where id = p_oc_id and eliminado_em is null for update;
  if oc.id is null then raise exception 'Ordem de compra não encontrada.'; end if;

  if oc.estado not in ('pronta_enviar','enviada','confirmada','recebida_parcial') then
    raise exception 'Esta ordem de compra não está em condições de receber mercadoria.';
  end if;

  if p_linhas is null or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Indique as quantidades recebidas.';
  end if;

  insert into erp.oc_recebimentos (oc_id, doc_fornecedor, observacoes)
  values (p_oc_id, nullif(trim(coalesce(p_doc, '')), ''), nullif(trim(coalesce(p_observacoes, '')), ''))
  returning id into v_receb;

  perform set_config('erp.motor', '1', true);

  for l in select (x->>'item_id')::uuid as item_id, (x->>'quantidade')::int as quantidade
             from jsonb_array_elements(p_linhas) x
  loop
    if l.quantidade is null or l.quantidade <= 0 then continue; end if;

    select * into it from erp.oc_itens
      where id = l.item_id and oc_id = p_oc_id and eliminado_em is null for update;
    if it.id is null then raise exception 'Linha da ordem de compra não encontrada.'; end if;

    v_falta := it.quantidade - it.quantidade_recebida;
    if l.quantidade > v_falta then
      raise exception 'A linha "%" só tem % unidade(s) em falta.', it.descricao, v_falta;
    end if;

    update erp.oc_itens set quantidade_recebida = quantidade_recebida + l.quantidade
     where id = it.id;

    v_mov := null;
    if it.produto_id is not null then
      v_chave := 'oc:' || p_oc_id::text || ':' || v_receb::text || ':' || it.id::text;
      insert into erp.stock_movimentos (produto_id, tipo, quantidade, origem, chave_idempotencia,
                                        documento_tipo, documento_id, motivo, registado_por)
      values (it.produto_id, 'entrada', l.quantidade, 'compra', v_chave,
              'ordem_compra', p_oc_id, 'Receção da ordem de compra ' || oc.numero, auth.uid())
      on conflict (chave_idempotencia) do nothing
      returning id into v_mov;

      if v_mov is null then
        select id into v_mov from erp.stock_movimentos where chave_idempotencia = v_chave;
      end if;

      update erp.stock_atual
         set em_transito_compra = greatest(0, em_transito_compra - l.quantidade), atualizado_em = now()
       where produto_id = it.produto_id;
    end if;

    insert into erp.oc_recebimento_itens (recebimento_id, oc_item_id, quantidade, movimento_id)
    values (v_receb, it.id, l.quantidade, v_mov);

    if it.pedido_item_id is not null and it.produto_id is not null then
      select pi.pedido_id, pi.quantidade into ped_id_v, v_qt_venda
        from erp.pedido_itens pi where pi.id = it.pedido_item_id and pi.eliminado_em is null;

      if ped_id_v is not null then
        select coalesce(sum(r.quantidade), 0) into v_qt_reservada
          from erp.reservas r
         where r.linha_id = it.pedido_item_id and r.estado = 'ativa' and r.eliminado_em is null;

        v_qt_falta := greatest(v_qt_venda - v_qt_reservada, 0);
        v_qt_reservar := least(l.quantidade, v_qt_falta);

        if v_qt_reservar > 0 then
          v_reserva := erp.reservar(it.produto_id, v_qt_reservar, 'pedido', ped_id_v,
                                    it.pedido_item_id, null);
          v_qt_reservada := v_qt_reservada + v_qt_reservar;
        end if;

        update erp.pedido_itens
           set reserva_id = coalesce(reserva_id, v_reserva),
               estado = case when v_qt_reservada >= v_qt_venda
                             then 'reservado'::erp.estado_item else estado end
         where id = it.pedido_item_id;

        if it.necessidade_id is not null and v_qt_reservada >= v_qt_venda then
          update erp.necessidades_compra set estado = 'recebida' where id = it.necessidade_id;
        end if;
      end if;
    end if;

    if it.necessidade_id is not null and it.pedido_item_id is null
       and it.quantidade_recebida + l.quantidade >= it.quantidade then
      update erp.necessidades_compra set estado = 'recebida' where id = it.necessidade_id;
    end if;

    v_total := v_total + round(l.quantidade * it.custo_unitario, 2);
    v_unidades := v_unidades + l.quantidade;
  end loop;

  if v_unidades = 0 then raise exception 'Nenhuma quantidade válida foi indicada.'; end if;

  if not exists (select 1 from erp.oc_itens
                  where oc_id = p_oc_id and eliminado_em is null
                    and quantidade_recebida < quantidade) then
    update erp.ordens_compra set estado = 'recebida', data_recebida = current_date where id = p_oc_id;
  else
    update erp.ordens_compra set estado = 'recebida_parcial' where id = p_oc_id;
  end if;

  for ped in
    select distinct pi.pedido_id
      from erp.oc_itens i
      join erp.pedido_itens pi on pi.id = i.pedido_item_id
     where i.oc_id = p_oc_id and i.eliminado_em is null
  loop
    if exists (select 1 from erp.pedidos where id = ped.pedido_id and estado = 'confirmado')
       and not exists (
         select 1 from erp.pedido_itens pi
          where pi.pedido_id = ped.pedido_id and pi.eliminado_em is null
            and pi.produto_id is not null
            and pi.estado not in ('reservado','recebido','separado','entregue'))
    then
      perform set_config('erp.recalculo', '1', true);
      update erp.pedidos set estado = 'pronto' where id = ped.pedido_id;
      perform set_config('erp.recalculo', '', true);
    end if;
  end loop;

  perform set_config('erp.motor', '', true);

  select coalesce((select (valor #>> '{}')::int from erp.definicoes
                    where chave = 'prazo_pagamento_fornecedor_dias' and eliminado_em is null), 30)
    into v_prazo;

  if v_total > 0 then
    insert into erp.contas_pagar (fornecedor_id, oc_id, descricao, categoria, valor,
                                  data_vencimento, doc_fornecedor)
    values (oc.fornecedor_id, p_oc_id,
            'Receção da ordem de compra ' || oc.numero, 'mercadoria', v_total,
            current_date + v_prazo, nullif(trim(coalesce(p_doc, '')), ''));
  end if;

  return jsonb_build_object('recebimento_id', v_receb, 'unidades', v_unidades, 'valor', v_total);
end $$;