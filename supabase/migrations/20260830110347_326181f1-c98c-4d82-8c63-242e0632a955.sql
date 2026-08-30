create type erp.estado_oc as enum
  ('rascunho','pronta_enviar','enviada','confirmada','recebida_parcial','recebida','cancelada');

create sequence if not exists erp.seq_oc_rascunho;
create sequence if not exists erp.seq_pedido_compra;

create or replace function erp.pode_comprar()
returns boolean language sql stable security definer set search_path = erp, public as $$
  select exists (
    select 1 from erp.utilizadores u
    where u.user_id = auth.uid() and u.ativo and u.eliminado_em is null
      and u.perfil in ('adm','compras')
  )
$$;

create or replace function erp.pode_pagar()
returns boolean language sql stable security definer set search_path = erp, public as $$
  select exists (
    select 1 from erp.utilizadores u
    where u.user_id = auth.uid() and u.ativo and u.eliminado_em is null
      and u.perfil in ('adm','financeiro')
  )
$$;

revoke all on function erp.pode_comprar() from public, anon;
revoke all on function erp.pode_pagar() from public, anon;
grant execute on function erp.pode_comprar() to authenticated;
grant execute on function erp.pode_pagar() to authenticated;

create or replace function erp.proximo_numero(tipo text)
returns text language plpgsql security definer set search_path = erp, public as $$
declare n bigint; pre text;
begin
  case tipo
    when 'pedido' then n := nextval('erp.seq_pedido'); pre := 'PED';
    when 'orcamento' then n := nextval('erp.seq_orcamento'); pre := 'ORC';
    when 'ordem_compra' then n := nextval('erp.seq_ordem_compra'); pre := 'OC';
    when 'pedido_compra' then n := nextval('erp.seq_pedido_compra'); pre := 'PC';
    when 'recibo' then n := nextval('erp.seq_recibo'); pre := 'REC';
    else raise exception 'Tipo de documento desconhecido: %', tipo;
  end case;
  return pre || '-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
end $$;

create table erp.ordens_compra (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  numero text not null unique,
  fornecedor_id uuid not null references erp.fornecedores(id),
  estado erp.estado_oc not null default 'rascunho',
  data_emissao date not null default current_date,
  data_prevista date,
  data_confirmada_fornecedor date,
  data_recebida date,
  moeda char(3) not null default 'EUR',
  total numeric(12,2) not null default 0,
  observacoes text,
  observacoes_fornecedor text,
  enviada_em timestamptz,
  enviada_por uuid references auth.users(id),
  enviada_para text,
  envio_message_id text,
  envio_erro text,
  envio_tentativas int not null default 0,
  pdf_url text,
  cancelada_em timestamptz,
  motivo_cancelamento text
);

create table erp.oc_itens (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  oc_id uuid not null references erp.ordens_compra(id),
  linha int not null,
  produto_id uuid references erp.produtos(id),
  descricao text not null,
  quantidade int not null check (quantidade > 0),
  quantidade_recebida int not null default 0 check (quantidade_recebida >= 0),
  custo_unitario numeric(12,2) not null default 0 check (custo_unitario >= 0),
  total_linha numeric(12,2) not null default 0,
  data_prevista_item date,
  necessidade_id uuid references erp.necessidades_compra(id),
  pedido_item_id uuid references erp.pedido_itens(id),
  unique (oc_id, linha),
  check (quantidade_recebida <= quantidade)
);

create table erp.oc_recebimentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  oc_id uuid not null references erp.ordens_compra(id),
  data date not null default current_date,
  doc_fornecedor text,
  observacoes text
);

create table erp.oc_recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  recebimento_id uuid not null references erp.oc_recebimentos(id),
  oc_item_id uuid not null references erp.oc_itens(id),
  quantidade int not null check (quantidade > 0),
  movimento_id bigint references erp.stock_movimentos(id)
);

create table erp.pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  numero text not null unique,
  solicitante_id uuid not null references erp.utilizadores(id),
  urgencia text not null default 'normal' check (urgencia in ('normal','urgente')),
  destino text not null check (destino in ('stock','cliente','consumo_interno')),
  justificacao text not null,
  estado text not null default 'rascunho'
    check (estado in ('rascunho','submetido','aprovado','convertido','recusado')),
  valor_estimado numeric(12,2) not null default 0,
  aprovador_id uuid references erp.utilizadores(id),
  data_aprovacao timestamptz,
  motivo_recusa text,
  oc_id uuid references erp.ordens_compra(id)
);

