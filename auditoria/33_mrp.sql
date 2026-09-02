-- ============================================================
-- Fase 11b — MRP: capacidade, explosão da BOM e planeamento
-- Testes [T13]. Executar numa base descartável.
-- ============================================================
\set ON_ERROR_STOP on
\ir 00_setup.sql
set search_path = erp, public;

-- entrar como Administração: o MRP é trabalho de escritório
select pg_temp.entra('adm');

-- T13.0 estrutura -------------------------------------------------------------
do $$
declare v_t text;
begin
  foreach v_t in array array['centros_trabalho','centro_operadores','produto_roteiro',
                             'planos_producao','plano_linhas','plano_carga']
  loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='erp' and table_name=v_t) then
      raise exception '[T13] falta erp.%', v_t;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='erp' and table_name=v_t and column_name='eliminado_em') then
      raise exception '[T13] % sem eliminação lógica', v_t;
    end if;
    if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='erp' and c.relname=v_t) then
      raise exception '[T13] % sem RLS', v_t;
    end if;
    if has_table_privilege('authenticated','erp.'||v_t,'DELETE') then
      raise exception '[T13] % com DELETE concedido', v_t;
    end if;
  end loop;

  foreach v_t in array array['plano_id','destino','op_pai_id']
  loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='erp' and table_name='ordens_producao' and column_name=v_t) then
      raise exception '[T13] ordens_producao sem %', v_t;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
                 where table_schema='erp' and table_name='etapas_producao' and column_name='centro_id') then
    raise exception '[T13] etapas_producao sem centro_id';
  end if;
  raise notice '[T13.0] estrutura do MRP OK';
end $$;

-- T13.1 views novas com security_invoker -------------------------------------
do $$
declare v_v text;
begin
  foreach v_v in array array['v_centros_trabalho','v_centro_operadores','v_produto_roteiro',
                             'v_planos_producao','v_plano_linhas','v_plano_carga','v_consumos_falta']
  loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='erp' and c.relname=v_v and c.relkind='v') then
      raise exception '[T13] falta a view erp.%', v_v;
    end if;
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='erp' and c.relname=v_v
                     and 'security_invoker=true' = any(c.reloptions)) then
      raise exception '[T13] erp.% sem security_invoker', v_v;
    end if;
  end loop;
  raise notice '[T13.1] views do MRP com security_invoker OK';
end $$;

-- dados de trabalho -----------------------------------------------------------
do $$
declare
  v_cat uuid; v_centro_corte uuid; v_centro_cost uuid; v_forn uuid;
begin
  select id into v_cat from erp.categorias where eliminado_em is null limit 1;
  if v_cat is null then
    insert into erp.categorias (codigo, nome, ordem, ativo)
    values ('T13CAT','Teste MRP',98,true) returning id into v_cat;
  end if;

  -- sofá final -> estrutura (fabrico) + tecido (compra); estrutura -> madeira (compra)
  insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento,
                            prazo_producao_dias, n_colis, iva_pct, preco_base, vendavel, ativo)
  values ('T13-SOFA', v_cat, 'Sofá T13', 'producao', 15, 1, 23, 900, true, true);

  insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento,
                            prazo_producao_dias, n_colis, iva_pct, vendavel, ativo)
  values ('T13-ESTRUTURA', v_cat, 'Estrutura T13', 'producao', 5, 1, 23, false, true);

  select id into v_forn from erp.fornecedores where eliminado_em is null limit 1;
  if v_forn is null then
    insert into erp.fornecedores (nome, prazo_dias) values ('Fornecedor T13', 10) returning id into v_forn;
  end if;

  insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento,
                            fornecedor_id, prazo_fornecedor_dias, n_colis, iva_pct, vendavel, ativo)
  values ('T13-TECIDO', v_cat, 'Tecido T13', 'compra', v_forn, 10, 1, 23, false, true),
         ('T13-MADEIRA', v_cat, 'Madeira T13', 'compra', v_forn, 10, 1, 23, false, true),
         ('T13-ESPUMA', v_cat, 'Espuma T13', 'compra', v_forn, 10, 1, 23, false, true);

  perform erp.gravar_componente(null,
    (select id from erp.produtos where cod_barras='T13-SOFA'),
    (select id from erp.produtos where cod_barras='T13-ESTRUTURA'), 1, 'un', null, null);
  perform erp.gravar_componente(null,
    (select id from erp.produtos where cod_barras='T13-SOFA'),
    (select id from erp.produtos where cod_barras='T13-TECIDO'), 6, 'm', null, null);
  perform erp.gravar_componente(null,
    (select id from erp.produtos where cod_barras='T13-SOFA'),
    (select id from erp.produtos where cod_barras='T13-ESPUMA'), 2, 'un', null, null);
  perform erp.gravar_componente(null,
    (select id from erp.produtos where cod_barras='T13-ESTRUTURA'),
    (select id from erp.produtos where cod_barras='T13-MADEIRA'), 4, 'un', null, null);

  -- espuma com stock: a explosão tem de parar aqui
  insert into erp.stock_movimentos (produto_id, tipo, quantidade, origem, chave_idempotencia, motivo)
  values ((select id from erp.produtos where cod_barras='T13-ESPUMA'), 'entrada', 100, 'manual',
          'T13-ESPUMA-ENTRADA', 'Teste T13');


  select id into v_centro_corte from erp.centros_trabalho where codigo='CORTE';
  select id into v_centro_cost from erp.centros_trabalho where codigo='COSTURA';
  if v_centro_corte is null then
    select erp.gravar_centro(null,'T13CORTE','Corte T13',null,480,1,100,true) into v_centro_corte;
  end if;
  if v_centro_cost is null then
    select erp.gravar_centro(null,'T13COST','Costura T13',null,480,1,100,true) into v_centro_cost;
  end if;
  raise notice '[T13] dados de trabalho criados';
