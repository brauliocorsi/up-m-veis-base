import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useState } from "react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { lerEntreguePorReceber } from "@/lib/erp/entregas";
import { descarregarCsv } from "@/lib/erp/financeiro";
import { formatarDataCurta, formatarDinheiro } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/entregue-por-receber")({
  head: () => ({
    meta: [
      { title: "Entregue por receber — UP Vendas" },
      {
        name: "description",
        content:
          "Vendas da UP Móveis já entregues ao cliente com dinheiro em falta, ordenadas pelas mais antigas.",
      },
      { property: "og:title", content: "Entregue por receber — UP Vendas" },
      {
        property: "og:description",
        content: "Móveis já entregues que ainda não estão pagos, com dias desde a entrega.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaEntreguePorReceber,
});

function PaginaEntreguePorReceber() {
  const [minimoDias, setMinimoDias] = useState("0");
  const { data, isLoading } = useQuery({
    queryKey: ["entregue-por-receber"],
    queryFn: lerEntreguePorReceber,
  });

  const linhas = (data ?? []).filter((l) => (l.dias_desde_entrega ?? 0) >= Number(minimoDias || 0));
  const total = linhas.reduce((s, l) => s + Number(l.falta_pagar), 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Entregue por receber"
        descricao="Móveis já em casa do cliente com dinheiro em falta. Comece pelos mais antigos."
        acao={
          <Button
            variant="outline"
            onClick={() =>
              descarregarCsv(
                "entregue-por-receber",
                [
                  { chave: "numero", etiqueta: "Venda" },
                  { chave: "cliente_nome", etiqueta: "Cliente" },
                  { chave: "cliente_telefone", etiqueta: "Telefone" },
                  { chave: "vendedor_nome", etiqueta: "Vendedora" },
                  { chave: "data_entrega_efetiva", etiqueta: "Entrega" },
                  { chave: "dias_desde_entrega", etiqueta: "Dias" },
                  { chave: "total", etiqueta: "Total" },
                  { chave: "total_pago", etiqueta: "Recebido" },
                  { chave: "falta_pagar", etiqueta: "Falta" },
                ],
                linhas as unknown as Array<Record<string, unknown>>,
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="space-y-1">
          <Label htmlFor="dias">Entregues há mais de (dias)</Label>
          <Input
            id="dias"
            className="w-28"
            type="number"
            min={0}
            value={minimoDias}
            onChange={(e) => setMinimoDias(e.target.value)}
          />
        </div>
        <p className="ml-auto text-sm text-muted-foreground">
          {linhas.length} {linhas.length === 1 ? "venda" : "vendas"} · em falta{" "}
          <span className="font-semibold text-destructive">{formatarDinheiro(total)}</span>
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Nada por receber. Tudo entregue está pago.
        </p>
      ) : (
        <div className="space-y-2">
          {linhas.map((l) => (
            <Link
              key={l.pedido_id}
              to="/pedidos/$pedidoId"
              params={{ pedidoId: l.pedido_id }}
              className="block rounded-lg border bg-card p-3 hover:bg-muted"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{l.numero}</span>
                <span className="text-sm">{l.cliente_nome}</span>
                {(l.dias_desde_entrega ?? 0) >= 15 && (
                  <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                    Há {l.dias_desde_entrega} dias
                  </Badge>
                )}
                <span className="ml-auto font-semibold text-destructive">
                  {formatarDinheiro(l.falta_pagar)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Entregue em {formatarDataCurta(l.data_entrega_efetiva)} ·{" "}
                {l.cliente_telefone ?? "sem telefone"} · vendedora {l.vendedor_nome ?? "—"} · total{" "}
                {formatarDinheiro(l.total)} · recebido {formatarDinheiro(l.total_pago)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