create table erp.pedidos_compra_itens (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_compra_id uuid not null references erp.pedidos_compra(id),
  produto_id uuid references erp.produtos(id),
  descricao_livre text,
  quantidade int not null check (quantidade > 0),
  custo_estimado numeric(12,2) not null default 0 check (custo_estimado >= 0),
  fornecedor_sugerido_id uuid references erp.fornecedores(id),
  check (num_nonnulls(produto_id, descricao_livre) = 1)
);

create table erp.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  fornecedor_id uuid not null references erp.fornecedores(id),
  oc_id uuid references erp.ordens_compra(id),
  descricao text not null,
  categoria text,
  valor numeric(12,2) not null check (valor > 0),
  valor_pago numeric(12,2) not null default 0 check (valor_pago >= 0),
  data_vencimento date not null,
  data_pagamento date,
  estado text not null default 'pendente'
    check (estado in ('pendente','paga_parcial','paga','cancelada')),
  doc_fornecedor text,
  comprovativo_url text,
  check (valor_pago <= valor)
);

create table erp.alertas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  perfil_destino erp.perfil not null,
  titulo text not null,
  mensagem text not null,
  referencia_tipo text,
  referencia_id uuid,
  lida boolean not null default false
);

alter table erp.necessidades_compra alter column pedido_id drop not null;
alter table erp.necessidades_compra alter column item_id drop not null;
alter table erp.necessidades_compra add column if not exists origem text not null default 'venda';
alter table erp.necessidades_compra add constraint necessidades_origem_ck
  check (origem in ('venda','reposicao','manual'));
alter table erp.necessidades_compra add column if not exists oc_id uuid references erp.ordens_compra(id);
create unique index nec_reposicao_aberta_ux on erp.necessidades_compra(produto_id)
  where origem = 'reposicao' and estado = 'aberta' and eliminado_em is null;

create index ix_oc_fornecedor on erp.ordens_compra(fornecedor_id);
create index ix_oc_estado on erp.ordens_compra(estado);
create index ix_oc_data on erp.ordens_compra(data_emissao desc);
create index ix_oc_itens_oc on erp.oc_itens(oc_id);
create index ix_oc_itens_produto on erp.oc_itens(produto_id);
create index ix_oc_itens_necessidade on erp.oc_itens(necessidade_id);
create index ix_oc_itens_pedido_item on erp.oc_itens(pedido_item_id);
create index ix_oc_receb_oc on erp.oc_recebimentos(oc_id);
create index ix_oc_receb_itens_receb on erp.oc_recebimento_itens(recebimento_id);
create index ix_oc_receb_itens_item on erp.oc_recebimento_itens(oc_item_id);
create index ix_pc_solicitante on erp.pedidos_compra(solicitante_id);
create index ix_pc_estado on erp.pedidos_compra(estado);
create index ix_pc_itens_pc on erp.pedidos_compra_itens(pedido_compra_id);
create index ix_cp_fornecedor on erp.contas_pagar(fornecedor_id);
create index ix_cp_estado on erp.contas_pagar(estado, data_vencimento);
create index ix_cp_oc on erp.contas_pagar(oc_id);
create index ix_alertas_perfil on erp.alertas(perfil_destino, lida);

create trigger t_oc_campos before insert or update on erp.ordens_compra
  for each row execute function erp.tg_campos_auditoria();
create trigger t_oc_aud after insert or update on erp.ordens_compra
  for each row execute function erp.tg_auditoria();

create trigger t_oc_itens_campos before insert or update on erp.oc_itens
  for each row execute function erp.tg_campos_auditoria();
create trigger t_oc_itens_aud after insert or update on erp.oc_itens
  for each row execute function erp.tg_auditoria();

create trigger t_oc_receb_campos before insert or update on erp.oc_recebimentos
  for each row execute function erp.tg_campos_auditoria();
create trigger t_oc_receb_aud after insert or update on erp.oc_recebimentos
  for each row execute function erp.tg_auditoria();

