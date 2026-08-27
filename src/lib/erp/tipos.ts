export type Perfil = "vendedora" | "escritorio" | "compras" | "financeiro" | "adm";

export const PERFIS: Array<{ valor: Perfil; etiqueta: string }> = [
  { valor: "vendedora", etiqueta: "Vendedora" },
  { valor: "escritorio", etiqueta: "Escritório" },
  { valor: "compras", etiqueta: "Compras" },
  { valor: "financeiro", etiqueta: "Financeiro" },
  { valor: "adm", etiqueta: "Administração" },
];

export const ETIQUETA_PERFIL: Record<Perfil, string> = {
  vendedora: "Vendedora",
  escritorio: "Escritório",
  compras: "Compras",
  financeiro: "Financeiro",
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
  | "reabertura";

export const CONTEXTOS: Array<{ valor: Contexto; etiqueta: string }> = [
  { valor: "cancelamento", etiqueta: "Cancelamento" },
  { valor: "alteracao_data", etiqueta: "Alteração de data" },
  { valor: "eliminacao", etiqueta: "Eliminação" },
  { valor: "saida_caixa", etiqueta: "Saída de caixa" },
  { valor: "desconto_excecional", etiqueta: "Desconto excecional" },
  { valor: "reabertura", etiqueta: "Reabertura" },
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
  custo_ultimo: number | null;
  iva_pct: number;
  valor_montagem: number;
  montagem_obrigatoria: boolean;
  tempo_montagem_min: number | null;
  permite_desconto: boolean;
  margem_minima_pct: number | null;
  ponto_reposicao: number | null;
  imagem_url: string | null;
  vendavel: boolean;
  ativo: boolean;
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
