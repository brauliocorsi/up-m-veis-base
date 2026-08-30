import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PackagePlus, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissoes } from "@/hooks/use-permissoes";
import { criarOc, listarNecessidadesAbertas } from "@/lib/erp/compras";
import { primeiraMensagem } from "@/lib/erp/erros";
import { ETIQUETA_ORIGEM_NECESSIDADE, type Necessidade } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/necessidades")({
  head: () => ({
    meta: [
      { title: "Necessidades de compra — UP Vendas" },
      {
        name: "description",
        content:
          "Tudo o que a UP Móveis precisa de encomendar, agrupado por fornecedor, com a venda e o cliente à vista.",
      },
      { property: "og:title", content: "Necessidades de compra — UP Vendas" },
      {
        property: "og:description",
        content: "Converta necessidades em ordens de compra num clique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaNecessidades,
});

function PaginaNecessidades() {
  const { comprar } = usePermissoes();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [escolhidas, setEscolhidas] = useState<Record<string, boolean>>({});

  const { data, isPending } = useQuery({
    queryKey: ["necessidades-abertas"],
    queryFn: listarNecessidadesAbertas,
  });

  const gerar = useMutation({
    mutationFn: ({ fornecedorId, ids }: { fornecedorId: string; ids: string[] }) =>
      criarOc(fornecedorId, ids),
    onSuccess: async (ocId) => {
      setEscolhidas({});
      await queryClient.invalidateQueries({ queryKey: ["necessidades-abertas"] });
      toast.success("Ordem de compra criada em rascunho.");
      navigate({ to: "/ordens-compra/$ocId", params: { ocId } });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const linhas = data ?? [];
  const grupos = new Map<string, { nome: string; itens: Necessidade[] }>();
  for (const n of linhas) {
    const chave = n.fornecedor_id ?? "sem-fornecedor";
    if (!grupos.has(chave)) {
      grupos.set(chave, { nome: n.fornecedor_nome ?? "Sem fornecedor atribuído", itens: [] });
    }
    grupos.get(chave)!.itens.push(n);
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Necessidades de compra"
        descricao="O que falta encomendar. Cada fornecedor gera a sua própria ordem de compra."
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
          Não há nada à espera de encomenda.
        </div>
      )}

      <div className="space-y-4">
        {Array.from(grupos.entries()).map(([chave, grupo]) => {
          const ids = grupo.itens.filter((n) => escolhidas[n.id]).map((n) => n.id);
          const semFornecedor = chave === "sem-fornecedor";
          return (
            <section key={chave} className="rounded-lg border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <h2 className="font-medium">{grupo.nome}</h2>
                  <Badge variant="secondary">{grupo.itens.length}</Badge>
                </div>
                {comprar && !semFornecedor && (
                  <Button
                    size="sm"
                    disabled={ids.length === 0 || gerar.isPending}
                    onClick={() => gerar.mutate({ fornecedorId: chave, ids })}
                  >
                    <PackagePlus className="mr-2 h-4 w-4" />
                    Gerar ordem de compra
                  </Button>
                )}
                {semFornecedor && (
                  <span className="text-xs text-muted-foreground">
                    Atribua um fornecedor ao produto para poder encomendar.
                  </span>
                )}
              </header>

              <ul className="divide-y">
                {grupo.itens.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                    {comprar && !semFornecedor && (
                      <Checkbox
                        className="mt-1"
                        aria-label={`Escolher ${n.produto_nome}`}
                        checked={Boolean(escolhidas[n.id])}
                        onCheckedChange={(v) =>
                          setEscolhidas((atual) => ({ ...atual, [n.id]: Boolean(v) }))
                        }
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.produto_nome}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {n.quantidade} un. ·{" "}
                        {ETIQUETA_ORIGEM_NECESSIDADE[n.origem] ?? n.origem}
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
