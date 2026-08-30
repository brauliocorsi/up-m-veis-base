create or replace function erp.alterar_data_entrega(
  p_pedido_id uuid,
  p_data date,
  p_motivo_id uuid,
  p_nota text default null
) returns date
language plpgsql
security definer
set search_path = erp, public
as $$
declare
  ped erp.pedidos%rowtype;
  mot erp.motivos%rowtype;
begin
  if not erp.is_ativo() then
    raise exception 'A sua conta não tem acesso ativo.';
  end if;

  select * into ped from erp.pedidos
   where id = p_pedido_id and eliminado_em is null for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if ped.estado not in ('confirmado','em_preparacao','pronto') then
    raise exception 'Só é possível alterar a data de vendas confirmadas, em preparação ou prontas.';
  end if;

  if p_data is null then
    raise exception 'Indique a nova data de entrega.';
  end if;

  select * into mot from erp.motivos
   where id = p_motivo_id and eliminado_em is null and ativo
     and contexto = 'alteracao_data';
  if not found then
    raise exception 'Escolha um motivo válido para a alteração de data.';
  end if;
  if mot.exige_texto and nullif(trim(coalesce(p_nota,'')),'') is null then
    raise exception 'Este motivo exige uma explicação.';
  end if;

  if ped.data_entrega_prometida is not distinct from p_data then
    raise exception 'A nova data é igual à data atual.';
  end if;

  perform set_config('erp.motor', '1', true);

  update erp.pedidos
     set data_entrega_prometida = p_data,
         data_entrega_origem = 'manual',
         motivo_data_id = p_motivo_id,
         nota_data = nullif(trim(coalesce(p_nota,'')),'')
   where id = p_pedido_id;

  return p_data;
end;
$$;

revoke all on function erp.alterar_data_entrega(uuid, date, uuid, text) from public, anon;
grant execute on function erp.alterar_data_entrega(uuid, date, uuid, text) to authenticated;