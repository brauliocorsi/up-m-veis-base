import { erp } from "./db";
import type {
  Assistencia,
  Desfecho,
  EnvelopeRota,
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

// ============================================ Fase 10 — planeamento de rotas
export async function lerViaturas(params?: { incluirInativas?: boolean }): Promise<Viatura[]> {
  let consulta = erp().from("v_viaturas").select("*").order("nome", { ascending: true });
  if (!params?.incluirInativas) consulta = consulta.eq("ativa", true);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as Viatura[];
}

export async function guardarViatura(
  valores: {
    nome: string;
    matricula?: string | null;
    cubicagem_m3: number;
    peso_max_kg?: number | null;
    consumo_l_100km?: number | null;
    observacoes?: string | null;
    ativa?: boolean;
  },
  id?: string,
): Promise<void> {
  const linha = {
    nome: valores.nome.trim(),
    matricula: valores.matricula?.trim() || null,
    cubicagem_m3: valores.cubicagem_m3,
    peso_max_kg: valores.peso_max_kg ?? null,
    consumo_l_100km: valores.consumo_l_100km ?? null,
    observacoes: valores.observacoes?.trim() || null,
    ativa: valores.ativa ?? true,
  };
  const { error } = id
    ? await erp().from("viaturas").update(linha).eq("id", id)
    : await erp().from("viaturas").insert(linha);
  if (error) throw error;
}

export async function eliminarViatura(id: string, motivo: string): Promise<void> {
  const { error } = await erp()
    .from("viaturas")
    .update({ eliminado_em: new Date().toISOString(), motivo_eliminacao: motivo, ativa: false })
    .eq("id", id);
  if (error) throw error;
}

export async function lerTemplates(params?: { incluirInativos?: boolean }): Promise<RotaTemplate[]> {
  let consulta = erp().from("v_rota_templates").select("*").order("nome", { ascending: true });
  if (!params?.incluirInativos) consulta = consulta.eq("ativo", true);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as RotaTemplate[];
}

export async function guardarTemplate(
  valores: {
    nome: string;
    periodicidade: Periodicidade;
    dias_semana: number[];
    semana_referencia?: string | null;
    max_entregas?: number | null;
    max_minutos_montagem?: number | null;
    viatura_id?: string | null;
    responsavel_id?: string | null;
    cp_inicio?: string | null;
    cp_fim?: string | null;
    zonas_entrega_ids?: string[] | null;
    ativo?: boolean;
  },
  id?: string,
): Promise<void> {
  const linha = {
    nome: valores.nome.trim(),
    periodicidade: valores.periodicidade,
    dias_semana: valores.dias_semana,
    semana_referencia: valores.semana_referencia || null,
    max_entregas: valores.max_entregas ?? null,
    max_minutos_montagem: valores.max_minutos_montagem ?? null,
    viatura_id: valores.viatura_id || null,
    responsavel_id: valores.responsavel_id || null,
    cp_inicio: valores.cp_inicio?.trim() || null,
    cp_fim: valores.cp_fim?.trim() || null,
    zonas_entrega_ids: valores.zonas_entrega_ids?.length ? valores.zonas_entrega_ids : null,
    ativo: valores.ativo ?? true,
  };
  const { error } = id
    ? await erp().from("rota_templates").update(linha).eq("id", id)
    : await erp().from("rota_templates").insert(linha);
  if (error) throw error;
}

export async function eliminarTemplate(id: string, motivo: string): Promise<void> {
  const { error } = await erp()
    .from("rota_templates")
    .update({ eliminado_em: new Date().toISOString(), motivo_eliminacao: motivo, ativo: false })
    .eq("id", id);
  if (error) throw error;
}

/** Pré-visualização das datas que um modelo vai gerar. */
export async function preverDatasTemplate(params: {
  periodicidade: Periodicidade;
  dias_semana: number[];
  semana_referencia?: string | null;
  de?: string | null;
  ate?: string | null;
}): Promise<string[]> {
  const { data, error } = await erp().rpc("datas_template", {
    p_periodicidade: params.periodicidade,
    p_dias_semana: params.dias_semana,
    p_semana_referencia: params.semana_referencia ?? null,
    p_de: params.de ?? null,
    p_ate: params.ate ?? null,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

/** Corre a geração das rotas das próximas semanas a partir dos modelos ativos. */
export async function gerarRotasDosTemplates(semanas = 6): Promise<number> {
  const { data, error } = await erp().rpc("gerar_rotas_templates", { p_semanas: semanas });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function criarRota(params: {
  nome: string;
  data: string;
  responsavel_id?: string | null;
  viatura_id?: string | null;
  template_id?: string | null;
  max_entregas?: number | null;
  max_minutos_montagem?: number | null;
}): Promise<string> {
  const { data, error } = await erp().rpc("criar_rota", {
    p_nome: params.nome,
    p_data: params.data,
    p_responsavel_id: params.responsavel_id ?? null,
    p_viatura_id: params.viatura_id ?? null,
    p_template_id: params.template_id ?? null,
    p_max_entregas: params.max_entregas ?? null,
    p_max_minutos_montagem: params.max_minutos_montagem ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function lerOcupacaoRota(rotaId: string): Promise<RotaOcupacao | null> {
  const { data, error } = await erp()
    .from("v_rota_ocupacao")
    .select("*")
    .eq("rota_id", rotaId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as RotaOcupacao | null;
}

export async function lerPedidosPorAgendar(): Promise<PedidoPorAgendar[]> {
  const { data, error } = await erp()
    .from("v_pedidos_por_agendar")
    .select("*")
    .order("data_entrega_prevista", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as PedidoPorAgendar[];
}

export async function lerRotasSugeridas(pedidoId: string): Promise<RotaSugerida[]> {
  const { data, error } = await erp().rpc("rotas_sugeridas", { p_pedido_id: pedidoId });
  if (error) throw error;
  return (data ?? []) as RotaSugerida[];
}

export async function lerAlteracoesRota(rotaId: string): Promise<RotaAlteracao[]> {
  const { data, error } = await erp()
    .from("rota_alteracoes")
    .select("*")
    .eq("rota_id", rotaId)
    .is("eliminado_em", null)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RotaAlteracao[];
}

export async function agendarEntrega(params: {
  pedido_id: string;
  rota_id: string;
  confirmar?: boolean;
}): Promise<{ rota_id: string; data: string; excedeu_capacidade: boolean; avisos: string[] }> {
  const { data, error } = await erp().rpc("agendar_entrega", {
    p_pedido_id: params.pedido_id,
    p_rota_id: params.rota_id,
    p_confirmar: params.confirmar ?? false,
  });
  if (error) throw error;
  return data as { rota_id: string; data: string; excedeu_capacidade: boolean; avisos: string[] };
}

export async function desagendarEntrega(params: {
  pedido_id: string;
  motivo?: string | null;
  confirmar?: boolean;
}): Promise<void> {
  const { error } = await erp().rpc("desagendar_entrega", {
    p_pedido_id: params.pedido_id,
    p_motivo: params.motivo ?? null,
    p_confirmar: params.confirmar ?? false,
  });
  if (error) throw error;
}

export async function definirViaturaRota(rotaId: string, viaturaId: string | null): Promise<void> {
  const { error } = await erp().rpc("definir_viatura_rota", {
    p_rota_id: rotaId,
    p_viatura_id: viaturaId,
  });
  if (error) throw error;
}

export async function definirResponsavelRota(rotaId: string, responsavelId: string): Promise<void> {
  const { error } = await erp().rpc("definir_responsavel_rota", {
    p_rota_id: rotaId,
    p_responsavel_id: responsavelId,
  });
  if (error) throw error;
}

export async function definirLimitesRota(
  rotaId: string,
  maxEntregas: number | null,
  maxMinutos: number | null,
): Promise<void> {
  const { error } = await erp().rpc("definir_limites_rota", {
    p_rota_id: rotaId,
    p_max_entregas: maxEntregas,
    p_max_minutos_montagem: maxMinutos,
  });
  if (error) throw error;
}

export async function reordenarParagens(rotaId: string, ordem: string[]): Promise<void> {
  const { error } = await erp().rpc("reordenar_paragens", {
    p_rota_id: rotaId,
    p_ordem: ordem,
  });
  if (error) throw error;
}

export async function arrancarRota(rotaId: string): Promise<void> {
  const { error } = await erp().rpc("arrancar_rota", { p_rota_id: rotaId });
  if (error) throw error;
}

export async function cancelarRota(rotaId: string, motivo: string): Promise<void> {
  const { error } = await erp().rpc("cancelar_rota", { p_rota_id: rotaId, p_motivo: motivo });
  if (error) throw error;
}
