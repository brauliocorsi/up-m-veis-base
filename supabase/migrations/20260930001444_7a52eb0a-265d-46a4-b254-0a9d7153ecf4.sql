-- ============================================================
-- Simplificação: fábrica externa (UP Fábrica), outbox, compras diferidas,
-- guardas de perfil e permissões de execução. Aditiva e reversível.
-- ============================================================

create or replace function erp.exigir_utilizador_ativo(p_perfis erp.perfil[] default null)
returns erp.perfil language plpgsql stable security definer set search_path = erp, public as $$
declare
  v erp.perfil;
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
begin
  if v_role = 'service_role' then return null; end if;
  if auth.uid() is null then
    if v_role is null and session_user in ('postgres', 'supabase_admin') then return null; end if;
    raise exception 'Sessão inválida: inicie sessão.' using errcode = '42501';
  end if;
  v := erp.perfil_atual();
  if v is null then
    raise exception 'Utilizador inativo ou sem perfil no ERP.' using errcode = '42501';
  end if;
  if p_perfis is not null and not (v = any (p_perfis)) then
    raise exception 'O seu perfil não permite esta ação.' using errcode = '42501';
  end if;
  return v;
end $$;

insert into erp.definicoes (chave, valor, descricao)
select * from (values
  ('fabrica_execucao_interna', 'false'::jsonb, 'Execução e planeamento da fábrica dentro do ERP (desligado: passou para o UP Fábrica).'),
  ('fabrica_integracao_ativa', 'false'::jsonb, 'Envio de encomendas ao UP Fábrica. Desligado até configurar e validar.'),
  ('fabrica_politica_entrada', 'null'::jsonb, 'Momento da entrada em stock: "produced" ou "warehouse_received". Por definir = bloqueado.'),
  ('fabrica_reconciliacao_contagem', 'false'::jsonb, 'Confirma que a sincronização Contagem não regista de novo as entradas vindas da fábrica.')
) v(chave, valor, descricao)
where not exists (select 1 from erp.definicoes d where d.chave = v.chave);

create or replace function erp.definicao_texto(p_chave text) returns text
language sql stable security definer set search_path = erp, public as $$
  select valor #>> '{}' from erp.definicoes where chave = p_chave and eliminado_em is null limit 1
$$;

create or replace function erp.exigir_fabrica_interna() returns void
language plpgsql stable security definer set search_path = erp, public as $$
begin
  if coalesce(erp.definicao_texto('fabrica_execucao_interna'), 'false') <> 'true' then
    raise exception 'A execução da fábrica passou para o UP Fábrica. Aqui fica apenas o histórico para consulta.';
  end if;
end $$;

create or replace function pg_temp.injetar(p_nome text, p_linha text, p_marca text) returns void
language plpgsql as $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            join pg_language l on l.oid = p.prolang
           where n.nspname = 'erp' and p.proname = p_nome and l.lanname = 'plpgsql'
  loop
    d := pg_get_functiondef(r.oid);
    continue when position(p_marca in d) > 0;
    d := regexp_replace(d, '(\$function\$.*?\mbegin\M)', E'\\1\n  ' || p_linha || ' ' || p_marca, '');
    execute d;
  end loop;
end $$;

select pg_temp.injetar('confirmar_pedido',
  'perform erp.exigir_utilizador_ativo(array[''vendedora'',''escritorio'',''adm'',''financeiro'']::erp.perfil[]);', '-- guarda:perfil');
select pg_temp.injetar('reabrir_pedido',
  'perform erp.exigir_utilizador_ativo(array[''vendedora'',''escritorio'',''adm'']::erp.perfil[]);', '-- guarda:perfil');
select pg_temp.injetar(f, 'perform erp.exigir_utilizador_ativo();', '-- guarda:ativo')
  from unnest(array['devolver_pagamento','anular_documento_fiscal','confirmar_pagamento','definir_custos',
                    'registar_documento_fiscal','registar_pagamento','rejeitar_pagamento','agendar_entrega',
                    'receber_oc','finalizar_oc','abrir_caixa','fechar_caixa','fechar_rota','conferir_rota',
                    'receber_envelope_rota']) f;
