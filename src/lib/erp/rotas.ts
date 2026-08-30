import { erp } from "./db";
import type {
  Assistencia,
  Desfecho,
  EstadoAssistencia,
  Motivo,
  Rota,
  RotaContas,
  RotaMovimento,
  RotaParagem,
} from "./tipos";
import type { LinhaARegistar } from "./entregas";

// -------------------------------------------------------------------- leituras
export async function lerRotas(params?: { responsavelId?: string; data?: string }) {
  let consulta = erp()
    .from("v_rotas")
    .select("*")
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(200);
  if (params?.responsavelId) consulta = consulta.eq("responsavel_id", params.responsavelId);
  if (params?.data) consulta = consulta.eq("data", params.data);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as Rota[];
}

export async function lerRota(rotaId: string): Promise<Rota | null> {
  const { data, error } = await erp().from("v_rotas").select("*").eq("id", rotaId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Rota | null;
}

/** A rota de hoje do entregador que está a usar a aplicação. */
export async function lerRotaDeHoje(responsavelId: string): Promise<Rota | null> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await erp()
    .from("v_rotas")
    .select("*")
    .eq("responsavel_id", responsavelId)
    .eq("data", hoje)
    .in("estado", ["planeada", "em_curso", "fechada", "conferida", "concluida"])
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Rota | null;
}

