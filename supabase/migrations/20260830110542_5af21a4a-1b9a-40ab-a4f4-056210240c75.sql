create or replace function erp.criar_oc(p_fornecedor_id uuid, p_necessidade_ids uuid[])
returns uuid language plpgsql security definer set search_path = erp, public as $$
declare
  forn erp.fornecedores%rowtype;
  n record;
  v_oc uuid;
  v_linha int := 0;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem criar ordens de compra.';
  end if;
  select * into forn from erp.fornecedores where id = p_fornecedor_id and eliminado_em is null;
  if forn.id is null then raise exception 'Fornecedor não encontrado.'; end if;
  if not forn.ativo then raise exception 'O fornecedor "%" está inativo.', forn.nome; end if;
  if p_necessidade_ids is null or array_length(p_necessidade_ids, 1) is null then
    raise exception 'Escolha pelo menos uma necessidade.';
  end if;

  insert into erp.ordens_compra (numero, fornecedor_id, data_prevista)
  values ('RASC-' || lpad(nextval('erp.seq_oc_rascunho')::text, 6, '0'),
          p_fornecedor_id,
          erp.somar_dias_uteis(current_date, forn.prazo_dias))
  returning id into v_oc;

  for n in
    select nc.id, nc.estado, nc.fornecedor_id, nc.produto_id, nc.quantidade, nc.item_id,
           pr.nome_cliente, pr.custo_ultimo
      from erp.necessidades_compra nc
      join erp.produtos pr on pr.id = nc.produto_id
     where nc.id = any(p_necessidade_ids)
       and nc.eliminado_em is null
     order by nc.criado_em
  loop
    if n.estado <> 'aberta' then
      raise exception 'A necessidade do produto "%" já não está aberta.', n.nome_cliente;
    end if;
    if n.fornecedor_id is not null and n.fornecedor_id <> p_fornecedor_id then
      raise exception 'A necessidade do produto "%" pertence a outro fornecedor.', n.nome_cliente;
    end if;
    v_linha := v_linha + 1;
    insert into erp.oc_itens (oc_id, linha, produto_id, descricao, quantidade,
                              custo_unitario, data_prevista_item, necessidade_id, pedido_item_id)
    values (v_oc, v_linha, n.produto_id, n.nome_cliente, n.quantidade,
            coalesce(n.custo_ultimo, 0),
            erp.somar_dias_uteis(current_date, forn.prazo_dias), n.id, n.item_id);

    update erp.necessidades_compra
       set estado = 'encomendada', oc_id = v_oc
     where id = n.id;
  end loop;

  if v_linha = 0 then raise exception 'Nenhuma das necessidades escolhidas pode ser encomendada.'; end if;
  perform erp.recalcular_oc(v_oc);
  return v_oc;
end $$;

create or replace function erp.finalizar_oc(p_oc_id uuid)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare
  oc erp.ordens_compra%rowtype;
  forn erp.fornecedores%rowtype;
  v_numero text;
  v_sem_custo int;
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

  return jsonb_build_object('numero', v_numero, 'automatico', forn.enviar_automatico,
                            'email', forn.email_encomendas, 'idioma', forn.idioma);
end $$;

create or replace function erp.registar_envio_oc(
  p_oc_id uuid, p_message_id text default null, p_erro text default null, p_para text default null)
returns void language plpgsql security definer set search_path = erp, public as $$
declare oc erp.ordens_compra%rowtype;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem enviar ordens de compra.';
  end if;
  select * into oc from erp.ordens_compra where id = p_oc_id and eliminado_em is null for update;
  if oc.id is null then raise exception 'Ordem de compra não encontrada.'; end if;
  if oc.estado in ('rascunho','cancelada') then
    raise exception 'Finalize a ordem de compra antes de a enviar.';
  end if;

  if p_erro is null then
    update erp.ordens_compra
       set estado = case when estado = 'pronta_enviar' then 'enviada'::erp.estado_oc else estado end,
           enviada_em = now(), enviada_por = auth.uid(),
           enviada_para = coalesce(p_para, enviada_para),
           envio_message_id = p_message_id, envio_erro = null,
           envio_tentativas = envio_tentativas + 1
     where id = p_oc_id;
  else
    update erp.ordens_compra
       set envio_erro = p_erro, envio_tentativas = envio_tentativas + 1,
           enviada_para = coalesce(p_para, enviada_para)
     where id = p_oc_id;
  end if;