end $$;

-- T13.2 explosão multinível da BOM -------------------------------------------
do $$
declare v_sofa uuid; v_n int; v_madeira numeric;
begin
  select id into v_sofa from erp.produtos where cod_barras='T13-SOFA';
  select count(*) into v_n from erp.explodir_bom(v_sofa, 2);
  if v_n < 4 then
    raise exception '[T13] a explosão não desceu à segunda linha da BOM (deu % linhas)', v_n;
  end if;
  -- 2 sofás -> 2 estruturas -> 8 madeiras
  select quantidade_necessaria into v_madeira from erp.explodir_bom(v_sofa, 2)
   where produto_id = (select id from erp.produtos where cod_barras='T13-MADEIRA');
  if v_madeira is null or v_madeira <> 8 then
    raise exception '[T13] 2 sofás deviam pedir 8 madeiras, pediram %', coalesce(v_madeira::text,'nada');
  end if;
  if not exists (select 1 from erp.explodir_bom(v_sofa, 2)
                  where produto_id=(select id from erp.produtos where cod_barras='T13-ESTRUTURA')
                    and nivel = 1) then
    raise exception '[T13] a estrutura devia estar no primeiro nível';
  end if;
  if not exists (select 1 from erp.explodir_bom(v_sofa, 2)
                  where produto_id=(select id from erp.produtos where cod_barras='T13-MADEIRA')
                    and nivel = 2) then
    raise exception '[T13] a madeira devia estar no segundo nível';
  end if;
  raise notice '[T13.2] explosão multinível OK';
end $$;

-- T13.3 a explosão pára onde há stock ----------------------------------------
do $$
declare v_sofa uuid; v_l record;
begin
  select id into v_sofa from erp.produtos where cod_barras='T13-SOFA';
  select * into v_l from erp.explodir_bom(v_sofa, 2)
   where produto_id=(select id from erp.produtos where cod_barras='T13-ESPUMA');
  if v_l.em_falta <> 0 then
    raise exception '[T13] com 100 em stock a espuma não devia faltar, faltam %', v_l.em_falta;
  end if;
  if v_l.rota <> 'stock' then
    raise exception '[T13] a espuma com stock devia ter rota stock, tem %', v_l.rota;
  end if;
  -- a estrutura não tem stock e tem BOM: fabrica-se
  if (select rota from erp.explodir_bom(v_sofa, 2)
       where produto_id=(select id from erp.produtos where cod_barras='T13-ESTRUTURA')) <> 'produzir' then
    raise exception '[T13] a estrutura devia ser para fabricar';
  end if;
  if (select rota from erp.explodir_bom(v_sofa, 2)
       where produto_id=(select id from erp.produtos where cod_barras='T13-TECIDO')) <> 'comprar' then
    raise exception '[T13] o tecido devia ser para comprar';
  end if;
  raise notice '[T13.3] paragem por stock e rotas OK';
end $$;

