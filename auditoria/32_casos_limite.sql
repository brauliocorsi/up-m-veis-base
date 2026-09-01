-- ============================================================
-- Casos-limite: venda, financeiro e stock  [T12]
-- ============================================================
set client_min_messages to notice;
create or replace function pg_temp.ok(n text,c boolean) returns void
language plpgsql as $$
begin raise notice '%  %', case when c then '[PASSA]' else '[FALHA]' end, n; end $$;
select set_config('request.jwt.claim.sub','aaaa0000-0000-0000-0000-00000000000a',false);
do $$
declare v_cat uuid; v_p uuid;
begin
  select id into v_cat from erp.categorias where codigo='AUD';
  insert into erp.produtos (cod_barras,categoria_id,nome_cliente,tipo_fornecimento,preco_base,n_colis,volume_m3)
  values ('T12-A',v_cat,'[T12] Produto A','stock',100,1,0.5) on conflict (cod_barras) do nothing;
  select id into v_p from erp.produtos where cod_barras='T12-A';
  insert into erp.stock_movimentos (produto_id,tipo,quantidade,origem,chave_idempotencia,ocorrido_em)
  values (v_p,'inventario_inicial',20,'contagem','t12:inv',now())
  on conflict (chave_idempotencia) do nothing;
  insert into erp.clientes (nome,nif,telefone_e164,morada,cp4,cp3,localidade)
  values ('[T12] Cliente','999999990','+351913000001','R 12','4590','000','PF')
  on conflict do nothing;
end $$;
do $$
declare v_c uuid; v_ped uuid; v_p uuid; v_li uuid; v_tot numeric; v_soma numeric;
begin
  select id into v_p from erp.produtos where cod_barras='T12-A';
  select id into v_c from erp.clientes where nome='[T12] Cliente';
  insert into erp.pedidos (cliente_id,vendedor_id,morada_entrega,cp4_entrega,cp3_entrega,
                           localidade_entrega,data_entrega_prevista)
  values (v_c,(select id from erp.utilizadores where perfil='adm' and ativo limit 1),
          'R 12','4590','000','PF',current_date+10) returning id into v_ped;
  begin
    insert into erp.pedido_itens (pedido_id,linha,produto_id,quantidade,preco_unitario)
    values (v_ped,90,v_p,0,100);
    perform pg_temp.ok('V1 Linha com quantidade zero é RECUSADA', false);
  exception when others then perform pg_temp.ok('V1 Linha com quantidade zero é RECUSADA', true); end;
  begin
    insert into erp.pedido_itens (pedido_id,linha,produto_id,quantidade,preco_unitario)
    values (v_ped,91,v_p,1,-50);
    perform pg_temp.ok('V2 Preço negativo é RECUSADO', false);
  exception when others then perform pg_temp.ok('V2 Preço negativo é RECUSADO', true); end;
  begin
    insert into erp.pedido_itens (pedido_id,linha,produto_id,quantidade,preco_unitario,desconto_pct)
    values (v_ped,92,v_p,1,100,150);
    perform pg_temp.ok('V3 Desconto de 150% é RECUSADO', false);
  exception when others then perform pg_temp.ok('V3 Desconto de 150% é RECUSADO', true); end;
  insert into erp.pedido_itens (pedido_id,linha,produto_id,quantidade,preco_unitario)
  values (v_ped,1,v_p,3,33.33) returning id into v_li;
  perform pg_temp.ok('V4 3 x 33,33 = 99,99 ao cêntimo ('||
    (select total_linha from erp.pedido_itens where id=v_li)||')',
    (select total_linha from erp.pedido_itens where id=v_li) = 99.99);
  select subtotal into v_tot from erp.pedidos where id=v_ped;
  select coalesce(sum(total_linha),0) into v_soma from erp.pedido_itens
   where pedido_id=v_ped and eliminado_em is null and produto_id is not null;
  perform pg_temp.ok('V5 Subtotal = soma das linhas ('||v_tot||' = '||v_soma||')', v_tot = v_soma);
  declare v_vazio uuid;
  begin
    insert into erp.pedidos (cliente_id,vendedor_id,morada_entrega,cp4_entrega,cp3_entrega,
                             localidade_entrega,data_entrega_prevista)
    values (v_c,(select id from erp.utilizadores where perfil='adm' and ativo limit 1),
            'R 12','4590','000','PF',current_date+10) returning id into v_vazio;
    begin
      perform erp.confirmar_pedido(v_vazio);
      perform pg_temp.ok('V6 Confirmar pedido sem linhas é RECUSADO', false);
    exception when others then perform pg_temp.ok('V6 Confirmar pedido sem linhas é RECUSADO', true); end;
  end;
  perform erp.confirmar_pedido(v_ped);
  begin
    perform erp.confirmar_pedido(v_ped);
    perform pg_temp.ok('V7 Confirmar o mesmo pedido duas vezes é RECUSADO', false);
  exception when others then perform pg_temp.ok('V7 Confirmar o mesmo pedido duas vezes é RECUSADO', true); end;
  perform pg_temp.ok('V8 Pedido confirmado recebe número',
    (select numero from erp.pedidos where id=v_ped) is not null);
  perform pg_temp.ok('V9 Total do pedido é positivo',
    (select total from erp.pedidos where id=v_ped) > 0);
