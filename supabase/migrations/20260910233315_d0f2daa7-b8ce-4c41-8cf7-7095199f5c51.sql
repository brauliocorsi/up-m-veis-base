-- 1. numeração das assistências
create sequence if not exists erp.seq_assistencia start 1;

create or replace function erp.proximo_numero(tipo text)
 returns text
 language plpgsql
 security definer
 set search_path to 'erp','public'
as $function$
declare n bigint; pre text;
begin
  case tipo
    when 'pedido' then n := nextval('erp.seq_pedido'); pre := 'PED';
    when 'orcamento' then n := nextval('erp.seq_orcamento'); pre := 'ORC';
    when 'ordem_compra' then n := nextval('erp.seq_ordem_compra'); pre := 'OC';
    when 'pedido_compra' then n := nextval('erp.seq_pedido_compra'); pre := 'PC';
    when 'recibo' then n := nextval('erp.seq_recibo'); pre := 'REC';
    when 'ordem_producao' then n := nextval('erp.seq_ordem_producao'); pre := 'OP';
    when 'assistencia' then n := nextval('erp.seq_assistencia'); pre := 'AST';
    else raise exception 'Tipo de documento desconhecido: %', tipo;
  end case;
  return pre || '-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
end $function$;

alter table erp.assistencias
  add column if not exists numero text,
  add column if not exists agendada_para date,
  add column if not exists agendamento_tipo text,
  add column if not exists rota_id uuid references erp.rotas(id),
  add column if not exists paragem_agendada_id uuid references erp.rota_paragens(id);

do $$
declare r record;
begin
  for r in select id from erp.assistencias where numero is null order by criado_em loop
    update erp.assistencias set numero = erp.proximo_numero('assistencia') where id = r.id;
  end loop;
end $$;

create unique index if not exists ux_assistencias_numero on erp.assistencias(numero);

create or replace function erp.tg_assistencia_numero()
returns trigger language plpgsql security definer set search_path to 'erp','public' as $$
begin
  if NEW.numero is null then NEW.numero := erp.proximo_numero('assistencia'); end if;
  return NEW;
end $$;

drop trigger if exists tg_assistencias_numero on erp.assistencias;
create trigger tg_assistencias_numero before insert on erp.assistencias
for each row execute function erp.tg_assistencia_numero();

alter table erp.assistencias
  drop constraint if exists ck_assistencias_agendamento_tipo;
alter table erp.assistencias
  add constraint ck_assistencias_agendamento_tipo
  check (agendamento_tipo is null or agendamento_tipo in ('servico','entrega'));

-- 2. peças consumidas na assistência
create table if not exists erp.assistencia_pecas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  assistencia_id uuid not null references erp.assistencias(id) on delete cascade,
  produto_id uuid not null references erp.produtos(id),
  quantidade integer not null check (quantidade > 0),
  motivo text,
  movimento_id bigint
);

grant select on erp.assistencia_pecas to authenticated;
grant all on erp.assistencia_pecas to service_role;
alter table erp.assistencia_pecas enable row level security;

drop policy if exists "assistencia_pecas_select" on erp.assistencia_pecas;
create policy "assistencia_pecas_select" on erp.assistencia_pecas
  for select to authenticated using (erp.is_ativo());

create index if not exists ix_assistencia_pecas_assistencia on erp.assistencia_pecas(assistencia_id);

-- 3. paragens de rota podem ser assistências
alter table erp.rota_paragens
  add column if not exists assistencia_id uuid references erp.assistencias(id),
  add column if not exists tipo text not null default 'entrega';

alter table erp.rota_paragens drop constraint if exists ck_rota_paragens_tipo;
alter table erp.rota_paragens
  add constraint ck_rota_paragens_tipo check (tipo in ('entrega','assistencia'));

-- 4. views
drop view if exists erp.v_assistencias;
create view erp.v_assistencias
with (security_invoker = true) as
select a.*,
       p.numero as pedido_numero,
       p.estado as pedido_estado,
       p.total as pedido_total,
       c.nome as cliente,
       c.telefone_e164 as cliente_telefone,
       p.morada_entrega,
       p.localidade_entrega,
       i.descricao as item_descricao,
       u.nome as aberta_por_nome,
       r.nome as rota_nome,
       r.data as rota_data,
       r.estado as rota_estado,
       coalesce(pc.n_pecas, 0) as n_pecas
  from erp.assistencias a
  join erp.pedidos p on p.id = a.pedido_id
  left join erp.clientes c on c.id = p.cliente_id
  left join erp.pedido_itens i on i.id = a.pedido_item_id
  left join erp.utilizadores u on u.id = a.aberta_por
  left join erp.rotas r on r.id = a.rota_id
  left join lateral (
    select sum(quantidade)::integer as n_pecas
      from erp.assistencia_pecas ap
     where ap.assistencia_id = a.id and ap.eliminado_em is null
  ) pc on true
 where a.eliminado_em is null;

