
-- ================= A. Fila da fábrica: lease + backoff + worker desligado
alter table erp.fabrica_outbox
  add column if not exists proxima_tentativa_em timestamptz not null default now(),
  add column if not exists lease_ate timestamptz;

insert into erp.definicoes (chave, valor) values ('fabrica_worker_ativo', 'false'::jsonb)
on conflict (chave) do nothing;

create or replace function erp.fabrica_outbox_reclamar(p_limite integer default 20)
returns setof erp.fabrica_outbox language plpgsql security definer set search_path to 'erp','public' as $$
begin
  update erp.fabrica_outbox o set estado = 'bloqueado_pagamento', atualizado_em = now()
   where o.estado in ('em_fila','incerto')
     and exists (select 1 from erp.pagamentos pg where pg.pedido_id = o.pedido_id
                  and pg.estado::text = 'pendente_confirmacao' and pg.eliminado_em is null);
  update erp.fabrica_outbox o set estado = 'em_fila', atualizado_em = now()
   where o.estado = 'bloqueado_pagamento'
     and not exists (select 1 from erp.pagamentos pg where pg.pedido_id = o.pedido_id
                      and pg.estado::text = 'pendente_confirmacao' and pg.eliminado_em is null);
  -- 'erro' (4xx) fica para revisão manual; 'incerto' reenvia com o mesmo event_id após backoff.
  return query
  update erp.fabrica_outbox o set estado = 'a_enviar', tentativas = tentativas + 1,
         ultima_tentativa_em = now(), lease_ate = now() + interval '2 minutes', atualizado_em = now()
   where o.event_id in (select event_id from erp.fabrica_outbox
                         where eliminado_em is null
                           and ((estado in ('em_fila','incerto') and proxima_tentativa_em <= now())
                             or (estado = 'a_enviar' and coalesce(lease_ate, now()) < now()))
                         order by criado_em limit greatest(1, least(p_limite, 50))
                         for update skip locked)
  returning o.*;
end $$;

create or replace function erp.tg_fabrica_outbox_backoff() returns trigger
language plpgsql set search_path to 'erp','public' as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'incerto' then
      new.proxima_tentativa_em := now() + least(interval '1 hour',
        interval '1 minute' * power(2, least(greatest(new.tentativas, 1), 6)));
      new.lease_ate := null;
    elsif new.estado in ('aceite','erro','cancelado','em_fila','bloqueado_pagamento') then
      new.lease_ate := null;
      if new.estado = 'em_fila' then new.proxima_tentativa_em := now(); end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fabrica_outbox_backoff on erp.fabrica_outbox;
create trigger fabrica_outbox_backoff before update on erp.fabrica_outbox
  for each row execute function erp.tg_fabrica_outbox_backoff();

create or replace function erp.fabrica_worker_pode_correr() returns boolean
language sql stable security definer set search_path to 'erp','public' as $$
  select coalesce((select valor = 'true'::jsonb from erp.definicoes where chave = 'fabrica_integracao_ativa'), false)
     and coalesce((select valor = 'true'::jsonb from erp.definicoes where chave = 'fabrica_worker_ativo'), false)
$$;

-- ================= B. Contagem: prevenção concreta de dupla entrada
create table if not exists erp.contagem_fabrica_ignorados (
  contagem_id text primary key,
  produto_id uuid,
  quantidade integer not null,
  referencia text,
  order_id text,
  registado_em timestamptz not null default now()
);
grant select on erp.contagem_fabrica_ignorados to authenticated;
grant all on erp.contagem_fabrica_ignorados to service_role;
alter table erp.contagem_fabrica_ignorados enable row level security;
create policy "adm e financeiro leem ignorados" on erp.contagem_fabrica_ignorados
  for select to authenticated using (erp.perfil_atual()::text in ('adm','financeiro'));

create or replace function erp.contagem_ordem_fabrica(p_mov jsonb, p_produto uuid) returns text
language sql stable security definer set search_path to 'erp','public' as $$
  select fo.order_id from erp.fabrica_ordens fo
    join erp.pedido_itens pi on pi.id = fo.item_id
   where pi.produto_id = p_produto
     and (fo.order_id = nullif(p_mov ->> 'fabrica_order_id', '')
          or (coalesce(p_mov ->> 'referencia', '') <> ''
              and (position(fo.order_number in p_mov ->> 'referencia') > 0
                   or position(fo.order_id in p_mov ->> 'referencia') > 0)))
   limit 1
