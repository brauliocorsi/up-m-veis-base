import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, PackageCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoAgendar } from "@/components/erp/dialogo-agendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePermissoes } from "@/hooks/use-permissoes";
import { lerPedidosPorAgendar } from "@/lib/erp/rotas";
import { ETIQUETA_PEDIDO, formatarDinheiro } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/por-agendar")({
  head: () => ({
    meta: [
      { title: "Vendas por agendar — UP Vendas" },
      {
        name: "description",
        content:
          "Vendas da UP Móveis prontas a entregar e ainda sem rota, com o volume e o tempo de montagem de cada uma.",
      },
      { property: "og:title", content: "Vendas por agendar — UP Vendas" },
      {
        property: "og:description",
        content: "Encaixar as vendas prontas nas rotas das próximas semanas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const perms = usePermissoes();
  const [procura, setProcura] = useState("");
  const [aAgendar, setAAgendar] = useState<{ id: string; numero: string } | null>(null);

  const pedidosQ = useQuery({
    queryKey: ["pedidos-por-agendar"],
    queryFn: () => lerPedidosPorAgendar(),
  });

  const lista = useMemo(() => {
    const termo = procura.trim().toLowerCase();
    const linhas = pedidosQ.data ?? [];
    if (!termo) return linhas;
    return linhas.filter(
      (p) =>
        p.numero.toLowerCase().includes(termo) ||
        (p.cliente ?? "").toLowerCase().includes(termo) ||
        (p.localidade_entrega ?? "").toLowerCase().includes(termo) ||
        (p.cp4_entrega ?? "").includes(termo),
    );
  }, [pedidosQ.data, procura]);

  return (
    <div>
      <CabecalhoPagina
        titulo="Vendas por agendar"
        descricao="Vendas já pagas ou prontas que ainda não têm rota atribuída."
      />

      <Input
        value={procura}
        onChange={(e) => setProcura(e.target.value)}
        placeholder="Procurar por número, cliente, localidade ou código postal"
        className="mb-4"
      />

      <div className="space-y-3">
        {lista.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {p.numero} · {p.cliente ?? "Cliente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.localidade_entrega ?? "sem morada"}
                  {p.cp4_entrega ? ` · ${p.cp4_entrega}-${p.cp3_entrega ?? "000"}` : ""} · prevista{" "}
                  {p.data_entrega_prevista ?? "—"} · há {p.dias_pronto} dia(s)
                </p>
                <p className="text-xs text-muted-foreground">
                  {Number(p.cubicagem_m3).toFixed(2)} m³ · {p.montagem_min} min de montagem · a
                  receber {formatarDinheiro(p.pendente ?? 0)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{ETIQUETA_PEDIDO[p.estado]}</Badge>
                {!p.entrega_domicilio && <Badge variant="secondary">Levantamento</Badge>}
                <Button asChild variant="outline" size="sm">
                  <Link to="/pedidos/$pedidoId" params={{ pedidoId: p.id }}>
                    Ver venda
                  </Link>
                </Button>
                {perms.montarRotas && (
                  <Button
                    size="sm"
                    onClick={() => setAAgendar({ id: p.id, numero: p.numero })}
                  >
                    <CalendarCheck className="mr-1 h-4 w-4" /> Agendar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!pedidosQ.isLoading && lista.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <PackageCheck className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Nada por agendar</p>
              <p className="text-sm text-muted-foreground">
                Todas as vendas prontas já têm rota marcada.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {aAgendar && (
        <DialogoAgendar
          pedidoId={aAgendar.id}
          numero={aAgendar.numero}
          onFechar={() => setAAgendar(null)}
        />
      )}
    </div>
  );
}
