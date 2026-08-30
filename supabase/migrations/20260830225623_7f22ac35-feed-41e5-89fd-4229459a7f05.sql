-- ============================== 1. Caixa da rota
ALTER TABLE erp.caixas ADD COLUMN IF NOT EXISTS rota_id uuid;

-- ============================== 2. Rotas
CREATE TABLE erp.rotas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  data date NOT NULL DEFAULT CURRENT_DATE,
  nome text NOT NULL,
  responsavel_id uuid NOT NULL REFERENCES erp.utilizadores(id),
  viatura text,
  estado text NOT NULL DEFAULT 'planeada'
    CHECK (estado IN ('planeada','em_curso','concluida','fechada','conferida')),
  previsto_entregas int NOT NULL DEFAULT 0,
  previsto_receber numeric(12,2) NOT NULL DEFAULT 0,
  realizado_entregas int,
  realizado_recebido numeric(12,2),
  realizado_dinheiro numeric(12,2),
  realizado_saidas numeric(12,2),
  esperado_envelope numeric(12,2),
  valor_envelope numeric(12,2),
  aberta_em timestamptz,
  fechada_em timestamptz,
  fechada_por uuid,
  conferida_em timestamptz,
  conferida_por uuid,
  valor_conferido numeric(12,2),
  diferenca numeric(12,2),
  justificacao_diferenca text,
  observacoes text
);
CREATE INDEX ix_rotas_responsavel ON erp.rotas (responsavel_id, data DESC);
CREATE INDEX ix_rotas_data ON erp.rotas (data DESC);

CREATE TABLE erp.rota_paragens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  rota_id uuid NOT NULL REFERENCES erp.rotas(id),
  pedido_id uuid NOT NULL REFERENCES erp.pedidos(id),
  ordem int NOT NULL DEFAULT 1,
  previsto_receber numeric(12,2) NOT NULL DEFAULT 0,
  desfecho text CHECK (desfecho IN ('entregue','parcial','reagendada','cancelada','ausente')),
  data_reagendamento date,
  motivo_id uuid REFERENCES erp.motivos(id),
  motivo text,
  entrega_id uuid REFERENCES erp.entregas(id),
  concluida_em timestamptz,
  UNIQUE (rota_id, pedido_id)
);
CREATE INDEX ix_paragens_rota ON erp.rota_paragens (rota_id, ordem);
CREATE INDEX ix_paragens_pedido ON erp.rota_paragens (pedido_id);
CREATE INDEX ix_paragens_motivo ON erp.rota_paragens (motivo_id);
CREATE INDEX ix_paragens_entrega ON erp.rota_paragens (entrega_id);

CREATE TABLE erp.assistencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  atualizado_em timestamptz,
  atualizado_por uuid,
  eliminado_em timestamptz,
  eliminado_por uuid,
  motivo_eliminacao text,
  pedido_id uuid NOT NULL REFERENCES erp.pedidos(id),
  pedido_item_id uuid REFERENCES erp.pedido_itens(id),
  entrega_id uuid REFERENCES erp.entregas(id),
  paragem_id uuid REFERENCES erp.rota_paragens(id),
  origem text NOT NULL CHECK (origem IN ('entrega','cliente','oficina')),
  motivo text NOT NULL,
  peca_afetada text,
  descricao text NOT NULL,
  fotos jsonb,
  estado text NOT NULL DEFAULT 'aberta'
    CHECK (estado IN ('aberta','em_analise','peca_encomendada','agendada','resolvida','cancelada')),
  aberta_por uuid REFERENCES erp.utilizadores(id),
  resolvida_em timestamptz,
  nota_resolucao text
);
CREATE INDEX ix_assistencias_pedido ON erp.assistencias (pedido_id);
CREATE INDEX ix_assistencias_item ON erp.assistencias (pedido_item_id);
CREATE INDEX ix_assistencias_entrega ON erp.assistencias (entrega_id);
CREATE INDEX ix_assistencias_paragem ON erp.assistencias (paragem_id);
CREATE INDEX ix_assistencias_abriu ON erp.assistencias (aberta_por);
CREATE INDEX ix_assistencias_estado ON erp.assistencias (estado, criado_em DESC);
CREATE INDEX ix_caixas_rota ON erp.caixas (rota_id);

