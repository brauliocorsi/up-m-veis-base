import { erp } from "./db";
import type {
  CentroOperador,
  CentroTrabalho,
  ConsumoFalta,
  LinhaBom,
  PlanoCarga,
  PlanoLinha,
  PlanoProducao,
  ResultadoAprovacao,
  ResultadoSimulacao,
  RoteiroLinha,
  UtilizadorOpcao,
} from "./tipos";

// ---------------- centros de trabalho ----------------

export async function lerCentros(incluirInativos = false): Promise<CentroTrabalho[]> {
  let consulta = erp().from("v_centros_trabalho").select("*").order("codigo", { ascending: true });
  if (!incluirInativos) consulta = consulta.eq("ativo", true);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as CentroTrabalho[];
}

export async function gravarCentro(params: {
  id?: string | null;
  codigo: string;
  nome: string;
  responsavel_id?: string | null;
  capacidade_min_dia: number;
  n_postos: number;
  eficiencia_pct: number;
  ativo: boolean;
}) {
  const { error } = await erp().rpc("gravar_centro", {
    p_id: params.id ?? null,
    p_codigo: params.codigo,
    p_nome: params.nome,
    p_responsavel_id: params.responsavel_id ?? null,
    p_capacidade_min_dia: params.capacidade_min_dia,
    p_n_postos: params.n_postos,
    p_eficiencia_pct: params.eficiencia_pct,
    p_ativo: params.ativo,
  });
  if (error) throw error;
}

export async function lerOperadoresCentro(centroId?: string | null): Promise<CentroOperador[]> {
  let consulta = erp()
    .from("v_centro_operadores")
    .select("*")
    .order("utilizador_nome", { ascending: true });
  if (centroId) consulta = consulta.eq("centro_id", centroId);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as CentroOperador[];
}

export async function atribuirOperador(params: {
  centro_id: string;
  utilizador_id: string;
  minutos_dia: number;
}) {
  const { error } = await erp().rpc("gravar_centro_operador", {
    p_centro_id: params.centro_id,
    p_utilizador_id: params.utilizador_id,
    p_minutos_dia: params.minutos_dia,
  });
  if (error) throw error;
}

export async function retirarOperador(id: string, motivo = "Saiu do centro") {
  const { error } = await erp().rpc("remover_centro_operador", { p_id: id, p_motivo: motivo });
  if (error) throw error;
}

export async function ligarEtapaCentro(etapaId: string, centroId: string | null) {
  const { error } = await erp().rpc("ligar_etapa_centro", {
    p_etapa_id: etapaId,
    p_centro_id: centroId,
  });
  if (error) throw error;
}

/** Pessoas ativas, para escolher responsáveis e operadores. */
export async function utilizadoresAtivos(): Promise<UtilizadorOpcao[]> {
  const { data, error } = await erp()
    .from("utilizadores")
    .select("id, nome, perfil")
    .is("eliminado_em", null)
    .eq("ativo", true)
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as UtilizadorOpcao[];
}

// ---------------- roteiros ----------------

export async function lerRoteiro(produtoId?: string | null): Promise<RoteiroLinha[]> {
  let consulta = erp()
    .from("v_produto_roteiro")
    .select("*")
    .order("produto_nome", { ascending: true })
    .order("ordem", { ascending: true });
  if (produtoId) consulta = consulta.eq("produto_id", produtoId);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as RoteiroLinha[];
}

export async function gravarRoteiro(params: {
  id?: string | null;
  produto_id: string;
  etapa_id: string;
  ordem: number;
  tempo_setup_min: number;
  tempo_unitario_min: number;
  instrucoes?: string | null;
}) {
  const { error } = await erp().rpc("gravar_roteiro", {
    p_id: params.id ?? null,
    p_produto_id: params.produto_id,
    p_etapa_id: params.etapa_id,
    p_ordem: params.ordem,
    p_tempo_setup_min: params.tempo_setup_min,
    p_tempo_unitario_min: params.tempo_unitario_min,
    p_instrucoes: params.instrucoes ?? null,
  });
  if (error) throw error;
}

export async function removerRoteiro(id: string, motivo = "Retirado do roteiro") {
  const { error } = await erp().rpc("remover_roteiro", { p_id: id, p_motivo: motivo });
  if (error) throw error;
}

