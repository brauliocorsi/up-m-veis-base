-- ============================================================ Fase 4: a venda
create type erp.estado_pedido as enum (
  'orcamento','confirmado','em_preparacao','pronto','entregue','cancelado'
);
create type erp.estado_item as enum (
  'pendente','reservado','encomendado','recebido','separado','entregue','cancelado'
);
create type erp.tipo_cupao as enum ('percentagem','valor','entrega_gratis');

create sequence if not exists erp.seq_pedido;

-- helper: id interno do utilizador autenticado
create or replace function erp.utilizador_atual() returns uuid
language sql stable security definer set search_path = erp, public as $$
  select u.id from erp.utilizadores u
  where u.user_id = auth.uid() and u.eliminado_em is null limit 1
$$;

create or replace function erp.regra_desconto_atual()
returns erp.regras_desconto language sql stable security definer
set search_path = erp, public as $$
  select r.* from erp.regras_desconto r
  where r.perfil = erp.perfil_atual() and r.eliminado_em is null limit 1
$$;

-- ------------------------------------------------------------------ cupões
create table erp.cupoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  codigo text not null,
  descricao text not null default '',
  tipo erp.tipo_cupao not null,
  valor numeric(12,2) not null default 0,
  minimo_compra numeric(12,2),
  valido_de date not null default current_date,
  valido_ate date,
  usos_max integer,
  usos_atuais integer not null default 0,
  usos_por_cliente integer not null default 1,
  aplica_a text not null default 'tudo',
  aplica_a_ids uuid[] not null default '{}',
  acumulavel boolean not null default false,
  ativo boolean not null default true,
  constraint cupoes_aplica_a_ck check (aplica_a in ('tudo','categoria','produto')),
  constraint cupoes_valor_ck check (valor >= 0)
);
create unique index cupoes_codigo_uk on erp.cupoes (upper(codigo)) where eliminado_em is null;

-- ----------------------------------------------------------------- pedidos
create table erp.pedidos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  numero text not null,
  tipo text not null default 'orcamento',
  origem text not null default 'loja',
  cliente_id uuid not null references erp.clientes(id),
  vendedor_id uuid references erp.utilizadores(id),
  estado erp.estado_pedido not null default 'orcamento',
  data_entrega_prevista date,
  data_entrega_prometida date,
  data_entrega_origem text not null default 'calculada',
  motivo_data_id uuid references erp.motivos(id),
  nota_data text,
  entrega_domicilio boolean not null default true,
  morada_entrega text,
  cp4_entrega char(4),
  cp3_entrega char(3),
  localidade_entrega text,
  zona_entrega_id uuid references erp.zonas_entrega(id),
  contacto_entrega text,
  notas_entrega text,
  subtotal numeric(12,2) not null default 0,
  desconto_linhas numeric(12,2) not null default 0,
  desconto_cabecalho_pct numeric(5,2) not null default 0,
  desconto_cabecalho numeric(12,2) not null default 0,
  cupao_id uuid references erp.cupoes(id),
  desconto_cupao numeric(12,2) not null default 0,
  valor_montagem numeric(12,2) not null default 0,
  valor_entrega numeric(12,2) not null default 0,
  valor_entrega_origem text not null default 'calculado',
  total_sem_iva numeric(12,2) not null default 0,
  total_iva numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  total_pago numeric(12,2) not null default 0,
  observacoes text,
  observacoes_internas text,
  confirmado_em timestamptz,
  confirmado_por uuid,
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento_id uuid references erp.motivos(id),
  nota_cancelamento text,
  reaberto_em timestamptz,
  reaberto_por uuid,
  nota_reabertura text,
  constraint pedidos_tipo_ck check (tipo in ('orcamento','pedido')),
  constraint pedidos_origem_ck check (origem in ('loja','telefone','online','whatsapp','outro')),
  constraint pedidos_data_origem_ck check (data_entrega_origem in ('calculada','manual')),
  constraint pedidos_entrega_origem_ck check (valor_entrega_origem in ('calculado','manual')),
  constraint pedidos_desconto_ck check (desconto_cabecalho_pct between 0 and 100)
);
create unique index pedidos_numero_uk on erp.pedidos (numero);
create index pedidos_cliente_ix on erp.pedidos (cliente_id);
create index pedidos_estado_ix on erp.pedidos (estado);
create index pedidos_vendedor_ix on erp.pedidos (vendedor_id);

