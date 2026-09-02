-- ============================================================
-- Fase 10 — Planeamento de Rotas
-- Testes [T10]. Executar numa base descartável.
-- ============================================================
\set ON_ERROR_STOP on
set search_path = erp, public;

-- T10.0 estrutura -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='erp' and table_name='viaturas') then
    raise exception '[T10] falta erp.viaturas';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema='erp' and table_name='rota_templates') then
    raise exception '[T10] falta erp.rota_templates';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema='erp' and table_name='rota_alteracoes') then
    raise exception '[T10] falta erp.rota_alteracoes';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
                 where t.typname='estado_pedido' and e.enumlabel='agendado') then
    raise exception '[T10] falta o estado agendado';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='erp' and table_name='rota_paragens'
                   and column_name='excedeu_capacidade') then
    raise exception '[T10] falta rota_paragens.excedeu_capacidade';
  end if;
  raise notice '[T10.0] estrutura OK';
end $$;

-- T10.1 auditoria e eliminação lógica ----------------------------------------
do $$
declare v_t text;
begin
  foreach v_t in array array['viaturas','rota_templates','rota_alteracoes']
  loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='erp' and table_name=v_t and column_name='eliminado_em') then
      raise exception '[T10] % sem eliminação lógica', v_t;
    end if;
    if not exists (select 1 from pg_trigger tg
                    join pg_class c on c.oid=tg.tgrelid
                    join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='erp' and c.relname=v_t and not tg.tgisinternal) then
      raise exception '[T10] % sem triggers de auditoria', v_t;
    end if;
    if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='erp' and c.relname=v_t) then
      raise exception '[T10] % sem RLS', v_t;
    end if;
    if has_table_privilege('authenticated','erp.'||v_t,'DELETE') then
      raise exception '[T10] % com DELETE concedido', v_t;
    end if;
  end loop;
  raise notice '[T10.1] auditoria, RLS e DELETE OK';
end $$;

-- T10.2 security_invoker nas views novas -------------------------------------
do $$
declare v_v text;
begin
  foreach v_v in array array['v_viaturas','v_rota_templates','v_rota_ocupacao',
                             'v_pedidos_por_agendar','v_rotas','v_rota_paragens']
  loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='erp' and c.relname=v_v
         and 'security_invoker=true' = any(c.reloptions)) then
      raise exception '[T10] % sem security_invoker', v_v;
    end if;
  end loop;
  raise notice '[T10.2] views protegidas OK';
end $$;

-- T10.3 funções security definer com search_path fixo ------------------------
do $$
declare v_f text;
begin
  foreach v_f in array array['gerar_rotas_templates','criar_rota','agendar_entrega',
                             'desagendar_entrega','reordenar_paragens','arrancar_rota',
                             'cancelar_rota','recalcular_previsto_rota','rotas_sugeridas']
  -- erp.datas_template é cálculo puro de datas (não lê tabelas): basta search_path fixo
  loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='erp' and p.proname=v_f
         and p.prosecdef
         and array_to_string(coalesce(p.proconfig,'{}'::text[]),',') like '%search_path%') then
      raise exception '[T10] erp.% não é security definer com search_path fixo', v_f;
    end if;
  end loop;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='erp' and p.proname='datas_template'
       and array_to_string(coalesce(p.proconfig,'{}'::text[]),',') like '%search_path%') then
    raise exception '[T10] erp.datas_template não tem search_path fixo';
  end if;
  raise notice '[T10.3] funções críticas OK';
end $$;

-- T10.4 geração idempotente das rotas dos modelos ----------------------------
do $$
declare v_viatura uuid; v_template uuid; v_1 int; v_2 int;
begin
  insert into erp.viaturas (nome, matricula, cubicagem_m3, peso_max_kg)
  values ('[T10] Camião', 'AA-01-AA', 20, 3500)
  returning id into v_viatura;

  insert into erp.rota_templates (nome, periodicidade, dias_semana, viatura_id, max_entregas, max_minutos_montagem)
  values ('[T10] Norte', 'semanal', array[3], v_viatura, 8, 300)
  returning id into v_template;

  select erp.gerar_rotas_templates(6) into v_1;
  select count(*) into v_1 from erp.rotas where template_id = v_template and eliminado_em is null;
  perform erp.gerar_rotas_templates(6);
  select count(*) into v_2 from erp.rotas where template_id = v_template and eliminado_em is null;

  if v_1 = 0 then raise exception '[T10] geração não criou rotas'; end if;
  if v_1 <> v_2 then raise exception '[T10] geração não é idempotente: % vs %', v_1, v_2; end if;

  if exists (select 1 from erp.rotas where template_id = v_template and estado <> 'planeada') then
    raise exception '[T10] rotas geradas deviam nascer planeadas';
  end if;

  raise notice '[T10.4] geração idempotente OK (% rotas)', v_1;
end $$;

-- T10.5 agendar avisa acima da capacidade mas não bloqueia -------------------
-- Requer um pedido pronto e uma rota planeada com max_entregas = 1.
-- Bloco manual: preencher os identificadores antes de correr numa base de teste.
do $$
declare
  v_rota uuid;
  v_pedido uuid;
  v_res jsonb;
