CREATE OR REPLACE FUNCTION erp.registar_recebimento_entrega(p_paragem_id uuid, p_pagamentos jsonb)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'public'
AS $function$
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
  select coalesce(sum(p.valor), 0)
    into v_marcado
    from erp.pagamentos p
    join erp.formas_pagamento f on f.id = p.forma_id
   where p.pedido_id = par.pedido_id
     and p.eliminado_em is null
     and p.estado = 'pendente'
     and f.momento = 'entrega';

  -- forma do marcador mais antigo, para referência
  select p.forma_id
    into v_forma_marcador
    from erp.pagamentos p
    join erp.formas_pagamento f on f.id = p.forma_id
   where p.pedido_id = par.pedido_id
     and p.eliminado_em is null
     and p.estado = 'pendente'
     and f.momento = 'entrega'
   order by p.criado_em
   limit 1;

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