$$;

create or replace function erp.registar_movimentos_contagem(p_movimentos jsonb)
returns jsonb language plpgsql security definer set search_path to 'erp','public' as $$
declare
  m jsonb; v_produto uuid; v_id bigint; v_processados int := 0; v_ignorados int := 0;
  v_fabrica int := 0; v_ultimo text := null; v_desconhecidos text[] := '{}';
  v_tipo erp.tipo_movimento; v_qtd int; v_ordem text;
begin
  if not (erp.is_adm() or auth.role() = 'service_role') then
    raise exception 'Só a Administração pode registar movimentos do Contagem.';
  end if;
  for m in select value from jsonb_array_elements(coalesce(p_movimentos, '[]'::jsonb)) as t(value)
           order by (value ->> 'id')::bigint
  loop
    select id into v_produto from erp.produtos
     where cod_barras = (m ->> 'produto_codigo') and eliminado_em is null;
    if v_produto is null then
      v_desconhecidos := v_desconhecidos || (m ->> 'produto_codigo');
      v_ultimo := m ->> 'id'; continue;
    end if;
    v_tipo := (m ->> 'tipo')::erp.tipo_movimento;
    v_qtd := (m ->> 'quantidade')::int;
    if v_qtd = 0 then v_ultimo := m ->> 'id'; continue; end if;

    -- Entrada que corresponde a uma ordem da fábrica: a fábrica é a única fonte deste stock.
    if v_tipo = 'entrada' then
      v_ordem := erp.contagem_ordem_fabrica(m, v_produto);
      if v_ordem is not null then
        insert into erp.contagem_fabrica_ignorados (contagem_id, produto_id, quantidade, referencia, order_id)
        values (m ->> 'id', v_produto, v_qtd, m ->> 'referencia', v_ordem)
        on conflict (contagem_id) do nothing;
        v_fabrica := v_fabrica + 1; v_ultimo := m ->> 'id'; continue;
      end if;
    end if;

    insert into erp.stock_movimentos
      (produto_id, tipo, quantidade, origem, ref_externa, chave_idempotencia, motivo, ocorrido_em)
    values
      (v_produto, v_tipo, v_qtd, 'contagem', m ->> 'id', 'contagem:' || (m ->> 'id'),
       m ->> 'referencia', coalesce((m ->> 'ocorrido_em')::timestamptz, now()))
    on conflict (chave_idempotencia) do nothing
    returning id into v_id;
    if v_id is null then v_ignorados := v_ignorados + 1; else v_processados := v_processados + 1; end if;
    v_ultimo := m ->> 'id';
  end loop;

  update erp.sync_estado
     set cursor = coalesce(v_ultimo, cursor), ultima_sync_ok = now(), ultima_tentativa = now(),
         estado = 'ok', erro = null, movimentos_processados = movimentos_processados + v_processados
   where fonte = 'contagem';

  return jsonb_build_object('processados', v_processados, 'ignorados', v_ignorados,
    'fabrica_ignorados', v_fabrica, 'cursor', v_ultimo, 'desconhecidos', to_jsonb(v_desconhecidos));
end $$;

-- Entradas do Contagem sem referência a ordem, em produtos com ordens da fábrica recentes.
create or replace view erp.v_contagem_fabrica_suspeitos with (security_invoker = true) as
select sm.id as movimento_id, sm.produto_id, p.nome_cliente as produto, sm.quantidade, sm.motivo as referencia,
       sm.ocorrido_em
  from erp.stock_movimentos sm
  join erp.produtos p on p.id = sm.produto_id
 where sm.origem = 'contagem' and sm.tipo = 'entrada'
   and sm.ocorrido_em > now() - interval '30 days'
   and exists (select 1 from erp.fabrica_ordens fo join erp.pedido_itens pi on pi.id = fo.item_id
                where pi.produto_id = sm.produto_id
                  and coalesce(fo.recebido_em, fo.produzido_em) between sm.ocorrido_em - interval '3 days'
                                                                    and sm.ocorrido_em + interval '3 days');
grant select on erp.v_contagem_fabrica_suspeitos to authenticated;

