create unique index if not exists caixas_um_aberto_por_rota
  on erp.caixas (rota_id)
  where rota_id is not null and estado = 'aberto' and eliminado_em is null;

create or replace function erp.abrir_caixa_rota(p_rota_id uuid, p_saldo_inicial numeric default 0)
returns uuid
language plpgsql
security definer
set search_path to 'erp', 'public'
as $function$
declare r erp.rotas%rowtype; v_caixa uuid; v_est text; v_ab numeric(12,2); v_user uuid;
begin
  v_user := erp.utilizador_atual();
  if v_user is null then raise exception 'Sessão inválida.'; end if;

  select * into r from erp.rotas where id = p_rota_id and eliminado_em is null for update;
  if not found then raise exception 'Rota não encontrada.'; end if;
  if r.estado in ('fechada', 'conferida', 'cancelada') then
    raise exception 'Esta rota já está fechada.';
  end if;
  if r.responsavel_id is null then raise exception 'A rota ainda não tem entregador.'; end if;
  if r.responsavel_id <> v_user
     and erp.perfil_atual()::text not in ('adm', 'escritorio') then
    raise exception 'Esta rota é de outra pessoa.';
  end if;

  select id, estado into v_caixa, v_est from erp.caixas
   where rota_id = p_rota_id and eliminado_em is null
   order by criado_em desc limit 1;

  if v_caixa is not null then
    if v_est = 'aberto' then return v_caixa; end if;
    raise exception 'O caixa desta rota já foi fechado. Só um administrador o pode reabrir.';
  end if;

  v_ab := round(coalesce(p_saldo_inicial, 0), 2);
  if v_ab < 0 then raise exception 'O troco inicial não pode ser negativo.'; end if;

  insert into erp.caixas (utilizador_id, data, saldo_abertura, saldo_esperado, rota_id)
  values (r.responsavel_id, r.data, v_ab, v_ab, p_rota_id)
  returning id into v_caixa;

  if r.estado = 'planeada' then
    update erp.rotas
       set estado = 'em_curso', aberta_em = coalesce(aberta_em, now())
     where id = p_rota_id;
  end if;

  return v_caixa;
end $function$;

revoke all on function erp.abrir_caixa_rota(uuid, numeric) from public;
grant execute on function erp.abrir_caixa_rota(uuid, numeric) to authenticated;