end $$;

create or replace function erp.confirmar_eta_oc(p_oc_id uuid, p_data date)
returns void language plpgsql security definer set search_path = erp, public as $$
declare
  oc erp.ordens_compra%rowtype;
  v_antes date;
  v_piorou boolean := false;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem confirmar datas de fornecedor.';
  end if;
  select * into oc from erp.ordens_compra where id = p_oc_id and eliminado_em is null for update;
  if oc.id is null then raise exception 'Ordem de compra não encontrada.'; end if;
  if p_data is null then raise exception 'Indique a data confirmada pelo fornecedor.'; end if;
  if oc.estado in ('rascunho','cancelada') then
    raise exception 'Só se confirma a data de uma ordem de compra já emitida.';
  end if;

  v_antes := coalesce(oc.data_confirmada_fornecedor, oc.data_prevista);
  v_piorou := v_antes is not null and p_data > v_antes;

  update erp.ordens_compra
     set data_confirmada_fornecedor = p_data,
         estado = case when estado = 'enviada' then 'confirmada'::erp.estado_oc else estado end
   where id = p_oc_id;

  update erp.oc_itens set data_prevista_item = p_data
   where oc_id = p_oc_id and eliminado_em is null;

  perform set_config('erp.motor', '1', true);
  update erp.pedido_itens pi
     set data_prevista = p_data
    from erp.oc_itens i
   where i.oc_id = p_oc_id and i.eliminado_em is null
     and pi.id = i.pedido_item_id and pi.eliminado_em is null;
  perform set_config('erp.motor', '', true);

  if v_piorou then
    insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
    select d.perfil, 'Atraso confirmado pelo fornecedor',
           'A ordem de compra ' || oc.numero || ' passou de ' || to_char(v_antes, 'DD/MM/YYYY') ||
           ' para ' || to_char(p_data, 'DD/MM/YYYY') || '. Avise os clientes afetados.',
           'ordem_compra', p_oc_id
      from (values ('escritorio'::erp.perfil), ('adm'::erp.perfil)) as d(perfil);
  end if;
end $$;

create or replace function erp.receber_oc(p_oc_id uuid, p_linhas jsonb, p_doc text default null,
                                          p_observacoes text default null)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare
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
      select pi.pedido_id into ped
        from erp.pedido_itens pi where pi.id = it.pedido_item_id and pi.eliminado_em is null;
      if ped.pedido_id is not null then
        v_reserva := erp.reservar(it.produto_id, l.quantidade, 'pedido', ped.pedido_id,
                                  it.pedido_item_id, null);
        update erp.pedido_itens
           set reserva_id = coalesce(reserva_id, v_reserva),
               estado = case when it.quantidade_recebida + l.quantidade >= it.quantidade
                             then 'reservado'::erp.estado_item else estado end
         where id = it.pedido_item_id;
      end if;
    end if;

    if it.necessidade_id is not null
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

