-- 1) vendas: quanto falta receber depois de confirmar
create or replace view erp.v_conciliacao_vendas with (security_invoker = true) as
 SELECT p.id AS pedido_id,
    p.numero,
    p.estado,
    p.confirmado_em,
    p.data_entrega_prevista,
    p.vendedor_id,
    v.nome AS vendedor_nome,
    cl.nome AS cliente_nome,
    p.total,
    COALESCE(t.confirmado, 0::numeric) AS recebido_confirmado,
    COALESCE(t.pendente, 0::numeric) AS pendente_confirmacao,
    COALESCE(t.entrega, 0::numeric) AS a_receber_entrega,
    round(p.total - COALESCE(t.confirmado, 0::numeric) - COALESCE(t.pendente, 0::numeric) - COALESCE(t.entrega, 0::numeric), 2) AS divergencia,
    erp.por_registar_pedido(p.id) AS por_registar,
    erp.por_registar_pedido(p.id) <= 0.005 AS fechada,
    case
      when erp.por_registar_pedido(p.id) <= 0.005 then 'liquidada'
      when COALESCE(t.confirmado, 0::numeric) + COALESCE(t.pendente, 0::numeric) > 0 then 'parcial'
      else 'sem_recebimento'
    end AS estado_recebimento
   FROM erp.pedidos p
     LEFT JOIN erp.utilizadores v ON v.id = p.vendedor_id
     LEFT JOIN erp.clientes cl ON cl.id = p.cliente_id
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN pg.estado = 'confirmado'::text THEN pg.valor
                    ELSE 0::numeric
                END) AS confirmado,
            sum(
                CASE
                    WHEN (pg.estado = ANY (ARRAY['pendente'::text, 'pendente_confirmacao'::text])) AND COALESCE(f.momento, ''::text) <> 'entrega'::text THEN pg.valor
                    ELSE 0::numeric
                END) AS pendente,
            sum(
                CASE
                    WHEN (pg.estado = ANY (ARRAY['pendente'::text, 'pendente_confirmacao'::text])) AND f.momento = 'entrega'::text THEN pg.valor
                    ELSE 0::numeric
                END) AS entrega
           FROM erp.pagamentos pg
             JOIN erp.formas_pagamento f ON f.id = pg.forma_id
          WHERE pg.pedido_id = p.id AND pg.eliminado_em IS NULL) t ON true
  WHERE p.eliminado_em IS NULL AND (p.estado <> ALL (ARRAY['orcamento'::erp.estado_pedido, 'cancelado'::erp.estado_pedido]));

-- 2) rotas: previsto vs executado
create or replace view erp.v_rota_contas with (security_invoker = true) as
 SELECT r.id AS rota_id,
    r.data,
    r.nome,
    r.estado,
    r.responsavel_id,
    u.nome AS responsavel,
    r.previsto_entregas,
    r.previsto_receber,
    (erp.contas_da_rota(r.id) ->> 'entregas'::text)::integer AS entregas_feitas,
    (erp.contas_da_rota(r.id) ->> 'reagendadas'::text)::integer AS reagendadas,
    (erp.contas_da_rota(r.id) ->> 'nao_entregues'::text)::integer AS nao_entregues,
    ((erp.contas_da_rota(r.id) ->> 'recebido'::text))::numeric(12,2) AS recebido,
    ((erp.contas_da_rota(r.id) ->> 'dinheiro'::text))::numeric(12,2) AS dinheiro,
    ((erp.contas_da_rota(r.id) ->> 'saidas'::text))::numeric(12,2) AS saidas,
    ((erp.contas_da_rota(r.id) ->> 'esperado_envelope'::text))::numeric(12,2) AS esperado_envelope,
    r.valor_envelope,
    r.valor_conferido,
    r.diferenca,
    r.justificacao_diferenca,
    r.fechada_em,
    r.conferida_em,
    round(coalesce(((erp.contas_da_rota(r.id) ->> 'recebido')::numeric), 0) - coalesce(r.previsto_receber, 0), 2) AS divergencia_previsto,
    r.fechada_em is not null AS fechada,
    r.conferida_em is not null AS conferida
   FROM erp.rotas r
     LEFT JOIN erp.utilizadores u ON u.id = r.responsavel_id
  WHERE r.eliminado_em IS NULL;

