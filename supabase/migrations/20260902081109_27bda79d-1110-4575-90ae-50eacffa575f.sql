-- Fecho da paragem: basta o recebimento registado, nao a confirmacao financeira

CREATE OR REPLACE FUNCTION erp.registar_desfecho_paragem(p_paragem_id uuid, p_desfecho text, p_linhas jsonb DEFAULT NULL::jsonb, p_motivo_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text, p_data_reagendamento date DEFAULT NULL::date, p_recebido_por text DEFAULT NULL::text)
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

    -- entrega total: o dinheiro tem de estar registado antes de fechar
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

  return jsonb_build_object('paragem_id', p_paragem_id, 'desfecho', p_desfecho,
    'entrega_id', v_entrega);
end $function$;
