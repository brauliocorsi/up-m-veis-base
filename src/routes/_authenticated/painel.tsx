import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { BadgeEuro, CalendarDays, Truck, Users } from "lucide-react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useSessao } from "@/hooks/use-sessao";
import { erp } from "@/lib/erp/db";
import { ETIQUETA_PERFIL } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — UP Vendas" },
      {
        name: "description",
        content: "Resumo diário da UP Móveis: acesso rápido às configurações e ao histórico.",
      },
      { property: "og:title", content: "Painel — UP Vendas" },
      { property: "og:description", content: "Resumo diário da gestão interna da UP Móveis." },
    ],
  }),
  component: Painel,
});

async function contar(vista: string) {
  const { count, error } = await erp()
    .from(vista)
    .select("id", { count: "exact", head: true })
    .is("eliminado_em", null);
  if (error) throw error;
  return count ?? 0;
}

function Painel() {
  const { data: sessao } = useSessao();
  const utilizador = sessao?.utilizador;
  const eAdm = utilizador?.perfil === "adm";
  // O entregador trabalha só na sua rota do dia.
  const eEntregador = utilizador?.perfil === "entregador";

  const { data: totais } = useQuery({
    queryKey: ["painel-totais", eAdm],
    enabled: Boolean(utilizador) && !eEntregador,
    queryFn: async () => ({
      utilizadores: eAdm ? await contar("v_utilizadores") : 0,
      formas: await contar("v_formas_pagamento"),
      zonas: await contar("v_zonas_entrega"),
      dias: await contar("v_calendario"),
    }),
  });

  const hoje = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const cartoes = [
    { etiqueta: "Utilizadores", valor: totais?.utilizadores, icone: Users, para: "/utilizadores" },
    {
      etiqueta: "Formas de pagamento",
      valor: totais?.formas,
      icone: BadgeEuro,
      para: "/formas-pagamento",
    },
    { etiqueta: "Zonas de entrega", valor: totais?.zonas, icone: Truck, para: "/zonas-entrega" },
    { etiqueta: "Dias marcados", valor: totais?.dias, icone: CalendarDays, para: "/calendario" },
  ].filter((c) => eAdm || c.etiqueta !== "Utilizadores");

  if (eEntregador) return <Navigate to="/rota" replace />;

  return (

    <div>
      <CabecalhoPagina
        titulo={`Bom trabalho, ${utilizador?.nome?.split(" ")[0] ?? ""}`}
        descricao={`${hoje.charAt(0).toUpperCase() + hoje.slice(1)} · Perfil: ${utilizador ? ETIQUETA_PERFIL[utilizador.perfil] : ""}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((cartao) =>
          eAdm ? (
            <Link key={cartao.etiqueta} to={cartao.para}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CartaoConteudo cartao={cartao} />
              </Card>
            </Link>
          ) : (
            <Card key={cartao.etiqueta} className="h-full">
              <CartaoConteudo cartao={cartao} />
            </Card>
          ),
        )}
      </div>

      <div className="mt-6 rounded-lg border bg-card p-5">
        <h2 className="text-base font-semibold">Fase 1 concluída</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A fundação do UP Vendas está pronta: contas de acesso, formas de pagamento, zonas de
          entrega, calendário, motivos e definições da empresa. Tudo o que apagar fica na lixeira e
          todas as alterações ficam registadas no histórico.
        </p>
      </div>
    </div>
  );
}

function CartaoConteudo({
  cartao,
}: {
  cartao: { etiqueta: string; valor?: number; icone: typeof Users };
}) {
  const Icone = cartao.icone;
  return (
    <CardContent className="flex flex-col gap-2 p-4">
      <Icone className="h-5 w-5 text-primary" />
      <p className="text-2xl font-semibold leading-none">{cartao.valor ?? "—"}</p>
      <p className="text-xs text-muted-foreground">{cartao.etiqueta}</p>
    </CardContent>
  );
}
