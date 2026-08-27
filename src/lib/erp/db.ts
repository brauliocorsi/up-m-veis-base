import { supabase } from "@/integrations/supabase/client";

/**
 * O ERP vive no schema `erp`, que está exposto na API.
 * Os tipos gerados só cobrem `public`, por isso usamos um cliente sem tipos
 * e tipamos as linhas em `tipos.ts`.
 */
type ClienteSchema = {
  schema: (nome: string) => {
    from: (tabela: string) => any;
    rpc: (nome: string, args?: Record<string, unknown>) => any;
  };
};

export function erp() {
  return (supabase as unknown as ClienteSchema).schema("erp");
}

const MENSAGENS: Array<{ teste: (t: string, c: string) => boolean; mensagem: string }> = [
  {
    teste: (_t, c) => c === "23503",
    mensagem: "Não é possível eliminar: este registo está a ser usado noutro sítio.",
  },
  {
    teste: (_t, c) => c === "23505",
    mensagem: "Já existe um registo com estes dados. Verifique o código ou a data.",
  },
  {
    teste: (_t, c) => c === "23514" || c === "23502",
    mensagem: "Há dados inválidos no formulário. Reveja os campos assinalados.",
  },
  {
    teste: (t, c) => c === "42501" || t.includes("row-level security") || t.includes("permission"),
    mensagem: "Não tem permissão para esta ação.",
  },
  {
    teste: (t) => t.includes("invalid login credentials"),
    mensagem: "Email ou palavra-passe incorretos.",
  },
  {
    teste: (t) => t.includes("email not confirmed"),
    mensagem: "Esta conta ainda não foi confirmada. Contacte o administrador.",
  },
  {
    teste: (t) => t.includes("password should be at least"),
    mensagem: "A palavra-passe tem de ter pelo menos 6 caracteres.",
  },
  {
    teste: (t) => t.includes("failed to fetch") || t.includes("networkerror"),
    mensagem: "Sem ligação ao servidor. Verifique a Internet e tente outra vez.",
  },
];

/** Converte qualquer erro técnico numa frase clara em português. */
export function mensagemErro(
  erro: unknown,
  alternativa = "Não foi possível concluir a operação. Tente novamente.",
): string {
  const objeto = (erro ?? {}) as { message?: string; code?: string; details?: string };
  const texto = `${objeto.message ?? ""} ${objeto.details ?? ""}`.toLowerCase();
  const codigo = objeto.code ?? "";
  // Mensagens escritas por nós nas funções da base de dados já estão em português.
  if (codigo === "P0001" && objeto.message) return objeto.message;
  for (const entrada of MENSAGENS) {
    if (entrada.teste(texto, codigo)) return entrada.mensagem;
  }
  return alternativa;
}
