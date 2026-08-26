/**
 * Ligação ao Contagem (WMS do armazém).
 * O ERP nunca copia o stock do Contagem: só lê movimentos e escreve-os no seu
 * próprio livro, de forma idempotente.
 */

interface MovimentoContagem {
  id: string | number;
  produto_codigo: string;
  tipo: string;
  quantidade: number;
  ocorrido_em: string;
  referencia?: string | null;
}

function configuracao() {
  const url = process.env["CONTAGEM_URL"];
  const chave = process.env["CONTAGEM_CHAVE"];
  if (!url || !chave) {
    throw new Error(
      "A ligação ao Contagem ainda não está configurada. Contacte a administração.",
    );
  }
  return { url: url.replace(/\/+$/, ""), chave };
}

export function contagemConfigurado(): boolean {
  return Boolean(process.env["CONTAGEM_URL"] && process.env["CONTAGEM_CHAVE"]);
}

async function pedir<T>(caminho: string): Promise<T> {
  const { url, chave } = configuracao();
  const resposta = await fetch(`${url}${caminho}`, {
    headers: { Authorization: `Bearer ${chave}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!resposta.ok) {
    throw new Error(`O Contagem respondeu ${resposta.status} em ${caminho}.`);
  }
  return (await resposta.json()) as T;
}

type ClienteRpc = {
  schema: (nome: string) => {
    from: (tabela: string) => any;
    rpc: (nome: string, args?: Record<string, unknown>) => any;
  };
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin as unknown as ClienteRpc).schema("erp");
}

async function registarErroSync(mensagem: string) {
  const cliente = await admin();
  await cliente
    .from("sync_estado")
    .update({
      estado: "erro",
      erro: mensagem.slice(0, 500),
      ultima_tentativa: new Date().toISOString(),
    })
    .eq("fonte", "contagem");
}

/** Lê os movimentos novos do Contagem e escreve-os no livro do ERP. */
export async function sincronizarContagem(): Promise<{
  processados: number;
  ignorados: number;
  cursor: string | null;
}> {
  const cliente = await admin();
  try {
    const { data: estado } = await cliente
      .from("sync_estado")
      .select("cursor, inventario_inicial_em")
      .eq("fonte", "contagem")
      .maybeSingle();

    if (!estado?.inventario_inicial_em) {
      throw new Error(
        "O inventário inicial ainda não foi aplicado. Importe-o antes de sincronizar.",
      );
    }

    const cursor = (estado?.cursor as string | null) ?? "";
    const resposta = await pedir<{ movimentos?: MovimentoContagem[] } | MovimentoContagem[]>(
      `/movimentos?desde=${encodeURIComponent(cursor)}`,
    );
    const movimentos = Array.isArray(resposta) ? resposta : (resposta.movimentos ?? []);

    const { data, error } = await cliente.rpc("registar_movimentos_contagem", {
      p_movimentos: movimentos,
    });
    if (error) throw new Error(error.message);
    const resultado = (data ?? {}) as {
      processados?: number;
      ignorados?: number;
      cursor?: string | null;
    };
    return {
      processados: resultado.processados ?? 0,
      ignorados: resultado.ignorados ?? 0,
      cursor: resultado.cursor ?? null,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido na sincronização.";
    await registarErroSync(mensagem);
    throw new Error(mensagem);
  }
}

/** Lê o stock completo do Contagem (usado no inventário inicial e na reconciliação). */
export async function lerStockContagem(): Promise<
  Array<{ produto_codigo: string; fisico: number }>
> {
  const resposta = await pedir<
    { stock?: Array<{ produto_codigo: string; fisico: number }> } | Array<{
      produto_codigo: string;
      fisico: number;
    }>
  >("/stock");
  const linhas = Array.isArray(resposta) ? resposta : (resposta.stock ?? []);
  return linhas.map((l) => ({ produto_codigo: String(l.produto_codigo), fisico: Number(l.fisico) }));
}

/** Pré-visualização do inventário inicial: não escreve nada. */
export async function preverInventarioInicial() {
  const linhas = await lerStockContagem();
  const total = linhas.reduce((soma, l) => soma + (Number.isFinite(l.fisico) ? l.fisico : 0), 0);
  return { produtos: linhas.length, unidades: total, amostra: linhas.slice(0, 10) };
}

/** Aplica o inventário inicial. Só corre uma vez e exige confirmação escrita. */
export async function aplicarInventarioInicial(confirmacao: string) {
  const cliente = await admin();
  const linhas = await lerStockContagem();
  const cursorResposta = await pedir<{ cursor?: string | null }>("/movimentos/cursor").catch(
    () => ({ cursor: null }),
  );
  const { data, error } = await cliente.rpc("aplicar_inventario_inicial", {
    p_linhas: linhas,
    p_cursor: cursorResposta?.cursor ?? null,
    p_confirmacao: confirmacao,
  });
  if (error) throw new Error(error.message);
  return data as unknown;
}

/** Compara o stock do ERP com o do Contagem e grava as divergências. */
export async function correrReconciliacao() {
  const cliente = await admin();
  const linhas = await lerStockContagem();
  const { data, error } = await cliente.rpc("registar_reconciliacao", { p_linhas: linhas });
  if (error) throw new Error(error.message);
  return { reconciliacao_id: data as string, produtos: linhas.length };
}
