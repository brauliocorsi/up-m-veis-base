import { timingSafeEqual } from "crypto";
import { z } from "zod";

/** Contrato v1 ERP → UP Fábrica. Ver docs/contrato-up-fabrica-v1.md */
export const respostaEncomenda = z.object({
  accepted: z.literal(true),
  event_id: z.string().uuid(),
  orders: z
    .array(
      z.object({
        id: z.string().min(1),
        order_number: z.string().min(1),
        unit_index: z.number().int().positive(),
      }),
    )
    .min(1),
});

/** Corpo enviado ao receptor do UP Fábrica; validado antes de sair. */
export const pedidoEncomenda = z.object({
  schema_version: z.literal(1),
  source_system: z.literal("up-moveis-base"),
  event_id: z.string().uuid(),
  sale_id: z.string().uuid(),
  sale_number: z.string().min(1),
  line_id: z.string().uuid(),
  product_id: z.string().uuid(),
  product_code: z.string().nullable(),
  description: z.string().min(1),
  quantity: z.number().int().positive().max(999),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  customization: z.record(z.string(), z.unknown()).nullable(),
  test_mode: z.boolean(),
});

/** ACK não ambíguo: mesmo event_id, exatamente `quantity` ordens com unit_index 1..quantity. */
export function ackValido(ack: unknown, eventId: string, quantidade: number) {
  const v = respostaEncomenda.safeParse(ack);
  if (!v.success || v.data.event_id !== eventId || v.data.orders.length !== quantidade) return null;
  const indices = v.data.orders.map((o) => o.unit_index).sort((a, b) => a - b);
  if (indices.some((u, i) => u !== i + 1)) return null;
  if (new Set(v.data.orders.map((o) => o.id)).size !== quantidade) return null;
  return v.data;
}

export const eventoFabrica = z.object({
  schema_version: z.literal(1),
  event_id: z.string().uuid(),
  source_system: z.literal("up-fabrica"),
  sale_id: z.string().uuid(),
  line_id: z.string().uuid(),
  order_id: z.string().min(1),
  unit_index: z.number().int().positive(),
  status: z.enum(["produced", "warehouse_received"]),
  quantity: z.literal(1),
  occurred_at: z.string().datetime({ offset: true }),
});

export function configFabrica() {
  const url = process.env["UP_FACTORY_URL"]?.trim() || "";
  const token = process.env["UP_FACTORY_TOKEN"]?.trim() || "";
  return { url, token, configurada: Boolean(url && token) };
}

export function tokenValido(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Rpc = { rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: any; error: any }> };

export async function clienteErpAdmin(): Promise<Rpc> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin as unknown as { schema: (n: string) => Rpc }).schema("erp");
}

interface LinhaOutbox {
  event_id: string;
  pedido_id: string;
  item_id: string;
  quantidade: number;
  payload: Record<string, unknown>;
}