create table erp.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_id uuid not null references erp.pedidos(id) on delete cascade,
  linha integer not null default 1,
  produto_id uuid references erp.produtos(id),
  servico_id uuid references erp.servicos(id),
  descricao text not null,
  cod_barras text,
  quantidade integer not null default 1,
  preco_unitario numeric(12,2) not null default 0,
  preco_tabela numeric(12,2) not null default 0,
  desconto_pct numeric(5,2) not null default 0,
  desconto_valor numeric(12,2) not null default 0,
  total_linha numeric(12,2) not null default 0,
  iva_pct numeric(5,2) not null default 23,
  montagem_incluida boolean not null default false,
  valor_montagem_unit numeric(12,2) not null default 0,
  tipo_fornecimento text,
  data_prevista date,
  estado erp.estado_item not null default 'pendente',
  reserva_id uuid references erp.reservas(id),
  nota text,
  constraint pedido_itens_alvo_ck check (num_nonnulls(produto_id, servico_id) = 1),
  constraint pedido_itens_qtd_ck check (quantidade > 0),
  constraint pedido_itens_desconto_ck check (desconto_pct between 0 and 100),
  constraint pedido_itens_preco_ck check (preco_unitario >= 0)
);
create index pedido_itens_pedido_ix on erp.pedido_itens (pedido_id);
create index pedido_itens_produto_ix on erp.pedido_itens (produto_id);

create table erp.cupao_usos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  cupao_id uuid not null references erp.cupoes(id),
  pedido_id uuid not null references erp.pedidos(id) on delete cascade,
  cliente_id uuid not null references erp.clientes(id),
  desconto numeric(12,2) not null default 0
);
create unique index cupao_usos_pedido_uk on erp.cupao_usos (pedido_id, cupao_id);

create table erp.necessidades_compra (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_id uuid not null references erp.pedidos(id) on delete cascade,
  item_id uuid not null references erp.pedido_itens(id) on delete cascade,
  produto_id uuid not null references erp.produtos(id),
  fornecedor_id uuid references erp.fornecedores(id),
  quantidade integer not null,
  estado text not null default 'aberta',
  constraint necessidades_estado_ck check (estado in ('aberta','encomendada','recebida','cancelada'))
);
create index necessidades_pedido_ix on erp.necessidades_compra (pedido_id);

-- ==================================================== motor de datas de entrega
create or replace function erp.dia_util(p_data date) returns boolean
language sql stable security definer set search_path = erp, public as $$
  select case
    when exists (select 1 from erp.calendario c where c.data = p_data
                 and c.tipo = 'fim_semana_excecional' and c.eliminado_em is null) then true
    when extract(isodow from p_data) >= 6 then false
    when exists (select 1 from erp.calendario c where c.data = p_data
                 and c.tipo in ('feriado','paragem_fabrica') and c.eliminado_em is null) then false
    else true end
$$;

create or replace function erp.somar_dias_uteis(p_data date, p_dias integer) returns date
language plpgsql stable security definer set search_path = erp, public as $$
declare d date := p_data; n integer := 0;
begin
  if p_dias <= 0 then
    while not erp.dia_util(d) loop d := d + 1; end loop;
    return d;
  end if;
  while n < p_dias loop
    d := d + 1;
    if erp.dia_util(d) then n := n + 1; end if;
  end loop;
  return d;
end $$;

create or replace function erp.calcular_data_entrega(p_pedido_id uuid) returns date
language plpgsql stable security definer set search_path = erp, public as $$
declare
  ped erp.pedidos%rowtype;
  v_dias integer := 0;
  v_prep integer := 1;
  v_data date;
  v_dias_rota integer[];
  v_tentativas integer := 0;
