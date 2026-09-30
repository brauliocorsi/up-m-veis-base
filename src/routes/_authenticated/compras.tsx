import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { criarOcLinhas, lerOcsPorEstados, listarNecessidadesAbertas } from "@/lib/erp/compras";
import { primeiraMensagem } from "@/lib/erp/erros";
import { formatarData, formatarDinheiro, type Necessidade, type OrdemCompra } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({
    meta: [
      { title: "Compras — UP Vendas" },
      { name: "description", content: "Por encomendar, encomendado, a receber e histórico de compras." },
      { property: "og:title", content: "Compras — UP Vendas" },
      { property: "og:description", content: "Fluxo simples de compras por fornecedor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Compras,
});

const ESTADO_OC: Record<string, string> = {
  rascunho: "Rascunho",
  pronta_enviar: "Pronta a enviar",
  enviada: "Enviada",
  confirmada: "Confirmada",
  recebida_parcial: "Recebida em parte",
  recebida: "Recebida",
  cancelada: "Cancelada",
};

function Compras() {
  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Compras"
        descricao="Do que falta encomendar até ao que já chegou. Cada linha continua ligada à sua venda."
      />
      <Tabs defaultValue="por-encomendar">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="por-encomendar">Por encomendar</TabsTrigger>
          <TabsTrigger value="encomendado">Encomendado</TabsTrigger>
          <TabsTrigger value="receber">Receber</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="por-encomendar">
          <PorEncomendar />
        </TabsContent>
        <TabsContent value="encomendado">
          <ListaOcs
            chave="encomendado"
            estados={["rascunho", "pronta_enviar", "enviada", "confirmada"]}
            vazio="Nada encomendado de momento."
          />
        </TabsContent>
        <TabsContent value="receber">
          <ListaOcs
            chave="receber"
            estados={["enviada", "confirmada", "recebida_parcial"]}
            vazio="Não há mercadoria à espera de receção."
            receber
          />
        </TabsContent>
        <TabsContent value="historico">
          <ListaOcs
            chave="historico"
            estados={["recebida", "cancelada"]}
            vazio="Ainda não há ordens fechadas."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PorEncomendar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const { data, isPending } = useQuery({
    queryKey: ["necessidades-abertas"],
    queryFn: listarNecessidadesAbertas,
  });

  // fornecedor → produto → linhas (uma por venda/linha; nunca se fundem as alocações)
  const grupos = useMemo(() => {
    const porForn = new Map<string, { nome: string; produtos: Map<string, Necessidade[]> }>();
    for (const n of (data ?? []).filter((x) => x.estado === "aberta" && !x.oc_id)) {
      const f = n.fornecedor_id ?? "sem";
      if (!porForn.has(f)) {
        porForn.set(f, { nome: n.fornecedor_nome ?? "Sem fornecedor", produtos: new Map() });
      }
      const g = porForn.get(f)!;
      const lista = g.produtos.get(n.produto_id) ?? [];
      lista.push(n);
      g.produtos.set(n.produto_id, lista);
    }
    return [...porForn.entries()];
  }, [data]);

  const criar = useMutation({
    mutationFn: async (fornecedorId: string) => {
      const linhas = (data ?? [])
        .filter((n) => marcadas.has(n.id) && n.fornecedor_id === fornecedorId)
        .map((n) => ({ necessidade_id: n.id, quantidade: Number(n.falta) }));
      if (linhas.length === 0) throw new Error("Selecione pelo menos uma linha deste fornecedor.");
      return criarOcLinhas(fornecedorId, linhas);
    },
    onSuccess: async (ocId) => {
      setMarcadas(new Set());
      await queryClient.invalidateQueries({ queryKey: ["necessidades-abertas"] });
      toast.success("Rascunho criado. Nada foi enviado ao fornecedor.");
      void navigate({ to: "/ordens-compra/$ocId", params: { ocId } });
    },
    onError: (e) => toast.error(primeiraMensagem(e)),
  });

  const alternar = (ids: string[], ligar: boolean) =>
    setMarcadas((s) => {
      const n = new Set(s);
      ids.forEach((id) => (ligar ? n.add(id) : n.delete(id)));
      return n;
    });

  if (isPending) return <Skeleton className="h-56 w-full" />;
  if (grupos.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nada por encomendar.</p>;
  }
  return (
    <div className="space-y-4">
      {grupos.map(([fornId, g]) => {
        const ids = [...g.produtos.values()].flat().map((n) => n.id);
        const nMarc = ids.filter((id) => marcadas.has(id)).length;
        return (
          <Card key={fornId}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{g.nome}</CardTitle>
              <Button
                size="sm"
                disabled={fornId === "sem" || nMarc === 0 || criar.isPending}
                onClick={() => criar.mutate(fornId)}
              >
                <FilePlus2 className="mr-1 h-4 w-4" /> Criar rascunho ({nMarc})
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...g.produtos.entries()].map(([prodId, linhas]) => {
                const total = linhas.reduce((t, l) => t + Number(l.falta), 0);
                const idsP = linhas.map((l) => l.id);
                const todas = idsP.every((id) => marcadas.has(id));
                return (
                  <div key={prodId} className="rounded-md border">
                    <label className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                      <Checkbox checked={todas} onCheckedChange={(v) => alternar(idsP, v === true)} />
                      <span className="flex-1">{linhas[0]?.produto_nome}</span>
                      <Badge variant="secondary">{total} un.</Badge>
                    </label>
                    <ul className="divide-y">
                      {linhas.map((l) => (
                        <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <Checkbox
                            checked={marcadas.has(l.id)}
                            onCheckedChange={(v) => alternar([l.id], v === true)}
                          />
                          <span className="flex-1">
                            {l.pedido_id ? (
                              <Link
                                to="/pedidos/$pedidoId"
                                params={{ pedidoId: l.pedido_id }}
                                className="font-medium text-primary underline-offset-2 hover:underline"
                              >
                                {l.pedido_numero}
                              </Link>
                            ) : (
                              "Reposição"
                            )}
                            {l.cliente_nome ? ` · ${l.cliente_nome}` : ""}
                          </span>
                          <span className="tabular-nums">{Number(l.falta)} un.</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                O rascunho mantém uma linha por venda, com a descrição e personalização de cada uma.
                O envio ao fornecedor é um passo à parte, na ordem de compra.
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ListaOcs({
  chave,
  estados,
  vazio,
  receber,
}: {
  chave: string;
  estados: string[];
  vazio: string;
  receber?: boolean;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["compras-ocs", chave],
    queryFn: () => lerOcsPorEstados(estados),
  });
  if (isPending) return <Skeleton className="h-40 w-full" />;
  const lista = (data ?? []) as Array<OrdemCompra & Record<string, unknown>>;
  if (lista.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{vazio}</p>;
  }
  return (
    <ul className="divide-y rounded-md border">
      {lista.map((oc) => (
        <li key={oc.id}>
          <Link
            to="/ordens-compra/$ocId"
            params={{ ocId: oc.id }}
            className="flex flex-wrap items-center gap-2 px-3 py-3 text-sm hover:bg-muted/40"
          >
            <span className="font-medium">{oc.numero}</span>
            <span className="text-muted-foreground">{String(oc["fornecedor_nome"] ?? "")}</span>
            <Badge variant="outline">{ESTADO_OC[oc.estado] ?? oc.estado}</Badge>
            {oc["diferida"] ? <Badge variant="secondary">Saldo de ordem anterior</Badge> : null}
            <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              {receber ? (
                <span>
                  {Number(oc["unidades_recebidas"] ?? 0)}/{Number(oc["unidades_pedidas"] ?? 0)} un.
                  recebidas
                </span>
              ) : null}
              <span>Prevista {formatarData(oc.data_prevista)}</span>
              <span className="tabular-nums">{formatarDinheiro(oc.total)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
