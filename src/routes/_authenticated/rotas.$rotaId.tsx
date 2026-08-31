import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  ClipboardCheck,
  Play,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp, mensagemErro } from "@/lib/erp/db";
import {
  agendarEntrega,
  arrancarRota,
  cancelarRota,
  conferirRota,
  definirLimitesRota,
  definirResponsavelRota,
  definirViaturaRota,
  desagendarEntrega,
  lerAlteracoesRota,
  lerContasDaRota,
  lerMovimentosDaRota,
  lerOcupacaoRota,
  lerParagens,
  lerPedidosPorAgendar,
  lerRota,
  lerViaturas,
  reordenarParagens,
} from "@/lib/erp/rotas";
import {
  ETIQUETA_DESFECHO,
  ETIQUETA_ROTA,
  formatarDinheiro,
  type Utilizador,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/rotas/$rotaId")({
  head: () => ({
    meta: [
      { title: "Rota: capacidade e fecho — UP Vendas" },
      {
        name: "description",
        content:
          "Ocupação, paragens, recebimentos, despesas, envelope e conferência de uma rota da UP Móveis.",
      },
      { property: "og:title", content: "Rota: capacidade e fecho — UP Vendas" },
      {
        property: "og:description",
        content: "Encaixar vendas, ver a carga da viatura e conferir o dinheiro do dia.",
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
  const [aAdicionar, setAAdicionar] = useState(false);
  const [aCancelar, setACancelar] = useState(false);

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
  const ocupacaoQ = useQuery({
    queryKey: ["rota-ocupacao", rotaId],
    queryFn: () => lerOcupacaoRota(rotaId),
  });
  const alteracoesQ = useQuery({
    queryKey: ["rota-alteracoes", rotaId],
    queryFn: () => lerAlteracoesRota(rotaId),
  });

  function recarregar() {
    clientQuery.invalidateQueries({ queryKey: ["rota", rotaId] });
    clientQuery.invalidateQueries({ queryKey: ["rota-paragens", rotaId] });
    clientQuery.invalidateQueries({ queryKey: ["rota-ocupacao", rotaId] });
    clientQuery.invalidateQueries({ queryKey: ["rota-alteracoes", rotaId] });
    clientQuery.invalidateQueries({ queryKey: ["rotas"] });
    clientQuery.invalidateQueries({ queryKey: ["pedidos-por-agendar"] });
  }

  const arrancar = useMutation({
    mutationFn: () => arrancarRota(rotaId),
    onSuccess: () => {
      toast.success("Rota em curso. O previsto está congelado.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const retirar = useMutation({
    mutationFn: (params: { pedidoId: string; confirmar: boolean }) =>
      desagendarEntrega({
        pedido_id: params.pedidoId,
        confirmar: params.confirmar,
        motivo: "Retirada da rota",
      }),
    onSuccess: () => {
      toast.success("Venda retirada da rota e devolvida a “pronto”.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const reordenar = useMutation({
    mutationFn: (ordem: string[]) => reordenarParagens(rotaId, ordem),
    onSuccess: () => recarregar(),
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const rota = rotaQ.data ?? null;
  const contas = contasQ.data ?? null;
  const oc = ocupacaoQ.data ?? null;
  const paragens = paragensQ.data ?? [];

  if (!rota) return <p className="text-sm text-muted-foreground">A carregar rota…</p>;

  const planeada = rota.estado === "planeada";
  const emCurso = rota.estado === "em_curso";

  function mover(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= paragens.length) return;
    const ids = paragens.map((p) => p.id);
    const atual = ids[indice]!;
    ids[indice] = ids[destino]!;
    ids[destino] = atual;
    reordenar.mutate(ids);
  }

  return (
    <div>
      <CabecalhoPagina
        titulo={rota.nome}
        descricao={`${rota.data} · ${rota.responsavel ?? "sem entregador"} · ${ETIQUETA_ROTA[rota.estado]}`}
        acao={
          <div className="flex flex-wrap gap-2">
            {perms.montarRotas && (planeada || emCurso) && (
              <Button variant="outline" onClick={() => setAAdicionar(true)}>
                <Plus className="mr-2 h-4 w-4" /> Encaixar vendas
              </Button>
            )}
            {perms.montarRotas && planeada && (
              <>
                <Button variant="outline" onClick={() => setACancelar(true)}>
                  <Ban className="mr-2 h-4 w-4" /> Cancelar rota
                </Button>
                <Button onClick={() => arrancar.mutate()} disabled={arrancar.isPending}>
                  <Play className="mr-2 h-4 w-4" /> Arrancar rota
                </Button>
              </>
            )}
            {perms.conferirRotas && rota.estado === "fechada" && (
              <Button onClick={() => setConferir(true)}>
                <ClipboardCheck className="mr-2 h-4 w-4" /> Conferir envelope
              </Button>
            )}
          </div>
        }
      />

      {rota.estado === "cancelada" && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Rota cancelada. {rota.motivo_cancelamento}
        </p>
      )}

      <PainelOcupacao ocupacao={oc} />

      {perms.montarRotas && (planeada || emCurso) && (
        <PainelPlaneamento
          rotaId={rotaId}
          viaturaId={rota.viatura_id ?? null}
          responsavelId={rota.responsavel_id ?? null}
          maxEntregas={rota.max_entregas ?? null}
          maxMinutos={rota.max_minutos_montagem ?? null}
          onFeito={recarregar}
        />
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Par
          titulo="Entregas"
          previsto={rota.previsto_entregas}
          realizado={contas?.entregas_feitas}
        />
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
          {paragens.map((p, i) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {p.ordem}.{" "}
                <Link
                  to="/pedidos/$pedidoId"
                  params={{ pedidoId: p.pedido_id }}
                  className="underline-offset-2 hover:underline"
                >
                  {p.pedido_numero}
                </Link>{" "}
                · {p.cliente ?? "Cliente"}
                {p.localidade_entrega ? ` · ${p.localidade_entrega}` : ""}
                {p.motivo_descricao ? ` · ${p.motivo_descricao}` : ""}
              </span>
              <span className="flex items-center gap-2">
                {p.excedeu_capacidade && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Acima da capacidade
                  </Badge>
                )}
                <span className="tabular-nums text-muted-foreground">
                  {formatarDinheiro(p.previsto_receber)}
                </span>
                <Badge variant={p.desfecho ? "outline" : "secondary"}>
                  {p.desfecho ? ETIQUETA_DESFECHO[p.desfecho] : "Por fazer"}
                </Badge>
                {perms.montarRotas && !p.desfecho && (planeada || emCurso) && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Subir paragem"
                      onClick={() => mover(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Descer paragem"
                      onClick={() => mover(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Retirar da rota"
                      onClick={() => {
                        if (
                          emCurso &&
                          !window.confirm(
                            "A rota já arrancou. Confirma que quer retirar esta paragem?",
                          )
                        ) {
                          return;
                        }
                        retirar.mutate({ pedidoId: p.pedido_id, confirmar: emCurso });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </span>
            </div>
          ))}
          {paragens.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Rota vazia. Encaixe as vendas prontas a entregar.
            </p>
          )}
        </CardContent>
      </Card>

      {(alteracoesQ.data ?? []).length > 0 && (
        <Card className="mb-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Alterações depois do arranque</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(alteracoesQ.data ?? []).map((a) => (
              <p key={a.id} className="text-muted-foreground">
                {new Date(a.criado_em).toLocaleString("pt-PT")} ·{" "}
                {a.tipo === "adicionou" ? "Acrescentou" : "Retirou"} · {a.descricao}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

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

      {aAdicionar && (
        <DialogoEncaixar
          rotaId={rotaId}
          emCurso={emCurso}
          onFechar={() => setAAdicionar(false)}
          onFeito={recarregar}
        />
      )}

      {aCancelar && (
        <DialogoCancelar
          rotaId={rotaId}
          onFechar={() => setACancelar(false)}
          onFeito={recarregar}
        />
      )}

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

function PainelOcupacao({
  ocupacao,
}: {
  ocupacao: Awaited<ReturnType<typeof lerOcupacaoRota>>;
}) {
  const viaturasQ = useQuery({ queryKey: ["viaturas"], queryFn: () => lerViaturas() });
  if (!ocupacao) return null;

  const compativeis = (viaturasQ.data ?? []).filter(
    (v) =>
      Number(v.cubicagem_m3) >= Number(ocupacao.cubicagem_m3) &&
      (v.peso_max_kg == null || Number(v.peso_max_kg) >= Number(ocupacao.peso_kg)),
  );

  return (
    <Card className="mb-5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Ocupação da rota</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Barra
          titulo="Entregas"
          valor={ocupacao.entregas}
          limite={ocupacao.max_entregas}
          sufixo=""
        />
        <Barra
          titulo="Montagem"
          valor={ocupacao.montagem_min}
          limite={ocupacao.max_minutos_montagem}
          sufixo=" min"
        />
        {ocupacao.viatura_id ? (
          <Barra
            titulo={`Volume · ${ocupacao.viatura ?? "viatura"}`}
            valor={Number(ocupacao.cubicagem_m3)}
            limite={
              ocupacao.viatura_cubicagem_m3 == null ? null : Number(ocupacao.viatura_cubicagem_m3)
            }
            sufixo=" m³"
            decimais
          />
        ) : (
          <div>
            <p className="text-xs text-muted-foreground">Volume acumulado</p>
            <p className="text-lg font-semibold tabular-nums">
              {Number(ocupacao.cubicagem_m3).toFixed(2)} m³ ·{" "}
              {Number(ocupacao.peso_kg).toFixed(0)} kg
            </p>
            <p className="text-xs text-muted-foreground">
              {compativeis.length === 0
                ? "Nenhuma viatura da frota leva esta carga."
                : `Servem: ${compativeis.map((v) => v.nome).join(", ")}`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Barra({
  titulo,
  valor,
  limite,
  sufixo,
  decimais,
}: {
  titulo: string;
  valor: number;
  limite: number | null;
  sufixo: string;
  decimais?: boolean;
}) {
  const fmt = (v: number) => (decimais ? v.toFixed(2) : String(v));
  const pct = limite && limite > 0 ? Math.min(100, (valor / limite) * 100) : 0;
  const excede = limite != null && valor > limite;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p
        className={
          excede
            ? "text-lg font-semibold tabular-nums text-destructive"
            : "text-lg font-semibold tabular-nums"
        }
      >
        {fmt(valor)}
        {limite != null ? ` / ${fmt(limite)}` : ""}
        {sufixo}
      </p>
      {limite != null ? (
        <Progress value={pct} className="mt-1 h-2" />
      ) : (
        <p className="text-xs text-muted-foreground">sem limite definido</p>
      )}
      {excede && (
        <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" /> acima do limite
        </p>
      )}
    </div>
  );
}

function PainelPlaneamento({
  rotaId,
  viaturaId,
  responsavelId,
  maxEntregas,
  maxMinutos,
  onFeito,
}: {
  rotaId: string;
  viaturaId: string | null;
  responsavelId: string | null;
  maxEntregas: number | null;
  maxMinutos: number | null;
  onFeito: () => void;
}) {
  const [maxE, setMaxE] = useState(maxEntregas ? String(maxEntregas) : "");
  const [maxM, setMaxM] = useState(maxMinutos ? String(maxMinutos) : "");

  const viaturasQ = useQuery({ queryKey: ["viaturas"], queryFn: () => lerViaturas() });
  const entregadoresQ = useQuery({
    queryKey: ["entregadores"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("utilizadores")
        .select("*")
        .eq("perfil", "entregador")
        .eq("ativo", true)
        .is("eliminado_em", null)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Utilizador[];
    },
  });

  const guardarViaturaM = useMutation({
    mutationFn: (v: string) => definirViaturaRota(rotaId, v || null),
    onSuccess: () => {
      toast.success("Viatura atualizada.");
      onFeito();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const guardarResponsavelM = useMutation({
    mutationFn: (v: string) => definirResponsavelRota(rotaId, v),
    onSuccess: () => {
      toast.success("Entregador atualizado.");
      onFeito();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const guardarLimitesM = useMutation({
    mutationFn: () =>
      definirLimitesRota(rotaId, maxE ? Number(maxE) : null, maxM ? Number(maxM) : null),
    onSuccess: () => {
      toast.success("Limites atualizados.");
      onFeito();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <Card className="mb-5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Planeamento</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Viatura</Label>
          <Select
            value={viaturaId ?? ""}
            onValueChange={(v) => guardarViaturaM.mutate(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sem viatura" />
            </SelectTrigger>
            <SelectContent>
              {(viaturasQ.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nome} · {Number(v.cubicagem_m3).toFixed(2)} m³
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Entregador</Label>
          <Select
            value={responsavelId ?? ""}
            onValueChange={(v) => guardarResponsavelM.mutate(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sem entregador" />
            </SelectTrigger>
            <SelectContent>
              {(entregadoresQ.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="lim-e">Máximo de entregas</Label>
          <Input
            id="lim-e"
            type="number"
            min={1}
            value={maxE}
            onChange={(e) => setMaxE(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="lim-m">Máximo de minutos de montagem</Label>
          <Input
            id="lim-m"
            type="number"
            min={1}
            value={maxM}
            onChange={(e) => setMaxM(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => guardarLimitesM.mutate()}
            disabled={guardarLimitesM.isPending}
          >
            Guardar limites
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DialogoEncaixar({
  rotaId,
  emCurso,
  onFechar,
  onFeito,
}: {
  rotaId: string;
  emCurso: boolean;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [procura, setProcura] = useState("");
  const pedidosQ = useQuery({
    queryKey: ["pedidos-por-agendar"],
    queryFn: () => lerPedidosPorAgendar(),
  });

  const agendar = useMutation({
    mutationFn: (pedidoId: string) =>
      agendarEntrega({ pedido_id: pedidoId, rota_id: rotaId, confirmar: emCurso }),
    onSuccess: (res) => {
      if (res.excedeu_capacidade) {
        toast.warning(`Encaixada, mas acima da capacidade. ${(res.avisos ?? []).join(" ")}`);
      } else {
        toast.success("Venda encaixada na rota.");
      }
      onFeito();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const termo = procura.trim().toLowerCase();
  const lista = (pedidosQ.data ?? []).filter(
    (p) =>
      !termo ||
      p.numero.toLowerCase().includes(termo) ||
      (p.cliente ?? "").toLowerCase().includes(termo) ||
      (p.localidade_entrega ?? "").toLowerCase().includes(termo) ||
      (p.cp4_entrega ?? "").includes(termo),
  );

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Encaixar vendas na rota"
      descricao={
        emCurso
          ? "A rota já arrancou: cada venda acrescentada fica registada nas alterações."
          : "Escolha as vendas prontas a entregar. Ultrapassar a capacidade avisa mas não bloqueia."
      }
      onGuardar={onFechar}
    >
      <Input
        value={procura}
        onChange={(e) => setProcura(e.target.value)}
        placeholder="Procurar por número, cliente, localidade ou código postal"
      />
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
        {lista.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {p.numero} · {p.cliente ?? "Cliente"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {p.localidade_entrega ?? "sem morada"} · {Number(p.cubicagem_m3).toFixed(2)} m³ ·{" "}
                {p.montagem_min} min · a receber {formatarDinheiro(p.pendente ?? 0)}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={agendar.isPending}
              onClick={() => agendar.mutate(p.id)}
            >
              <Plus className="mr-1 h-4 w-4" /> Encaixar
            </Button>
          </div>
        ))}
        {lista.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">Nenhuma venda por agendar.</p>
        )}
      </div>
    </DialogoForm>
  );
}

function DialogoCancelar({
  rotaId,
  onFechar,
  onFeito,
}: {
  rotaId: string;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const guardar = useMutation({
    mutationFn: () => cancelarRota(rotaId, motivo),
    onSuccess: () => {
      toast.success("Rota cancelada. As vendas voltaram a “pronto”.");
      onFeito();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Cancelar rota"
      descricao="O modelo mantém-se: só esta data é cancelada."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!motivo.trim()) {
          toast.error("Explique porque está a cancelar.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div>
        <Label htmlFor="mot-cancel">Motivo</Label>
        <Textarea
          id="mot-cancel"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
    </DialogoForm>
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
