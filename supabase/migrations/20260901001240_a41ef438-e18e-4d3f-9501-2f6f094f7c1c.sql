-- ============================================================
-- Fase 11 — funções e vistas
-- ============================================================

create or replace function erp.criar_op(
  p_produto_id uuid,
  p_necessidades uuid[] default null,
  p_quantidade int default null,
  p_data_prevista date default null,
  p_prioridade int default 5,
  p_observacoes text default null
) returns uuid
 language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  v_op uuid;
  v_qt int := 0;
  v_data date := p_data_prevista;
  n record;
  v_nome text;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem abrir ordens de produção.';
  end if;

  select nome_cliente into v_nome from erp.produtos where id = p_produto_id and eliminado_em is null;
  if v_nome is null then raise exception 'Produto não encontrado.'; end if;

  if p_necessidades is not null and array_length(p_necessidades, 1) > 0 then
    for n in select * from erp.necessidades_producao
              where id = any (p_necessidades) and eliminado_em is null for update
    loop
      if n.produto_id <> p_produto_id then
        raise exception 'Todas as necessidades têm de ser do mesmo produto.';
      end if;
      if n.estado <> 'aberta' then
        raise exception 'Há necessidades que já não estão abertas.';
      end if;
      v_qt := v_qt + n.quantidade;
      if v_data is null or (n.data_necessaria is not null and n.data_necessaria < v_data) then
        v_data := coalesce(n.data_necessaria, v_data);
      end if;
    end loop;
  end if;

  v_qt := greatest(coalesce(p_quantidade, v_qt), v_qt);
  if coalesce(v_qt, 0) <= 0 then
    raise exception 'Indique a quantidade a produzir.';
  end if;

  insert into erp.ordens_producao (numero, produto_id, quantidade, data_prevista, prioridade, observacoes)
  values (erp.proximo_numero('ordem_producao'), p_produto_id, v_qt, v_data,
          coalesce(p_prioridade, 5), nullif(trim(coalesce(p_observacoes, '')), ''))
  returning id into v_op;

  insert into erp.op_etapas (op_id, etapa_id, ordem)
  select v_op, e.id, e.ordem from erp.etapas_producao e
   where e.ativo and e.eliminado_em is null order by e.ordem;

  update erp.ordens_producao o
     set etapa_atual_id = (select etapa_id from erp.op_etapas where op_id = v_op order by ordem limit 1)
   where o.id = v_op;

  if p_necessidades is not null then
    update erp.necessidades_producao
       set estado = 'convertida', op_id = v_op
     where id = any (p_necessidades) and eliminado_em is null and estado = 'aberta';
  end if;

  return v_op;
end $$;

create or replace function erp.iniciar_etapa(p_op_etapa_id uuid)
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  et erp.op_etapas%rowtype;
  ant record;
begin
  if not erp.pode_registar_producao() then
    raise exception 'Não tem permissão para registar trabalho de produção.';
  end if;

  select * into et from erp.op_etapas where id = p_op_etapa_id and eliminado_em is null for update;
  if et.id is null then raise exception 'Etapa não encontrada.'; end if;
  if et.estado = 'concluida' then raise exception 'Esta etapa já está concluída.'; end if;

  for ant in
    select oe.*, e.nome, e.exige_conferencia
      from erp.op_etapas oe join erp.etapas_producao e on e.id = oe.etapa_id
     where oe.op_id = et.op_id and oe.ordem < et.ordem and oe.eliminado_em is null
  loop
    if ant.estado <> 'concluida' then
      raise exception 'A etapa "%" ainda não está concluída.', ant.nome;
    end if;
    if ant.exige_conferencia and ant.conferida_por is null then
      raise exception 'A etapa "%" precisa de conferência antes de continuar.', ant.nome;
    end if;
  end loop;

  update erp.op_etapas
     set estado = 'em_curso', iniciada_em = coalesce(iniciada_em, now()),
         operador_id = coalesce(operador_id, erp.utilizador_atual())
   where id = p_op_etapa_id;

  update erp.ordens_producao
     set estado = case when estado = 'planeada' then 'em_curso'::erp.estado_op else estado end,
         data_inicio = coalesce(data_inicio, current_date),
         etapa_atual_id = et.etapa_id
   where id = et.op_id;
