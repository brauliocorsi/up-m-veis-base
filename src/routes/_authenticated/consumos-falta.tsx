import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, PackageX } from "lucide-react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { lerConsumosEmFalta, regularizarConsumo } from "@/lib/erp/mrp";

export const Route = createFileRoute("/_authenticated/consumos-falta")({
  head: () => ({
    meta: [
      { title: "Material em falta — UP Vendas" },
      {
        name: "description",
        content:
          "Componentes que a fábrica da UP Móveis consumiu sem stock suficiente, com a sub-ordem ou a compra já criada.",
      },
      { property: "og:title", content: "Material em falta — UP Vendas" },
      {
        property: "og:description",
        content: "A falta de material nunca para a fábrica: fica registada e resolve-se depois.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { gerirProducao } = usePermissoes();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["consumos-falta"],
    queryFn: lerConsumosEmFalta,
  });

  const regularizar = useMutation({
    mutationFn: (id: string) => regularizarConsumo(id),
    onSuccess: () => {
      toast.success("Falta regularizada com o stock que já existe.");
      queryClient.invalidateQueries({ queryKey: ["consumos-falta"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const linhas = data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Material em falta"
        descricao="A etapa fechou mesmo sem material, como deve ser. Aqui vê-se o que ficou a dever e o que já foi mandado fabricar ou comprar."
      />

      {isPending && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isPending && linhas.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nada em falta</p>
            <p className="text-sm text-muted-foreground">
              Todas as ordens em curso têm o material que precisam.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {linhas.map((linha) => (
          <Card key={linha.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <PackageX className="h-4 w-4 text-destructive" />
                  <span className="truncate">{linha.componente_nome}</span>
                  <Badge variant="destructive">faltam {Number(linha.quantidade_falta)}</Badge>
                  {linha.tem_sub_op && <Badge variant="outline">em fabrico</Badge>}
                  {linha.tem_necessidade_compra && <Badge variant="outline">a comprar</Badge>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <Link
                    to="/ordens-producao/$opId"
                    params={{ opId: linha.op_id }}
                    className="underline"
                  >
                    {linha.op_numero}
                  </Link>
                  {linha.etapa_nome ? ` · ${linha.etapa_nome}` : ""} · previsto{" "}
                  {Number(linha.quantidade_prevista)} · consumido{" "}
                  {Number(linha.quantidade_consumida)} · há {Number(linha.stock_vendavel)} em stock
                </p>
              </div>
              {gerirProducao && Number(linha.stock_vendavel) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={regularizar.isPending}
                  onClick={() => regularizar.mutate(linha.id)}
                >
                  Consumir o que já chegou
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