-- ============================== 3. Grants (sem DELETE)
GRANT SELECT, INSERT, UPDATE ON erp.rotas, erp.rota_paragens, erp.assistencias TO authenticated;
GRANT ALL ON erp.rotas, erp.rota_paragens, erp.assistencias TO service_role;
REVOKE DELETE ON erp.rotas, erp.rota_paragens, erp.assistencias FROM authenticated;

-- ============================== 4. Auditoria
CREATE TRIGGER t_rotas_campos BEFORE INSERT OR UPDATE ON erp.rotas
  FOR EACH ROW EXECUTE FUNCTION erp.tg_campos_auditoria();
CREATE TRIGGER t_rotas_aud AFTER INSERT OR UPDATE ON erp.rotas
  FOR EACH ROW EXECUTE FUNCTION erp.tg_auditoria();
CREATE TRIGGER t_paragens_campos BEFORE INSERT OR UPDATE ON erp.rota_paragens
  FOR EACH ROW EXECUTE FUNCTION erp.tg_campos_auditoria();
CREATE TRIGGER t_paragens_aud AFTER INSERT OR UPDATE ON erp.rota_paragens
  FOR EACH ROW EXECUTE FUNCTION erp.tg_auditoria();
CREATE TRIGGER t_assistencias_campos BEFORE INSERT OR UPDATE ON erp.assistencias
  FOR EACH ROW EXECUTE FUNCTION erp.tg_campos_auditoria();
CREATE TRIGGER t_assistencias_aud AFTER INSERT OR UPDATE ON erp.assistencias
  FOR EACH ROW EXECUTE FUNCTION erp.tg_auditoria();

-- ============================== 5. RLS
ALTER TABLE erp.rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.rota_paragens ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.assistencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY rotas_sel ON erp.rotas FOR SELECT TO authenticated
USING (erp.is_ativo() AND (
  erp.perfil_atual()::text <> 'entregador' OR responsavel_id = erp.utilizador_atual()));
CREATE POLICY rotas_ins ON erp.rotas FOR INSERT TO authenticated
WITH CHECK (erp.is_ativo() AND erp.perfil_atual()::text IN ('adm','escritorio'));
CREATE POLICY rotas_upd ON erp.rotas FOR UPDATE TO authenticated
USING (erp.is_ativo() AND (
  erp.perfil_atual()::text <> 'entregador' OR responsavel_id = erp.utilizador_atual()))
WITH CHECK (erp.is_ativo());

CREATE POLICY paragens_sel ON erp.rota_paragens FOR SELECT TO authenticated
USING (erp.is_ativo() AND (erp.perfil_atual()::text <> 'entregador' OR EXISTS (
  SELECT 1 FROM erp.rotas r WHERE r.id = rota_paragens.rota_id
    AND r.responsavel_id = erp.utilizador_atual())));
CREATE POLICY paragens_ins ON erp.rota_paragens FOR INSERT TO authenticated
WITH CHECK (erp.is_ativo() AND erp.perfil_atual()::text IN ('adm','escritorio'));
CREATE POLICY paragens_upd ON erp.rota_paragens FOR UPDATE TO authenticated
USING (erp.is_ativo() AND (erp.perfil_atual()::text <> 'entregador' OR EXISTS (
  SELECT 1 FROM erp.rotas r WHERE r.id = rota_paragens.rota_id
    AND r.responsavel_id = erp.utilizador_atual())))
WITH CHECK (erp.is_ativo());

CREATE POLICY assistencias_sel ON erp.assistencias FOR SELECT TO authenticated
USING (erp.is_ativo() AND (erp.perfil_atual()::text <> 'entregador'
  OR aberta_por = erp.utilizador_atual()
  OR EXISTS (SELECT 1 FROM erp.rota_paragens rp JOIN erp.rotas r ON r.id = rp.rota_id
             WHERE rp.pedido_id = assistencias.pedido_id
               AND r.responsavel_id = erp.utilizador_atual())));
