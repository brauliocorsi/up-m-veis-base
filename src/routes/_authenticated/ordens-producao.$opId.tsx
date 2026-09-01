import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CircleSlash, PackageCheck, Play } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import {
  cancelarOp,
  concluirEtapa,
  concluirOp,
  conferirEtapa,
  iniciarEtapa,
  lerOp,
  lerOpConsumos,
  lerOpEtapas,
} from "@/lib/erp/producao";
import {
  ETIQUETA_ESTADO_ETAPA,
  ETIQUETA_ESTADO_OP,
  type OpEtapa,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/ordens-producao/$opId")({
  head: () => ({
    meta: [
      { title: "Ordem de produção — UP Vendas" },
      {
        name: "description",
        content:
          "Etapas do fabrico, quem fez cada uma, peças boas e de refugo, material consumido e conclusão da ordem.",
      },
      { property: "og:title", content: "Ordem de produção — UP Vendas" },
      {
        property: "og:description",
        content: "Corte, costura, estrutura, branco, estofagem, qualidade e embalagem, passo a passo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { opId } = Route.useParams();
  const perms = usePermissoes();
  const queryClient = useQueryClient();
  const [aConcluir, setAConcluir] = useState<OpEtapa | null>(null);
  const [aFechar, setAFechar] = useState(false);
  const [aCancelar, setACancelar] = useState(false);

  const opQ = useQuery({ queryKey: ["op", opId], queryFn: () => lerOp(opId) });
  const etapasQ = useQuery({ queryKey: ["op-etapas", opId], queryFn: () => lerOpEtapas(opId) });
  const consumosQ = useQuery({ queryKey: ["op-consumos", opId], queryFn: () => lerOpConsumos(opId) });

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["op", opId] });
    queryClient.invalidateQueries({ queryKey: ["op-etapas", opId] });
    queryClient.invalidateQueries({ queryKey: ["op-consumos", opId] });
    queryClient.invalidateQueries({ queryKey: ["ordens-producao"] });
    queryClient.invalidateQueries({ queryKey: ["chao-fabrica"] });
  }

  const iniciar = useMutation({
    mutationFn: (etapa: OpEtapa) => iniciarEtapa(etapa.id),
    onSuccess: () => {
      toast.success("Etapa iniciada.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const conferir = useMutation({
    mutationFn: (etapa: OpEtapa) => conferirEtapa(etapa.id),
    onSuccess: () => {
      toast.success("Etapa conferida.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const op = opQ.data;
  const etapas = etapasQ.data ?? [];
  const consumos = consumosQ.data ?? [];
  const faltas = consumos.filter((c) => c.quantidade_falta > 0);

  if (opQ.isPending || !op) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  return (
    <div>
      <CabecalhoPagina
        titulo={`${op.numero} · ${op.produto_nome}`}
        descricao={`${op.quantidade_produzida} de ${op.quantidade} unidades prontas · ${ETIQUETA_ESTADO_OP[op.estado]}`}
        acao={
          perms.registarProducao && op.estado !== "concluida" && op.estado !== "cancelada" ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAFechar(true)}>
                <PackageCheck className="mr-2 h-4 w-4" /> Concluir produção
              </Button>
              {perms.gerirProducao && (
                <Button variant="outline" onClick={() => setACancelar(true)}>
                  <CircleSlash className="mr-2 h-4 w-4" /> Cancelar
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {faltas.length > 0 && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Material consumido em falta
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {faltas.map((c) => (
                <li key={c.id}>
                  {c.componente_nome}: faltaram {c.quantidade_falta} de {c.quantidade_prevista}
                  {c.etapa_nome ? ` · ${c.etapa_nome}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {etapas.map((etapa) => (
          <Card key={etapa.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="text-muted-foreground">{etapa.ordem}.</span> {etapa.etapa_nome}
                  <Badge variant="secondary">{ETIQUETA_ESTADO_ETAPA[etapa.estado]}</Badge>
                  {etapa.exige_conferencia && (
                    <Badge variant={etapa.conferida_por ? "outline" : "destructive"}>
                      {etapa.conferida_por ? "conferida" : "exige conferência"}
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {etapa.operador_nome ?? "sem operador"} · {etapa.quantidade_ok} boas
                  {etapa.quantidade_refugo > 0 ? ` · ${etapa.quantidade_refugo} de refugo` : ""}
                  {etapa.motivo_refugo ? ` (${etapa.motivo_refugo})` : ""}
                  {etapa.conferida_por_nome ? ` · conferida por ${etapa.conferida_por_nome}` : ""}
                </p>
              </div>
              {perms.registarProducao && (
                <div className="flex flex-wrap gap-2">
                  {etapa.estado === "pendente" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => iniciar.mutate(etapa)}
                      disabled={iniciar.isPending}
                    >
                      <Play className="mr-1 h-4 w-4" /> Iniciar
                    </Button>
                  )}
                  {etapa.estado !== "concluida" && (
                    <Button size="sm" onClick={() => setAConcluir(etapa)}>
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Concluir
                    </Button>
                  )}
                  {etapa.estado === "concluida" &&
                    etapa.exige_conferencia &&
                    !etapa.conferida_por && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => conferir.mutate(etapa)}
                        disabled={conferir.isPending}
                      >
                        Conferir
                      </Button>
                    )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {consumos.length > 0 && (
        <section className="mt-6 rounded-lg border bg-card">
          <header className="border-b px-4 py-3 font-medium">Material consumido</header>
          <ul className="divide-y text-sm">
            {consumos.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="min-w-0 truncate">
                  {c.componente_nome}
                  {c.etapa_nome ? ` · ${c.etapa_nome}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.quantidade_consumida} de {c.quantidade_prevista}
                  {c.quantidade_falta > 0 ? ` · faltaram ${c.quantidade_falta}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {aConcluir && (
        <DialogoConcluirEtapa
          etapa={aConcluir}
          quantidadeOp={op.quantidade}
          onFechar={() => setAConcluir(null)}
          onGuardado={recarregar}
        />
      )}

      {aFechar && (
        <DialogoConcluirOp
          opId={opId}
          falta={op.falta}
          onFechar={() => setAFechar(false)}
          onGuardado={recarregar}
        />
      )}

      {aCancelar && (
        <DialogoCancelar
          opId={opId}
          onFechar={() => setACancelar(false)}
          onGuardado={recarregar}
        />
      )}
    </div>
  );
}

function DialogoConcluirEtapa({
  etapa,
  quantidadeOp,
  onFechar,
  onGuardado,
}: {
  etapa: OpEtapa;
  quantidadeOp: number;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [ok, setOk] = useState(String(quantidadeOp));
  const [refugo, setRefugo] = useState("0");
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const guardar = useMutation({
    mutationFn: () =>
      concluirEtapa({
        op_etapa_id: etapa.id,
        quantidade_ok: Number(ok),
        quantidade_refugo: Number(refugo) || 0,
        motivo_refugo: motivo,
        observacoes,
      }),
    onSuccess: (resultado) => {
      const faltas = resultado?.faltas ?? [];
      if (faltas.length > 0) {
        toast.warning(
          `Etapa concluída, mas faltou material: ${faltas
            .map((f) => `${f.componente} (${f.falta})`)
            .join(", ")}.`,
        );
      } else {
        toast.success("Etapa concluída e material consumido.");
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
      titulo={`Concluir ${etapa.etapa_nome}`}
      descricao="O material desta etapa é descontado do stock ao concluir."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!ok && !refugo) {
          toast.error("Indique quantas peças ficaram boas.");
          return;
        }
        if (Number(refugo) > 0 && !motivo.trim()) {
          toast.error("Escreva o motivo do refugo.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="e-ok">Peças boas</Label>
          <Input
            id="e-ok"
            type="number"
            min={0}
            inputMode="numeric"
            value={ok}
            onChange={(e) => setOk(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="e-refugo">Refugo</Label>
          <Input
            id="e-refugo"
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
          <Label htmlFor="e-motivo">Motivo do refugo</Label>
          <Input id="e-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      )}
      <div>
        <Label htmlFor="e-obs">Observações</Label>
        <Textarea
          id="e-obs"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </div>
    </DialogoForm>
  );
}

function DialogoConcluirOp({
  opId,
  falta,
  onFechar,
  onGuardado,
}: {
  opId: string;
  falta: number;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [quantidade, setQuantidade] = useState(String(falta));

  const guardar = useMutation({
    mutationFn: () => concluirOp(opId, Number(quantidade)),
    onSuccess: (r) => {
      toast.success(
        `Entraram ${r.produzido} un. em stock · ${r.reservado} reservadas a clientes · ${r.sobra} vendáveis.`,
      );
      onGuardado();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Concluir produção"
      descricao="As peças entram em stock e são reservadas às vendas, apenas na quantidade que cada venda precisa."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!quantidade || Number(quantidade) <= 0) {
          toast.error("Indique quantas peças ficaram prontas.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div>
        <Label htmlFor="op-qt">Peças prontas</Label>
        <Input
          id="op-qt"
          type="number"
          min={1}
          max={falta}
          inputMode="numeric"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Pode concluir parcialmente: a ordem fica em curso com o que faltar.
        </p>
      </div>
    </DialogoForm>
  );
}

function DialogoCancelar({
  opId,
  onFechar,
  onGuardado,
}: {
  opId: string;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [motivo, setMotivo] = useState("");

  const guardar = useMutation({
    mutationFn: () => cancelarOp(opId, motivo),
    onSuccess: () => {
      toast.success("Ordem cancelada. As necessidades voltaram à lista da fábrica.");
      onGuardado();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Cancelar ordem de produção"
      descricao="As necessidades ligadas voltam a ficar abertas."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!motivo.trim()) {
          toast.error("Escreva o motivo do cancelamento.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div>
        <Label htmlFor="op-motivo">Motivo</Label>
        <Textarea id="op-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </DialogoForm>
  );
}
