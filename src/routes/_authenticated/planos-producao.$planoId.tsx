import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Gauge,
  Layers,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import {
  agruparNecessidades,
  aprovarPlano,
  explodirBom,
  gravarPlanoLinha,
  lerPlano,
  lerPlanoCarga,
  lerPlanoLinhas,
  removerPlanoLinha,
  simularPlano,
} from "@/lib/erp/mrp";
import { produtosParaProducao } from "@/lib/erp/producao";
import { ETIQUETA_ESTADO_PLANO, ETIQUETA_ROTA_BOM, type PlanoLinha } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/planos-producao/$planoId")({
  head: () => ({
    meta: [
      { title: "Plano de produção — UP Vendas" },
      {
        name: "description",
        content:
          "Linhas do plano, explosão da lista de materiais e carga por centro de trabalho na fábrica da UP Móveis.",
      },
      { property: "og:title", content: "Plano de produção — UP Vendas" },
      {
        property: "og:description",
        content: "Simule quantas vezes quiser; a aprovação é que cria as ordens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function data(valor: string | null) {
  return valor ? new Date(valor).toLocaleDateString("pt-PT") : "sem data";
}

function Pagina() {
  const { planoId } = useParams({ from: "/_authenticated/planos-producao/$planoId" });
  const { gerirProducao } = usePermissoes();
  const queryClient = useQueryClient();
  const [aAdicionar, setAAdicionar] = useState(false);
  const [aEditar, setAEditar] = useState<PlanoLinha | null>(null);
  const [aAprovar, setAAprovar] = useState(false);
  const [bomAberta, setBomAberta] = useState<PlanoLinha | null>(null);

  const planoQ = useQuery({ queryKey: ["plano", planoId], queryFn: () => lerPlano(planoId) });
  const linhasQ = useQuery({
    queryKey: ["plano-linhas", planoId],
    queryFn: () => lerPlanoLinhas(planoId),
  });
  const cargaQ = useQuery({
    queryKey: ["plano-carga", planoId],
    queryFn: () => lerPlanoCarga(planoId),
  });

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["plano", planoId] });
    queryClient.invalidateQueries({ queryKey: ["plano-linhas", planoId] });
    queryClient.invalidateQueries({ queryKey: ["plano-carga", planoId] });
    queryClient.invalidateQueries({ queryKey: ["planos"] });
  }

  const agrupar = useMutation({
    mutationFn: () => agruparNecessidades(planoId),
    onSuccess: (n) => {
      toast.success(
        n === 0
          ? "Não havia necessidades novas para juntar."
          : `${n} linha${n === 1 ? "" : "s"} juntada${n === 1 ? "" : "s"} ao plano.`,
      );
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const simular = useMutation({
    mutationFn: () => simularPlano(planoId),
    onSuccess: (r) => {
      toast.success(
        r.viavel === false
          ? "Simulação feita: há centros acima da capacidade."
          : "Simulação feita: o plano cabe na capacidade.",
      );
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const apagarLinha = useMutation({
    mutationFn: (linha: PlanoLinha) => removerPlanoLinha(linha.id),
    onSuccess: () => {
      toast.success("Linha retirada do plano.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const plano = planoQ.data;
  const linhas = linhasQ.data ?? [];
  const carga = cargaQ.data ?? [];
  const editavel = plano ? plano.estado === "rascunho" || plano.estado === "simulado" : false;

  if (planoQ.isPending) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (!plano)
    return <p className="text-muted-foreground">Este plano de produção não foi encontrado.</p>;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link to="/planos-producao">
          <ArrowLeft className="mr-2 h-4 w-4" /> Planos
        </Link>
      </Button>

      <CabecalhoPagina
        titulo={plano.nome}
        descricao={`${data(plano.data_inicio)} a ${data(plano.data_fim)} · ${plano.dias_uteis} dias úteis · ${plano.unidades} un.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{ETIQUETA_ESTADO_PLANO[plano.estado]}</Badge>
        {plano.viavel === false && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> não cabe na capacidade
          </Badge>
        )}
        {plano.viavel === true && (
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> cabe
          </Badge>
        )}
        {plano.forcado && <Badge variant="outline">aprovado à força</Badge>}
      </div>

      {gerirProducao && editavel && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => agrupar.mutate()} disabled={agrupar.isPending}>
            <Layers className="mr-2 h-4 w-4" /> Juntar necessidades do período
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAAdicionar(true)}>
            <Plus className="mr-2 h-4 w-4" /> Acrescentar produto
          </Button>
          <Button size="sm" onClick={() => simular.mutate()} disabled={simular.isPending}>
            <Gauge className="mr-2 h-4 w-4" /> Simular capacidade
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={linhas.length === 0}
            onClick={() => setAAprovar(true)}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar e criar ordens
          </Button>
        </div>
      )}

      <section className="mb-6 rounded-lg border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-medium">O que se faz</h2>
          <Badge variant="secondary">{linhas.length}</Badge>
        </header>
        {linhas.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Plano vazio. Junte as necessidades das vendas ou acrescente produtos à mão.
          </p>
        )}
        <ul className="divide-y">
          {linhas.map((linha) => (
            <li key={linha.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {linha.produto_nome}
                  <Badge variant="secondary">{linha.quantidade} un.</Badge>
                  {linha.urgente && <Badge variant="destructive">urgente</Badge>}
                  {linha.op_numero && (
                    <Link
                      to="/ordens-producao/$opId"
                      params={{ opId: linha.op_id ?? "" }}
                      className="text-xs underline"
                    >
                      {linha.op_numero}
                    </Link>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  prioridade {linha.prioridade} · precisa até {data(linha.data_necessaria)}
                  {linha.vendas > 0
                    ? ` · ${linha.vendas} venda${linha.vendas === 1 ? "" : "s"} à espera`
                    : " · para stock"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setBomAberta(linha)}>
                  Materiais
                </Button>
                {gerirProducao && editavel && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setAEditar(linha)}>
                      Editar
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Retirar ${linha.produto_nome} do plano`}
                      onClick={() => apagarLinha.mutate(linha)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-medium">Carga por centro</h2>
          {gerirProducao && editavel && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => simular.mutate()}
              disabled={simular.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Recalcular
            </Button>
          )}
        </header>
        {carga.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Ainda não simulou. A simulação não altera nada — pode correr à vontade.
          </p>
        )}
        <ul className="divide-y">
          {carga.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {c.centro_nome}
                  {c.acima_capacidade && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> falta{" "}
                      {Math.round(c.excesso_minutos).toLocaleString("pt-PT")} min
                    </Badge>
                  )}
                </p>
                <span className="text-xs text-muted-foreground">
                  {Math.round(c.minutos_necessarios).toLocaleString("pt-PT")} de{" "}
                  {Math.round(c.minutos_disponiveis).toLocaleString("pt-PT")} min ·{" "}
                  {Math.round(c.ocupacao_pct)}%
                </span>
              </div>
              <Progress
                className="mt-2 h-2"
                value={Math.min(Number(c.ocupacao_pct), 100)}
                aria-label={`Ocupação de ${c.centro_nome}`}
              />
            </li>
          ))}
        </ul>
      </section>

      {(aAdicionar || aEditar) && (
        <DialogoLinha
          planoId={planoId}
          linha={aEditar}
          onFechar={() => {
            setAAdicionar(false);
            setAEditar(null);
          }}
          onGuardado={recarregar}
        />
      )}

      {aAprovar && (
        <DialogoAprovar
          planoId={planoId}
          precisaJustificacao={plano.viavel === false || plano.viavel === null}
          onFechar={() => setAAprovar(false)}
          onAprovado={recarregar}
        />
      )}

      {bomAberta && <DialogoBom linha={bomAberta} onFechar={() => setBomAberta(null)} />}
    </div>
  );
}

function DialogoLinha({
  planoId,
  linha,
  onFechar,
  onGuardado,
}: {
  planoId: string;
  linha: PlanoLinha | null;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [produto, setProduto] = useState(linha?.produto_id ?? "");
  const [quantidade, setQuantidade] = useState(String(linha?.quantidade ?? 1));
  const [prioridade, setPrioridade] = useState(String(linha?.prioridade ?? 5));
  const [urgente, setUrgente] = useState(linha?.urgente ?? false);
  const [dataNecessaria, setDataNecessaria] = useState(linha?.data_necessaria ?? "");

  const produtosQ = useQuery({
    queryKey: ["produtos-producao", "producao"],
    queryFn: () => produtosParaProducao(true),
  });

  const guardar = useMutation({
    mutationFn: () =>
      gravarPlanoLinha({
        id: linha?.id ?? null,
        plano_id: planoId,
        produto_id: produto,
        quantidade: Number(quantidade) || 0,
        prioridade: Number(prioridade) || 5,
        urgente,
        data_necessaria: dataNecessaria || null,
      }),
    onSuccess: () => {
      toast.success("Linha guardada.");
      onGuardado();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={linha ? `Editar ${linha.produto_nome}` : "Acrescentar produto ao plano"}
      descricao="Pode acrescentar produção para stock, sem venda associada."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!produto || Number(quantidade) <= 0) {
          toast.error("Escolha o produto e uma quantidade acima de zero.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div>
        <Label htmlFor="lin-produto">Produto</Label>
        <Select value={produto} onValueChange={setProduto} disabled={Boolean(linha)}>
          <SelectTrigger id="lin-produto">
            <SelectValue placeholder="Escolher produto" />
          </SelectTrigger>
          <SelectContent>
            {(produtosQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome_cliente}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="lin-qt">Quantidade</Label>
          <Input
            id="lin-qt"
            type="number"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="lin-prio">Prioridade (1 = mais urgente)</Label>
          <Input
            id="lin-prio"
            type="number"
            value={prioridade}
            onChange={(e) => setPrioridade(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="lin-data">Precisa até</Label>
          <Input
            id="lin-data"
            type="date"
            value={dataNecessaria ?? ""}
            onChange={(e) => setDataNecessaria(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="lin-urg">Urgente</Label>
          <Select value={urgente ? "sim" : "nao"} onValueChange={(v) => setUrgente(v === "sim")}>
            <SelectTrigger id="lin-urg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nao">Não</SelectItem>
              <SelectItem value="sim">Sim</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </DialogoForm>
  );
}

function DialogoAprovar({
  planoId,
  precisaJustificacao,
  onFechar,
  onAprovado,
}: {
  planoId: string;
  precisaJustificacao: boolean;
  onFechar: () => void;
  onAprovado: () => void;
}) {
  const [justificacao, setJustificacao] = useState("");

  const aprovar = useMutation({
    mutationFn: () => aprovarPlano(planoId, justificacao || null),
    onSuccess: (r) => {
      toast.success(
        `${r.ops} ordem(ns) de produção, ${r.sub_ops} sub-ordem(ns) e ${r.compras} necessidade(s) de compra criadas.`,
      );
      onAprovado();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Aprovar o plano"
      descricao="A aprovação cria as ordens de produção, as sub-ordens dos componentes que se fabricam e as necessidades de compra do que falta."
      aGuardar={aprovar.isPending}
      onGuardar={() => {
        if (precisaJustificacao && !justificacao.trim()) {
          toast.error("Este plano não cabe na capacidade: escreva a justificação.");
          return;
        }
        aprovar.mutate();
      }}
    >
      {precisaJustificacao && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Este plano não está simulado como viável. Para aprovar assim tem de justificar — fica
          registado no histórico.
        </p>
      )}
      <div>
        <Label htmlFor="ap-just">Justificação</Label>
        <Input
          id="ap-just"
          value={justificacao}
          onChange={(e) => setJustificacao(e.target.value)}
          placeholder="Ex.: sábado com turno extra na costura."
        />
      </div>
    </DialogoForm>
  );
}

function DialogoBom({ linha, onFechar }: { linha: PlanoLinha; onFechar: () => void }) {
  const { data: bom, isPending } = useQuery({
    queryKey: ["bom", linha.produto_id, linha.quantidade],
    queryFn: () => explodirBom(linha.produto_id, linha.quantidade),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={`Materiais de ${linha.produto_nome}`}
      descricao={`Para ${linha.quantidade} un. A explosão pára onde já há stock.`}
      onGuardar={onFechar}
    >
      {isPending && <Skeleton className="h-32 w-full" />}
      <ul className="divide-y">
        {(bom ?? []).map((l, i) => (
          <li key={`${l.produto_id}-${i}`} className="py-2">
            <p
              className="flex flex-wrap items-center gap-2 text-sm"
              style={{ paddingLeft: `${(l.nivel - 1) * 12}px` }}
            >
              <span className="font-medium">{l.nome}</span>
              <Badge variant="secondary">{Number(l.quantidade_necessaria)} un.</Badge>
              <Badge variant={l.rota === "stock" ? "outline" : "default"}>
                {ETIQUETA_ROTA_BOM[l.rota]}
              </Badge>
            </p>
            <p
              className="mt-0.5 text-xs text-muted-foreground"
              style={{ paddingLeft: `${(l.nivel - 1) * 12}px` }}
            >
              há {Number(l.stock_vendavel)} em stock · faltam {Number(l.em_falta)}
            </p>
          </li>
        ))}
        {!isPending && (bom ?? []).length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">
            Este produto não tem lista de materiais definida.
          </li>
        )}
      </ul>
    </DialogoForm>
  );
}
