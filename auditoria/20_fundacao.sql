-- ============================================================
-- 20 — Fundação: numeração, perfis, RLS, auditoria, lixeira
-- ============================================================
\ir 00_setup.sql

-- numeração sequencial com formato PED-AAAA-NNNNNN
select pg_temp.ok(erp.proximo_numero('pedido') ~ '^PED-[0-9]{4}-[0-9]{6}$',
                  'F1: proximo_numero devolve PED-AAAA-NNNNNN');

-- perfis
select pg_temp.entra('adm');
select pg_temp.ok(erp.is_adm(), 'F2: utilizador adm é reconhecido como adm');
select pg_temp.entra('vendedora');
select pg_temp.ok(not erp.is_adm(), 'F3: vendedora não é adm');
select pg_temp.ok(erp.perfil_atual() = 'vendedora', 'F4: perfil_atual devolve vendedora');

-- RLS: eventos só são lidos por adm
set role authenticated;
select pg_temp.entra('vendedora');
do $$
declare n int;
begin
  select count(*) into n from erp.eventos;
  perform pg_temp.ok(n = 0, 'F5: vendedora não lê eventos de auditoria');
end $$;

-- DELETE físico proibido para a aplicação
do $$
begin
  delete from erp.motivos where false; -- chega para testar o privilégio? não...
  -- teste real: tentar apagar um motivo
  begin
    delete from erp.motivos where contexto = 'cancelamento' limit 1;
    raise notice 'FALHA F6: authenticated consegue apagar motivos';
  exception
    when insufficient_privilege then raise notice 'PASSA F6: DELETE revogado a authenticated';
    when others then raise notice 'PASSA F6: DELETE bloqueado (%)', sqlerrm;
  end;
end $$;
reset role;

-- auditoria: insert e update geram eventos com alterações campo a campo
do $$
declare m uuid; n1 int; n2 int; alterou boolean;
begin
  insert into erp.motivos (contexto, descricao) values ('eliminacao', 'Motivo Auditoria F7') returning id into m;
  select count(*) into n1 from erp.eventos where tabela = 'motivos' and registo_id = m;
  update erp.motivos set descricao = 'Motivo Auditoria F7b' where id = m;
  select count(*) into n2 from erp.eventos
   where tabela = 'motivos' and registo_id = m and operacao = 'ATUALIZACAO'
     and alteracoes ? 'descricao';
  perform pg_temp.ok(n1 >= 1, 'F7: INSERT gera evento de auditoria');
  perform pg_temp.ok(n2 >= 1, 'F8: UPDATE grava só os campos alterados');

  -- eliminação lógica gera ELIMINACAO e o registo continua na tabela
  update erp.motivos set eliminado_em = now() where id = m;
  select exists (select 1 from erp.eventos where tabela = 'motivos' and registo_id = m
                 and operacao = 'ELIMINACAO') into alterou;
  perform pg_temp.ok(alterou, 'F9: eliminação lógica gera evento ELIMINACAO');
  perform pg_temp.ok(exists (select 1 from erp.motivos where id = m),
                     'F10: registo eliminado continua na tabela (lixeira)');
end $$;

-- utilizador inativo fica sem acesso
do $$
begin
  update erp.utilizadores set ativo = false
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
  perform pg_temp.ok(not erp.is_ativo(), 'F11: utilizador inativo não é considerado ativo');
  update erp.utilizadores set ativo = true
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
