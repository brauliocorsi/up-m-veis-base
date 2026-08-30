-- ============================================================== tabelas
create table erp.caixas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  utilizador_id uuid not null references erp.utilizadores(id),
  data date not null default current_date,
  estado text not null default 'aberto' check (estado in ('aberto','fechado')),
  saldo_abertura numeric(12,2) not null default 0,
  saldo_esperado numeric(12,2) not null default 0,
  saldo_contado numeric(12,2),
  diferenca numeric(12,2),
  justificacao_diferenca text,
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz,
  fechado_por uuid,
  reaberto_em timestamptz,
  reaberto_por uuid,
  motivo_reabertura text
);
create unique index ux_caixas_dia on erp.caixas (utilizador_id, data) where eliminado_em is null;
create index ix_caixas_utilizador on erp.caixas (utilizador_id, data desc);

create table erp.pagamentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_id uuid not null references erp.pedidos(id),
  forma_id uuid not null references erp.formas_pagamento(id),
  valor numeric(12,2) not null check (valor > 0),
  taxa_pct numeric(5,2) not null default 0,
  valor_liquido numeric(12,2) not null default 0,
  estado text not null default 'pendente'
    check (estado in ('pendente','pendente_confirmacao','confirmado','rejeitado','devolvido')),
  data_prevista date,
  data_confirmacao timestamptz,
  confirmado_por uuid,
  motivo_rejeicao text,
  referencia text,
  comprovativo_url text,
  recebido_por uuid references erp.utilizadores(id),
  caixa_id uuid references erp.caixas(id),
  observacoes text
);
create index ix_pagamentos_pedido on erp.pagamentos (pedido_id);
create index ix_pagamentos_pendentes on erp.pagamentos (estado) where estado <> 'confirmado';

create table erp.caixa_movimentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  caixa_id uuid not null references erp.caixas(id),
  tipo text not null check (tipo in ('recebimento','saida','sangria','abertura')),
  forma_id uuid references erp.formas_pagamento(id),
  valor numeric(12,2) not null check (valor > 0),
  sentido int not null default 1 check (sentido in (1,-1)),
  pagamento_id uuid references erp.pagamentos(id),
  pedido_id uuid references erp.pedidos(id),
  motivo_id uuid references erp.motivos(id),
  descricao text,
  comprovativo_url text
);
create index ix_caixa_mov_caixa on erp.caixa_movimentos (caixa_id, criado_em);

alter table erp.pedidos add column estado_pagamento text
  generated always as (
    case when total_pago > total then 'em_divergencia'
         when total_pago <= 0 then 'por_pagar'
         when total_pago >= total then 'pago'
         else 'parcial' end) stored;

-- ============================================================== helpers
create or replace function erp.caixa_aberto(p_utilizador uuid)
returns uuid language sql stable security definer set search_path to 'erp','public' as $$
  select c.id from erp.caixas c
  where c.utilizador_id = p_utilizador and c.estado = 'aberto' and c.eliminado_em is null
  order by c.data desc limit 1
$$;

create or replace function erp.recalcular_caixa(p_caixa_id uuid)
returns void language plpgsql security definer set search_path to 'erp','public' as $$
declare v numeric(12,2) := 0; ab numeric(12,2) := 0;
begin
  select saldo_abertura into ab from erp.caixas where id = p_caixa_id;
  if ab is null then return; end if;
  select coalesce(sum(m.valor * m.sentido), 0) into v
  from erp.caixa_movimentos m
  left join erp.formas_pagamento f on f.id = m.forma_id
  where m.caixa_id = p_caixa_id and m.eliminado_em is null
    and (m.tipo in ('saida','sangria') or coalesce(f.codigo, '') = 'DINHEIRO');
  update erp.caixas set saldo_esperado = ab + v where id = p_caixa_id;
end $$;

