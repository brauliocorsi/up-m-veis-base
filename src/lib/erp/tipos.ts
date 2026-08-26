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

export const TABELAS: Array<{ valor: string; etiqueta: string; rotulo: string }> = [
  { valor: "utilizadores", etiqueta: "Utilizadores", rotulo: "nome" },
  { valor: "formas_pagamento", etiqueta: "Formas de pagamento", rotulo: "nome" },
  { valor: "zonas_entrega", etiqueta: "Zonas de entrega", rotulo: "nome" },
  { valor: "calendario", etiqueta: "Calendário", rotulo: "descricao" },
  { valor: "motivos", etiqueta: "Motivos", rotulo: "descricao" },
  { valor: "definicoes", etiqueta: "Definições", rotulo: "chave" },
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