-- 3) ordens de compra: unidades e estado de pagamento
create or replace view erp.v_ordens_compra with (security_invoker = true) as
 SELECT o.id,
    o.criado_em,
    o.criado_por,
    o.atualizado_em,
    o.atualizado_por,
    o.eliminado_em,
    o.eliminado_por,
    o.motivo_eliminacao,
    o.numero,
    o.fornecedor_id,
    o.estado,
    o.data_emissao,
    o.data_prevista,
    o.data_confirmada_fornecedor,
    o.data_recebida,
    o.moeda,
    o.total,
    o.observacoes,
    o.observacoes_fornecedor,
    o.enviada_em,
    o.enviada_por,
    o.enviada_para,
    o.envio_message_id,
    o.envio_erro,
    o.envio_tentativas,
    o.pdf_url,
    o.cancelada_em,
    o.motivo_cancelamento,
    f.nome AS fornecedor_nome,
    f.email_encomendas AS fornecedor_email,
    f.enviar_automatico,
    f.idioma AS fornecedor_idioma,
    ( SELECT count(*) AS count
           FROM erp.oc_itens i
          WHERE i.oc_id = o.id AND i.eliminado_em IS NULL) AS n_itens,
    ( SELECT COALESCE(sum(i.quantidade - i.quantidade_recebida), 0::bigint) AS "coalesce"
           FROM erp.oc_itens i
          WHERE i.oc_id = o.id AND i.eliminado_em IS NULL) AS unidades_em_falta,
    (o.estado = ANY (ARRAY['enviada'::erp.estado_oc, 'confirmada'::erp.estado_oc, 'recebida_parcial'::erp.estado_oc])) AND COALESCE(o.data_confirmada_fornecedor, o.data_prevista) IS NOT NULL AND COALESCE(o.data_confirmada_fornecedor, o.data_prevista) < CURRENT_DATE AS atrasada,
    ( SELECT COALESCE(sum(i.quantidade), 0)::bigint
           FROM erp.oc_itens i
          WHERE i.oc_id = o.id AND i.eliminado_em IS NULL) AS unidades_pedidas,
    ( SELECT COALESCE(sum(i.quantidade_recebida), 0)::bigint
           FROM erp.oc_itens i
          WHERE i.oc_id = o.id AND i.eliminado_em IS NULL) AS unidades_recebidas,
    COALESCE(cp.valor, 0::numeric)::numeric(12,2) AS valor_faturado,
    COALESCE(cp.pago, 0::numeric)::numeric(12,2) AS valor_pago,
    round(COALESCE(cp.valor, 0::numeric) - COALESCE(cp.pago, 0::numeric), 2) AS valor_em_divida,
    case
      when COALESCE(cp.n, 0) = 0 then 'sem_conta'
      when COALESCE(cp.valor, 0) - COALESCE(cp.pago, 0) <= 0.005 then 'pago'
      when COALESCE(cp.pago, 0) > 0 then 'parcial'
      else 'pendente'
    end AS estado_pagamento
   FROM erp.ordens_compra o
     JOIN erp.fornecedores f ON f.id = o.fornecedor_id
     LEFT JOIN LATERAL ( SELECT count(*) AS n, sum(c.valor) AS valor, sum(c.valor_pago) AS pago
           FROM erp.contas_pagar c
          WHERE c.oc_id = o.id AND c.eliminado_em IS NULL AND c.estado <> 'cancelada') cp ON true
  WHERE o.eliminado_em IS NULL;

