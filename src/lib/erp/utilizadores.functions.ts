import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { esquemaCriarUtilizador, esquemaNovaPalavraPasse } from "@/lib/erp/esquemas";

export const criarUtilizador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((entrada: unknown) => esquemaCriarUtilizador.parse(entrada))
  .handler(async ({ data, context }) => {
    const { data: eu } = await (context.supabase as never as ClienteErp)
      .schema("erp")
      .from("utilizadores")
      .select("perfil, ativo")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!eu || eu.perfil !== "adm" || !eu.ativo) {
      throw new Error("Não tem permissão para criar utilizadores.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: criado, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.palavra_passe,
      email_confirm: true,
    });
    if (erroAuth || !criado.user) {
      throw new Error(
        erroAuth?.message?.toLowerCase().includes("already")
          ? "Já existe uma conta com este email."
          : "Não foi possível criar a conta de acesso.",
      );
    }

    const { error: erroPerfil } = await (supabaseAdmin as never as ClienteErp)
      .schema("erp")
      .from("utilizadores")
      .insert({
        user_id: criado.user.id,
        nome: data.nome,
        email: data.email,
        telefone: data.telefone || null,
        perfil: data.perfil,
        ativo: true,
        criado_por: context.userId,
      });
    if (erroPerfil) {
      await supabaseAdmin.auth.admin.deleteUser(criado.user.id);
      throw new Error("Não foi possível guardar os dados do utilizador.");
    }

    return { user_id: criado.user.id };
  });

export const definirPalavraPasse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((entrada: unknown) => esquemaNovaPalavraPasse.parse(entrada))
  .handler(async ({ data, context }) => {
    const { data: eu } = await (context.supabase as never as ClienteErp)
      .schema("erp")
      .from("utilizadores")
      .select("perfil, ativo")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!eu || eu.perfil !== "adm" || !eu.ativo) {
      throw new Error("Não tem permissão para alterar palavras-passe.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.palavra_passe,
    });
    if (error) throw new Error("Não foi possível guardar a nova palavra-passe.");
    return { ok: true };
  });

type ClienteErp = {
  schema: (nome: string) => {
    from: (tabela: string) => {
      select: (colunas: string) => {
        eq: (
          campo: string,
          valor: string,
        ) => {
          maybeSingle: () => Promise<{ data: { perfil: string; ativo: boolean } | null }>;
        };
      };
      insert: (linha: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
};
