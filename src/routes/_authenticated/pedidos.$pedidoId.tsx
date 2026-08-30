import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Package,
  Plus,
  Printer,
  Search,
  Ticket,
  Trash2,
  Truck,
  Undo2,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import {
  BadgeFornecimento,
  ProgressoFornecimento,
  type ContextoFornecimento,
} from "@/components/erp/fornecimento";
import { PainelEntrega } from "@/components/erp/painel-entrega";
import { PainelPagamentos } from "@/components/erp/painel-pagamentos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fornecimentoDoPedido, necessidadesDoPedido } from "@/lib/erp/compras";
import { erp, mensagemErro } from "@/lib/erp/db";
import { gerarNotaEncomenda } from "@/lib/erp/nota.functions";
import { listar } from "@/lib/erp/listar";
import {
  ETIQUETA_ITEM,
  ETIQUETA_PEDIDO,
  formatarDataCurta,
  formatarDinheiro,
  ORIGENS_PEDIDO,
  type LinhaStock,
  type Motivo,
  type Pedido,
  type PedidoItem,
  type Produto,
  type Servico,
} from "@/lib/erp/tipos";
import {
  adicionarItem,
  alterarDataEntrega,
  cancelarPedido,
  confirmarPedido,
  guardarItem,
  guardarPedido,
  lerItens,
  lerPedido,
  procurarCupao,
  reabrirPedido,
  removerItem,
} from "@/lib/erp/vendas";