CREATE POLICY assistencias_ins ON erp.assistencias FOR INSERT TO authenticated
WITH CHECK (erp.is_ativo());
CREATE POLICY assistencias_upd ON erp.assistencias FOR UPDATE TO authenticated
USING (erp.is_ativo() AND erp.perfil_atual()::text IN ('adm','escritorio','financeiro'))
WITH CHECK (erp.is_ativo());

-- O entregador só vê as vendas e entregas das suas rotas
DROP POLICY IF EXISTS pedidos_sel ON erp.pedidos;
CREATE POLICY pedidos_sel ON erp.pedidos FOR SELECT TO authenticated
USING (erp.is_ativo() AND (erp.perfil_atual()::text <> 'entregador' OR EXISTS (
  SELECT 1 FROM erp.rota_paragens rp JOIN erp.rotas r ON r.id = rp.rota_id
   WHERE rp.pedido_id = pedidos.id AND r.responsavel_id = erp.utilizador_atual())));

DROP POLICY IF EXISTS entregas_sel ON erp.entregas;
CREATE POLICY entregas_sel ON erp.entregas FOR SELECT TO authenticated
USING (erp.is_ativo() AND (erp.perfil_atual()::text <> 'entregador' OR EXISTS (
  SELECT 1 FROM erp.rota_paragens rp JOIN erp.rotas r ON r.id = rp.rota_id
   WHERE rp.pedido_id = entregas.pedido_id AND r.responsavel_id = erp.utilizador_atual())));