create or replace function erp.fabrica_bloqueios() returns text[]
language plpgsql stable security definer set search_path to 'erp','public' as $$
declare r text[] := '{}'; n int;
begin
  if coalesce(erp.definicao_texto('fabrica_politica_entrada'), '') not in ('produced','warehouse_received') then
    r := r || 'Falta decidir quando entra o stock vindo da fábrica (produzido ou recebido no armazém).';
  end if;
  select count(*) into n from erp.v_contagem_fabrica_suspeitos;
  if n > 0 then
    r := r || format('Há %s entradas do Contagem sem referência a ordem da fábrica em produtos fabricados; identifique-as antes de ligar.', n);
  end if;
  return r;
end $$;

-- ================= C. Financeiro idempotente
alter table erp.pagamentos add column if not exists data_valor date;

create or replace function erp.op_idem_obter(p_chave text, p_operacao text) returns jsonb
language plpgsql security definer set search_path to 'erp','public' as $$
declare r erp.operacoes_chaves%rowtype;
begin
  if p_chave is null or length(p_chave) < 8 then raise exception 'Chave de operação inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('op:' || p_chave, 0));
  select * into r from erp.operacoes_chaves where chave = p_chave;
  if found then
    if r.operacao <> p_operacao then raise exception 'Esta chave já foi usada noutra operação.'; end if;
    return coalesce(r.resultado, '{}'::jsonb) || '{"repetido": true}'::jsonb;
  end if;
  return null;
end $$;

create or replace function erp.op_idem_gravar(p_chave text, p_operacao text, p_resultado jsonb) returns jsonb
language plpgsql security definer set search_path to 'erp','public' as $$
begin
  insert into erp.operacoes_chaves (chave, operacao, resultado) values (p_chave, p_operacao, p_resultado);
  return p_resultado || '{"repetido": false}'::jsonb;
end $$;

create or replace function erp.validar_euros(p_valor numeric) returns numeric
language plpgsql immutable set search_path to 'erp','public' as $$
begin
  if p_valor is null or p_valor <= 0 then raise exception 'O valor tem de ser positivo.'; end if;
  if p_valor <> round(p_valor, 2) then raise exception 'O valor só pode ter cêntimos (2 casas decimais).'; end if;
  if p_valor > 9999999999.99 then raise exception 'Valor acima do limite.'; end if;
  return p_valor;
end $$;

create or replace function erp.registar_pagamento_idem(p_chave text, p_pedido_id uuid, p_forma_id uuid,
  p_valor numeric, p_referencia text default null, p_comprovativo_url text default null,
  p_data_prevista date default null, p_observacoes text default null)
returns jsonb language plpgsql security definer set search_path to 'erp','public' as $$
declare v jsonb; v_id uuid;
begin
  perform erp.exigir_utilizador_ativo();
  v := erp.op_idem_obter(p_chave, 'registar_pagamento'); if v is not null then return v; end if;
  perform erp.validar_euros(p_valor);
  perform 1 from erp.pedidos where id = p_pedido_id for update;
  v_id := erp.registar_pagamento(p_pedido_id, p_forma_id, p_valor, p_referencia, p_comprovativo_url,
                                 p_data_prevista, p_observacoes);
  return erp.op_idem_gravar(p_chave, 'registar_pagamento', jsonb_build_object('pagamento_id', v_id));
end $$;

create or replace function erp.confirmar_pagamento_banco(p_chave text, p_pagamento_id uuid,
  p_referencia text, p_data_valor date, p_comprovativo_url text default null)
returns jsonb language plpgsql security definer set search_path to 'erp','public' as $$
declare v jsonb; pg erp.pagamentos%rowtype;
begin
  perform erp.exigir_utilizador_ativo(array['financeiro','adm']::erp.perfil[]);
  v := erp.op_idem_obter(p_chave, 'confirmar_pagamento'); if v is not null then return v; end if;
  select * into pg from erp.pagamentos where id = p_pagamento_id and eliminado_em is null for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if pg.estado = 'confirmado' then
    return erp.op_idem_gravar(p_chave, 'confirmar_pagamento',
      jsonb_build_object('pagamento_id', p_pagamento_id, 'ja_confirmado', true));
  end if;
  if pg.estado = 'pendente_confirmacao' and (coalesce(btrim(p_referencia), '') = '' or p_data_valor is null) then
    raise exception 'Confirmação bancária exige a referência do extrato e a data-valor.';
  end if;
  if p_data_valor is not null and p_data_valor > current_date then
    raise exception 'A data-valor não pode ser futura.';
  end if;
  perform erp.confirmar_pagamento(p_pagamento_id, p_referencia, p_comprovativo_url);
  update erp.pagamentos set data_valor = p_data_valor where id = p_pagamento_id;
  return erp.op_idem_gravar(p_chave, 'confirmar_pagamento',
    jsonb_build_object('pagamento_id', p_pagamento_id, 'ja_confirmado', false));
