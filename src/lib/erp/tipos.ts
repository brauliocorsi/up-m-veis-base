export type Perfil =
  | "vendedora"
  | "escritorio"
  | "compras"
  | "financeiro"
  | "entregador"
  | "adm";

export const PERFIS: Array<{ valor: Perfil; etiqueta: string }> = [
  { valor: "vendedora", etiqueta: "Vendedora" },
  { valor: "escritorio", etiqueta: "Escritório" },
  { valor: "compras", etiqueta: "Compras" },
  { valor: "financeiro", etiqueta: "Financeiro" },
  { valor: "entregador", etiqueta: "Entregador" },
  { valor: "adm", etiqueta: "Administração" },
];

export const ETIQUETA_PERFIL: Record<Perfil, string> = {
  vendedora: "Vendedora",
  escritorio: "Escritório",
  compras: "Compras",
  financeiro: "Financeiro",
  entregador: "Entregador",
  adm: "Administração",
};


export interface CamposComuns {
  id: string;
  criado_em: string;
  criado_por: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
  eliminado_em: string | null;
  eliminado_por: string | null;
  motivo_eliminacao: string | null;
}

export interface Utilizador extends CamposComuns {
  user_id: string;
  nome: string;
  email: string;
  telefone: string | null;
  perfil: Perfil;
  ativo: boolean;
}

export type Momento = "loja" | "entrega" | "antecipado" | "financiador";
export type EstadoInicial = "confirmado" | "pendente_confirmacao" | "pendente";

export const MOMENTOS: Array<{ valor: Momento; etiqueta: string }> = [
  { valor: "loja", etiqueta: "Na loja" },
  { valor: "entrega", etiqueta: "Na entrega" },
  { valor: "antecipado", etiqueta: "Antecipado" },
  { valor: "financiador", etiqueta: "Financiador" },
];

export const ESTADOS_INICIAIS: Array<{ valor: EstadoInicial; etiqueta: string }> = [
  { valor: "confirmado", etiqueta: "Confirmado" },
  { valor: "pendente_confirmacao", etiqueta: "Pendente de confirmação" },
  { valor: "pendente", etiqueta: "Pendente" },
];

export interface FormaPagamento extends CamposComuns {
  codigo: string;
  nome: string;
  momento: Momento;
  estado_inicial: EstadoInicial;
  exige_comprovativo: boolean;
  prazo_confirmacao_horas: number | null;
  taxa_pct: number;
  entra_caixa: boolean;
  ordem: number;
  ativo: boolean;
}

export interface ZonaEntrega extends CamposComuns {
  nome: string;
  cp_inicio: string;
  cp_fim: string;
  valor_base: number;
  valor_por_m3: number;
  valor_min: number;
  gratis_acima: number | null;
  dias_rota: number[];
  ativo: boolean;
}

export type TipoCalendario = "feriado" | "paragem_fabrica" | "fim_semana_excecional";

export const TIPOS_CALENDARIO: Array<{ valor: TipoCalendario; etiqueta: string }> = [
  { valor: "feriado", etiqueta: "Feriado" },
  { valor: "paragem_fabrica", etiqueta: "Paragem de fábrica" },
  { valor: "fim_semana_excecional", etiqueta: "Fim de semana excecional" },
];

export interface DiaCalendario extends CamposComuns {
  data: string;
  tipo: TipoCalendario;
  descricao: string;
}

export type Contexto =
  | "cancelamento"
  | "alteracao_data"
  | "eliminacao"
  | "saida_caixa"
  | "desconto_excecional"
  | "reabertura"
  | "nao_entrega"
  | "reagendamento"
  | "saida_rota"
  | "assistencia";

export const CONTEXTOS: Array<{ valor: Contexto; etiqueta: string }> = [
  { valor: "cancelamento", etiqueta: "Cancelamento" },
  { valor: "alteracao_data", etiqueta: "Alteração de data" },
  { valor: "eliminacao", etiqueta: "Eliminação" },
  { valor: "saida_caixa", etiqueta: "Saída de caixa" },
  { valor: "desconto_excecional", etiqueta: "Desconto excecional" },
  { valor: "reabertura", etiqueta: "Reabertura" },
  { valor: "nao_entrega", etiqueta: "Não entrega" },
  { valor: "reagendamento", etiqueta: "Reagendamento" },
  { valor: "saida_rota", etiqueta: "Saída de rota" },
  { valor: "assistencia", etiqueta: "Assistência" },
];


export interface Motivo extends CamposComuns {
  contexto: Contexto;
  descricao: string;
  exige_texto: boolean;
  ordem: number;
}

export interface Definicao extends CamposComuns {
  chave: string;
  valor: unknown;
  descricao: string | null;
}

export interface Evento {
  id: number;
  tabela: string;
  registo_id: string;
  operacao: "INSERT" | "UPDATE" | "ELIMINACAO" | "RESTAURO";
  alteracoes: Record<string, unknown> | null;
  utilizador_id: string | null;
  utilizador_nome: string | null;
  ocorrido_em: string;
}

export const DIAS_SEMANA: Array<{ valor: number; etiqueta: string }> = [
  { valor: 1, etiqueta: "Dom" },
  { valor: 2, etiqueta: "Seg" },
  { valor: 3, etiqueta: "Ter" },
  { valor: 4, etiqueta: "Qua" },
  { valor: 5, etiqueta: "Qui" },
  { valor: 6, etiqueta: "Sex" },
  { valor: 7, etiqueta: "Sáb" },
];

// ===================== Fase 2: catálogo, fornecedores e clientes

export type TipoFornecimento = "stock" | "producao" | "compra";

export const TIPOS_FORNECIMENTO: Array<{ valor: TipoFornecimento; etiqueta: string }> = [
  { valor: "stock", etiqueta: "Stock" },
  { valor: "producao", etiqueta: "Produção própria" },
  { valor: "compra", etiqueta: "Compra a fornecedor" },
];