select pg_temp.injetar(f, 'perform erp.exigir_fabrica_interna();', '-- guarda:fabrica')
  from unnest(array['criar_op','criar_op_interna','iniciar_etapa','concluir_etapa','conferir_etapa','concluir_op',
                    'criar_plano','aprovar_plano','simular_plano','gravar_plano_linha',
                    'agrupar_necessidades_no_plano','regularizar_consumo']) f;

create table erp.fabrica_outbox (
  event_id uuid primary key default gen_random_uuid(),
  necessidade_id uuid not null references erp.necessidades_producao(id),
  pedido_id uuid not null references erp.pedidos(id),
  item_id uuid not null references erp.pedido_itens(id),
  revisao integer not null default 1,
  quantidade integer not null check (quantidade > 0),
  payload jsonb not null,
  estado text not null default 'em_fila'
    check (estado in ('em_fila','a_enviar','incerto','erro','aceite','bloqueado_pagamento','cancelado')),
  tentativas integer not null default 0,
  ultimo_erro text,
  ultima_tentativa_em timestamptz,
  aceite_em timestamptz,
  resposta jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (item_id, revisao)
);
grant select on erp.fabrica_outbox to authenticated;
grant all on erp.fabrica_outbox to service_role;
alter table erp.fabrica_outbox enable row level security;
create policy "ver outbox fábrica" on erp.fabrica_outbox for select to authenticated
  using (erp.perfil_atual() in ('adm','escritorio','compras','financeiro','vendedora'));

create table erp.fabrica_ordens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references erp.fabrica_outbox(event_id),
  pedido_id uuid not null references erp.pedidos(id),
  item_id uuid not null references erp.pedido_itens(id),
  unit_index integer not null check (unit_index > 0),
  order_id text not null unique,
  order_number text,
  estado text not null default 'aceite' check (estado in ('aceite','produced','warehouse_received','cancelada')),
  produzido_em timestamptz,
  recebido_em timestamptz,
  entrada_movimento_id bigint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (event_id, unit_index)
);
grant select on erp.fabrica_ordens to authenticated;
grant all on erp.fabrica_ordens to service_role;
alter table erp.fabrica_ordens enable row level security;
create policy "ver ordens fábrica" on erp.fabrica_ordens for select to authenticated
  using (erp.perfil_atual() in ('adm','escritorio','compras','financeiro','vendedora'));

create table erp.fabrica_eventos (
  event_id uuid primary key,
  corpo jsonb not null,
  resultado text not null,
  detalhe text,
  recebido_em timestamptz not null default now()
);
grant select on erp.fabrica_eventos to authenticated;
grant all on erp.fabrica_eventos to service_role;
alter table erp.fabrica_eventos enable row level security;
create policy "adm vê eventos fábrica" on erp.fabrica_eventos for select to authenticated
  using (erp.perfil_atual() in ('adm','escritorio'));

create or replace function erp.tg_fabrica_enfileirar() returns trigger
language plpgsql security definer set search_path = erp, public as $$
declare it record;
begin
  if coalesce(erp.definicao_texto('fabrica_integracao_ativa'), 'false') <> 'true' then return NEW; end if;
  select i.id, i.descricao, i.nota, i.pedido_id, p.numero, pr.cod_barras
    into it
    from erp.pedido_itens i join erp.pedidos p on p.id = i.pedido_id
    left join erp.produtos pr on pr.id = i.produto_id
   where i.id = NEW.item_id;
  insert into erp.fabrica_outbox (necessidade_id, pedido_id, item_id, revisao, quantidade, payload)
  values (NEW.id, NEW.pedido_id, NEW.item_id,
          coalesce((select max(revisao) + 1 from erp.fabrica_outbox where item_id = NEW.item_id), 1),
          NEW.quantidade,
          jsonb_build_object(
            'sale_number', coalesce(it.numero, ''),
            'product_id', NEW.produto_id,
            'product_code', it.cod_barras,
            'description', trim(both E'\n' from coalesce(it.descricao, '') ||
                                  case when coalesce(it.nota, '') <> '' then E'\n' || it.nota else '' end),
            'quantity', NEW.quantidade,
            'due_date', NEW.data_necessaria,
            'customization', case when coalesce(it.nota, '') <> '' then jsonb_build_object('nota', it.nota) else null end));
  return NEW;
