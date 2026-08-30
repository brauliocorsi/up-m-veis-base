import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatarDataCurta, type Necessidade, type OcItem, type PedidoItem } from "@/lib/erp/tipos";

export interface ContextoFornecimento {
  ocs: OcItem[];
  necessidades: Necessidade[];
}

function ocsDaLinha(item: PedidoItem, ctx: ContextoFornecimento) {
  return ctx.ocs.filter((o) => o.pedido_item_id === item.id);
}

function necessidadeDaLinha(item: PedidoItem, ctx: ContextoFornecimento) {
  return ctx.necessidades.find((n) => n.item_id === item.id) ?? null;
}

/** Estado real de fornecimento de uma linha da venda, em linguagem de loja. */
export function BadgeFornecimento({
  item,
  contexto,
}: {
  item: PedidoItem;
  contexto: ContextoFornecimento;
}) {
  if (item.estado === "entregue") {
    return (
      <div className="text-xs">
        <Badge variant="secondary">✓ Entregue</Badge>
        {item.data_prevista && (
          <span className="ml-2 text-muted-foreground">{formatarDataCurta(item.data_prevista)}</span>
        )}
      </div>
    );
  }

  if (item.estado === "reservado" || item.estado === "separado") {
    return (
      <div className="text-xs">
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">🟢 Em stock</Badge>
        <span className="ml-2 text-muted-foreground">reservado ao cliente</span>
      </div>
    );
  }

  const ocs = ocsDaLinha(item, contexto);
  if (ocs.length > 0) {
    const recebido = ocs.reduce((s, o) => s + Number(o.quantidade_recebida ?? 0), 0);
    const falta = Math.max(Number(item.quantidade) - recebido, 0);
    return (
      <div className="text-xs">
        <Badge className="bg-amber-500 text-white hover:bg-amber-500">🟠 Encomendado</Badge>
        <span className="ml-2 text-muted-foreground">
          {ocs.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ", "}
              <Link to="/ordens-compra/$ocId" params={{ ocId: o.oc_id }} className="underline">
                {o.oc_numero}
              </Link>
            </span>
          ))}
          {ocs[0]?.fornecedor_nome ? ` · ${ocs[0].fornecedor_nome}` : ""}
          {ocs[0]?.data_prevista_item || ocs[0]?.oc_data_prevista
            ? ` · prevista ${formatarDataCurta(ocs[0].data_prevista_item ?? ocs[0].oc_data_prevista)}`
            : ""}
          {falta > 0 ? ` · faltam ${falta}` : " · já recebido"}
        </span>
      </div>
    );
  }

  const necessidade = necessidadeDaLinha(item, contexto);
  return (
    <div className="text-xs">
      <Badge variant="outline">⚪ Por encomendar</Badge>
      <span className="ml-2 text-muted-foreground">
        {necessidade ? "necessidade criada, ainda sem ordem de compra" : "sem necessidade de compra"}
      </span>
    </div>
  );
}

function linhaPronta(item: PedidoItem) {
  return item.estado === "reservado" || item.estado === "separado" || item.estado === "entregue";
}

/** Barra de progresso do fornecimento do pedido inteiro. */
export function ProgressoFornecimento({
  linhas,
  contexto,
}: {
  linhas: PedidoItem[];
  contexto: ContextoFornecimento;
}) {
  const relevantes = linhas.filter((l) => l.estado !== "cancelado");
  if (relevantes.length === 0) return null;

  const prontas = relevantes.filter(linhaPronta);
  const emFalta = relevantes.filter((l) => !linhaPronta(l));
  const pct = Math.round((prontas.length / relevantes.length) * 100);

  const primeira = emFalta[0];
  const ocs = primeira ? ocsDaLinha(primeira, contexto) : [];
  const prevista = ocs[0]?.data_prevista_item ?? ocs[0]?.oc_data_prevista ?? primeira?.data_prevista;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {prontas.length} de {relevantes.length} linhas prontas
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="mt-2 h-2" />
      {primeira ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Falta {primeira.descricao}
          {prevista ? `, prevista ${formatarDataCurta(prevista)}` : ""}
          {ocs[0]?.oc_numero ? ` (${ocs[0].oc_numero})` : ""}
          {emFalta.length > 1 ? ` · e mais ${emFalta.length - 1}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Tudo pronto para entrega.</p>
      )}
    </div>
  );
}
