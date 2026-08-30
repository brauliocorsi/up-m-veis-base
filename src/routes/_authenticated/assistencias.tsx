import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { atualizarAssistencia, lerAssistencias } from "@/lib/erp/rotas";
import {
  ESTADOS_ASSISTENCIA,
  ETIQUETA_ASSISTENCIA,
  formatarDataCurta,
  type Assistencia,
  type EstadoAssistencia,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/assistencias")({
  head: () => ({
    meta: [
      { title: "Assistências — UP Vendas" },
      {
        name: "description",
        content:
          "Assistências pós-venda da UP Móveis: problemas abertos na entrega ou pelo cliente, peças e resolução.",
      },
      { property: "og:title", content: "Assistências — UP Vendas" },
      {
        property: "og:description",
        content: "Acompanhar problemas de entrega e resolver assistências pós-venda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const perms = usePermissoes();
  const [estado, setEstado] = useState<EstadoAssistencia | "todas">("todas");
  const [aTratar, setATratar] = useState<Assistencia | null>(null);

  const listaQ = useQuery({
    queryKey: ["assistencias", estado],
    queryFn: () => lerAssistencias(estado === "todas" ? undefined : { estado }),
  });
  const lista = listaQ.data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Assistências"
        descricao="Problemas abertos na entrega ou comunicados pelo cliente."
        acao={
          <Select value={estado} onValueChange={(v) => setEstado(v as EstadoAssistencia | "todas")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos os estados</SelectItem>
              {ESTADOS_ASSISTENCIA.map((e) => (
                <SelectItem key={e.valor} value={e.valor}>
                  {e.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="space-y-3">
        {lista.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {a.pedido_numero} · {a.cliente ?? "Cliente"}
                </p>
                <p className="text-sm">{a.motivo}</p>
                <p className="text-xs text-muted-foreground">
                  {formatarDataCurta(a.criado_em)}
                  {a.peca_afetada ? ` · ${a.peca_afetada}` : ""}
                  {a.aberta_por_nome ? ` · ${a.aberta_por_nome}` : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{a.descricao}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={a.estado === "resolvida" ? "outline" : "secondary"}>
                  {ETIQUETA_ASSISTENCIA[a.estado]}
                </Badge>
                {perms.tratarAssistencias && (
                  <Button variant="outline" size="sm" onClick={() => setATratar(a)}>
                    Atualizar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!listaQ.isLoading && lista.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <LifeBuoy className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Sem assistências</p>
              <p className="text-sm text-muted-foreground">Nada em aberto neste filtro.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {aTratar && <DialogoTratar assistencia={aTratar} onFechar={() => setATratar(null)} />}
    </div>
  );
}

function DialogoTratar({
  assistencia,
  onFechar,
}: {
  assistencia: Assistencia;
  onFechar: () => void;
}) {
  const clientQuery = useQueryClient();
  const [estado, setEstado] = useState<EstadoAssistencia>(assistencia.estado);
  const [nota, setNota] = useState(assistencia.nota_resolucao ?? "");

  const guardar = useMutation({
    mutationFn: () => atualizarAssistencia(assistencia.id, estado, nota || null),
    onSuccess: () => {
      toast.success("Assistência atualizada.");
      clientQuery.invalidateQueries({ queryKey: ["assistencias"] });
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Atualizar assistência"
      descricao={`${assistencia.pedido_numero ?? ""} · ${assistencia.motivo}`}
      aGuardar={guardar.isPending}
      onGuardar={() => guardar.mutate()}
    >
      <div>
        <Label>Estado</Label>
        <Select value={estado} onValueChange={(v) => setEstado(v as EstadoAssistencia)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS_ASSISTENCIA.map((e) => (
              <SelectItem key={e.valor} value={e.valor}>
                {e.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="nota-assist">Nota</Label>
        <Textarea id="nota-assist" value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
    </DialogoForm>
  );
}
