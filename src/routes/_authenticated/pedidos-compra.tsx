import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, FileQuestion, Plus, Send, X } from "lucide-react";
import { useState } from "react";
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
import {
  adicionarItemPedidoCompra,
  aprovarPedidoCompra,
  converterPedidoCompra,
  criarPedidoCompra,
  lerItensPedidoCompra,
  recusarPedidoCompra,
  submeterPedidoCompra,
} from "@/lib/erp/compras";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import {
  DESTINOS_COMPRA,
  ETIQUETA_PEDIDO_COMPRA,
  formatarData,
  formatarDinheiro,
  type PedidoCompra,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/pedidos-compra")({
  head: () => ({
    meta: [
      { title: "Pedidos de compra — UP Vendas" },
      {
        name: "description",
        content:
          "Pedidos internos de compra da UP Móveis, com aprovação da Administração e conversão em encomenda.",
      },
      { property: "og:title", content: "Pedidos de compra — UP Vendas" },
      {
        property: "og:description",
        content: "Peça, aprove e converta compras internas em ordens de compra.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaPedidosCompra,
});

interface LinhaNova {
  descricao: string;
  quantidade: string;
  custo: string;
}

function PaginaPedidosCompra() {
  const { adm, comprar } = usePermissoes();
  const queryClient = useQueryClient();
  const [aCriar, setACriar] = useState(false);
  const [destino, setDestino] = useState("stock");
  const [urgencia, setUrgencia] = useState("normal");
  const [justificacao, setJustificacao] = useState("");
  const [fornecedorSugerido, setFornecedorSugerido] = useState("");
  const [linhas, setLinhas] = useState<LinhaNova[]>([
    { descricao: "", quantidade: "1", custo: "0" },
  ]);
  const [aRecusar, setARecusar] = useState<PedidoCompra | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [aConverter, setAConverter] = useState<PedidoCompra | null>(null);
  const [fornecedorOc, setFornecedorOc] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const pedidos = useQuery({
    queryKey: ["pedidos-compra"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_pedidos_compra")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PedidoCompra[];
    },
  });

  const fornecedores = useQuery({
    queryKey: ["fornecedores-select"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_fornecedores")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });

  const itens = useQuery({
    queryKey: ["pedido-compra-itens", aberto],
    queryFn: () => lerItensPedidoCompra(aberto!),
    enabled: Boolean(aberto),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["pedidos-compra"] });

  const criar = useMutation({
    mutationFn: async () => {
      const validas = linhas.filter((l) => l.descricao.trim());
      if (validas.length === 0) throw new Error("Escreva pelo menos um artigo a comprar.");
      if (!justificacao.trim()) throw new Error("Explique porque é precisa esta compra.");
      const id = await criarPedidoCompra({ destino, justificacao, urgencia });
      for (const l of validas) {
        await adicionarItemPedidoCompra({
          pedido_compra_id: id,
          descricao_livre: l.descricao.trim(),
          quantidade: Number(l.quantidade.replace(",", ".")) || 1,
          custo_estimado: Number(l.custo.replace(",", ".")) || 0,
          fornecedor_sugerido_id: fornecedorSugerido || null,
        });
      }
      return id;
    },
    onSuccess: async () => {
      setACriar(false);
      setJustificacao("");
      setFornecedorSugerido("");
      setLinhas([{ descricao: "", quantidade: "1", custo: "0" }]);
      await invalidar();
      toast.success("Pedido criado em rascunho. Submeta para aprovação.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const submeter = useMutation({
    mutationFn: submeterPedidoCompra,
    onSuccess: async (estado) => {
      await invalidar();
      toast.success(
        estado === "aprovado"
          ? "Pedido aprovado automaticamente: está abaixo do limite."
          : "Pedido submetido à Administração.",
      );
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const aprovar = useMutation({
    mutationFn: aprovarPedidoCompra,
    onSuccess: async () => {
      await invalidar();
      toast.success("Pedido aprovado.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const recusar = useMutation({
    mutationFn: () => recusarPedidoCompra(aRecusar!.id, motivoRecusa),
    onSuccess: async () => {
      setARecusar(null);
      setMotivoRecusa("");
      await invalidar();
      toast.success("Pedido recusado.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const converter = useMutation({
    mutationFn: () => converterPedidoCompra(aConverter!.id, fornecedorOc),
    onSuccess: async () => {
      setAConverter(null);
      setFornecedorOc("");
      await invalidar();
      await queryClient.invalidateQueries({ queryKey: ["ordens-compra"] });
      toast.success("Ordem de compra criada a partir do pedido.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  return (
    <div>
      <CabecalhoPagina
        titulo="Pedidos de compra"
        descricao="Compras pedidas pela equipa que não vêm de uma venda nem do stock mínimo."
        acao={
          <Button onClick={() => setACriar(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo pedido
          </Button>
        }
      />

      {pedidos.isPending && <Skeleton className="h-56 w-full rounded-lg" />}

      {!pedidos.isPending && (pedidos.data ?? []).length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Ainda não há pedidos de compra.
        </div>
      )}

      <ul className="space-y-2">
        {(pedidos.data ?? []).map((p) => (
          <li key={p.id} className="rounded-lg border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <FileQuestion className="h-4 w-4 shrink-0 text-primary" />
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setAberto(aberto === p.id ? null : p.id)}
              >
                <p className="truncate text-sm font-medium">
                  {p.numero} · {p.solicitante_nome}
                  {p.urgencia === "urgente" ? " · Urgente" : ""}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatarData(p.criado_em)} · {p.n_itens} artigos ·{" "}
                  {formatarDinheiro(p.valor_estimado)}
                  {p.oc_numero ? ` · ${p.oc_numero}` : ""}
                </p>
              </button>
              <Badge variant="secondary" className="text-[11px]">
                {ETIQUETA_PEDIDO_COMPRA[p.estado] ?? p.estado}
              </Badge>
              <div className="flex gap-2">
                {p.estado === "rascunho" && (
                  <Button size="sm" onClick={() => submeter.mutate(p.id)}>
                    <Send className="mr-2 h-4 w-4" /> Submeter
                  </Button>
                )}
                {p.estado === "submetido" && adm && (
                  <>
                    <Button size="sm" onClick={() => aprovar.mutate(p.id)}>
                      <Check className="mr-2 h-4 w-4" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setARecusar(p)}>
                      <X className="mr-2 h-4 w-4" /> Recusar
                    </Button>
                  </>
                )}
                {p.estado === "aprovado" && comprar && (
                  <Button size="sm" onClick={() => setAConverter(p)}>
                    Criar ordem de compra
                  </Button>
                )}
              </div>
            </div>

            {p.motivo_recusa && (
              <p className="mt-2 text-xs text-destructive">Recusado: {p.motivo_recusa}</p>
            )}

            {aberto === p.id && (
              <div className="mt-3 border-t pt-3 text-sm">
                <p className="mb-2 text-muted-foreground">{p.justificacao}</p>
                <ul className="space-y-1">
                  {(itens.data ?? []).map((i) => (
                    <li key={i.id} className="text-muted-foreground">
                      {i.quantidade} × {i.produto_nome ?? i.descricao_livre} ·{" "}
                      {formatarDinheiro(i.custo_estimado)}
                      {i.fornecedor_sugerido_nome ? ` · ${i.fornecedor_sugerido_nome}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>

      <DialogoForm
        aberto={aCriar}
        onFechar={() => setACriar(false)}
        titulo="Novo pedido de compra"
        descricao="Diga o que é preciso comprar e porquê."
        aGuardar={criar.isPending}
        onGuardar={() => criar.mutate()}
      >
        <div className="space-y-2">
          <Label>Destino</Label>
          <Select value={destino} onValueChange={setDestino}>
            <SelectTrigger aria-label="Destino da compra">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DESTINOS_COMPRA.map((d) => (
                <SelectItem key={d.valor} value={d.valor}>
                  {d.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Urgência</Label>
          <Select value={urgencia} onValueChange={setUrgencia}>
            <SelectTrigger aria-label="Urgência">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Fornecedor sugerido</Label>
          <Select value={fornecedorSugerido} onValueChange={setFornecedorSugerido}>
            <SelectTrigger aria-label="Fornecedor sugerido">
              <SelectValue placeholder="Sem sugestão" />
            </SelectTrigger>
            <SelectContent>
              {(fornecedores.data ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Artigos</Label>
          {linhas.map((l, indice) => (
            <div key={indice} className="grid grid-cols-6 gap-2">
              <Input
                className="col-span-4"
                placeholder="O que é preciso"
                aria-label={`Artigo ${indice + 1}`}
                value={l.descricao}
                onChange={(e) =>
                  setLinhas((atual) =>
                    atual.map((x, i) => (i === indice ? { ...x, descricao: e.target.value } : x)),
                  )
                }
              />
              <Input
                inputMode="decimal"
                aria-label={`Quantidade do artigo ${indice + 1}`}
                value={l.quantidade}
                onChange={(e) =>
                  setLinhas((atual) =>
                    atual.map((x, i) => (i === indice ? { ...x, quantidade: e.target.value } : x)),
                  )
                }
              />
              <Input
                inputMode="decimal"
                aria-label={`Custo estimado do artigo ${indice + 1}`}
                value={l.custo}
                onChange={(e) =>
                  setLinhas((atual) =>
                    atual.map((x, i) => (i === indice ? { ...x, custo: e.target.value } : x)),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLinhas((atual) => [...atual, { descricao: "", quantidade: "1", custo: "0" }])
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Outro artigo
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="justificacao">Justificação</Label>
          <Textarea
            id="justificacao"
            value={justificacao}
            onChange={(e) => setJustificacao(e.target.value)}
          />
        </div>
      </DialogoForm>

      <DialogoForm
        aberto={Boolean(aRecusar)}
        onFechar={() => setARecusar(null)}
        titulo="Recusar pedido"
        aGuardar={recusar.isPending}
        onGuardar={() => recusar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="motivo-recusa">Motivo da recusa</Label>
          <Textarea
            id="motivo-recusa"
            value={motivoRecusa}
            onChange={(e) => setMotivoRecusa(e.target.value)}
          />
        </div>
      </DialogoForm>

      <DialogoForm
        aberto={Boolean(aConverter)}
        onFechar={() => setAConverter(null)}
        titulo="Criar ordem de compra"
        descricao="Escolha o fornecedor a quem vai encomendar."
        aGuardar={converter.isPending}
        onGuardar={() => converter.mutate()}
      >
        <div className="space-y-2">
          <Label>Fornecedor</Label>
          <Select value={fornecedorOc} onValueChange={setFornecedorOc}>
            <SelectTrigger aria-label="Fornecedor da ordem de compra">
              <SelectValue placeholder="Escolha o fornecedor" />
            </SelectTrigger>
            <SelectContent>
              {(fornecedores.data ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogoForm>
    </div>
  );
}