grant select on erp.v_assistencias to authenticated;

create or replace view erp.v_assistencia_pecas
with (security_invoker = true) as
select ap.*, pr.nome_cliente as produto_nome, pr.cod_modelo as produto_codigo
  from erp.assistencia_pecas ap
  join erp.produtos pr on pr.id = ap.produto_id
 where ap.eliminado_em is null;

grant select on erp.v_assistencia_pecas to authenticated;

create or replace view erp.v_rota_paragens
with (security_invoker = true) as
 SELECT rp.id,
    rp.criado_em, rp.criado_por, rp.atualizado_em, rp.atualizado_por,
    rp.eliminado_em, rp.eliminado_por, rp.motivo_eliminacao,
    rp.rota_id, rp.pedido_id, rp.ordem, rp.previsto_receber, rp.desfecho,
    rp.data_reagendamento, rp.motivo_id, rp.motivo, rp.entrega_id, rp.concluida_em,
    r.data AS rota_data, r.nome AS rota_nome, r.estado AS rota_estado, r.responsavel_id,
    p.numero AS pedido_numero, p.estado AS pedido_estado, p.total, p.total_pago,
    erp.por_registar_pedido(p.id) AS pendente,
    p.morada_entrega, p.localidade_entrega, p.cp4_entrega, p.cp3_entrega,
    p.contacto_entrega, p.notas_entrega, p.entrega_domicilio,
    c.nome AS cliente, c.telefone_e164 AS cliente_telefone, c.telefone_alt AS cliente_telefone_alt,
    m.descricao AS motivo_descricao,
    rp.excedeu_capacidade,
    COALESCE(it.n_itens, 0) AS n_itens,
    COALESCE(it.n_montagens, 0) AS n_montagens,
    COALESCE(p.desconto_entrega, 0::numeric) AS desconto_entrega,
    rp.tipo,
    rp.assistencia_id,
    a.numero AS assistencia_numero,
    a.motivo AS assistencia_motivo,
    a.descricao AS assistencia_descricao,
    a.estado AS assistencia_estado
   FROM erp.rota_paragens rp
     JOIN erp.rotas r ON r.id = rp.rota_id
     JOIN erp.pedidos p ON p.id = rp.pedido_id
     LEFT JOIN erp.assistencias a ON a.id = rp.assistencia_id
     LEFT JOIN erp.clientes c ON c.id = p.cliente_id
     LEFT JOIN erp.motivos m ON m.id = rp.motivo_id
     LEFT JOIN LATERAL ( SELECT sum(pe.qt_por_entregar)::integer AS n_itens,
            sum(CASE WHEN i.montagem_incluida THEN pe.qt_por_entregar ELSE 0 END)::integer AS n_montagens
           FROM erp.v_pedido_entrega pe
             JOIN erp.pedido_itens i ON i.id = pe.pedido_item_id
          WHERE pe.pedido_id = p.id AND pe.qt_por_entregar > 0) it ON true
  WHERE rp.eliminado_em IS NULL;

-- 5. baixa de stock por peça de assistência
create or replace function erp.consumir_peca_assistencia(
  p_assistencia_id uuid,
  p_produto_id uuid,
  p_quantidade integer,
  p_motivo text default null
) returns uuid
language plpgsql security definer set search_path to 'erp','public' as $$
declare v_id uuid; v_mov bigint; v_num text;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio','financeiro') then
    raise exception 'Só o escritório ou a Administração dão baixa de peças.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Indique uma quantidade maior que zero.';
  end if;
  select numero into v_num from erp.assistencias
   where id = p_assistencia_id and eliminado_em is null;
  if v_num is null then raise exception 'Assistência não encontrada.'; end if;

  insert into erp.stock_movimentos
    (produto_id, tipo, quantidade, origem, chave_idempotencia, documento_tipo, documento_id,
     motivo, ocorrido_em, registado_por)
  values
    (p_produto_id, 'saida', -p_quantidade, 'assistencia',
     'assistencia:' || p_assistencia_id::text || ':' || gen_random_uuid()::text,
     'assistencia', p_assistencia_id,
     coalesce(nullif(trim(coalesce(p_motivo,'')),''), 'Peça para assistência ' || v_num),
     now(), auth.uid())
  returning id into v_mov;

  insert into erp.assistencia_pecas
    (assistencia_id, produto_id, quantidade, motivo, movimento_id, criado_por)
  values (p_assistencia_id, p_produto_id, p_quantidade,
          nullif(trim(coalesce(p_motivo,'')),''), v_mov, erp.utilizador_atual())
  returning id into v_id;

  return v_id;