create or replace function erp.recalcular_total_pago(p_pedido_id uuid)
returns void language plpgsql security definer set search_path to 'erp','public' as $$
declare v numeric(12,2) := 0;
begin
  select coalesce(sum(valor), 0) into v from erp.pagamentos
  where pedido_id = p_pedido_id and estado = 'confirmado' and eliminado_em is null;
  perform set_config('erp.recalculo', '1', true);
  perform set_config('erp.motor', '1', true);
  update erp.pedidos set total_pago = v where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);
end $$;

-- ============================================================== triggers pagamentos
create or replace function erp.tg_pagamentos_registar()
returns trigger language plpgsql security definer set search_path to 'erp','public' as $$
declare f erp.formas_pagamento%rowtype; ped erp.pedidos%rowtype;
        v_soma numeric(12,2) := 0; v_livre numeric(12,2) := 0; v_caixa uuid;
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

  NEW.caixa_id := null;
  if f.entra_caixa and NEW.estado = 'confirmado' then
    v_caixa := erp.caixa_aberto(NEW.recebido_por);
    if v_caixa is null then
      raise exception 'Abra o caixa do dia antes de registar recebimentos em dinheiro.';
    end if;
    NEW.caixa_id := v_caixa;
  end if;
  return NEW;
end $$;

create or replace function erp.tg_pagamentos_alterar()
returns trigger language plpgsql security definer set search_path to 'erp','public' as $$
begin
  if coalesce(current_setting('erp.motor', true), '') <> '1' then
    raise exception 'Os pagamentos não podem ser alterados diretamente. Use confirmar, rejeitar ou devolver.';
  end if;
  NEW.pedido_id := OLD.pedido_id;
  NEW.forma_id := OLD.forma_id;
  NEW.valor := OLD.valor;
  NEW.taxa_pct := OLD.taxa_pct;
  NEW.valor_liquido := OLD.valor_liquido;
  return NEW;
end $$;

create or replace function erp.tg_pagamentos_bloquear_delete()
returns trigger language plpgsql set search_path to 'erp','public' as $$
begin
  raise exception 'Os pagamentos não podem ser eliminados. Registe uma devolução com motivo.';
end $$;

create or replace function erp.tg_pagamentos_caixa()
returns trigger language plpgsql security definer set search_path to 'erp','public' as $$
declare f erp.formas_pagamento%rowtype; v_caixa uuid; v_est text;
begin
  select * into f from erp.formas_pagamento where id = NEW.forma_id;

  if NEW.estado = 'confirmado' and f.entra_caixa then
    if not exists (select 1 from erp.caixa_movimentos
                   where pagamento_id = NEW.id and tipo = 'recebimento') then
      v_caixa := NEW.caixa_id;
      select estado into v_est from erp.caixas where id = v_caixa;
      if v_caixa is null or v_est <> 'aberto' then
        v_caixa := erp.caixa_aberto(NEW.recebido_por);
      end if;
      if v_caixa is null then
        raise exception 'Abra o caixa do dia antes de registar recebimentos em dinheiro.';
      end if;
      insert into erp.caixa_movimentos
        (caixa_id, tipo, forma_id, valor, sentido, pagamento_id, pedido_id, descricao)
      values (v_caixa, 'recebimento', NEW.forma_id, NEW.valor, 1, NEW.id, NEW.pedido_id,
              (select numero from erp.pedidos where id = NEW.pedido_id));
    end if;
  end if;

  if TG_OP = 'UPDATE' and NEW.estado = 'devolvido' and f.entra_caixa
     and exists (select 1 from erp.caixa_movimentos
                 where pagamento_id = NEW.id and tipo = 'recebimento')
     and not exists (select 1 from erp.caixa_movimentos
                     where pagamento_id = NEW.id and tipo = 'saida') then
    v_caixa := NEW.caixa_id;
    select estado into v_est from erp.caixas where id = v_caixa;
    if v_caixa is null or v_est <> 'aberto' then
      v_caixa := erp.caixa_aberto(NEW.recebido_por);
    end if;
    if v_caixa is null then
      raise exception 'Abra o caixa do dia antes de devolver um pagamento em dinheiro.';
    end if;
    insert into erp.caixa_movimentos
      (caixa_id, tipo, forma_id, valor, sentido, pagamento_id, pedido_id, descricao)
    values (v_caixa, 'saida', NEW.forma_id, NEW.valor, -1, NEW.id, NEW.pedido_id,
            'Devolução de pagamento ' || coalesce(NEW.motivo_rejeicao, ''));
  end if;

  perform erp.recalcular_total_pago(NEW.pedido_id);
  return NEW;