create trigger t_oc_receb_itens_campos before insert or update on erp.oc_recebimento_itens
  for each row execute function erp.tg_campos_auditoria();
create trigger t_oc_receb_itens_aud after insert or update on erp.oc_recebimento_itens
  for each row execute function erp.tg_auditoria();

create trigger t_pc_campos before insert or update on erp.pedidos_compra
  for each row execute function erp.tg_campos_auditoria();
create trigger t_pc_aud after insert or update on erp.pedidos_compra
  for each row execute function erp.tg_auditoria();

create trigger t_pc_itens_campos before insert or update on erp.pedidos_compra_itens
  for each row execute function erp.tg_campos_auditoria();
create trigger t_pc_itens_aud after insert or update on erp.pedidos_compra_itens
  for each row execute function erp.tg_auditoria();

create trigger t_cp_campos before insert or update on erp.contas_pagar
  for each row execute function erp.tg_campos_auditoria();
create trigger t_cp_aud after insert or update on erp.contas_pagar
  for each row execute function erp.tg_auditoria();

create trigger t_alertas_campos before insert or update on erp.alertas
  for each row execute function erp.tg_campos_auditoria();

create or replace function erp.tg_oc_itens_validar()
returns trigger language plpgsql security definer set search_path = erp, public as $$
declare v_estado erp.estado_oc; v_nome text;
begin
  select estado into v_estado from erp.ordens_compra where id = NEW.oc_id;
  if v_estado is distinct from 'rascunho'
     and coalesce(current_setting('erp.motor', true), '') <> '1' then
    raise exception 'Só é possível alterar linhas enquanto a ordem de compra é um rascunho.';
  end if;
  if NEW.produto_id is not null then
    select nome_cliente into v_nome from erp.produtos where id = NEW.produto_id;
    if v_nome is null then raise exception 'Produto não encontrado.'; end if;
    NEW.descricao := coalesce(nullif(NEW.descricao, ''), v_nome);
  end if;
  NEW.total_linha := round(NEW.quantidade * NEW.custo_unitario, 2);
  return NEW;
end $$;

create trigger t_oc_itens_validar before insert or update on erp.oc_itens
  for each row execute function erp.tg_oc_itens_validar();

create or replace function erp.recalcular_oc(p_oc_id uuid)
returns void language plpgsql security definer set search_path = erp, public as $$
begin
  update erp.ordens_compra o
     set total = coalesce((
           select sum(i.total_linha) from erp.oc_itens i
            where i.oc_id = p_oc_id and i.eliminado_em is null), 0)
   where o.id = p_oc_id;
end $$;

create or replace function erp.tg_oc_itens_total()
returns trigger language plpgsql security definer set search_path = erp, public as $$
begin
  perform erp.recalcular_oc(coalesce(NEW.oc_id, OLD.oc_id));
  return null;
end $$;

create trigger t_oc_itens_total after insert or update on erp.oc_itens
  for each row execute function erp.tg_oc_itens_total();

create or replace function erp.tg_conta_estado()
returns trigger language plpgsql security definer set search_path = erp, public as $$
begin
  if NEW.estado <> 'cancelada' then
    NEW.estado := case
      when NEW.valor_pago >= NEW.valor then 'paga'
      when NEW.valor_pago > 0 then 'paga_parcial'
      else 'pendente' end;
    if NEW.estado = 'paga' and NEW.data_pagamento is null then
      NEW.data_pagamento := current_date;
    end if;
  end if;
  return NEW;
end $$;

create trigger t_cp_estado before insert or update on erp.contas_pagar
  for each row execute function erp.tg_conta_estado();

drop view if exists erp.v_necessidades_compra;
create view erp.v_necessidades_compra as
select n.*,
       p.numero as pedido_numero,
       c.nome as cliente_nome,
       pr.nome_cliente as produto_nome,
       pr.cod_barras,
       f.nome as fornecedor_nome,
       o.numero as oc_numero
  from erp.necessidades_compra n
  left join erp.pedidos p on p.id = n.pedido_id
  left join erp.clientes c on c.id = p.cliente_id
  join erp.produtos pr on pr.id = n.produto_id
  left join erp.fornecedores f on f.id = n.fornecedor_id
  left join erp.ordens_compra o on o.id = n.oc_id
 where n.eliminado_em is null;

