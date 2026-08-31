create or replace view erp.v_pedido_entrega
with (security_invoker = true) as
 SELECT i.id AS pedido_item_id,
    i.pedido_id,
    i.linha,
    i.descricao,
    i.produto_id,
    i.servico_id,
    i.quantidade,
    i.estado,
    i.reserva_id,
    i.total_linha,
    COALESCE(( SELECT sum(ei.quantidade)
           FROM erp.entrega_itens ei
             JOIN erp.entregas en ON en.id = ei.entrega_id
          WHERE ei.pedido_item_id = i.id AND ei.eliminado_em IS NULL AND en.eliminado_em IS NULL AND en.estado = 'registada'::text), 0::bigint)::integer AS qt_entregue,
    (i.quantidade - COALESCE(( SELECT sum(ei.quantidade)
           FROM erp.entrega_itens ei
             JOIN erp.entregas en ON en.id = ei.entrega_id
          WHERE ei.pedido_item_id = i.id AND ei.eliminado_em IS NULL AND en.eliminado_em IS NULL AND en.estado = 'registada'::text), 0::bigint))::integer AS qt_por_entregar,
    p.numero AS pedido_numero,
    p.estado AS pedido_estado,
    ( SELECT min(en.data_entrega)
           FROM erp.entrega_itens ei
             JOIN erp.entregas en ON en.id = ei.entrega_id
          WHERE ei.pedido_item_id = i.id AND ei.eliminado_em IS NULL AND en.eliminado_em IS NULL AND en.estado = 'registada'::text) AS data_primeira_entrega,
    ( SELECT max(en.data_entrega)
           FROM erp.entrega_itens ei
             JOIN erp.entregas en ON en.id = ei.entrega_id
          WHERE ei.pedido_item_id = i.id AND ei.eliminado_em IS NULL AND en.eliminado_em IS NULL AND en.estado = 'registada'::text) AS data_entrega_efetiva
   FROM erp.pedido_itens i
     JOIN erp.pedidos p ON p.id = i.pedido_id
  WHERE i.eliminado_em IS NULL AND p.eliminado_em IS NULL;

grant select on erp.v_pedido_entrega to authenticated;

create or replace function erp.agendar_entrega(p_pedido_id uuid, p_rota_id uuid, p_confirmar boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  ped erp.pedidos%rowtype; r erp.rotas%rowtype;
  v_prev numeric(12,2); v_ordem int; v_excede boolean := false;
  v_avisos text[] := '{}'; oc record;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem agendar entregas.';
  end if;

  select * into ped from erp.pedidos where id = p_pedido_id and eliminado_em is null for update;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if ped.estado not in ('confirmado','em_preparacao','pronto','entrega_parcial') then
    raise exception 'Só é possível agendar vendas confirmadas, em preparação, prontas ou em entrega parcial.';
  end if;

  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado in ('fechada','conferida','concluida','cancelada') then
    raise exception 'Esta rota já não aceita entregas.';
  end if;
  if r.estado = 'em_curso' and not p_confirmar then
    raise exception 'A rota já arrancou. Confirme que quer acrescentar esta paragem.';
  end if;

  if exists (select 1 from erp.rota_paragens rp join erp.rotas r2 on r2.id = rp.rota_id
              where rp.pedido_id = p_pedido_id and rp.eliminado_em is null
                and rp.desfecho is null and r2.estado in ('planeada','em_curso')) then
    raise exception 'Esta venda já está agendada numa rota.';
  end if;

  select coalesce(max(ordem), 0) + 1 into v_ordem
    from erp.rota_paragens where rota_id = p_rota_id and eliminado_em is null;

  select coalesce(sum(pg.valor), 0) into v_prev from erp.pagamentos pg
   where pg.pedido_id = p_pedido_id and pg.eliminado_em is null
     and pg.estado in ('pendente','pendente_confirmacao');
  if v_prev = 0 then v_prev := erp.pendente_pedido(p_pedido_id); end if;

  select * into oc from erp.v_rota_ocupacao where rota_id = p_rota_id;
  if r.max_entregas is not null and coalesce(oc.entregas, 0) + 1 > r.max_entregas then
    v_excede := true;
    v_avisos := v_avisos || format('Máximo de entregas ultrapassado (%s/%s).',
                                   coalesce(oc.entregas, 0) + 1, r.max_entregas);
  end if;
  if r.max_minutos_montagem is not null then
    if coalesce(oc.montagem_min, 0) > r.max_minutos_montagem then
      v_excede := true;
      v_avisos := v_avisos || 'Tempo de montagem acima do limite da rota.';
    end if;
  end if;

  insert into erp.rota_paragens (rota_id, pedido_id, ordem, previsto_receber, excedeu_capacidade)
  values (p_rota_id, p_pedido_id, v_ordem, v_prev, v_excede);

  perform set_config('erp.recalculo', '1', true);
  perform set_config('erp.motor', '1', true);
  update erp.pedidos
     set estado = 'agendado'::erp.estado_pedido,
         data_entrega_agendada = r.data
   where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  if r.estado = 'planeada' then
    perform erp.recalcular_previsto_rota(p_rota_id);
  else
    insert into erp.rota_alteracoes (rota_id, tipo, pedido_id, descricao)
    values (p_rota_id, 'adicionou', p_pedido_id,
            format('Paragem acrescentada com a rota em curso (%s).', ped.numero));
  end if;

  return jsonb_build_object('rota_id', p_rota_id, 'data', r.data,
    'excedeu_capacidade', v_excede, 'avisos', to_jsonb(v_avisos));
end $function$;
