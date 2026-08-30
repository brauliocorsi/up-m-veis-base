import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PackagePlus, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissoes } from "@/hooks/use-permissoes";
import { criarOcLinhas, listarNecessidadesAbertas } from "@/lib/erp/compras";
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

interface Grupo {
  chave: string;
  nome: string;
  itens: Necessidade[];
}

function PaginaNecessidades() {
  const { comprar } = usePermissoes();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [escolhidas, setEscolhidas] = useState<Record<string, boolean>>({});
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});

  const { data, isPending } = useQuery({
    queryKey: ["necessidades-abertas"],
    queryFn: listarNecessidadesAbertas,
  });

  const gerar = useMutation({
    mutationFn: ({
      fornecedorId,
      linhas,
    }: {
      fornecedorId: string;
      linhas: Array<{ necessidade_id: string; quantidade: number }>;
    }) => criarOcLinhas(fornecedorId, linhas),
    onSuccess: async (ocId) => {
      setEscolhidas({});
      setQuantidades({});
      await queryClient.invalidateQueries({ queryKey: ["necessidades-abertas"] });
      toast.success("Ordem de compra criada em rascunho com todas as linhas escolhidas.");
      navigate({ to: "/ordens-compra/$ocId", params: { ocId } });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const linhas = data ?? [];

  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>();
    for (const n of linhas) {
      const chave = n.fornecedor_id ?? "sem-fornecedor";
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          nome: n.fornecedor_nome ?? "Sem fornecedor atribuído",
          itens: [],
        });
      }
      mapa.get(chave)!.itens.push(n);
    }
    return Array.from(mapa.values());
  }, [linhas]);

  function quantidadeDe(n: Necessidade) {
    return quantidades[n.id] ?? Math.max(n.falta, 1);
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Necessidades de compra"
        descricao="O que falta encomendar. Cada fornecedor gera a sua própria ordem de compra, com todas as linhas de uma vez."
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
        {grupos.map((grupo) => {
          const semFornecedor = grupo.chave === "sem-fornecedor";
          const encomendaveis = grupo.itens.filter((n) => n.estado === "aberta");
          const selecionadas = encomendaveis.filter((n) => escolhidas[n.id]);
          const todasEscolhidas =
            encomendaveis.length > 0 && selecionadas.length === encomendaveis.length;
          const podeGerar = comprar && !semFornecedor && encomendaveis.length > 0;

          return (
            <section key={grupo.chave} className="rounded-lg border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <h2 className="font-medium">{grupo.nome}</h2>
                  <Badge variant="secondary">{grupo.itens.length}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {podeGerar && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        aria-label={`Selecionar tudo de ${grupo.nome}`}
                        checked={todasEscolhidas}
                        onCheckedChange={(v) =>
                          setEscolhidas((atual) => {
                            const novo = { ...atual };
                            for (const n of encomendaveis) novo[n.id] = Boolean(v);
                            return novo;
                          })
                        }
                      />
                      Selecionar tudo
                    </label>
                  )}
                  {podeGerar && (
                    <Button
                      size="sm"
                      disabled={selecionadas.length === 0 || gerar.isPending}
                      onClick={() =>
                        gerar.mutate({
                          fornecedorId: grupo.chave,
                          linhas: selecionadas.map((n) => ({
                            necessidade_id: n.id,
                            quantidade: quantidadeDe(n),
                          })),
                        })
                      }
                    >
                      <PackagePlus className="mr-2 h-4 w-4" />
                      Gerar ordem de compra
                      {selecionadas.length > 0 ? ` (${selecionadas.length})` : ""}
                    </Button>
                  )}
                  {semFornecedor && (
                    <span className="text-xs text-muted-foreground">
                      Atribua um fornecedor ao produto para poder encomendar.
                    </span>
                  )}
                </div>
              </header>

              <ul className="divide-y">
                {grupo.itens.map((n) => {
                  const aberta = n.estado === "aberta";
                  return (
                    <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                      {comprar && !semFornecedor && aberta && (
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
                          Pedido {n.quantidade} · recebido {n.recebido} ·{" "}
                          <span className={n.falta > 0 ? "font-medium text-primary" : ""}>
                            faltam {n.falta}
                          </span>
                          {" · "}
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
                          {n.oc_numero && (
                            <>
                              {" · encomendada em "}
                              <Link
                                to="/ordens-compra/$ocId"
                                params={{ ocId: n.oc_id ?? "" }}
                                className="underline"
                              >
                                {n.oc_numero}
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                      {comprar && !semFornecedor && aberta && (
                        <div className="w-24 shrink-0">
                          <Input
                            type="number"
                            min={n.falta}
                            inputMode="numeric"
                            aria-label={`Quantidade a comprar de ${n.produto_nome}`}
                            value={quantidadeDe(n)}
                            onChange={(e) =>
                              setQuantidades((atual) => ({
                                ...atual,
                                [n.id]: Math.max(n.falta, Number(e.target.value) || n.falta),
                              }))
                            }
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
