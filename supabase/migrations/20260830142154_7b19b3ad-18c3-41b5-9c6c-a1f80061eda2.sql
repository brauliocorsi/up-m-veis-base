CREATE OR REPLACE FUNCTION erp.tg_pedidos_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'erp', 'public'
AS $function$
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
  -- Guardar apenas a nota de encomenda em PDF é sempre permitido.
  if TG_OP = 'UPDATE'
     and (to_jsonb(NEW) - 'nota_pdf_path' - 'nota_pdf_em' - 'atualizado_em' - 'atualizado_por')
       = (to_jsonb(OLD) - 'nota_pdf_path' - 'nota_pdf_em' - 'atualizado_em' - 'atualizado_por')
  then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.estado not in ('orcamento','confirmado','em_preparacao')
     and NEW.estado = OLD.estado
     and coalesce(current_setting('erp.motor', true), '') <> '1' then
    raise exception 'Este pedido já não pode ser alterado.';
  end if;
  return NEW;
end $function$;