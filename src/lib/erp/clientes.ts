import { erp } from "./db";
import type { ClienteSemelhante } from "./tipos";

/** Procura clientes que podem ser a mesma pessoa (NIF, telefone, email, nome + código postal). */
export async function clientesSemelhantes(params: {
  nome?: string | null;
  nif?: string | null;
  telefone?: string | null;
  email?: string | null;
  cp4?: string | null;
  excluir?: string | null;
}): Promise<ClienteSemelhante[]> {
  const { data, error } = await erp().rpc("clientes_semelhantes", {
    p_nome: params.nome || null,
    p_nif: params.nif || null,
    p_telefone: params.telefone || null,
    p_email: params.email || null,
    p_cp4: params.cp4 || null,
    p_excluir: params.excluir || null,
  });
  if (error) throw error;
  return (data ?? []) as ClienteSemelhante[];
}

/** Junta dois clientes num só, guardando cópia do absorvido. Só a Administração. */
export async function unificarClientes(params: {
  manter: string;
  absorver: string;
  regra?: string;
  score?: number;
  motivo?: string;
}) {
  const { error } = await erp().rpc("unificar_clientes", {
    p_manter: params.manter,
    p_absorver: params.absorver,
    p_regra: params.regra ?? "manual",
    p_score: params.score ?? 0,
    p_motivo: params.motivo ?? "Cliente duplicado unificado",
  });
  if (error) throw error;
}
