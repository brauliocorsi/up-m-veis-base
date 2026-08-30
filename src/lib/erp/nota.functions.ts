import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entrada = z.object({
  pedido_id: z.string().uuid(),
  regenerar: z.boolean().optional(),
});

/**
 * Gera (ou reutiliza) o PDF da nota de encomenda, guarda-o em Storage
 * e devolve um endereço assinado válido por uma hora.
 */
export const gerarNotaEncomenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((dados: unknown) => entrada.parse(dados))
  .handler(async ({ data, context }) => {
    type ClienteSchema = {
      schema: (nome: string) => {
        from: (tabela: string) => any;
      };
    };
    const db = (context.supabase as unknown as ClienteSchema).schema("erp");

    const { data: pedido, error: erroPedido } = await db
      .from("v_pedidos")
      .select("*")
      .eq("id", data.pedido_id)
      .maybeSingle();
    if (erroPedido) throw new Error(erroPedido.message);
    if (!pedido) throw new Error("Pedido não encontrado.");

    const caminho = `notas/${pedido.id}.pdf`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reimprimir devolve sempre o mesmo ficheiro já guardado.
    if (!data.regenerar) {
      const { data: existentes } = await supabaseAdmin.storage
        .from("documentos")
        .list("notas", { search: `${pedido.id}.pdf` });
      if (existentes?.some((f) => f.name === `${pedido.id}.pdf`)) {
        const { data: assinado } = await supabaseAdmin.storage
          .from("documentos")
          .createSignedUrl(caminho, 3600);
        if (assinado?.signedUrl) {
          return { url: assinado.signedUrl, numero: pedido.numero as string, reutilizado: true };
        }
      }
    }

    const [{ data: itens }, { data: pagamentos }, { data: definicoes }, { data: cliente }] =
      await Promise.all([
        db
          .from("v_pedido_itens")
          .select("*")
          .eq("pedido_id", data.pedido_id)
          .order("linha", { ascending: true }),
        db
          .from("v_pagamentos")
          .select("*")
          .eq("pedido_id", data.pedido_id)
          .order("criado_em", { ascending: true }),
        db.from("definicoes").select("chave, valor").in("chave", ["empresa", "iva_pct"]),
        db
          .from("v_clientes")
          .select("nome, nif, telefone_e164, morada, cp4, cp3, localidade")
          .eq("id", pedido.cliente_id)
          .maybeSingle(),
      ]);

    const mapaDefs = new Map<string, unknown>((definicoes ?? []).map((d: { chave: string; valor: unknown }) => [d.chave, d.valor] as const));
    const empresa = (mapaDefs.get("empresa") ?? {}) as Record<string, string>;

    const moradaEntrega = pedido.entrega_domicilio
      ? [
          pedido.morada_entrega,
          [pedido.cp4_entrega, pedido.cp3_entrega].filter(Boolean).join("-"),
          pedido.localidade_entrega,
        ]
          .filter(Boolean)
          .join(", ")
      : [cliente?.morada, [cliente?.cp4, cliente?.cp3].filter(Boolean).join("-"), cliente?.localidade]
          .filter(Boolean)
          .join(", ");

    const descontos =
      Number(pedido.desconto_linhas ?? 0) +
      Number(pedido.desconto_cabecalho ?? 0) +
      Number(pedido.desconto_cupao ?? 0);
    const pago = Number(pedido.total_pago ?? 0);

    let logotipo: Uint8Array | null = null;
    const urlLogo = empresa["logotipo_url"];
    if (urlLogo && /^https:\/\//.test(urlLogo)) {
      try {
        const resposta = await fetch(urlLogo);
        if (resposta.ok) logotipo = new Uint8Array(await resposta.arrayBuffer());
      } catch {
        logotipo = null;
      }
    }

    const { construirNotaPdf } = await import("./nota.server");
    const bytes = await construirNotaPdf({
      numero: pedido.numero,
      data: pedido.confirmado_em ?? pedido.criado_em,
      vendedora: pedido.vendedor_nome ?? "—",
      cliente: {
        nome: cliente?.nome ?? pedido.cliente_nome ?? "—",
        nif: cliente?.nif ?? pedido.cliente_nif ?? null,
        telefone: cliente?.telefone_e164 ?? pedido.cliente_telefone ?? null,
        morada: moradaEntrega || null,
      },
      linhas: (itens ?? []).map((i: Record<string, unknown>) => ({
        descricao: i["descricao"] as string,
        quantidade: Number(i["quantidade"]),
        preco_unitario: Number(i["preco_unitario"]),
        desconto: Number(i["desconto_valor"] ?? 0),
        total: Number(i["total_linha"]),
      })),
      montagem: Number(pedido.valor_montagem ?? 0),
      entrega: Number(pedido.valor_entrega ?? 0),
      subtotal: Number(pedido.total_sem_iva ?? pedido.subtotal ?? 0),
      descontos,
      iva: Number(pedido.total_iva ?? 0),
      total: Number(pedido.total ?? 0),
      pago,
      falta: Math.max(Number(pedido.total ?? 0) - pago, 0),
      pagamentos: (pagamentos ?? []).map((p: Record<string, unknown>) => ({
        forma: (p["forma_nome"] as string) ?? "—",
        valor: Number(p["valor"]),
        estado: p["estado"] as string,
        data: (p["data_confirmacao"] as string | null) ?? (p["criado_em"] as string | null),
      })),
      data_entrega: pedido.data_entrega_prometida ?? pedido.data_entrega_prevista,
      empresa,
      logotipo,
    });

    const { error: erroUpload } = await supabaseAdmin.storage
      .from("documentos")
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: true });
    if (erroUpload) throw new Error(`Não foi possível guardar o PDF: ${erroUpload.message}`);

    const { data: assinado, error: erroUrl } = await supabaseAdmin.storage
      .from("documentos")
      .createSignedUrl(caminho, 3600);
    if (erroUrl || !assinado?.signedUrl) throw new Error("Não foi possível abrir o PDF gerado.");

    return { url: assinado.signedUrl, numero: pedido.numero as string, reutilizado: false };
  });