end $$;
create trigger t_fabrica_enfileirar after insert on erp.necessidades_producao
  for each row execute function erp.tg_fabrica_enfileirar();

create or replace function erp.fabrica_bloqueios() returns text[]
language plpgsql stable security definer set search_path = erp, public as $$
declare r text[] := '{}';
begin
  if coalesce(erp.definicao_texto('fabrica_politica_entrada'), '') not in ('produced','warehouse_received') then
    r := r || 'Falta decidir quando entra o stock vindo da fábrica (produzido ou recebido no armazém).';
  end if;
  if coalesce(erp.definicao_texto('fabrica_reconciliacao_contagem'), 'false') <> 'true' then
    r := r || 'Ainda não está garantido que a sincronização Contagem não conta de novo as entradas da fábrica.';
  end if;
  return r;
end $$;

create or replace function erp.fabrica_definir_ativa(p_ativa boolean) returns void
language plpgsql security definer set search_path = erp, public as $$
declare b text[];
begin
  perform erp.exigir_utilizador_ativo(array['adm']::erp.perfil[]);
  if p_ativa then
    b := erp.fabrica_bloqueios();
    if array_length(b, 1) > 0 then raise exception 'Não é possível ligar: %', array_to_string(b, ' '); end if;
  end if;
  update erp.definicoes set valor = to_jsonb(p_ativa) where chave = 'fabrica_integracao_ativa';
end $$;

create or replace function erp.fabrica_outbox_reclamar(p_limite int default 20) returns setof erp.fabrica_outbox
language plpgsql security definer set search_path = erp, public as $$
begin
  update erp.fabrica_outbox o set estado = 'bloqueado_pagamento', atualizado_em = now()
   where o.estado in ('em_fila','erro','incerto')
     and exists (select 1 from erp.pagamentos pg where pg.pedido_id = o.pedido_id
                  and pg.estado::text = 'pendente_confirmacao' and pg.eliminado_em is null);
  update erp.fabrica_outbox o set estado = 'em_fila', atualizado_em = now()
   where o.estado = 'bloqueado_pagamento'
     and not exists (select 1 from erp.pagamentos pg where pg.pedido_id = o.pedido_id
                      and pg.estado::text = 'pendente_confirmacao' and pg.eliminado_em is null);
  return query
  update erp.fabrica_outbox o set estado = 'a_enviar', tentativas = tentativas + 1,
         ultima_tentativa_em = now(), atualizado_em = now()
   where o.event_id in (select event_id from erp.fabrica_outbox
                         where estado in ('em_fila','erro','incerto')
                            or (estado = 'a_enviar' and ultima_tentativa_em < now() - interval '5 minutes')
                         order by criado_em limit p_limite for update skip locked)
  returning o.*;
end $$;

create or replace function erp.fabrica_outbox_resultado(p_event_id uuid, p_estado text, p_resposta jsonb, p_erro text)
returns void language plpgsql security definer set search_path = erp, public as $$
declare o erp.fabrica_outbox%rowtype; x jsonb;
begin
  select * into o from erp.fabrica_outbox where event_id = p_event_id for update;
  if o.event_id is null then raise exception 'Evento de envio desconhecido.'; end if;
  if o.estado = 'aceite' then return; end if;
  if p_estado not in ('aceite','erro','incerto') then raise exception 'Estado de envio inválido.'; end if;
  if p_estado = 'aceite' then
    if coalesce((p_resposta ->> 'accepted')::boolean, false) is not true
       or (p_resposta ->> 'event_id')::uuid is distinct from p_event_id
       or jsonb_array_length(coalesce(p_resposta -> 'orders', '[]')) <> o.quantidade then
      raise exception 'Resposta da fábrica inválida.';
    end if;
    for x in select * from jsonb_array_elements(p_resposta -> 'orders') loop
      insert into erp.fabrica_ordens (event_id, pedido_id, item_id, unit_index, order_id, order_number)
      values (p_event_id, o.pedido_id, o.item_id, (x ->> 'unit_index')::int, x ->> 'id', x ->> 'order_number')
      on conflict (order_id) do nothing;
    end loop;
    update erp.fabrica_outbox set estado = 'aceite', aceite_em = now(), resposta = p_resposta,
           ultimo_erro = null, atualizado_em = now() where event_id = p_event_id;
  else
    update erp.fabrica_outbox set estado = p_estado, ultimo_erro = left(p_erro, 500), atualizado_em = now()
     where event_id = p_event_id;
  end if;
