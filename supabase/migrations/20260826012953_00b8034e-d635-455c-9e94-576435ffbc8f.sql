create or replace function erp.tg_bloquear_alteracao()
returns trigger language plpgsql set search_path = erp, public as $$
begin
  raise exception 'O livro de movimentos de stock não pode ser alterado nem eliminado. Crie um movimento de correção com motivo.';
end $$;