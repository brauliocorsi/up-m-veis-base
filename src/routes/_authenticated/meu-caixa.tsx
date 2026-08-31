import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessao } from "@/hooks/use-sessao";
import { lerCaixaAtual, lerCaixas, lerMovimentos } from "@/lib/erp/pagamentos";
import {
  ETIQUETA_MOVIMENTO_CAIXA,
  formatarDataCurta,
  formatarDinheiro,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/meu-caixa")({
  head: () => ({
    meta: [
      { title: "O meu caixa — UP Vendas" },
      {
        name: "description",
        content:
          "Caixa do entregador da UP Móveis: dinheiro recebido na rota, despesas do dia e envelope a entregar na loja.",
      },
      { property: "og:title", content: "O meu caixa — UP Vendas" },
      {
        property: "og:description",
        content: "O dinheiro da rota do entregador, movimento a movimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaMeuCaixa,
});

function PaginaMeuCaixa() {
  const { data: sessao } = useSessao();
  const utilizadorId = sessao?.utilizador?.id ?? "";

  const caixa = useQuery({
    queryKey: ["meu-caixa", utilizadorId],
    enabled: Boolean(utilizadorId),
    queryFn: () => lerCaixaAtual(utilizadorId, "rota"),
  });
  const movimentos = useQuery({
    queryKey: ["caixa-movimentos", caixa.data?.id],
    enabled: Boolean(caixa.data?.id),
    queryFn: () => lerMovimentos(caixa.data!.id),
  });
  const anteriores = useQuery({
    queryKey: ["meus-caixas-rota", utilizadorId],
    enabled: Boolean(utilizadorId),
    queryFn: () => lerCaixas({ utilizadorId, ambito: "rota" }),
  });

  const atual = caixa.data;
  const lista = movimentos.data ?? [];
  const fechados = (anteriores.data ?? []).filter((c) => c.estado === "fechado");

  return (
    <div>
      <CabecalhoPagina
        titulo="O meu caixa"
        descricao="O dinheiro da sua rota. Só vê o seu caixa: o que recebeu, o que gastou e o envelope a entregar na loja."
      />

      {caixa.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : !atual ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" /> Sem caixa aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              O caixa abre quando arranca a rota do dia. Vá a “A minha rota” para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {atual.rota_nome ?? "Rota"}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {formatarDataCurta(atual.rota_data ?? atual.data)}
                </span>
                <Badge variant="default" className="ml-2">
                  Aberto
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Valor titulo="Abertura" valor={atual.saldo_abertura} />
              <Valor titulo="Dinheiro recebido" valor={atual.total_dinheiro ?? 0} />
              <Valor
                titulo="Despesas e saídas"
                valor={(atual.total_saidas ?? 0) + (atual.total_sangrias ?? 0)}
              />
              <Valor titulo="A entregar na loja" valor={atual.saldo_esperado} destaque />
              <Valor titulo="Multibanco" valor={atual.total_multibanco ?? 0} />
              <Valor titulo="MB Way" valor={atual.total_mbway ?? 0} />
              <Valor titulo="Transferências" valor={atual.total_transferencia ?? 0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Movimentos de hoje</CardTitle>
            </CardHeader>
            <CardContent>
              {lista.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há movimentos.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {lista.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                      {m.sentido > 0 ? (
                        <ArrowDownCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{formatarDinheiro(m.valor * m.sentido)}</span>
                      <span className="text-muted-foreground">
                        {ETIQUETA_MOVIMENTO_CAIXA[m.tipo]}
                        {m.forma_nome ? ` · ${m.forma_nome}` : ""}
                      </span>
                      {m.pedido_numero ? <Badge variant="outline">{m.pedido_numero}</Badge> : null}
                      <span className="text-xs text-muted-foreground">
                        {m.motivo_descricao ?? m.descricao ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Caixas anteriores</CardTitle>
        </CardHeader>
        <CardContent>
          {fechados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não fechou nenhum caixa de rota.</p>
          ) : (
            <ul className="divide-y text-sm">
              {fechados.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{formatarDataCurta(c.rota_data ?? c.data)}</span>
                  <span className="text-muted-foreground">
                    {c.rota_nome ?? "Rota"} · Esperado {formatarDinheiro(c.saldo_esperado)} · Contado{" "}
                    {formatarDinheiro(c.saldo_contado)}
                  </span>
                  <Badge variant={Number(c.diferenca ?? 0) === 0 ? "outline" : "destructive"}>
                    {Number(c.diferenca ?? 0) === 0
                      ? "Sem diferença"
                      : formatarDinheiro(c.diferenca)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Valor({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number | string | null;
  destaque?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={destaque ? "text-base font-semibold tabular-nums" : "tabular-nums"}>
        {formatarDinheiro(valor)}
      </p>
    </div>
  );
}
