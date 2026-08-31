-- 1) Vendas em entrega parcial entram no planeamento
create or replace view erp.v_pedidos_por_agendar
with (security_invoker = true) as
 SELECT p.id,
    p.numero,
    p.estado,
    p.cliente_id,
    c.nome AS cliente,
    p.data_entrega_prevista,
    p.data_entrega_prometida,
    p.morada_entrega,
    p.localidade_entrega,
    p.cp4_entrega,
    p.cp3_entrega,
    p.entrega_domicilio,
    p.zona_entrega_id,
    p.total,
    p.total_pago,
    erp.pendente_pedido(p.id) AS pendente,
    GREATEST(0, (CURRENT_DATE - COALESCE((p.confirmado_em)::date, (p.criado_em)::date))) AS dias_pronto,
    (COALESCE(oi.montagem_min, (0)::bigint))::integer AS montagem_min,
    (COALESCE(oi.cubicagem_m3, (0)::numeric))::numeric(12,2) AS cubicagem_m3,
    (COALESCE(oi.peso_kg, (0)::numeric))::numeric(12,2) AS peso_kg
   FROM ((erp.pedidos p
     LEFT JOIN erp.clientes c ON ((c.id = p.cliente_id)))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum((pe.qt_por_entregar * COALESCE(pr.tempo_montagem_min, 0))), (0)::bigint) AS montagem_min,
            COALESCE(sum(((pe.qt_por_entregar)::numeric * COALESCE(pr.volume_m3, (0)::numeric))), (0)::numeric) AS cubicagem_m3,
            COALESCE(sum(((pe.qt_por_entregar)::numeric * COALESCE(pr.peso_kg, (0)::numeric))), (0)::numeric) AS peso_kg
           FROM (erp.v_pedido_entrega pe
             LEFT JOIN erp.produtos pr ON ((pr.id = pe.produto_id)))
          WHERE ((pe.pedido_id = p.id) AND (pe.qt_por_entregar > 0))) oi ON (true))
  WHERE ((p.eliminado_em IS NULL)
     AND (p.estado = ANY (ARRAY['confirmado'::erp.estado_pedido, 'em_preparacao'::erp.estado_pedido, 'pronto'::erp.estado_pedido, 'entrega_parcial'::erp.estado_pedido]))
     AND (NOT (EXISTS ( SELECT 1
           FROM (erp.rota_paragens rp
             JOIN erp.rotas r ON ((r.id = rp.rota_id)))
          WHERE ((rp.pedido_id = p.id) AND (rp.eliminado_em IS NULL) AND (rp.desfecho IS NULL) AND (r.estado = ANY (ARRAY['planeada'::text, 'em_curso'::text])))))));

grant select on erp.v_pedidos_por_agendar to authenticated;

-- 2) Contagens da paragem apenas com o que falta entregar
create or replace view erp.v_rota_paragens
with (security_invoker = true) as
 SELECT rp.id, rp.criado_em, rp.criado_por, rp.atualizado_em, rp.atualizado_por,
    rp.eliminado_em, rp.eliminado_por, rp.motivo_eliminacao,
    rp.rota_id, rp.pedido_id, rp.ordem, rp.previsto_receber, rp.desfecho,
    rp.data_reagendamento, rp.motivo_id, rp.motivo, rp.entrega_id, rp.concluida_em,
    r.data AS rota_data, r.nome AS rota_nome, r.estado AS rota_estado, r.responsavel_id,
    p.numero AS pedido_numero, p.estado AS pedido_estado, p.total, p.total_pago,
    erp.pendente_pedido(p.id) AS pendente,
    p.morada_entrega, p.localidade_entrega, p.cp4_entrega, p.cp3_entrega,
    p.contacto_entrega, p.notas_entrega, p.entrega_domicilio,
    c.nome AS cliente, c.telefone_e164 AS cliente_telefone, c.telefone_alt AS cliente_telefone_alt,
    m.descricao AS motivo_descricao,
    rp.excedeu_capacidade,
    COALESCE(it.n_itens, 0) AS n_itens,
    COALESCE(it.n_montagens, 0) AS n_montagens,
    COALESCE(p.desconto_entrega, (0)::numeric) AS desconto_entrega
   FROM (((((erp.rota_paragens rp
     JOIN erp.rotas r ON ((r.id = rp.rota_id)))
     JOIN erp.pedidos p ON ((p.id = rp.pedido_id)))
     LEFT JOIN erp.clientes c ON ((c.id = p.cliente_id)))
     LEFT JOIN erp.motivos m ON ((m.id = rp.motivo_id)))
     LEFT JOIN LATERAL ( SELECT (sum(pe.qt_por_entregar))::integer AS n_itens,
            (sum(CASE WHEN i.montagem_incluida THEN pe.qt_por_entregar ELSE 0 END))::integer AS n_montagens
           FROM (erp.v_pedido_entrega pe
             JOIN erp.pedido_itens i ON ((i.id = pe.pedido_item_id)))
          WHERE ((pe.pedido_id = p.id) AND (pe.qt_por_entregar > 0))) it ON (true))
  WHERE (rp.eliminado_em IS NULL);