-- T13.4 agrupamento de necessidades numa linha por produto -------------------
do $$
declare v_sofa uuid; v_plano uuid; v_n int; v_linhas int; v_qt int;
begin
  select id into v_sofa from erp.produtos where cod_barras='T13-SOFA';

  insert into erp.necessidades_producao (produto_id, quantidade, data_necessaria, estado, origem)
  values (v_sofa, 1, current_date + 5, 'aberta', 'venda'),
         (v_sofa, 2, current_date + 6, 'aberta', 'venda');

  select erp.criar_plano('Plano T13', current_date, current_date + 6, 'Teste') into v_plano;
  select erp.agrupar_necessidades_no_plano(v_plano) into v_n;
  if v_n <> 1 then
    raise exception '[T13] duas necessidades do mesmo sofá deviam dar 1 linha, deram %', v_n;
  end if;
  select count(*), sum(quantidade) into v_linhas, v_qt
    from erp.plano_linhas where plano_id=v_plano and eliminado_em is null;
  if v_linhas <> 1 or v_qt <> 3 then
    raise exception '[T13] esperava 1 linha de 3 unidades, tenho % linha(s) de %', v_linhas, v_qt;
  end if;
  if (select array_length(necessidade_ids,1) from erp.plano_linhas where plano_id=v_plano) <> 2 then
    raise exception '[T13] a linha devia guardar as duas necessidades de origem';
  end if;
  raise notice '[T13.4] agrupamento de necessidades OK';
end $$;

-- T13.5 setup conta uma vez, tempo unitário conta por unidade ----------------
do $$
declare
  v_sofa uuid; v_centro uuid; v_etapa uuid; v_plano uuid;
  v_min_3 numeric; v_min_esperado numeric;
begin
  select id into v_sofa from erp.produtos where cod_barras='T13-SOFA';
  select id into v_etapa from erp.etapas_producao where eliminado_em is null and centro_id is not null
   order by ordem limit 1;
  select centro_id into v_centro from erp.etapas_producao where id=v_etapa;

  -- setup 60, unitário 30: 3 unidades = 60 + 90 = 150 minutos
  perform erp.gravar_roteiro(null, v_sofa, v_etapa, 1, 60, 30, 'Teste T13');

  select id into v_plano from erp.planos_producao where nome='Plano T13';
  perform erp.simular_plano(v_plano);

  select minutos_necessarios into v_min_3
    from erp.plano_carga where plano_id=v_plano and centro_id=v_centro;
  if v_min_3 is null then
    raise exception '[T13] a simulação não calculou carga para o centro da etapa';
  end if;
  if v_min_3 < 150 then
    raise exception '[T13] 3 unidades com setup 60 e 30/un. dão pelo menos 150 min, deu %', v_min_3;
  end if;
  -- se o setup contasse por unidade seriam 60*3 + 90 = 270
  if v_min_3 >= 270 then
    raise exception '[T13] o setup está a contar por unidade (deu % min)', v_min_3;
  end if;
  raise notice '[T13.5] setup uma vez e unitário por peça OK (% min)', v_min_3;
end $$;

-- T13.6 a simulação não tem efeitos secundários ------------------------------
do $$
declare
  v_plano uuid; v_ops_antes int; v_ops_depois int;
  v_mov_antes int; v_mov_depois int; v_nec_antes int; v_nec_depois int;
  v_c1 numeric; v_c2 numeric; v_estado text;
begin
  select id into v_plano from erp.planos_producao where nome='Plano T13';
  select count(*) into v_ops_antes from erp.ordens_producao;
  select count(*) into v_mov_antes from erp.stock_movimentos;
  select count(*) into v_nec_antes from erp.necessidades_compra;
  select minutos_necessarios into v_c1 from erp.plano_carga where plano_id=v_plano limit 1;

  perform erp.simular_plano(v_plano);
  perform erp.simular_plano(v_plano);

  select count(*) into v_ops_depois from erp.ordens_producao;
  select count(*) into v_mov_depois from erp.stock_movimentos;
  select count(*) into v_nec_depois from erp.necessidades_compra;
  select minutos_necessarios into v_c2 from erp.plano_carga where plano_id=v_plano limit 1;
  select estado into v_estado from erp.planos_producao where id=v_plano;

  if v_ops_depois <> v_ops_antes then raise exception '[T13] simular criou ordens de produção'; end if;
  if v_mov_depois <> v_mov_antes then raise exception '[T13] simular mexeu no stock'; end if;
  if v_nec_depois <> v_nec_antes then raise exception '[T13] simular criou necessidades de compra'; end if;
  if v_c1 is distinct from v_c2 then raise exception '[T13] simular duas vezes deu contas diferentes'; end if;
  if v_estado not in ('simulado','rascunho') then
    raise exception '[T13] simular mudou o plano para %', v_estado;
  end if;
  raise notice '[T13.6] simulação sem efeitos secundários OK';
end $$;

