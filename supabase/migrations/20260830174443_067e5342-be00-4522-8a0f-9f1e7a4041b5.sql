CREATE OR REPLACE FUNCTION erp.clientes_semelhantes(
  p_nome text DEFAULT NULL,
  p_nif text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_cp4 text DEFAULT NULL,
  p_excluir uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, nome text, nif text, telefone_e164 text, email text, cp4 text, localidade text, regra text, score integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'erp', 'public', 'extensions'
AS $$
  with parametros as (
    select
      erp.normalizar_nome(p_nome) as nome_n,
      nullif(regexp_replace(coalesce(p_nif, ''), '\s', '', 'g'), '') as nif_n,
      erp.normalizar_telefone(p_telefone, 'PT') as tel_n,
      erp.normalizar_email(p_email) as email_n,
      nullif(trim(coalesce(p_cp4, '')), '') as cp4_n
  ),
  candidatos as (
    select c.id, c.nome, c.nif, c.telefone_e164, c.email, c.cp4, c.localidade,
      case
        when p.nif_n is not null and c.nif = p.nif_n and p.nif_n <> '999999990' then 'nif'
        when p.tel_n is not null and c.telefone_e164 = p.tel_n then 'telefone'
        when p.email_n is not null and lower(c.email) = p.email_n then 'email'
        when p.nome_n is not null and p.cp4_n is not null and c.cp4 = p.cp4_n
             and extensions.similarity(erp.normalizar_nome(c.nome), p.nome_n) >= 0.40 then 'nome_cp4'
        when p.nome_n is not null
             and extensions.similarity(erp.normalizar_nome(c.nome), p.nome_n) >= 0.65 then 'nome'
        else null
      end as regra
    from erp.clientes c, parametros p
    where c.eliminado_em is null
      and (p_excluir is null or c.id <> p_excluir)
  )
  select id, nome, nif, telefone_e164, email, cp4, localidade, regra,
    case regra
      when 'nif' then 100
      when 'telefone' then 90
      when 'email' then 85
      when 'nome_cp4' then 35
      when 'nome' then 50
    end as score
  from candidatos
  where regra is not null
  order by score desc, nome;
$$;