end $$;
do $$
declare v_ped uuid; v_forma uuid; v_pg uuid; v_tot numeric;
begin
  select p.id, p.total into v_ped, v_tot from erp.pedidos p
   join erp.clientes c on c.id=p.cliente_id
   where c.nome='[T12] Cliente' and p.estado <> 'orcamento' order by p.criado_em desc limit 1;
  select id into v_forma from erp.formas_pagamento where codigo='DINHEIRO';
  insert into erp.caixas (utilizador_id, data, saldo_abertura)
  values ((select id from erp.utilizadores where perfil='adm' and ativo limit 1), current_date, 0)
  on conflict do nothing;
  begin
    insert into erp.pagamentos (pedido_id,forma_id,valor) values (v_ped,v_forma,0);
    perform pg_temp.ok('F1 Pagamento de valor zero é RECUSADO', false);
  exception when others then perform pg_temp.ok('F1 Pagamento de valor zero é RECUSADO', true); end;
  begin
    insert into erp.pagamentos (pedido_id,forma_id,valor) values (v_ped,v_forma,-10);
    perform pg_temp.ok('F2 Pagamento negativo é RECUSADO', false);
  exception when others then perform pg_temp.ok('F2 Pagamento negativo é RECUSADO', true); end;
  begin
    insert into erp.pagamentos (pedido_id,forma_id,valor) values (v_ped,v_forma,v_tot+1);
    perform pg_temp.ok('F3 Pagamento acima do total é RECUSADO', false);
  exception when others then perform pg_temp.ok('F3 Pagamento acima do total é RECUSADO', true); end;
  insert into erp.pagamentos (pedido_id,forma_id,valor) values (v_ped,v_forma,v_tot)
  returning id into v_pg;
  perform pg_temp.ok('F4 Dinheiro entra CONFIRMADO',
    (select estado from erp.pagamentos where id=v_pg) = 'confirmado');
  perform pg_temp.ok('F5 total_pago atualiza para o valor pago ('||
    (select total_pago from erp.pedidos where id=v_ped)||')',
    (select total_pago from erp.pedidos where id=v_ped) = v_tot);
  perform pg_temp.ok('F6 Pedido fica marcado como pago',
    (select estado_pagamento from erp.pedidos where id=v_ped) = 'pago');
  begin
    insert into erp.pagamentos (pedido_id,forma_id,valor) values (v_ped,v_forma,0.01);
    perform pg_temp.ok('F7 Não aceita nem mais um cêntimo depois de pago', false);
  exception when others then perform pg_temp.ok('F7 Não aceita nem mais um cêntimo depois de pago', true); end;
  begin
    update erp.pagamentos set valor = valor * 2 where id = v_pg;
    perform pg_temp.ok('F8 Valor de pagamento confirmado é imutável',
      (select valor from erp.pagamentos where id=v_pg) = v_tot);
  exception when others then perform pg_temp.ok('F8 Valor de pagamento confirmado é imutável', true); end;
