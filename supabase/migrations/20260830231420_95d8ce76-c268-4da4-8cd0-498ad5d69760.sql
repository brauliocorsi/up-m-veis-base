-- 1. tipos de movimento de caixa
alter table erp.caixa_movimentos drop constraint caixa_movimentos_tipo_check;
alter table erp.caixa_movimentos add constraint caixa_movimentos_tipo_check
  check (tipo = any (array['recebimento','saida','sangria','abertura','entrada','envelope_rota']));

-- 2. contexto de motivos para entradas
alter table erp.motivos drop constraint motivos_contexto_check;
alter table erp.motivos add constraint motivos_contexto_check
  check (contexto = any (array['cancelamento','alteracao_data','eliminacao','saida_caixa',
    'desconto_excecional','reabertura','nao_entrega','reagendamento','saida_rota','assistencia',
    'entrada_caixa']));

insert into erp.motivos (contexto, descricao, ordem, ativo)
values ('entrada_caixa','Reforço de caixa',1,true),
       ('entrada_caixa','Envelope de rota',2,true),
       ('entrada_caixa','Correção de contagem',3,true),
       ('entrada_caixa','Outra entrada',4,true);

-- 3. conciliação do envelope da rota
alter table erp.rotas
  add column if not exists envelope_recebido_em timestamptz,
  add column if not exists envelope_recebido_por uuid,
  add column if not exists envelope_caixa_id uuid references erp.caixas(id);

-- 4. entrada manual de dinheiro no caixa do dia
create or replace function erp.registar_entrada_caixa(
  p_valor numeric,
  p_motivo_id uuid default null,
  p_descricao text default null,
  p_comprovativo_url text default null
) returns uuid
language plpgsql
security definer
set search_path = erp, public
as $$
declare v_caixa uuid; v_id uuid;
begin
  if erp.perfil_atual()::text not in ('adm','financeiro','escritorio') then
    raise exception 'Só a Administração, o Financeiro ou o Escritório registam entradas de caixa.';
  end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Indique o valor da entrada.'; end if;
  if p_motivo_id is null and coalesce(trim(coalesce(p_descricao,'')),'') = '' then
    raise exception 'Indique o motivo ou uma descrição da entrada.';
  end if;
  v_caixa := erp.caixa_aberto(erp.utilizador_atual());
  if v_caixa is null then raise exception 'Abra o caixa do dia antes de registar entradas.'; end if;
  insert into erp.caixa_movimentos (caixa_id, tipo, valor, sentido, motivo_id, descricao,
    comprovativo_url, forma_id)
  values (v_caixa, 'entrada', round(p_valor, 2), 1, p_motivo_id, p_descricao, p_comprovativo_url,
    (select id from erp.formas_pagamento where codigo = 'DINHEIRO'))
  returning id into v_id;
  return v_id;
end $$;

-- 5. dar entrada do envelope de uma rota conferida no caixa do escritório
create or replace function erp.receber_envelope_rota(
  p_rota_id uuid,
  p_valor numeric default null
) returns uuid
language plpgsql
security definer
set search_path = erp, public
as $$
declare r erp.rotas%rowtype; v_caixa uuid; v_id uuid; v_valor numeric(12,2);
begin
  if erp.perfil_atual()::text not in ('adm','financeiro') then
    raise exception 'Só o Financeiro ou a Administração dão entrada dos envelopes.';
  end if;
  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado <> 'conferida' then
    raise exception 'Confira o envelope da rota antes de dar entrada no caixa.';
  end if;
  if r.envelope_recebido_em is not null then
    raise exception 'O envelope desta rota já entrou no caixa.';
  end if;
  v_valor := round(coalesce(p_valor, r.valor_conferido, r.valor_envelope, 0), 2);
  if v_valor <= 0 then raise exception 'O envelope não tem dinheiro para dar entrada.'; end if;
  v_caixa := erp.caixa_aberto(erp.utilizador_atual());
  if v_caixa is null then raise exception 'Abra o caixa do dia antes de receber envelopes.'; end if;
  insert into erp.caixa_movimentos (caixa_id, tipo, valor, sentido, descricao, forma_id)
  values (v_caixa, 'envelope_rota', v_valor, 1,
    'Envelope da rota ' || r.nome || ' (' || to_char(r.data, 'DD/MM/YYYY') || ')',
    (select id from erp.formas_pagamento where codigo = 'DINHEIRO'))
  returning id into v_id;
  update erp.rotas set envelope_recebido_em = now(), envelope_recebido_por = auth.uid(),
    envelope_caixa_id = v_caixa
   where id = p_rota_id;
  return v_id;
end $$;

grant execute on function erp.registar_entrada_caixa(numeric, uuid, text, text) to authenticated;
grant execute on function erp.receber_envelope_rota(uuid, numeric) to authenticated;

-- 6. lista de envelopes por conciliar
create or replace view erp.v_envelopes_rota
with (security_invoker = true) as
select r.id as rota_id, r.data, r.nome, r.estado, r.responsavel_id,
  u.nome as responsavel,
  r.valor_envelope, r.valor_conferido, r.diferenca, r.justificacao_diferenca,
  r.fechada_em, r.conferida_em, r.envelope_recebido_em, r.envelope_caixa_id,
  (r.estado = 'conferida' and r.envelope_recebido_em is null) as por_receber
from erp.rotas r
left join erp.utilizadores u on u.id = r.responsavel_id
where r.eliminado_em is null and r.estado in ('fechada','conferida')
order by r.data desc;

grant select on erp.v_envelopes_rota to authenticated;