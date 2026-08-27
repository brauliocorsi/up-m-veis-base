create or replace function erp.tg_pedidos_totais() returns trigger
language plpgsql security definer set search_path = erp, public as $$
begin
  if coalesce(current_setting('erp.recalculo', true), '') = '1' then return NEW; end if;
  if TG_OP = 'INSERT' then
    NEW.subtotal := 0; NEW.desconto_linhas := 0; NEW.desconto_cabecalho := 0;
    NEW.desconto_cupao := 0; NEW.valor_montagem := 0;
    NEW.total_sem_iva := 0; NEW.total_iva := 0; NEW.total := 0;
    if NEW.valor_entrega_origem <> 'manual' then NEW.valor_entrega := 0; end if;
    if NEW.numero is null or NEW.numero = '' then
      NEW.numero := erp.proximo_numero('orcamento');
    end if;
    NEW.vendedor_id := coalesce(NEW.vendedor_id, erp.utilizador_atual());
  else
    NEW.subtotal := OLD.subtotal; NEW.desconto_linhas := OLD.desconto_linhas;
    NEW.desconto_cabecalho := OLD.desconto_cabecalho; NEW.desconto_cupao := OLD.desconto_cupao;
    NEW.valor_montagem := OLD.valor_montagem;
    NEW.total_sem_iva := OLD.total_sem_iva; NEW.total_iva := OLD.total_iva; NEW.total := OLD.total;
    NEW.numero := OLD.numero;
    if NEW.valor_entrega_origem <> 'manual' then NEW.valor_entrega := OLD.valor_entrega; end if;
    if NEW.data_entrega_origem = 'manual'
       and NEW.data_entrega_prevista is distinct from OLD.data_entrega_prevista
       and NEW.motivo_data_id is null then
      raise exception 'Indique o motivo da alteração da data de entrega.';
    end if;
  end if;
  return NEW;
end $$;