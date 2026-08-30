import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Unlock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { comprasDoProduto, fornecimentoDoProduto, vendasDoProduto } from "@/lib/erp/compras";
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { libertarReserva } from "@/lib/erp/stock";
import {
  ETIQUETA_ITEM,
  ETIQUETA_MOVIMENTO,
  ETIQUETA_OC,
  ETIQUETA_RESERVA,
  formatarData,
  formatarDataCurta,
  formatarDinheiro,
  type LinhaStock,
  type Movimento,
  type Reserva,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/stock/$produtoId")({
  head: () => ({
    meta: [
      { title: "Ficha de stock — UP Vendas" },
      {
        name: "description",
        content: "Números de stock explicados, movimentos e reservas de um produto da UP Móveis.",
      },
      { property: "og:title", content: "Ficha de stock — UP Vendas" },
      { property: "og:description", content: "Histórico completo de um produto." },
    ],
  }),
  component: FichaStock,
});

function Cartao({
  titulo,
  valor,
  nota,
  destaque,
}: {
  titulo: string;
  valor: number;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={destaque ? "mt-1 text-2xl font-semibold text-primary" : "mt-1 text-2xl font-semibold"}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}

function FichaStock() {
  const { produtoId } = Route.useParams();
  const queryClient = useQueryClient();
  const [aLibertar, setALibertar] = useState<Reserva | null>(null);
  const [motivo, setMotivo] = useState("");

  const { data: stock, isPending } = useQuery({
    queryKey: ["stock-ficha", produtoId],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_stock")
        .select("*")
        .eq("produto_id", produtoId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LinhaStock | null;
    },
  });

  const { data: movimentos } = useQuery({
    queryKey: ["stock-ficha-movimentos", produtoId],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_stock_movimentos")
        .select("*")
        .eq("produto_id", produtoId)
        .order("ocorrido_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Movimento[];
    },
  });

  const { data: reservas } = useQuery({
    queryKey: ["stock-ficha-reservas", produtoId],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_reservas_detalhe")
        .select("*")
        .eq("produto_id", produtoId)
        .is("eliminado_em", null)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Reserva[];
    },
  });

  const perm = usePermissoes();
  const podeVerCompras = perm.comprar || perm.verCustos;

  // Com custos — só Compras/Financeiro/ADM (v_oc_itens tem RLS restrita).
  const { data: compras } = useQuery({
    queryKey: ["produto-compras", produtoId],
    queryFn: () => comprasDoProduto(produtoId),
    enabled: podeVerCompras,
  });

  // Sem custos — acessível a todos os perfis ativos (exceção deliberada).
  const { data: fornecimento } = useQuery({
    queryKey: ["produto-fornecimento", produtoId],
    queryFn: () => fornecimentoDoProduto(produtoId),
  });

  const { data: vendas } = useQuery({
    queryKey: ["produto-vendas", produtoId],
    queryFn: () => vendasDoProduto(produtoId),
  });

  const emFalta = (fornecimento ?? []).filter(
    (c) => c.oc_estado !== "cancelada" && Number(c.qt_em_falta ?? 0) > 0,
  );
  const aChegar = emFalta[0] ?? null;

  const mLibertar = useMutation({
    mutationFn: async () => {
      if (!aLibertar) return;
      if (motivo.trim().length < 5) throw new Error("Escreva um motivo com pelo menos 5 caracteres.");
      await libertarReserva(aLibertar.id, motivo.trim());
    },
    onSuccess: () => {
      toast.success("Reserva libertada.");
      setALibertar(null);
      setMotivo("");
      queryClient.invalidateQueries({ queryKey: ["stock-ficha", produtoId] });
      queryClient.invalidateQueries({ queryKey: ["stock-ficha-reservas", produtoId] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  if (isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!stock) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-muted-foreground">Este produto ainda não tem stock registado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/stock">Voltar ao stock</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/stock">
          <ArrowLeft className="mr-1 h-4 w-4" /> Stock
        </Link>
      </Button>

      <CabecalhoPagina
        titulo={stock.nome_cliente}
        descricao={`${stock.cod_barras} · atualizado em ${formatarData(stock.atualizado_em)}`}
      />

      <p className="mb-4 text-sm">
        <span className="font-medium">Em stock: {stock.fisico}</span>
        <span className="text-muted-foreground">
          {" · "}Reservado: {stock.reservado} · Vendável: {stock.vendavel} · A chegar:{" "}
          {stock.em_transito_compra}
          {aChegar
            ? ` (${aChegar.oc_numero}${
                aChegar.data_prevista_chegada
                  ? `, ${formatarDataCurta(aChegar.data_prevista_chegada)}`
                  : ""
              })`
            : ""}
        </span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Cartao titulo="Físico" valor={stock.fisico} nota="Soma de todos os movimentos do livro." />
        <Cartao titulo="Reservado" valor={stock.reservado} nota="Preso a documentos ainda abertos." />
        <Cartao titulo="Quarentena" valor={stock.quarentena} nota="Retido no armazém, não vende." />
        <Cartao
          titulo="Margem de segurança"
          valor={stock.margem_seguranca}
          nota="Unidades deixadas de fora da venda."
        />
        <Cartao
          titulo="Vendável"
          valor={stock.vendavel}
          nota="Físico − reservado − margem de segurança."
          destaque
        />
        <Cartao
          titulo="Prometível"
          valor={stock.prometivel}
          nota={`Vendável + ${stock.em_transito_compra} em trânsito de compra.`}
        />
      </div>

      <Tabs defaultValue="reservas" className="mt-8">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
          <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
          {podeVerCompras && <TabsTrigger value="compras">Compras</TabsTrigger>}
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
        </TabsList>

      <TabsContent value="reservas">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">Documento</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qtd.</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Estado</th>
                <th className="hidden px-3 py-2 font-medium text-muted-foreground md:table-cell">
                  Expira
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(reservas ?? []).length === 0 && (
                <tr className="border-t">
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Sem reservas para este produto.
                  </td>
                </tr>
              )}
              {(reservas ?? []).map((reserva) => (
                <tr key={reserva.id} className="border-t">
                  <td className="px-3 py-2">
                    {reserva.documento_tipo}
                    <div className="text-xs text-muted-foreground">
                      {reserva.documento_id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{reserva.quantidade}</td>
                  <td className="px-3 py-2">
                    <Badge variant={reserva.estado === "ativa" ? "default" : "secondary"}>
                      {ETIQUETA_RESERVA[reserva.estado]}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {formatarData(reserva.expira_em)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {reserva.estado === "ativa" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setALibertar(reserva);
                          setMotivo("");
                        }}
                      >
                        <Unlock className="mr-1 h-4 w-4" /> Libertar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>

      <TabsContent value="movimentos">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">Quando</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qtd.</th>
                <th className="hidden px-3 py-2 font-medium text-muted-foreground md:table-cell">
                  Origem
                </th>
                <th className="hidden px-3 py-2 font-medium text-muted-foreground md:table-cell">
                  Referência
                </th>
              </tr>
            </thead>
            <tbody>
              {(movimentos ?? []).length === 0 && (
                <tr className="border-t">
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Sem movimentos registados.
                  </td>
                </tr>
              )}
              {(movimentos ?? []).map((movimento) => (
                <tr key={movimento.id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatarData(movimento.ocorrido_em)}
                  </td>
                  <td className="px-3 py-2">{ETIQUETA_MOVIMENTO[movimento.tipo]}</td>
                  <td
                    className={
                      movimento.quantidade < 0
                        ? "px-3 py-2 text-right text-destructive"
                        : "px-3 py-2 text-right"
                    }
                  >
                    {movimento.quantidade > 0 ? `+${movimento.quantidade}` : movimento.quantidade}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {movimento.origem}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {movimento.motivo ?? movimento.ref_externa ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>

      {podeVerCompras && (
      <TabsContent value="compras">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">Ordem</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Fornecedor</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qtd.</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Recebida</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Estado</th>
                <th className="hidden px-3 py-2 font-medium text-muted-foreground md:table-cell">
                  Prevista
                </th>
              </tr>
            </thead>
            <tbody>
              {(compras ?? []).length === 0 && (
                <tr className="border-t">
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Este produto ainda não foi comprado.
                  </td>
                </tr>
              )}
              {(compras ?? []).map((linha) => {
                const falta =
                  linha.oc_estado !== "cancelada" &&
                  Number(linha.quantidade_recebida) < Number(linha.quantidade);
                return (
                  <tr key={linha.id} className={falta ? "border-t bg-primary/5" : "border-t"}>
                    <td className="px-3 py-2">
                      <Link
                        to="/ordens-compra/$ocId"
                        params={{ ocId: linha.oc_id }}
                        className="underline"
                      >
                        {linha.oc_numero}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatarDinheiro(linha.custo_unitario)} / un.
                      </div>
                    </td>
                    <td className="px-3 py-2">{linha.fornecedor_nome ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{linha.quantidade}</td>
                    <td className="px-3 py-2 text-right">{linha.quantidade_recebida}</td>
                    <td className="px-3 py-2">
                      <Badge variant={falta ? "default" : "secondary"}>
                        {ETIQUETA_OC[linha.oc_estado] ?? linha.oc_estado}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                      {formatarDataCurta(linha.data_prevista_item ?? linha.oc_data_prevista)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TabsContent>
      )}

      <TabsContent value="vendas">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">Venda</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Cliente</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qtd.</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Linha</th>
                <th className="hidden px-3 py-2 font-medium text-muted-foreground md:table-cell">
                  Entrega
                </th>
              </tr>
            </thead>
            <tbody>
              {(vendas ?? []).length === 0 && (
                <tr className="border-t">
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Este produto ainda não foi vendido.
                  </td>
                </tr>
              )}
              {(vendas ?? []).map((linha) => (
                <tr key={linha.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      to="/pedidos/$pedidoId"
                      params={{ pedidoId: linha.pedido_id }}
                      className="underline"
                    >
                      {linha.pedido_numero ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{linha.cliente_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{linha.quantidade}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{ETIQUETA_ITEM[linha.estado]}</Badge>
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {formatarDataCurta(linha.data_entrega_prevista ?? linha.data_prevista)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
      </Tabs>

      <DialogoForm
        aberto={Boolean(aLibertar)}
        onFechar={() => setALibertar(null)}
        titulo="Libertar reserva"
        descricao="As unidades voltam a ficar vendáveis."
        aGuardar={mLibertar.isPending}
        onGuardar={() => mLibertar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="motivo-libertar">Motivo</Label>
          <Input
            id="motivo-libertar"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: cliente desistiu do artigo"
          />
        </div>
      </DialogoForm>
    </div>
  );
}
