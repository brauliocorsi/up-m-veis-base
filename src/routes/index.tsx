import { createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "UP Vendas — ERP da UP Móveis" },
      {
        name: "description",
        content:
          "Plataforma interna de gestão da UP Móveis: utilizadores, configurações, auditoria e documentos.",
      },
      { property: "og:title", content: "UP Vendas — ERP da UP Móveis" },
      {
        property: "og:description",
        content: "Plataforma interna de gestão da UP Móveis, fábrica e loja de mobiliário.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/painel" : "/auth" });
  },
  component: () => null,
});
