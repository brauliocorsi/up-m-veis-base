import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { gravarRoteiro, lerRoteiro, minutosEtapa, removerRoteiro } from "@/lib/erp/mrp";
import { lerEtapas, produtosParaProducao } from "@/lib/erp/producao";
import type { RoteiroLinha } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/roteiros")({
  head: () => ({
    meta: [
      { title: "Roteiros de fabrico — UP Vendas" },
      {
        name: "description",
        content:
          "Tempos de preparação e por unidade em cada etapa, produto a produto, na fábrica da UP Móveis.",
      },
      { property: "og:title", content: "Roteiros de fabrico — UP Vendas" },
      {
        property: "og:description",
        content: "Dez camas pagam o setup da costura uma vez, não dez.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { gerirProducao } = usePermissoes();
  const queryClient = useQueryClient();
  const [produtoId, setProdutoId] = useState("");
  const [aCriar, setACriar] = useState(false);
  const [aEditar, setAEditar] = useState<RoteiroLinha | null>(null);
  const [unidades, setUnidades] = useState("10");

  const produtosQ = useQuery({
    queryKey: ["produtos-producao"],
    queryFn: () => produtosParaProducao(),
  });
  const listaQ = useQuery({
    queryKey: ["roteiros", produtoId],
    queryFn: () => lerRoteiro(produtoId || null),
  });

  const apagar = useMutation({
    mutationFn: (linha: RoteiroLinha) => removerRoteiro(linha.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roteiros"] });
      toast.success("Etapa retirada do roteiro.");
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const linhas = listaQ.data ?? [];
  const n = Math.max(Number(unidades) || 0, 0);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { nome: string; itens: RoteiroLinha[] }>();
    for (const l of linhas) {
      if (!mapa.has(l.produto_id)) mapa.set(l.produto_id, { nome: l.produto_nome, itens: [] });
      mapa.get(l.produto_id)!.itens.push(l);
    }
    return Array.from(mapa.entries()).map(([id, g]) => ({ id, ...g }));
  }, [linhas]);

  return (
    <div>
      <CabecalhoPagina
        titulo="Roteiros de fabrico"
        descricao="O tempo de uma etapa para N unidades é o setup mais o tempo unitário vezes N. É isto que torna o agrupamento vantajoso."
        acao={
          gerirProducao ? (
            <Button onClick={() => setACriar(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova etapa de roteiro
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
        <div>
          <Label htmlFor="filtro-produto">Produto</Label>
          <Select
            value={produtoId || "todos"}
            onValueChange={(v) => setProdutoId(v === "todos" ? "" : v)}
          >
            <SelectTrigger id="filtro-produto">
              <SelectValue placeholder="Todos os produtos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os produtos</SelectItem>
              {(produtosQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome_cliente}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="simular-un">Ver tempos para quantas unidades</Label>
          <Input
            id="simular-un"
            type="number"
            value={unidades}
            onChange={(e) => setUnidades(e.target.value)}
          />
        </div>
      </div>

      {listaQ.isPending && <Skeleton className="h-40 w-full rounded-lg" />}

      {!listaQ.isPending && linhas.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Ainda não há tempos definidos.
        </div>
      )}

      <div className="space-y-4">
        {grupos.map((grupo) => {
          const total = grupo.itens.reduce((soma, l) => soma + minutosEtapa(l, n), 0);
          return (
            <section key={grupo.id} className="rounded-lg border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="font-medium">{grupo.nome}</h2>
                  <Badge variant="secondary">{grupo.itens.length} etapas</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {n} un. = {total.toLocaleString("pt-PT")} min
                </span>
              </header>
              <ul className="divide-y">
                {grupo.itens.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {l.ordem}. {l.etapa_nome}
                        {l.centro_nome ? ` · ${l.centro_nome}` : " · sem centro"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        setup {l.tempo_setup_min} min + {l.tempo_unitario_min} min/un. ={" "}
                        {minutosEtapa(l, n).toLocaleString("pt-PT")} min para {n} un.
                        {l.instrucoes ? ` · ${l.instrucoes}` : ""}
                      </p>
                    </div>
                    {gerirProducao && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setAEditar(l)}>
                          Editar
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Retirar ${l.etapa_nome}`}
                          onClick={() => apagar.mutate(l)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {(aCriar || aEditar) && (
        <DialogoRoteiro
          linha={aEditar}
          produtoIdInicial={produtoId}
          onFechar={() => {
            setACriar(false);
            setAEditar(null);
          }}
          onGuardado={() => queryClient.invalidateQueries({ queryKey: ["roteiros"] })}
        />
      )}
    </div>
  );
}

function DialogoRoteiro({
  linha,
  produtoIdInicial,
  onFechar,
  onGuardado,
}: {
  linha: RoteiroLinha | null;
  produtoIdInicial: string;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [produto, setProduto] = useState(linha?.produto_id ?? produtoIdInicial);
  const [etapa, setEtapa] = useState(linha?.etapa_id ?? "");
  const [ordem, setOrdem] = useState(String(linha?.ordem ?? 1));
  const [setup, setSetup] = useState(String(linha?.tempo_setup_min ?? 0));
  const [unitario, setUnitario] = useState(String(linha?.tempo_unitario_min ?? 0));
  const [instrucoes, setInstrucoes] = useState(linha?.instrucoes ?? "");

  const produtosQ = useQuery({
    queryKey: ["produtos-producao"],
    queryFn: () => produtosParaProducao(),
  });
  const etapasQ = useQuery({ queryKey: ["etapas-producao"], queryFn: () => lerEtapas() });

  const guardar = useMutation({
    mutationFn: () =>
      gravarRoteiro({
        id: linha?.id ?? null,
        produto_id: produto,
        etapa_id: etapa,
        ordem: Number(ordem) || 1,
        tempo_setup_min: Number(setup) || 0,
        tempo_unitario_min: Number(unitario) || 0,
        instrucoes,
      }),
    onSuccess: () => {
      toast.success("Roteiro guardado.");
      onGuardado();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={linha ? `Editar ${linha.etapa_nome}` : "Nova etapa de roteiro"}
      descricao="Tempo de preparação da máquina e tempo por peça."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!produto || !etapa) {
          toast.error("Escolha o produto e a etapa.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="rt-produto">Produto</Label>
          <Select value={produto} onValueChange={setProduto}>
            <SelectTrigger id="rt-produto">
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
        <div>
          <Label htmlFor="rt-etapa">Etapa</Label>
          <Select value={etapa} onValueChange={setEtapa}>
            <SelectTrigger id="rt-etapa">
              <SelectValue placeholder="Escolher etapa" />
            </SelectTrigger>
            <SelectContent>
              {(etapasQ.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="rt-ordem">Ordem</Label>
          <Input id="rt-ordem" type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="rt-setup">Setup (min)</Label>
          <Input id="rt-setup" type="number" value={setup} onChange={(e) => setSetup(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="rt-unit">Por unidade (min)</Label>
          <Input
            id="rt-unit"
            type="number"
            step="0.01"
            value={unitario}
            onChange={(e) => setUnitario(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="rt-instr">Instruções</Label>
          <Textarea
            id="rt-instr"
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            placeholder="O que o operador precisa de saber nesta etapa."
          />
        </div>
      </div>
    </DialogoForm>
  );
}
