import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Layers, Plus, Trash2 } from "lucide-react";
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
import {
  eliminarComponente,
  gravarComponente,
  lerComponentes,
  lerEtapas,
  produtosParaProducao,
} from "@/lib/erp/producao";
import type { Componente } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/componentes")({
  head: () => ({
    meta: [
      { title: "Componentes — UP Vendas" },
      {
        name: "description",
        content:
          "Lista de materiais de cada produto fabricado pela UP Móveis: estruturas, espumas, tecidos e acessórios.",
      },
      { property: "og:title", content: "Componentes — UP Vendas" },
      {
        property: "og:description",
        content: "Defina o que entra em cada cama, sofá ou cortina, e em que etapa é consumido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const UNIDADES = ["un", "m", "m2", "kg"];

function Pagina() {
  const { gerirProducao } = usePermissoes();
  const queryClient = useQueryClient();
  const [produtoId, setProdutoId] = useState<string>("");
  const [aCriar, setACriar] = useState(false);
  const [aEditar, setAEditar] = useState<Componente | null>(null);

  const produtosQ = useQuery({
    queryKey: ["produtos-producao"],
    queryFn: () => produtosParaProducao(),
  });
  const listaQ = useQuery({
    queryKey: ["componentes", produtoId],
    queryFn: () => lerComponentes(produtoId || null),
  });

  const apagar = useMutation({
    mutationFn: (c: Componente) => eliminarComponente(c.id, "Removido da lista de materiais."),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["componentes"] });
      toast.success("Componente removido.");
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const linhas = listaQ.data ?? [];

  const grupos = useMemo(() => {
    const mapa = new Map<string, { nome: string; itens: Componente[] }>();
    for (const c of linhas) {
      if (!mapa.has(c.produto_id)) mapa.set(c.produto_id, { nome: c.produto_nome, itens: [] });
      mapa.get(c.produto_id)!.itens.push(c);
    }
    return Array.from(mapa.entries()).map(([id, g]) => ({ id, ...g }));
  }, [linhas]);

  return (
    <div>
      <CabecalhoPagina
        titulo="Componentes"
        descricao="O que entra em cada produto fabricado. Um componente pode ser ele próprio um produto com os seus componentes."
        acao={
          gerirProducao ? (
            <Button onClick={() => setACriar(true)}>
              <Plus className="mr-2 h-4 w-4" /> Novo componente
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <Label htmlFor="filtro-produto">Produto</Label>
        <Select value={produtoId || "todos"} onValueChange={(v) => setProdutoId(v === "todos" ? "" : v)}>
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

      {listaQ.isPending && <Skeleton className="h-48 w-full rounded-lg" />}

      {!listaQ.isPending && linhas.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Ainda não há listas de materiais.
        </div>
      )}

      <div className="space-y-4">
        {grupos.map((grupo) => (
          <section key={grupo.id} className="rounded-lg border bg-card">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <Layers className="h-4 w-4 text-primary" />
              <h2 className="font-medium">{grupo.nome}</h2>
              <Badge variant="secondary">{grupo.itens.length}</Badge>
            </header>
            <ul className="divide-y">
              {grupo.itens.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.componente_nome}
                      {c.tem_subcomponentes && (
                        <Badge variant="outline" className="ml-2">
                          tem componentes
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.quantidade} {c.unidade}
                      {c.etapa_nome ? ` · ${c.etapa_nome}` : " · sem etapa"} · stock{" "}
                      {c.componente_stock}
                      {c.observacoes ? ` · ${c.observacoes}` : ""}
                    </p>
                  </div>
                  {gerirProducao && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAEditar(c)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover ${c.componente_nome}`}
                        onClick={() => apagar.mutate(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {(aCriar || aEditar) && (
        <DialogoComponente
          componente={aEditar}
          produtoPreSelecionado={produtoId}
          onFechar={() => {
            setACriar(false);
            setAEditar(null);
          }}
        />
      )}
    </div>
  );
}

function DialogoComponente({
  componente,
  produtoPreSelecionado,
  onFechar,
}: {
  componente: Componente | null;
  produtoPreSelecionado: string;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [produto, setProduto] = useState(componente?.produto_id ?? produtoPreSelecionado);
  const [filho, setFilho] = useState(componente?.componente_id ?? "");
  const [quantidade, setQuantidade] = useState(String(componente?.quantidade ?? 1));
  const [unidade, setUnidade] = useState(componente?.unidade ?? "un");
  const [etapa, setEtapa] = useState(componente?.etapa_id ?? "");
  const [observacoes, setObservacoes] = useState(componente?.observacoes ?? "");

  const produtosQ = useQuery({
    queryKey: ["produtos-producao"],
    queryFn: () => produtosParaProducao(),
  });
  const etapasQ = useQuery({ queryKey: ["etapas-producao"], queryFn: () => lerEtapas() });

  const guardar = useMutation({
    mutationFn: () =>
      gravarComponente({
        id: componente?.id ?? null,
        produto_id: produto,
        componente_id: filho,
        quantidade: Number(quantidade),
        unidade,
        etapa_id: etapa || null,
        observacoes: observacoes || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["componentes"] });
      toast.success("Componente guardado.");
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const produtos = produtosQ.data ?? [];

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={componente ? "Editar componente" : "Novo componente"}
      descricao="Um produto não pode entrar em si próprio, nem através de outro componente."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!produto || !filho) {
          toast.error("Escolha o produto e o componente.");
          return;
        }
        if (produto === filho) {
          toast.error("Um produto não pode ser componente de si próprio.");
          return;
        }
        if (!quantidade || Number(quantidade) <= 0) {
          toast.error("Indique a quantidade.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div>
        <Label htmlFor="c-produto">Produto que se fabrica</Label>
        <Select value={produto} onValueChange={setProduto}>
          <SelectTrigger id="c-produto">
            <SelectValue placeholder="Escolha o produto" />
          </SelectTrigger>
          <SelectContent>
            {produtos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome_cliente}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="c-filho">Componente que entra</Label>
        <Select value={filho} onValueChange={setFilho}>
          <SelectTrigger id="c-filho">
            <SelectValue placeholder="Escolha o componente" />
          </SelectTrigger>
          <SelectContent>
            {produtos
              .filter((p) => p.id !== produto)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome_cliente}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="c-qt">Quantidade</Label>
          <Input
            id="c-qt"
            type="number"
            min={0}
            step="0.001"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="c-un">Unidade</Label>
          <Select value={unidade} onValueChange={setUnidade}>
            <SelectTrigger id="c-un">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIDADES.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="c-etapa">Consumido na etapa</Label>
        <Select value={etapa || "nenhuma"} onValueChange={(v) => setEtapa(v === "nenhuma" ? "" : v)}>
          <SelectTrigger id="c-etapa">
            <SelectValue placeholder="Sem etapa definida" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhuma">Sem etapa definida</SelectItem>
            {(etapasQ.data ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="c-obs">Observações</Label>
        <Textarea
          id="c-obs"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </div>
    </DialogoForm>
  );
}
