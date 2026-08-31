create or replace function erp.pedido_na_minha_rota(p_pedido_id uuid)
returns boolean
language sql stable security definer set search_path = erp, public
as $$
  select exists (
    select 1
      from erp.rota_paragens rp
      join erp.rotas r on r.id = rp.rota_id
     where rp.pedido_id = p_pedido_id
       and rp.eliminado_em is null
       and r.eliminado_em is null
       and r.responsavel_id = erp.utilizador_atual()
  );
$$;

drop policy if exists pedidos_sel on erp.pedidos;
drop policy if exists pedidos_select on erp.pedidos;
drop policy if exists ped_sel on erp.pedidos;
create policy pedidos_sel on erp.pedidos for select to authenticated
using (
  erp.is_ativo() and (
    erp.perfil_atual() <> 'entregador'
    or erp.pedido_na_minha_rota(id)
  )
);

drop policy if exists pedido_itens_sel on erp.pedido_itens;
drop policy if exists itens_sel on erp.pedido_itens;
create policy pedido_itens_sel on erp.pedido_itens for select to authenticated
using (
  erp.is_ativo() and (
    erp.perfil_atual() <> 'entregador'
    or erp.pedido_na_minha_rota(pedido_id)
  )
);

drop policy if exists clientes_sel on erp.clientes;
drop policy if exists clientes_select on erp.clientes;
create policy clientes_sel on erp.clientes for select to authenticated
using (
  erp.is_ativo() and (
    erp.perfil_atual() <> 'entregador'
    or exists (
      select 1 from erp.pedidos p
       where p.cliente_id = clientes.id
         and erp.pedido_na_minha_rota(p.id))
  )
);

drop policy if exists clientes_ins on erp.clientes;
drop policy if exists clientes_insert on erp.clientes;
create policy clientes_ins on erp.clientes for insert to authenticated
with check (erp.perfil_atual() in ('vendedora','escritorio','adm'));

drop policy if exists clientes_upd on erp.clientes;
drop policy if exists clientes_update on erp.clientes;
create policy clientes_upd on erp.clientes for update to authenticated
using (erp.perfil_atual() in ('vendedora','escritorio','adm'))
with check (erp.perfil_atual() in ('vendedora','escritorio','adm'));

drop policy if exists documentos_fiscais_sel on erp.documentos_fiscais;
drop policy if exists docfis_sel on erp.documentos_fiscais;
create policy documentos_fiscais_sel on erp.documentos_fiscais for select to authenticated
using (erp.perfil_atual() in ('escritorio','financeiro','adm'));

create index if not exists ix_rota_paragens_pedido on erp.rota_paragens(pedido_id);
create index if not exists ix_rotas_responsavel on erp.rotas(responsavel_id);