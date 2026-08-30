\set ON_ERROR_STOP off
set client_min_messages to notice;

create or replace function pg_temp.ok(n text,c boolean) returns void
language plpgsql as $$
begin raise notice '%  %', case when c then '[PASSA]' else '[FALHA]' end, n; end $$;

insert into auth.users (id,email) values
  ('dddd0000-0000-0000-0000-00000000000d','ent1@teste.pt'),
  ('eeee0000-0000-0000-0000-00000000000e','ent2@teste.pt') on conflict do nothing;
insert into erp.utilizadores (user_id,nome,email,perfil) values
  ('dddd0000-0000-0000-0000-00000000000d','[T9] Entregador Um','ent1@teste.pt','entregador'),
  ('eeee0000-0000-0000-0000-00000000000e','[T9] Entregador Dois','ent2@teste.pt','entregador')
on conflict (user_id) do nothing;
update erp.utilizadores set ativo = true, eliminado_em = null
 where email in ('ent1@teste.pt','ent2@teste.pt');

select set_config('request.jwt.claim.sub','aaaa0000-0000-0000-0000-00000000000a',false);

do $$
declare v_e1 uuid; v_e2 uuid;
begin
  select id into v_e1 from erp.utilizadores where email='ent1@teste.pt';
  select id into v_e2 from erp.utilizadores where email='ent2@teste.pt';
  insert into erp.rotas (data,nome,responsavel_id) values
    (current_date,'[T9] Rota Norte',  v_e1),
    (current_date,'[T9] Rota Lisboa', v_e2)
  on conflict do nothing;
  perform pg_temp.ok('R0 Duas rotas criadas',
    (select count(*) from erp.rotas where nome like '[T9]%') = 2);
end $$;

do $$
declare v_perfil text;
begin
  perform set_config('request.jwt.claim.sub','dddd0000-0000-0000-0000-00000000000d',false);
  select erp.perfil_atual()::text into v_perfil;
  if v_perfil is distinct from 'entregador' then
    perform pg_temp.ok('R1 GUARDA: identidade e mesmo um entregador (perfil='||
      coalesce(v_perfil,'NENHUM')||')', false);
    return;
  end if;
  perform pg_temp.ok('R1 Identidade confirmada: entregador ativo', true);
end $$;

begin;
select set_config('request.jwt.claim.sub','dddd0000-0000-0000-0000-00000000000d',true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from erp.rotas where nome like '[T9]%';
  perform pg_temp.ok('R2 Entregador ve APENAS a sua rota (viu '||n||', devia ver 1)', n = 1);

  select count(*) into n from erp.rotas r
   join erp.utilizadores u on u.id = r.responsavel_id
   where u.email = 'ent2@teste.pt';
  perform pg_temp.ok('R3 Entregador NAO ve a rota de outro ('||n||')', n = 0);

  begin
    select count(*) into n from erp.v_contas_pagar;
    perform pg_temp.ok('R4 Entregador nao le contas a pagar ('||n||')', n = 0);
  exception when insufficient_privilege then
    perform pg_temp.ok('R4 Entregador nao le contas a pagar', true); end;

  begin
    select count(*) into n from erp.produto_custos;
    perform pg_temp.ok('R5 Entregador nao le custos ('||n||')', n = 0);
  exception when insufficient_privilege then
    perform pg_temp.ok('R5 Entregador nao le custos', true); end;

  begin
    select count(*) into n from erp.v_oc_itens;
    perform pg_temp.ok('R6 Entregador nao le compras ('||n||')', n = 0);
  exception when insufficient_privilege then
    perform pg_temp.ok('R6 Entregador nao le compras', true); end;

  begin
    update erp.rotas set estado = 'em_curso'
     where responsavel_id = (select id from erp.utilizadores where email='ent2@teste.pt');
    perform pg_temp.ok('R7 Entregador nao altera a rota de outro',
      not exists (select 1 from erp.rotas r join erp.utilizadores u on u.id=r.responsavel_id
                  where u.email='ent2@teste.pt' and r.estado='em_curso'));
  exception when insufficient_privilege then
    perform pg_temp.ok('R7 Entregador nao altera a rota de outro', true); end;
end $$;
commit;

select set_config('request.jwt.claim.sub','aaaa0000-0000-0000-0000-00000000000a',false);

do $$
declare v_rota uuid; v_prev numeric; v_prev2 numeric;
begin
  select id into v_rota from erp.rotas where nome = '[T9] Rota Norte';
  select previsto_receber into v_prev from erp.rotas where id = v_rota;
  perform pg_temp.ok('R8 Rota tem campo de previsto ('||coalesce(v_prev::text,'nulo')||')',
    v_prev is not null);
  select previsto_receber into v_prev2 from erp.rotas where id = v_rota;
  perform pg_temp.ok('R9 Previsto estavel entre leituras', v_prev = v_prev2);
end $$;

select pg_temp.ok('R10 Rota tem realizado e envelope',
  (select count(*) from information_schema.columns
    where table_schema='erp' and table_name='rotas'
      and column_name in ('realizado_recebido','realizado_saidas','valor_envelope','diferenca')) = 4);

select pg_temp.ok('R11 Assistencia liga-se ao pedido e ao item',
  (select count(*) from information_schema.columns
    where table_schema='erp' and table_name='assistencias'
      and column_name in ('pedido_id','pedido_item_id')) = 2);

select pg_temp.ok('R12 Paragem regista desfecho e reagendamento',
  (select count(*) from information_schema.columns
    where table_schema='erp' and table_name='rota_paragens'
      and column_name in ('desfecho','data_reagendamento')) = 2);

select pg_temp.ok('R13 Views de rotas com security_invoker',
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='erp' and c.relkind='v' and c.relname like '%rota%'
      and coalesce((select option_value from pg_options_to_table(c.reloptions)
                    where option_name='security_invoker'),'false') <> 'true'));