end $$;

-- ============================================================== triggers caixa
create or replace function erp.tg_caixa_mov_validar()
returns trigger language plpgsql security definer set search_path to 'erp','public' as $$
declare c erp.caixas%rowtype;
begin
  select * into c from erp.caixas where id = NEW.caixa_id and eliminado_em is null;
  if not found then raise exception 'O caixa indicado não existe.'; end if;
  if c.estado <> 'aberto' then
    raise exception 'O caixa de % já está fechado. Nenhum movimento novo pode entrar.',
      to_char(c.data, 'DD/MM/YYYY');
  end if;
  if NEW.tipo in ('saida','sangria') then
    NEW.sentido := -1;
    if NEW.motivo_id is null then
      raise exception 'Indique o motivo da saída de caixa.';
    end if;
  else
    NEW.sentido := 1;
  end if;
  return NEW;
end $$;

create or replace function erp.tg_caixa_mov_bloquear()
returns trigger language plpgsql set search_path to 'erp','public' as $$
begin
  raise exception 'Os movimentos de caixa não podem ser alterados nem eliminados. Registe um movimento de correção.';
end $$;

create or replace function erp.tg_caixa_mov_recalcular()
returns trigger language plpgsql security definer set search_path to 'erp','public' as $$
begin
  perform erp.recalcular_caixa(NEW.caixa_id);
  return NEW;
end $$;

create trigger t_caixas_campos before insert or update on erp.caixas
  for each row execute function erp.tg_campos_auditoria();
create trigger t_caixas_aud after insert or update on erp.caixas
  for each row execute function erp.tg_auditoria();

create trigger t_pagamentos_campos before insert or update on erp.pagamentos
  for each row execute function erp.tg_campos_auditoria();
create trigger t_pagamentos_registar before insert on erp.pagamentos
  for each row execute function erp.tg_pagamentos_registar();
create trigger t_pagamentos_alterar before update on erp.pagamentos
  for each row execute function erp.tg_pagamentos_alterar();
create trigger t_pagamentos_del before delete on erp.pagamentos
  for each row execute function erp.tg_pagamentos_bloquear_delete();
create trigger t_pagamentos_aud after insert or update on erp.pagamentos
  for each row execute function erp.tg_auditoria();
create trigger t_pagamentos_caixa after insert or update on erp.pagamentos
  for each row execute function erp.tg_pagamentos_caixa();

create trigger t_caixa_mov_campos before insert on erp.caixa_movimentos
  for each row execute function erp.tg_campos_auditoria();
create trigger t_caixa_mov_validar before insert on erp.caixa_movimentos
  for each row execute function erp.tg_caixa_mov_validar();
create trigger t_caixa_mov_bloquear before update or delete on erp.caixa_movimentos
  for each row execute function erp.tg_caixa_mov_bloquear();
create trigger t_caixa_mov_aud after insert on erp.caixa_movimentos
  for each row execute function erp.tg_auditoria();
create trigger t_caixa_mov_recalcular after insert on erp.caixa_movimentos
  for each row execute function erp.tg_caixa_mov_recalcular();