-- 4) finalizar_oc cria logo a conta a pagar
create or replace function erp.finalizar_oc(p_oc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = erp, public
as $fn$
declare
  oc erp.ordens_compra%rowtype;
  forn erp.fornecedores%rowtype;
  v_numero text;
  v_sem_custo int;
  v_prazo int;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem finalizar ordens de compra.';
  end if;
  select * into oc from erp.ordens_compra where id = p_oc_id and eliminado_em is null for update;
  if oc.id is null then raise exception 'Ordem de compra não encontrada.'; end if;
  if oc.enviada_em is not null then
    raise exception 'Esta ordem de compra já foi enviada. Use o botão de reenviar.';
  end if;
  if oc.estado <> 'rascunho' then
    raise exception 'Esta ordem de compra já foi finalizada.';
  end if;

  select * into forn from erp.fornecedores where id = oc.fornecedor_id;
  if not exists (select 1 from erp.oc_itens where oc_id = p_oc_id and eliminado_em is null) then
    raise exception 'A ordem de compra não tem linhas.';
  end if;
  select count(*) into v_sem_custo from erp.oc_itens
   where oc_id = p_oc_id and eliminado_em is null and custo_unitario <= 0;
  if v_sem_custo > 0 then
    raise exception 'Há % linha(s) sem custo unitário. Preencha o custo antes de finalizar.', v_sem_custo;
  end if;
  perform erp.recalcular_oc(p_oc_id);
  select * into oc from erp.ordens_compra where id = p_oc_id;
  if forn.valor_minimo_encomenda is not null and oc.total < forn.valor_minimo_encomenda then
    raise exception 'O fornecedor "%" exige uma encomenda mínima de % €.',
      forn.nome, forn.valor_minimo_encomenda;
  end if;
  if forn.enviar_automatico and coalesce(forn.email_encomendas, '') = '' then
    raise exception 'O fornecedor "%" está marcado para envio automático mas não tem email de encomendas.', forn.nome;
  end if;

  v_numero := erp.proximo_numero('ordem_compra');
  update erp.ordens_compra
     set numero = v_numero, estado = 'pronta_enviar', data_emissao = current_date
   where id = p_oc_id;

  update erp.stock_atual s
     set em_transito_compra = s.em_transito_compra + t.qtd, atualizado_em = now()
    from (select produto_id, sum(quantidade) as qtd from erp.oc_itens
           where oc_id = p_oc_id and eliminado_em is null and produto_id is not null
           group by produto_id) t
   where s.produto_id = t.produto_id;

  select coalesce((select (valor #>> '{}')::int from erp.definicoes
                    where chave = 'prazo_pagamento_fornecedor_dias' and eliminado_em is null), 30)
    into v_prazo;

  if oc.total > 0 and not exists (select 1 from erp.contas_pagar
                                   where oc_id = p_oc_id and eliminado_em is null
                                     and estado <> 'cancelada') then
    insert into erp.contas_pagar (fornecedor_id, oc_id, descricao, categoria, valor, data_vencimento)
    values (oc.fornecedor_id, p_oc_id, 'Ordem de compra ' || v_numero, 'mercadoria',
            oc.total, current_date + v_prazo);
  end if;

  return jsonb_build_object('numero', v_numero, 'automatico', forn.enviar_automatico,
                            'email', forn.email_encomendas, 'idioma', forn.idioma);
end
$fn$;

-- 5) receber_oc: atualiza a conta existente em vez de duplicar
create or replace function erp.receber_oc(p_oc_id uuid, p_linhas jsonb, p_doc text default null, p_observacoes text default null)
returns jsonb
language plpgsql
security definer
set search_path = erp, public
as $fn$
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
  v_conta uuid;
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

  select id into v_conta from erp.contas_pagar
   where oc_id = p_oc_id and eliminado_em is null and estado <> 'cancelada'
   order by criado_em limit 1;

  if v_conta is not null then
    update erp.contas_pagar
       set doc_fornecedor = coalesce(nullif(trim(coalesce(p_doc, '')), ''), doc_fornecedor)
     where id = v_conta;
  elsif v_total > 0 then
    insert into erp.contas_pagar (fornecedor_id, oc_id, descricao, categoria, valor,
                                  data_vencimento, doc_fornecedor)
    values (oc.fornecedor_id, p_oc_id,
            'Receção da ordem de compra ' || oc.numero, 'mercadoria', v_total,
            current_date + v_prazo, nullif(trim(coalesce(p_doc, '')), ''));
  end if;

  return jsonb_build_object('recebimento_id', v_receb, 'unidades', v_unidades, 'valor', v_total);
end
$fn$;

revoke all on function erp.finalizar_oc(uuid) from public;
revoke all on function erp.receber_oc(uuid, jsonb, text, text) from public;
grant execute on function erp.finalizar_oc(uuid) to authenticated;
grant execute on function erp.receber_oc(uuid, jsonb, text, text) to authenticated;