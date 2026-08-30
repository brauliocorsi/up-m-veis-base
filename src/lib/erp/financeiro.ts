import { erp } from "./db";
import type {
  CategoriaDespesa,
  ConciliacaoCaixa,
  ConciliacaoVenda,
  ContaReceber,
  Despesa,
  FechoFinanceiro,
  FluxoSemana,
  MargemPedido,
  Periodicidade,
  RelAtrasoFornecedor,
  RelCupao,
  RelRecebimento,
  RelVenda,
} from "./tipos";

// ------------------------------------------------------------- contas a receber
export async function lerContasReceber(): Promise<ContaReceber[]> {
  const { data, error } = await erp()
    .from("v_contas_receber")
    .select("*")
    .order("criado_em", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ContaReceber[];
}

export async function lerFinanciadores(): Promise<
  Array<{
    forma_codigo: string;
    forma_nome: string;
    estado: string;
    n_pagamentos: number;
    bruto: number;
    taxa: number;
    liquido: number;
  }>
> {
  const { data, error } = await erp().from("v_financiadores").select("*");
  if (error) throw error;
  return (data ?? []) as never;
}

// ------------------------------------------------------------------- despesas
export async function lerCategoriasDespesa(): Promise<CategoriaDespesa[]> {
  const { data, error } = await erp()
    .from("v_categorias_despesa")
    .select("*")
    .eq("ativo", true)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoriaDespesa[];
}

export async function lerDespesas(): Promise<Despesa[]> {
  const { data, error } = await erp()
    .from("v_despesas")
    .select("*")
    .order("data_vencimento", { ascending: false })
    .limit(400);
  if (error) throw error;
  return (data ?? []) as Despesa[];
}

export async function criarDespesa(params: {
  descricao: string;
  categoria: string;
  valor: number;
  data_vencimento: string;
  fornecedor_id?: string | null;
  data_despesa?: string | null;
  recorrente?: boolean;
  periodicidade?: Periodicidade | null;
  comprovativo_url?: string | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("criar_despesa", {
    p_descricao: params.descricao,
    p_categoria: params.categoria,
    p_valor: params.valor,
    p_data_vencimento: params.data_vencimento,
    p_fornecedor_id: params.fornecedor_id ?? null,
    p_data_despesa: params.data_despesa ?? null,
    p_recorrente: params.recorrente ?? false,
    p_periodicidade: params.periodicidade ?? null,
    p_comprovativo_url: params.comprovativo_url ?? null,
    p_origem_id: null,
  });
  if (error) throw error;
  return data as string;
}

// --------------------------------------------------------------- conciliação
export async function lerConciliacaoCaixa(): Promise<ConciliacaoCaixa[]> {
  const { data, error } = await erp()
    .from("v_conciliacao_caixa")
    .select("*")
    .order("data", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data ?? []) as ConciliacaoCaixa[];
}

export async function lerConciliacaoVendas(): Promise<ConciliacaoVenda[]> {
  const { data, error } = await erp()
    .from("v_conciliacao_vendas")
    .select("*")
    .order("confirmado_em", { ascending: false })
    .limit(400);
  if (error) throw error;
  return (data ?? []) as ConciliacaoVenda[];
}

export async function lerFluxoPrevisto(): Promise<FluxoSemana[]> {
  const { data, error } = await erp()
    .from("v_fluxo_previsto")
    .select("*")
    .order("semana", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FluxoSemana[];
}

export async function lerFechos(): Promise<FechoFinanceiro[]> {
  const { data, error } = await erp()
    .from("v_fechos_financeiros")
    .select("*")
    .order("data", { ascending: false })
    .limit(90);
  if (error) throw error;
  return (data ?? []) as FechoFinanceiro[];
}

export async function fecharDiaFinanceiro(data?: string, observacoes?: string): Promise<string> {
  const { data: id, error } = await erp().rpc("fechar_dia_financeiro", {
    p_data: data ?? null,
    p_observacoes: observacoes ?? null,
  });
  if (error) throw error;
  return id as string;
}

export async function gerarAlertasFinanceiros(): Promise<number> {
  const { data, error } = await erp().rpc("gerar_alertas_financeiros", {});
  if (error) throw error;
  return Number(data ?? 0);
}

// --------------------------------------------------------------- relatórios
export async function lerRelVendas(de: string, ate: string): Promise<RelVenda[]> {
  const { data, error } = await erp()
    .from("v_rel_vendas")
    .select("*")
    .gte("data", de)
    .lte("data", ate)
    .order("data", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as RelVenda[];
}

export async function lerRelMargens(de: string, ate: string): Promise<MargemPedido[]> {
  const { data, error } = await erp()
    .from("v_margem_pedidos")
    .select("*")
    .gte("confirmado_em", `${de}T00:00:00`)
    .lte("confirmado_em", `${ate}T23:59:59`)
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as MargemPedido[];
}

export async function lerRelRecebimentos(de: string, ate: string): Promise<RelRecebimento[]> {
  const { data, error } = await erp()
    .from("v_rel_recebimentos")
    .select("*")
    .gte("data", de)
    .lte("data", ate)
    .order("data", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as RelRecebimento[];
}

export async function lerRelContasPagar(): Promise<
  Array<{
    categoria: string;
    estado: string;
    data_vencimento: string;
    data_pagamento: string | null;
    n_contas: number;
    valor: number;
    valor_pago: number;
    em_divida: number;
  }>
> {
  const { data, error } = await erp()
    .from("v_rel_contas_pagar")
    .select("*")
    .order("data_vencimento", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as never;
}

export async function lerRelAtrasoFornecedores(): Promise<RelAtrasoFornecedor[]> {
  const { data, error } = await erp()
    .from("v_rel_atraso_fornecedores")
    .select("*")
    .order("dias_atraso", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as RelAtrasoFornecedor[];
}

export async function lerRelCupoes(): Promise<RelCupao[]> {
  const { data, error } = await erp()
    .from("v_rel_cupoes")
    .select("*")
    .order("desconto_total", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as RelCupao[];
}

/** Exporta linhas para CSV com separador ponto-e-vírgula (Excel português). */
export function descarregarCsv(
  nome: string,
  colunas: Array<{ chave: string; etiqueta: string }>,
  linhas: Array<Record<string, unknown>>,
) {
  const escapar = (v: unknown) => {
    const texto = v === null || v === undefined ? "" : String(v);
    return `"${texto.replace(/"/g, '""')}"`;
  };
  const conteudo = [
    colunas.map((c) => escapar(c.etiqueta)).join(";"),
    ...linhas.map((l) => colunas.map((c) => escapar(l[c.chave])).join(";")),
  ].join("\r\n");
  const blob = new Blob([`\uFEFF${conteudo}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// -------------------------------------------- entradas e saídas de dinheiro
/** Movimentos de dinheiro (loja e rotas) com ligação ao pedido e à rota. */
export async function lerMovimentosConciliacao(params?: {
  de?: string;
  ate?: string;
}): Promise<ConciliacaoMovimento[]> {
  let consulta = erp()
    .from("v_conciliacao_movimentos")
    .select("*")
    .order("ocorrido_em", { ascending: false })
    .limit(500);
  if (params?.de) consulta = consulta.gte("data", params.de);
  if (params?.ate) consulta = consulta.lte("data", params.ate);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as ConciliacaoMovimento[];
}

/** Totais de entradas, saídas e saldo por dia. */
export async function lerDiasConciliacao(params?: {
  de?: string;
  ate?: string;
}): Promise<ConciliacaoDia[]> {
  let consulta = erp()
    .from("v_conciliacao_dias")
    .select("*")
    .order("data", { ascending: false })
    .limit(120);
  if (params?.de) consulta = consulta.gte("data", params.de);
  if (params?.ate) consulta = consulta.lte("data", params.ate);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as ConciliacaoDia[];
}
