import { erp } from "./db";
import type {
  DocumentoFiscal,
  Entrega,
  EntregaItem,
  EntreguePorReceber,
  LinhaEntrega,
  TipoDocumentoFiscal,
} from "./tipos";

// ------------------------------------------------------------------- entregas
/** Linhas do pedido com o que já saiu e o que falta entregar. */
export async function lerLinhasEntrega(pedidoId: string): Promise<LinhaEntrega[]> {
  const { data, error } = await erp()
    .from("v_pedido_entrega")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("linha", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LinhaEntrega[];
}

export async function lerEntregasDoPedido(pedidoId: string): Promise<Entrega[]> {
  const { data, error } = await erp()
    .from("v_entregas")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("data_entrega", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Entrega[];
}

export async function lerLinhasDaEntrega(entregaId: string): Promise<EntregaItem[]> {
  const { data, error } = await erp()
    .from("v_entrega_itens")
    .select("*")
    .eq("entrega_id", entregaId)
    .order("linha", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EntregaItem[];
}

export interface LinhaARegistar {
  pedido_item_id: string;
  quantidade: number;
  motivo_nao_entrega?: string | null;
}

export async function registarEntrega(params: {
  pedido_id: string;
  linhas: LinhaARegistar[];
  data?: string | null;
  recebido_por?: string | null;
  observacoes?: string | null;
}): Promise<{ entrega_id: string; tipo: "total" | "parcial"; por_entregar: number }> {
  const { data, error } = await erp().rpc("registar_entrega", {
    p_pedido_id: params.pedido_id,
    p_linhas: params.linhas,
    p_data: params.data ?? null,
    p_recebido_por: params.recebido_por ?? null,
    p_observacoes: params.observacoes ?? null,
  });
  if (error) throw error;
  return data as { entrega_id: string; tipo: "total" | "parcial"; por_entregar: number };
}

/** Devolução: repõe o stock e fica no histórico. Uma entrega nunca se edita. */
export async function reverterEntrega(entregaId: string, motivo: string) {
  const { error } = await erp().rpc("reverter_entrega", {
    p_entrega_id: entregaId,
    p_motivo: motivo,
  });
  if (error) throw error;
}

// --------------------------------------------------------- documentos fiscais
export async function lerDocumentosDoPedido(pedidoId: string): Promise<DocumentoFiscal[]> {
  const { data, error } = await erp()
    .from("v_documentos_fiscais")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentoFiscal[];
}

export async function registarDocumentoFiscal(params: {
  pedido_id: string;
  tipo: TipoDocumentoFiscal;
  entrega_id?: string | null;
  numero?: string | null;
  serie?: string | null;
  valor?: number | null;
  data_emissao?: string | null;
  codigo_at?: string | null;
  atcud?: string | null;
  url_pdf?: string | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("registar_documento_fiscal", {
    p_pedido_id: params.pedido_id,
    p_tipo: params.tipo,
    p_entrega_id: params.entrega_id ?? null,
    p_numero: params.numero ?? null,
    p_serie: params.serie ?? null,
    p_valor: params.valor ?? null,
    p_data_emissao: params.data_emissao ?? null,
    p_codigo_at: params.codigo_at ?? null,
    p_atcud: params.atcud ?? null,
    p_url_pdf: params.url_pdf ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function anularDocumentoFiscal(id: string, motivo: string) {
  const { error } = await erp().rpc("anular_documento_fiscal", {
    p_documento_id: id,
    p_motivo: motivo,
  });
  if (error) throw error;
}

// ----------------------------------------------------- entregue por receber
export async function lerEntreguePorReceber(): Promise<EntreguePorReceber[]> {
  const { data, error } = await erp()
    .from("v_entregue_por_receber")
    .select("*")
    .order("data_entrega_efetiva", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as EntreguePorReceber[];
}

export async function gerarAlertasFaturacao(dias = 3): Promise<number> {
  const { data, error } = await erp().rpc("gerar_alertas_faturacao", { p_dias: dias });
  if (error) throw error;
  return Number(data ?? 0);
}
