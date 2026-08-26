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
