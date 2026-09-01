import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Hammer, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { concluirEtapa, iniciarEtapa, lerChaoFabrica, lerEtapas } from "@/lib/erp/producao";
import { ETIQUETA_ESTADO_ETAPA, type ChaoFabricaLinha } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/chao-fabrica")({
  head: () => ({
    meta: [
      { title: "Chão de fábrica — UP Vendas" },
      {
        name: "description",
        content:
          "O trabalho de hoje na fábrica da UP Móveis: iniciar e concluir etapas, com registo de peças boas e refugo.",
      },
      { property: "og:title", content: "Chão de fábrica — UP Vendas" },
      {
        property: "og:description",
        content: "Ecrã de fábrica, feito para o telemóvel: botões grandes e sem distrações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const perms = usePermissoes();
  const queryClient = useQueryClient();
  const [etapaId, setEtapaId] = useState<string | null>(null);
  const [aConcluir, setAConcluir] = useState<ChaoFabricaLinha | null>(null);

  const etapasQ = useQuery({ queryKey: ["etapas-producao"], queryFn: () => lerEtapas() });
  const linhasQ = useQuery({
    queryKey: ["chao-fabrica", etapaId],
    queryFn: () => lerChaoFabrica(etapaId),
  });

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["chao-fabrica"] });
    queryClient.invalidateQueries({ queryKey: ["ordens-producao"] });
  }

  const iniciar = useMutation({
    mutationFn: (linha: ChaoFabricaLinha) => iniciarEtapa(linha.op_etapa_id),
    onSuccess: () => {
      toast.success("Trabalho iniciado.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const etapas = etapasQ.data ?? [];
  const linhas = linhasQ.data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Chão de fábrica"
        descricao="Escolha a sua etapa e registe o trabalho feito. As peças más contam como refugo, com motivo."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={etapaId === null ? "default" : "outline"}
          onClick={() => setEtapaId(null)}
        >
          Todas
        </Button>
        {etapas.map((e) => (
          <Button
            key={e.id}
            size="sm"
            variant={etapaId === e.id ? "default" : "outline"}
            onClick={() => setEtapaId(e.id)}
          >
            {e.nome}
          </Button>
        ))}
      </div>

      {linhasQ.isPending && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {linhas.map((linha) => {
          const bloqueada = linha.etapas_anteriores_pendentes > 0;
          return (
            <Card key={linha.op_etapa_id}>
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {linha.produto_nome}
                    <Badge variant="secondary">{ETIQUETA_ESTADO_ETAPA[linha.estado]}</Badge>
                    {linha.prioridade <= 2 && <Badge variant="destructive">urgente</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {linha.op_numero} · {linha.etapa_nome} · {linha.quantidade} un.
                    {linha.data_prevista
                      ? ` · para ${new Date(linha.data_prevista).toLocaleDateString("pt-PT")}`
                      : ""}
                    {linha.operador_nome ? ` · ${linha.operador_nome}` : ""}
                  </p>
                  {bloqueada && (
                    <p className="mt-1 text-xs text-destructive">
                      Ainda falta terminar {linha.etapas_anteriores_pendentes} etapa(s) antes desta.
                    </p>
                  )}
                </div>

                {perms.registarProducao && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {linha.estado === "pendente" && (
                      <Button
                        className="h-12 flex-1 text-base"
                        variant="outline"
                        disabled={bloqueada || iniciar.isPending}
                        onClick={() => iniciar.mutate(linha)}
                      >
                        <Play className="mr-2 h-5 w-5" /> Iniciar
                      </Button>
                    )}
                    <Button
                      className="h-12 flex-1 text-base"
                      disabled={bloqueada}
                      onClick={() => setAConcluir(linha)}
                    >
                      <CheckCircle2 className="mr-2 h-5 w-5" /> Concluir
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {!linhasQ.isPending && linhas.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Hammer className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Nada por fazer nesta etapa</p>
              <p className="text-sm text-muted-foreground">
                Quando houver ordens abertas aparecem aqui.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {aConcluir && (
        <DialogoTrabalho
          linha={aConcluir}
          onFechar={() => setAConcluir(null)}
          onGuardado={recarregar}
        />
      )}
    </div>
  );
}

function DialogoTrabalho({
  linha,
  onFechar,
  onGuardado,
}: {
  linha: ChaoFabricaLinha;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [ok, setOk] = useState(String(linha.quantidade));
  const [refugo, setRefugo] = useState("0");
  const [motivo, setMotivo] = useState("");

  const guardar = useMutation({
    mutationFn: () =>
      concluirEtapa({
        op_etapa_id: linha.op_etapa_id,
        quantidade_ok: Number(ok),
        quantidade_refugo: Number(refugo) || 0,
        motivo_refugo: motivo,
      }),
    onSuccess: (resultado) => {
      const faltas = resultado?.faltas ?? [];
      if (faltas.length > 0) {
        toast.warning(
          `Concluído, mas faltou material: ${faltas
            .map((f) => `${f.componente} (${f.falta})`)
            .join(", ")}.`,
        );
      } else {
        toast.success("Trabalho registado.");
      }
      onGuardado();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={`Concluir ${linha.etapa_nome}`}
      descricao={`${linha.op_numero} · ${linha.produto_nome}`}
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (Number(refugo) > 0 && !motivo.trim()) {
          toast.error("Escreva o motivo do refugo.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="c-ok">Peças boas</Label>
          <Input
            id="c-ok"
            className="h-12 text-lg"
            type="number"
            min={0}
            inputMode="numeric"
            value={ok}
            onChange={(e) => setOk(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="c-refugo">Refugo</Label>
          <Input
            id="c-refugo"
            className="h-12 text-lg"
            type="number"
            min={0}
            inputMode="numeric"
            value={refugo}
            onChange={(e) => setRefugo(e.target.value)}
          />
        </div>
      </div>
      {Number(refugo) > 0 && (
        <div>
          <Label htmlFor="c-motivo">Motivo do refugo</Label>
          <Input
            id="c-motivo"
            className="h-12"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      )}
    </DialogoForm>
  );
}