-- ============================================================== operações
create or replace function erp.abrir_caixa(p_saldo_inicial numeric default null)
returns uuid language plpgsql security definer set search_path to 'erp','public' as $$
declare v_user uuid; v_id uuid; v_est text; v_ab numeric(12,2);
begin
  v_user := erp.utilizador_atual();
  if v_user is null then raise exception 'Sessão inválida.'; end if;
  select id, estado into v_id, v_est from erp.caixas
  where utilizador_id = v_user and data = current_date and eliminado_em is null;
  if v_id is not null then
    if v_est = 'aberto' then return v_id; end if;
    raise exception 'O caixa de hoje já foi fechado. Só um administrador o pode reabrir.';
  end if;
  select saldo_contado into v_ab from erp.caixas
  where utilizador_id = v_user and estado = 'fechado' and eliminado_em is null
    and saldo_contado is not null
  order by data desc limit 1;
  if v_ab is null then
    if p_saldo_inicial is null then
      raise exception 'É o primeiro caixa desta pessoa. Um administrador tem de definir o saldo inicial.';
    end if;
    if not erp.is_adm() then
      raise exception 'Só um administrador pode definir o saldo inicial do primeiro caixa.';
    end if;
    v_ab := round(p_saldo_inicial, 2);
  end if;
  insert into erp.caixas (utilizador_id, data, saldo_abertura, saldo_esperado)
  values (v_user, current_date, v_ab, v_ab)
  returning id into v_id;
  return v_id;
end $$;

create or replace function erp.fechar_caixa(p_caixa_id uuid, p_saldo_contado numeric,
  p_justificacao text default null)
returns jsonb language plpgsql security definer set search_path to 'erp','public' as $$
declare c erp.caixas%rowtype; v_dif numeric(12,2);
begin
  select * into c from erp.caixas where id = p_caixa_id and eliminado_em is null for update;
  if not found then raise exception 'Caixa não encontrado.'; end if;
  if c.estado <> 'aberto' then raise exception 'Este caixa já está fechado.'; end if;
  if c.utilizador_id <> erp.utilizador_atual() and not erp.is_adm() then
    raise exception 'Só pode fechar o seu próprio caixa.';
  end if;
  if p_saldo_contado is null then raise exception 'Indique o dinheiro contado.'; end if;
  perform erp.recalcular_caixa(p_caixa_id);
  select * into c from erp.caixas where id = p_caixa_id;
  v_dif := round(p_saldo_contado, 2) - c.saldo_esperado;
  if v_dif <> 0 and coalesce(trim(p_justificacao), '') = '' then
    raise exception 'Há uma diferença de % €. Escreva a justificação para fechar o caixa.',
      to_char(v_dif, 'FM999999990.00');
  end if;
  update erp.caixas set estado = 'fechado', saldo_contado = round(p_saldo_contado, 2),
    diferenca = v_dif, justificacao_diferenca = nullif(trim(coalesce(p_justificacao, '')), ''),
    fechado_em = now(), fechado_por = auth.uid()
  where id = p_caixa_id;
  return jsonb_build_object('esperado', c.saldo_esperado,
    'contado', round(p_saldo_contado, 2), 'diferenca', v_dif);
end $$;

