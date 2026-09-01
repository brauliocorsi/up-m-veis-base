import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Factory, Hammer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { criarOp, listarNecessidadesProducao } from "@/lib/erp/producao";
import type { NecessidadeProducao } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/necessidades-producao")({
  head: () => ({
    meta: [
      { title: "Necessidades de produção — UP Vendas" },
      {
        name: "description",
        content:
          "O que a fábrica da UP Móveis tem de fazer, por data necessária, com a venda e o cliente à vista.",
      },
      { property: "og:title", content: "Necessidades de produção — UP Vendas" },
      {
        property: "og:description",
        content: "Agrupe várias vendas do mesmo modelo numa só ordem de produção.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

interface Grupo {
  produtoId: string;
  produtoNome: string;
  itens: NecessidadeProducao[];
}

function dataCurta(valor: string | null) {
  return valor ? new Date(valor).toLocaleDateString("pt-PT") : "sem data";
}

function Pagina() {
  const { gerirProducao } = usePermissoes();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [escolhidas, setEscolhidas] = useState<Record<string, boolean>>({});

  const { data, isPending } = useQuery({
    queryKey: ["necessidades-producao"],
    queryFn: listarNecessidadesProducao,
  });

  const gerar = useMutation({
    mutationFn: (grupo: Grupo) =>
      criarOp({
        produto_id: grupo.produtoId,
        necessidades: grupo.itens.filter((n) => escolhidas[n.id]).map((n) => n.id),
      }),
    onSuccess: async (opId) => {
      setEscolhidas({});
      await queryClient.invalidateQueries({ queryKey: ["necessidades-producao"] });
      toast.success("Ordem de produção criada com todas as unidades escolhidas.");
      navigate({ to: "/ordens-producao/$opId", params: { opId } });
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const linhas = data ?? [];

  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>();
    for (const n of linhas) {
      if (!mapa.has(n.produto_id)) {
        mapa.set(n.produto_id, {
          produtoId: n.produto_id,
          produtoNome: n.produto_nome,
          itens: [],
        });
      }
      mapa.get(n.produto_id)!.itens.push(n);
    }
    return Array.from(mapa.values());
  }, [linhas]);

  return (
    <div>
      <CabecalhoPagina
        titulo="Necessidades de produção"
        descricao="O que a fábrica tem de fazer. Várias vendas do mesmo modelo agrupam-se numa só ordem de produção."
      />

      {isPending && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isPending && linhas.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          A fábrica não tem nada à espera.
        </div>
      )}

      <div className="space-y-4">
        {grupos.map((grupo) => {
          const abertas = grupo.itens.filter((n) => n.estado === "aberta");
          const selecionadas = abertas.filter((n) => escolhidas[n.id]);
          const todas = abertas.length > 0 && selecionadas.length === abertas.length;
          const unidades = selecionadas.reduce((soma, n) => soma + n.quantidade, 0);

          return (
            <section key={grupo.produtoId} className="rounded-lg border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Hammer className="h-4 w-4 text-primary" />
                  <h2 className="font-medium">{grupo.produtoNome}</h2>
                  <Badge variant="secondary">{grupo.itens.length}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {gerirProducao && abertas.length > 0 && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        aria-label={`Selecionar tudo de ${grupo.produtoNome}`}
                        checked={todas}
                        onCheckedChange={(v) =>
                          setEscolhidas((atual) => {
                            const novo = { ...atual };
                            for (const n of abertas) novo[n.id] = Boolean(v);
                            return novo;
                          })
                        }
                      />
                      Selecionar tudo
                    </label>
                  )}
                  {gerirProducao && abertas.length > 0 && (
                    <Button
                      size="sm"
                      disabled={selecionadas.length === 0 || gerar.isPending}
                      onClick={() => gerar.mutate(grupo)}
                    >
                      <Factory className="mr-2 h-4 w-4" />
                      Criar ordem de produção
                      {unidades > 0 ? ` (${unidades} un.)` : ""}
                    </Button>
                  )}
                </div>
              </header>

              <ul className="divide-y">
                {grupo.itens.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                    {gerirProducao && n.estado === "aberta" && (
                      <Checkbox
                        className="mt-1"
                        aria-label={`Escolher necessidade de ${n.produto_nome}`}
                        checked={Boolean(escolhidas[n.id])}
                        onCheckedChange={(v) =>
                          setEscolhidas((atual) => ({ ...atual, [n.id]: Boolean(v) }))
                        }
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {n.quantidade} un. · precisa até {dataCurta(n.data_necessaria)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {n.estado === "convertida" ? "já em ordem" : "por converter"}
                        {n.pedido_numero && (
                          <>
                            {" · "}
                            <Link
                              to="/pedidos/$pedidoId"
                              params={{ pedidoId: n.pedido_id ?? "" }}
                              className="underline"
                            >
                              {n.pedido_numero}
                            </Link>
                            {n.cliente_nome ? ` · ${n.cliente_nome}` : ""}
                          </>
                        )}
                        {n.op_numero && (
                          <>
                            {" · "}
                            <Link
                              to="/ordens-producao/$opId"
                              params={{ opId: n.op_id ?? "" }}
                              className="underline"
                            >
                              {n.op_numero}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
