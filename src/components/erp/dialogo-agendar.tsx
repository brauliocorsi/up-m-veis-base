import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mensagemErro } from "@/lib/erp/db";
import { agendarEntrega, lerRotasSugeridas } from "@/lib/erp/rotas";
import { ETIQUETA_ROTA } from "@/lib/erp/tipos";

interface Props {
  pedidoId: string;
  numero?: string | null;
  onFechar: () => void;
  onAgendado?: () => void;
}

/** Escolha da rota para uma venda: sugere primeiro as rotas que servem o código postal. */
export function DialogoAgendar({ pedidoId, numero, onFechar, onAgendado }: Props) {
  const clientQuery = useQueryClient();
  const [escolhida, setEscolhida] = useState<string | null>(null);

  const sugestoesQ = useQuery({
    queryKey: ["rotas-sugeridas", pedidoId],
    queryFn: () => lerRotasSugeridas(pedidoId),
  });

  const agendar = useMutation({
    mutationFn: (rotaId: string) => agendarEntrega({ pedido_id: pedidoId, rota_id: rotaId }),
    onSuccess: (res) => {
      if (res.excedeu_capacidade) {
        toast.warning(
          `Agendada para ${res.data}, mas a rota ficou acima da capacidade. ${(res.avisos ?? []).join(" ")}`,
        );
      } else {
        toast.success(`Entrega agendada para ${res.data}.`);
      }
      clientQuery.invalidateQueries({ queryKey: ["pedido", pedidoId] });
      clientQuery.invalidateQueries({ queryKey: ["pedidos-por-agendar"] });
      clientQuery.invalidateQueries({ queryKey: ["rotas"] });
      onAgendado?.();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const rotas = sugestoesQ.data ?? [];

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agendar entrega{numero ? ` · ${numero}` : ""}</DialogTitle>
          <DialogDescription>
            As rotas que servem o código postal desta venda aparecem primeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {sugestoesQ.isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
          {rotas.map((r) => (
            <button
              key={r.rota_id}
              type="button"
              onClick={() => setEscolhida(r.rota_id)}
              className={
                "w-full rounded-md border p-3 text-left text-sm transition-colors" +
                (escolhida === r.rota_id ? " border-primary bg-muted" : " hover:bg-muted")
              }
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.data}</span>
                <span className="min-w-0 truncate">{r.nome}</span>
                <Badge variant="outline">{ETIQUETA_ROTA[r.estado]}</Badge>
                {r.serve_zona && <Badge variant="secondary">Serve a zona</Badge>}
                {r.excede && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Acima da capacidade
                  </Badge>
                )}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {r.responsavel ?? "sem entregador"} · {r.viatura ?? "sem viatura"} ·{" "}
                {r.entregas}
                {r.max_entregas ? `/${r.max_entregas}` : ""} entregas ·{" "}
                {r.montagem_min}
                {r.max_minutos_montagem ? `/${r.max_minutos_montagem}` : ""} min ·{" "}
                {Number(r.cubicagem_m3).toFixed(2)}
                {r.viatura_cubicagem_m3
                  ? `/${Number(r.viatura_cubicagem_m3).toFixed(2)}`
                  : ""}{" "}
                m³
              </span>
            </button>
          ))}
          {!sugestoesQ.isLoading && rotas.length === 0 && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Não há rotas planeadas para os próximos dias. Crie a rota primeiro em Rotas.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!escolhida || agendar.isPending}
            onClick={() => escolhida && agendar.mutate(escolhida)}
          >
            <CalendarCheck className="mr-2 h-4 w-4" />
            {agendar.isPending ? "A agendar…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
