import { createFileRoute } from "@tanstack/react-router";

/**
 * Alias público do callback da fábrica: fica fora da proteção de login do site,
 * mas só aceita pedidos com x-up-integration-token válido. Mesmo tratamento que
 * /api/integrations/factory/events.
 */
export const Route = createFileRoute("/api/public/integrations/factory/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tratarEventoFabrica } = await import("@/lib/erp/fabrica.server");
        return tratarEventoFabrica(request);
      },
    },
  },
});
