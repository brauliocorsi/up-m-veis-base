create or replace function erp.por_registar_pedido(p_pedido_id uuid)
returns numeric
language sql stable security definer set search_path = erp, public
as $$
  select greatest(
    (select total from erp.pedidos where id = p_pedido_id)
    - coalesce((
        select sum(pg.valor)
        from erp.pagamentos pg
        join erp.formas_pagamento f on f.id = pg.forma_id
        where pg.pedido_id = p_pedido_id
          and pg.eliminado_em is null
          and pg.estado in ('confirmado','pendente_confirmacao')
          and not (pg.estado = 'pendente' and f.momento = 'entrega')
      ), 0),
    0
  );
$$;

create or replace function erp.registar_desfecho_paragem(
  p_paragem_id uuid,
  p_desfecho text,
  p_observacoes text default null
) returns jsonb
language plpgsql security definer set search_path = erp, public
as $$
declare
  v_par record;
  v_rota record;
  v_falta numeric;
  v_entrega_total boolean;
begin
  -- Verificar utilizador
  if not erp.utilizador_ativo() then
    raise exception 'Sessão inválida ou utilizador inativo.';
  end if;

  -- Dados da paragem
  select p.*, r.data_rota, r.entregador_id, r.estado as rota_estado
  into v_par
  from erp.rota_paragens p
  join erp.rotas r on r.id = p.rota_id
  where p.id = p_paragem_id;

  if not found then
    raise exception 'Paragem não encontrada.';
  end if;

  -- Validar estado da rota
  if v_par.rota_estado not in ('aberta','em_curso') then
    raise exception 'A rota não pode ser alterada (%).', v_par.rota_estado;
  end if;

  -- Validar permissão: entregador só pode ver a sua rota; escritório/financeiro/administrativo têm acesso administrativo
  if erp.perfil_atual() = 'entregador' and v_par.entregador_id <> auth.uid() then
    raise exception 'Não tem permissão para alterar esta paragem.';
  end if;

  -- Validar desfecho
  if p_desfecho not in ('entregue','nao_entregue','reagendado','levantado_na_loja') then
    raise exception 'Desfecho inválido: %', p_desfecho;
  end if;

  -- Reagendado precisa de observação com data
  if p_desfecho = 'reagendado' and (p_observacoes is null or p_observacoes = '') then
    raise exception 'Indique a nova data de entrega nas observações.';
  end if;

  -- Calcular o valor que ainda falta REGISTAR (não confirmar financeiramente)
  v_falta := erp.por_registar_pedido(v_par.pedido_id);

  -- Verificar se é entrega total
  select bool_and(pi.qt_por_entregar = 0)
  into v_entrega_total
  from erp.v_pedido_entrega pi
  where pi.pedido_id = v_par.pedido_id;

  -- Entrega total: não fechar enquanto houver valores por registar
  if v_entrega_total and v_falta > 0.004 then
    raise exception 'Faltam receber %. Registe o recebimento, retire um produto ou aplique um desconto antes de fechar a entrega.', round(v_falta, 2);
  end if;

  -- Atualizar a paragem
  update erp.rota_paragens
  set desfecho = p_desfecho,
      observacoes = coalesce(p_observacoes, observacoes),
      concluido = true,
      concluido_em = now(),
      atualizado_em = now(),
      atualizado_por = auth.uid()
  where id = p_paragem_id;

  -- Se desfecho levantado na loja, marcar pedido como levantado
  if p_desfecho = 'levantado_na_loja' then
    update erp.pedidos
    set levantado_na_loja = true,
        estado = 'entregue',
        atualizado_em = now(),
        atualizado_por = auth.uid()
    where id = v_par.pedido_id;
  end if;

  -- Se reagendado, criar necessidade de reagendamento
  if p_desfecho = 'reagendado' then
    insert into erp.eventos (
      tipo, entidade_tipo, entidade_id, mensagem,
      criado_por, atualizado_por
    ) values (
      'reagendamento', 'pedido', v_par.pedido_id, p_observacoes,
      auth.uid(), auth.uid()
    );
  end if;

  -- Verificar se todas as paragens da rota estão concluídas
  perform erp.verificar_fecho_rota(v_par.rota_id);

  return jsonb_build_object(
    'ok', true,
    'paragem_id', p_paragem_id,
    'desfecho', p_desfecho,
    'falta_pagar', v_falta
  );
end;
$$;