end $$;

create or replace function erp.fabrica_registar_evento(p jsonb) returns jsonb
language plpgsql security definer set search_path = erp, public as $$
declare
  v_id uuid; ord erp.fabrica_ordens%rowtype; v_status text; v_rank_novo int; v_rank_atual int;
  v_politica text; v_mov bigint; v_res text; v_det text; v_pi record; v_cob int;
begin
  begin v_id := (p ->> 'event_id')::uuid; exception when others then v_id := null; end;
  if v_id is null then return jsonb_build_object('resultado', 'invalido', 'detalhe', 'event_id em falta'); end if;
  if exists (select 1 from erp.fabrica_eventos where event_id = v_id) then
    return jsonb_build_object('resultado', 'duplicado');
  end if;

  v_status := p ->> 'status';
  select * into ord from erp.fabrica_ordens where order_id = p ->> 'order_id' for update;

  if coalesce((p ->> 'schema_version')::int, 0) <> 1 or coalesce(p ->> 'source_system', '') <> 'up-fabrica'
     or coalesce(v_status, '') not in ('produced','warehouse_received') or coalesce((p ->> 'quantity')::int, 0) <> 1 then
    v_res := 'invalido'; v_det := 'Corpo fora do contrato v1.';
  elsif ord.id is null then
    v_res := 'desconhecido'; v_det := 'Ordem externa não enviada por este ERP.';
  elsif ord.pedido_id::text <> coalesce(p ->> 'sale_id', '') or ord.item_id::text <> coalesce(p ->> 'line_id', '')
        or ord.unit_index <> coalesce((p ->> 'unit_index')::int, -1) then
    v_res := 'invalido'; v_det := 'Venda, linha ou unidade não correspondem à ordem.';
  else
    v_rank_atual := case ord.estado when 'aceite' then 1 when 'produced' then 2 when 'warehouse_received' then 3 else 9 end;
    v_rank_novo := case v_status when 'produced' then 2 else 3 end;
    if v_rank_novo <= v_rank_atual then
      v_res := 'fora_de_ordem'; v_det := 'Estado anterior ao atual; registado sem efeito.';
    else
      update erp.fabrica_ordens set estado = v_status,
             produzido_em = case when v_status = 'produced' then (p ->> 'occurred_at')::timestamptz else produzido_em end,
             recebido_em = case when v_status = 'warehouse_received' then (p ->> 'occurred_at')::timestamptz else recebido_em end,
             atualizado_em = now()
       where id = ord.id;
      v_res := 'aplicado';
      v_politica := erp.definicao_texto('fabrica_politica_entrada');
      if coalesce(v_politica, '') not in ('produced','warehouse_received') then
        v_det := 'Política de entrada por definir: estado guardado, sem entrada em stock.';
      elsif v_rank_novo >= (case v_politica when 'produced' then 2 else 3 end) and ord.entrada_movimento_id is null then
        select i.produto_id, i.quantidade, i.pedido_id, i.estado into v_pi from erp.pedido_itens i where i.id = ord.item_id;
        perform set_config('erp.motor', '1', true);
        insert into erp.stock_movimentos (produto_id, tipo, quantidade, origem, chave_idempotencia,
                                          documento_tipo, documento_id, motivo)
        values (v_pi.produto_id, 'entrada', 1, 'producao', 'fabrica:' || ord.order_id,
                'fabrica_ordem', ord.id, 'Entrada do UP Fábrica ' || coalesce(ord.order_number, ord.order_id))
        on conflict (chave_idempotencia) do nothing returning id into v_mov;
        if v_mov is not null then
          update erp.fabrica_ordens set entrada_movimento_id = v_mov where id = ord.id;
          if v_pi.estado::text not in ('cancelado','entregue') then
            perform erp.reservar(v_pi.produto_id, 1, 'pedido', v_pi.pedido_id, ord.item_id, null);
            select coalesce(sum(quantidade), 0) into v_cob from erp.reservas
             where linha_id = ord.item_id and estado = 'ativa' and eliminado_em is null;
            if v_cob >= v_pi.quantidade then
              update erp.pedido_itens set estado = 'reservado' where id = ord.item_id;
            end if;
          end if;
          v_det := 'Entrada em stock registada e reservada à linha da venda.';
        end if;
        perform set_config('erp.motor', '', true);
      end if;
    end if;
  end if;

  insert into erp.fabrica_eventos (event_id, corpo, resultado, detalhe) values (v_id, p, v_res, v_det);
  return jsonb_build_object('resultado', v_res, 'detalhe', v_det);
