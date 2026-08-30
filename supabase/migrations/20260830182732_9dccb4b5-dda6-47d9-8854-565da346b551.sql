drop policy if exists oci_sel on erp.oc_itens;
create policy oci_sel on erp.oc_itens for select to authenticated
  using (erp.perfil_atual() in ('compras','financeiro','adm'));

drop policy if exists pci_sel on erp.pedidos_compra_itens;
create policy pci_sel on erp.pedidos_compra_itens for select to authenticated
  using (erp.perfil_atual() in ('compras','financeiro','adm'));

drop policy if exists oc_sel on erp.ordens_compra;
create policy oc_sel on erp.ordens_compra for select to authenticated
  using (erp.perfil_atual() in ('compras','financeiro','adm'));

create or replace view erp.v_fornecimento_linha as
select
  pi.id            as pedido_item_id,
  pi.pedido_id,
  pi.produto_id,
  pi.estado        as estado_item,
  oc.numero        as oc_numero,
  oc.estado        as oc_estado,
  coalesce(oc.data_confirmada_fornecedor, oc.data_prevista) as data_prevista_chegada,
  f.nome           as fornecedor,
  oi.quantidade    as qt_encomendada,
  oi.quantidade_recebida as qt_recebida,
  greatest(oi.quantidade - oi.quantidade_recebida, 0) as qt_em_falta
from erp.pedido_itens pi
left join erp.oc_itens oi      on oi.pedido_item_id = pi.id and oi.eliminado_em is null
left join erp.ordens_compra oc on oc.id = oi.oc_id and oc.eliminado_em is null
left join erp.fornecedores f   on f.id = oc.fornecedor_id
where pi.eliminado_em is null;

comment on view erp.v_fornecimento_linha is 'EXCEÇÃO DELIBERADA: view SEM security_invoker de propósito. Expõe à vendedora apenas o estado do fornecimento (estado, OC, fornecedor, data prevista, quantidades) a partir de tabelas a que ela não tem acesso. A segurança está nas colunas escolhidas: NÃO tem custo_unitario nem total_linha. Nunca adicionar colunas de custo a esta view.';

grant select on erp.v_fornecimento_linha to authenticated;