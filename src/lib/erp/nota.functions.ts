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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminErp = (
      supabaseAdmin as unknown as {
        schema: (n: string) => {
          from: (t: string) => any;
          rpc: (n: string, a: Record<string, unknown>) => any;
        };
      }
    ).schema("erp");

    // Reimprimir devolve a última versão guardada; nunca reescreve versões antigas.
    if (!data.regenerar) {
      const { data: ultima } = await adminErp
        .from("nota_versoes")
        .select("caminho, versao")
        .eq("pedido_id", pedido.id)
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      const caminhoExistente = (ultima?.caminho as string | undefined) ?? null;
      if (caminhoExistente) {
        const { data: assinado } = await supabaseAdmin.storage
          .from("documentos")
          .createSignedUrl(caminhoExistente, 3600);
        if (assinado?.signedUrl) {
          return {
            url: assinado.signedUrl,
            numero: pedido.numero as string,
            reutilizado: true,
            versao: Number(ultima?.versao ?? 1),
          };
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
    const caminhoLogo = empresa["logotipo_path"];
    if (caminhoLogo) {
      const { data: ficheiro } = await supabaseAdmin.storage.from("documentos").download(caminhoLogo);
      if (ficheiro) logotipo = new Uint8Array(await ficheiro.arrayBuffer());
    }
    const urlLogo = empresa["logotipo_url"];
    if (!logotipo && urlLogo && /^https:\/\//.test(urlLogo)) {
      try {
        const resposta = await fetch(urlLogo);
        if (resposta.ok) logotipo = new Uint8Array(await resposta.arrayBuffer());
      } catch {
        logotipo = null;
      }
    }

    const mapear = (i: Record<string, unknown>) => ({
      codigo: (i["cod_barras"] as string | null) ?? null,
      descricao: (i["descricao"] as string) ?? "—",
      unidade: "UN",
      quantidade: Number(i["quantidade"]),
      preco_unitario: Number(i["preco_unitario"]),
      desconto: Number(i["desconto_valor"] ?? 0),
      total: Number(i["total_linha"]),
    });
    const todas = (itens ?? []) as Record<string, unknown>[];
    const produtos = todas.filter((i) => !i["servico_id"]).map(mapear);
    const servicos = todas.filter((i) => Boolean(i["servico_id"])).map(mapear);

    const montagem = Number(pedido.valor_montagem ?? 0);
    const entrega = Number(pedido.valor_entrega ?? 0);
    if (montagem > 0) {
      servicos.push({
        codigo: "MONTAGEM",
        descricao: "Montagem em casa do cliente",
        unidade: "UN",
        quantidade: 1,
        preco_unitario: montagem,
        desconto: 0,
        total: montagem,
      });
    }
    if (entrega > 0) {
      servicos.push({
        codigo: "ENTREGA",
        descricao: "Entrega ao domicílio",
        unidade: "UN",
        quantidade: 1,
        preco_unitario: entrega,
        desconto: 0,
        total: entrega,
      });
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
      produtos,
      servicos,
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

    const { data: versao, error: erroVersao } = await adminErp.rpc("registar_versao_nota", {
      p_pedido_id: pedido.id,
      p_caminho: `notas/${pedido.id}/pendente.pdf`,
      p_motivo: data.regenerar ? "regenerada" : "primeira",
    });
    if (erroVersao) throw new Error("Não foi possível numerar a versão da nota.");
    const caminho = `notas/${pedido.id}/v${versao}.pdf`;
    await adminErp
      .from("nota_versoes")
      .update({ caminho })
      .eq("pedido_id", pedido.id)
      .eq("versao", versao);

    const { error: erroUpload } = await supabaseAdmin.storage
      .from("documentos")
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: false });
    if (erroUpload) throw new Error(`Não foi possível guardar o PDF: ${erroUpload.message}`);

    const { data: assinado, error: erroUrl } = await supabaseAdmin.storage
      .from("documentos")
      .createSignedUrl(caminho, 3600);
    if (erroUrl || !assinado?.signedUrl) throw new Error("Não foi possível abrir o PDF gerado.");

    return {
      url: assinado.signedUrl,
      numero: pedido.numero as string,
      reutilizado: false,
      versao: Number(versao),
    };
  });
