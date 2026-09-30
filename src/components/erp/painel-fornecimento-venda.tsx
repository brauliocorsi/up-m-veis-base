import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lerFornecimentoVenda } from "@/lib/erp/compras";
import { formatarData } from "@/lib/erp/tipos";

/** Por artigo: quanto já chegou, quanto falta, ordem de compra original e atual, data prevista. */
export function PainelFornecimentoVenda({ pedidoId }: { pedidoId: string }) {
  const { data } = useQuery({
    queryKey: ["fornecimento-venda", pedidoId],
    queryFn: () => lerFornecimentoVenda(pedidoId),
  });
  const linhas = (data ?? []).filter((l) => l.oc_atual || l.falta > 0);
  if (linhas.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fornecimento</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {linhas.map((l) => (
            <li key={l.pedido_item_id} className="space-y-1 py-2">
              <p className="font-medium">{l.descricao}</p>
              {l.nota ? <p className="whitespace-pre-line text-xs text-muted-foreground">{l.nota}</p> : null}
              <p className="flex flex-wrap gap-x-4 text-xs">
                <span>Recebido {l.recebido}/{l.quantidade}</span>
                <span className={l.falta > 0 ? "font-medium text-destructive" : ""}>Falta {l.falta}</span>
                {l.tipo_fornecimento === "producao" ? <span>Encomenda à fábrica</span> : null}
                {l.oc_raiz ? <span>OC original {l.oc_raiz}</span> : null}
                {l.oc_atual && l.oc_atual_id ? (
                  <Link
                    to="/ordens-compra/$ocId"
                    params={{ ocId: l.oc_atual_id }}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    OC atual {l.oc_atual}
                  </Link>
                ) : null}
                <span>Chegada prevista {l.eta ? formatarData(l.eta) : "—"}</span>
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
