import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entradaLogo = z.object({
  base64: z.string().min(10),
  tipo: z.enum(["image/png", "image/jpeg"]),
});

/** Guarda o logótipo da empresa em Storage e devolve um endereço assinado para pré-visualização. */
export const carregarLogotipo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((dados: unknown) => entradaLogo.parse(dados))
  .handler(async ({ data, context }) => {
    const db = (
      context.supabase as unknown as { schema: (n: string) => { from: (t: string) => any } }
    ).schema("erp");

    const { data: perfil } = await db
      .from("v_utilizadores")
      .select("perfil")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (perfil?.perfil !== "adm") throw new Error("Apenas a administração pode alterar o logótipo.");

    const extensao = data.tipo === "image/png" ? "png" : "jpg";
    const caminho = `empresa/logotipo.${extensao}`;
    const binario = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (binario.byteLength > 5 * 1024 * 1024) throw new Error("A imagem não pode exceder 5 MB.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: erroUpload } = await supabaseAdmin.storage
      .from("documentos")
      .upload(caminho, binario, { contentType: data.tipo, upsert: true });
    if (erroUpload) throw new Error(`Não foi possível guardar a imagem: ${erroUpload.message}`);

    const { data: assinado } = await supabaseAdmin.storage
      .from("documentos")
      .createSignedUrl(caminho, 3600);

    return { caminho, url: assinado?.signedUrl ?? null };
  });

const entradaUrl = z.object({ caminho: z.string().min(1) });

/** Devolve um endereço assinado para mostrar uma imagem guardada em Storage. */
export const urlDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((dados: unknown) => entradaUrl.parse(dados))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assinado } = await supabaseAdmin.storage
      .from("documentos")
      .createSignedUrl(data.caminho, 3600);
    return { url: assinado?.signedUrl ?? null };
  });