grant select on erp.v_rota_paragens to authenticated;

-- 3) Abrir rota manualmente também aceita vendas em entrega parcial
create or replace function erp.abrir_rota(p_nome text, p_responsavel_id uuid, p_pedidos jsonb, p_data date DEFAULT NULL::date, p_viatura text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'erp', 'public'
AS $function$
declare
  v_rota uuid; v_i int := 0; v_total numeric(12,2) := 0; v_prev numeric(12,2);
  v_pedido uuid; v_data date := coalesce(p_data, current_date); v_caixa uuid;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem montar rotas.';
  end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Dê um nome à rota.'; end if;
  if not exists (select 1 from erp.utilizadores u
                 where u.id = p_responsavel_id and u.ativo and u.eliminado_em is null) then
    raise exception 'O responsável da rota tem de ser um utilizador ativo.';
  end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' or jsonb_array_length(p_pedidos) = 0 then
    raise exception 'Escolha as vendas que entram nesta rota.';
  end if;

  insert into erp.rotas (data, nome, responsavel_id, viatura, estado, aberta_em)
  values (v_data, trim(p_nome), p_responsavel_id, nullif(trim(coalesce(p_viatura,'')),''),
          'em_curso', now())
  returning id into v_rota;

  for v_pedido in select (value #>> '{}')::uuid from jsonb_array_elements(p_pedidos) loop
    if not exists (select 1 from erp.pedidos p where p.id = v_pedido and p.eliminado_em is null
                     and p.estado in ('confirmado','em_preparacao','pronto','agendado','entrega_parcial')) then
      raise exception 'Só entram na rota vendas confirmadas, em preparação, prontas, agendadas ou em entrega parcial.';
    end if;
    if exists (select 1 from erp.rota_paragens rp join erp.rotas r on r.id = rp.rota_id
                where rp.pedido_id = v_pedido and rp.eliminado_em is null
                  and rp.desfecho is null and r.estado in ('planeada','em_curso')) then
      raise exception 'Esta venda já está numa rota em curso.';
    end if;
    v_i := v_i + 1;
    select coalesce(sum(pg.valor), 0) into v_prev from erp.pagamentos pg
     where pg.pedido_id = v_pedido and pg.eliminado_em is null
       and pg.estado in ('pendente','pendente_confirmacao');
    if v_prev = 0 then v_prev := erp.pendente_pedido(v_pedido); end if;
    insert into erp.rota_paragens (rota_id, pedido_id, ordem, previsto_receber)
    values (v_rota, v_pedido, v_i, v_prev);
    v_total := v_total + v_prev;
  end loop;

  update erp.rotas set previsto_entregas = v_i, previsto_receber = v_total where id = v_rota;

  v_caixa := erp.caixa_da_rota(v_rota);
  if v_caixa is null then
    insert into erp.caixas (utilizador_id, data, saldo_abertura, saldo_esperado, rota_id)
    values (p_responsavel_id, v_data, 0, 0, v_rota);
  end if;
  return v_rota;
end $function$;