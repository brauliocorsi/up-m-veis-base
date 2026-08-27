create or replace function erp.tg_pedidos_validar() returns trigger
language plpgsql security definer set search_path = erp, public as $$
declare regra erp.regras_desconto%rowtype; v_limite numeric := 0;
begin
  if coalesce(current_setting('erp.recalculo', true), '') = '1' then return NEW; end if;
  if NEW.desconto_cabecalho_pct > 0 and NEW.desconto_cabecalho_pct is distinct from
     (case when TG_OP = 'UPDATE' then OLD.desconto_cabecalho_pct else null end) then
    regra := erp.regra_desconto_atual();
    v_limite := coalesce(regra.desconto_max_pct, 0);
    if NEW.desconto_cabecalho_pct > v_limite then
      raise exception 'O seu limite de desconto é %%%. Peça aprovação ao escritório.', v_limite;
    end if;
  end if;
  if TG_OP = 'UPDATE' and OLD.estado not in ('orcamento','confirmado','em_preparacao')
     and NEW.estado = OLD.estado
     and coalesce(current_setting('erp.motor', true), '') <> '1' then
    raise exception 'Este pedido já não pode ser alterado.';
  end if;
  return NEW;
end $$;

create or replace function erp.tg_recalcular_pedido() returns trigger
language plpgsql security definer set search_path = erp, public as $$
declare v_id uuid := coalesce(NEW.pedido_id, OLD.pedido_id); v_estado erp.estado_pedido;
begin
  if coalesce(current_setting('erp.recalculo', true), '') = '1' then return null; end if;
  select estado into v_estado from erp.pedidos where id = v_id;
  if v_estado in ('cancelado','entregue') then return null; end if;
  perform erp.recalcular_pedido(v_id);
  return null;
end $$;