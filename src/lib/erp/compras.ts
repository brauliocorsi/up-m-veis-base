import { erp } from "./db";
import type {
  ContaPagar,
  FornecimentoLinha,
  Necessidade,
  OcItem,
  OcRecebimento,
  OrdemCompra,
  PedidoCompra,
  PedidoCompraItem,
  PedidoItem,
} from "./tipos";

// ---------------- necessidades ----------------

export async function listarNecessidadesAbertas(): Promise<Necessidade[]> {
  const { data, error } = await erp()
    .from("v_necessidades_compra")
    .select("*")
    .in("estado", ["aberta", "encomendada"])
    .gt("falta", 0)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Necessidade[];
}

/** Cria uma ordem de compra com várias linhas do mesmo fornecedor, com quantidade escolhida. */
export async function criarOcLinhas(
  fornecedorId: string,
  linhas: Array<{ necessidade_id: string; quantidade: number }>,
): Promise<string> {
  const { data, error } = await erp().rpc("criar_oc_linhas", {
    p_fornecedor_id: fornecedorId,
    p_linhas: linhas,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Fornecimento das linhas de uma venda, SEM custos.
 * Lê v_fornecimento_linha (exceção deliberada, acessível a todos os perfis ativos).
 */
export async function fornecimentoDoPedido(pedidoId: string): Promise<FornecimentoLinha[]> {
  const { data, error } = await erp()
    .from("v_fornecimento_linha")
    .select("*")
    .eq("pedido_id", pedidoId)
    .not("oc_item_id", "is", null)
    .neq("oc_estado", "cancelada");
  if (error) throw error;
  return (data ?? []) as FornecimentoLinha[];
}

/** Fornecimento de um produto (todas as vendas), SEM custos. */
export async function fornecimentoDoProduto(produtoId: string): Promise<FornecimentoLinha[]> {
  const { data, error } = await erp()
    .from("v_fornecimento_linha")
    .select("*")
    .eq("produto_id", produtoId)
    .not("oc_item_id", "is", null)
    .limit(100);
  if (error) throw error;
  return (data ?? []) as FornecimentoLinha[];
}

/** Necessidades ligadas a uma venda (mesmo as que ainda não têm ordem de compra). */
export async function necessidadesDoPedido(pedidoId: string): Promise<Necessidade[]> {
  const { data, error } = await erp()
    .from("v_necessidades_compra")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Necessidade[];
}

/** Histórico de compras de um produto. */
export async function comprasDoProduto(produtoId: string): Promise<OcItem[]> {
  const { data, error } = await erp()
    .from("v_oc_itens")
    .select("*")
    .eq("produto_id", produtoId)
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as OcItem[];
}

/** Vendas que contêm um produto. */
export async function vendasDoProduto(produtoId: string): Promise<PedidoItem[]> {
  const { data, error } = await erp()
    .from("v_pedido_itens")
    .select("*")
    .eq("produto_id", produtoId)
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as PedidoItem[];
}

// ---------------- ordens de compra ----------------

export async function criarOc(fornecedorId: string, necessidadeIds: string[]): Promise<string> {
  const { data, error } = await erp().rpc("criar_oc", {
    p_fornecedor_id: fornecedorId,
    p_necessidade_ids: necessidadeIds,
  });
  if (error) throw error;
  return data as string;
}

export async function lerOc(id: string): Promise<OrdemCompra> {
  const { data, error } = await erp().from("v_ordens_compra").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Ordem de compra não encontrada.");
  return data as OrdemCompra;
}

export async function lerOcItens(ocId: string): Promise<OcItem[]> {
  const { data, error } = await erp()
    .from("v_oc_itens")
    .select("*")
    .eq("oc_id", ocId)
    .order("linha", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OcItem[];
}

export async function lerRecebimentos(ocId: string): Promise<OcRecebimento[]> {
  const { data, error } = await erp()
    .from("v_oc_recebimentos")
    .select("*")
    .eq("oc_id", ocId)
    .order("data", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OcRecebimento[];
}

export async function guardarOc(id: string, campos: Record<string, unknown>) {
  const { error } = await erp().from("ordens_compra").update(campos).eq("id", id);
  if (error) throw error;
}

export async function guardarOcItem(id: string, campos: Record<string, unknown>) {
  const { error } = await erp().from("oc_itens").update(campos).eq("id", id);
  if (error) throw error;
}

export interface ResultadoFinalizar {
  numero: string;
  automatico: boolean;
  email: string | null;
  idioma: string;
}

export async function finalizarOc(id: string): Promise<ResultadoFinalizar> {
  const { data, error } = await erp().rpc("finalizar_oc", { p_oc_id: id });
  if (error) throw error;
  return data as ResultadoFinalizar;
}

export async function registarEnvioOc(params: {
  oc_id: string;
  message_id?: string | null;
  erro?: string | null;
  para?: string | null;
}) {
  const { error } = await erp().rpc("registar_envio_oc", {
    p_oc_id: params.oc_id,
    p_message_id: params.message_id ?? null,
    p_erro: params.erro ?? null,
    p_para: params.para ?? null,
  });
  if (error) throw error;
}

export async function confirmarEtaOc(id: string, data: string) {
  const { error } = await erp().rpc("confirmar_eta_oc", { p_oc_id: id, p_data: data });
  if (error) throw error;
}

export async function receberOc(params: {
  oc_id: string;
  linhas: Array<{ item_id: string; quantidade: number }>;
  doc?: string | null;
  observacoes?: string | null;
}) {
  const { data, error } = await erp().rpc("receber_oc", {
    p_oc_id: params.oc_id,
    p_linhas: params.linhas,
    p_doc: params.doc ?? null,
    p_observacoes: params.observacoes ?? null,
  });
  if (error) throw error;
  return data as { recebimento_id: string; unidades: number; valor: number };
}

export async function cancelarOc(id: string, motivoId: string, nota?: string) {
  const { error } = await erp().rpc("cancelar_oc", {
    p_oc_id: id,
    p_motivo_id: motivoId,
    p_nota: nota ?? null,
  });
  if (error) throw error;
}

// ---------------- contas a pagar ----------------

export async function registarPagamentoConta(params: {
  conta_id: string;
  valor: number;
  data?: string | null;
  doc?: string | null;
  comprovativo_url?: string | null;
}) {
  const { error } = await erp().rpc("registar_pagamento_conta", {
    p_conta_id: params.conta_id,
    p_valor: params.valor,
    p_data: params.data ?? null,
    p_doc: params.doc ?? null,
    p_comprovativo_url: params.comprovativo_url ?? null,
  });
  if (error) throw error;
}

export async function resumoContasPagar(): Promise<ContaPagar[]> {
  const { data, error } = await erp()
    .from("v_contas_pagar")
    .select("*")
    .in("estado", ["pendente", "paga_parcial"])
    .order("data_vencimento", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ContaPagar[];
}

// ---------------- pedidos de compra manuais ----------------

export async function criarPedidoCompra(params: {
  destino: string;
  justificacao: string;
  urgencia: string;
}): Promise<string> {
  const { data, error } = await erp().rpc("criar_pedido_compra", {
    p_destino: params.destino,
    p_justificacao: params.justificacao,
    p_urgencia: params.urgencia,
  });
  if (error) throw error;
  return data as string;
}

export async function adicionarItemPedidoCompra(campos: {
  pedido_compra_id: string;
  produto_id?: string | null;
  descricao_livre?: string | null;
  quantidade: number;
  custo_estimado: number;
  fornecedor_sugerido_id?: string | null;
}) {
  const { error } = await erp().from("pedidos_compra_itens").insert(campos);
  if (error) throw error;
}

export async function lerPedidoCompra(id: string): Promise<PedidoCompra> {
  const { data, error } = await erp()
    .from("v_pedidos_compra")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Pedido de compra não encontrado.");
  return data as PedidoCompra;
}

export async function lerItensPedidoCompra(id: string): Promise<PedidoCompraItem[]> {
  const { data, error } = await erp()
    .from("v_pedidos_compra_itens")
    .select("*")
    .eq("pedido_compra_id", id)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PedidoCompraItem[];
}

export async function submeterPedidoCompra(id: string): Promise<string> {
  const { data, error } = await erp().rpc("submeter_pedido_compra", { p_id: id });
  if (error) throw error;
  return data as string;
}

export async function aprovarPedidoCompra(id: string) {
  const { error } = await erp().rpc("aprovar_pedido_compra", { p_id: id });
  if (error) throw error;
}

export async function recusarPedidoCompra(id: string, motivo: string) {
  const { error } = await erp().rpc("recusar_pedido_compra", { p_id: id, p_motivo: motivo });
  if (error) throw error;
}

export async function converterPedidoCompra(id: string, fornecedorId: string): Promise<string> {
  const { data, error } = await erp().rpc("converter_pedido_compra", {
    p_id: id,
    p_fornecedor_id: fornecedorId,
  });
  if (error) throw error;
  return data as string;
}