create or replace function erp.cancelar_oc(p_oc_id uuid, p_motivo_id uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = erp, public as $$
declare
  oc erp.ordens_compra%rowtype;
  mot erp.motivos%rowtype;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem cancelar ordens de compra.';
  end if;
  select * into oc from erp.ordens_compra where id = p_oc_id and eliminado_em is null for update;
  if oc.id is null then raise exception 'Ordem de compra não encontrada.'; end if;
  if oc.estado = 'cancelada' then raise exception 'Esta ordem de compra já está cancelada.'; end if;
  if exists (select 1 from erp.oc_recebimentos where oc_id = p_oc_id and eliminado_em is null) then
    raise exception 'Não é possível cancelar: já há mercadoria recebida nesta ordem de compra.';
  end if;
  select * into mot from erp.motivos where id = p_motivo_id and eliminado_em is null;
  if mot.id is null then raise exception 'Escolha o motivo do cancelamento.'; end if;
  if mot.exige_texto and coalesce(trim(p_nota), '') = '' then
    raise exception 'Este motivo exige uma explicação escrita.';
  end if;

  update erp.necessidades_compra
     set estado = 'aberta', oc_id = null
   where oc_id = p_oc_id and estado = 'encomendada' and eliminado_em is null;

  if oc.estado in ('pronta_enviar','enviada','confirmada') then
    update erp.stock_atual s
       set em_transito_compra = greatest(0, s.em_transito_compra - t.qtd), atualizado_em = now()
      from (select produto_id, sum(quantidade) as qtd from erp.oc_itens
             where oc_id = p_oc_id and eliminado_em is null and produto_id is not null
             group by produto_id) t
     where s.produto_id = t.produto_id;
  end if;

  update erp.ordens_compra
     set estado = 'cancelada', cancelada_em = now(),
         motivo_cancelamento = mot.descricao || coalesce(' — ' || nullif(trim(p_nota), ''), '')
   where id = p_oc_id;
end $$;

create or replace function erp.registar_pagamento_conta(
  p_conta_id uuid, p_valor numeric, p_data date default null,
  p_doc text default null, p_comprovativo_url text default null)
returns void language plpgsql security definer set search_path = erp, public as $$
declare c erp.contas_pagar%rowtype;
begin
  if not erp.pode_pagar() then
    raise exception 'Só o Financeiro e a Administração podem registar pagamentos a fornecedores.';
  end if;
  select * into c from erp.contas_pagar where id = p_conta_id and eliminado_em is null for update;
  if c.id is null then raise exception 'Conta a pagar não encontrada.'; end if;
  if c.estado = 'cancelada' then raise exception 'Esta conta está cancelada.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'O valor do pagamento tem de ser positivo.'; end if;
  if round(p_valor, 2) > c.valor - c.valor_pago then
    raise exception 'Só faltam % € nesta conta.', to_char(c.valor - c.valor_pago, 'FM999999990.00');
  end if;

  update erp.contas_pagar
     set valor_pago = valor_pago + round(p_valor, 2),
         data_pagamento = coalesce(p_data, current_date),
         doc_fornecedor = coalesce(nullif(trim(coalesce(p_doc, '')), ''), doc_fornecedor),
         comprovativo_url = coalesce(nullif(trim(coalesce(p_comprovativo_url, '')), ''), comprovativo_url)
   where id = p_conta_id;
end $$;

create or replace function erp.recalcular_pedido_compra(p_id uuid)
returns void language plpgsql security definer set search_path = erp, public as $$
begin
  update erp.pedidos_compra pc
     set valor_estimado = coalesce((
           select sum(round(i.quantidade * i.custo_estimado, 2))
             from erp.pedidos_compra_itens i
            where i.pedido_compra_id = p_id and i.eliminado_em is null), 0)
   where pc.id = p_id;
end $$;

create or replace function erp.tg_pc_itens_total()
returns trigger language plpgsql security definer set search_path = erp, public as $$
begin
  perform erp.recalcular_pedido_compra(coalesce(NEW.pedido_compra_id, OLD.pedido_compra_id));
  return null;
end $$;

create trigger t_pc_itens_total after insert or update on erp.pedidos_compra_itens
  for each row execute function erp.tg_pc_itens_total();

create or replace function erp.criar_pedido_compra(
  p_destino text, p_justificacao text, p_urgencia text default 'normal')
returns uuid language plpgsql security definer set search_path = erp, public as $$
declare v_id uuid; v_sol uuid;
begin
  if not erp.is_ativo() then raise exception 'A sua conta não tem acesso ativo.'; end if;
  v_sol := erp.utilizador_atual();
  if coalesce(trim(p_justificacao), '') = '' then
    raise exception 'Escreva a justificação do pedido de compra.';
  end if;
  insert into erp.pedidos_compra (numero, solicitante_id, urgencia, destino, justificacao)
  values (erp.proximo_numero('pedido_compra'), v_sol, coalesce(p_urgencia, 'normal'),
          p_destino, trim(p_justificacao))
  returning id into v_id;
  return v_id;
end $$;

create or replace function erp.submeter_pedido_compra(p_id uuid)
returns text language plpgsql security definer set search_path = erp, public as $$
declare pc erp.pedidos_compra%rowtype; v_limite numeric; v_valor numeric;
begin
  if not erp.is_ativo() then raise exception 'A sua conta não tem acesso ativo.'; end if;
  select * into pc from erp.pedidos_compra where id = p_id and eliminado_em is null for update;
  if pc.id is null then raise exception 'Pedido de compra não encontrado.'; end if;
  if pc.estado <> 'rascunho' then raise exception 'Este pedido de compra já foi submetido.'; end if;
  if not exists (select 1 from erp.pedidos_compra_itens
                  where pedido_compra_id = p_id and eliminado_em is null) then
    raise exception 'O pedido de compra não tem linhas.';
  end if;
  perform erp.recalcular_pedido_compra(p_id);
  select valor_estimado into v_valor from erp.pedidos_compra where id = p_id;
  select coalesce((select (valor #>> '{}')::numeric from erp.definicoes
                    where chave = 'limite_aprovacao_compra' and eliminado_em is null), 500)
    into v_limite;

  if v_valor <= v_limite then
    update erp.pedidos_compra
       set estado = 'aprovado', data_aprovacao = now(), aprovador_id = erp.utilizador_atual()
     where id = p_id;
    return 'aprovado';
  end if;
  update erp.pedidos_compra set estado = 'submetido' where id = p_id;
  insert into erp.alertas (perfil_destino, titulo, mensagem, referencia_tipo, referencia_id)
  values ('adm', 'Pedido de compra a aguardar aprovação',
          'O pedido de compra ' || pc.numero || ' (' ||
          to_char(v_valor, 'FM999999990.00') || ' €) precisa de aprovação.',
          'pedido_compra', p_id);
  return 'submetido';
end $$;

create or replace function erp.aprovar_pedido_compra(p_id uuid)
returns void language plpgsql security definer set search_path = erp, public as $$
begin
  if not erp.is_adm() then raise exception 'Só a Administração pode aprovar pedidos de compra.'; end if;
  update erp.pedidos_compra
     set estado = 'aprovado', data_aprovacao = now(), aprovador_id = erp.utilizador_atual(),
         motivo_recusa = null
   where id = p_id and eliminado_em is null and estado = 'submetido';
  if not found then raise exception 'Este pedido de compra não está a aguardar aprovação.'; end if;
end $$;

create or replace function erp.recusar_pedido_compra(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = erp, public as $$
begin
  if not erp.is_adm() then raise exception 'Só a Administração pode recusar pedidos de compra.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escreva o motivo da recusa.'; end if;
  update erp.pedidos_compra
     set estado = 'recusado', motivo_recusa = trim(p_motivo),
         aprovador_id = erp.utilizador_atual(), data_aprovacao = now()
   where id = p_id and eliminado_em is null and estado = 'submetido';
  if not found then raise exception 'Este pedido de compra não está a aguardar aprovação.'; end if;
end $$;

create or replace function erp.converter_pedido_compra(p_id uuid, p_fornecedor_id uuid)
returns uuid language plpgsql security definer set search_path = erp, public as $$
declare
  pc erp.pedidos_compra%rowtype;
  forn erp.fornecedores%rowtype;
  i record;
  v_oc uuid;
  v_linha int := 0;
begin
  if not erp.pode_comprar() then
    raise exception 'Só as Compras e a Administração podem converter pedidos em ordens de compra.';
  end if;
  select * into pc from erp.pedidos_compra where id = p_id and eliminado_em is null for update;
  if pc.id is null then raise exception 'Pedido de compra não encontrado.'; end if;
  if pc.estado <> 'aprovado' then raise exception 'Só um pedido de compra aprovado pode ser convertido.'; end if;
  select * into forn from erp.fornecedores where id = p_fornecedor_id and eliminado_em is null;
  if forn.id is null then raise exception 'Fornecedor não encontrado.'; end if;

  insert into erp.ordens_compra (numero, fornecedor_id, data_prevista, observacoes)
  values ('RASC-' || lpad(nextval('erp.seq_oc_rascunho')::text, 6, '0'), p_fornecedor_id,
          erp.somar_dias_uteis(current_date, forn.prazo_dias),
          'Pedido de compra ' || pc.numero || ': ' || pc.justificacao)
  returning id into v_oc;

  for i in select pci.produto_id, pci.descricao_livre, pci.quantidade, pci.custo_estimado,
                  pr.nome_cliente, pr.custo_ultimo
             from erp.pedidos_compra_itens pci
             left join erp.produtos pr on pr.id = pci.produto_id
            where pci.pedido_compra_id = p_id and pci.eliminado_em is null
            order by pci.criado_em
  loop
    v_linha := v_linha + 1;
    insert into erp.oc_itens (oc_id, linha, produto_id, descricao, quantidade, custo_unitario,
                              data_prevista_item)
    values (v_oc, v_linha, i.produto_id,
            coalesce(i.nome_cliente, i.descricao_livre), i.quantidade,
            case when i.custo_estimado > 0 then i.custo_estimado else coalesce(i.custo_ultimo, 0) end,
            erp.somar_dias_uteis(current_date, forn.prazo_dias));
  end loop;

  update erp.pedidos_compra set estado = 'convertido', oc_id = v_oc where id = p_id;
  perform erp.recalcular_oc(v_oc);
  return v_oc;
end $$;

create or replace function erp.gerar_necessidades_reposicao()
returns int language plpgsql security definer set search_path = erp, public as $$
declare v_n int := 0;
begin
  insert into erp.necessidades_compra (produto_id, fornecedor_id, quantidade, origem, estado)
  select p.id, p.fornecedor_id,
         greatest(1, p.ponto_reposicao - coalesce(s.vendavel, 0)), 'reposicao', 'aberta'
    from erp.produtos p
    left join erp.stock_atual s on s.produto_id = p.id
   where p.eliminado_em is null and p.ativo
     and p.ponto_reposicao is not null
     and coalesce(s.vendavel, 0) < p.ponto_reposicao
     and not exists (
       select 1 from erp.necessidades_compra n
        where n.produto_id = p.id and n.origem = 'reposicao'
          and n.estado = 'aberta' and n.eliminado_em is null)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function erp.criar_oc(uuid, uuid[]) from public, anon;
revoke all on function erp.finalizar_oc(uuid) from public, anon;
revoke all on function erp.registar_envio_oc(uuid, text, text, text) from public, anon;
revoke all on function erp.confirmar_eta_oc(uuid, date) from public, anon;
revoke all on function erp.receber_oc(uuid, jsonb, text, text) from public, anon;
revoke all on function erp.cancelar_oc(uuid, uuid, text) from public, anon;
revoke all on function erp.registar_pagamento_conta(uuid, numeric, date, text, text) from public, anon;
revoke all on function erp.criar_pedido_compra(text, text, text) from public, anon;
revoke all on function erp.submeter_pedido_compra(uuid) from public, anon;
revoke all on function erp.aprovar_pedido_compra(uuid) from public, anon;
revoke all on function erp.recusar_pedido_compra(uuid, text) from public, anon;
revoke all on function erp.converter_pedido_compra(uuid, uuid) from public, anon;
revoke all on function erp.gerar_necessidades_reposicao() from public, anon;
revoke all on function erp.recalcular_oc(uuid) from public, anon;
revoke all on function erp.recalcular_pedido_compra(uuid) from public, anon;

grant execute on function erp.criar_oc(uuid, uuid[]) to authenticated;
grant execute on function erp.finalizar_oc(uuid) to authenticated;
grant execute on function erp.registar_envio_oc(uuid, text, text, text) to authenticated;
grant execute on function erp.confirmar_eta_oc(uuid, date) to authenticated;
grant execute on function erp.receber_oc(uuid, jsonb, text, text) to authenticated;
grant execute on function erp.cancelar_oc(uuid, uuid, text) to authenticated;
grant execute on function erp.registar_pagamento_conta(uuid, numeric, date, text, text) to authenticated;
grant execute on function erp.criar_pedido_compra(text, text, text) to authenticated;
grant execute on function erp.submeter_pedido_compra(uuid) to authenticated;
grant execute on function erp.aprovar_pedido_compra(uuid) to authenticated;
grant execute on function erp.recusar_pedido_compra(uuid, text) to authenticated;
grant execute on function erp.converter_pedido_compra(uuid, uuid) to authenticated;
grant execute on function erp.recalcular_oc(uuid) to authenticated;
grant execute on function erp.recalcular_pedido_compra(uuid) to authenticated;
grant execute on function erp.gerar_necessidades_reposicao() to service_role;

insert into erp.motivos (contexto, descricao, exige_texto, ordem)
select 'cancelamento', v.d, v.e, v.o from (values
  ('Fornecedor sem disponibilidade', false, 50),
  ('Cliente cancelou a venda', false, 51),
  ('Encomenda duplicada', false, 52),
  ('Outro motivo de compra (explicar)', true, 53)
) as v(d, e, o)
where not exists (
  select 1 from erp.motivos m where m.contexto = 'cancelamento' and m.descricao = v.d
);