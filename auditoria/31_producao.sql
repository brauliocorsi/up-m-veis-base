-- ============================================================
-- Fase 11 — Produção
-- Testes [T11]. Executar numa base descartável.
-- ============================================================
\set ON_ERROR_STOP on
\ir 00_setup.sql
set search_path = erp, public;

-- entrar como Administração: abrir e planear ordens é trabalho de escritório
select pg_temp.entra('adm');

-- T11.0 estrutura -------------------------------------------------------------
do $$
declare v_t text;
begin
  foreach v_t in array array['etapas_producao','ordens_producao','op_etapas',
                             'necessidades_producao','componentes','op_consumos']
  loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='erp' and table_name=v_t) then
      raise exception '[T11] falta erp.%', v_t;
    end if;
  end loop;
  if not exists (select 1 from pg_type where typname='estado_op') then
    raise exception '[T11] falta o enum erp.estado_op';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
                 where t.typname='perfil' and e.enumlabel='producao') then
    raise exception '[T11] falta o perfil producao';
  end if;
  raise notice '[T11.0] estrutura OK';
end $$;

-- T11.1 auditoria, eliminação lógica, RLS e DELETE ---------------------------
do $$
declare v_t text;
begin
  foreach v_t in array array['etapas_producao','ordens_producao','op_etapas',
                             'necessidades_producao','componentes','op_consumos']
  loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='erp' and table_name=v_t and column_name='eliminado_em') then
      raise exception '[T11] % sem eliminação lógica', v_t;
    end if;
    if not exists (select 1 from pg_trigger tg
                    join pg_class c on c.oid=tg.tgrelid
                    join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='erp' and c.relname=v_t and not tg.tgisinternal) then
      raise exception '[T11] % sem triggers de auditoria', v_t;
    end if;
    if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='erp' and c.relname=v_t) then
      raise exception '[T11] % sem RLS', v_t;
    end if;
    if has_table_privilege('authenticated','erp.'||v_t,'DELETE') then
      raise exception '[T11] % com DELETE concedido', v_t;
    end if;
  end loop;
  raise notice '[T11.1] auditoria, RLS e DELETE OK';
end $$;

-- T11.2 security_invoker em todas as views novas -----------------------------
do $$
declare v_v text;
begin
  foreach v_v in array array['v_etapas_producao','v_necessidades_producao','v_ordens_producao',
                             'v_op_etapas','v_componentes','v_op_consumos','v_chao_fabrica']
  loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='erp' and c.relname=v_v
         and array_to_string(c.reloptions,',') like '%security_invoker=true%') then
      raise exception '[T11] % sem security_invoker', v_v;
    end if;
  end loop;
  raise notice '[T11.2] security_invoker OK';
end $$;

-- T11.3 etapas semeadas pela ordem do fabrico --------------------------------
do $$
declare v_c text;
begin
  foreach v_c in array array['CORTE','COSTURA','ESTRUTURA','BRANCO','ESTOFAGEM',
                             'QUALIDADE','EMBALAGEM']
  loop
    if not exists (select 1 from erp.etapas_producao where codigo=v_c and eliminado_em is null) then
      raise exception '[T11] falta a etapa %', v_c;
    end if;
  end loop;
  if (select ordem from erp.etapas_producao where codigo='CORTE')
     >= (select ordem from erp.etapas_producao where codigo='EMBALAGEM') then
    raise exception '[T11] a sequência das etapas está trocada';
  end if;
  if not (select exige_conferencia from erp.etapas_producao where codigo='ESTRUTURA')
     or not (select exige_conferencia from erp.etapas_producao where codigo='COSTURA') then
    raise exception '[T11] estrutura e costura têm de exigir conferência';
  end if;
  raise notice '[T11.3] etapas semeadas OK';
end $$;

-- T11.4 produção vs compra na confirmação da venda ---------------------------
do $$
declare v_def text := pg_get_functiondef('erp.confirmar_pedido(uuid)'::regprocedure);
begin
  if v_def not like '%necessidades_producao%' then
    raise exception '[T11] confirmar_pedido não gera necessidades de produção';
  end if;
  if v_def not like '%necessidades_compra%' then
    raise exception '[T11] confirmar_pedido deixou de gerar necessidades de compra';
  end if;
  -- o ramo de compra tem de ser explícito, não um else que apanha tudo
  if v_def not like '%''compra''%' or v_def not like '%''producao''%' then
    raise exception '[T11] os ramos de compra e de produção não estão separados';
  end if;
  raise notice '[T11.4] ramos de fornecimento OK';
