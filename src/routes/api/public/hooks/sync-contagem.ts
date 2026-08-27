import { createFileRoute } from "@tanstack/react-router";

/**
 * Tarefa automática: sincroniza o livro de movimentos com o Contagem e
 * expira as reservas fora de prazo. Chamada pelo agendador da base de dados.
 */
export const Route = createFileRoute("/api/public/hooks/sync-contagem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const chave =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const esperada = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!esperada || chave !== esperada) {
          return new Response(JSON.stringify({ erro: "Não autorizado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cliente = (
          supabaseAdmin as unknown as {
            schema: (n: string) => { rpc: (n: string, a?: Record<string, unknown>) => any };
          }
        ).schema("erp");

        let expiradas = 0;
        try {
          const { data } = await cliente.rpc("expirar_reservas");
          expiradas = Number(data ?? 0);
        } catch {
          expiradas = 0;
        }

        let tarefa = "sincronizar";
        try {
          const corpo = (await request.json()) as { tarefa?: string } | null;
          tarefa = corpo?.tarefa ?? "sincronizar";
        } catch {
          tarefa = "sincronizar";
        }

        try {
          if (tarefa === "reconciliar") {
            const { correrReconciliacao } = await import("@/lib/erp/contagem.server");
            const resultado = await correrReconciliacao();
            return new Response(JSON.stringify({ ok: true, expiradas, ...resultado }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          const { sincronizarContagem } = await import("@/lib/erp/contagem.server");
          const resultado = await sincronizarContagem();
          return new Response(JSON.stringify({ ok: true, expiradas, ...resultado }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : "Falha na sincronização.";
          return new Response(JSON.stringify({ ok: false, tarefa, expiradas, erro: mensagem }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

      },
    },
  },
});