end $$;

create or replace function erp.concluir_etapa(
  p_op_etapa_id uuid,
  p_quantidade_ok int,
  p_quantidade_refugo int default 0,
  p_motivo_refugo text default null,
  p_observacoes text default null
) returns jsonb
 language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  et erp.op_etapas%rowtype;
  op erp.ordens_producao%rowtype;
  c record;
  v_prev int;
  v_disp int;
  v_cons int;
  v_falta int;
  v_mov bigint;
  v_chave text;
  v_faltas jsonb := '[]'::jsonb;
begin
  if not erp.pode_registar_producao() then
    raise exception 'Não tem permissão para registar trabalho de produção.';
  end if;

  select * into et from erp.op_etapas where id = p_op_etapa_id and eliminado_em is null for update;
  if et.id is null then raise exception 'Etapa não encontrada.'; end if;
  if et.estado = 'concluida' then raise exception 'Esta etapa já está concluída.'; end if;
  if coalesce(p_quantidade_ok, 0) < 0 or coalesce(p_quantidade_refugo, 0) < 0 then
    raise exception 'As quantidades não podem ser negativas.';
  end if;
  if coalesce(p_quantidade_ok, 0) + coalesce(p_quantidade_refugo, 0) = 0 then
    raise exception 'Indique quantas peças ficaram boas.';
  end if;
  if coalesce(p_quantidade_refugo, 0) > 0 and coalesce(trim(p_motivo_refugo), '') = '' then
    raise exception 'Escreva o motivo do refugo.';
  end if;

  select * into op from erp.ordens_producao where id = et.op_id for update;
  if op.estado = 'cancelada' then raise exception 'Esta ordem de produção está cancelada.'; end if;

  perform set_config('erp.motor', '1', true);

  -- consumo dos componentes desta etapa
  for c in
    select co.componente_id, co.quantidade, p.nome_cliente
      from erp.componentes co
      join erp.produtos p on p.id = co.componente_id
     where co.produto_id = op.produto_id and co.eliminado_em is null and co.etapa_id = et.etapa_id
  loop
    v_prev := ceil(c.quantidade * coalesce(p_quantidade_ok, 0))::int;
    if v_prev <= 0 then continue; end if;

    insert into erp.stock_atual (produto_id) values (c.componente_id) on conflict (produto_id) do nothing;
    select greatest(coalesce(fisico, 0), 0) into v_disp from erp.stock_atual
      where produto_id = c.componente_id for update;

    v_cons := least(v_prev, coalesce(v_disp, 0));
    v_falta := v_prev - v_cons;
    v_mov := null;

    if v_cons > 0 then
      v_chave := 'op:' || et.op_id::text || ':etapa:' || et.id::text || ':' || c.componente_id::text;
      insert into erp.stock_movimentos (produto_id, tipo, quantidade, origem, chave_idempotencia,
                                        documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
      values (c.componente_id, 'saida', -v_cons, 'producao', v_chave,
              'ordem_producao', et.op_id, 'Consumo na ordem de produção ' || op.numero, now(), auth.uid())
      on conflict (chave_idempotencia) do nothing
      returning id into v_mov;
      if v_mov is null then
        select id into v_mov from erp.stock_movimentos where chave_idempotencia = v_chave;
      end if;
    end if;

    insert into erp.op_consumos (op_id, op_etapa_id, componente_id, quantidade_prevista,
                                 quantidade_consumida, quantidade_falta, movimento_id)
    values (et.op_id, et.id, c.componente_id, v_prev, v_cons, v_falta, v_mov);

    if v_falta > 0 then
      v_faltas := v_faltas || jsonb_build_object('componente', c.nome_cliente, 'falta', v_falta);
    end if;
  end loop;

  update erp.op_etapas
     set estado = 'concluida',
         quantidade_ok = coalesce(p_quantidade_ok, 0),
         quantidade_refugo = coalesce(p_quantidade_refugo, 0),
         motivo_refugo = nullif(trim(coalesce(p_motivo_refugo, '')), ''),
         observacoes = nullif(trim(coalesce(p_observacoes, '')), ''),
         operador_id = coalesce(operador_id, erp.utilizador_atual()),
         iniciada_em = coalesce(iniciada_em, now()),
         concluida_em = now()
   where id = p_op_etapa_id;

  update erp.ordens_producao
     set estado = case when estado = 'planeada' then 'em_curso'::erp.estado_op else estado end,
         data_inicio = coalesce(data_inicio, current_date),
         quantidade_refugo = quantidade_refugo + coalesce(p_quantidade_refugo, 0),
         etapa_atual_id = coalesce(
           (select oe.etapa_id from erp.op_etapas oe
             where oe.op_id = et.op_id and oe.eliminado_em is null and oe.estado <> 'concluida'
             order by oe.ordem limit 1), et.etapa_id)
   where id = et.op_id;

  perform set_config('erp.motor', '', true);

  return jsonb_build_object('faltas', v_faltas);
end $$;

create or replace function erp.conferir_etapa(p_op_etapa_id uuid)
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
declare et erp.op_etapas%rowtype;
begin
  if not erp.pode_registar_producao() then
    raise exception 'Não tem permissão para conferir etapas de produção.';
  end if;
  select * into et from erp.op_etapas where id = p_op_etapa_id and eliminado_em is null for update;
  if et.id is null then raise exception 'Etapa não encontrada.'; end if;
  if et.estado <> 'concluida' then raise exception 'Só se confere uma etapa depois de concluída.'; end if;
  update erp.op_etapas set conferida_por = erp.utilizador_atual(), conferida_em = now()
   where id = p_op_etapa_id;
end $$;

create or replace function erp.concluir_op(p_op_id uuid, p_quantidade int)
 returns jsonb language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  op erp.ordens_producao%rowtype;
  pendente record;
  n record;
  v_chave text;
  v_restante int;
  v_qt_venda int;
  v_reservada int;
  v_falta int;
  v_reservar int;
  v_reserva uuid;
  v_reservado_total int := 0;
begin
  if not erp.pode_registar_producao() then
    raise exception 'Não tem permissão para concluir ordens de produção.';
  end if;

  select * into op from erp.ordens_producao where id = p_op_id and eliminado_em is null for update;
  if op.id is null then raise exception 'Ordem de produção não encontrada.'; end if;
  if op.estado = 'cancelada' then raise exception 'Esta ordem de produção está cancelada.'; end if;
  if op.estado = 'concluida' then raise exception 'Esta ordem de produção já está concluída.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Indique quantas peças ficaram prontas.'; end if;
  if op.quantidade_produzida + p_quantidade > op.quantidade then
    raise exception 'A ordem só tem % peça(s) em falta.', op.quantidade - op.quantidade_produzida;
  end if;

  select e.nome into pendente
    from erp.op_etapas oe join erp.etapas_producao e on e.id = oe.etapa_id
   where oe.op_id = p_op_id and oe.eliminado_em is null
     and (oe.estado <> 'concluida' or (e.exige_conferencia and oe.conferida_por is null))
   order by oe.ordem limit 1;
  if pendente.nome is not null then
    raise exception 'Falta concluir ou conferir a etapa "%".', pendente.nome;
  end if;

  perform set_config('erp.motor', '1', true);

  v_chave := 'op:' || p_op_id::text || ':' || (op.quantidade_produzida + p_quantidade)::text;
  insert into erp.stock_movimentos (produto_id, tipo, quantidade, origem, chave_idempotencia,
                                    documento_tipo, documento_id, motivo, ocorrido_em, registado_por)
  values (op.produto_id, 'entrada', p_quantidade, 'producao', v_chave,
          'ordem_producao', p_op_id, 'Produção concluída na ordem ' || op.numero, now(), auth.uid())
  on conflict (chave_idempotencia) do nothing;

  v_restante := p_quantidade;

  for n in
    select np.* from erp.necessidades_producao np
     where np.op_id = p_op_id and np.eliminado_em is null and np.estado in ('convertida','aberta')
     order by np.data_necessaria nulls last, np.criado_em
  loop
    exit when v_restante <= 0;
    if n.item_id is null then continue; end if;

    select pi.quantidade into v_qt_venda from erp.pedido_itens pi
      where pi.id = n.item_id and pi.eliminado_em is null;
    if v_qt_venda is null then continue; end if;

    select coalesce(sum(r.quantidade), 0) into v_reservada from erp.reservas r
      where r.linha_id = n.item_id and r.estado = 'ativa' and r.eliminado_em is null;

    v_falta := greatest(v_qt_venda - v_reservada, 0);
    v_reservar := least(v_restante, v_falta);
    if v_reservar <= 0 then continue; end if;

    v_reserva := erp.reservar(op.produto_id, v_reservar, 'pedido', n.pedido_id, n.item_id, null);
    v_reservada := v_reservada + v_reservar;
    v_restante := v_restante - v_reservar;
    v_reservado_total := v_reservado_total + v_reservar;

    update erp.pedido_itens
       set reserva_id = coalesce(reserva_id, v_reserva),
           estado = case when v_reservada >= v_qt_venda then 'reservado'::erp.estado_item else estado end
     where id = n.item_id;

    update erp.necessidades_producao
       set quantidade_reservada = quantidade_reservada + v_reservar,
           estado = case when quantidade_reservada + v_reservar >= n.quantidade
                         then 'produzida' else estado end
     where id = n.id;
  end loop;

  update erp.ordens_producao
     set quantidade_produzida = quantidade_produzida + p_quantidade,
         estado = case when quantidade_produzida + p_quantidade >= quantidade
                       then 'concluida'::erp.estado_op else 'em_curso'::erp.estado_op end,
         data_conclusao = case when quantidade_produzida + p_quantidade >= quantidade
                               then current_date else data_conclusao end
   where id = p_op_id;

  for n in
    select distinct np.pedido_id from erp.necessidades_producao np
     where np.op_id = p_op_id and np.pedido_id is not null and np.eliminado_em is null
  loop
    if exists (select 1 from erp.pedidos where id = n.pedido_id and estado = 'confirmado')
       and not exists (
         select 1 from erp.pedido_itens pi
          where pi.pedido_id = n.pedido_id and pi.eliminado_em is null
            and pi.produto_id is not null
            and pi.estado not in ('reservado','recebido','separado','entregue'))
    then
      perform set_config('erp.recalculo', '1', true);
      update erp.pedidos set estado = 'pronto' where id = n.pedido_id;
      perform set_config('erp.recalculo', '', true);
    end if;
  end loop;

  perform set_config('erp.motor', '', true);

  return jsonb_build_object('produzido', p_quantidade, 'reservado', v_reservado_total,
                            'sobra', p_quantidade - v_reservado_total);
end $$;

create or replace function erp.cancelar_op(p_op_id uuid, p_motivo text)
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
declare op erp.ordens_producao%rowtype;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem cancelar ordens de produção.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escreva o motivo do cancelamento.'; end if;

  select * into op from erp.ordens_producao where id = p_op_id and eliminado_em is null for update;
  if op.id is null then raise exception 'Ordem de produção não encontrada.'; end if;
  if op.estado = 'concluida' then raise exception 'Uma ordem concluída não se cancela.'; end if;

  update erp.ordens_producao set estado = 'cancelada', observacoes =
    trim(coalesce(observacoes || E'\n', '') || 'Cancelada: ' || p_motivo) where id = p_op_id;

  update erp.necessidades_producao set estado = 'aberta', op_id = null
   where op_id = p_op_id and eliminado_em is null and estado = 'convertida';
end $$;

create or replace function erp.gravar_componente(
  p_id uuid,
  p_produto_id uuid,
  p_componente_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_etapa_id uuid,
  p_observacoes text
) returns uuid language plpgsql security definer set search_path to 'erp','public'
as $$
declare v_id uuid;
begin
  if not erp.pode_gerir_producao() then
    raise exception 'Só a Administração, o Escritório e as Compras podem definir componentes.';
  end if;
  if p_produto_id = p_componente_id then
    raise exception 'Um produto não pode ser componente de si próprio.';
  end if;
  if erp.componente_gera_ciclo(p_produto_id, p_componente_id) then
    raise exception 'Este componente criaria um ciclo: o produto acabaria por ser componente de si próprio.';
  end if;

  if p_id is null then
    insert into erp.componentes (produto_id, componente_id, quantidade, unidade, etapa_id, observacoes)
    values (p_produto_id, p_componente_id, p_quantidade, coalesce(nullif(trim(p_unidade), ''), 'un'),
            p_etapa_id, nullif(trim(coalesce(p_observacoes, '')), ''))
    returning id into v_id;
  else
    update erp.componentes
       set produto_id = p_produto_id, componente_id = p_componente_id, quantidade = p_quantidade,
           unidade = coalesce(nullif(trim(p_unidade), ''), 'un'), etapa_id = p_etapa_id,
           observacoes = nullif(trim(coalesce(p_observacoes, '')), '')
     where id = p_id and eliminado_em is null
    returning id into v_id;
    if v_id is null then raise exception 'Componente não encontrado.'; end if;
  end if;
  return v_id;
end $$;

-- ============================================================
-- Vistas
-- ============================================================

create or replace view erp.v_etapas_producao
 with (security_invoker = true) as
select e.id, e.codigo, e.nome, e.ordem, e.permite_stock_intermedio, e.exige_conferencia,
       e.ativo, e.criado_em, e.atualizado_em
  from erp.etapas_producao e
 where e.eliminado_em is null;

create or replace view erp.v_necessidades_producao
 with (security_invoker = true) as
select n.id, n.produto_id, p.nome_cliente as produto_nome, p.cod_barras,
       n.quantidade, n.quantidade_reservada,
       greatest(n.quantidade - n.quantidade_reservada, 0) as falta,
       n.data_necessaria, n.estado, n.origem, n.op_id, o.numero as op_numero,
       n.pedido_id, ped.numero as pedido_numero, c.nome as cliente_nome,
       n.item_id, n.criado_em
  from erp.necessidades_producao n
  join erp.produtos p on p.id = n.produto_id
  left join erp.ordens_producao o on o.id = n.op_id
  left join erp.pedidos ped on ped.id = n.pedido_id
  left join erp.clientes c on c.id = ped.cliente_id
 where n.eliminado_em is null;

create or replace view erp.v_ordens_producao
 with (security_invoker = true) as
select o.id, o.numero, o.produto_id, p.nome_cliente as produto_nome, p.cod_barras,
       o.quantidade, o.quantidade_produzida, o.quantidade_refugo,
       greatest(o.quantidade - o.quantidade_produzida, 0) as falta,
       o.estado, o.etapa_atual_id, e.nome as etapa_atual_nome,
       o.data_prevista, o.data_inicio, o.data_conclusao, o.prioridade, o.observacoes,
       case when o.estado in ('planeada','em_curso') and o.data_prevista is not null
                 and o.data_prevista < current_date
            then current_date - o.data_prevista else 0 end as dias_atraso,
       (select count(*) from erp.necessidades_producao n
         where n.op_id = o.id and n.eliminado_em is null) as necessidades,
       (select count(*) from erp.op_consumos oc
         where oc.op_id = o.id and oc.quantidade_falta > 0 and oc.regularizado_em is null
           and oc.eliminado_em is null) as consumos_em_falta,
       o.criado_em, o.atualizado_em
  from erp.ordens_producao o
  join erp.produtos p on p.id = o.produto_id
  left join erp.etapas_producao e on e.id = o.etapa_atual_id
 where o.eliminado_em is null;

create or replace view erp.v_op_etapas
 with (security_invoker = true) as
select oe.id, oe.op_id, o.numero as op_numero, o.quantidade as op_quantidade,
       o.produto_id, p.nome_cliente as produto_nome,
       oe.etapa_id, e.codigo as etapa_codigo, e.nome as etapa_nome,
       e.exige_conferencia, e.permite_stock_intermedio,
       oe.ordem, oe.estado, oe.quantidade_ok, oe.quantidade_refugo, oe.motivo_refugo,
       oe.operador_id, u.nome as operador_nome,
       oe.conferida_por, uc.nome as conferida_por_nome, oe.conferida_em,
       oe.iniciada_em, oe.concluida_em, oe.observacoes
  from erp.op_etapas oe
  join erp.ordens_producao o on o.id = oe.op_id
  join erp.produtos p on p.id = o.produto_id
  join erp.etapas_producao e on e.id = oe.etapa_id
  left join erp.utilizadores u on u.id = oe.operador_id
  left join erp.utilizadores uc on uc.id = oe.conferida_por
 where oe.eliminado_em is null and o.eliminado_em is null;

create or replace view erp.v_componentes
 with (security_invoker = true) as
select co.id, co.produto_id, p.nome_cliente as produto_nome,
       co.componente_id, k.nome_cliente as componente_nome, k.cod_barras as componente_cod_barras,
       k.tipo_fornecimento as componente_tipo,
       co.quantidade, co.unidade, co.etapa_id, e.nome as etapa_nome, co.observacoes,
       coalesce(s.fisico, 0) as componente_stock,
       exists (select 1 from erp.componentes x
                where x.produto_id = co.componente_id and x.eliminado_em is null) as tem_subcomponentes,
       co.criado_em, co.atualizado_em
  from erp.componentes co
  join erp.produtos p on p.id = co.produto_id
  join erp.produtos k on k.id = co.componente_id
  left join erp.etapas_producao e on e.id = co.etapa_id
  left join erp.stock_atual s on s.produto_id = co.componente_id
 where co.eliminado_em is null;

create or replace view erp.v_op_consumos
 with (security_invoker = true) as
select oc.id, oc.op_id, o.numero as op_numero, oc.op_etapa_id,
       e.nome as etapa_nome, oc.componente_id, k.nome_cliente as componente_nome,
       oc.quantidade_prevista, oc.quantidade_consumida, oc.quantidade_falta,
       oc.regularizado_em, oc.criado_em
  from erp.op_consumos oc
  join erp.ordens_producao o on o.id = oc.op_id
  join erp.produtos k on k.id = oc.componente_id
  left join erp.op_etapas oe on oe.id = oc.op_etapa_id
  left join erp.etapas_producao e on e.id = oe.etapa_id
 where oc.eliminado_em is null;

-- chão de fábrica: sem preços, sem custos, sem clientes
create or replace view erp.v_chao_fabrica
 with (security_invoker = true) as
select oe.id as op_etapa_id, oe.op_id, o.numero as op_numero,
       o.produto_id, p.nome_cliente as produto_nome, p.cod_barras,
       o.quantidade, o.quantidade_produzida, o.prioridade, o.data_prevista,
       oe.etapa_id, e.codigo as etapa_codigo, e.nome as etapa_nome, e.exige_conferencia,
       oe.ordem, oe.estado, oe.quantidade_ok, oe.quantidade_refugo,
       oe.operador_id, u.nome as operador_nome, oe.iniciada_em,
       (select count(*) from erp.op_etapas a
         where a.op_id = oe.op_id and a.ordem < oe.ordem and a.eliminado_em is null
           and a.estado <> 'concluida') as etapas_anteriores_pendentes
  from erp.op_etapas oe
  join erp.ordens_producao o on o.id = oe.op_id
  join erp.produtos p on p.id = o.produto_id
  join erp.etapas_producao e on e.id = oe.etapa_id
  left join erp.utilizadores u on u.id = oe.operador_id
 where oe.eliminado_em is null and o.eliminado_em is null
   and o.estado in ('planeada','em_curso') and oe.estado <> 'concluida';

grant select on erp.v_etapas_producao, erp.v_necessidades_producao, erp.v_ordens_producao,
                erp.v_op_etapas, erp.v_componentes, erp.v_op_consumos, erp.v_chao_fabrica
  to authenticated;

grant execute on function erp.criar_op(uuid, uuid[], int, date, int, text) to authenticated;
grant execute on function erp.iniciar_etapa(uuid) to authenticated;
grant execute on function erp.concluir_etapa(uuid, int, int, text, text) to authenticated;
grant execute on function erp.conferir_etapa(uuid) to authenticated;
grant execute on function erp.concluir_op(uuid, int) to authenticated;
grant execute on function erp.cancelar_op(uuid, text) to authenticated;
grant execute on function erp.gravar_componente(uuid, uuid, uuid, numeric, text, uuid, text) to authenticated;
grant execute on function erp.componente_gera_ciclo(uuid, uuid) to authenticated;
grant execute on function erp.pode_ver_producao() to authenticated;
grant execute on function erp.pode_gerir_producao() to authenticated;
grant execute on function erp.pode_registar_producao() to authenticated;