export async function lerParagens(rotaId: string): Promise<RotaParagem[]> {
  const { data, error } = await erp()
    .from("v_rota_paragens")
    .select("*")
    .eq("rota_id", rotaId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RotaParagem[];
}

export async function lerParagem(paragemId: string): Promise<RotaParagem | null> {
  const { data, error } = await erp()
    .from("v_rota_paragens")
    .select("*")
    .eq("id", paragemId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as RotaParagem | null;
}

export async function lerMovimentosDaRota(rotaId: string): Promise<RotaMovimento[]> {
  const { data, error } = await erp()
    .from("v_rota_movimentos")
    .select("*")
    .eq("rota_id", rotaId)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RotaMovimento[];
}

export async function lerContasDaRota(rotaId: string): Promise<RotaContas | null> {
  const { data, error } = await erp()
    .from("v_rota_contas")
    .select("*")
    .eq("rota_id", rotaId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as RotaContas | null;
}

export async function lerContasDasRotas(params?: {
  de?: string;
  ate?: string;
}): Promise<RotaContas[]> {
  let consulta = erp()
    .from("v_rota_contas")
    .select("*")
    .order("data", { ascending: false })
    .limit(300);
  if (params?.de) consulta = consulta.gte("data", params.de);
  if (params?.ate) consulta = consulta.lte("data", params.ate);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as RotaContas[];
}

export async function lerMotivosDe(contexto: string): Promise<Motivo[]> {
  const { data, error } = await erp()
    .from("motivos")
    .select("*")
    .eq("contexto", contexto)
    .eq("ativo", true)
    .is("eliminado_em", null)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Motivo[];
}

// -------------------------------------------------------------------- escritas
export async function abrirRota(params: {
  nome: string;
  responsavel_id: string;
  pedidos: string[];
  data?: string | null;
  viatura?: string | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("abrir_rota", {
    p_nome: params.nome,
    p_responsavel_id: params.responsavel_id,
    p_pedidos: params.pedidos,
    p_data: params.data ?? null,
    p_viatura: params.viatura ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function registarDesfecho(params: {
  paragem_id: string;
  desfecho: Desfecho;
  linhas?: LinhaARegistar[] | null;
  motivo_id?: string | null;
  motivo?: string | null;
  data_reagendamento?: string | null;
  recebido_por?: string | null;
}) {
  const { data, error } = await erp().rpc("registar_desfecho_paragem", {
    p_paragem_id: params.paragem_id,
    p_desfecho: params.desfecho,
    p_linhas: params.linhas ?? null,
    p_motivo_id: params.motivo_id ?? null,
    p_motivo: params.motivo ?? null,
    p_data_reagendamento: params.data_reagendamento ?? null,
    p_recebido_por: params.recebido_por ?? null,
  });
  if (error) throw error;
  return data as { paragem_id: string; desfecho: Desfecho; entrega_id: string | null };
}

export interface LinhaRecebimento {
  forma_id: string;
  valor: number;
  referencia?: string | null;
  comprovativo_url?: string | null;
}

export async function registarRecebimentoEntrega(
  paragemId: string,
  pagamentos: LinhaRecebimento[],
): Promise<number> {
  const { data, error } = await erp().rpc("registar_recebimento_entrega", {
    p_paragem_id: paragemId,
    p_pagamentos: pagamentos,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function registarSaidaRota(params: {
  rota_id: string;
  valor: number;
  motivo_id: string;
  descricao?: string | null;
  comprovativo_url?: string | null;
}) {
  const { error } = await erp().rpc("registar_saida_rota", {
    p_rota_id: params.rota_id,
    p_valor: params.valor,
    p_motivo_id: params.motivo_id,
    p_descricao: params.descricao ?? null,
    p_comprovativo_url: params.comprovativo_url ?? null,
  });
  if (error) throw error;
}

export async function fecharRota(
  rotaId: string,
  valorEnvelope: number,
  justificacao?: string | null,
) {
  const { data, error } = await erp().rpc("fechar_rota", {
    p_rota_id: rotaId,
    p_valor_envelope: valorEnvelope,
    p_justificacao: justificacao ?? null,
  });
  if (error) throw error;
  return data as Record<string, number>;
}

export async function conferirRota(
  rotaId: string,
  valorContado: number,
  justificacao?: string | null,
) {
  const { data, error } = await erp().rpc("conferir_rota", {
    p_rota_id: rotaId,
    p_valor_contado: valorContado,
    p_justificacao: justificacao ?? null,
  });
  if (error) throw error;
  return data as { declarado: number; contado: number; diferenca: number };
}

// ----------------------------------------------------------------- assistências
export async function lerAssistencias(params?: {
  pedidoId?: string;
  estado?: EstadoAssistencia;
}): Promise<Assistencia[]> {
  let consulta = erp()
    .from("v_assistencias")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(300);
  if (params?.pedidoId) consulta = consulta.eq("pedido_id", params.pedidoId);
  if (params?.estado) consulta = consulta.eq("estado", params.estado);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as Assistencia[];
}

export async function abrirAssistencia(params: {
  pedido_id: string;
  origem: "entrega" | "cliente" | "oficina";
  motivo: string;
  descricao: string;
  pedido_item_id?: string | null;
  entrega_id?: string | null;
  paragem_id?: string | null;
  peca_afetada?: string | null;
  fotos?: string[] | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("abrir_assistencia", {
    p_pedido_id: params.pedido_id,
    p_origem: params.origem,
    p_motivo: params.motivo,
    p_descricao: params.descricao,
    p_pedido_item_id: params.pedido_item_id ?? null,
    p_entrega_id: params.entrega_id ?? null,
    p_paragem_id: params.paragem_id ?? null,
    p_peca_afetada: params.peca_afetada ?? null,
    p_fotos: params.fotos ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function atualizarAssistencia(
  id: string,
  estado: EstadoAssistencia,
  nota?: string | null,
) {
  const { error } = await erp().rpc("atualizar_assistencia", {
    p_assistencia_id: id,
    p_estado: estado,
    p_nota: nota ?? null,
  });
  if (error) throw error;
}

// ------------------------------------------------- envelopes na caixa da loja
export async function lerEnvelopes(params?: { porReceber?: boolean }) {
  let consulta = erp().from("v_envelopes_rota").select("*").limit(200);
  if (params?.porReceber) consulta = consulta.eq("por_receber", true);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as EnvelopeRota[];
}

/** Dá entrada do dinheiro do envelope de uma rota conferida no caixa da loja. */
export async function receberEnvelopeRota(rotaId: string, valor?: number | null) {
  const { error } = await erp().rpc("receber_envelope_rota", {
    p_rota_id: rotaId,
    p_valor: valor ?? null,
  });
  if (error) throw error;
}
