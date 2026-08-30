\set ON_ERROR_STOP off
\pset pager off
set client_min_messages to notice;

create or replace function pg_temp.ok(n text, c boolean) returns void
language plpgsql as $$
begin raise notice '%  %', case when c then '[PASSA]' else '[FALHA]' end, n; end $$;

insert into auth.users (id,email) values
  ('cccc0000-0000-0000-0000-00000000000c','compras@teste.pt'),
  ('bbbb0000-0000-0000-0000-00000000000b','vendedora@teste.pt') on conflict do nothing;
insert into erp.utilizadores (user_id,nome,email,perfil) values
  ('cccc0000-0000-0000-0000-00000000000c','[AUD] Compras','compras@teste.pt','adm')
on conflict (user_id) do nothing;
insert into erp.utilizadores (user_id,nome,email,perfil) values
  ('bbbb0000-0000-0000-0000-00000000000b','[AUD] Vendedora','vendedora@teste.pt','vendedora')
on conflict (user_id) do nothing;
select set_config('request.jwt.claim.sub','cccc0000-0000-0000-0000-00000000000c',false);

insert into erp.categorias (codigo,nome)
select 'AUD','[AUD] Categoria' where not exists (select 1 from erp.categorias where codigo='AUD');

-- Fornecedor e produto de compra
insert into erp.fornecedores (nome,email_encomendas,prazo_dias,idioma)
values ('[AUD] Fornecedor','compras@fornecedor-teste.pt',15,'pt')
on conflict do nothing;

insert into erp.produtos (cod_barras,categoria_id,nome_cliente,tipo_fornecimento,preco_base,
                          fornecedor_id,prazo_fornecedor_dias,n_colis)
select 'AUD-COMPRA', c.id,'[AUD] Móvel Importado','compra',300,f.id,15,1
from erp.categorias c, erp.fornecedores f
where c.codigo='AUD' and f.nome='[AUD] Fornecedor'
on conflict (cod_barras) do nothing;

-- ============================================================
-- F. VENDA SEM STOCK GERA NECESSIDADE
-- ============================================================
do $$
declare v_c uuid; v_ped uuid; v_prod uuid; v_n int;
begin
  select id into v_prod from erp.produtos where cod_barras='AUD-COMPRA';
  insert into erp.clientes (nome,nif,telefone_e164,morada,cp4,cp3,localidade)
    values ('[AUD] Cliente Compras','999999990','+351912000111','Rua Teste 1','4590','000','Paços de Ferreira')
    returning id into v_c;
  insert into erp.zonas_entrega (nome,cp_inicio,cp_fim,valor_base,dias_rota)
    values ('[AUD] Zona','4590','4599',30,'{3,4,5,6,7}') on conflict do nothing;
  insert into erp.pedidos (cliente_id,vendedor_id,morada_entrega,cp4_entrega,cp3_entrega,
                           localidade_entrega,data_entrega_prevista)
    values (v_c,(select id from erp.utilizadores where perfil='adm' limit 1),
            'Rua Teste 1','4590','000','Paços de Ferreira', current_date + 20)
    returning id into v_ped;
  insert into erp.pedido_itens (pedido_id,linha,produto_id,quantidade,preco_unitario)
    values (v_ped,1,v_prod,5,300);

  perform erp.confirmar_pedido(v_ped);

  select count(*) into v_n from erp.necessidades_compra
   where produto_id=v_prod and eliminado_em is null;
  perform pg_temp.ok('F1 Venda sem stock gera necessidade de compra', v_n >= 1);

  perform pg_temp.ok('F2 Linha sem stock fica como encomendado',
    exists (select 1 from erp.pedido_itens where pedido_id=v_ped and estado='encomendado'));
exception when others then
  perform pg_temp.ok('F1/F2 Venda sem stock gera necessidade — ERRO: '||SQLERRM, false);
end $$;

-- ============================================================
-- G. ORDEM DE COMPRA
-- ============================================================
do $$
declare v_oc uuid; v_prod uuid; v_nec uuid; v_forn uuid;
begin
  select id into v_prod from erp.produtos where cod_barras='AUD-COMPRA';
  select id into v_forn from erp.fornecedores where nome='[AUD] Fornecedor';
  select id into v_nec from erp.necessidades_compra
   where produto_id=v_prod and eliminado_em is null order by criado_em limit 1;

  v_oc := erp.criar_oc(v_forn, array[v_nec]);
  perform pg_temp.ok('G1 Criar OC a partir de necessidade', v_oc is not null);

  update erp.oc_itens set custo_unitario = 200 where oc_id = v_oc;
  perform erp.finalizar_oc(v_oc);
  perform pg_temp.ok('G2 Finalizar OC atribui número',
    (select numero from erp.ordens_compra where id=v_oc) is not null);

  begin
    perform erp.finalizar_oc(v_oc);
    perform pg_temp.ok('G3 Finalizar a mesma OC duas vezes é IMPOSSÍVEL', false);
  exception when others then
    perform pg_temp.ok('G3 Finalizar a mesma OC duas vezes é IMPOSSÍVEL', true);
  end;
