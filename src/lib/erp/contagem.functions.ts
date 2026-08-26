import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ClienteErp = {
  schema: (nome: string) => {
    from: (tabela: string) => any;
  };
};

async function exigirAdm(context: { supabase: unknown; userId: string }) {
  const { data } = await (context.supabase as unknown as ClienteErp)
    .schema("erp")
    .from("utilizadores")
    .select("perfil, ativo")
    .eq("user_id", context.userId)
    .maybeSingle();
  const eu = data as { perfil?: string; ativo?: boolean } | null;
  if (!eu || eu.perfil !== "adm" || !eu.ativo) {
    throw new Error("Não tem permissão para gerir a sincronização.");
  }
}

/** Estado da ligação ao Contagem (sem revelar chaves). */
export const estadoLigacaoContagem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { contagemConfigurado } = await import("./contagem.server");
    return { configurado: contagemConfigurado() };
  });

export const sincronizarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdm(context);
    const { sincronizarContagem } = await import("./contagem.server");
    return await sincronizarContagem();
  });

export const preverInventario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdm(context);
    const { preverInventarioInicial } = await import("./contagem.server");
    return await preverInventarioInicial();
  });

export const aplicarInventario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((entrada: { confirmacao: string }) => ({
    confirmacao: String(entrada?.confirmacao ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await exigirAdm(context);
    const { aplicarInventarioInicial } = await import("./contagem.server");
    await aplicarInventarioInicial(data.confirmacao);
    return { ok: true };
  });

export const reconciliarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdm(context);
    const { correrReconciliacao } = await import("./contagem.server");
    return await correrReconciliacao();
  });