end $$;

create or replace function erp.tg_pedido_fabrica_estado() returns trigger
language plpgsql security definer set search_path = erp, public as $$
begin
  if NEW.estado::text in ('cancelado','orcamento') and OLD.estado::text not in ('cancelado','orcamento') then
    if exists (select 1 from erp.fabrica_ordens where pedido_id = NEW.id and estado in ('aceite','produced')) then
      raise exception 'Há encomendas desta venda em curso no UP Fábrica. Cancele-as primeiro na fábrica.';
    end if;
    if exists (select 1 from erp.fabrica_outbox where pedido_id = NEW.id and estado in ('a_enviar','incerto')) then
      raise exception 'Há um envio à fábrica por confirmar. Aguarde a reconciliação antes de cancelar.';
    end if;
    update erp.fabrica_outbox set estado = 'cancelado', atualizado_em = now()
     where pedido_id = NEW.id and estado in ('em_fila','erro','bloqueado_pagamento');
    update erp.necessidades_producao set estado = 'cancelada'
     where pedido_id = NEW.id and estado = 'aberta' and op_id is null;
    update erp.necessidades_compra set estado = 'cancelada'
     where pedido_id = NEW.id and estado = 'aberta';
  end if;
  return NEW;
end $$;
create trigger t_pedido_fabrica_estado before update of estado on erp.pedidos
  for each row execute function erp.tg_pedido_fabrica_estado();

create or replace function erp.cancelar_pedido(p_pedido_id uuid, p_motivo_id uuid, p_nota text)
returns void language plpgsql security definer set search_path = erp, public as $$
declare ped erp.pedidos%rowtype; r record;
begin
  perform erp.exigir_utilizador_ativo(array['vendedora','escritorio','adm']::erp.perfil[]);
  select * into ped from erp.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if ped.estado = 'cancelado' then raise exception 'Este pedido já está cancelado.'; end if;
  if ped.estado = 'entregue' then raise exception 'Um pedido entregue não pode ser cancelado.'; end if;
  if p_motivo_id is null then raise exception 'Escolha o motivo do cancelamento.'; end if;

  perform set_config('erp.motor', '1', true);
  for r in select rs.id from erp.reservas rs join erp.pedido_itens i on i.id = rs.linha_id
            where i.pedido_id = p_pedido_id and rs.estado = 'ativa' and rs.eliminado_em is null loop
    perform erp.libertar_reserva(r.id, coalesce(p_nota, 'Pedido cancelado'));
  end loop;
  update erp.pedido_itens set estado = 'cancelado', reserva_id = null
    where pedido_id = p_pedido_id and estado <> 'cancelado';
  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos set estado = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
    motivo_cancelamento_id = p_motivo_id, nota_cancelamento = p_nota
  where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);
end $$;

