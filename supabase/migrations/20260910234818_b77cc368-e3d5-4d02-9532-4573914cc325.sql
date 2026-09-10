-- 1) histórico: permitir repetir a venda na mesma rota, mantendo tentativas anteriores
alter table erp.rota_paragens drop constraint if exists rota_paragens_rota_id_pedido_id_key;
drop index if exists erp.rota_paragens_rota_id_pedido_id_key;
create unique index if not exists ux_paragem_aberta_rota_pedido
  on erp.rota_paragens (rota_id, pedido_id)
  where eliminado_em is null and desfecho is null;

-- 2) função auxiliar: devolver a venda a um estado agendável
create or replace function erp.reabrir_agendamento_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path to 'erp','public'
as $$
declare v_pronto boolean; v_estado erp.estado_pedido;
begin
  select estado into v_estado from erp.pedidos where id = p_pedido_id;
  if v_estado is distinct from 'agendado'::erp.estado_pedido then return; end if;

  select bool_and(i.estado in ('reservado','separado','entregue'))
    into v_pronto
    from erp.pedido_itens i
   where i.pedido_id = p_pedido_id and i.eliminado_em is null
     and i.estado <> 'cancelado';

  perform set_config('erp.recalculo','1',true);
  perform set_config('erp.motor','1',true);
  update erp.pedidos
     set estado = case when coalesce(v_pronto,false) then 'pronto'::erp.estado_pedido
                       else 'em_preparacao'::erp.estado_pedido end,
         data_entrega_agendada = null,
         atualizado_em = now()
   where id = p_pedido_id;
  perform set_config('erp.recalculo','',true);
  perform set_config('erp.motor','',true);
end $$;

revoke all on function erp.reabrir_agendamento_pedido(uuid) from public;
grant execute on function erp.reabrir_agendamento_pedido(uuid) to authenticated, service_role;

-- 3) desfecho "reagendada" liberta a venda para nova marcação
create or replace function erp.registar_desfecho_paragem(p_paragem_id uuid, p_desfecho text, p_linhas jsonb DEFAULT NULL::jsonb, p_motivo_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text, p_data_reagendamento date DEFAULT NULL::date, p_recebido_por text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'erp', 'public'
AS $function$
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
      v_falta := erp.por_registar_pedido(par.pedido_id);
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

  -- a venda reagendada, ausente ou cancelada na rota volta a poder ser marcada
  if p_desfecho in ('reagendada','ausente','cancelada') then
    perform erp.reabrir_agendamento_pedido(par.pedido_id);
  end if;

  return jsonb_build_object('paragem_id', p_paragem_id, 'desfecho', p_desfecho,
    'entrega_id', v_entrega);
end $function$;

-- 4) regularizar vendas presas em "agendado" com a paragem já fechada
do $$
declare rec record;
begin
  for rec in
    select distinct p.id
      from erp.pedidos p
      join erp.rota_paragens rp on rp.pedido_id = p.id and rp.eliminado_em is null
     where p.eliminado_em is null and p.estado = 'agendado'
       and rp.desfecho in ('reagendada','ausente','cancelada')
       and not exists (
         select 1 from erp.rota_paragens rp2
          join erp.rotas r2 on r2.id = rp2.rota_id
         where rp2.pedido_id = p.id and rp2.eliminado_em is null
           and rp2.desfecho is null and r2.estado in ('planeada','em_curso'))
  loop
    perform erp.reabrir_agendamento_pedido(rec.id);
  end loop;
end $$;