end $$;

-- T11.5 agrupamento de necessidades numa só OP -------------------------------
do $$
declare
  v_cat uuid; v_prod uuid; v_op uuid; v_qt int;
begin
  select id into v_cat from erp.categorias where eliminado_em is null limit 1;
  if v_cat is null then
    insert into erp.categorias (codigo, nome, ordem, ativo)
    values ('T11CAT','Teste produção',99,true) returning id into v_cat;
  end if;

  insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento,
                            prazo_producao_dias, n_colis, iva_pct, preco_base, vendavel, ativo)
  values ('T11-CAMA', v_cat, 'Cama de teste T11', 'producao', 10, 1, 23, 500, true, true)
  returning id into v_prod;

  insert into erp.necessidades_producao (produto_id, quantidade, data_necessaria, estado, origem)
  values (v_prod, 1, current_date + 10, 'aberta', 'venda'),
         (v_prod, 1, current_date + 12, 'aberta', 'venda'),
         (v_prod, 1, current_date + 14, 'aberta', 'venda');

  select erp.criar_op(v_prod, array(select id from erp.necessidades_producao
                                     where produto_id=v_prod and estado='aberta'))
    into v_op;

  select quantidade into v_qt from erp.ordens_producao where id=v_op;
  if v_qt <> 3 then
    raise exception '[T11] três vendas deviam dar uma OP de 3 unidades, deu %', v_qt;
  end if;
  if exists (select 1 from erp.necessidades_producao
              where produto_id=v_prod and estado='aberta') then
    raise exception '[T11] as necessidades deviam ficar convertidas';
  end if;
  if not exists (select 1 from erp.op_etapas where op_id=v_op) then
    raise exception '[T11] a OP nasceu sem etapas';
  end if;
  raise notice '[T11.5] agrupamento em OP OK';
end $$;

-- T11.6 consumo de componentes ao concluir a etapa ---------------------------
do $$
declare
  v_prod uuid; v_comp uuid; v_cat uuid; v_etapa uuid; v_op uuid; v_op_etapa uuid;
  v_consumido numeric; v_falta numeric;
begin
  select categoria_id, id into v_cat, v_prod from erp.produtos where cod_barras='T11-CAMA';
  select id into v_etapa from erp.etapas_producao where codigo='CORTE';

  insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento,
                            n_colis, iva_pct, vendavel, ativo)
  values ('T11-TECIDO', v_cat, 'Tecido de teste T11', 'stock', 1, 23, false, true)
  returning id into v_comp;

  perform erp.gravar_componente(null, v_prod, v_comp, 4, 'm', v_etapa, null);

  select id into v_op from erp.ordens_producao
   where produto_id=v_prod order by criado_em desc limit 1;
  select id into v_op_etapa from erp.op_etapas where op_id=v_op and etapa_id=v_etapa;

  perform erp.iniciar_etapa(v_op_etapa);
  perform erp.concluir_etapa(v_op_etapa, 3, 0, null, null);

  select quantidade_consumida, quantidade_falta into v_consumido, v_falta
    from erp.op_consumos where op_id=v_op and componente_id=v_comp;
  if v_consumido is null then
    raise exception '[T11] a etapa não registou consumo de componentes';
  end if;
  if v_falta is null or v_falta <= 0 then
    raise exception '[T11] sem stock do componente a falta devia ficar registada';
  end if;
  if (select estado from erp.op_etapas where id=v_op_etapa) <> 'concluida' then
    raise exception '[T11] a falta de stock não devia bloquear a fábrica';
  end if;
  raise notice '[T11.6] consumo de componentes e falta registada OK';
end $$;

