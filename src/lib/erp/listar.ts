import { erp } from "./db";

export interface ParametrosListagem {
  tabela: string;
  camposPesquisa?: string[];
  pesquisa?: string;
  ordenarPor?: string;
  ascendente?: boolean;
  pagina?: number;
  tamanho?: number;
  /** true = só registos eliminados (lixeira); false = só ativos */
  eliminados?: boolean;
  filtros?: Array<{ campo: string; valor: string | number | boolean }>;
}

export interface Listagem<T> {
  linhas: T[];
  total: number;
}

/** Pesquisa, ordenação e paginação feitas no servidor. */
export async function listar<T>({
  tabela,
  camposPesquisa = [],
  pesquisa = "",
  ordenarPor = "criado_em",
  ascendente = false,
  pagina = 1,
  tamanho = 20,
  eliminados = false,
  filtros = [],
}: ParametrosListagem): Promise<Listagem<T>> {
  const de = (pagina - 1) * tamanho;
  let consulta = erp()
    .from(tabela)
    .select("*", { count: "exact" })
    .order(ordenarPor, { ascending: ascendente })
    .range(de, de + tamanho - 1);

  consulta = eliminados
    ? consulta.not("eliminado_em", "is", null)
    : consulta.is("eliminado_em", null);

  const termo = pesquisa.trim();
  if (termo && camposPesquisa.length > 0) {
    consulta = consulta.or(camposPesquisa.map((campo) => `${campo}.ilike.%${termo}%`).join(","));
  }
  for (const filtro of filtros) {
    consulta = consulta.eq(filtro.campo, filtro.valor);
  }

  const { data, error, count } = await consulta;
  if (error) throw error;
  return { linhas: (data ?? []) as T[], total: count ?? 0 };
}

/** Marca um registo como eliminado (eliminação lógica). */
export async function eliminarRegisto(tabela: string, id: string, motivo: string) {
  const { error } = await erp()
    .from(tabela)
    .update({ eliminado_em: new Date().toISOString(), motivo_eliminacao: motivo })
    .eq("id", id);
  if (error) throw error;
}

/** Devolve um registo eliminado às listas. */
export async function restaurarRegisto(tabela: string, id: string) {
  const { error } = await erp().from(tabela).update({ eliminado_em: null }).eq("id", id);
  if (error) throw error;
}
