import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, MapPinned, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DialogoAgendar } from "@/components/erp/dialogo-agendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { desagendarEntrega, lerParagemDoPedido } from "@/lib/erp/rotas";
import { ETIQUETA_ROTA, formatarDataCurta, type Pedido } from "@/lib/erp/tipos";

export function PainelAgendamento({ pedido }: { pedido: Pedido }) {
  const perms = usePermissoes();
  const clientQuery = useQueryClient();
  const [aberto, setAberto] = useState(false);

  const paragemQ = useQuery({
    queryKey: ["paragem-pedido", pedido.id],
    queryFn: () => lerParagemDoPedido(pedido.id),
  });

  function recarregar() {
    clientQuery.invalidateQueries({ queryKey: ["paragem-pedido", pedido.id] });
    clientQuery.invalidateQueries({ queryKey: ["pedido", pedido.id] });
    clientQuery.invalidateQueries({ queryKey: ["pedidos-por-agendar"] });
    clientQuery.invalidateQueries({ queryKey: ["rotas"] });
  }

  const desagendar = useMutation({
    mutationFn: () =>
      desagendarEntrega({ pedido_id: pedido.id, motivo: "Retirado da rota na venda" }),
    onSuccess: () => {
      toast.success("Venda retirada da rota.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const paragem = paragemQ.data ?? null;
  const agendavel =
    pedido.tipo === "pedido" &&
    ["confirmado", "em_preparacao", "pronto"].includes(pedido.estado);

  if (!perms.montarRotas) return null;
  if (!paragem && !agendavel) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" /> Agendamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {paragem ? (
          <>
            <p className="text-sm">
              <Link
                to="/rotas/$rotaId"
                params={{ rotaId: paragem.rota_id }}
                className="font-medium underline-offset-2 hover:underline"
              >
                <MapPinned className="mr-1 inline h-4 w-4" />
                {paragem.rota_nome ?? "Rota"}
              </Link>{" "}
              · {formatarDataCurta(paragem.rota_data ?? null)} · paragem {paragem.ordem}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {paragem.rota_estado && (
                <Badge variant="secondary">{ETIQUETA_ROTA[paragem.rota_estado]}</Badge>
              )}
              {paragem.excedeu_capacidade && (
                <Badge variant="destructive">Acima da capacidade</Badge>
              )}
            </div>
            {!paragem.desfecho && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => desagendar.mutate()}
                disabled={desagendar.isPending}
              >
                <X className="mr-2 h-4 w-4" /> Retirar da rota
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Esta venda ainda não está encaixada numa rota.
            </p>
            <Button size="sm" onClick={() => setAberto(true)}>
              <CalendarClock className="mr-2 h-4 w-4" /> Agendar entrega
            </Button>
          </>
        )}
      </CardContent>

      {aberto && (
        <DialogoAgendar
          pedidoId={pedido.id}
          onFechar={() => setAberto(false)}
          onFeito={recarregar}
        />
      )}
    </Card>
  );
}
