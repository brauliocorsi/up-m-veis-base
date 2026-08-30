-- 1) necessidades: encomendado / recebido / falta
create or replace view erp.v_necessidades_compra as
 SELECT n.id, n.criado_em, n.criado_por, n.atualizado_em, n.atualizado_por,
    n.eliminado_em, n.eliminado_por, n.motivo_eliminacao,
    n.pedido_id, n.item_id, n.produto_id, n.fornecedor_id, n.quantidade, n.estado,
    n.origem, n.oc_id,
    p.numero AS pedido_numero,
    c.nome AS cliente_nome,
    pr.nome_cliente AS produto_nome,
    pr.cod_barras,
    f.nome AS fornecedor_nome,
    o.numero AS oc_numero,
    coalesce(q.encomendado, 0)::int AS encomendado,
    coalesce(q.recebido, 0)::int AS recebido,
    greatest(n.quantidade - coalesce(q.recebido, 0), 0)::int AS falta
   FROM erp.necessidades_compra n
     LEFT JOIN erp.pedidos p ON p.id = n.pedido_id
     LEFT JOIN erp.clientes c ON c.id = p.cliente_id
     JOIN erp.produtos pr ON pr.id = n.produto_id
     LEFT JOIN erp.fornecedores f ON f.id = n.fornecedor_id
     LEFT JOIN erp.ordens_compra o ON o.id = n.oc_id
     LEFT JOIN LATERAL (
       SELECT sum(oi.quantidade)::int AS encomendado,
              sum(oi.quantidade_recebida)::int AS recebido
         FROM erp.oc_itens oi
         JOIN erp.ordens_compra oo ON oo.id = oi.oc_id
        WHERE oi.necessidade_id = n.id
          AND oi.eliminado_em IS NULL
          AND oo.estado <> 'cancelada'
     ) q ON true
  WHERE n.eliminado_em IS NULL;

-- 2) v_oc_itens: fornecedor e datas da OC
create or replace view erp.v_oc_itens as
 SELECT i.id, i.criado_em, i.criado_por, i.atualizado_em, i.atualizado_por,
    i.eliminado_em, i.eliminado_por, i.motivo_eliminacao,
    i.oc_id, i.linha, i.produto_id, i.descricao, i.quantidade, i.quantidade_recebida,
    i.custo_unitario, i.total_linha, i.data_prevista_item, i.necessidade_id, i.pedido_item_id,
    o.numero AS oc_numero, o.estado AS oc_estado, o.fornecedor_id,
    pr.nome_cliente AS produto_nome, pr.cod_barras,
    i.quantidade - i.quantidade_recebida AS em_falta,
    p.numero AS pedido_numero, p.id AS pedido_id, c.nome AS cliente_nome,
    f.nome AS fornecedor_nome,
    o.data_prevista AS oc_data_prevista,
    o.data_confirmada_fornecedor AS oc_data_confirmada,
    o.data_emissao AS oc_data_emissao
   FROM erp.oc_itens i
     JOIN erp.ordens_compra o ON o.id = i.oc_id
     LEFT JOIN erp.fornecedores f ON f.id = o.fornecedor_id
     LEFT JOIN erp.produtos pr ON pr.id = i.produto_id
     LEFT JOIN erp.pedido_itens pi ON pi.id = i.pedido_item_id
     LEFT JOIN erp.pedidos p ON p.id = pi.pedido_id
     LEFT JOIN erp.clientes c ON c.id = p.cliente_id
  WHERE i.eliminado_em IS NULL;

-- 3) v_pedido_itens: contexto do pedido para a ficha do produto
create or replace view erp.v_pedido_itens as
 SELECT i.id, i.criado_em, i.criado_por, i.atualizado_em, i.atualizado_por,
    i.eliminado_em, i.eliminado_por, i.motivo_eliminacao,
    i.pedido_id, i.linha, i.produto_id, i.servico_id, i.descricao, i.cod_barras,
    i.quantidade, i.preco_unitario, i.preco_tabela, i.desconto_pct, i.desconto_valor,
    i.total_linha, i.iva_pct, i.montagem_incluida, i.valor_montagem_unit,
    i.tipo_fornecimento, i.data_prevista, i.estado, i.reserva_id, i.nota,
    p.nome_cliente AS produto_nome, p.imagem_url, s.nome AS servico_nome,
    ped.numero AS pedido_numero,
    ped.tipo AS pedido_tipo,
    ped.estado AS pedido_estado,
    ped.data_entrega_prevista,
    cli.nome AS cliente_nome
   FROM erp.pedido_itens i
     LEFT JOIN erp.produtos p ON p.id = i.produto_id
     LEFT JOIN erp.servicos s ON s.id = i.servico_id
     JOIN erp.pedidos ped ON ped.id = i.pedido_id
     LEFT JOIN erp.clientes cli ON cli.id = ped.cliente_id
  WHERE i.eliminado_em IS NULL;

-- 4) nota de encomenda guardada
alter table erp.pedidos add column if not exists nota_pdf_path text;
alter table erp.pedidos add column if not exists nota_pdf_em timestamptz;

-- 5) criar OC a partir de várias necessidades com quantidade escolhida
create or replace function erp.criar_oc_linhas(p_fornecedor_id uuid, p_linhas jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'erp', 'public'
as $$
declare
  forn erp.fornecedores%rowtype;
  l record;
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
  if p_linhas is null or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Escolha pelo menos uma necessidade.';
  end if;

  insert into erp.ordens_compra (numero, fornecedor_id, data_prevista)
  values ('RASC-' || lpad(nextval('erp.seq_oc_rascunho')::text, 6, '0'),
          p_fornecedor_id,
          erp.somar_dias_uteis(current_date, forn.prazo_dias))
  returning id into v_oc;

  for l in select (x->>'necessidade_id')::uuid as necessidade_id,
                  (x->>'quantidade')::int as quantidade
             from jsonb_array_elements(p_linhas) x
  loop
    select nc.id, nc.estado, nc.fornecedor_id, nc.produto_id, nc.quantidade, nc.item_id,
           pr.nome_cliente, pr.custo_ultimo
      into n
      from erp.necessidades_compra nc
      join erp.produtos pr on pr.id = nc.produto_id
     where nc.id = l.necessidade_id and nc.eliminado_em is null
       for update of nc;
    if n.id is null then raise exception 'Necessidade não encontrada.'; end if;
    if n.estado <> 'aberta' then
      raise exception 'A necessidade do produto "%" já não está aberta.', n.nome_cliente;
    end if;
    if n.fornecedor_id is not null and n.fornecedor_id <> p_fornecedor_id then
      raise exception 'A necessidade do produto "%" pertence a outro fornecedor.', n.nome_cliente;
    end if;
    if coalesce(l.quantidade, 0) < n.quantidade then
      raise exception 'A quantidade a comprar de "%" não pode ser inferior a % unidade(s).',
        n.nome_cliente, n.quantidade;
    end if;

    v_linha := v_linha + 1;
    insert into erp.oc_itens (oc_id, linha, produto_id, descricao, quantidade,
                              custo_unitario, data_prevista_item, necessidade_id, pedido_item_id)
    values (v_oc, v_linha, n.produto_id, n.nome_cliente, l.quantidade,
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

revoke all on function erp.criar_oc_linhas(uuid, jsonb) from public;
grant execute on function erp.criar_oc_linhas(uuid, jsonb) to authenticated;

grant select on erp.v_necessidades_compra to authenticated;
grant select on erp.v_oc_itens to authenticated;
grant select on erp.v_pedido_itens to authenticated;