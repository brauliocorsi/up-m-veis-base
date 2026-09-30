import { createFileRoute } from "@tanstack/react-router";

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/** Callback do UP Fábrica (contrato v1). Autenticação por x-up-integration-token. */
export const Route = createFileRoute("/api/integrations/factory/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { configFabrica, tokenValido, eventoFabrica, clienteErpAdmin } = await import(
          "@/lib/erp/fabrica.server"
        );
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
        if (error) return json({ accepted: false, error: "internal" }, 500);
        const r = data as { resultado: string; detalhe?: string };
        if (r.resultado === "invalido" || r.resultado === "desconhecido") {
          return json({ accepted: false, event_id: v.data.event_id, result: r.resultado }, 422);
        }
        return json({ accepted: true, event_id: v.data.event_id, result: r.resultado });
      },
    },
  },
});