create view erp.v_ordens_compra as
select o.*,
       f.nome as fornecedor_nome,
       f.email_encomendas as fornecedor_email,
       f.enviar_automatico,
       f.idioma as fornecedor_idioma,
       (select count(*) from erp.oc_itens i where i.oc_id = o.id and i.eliminado_em is null) as n_itens,
       (select coalesce(sum(i.quantidade - i.quantidade_recebida), 0) from erp.oc_itens i
         where i.oc_id = o.id and i.eliminado_em is null) as unidades_em_falta,
       (o.estado in ('enviada','confirmada','recebida_parcial')
         and coalesce(o.data_confirmada_fornecedor, o.data_prevista) is not null
         and coalesce(o.data_confirmada_fornecedor, o.data_prevista) < current_date) as atrasada
  from erp.ordens_compra o
  join erp.fornecedores f on f.id = o.fornecedor_id
 where o.eliminado_em is null;

create view erp.v_oc_itens as
select i.*,
       o.numero as oc_numero,
       o.estado as oc_estado,
       o.fornecedor_id,
       pr.nome_cliente as produto_nome,
       pr.cod_barras,
       (i.quantidade - i.quantidade_recebida) as em_falta,
       p.numero as pedido_numero,
       p.id as pedido_id,
       c.nome as cliente_nome
  from erp.oc_itens i
  join erp.ordens_compra o on o.id = i.oc_id
  left join erp.produtos pr on pr.id = i.produto_id
  left join erp.pedido_itens pi on pi.id = i.pedido_item_id
  left join erp.pedidos p on p.id = pi.pedido_id
  left join erp.clientes c on c.id = p.cliente_id
 where i.eliminado_em is null;

create view erp.v_oc_recebimentos as
select r.*,
       o.numero as oc_numero,
       u.nome as registado_por_nome,
       (select coalesce(sum(ri.quantidade), 0) from erp.oc_recebimento_itens ri
         where ri.recebimento_id = r.id and ri.eliminado_em is null) as unidades
  from erp.oc_recebimentos r
  join erp.ordens_compra o on o.id = r.oc_id
  left join erp.utilizadores u on u.user_id = r.criado_por
 where r.eliminado_em is null;

create view erp.v_contas_pagar as
select cp.*,
       f.nome as fornecedor_nome,
       o.numero as oc_numero,
       (cp.valor - cp.valor_pago) as em_divida,
       (cp.data_vencimento - current_date) as dias_para_vencer
  from erp.contas_pagar cp
  join erp.fornecedores f on f.id = cp.fornecedor_id
  left join erp.ordens_compra o on o.id = cp.oc_id
 where cp.eliminado_em is null;

create view erp.v_pedidos_compra as
select pc.*,
       s.nome as solicitante_nome,
       a.nome as aprovador_nome,
       o.numero as oc_numero,
       (select count(*) from erp.pedidos_compra_itens i
         where i.pedido_compra_id = pc.id and i.eliminado_em is null) as n_itens
  from erp.pedidos_compra pc
  join erp.utilizadores s on s.id = pc.solicitante_id
  left join erp.utilizadores a on a.id = pc.aprovador_id
  left join erp.ordens_compra o on o.id = pc.oc_id
 where pc.eliminado_em is null;

create view erp.v_pedidos_compra_itens as
select i.*,
       pr.nome_cliente as produto_nome,
       f.nome as fornecedor_sugerido_nome
  from erp.pedidos_compra_itens i
  left join erp.produtos pr on pr.id = i.produto_id
  left join erp.fornecedores f on f.id = i.fornecedor_sugerido_id
 where i.eliminado_em is null;

create view erp.v_alertas as
select a.* from erp.alertas a where a.eliminado_em is null;

grant select, insert, update on erp.ordens_compra to authenticated;
grant select, insert, update on erp.oc_itens to authenticated;
grant select on erp.oc_recebimentos to authenticated;
grant select on erp.oc_recebimento_itens to authenticated;
grant select, insert, update on erp.pedidos_compra to authenticated;
grant select, insert, update on erp.pedidos_compra_itens to authenticated;
grant select, update on erp.contas_pagar to authenticated;
grant select, update on erp.alertas to authenticated;