exception when others then
  perform pg_temp.ok('G Ordem de compra — ERRO: '||SQLERRM, false);
end $$;

-- ============================================================
-- H. RECEÇÃO PARCIAL
-- ============================================================
do $$
declare v_oc uuid; v_item uuid; v_prod uuid; v_fis_antes int; v_fis_depois int; v_res int;
begin
  select id into v_prod from erp.produtos where cod_barras='AUD-COMPRA';
  select o.id into v_oc from erp.ordens_compra o
   join erp.oc_itens i on i.oc_id=o.id where i.produto_id=v_prod order by o.criado_em desc limit 1;
  select id into v_item from erp.oc_itens where oc_id=v_oc limit 1;

  select coalesce((select fisico from erp.stock_atual where produto_id=v_prod),0) into v_fis_antes;

  perform erp.receber_oc(v_oc, jsonb_build_array(
    jsonb_build_object('item_id', v_item, 'quantidade', 3)), 'DOC-AUD-1');

  select coalesce((select fisico from erp.stock_atual where produto_id=v_prod),0) into v_fis_depois;
  perform pg_temp.ok('H1 Receção sobe o stock exatamente na quantidade recebida ('
    ||v_fis_antes||'->'||v_fis_depois||')', v_fis_depois = v_fis_antes + 3);

  perform pg_temp.ok('H2 OC fica em recebida_parcial',
    (select estado from erp.ordens_compra where id=v_oc)::text = 'recebida_parcial');

  select coalesce((select reservado from erp.stock_atual where produto_id=v_prod),0) into v_res;
  perform pg_temp.ok('H3 Reserva só as unidades recebidas (reservado='||v_res||')', v_res = 3);

  perform pg_temp.ok('H4 Receção cria conta a pagar',
    exists (select 1 from erp.contas_pagar where oc_id=v_oc and eliminado_em is null));

  perform pg_temp.ok('H5 Receção gera movimento no livro de stock',
    exists (select 1 from erp.stock_movimentos
            where produto_id=v_prod and tipo='entrada' and quantidade=3));
exception when others then
  perform pg_temp.ok('H Receção parcial — ERRO: '||SQLERRM, false);
end $$;

-- ============================================================
-- I. CANCELAMENTO E FECHO
-- ============================================================
do $$
declare v_oc uuid; v_item uuid; v_prod uuid; v_ped uuid;
begin
  select id into v_prod from erp.produtos where cod_barras='AUD-COMPRA';
  select o.id into v_oc from erp.ordens_compra o
   join erp.oc_itens i on i.oc_id=o.id where i.produto_id=v_prod order by o.criado_em desc limit 1;

  if v_oc is null then
    perform pg_temp.ok('I1 Cancelar OC com recebimentos é RECUSADO — OC não encontrada, teste inválido', false);
    return;
  end if;
  begin
    perform erp.cancelar_oc(v_oc, null);
    perform pg_temp.ok('I1 Cancelar OC com recebimentos é RECUSADO', false);
  exception when others then
    perform pg_temp.ok('I1 Cancelar OC com recebimentos é RECUSADO', true);
  end;

  select id into v_item from erp.oc_itens where oc_id=v_oc limit 1;
  perform erp.receber_oc(v_oc, jsonb_build_array(
    jsonb_build_object('item_id', v_item, 'quantidade', 2)), 'DOC-AUD-2');

  perform pg_temp.ok('I2 OC fica recebida quando chega tudo',
    (select estado from erp.ordens_compra where id=v_oc)::text = 'recebida');

  select p.id into v_ped from erp.pedidos p
   join erp.pedido_itens i on i.pedido_id=p.id
   where i.produto_id=v_prod order by p.criado_em desc limit 1;
  perform pg_temp.ok('I3 Pedido de venda passa a pronto_entrega sozinho ('
    ||(select estado from erp.pedidos where id=v_ped)::text||')',
    (select estado from erp.pedidos where id=v_ped)::text in ('pronto','em_preparacao'));

  begin
    perform erp.receber_oc(v_oc, jsonb_build_array(
      jsonb_build_object('item_id', v_item, 'quantidade', 1)), 'DOC-AUD-3');
    perform pg_temp.ok('I4 Receber acima da quantidade encomendada é RECUSADO', false);
  exception when others then
    perform pg_temp.ok('I4 Receber acima da quantidade encomendada é RECUSADO', true);
  end;
