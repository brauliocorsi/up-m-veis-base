import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpCircle, Eye, Unlock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { mensagemErro } from "@/lib/erp/db";
import {
  lerCaixas,
  lerMotivosSaida,
  lerMovimentos,
  reabrirCaixa,
  registarSangria,
} from "@/lib/erp/pagamentos";
import {
  ETIQUETA_MOVIMENTO_CAIXA,
  formatarDataCurta,
  formatarDinheiro,
  type Caixa,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/caixas")({
  head: () => ({
    meta: [
      { title: "Caixas da equipa — UP Vendas" },
      {
        name: "description",
        content:
          "Administração dos caixas da UP Móveis: saldos, diferenças, sangrias e reabertura de caixas fechados.",
      },
      { property: "og:title", content: "Caixas da equipa — UP Vendas" },
      { property: "og:description", content: "Controlo dos caixas da equipa da UP Móveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaCaixas,
});

function PaginaCaixas() {
  const queryClient = useQueryClient();
  const [detalhe, setDetalhe] = useState<Caixa | null>(null);
  const [aReabrir, setAReabrir] = useState<Caixa | null>(null);
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const [sangriaCaixa, setSangriaCaixa] = useState<Caixa | null>(null);
  const [valorSangria, setValorSangria] = useState("");
  const [motivoSangria, setMotivoSangria] = useState("");

  const caixas = useQuery({ queryKey: ["caixas-todos"], queryFn: () => lerCaixas() });
  const motivos = useQuery({ queryKey: ["motivos-saida-caixa"], queryFn: lerMotivosSaida });
  const movimentos = useQuery({
    queryKey: ["caixa-movimentos", detalhe?.id],
    enabled: Boolean(detalhe?.id),
    queryFn: () => lerMovimentos(detalhe!.id),
  });

  function atualizar() {
    void queryClient.invalidateQueries({ queryKey: ["caixas-todos"] });
    void queryClient.invalidateQueries({ queryKey: ["caixa"] });
    void queryClient.invalidateQueries({ queryKey: ["caixa-movimentos"] });
  }

  const reabrir = useMutation({
    mutationFn: async () => {
      if (!aReabrir) return;
      if (!motivoReabertura.trim()) throw new Error("Escreva o motivo da reabertura.");
      await reabrirCaixa(aReabrir.id, motivoReabertura.trim());
    },
    onSuccess: () => {
      toast.success("Caixa reaberto.");
      setAReabrir(null);
      setMotivoReabertura("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const sangria = useMutation({
    mutationFn: async () => {
      if (!sangriaCaixa) return;
      const numero = Number(valorSangria.replace(",", "."));
      if (!Number.isFinite(numero) || numero <= 0) throw new Error("Indique um valor válido.");
      if (!motivoSangria) throw new Error("Indique o motivo da sangria.");
      await registarSangria({
        caixa_id: sangriaCaixa.id,
        valor: Number(numero.toFixed(2)),
        motivo_id: motivoSangria,
      });
    },
    onSuccess: () => {
      toast.success("Sangria registada.");
      setSangriaCaixa(null);
      setValorSangria("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const lista = caixas.data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Caixas da equipa"
        descricao="Saldos, diferenças e movimentos de cada pessoa. As sangrias e reaberturas ficam registadas."
      />

      {caixas.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda não há caixas abertos.</p>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div>
                  <p className="font-semibold">{c.utilizador_nome}</p>
                  <p className="text-xs text-muted-foreground">{formatarDataCurta(c.data)}</p>
                </div>
                <Badge variant={c.estado === "aberto" ? "default" : "outline"}>
                  {c.estado === "aberto" ? "Aberto" : "Fechado"}
                </Badge>
                <span className="text-muted-foreground">
                  Esperado {formatarDinheiro(c.saldo_esperado)}
                  {c.saldo_contado !== null ? ` · Contado ${formatarDinheiro(c.saldo_contado)}` : ""}
                </span>
                {c.diferenca !== null && Number(c.diferenca) !== 0 ? (
                  <Badge variant="destructive">{formatarDinheiro(c.diferenca)}</Badge>
                ) : null}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDetalhe(c)}>
                    <Eye className="mr-1 h-4 w-4" /> Movimentos
                  </Button>
                  {c.estado === "aberto" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSangriaCaixa(c);
                        setValorSangria("");
                      }}
                    >
                      <ArrowUpCircle className="mr-1 h-4 w-4" /> Sangria
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAReabrir(c);
                        setMotivoReabertura("");
                      }}
                    >
                      <Unlock className="mr-1 h-4 w-4" /> Reabrir
                    </Button>
                  )}
                </div>
                {c.justificacao_diferenca ? (
                  <p className="w-full text-xs text-muted-foreground">
                    Justificação: {c.justificacao_diferenca}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(detalhe)} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Movimentos de {detalhe?.utilizador_nome} — {formatarDataCurta(detalhe?.data)}
            </DialogTitle>
            <DialogDescription>
              Abertura {formatarDinheiro(detalhe?.saldo_abertura)} · Saldo esperado{" "}
              {formatarDinheiro(detalhe?.saldo_esperado)}
            </DialogDescription>
          </DialogHeader>
          {(movimentos.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentos.</p>
          ) : (
            <ul className="divide-y text-sm">
              {(movimentos.data ?? []).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{formatarDinheiro(m.valor * m.sentido)}</span>
                  <span className="text-muted-foreground">
                    {ETIQUETA_MOVIMENTO_CAIXA[m.tipo]}
                    {m.forma_nome ? ` · ${m.forma_nome}` : ""}
                  </span>
                  {m.pedido_numero ? <Badge variant="outline">{m.pedido_numero}</Badge> : null}
                  <span className="text-xs text-muted-foreground">
                    {m.motivo_descricao ?? m.descricao ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(aReabrir)} onOpenChange={(v) => !v && setAReabrir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir caixa</DialogTitle>
            <DialogDescription>
              A reabertura fica registada com o motivo e o seu nome.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoReabertura}
            onChange={(e) => setMotivoReabertura(e.target.value)}
            rows={3}
            placeholder="Motivo da reabertura"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAReabrir(null)}>
              Cancelar
            </Button>
            <Button onClick={() => reabrir.mutate()} disabled={reabrir.isPending}>
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(sangriaCaixa)} onOpenChange={(v) => !v && setSangriaCaixa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registar sangria</DialogTitle>
            <DialogDescription>
              Retirada de dinheiro do caixa de {sangriaCaixa?.utilizador_nome}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Valor (€)</Label>
              <Input
                inputMode="decimal"
                value={valorSangria}
                onChange={(e) => setValorSangria(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select value={motivoSangria} onValueChange={setMotivoSangria}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher…" />
                </SelectTrigger>
                <SelectContent>
                  {(motivos.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSangriaCaixa(null)}>
              Cancelar
            </Button>
            <Button onClick={() => sangria.mutate()} disabled={sangria.isPending}>
              Registar sangria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