/** Minutos de uma etapa para N unidades: setup + unitário × N. */
export function minutosEtapa(linha: RoteiroLinha, unidades: number): number {
  return linha.tempo_setup_min + Number(linha.tempo_unitario_min) * unidades;
}

// ---------------- explosão da lista de materiais ----------------

export async function explodirBom(produtoId: string, quantidade: number): Promise<LinhaBom[]> {
  const { data, error } = await erp().rpc("explodir_bom", {
    p_produto_id: produtoId,
    p_quantidade: quantidade,
  });
  if (error) throw error;
  return (data ?? []) as LinhaBom[];
}

// ---------------- planos ----------------

export async function lerPlanos(): Promise<PlanoProducao[]> {
  const { data, error } = await erp()
    .from("v_planos_producao")
    .select("*")
    .order("data_inicio", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlanoProducao[];
}

export async function lerPlano(id: string): Promise<PlanoProducao> {
  const { data, error } = await erp()
    .from("v_planos_producao")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Plano de produção não encontrado.");
  return data as PlanoProducao;
}

export async function criarPlano(params: {
  nome: string;
  data_inicio: string;
  data_fim: string;
  notas?: string | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("criar_plano", {
    p_nome: params.nome,
    p_data_inicio: params.data_inicio,
    p_data_fim: params.data_fim,
    p_notas: params.notas ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function lerPlanoLinhas(planoId: string): Promise<PlanoLinha[]> {
  const { data, error } = await erp()
    .from("v_plano_linhas")
    .select("*")
    .eq("plano_id", planoId)
    .order("urgente", { ascending: false })
    .order("prioridade", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlanoLinha[];
}

export async function lerPlanoCarga(planoId: string): Promise<PlanoCarga[]> {
  const { data, error } = await erp()
    .from("v_plano_carga")
    .select("*")
    .eq("plano_id", planoId)
    .order("ocupacao_pct", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlanoCarga[];
}

/** Junta as necessidades abertas do período numa linha por produto. */
export async function agruparNecessidades(planoId: string): Promise<number> {
  const { data, error } = await erp().rpc("agrupar_necessidades_no_plano", { p_plano_id: planoId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function gravarPlanoLinha(params: {
  id?: string | null;
  plano_id: string;
  produto_id: string;
  quantidade: number;
  prioridade: number;
  urgente: boolean;
  data_necessaria?: string | null;
}) {
  const { error } = await erp().rpc("gravar_plano_linha", {
    p_id: params.id ?? null,
    p_plano_id: params.plano_id,
    p_produto_id: params.produto_id,
    p_quantidade: params.quantidade,
    p_prioridade: params.prioridade,
    p_urgente: params.urgente,
    p_data_necessaria: params.data_necessaria ?? null,
  });
  if (error) throw error;
}

export async function removerPlanoLinha(id: string, motivo = "Retirada do plano") {
  const { error } = await erp().rpc("remover_plano_linha", { p_id: id, p_motivo: motivo });
  if (error) throw error;
}

/** Simular não altera ordens nem stock: pode correr as vezes que quiser. */
export async function simularPlano(planoId: string): Promise<ResultadoSimulacao> {
  const { data, error } = await erp().rpc("simular_plano", { p_plano_id: planoId });
  if (error) throw error;
  return (data ?? { viavel: null, centros: [] }) as ResultadoSimulacao;
}

export async function aprovarPlano(
  planoId: string,
  justificacao?: string | null,
): Promise<ResultadoAprovacao> {
  const { data, error } = await erp().rpc("aprovar_plano", {
    p_plano_id: planoId,
    p_justificacao: justificacao ?? null,
  });
  if (error) throw error;
  return data as ResultadoAprovacao;
}

// ---------------- consumos em falta ----------------

export async function lerConsumosEmFalta(): Promise<ConsumoFalta[]> {
  const { data, error } = await erp()
    .from("v_consumos_falta")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConsumoFalta[];
}

export async function regularizarConsumo(id: string, nota?: string | null) {
  const { error } = await erp().rpc("regularizar_consumo", {
    p_consumo_id: id,
    p_nota: nota ?? null,
  });
  if (error) throw error;
}
