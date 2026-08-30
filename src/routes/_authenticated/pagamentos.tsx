import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mensagemErro } from "@/lib/erp/db";
import {
  confirmarPagamento,
  lerPagamentosPendentes,
  rejeitarPagamento,
} from "@/lib/erp/pagamentos";
import {
  ETIQUETA_PAGAMENTO,
  formatarDataHora,
  formatarDinheiro,
  type Pagamento,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos a confirmar — UP Vendas" },
      {
        name: "description",
        content:
          "Fila de pagamentos da UP Móveis à espera de confirmação: transferências, financiadores e pagamentos na entrega.",
      },
      { property: "og:title", content: "Pagamentos a confirmar — UP Vendas" },
      { property: "og:description", content: "Pagamentos pendentes de confirmação na UP Móveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaPagamentos,
});

function PaginaPagamentos() {
  const queryClient = useQueryClient();
  const [aConfirmar, setAConfirmar] = useState<Pagamento | null>(null);
  const [comprovativo, setComprovativo] = useState("");
  const [aRejeitar, setARejeitar] = useState<Pagamento | null>(null);
  const [motivo, setMotivo] = useState("");

  const pendentes = useQuery({
    queryKey: ["pagamentos-pendentes"],
    queryFn: lerPagamentosPendentes,
  });

  function atualizar() {
    void queryClient.invalidateQueries({ queryKey: ["pagamentos-pendentes"] });
    void queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
    void queryClient.invalidateQueries({ queryKey: ["caixa"] });
  }

  const confirmar = useMutation({
    mutationFn: async () => {
      if (!aConfirmar) return;
      await confirmarPagamento(aConfirmar.id, comprovativo);
    },
    onSuccess: () => {
      toast.success("Pagamento confirmado.");
      setAConfirmar(null);
      setComprovativo("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const rejeitar = useMutation({
    mutationFn: async () => {
      if (!aRejeitar) return;
      if (!motivo.trim()) throw new Error("Escreva o motivo da rejeição.");
      await rejeitarPagamento(aRejeitar.id, motivo.trim());
    },
    onSuccess: () => {
      toast.success("Pagamento rejeitado.");
      setARejeitar(null);
      setMotivo("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const lista = pendentes.data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Pagamentos a confirmar"
        descricao="Transferências, financiadores e pagamentos na entrega esperam confirmação antes de entrarem nos totais."
      />

      {pendentes.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Não há pagamentos à espera de confirmação.</p>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{formatarDinheiro(p.valor)}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {p.forma_nome} · {p.cliente_nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Registado em {formatarDataHora(p.criado_em)}
                    {p.referencia ? ` · Ref. ${p.referencia}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{ETIQUETA_PAGAMENTO[p.estado]}</Badge>
                  {p.em_atraso ? (
                    <Badge variant="destructive">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Fora do prazo
                    </Badge>
                  ) : null}
                  {p.pedido_numero ? (
                    <Link
                      to="/pedidos/$pedidoId"
                      params={{ pedidoId: p.pedido_id }}
                      className="text-sm text-primary underline"
                    >
                      {p.pedido_numero}
                    </Link>
                  ) : null}
                </div>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setAConfirmar(p);
                      setComprovativo(p.comprovativo_url ?? "");
                    }}
                  >
                    <Check className="mr-1 h-4 w-4" /> Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setARejeitar(p);
                      setMotivo("");
                    }}
                  >
                    <X className="mr-1 h-4 w-4" /> Rejeitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(aConfirmar)} onOpenChange={(v) => !v && setAConfirmar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
            <DialogDescription>
              {aConfirmar?.exige_comprovativo
                ? "Esta forma exige comprovativo. Indique a ligação do comprovativo."
                : "O valor passa a contar no pedido depois de confirmado."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Comprovativo (ligação)</Label>
            <Input value={comprovativo} onChange={(e) => setComprovativo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAConfirmar(null)}>
              Cancelar
            </Button>
            <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(aRejeitar)} onOpenChange={(v) => !v && setARejeitar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar pagamento</DialogTitle>
            <DialogDescription>Escreva o motivo. Fica registado no histórico.</DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setARejeitar(null)}>
              Cancelar
            </Button>
            <Button onClick={() => rejeitar.mutate()} disabled={rejeitar.isPending}>
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
