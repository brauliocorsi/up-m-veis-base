import { erp } from "./db";
import type { Cupao, Pedido, PedidoItem } from "./tipos";

/** Cria um orçamento novo para um cliente e devolve o id. */
export async function criarOrcamento(params: {
  cliente_id: string;
  origem?: string;
  morada_entrega?: string | null;
  cp4_entrega?: string | null;
  cp3_entrega?: string | null;
  localidade_entrega?: string | null;
  contacto_entrega?: string | null;
}): Promise<string> {
  const { data, error } = await erp()
    .from("pedidos")
    .insert({
      cliente_id: params.cliente_id,
      origem: params.origem ?? "loja",
      morada_entrega: params.morada_entrega ?? null,
      cp4_entrega: params.cp4_entrega ?? null,
      cp3_entrega: params.cp3_entrega ?? null,
      localidade_entrega: params.localidade_entrega ?? null,
      contacto_entrega: params.contacto_entrega ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function lerPedido(id: string): Promise<Pedido> {
  const { data, error } = await erp().from("v_pedidos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Pedido não encontrado.");
  return data as Pedido;
}

export async function lerItens(pedidoId: string): Promise<PedidoItem[]> {
  const { data, error } = await erp()
    .from("v_pedido_itens")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("linha", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PedidoItem[];
}

export async function guardarPedido(id: string, campos: Record<string, unknown>) {
  const { error } = await erp().from("pedidos").update(campos).eq("id", id);
  if (error) throw error;
}

/** Altera a data de entrega de uma venda confirmada, em preparação ou pronta. */
export async function alterarDataEntrega(
  pedidoId: string,
  data: string,
  motivoId: string,
  nota?: string,
): Promise<string> {
  const { data: nova, error } = await erp().rpc("alterar_data_entrega", {
    p_pedido_id: pedidoId,
    p_data: data,
    p_motivo_id: motivoId,
    p_nota: nota?.trim() || null,
  });
  if (error) throw error;
  return nova as string;
}

export async function adicionarItem(campos: {
  pedido_id: string;
  linha: number;
  produto_id?: string | null;
  servico_id?: string | null;
  descricao?: string;
  quantidade: number;
  preco_unitario: number;
  montagem_incluida?: boolean;
}) {
  const { error } = await erp()
    .from("pedido_itens")
    .insert({ descricao: "", ...campos });
  if (error) throw error;
}

export async function guardarItem(id: string, campos: Record<string, unknown>) {
  const { error } = await erp().from("pedido_itens").update(campos).eq("id", id);
  if (error) throw error;
}

export async function removerItem(id: string, motivo?: string) {
  const { error } = await erp().rpc("remover_item", {
    p_item_id: id,
    p_motivo: motivo ?? null,
  });
  if (error) throw error;
}

export async function confirmarPedido(id: string) {
  const { data, error } = await erp().rpc("confirmar_pedido", { p_pedido_id: id });
  if (error) throw error;
  return data as { numero: string; data_entrega: string };
}

export async function cancelarPedido(id: string, motivoId: string, nota: string) {
  const { error } = await erp().rpc("cancelar_pedido", {
    p_pedido_id: id,
    p_motivo_id: motivoId,
    p_nota: nota,
  });
  if (error) throw error;
}

export async function reabrirPedido(id: string, nota: string) {
  const { error } = await erp().rpc("reabrir_pedido", { p_pedido_id: id, p_nota: nota });
  if (error) throw error;
}

/** Procura um cupão pelo código escrito pela vendedora. */
export async function procurarCupao(codigo: string): Promise<Cupao | null> {
  const { data, error } = await erp()
    .from("v_cupoes")
    .select("*")
    .ilike("codigo", codigo.trim())
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Cupao | null;
}
