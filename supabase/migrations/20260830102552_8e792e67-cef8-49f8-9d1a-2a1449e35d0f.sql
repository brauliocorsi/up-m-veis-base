create or replace function erp.remover_item(p_item_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = erp, public
as $$
declare
  v_pedido_id uuid;
  v_estado erp.estado_pedido;
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;

  select i.pedido_id into v_pedido_id
    from erp.pedido_itens i
   where i.id = p_item_id and i.eliminado_em is null;
  if v_pedido_id is null then
    raise exception 'Linha não encontrada ou já removida.';
  end if;

  select estado into v_estado from erp.pedidos where id = v_pedido_id;
  if v_estado is distinct from 'orcamento' then
    raise exception 'Só é possível remover linhas enquanto o pedido é um orçamento.';
  end if;

  perform set_config('erp.motor', '1', true);
  update erp.pedido_itens
     set eliminado_em = now(),
         eliminado_por = auth.uid(),
         motivo_eliminacao = coalesce(p_motivo, 'Removida pela vendedora')
   where id = p_item_id;
  perform set_config('erp.motor', '', true);

  perform erp.recalcular_pedido(v_pedido_id);
end $$;

revoke all on function erp.remover_item(uuid, text) from public, anon;
grant execute on function erp.remover_item(uuid, text) to authenticated;