end $$;

-- 6. agendar assistência (serviço) e/ou colocar numa rota
create or replace function erp.agendar_assistencia(
  p_assistencia_id uuid,
  p_data date,
  p_tipo text default 'servico'
) returns void
language plpgsql security definer set search_path to 'erp','public' as $$
begin
  if erp.perfil_atual()::text not in ('adm','escritorio','financeiro') then
    raise exception 'Só o escritório ou a Administração agendam assistências.';
  end if;
  if p_tipo not in ('servico','entrega') then
    raise exception 'Tipo de agendamento inválido.';
  end if;
  update erp.assistencias
     set agendada_para = p_data,
         agendamento_tipo = p_tipo,
         estado = case when estado in ('resolvida','cancelada') then estado else 'agendada' end
   where id = p_assistencia_id and eliminado_em is null;
  if not found then raise exception 'Assistência não encontrada.'; end if;
end $$;

create or replace function erp.agendar_assistencia_rota(
  p_assistencia_id uuid,
  p_rota_id uuid
) returns uuid
language plpgsql security definer set search_path to 'erp','public' as $$
declare v_a record; v_rota record; v_ordem integer; v_paragem uuid;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio','financeiro') then
    raise exception 'Só o escritório ou a Administração agendam assistências em rota.';
  end if;
  select * into v_a from erp.assistencias where id = p_assistencia_id and eliminado_em is null;
  if v_a.id is null then raise exception 'Assistência não encontrada.'; end if;
  select * into v_rota from erp.rotas where id = p_rota_id and eliminado_em is null;
  if v_rota.id is null then raise exception 'Rota não encontrada.'; end if;
  if v_rota.estado not in ('planeada','em_curso') then
    raise exception 'A rota já está fechada.';
  end if;
  if exists (select 1 from erp.rota_paragens
              where assistencia_id = p_assistencia_id and eliminado_em is null
                and concluida_em is null) then
    raise exception 'Esta assistência já está numa rota.';
  end if;

  select coalesce(max(ordem), 0) + 1 into v_ordem
    from erp.rota_paragens where rota_id = p_rota_id and eliminado_em is null;

  insert into erp.rota_paragens
    (rota_id, pedido_id, assistencia_id, tipo, ordem, previsto_receber, criado_por)
  values (p_rota_id, v_a.pedido_id, p_assistencia_id, 'assistencia', v_ordem, 0, erp.utilizador_atual())
  returning id into v_paragem;

  update erp.assistencias
     set rota_id = p_rota_id,
         paragem_agendada_id = v_paragem,
         agendamento_tipo = 'entrega',
         agendada_para = coalesce(v_rota.data, agendada_para),
         estado = case when estado in ('resolvida','cancelada') then estado else 'agendada' end
   where id = p_assistencia_id;

  return v_paragem;
end $$;

create or replace function erp.concluir_paragem_assistencia(
  p_paragem_id uuid,
  p_resolvida boolean,
  p_nota text default null
) returns void
language plpgsql security definer set search_path to 'erp','public' as $$
declare v_p record; v_rota record;
begin
  select * into v_p from erp.rota_paragens
   where id = p_paragem_id and eliminado_em is null and tipo = 'assistencia';
  if v_p.id is null then raise exception 'Paragem de assistência não encontrada.'; end if;
  select * into v_rota from erp.rotas where id = v_p.rota_id;
  if erp.perfil_atual()::text not in ('adm','escritorio','financeiro')
     and v_rota.responsavel_id is distinct from erp.utilizador_atual() then
    raise exception 'Não tem acesso a esta paragem.';
  end if;

  update erp.rota_paragens
     set desfecho = case when p_resolvida then 'entregue' else 'nao_entregue' end,
         motivo = nullif(trim(coalesce(p_nota,'')),''),
         concluida_em = now(),
         atualizado_em = now(),
         atualizado_por = erp.utilizador_atual()
   where id = p_paragem_id;

  update erp.assistencias
     set estado = case when p_resolvida then 'resolvida' else 'em_analise' end,
         nota_resolucao = coalesce(nullif(trim(coalesce(p_nota,'')),''), nota_resolucao),
         resolvida_em = case when p_resolvida then now() else null end,
         atualizado_em = now(),
         atualizado_por = erp.utilizador_atual()
   where id = v_p.assistencia_id;
end $$;

grant execute on function erp.consumir_peca_assistencia(uuid, uuid, integer, text) to authenticated;
grant execute on function erp.agendar_assistencia(uuid, date, text) to authenticated;
grant execute on function erp.agendar_assistencia_rota(uuid, uuid) to authenticated;
grant execute on function erp.concluir_paragem_assistencia(uuid, boolean, text) to authenticated;