create or replace function erp.reabrir_caixa(p_caixa_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'erp','public' as $$
begin
  if not erp.is_adm() then raise exception 'Só um administrador pode reabrir um caixa.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escreva o motivo da reabertura.'; end if;
  update erp.caixas set estado = 'aberto', fechado_em = null, fechado_por = null,
    reaberto_em = now(), reaberto_por = auth.uid(), motivo_reabertura = p_motivo
  where id = p_caixa_id and eliminado_em is null and estado = 'fechado';
  if not found then raise exception 'Este caixa não está fechado.'; end if;
  perform erp.recalcular_caixa(p_caixa_id);
end $$;

create or replace function erp.registar_saida_caixa(p_valor numeric, p_motivo_id uuid,
  p_descricao text default null, p_comprovativo_url text default null)
returns uuid language plpgsql security definer set search_path to 'erp','public' as $$
declare v_caixa uuid; v_id uuid;
begin
  if coalesce(p_valor, 0) <= 0 then raise exception 'Indique o valor da saída.'; end if;
  v_caixa := erp.caixa_aberto(erp.utilizador_atual());
  if v_caixa is null then raise exception 'Abra o caixa do dia antes de registar saídas.'; end if;
  insert into erp.caixa_movimentos (caixa_id, tipo, valor, sentido, motivo_id, descricao,
    comprovativo_url, forma_id)
  values (v_caixa, 'saida', round(p_valor, 2), -1, p_motivo_id, p_descricao, p_comprovativo_url,
    (select id from erp.formas_pagamento where codigo = 'DINHEIRO'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function erp.registar_sangria(p_caixa_id uuid, p_valor numeric,
  p_motivo_id uuid, p_descricao text default null)
returns uuid language plpgsql security definer set search_path to 'erp','public' as $$
declare v_id uuid;
begin
  if not erp.is_adm() then raise exception 'Só um administrador pode fazer sangrias.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Indique o valor da sangria.'; end if;
  insert into erp.caixa_movimentos (caixa_id, tipo, valor, sentido, motivo_id, descricao, forma_id)
  values (p_caixa_id, 'sangria', round(p_valor, 2), -1, p_motivo_id, p_descricao,
    (select id from erp.formas_pagamento where codigo = 'DINHEIRO'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function erp.registar_pagamento(p_pedido_id uuid, p_forma_id uuid,
  p_valor numeric, p_referencia text default null, p_comprovativo_url text default null,
  p_data_prevista date default null, p_observacoes text default null)
returns uuid language plpgsql security definer set search_path to 'erp','public' as $$
declare v_id uuid;
begin
  if coalesce(p_valor, 0) <= 0 then raise exception 'Indique o valor do pagamento.'; end if;
  insert into erp.pagamentos (pedido_id, forma_id, valor, referencia, comprovativo_url,
    data_prevista, observacoes)
  values (p_pedido_id, p_forma_id, round(p_valor, 2), nullif(trim(coalesce(p_referencia,'')),''),
    nullif(trim(coalesce(p_comprovativo_url,'')),''), p_data_prevista,
    nullif(trim(coalesce(p_observacoes,'')),''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function erp.confirmar_pagamento(p_pagamento_id uuid,
  p_comprovativo_url text default null)
returns void language plpgsql security definer set search_path to 'erp','public' as $$
declare pag erp.pagamentos%rowtype; f erp.formas_pagamento%rowtype;
        v_comp text; v_caixa uuid;
begin
  select * into pag from erp.pagamentos where id = p_pagamento_id and eliminado_em is null for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if pag.estado = 'confirmado' then raise exception 'Este pagamento já está confirmado.'; end if;
  if pag.estado in ('rejeitado','devolvido') then
    raise exception 'Este pagamento já foi encerrado e não pode ser confirmado.';
  end if;
  select * into f from erp.formas_pagamento where id = pag.forma_id;
  v_comp := coalesce(nullif(trim(coalesce(p_comprovativo_url,'')),''), pag.comprovativo_url);
  if f.exige_comprovativo and coalesce(v_comp, '') = '' then
    raise exception 'A forma "%" exige comprovativo. Anexe-o antes de confirmar.', f.nome;
  end if;
  v_caixa := pag.caixa_id;
  if f.entra_caixa then
    v_caixa := erp.caixa_aberto(pag.recebido_por);
    if v_caixa is null then
      raise exception 'Abra o caixa do dia antes de registar recebimentos em dinheiro.';
    end if;
  end if;
  perform set_config('erp.motor', '1', true);
  update erp.pagamentos set estado = 'confirmado', data_confirmacao = now(),
    confirmado_por = auth.uid(), comprovativo_url = v_comp, caixa_id = v_caixa,
    motivo_rejeicao = null
  where id = p_pagamento_id;
  perform set_config('erp.motor', '', true);
end $$;

create or replace function erp.rejeitar_pagamento(p_pagamento_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'erp','public' as $$
declare pag erp.pagamentos%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escreva o motivo da rejeição.'; end if;
  select * into pag from erp.pagamentos where id = p_pagamento_id and eliminado_em is null for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if pag.estado = 'confirmado' then
    raise exception 'Este pagamento já está confirmado. Registe uma devolução com motivo.';
  end if;
  perform set_config('erp.motor', '1', true);
  update erp.pagamentos set estado = 'rejeitado', motivo_rejeicao = p_motivo
  where id = p_pagamento_id;
  perform set_config('erp.motor', '', true);
end $$;

create or replace function erp.devolver_pagamento(p_pagamento_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'erp','public' as $$
declare pag erp.pagamentos%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escreva o motivo da devolução.'; end if;
  select * into pag from erp.pagamentos where id = p_pagamento_id and eliminado_em is null for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if pag.estado <> 'confirmado' then
    raise exception 'Só pagamentos confirmados podem ser devolvidos.';
  end if;
  if erp.perfil_atual() not in ('adm','financeiro','escritorio') then
    raise exception 'Só o escritório, o financeiro ou um administrador podem devolver pagamentos.';
  end if;
  perform set_config('erp.motor', '1', true);
  update erp.pagamentos set estado = 'devolvido', motivo_rejeicao = p_motivo
  where id = p_pagamento_id;
  perform set_config('erp.motor', '', true);
end $$;

-- ============================================================== views
create view erp.v_pagamentos with (security_invoker = true) as
  select pg.*, f.nome as forma_nome, f.codigo as forma_codigo,
         f.exige_comprovativo, f.entra_caixa, f.momento as forma_momento,
         f.prazo_confirmacao_horas,
         p.numero as pedido_numero, p.total as pedido_total, p.estado as pedido_estado,
         c.nome as cliente_nome, u.nome as recebido_por_nome,
         (pg.estado in ('pendente','pendente_confirmacao')
           and f.prazo_confirmacao_horas is not null
           and pg.criado_em < now() - (f.prazo_confirmacao_horas || ' hours')::interval) as em_atraso
  from erp.pagamentos pg
  join erp.formas_pagamento f on f.id = pg.forma_id
  join erp.pedidos p on p.id = pg.pedido_id
  join erp.clientes c on c.id = p.cliente_id
  left join erp.utilizadores u on u.id = pg.recebido_por
  where pg.eliminado_em is null;

create view erp.v_caixa_movimentos with (security_invoker = true) as
  select m.*, f.nome as forma_nome, f.codigo as forma_codigo,
         p.numero as pedido_numero, cl.nome as cliente_nome,
         mo.descricao as motivo_descricao,
         cx.data as caixa_data, cx.utilizador_id, u.nome as utilizador_nome,
         (p.criado_em::date < cx.data) as de_dia_anterior
  from erp.caixa_movimentos m
  join erp.caixas cx on cx.id = m.caixa_id
  left join erp.utilizadores u on u.id = cx.utilizador_id
  left join erp.formas_pagamento f on f.id = m.forma_id
  left join erp.pedidos p on p.id = m.pedido_id
  left join erp.clientes cl on cl.id = p.cliente_id
  left join erp.motivos mo on mo.id = m.motivo_id
  where m.eliminado_em is null;

create view erp.v_caixas with (security_invoker = true) as
  select c.*, u.nome as utilizador_nome,
         coalesce(t.dinheiro, 0) as total_dinheiro,
         coalesce(t.multibanco, 0) as total_multibanco,
         coalesce(t.mbway, 0) as total_mbway,
         coalesce(t.transferencia, 0) as total_transferencia,
         coalesce(t.saidas, 0) as total_saidas,
         coalesce(t.sangrias, 0) as total_sangrias,
         coalesce(t.n_movimentos, 0) as n_movimentos
  from erp.caixas c
  left join erp.utilizadores u on u.id = c.utilizador_id
  left join lateral (
    select
      sum(case when m.tipo = 'recebimento' and f.codigo = 'DINHEIRO' then m.valor else 0 end) as dinheiro,
      sum(case when m.tipo = 'recebimento' and f.codigo = 'MULTIBANCO' then m.valor else 0 end) as multibanco,
      sum(case when m.tipo = 'recebimento' and f.codigo = 'MBWAY' then m.valor else 0 end) as mbway,
      sum(case when m.tipo = 'recebimento' and f.codigo = 'TRANSFERENCIA' then m.valor else 0 end) as transferencia,
      sum(case when m.tipo = 'saida' then m.valor else 0 end) as saidas,
      sum(case when m.tipo = 'sangria' then m.valor else 0 end) as sangrias,
      count(*) as n_movimentos
    from erp.caixa_movimentos m
    left join erp.formas_pagamento f on f.id = m.forma_id
    where m.caixa_id = c.id and m.eliminado_em is null
  ) t on true
  where c.eliminado_em is null;

-- ============================================================== RLS
alter table erp.caixas enable row level security;
alter table erp.pagamentos enable row level security;
alter table erp.caixa_movimentos enable row level security;

create policy caixas_sel on erp.caixas for select to authenticated
  using (erp.is_ativo() and (utilizador_id = erp.utilizador_atual()
         or erp.perfil_atual() in ('adm','financeiro')));

create policy pagamentos_sel on erp.pagamentos for select to authenticated
  using (erp.is_ativo() and (
    erp.perfil_atual() in ('adm','financeiro','escritorio')
    or recebido_por = erp.utilizador_atual()
    or exists (select 1 from erp.pedidos p
               where p.id = pedido_id and p.vendedor_id = erp.utilizador_atual())));

create policy caixa_mov_sel on erp.caixa_movimentos for select to authenticated
  using (erp.is_ativo() and exists (
    select 1 from erp.caixas c where c.id = caixa_id
      and (c.utilizador_id = erp.utilizador_atual()
           or erp.perfil_atual() in ('adm','financeiro'))));

grant select on erp.caixas, erp.pagamentos, erp.caixa_movimentos to authenticated;
grant select on erp.v_caixas, erp.v_pagamentos, erp.v_caixa_movimentos to authenticated;
grant all on erp.caixas, erp.pagamentos, erp.caixa_movimentos to service_role;

grant execute on function erp.caixa_aberto(uuid) to authenticated;
grant execute on function erp.recalcular_caixa(uuid) to authenticated, service_role;
grant execute on function erp.recalcular_total_pago(uuid) to authenticated, service_role;
grant execute on function erp.abrir_caixa(numeric) to authenticated;
grant execute on function erp.fechar_caixa(uuid, numeric, text) to authenticated;
grant execute on function erp.reabrir_caixa(uuid, text) to authenticated;
grant execute on function erp.registar_saida_caixa(numeric, uuid, text, text) to authenticated;
grant execute on function erp.registar_sangria(uuid, numeric, uuid, text) to authenticated;
grant execute on function erp.registar_pagamento(uuid, uuid, numeric, text, text, date, text) to authenticated;
grant execute on function erp.confirmar_pagamento(uuid, text) to authenticated;
grant execute on function erp.rejeitar_pagamento(uuid, text) to authenticated;
grant execute on function erp.devolver_pagamento(uuid, text) to authenticated;

-- v_pedidos passa a incluir o estado de pagamento
drop view erp.v_pedidos;
create view erp.v_pedidos with (security_invoker = true) as
  select p.*, c.nome as cliente_nome, c.telefone_e164 as cliente_telefone,
         c.nif as cliente_nif, u.nome as vendedor_nome, z.nome as zona_nome,
         (select count(*) from erp.pedido_itens i
           where i.pedido_id = p.id and i.eliminado_em is null) as n_itens,
         greatest(p.total - p.total_pago, 0) as falta_pagar
  from erp.pedidos p
  join erp.clientes c on c.id = p.cliente_id
  left join erp.utilizadores u on u.id = p.vendedor_id
  left join erp.zonas_entrega z on z.id = p.zona_entrega_id
  where p.eliminado_em is null;
grant select on erp.v_pedidos to authenticated;