-- T13.7 aprovação: OPs, sub-OPs, compras e destino ---------------------------
do $$
declare
  v_plano uuid; v_res jsonb; v_op uuid; v_sub uuid; v_erro boolean := false;
begin
  select id into v_plano from erp.planos_producao where nome='Plano T13';

  -- sem simulação não se aprova (já está simulado, testa-se o plano novo)
  declare v_outro uuid;
  begin
    select erp.criar_plano('Plano T13 sem simular', current_date, current_date + 6, null) into v_outro;
    perform erp.gravar_plano_linha(null, v_outro,
      (select id from erp.produtos where cod_barras='T13-SOFA'), 1, 5, false, null);
    begin
      perform erp.aprovar_plano(v_outro, null);
    exception when others then v_erro := true;
    end;
    if not v_erro then raise exception '[T13] aprovou um plano sem simulação'; end if;
  end;

  select erp.aprovar_plano(v_plano, null) into v_res;
  if (v_res->>'ops')::int < 1 then raise exception '[T13] a aprovação não criou ordens'; end if;
  if (v_res->>'sub_ops')::int < 1 then
    raise exception '[T13] a estrutura sem stock devia gerar sub-ordem automática';
  end if;
  if (v_res->>'compras')::int < 1 then
    raise exception '[T13] o tecido em falta devia gerar necessidade de compra';
  end if;

  select op_id into v_op from erp.plano_linhas where plano_id=v_plano and eliminado_em is null limit 1;
  if (select destino from erp.ordens_producao where id=v_op) <> 'cliente' then
    raise exception '[T13] uma OP que vem de vendas tem destino cliente';
  end if;

  select id into v_sub from erp.ordens_producao where op_pai_id=v_op limit 1;
  if v_sub is null then raise exception '[T13] a sub-OP não ficou ligada à OP pai'; end if;
  if (select destino from erp.ordens_producao where id=v_sub) <> 'stock' then
    raise exception '[T13] a sub-OP de componente tem destino stock';
  end if;
  if (select produto_id from erp.ordens_producao where id=v_sub)
     <> (select id from erp.produtos where cod_barras='T13-ESTRUTURA') then
    raise exception '[T13] a sub-OP não é da estrutura';
  end if;
  if not exists (select 1 from erp.necessidades_compra
                  where op_id=v_op and origem='producao'
                    and produto_id=(select id from erp.produtos where cod_barras='T13-TECIDO')) then
    raise exception '[T13] falta a necessidade de compra do tecido com origem producao';
  end if;
  if (select estado from erp.planos_producao where id=v_plano) <> 'aprovado' then
    raise exception '[T13] o plano devia ficar aprovado';
  end if;
  raise notice '[T13.7] aprovação, sub-OP automática e compras OK';
end $$;

-- T13.8 aprovar um plano que não cabe exige justificação ---------------------
do $$
declare
  v_plano uuid; v_sofa uuid; v_erro boolean := false; v_viavel boolean;
begin
  select id into v_sofa from erp.produtos where cod_barras='T13-SOFA';
  select erp.criar_plano('Plano T13 impossível', current_date, current_date, null) into v_plano;
  perform erp.gravar_plano_linha(null, v_plano, v_sofa, 5000, 1, true, null);
  perform erp.simular_plano(v_plano);

  select viavel into v_viavel from erp.planos_producao where id=v_plano;
  if v_viavel is not false then
    raise exception '[T13] 5000 sofás num dia deviam dar plano inviável';
  end if;
  begin
    perform erp.aprovar_plano(v_plano, null);
  exception when others then v_erro := true;
  end;
  if not v_erro then
    raise exception '[T13] aprovou um plano acima da capacidade sem justificação';
  end if;

  perform erp.aprovar_plano(v_plano, 'Turno extra ao sábado');
  if not (select forcado from erp.planos_producao where id=v_plano) then
    raise exception '[T13] a aprovação à força não ficou registada';
  end if;
  if coalesce((select justificacao_forcado from erp.planos_producao where id=v_plano),'') = '' then
    raise exception '[T13] a justificação não ficou guardada';
  end if;
  raise notice '[T13.8] aprovação forçada com justificação OK';
end $$;

-- T13.9 falta de material não bloqueia a fábrica -----------------------------
do $$
declare
  v_op uuid; v_etapa uuid; v_falta numeric; v_estado text;
