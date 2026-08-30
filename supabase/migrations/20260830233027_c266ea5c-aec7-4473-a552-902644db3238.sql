alter table erp.formas_pagamento
  add column if not exists e_numerario boolean not null default false;

update erp.formas_pagamento set e_numerario = (codigo = 'DINHEIRO');

comment on column erp.formas_pagamento.e_numerario is
  'Dinheiro físico, que vai no envelope da rota e é contado no fecho de caixa. Diferente de entra_caixa, que só indica se aparece no mapa do caixa.';

create or replace function erp.contas_da_rota(p_rota_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'erp', 'public'
as $function$
declare
  v_caixa uuid; v_recebido numeric(12,2); v_dinheiro numeric(12,2); v_saidas numeric(12,2);
  v_entregas int; v_reag int; v_canc int;
begin
  v_caixa := erp.caixa_da_rota(p_rota_id);
  select coalesce(sum(pg.valor), 0),
         coalesce(sum(case when f.e_numerario then pg.valor else 0 end), 0)
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
end $function$;

create or replace function erp.registar_recebimento_entrega(p_paragem_id uuid, p_pagamentos jsonb)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'erp', 'public'
as $function$
declare
  par erp.rota_paragens%rowtype; r erp.rotas%rowtype; ped erp.pedidos%rowtype;
  v_soma numeric(12,2) := 0; v_pend numeric(12,2); l record; v_caixa uuid; v_ref text;
  v_marcado numeric(12,2) := 0; v_forma_marcador uuid; v_falta numeric(12,2);
begin
  select * into par from erp.rota_paragens where id = p_paragem_id and eliminado_em is null for update;
  if not found then raise exception 'Paragem não encontrada.'; end if;
  r := erp.rota_editavel(par.rota_id);
  select * into ped from erp.pedidos where id = par.pedido_id;

  select coalesce(sum((e->>'valor')::numeric), 0) into v_soma
    from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) e;
  if v_soma <= 0 then raise exception 'Indique os valores recebidos.'; end if;
  v_pend := erp.pendente_pedido(par.pedido_id);
  if round(v_soma, 2) > v_pend + 0.001 then
    raise exception 'Esta venda só tem % € por receber. Não pode receber % €.',
      to_char(v_pend, 'FM999999990.00'), to_char(round(v_soma,2), 'FM999999990.00');
  end if;

  -- consumir os marcadores de "pagar na entrega" deste pedido:
  -- são intenção, não recebimento, e não podem somar ao total
  select coalesce(sum(p.valor), 0), min(p.forma_id)
    into v_marcado, v_forma_marcador
    from erp.pagamentos p
    join erp.formas_pagamento f on f.id = p.forma_id
   where p.pedido_id = par.pedido_id
     and p.eliminado_em is null
     and p.estado = 'pendente'
     and f.momento = 'entrega';

  if v_marcado > 0 then
    perform set_config('erp.motor', '1', true);
    update erp.pagamentos p
       set estado = 'devolvido',
           motivo_rejeicao = 'Substituído pelos valores recebidos na entrega'
      from erp.formas_pagamento f
     where p.forma_id = f.id
       and p.pedido_id = par.pedido_id
       and p.eliminado_em is null
       and p.estado = 'pendente'
       and f.momento = 'entrega';
    perform set_config('erp.motor', '0', true);
  end if;

  v_caixa := erp.caixa_da_rota(r.id);
  v_ref := 'Rota ' || r.nome || ' ' || to_char(r.data, 'DD/MM/YYYY') || ' · ' || ped.numero;

  for l in select (e->>'forma_id')::uuid as forma_id,
                  round((e->>'valor')::numeric, 2) as valor,
                  nullif(trim(coalesce(e->>'referencia','')),'') as referencia,
                  nullif(trim(coalesce(e->>'comprovativo_url','')),'') as comprovativo
             from jsonb_array_elements(p_pagamentos) e loop
    if l.valor is null or l.valor <= 0 then
      raise exception 'Cada linha de pagamento tem de ter um valor acima de zero.';
    end if;
    insert into erp.pagamentos (pedido_id, forma_id, valor, referencia, comprovativo_url,
      recebido_por, caixa_id, observacoes)
    values (par.pedido_id, l.forma_id, l.valor, l.referencia, l.comprovativo,
      r.responsavel_id, v_caixa, v_ref);
  end loop;

  -- recebeu menos do que estava previsto: recriar o marcador pelo que falta
  if v_marcado > 0 and v_forma_marcador is not null then
    v_falta := round(v_marcado - round(v_soma, 2), 2);
    if v_falta > 0.001 then
      insert into erp.pagamentos (pedido_id, forma_id, valor, observacoes)
      values (par.pedido_id, v_forma_marcador, v_falta,
        'Por receber após a entrega · ' || v_ref);
    end if;
  end if;

  return round(v_soma, 2);
end $function$;