create or replace view erp.v_encomendas_fabrica with (security_invoker = true) as
select n.id, n.pedido_id, p.numero as pedido_numero, c.nome as cliente_nome,
       n.item_id, n.produto_id, pr.nome_cliente as produto_nome, pr.cod_barras as produto_codigo,
       i.descricao, i.nota, n.quantidade as quantidade_fabricar, n.data_necessaria, n.estado as estado_necessidade,
       o.event_id, o.estado as estado_envio, o.tentativas, o.ultimo_erro, o.aceite_em,
       (select count(*) from erp.fabrica_ordens f where f.event_id = o.event_id) as unidades_aceites,
       (select count(*) from erp.fabrica_ordens f where f.event_id = o.event_id and f.estado in ('produced','warehouse_received')) as unidades_produzidas,
       (select count(*) from erp.fabrica_ordens f where f.event_id = o.event_id and f.estado = 'warehouse_received') as unidades_recebidas,
       (select string_agg(coalesce(f.order_number, f.order_id), ', ' order by f.unit_index) from erp.fabrica_ordens f where f.event_id = o.event_id) as ordens_externas,
       n.criado_em
  from erp.necessidades_producao n
  join erp.pedidos p on p.id = n.pedido_id
  left join erp.clientes c on c.id = p.cliente_id
  join erp.pedido_itens i on i.id = n.item_id
  left join erp.produtos pr on pr.id = n.produto_id
  left join lateral (select * from erp.fabrica_outbox x where x.necessidade_id = n.id order by revisao desc limit 1) o on true
 where n.eliminado_em is null;
grant select on erp.v_encomendas_fabrica to authenticated;