-- ============================== 6. Funções
CREATE OR REPLACE FUNCTION erp.pendente_pedido(p_pedido_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'erp','public' AS $$
  select greatest(round(p.total, 2) - coalesce((
    select sum(pg.valor) from erp.pagamentos pg
     where pg.pedido_id = p.id and pg.eliminado_em is null and pg.estado = 'confirmado'), 0), 0)
  from erp.pedidos p where p.id = p_pedido_id
$$;

CREATE OR REPLACE FUNCTION erp.caixa_da_rota(p_rota_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'erp','public' AS $$
  select c.id from erp.caixas c
   where c.rota_id = p_rota_id and c.eliminado_em is null
   order by c.criado_em desc limit 1
$$;

CREATE OR REPLACE FUNCTION erp.abrir_rota(
  p_nome text, p_responsavel_id uuid, p_pedidos jsonb,
  p_data date DEFAULT NULL, p_viatura text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare
  v_rota uuid; v_i int := 0; v_total numeric(12,2) := 0; v_prev numeric(12,2);
  v_pedido uuid; v_data date := coalesce(p_data, current_date); v_caixa uuid;
begin
  if erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Só o escritório ou a Administração podem montar rotas.';
  end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Dê um nome à rota.'; end if;
  if not exists (select 1 from erp.utilizadores u
                 where u.id = p_responsavel_id and u.ativo and u.eliminado_em is null) then
    raise exception 'O responsável da rota tem de ser um utilizador ativo.';
  end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' or jsonb_array_length(p_pedidos) = 0 then
    raise exception 'Escolha as vendas que entram nesta rota.';
  end if;

  insert into erp.rotas (data, nome, responsavel_id, viatura, estado, aberta_em)
  values (v_data, trim(p_nome), p_responsavel_id, nullif(trim(coalesce(p_viatura,'')),''),
          'em_curso', now())
  returning id into v_rota;

  for v_pedido in select (value #>> '{}')::uuid from jsonb_array_elements(p_pedidos) loop
    if not exists (select 1 from erp.pedidos p where p.id = v_pedido and p.eliminado_em is null
                     and p.estado in ('confirmado','em_preparacao','pronto')) then
      raise exception 'Só entram na rota vendas confirmadas, em preparação ou prontas.';
    end if;
    if exists (select 1 from erp.rota_paragens rp join erp.rotas r on r.id = rp.rota_id
                where rp.pedido_id = v_pedido and rp.eliminado_em is null
                  and rp.desfecho is null and r.estado in ('planeada','em_curso')) then
      raise exception 'Esta venda já está numa rota em curso.';
    end if;
    v_i := v_i + 1;
    select coalesce(sum(pg.valor), 0) into v_prev from erp.pagamentos pg
     where pg.pedido_id = v_pedido and pg.eliminado_em is null
       and pg.estado in ('pendente','pendente_confirmacao');
    if v_prev = 0 then v_prev := erp.pendente_pedido(v_pedido); end if;
    insert into erp.rota_paragens (rota_id, pedido_id, ordem, previsto_receber)
    values (v_rota, v_pedido, v_i, v_prev);
    v_total := v_total + v_prev;
  end loop;

  update erp.rotas set previsto_entregas = v_i, previsto_receber = v_total where id = v_rota;

  v_caixa := erp.caixa_da_rota(v_rota);
  if v_caixa is null then
    insert into erp.caixas (utilizador_id, data, saldo_abertura, saldo_esperado, rota_id)
    values (p_responsavel_id, v_data, 0, 0, v_rota);
  end if;
  return v_rota;
end $$;

CREATE OR REPLACE FUNCTION erp.rota_editavel(p_rota_id uuid)
RETURNS erp.rotas LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare r erp.rotas%rowtype;
begin
  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado in ('fechada','conferida') then
    raise exception 'A rota já foi fechada. Não aceita alterações.';
  end if;
  if r.responsavel_id <> erp.utilizador_atual()
     and erp.perfil_atual()::text not in ('adm','escritorio') then
    raise exception 'Esta rota é de outra pessoa.';
  end if;
  return r;
end $$;

CREATE OR REPLACE FUNCTION erp.registar_recebimento_entrega(p_paragem_id uuid, p_pagamentos jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare
  par erp.rota_paragens%rowtype; r erp.rotas%rowtype; ped erp.pedidos%rowtype;
  v_soma numeric(12,2) := 0; v_pend numeric(12,2); l record; v_caixa uuid; v_ref text;
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

  return round(v_soma, 2);
end $$;

CREATE OR REPLACE FUNCTION erp.registar_saida_rota(
  p_rota_id uuid, p_valor numeric, p_motivo_id uuid,
  p_descricao text DEFAULT NULL, p_comprovativo_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare r erp.rotas%rowtype; v_caixa uuid; v_id uuid;
begin
  r := erp.rota_editavel(p_rota_id);
  if coalesce(p_valor, 0) <= 0 then raise exception 'Indique o valor da saída.'; end if;
  if p_motivo_id is null then raise exception 'Indique o motivo da saída.'; end if;
  v_caixa := erp.caixa_da_rota(p_rota_id);
  if v_caixa is null then raise exception 'Esta rota não tem caixa.'; end if;
  insert into erp.caixa_movimentos (caixa_id, tipo, valor, sentido, motivo_id, descricao,
    comprovativo_url, forma_id)
  values (v_caixa, 'saida', round(p_valor, 2), -1, p_motivo_id,
    nullif(trim(coalesce(p_descricao,'')),''), nullif(trim(coalesce(p_comprovativo_url,'')),''),
    (select id from erp.formas_pagamento where codigo = 'DINHEIRO'))
  returning id into v_id;
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION erp.registar_desfecho_paragem(
  p_paragem_id uuid, p_desfecho text, p_linhas jsonb DEFAULT NULL,
  p_motivo_id uuid DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_data_reagendamento date DEFAULT NULL, p_recebido_por text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare
  par erp.rota_paragens%rowtype; r erp.rotas%rowtype; v_res jsonb; v_entrega uuid;
  v_exige boolean;
begin
  select * into par from erp.rota_paragens where id = p_paragem_id and eliminado_em is null for update;
  if not found then raise exception 'Paragem não encontrada.'; end if;
  r := erp.rota_editavel(par.rota_id);
  if par.desfecho is not null then raise exception 'Esta paragem já está fechada.'; end if;
  if p_desfecho not in ('entregue','parcial','reagendada','cancelada','ausente') then
    raise exception 'Desfecho inválido.';
  end if;

  if p_desfecho in ('reagendada','cancelada','ausente') then
    if p_motivo_id is null then raise exception 'Indique o motivo da lista.'; end if;
    select exige_texto into v_exige from erp.motivos where id = p_motivo_id;
    if coalesce(v_exige, false) and coalesce(trim(coalesce(p_motivo,'')), '') = '' then
      raise exception 'Este motivo exige uma explicação escrita.';
    end if;
  end if;

  if p_desfecho in ('entregue','parcial') then
    if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
      raise exception 'Indique o que foi entregue.';
    end if;
    v_res := erp.registar_entrega(par.pedido_id, p_linhas, r.data, p_recebido_por, p_motivo);
    v_entrega := (v_res->>'entrega_id')::uuid;
  end if;

  if p_desfecho = 'reagendada' then
    if p_data_reagendamento is null then
      raise exception 'Indique a data combinada com o cliente.';
    end if;
    perform set_config('erp.recalculo', '1', true);
    update erp.pedidos
       set data_entrega_prevista = p_data_reagendamento,
           data_entrega_prometida = p_data_reagendamento,
           data_entrega_origem = 'manual', motivo_data_id = p_motivo_id,
           nota_data = nullif(trim(coalesce(p_motivo,'')),'')
     where id = par.pedido_id;
    perform set_config('erp.recalculo', '', true);
  end if;

  update erp.rota_paragens
     set desfecho = p_desfecho, motivo_id = p_motivo_id,
         motivo = nullif(trim(coalesce(p_motivo,'')),''),
         data_reagendamento = p_data_reagendamento,
         entrega_id = v_entrega, concluida_em = now()
   where id = p_paragem_id;

  return jsonb_build_object('paragem_id', p_paragem_id, 'desfecho', p_desfecho,
    'entrega_id', v_entrega);
end $$;

CREATE OR REPLACE FUNCTION erp.abrir_assistencia(
  p_pedido_id uuid, p_origem text, p_motivo text, p_descricao text,
  p_pedido_item_id uuid DEFAULT NULL, p_entrega_id uuid DEFAULT NULL,
  p_paragem_id uuid DEFAULT NULL, p_peca_afetada text DEFAULT NULL,
  p_fotos jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare v_id uuid;
begin
  if not erp.is_ativo() then raise exception 'A sua conta não tem acesso ativo.'; end if;
  if coalesce(trim(coalesce(p_motivo,'')), '') = '' then
    raise exception 'Indique o motivo da assistência.';
  end if;
  if coalesce(trim(coalesce(p_descricao,'')), '') = '' then
    raise exception 'Descreva o problema.';
  end if;
  insert into erp.assistencias (pedido_id, pedido_item_id, entrega_id, paragem_id, origem,
    motivo, peca_afetada, descricao, fotos, aberta_por)
  values (p_pedido_id, p_pedido_item_id, p_entrega_id, p_paragem_id, p_origem,
    trim(p_motivo), nullif(trim(coalesce(p_peca_afetada,'')),''), trim(p_descricao),
    p_fotos, erp.utilizador_atual())
  returning id into v_id;
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION erp.atualizar_assistencia(
  p_assistencia_id uuid, p_estado text, p_nota text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
begin
  if erp.perfil_atual()::text not in ('adm','escritorio','financeiro') then
    raise exception 'Só o escritório ou a Administração tratam assistências.';
  end if;
  update erp.assistencias
     set estado = p_estado,
         nota_resolucao = coalesce(nullif(trim(coalesce(p_nota,'')),''), nota_resolucao),
         resolvida_em = case when p_estado in ('resolvida','cancelada') then now() else null end
   where id = p_assistencia_id and eliminado_em is null;
  if not found then raise exception 'Assistência não encontrada.'; end if;
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
   where pg.caixa_id = v_caixa and pg.eliminado_em is null
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

CREATE OR REPLACE FUNCTION erp.fechar_rota(
  p_rota_id uuid, p_valor_envelope numeric, p_justificacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare r erp.rotas%rowtype; c jsonb; v_esp numeric(12,2); v_caixa uuid;
begin
  r := erp.rota_editavel(p_rota_id);
  if p_valor_envelope is null then raise exception 'Declare o valor que põe no envelope.'; end if;
  c := erp.contas_da_rota(p_rota_id);
  v_esp := (c->>'esperado_envelope')::numeric;
  if round(p_valor_envelope, 2) <> v_esp
     and coalesce(trim(coalesce(p_justificacao,'')), '') = '' then
    raise exception 'A conta da rota dá % €. Escreva a justificação da diferença para fechar.',
      to_char(v_esp, 'FM999999990.00');
  end if;

  update erp.rotas
     set estado = 'fechada', fechada_em = now(), fechada_por = auth.uid(),
         realizado_entregas = (c->>'entregas')::int,
         realizado_recebido = (c->>'recebido')::numeric,
         realizado_dinheiro = (c->>'dinheiro')::numeric,
         realizado_saidas = (c->>'saidas')::numeric,
         esperado_envelope = v_esp,
         valor_envelope = round(p_valor_envelope, 2),
         justificacao_diferenca = nullif(trim(coalesce(p_justificacao,'')),'')
   where id = p_rota_id;

  v_caixa := erp.caixa_da_rota(p_rota_id);
  if v_caixa is not null then
    perform erp.recalcular_caixa(v_caixa);
    update erp.caixas set estado = 'fechado', saldo_contado = round(p_valor_envelope, 2),
      diferenca = round(p_valor_envelope, 2) - v_esp,
      justificacao_diferenca = nullif(trim(coalesce(p_justificacao,'')),''),
      fechado_em = now(), fechado_por = auth.uid()
     where id = v_caixa and estado = 'aberto';
  end if;

  return c || jsonb_build_object('valor_envelope', round(p_valor_envelope, 2));
end $$;

CREATE OR REPLACE FUNCTION erp.conferir_rota(
  p_rota_id uuid, p_valor_contado numeric, p_justificacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'erp','public' AS $$
declare r erp.rotas%rowtype; v_dif numeric(12,2);
begin
  if erp.perfil_atual()::text not in ('adm','financeiro') then
    raise exception 'Só o financeiro ou a Administração conferem envelopes.';
  end if;
  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado <> 'fechada' then
    raise exception 'Só se confere uma rota já fechada pelo entregador.';
  end if;
  if p_valor_contado is null then raise exception 'Indique o dinheiro contado.'; end if;
  v_dif := round(p_valor_contado, 2) - coalesce(r.valor_envelope, 0);
  if v_dif <> 0 and coalesce(trim(coalesce(p_justificacao,'')), '') = '' then
    raise exception 'Há uma diferença de % €. A justificação é obrigatória.',
      to_char(v_dif, 'FM999999990.00');
  end if;
  update erp.rotas set estado = 'conferida', conferida_em = now(), conferida_por = auth.uid(),
    valor_conferido = round(p_valor_contado, 2), diferenca = v_dif,
    justificacao_diferenca = coalesce(nullif(trim(coalesce(p_justificacao,'')),''),
      justificacao_diferenca)
   where id = p_rota_id;
  return jsonb_build_object('declarado', coalesce(r.valor_envelope, 0),
    'contado', round(p_valor_contado, 2), 'diferenca', v_dif);
end $$;

-- ============================== 7. Views
CREATE VIEW erp.v_rotas WITH (security_invoker = true) AS
SELECT r.*, u.nome AS responsavel,
  (SELECT count(*) FROM erp.rota_paragens rp
    WHERE rp.rota_id = r.id AND rp.eliminado_em IS NULL) AS paragens,
  (SELECT count(*) FROM erp.rota_paragens rp
    WHERE rp.rota_id = r.id AND rp.eliminado_em IS NULL AND rp.desfecho IS NOT NULL) AS paragens_fechadas,
  erp.caixa_da_rota(r.id) AS caixa_id
FROM erp.rotas r
LEFT JOIN erp.utilizadores u ON u.id = r.responsavel_id
WHERE r.eliminado_em IS NULL;

CREATE VIEW erp.v_rota_paragens WITH (security_invoker = true) AS
SELECT rp.*, r.data AS rota_data, r.nome AS rota_nome, r.estado AS rota_estado,
  r.responsavel_id, p.numero AS pedido_numero, p.estado AS pedido_estado, p.total,
  p.total_pago, erp.pendente_pedido(p.id) AS pendente,
  p.morada_entrega, p.localidade_entrega, p.cp4_entrega, p.cp3_entrega,
  p.contacto_entrega, p.notas_entrega, p.entrega_domicilio,
  c.nome AS cliente, c.telefone_e164 AS cliente_telefone, c.telefone_alt AS cliente_telefone_alt,
  m.descricao AS motivo_descricao
FROM erp.rota_paragens rp
JOIN erp.rotas r ON r.id = rp.rota_id
JOIN erp.pedidos p ON p.id = rp.pedido_id
LEFT JOIN erp.clientes c ON c.id = p.cliente_id
LEFT JOIN erp.motivos m ON m.id = rp.motivo_id
WHERE rp.eliminado_em IS NULL;

CREATE VIEW erp.v_rota_movimentos WITH (security_invoker = true) AS
SELECT cm.id, c.rota_id, cm.criado_em, cm.tipo, cm.valor, cm.sentido, cm.pedido_id,
  cm.pagamento_id, cm.descricao, cm.comprovativo_url, f.nome AS forma, m.descricao AS motivo
FROM erp.caixa_movimentos cm
JOIN erp.caixas c ON c.id = cm.caixa_id
LEFT JOIN erp.formas_pagamento f ON f.id = cm.forma_id
LEFT JOIN erp.motivos m ON m.id = cm.motivo_id
WHERE cm.eliminado_em IS NULL AND c.rota_id IS NOT NULL;

CREATE VIEW erp.v_assistencias WITH (security_invoker = true) AS
SELECT a.*, p.numero AS pedido_numero, cl.nome AS cliente,
  pi.descricao AS item_descricao, u.nome AS aberta_por_nome
FROM erp.assistencias a
JOIN erp.pedidos p ON p.id = a.pedido_id
LEFT JOIN erp.clientes cl ON cl.id = p.cliente_id
LEFT JOIN erp.pedido_itens pi ON pi.id = a.pedido_item_id
LEFT JOIN erp.utilizadores u ON u.id = a.aberta_por
WHERE a.eliminado_em IS NULL;

CREATE VIEW erp.v_rota_contas WITH (security_invoker = true) AS
SELECT r.id AS rota_id, r.data, r.nome, r.estado, r.responsavel_id, u.nome AS responsavel,
  r.previsto_entregas, r.previsto_receber,
  (erp.contas_da_rota(r.id) ->> 'entregas')::int AS entregas_feitas,
  (erp.contas_da_rota(r.id) ->> 'reagendadas')::int AS reagendadas,
  (erp.contas_da_rota(r.id) ->> 'nao_entregues')::int AS nao_entregues,
  (erp.contas_da_rota(r.id) ->> 'recebido')::numeric(12,2) AS recebido,
  (erp.contas_da_rota(r.id) ->> 'dinheiro')::numeric(12,2) AS dinheiro,
  (erp.contas_da_rota(r.id) ->> 'saidas')::numeric(12,2) AS saidas,
  (erp.contas_da_rota(r.id) ->> 'esperado_envelope')::numeric(12,2) AS esperado_envelope,
  r.valor_envelope, r.valor_conferido, r.diferenca, r.justificacao_diferenca,
  r.fechada_em, r.conferida_em
FROM erp.rotas r
LEFT JOIN erp.utilizadores u ON u.id = r.responsavel_id
WHERE r.eliminado_em IS NULL;

GRANT SELECT ON erp.v_rotas, erp.v_rota_paragens, erp.v_rota_movimentos,
  erp.v_assistencias, erp.v_rota_contas TO authenticated;
GRANT ALL ON erp.v_rotas, erp.v_rota_paragens, erp.v_rota_movimentos,
  erp.v_assistencias, erp.v_rota_contas TO service_role;