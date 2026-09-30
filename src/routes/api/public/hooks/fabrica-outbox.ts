import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Envio automático da fila para o UP Fábrica. Nenhum agendamento está criado:
 * só corre quando alguém o agendar e com integração + worker ligados.
 */
export const Route = createFileRoute("/api/public/hooks/fabrica-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const recusa = await authenticateCronRequest(request);
        if (recusa) return recusa;
        const { correrWorkerFabrica } = await import("@/lib/erp/fabrica.server");
        try {
          return Response.json(await correrWorkerFabrica());
        } catch {
          return Response.json({ ok: false, executado: false, motivo: "falha" }, { status: 500 });
        }
      },
    },
  },
});
