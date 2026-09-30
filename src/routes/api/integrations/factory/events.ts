import { createFileRoute } from "@tanstack/react-router";

/** Callback do UP Fábrica (contrato v1). Autenticação por x-up-integration-token. */
export const Route = createFileRoute("/api/integrations/factory/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tratarEventoFabrica } = await import("@/lib/erp/fabrica.server");
        return tratarEventoFabrica(request);
      },
    },
  },
});
