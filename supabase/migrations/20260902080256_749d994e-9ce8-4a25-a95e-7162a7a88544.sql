-- Componentes sem etapa: consumir na primeira etapa da ordem

create or replace function erp.iniciar_etapa(p_op_etapa_id uuid)
 returns void language plpgsql security definer set search_path to 'erp','public'
as $$
declare
  et erp.op_etapas%rowtype;
  ant record;
  sub record;
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

  -- sub-OPs dos componentes desta etapa têm de estar concluídas
  for sub in
    select o.numero, p.nome_cliente
      from erp.ordens_producao o
      join erp.produtos p on p.id = o.produto_id
     where o.op_pai_id = et.op_id and o.eliminado_em is null
       and o.estado in ('planeada','em_curso')
       and exists (select 1 from erp.componentes c
                    where c.produto_id = (select produto_id from erp.ordens_producao where id = et.op_id)
                      and c.componente_id = o.produto_id and c.eliminado_em is null
                      and (c.etapa_id = et.etapa_id
                           or (c.etapa_id is null and et.ordem = (
                                 select min(oe2.ordem) from erp.op_etapas oe2
                                  where oe2.op_id = et.op_id and oe2.eliminado_em is null))))
  loop
    raise exception 'Falta concluir a ordem % de "%" antes desta etapa.', sub.numero, sub.nome_cliente;
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
) returns jsonb language plpgsql security definer set search_path to 'erp','public'
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
  v_tem_bom boolean;
  v_forn uuid;
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

  for c in
    select co.componente_id, co.quantidade, p.nome_cliente, p.fornecedor_id, p.tipo_fornecimento
      from erp.componentes co
      join erp.produtos p on p.id = co.componente_id
     where co.produto_id = op.produto_id and co.eliminado_em is null
       and (co.etapa_id = et.etapa_id
            or (co.etapa_id is null and et.ordem = (
                  select min(oe2.ordem) from erp.op_etapas oe2
                   where oe2.op_id = et.op_id and oe2.eliminado_em is null)))
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

      select exists (select 1 from erp.componentes x
                      where x.produto_id = c.componente_id and x.eliminado_em is null)
        into v_tem_bom;

      if v_tem_bom then
        -- avisa e resolve: sub-OP automática, sem bloquear a fábrica
        if not exists (select 1 from erp.ordens_producao o
                        where o.op_pai_id = et.op_id and o.produto_id = c.componente_id
                          and o.eliminado_em is null and o.estado in ('planeada','em_curso')) then
          perform erp.criar_op_interna(c.componente_id, null, v_falta, op.data_prevista,
                                       op.prioridade, 'Falta na ordem ' || op.numero,
                                       op.plano_id, 'stock', et.op_id);
        end if;
      else
        select fornecedor_id into v_forn from erp.produtos where id = c.componente_id;
        if not exists (select 1 from erp.necessidades_compra n
                        where n.op_id = et.op_id and n.produto_id = c.componente_id
                          and n.eliminado_em is null and n.estado = 'aberta') then
          insert into erp.necessidades_compra (produto_id, fornecedor_id, quantidade, origem, op_id)
          values (c.componente_id, v_forn, v_falta, 'producao', et.op_id);
        end if;
      end if;
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
         concluida_em = now(),
         minutos_reais = round(extract(epoch from (now() - coalesce(iniciada_em, now()))) / 60.0, 2)
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
