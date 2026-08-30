ALTER TABLE erp.pagamentos ADD COLUMN IF NOT EXISTS rota_id uuid REFERENCES erp.rotas(id);
CREATE INDEX IF NOT EXISTS ix_pagamentos_rota ON erp.pagamentos (rota_id);

CREATE OR REPLACE FUNCTION erp.caixa_aberto(p_utilizador uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'erp','public' AS $$
  select c.id from erp.caixas c
  where c.utilizador_id = p_utilizador and c.estado = 'aberto' and c.eliminado_em is null
    and c.rota_id is null
  order by c.data desc limit 1
$$;

CREATE OR REPLACE FUNCTION erp.tg_pagamentos_registar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare f erp.formas_pagamento%rowtype; ped erp.pedidos%rowtype;
        v_soma numeric(12,2) := 0; v_livre numeric(12,2) := 0; v_caixa uuid;
        v_rota_caixa uuid;
begin
  select * into f from erp.formas_pagamento
  where id = NEW.forma_id and ativo and eliminado_em is null;
  if not found then raise exception 'A forma de pagamento escolhida não está disponível.'; end if;

  select * into ped from erp.pedidos where id = NEW.pedido_id and eliminado_em is null;
  if not found then raise exception 'O pedido deste pagamento já não existe.'; end if;
  if ped.estado = 'cancelado' then
    raise exception 'Este pedido está cancelado. Não é possível registar pagamentos.';
  end if;

  NEW.taxa_pct := coalesce(f.taxa_pct, 0);
  NEW.valor_liquido := round(NEW.valor - NEW.valor * NEW.taxa_pct / 100, 2);
  NEW.estado := f.estado_inicial;
  if NEW.estado = 'confirmado' and f.exige_comprovativo
     and coalesce(NEW.comprovativo_url, '') = '' then
    NEW.estado := 'pendente_confirmacao';
  end if;
  NEW.recebido_por := coalesce(NEW.recebido_por, ped.vendedor_id, erp.utilizador_atual());
  NEW.motivo_rejeicao := null;
  if NEW.estado = 'confirmado' then
    NEW.data_confirmacao := now();
    NEW.confirmado_por := auth.uid();
  else
    NEW.data_confirmacao := null;
    NEW.confirmado_por := null;
  end if;

  select coalesce(sum(valor), 0) into v_soma from erp.pagamentos
  where pedido_id = NEW.pedido_id and eliminado_em is null
    and estado in ('pendente','pendente_confirmacao','confirmado');
  v_livre := ped.total - v_soma;
  if NEW.valor > v_livre + 0.001 then
    raise exception 'O pedido é de % € e já tem % € registados. Só pode acrescentar até % €.',
      to_char(ped.total, 'FM999999990.00'), to_char(v_soma, 'FM999999990.00'),
      to_char(greatest(v_livre, 0), 'FM999999990.00');
  end if;

  -- recebimento numa rota: fica no caixa da rota, seja qual for a forma
  v_rota_caixa := null;
  if NEW.caixa_id is not null then
    select id into v_rota_caixa from erp.caixas
     where id = NEW.caixa_id and rota_id is not null and estado = 'aberto' and eliminado_em is null;
  end if;

  if v_rota_caixa is not null then
    NEW.caixa_id := v_rota_caixa;
    select rota_id into NEW.rota_id from erp.caixas where id = v_rota_caixa;
  else
    NEW.caixa_id := null;
    NEW.rota_id := null;
    if f.entra_caixa and NEW.estado = 'confirmado' then
      v_caixa := erp.caixa_aberto(NEW.recebido_por);
      if v_caixa is null then
        raise exception 'Abra o caixa do dia antes de registar recebimentos em dinheiro.';
      end if;
      NEW.caixa_id := v_caixa;
    end if;
  end if;
  return NEW;
end $$;

CREATE OR REPLACE FUNCTION erp.contas_da_rota(p_rota_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare
  v_caixa uuid; v_recebido numeric(12,2); v_dinheiro numeric(12,2); v_saidas numeric(12,2);
  v_entregas int; v_reag int; v_canc int;
begin
  v_caixa := erp.caixa_da_rota(p_rota_id);
  select coalesce(sum(pg.valor), 0),
         coalesce(sum(case when f.entra_caixa then pg.valor else 0 end), 0)
    into v_recebido, v_dinheiro
    from erp.pagamentos pg
    join erp.formas_pagamento f on f.id = pg.forma_id
   where pg.rota_id = p_rota_id and pg.eliminado_em is null
     and pg.estado in ('pendente','pendente_confirmacao','confirmado');
  select coalesce(sum(cm.valor), 0) into v_saidas from erp.caixa_movimentos cm
   where cm.caixa_id = v_caixa and cm.eliminado_em is null and cm.tipo in ('saida','sangria');
  select count(*) filter (where desfecho in ('entregue','parcial')),
         count(*) filter (where desfecho = 'reagendada'),
         count(*) filter (where desfecho in ('cancelada','ausente'))
    into v_entregas, v_reag, v_canc
    from erp.rota_paragens where rota_id = p_rota_id and eliminado_em is null;
  return jsonb_build_object(
    'recebido', coalesce(v_recebido, 0), 'dinheiro', coalesce(v_dinheiro, 0),
    'saidas', coalesce(v_saidas, 0),
    'esperado_envelope', round(coalesce(v_dinheiro, 0) - coalesce(v_saidas, 0), 2),
    'entregas', coalesce(v_entregas, 0), 'reagendadas', coalesce(v_reag, 0),
    'nao_entregues', coalesce(v_canc, 0));
end $$;