end $$;
do $$
declare v_p uuid; v_f int; v_r int; v_v int; v_soma int;
begin
  select id into v_p from erp.produtos where cod_barras='T12-A';
  select fisico, reservado, vendavel into v_f, v_r, v_v
    from erp.stock_atual where produto_id=v_p;
  perform pg_temp.ok('S1 vendável = físico - quarentena - reservado - margem ('||
    v_f||' - '||v_r||' = '||v_v||')', v_v = v_f - v_r -
    (select coalesce(quarentena,0)+coalesce(margem_seguranca,0) from erp.stock_atual where produto_id=v_p));
  select coalesce(sum(quantidade),0) into v_soma from erp.stock_movimentos where produto_id=v_p;
  perform pg_temp.ok('S2 Soma do livro = físico ('||v_soma||' = '||v_f||')', v_soma = v_f);
  begin
    perform erp.reservar(v_p, 0, 'pedido', gen_random_uuid());
    perform pg_temp.ok('S4 Reservar zero unidades é RECUSADO', false);
  exception when others then perform pg_temp.ok('S4 Reservar zero unidades é RECUSADO', true); end;
  begin
    perform erp.reservar(v_p, -5, 'pedido', gen_random_uuid());
    perform pg_temp.ok('S5 Reservar quantidade negativa é RECUSADO', false);
  exception when others then perform pg_temp.ok('S5 Reservar quantidade negativa é RECUSADO', true); end;
  begin
    perform erp.reservar(gen_random_uuid(), 1, 'pedido', gen_random_uuid());
    perform pg_temp.ok('S6 Reservar produto inexistente é RECUSADO', false);
  exception when others then perform pg_temp.ok('S6 Reservar produto inexistente é RECUSADO', true); end;
  begin
    insert into erp.stock_movimentos (produto_id,tipo,quantidade,origem,chave_idempotencia,ocorrido_em)
    values (v_p,'ajuste',0,'manual','t12:zero',now());
    perform pg_temp.ok('S7 Movimento de quantidade zero é RECUSADO', false);
  exception when others then perform pg_temp.ok('S7 Movimento de quantidade zero é RECUSADO', true); end;
  perform pg_temp.ok('S8 Reservado nunca excede o físico ('||v_r||' <= '||v_f||')', v_r <= v_f);
end $$;
select pg_temp.ok('G1 Nenhum pedido com total_pago acima do total',
  not exists (select 1 from erp.pedidos where total_pago > total and eliminado_em is null));
select pg_temp.ok('G2 Nenhum stock físico negativo',
  not exists (select 1 from erp.stock_atual where fisico < 0));
select pg_temp.ok('G3 Nenhum reservado negativo',
  not exists (select 1 from erp.stock_atual where reservado < 0));
select pg_temp.ok('G4 Nenhum stock_atual sem correspondência no livro',
  not exists (
    select 1 from erp.stock_atual s
    where s.fisico <> (select coalesce(sum(m.quantidade),0)
                         from erp.stock_movimentos m where m.produto_id = s.produto_id)));
select pg_temp.ok('G5 Todos os pedidos confirmados têm número',
  not exists (select 1 from erp.pedidos
              where estado not in ('orcamento','cancelado') and numero is null and eliminado_em is null));
select pg_temp.ok('G6 Nenhuma reserva ativa de pedido cancelado',
  not exists (
    select 1 from erp.reservas r join erp.pedidos p on p.id = r.documento_id
    where r.estado = 'ativa' and p.estado = 'cancelado'));
select pg_temp.ok('G7 Nenhum item com quantidade não positiva',
  not exists (select 1 from erp.pedido_itens where quantidade <= 0 and eliminado_em is null));
begin;
select set_config('request.jwt.claim.sub','aaaa0000-0000-0000-0000-00000000000a',true);
set local role authenticated;
do $$
declare v_p uuid;
begin
  select id into v_p from erp.produtos where cod_barras='T12-A';
  begin
    update erp.stock_atual set fisico = 9999 where produto_id = v_p;
    perform pg_temp.ok('S3 Aplicação NÃO escreve direto no stock_atual',
      (select fisico from erp.stock_atual where produto_id=v_p) <> 9999);
  exception when insufficient_privilege or others then
    perform pg_temp.ok('S3 Aplicação NÃO escreve direto no stock_atual', true);
  end;
end $$;
rollback;