create table erp.operacoes_chaves (
  chave text primary key,
  operacao text not null,
  resultado jsonb,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
grant select on erp.operacoes_chaves to authenticated;
grant all on erp.operacoes_chaves to service_role;
alter table erp.operacoes_chaves enable row level security;
create policy "ver próprias chaves" on erp.operacoes_chaves for select to authenticated using (criado_por = auth.uid());

alter table erp.ordens_compra
  add column if not exists oc_raiz_id uuid references erp.ordens_compra(id),
  add column if not exists oc_anterior_id uuid references erp.ordens_compra(id),
  add column if not exists oc_diferida_id uuid references erp.ordens_compra(id),
  add column if not exists diferida boolean not null default false;
alter table erp.oc_itens
  add column if not exists quantidade_diferida integer not null default 0 check (quantidade_diferida >= 0),
  add column if not exists oc_item_origem_id uuid references erp.oc_itens(id);

do $$
declare d text; d0 text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'erp' and p.proname = 'receber_oc';
  d0 := d;
  d := replace(d, 'v_falta := it.quantidade - it.quantidade_recebida;',
                  'v_falta := it.quantidade - it.quantidade_recebida - it.quantidade_diferida;');
  d := replace(d, 'and quantidade_recebida < quantidade) then',
                  'and quantidade_recebida + quantidade_diferida < quantidade) then');
  d := replace(d, 'from erp.pedido_itens pi where pi.id = it.pedido_item_id and pi.eliminado_em is null;',
                  'from erp.pedido_itens pi where pi.id = it.pedido_item_id and pi.eliminado_em is null and pi.estado::text <> ''cancelado'';');
  d := replace(d, 'where oc_id = p_oc_id and eliminado_em is null and estado <> ''cancelada''',
                  'where oc_id = coalesce(oc.oc_raiz_id, p_oc_id) and eliminado_em is null and estado <> ''cancelada''');
  if d = d0 then raise exception 'receber_oc não foi alterada'; end if;
  execute d;
end $$;

create or replace function erp.receber_oc_idem(p_chave text, p_oc_id uuid, p_linhas jsonb,
  p_doc text default null, p_observacoes text default null) returns jsonb
language plpgsql security definer set search_path = erp, public as $$
declare v jsonb; v_ins text;
begin
  if coalesce(length(p_chave), 0) < 8 then raise exception 'Chave de operação em falta.'; end if;
  insert into erp.operacoes_chaves (chave, operacao) values ('receber_oc:' || p_chave, 'receber_oc')
  on conflict (chave) do nothing returning chave into v_ins;
  if v_ins is null then
    select resultado into v from erp.operacoes_chaves where chave = 'receber_oc:' || p_chave;
    return coalesce(v, '{}'::jsonb) || jsonb_build_object('repetido', true);
  end if;
  v := erp.receber_oc(p_oc_id, p_linhas, p_doc, p_observacoes);
  update erp.operacoes_chaves set resultado = v where chave = 'receber_oc:' || p_chave;
  return v;
end $$;

create or replace function erp.diferir_saldo_oc(p_oc_id uuid) returns uuid
language plpgsql security definer set search_path = erp, public as $$
declare oc erp.ordens_compra%rowtype; v_nova uuid; it record; v_saldo int; v_n int := 0;
begin
  perform erp.exigir_utilizador_ativo(array['compras','adm']::erp.perfil[]);
  select * into oc from erp.ordens_compra where id = p_oc_id and eliminado_em is null for update;
  if oc.id is null then raise exception 'Ordem de compra não encontrada.'; end if;
  if oc.oc_diferida_id is not null then return oc.oc_diferida_id; end if;
  if oc.estado <> 'recebida_parcial' then
    raise exception 'Só uma ordem parcialmente recebida pode passar o saldo para uma nova ordem.';
  end if;

  perform set_config('erp.motor', '1', true);
  insert into erp.ordens_compra (numero, fornecedor_id, estado, data_emissao, data_prevista, moeda, observacoes,
                                 oc_raiz_id, oc_anterior_id, diferida, enviada_em, enviada_para)
  values (erp.proximo_numero('ordem_compra'), oc.fornecedor_id, 'confirmada', current_date, oc.data_prevista, oc.moeda,
          'Saldo em falta da ordem ' || oc.numero, coalesce(oc.oc_raiz_id, oc.id), oc.id, true, oc.enviada_em, oc.enviada_para)
  returning id into v_nova;

  for it in select * from erp.oc_itens where oc_id = p_oc_id and eliminado_em is null order by linha for update loop
    v_saldo := it.quantidade - it.quantidade_recebida - it.quantidade_diferida;
    continue when v_saldo <= 0;
    v_n := v_n + 1;
    insert into erp.oc_itens (oc_id, linha, produto_id, descricao, quantidade, custo_unitario,
                              data_prevista_item, necessidade_id, pedido_item_id, oc_item_origem_id)
    values (v_nova, v_n, it.produto_id, it.descricao, v_saldo, it.custo_unitario,
            it.data_prevista_item, it.necessidade_id, it.pedido_item_id, it.id);
    update erp.oc_itens set quantidade_diferida = quantidade_diferida + v_saldo where id = it.id;
    if it.necessidade_id is not null then
      update erp.necessidades_compra set oc_id = v_nova where id = it.necessidade_id;
    end if;
  end loop;
  if v_n = 0 then raise exception 'Não há saldo em falta nesta ordem.'; end if;

  update erp.ordens_compra set estado = 'recebida', data_recebida = current_date, oc_diferida_id = v_nova
   where id = p_oc_id;
  perform set_config('erp.motor', '', true);
  return v_nova;
end $$;

create or replace view erp.v_oc_cadeia with (security_invoker = true) as
select o.id, o.numero, o.estado, o.diferida, o.oc_raiz_id, o.oc_anterior_id, o.oc_diferida_id,
       coalesce(o.oc_raiz_id, o.id) as raiz_id,
       (select sum(i.quantidade - i.quantidade_diferida) from erp.oc_itens i where i.oc_id = o.id and i.eliminado_em is null) as quantidade_propria,
       (select sum(i.quantidade_recebida) from erp.oc_itens i where i.oc_id = o.id and i.eliminado_em is null) as quantidade_recebida,
       (select sum(i.quantidade_diferida) from erp.oc_itens i where i.oc_id = o.id and i.eliminado_em is null) as quantidade_diferida
  from erp.ordens_compra o where o.eliminado_em is null;
grant select on erp.v_oc_cadeia to authenticated;

revoke execute on all functions in schema erp from public, anon;
grant execute on all functions in schema erp to authenticated, service_role;
alter default privileges in schema erp revoke execute on functions from public;
alter default privileges in schema erp grant execute on functions to authenticated, service_role;

revoke execute on function erp.criar_op_interna(uuid, uuid[], integer, date, integer, text, uuid, text, uuid) from authenticated;
revoke execute on function erp.fabrica_outbox_reclamar(int) from authenticated;
revoke execute on function erp.fabrica_outbox_resultado(uuid, text, jsonb, text) from authenticated;
revoke execute on function erp.fabrica_registar_evento(jsonb) from authenticated;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'erp' and p.proname like 'tg\_%' loop
    execute format('revoke execute on function %s from authenticated', r.f);
  end loop;
end $$;