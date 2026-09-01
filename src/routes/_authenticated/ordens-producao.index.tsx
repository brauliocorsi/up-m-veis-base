import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Factory } from "lucide-react";
import { useState } from "react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listarOps } from "@/lib/erp/producao";
import { ETIQUETA_ESTADO_OP, type EstadoOp } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/ordens-producao/")({
  head: () => ({
    meta: [
      { title: "Ordens de produção — UP Vendas" },
      {
        name: "description",
        content:
          "Todas as ordens de fabrico da UP Móveis: estado, etapa atual, prioridade e atraso face à data prevista.",
      },
      { property: "og:title", content: "Ordens de produção — UP Vendas" },
      {
        property: "og:description",
        content: "Acompanhe camas, sofás e cortinas em fabrico, etapa a etapa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const FILTROS: Array<{ chave: string; etiqueta: string; estados: EstadoOp[] }> = [
  { chave: "abertas", etiqueta: "Em aberto", estados: ["planeada", "em_curso"] },
  { chave: "concluidas", etiqueta: "Concluídas", estados: ["concluida"] },
  { chave: "canceladas", etiqueta: "Canceladas", estados: ["cancelada"] },
];

function Pagina() {
  const [filtro, setFiltro] = useState(FILTROS[0]!);

  const { data, isPending } = useQuery({
    queryKey: ["ordens-producao", filtro.chave],
    queryFn: () => listarOps(filtro.estados),
  });

  const ops = data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Ordens de produção"
        descricao="Cada ordem segue as etapas do fabrico pela ordem certa. A prioridade 1 é a mais urgente."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.chave}
            size="sm"
            variant={f.chave === filtro.chave ? "default" : "outline"}
            onClick={() => setFiltro(f)}
          >
            {f.etiqueta}
          </Button>
        ))}
      </div>

      {isPending && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {ops.map((op) => (
          <Card key={op.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Factory className="h-4 w-4 text-primary" />
                  <Link
                    to="/ordens-producao/$opId"
                    params={{ opId: op.id }}
                    className="underline-offset-2 hover:underline"
                  >
                    {op.numero}
                  </Link>
                  <span className="truncate">{op.produto_nome}</span>
                  <Badge variant="secondary">{ETIQUETA_ESTADO_OP[op.estado]}</Badge>
                  {op.dias_atraso > 0 && (
                    <Badge variant="destructive">
                      {op.dias_atraso} dia{op.dias_atraso === 1 ? "" : "s"} de atraso
                    </Badge>
                  )}
                  {op.consumos_em_falta > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> material em falta
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {op.quantidade_produzida} de {op.quantidade} un. ·{" "}
                  {op.etapa_atual_nome ?? "sem etapa"} · prioridade {op.prioridade}
                  {op.data_prevista
                    ? ` · prevista para ${new Date(op.data_prevista).toLocaleDateString("pt-PT")}`
                    : ""}
                  {op.quantidade_refugo > 0 ? ` · ${op.quantidade_refugo} de refugo` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/ordens-producao/$opId" params={{ opId: op.id }}>
                  Abrir
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {!isPending && ops.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Factory className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Nenhuma ordem de produção aqui</p>
              <p className="text-sm text-muted-foreground">
                As ordens nascem das necessidades de produção das vendas.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
