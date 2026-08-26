import { mensagemErro } from "./db";

/** Mostra a primeira mensagem de validação do formulário, ou traduz o erro técnico. */
export function primeiraMensagem(erro: unknown): string {
  const objeto = erro as { issues?: Array<{ message: string }>; message?: string };
  if (objeto?.issues?.length) return objeto.issues[0]!.message;
  return mensagemErro(erro, objeto?.message || undefined);
}