exception when others then
  perform pg_temp.ok('I Cancelamento e fecho — ERRO: '||SQLERRM, false);
end $$;

-- ============================================================
-- J. SEGURANÇA DAS COMPRAS — como VENDEDORA
-- ============================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbb0000-0000-0000-0000-00000000000b',true);
do $$
declare v_oc uuid;
begin
  select id into v_oc from erp.ordens_compra limit 1;
  begin
    perform erp.finalizar_oc(v_oc);
    perform pg_temp.ok('J1 Vendedora NÃO finaliza ordens de compra', false);
  exception when others then
    perform pg_temp.ok('J1 Vendedora NÃO finaliza ordens de compra', true);
  end;

  begin
    insert into erp.contas_pagar (fornecedor_id,descricao,valor,data_vencimento)
    values ((select id from erp.fornecedores limit 1),'Falsa',1,current_date);
    perform pg_temp.ok('J2 Vendedora NÃO cria contas a pagar', false);
  exception when others then
    perform pg_temp.ok('J2 Vendedora NÃO cria contas a pagar', true);
  end;
end $$;
commit;

-- ============================================================
-- K. REGRESSÃO — comprar mais do que se vende
-- ============================================================
do $$
declare v_c uuid; v_ped uuid; v_prod uuid; v_forn uuid; v_nec uuid; v_oc uuid; v_item uuid;
        v_res int; v_vend int; v_est text;
begin
  select id into v_forn from erp.fornecedores where nome='[AUD] Fornecedor';
  insert into erp.produtos (cod_barras,categoria_id,nome_cliente,tipo_fornecimento,preco_base,
                            fornecedor_id,prazo_fornecedor_dias,n_colis)
  select 'AUD-K', c.id,'[AUD] Produto K','compra',300,v_forn,15,1
  from erp.categorias c where c.codigo='AUD' on conflict (cod_barras) do nothing;
  select id into v_prod from erp.produtos where cod_barras='AUD-K';

  insert into erp.clientes (nome,nif,telefone_e164,morada,cp4,cp3,localidade)
  values ('[AUD] Cliente K','999999990','+351912000333','Rua K','4590','000','PF') returning id into v_c;

  insert into erp.pedidos (cliente_id,vendedor_id,morada_entrega,cp4_entrega,cp3_entrega,
                           localidade_entrega,data_entrega_prevista)
  values (v_c,(select id from erp.utilizadores where perfil='adm' and ativo limit 1),
          'Rua K','4590','000','PF',current_date+20) returning id into v_ped;
  insert into erp.pedido_itens (pedido_id,linha,produto_id,quantidade,preco_unitario)
  values (v_ped,1,v_prod,1,300);
  perform erp.confirmar_pedido(v_ped);

  select id into v_nec from erp.necessidades_compra
   where produto_id=v_prod and estado='aberta' and eliminado_em is null limit 1;
  v_oc := erp.criar_oc(v_forn, array[v_nec]);
  update erp.oc_itens set quantidade = 2, custo_unitario = 200 where oc_id = v_oc;
  select id into v_item from erp.oc_itens where oc_id=v_oc limit 1;
  perform erp.finalizar_oc(v_oc);

  perform erp.receber_oc(v_oc, jsonb_build_array(jsonb_build_object('item_id',v_item,'quantidade',1)),'K1');
  select estado into v_est from erp.pedido_itens where pedido_id=v_ped limit 1;
  perform pg_temp.ok('K1 Receber 1 de 2 já satisfaz uma venda de 1', v_est = 'reservado');
  perform pg_temp.ok('K2 Pedido fica pronto sem esperar pela OC completa',
    (select estado from erp.pedidos where id=v_ped)::text = 'pronto');

  perform erp.receber_oc(v_oc, jsonb_build_array(jsonb_build_object('item_id',v_item,'quantidade',1)),'K2');
  select reservado, vendavel into v_res, v_vend from erp.stock_atual where produto_id=v_prod;
  perform pg_temp.ok('K3 Reserva apenas o que o cliente comprou (reservado='||v_res||')', v_res = 1);
  perform pg_temp.ok('K4 A unidade extra fica VENDÁVEL, não presa (vendavel='||v_vend||')', v_vend = 1);
exception when others then
  perform pg_temp.ok('K Regressão comprar>vender — ERRO: '||SQLERRM, false);
end $$;