export const ETIQUETA_FORNECIMENTO: Record<TipoFornecimento, string> = {
  stock: "Stock",
  producao: "Produção própria",
  compra: "Compra a fornecedor",
};

export type TipoServico = "montagem" | "entrega" | "transporte" | "assistencia" | "outro";

export const TIPOS_SERVICO: Array<{ valor: TipoServico; etiqueta: string }> = [
  { valor: "montagem", etiqueta: "Montagem" },
  { valor: "entrega", etiqueta: "Entrega" },
  { valor: "transporte", etiqueta: "Transporte" },
  { valor: "assistencia", etiqueta: "Assistência" },
  { valor: "outro", etiqueta: "Outro" },
];

export type MetodoEnvio = "email" | "email_manual" | "portal" | "whatsapp";

export const METODOS_ENVIO: Array<{ valor: MetodoEnvio; etiqueta: string }> = [
  { valor: "email", etiqueta: "Email automático" },
  { valor: "email_manual", etiqueta: "Email manual" },
  { valor: "portal", etiqueta: "Portal do fornecedor" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
];

export const IDIOMAS: Array<{ valor: string; etiqueta: string }> = [
  { valor: "pt", etiqueta: "Português" },
  { valor: "en", etiqueta: "Inglês" },
  { valor: "es", etiqueta: "Espanhol" },
  { valor: "fr", etiqueta: "Francês" },
  { valor: "pl", etiqueta: "Polaco" },
];

export type TipoCliente = "particular" | "empresa";

export const TIPOS_CLIENTE: Array<{ valor: TipoCliente; etiqueta: string }> = [
  { valor: "particular", etiqueta: "Particular" },
  { valor: "empresa", etiqueta: "Empresa" },
];

export interface Categoria extends CamposComuns {
  codigo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

export interface Familia extends CamposComuns {
  categoria_id: string;
  codigo: string;
  nome_interno: string;
  nome_cliente: string;
  ativo: boolean;
}

export interface Fornecedor extends CamposComuns {
  nome: string;
  nif: string | null;
  pais: string;
  email_encomendas: string | null;
  telefone: string | null;
  morada: string | null;
  idioma: string;
  metodo_envio: MetodoEnvio;
  enviar_automatico: boolean;
  prazo_dias: number;
  valor_minimo_encomenda: number | null;
  condicoes_pagamento: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface Produto extends CamposComuns {
  cod_barras: string;
  cod_modelo: string | null;
  categoria_id: string;
  familia_id: string | null;
  nome_cliente: string;
  nome_interno: string | null;
  descricao: string | null;
  tipo_fornecimento: TipoFornecimento;
  fornecedor_id: string | null;
  prazo_producao_dias: number | null;
  prazo_fornecedor_dias: number | null;
  n_colis: number;
  volume_m3: number | null;
  peso_kg: number | null;
  preco_base: number | null;
  preco_promocional: number | null;
  iva_pct: number;
  valor_montagem: number;
  montagem_obrigatoria: boolean;
  tempo_montagem_min: number | null;
  permite_desconto: boolean;
  ponto_reposicao: number | null;
  imagem_url: string | null;
  vendavel: boolean;
  ativo: boolean;
}

/** Custos e margens vivem numa tabela própria, legível só a Financeiro, Compras e ADM. */
export interface ProdutoCusto extends CamposComuns {
  produto_id: string;
  custo_ultimo: number | null;
  margem_minima_pct: number | null;
}


export interface ProdutoColi extends CamposComuns {
  produto_id: string;
  numero: number;
  cod_barras_coli: string | null;
  descricao: string | null;
}

export interface Servico extends CamposComuns {
  codigo: string;
  nome: string;
  tipo: TipoServico;
  preco_base: number;
  iva_pct: number;
  permite_desconto: boolean;
  ativo: boolean;
}

export interface Cliente extends CamposComuns {
  tipo: TipoCliente;
  nome: string;
  nome_fiscal: string | null;
  nif: string | null;
  nif_estrangeiro: boolean;
  nif_ok: boolean | null;
  pais: string;
  telefone_e164: string | null;
  telefone_alt: string | null;
  email: string | null;
  morada: string | null;
  cp4: string | null;
  cp3: string | null;
  localidade: string | null;
  concelho: string | null;
  distrito: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface ClienteSemelhante {
  id: string;
  nome: string;
  nif: string | null;
  telefone_e164: string | null;
  email: string | null;
  cp4: string | null;
  localidade: string | null;
  regra: string;
  score: number;
}

export const ETIQUETA_REGRA_DUPLICADO: Record<string, string> = {
  nif: "Mesmo NIF",
  telefone: "Mesmo telefone",
  email: "Mesmo email",
  nome_cp4: "Nome parecido no mesmo código postal",
  nome: "Nome muito parecido",
  manual: "Escolha manual",
};

export interface RegraDesconto extends CamposComuns {
  perfil: Perfil;
  desconto_max_pct: number;
  requer_aprovacao_acima_pct: number | null;
  pode_alterar_preco: boolean;
  pode_alterar_entrega: boolean;
}

export interface DuplicadoLog extends CamposComuns {
  cliente_mantido: string;
  cliente_absorvido: string;
  regra: string;
  score: number;
  decisao: "ignorado" | "unificado";
  snapshot_absorvido: Record<string, unknown>;
}

// ---------------------------------------------------------------- Fase 3: stock
export type TipoMovimento =
  | "entrada"
  | "saida"
  | "ajuste"
  | "quarentena_entrada"
  | "quarentena_saida"
  | "inventario_inicial";

export const TIPOS_MOVIMENTO: Array<{ valor: TipoMovimento; etiqueta: string }> = [
  { valor: "entrada", etiqueta: "Entrada" },
  { valor: "saida", etiqueta: "Saída" },
  { valor: "ajuste", etiqueta: "Ajuste" },
  { valor: "quarentena_entrada", etiqueta: "Entrada em quarentena" },
  { valor: "quarentena_saida", etiqueta: "Saída de quarentena" },
  { valor: "inventario_inicial", etiqueta: "Inventário inicial" },
];

export const ETIQUETA_MOVIMENTO: Record<TipoMovimento, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  quarentena_entrada: "Entrada em quarentena",
  quarentena_saida: "Saída de quarentena",
  inventario_inicial: "Inventário inicial",
};

export type OrigemMovimento = "contagem" | "erp" | "manual";

export const ORIGENS_MOVIMENTO: Array<{ valor: OrigemMovimento; etiqueta: string }> = [
  { valor: "contagem", etiqueta: "Contagem (armazém)" },
  { valor: "erp", etiqueta: "UP Vendas" },
  { valor: "manual", etiqueta: "Manual" },
];

export interface LinhaStock {
  produto_id: string;
  cod_barras: string;
  nome_cliente: string;
  categoria_id: string;
  ponto_reposicao: number | null;
  tipo_fornecimento: TipoFornecimento;
  fisico: number;
  quarentena: number;
  reservado: number;
  em_transito_compra: number;
  margem_seguranca: number;
  vendavel: number;
  prometivel: number;
  atualizado_em: string | null;
}

export interface Movimento {
  id: number;
  produto_id: string;
  cod_barras: string;
  nome_cliente: string;
  tipo: TipoMovimento;
  quantidade: number;
  origem: OrigemMovimento;
  ref_externa: string | null;
  chave_idempotencia: string;
  documento_tipo: string | null;
  documento_id: string | null;
  motivo: string | null;
  ocorrido_em: string;
  registado_em: string;
  registado_por: string | null;
}

export type EstadoReserva = "ativa" | "consumida" | "libertada" | "expirada";

export const ESTADOS_RESERVA: Array<{ valor: EstadoReserva; etiqueta: string }> = [
  { valor: "ativa", etiqueta: "Ativa" },
  { valor: "consumida", etiqueta: "Consumida" },
  { valor: "libertada", etiqueta: "Libertada" },
  { valor: "expirada", etiqueta: "Expirada" },
];

export const ETIQUETA_RESERVA: Record<EstadoReserva, string> = {
  ativa: "Ativa",
  consumida: "Consumida",
  libertada: "Libertada",
  expirada: "Expirada",
};

export interface Reserva extends CamposComuns {
  produto_id: string;
  cod_barras?: string;
  nome_cliente?: string;
  quantidade: number;
  documento_tipo: string;
  documento_id: string;
  linha_id: string | null;
  estado: EstadoReserva;
  expira_em: string | null;
  consumida_em: string | null;
  libertada_em: string | null;
  motivo_libertacao: string | null;
}

export type EstadoSync = "ok" | "atrasado" | "erro";

export interface SyncEstado {
  fonte: string;
  cursor: string | null;
  ultima_sync_ok: string | null;
  ultima_tentativa: string | null;
  estado: EstadoSync;
  estado_calculado: EstadoSync;
  segundos_desde_sync: number | null;
  erro: string | null;
  movimentos_processados: number;
  inventario_inicial_em: string | null;
}

export interface SyncPendente {
  id: number;
  payload: unknown;
  erro: string | null;
  tentativas: number;
  resolvido_em: string | null;
  criado_em: string;
}

export interface Reconciliacao extends CamposComuns {
  executada_em: string;
  total_produtos: number;
  divergencias: number;
  estado: "limpa" | "com_divergencias" | "resolvida";
}

export interface Divergencia extends CamposComuns {
  reconciliacao_id: string;
  produto_id: string;
  cod_barras?: string;
  nome_cliente?: string;
  fisico_erp: number;
  fisico_contagem: number;
  diferenca: number;
  estado: "aberta" | "regularizada" | "ignorada";
  movimento_regularizacao: number | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  nota: string | null;
}

export const TABELAS: Array<{ valor: string; etiqueta: string; rotulo: string }> = [
  { valor: "utilizadores", etiqueta: "Utilizadores", rotulo: "nome" },
  { valor: "formas_pagamento", etiqueta: "Formas de pagamento", rotulo: "nome" },
  { valor: "zonas_entrega", etiqueta: "Zonas de entrega", rotulo: "nome" },
  { valor: "calendario", etiqueta: "Calendário", rotulo: "descricao" },
  { valor: "motivos", etiqueta: "Motivos", rotulo: "descricao" },
  { valor: "definicoes", etiqueta: "Definições", rotulo: "chave" },
  { valor: "categorias", etiqueta: "Categorias", rotulo: "nome" },
  { valor: "familias", etiqueta: "Famílias", rotulo: "nome_interno" },
  { valor: "produtos", etiqueta: "Produtos", rotulo: "nome_cliente" },
  { valor: "servicos", etiqueta: "Serviços", rotulo: "nome" },
  { valor: "fornecedores", etiqueta: "Fornecedores", rotulo: "nome" },
  { valor: "clientes", etiqueta: "Clientes", rotulo: "nome" },
  { valor: "reservas", etiqueta: "Reservas", rotulo: "documento_tipo" },
];



export function formatarData(valor?: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDinheiro(valor: number | string | null | undefined): string {
  const numero = Number(valor ?? 0);
  return numero.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

// ------------------------------------------------------------- Fase 4: a venda
export type EstadoPedido =
  | "orcamento"
  | "confirmado"
  | "em_preparacao"
  | "pronto"
  | "entregue"
  | "cancelado";

export const ETIQUETA_PEDIDO: Record<EstadoPedido, string> = {
  orcamento: "Orçamento",
  confirmado: "Confirmado",
  em_preparacao: "Em preparação",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const ESTADOS_PEDIDO: Array<{ valor: EstadoPedido; etiqueta: string }> = (
  Object.keys(ETIQUETA_PEDIDO) as EstadoPedido[]
).map((valor) => ({ valor, etiqueta: ETIQUETA_PEDIDO[valor] }));

export type EstadoItem =
  | "pendente"
  | "reservado"
  | "encomendado"
  | "recebido"
  | "separado"
  | "entregue"
  | "cancelado";

export const ETIQUETA_ITEM: Record<EstadoItem, string> = {
  pendente: "Pendente",
  reservado: "Reservado",
  encomendado: "Encomendado",
  recebido: "Recebido",
  separado: "Separado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export type OrigemPedido = "loja" | "telefone" | "online" | "whatsapp" | "outro";

export const ORIGENS_PEDIDO: Array<{ valor: OrigemPedido; etiqueta: string }> = [
  { valor: "loja", etiqueta: "Na loja" },
  { valor: "telefone", etiqueta: "Telefone" },
  { valor: "online", etiqueta: "Online" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "outro", etiqueta: "Outro" },
];

export type TipoCupao = "percentagem" | "valor" | "entrega_gratis";

export const TIPOS_CUPAO: Array<{ valor: TipoCupao; etiqueta: string }> = [
  { valor: "percentagem", etiqueta: "Percentagem" },
  { valor: "valor", etiqueta: "Valor fixo" },
  { valor: "entrega_gratis", etiqueta: "Entrega grátis" },
];

export const ETIQUETA_CUPAO: Record<TipoCupao, string> = {
  percentagem: "Percentagem",
  valor: "Valor fixo",
  entrega_gratis: "Entrega grátis",
};

export interface Pedido extends CamposComuns {
  numero: string;
  tipo: "orcamento" | "pedido";
  origem: OrigemPedido;
  cliente_id: string;
  vendedor_id: string | null;
  estado: EstadoPedido;
  data_entrega_prevista: string | null;
  data_entrega_prometida: string | null;
  data_entrega_origem: "calculada" | "manual";
  motivo_data_id: string | null;
  nota_data: string | null;
  entrega_domicilio: boolean;
  morada_entrega: string | null;
  cp4_entrega: string | null;
  cp3_entrega: string | null;
  localidade_entrega: string | null;
  zona_entrega_id: string | null;
  contacto_entrega: string | null;
  notas_entrega: string | null;
  subtotal: number;
  desconto_linhas: number;
  desconto_cabecalho_pct: number;
  desconto_cabecalho: number;
  cupao_id: string | null;
  desconto_cupao: number;
  valor_montagem: number;
  valor_entrega: number;
  valor_entrega_origem: "calculado" | "manual";
  total_sem_iva: number;
  total_iva: number;
  total: number;
  total_pago: number;
  estado_pagamento: EstadoPagamentoPedido;

  observacoes: string | null;
  observacoes_internas: string | null;
  confirmado_em: string | null;
  cancelado_em: string | null;
  motivo_cancelamento_id: string | null;
  nota_cancelamento: string | null;
  reaberto_em: string | null;
  nota_reabertura: string | null;
  cliente_nome?: string;
  cliente_telefone?: string | null;
  cliente_nif?: string | null;
  vendedor_nome?: string | null;
  zona_nome?: string | null;
  n_itens?: number;
  falta_pagar?: number;
  /** Fase 8 — estado fiscal e entrega (vem de v_pedidos) */
  estado_fiscal?: "sem_documento" | "guia_emitida" | "faturado" | "nota_credito";
  data_entrega_efetiva?: string | null;
  unidades_por_entregar?: number;
  pendente_confirmacao?: number;
  a_receber_entrega?: number;

}

export interface PedidoItem extends CamposComuns {
  pedido_id: string;
  linha: number;
  produto_id: string | null;
  servico_id: string | null;
  descricao: string;
  cod_barras: string | null;
  quantidade: number;
  preco_unitario: number;
  preco_tabela: number;
  desconto_pct: number;
  desconto_valor: number;
  total_linha: number;
  iva_pct: number;
  montagem_incluida: boolean;
  valor_montagem_unit: number;
  tipo_fornecimento: string | null;
  data_prevista: string | null;
  estado: EstadoItem;
  reserva_id: string | null;
  nota: string | null;
  produto_nome?: string | null;
  servico_nome?: string | null;
  imagem_url?: string | null;
  pedido_numero?: string | null;
  pedido_tipo?: "orcamento" | "pedido";
  pedido_estado?: EstadoPedido;
  data_entrega_prevista?: string | null;
  cliente_nome?: string | null;
}

export interface Cupao extends CamposComuns {
  codigo: string;
  descricao: string;
  tipo: TipoCupao;
  valor: number;
  minimo_compra: number | null;
  valido_de: string;
  valido_ate: string | null;
  usos_max: number | null;
  usos_atuais: number;
  usos_por_cliente: number;
  aplica_a: "tudo" | "categoria" | "produto";
  aplica_a_ids: string[];
  acumulavel: boolean;
  ativo: boolean;
}

export interface NecessidadeCompra extends CamposComuns {
  pedido_id: string;
  item_id: string;
  produto_id: string;
  fornecedor_id: string | null;
  quantidade: number;
  estado: "aberta" | "encomendada" | "recebida" | "cancelada";
  pedido_numero?: string;
  produto_nome?: string;
  cod_barras?: string;
  fornecedor_nome?: string | null;
}

export function formatarDataCurta(valor?: string | null): string {
  if (!valor) return "—";
  return new Date(`${valor}T00:00:00`).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// -------------------------------------------------- Fase 5: pagamentos e caixa
export type EstadoPagamento =
  | "pendente"
  | "pendente_confirmacao"
  | "confirmado"
  | "rejeitado"
  | "devolvido";

export const ETIQUETA_PAGAMENTO: Record<EstadoPagamento, string> = {
  pendente: "Pendente",
  pendente_confirmacao: "A confirmar",
  confirmado: "Confirmado",
  rejeitado: "Rejeitado",
  devolvido: "Devolvido",
};

export type EstadoPagamentoPedido = "por_pagar" | "parcial" | "pago" | "em_divergencia";

export const ETIQUETA_PAGAMENTO_PEDIDO: Record<EstadoPagamentoPedido, string> = {
  por_pagar: "Por pagar",
  parcial: "Pago em parte",
  pago: "Pago",
  em_divergencia: "Em divergência",
};

export interface Pagamento extends CamposComuns {
  pedido_id: string;
  forma_id: string;
  valor: number;
  taxa_pct: number;
  valor_liquido: number;
  estado: EstadoPagamento;
  data_prevista: string | null;
  data_confirmacao: string | null;
  confirmado_por: string | null;
  motivo_rejeicao: string | null;
  referencia: string | null;
  comprovativo_url: string | null;
  recebido_por: string | null;
  caixa_id: string | null;
  observacoes: string | null;
  forma_nome?: string;
  forma_codigo?: string;
  forma_momento?: Momento;
  exige_comprovativo?: boolean;
  entra_caixa?: boolean;
  prazo_confirmacao_horas?: number | null;
  pedido_numero?: string;
  pedido_total?: number;
  pedido_estado?: EstadoPedido;
  cliente_nome?: string;
  recebido_por_nome?: string | null;
  em_atraso?: boolean;
}

export type EstadoCaixa = "aberto" | "fechado";

export interface Caixa extends CamposComuns {
  utilizador_id: string;
  data: string;
  estado: EstadoCaixa;
  saldo_abertura: number;
  saldo_esperado: number;
  saldo_contado: number | null;
  diferenca: number | null;
  justificacao_diferenca: string | null;
  aberto_em: string;
  fechado_em: string | null;
  fechado_por: string | null;
  reaberto_em: string | null;
  reaberto_por: string | null;
  motivo_reabertura: string | null;
  utilizador_nome?: string | null;
  total_dinheiro?: number;
  total_multibanco?: number;
  total_mbway?: number;
  total_transferencia?: number;
  total_saidas?: number;
  total_sangrias?: number;
  n_movimentos?: number;
}

export type TipoMovimentoCaixa = "recebimento" | "saida" | "sangria" | "abertura";

export const ETIQUETA_MOVIMENTO_CAIXA: Record<TipoMovimentoCaixa, string> = {
  recebimento: "Recebimento",
  saida: "Saída",
  sangria: "Sangria",
  abertura: "Abertura",
};

export interface CaixaMovimento extends CamposComuns {
  caixa_id: string;
  tipo: TipoMovimentoCaixa;
  forma_id: string | null;
  valor: number;
  sentido: number;
  pagamento_id: string | null;
  pedido_id: string | null;
  motivo_id: string | null;
  descricao: string | null;
  comprovativo_url: string | null;
  forma_nome?: string | null;
  forma_codigo?: string | null;
  pedido_numero?: string | null;
  cliente_nome?: string | null;
  motivo_descricao?: string | null;
  caixa_data?: string;
  utilizador_id?: string;
  utilizador_nome?: string | null;
  de_dia_anterior?: boolean;
}

// ===================== Fase 6: compras e contas a pagar

export type EstadoOc =
  | "rascunho"
  | "pronta_enviar"
  | "enviada"
  | "confirmada"
  | "recebida_parcial"
  | "recebida"
  | "cancelada";

export const ETIQUETA_OC: Record<EstadoOc, string> = {
  rascunho: "Rascunho",
  pronta_enviar: "Pronta a enviar",
  enviada: "Enviada",
  confirmada: "Confirmada pelo fornecedor",
  recebida_parcial: "Recebida em parte",
  recebida: "Recebida",
  cancelada: "Cancelada",
};

export const ESTADOS_OC: Array<{ valor: EstadoOc; etiqueta: string }> = (
  Object.keys(ETIQUETA_OC) as EstadoOc[]
).map((valor) => ({ valor, etiqueta: ETIQUETA_OC[valor] }));

export interface OrdemCompra extends CamposComuns {
  numero: string;
  fornecedor_id: string;
  estado: EstadoOc;
  data_emissao: string;
  data_prevista: string | null;
  data_confirmada_fornecedor: string | null;
  data_recebida: string | null;
  moeda: string;
  total: number;
  observacoes: string | null;
  observacoes_fornecedor: string | null;
  enviada_em: string | null;
  enviada_para: string | null;
  envio_message_id: string | null;
  envio_erro: string | null;
  envio_tentativas: number;
  pdf_url: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  fornecedor_nome: string;
  fornecedor_email: string | null;
  enviar_automatico: boolean;
  fornecedor_idioma: string;
  n_itens: number;
  unidades_em_falta: number;
  atrasada: boolean;
}

export interface OcItem extends CamposComuns {
  oc_id: string;
  linha: number;
  produto_id: string | null;
  descricao: string;
  quantidade: number;
  quantidade_recebida: number;
  custo_unitario: number;
  total_linha: number;
  data_prevista_item: string | null;
  necessidade_id: string | null;
  pedido_item_id: string | null;
  oc_numero: string;
  oc_estado: EstadoOc;
  produto_nome: string | null;
  cod_barras: string | null;
  em_falta: number;
  pedido_numero: string | null;
  pedido_id: string | null;
  cliente_nome: string | null;
  fornecedor_nome: string | null;
  oc_data_prevista: string | null;
  oc_data_confirmada: string | null;
  oc_data_emissao: string | null;
}

/**
 * Linha de erp.v_fornecimento_linha — exceção deliberada sem security_invoker:
 * expõe à vendedora apenas o estado do fornecimento, SEM custos.
 */
export interface FornecimentoLinha {
  oc_item_id: string | null;
  oc_id: string | null;
  pedido_item_id: string;
  pedido_id: string;
  produto_id: string | null;
  estado_item: string;
  oc_numero: string | null;
  oc_estado: EstadoOc | null;
  data_prevista_chegada: string | null;
  fornecedor: string | null;
  qt_encomendada: number | null;
  qt_recebida: number | null;
  qt_em_falta: number | null;
}

export interface OcRecebimento extends CamposComuns {
  oc_id: string;
  data: string;
  doc_fornecedor: string | null;
  observacoes: string | null;
  oc_numero: string;
  registado_por_nome: string | null;
  unidades: number;
}

export interface Necessidade extends CamposComuns {
  pedido_id: string | null;
  item_id: string | null;
  produto_id: string;
  fornecedor_id: string | null;
  quantidade: number;
  estado: string;
  origem: string;
  oc_id: string | null;
  pedido_numero: string | null;
  cliente_nome: string | null;
  produto_nome: string;
  cod_barras: string | null;
  fornecedor_nome: string | null;
  oc_numero: string | null;
  encomendado: number;
  recebido: number;
  falta: number;
}

export const ETIQUETA_NECESSIDADE: Record<string, string> = {
  aberta: "Aberta",
  encomendada: "Encomendada",
  recebida: "Recebida",
  cancelada: "Cancelada",
};

export const ETIQUETA_ORIGEM_NECESSIDADE: Record<string, string> = {
  venda: "Venda",
  reposicao: "Reposição de stock",
  manual: "Pedido manual",
};

export interface ContaPagar extends CamposComuns {
  fornecedor_id: string;
  oc_id: string | null;
  descricao: string;
  categoria: string | null;
  valor: number;
  valor_pago: number;
  data_vencimento: string;
  data_pagamento: string | null;
  estado: "pendente" | "paga_parcial" | "paga" | "cancelada";
  doc_fornecedor: string | null;
  comprovativo_url: string | null;
  fornecedor_nome: string;
  oc_numero: string | null;
  em_divida: number;
  dias_para_vencer: number;
}

export const ETIQUETA_CONTA: Record<string, string> = {
  pendente: "Pendente",
  paga_parcial: "Paga em parte",
  paga: "Paga",
  cancelada: "Cancelada",
};

export interface PedidoCompra extends CamposComuns {
  numero: string;
  solicitante_id: string;
  urgencia: "normal" | "urgente";
  destino: "stock" | "cliente" | "consumo_interno";
  justificacao: string;
  estado: "rascunho" | "submetido" | "aprovado" | "convertido" | "recusado";
  valor_estimado: number;
  aprovador_id: string | null;
  data_aprovacao: string | null;
  motivo_recusa: string | null;
  oc_id: string | null;
  solicitante_nome: string;
  aprovador_nome: string | null;
  oc_numero: string | null;
  n_itens: number;
}

export const ETIQUETA_PEDIDO_COMPRA: Record<string, string> = {
  rascunho: "Rascunho",
  submetido: "A aguardar aprovação",
  aprovado: "Aprovado",
  convertido: "Convertido em OC",
  recusado: "Recusado",
};

export const DESTINOS_COMPRA: Array<{ valor: string; etiqueta: string }> = [
  { valor: "stock", etiqueta: "Stock" },
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "consumo_interno", etiqueta: "Consumo interno" },
];

export interface PedidoCompraItem extends CamposComuns {
  pedido_compra_id: string;
  produto_id: string | null;
  descricao_livre: string | null;
  quantidade: number;
  custo_estimado: number;
  fornecedor_sugerido_id: string | null;
  produto_nome: string | null;
  fornecedor_sugerido_nome: string | null;
}

// ------------------------------------------------------------- Fase 7 · financeiro
export interface CategoriaDespesa extends CamposComuns {
  codigo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

export type Periodicidade = "mensal" | "trimestral" | "anual";

export interface Despesa extends CamposComuns {
  descricao: string;
  categoria: string;
  fornecedor_id: string | null;
  valor: number;
  data_despesa: string;
  data_vencimento: string;
  recorrente: boolean;
  periodicidade: Periodicidade | null;
  conta_pagar_id: string | null;
  origem_id: string | null;
  comprovativo_url: string | null;
  fornecedor_nome: string | null;
  conta_estado: string | null;
  conta_valor_pago: number | null;
}

export interface ContaReceber {
  id: string;
  pedido_id: string;
  forma_id: string;
  valor: number;
  taxa_pct: number | null;
  valor_liquido: number | null;
  estado: EstadoPagamento;
  data_prevista: string | null;
  criado_em: string;
  data_limite_confirmacao: string | null;
  referencia: string | null;
  comprovativo_url: string | null;
  recebido_por: string | null;
  observacoes: string | null;
  forma_nome: string;
  forma_codigo: string;
  forma_momento: Momento;
  exige_comprovativo: boolean;
  entra_caixa: boolean;
  prazo_confirmacao_horas: number | null;
  pedido_numero: string;
  pedido_total: number;
  pedido_estado: string;
  data_entrega_prevista: string | null;
  cliente_nome: string;
  recebido_por_nome: string | null;
  vendedor_nome: string | null;
  em_atraso: boolean;
}

export interface ConciliacaoCaixa {
  caixa_id: string;
  data: string;
  utilizador_id: string;
  utilizador_nome: string | null;
  estado: string;
  saldo_abertura: number;
  total_dinheiro: number;
  total_saidas: number;
  total_sangrias: number;
  esperado: number;
  contado: number | null;
  diferenca: number | null;
  justificacao_diferenca: string | null;
}

export interface ConciliacaoVenda {
  pedido_id: string;
  numero: string;
  estado: string;
  confirmado_em: string | null;
  data_entrega_prevista: string | null;
  vendedor_nome: string | null;
  cliente_nome: string | null;
  total: number;
  recebido_confirmado: number;
  pendente_confirmacao: number;
  a_receber_entrega: number;
  divergencia: number;
}

export interface FluxoSemana {
  semana: string;
  fim_semana: string;
  a_receber: number;
  a_pagar: number;
}

export interface FechoFinanceiro extends CamposComuns {
  data: string;
  recebido_dinheiro: number;
  recebido_outras: number;
  pago: number;
  por_receber: number;
  por_pagar: number;
  fechado_por: string | null;
  observacoes: string | null;
}

export interface MargemPedido {
  pedido_id: string;
  pedido_numero: string;
  confirmado_em: string | null;
  vendedor_nome: string | null;
  vendido: number;
  custo: number;
  margem: number;
  margem_pct: number | null;
}

export interface RelVenda {
  pedido_id: string;
  numero: string;
  estado: string;
  origem: string | null;
  data: string;
  vendedor_nome: string | null;
  cliente_nome: string | null;
  total: number;
  total_pago: number;
  estado_pagamento: string;
  formas: string | null;
}

export interface RelRecebimento {
  data: string;
  forma_nome: string;
  forma_codigo: string;
  estado: string;
  n_pagamentos: number;
  valor: number;
}

export interface RelAtrasoFornecedor {
  fornecedor_nome: string;
  numero: string;
  prometido: string | null;
  recebido: string | null;
  dias_atraso: number | null;
  estado: string;
}

export interface RelCupao {
  cupao_id: string;
  codigo: string;
  tipo: string;
  valor_regra: number;
  usos: number;
  desconto_total: number;
}

export const ETIQUETA_PERIODICIDADE: Record<Periodicidade, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

// --------------------------------------------------- Fase 8: entrega e faturação
export type EstadoFiscal = "sem_documento" | "guia_emitida" | "faturado" | "nota_credito";

export const ETIQUETA_FISCAL: Record<EstadoFiscal, string> = {
  sem_documento: "Sem documento",
  guia_emitida: "Guia emitida",
  faturado: "Faturado",
  nota_credito: "Nota de crédito",
};

export const ESTADOS_FISCAIS: Array<{ valor: EstadoFiscal; etiqueta: string }> = (
  Object.keys(ETIQUETA_FISCAL) as EstadoFiscal[]
).map((valor) => ({ valor, etiqueta: ETIQUETA_FISCAL[valor] }));

export type TipoDocumentoFiscal =
  | "guia_transporte"
  | "fatura"
  | "fatura_recibo"
  | "recibo"
  | "nota_credito";

export const ETIQUETA_DOCUMENTO: Record<TipoDocumentoFiscal, string> = {
  guia_transporte: "Guia de transporte",
  fatura: "Fatura",
  fatura_recibo: "Fatura-recibo",
  recibo: "Recibo",
  nota_credito: "Nota de crédito",
};

export const TIPOS_DOCUMENTO: Array<{ valor: TipoDocumentoFiscal; etiqueta: string }> = (
  Object.keys(ETIQUETA_DOCUMENTO) as TipoDocumentoFiscal[]
).map((valor) => ({ valor, etiqueta: ETIQUETA_DOCUMENTO[valor] }));

export type EstadoDocumentoFiscal =
  | "pendente"
  | "emitido"
  | "comunicado_at"
  | "anulado"
  | "erro";

export const ETIQUETA_ESTADO_DOCUMENTO: Record<EstadoDocumentoFiscal, string> = {
  pendente: "Por emitir",
  emitido: "Emitido",
  comunicado_at: "Comunicado à AT",
  anulado: "Anulado",
  erro: "Erro",
};

export interface Entrega extends CamposComuns {
  pedido_id: string;
  data_entrega: string;
  tipo: "total" | "parcial";
  entregue_por: string | null;
  recebido_por_nome: string | null;
  observacoes: string | null;
  assinatura_url: string | null;
  estado: "registada" | "revertida";
  revertida_em: string | null;
  revertida_por: string | null;
  motivo_reversao: string | null;
  pedido_numero?: string | null;
  pedido_estado?: EstadoPedido;
  pedido_total?: number;
  pedido_total_pago?: number;
  pedido_origem?: string | null;
  vendedor_id?: string | null;
  vendedor_nome?: string | null;
  cp4_entrega?: string | null;
  zona_entrega_id?: string | null;
  zona_nome?: string | null;
  data_entrega_prevista?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_nif?: string | null;
  entregue_por_nome?: string | null;
  n_linhas?: number;
  unidades?: number;
}

export interface EntregaItem extends CamposComuns {
  entrega_id: string;
  pedido_item_id: string;
  quantidade: number;
  motivo_nao_entrega: string | null;
  estado_anterior: EstadoItem | null;
  reserva_id: string | null;
  pedido_id?: string;
  linha?: number;
  descricao?: string;
  produto_id?: string | null;
  servico_id?: string | null;
  quantidade_pedida?: number;
  estado_item?: EstadoItem;
  data_entrega?: string;
  entrega_estado?: "registada" | "revertida";
}

/** Linha de um pedido com o que já saiu e o que falta entregar. */
export interface LinhaEntrega {
  pedido_item_id: string;
  pedido_id: string;
  linha: number;
  descricao: string;
  produto_id: string | null;
  servico_id: string | null;
  quantidade: number;
  estado: EstadoItem;
  reserva_id: string | null;
  total_linha: number;
  qt_entregue: number;
  qt_por_entregar: number;
  pedido_numero: string | null;
  pedido_estado: EstadoPedido;
}

export interface DocumentoFiscal extends CamposComuns {
  pedido_id: string;
  entrega_id: string | null;
  tipo: TipoDocumentoFiscal;
  estado: EstadoDocumentoFiscal;
  numero: string | null;
  serie: string | null;
  codigo_at: string | null;
  atcud: string | null;
  valor: number | null;
  data_emissao: string | null;
  data_comunicacao: string | null;
  chave_idempotencia: string;
  url_pdf: string | null;
  erro: string | null;
  tentativas: number;
  emitido_por: string | null;
  pedido_numero?: string | null;
  pedido_total?: number;
  pedido_estado?: EstadoPedido;
  cliente_nome?: string | null;
  cliente_nif?: string | null;
  data_entrega?: string | null;
  valor_divergente?: boolean;
}

export interface EntreguePorReceber {
  pedido_id: string;
  numero: string;
  estado: EstadoPedido;
  total: number;
  total_pago: number;
  falta_pagar: number;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  criado_em: string;
  confirmado_em: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_nif: string | null;
  data_entrega_efetiva: string | null;
  dias_desde_entrega: number | null;
}

// ================================================= Fase 9 — área do entregador
export type EstadoRota = "planeada" | "em_curso" | "concluida" | "fechada" | "conferida";

export const ETIQUETA_ROTA: Record<EstadoRota, string> = {
  planeada: "Planeada",
  em_curso: "Em curso",
  concluida: "Concluída",
  fechada: "Fechada",
  conferida: "Conferida",
};

export type Desfecho = "entregue" | "parcial" | "reagendada" | "cancelada" | "ausente";

export const ETIQUETA_DESFECHO: Record<Desfecho, string> = {
  entregue: "Entregue",
  parcial: "Entrega parcial",
  reagendada: "Reagendada",
  cancelada: "Cancelada",
  ausente: "Não entregue",
};

export interface Rota extends CamposComuns {
  data: string;
  nome: string;
  responsavel_id: string;
  viatura: string | null;
  estado: EstadoRota;
  previsto_entregas: number;
  previsto_receber: number;
  realizado_entregas: number | null;
  realizado_recebido: number | null;
  realizado_dinheiro: number | null;
  realizado_saidas: number | null;
  esperado_envelope: number | null;
  valor_envelope: number | null;
  aberta_em: string | null;
  fechada_em: string | null;
  fechada_por: string | null;
  conferida_em: string | null;
  conferida_por: string | null;
  valor_conferido: number | null;
  diferenca: number | null;
  justificacao_diferenca: string | null;
  observacoes: string | null;
  responsavel?: string | null;
  paragens?: number;
  paragens_fechadas?: number;
  caixa_id?: string | null;
}

export interface RotaParagem extends CamposComuns {
  rota_id: string;
  pedido_id: string;
  ordem: number;
  previsto_receber: number;
  desfecho: Desfecho | null;
  data_reagendamento: string | null;
  motivo_id: string | null;
  motivo: string | null;
  entrega_id: string | null;
  concluida_em: string | null;
  rota_data?: string;
  rota_nome?: string;
  rota_estado?: EstadoRota;
  responsavel_id?: string;
  pedido_numero?: string;
  pedido_estado?: EstadoPedido;
  total?: number;
  total_pago?: number;
  pendente?: number;
  morada_entrega?: string | null;
  localidade_entrega?: string | null;
  cp4_entrega?: string | null;
  cp3_entrega?: string | null;
  contacto_entrega?: string | null;
  notas_entrega?: string | null;
  entrega_domicilio?: boolean;
  cliente?: string | null;
  cliente_telefone?: string | null;
  cliente_telefone_alt?: string | null;
  motivo_descricao?: string | null;
}

export interface RotaMovimento {
  id: string;
  rota_id: string;
  criado_em: string;
  tipo: string;
  valor: number;
  sentido: number;
  pedido_id: string | null;
  pagamento_id: string | null;
  descricao: string | null;
  comprovativo_url: string | null;
  forma: string | null;
  motivo: string | null;
}

export interface RotaContas {
  rota_id: string;
  data: string;
  nome: string;
  estado: EstadoRota;
  responsavel_id: string;
  responsavel: string | null;
  previsto_entregas: number;
  previsto_receber: number;
  entregas_feitas: number;
  reagendadas: number;
  nao_entregues: number;
  recebido: number;
  dinheiro: number;
  saidas: number;
  esperado_envelope: number;
  valor_envelope: number | null;
  valor_conferido: number | null;
  diferenca: number | null;
  justificacao_diferenca: string | null;
  fechada_em: string | null;
  conferida_em: string | null;
}

export type EstadoAssistencia =
  | "aberta"
  | "em_analise"
  | "peca_encomendada"
  | "agendada"
  | "resolvida"
  | "cancelada";

export const ETIQUETA_ASSISTENCIA: Record<EstadoAssistencia, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  peca_encomendada: "Peça encomendada",
  agendada: "Agendada",
  resolvida: "Resolvida",
  cancelada: "Cancelada",
};

export const ESTADOS_ASSISTENCIA: Array<{ valor: EstadoAssistencia; etiqueta: string }> = (
  Object.keys(ETIQUETA_ASSISTENCIA) as EstadoAssistencia[]
).map((valor) => ({ valor, etiqueta: ETIQUETA_ASSISTENCIA[valor] }));

export interface Assistencia extends CamposComuns {
  pedido_id: string;
  pedido_item_id: string | null;
  entrega_id: string | null;
  paragem_id: string | null;
  origem: "entrega" | "cliente" | "oficina";
  motivo: string;
  peca_afetada: string | null;
  descricao: string;
  fotos: string[] | null;
  estado: EstadoAssistencia;
  aberta_por: string | null;
  resolvida_em: string | null;
  nota_resolucao: string | null;
  pedido_numero?: string;
  cliente?: string | null;
  item_descricao?: string | null;
  aberta_por_nome?: string | null;
}