begin
  select o.id into v_op from erp.ordens_producao o
    join erp.produtos p on p.id=o.produto_id
   where p.cod_barras='T13-SOFA' and o.estado in ('planeada','em_curso')
   order by o.criado_em limit 1;
  if v_op is null then raise exception '[T13] não há OP do sofá para testar'; end if;

  select id into v_etapa from erp.op_etapas
   where op_id=v_op and estado <> 'concluida' order by ordem limit 1;

  perform erp.concluir_etapa(v_etapa, 1, 0, null, null);

  select estado into v_estado from erp.op_etapas where id=v_etapa;
  if v_estado <> 'concluida' then
    raise exception '[T13] a etapa não fechou por falta de material (ficou %)', v_estado;
  end if;
  select sum(quantidade_falta) into v_falta from erp.op_consumos where op_id=v_op;
  if coalesce(v_falta,0) <= 0 then
    raise exception '[T13] a falta de material devia ficar registada';
  end if;
  if not exists (select 1 from erp.v_consumos_falta where op_id=v_op) then
    raise exception '[T13] a falta não aparece no ecrã de material em falta';
  end if;
  raise notice '[T13.9] consumo com falta sem bloquear a fábrica OK';
end $$;

-- T13.10 produção para stock não reserva para vendas -------------------------
do $$
declare
  v_estrutura uuid; v_op uuid; v_e record; v_res jsonb;
begin
  select id into v_estrutura from erp.produtos where cod_barras='T13-ESTRUTURA';
  select id into v_op from erp.ordens_producao
   where produto_id=v_estrutura and destino='stock' order by criado_em limit 1;
  if v_op is null then raise exception '[T13] não há sub-OP da estrutura'; end if;

  for v_e in select id from erp.op_etapas where op_id=v_op and estado <> 'concluida' order by ordem
  loop
    perform erp.concluir_etapa(v_e.id, (select quantidade from erp.ordens_producao where id=v_op), 0, null, null);
  end loop;
  for v_e in select oe.id from erp.op_etapas oe
              join erp.etapas_producao e on e.id=oe.etapa_id
             where oe.op_id=v_op and e.exige_conferencia and oe.conferida_por is null
  loop
    perform erp.conferir_etapa(v_e.id);
  end loop;

  select erp.concluir_op(v_op, (select quantidade from erp.ordens_producao where id=v_op)) into v_res;
  if (v_res->>'reservado')::int <> 0 then
    raise exception '[T13] produção para stock não devia reservar nada, reservou %', v_res->>'reservado';
  end if;
  if (v_res->>'sobra')::int <> (v_res->>'produzido')::int then
    raise exception '[T13] tudo o que se fez para stock devia ficar vendável';
  end if;
  raise notice '[T13.10] destino stock sem reserva OK';
end $$;

-- T13.11 o operador só vê o trabalho dos centros dele ------------------------
do $$
declare v_def text;
begin
  v_def := pg_get_viewdef('erp.v_chao_fabrica'::regclass, true);
  if v_def not like '%centro_operadores%' then
    raise exception '[T13] o chão de fábrica não filtra pelos centros do operador';
  end if;
  if v_def not like '%producao%' then
    raise exception '[T13] o filtro do chão de fábrica não olha para o perfil';
  end if;
  if v_def like '%preco%' or v_def like '%custo%' then
    raise exception '[T13] o chão de fábrica não pode mostrar preços nem custos';
  end if;
  if pg_get_viewdef('erp.v_produto_roteiro'::regclass, true) like '%custo%' then
    raise exception '[T13] o roteiro não pode expor custos';
  end if;
  raise notice '[T13.11] isolamento do operador por centro OK';
end $$;

-- T13.12 capacidade: operadores mandam, senão postos × eficiência ------------
do $$
declare v_centro uuid; v_cap numeric; v_uid uuid; v_ass uuid;
begin
  select erp.gravar_centro(null,'T13CAP','Capacidade T13',null,480,2,50,true) into v_centro;
  select erp.capacidade_centro_dia(v_centro) into v_cap;
  -- 480 × 2 postos × 50% = 480
  if v_cap <> 480 then
    raise exception '[T13] sem operadores esperava 480 min/dia, deu %', v_cap;
  end if;

  select user_id into v_uid from erp.utilizadores where ativo limit 1;
  if v_uid is not null then
    select id into v_ass from erp.utilizadores where user_id=v_uid;
    perform erp.gravar_centro_operador(v_centro, v_ass, 300);
    select erp.capacidade_centro_dia(v_centro) into v_cap;
    -- 300 × 50% = 150
    if v_cap <> 150 then
      raise exception '[T13] com um operador de 300 min a 50%% esperava 150, deu %', v_cap;
    end if;
  end if;
  raise notice '[T13.12] cálculo de capacidade OK';
end $$;

-- ============================================================
-- Fim dos testes [T13]
-- ============================================================
