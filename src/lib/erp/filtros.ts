import { erp } from "./db";
import { descarregarCsv } from "./financeiro";
import { listar, type Filtro } from "./listar";
import { formatarDataCurta, type Pedido } from "./tipos";

/** Filtros partilhados por Vendas, Financeiro e Entregas. Vivem no URL. */
export interface FiltrosVendas {
  de?: string;
  ate?: string;
  entrega_de?: string;
  entrega_ate?: string;
  efetiva_de?: string;
  efetiva_ate?: string;
  vendedor?: string;
  estado?: string;
  fiscal?: string;
  pagamento?: string;
  cliente?: string;
  produto?: string;
  cp4?: string;
  origem?: string;
}

export const CAMPOS_PESQUISA_PEDIDO = [
  "numero",
  "cliente_nome",
  "cliente_telefone",
  "cliente_nif",
];

/** Lê os filtros do URL, ignorando valores vazios. */
export function lerFiltros(bruto: Record<string, unknown>): FiltrosVendas {
  const texto = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? undefined : s;
  };
  return {
    de: texto(bruto["de"]),
    ate: texto(bruto["ate"]),
    entrega_de: texto(bruto["entrega_de"]),
    entrega_ate: texto(bruto["entrega_ate"]),
    efetiva_de: texto(bruto["efetiva_de"]),
    efetiva_ate: texto(bruto["efetiva_ate"]),
    vendedor: texto(bruto["vendedor"]),
    estado: texto(bruto["estado"]),
    fiscal: texto(bruto["fiscal"]),
    pagamento: texto(bruto["pagamento"]),
    cliente: texto(bruto["cliente"]),
    produto: texto(bruto["produto"]),
    cp4: texto(bruto["cp4"]),
    origem: texto(bruto["origem"]),
  };
}

export function contarFiltros(f: FiltrosVendas): number {
  return Object.values(f).filter((v) => typeof v === "string" && v !== "").length;
}

/** Pedidos que contêm um produto (pesquisa por nome ou código de barras). */
export async function idsPedidosComProduto(termo: string): Promise<string[]> {
  const t = termo.trim();
  if (!t) return [];
  const { data, error } = await erp()
    .from("v_pedido_itens")
    .select("pedido_id")
    .or(`descricao.ilike.%${t}%,cod_barras.ilike.%${t}%`)
    .limit(2000);
  if (error) throw error;
  const ids = new Set<string>();
  for (const linha of (data ?? []) as Array<{ pedido_id: string }>) ids.add(linha.pedido_id);
  return [...ids];
}

/** Converte os filtros em condições para a listagem de v_pedidos. */
export function filtrosParaPedidos(f: FiltrosVendas, idsProduto?: string[] | null): Filtro[] {
  const lista: Filtro[] = [];
  if (f.de) lista.push({ campo: "criado_em", op: "gte", valor: `${f.de}T00:00:00` });
  if (f.ate) lista.push({ campo: "criado_em", op: "lte", valor: `${f.ate}T23:59:59` });
  if (f.entrega_de) lista.push({ campo: "data_entrega_prevista", op: "gte", valor: f.entrega_de });
  if (f.entrega_ate) lista.push({ campo: "data_entrega_prevista", op: "lte", valor: f.entrega_ate });
  if (f.efetiva_de) lista.push({ campo: "data_entrega_efetiva", op: "gte", valor: f.efetiva_de });
  if (f.efetiva_ate) lista.push({ campo: "data_entrega_efetiva", op: "lte", valor: f.efetiva_ate });
  if (f.vendedor) lista.push({ campo: "vendedor_id", valor: f.vendedor });
  if (f.estado) lista.push({ campo: "estado", valor: f.estado });
  if (f.fiscal) lista.push({ campo: "estado_fiscal", valor: f.fiscal });
  if (f.pagamento) lista.push({ campo: "estado_pagamento", valor: f.pagamento });
  if (f.cp4) lista.push({ campo: "cp4_entrega", valor: f.cp4 });
  if (f.origem) lista.push({ campo: "origem", valor: f.origem });
  if (idsProduto) {
    lista.push({ campo: "id", op: "in", valor: idsProduto.length > 0 ? idsProduto : ["-"] });
  }
  return lista;
}

const COLUNAS_CSV = [
  { chave: "numero", etiqueta: "Número" },
  { chave: "criado_em", etiqueta: "Data" },
  { chave: "cliente_nome", etiqueta: "Cliente" },
  { chave: "cliente_telefone", etiqueta: "Telefone" },
  { chave: "vendedor_nome", etiqueta: "Vendedora" },
  { chave: "estado", etiqueta: "Estado" },
  { chave: "estado_fiscal", etiqueta: "Estado fiscal" },
  { chave: "estado_pagamento", etiqueta: "Estado de pagamento" },
  { chave: "data_entrega_prevista", etiqueta: "Entrega prevista" },
  { chave: "data_entrega_efetiva", etiqueta: "Entrega efetiva" },
  { chave: "total", etiqueta: "Total" },
  { chave: "total_pago", etiqueta: "Recebido" },
  { chave: "pendente", etiqueta: "Pendente" },
  { chave: "pendente_confirmacao", etiqueta: "Pendente de confirmação" },
  { chave: "a_receber_entrega", etiqueta: "A receber na entrega" },
];

/** Exporta exactamente o que está filtrado no ecrã. */
export async function exportarPedidosCsv(params: {
  filtros: Filtro[];
  pesquisa: string;
  ordenarPor: string;
  ascendente: boolean;
}) {
  const { linhas } = await listar<Pedido>({
    tabela: "v_pedidos",
    camposPesquisa: CAMPOS_PESQUISA_PEDIDO,
    pesquisa: params.pesquisa,
    ordenarPor: params.ordenarPor,
    ascendente: params.ascendente,
    pagina: 1,
    tamanho: 2000,
    temEliminacao: false,
    filtros: params.filtros,
  });
  descarregarCsv(
    "vendas",
    COLUNAS_CSV,
    linhas.map((p) => ({
      ...p,
      criado_em: formatarDataCurta(p.criado_em),
      data_entrega_prevista: formatarDataCurta(p.data_entrega_prevista),
      data_entrega_efetiva: formatarDataCurta(p.data_entrega_efetiva ?? null),
      pendente: (Number(p.total) - Number(p.total_pago)).toFixed(2),
      total: Number(p.total).toFixed(2),
      total_pago: Number(p.total_pago).toFixed(2),
      pendente_confirmacao: Number(p.pendente_confirmacao ?? 0).toFixed(2),
      a_receber_entrega: Number(p.a_receber_entrega ?? 0).toFixed(2),
    })),
  );
}