begin
  select * into ped from erp.pedidos where id = p_pedido_id;
  if not found then return null; end if;

  select coalesce(max(
    case i.tipo_fornecimento
      when 'stock' then 0
      when 'producao' then coalesce(p.prazo_producao_dias, 0)
      when 'compra' then coalesce(p.prazo_fornecedor_dias, coalesce(f.prazo_dias, 0))
      else 0 end), 0)
  into v_dias
  from erp.pedido_itens i
  left join erp.produtos p on p.id = i.produto_id
  left join erp.fornecedores f on f.id = p.fornecedor_id
  where i.pedido_id = p_pedido_id and i.eliminado_em is null and i.produto_id is not null;

  select coalesce((valor #>> '{}')::integer, 1) into v_prep
  from erp.definicoes where chave = 'dias_preparacao' and eliminado_em is null;
  v_data := erp.somar_dias_uteis(current_date, v_dias + coalesce(v_prep, 1));

  if ped.entrega_domicilio and ped.zona_entrega_id is not null then
    select z.dias_rota into v_dias_rota from erp.zonas_entrega z where z.id = ped.zona_entrega_id;
    if v_dias_rota is not null and array_length(v_dias_rota, 1) > 0 then
      while v_tentativas < 21
        and not ((extract(dow from v_data)::int + 1) = any (v_dias_rota) and erp.dia_util(v_data)) loop
        v_data := v_data + 1;
        v_tentativas := v_tentativas + 1;
      end loop;
    end if;
  end if;
  return v_data;
end $$;

create or replace function erp.zona_por_cp4(p_cp4 text) returns uuid
language sql stable security definer set search_path = erp, public as $$
  select z.id from erp.zonas_entrega z
  where z.ativo and z.eliminado_em is null
    and p_cp4 is not null and p_cp4 between z.cp_inicio and z.cp_fim
  order by z.cp_inicio limit 1
$$;

-- ============================================================ motor de cálculo
create or replace function erp.recalcular_pedido(p_pedido_id uuid) returns void
language plpgsql security definer set search_path = erp, public as $$
declare
  ped erp.pedidos%rowtype;
  cup erp.cupoes%rowtype;
  zona erp.zonas_entrega%rowtype;
  r record;
  v_subtotal numeric(12,2) := 0;
  v_desc_linhas numeric(12,2) := 0;
  v_base numeric(12,2) := 0;
  v_desc_cab numeric(12,2) := 0;
  v_desc_cupao numeric(12,2) := 0;
  v_montagem numeric(12,2) := 0;
  v_entrega numeric(12,2) := 0;
  v_iva numeric(12,2) := 0;
  v_volume numeric := 0;
  v_iva_geral numeric := 23;
  v_pct numeric := 0;
  v_pct_cupao numeric := 0;
  v_entrega_gratis boolean := false;
  v_zona uuid;
begin
  perform set_config('erp.recalculo', '1', true);
  select * into ped from erp.pedidos where id = p_pedido_id for update;
  if not found then perform set_config('erp.recalculo', '', true); return; end if;

  -- 1. totais de linha
  update erp.pedido_itens i
  set total_linha = greatest(
        round(i.quantidade * i.preco_unitario, 2)
        - case when i.desconto_pct > 0
            then round(round(i.quantidade * i.preco_unitario, 2) * i.desconto_pct / 100, 2)
            else least(i.desconto_valor, round(i.quantidade * i.preco_unitario, 2)) end, 0)
  where i.pedido_id = p_pedido_id and i.eliminado_em is null;

  select
    coalesce(sum(i.total_linha), 0),
    coalesce(sum(round(i.quantidade * i.preco_unitario, 2) - i.total_linha), 0),
    coalesce(sum(case when i.produto_id is not null and coalesce(p.permite_desconto, true)
                      then i.total_linha else 0 end), 0),
    coalesce(sum(case when i.montagem_incluida
                      then round(i.valor_montagem_unit * i.quantidade, 2) else 0 end), 0),
    coalesce(sum(coalesce(p.volume_m3, 0) * i.quantidade), 0)
  into v_subtotal, v_desc_linhas, v_base, v_montagem, v_volume
  from erp.pedido_itens i
  left join erp.produtos p on p.id = i.produto_id
  where i.pedido_id = p_pedido_id and i.eliminado_em is null;

  -- 2. desconto de cabeçalho (rateado por linha para os cêntimos baterem certo)
  v_pct := ped.desconto_cabecalho_pct;
  if v_pct > 0 and v_base > 0 then
    select coalesce(sum(round(i.total_linha * v_pct / 100, 2)), 0) into v_desc_cab
    from erp.pedido_itens i
    left join erp.produtos p on p.id = i.produto_id
    where i.pedido_id = p_pedido_id and i.eliminado_em is null
      and i.produto_id is not null and coalesce(p.permite_desconto, true);
  end if;

  -- 3. cupão
  if ped.cupao_id is not null then
    select * into cup from erp.cupoes where id = ped.cupao_id;
    if found then
      if cup.tipo = 'entrega_gratis' then
        v_entrega_gratis := true;
      elsif cup.tipo = 'percentagem' then
        v_pct_cupao := cup.valor;
        v_desc_cupao := round(greatest(v_base - v_desc_cab, 0) * cup.valor / 100, 2);
      else
        v_desc_cupao := least(cup.valor, greatest(v_base - v_desc_cab, 0));
      end if;
      if not cup.acumulavel and v_desc_cupao > 0 and v_desc_cab > 0 then
        if cup.tipo = 'percentagem' then
          v_desc_cupao := round(v_base * cup.valor / 100, 2);
        else
          v_desc_cupao := least(cup.valor, v_base);
        end if;
        if v_desc_cupao >= v_desc_cab then v_desc_cab := 0; else v_desc_cupao := 0; end if;
      end if;
    end if;
  end if;

  -- 4. entrega
  v_zona := ped.zona_entrega_id;
  if ped.entrega_domicilio and v_zona is null then
    v_zona := erp.zona_por_cp4(ped.cp4_entrega);
  end if;
  if ped.valor_entrega_origem = 'manual' then
    v_entrega := ped.valor_entrega;
  elsif not ped.entrega_domicilio then
    v_entrega := 0;
  elsif v_zona is not null then
    select * into zona from erp.zonas_entrega where id = v_zona;
    v_entrega := greatest(zona.valor_min, round(zona.valor_base + zona.valor_por_m3 * v_volume, 2));
    if zona.gratis_acima is not null and (v_subtotal - v_desc_cab - v_desc_cupao) >= zona.gratis_acima then
      v_entrega := 0;
    end if;
  end if;
  if v_entrega_gratis then v_entrega := 0; end if;

  -- 5. IVA linha a linha, já com os descontos rateados
  select coalesce((valor #>> '{}')::numeric, 23) into v_iva_geral
  from erp.definicoes where chave = 'iva_pct' and eliminado_em is null;

  for r in
    select i.total_linha, i.iva_pct, i.montagem_incluida, i.quantidade, i.valor_montagem_unit,
           (i.produto_id is not null and coalesce(p.permite_desconto, true)) as descontavel
    from erp.pedido_itens i
    left join erp.produtos p on p.id = i.produto_id
    where i.pedido_id = p_pedido_id and i.eliminado_em is null
  loop
    declare
      v_liq numeric(12,2) := r.total_linha;
    begin
      if r.descontavel and v_base > 0 then
        v_liq := v_liq - round(r.total_linha / v_base * (v_desc_cab + v_desc_cupao), 2);
      end if;
      if r.montagem_incluida then
        v_liq := v_liq + round(r.valor_montagem_unit * r.quantidade, 2);
      end if;
      v_iva := v_iva + round(greatest(v_liq, 0) * r.iva_pct / 100, 2);
    end;
  end loop;
  v_iva := v_iva + round(v_entrega * coalesce(v_iva_geral, 23) / 100, 2);

  update erp.pedidos set
    subtotal = v_subtotal,
    desconto_linhas = v_desc_linhas,
    desconto_cabecalho = v_desc_cab,
    desconto_cupao = v_desc_cupao,
    valor_montagem = v_montagem,
    valor_entrega = v_entrega,
    zona_entrega_id = v_zona,
    total_sem_iva = v_subtotal - v_desc_cab - v_desc_cupao + v_montagem + v_entrega,
    total_iva = v_iva,
    total = v_subtotal - v_desc_cab - v_desc_cupao + v_montagem + v_entrega + v_iva,
    data_entrega_prevista = case when ped.data_entrega_origem = 'manual'
      then ped.data_entrega_prevista else erp.calcular_data_entrega(p_pedido_id) end
  where id = p_pedido_id;

  perform set_config('erp.recalculo', '', true);
end $$;

-- os totais só podem vir do motor
create or replace function erp.tg_pedidos_totais() returns trigger
language plpgsql as $$
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

create or replace function erp.tg_pedidos_validar() returns trigger
language plpgsql security definer set search_path = erp, public as $$
declare regra erp.regras_desconto%rowtype; v_limite numeric := 0;
begin
  if NEW.desconto_cabecalho_pct > 0 then
    regra := erp.regra_desconto_atual();
    v_limite := coalesce(regra.desconto_max_pct, 0);
    if NEW.desconto_cabecalho_pct > v_limite then
      raise exception 'O seu limite de desconto é %%%. Peça aprovação ao escritório.', v_limite;
    end if;
  end if;
  if TG_OP = 'UPDATE' and OLD.estado not in ('orcamento','confirmado','em_preparacao')
     and NEW.estado = OLD.estado
     and coalesce(current_setting('erp.motor', true), '') <> '1' then
    raise exception 'Este pedido já não pode ser alterado.';
  end if;
  return NEW;
end $$;

create or replace function erp.tg_itens_validar() returns trigger
language plpgsql security definer set search_path = erp, public as $$
declare
  prod erp.produtos%rowtype;
  serv erp.servicos%rowtype;
  regra erp.regras_desconto%rowtype;
  v_pct numeric := 0;
  v_bruto numeric(12,2);
  v_estado erp.estado_pedido;
begin
  select estado into v_estado from erp.pedidos where id = NEW.pedido_id;
  if v_estado is distinct from 'orcamento'
     and coalesce(current_setting('erp.motor', true), '') <> '1' then
    raise exception 'Só é possível alterar linhas enquanto o pedido é um orçamento.';
  end if;

  regra := erp.regra_desconto_atual();
  v_bruto := round(NEW.quantidade * NEW.preco_unitario, 2);
  v_pct := case when NEW.desconto_pct > 0 then NEW.desconto_pct
                when v_bruto > 0 then round(NEW.desconto_valor / v_bruto * 100, 2)
                else 0 end;

  if NEW.produto_id is not null then
    select * into prod from erp.produtos where id = NEW.produto_id;
    if prod.id is null or not prod.ativo or not prod.vendavel then
      raise exception 'Este produto já não está disponível para venda.';
    end if;
    NEW.descricao := coalesce(nullif(NEW.descricao, ''), prod.nome_cliente);
    NEW.cod_barras := prod.cod_barras;
    NEW.preco_tabela := coalesce(prod.preco_promocional, prod.preco_base, 0);
    NEW.iva_pct := prod.iva_pct;
    NEW.tipo_fornecimento := prod.tipo_fornecimento::text;
    if prod.montagem_obrigatoria then NEW.montagem_incluida := true; end if;
    if NEW.montagem_incluida and NEW.valor_montagem_unit = 0 then
      NEW.valor_montagem_unit := prod.valor_montagem;
    end if;
    if not NEW.montagem_incluida then NEW.valor_montagem_unit := 0; end if;
    if v_pct > 0 and not prod.permite_desconto then
      raise exception 'O produto "%" não permite desconto.', prod.nome_cliente;
    end if;
    if NEW.preco_unitario < NEW.preco_tabela and not coalesce(regra.pode_alterar_preco, false) then
      raise exception 'Não pode baixar o preço de tabela. Peça aprovação ao escritório.';
    end if;
  else
    select * into serv from erp.servicos where id = NEW.servico_id;
    if serv.id is null or not serv.ativo then
      raise exception 'Este serviço já não está disponível.';
    end if;
    NEW.descricao := coalesce(nullif(NEW.descricao, ''), serv.nome);
    NEW.preco_tabela := serv.preco_base;
    NEW.iva_pct := serv.iva_pct;
    NEW.montagem_incluida := false;
    NEW.valor_montagem_unit := 0;
    if v_pct > 0 and not serv.permite_desconto then
      raise exception 'O serviço "%" não permite desconto.', serv.nome;
    end if;
  end if;

  if v_pct > coalesce(regra.desconto_max_pct, 0) then
    raise exception 'O seu limite de desconto é %%%. Peça aprovação ao escritório.',
      coalesce(regra.desconto_max_pct, 0);
  end if;
  return NEW;
end $$;

create or replace function erp.tg_recalcular_pedido() returns trigger
language plpgsql security definer set search_path = erp, public as $$
begin
  if coalesce(current_setting('erp.recalculo', true), '') = '1' then return null; end if;
  perform erp.recalcular_pedido(coalesce(NEW.pedido_id, OLD.pedido_id));
  return null;
end $$;

create or replace function erp.tg_recalcular_do_pedido() returns trigger
language plpgsql security definer set search_path = erp, public as $$
begin
  if coalesce(current_setting('erp.recalculo', true), '') = '1' then return null; end if;
  perform erp.recalcular_pedido(NEW.id);
  return null;
end $$;

-- ======================================================= confirmar / cancelar
create or replace function erp.confirmar_pedido(p_pedido_id uuid) returns jsonb
language plpgsql security definer set search_path = erp, public as $$
declare
  ped erp.pedidos%rowtype;
  cli erp.clientes%rowtype;
  cup erp.cupoes%rowtype;
  it record;
  v_reserva uuid;
  v_numero text;
  v_usos integer;
begin
  select * into ped from erp.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if ped.estado <> 'orcamento' then raise exception 'Este pedido já foi confirmado.'; end if;

  perform erp.recalcular_pedido(p_pedido_id);
  select * into ped from erp.pedidos where id = p_pedido_id;
  perform set_config('erp.motor', '1', true);

  if not exists (select 1 from erp.pedido_itens where pedido_id = p_pedido_id and eliminado_em is null) then
    raise exception 'O pedido não tem linhas.';
  end if;

  select * into cli from erp.clientes where id = ped.cliente_id and eliminado_em is null;
  if cli.id is null then raise exception 'O cliente do pedido já não existe.'; end if;
  if coalesce(cli.telefone_e164, '') = '' then
    raise exception 'O cliente precisa de telefone para confirmar o pedido.';
  end if;
  if ped.entrega_domicilio and coalesce(ped.morada_entrega, '') = '' then
    raise exception 'Indique a morada de entrega.';
  end if;
  if ped.entrega_domicilio and ped.zona_entrega_id is null then
    raise exception 'O código postal indicado não pertence a nenhuma zona de entrega.';
  end if;
  if ped.data_entrega_prevista is null then
    raise exception 'Falta a data de entrega.';
  end if;

  if ped.cupao_id is not null then
    select * into cup from erp.cupoes where id = ped.cupao_id for update;
    if not cup.ativo or cup.eliminado_em is not null then
      raise exception 'O cupão "%" já não está ativo.', cup.codigo;
    end if;
    if current_date < cup.valido_de or (cup.valido_ate is not null and current_date > cup.valido_ate) then
      raise exception 'O cupão "%" está fora do prazo.', cup.codigo;
    end if;
    if cup.minimo_compra is not null and ped.subtotal < cup.minimo_compra then
      raise exception 'O cupão "%" exige uma compra mínima de % €.', cup.codigo, cup.minimo_compra;
    end if;
    if cup.usos_max is not null and cup.usos_atuais >= cup.usos_max then
      raise exception 'O cupão "%" já atingiu o limite de utilizações.', cup.codigo;
    end if;
    select count(*) into v_usos from erp.cupao_usos u
      where u.cupao_id = cup.id and u.cliente_id = ped.cliente_id and u.eliminado_em is null;
    if v_usos >= cup.usos_por_cliente then
      raise exception 'Este cliente já usou o cupão "%".', cup.codigo;
    end if;
  end if;

  -- reservas de stock (tudo ou nada: qualquer erro anula a transação)
  for it in
    select i.*, p.tipo_fornecimento as forn, p.nome_cliente, p.fornecedor_id
    from erp.pedido_itens i join erp.produtos p on p.id = i.produto_id
    where i.pedido_id = p_pedido_id and i.eliminado_em is null and i.produto_id is not null
    order by i.linha
  loop
    if it.forn = 'stock' then
      v_reserva := erp.reservar(it.produto_id, it.quantidade, 'pedido', p_pedido_id, it.id, null);
      update erp.pedido_itens set reserva_id = v_reserva, estado = 'reservado',
        data_prevista = ped.data_entrega_prevista where id = it.id;
    else
      update erp.pedido_itens set estado = 'encomendado',
        data_prevista = ped.data_entrega_prevista where id = it.id;
      insert into erp.necessidades_compra (pedido_id, item_id, produto_id, fornecedor_id, quantidade)
      values (p_pedido_id, it.id, it.produto_id, it.fornecedor_id, it.quantidade);
    end if;
  end loop;

  update erp.pedido_itens set data_prevista = ped.data_entrega_prevista, estado = 'pendente'
  where pedido_id = p_pedido_id and eliminado_em is null and servico_id is not null;

  if ped.cupao_id is not null then
    insert into erp.cupao_usos (cupao_id, pedido_id, cliente_id, desconto)
    values (ped.cupao_id, p_pedido_id, ped.cliente_id, ped.desconto_cupao)
    on conflict (pedido_id, cupao_id) do nothing;
    update erp.cupoes set usos_atuais = usos_atuais + 1 where id = ped.cupao_id;
  end if;

  v_numero := erp.proximo_numero('pedido');
  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos set
    numero = v_numero, tipo = 'pedido', estado = 'confirmado',
    data_entrega_prometida = data_entrega_prevista,
    confirmado_em = now(), confirmado_por = auth.uid()
  where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);

  return jsonb_build_object('numero', v_numero, 'data_entrega', ped.data_entrega_prevista);
end $$;

create or replace function erp.cancelar_pedido(p_pedido_id uuid, p_motivo_id uuid, p_nota text)
returns void language plpgsql security definer set search_path = erp, public as $$
declare ped erp.pedidos%rowtype; it record;
begin
  select * into ped from erp.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if ped.estado = 'cancelado' then raise exception 'Este pedido já está cancelado.'; end if;
  if ped.estado = 'entregue' then raise exception 'Um pedido entregue não pode ser cancelado.'; end if;
  if p_motivo_id is null then raise exception 'Escolha o motivo do cancelamento.'; end if;

  perform set_config('erp.motor', '1', true);
  for it in select * from erp.pedido_itens where pedido_id = p_pedido_id and reserva_id is not null loop
    begin
      perform erp.libertar_reserva(it.reserva_id, coalesce(p_nota, 'Pedido cancelado'));
    exception when others then null;
    end;
    update erp.pedido_itens set estado = 'cancelado', reserva_id = null where id = it.id;
  end loop;
  update erp.pedido_itens set estado = 'cancelado'
    where pedido_id = p_pedido_id and estado <> 'cancelado';
  update erp.necessidades_compra set estado = 'cancelada'
    where pedido_id = p_pedido_id and estado = 'aberta';
  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos set estado = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
    motivo_cancelamento_id = p_motivo_id, nota_cancelamento = p_nota
  where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);
end $$;

create or replace function erp.reabrir_pedido(p_pedido_id uuid, p_nota text)
returns void language plpgsql security definer set search_path = erp, public as $$
declare ped erp.pedidos%rowtype; it record;
begin
  if not (erp.is_adm() or erp.perfil_atual() = 'escritorio') then
    raise exception 'Só o escritório ou a administração podem reabrir um pedido.';
  end if;
  select * into ped from erp.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if ped.estado not in ('confirmado','em_preparacao') then
    raise exception 'Este pedido já não pode ser reaberto.';
  end if;
  if coalesce(p_nota, '') = '' then raise exception 'Escreva o motivo da reabertura.'; end if;

  perform set_config('erp.motor', '1', true);
  for it in select * from erp.pedido_itens where pedido_id = p_pedido_id and reserva_id is not null loop
    begin
      perform erp.libertar_reserva(it.reserva_id, 'Pedido reaberto');
    exception when others then null;
    end;
    update erp.pedido_itens set reserva_id = null, estado = 'pendente' where id = it.id;
  end loop;
  update erp.pedido_itens set estado = 'pendente'
    where pedido_id = p_pedido_id and eliminado_em is null and estado <> 'pendente';
  update erp.necessidades_compra set estado = 'cancelada'
    where pedido_id = p_pedido_id and estado = 'aberta';
  if ped.cupao_id is not null then
    delete from erp.cupao_usos where pedido_id = p_pedido_id and cupao_id = ped.cupao_id;
    update erp.cupoes set usos_atuais = greatest(usos_atuais - 1, 0) where id = ped.cupao_id;
  end if;
  perform set_config('erp.recalculo', '1', true);
  update erp.pedidos set estado = 'orcamento', tipo = 'orcamento',
    reaberto_em = now(), reaberto_por = auth.uid(), nota_reabertura = p_nota,
    confirmado_em = null, confirmado_por = null
  where id = p_pedido_id;
  perform set_config('erp.recalculo', '', true);
  perform set_config('erp.motor', '', true);
  perform erp.recalcular_pedido(p_pedido_id);
end $$;

-- ================================================================== triggers
create trigger t_cupoes_campos before insert or update on erp.cupoes
  for each row execute function erp.tg_campos_auditoria();
create trigger t_cupoes_aud after insert or update on erp.cupoes
  for each row execute function erp.tg_auditoria();
create trigger t_cupao_usos_campos before insert or update on erp.cupao_usos
  for each row execute function erp.tg_campos_auditoria();
create trigger t_necessidades_campos before insert or update on erp.necessidades_compra
  for each row execute function erp.tg_campos_auditoria();

create trigger t_pedidos_campos before insert or update on erp.pedidos
  for each row execute function erp.tg_campos_auditoria();
create trigger t_pedidos_totais before insert or update on erp.pedidos
  for each row execute function erp.tg_pedidos_totais();
create trigger t_pedidos_validar before insert or update on erp.pedidos
  for each row execute function erp.tg_pedidos_validar();
create trigger t_pedidos_aud after insert or update on erp.pedidos
  for each row execute function erp.tg_auditoria();
create trigger t_pedidos_recalcular after insert or update of desconto_cabecalho_pct, cupao_id,
  zona_entrega_id, cp4_entrega, entrega_domicilio, valor_entrega_origem, data_entrega_origem
  on erp.pedidos for each row execute function erp.tg_recalcular_do_pedido();

create trigger t_itens_campos before insert or update on erp.pedido_itens
  for each row execute function erp.tg_campos_auditoria();
create trigger t_itens_validar before insert or update on erp.pedido_itens
  for each row execute function erp.tg_itens_validar();
create trigger t_itens_aud after insert or update on erp.pedido_itens
  for each row execute function erp.tg_auditoria();
create trigger t_itens_recalcular after insert or update or delete on erp.pedido_itens
  for each row execute function erp.tg_recalcular_pedido();

-- ===================================================================== views
create view erp.v_pedidos as
  select p.*, c.nome as cliente_nome, c.telefone_e164 as cliente_telefone,
         c.nif as cliente_nif, u.nome as vendedor_nome, z.nome as zona_nome,
         (select count(*) from erp.pedido_itens i
           where i.pedido_id = p.id and i.eliminado_em is null) as n_itens
  from erp.pedidos p
  join erp.clientes c on c.id = p.cliente_id
  left join erp.utilizadores u on u.id = p.vendedor_id
  left join erp.zonas_entrega z on z.id = p.zona_entrega_id
  where p.eliminado_em is null;

create view erp.v_pedido_itens as
  select i.*, p.nome_cliente as produto_nome, p.imagem_url, s.nome as servico_nome
  from erp.pedido_itens i
  left join erp.produtos p on p.id = i.produto_id
  left join erp.servicos s on s.id = i.servico_id
  where i.eliminado_em is null;

create view erp.v_cupoes as select * from erp.cupoes where eliminado_em is null;

create view erp.v_necessidades_compra as
  select n.*, p.numero as pedido_numero, pr.nome_cliente as produto_nome,
         pr.cod_barras, f.nome as fornecedor_nome
  from erp.necessidades_compra n
  join erp.pedidos p on p.id = n.pedido_id
  join erp.produtos pr on pr.id = n.produto_id
  left join erp.fornecedores f on f.id = n.fornecedor_id
  where n.eliminado_em is null;

-- ====================================================================== RLS
grant select, insert, update on erp.pedidos to authenticated;
grant select, insert, update, delete on erp.pedido_itens to authenticated;
grant select, insert, update on erp.cupoes to authenticated;
grant select, insert, update on erp.cupao_usos to authenticated;
grant select, insert, update on erp.necessidades_compra to authenticated;
grant select on erp.v_pedidos, erp.v_pedido_itens, erp.v_cupoes, erp.v_necessidades_compra to authenticated;
grant all on erp.pedidos, erp.pedido_itens, erp.cupoes, erp.cupao_usos, erp.necessidades_compra to service_role;
grant usage on sequence erp.seq_pedido to authenticated, service_role;

alter table erp.pedidos enable row level security;
alter table erp.pedido_itens enable row level security;
alter table erp.cupoes enable row level security;
alter table erp.cupao_usos enable row level security;
alter table erp.necessidades_compra enable row level security;

create policy pedidos_sel on erp.pedidos for select to authenticated using (erp.is_ativo());
create policy pedidos_ins on erp.pedidos for insert to authenticated with check (erp.is_ativo());
create policy pedidos_upd on erp.pedidos for update to authenticated
  using (erp.is_ativo() and (erp.perfil_atual() <> 'vendedora' or vendedor_id = erp.utilizador_atual()))
  with check (erp.is_ativo());

create policy itens_sel on erp.pedido_itens for select to authenticated using (erp.is_ativo());
create policy itens_ins on erp.pedido_itens for insert to authenticated with check (erp.is_ativo());
create policy itens_upd on erp.pedido_itens for update to authenticated
  using (erp.is_ativo()) with check (erp.is_ativo());
create policy itens_del on erp.pedido_itens for delete to authenticated using (erp.is_ativo());

create policy cupoes_sel on erp.cupoes for select to authenticated using (erp.is_ativo());
create policy cupoes_ins on erp.cupoes for insert to authenticated with check (erp.is_adm());
create policy cupoes_upd on erp.cupoes for update to authenticated
  using (erp.is_adm()) with check (erp.is_adm());

create policy usos_sel on erp.cupao_usos for select to authenticated using (erp.is_ativo());
create policy usos_ins on erp.cupao_usos for insert to authenticated with check (erp.is_ativo());

create policy nec_sel on erp.necessidades_compra for select to authenticated using (erp.is_ativo());
create policy nec_ins on erp.necessidades_compra for insert to authenticated with check (erp.is_ativo());
create policy nec_upd on erp.necessidades_compra for update to authenticated
  using (erp.is_ativo()) with check (erp.is_ativo());
