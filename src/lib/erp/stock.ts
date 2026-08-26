import { erp } from "./db";

/** Reserva unidades de um produto. Devolve o id da reserva. */
export async function reservar(params: {
  produto_id: string;
  quantidade: number;
  documento_tipo: string;
  documento_id: string;
  linha_id?: string | null;
  expira_em?: string | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("reservar", {
    p_produto_id: params.produto_id,
    p_quantidade: params.quantidade,
    p_documento_tipo: params.documento_tipo,
    p_documento_id: params.documento_id,
    p_linha_id: params.linha_id ?? null,
    p_expira_em: params.expira_em ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function libertarReserva(reserva_id: string, motivo: string) {
  const { error } = await erp().rpc("libertar_reserva", {
    p_reserva_id: reserva_id,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function consumirReserva(reserva_id: string, referencia?: string | null) {
  const { data, error } = await erp().rpc("consumir_reserva", {
    p_reserva_id: reserva_id,
    p_referencia: referencia ?? null,
  });
  if (error) throw error;
  return data as number;
}

/** Ajuste manual do stock físico (só administração). */
export async function ajusteManual(params: {
  produto_id: string;
  quantidade: number;
  motivo: string;
}) {
  const { data, error } = await erp().rpc("ajuste_manual", {
    p_produto_id: params.produto_id,
    p_quantidade: params.quantidade,
    p_motivo: params.motivo,
  });
  if (error) throw error;
  return data as number;
}

/** Define a margem de segurança comercial de um produto. */
export async function definirMargemSeguranca(produto_id: string, margem: number) {
  const { error } = await erp()
    .from("stock_atual")
    .update({ margem_seguranca: margem })
    .eq("produto_id", produto_id);
  if (error) throw error;
}

export async function resolverDivergencia(params: {
  divergencia_id: string;
  acao: "regularizar" | "ignorar";
  nota: string;
}) {
  const { error } = await erp().rpc("resolver_divergencia", {
    p_divergencia_id: params.divergencia_id,
    p_acao: params.acao,
    p_nota: params.nota,
  });
  if (error) throw error;
}

export async function expirarReservas() {
  const { data, error } = await erp().rpc("expirar_reservas");
  if (error) throw error;
  return data as number;
}
