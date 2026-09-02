-- Ramo de compra explicito em confirmar_pedido

create or replace function erp.confirmar_pedido(p_pedido_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'erp','public'
as $function$
declare
  ped erp.pedidos%rowtype;
  cli erp.clientes%rowtype;
  cup erp.cupoes%rowtype;
  it record;
  v_reserva uuid;
  v_numero text;
  v_usos integer;
  v_sep int;
begin
  select * into ped from erp.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if ped.estado <> 'orcamento' then raise exception 'Este pedido já foi confirmado.'; end if;

  perform erp.recalcular_pedido(p_pedido_id);
  select * into ped from erp.pedidos where id = p_pedido_id;
  perform set_config('erp.motor', '1', true);

  if not exists (select 1 from erp.pedido_itens where pedido_id = p_pedido_id and eliminado_em is null) then
    raise exception 'O pedido não tem linhas.';
  end if;

  select * into cli from erp.clientes where id = ped.cliente_id and eliminado_em is null;
  if cli.id is null then raise exception 'O cliente do pedido já não existe.'; end if;
  if coalesce(cli.telefone_e164, '') = '' then
    raise exception 'O cliente precisa de telefone para confirmar o pedido.';
  end if;
  if ped.entrega_domicilio and coalesce(ped.morada_entrega, '') = '' then
    raise exception 'Indique a morada de entrega.';
  end if;
  if ped.entrega_domicilio and ped.zona_entrega_id is null then
    raise exception 'O código postal indicado não pertence a nenhuma zona de entrega.';
  end if;
  if ped.data_entrega_prevista is null then
    raise exception 'Falta a data de entrega.';
  end if;

  if ped.cupao_id is not null then
    select * into cup from erp.cupoes where id = ped.cupao_id for update;
    if not cup.ativo or cup.eliminado_em is not null then
      raise exception 'O cupão "%" já não está ativo.', cup.codigo;
    end if;
    if current_date < cup.valido_de or (cup.valido_ate is not null and current_date > cup.valido_ate) then
      raise exception 'O cupão "%" está fora do prazo.', cup.codigo;
    end if;
    if cup.minimo_compra is not null and ped.subtotal < cup.minimo_compra then
      raise exception 'O cupão "%" exige uma compra mínima de % €.', cup.codigo, cup.minimo_compra;
    end if;
    if cup.usos_max is not null and cup.usos_atuais >= cup.usos_max then
      raise exception 'O cupão "%" já atingiu o limite de utilizações.', cup.codigo;
    end if;
    select count(*) into v_usos from erp.cupao_usos u
      where u.cupao_id = cup.id and u.cliente_id = ped.cliente_id and u.eliminado_em is null;
    if v_usos >= cup.usos_por_cliente then
      raise exception 'Este cliente já usou o cupão "%".', cup.codigo;
    end if;
  end if;

  select coalesce((select (valor #>> '{}')::int from erp.definicoes
                    where chave = 'dias_separacao' and eliminado_em is null), 0)
    into v_sep;

  -- fornecimento: stock reserva, compra gera necessidade de compra, produção gera necessidade de produção
  for it in
    select i.*, p.tipo_fornecimento as forn, p.nome_cliente, p.fornecedor_id
    from erp.pedido_itens i join erp.produtos p on p.id = i.produto_id
    where i.pedido_id = p_pedido_id and i.eliminado_em is null and i.produto_id is not null
    order by i.linha
  loop
    if it.forn = 'stock' then
      v_reserva := erp.reservar(it.produto_id, it.quantidade, 'pedido', p_pedido_id, it.id, null);
      update erp.pedido_itens set reserva_id = v_reserva, estado = 'reservado',
        data_prevista = ped.data_entrega_prevista where id = it.id;
    elsif it.forn = 'producao' then
      update erp.pedido_itens set estado = 'encomendado',
        data_prevista = ped.data_entrega_prevista where id = it.id;
      insert into erp.necessidades_producao (pedido_id, item_id, produto_id, quantidade, data_necessaria)
      values (p_pedido_id, it.id, it.produto_id, it.quantidade,
              ped.data_entrega_prevista - v_sep);
    elsif it.forn = 'compra' then
      update erp.pedido_itens set estado = 'encomendado',
        data_prevista = ped.data_entrega_prevista where id = it.id;
      insert into erp.necessidades_compra (pedido_id, item_id, produto_id, fornecedor_id, quantidade)
      values (p_pedido_id, it.id, it.produto_id, it.fornecedor_id, it.quantidade);
    else
      raise exception 'O produto "%" não tem forma de fornecimento válida.', it.nome_cliente;
    end if;
  end loop;

  update erp.pedido_itens set data_prevista = ped.data_entrega_prevista, estado = 'pendente'
  where pedido_id = p_pedido_id and eliminado_em is null and servico_id is not null;

  if ped.cupao_id is not null then
    insert into erp.cupao_usos (cupao_id, pedido_id, cliente_id, desconto)
    values (ped.cupao_id, p_pedido_id, ped.cliente_id, ped.desconto_cupao)
    on conflict (pedido_id, cupao_id) do nothing;
    update erp.cupoes set usos_atuais = usos_atuais + 1 where id = ped.cupao_id;
  end if;

  v_numero := erp.proximo_numero('pedido');
  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos set
    numero = v_numero, tipo = 'pedido', estado = 'confirmado',
    data_entrega_prometida = data_entrega_prevista,
    confirmado_em = now(), confirmado_por = auth.uid()
  where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  return jsonb_build_object('pedido_id', p_pedido_id, 'numero', v_numero);
end $function$;
