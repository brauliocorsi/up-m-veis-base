-- ============================================================
-- 21 — Catálogo e clientes: NIF, normalização, duplicados
-- ============================================================
\ir 00_setup.sql

-- validação de NIF português
select pg_temp.ok(erp.nif_valido('999999990'), 'C1: NIF de teste válido aceite');
select pg_temp.ok(not erp.nif_valido('123456789'), 'C2: NIF inválido recusado');

-- normalização de telefone para E.164
do $$
declare c uuid; tel text;
begin
  insert into erp.clientes (nome, telefone_e164) values ('Cliente Telefone Auditoria', '912 345 679')
  returning id into c;
  select telefone_e164 into tel from erp.clientes where id = c;
  perform pg_temp.ok(tel = '+351912345679', 'C3: telefone normalizado para +351...');
end $$;

-- deteção de duplicados por nome parecido
do $$
declare n int;
begin
  select count(*) into n
    from erp.clientes_semelhantes(p_nome := 'Cliente Auditória');
  perform pg_temp.ok(n >= 1, 'C4: clientes_semelhantes encontra nomes parecidos');
end $$;

-- produto de compra exige fornecedor e prazo
do $$
declare cat uuid;
begin
  select id into cat from erp.categorias where codigo = 'AUD';
  begin
    insert into erp.produtos (cod_barras, categoria_id, nome_cliente, tipo_fornecimento)
    values ('P-AUD-INVALIDO', cat, 'Produto Inválido', 'compra');
    raise notice 'FALHA C5: produto de compra sem fornecedor foi aceite';
  exception when check_violation then
    raise notice 'PASSA C5: produto de compra exige fornecedor e prazo';
  end;
end $$;

-- dinheiro em numeric(12,2)
select pg_temp.ok((select data_type = 'numeric' and numeric_precision = 12 and numeric_scale = 2
                   from information_schema.columns
                   where table_schema='erp' and table_name='produtos' and column_name='preco_base'),
                  'C6: preços em numeric(12,2)');

-- NIF inválido marcado no cliente
do $$
declare c uuid; ok boolean;
begin
  insert into erp.clientes (nome, nif) values ('Cliente NIF Auditoria', '111111111')
  returning id into c;
  select nif_ok into ok from erp.clientes where id = c;
  perform pg_temp.ok(ok is false, 'C7: NIF inválido fica marcado nif_ok = false');
end $$;