end $$;

create or replace function erp.devolver_pagamento_idem(p_chave text, p_pagamento_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path to 'erp','public' as $$
declare v jsonb; pg erp.pagamentos%rowtype;
begin
  perform erp.exigir_utilizador_ativo(array['financeiro','adm']::erp.perfil[]);
  v := erp.op_idem_obter(p_chave, 'devolver_pagamento'); if v is not null then return v; end if;
  select * into pg from erp.pagamentos where id = p_pagamento_id and eliminado_em is null for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Indique o motivo da devolução.'; end if;
  perform erp.devolver_pagamento(p_pagamento_id, p_motivo);
  return erp.op_idem_gravar(p_chave, 'devolver_pagamento', jsonb_build_object('pagamento_id', p_pagamento_id));
end $$;

create or replace function erp.movimento_caixa_idem(p_chave text, p_tipo text, p_valor numeric,
  p_motivo_id uuid, p_descricao text default null, p_comprovativo_url text default null,
  p_caixa_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'erp','public' as $$
declare v jsonb;
begin
  perform erp.exigir_utilizador_ativo();
  if p_tipo not in ('entrada','saida','sangria') then raise exception 'Tipo de movimento inválido.'; end if;
  v := erp.op_idem_obter(p_chave, 'caixa_' || p_tipo); if v is not null then return v; end if;
  perform erp.validar_euros(p_valor);
  if p_tipo = 'entrada' then
    perform erp.registar_entrada_caixa(p_valor, p_motivo_id, p_descricao, p_comprovativo_url);
  elsif p_tipo = 'saida' then
    perform erp.registar_saida_caixa(p_valor, p_motivo_id, p_descricao, p_comprovativo_url);
  else
    if p_caixa_id is null then raise exception 'Indique o caixa.'; end if;
    perform 1 from erp.caixas where id = p_caixa_id for update;
    perform erp.registar_sangria(p_caixa_id, p_valor, p_motivo_id, p_descricao);
  end if;
  return erp.op_idem_gravar(p_chave, 'caixa_' || p_tipo, jsonb_build_object('valor', p_valor));
end $$;

create or replace function erp.receber_envelope_rota_idem(p_chave text, p_rota_id uuid, p_valor numeric)
returns jsonb language plpgsql security definer set search_path to 'erp','public' as $$
declare v jsonb;
begin
  perform erp.exigir_utilizador_ativo(array['financeiro','adm','escritorio']::erp.perfil[]);
  v := erp.op_idem_obter(p_chave, 'envelope_rota'); if v is not null then return v; end if;
  if p_valor is null or p_valor < 0 or p_valor <> round(p_valor, 2) then
    raise exception 'Valor do envelope inválido (positivo ou zero, com cêntimos).';
  end if;
  perform 1 from erp.rotas where id = p_rota_id for update;
  perform erp.receber_envelope_rota(p_rota_id, p_valor);
  return erp.op_idem_gravar(p_chave, 'envelope_rota', jsonb_build_object('rota_id', p_rota_id, 'valor', p_valor));
end $$;

-- ================= D. Agendamento com cobertura, pré-agendado e capacidade real
alter table erp.rota_paragens add column if not exists pre_agendada boolean not null default false;

create or replace function erp.cobertura_pedido(p_pedido_id uuid, p_data date)
returns table (cobertas int, por_cobrir int, sem_eta int, eta_depois int, eta_max date)
language sql stable security definer set search_path to 'erp','public' as $$
  with l as (
    select pi.id, pi.estado::text as estado,
           coalesce((select max(coalesce(oi.data_prevista_item, oc.data_confirmada_fornecedor, oc.data_prevista))
                       from erp.oc_itens oi join erp.ordens_compra oc on oc.id = oi.oc_id
                      where oi.pedido_item_id = pi.id and oi.eliminado_em is null
                        and oc.estado::text not in ('cancelada','recebida')
                        and oi.quantidade_recebida + coalesce(oi.quantidade_diferida,0) < oi.quantidade),
                    pi.data_prevista) as eta
      from erp.pedido_itens pi
     where pi.pedido_id = p_pedido_id and pi.eliminado_em is null
       and pi.produto_id is not null and pi.estado::text <> 'cancelado')
  select count(*) filter (where estado in ('reservado','separado','entregue','recebido'))::int,
         count(*) filter (where estado not in ('reservado','separado','entregue','recebido'))::int,
         count(*) filter (where estado not in ('reservado','separado','entregue','recebido') and eta is null)::int,
         count(*) filter (where estado not in ('reservado','separado','entregue','recebido') and eta > p_data)::int,
         max(eta) filter (where estado not in ('reservado','separado','entregue','recebido'))
    from l
$$;

create or replace function erp.agendar_entrega(p_pedido_id uuid, p_rota_id uuid, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path to 'erp','public' as $$
declare
  ped erp.pedidos%rowtype; r erp.rotas%rowtype; c record; oc record;
  v_prev numeric(12,2); v_ordem int; v_excede boolean := false; v_avisos text[] := '{}';
  v_pre boolean := false; v_paragem uuid;
begin
  perform erp.exigir_utilizador_ativo(array['adm','escritorio']::erp.perfil[]);
  select * into ped from erp.pedidos where id = p_pedido_id and eliminado_em is null for update;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if ped.estado not in ('confirmado','em_preparacao','pronto','entrega_parcial') then
    raise exception 'Só é possível agendar vendas confirmadas, em preparação, prontas ou em entrega parcial.';
  end if;
  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado in ('fechada','conferida','concluida','cancelada') then
    raise exception 'Esta rota já não aceita entregas.';
  end if;
  if r.estado = 'em_curso' and not p_confirmar then
    raise exception 'A rota já arrancou. Confirme que quer acrescentar esta paragem.';
  end if;
  if exists (select 1 from erp.rota_paragens rp join erp.rotas r2 on r2.id = rp.rota_id
              where rp.pedido_id = p_pedido_id and rp.eliminado_em is null
                and rp.desfecho is null and r2.estado in ('planeada','em_curso')) then
    raise exception 'Esta venda já está agendada numa rota.';
  end if;

  select * into c from erp.cobertura_pedido(p_pedido_id, r.data);
  if c.por_cobrir > 0 then
    if c.sem_eta > 0 then
      raise exception 'Há % artigo(s) sem stock e sem data prevista de chegada; não é possível agendar.', c.sem_eta;
    end if;
    if c.eta_depois > 0 then
      raise exception 'Há artigos que só chegam a % — depois do dia da rota (%).',
        to_char(c.eta_max, 'DD/MM/YYYY'), to_char(r.data, 'DD/MM/YYYY');
    end if;
    if r.estado = 'em_curso' then
      raise exception 'Numa rota em curso só entram vendas com todos os artigos já disponíveis.';
    end if;
    v_pre := true;
    v_avisos := v_avisos || format('Pré-agendada: %s artigo(s) chegam até %s.', c.por_cobrir,
                                   to_char(c.eta_max, 'DD/MM/YYYY'));
  end if;

  select coalesce(max(ordem), 0) + 1 into v_ordem from erp.rota_paragens where rota_id = p_rota_id and eliminado_em is null;
  select coalesce(sum(pg.valor), 0) into v_prev from erp.pagamentos pg
   where pg.pedido_id = p_pedido_id and pg.eliminado_em is null and pg.estado in ('pendente','pendente_confirmacao');
  if v_prev = 0 then v_prev := erp.pendente_pedido(p_pedido_id); end if;

  insert into erp.rota_paragens (rota_id, pedido_id, ordem, previsto_receber, excedeu_capacidade, pre_agendada)
  values (p_rota_id, p_pedido_id, v_ordem, v_prev, false, v_pre) returning id into v_paragem;

  -- capacidade medida já com a nova paragem incluída
  select * into oc from erp.v_rota_ocupacao where rota_id = p_rota_id;
  if r.max_entregas is not null and coalesce(oc.entregas, 0) > r.max_entregas then
    v_excede := true;
    v_avisos := v_avisos || format('Máximo de entregas ultrapassado (%s/%s).', oc.entregas, r.max_entregas);
  end if;
  if r.max_minutos_montagem is not null and coalesce(oc.montagem_min, 0) > r.max_minutos_montagem then
    v_excede := true;
    v_avisos := v_avisos || format('Tempo de montagem acima do limite (%s/%s min).', oc.montagem_min, r.max_minutos_montagem);
  end if;
  if v_excede then update erp.rota_paragens set excedeu_capacidade = true where id = v_paragem; end if;

  perform set_config('erp.recalculo', '1', true);
  perform set_config('erp.motor', '1', true);
  if v_pre then
    update erp.pedidos set data_entrega_agendada = r.data where id = p_pedido_id;
  else
    update erp.pedidos set estado = 'agendado'::erp.estado_pedido, data_entrega_agendada = r.data where id = p_pedido_id;
  end if;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  if r.estado = 'planeada' then
    perform erp.recalcular_previsto_rota(p_rota_id);
  else
    insert into erp.rota_alteracoes (rota_id, tipo, pedido_id, descricao)
    values (p_rota_id, 'adicionou', p_pedido_id, format('Paragem acrescentada com a rota em curso (%s).', ped.numero));
  end if;

  return jsonb_build_object('rota_id', p_rota_id, 'data', r.data, 'paragem_id', v_paragem,
    'pre_agendada', v_pre, 'excedeu_capacidade', v_excede, 'avisos', to_jsonb(v_avisos));
end $$;

create or replace function erp.confirmar_pre_agendamento(p_paragem_id uuid) returns jsonb
language plpgsql security definer set search_path to 'erp','public' as $$
declare rp erp.rota_paragens%rowtype; r erp.rotas%rowtype; c record;
begin
  perform erp.exigir_utilizador_ativo(array['adm','escritorio']::erp.perfil[]);
  select * into rp from erp.rota_paragens where id = p_paragem_id and eliminado_em is null for update;
  if not found then raise exception 'Paragem não encontrada.'; end if;
  if not rp.pre_agendada then return jsonb_build_object('confirmada', true, 'ja', true); end if;
  select * into r from erp.rotas where id = rp.rota_id;
  select * into c from erp.cobertura_pedido(rp.pedido_id, r.data);
  if c.por_cobrir > 0 then
    raise exception 'Ainda faltam % artigo(s) para esta entrega.', c.por_cobrir;
  end if;
  update erp.rota_paragens set pre_agendada = false where id = p_paragem_id;
  perform set_config('erp.recalculo', '1', true); perform set_config('erp.motor', '1', true);
  update erp.pedidos set estado = 'agendado'::erp.estado_pedido
   where id = rp.pedido_id and estado in ('confirmado','em_preparacao','pronto','entrega_parcial');
  perform set_config('erp.recalculo', '', true); perform set_config('erp.motor', '', true);
  return jsonb_build_object('confirmada', true, 'ja', false);
end $$;

-- ================= E. Fornecimento por linha e cartões de stock
create or replace view erp.v_linha_fornecimento with (security_invoker = true) as
select pi.id as pedido_item_id, pi.pedido_id, pi.produto_id, pi.descricao, pi.nota, pi.quantidade,
       pi.tipo_fornecimento, pi.estado::text as estado_item,
       coalesce(sum(oi.quantidade_recebida), 0)::int as recebido,
       greatest(pi.quantidade - case when pi.estado::text in ('reservado','separado','entregue','recebido')
                                     then pi.quantidade else coalesce(sum(oi.quantidade_recebida),0) end, 0)::int as falta,
       (select o.numero from erp.oc_itens x join erp.ordens_compra o on o.id = coalesce(
           (select oc_raiz_id from erp.ordens_compra where id = x.oc_id), x.oc_id)
         where x.pedido_item_id = pi.id and x.eliminado_em is null order by x.criado_em limit 1) as oc_raiz,
       (select o.numero from erp.oc_itens x join erp.ordens_compra o on o.id = x.oc_id
         where x.pedido_item_id = pi.id and x.eliminado_em is null and o.estado::text <> 'cancelada'
         order by o.criado_em desc limit 1) as oc_atual,
       (select o.id from erp.oc_itens x join erp.ordens_compra o on o.id = x.oc_id
         where x.pedido_item_id = pi.id and x.eliminado_em is null and o.estado::text <> 'cancelada'
         order by o.criado_em desc limit 1) as oc_atual_id,
       (select min(coalesce(x.data_prevista_item, o.data_confirmada_fornecedor, o.data_prevista))
          from erp.oc_itens x join erp.ordens_compra o on o.id = x.oc_id
         where x.pedido_item_id = pi.id and x.eliminado_em is null
           and o.estado::text not in ('cancelada','recebida')
           and x.quantidade_recebida + coalesce(x.quantidade_diferida,0) < x.quantidade) as eta
  from erp.pedido_itens pi
  left join erp.oc_itens oi on oi.pedido_item_id = pi.id and oi.eliminado_em is null
 where pi.eliminado_em is null and pi.produto_id is not null
 group by pi.id;
grant select on erp.v_linha_fornecimento to authenticated;

create or replace view erp.v_stock_cartoes with (security_invoker = true) as
select s.produto_id, s.fisico, s.reservado, greatest(s.fisico - s.reservado, 0) as disponivel,
       s.encomendado as a_receber,
       coalesce((select sum(pi.quantidade) from erp.pedido_itens pi join erp.pedidos p on p.id = pi.pedido_id
                  where pi.produto_id = s.produto_id and pi.eliminado_em is null and p.eliminado_em is null
                    and pi.tipo_fornecimento = 'producao' and pi.estado::text in ('pendente','encomendado')
                    and p.estado::text not in ('orcamento','cancelado','entregue')), 0)::int as a_fabricar
  from erp.v_stock s;
grant select on erp.v_stock_cartoes to authenticated;

-- ================= F. Versões da nota PDF
create table if not exists erp.nota_versoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null,
  versao integer not null,
  caminho text not null,
  motivo text,
  gerado_por uuid default auth.uid(),
  gerado_em timestamptz not null default now(),
  unique (pedido_id, versao)
);
grant select on erp.nota_versoes to authenticated;
grant all on erp.nota_versoes to service_role;
alter table erp.nota_versoes enable row level security;
create policy "utilizadores ativos leem versões" on erp.nota_versoes for select to authenticated
  using (erp.perfil_atual() is not null);

create or replace function erp.registar_versao_nota(p_pedido_id uuid, p_caminho text, p_motivo text)
returns integer language plpgsql security definer set search_path to 'erp','public' as $$
declare v int;
begin
  perform pg_advisory_xact_lock(hashtextextended('nota:' || p_pedido_id::text, 0));
  select coalesce(max(versao), 0) + 1 into v from erp.nota_versoes where pedido_id = p_pedido_id;
  insert into erp.nota_versoes (pedido_id, versao, caminho, motivo) values (p_pedido_id, v, p_caminho, p_motivo);
  return v;
end $$;

-- ================= Permissões
revoke all on function erp.op_idem_obter(text,text), erp.op_idem_gravar(text,text,jsonb),
  erp.tg_fabrica_outbox_backoff(), erp.fabrica_worker_pode_correr(), erp.contagem_ordem_fabrica(jsonb,uuid),
  erp.registar_versao_nota(uuid,text,text), erp.fabrica_outbox_reclamar(integer)
  from public, anon, authenticated;
grant execute on function erp.fabrica_worker_pode_correr(), erp.registar_versao_nota(uuid,text,text),
  erp.fabrica_outbox_reclamar(integer) to service_role;
revoke all on function erp.registar_pagamento_idem(text,uuid,uuid,numeric,text,text,date,text),
  erp.confirmar_pagamento_banco(text,uuid,text,date,text), erp.devolver_pagamento_idem(text,uuid,text),
  erp.movimento_caixa_idem(text,text,numeric,uuid,text,text,uuid), erp.receber_envelope_rota_idem(text,uuid,numeric),
  erp.confirmar_pre_agendamento(uuid), erp.cobertura_pedido(uuid,date), erp.validar_euros(numeric),
  erp.agendar_entrega(uuid,uuid,boolean), erp.registar_movimentos_contagem(jsonb), erp.fabrica_bloqueios()
  from public, anon;
grant execute on function erp.registar_pagamento_idem(text,uuid,uuid,numeric,text,text,date,text),
  erp.confirmar_pagamento_banco(text,uuid,text,date,text), erp.devolver_pagamento_idem(text,uuid,text),
  erp.movimento_caixa_idem(text,text,numeric,uuid,text,text,uuid), erp.receber_envelope_rota_idem(text,uuid,numeric),
  erp.confirmar_pre_agendamento(uuid), erp.cobertura_pedido(uuid,date), erp.agendar_entrega(uuid,uuid,boolean),
  erp.fabrica_bloqueios() to authenticated;