-- T11.7 deteção de ciclos na lista de materiais ------------------------------
do $$
declare v_prod uuid; v_comp uuid; v_erro boolean := false;
begin
  select id into v_prod from erp.produtos where cod_barras='T11-CAMA';
  select id into v_comp from erp.produtos where cod_barras='T11-TECIDO';
  begin
    perform erp.gravar_componente(null, v_comp, v_prod, 1, 'un', null, null);
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception '[T11] um ciclo indireto na lista de materiais foi aceite';
  end if;

  v_erro := false;
  begin
    perform erp.gravar_componente(null, v_prod, v_prod, 1, 'un', null, null);
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception '[T11] um produto foi aceite como componente de si próprio';
  end if;
  raise notice '[T11.7] deteção de ciclos OK';
end $$;

-- T11.8 conclusão parcial e reserva pela necessidade da venda ----------------
do $$
declare
  v_prod uuid; v_op uuid; v_e record; v_res jsonb; v_estado erp.estado_op;
begin
  select id into v_prod from erp.produtos where cod_barras='T11-CAMA';
  select id into v_op from erp.ordens_producao
   where produto_id=v_prod order by criado_em desc limit 1;

  for v_e in select id from erp.op_etapas where op_id=v_op and estado <> 'concluida' order by ordem
  loop
    perform erp.concluir_etapa(v_e.id, 3, 0, null, null);
  end loop;
  for v_e in select id from erp.op_etapas oe
              join erp.etapas_producao e on e.id=oe.etapa_id
             where oe.op_id=v_op and e.exige_conferencia and oe.conferida_por is null
  loop
    perform erp.conferir_etapa(v_e.id);
  end loop;

  -- conclusão parcial: 1 de 3
  select erp.concluir_op(v_op, 1) into v_res;
  select estado into v_estado from erp.ordens_producao where id=v_op;
  if v_estado <> 'em_curso' then
    raise exception '[T11] conclusão parcial devia manter a OP em curso, ficou %', v_estado;
  end if;
  if (v_res->>'produzido')::int <> 1 then
    raise exception '[T11] conclusão parcial devia dar entrada de 1 unidade';
  end if;
  if not exists (select 1 from erp.stock_movimentos
                  where origem='producao' and documento_id=v_op) then
    raise exception '[T11] a conclusão não deu entrada em stock';
  end if;

  -- resto: reserva só o que as vendas precisam, o excedente fica vendável
  select erp.concluir_op(v_op, 2) into v_res;
  if (v_res->>'reservado')::int > (v_res->>'produzido')::int then
    raise exception '[T11] reservou mais do que produziu';
  end if;
  if (select estado from erp.ordens_producao where id=v_op) <> 'concluida' then
    raise exception '[T11] a OP devia ficar concluída';
  end if;
  raise notice '[T11.8] conclusão parcial, entrada em stock e reserva OK';
end $$;

-- T11.9 concluir sem as etapas obrigatórias é recusado -----------------------
do $$
declare v_prod uuid; v_op uuid; v_erro boolean := false;
begin
  select id into v_prod from erp.produtos where cod_barras='T11-CAMA';
  select erp.criar_op(v_prod, null, 1) into v_op;
  begin
    perform erp.concluir_op(v_op, 1);
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception '[T11] concluir a OP sem as etapas obrigatórias foi aceite';
  end if;
  perform erp.cancelar_op(v_op, 'Teste T11');
  raise notice '[T11.9] etapas obrigatórias OK';
end $$;

-- T11.10 isolamento do perfil de produção ------------------------------------
do $$
declare v_p text;
begin
  foreach v_p in array array['produto_custos','pagamentos','contas_pagar','ordens_compra','oc_itens']
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname='erp' and tablename=v_p
         and (qual like '%perfil%' or qual like '%tem_perfil%' or qual like '%perfil_atual%')) then
      raise exception '[T11] % sem política por perfil', v_p;
    end if;
    if exists (
      select 1 from pg_policies
       where schemaname='erp' and tablename=v_p and cmd in ('SELECT','ALL')
         and qual like '%''producao''%') then
      raise exception '[T11] o perfil producao consegue ler %', v_p;
    end if;
  end loop;
  if not exists (select 1 from pg_policies
                  where schemaname='erp' and tablename='ordens_producao'
                    and qual like '%producao%') then
    raise exception '[T11] o perfil producao não consegue ler as ordens de produção';
  end if;
  raise notice '[T11.10] isolamento do perfil de produção OK';
end $$;

-- ============================================================
-- Fim dos testes [T11]
-- ============================================================