export const Route = createFileRoute("/_authenticated/pedidos/$pedidoId")({
  head: () => ({
    meta: [
      { title: "Venda — UP Vendas" },
      {
        name: "description",
        content:
          "Ecrã de venda da UP Móveis: escolher produtos, calcular totais e confirmar o pedido com data de entrega.",
      },
      { property: "og:title", content: "Venda — UP Vendas" },
      { property: "og:description", content: "Ecrã de venda da UP Móveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EcraVenda,
});

function EcraVenda() {
  const { pedidoId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [cancelar, setCancelar] = useState(false);
  const [reabrir, setReabrir] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const pedido = useQuery({ queryKey: ["pedido", pedidoId], queryFn: () => lerPedido(pedidoId) });
  const itens = useQuery({ queryKey: ["pedido-itens", pedidoId], queryFn: () => lerItens(pedidoId) });
  const ocs = useQuery({
    queryKey: ["pedido-fornecimento", pedidoId],
    queryFn: () => fornecimentoDoPedido(pedidoId),
  });
  const necessidades = useQuery({
    queryKey: ["pedido-necessidades", pedidoId],
    queryFn: () => necessidadesDoPedido(pedidoId),
  });
  const contexto: ContextoFornecimento = {
    ocs: ocs.data ?? [],
    necessidades: necessidades.data ?? [],
  };

  const nota = useMutation({
    mutationFn: (regenerar: boolean) =>
      gerarNotaEncomenda({ data: { pedido_id: pedidoId, regenerar } }),
    onSuccess: (r) => {
      window.open(r.url, "_blank", "noopener,noreferrer");
      toast.success(`Nota de encomenda ${r.numero} pronta a imprimir.`);
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  function recarregar() {
    qc.invalidateQueries({ queryKey: ["pedido", pedidoId] });
    qc.invalidateQueries({ queryKey: ["pedido-itens", pedidoId] });
    qc.invalidateQueries({ queryKey: ["pedido-fornecimento", pedidoId] });
    qc.invalidateQueries({ queryKey: ["pedido-necessidades", pedidoId] });
  }

  const guardar = useMutation({
    mutationFn: (campos: Record<string, unknown>) => guardarPedido(pedidoId, campos),
    onSuccess: recarregar,
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const mudarItem = useMutation({
    mutationFn: ({ id, campos }: { id: string; campos: Record<string, unknown> }) =>
      guardarItem(id, campos),
    onSuccess: recarregar,
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const apagarItem = useMutation({
    mutationFn: (id: string) => removerItem(id),
    onSuccess: recarregar,
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const confirmarVenda = useMutation({
    mutationFn: () => confirmarPedido(pedidoId),
    onSuccess: (r) => {
      setConfirmar(false);
      recarregar();
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(`Pedido ${r.numero} confirmado. Entrega a ${formatarDataCurta(r.data_entrega)}.`, {
        action: { label: "Imprimir nota", onClick: () => nota.mutate(true) },
      });
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const p = pedido.data;

  if (pedido.isLoading || !p) {
    return <p className="text-sm text-muted-foreground">A carregar a venda…</p>;
  }

  const editavel = p.estado === "orcamento";
  const linhas = itens.data ?? [];

  return (
    <>
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/pedidos">
            <ArrowLeft className="mr-2 h-4 w-4" /> Vendas
          </Link>
        </Button>
      </div>

      <CabecalhoPagina
        titulo={p.numero}
        descricao={`${p.cliente_nome} · ${p.cliente_telefone ?? "sem telefone"}`}
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{ETIQUETA_PEDIDO[p.estado]}</Badge>
            {editavel && (
              <Button onClick={() => setConfirmar(true)} disabled={linhas.length === 0}>
                <Check className="mr-2 h-4 w-4" /> Confirmar venda
              </Button>
            )}
            {p.tipo === "pedido" && (
              <Button variant="outline" onClick={() => nota.mutate(false)} disabled={nota.isPending}>
                <Printer className="mr-2 h-4 w-4" /> Nota de encomenda
              </Button>
            )}
            {!editavel && p.estado !== "cancelado" && (
              <Button variant="outline" onClick={() => setReabrir(true)}>
                <Undo2 className="mr-2 h-4 w-4" /> Reabrir
              </Button>
            )}
            {p.estado !== "cancelado" && p.estado !== "entregue" && (
              <Button variant="outline" onClick={() => setCancelar(true)}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {p.tipo === "pedido" && <ProgressoFornecimento linhas={linhas} contexto={contexto} />}

          {editavel && <Procurador pedidoId={pedidoId} proximaLinha={linhas.length + 1} onAdicionado={recarregar} />}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Linhas da venda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {linhas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Ainda não há nada nesta venda. Procure um produto acima.
                </p>
              )}
              {linhas.map((item) => (
                <LinhaItem
                  key={item.id}
                  item={item}
                  editavel={editavel}
                  contexto={contexto}
                  onGuardar={(campos) => mudarItem.mutate({ id: item.id, campos })}
                  onApagar={() => apagarItem.mutate(item.id)}
                />
              ))}
            </CardContent>
          </Card>

          <Entrega pedido={p} editavel={editavel} onGuardar={(c) => guardar.mutate(c)} onAlterado={recarregar} />
        </div>

        <div className="space-y-4">
          <Totais pedido={p} />
          <Descontos pedido={p} editavel={editavel} onGuardar={(c) => guardar.mutate(c)} />
          {p.tipo === "pedido" ? <PainelPagamentos pedido={p} /> : null}
          {p.tipo === "pedido" ? <PainelEntrega pedido={p} /> : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Observações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                defaultValue={p.observacoes ?? ""}
                placeholder="O que o cliente pediu…"
                disabled={!editavel}
                onBlur={(e) => {
                  if (e.target.value !== (p.observacoes ?? "")) {
                    guardar.mutate({ observacoes: e.target.value || null });
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <DialogoConfirmar
        aberto={confirmar}
        pedidoData={p.data_entrega_prevista}
        total={p.total}
        aGuardar={confirmarVenda.isPending}
        onFechar={() => setConfirmar(false)}
        onConfirmar={() => confirmarVenda.mutate()}
      />
      <DialogoCancelar
        aberto={cancelar}
        onFechar={() => setCancelar(false)}
        onFeito={() => {
          recarregar();
          navigate({ to: "/pedidos" });
        }}
        pedidoId={pedidoId}
      />
      <DialogoReabrir
        aberto={reabrir}
        onFechar={() => setReabrir(false)}
        onFeito={recarregar}
        pedidoId={pedidoId}
      />
    </>
  );
}

// ------------------------------------------------------------------ procura
function Procurador({
  pedidoId,
  proximaLinha,
  onAdicionado,
}: {
  pedidoId: string;
  proximaLinha: number;
  onAdicionado: () => void;
}) {
  const [termo, setTermo] = useState("");

  const produtos = useQuery({
    queryKey: ["procura-produtos", termo],
    enabled: termo.trim().length >= 2,
    queryFn: async () => {
      const [prod, serv] = await Promise.all([
        listar<Produto>({
          tabela: "v_produtos",
          camposPesquisa: ["nome_cliente", "cod_barras", "cod_modelo"],
          pesquisa: termo,
          ordenarPor: "nome_cliente",
          ascendente: true,
          tamanho: 8,
          filtros: [
            { campo: "ativo", valor: true },
            { campo: "vendavel", valor: true },
          ],
        }),
        listar<Servico>({
          tabela: "v_servicos",
          camposPesquisa: ["nome", "codigo"],
          pesquisa: termo,
          ordenarPor: "nome",
          ascendente: true,
          tamanho: 4,
          filtros: [{ campo: "ativo", valor: true }],
        }),
      ]);
      const ids = prod.linhas.map((x) => x.id);
      let stock: LinhaStock[] = [];
      if (ids.length > 0) {
        const { data } = await erp().from("v_stock").select("*").in("produto_id", ids);
        stock = (data ?? []) as LinhaStock[];
      }
      return { produtos: prod.linhas, servicos: serv.linhas, stock };
    },
  });

  const adicionar = useMutation({
    mutationFn: (campos: Parameters<typeof adicionarItem>[0]) => adicionarItem(campos),
    onSuccess: () => {
      setTermo("");
      onAdicionado();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Procurar produto ou serviço (nome ou código de barras)…"
            className="h-12 pl-9 text-base"
            aria-label="Procurar produto ou serviço"
          />
        </div>

        {termo.trim().length >= 2 && (
          <div className="space-y-1">
            {(produtos.data?.produtos ?? []).map((prod) => {
              const linhaStock = produtos.data?.stock.find((s) => s.produto_id === prod.id);
              const preco = prod.preco_promocional ?? prod.preco_base ?? 0;
              return (
                <button
                  key={prod.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() =>
                    adicionar.mutate({
                      pedido_id: pedidoId,
                      linha: proximaLinha,
                      produto_id: prod.id,
                      quantidade: 1,
                      preco_unitario: Number(preco),
                      montagem_incluida: prod.montagem_obrigatoria,
                    })
                  }
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{prod.nome_cliente}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {prod.cod_barras} ·{" "}
                      {prod.tipo_fornecimento === "stock"
                        ? `${linhaStock?.prometivel ?? 0} disponíveis`
                        : prod.tipo_fornecimento === "producao"
                          ? "produção própria"
                          : "por encomenda"}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">{formatarDinheiro(preco)}</span>
                </button>
              );
            })}
            {(produtos.data?.servicos ?? []).map((serv) => (
              <button
                key={serv.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() =>
                  adicionar.mutate({
                    pedido_id: pedidoId,
                    linha: proximaLinha,
                    servico_id: serv.id,
                    quantidade: 1,
                    preco_unitario: Number(serv.preco_base),
                  })
                }
              >
                <span className="flex items-center gap-2 font-medium">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  {serv.nome}
                </span>
                <span className="font-medium">{formatarDinheiro(serv.preco_base)}</span>
              </button>
            ))}
            {produtos.data &&
              produtos.data.produtos.length === 0 &&
              produtos.data.servicos.length === 0 && (
                <p className="px-1 py-2 text-sm text-muted-foreground">Nada encontrado.</p>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------- linhas
function LinhaItem({
  item,
  editavel,
  contexto,
  onGuardar,
  onApagar,
}: {
  item: PedidoItem;
  editavel: boolean;
  contexto: ContextoFornecimento;
  onGuardar: (campos: Record<string, unknown>) => void;
  onApagar: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.descricao}</p>
          <p className="text-xs text-muted-foreground">
            {item.cod_barras ?? "Serviço"} · {ETIQUETA_ITEM[item.estado]}
            {item.data_prevista ? ` · ${formatarDataCurta(item.data_prevista)}` : ""}
          </p>
          <div className="mt-1">
            <BadgeFornecimento item={item} contexto={contexto} />
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold">{formatarDinheiro(item.total_linha)}</p>
          {item.preco_unitario < item.preco_tabela && (
            <p className="text-xs text-muted-foreground line-through">
              {formatarDinheiro(item.preco_tabela * item.quantidade)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Quantidade</Label>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            defaultValue={item.quantidade}
            disabled={!editavel}
            onBlur={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              if (v !== item.quantidade) onGuardar({ quantidade: v });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preço unitário</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            defaultValue={item.preco_unitario}
            disabled={!editavel}
            onBlur={(e) => {
              const v = Number(e.target.value) || 0;
              if (v !== Number(item.preco_unitario)) onGuardar({ preco_unitario: v });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Desconto %</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            max={100}
            inputMode="decimal"
            defaultValue={item.desconto_pct}
            disabled={!editavel}
            onBlur={(e) => {
              const v = Number(e.target.value) || 0;
              if (v !== Number(item.desconto_pct)) onGuardar({ desconto_pct: v, desconto_valor: 0 });
            }}
          />
        </div>
        <div className="flex items-end justify-between gap-2">
          {item.produto_id && (
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={item.montagem_incluida}
                disabled={!editavel}
                onCheckedChange={(v) => onGuardar({ montagem_incluida: v })}
              />
              Montagem
            </label>
          )}
          {editavel && (
            <Button variant="ghost" size="icon" aria-label="Remover linha" onClick={onApagar}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- totais
function Totais({ pedido }: { pedido: Pedido }) {
  const linha = (etiqueta: string, valor: number, forte = false) => (
    <div className={`flex justify-between ${forte ? "text-base font-semibold" : "text-sm"}`}>
      <span className={forte ? "" : "text-muted-foreground"}>{etiqueta}</span>
      <span>{formatarDinheiro(valor)}</span>
    </div>
  );
  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Contas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {linha("Produtos e serviços", pedido.subtotal)}
        {Number(pedido.desconto_linhas) > 0 && linha("Descontos nas linhas", -pedido.desconto_linhas)}
        {Number(pedido.desconto_cabecalho) > 0 && linha("Desconto geral", -pedido.desconto_cabecalho)}
        {Number(pedido.desconto_cupao) > 0 && linha("Cupão", -pedido.desconto_cupao)}
        {Number(pedido.valor_montagem) > 0 && linha("Montagem", pedido.valor_montagem)}
        {linha("Entrega", pedido.valor_entrega)}
        {linha("IVA", pedido.total_iva)}
        <div className="my-2 border-t" />
        {linha("Total a pagar", pedido.total, true)}
        <p className="pt-2 text-xs text-muted-foreground">
          Entrega prevista: {formatarDataCurta(pedido.data_entrega_prometida ?? pedido.data_entrega_prevista)}
        </p>
      </CardContent>
    </Card>
  );
}

function Descontos({
  pedido,
  editavel,
  onGuardar,
}: {
  pedido: Pedido;
  editavel: boolean;
  onGuardar: (campos: Record<string, unknown>) => void;
}) {
  const [codigo, setCodigo] = useState("");

  const aplicar = useMutation({
    mutationFn: async () => {
      const cupao = await procurarCupao(codigo);
      if (!cupao) throw new Error("Não encontrámos nenhum cupão com esse código.");
      return cupao.id;
    },
    onSuccess: (id) => {
      setCodigo("");
      onGuardar({ cupao_id: id });
    },
    onError: (erro) => toast.error(mensagemErro(erro, (erro as Error).message)),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Descontos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="desc-geral">
            Desconto geral (%)
          </Label>
          <Input
            id="desc-geral"
            type="number"
            step="0.01"
            min={0}
            max={100}
            inputMode="decimal"
            defaultValue={pedido.desconto_cabecalho_pct}
            disabled={!editavel}
            onBlur={(e) => {
              const v = Number(e.target.value) || 0;
              if (v !== Number(pedido.desconto_cabecalho_pct)) {
                onGuardar({ desconto_cabecalho_pct: v });
              }
            }}
          />
        </div>
        {pedido.cupao_id ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-muted-foreground" /> Cupão aplicado
            </span>
            {editavel && (
              <Button variant="ghost" size="sm" onClick={() => onGuardar({ cupao_id: null })}>
                Retirar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="Código do cupão"
              disabled={!editavel}
            />
            <Button
              variant="outline"
              disabled={!editavel || codigo.trim().length < 3 || aplicar.isPending}
              onClick={() => aplicar.mutate()}
            >
              Aplicar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ entrega
function Entrega({
  pedido,
  editavel,
  onGuardar,
  onAlterado,
}: {
  pedido: Pedido;
  editavel: boolean;
  onGuardar: (campos: Record<string, unknown>) => void;
  onAlterado: () => void;
}) {
  const [alterarData, setAlterarData] = useState(false);
  const podeAlterarData =
    !editavel && ["confirmado", "em_preparacao", "pronto"].includes(pedido.estado);
  const motivos = useQuery({
    queryKey: ["motivos-data"],
    queryFn: () =>
      listar<Motivo>({
        tabela: "v_motivos",
        ordenarPor: "ordem",
        ascendente: true,
        tamanho: 100,
        filtros: [{ campo: "contexto", valor: "alteracao_data" }],
      }),
  });

  const zonas = useQuery({
    queryKey: ["zonas-entrega-venda"],
    queryFn: () =>
      listar<{ id: string; nome: string; ativo: boolean }>({
        tabela: "v_zonas_entrega",
        ordenarPor: "nome",
        ascendente: true,
        tamanho: 200,
      }),
  });

  function guardarCodigoPostal(bruto: string) {
    const digitos = bruto.replace(/\D/g, "");
    if (!digitos) {
      onGuardar({ cp4_entrega: null, cp3_entrega: null, zona_entrega_id: null });
      return;
    }
    if (digitos.length !== 4 && digitos.length !== 7) {
      toast.error("O código postal tem de ter 4 ou 7 números (ex.: 4620-269).");
      return;
    }
    onGuardar({
      cp4_entrega: digitos.slice(0, 4),
      cp3_entrega: digitos.length === 7 ? digitos.slice(4, 7) : null,
      zona_entrega_id: null,
    });
  }


  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4" /> Entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <span>
            Entrega ao domicílio
            <span className="block text-xs text-muted-foreground">
              Desligue se o cliente levanta na loja.
            </span>
          </span>
          <Switch
            checked={pedido.entrega_domicilio}
            disabled={!editavel}
            onCheckedChange={(v) => onGuardar({ entrega_domicilio: v })}
          />
        </label>

        {pedido.entrega_domicilio && (
          <>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="morada">
                Morada
              </Label>
              <Input
                id="morada"
                defaultValue={pedido.morada_entrega ?? ""}
                disabled={!editavel}
                onBlur={(e) =>
                  e.target.value !== (pedido.morada_entrega ?? "") &&
                  onGuardar({ morada_entrega: e.target.value || null })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="cp">
                  Código postal
                </Label>
                <Input
                  id="cp"
                  defaultValue={
                    pedido.cp4_entrega
                      ? `${pedido.cp4_entrega}${pedido.cp3_entrega ? `-${pedido.cp3_entrega}` : ""}`
                      : ""
                  }
                  placeholder="4620-269"
                  disabled={!editavel}
                  onBlur={(e) => {
                    const atual = pedido.cp4_entrega
                      ? `${pedido.cp4_entrega}${pedido.cp3_entrega ? `-${pedido.cp3_entrega}` : ""}`
                      : "";
                    if (e.target.value.trim() !== atual) guardarCodigoPostal(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="localidade">
                  Localidade
                </Label>
                <Input
                  id="localidade"
                  defaultValue={pedido.localidade_entrega ?? ""}
                  disabled={!editavel}
                  onBlur={(e) =>
                    e.target.value !== (pedido.localidade_entrega ?? "") &&
                    onGuardar({ localidade_entrega: e.target.value || null })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zona de entrega</Label>
              <Select
                value={pedido.zona_entrega_id ?? ""}
                disabled={!editavel}
                onValueChange={(v) => onGuardar({ zona_entrega_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolher zona" />
                </SelectTrigger>
                <SelectContent>
                  {(zonas.data?.linhas ?? [])
                    .filter((z) => z.ativo)
                    .map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {pedido.zona_entrega_id ? (
                <p className="text-xs text-muted-foreground">
                  Zona: {pedido.zona_nome ?? "definida"}
                </p>
              ) : (
                <p className="text-xs font-medium text-destructive">
                  Este código postal não pertence a nenhuma zona. Escolha a zona acima (ou desligue a
                  entrega ao domicílio) antes de finalizar.
                </p>
              )}
            </div>

          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Data de entrega</Label>
            {editavel ? (
              <Input
                type="date"
                defaultValue={pedido.data_entrega_prevista ?? ""}
                onBlur={(e) => {
                  if (!e.target.value || e.target.value === pedido.data_entrega_prevista) return;
                  const motivo = motivos.data?.linhas[0]?.id ?? null;
                  if (!motivo) {
                    toast.error("Falta configurar motivos de alteração de data.");
                    return;
                  }
                  onGuardar({
                    data_entrega_origem: "manual",
                    motivo_data_id: motivo,
                    data_entrega_prevista: e.target.value,
                  });
                }}
              />
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">
                  {formatarDataCurta(pedido.data_entrega_prometida ?? pedido.data_entrega_prevista)}
                </p>
                {podeAlterarData && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAlterarData(true)}
                  >
                    Alterar
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {pedido.data_entrega_origem === "manual"
                ? "Data escolhida à mão."
                : "Calculada pelos prazos e dias de rota."}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Origem do pedido</Label>
            <Select
              value={pedido.origem}
              disabled={!editavel}
              onValueChange={(v) => onGuardar({ origem: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGENS_PEDIDO.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {pedido.data_entrega_origem === "manual" && editavel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onGuardar({ data_entrega_origem: "calculada", motivo_data_id: null })}
          >
            Voltar à data calculada
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------- diálogos
function DialogoConfirmar({
  aberto,
  pedidoData,
  total,
  aGuardar,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  pedidoData: string | null;
  total: number;
  aGuardar: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar a venda</DialogTitle>
          <DialogDescription>
            O stock fica reservado e o pedido passa a ter número definitivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 rounded-md border p-3 text-sm">
          <p className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold">{formatarDinheiro(total)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">Entrega prevista</span>
            <span>{formatarDataCurta(pedidoData)}</span>
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onFechar}>
            Voltar
          </Button>
          <Button onClick={onConfirmar} disabled={aGuardar}>
            {aGuardar ? "A confirmar…" : "Confirmar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCancelar({
  aberto,
  pedidoId,
  onFechar,
  onFeito,
}: {
  aberto: boolean;
  pedidoId: string;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");

  const motivos = useQuery({
    queryKey: ["motivos-cancelamento"],
    enabled: aberto,
    queryFn: () =>
      listar<Motivo>({
        tabela: "v_motivos",
        ordenarPor: "ordem",
        ascendente: true,
        tamanho: 100,
        filtros: [{ campo: "contexto", valor: "cancelamento" }],
      }),
  });

  const acao = useMutation({
    mutationFn: () => cancelarPedido(pedidoId, motivo, nota),
    onSuccess: () => {
      toast.success("Venda cancelada.");
      onFechar();
      onFeito();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar a venda</DialogTitle>
          <DialogDescription>As reservas de stock são libertadas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o motivo" />
              </SelectTrigger>
              <SelectContent>
                {(motivos.data?.linhas ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Explique em poucas palavras (opcional)"
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onFechar}>
            Voltar
          </Button>
          <Button variant="destructive" disabled={!motivo || acao.isPending} onClick={() => acao.mutate()}>
            Cancelar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoReabrir({
  aberto,
  pedidoId,
  onFechar,
  onFeito,
}: {
  aberto: boolean;
  pedidoId: string;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [nota, setNota] = useState("");
  const acao = useMutation({
    mutationFn: () => reabrirPedido(pedidoId, nota),
    onSuccess: () => {
      toast.success("Pedido reaberto como orçamento.");
      onFechar();
      onFeito();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reabrir o pedido</DialogTitle>
          <DialogDescription>
            Volta a orçamento e liberta as reservas. Fica registado quem reabriu e porquê.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Motivo da reabertura"
        />
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onFechar}>
            Voltar
          </Button>
          <Button disabled={nota.trim().length < 3 || acao.isPending} onClick={() => acao.mutate()}>
            Reabrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
