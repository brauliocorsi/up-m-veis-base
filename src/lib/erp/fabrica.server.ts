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
    const corpo = {
      schema_version: 1,
      source_system: "up-moveis-base",
      event_id: l.event_id,
      sale_id: l.pedido_id,
      line_id: l.item_id,
      ...l.payload,
      quantity: l.quantidade,
      test_mode: testMode,
    };
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
        const v = respostaEncomenda.safeParse(JSON.parse(texto));
        if (
          v.success &&
          v.data.event_id === l.event_id &&
          v.data.orders.length === l.quantidade &&
          new Set(v.data.orders.map((o) => o.unit_index)).size === l.quantidade
        ) {
          estado = "aceite";
          resposta = v.data;
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
