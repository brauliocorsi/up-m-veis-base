import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ScanSearch, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconciliarAgora } from "@/lib/erp/contagem.functions";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { resolverDivergencia } from "@/lib/erp/stock";
import { formatarData, type Divergencia, type Reconciliacao } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/reconciliacao")({
  head: () => ({
    meta: [
      { title: "Reconciliação de stock — UP Vendas" },
      {
        name: "description",
        content:
          "Comparação diária entre o stock do ERP e o do armazém, com divergências para decidir na UP Móveis.",
      },
      { property: "og:title", content: "Reconciliação de stock — UP Vendas" },
      { property: "og:description", content: "Divergências entre o ERP e o Contagem." },
    ],
  }),
  component: PaginaReconciliacao,
});

const ESTADO_RECONCILIACAO: Record<string, string> = {
  limpa: "Sem divergências",
  com_divergencias: "Com divergências",
  resolvida: "Resolvida",
};

function PaginaReconciliacao() {
  const queryClient = useQueryClient();
  const fnReconciliar = useServerFn(reconciliarAgora);
  const [aResolver, setAResolver] = useState<{ linha: Divergencia; acao: "regularizar" | "ignorar" } | null>(
    null,
  );
  const [nota, setNota] = useState("");

  const { data: corridas } = useQuery({
    queryKey: ["reconciliacoes"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("reconciliacoes")
        .select("*")
        .is("eliminado_em", null)
        .order("executada_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Reconciliacao[];
    },
  });

  const { data: divergencias } = useQuery({
    queryKey: ["divergencias"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("reconciliacao_divergencias")
        .select("*, produtos:produto_id(nome_cliente, cod_barras)")
        .eq("estado", "aberta")
        .is("eliminado_em", null)
        .order("criado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<
        Divergencia & { produtos?: { nome_cliente: string; cod_barras: string } | null }
      >;
    },
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["reconciliacoes"] });
    queryClient.invalidateQueries({ queryKey: ["divergencias"] });
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    queryClient.invalidateQueries({ queryKey: ["movimentos"] });
  };

  const mCorrer = useMutation({
    mutationFn: () => fnReconciliar({}),
    onSuccess: (r) => {
      toast.success(`Reconciliação concluída sobre ${r.produtos} produto(s).`);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mResolver = useMutation({
    mutationFn: async () => {
      if (!aResolver) return;
      if (nota.trim().length < 5) throw new Error("Escreva uma nota com pelo menos 5 caracteres.");
      await resolverDivergencia({
        divergencia_id: aResolver.linha.id,
        acao: aResolver.acao,
        nota: nota.trim(),
      });
    },
    onSuccess: () => {
      toast.success(
        aResolver?.acao === "regularizar"
          ? "Divergência regularizada com um movimento de correção."
          : "Divergência ignorada, com nota registada.",
      );
      setAResolver(null);
      setNota("");
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  return (
    <div>
      <CabecalhoPagina
        titulo="Reconciliação"
        descricao="Compara o stock do ERP com o do armazém. Nada é corrigido automaticamente: a decisão é sua."
        acao={
          <Button type="button" onClick={() => mCorrer.mutate()} disabled={mCorrer.isPending}>
            <ScanSearch className="mr-2 h-4 w-4" />
            {mCorrer.isPending ? "A comparar…" : "Comparar agora"}
          </Button>
        }
      />

      <section>
        <h2 className="mb-3 text-base font-semibold">Divergências abertas</h2>
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">Produto</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">ERP</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Armazém</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Diferença</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Decisão</th>
              </tr>
            </thead>
            <tbody>
              {(divergencias ?? []).length === 0 && (
                <tr className="border-t">
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Sem divergências abertas. O ERP e o armazém dizem o mesmo.
                  </td>
                </tr>
              )}
              {(divergencias ?? []).map((linha) => (
                <tr key={linha.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      to="/stock/$produtoId"
                      params={{ produtoId: linha.produto_id }}
                      className="font-medium hover:underline"
                    >
                      {linha.produtos?.nome_cliente ?? "Produto"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {linha.produtos?.cod_barras ?? linha.produto_id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{linha.fisico_erp}</td>
                  <td className="px-3 py-2 text-right">{linha.fisico_contagem}</td>
                  <td className="px-3 py-2 text-right">
                    <Badge variant={linha.diferenca === 0 ? "secondary" : "outline"}>
                      {linha.diferenca > 0 ? `+${linha.diferenca}` : linha.diferenca}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAResolver({ linha, acao: "regularizar" });
                          setNota("");
                        }}
                      >
                        <Check className="mr-1 h-4 w-4" /> Regularizar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAResolver({ linha, acao: "ignorar" });
                          setNota("");
                        }}
                      >
                        <X className="mr-1 h-4 w-4" /> Ignorar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Comparações anteriores</h2>
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">Quando</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Produtos</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Divergências
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(corridas ?? []).length === 0 && (
                <tr className="border-t">
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Ainda não houve comparações.
                  </td>
                </tr>
              )}
              {(corridas ?? []).map((linha) => (
                <tr key={linha.id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatarData(linha.executada_em)}
                  </td>
                  <td className="px-3 py-2 text-right">{linha.total_produtos}</td>
                  <td className="px-3 py-2 text-right">{linha.divergencias}</td>
                  <td className="px-3 py-2">
                    <Badge variant={linha.estado === "com_divergencias" ? "outline" : "secondary"}>
                      {ESTADO_RECONCILIACAO[linha.estado] ?? linha.estado}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DialogoForm
        aberto={Boolean(aResolver)}
        onFechar={() => setAResolver(null)}
        titulo={aResolver?.acao === "regularizar" ? "Regularizar divergência" : "Ignorar divergência"}
        descricao={
          aResolver?.acao === "regularizar"
            ? "Cria um movimento de correção para o ERP passar a dizer o mesmo que o armazém."
            : "Mantém os números do ERP e guarda a explicação no histórico."
        }
        aGuardar={mResolver.isPending}
        onGuardar={() => mResolver.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="nota-divergencia">Nota</Label>
          <Input
            id="nota-divergencia"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ex.: contagem física confirmada no armazém"
          />
        </div>
      </DialogoForm>
    </div>
  );
}
