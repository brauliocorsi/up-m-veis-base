import { erp } from "./db";
import type { Caixa, CaixaMovimento, FormaPagamento, Motivo, Pagamento } from "./tipos";

// ------------------------------------------------------------------ pagamentos
export async function lerPagamentos(pedidoId: string): Promise<Pagamento[]> {
  const { data, error } = await erp()
    .from("v_pagamentos")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Pagamento[];
}

/** Pagamentos que ainda esperam confirmação, os mais antigos primeiro. */
export async function lerPagamentosPendentes(): Promise<Pagamento[]> {
  const { data, error } = await erp()
    .from("v_pagamentos")
    .select("*")
    .in("estado", ["pendente", "pendente_confirmacao"])
    .order("criado_em", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Pagamento[];
}

export async function registarPagamento(params: {
  pedido_id: string;
  forma_id: string;
  valor: number;
  referencia?: string | null;
  comprovativo_url?: string | null;
  data_prevista?: string | null;
  observacoes?: string | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("registar_pagamento", {
    p_pedido_id: params.pedido_id,
    p_forma_id: params.forma_id,
    p_valor: params.valor,
    p_referencia: params.referencia ?? null,
    p_comprovativo_url: params.comprovativo_url ?? null,
    p_data_prevista: params.data_prevista ?? null,
    p_observacoes: params.observacoes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function confirmarPagamento(id: string, comprovativoUrl?: string | null) {
  const { error } = await erp().rpc("confirmar_pagamento", {
    p_pagamento_id: id,
    p_comprovativo_url: comprovativoUrl ?? null,
  });
  if (error) throw error;
}

export async function rejeitarPagamento(id: string, motivo: string) {
  const { error } = await erp().rpc("rejeitar_pagamento", {
    p_pagamento_id: id,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function devolverPagamento(id: string, motivo: string) {
  const { error } = await erp().rpc("devolver_pagamento", {
    p_pagamento_id: id,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function lerFormasAtivas(): Promise<FormaPagamento[]> {
  const { data, error } = await erp()
    .from("formas_pagamento")
    .select("*")
    .eq("ativo", true)
    .is("eliminado_em", null)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FormaPagamento[];
}

// ----------------------------------------------------------------------- caixa
export async function lerCaixaAtual(utilizadorId: string): Promise<Caixa | null> {
  const { data, error } = await erp()
    .from("v_caixas")
    .select("*")
    .eq("utilizador_id", utilizadorId)
    .eq("estado", "aberto")
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Caixa | null;
}

export async function lerCaixas(params?: { utilizadorId?: string }): Promise<Caixa[]> {
  let consulta = erp().from("v_caixas").select("*").order("data", { ascending: false }).limit(200);
  if (params?.utilizadorId) consulta = consulta.eq("utilizador_id", params.utilizadorId);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as Caixa[];
}

export async function lerMovimentos(caixaId: string): Promise<CaixaMovimento[]> {
  const { data, error } = await erp()
    .from("v_caixa_movimentos")
    .select("*")
    .eq("caixa_id", caixaId)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CaixaMovimento[];
}

export async function abrirCaixa(saldoInicial?: number | null): Promise<string> {
  const { data, error } = await erp().rpc("abrir_caixa", {
    p_saldo_inicial: saldoInicial ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function fecharCaixa(caixaId: string, saldoContado: number, justificacao?: string) {
  const { data, error } = await erp().rpc("fechar_caixa", {
    p_caixa_id: caixaId,
    p_saldo_contado: saldoContado,
    p_justificacao: justificacao ?? null,
  });
  if (error) throw error;
  return data as { esperado: number; contado: number; diferenca: number };
}

export async function reabrirCaixa(caixaId: string, motivo: string) {
  const { error } = await erp().rpc("reabrir_caixa", {
    p_caixa_id: caixaId,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function registarSaidaCaixa(params: {
  valor: number;
  motivo_id: string;
  descricao?: string | null;
  comprovativo_url?: string | null;
}) {
  const { error } = await erp().rpc("registar_saida_caixa", {
    p_valor: params.valor,
    p_motivo_id: params.motivo_id,
    p_descricao: params.descricao ?? null,
    p_comprovativo_url: params.comprovativo_url ?? null,
  });
  if (error) throw error;
}

export async function registarSangria(params: {
  caixa_id: string;
  valor: number;
  motivo_id: string;
  descricao?: string | null;
}) {
  const { error } = await erp().rpc("registar_sangria", {
    p_caixa_id: params.caixa_id,
    p_valor: params.valor,
    p_motivo_id: params.motivo_id,
    p_descricao: params.descricao ?? null,
  });
  if (error) throw error;
}

/** Motivos configurados para saídas de caixa. */
export async function lerMotivosSaida(): Promise<Motivo[]> {
  const { data, error } = await erp()
    .from("motivos")
    .select("*")
    .eq("contexto", "saida_caixa")
    .eq("ativo", true)
    .is("eliminado_em", null)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Motivo[];
}