begin
  select id into v_rota from erp.rotas
   where estado='planeada' and eliminado_em is null order by data limit 1;
  select id into v_pedido from erp.pedidos
   where estado in ('confirmado','em_preparacao','pronto') and eliminado_em is null limit 1;
  if v_rota is null or v_pedido is null then
    raise notice '[T10.5] sem dados de teste — bloco ignorado';
    return;
  end if;

  update erp.rotas set max_entregas = 0 where id = v_rota;
  select erp.agendar_entrega(v_pedido, v_rota, false) into v_res;

  if (v_res->>'excedeu_capacidade')::boolean is not true then
    raise exception '[T10] devia avisar excesso de capacidade';
  end if;
  if (select estado from erp.pedidos where id=v_pedido) <> 'agendado' then
    raise exception '[T10] pedido devia ficar agendado';
  end if;
  if not exists (select 1 from erp.rota_paragens
                  where rota_id=v_rota and pedido_id=v_pedido
                    and eliminado_em is null and excedeu_capacidade) then
    raise exception '[T10] paragem devia estar marcada como acima da capacidade';
  end if;

  perform erp.desagendar_entrega(v_pedido, 'teste', false);
  if (select estado from erp.pedidos where id=v_pedido) <> 'pronto' then
    raise exception '[T10] desagendar devia repor o pedido em pronto';
  end if;
  if exists (select 1 from erp.rota_paragens
              where rota_id=v_rota and pedido_id=v_pedido and eliminado_em is null) then
    raise exception '[T10] paragem devia ficar eliminada logicamente';
  end if;

  raise notice '[T10.5] agendar e desagendar OK';
end $$;

-- T10.6 arrancar congela o previsto ------------------------------------------
do $$
declare v_rota uuid; v_pedido uuid; v_prev numeric;
begin
  select id into v_rota from erp.rotas
   where estado='planeada' and eliminado_em is null order by data limit 1;
  select id into v_pedido from erp.pedidos
   where estado in ('confirmado','em_preparacao','pronto') and eliminado_em is null limit 1;
  if v_rota is null or v_pedido is null then
    raise notice '[T10.6] sem dados de teste — bloco ignorado';
    return;
  end if;

  update erp.rotas set max_entregas = null where id = v_rota;
  perform erp.agendar_entrega(v_pedido, v_rota, false);
  update erp.rotas set responsavel_id = coalesce(responsavel_id,
    (select id from erp.utilizadores where perfil='entregador' and ativo limit 1))
   where id = v_rota;

  perform erp.arrancar_rota(v_rota);
  select previsto_receber into v_prev from erp.rotas where id=v_rota;
  if (select estado from erp.rotas where id=v_rota) <> 'em_curso' then
    raise exception '[T10] rota devia ficar em curso';
  end if;

  perform erp.desagendar_entrega(v_pedido, 'retirada depois do arranque', true);
  if (select previsto_receber from erp.rotas where id=v_rota) <> v_prev then
    raise exception '[T10] previsto devia estar congelado depois do arranque';
  end if;
  if not exists (select 1 from erp.rota_alteracoes where rota_id=v_rota) then
    raise exception '[T10] alteração depois do arranque devia ficar registada';
  end if;

  raise notice '[T10.6] previsto congelado e alterações registadas OK';
end $$;

-- T10.7 cancelar rota planeada repõe as vendas -------------------------------
do $$
declare v_rota uuid; v_pedido uuid;
begin
  select id into v_rota from erp.rotas
   where estado='planeada' and eliminado_em is null order by data desc limit 1;
  select id into v_pedido from erp.pedidos
   where estado in ('confirmado','em_preparacao','pronto') and eliminado_em is null limit 1;
  if v_rota is null or v_pedido is null then
    raise notice '[T10.7] sem dados de teste — bloco ignorado';
    return;
  end if;

  perform erp.agendar_entrega(v_pedido, v_rota, false);
  perform erp.cancelar_rota(v_rota, 'viatura em manutenção');

  if (select estado from erp.rotas where id=v_rota) <> 'cancelada' then
    raise exception '[T10] rota devia ficar cancelada';
  end if;
  if (select estado from erp.pedidos where id=v_pedido) <> 'pronto' then
    raise exception '[T10] venda devia voltar a pronto';
  end if;
  if (select data_entrega_agendada from erp.pedidos where id=v_pedido) is not null then
    raise exception '[T10] data agendada devia ser limpa';
  end if;

  raise notice '[T10.7] cancelamento OK';
end $$;

-- T10.8 entregar uma venda agendada continua a funcionar ---------------------
do $$
begin
  if pg_get_functiondef('erp.registar_entrega(uuid,jsonb,text,text,text)'::regprocedure)
     not like '%agendado%' then
    raise exception '[T10] registar_entrega não aceita vendas agendadas';
  end if;
  if pg_get_functiondef('erp.alterar_data_entrega(uuid,date,text,uuid,text)'::regprocedure)
     not like '%agendado%' then
    raise exception '[T10] alterar_data_entrega não aceita vendas agendadas';
  end if;
  raise notice '[T10.8] entrega e data de vendas agendadas OK';
end $$;

-- ============================================================
-- Fim dos testes [T10]
-- ============================================================
