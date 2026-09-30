import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ClienteErp = {
  schema: (n: string) => {
    from: (t: string) => any;
    rpc: (n: string, a?: Record<string, unknown>) => any;
  };
};

async function exigirAdm(supabase: unknown, userId: string) {
  const { data } = await (supabase as ClienteErp)
    .schema("erp")
    .from("utilizadores")
    .select("perfil, ativo")
    .eq("user_id", userId)
    .is("eliminado_em", null)
    .maybeSingle();
  if (!data || !data.ativo || data.perfil !== "adm") {
    throw new Error("Só a Administração pode gerir a integração com a fábrica.");
  }
}

export const estadoIntegracaoFabrica = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { configFabrica } = await import("./fabrica.server");
    const cfg = configFabrica();
    const erp = (context.supabase as unknown as ClienteErp).schema("erp");
    const { data: bloqueios } = await erp.rpc("fabrica_bloqueios");
    const { data: def } = await erp
      .from("definicoes")
      .select("chave, valor")
      .in("chave", ["fabrica_integracao_ativa", "fabrica_politica_entrada"]);
    const mapa = Object.fromEntries(
      ((def ?? []) as Array<{ chave: string; valor: unknown }>).map((d) => [d.chave, d.valor]),
    );
    return {
      configurada: cfg.configurada,
      ativa: mapa["fabrica_integracao_ativa"] === true,
      politica: (mapa["fabrica_politica_entrada"] as string | null) ?? null,
      bloqueios: (bloqueios ?? []) as string[],
    };
  });

export const enviarFilaFabrica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ testMode: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdm(context.supabase, context.userId);
    const { configFabrica, processarOutbox } = await import("./fabrica.server");
    if (!configFabrica().configurada) {
      throw new Error("Integração com o UP Fábrica não configurada (falta endereço ou chave).");
    }
    const erp = (context.supabase as unknown as ClienteErp).schema("erp");
    const { data: def } = await erp
      .from("definicoes")
      .select("valor")
      .eq("chave", "fabrica_integracao_ativa")
      .maybeSingle();
    if (def?.valor !== true) throw new Error("A integração com a fábrica está desligada.");
    return processarOutbox(data.testMode);
  });
