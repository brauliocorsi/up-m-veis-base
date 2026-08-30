import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import {
  conferirRota,
  lerContasDaRota,
  lerMovimentosDaRota,
  lerParagens,
  lerRota,
} from "@/lib/erp/rotas";
import { ETIQUETA_DESFECHO, ETIQUETA_ROTA, formatarDinheiro } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/rotas/$rotaId")({
  head: () => ({
    meta: [
      { title: "Fecho da rota — UP Vendas" },
      {
        name: "description",
        content:
          "Previsto contra realizado de uma rota da UP Móveis: paragens, recebimentos, despesas, envelope e conferência.",
      },
      { property: "og:title", content: "Fecho da rota — UP Vendas" },
      {
        property: "og:description",
        content: "Conferir paragens, dinheiro recebido e envelope entregue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { rotaId } = Route.useParams();
  const perms = usePermissoes();
  const clientQuery = useQueryClient();
  const [conferir, setConferir] = useState(false);

  const rotaQ = useQuery({ queryKey: ["rota", rotaId], queryFn: () => lerRota(rotaId) });
  const paragensQ = useQuery({
    queryKey: ["rota-paragens", rotaId],
    queryFn: () => lerParagens(rotaId),
  });
  const contasQ = useQuery({
    queryKey: ["rota-contas", rotaId],
    queryFn: () => lerContasDaRota(rotaId),
  });
  const movimentosQ = useQuery({
    queryKey: ["rota-movimentos", rotaId],
    queryFn: () => lerMovimentosDaRota(rotaId),
  });

  const rota = rotaQ.data ?? null;
  const contas = contasQ.data ?? null;

  if (!rota) return <p className="text-sm text-muted-foreground">A carregar rota…</p>;

  return (
    <div>
      <CabecalhoPagina
        titulo={rota.nome}
        descricao={`${rota.data} · ${rota.responsavel ?? "—"} · ${ETIQUETA_ROTA[rota.estado]}`}
        acao={
          perms.conferirRotas && rota.estado === "fechada" ? (
            <Button onClick={() => setConferir(true)}>
              <ClipboardCheck className="mr-2 h-4 w-4" /> Conferir envelope
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Par titulo="Entregas" previsto={rota.previsto_entregas} realizado={contas?.entregas_feitas} />
        <Par
          titulo="A receber"
          previsto={rota.previsto_receber}
          realizado={contas?.recebido}
          dinheiro
        />
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Dinheiro − despesas</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatarDinheiro(contas?.esperado_envelope ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              dinheiro {formatarDinheiro(contas?.dinheiro ?? 0)} · saídas{" "}
              {formatarDinheiro(contas?.saidas ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Envelope</p>
            <p className="text-lg font-semibold tabular-nums">
              {rota.valor_envelope === null ? "—" : formatarDinheiro(rota.valor_envelope)}
            </p>
            <p
              className={
                (rota.diferenca ?? 0) === 0
                  ? "text-xs text-muted-foreground"
                  : "text-xs text-destructive"
              }
            >
              diferença {formatarDinheiro(rota.diferenca ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {rota.justificacao_diferenca && (
        <p className="mb-5 rounded-md border border-dashed p-3 text-sm">
          <span className="text-muted-foreground">Justificação: </span>
          {rota.justificacao_diferenca}
        </p>
      )}

      <Card className="mb-5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Paragens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(paragensQ.data ?? []).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {p.ordem}. {p.pedido_numero} · {p.cliente ?? "Cliente"}
                {p.motivo_descricao ? ` · ${p.motivo_descricao}` : ""}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {formatarDinheiro(p.previsto_receber)}
                </span>
                <Badge variant={p.desfecho ? "outline" : "secondary"}>
                  {p.desfecho ? ETIQUETA_DESFECHO[p.desfecho] : "Por fazer"}
                </Badge>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Movimentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(movimentosQ.data ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">
                {m.tipo === "saida" ? "Despesa" : "Recebimento"}
                {m.forma ? ` · ${m.forma}` : ""}
                {m.motivo ? ` · ${m.motivo}` : ""}
                {m.descricao ? ` · ${m.descricao}` : ""}
              </span>
              <span className={m.sentido < 0 ? "text-destructive" : "font-medium"}>
                {m.sentido < 0 ? "−" : "+"}
                {formatarDinheiro(m.valor)}
              </span>
            </div>
          ))}
          {(movimentosQ.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Sem movimentos.</p>
          )}
        </CardContent>
      </Card>

      {conferir && (
        <DialogoConferir
          rotaId={rotaId}
          declarado={rota.valor_envelope ?? 0}
          onFechar={() => setConferir(false)}
          onFeito={() => {
            clientQuery.invalidateQueries({ queryKey: ["rota", rotaId] });
            clientQuery.invalidateQueries({ queryKey: ["rota-contas", rotaId] });
          }}
        />
      )}
    </div>
  );
}

function Par({
  titulo,
  previsto,
  realizado,
  dinheiro,
}: {
  titulo: string;
  previsto: number;
  realizado?: number | null | undefined;
  dinheiro?: boolean | undefined;
}) {
  const fmt = (v: number) => (dinheiro ? formatarDinheiro(v) : String(v));
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-lg font-semibold tabular-nums">{fmt(realizado ?? 0)}</p>
        <p className="text-xs text-muted-foreground">previsto {fmt(previsto)}</p>
      </CardContent>
    </Card>
  );
}

function DialogoConferir({
  rotaId,
  declarado,
  onFechar,
  onFeito,
}: {
  rotaId: string;
  declarado: number;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [contado, setContado] = useState(declarado);
  const [justificacao, setJustificacao] = useState("");
  const diferenca = Number((contado - declarado).toFixed(2));

  const guardar = useMutation({
    mutationFn: () => conferirRota(rotaId, contado, justificacao || null),
    onSuccess: () => {
      toast.success("Rota conferida.");
      onFeito();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Conferir envelope"
      descricao={`O entregador declarou ${formatarDinheiro(declarado)}.`}
      aGuardar={guardar.isPending}
      onGuardar={() => guardar.mutate()}
    >
      <div>
        <Label htmlFor="contado">Valor contado</Label>
        <Input
          id="contado"
          type="number"
          step="0.01"
          min={0}
          value={contado}
          onChange={(e) => setContado(Number(e.target.value || 0))}
        />
      </div>
      <p className={diferenca === 0 ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
        Diferença: {formatarDinheiro(diferenca)}
      </p>
      {diferenca !== 0 && (
        <div>
          <Label htmlFor="just-conf">Justificação</Label>
          <Textarea
            id="just-conf"
            value={justificacao}
            onChange={(e) => setJustificacao(e.target.value)}
          />
        </div>
      )}
    </DialogoForm>
  );
}