grant all on erp.ordens_compra to service_role;
grant all on erp.oc_itens to service_role;
grant all on erp.oc_recebimentos to service_role;
grant all on erp.oc_recebimento_itens to service_role;
grant all on erp.pedidos_compra to service_role;
grant all on erp.pedidos_compra_itens to service_role;
grant all on erp.contas_pagar to service_role;
grant all on erp.alertas to service_role;

grant select on erp.v_ordens_compra, erp.v_oc_itens, erp.v_oc_recebimentos,
  erp.v_contas_pagar, erp.v_pedidos_compra, erp.v_pedidos_compra_itens,
  erp.v_alertas, erp.v_necessidades_compra to authenticated;
grant select on erp.v_ordens_compra, erp.v_oc_itens, erp.v_oc_recebimentos,
  erp.v_contas_pagar, erp.v_pedidos_compra, erp.v_pedidos_compra_itens,
  erp.v_alertas, erp.v_necessidades_compra to service_role;

alter table erp.ordens_compra enable row level security;
alter table erp.oc_itens enable row level security;
alter table erp.oc_recebimentos enable row level security;
alter table erp.oc_recebimento_itens enable row level security;
alter table erp.pedidos_compra enable row level security;
alter table erp.pedidos_compra_itens enable row level security;
alter table erp.contas_pagar enable row level security;
alter table erp.alertas enable row level security;

create policy oc_sel on erp.ordens_compra for select to authenticated using (erp.is_ativo());
create policy oc_ins on erp.ordens_compra for insert to authenticated with check (erp.pode_comprar());
create policy oc_upd on erp.ordens_compra for update to authenticated
  using (erp.pode_comprar()) with check (erp.pode_comprar());

create policy oci_sel on erp.oc_itens for select to authenticated using (erp.is_ativo());
create policy oci_ins on erp.oc_itens for insert to authenticated with check (erp.pode_comprar());
create policy oci_upd on erp.oc_itens for update to authenticated
  using (erp.pode_comprar()) with check (erp.pode_comprar());

create policy ocr_sel on erp.oc_recebimentos for select to authenticated using (erp.is_ativo());
create policy ocri_sel on erp.oc_recebimento_itens for select to authenticated using (erp.is_ativo());

create policy pc_sel on erp.pedidos_compra for select to authenticated using (erp.is_ativo());
create policy pc_ins on erp.pedidos_compra for insert to authenticated with check (erp.is_ativo());
create policy pc_upd on erp.pedidos_compra for update to authenticated
  using (erp.is_ativo() and (solicitante_id = erp.utilizador_atual() or erp.pode_comprar()))
  with check (erp.is_ativo() and (solicitante_id = erp.utilizador_atual() or erp.pode_comprar()));

create policy pci_sel on erp.pedidos_compra_itens for select to authenticated using (erp.is_ativo());
create policy pci_ins on erp.pedidos_compra_itens for insert to authenticated with check (erp.is_ativo());
create policy pci_upd on erp.pedidos_compra_itens for update to authenticated
  using (erp.is_ativo()) with check (erp.is_ativo());

create policy cp_sel on erp.contas_pagar for select to authenticated using (erp.is_ativo());
create policy cp_upd on erp.contas_pagar for update to authenticated
  using (erp.pode_pagar()) with check (erp.pode_pagar());

create policy al_sel on erp.alertas for select to authenticated
  using (erp.is_ativo() and (perfil_destino = erp.perfil_atual() or erp.is_adm()));
create policy al_upd on erp.alertas for update to authenticated
  using (erp.is_ativo() and (perfil_destino = erp.perfil_atual() or erp.is_adm()))
  with check (erp.is_ativo() and (perfil_destino = erp.perfil_atual() or erp.is_adm()));

insert into erp.definicoes (chave, valor, descricao)
values ('limite_aprovacao_compra', '500'::jsonb,
        'Valor estimado a partir do qual um pedido de compra manual precisa de aprovação da Administração.'),
       ('prazo_pagamento_fornecedor_dias', '30'::jsonb,
        'Dias de vencimento aplicados às contas a pagar criadas automaticamente nas receções.')
on conflict do nothing;