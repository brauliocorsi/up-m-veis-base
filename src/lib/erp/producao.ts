import { erp } from "./db";
import type {
  ChaoFabricaLinha,
  Componente,
  EtapaProducao,
  NecessidadeProducao,
  OpConsumo,
  OpEtapa,
  OrdemProducao,
  ProdutoOpcao,
} from "./tipos";

// ---------------- etapas ----------------

export async function lerEtapas(incluirInativas = false): Promise<EtapaProducao[]> {
  let consulta = erp().from("v_etapas_producao").select("*").order("ordem", { ascending: true });
  if (!incluirInativas) consulta = consulta.eq("ativo", true);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as EtapaProducao[];
}

export async function guardarEtapa(
  campos: {
    codigo: string;
    nome: string;
    ordem: number;
    permite_stock_intermedio: boolean;
    exige_conferencia: boolean;
    ativo: boolean;
  },
  id?: string,
) {
  const linha = { ...campos, codigo: campos.codigo.trim().toUpperCase(), nome: campos.nome.trim() };
  const consulta = erp().from("etapas_producao");
  const { error } = id ? await consulta.update(linha).eq("id", id) : await consulta.insert(linha);
  if (error) throw error;
}

// ---------------- necessidades de produção ----------------

export async function listarNecessidadesProducao(): Promise<NecessidadeProducao[]> {
  const { data, error } = await erp()
    .from("v_necessidades_producao")
    .select("*")
    .in("estado", ["aberta", "convertida"])
    .order("data_necessaria", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as NecessidadeProducao[];
}

export async function necessidadesProducaoDoPedido(
  pedidoId: string,
): Promise<NecessidadeProducao[]> {
  const { data, error } = await erp()
    .from("v_necessidades_producao")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NecessidadeProducao[];
}

/** Agrupa várias necessidades do mesmo produto numa só ordem de produção. */
export async function criarOp(params: {
  produto_id: string;
  necessidades?: string[];
  quantidade?: number | null;
  data_prevista?: string | null;
  prioridade?: number;
  observacoes?: string | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("criar_op", {
    p_produto_id: params.produto_id,
    p_necessidades: params.necessidades ?? null,
    p_quantidade: params.quantidade ?? null,
    p_data_prevista: params.data_prevista ?? null,
    p_prioridade: params.prioridade ?? 5,
    p_observacoes: params.observacoes ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ---------------- ordens de produção ----------------

export async function listarOps(estados?: string[]): Promise<OrdemProducao[]> {
  let consulta = erp()
    .from("v_ordens_producao")
    .select("*")
    .order("prioridade", { ascending: true })
    .order("data_prevista", { ascending: true, nullsFirst: false });
  if (estados && estados.length > 0) consulta = consulta.in("estado", estados);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as OrdemProducao[];
}

export async function lerOp(id: string): Promise<OrdemProducao> {
  const { data, error } = await erp()
    .from("v_ordens_producao")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Ordem de produção não encontrada.");
  return data as OrdemProducao;
}

export async function lerOpEtapas(opId: string): Promise<OpEtapa[]> {
  const { data, error } = await erp()
    .from("v_op_etapas")
    .select("*")
    .eq("op_id", opId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OpEtapa[];
}

export async function lerOpConsumos(opId: string): Promise<OpConsumo[]> {
  const { data, error } = await erp()
    .from("v_op_consumos")
    .select("*")
    .eq("op_id", opId)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OpConsumo[];
}

export async function iniciarEtapa(opEtapaId: string) {
  const { error } = await erp().rpc("iniciar_etapa", { p_op_etapa_id: opEtapaId });
  if (error) throw error;
}

export interface ResultadoEtapa {
  faltas: Array<{ componente: string; falta: number }>;
}

export async function concluirEtapa(params: {
  op_etapa_id: string;
  quantidade_ok: number;
  quantidade_refugo?: number;
  motivo_refugo?: string | null;
  observacoes?: string | null;
}): Promise<ResultadoEtapa> {
  const { data, error } = await erp().rpc("concluir_etapa", {
    p_op_etapa_id: params.op_etapa_id,
    p_quantidade_ok: params.quantidade_ok,
    p_quantidade_refugo: params.quantidade_refugo ?? 0,
    p_motivo_refugo: params.motivo_refugo ?? null,
    p_observacoes: params.observacoes ?? null,
  });
  if (error) throw error;
  return (data ?? { faltas: [] }) as ResultadoEtapa;
}

export async function conferirEtapa(opEtapaId: string) {
  const { error } = await erp().rpc("conferir_etapa", { p_op_etapa_id: opEtapaId });
  if (error) throw error;
}

export interface ResultadoConclusao {
  produzido: number;
  reservado: number;
  sobra: number;
}

export async function concluirOp(opId: string, quantidade: number): Promise<ResultadoConclusao> {
  const { data, error } = await erp().rpc("concluir_op", {
    p_op_id: opId,
    p_quantidade: quantidade,
  });
  if (error) throw error;
  return data as ResultadoConclusao;
}

export async function cancelarOp(opId: string, motivo: string) {
  const { error } = await erp().rpc("cancelar_op", { p_op_id: opId, p_motivo: motivo });
  if (error) throw error;
}

// ---------------- chão de fábrica ----------------

export async function lerChaoFabrica(etapaId?: string | null): Promise<ChaoFabricaLinha[]> {
  let consulta = erp()
    .from("v_chao_fabrica")
    .select("*")
    .order("prioridade", { ascending: true })
    .order("data_prevista", { ascending: true, nullsFirst: false });
  if (etapaId) consulta = consulta.eq("etapa_id", etapaId);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as ChaoFabricaLinha[];
}

// ---------------- componentes (lista de materiais) ----------------

export async function lerComponentes(produtoId?: string | null): Promise<Componente[]> {
  let consulta = erp()
    .from("v_componentes")
    .select("*")
    .order("produto_nome", { ascending: true });
  if (produtoId) consulta = consulta.eq("produto_id", produtoId);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as Componente[];
}

export async function gravarComponente(params: {
  id?: string | null;
  produto_id: string;
  componente_id: string;
  quantidade: number;
  unidade: string;
  etapa_id?: string | null;
  observacoes?: string | null;
}) {
  const { error } = await erp().rpc("gravar_componente", {
    p_id: params.id ?? null,
    p_produto_id: params.produto_id,
    p_componente_id: params.componente_id,
    p_quantidade: params.quantidade,
    p_unidade: params.unidade,
    p_etapa_id: params.etapa_id ?? null,
    p_observacoes: params.observacoes ?? null,
  });
  if (error) throw error;
}

export async function eliminarComponente(id: string, motivo: string) {
  const { error } = await erp()
    .from("componentes")
    .update({ eliminado_em: new Date().toISOString(), motivo_eliminacao: motivo })
    .eq("id", id);
  if (error) throw error;
}

/** Produtos para os selectores da fábrica: sem preços nem custos. */
export async function produtosParaProducao(apenasProducao = false): Promise<ProdutoOpcao[]> {
  let consulta = erp()
    .from("produtos")
    .select("id, nome_cliente, cod_barras, tipo_fornecimento")
    .is("eliminado_em", null)
    .eq("ativo", true)
    .order("nome_cliente", { ascending: true })
    .limit(500);
  if (apenasProducao) consulta = consulta.eq("tipo_fornecimento", "producao");
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as ProdutoOpcao[];
}