/** Envia as linhas em fila. Só marca "aceite" depois de validar a resposta. */
export async function processarOutbox(testMode: boolean) {
  const cfg = configFabrica();
  if (!cfg.configurada) throw new Error("Integração com o UP Fábrica não configurada.");
  const erp = await clienteErpAdmin();
  const { data: linhas, error } = await erp.rpc("fabrica_outbox_reclamar", { p_limite: 20 });
  if (error) throw new Error(error.message);

  const resultado = { aceites: 0, erros: 0, incertos: 0 };
  for (const l of (linhas ?? []) as LinhaOutbox[]) {
    const bruto = {
      product_code: null,
      due_date: null,
      customization: null,
      ...l.payload,
      schema_version: 1,
      source_system: "up-moveis-base",
      event_id: l.event_id,
      sale_id: l.pedido_id,
      line_id: l.item_id,
      quantity: l.quantidade,
      test_mode: testMode,
    };
    const valido = pedidoEncomenda.safeParse(bruto);
    if (!valido.success) {
      await erp.rpc("fabrica_outbox_resultado", {
        p_event_id: l.event_id,
        p_estado: "erro",
        p_resposta: null,
        p_erro: "Mensagem fora do contrato v1; corrigir a linha antes de enviar.",
      });
      resultado.erros++;
      continue;
    }
    const corpo = valido.data;
    let estado: "aceite" | "erro" | "incerto" = "erro";
    let resposta: unknown = null;
    let erro: string | null = null;
    try {
      const r = await fetch(`${cfg.url.replace(/\/$/, "")}/api/integrations/erp/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-up-integration-token": cfg.token },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      });
      const texto = await r.text();
      if (r.ok) {
        let ack: unknown = null;
        try {
          ack = JSON.parse(texto);
        } catch {
          ack = null;
        }
        const v = ackValido(ack, l.event_id, l.quantidade);
        if (v) {
          estado = "aceite";
          resposta = v;
        } else {
          estado = "incerto";
          erro = "Resposta fora do contrato; reenvio com a mesma chave.";
        }
      } else if (r.status >= 500) {
        estado = "incerto";
        erro = `HTTP ${r.status}`;
      } else {
        estado = "erro";
        erro = `HTTP ${r.status}: ${texto.slice(0, 200)}`;
      }
    } catch (e) {
      // timeout/rede: não sabemos se a fábrica recebeu → mesma chave no próximo envio
      estado = "incerto";
      erro = e instanceof Error ? e.message : "Falha de rede";
    }
    const { error: e2 } = await erp.rpc("fabrica_outbox_resultado", {
      p_event_id: l.event_id,
      p_estado: estado,
      p_resposta: resposta,
      p_erro: erro,
    });
    if (e2) estado = "incerto";
    resultado[estado === "aceite" ? "aceites" : estado === "erro" ? "erros" : "incertos"]++;
  }
  return resultado;
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * Callback Fábrica → ERP (contrato v1). Partilhado pelos dois endereços
 * (/api/integrations/factory/events e o alias público /api/public/integrations/factory/events).
 * ACK de sucesso: { accepted: true, event_id: <igual ao recebido>, result } — `result` é extra.
 */
export async function tratarEventoFabrica(request: Request): Promise<Response> {
  const cfg = configFabrica();
  if (!cfg.token) return json({ accepted: false, error: "not_configured" }, 503);
  if (!tokenValido(request.headers.get("x-up-integration-token"), cfg.token)) {
    return json({ accepted: false, error: "unauthorized" }, 401);
  }
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return json({ accepted: false, error: "invalid_json" }, 400);
  }
  const v = eventoFabrica.safeParse(corpo);
  if (!v.success) return json({ accepted: false, error: "invalid_body" }, 422);

  const erp = await clienteErpAdmin();
  const { data, error } = await erp.rpc("fabrica_registar_evento", { p: v.data });
  if (error) return json({ accepted: false, event_id: v.data.event_id, error: "internal" }, 500);
  const r = data as { resultado: string };
  if (r.resultado === "invalido" || r.resultado === "desconhecido") {
    return json({ accepted: false, event_id: v.data.event_id, error: r.resultado }, 422);
  }
  // aplicado | duplicado | fora_de_ordem: todos ficam guardados → ACK positivo e idêntico.
  return json({ accepted: true, event_id: v.data.event_id, result: r.resultado });
}

/** Tarefa agendável do envio da fila. Desligada por omissão (fabrica_worker_ativo=false). */
export async function correrWorkerFabrica(): Promise<Record<string, unknown>> {
  const cfg = configFabrica();
  if (!cfg.configurada) return { ok: true, executado: false, motivo: "nao_configurado" };
  const erp = await clienteErpAdmin();
  const { data: pode, error } = await erp.rpc("fabrica_worker_pode_correr");
  if (error) return { ok: false, executado: false, motivo: "erro_leitura" };
  if (pode !== true) return { ok: true, executado: false, motivo: "desligado" };
  const r = await processarOutbox(false);
  return { ok: true, executado: true, ...r };
}
