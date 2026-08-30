import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  BellRing,
  CheckCircle2,
  Download,
  Scale,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { primeiraMensagem } from "@/lib/erp/erros";
import {
  descarregarCsv,
  fecharDiaFinanceiro,
  gerarAlertasFinanceiros,
  lerConciliacaoCaixa,
  lerConciliacaoVendas,
  lerDiasConciliacao,
  lerFechos,
  lerFluxoPrevisto,
  lerMovimentosConciliacao,
} from "@/lib/erp/financeiro";
import {
  ETIQUETA_MOVIMENTO_CAIXA,
  formatarData,
  formatarDataCurta,
  formatarDinheiro,
  type ConciliacaoMovimento,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/conciliacao")({
  head: () => ({
    meta: [
      { title: "Conciliação financeira — UP Vendas" },
      {
        name: "description",
        content:
          "Conciliação de caixa por dia e vendedora, vendas versus recebimentos e fluxo de caixa previsto da UP Móveis.",
      },
      { property: "og:title", content: "Conciliação financeira — UP Vendas" },
      {
        property: "og:description",
        content: "Verifique se as contas batem certo e feche o dia financeiro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaConciliacao,
});

function PaginaConciliacao() {
  const queryClient = useQueryClient();

  const caixas = useQuery({ queryKey: ["conc-caixa"], queryFn: lerConciliacaoCaixa });
  const vendas = useQuery({ queryKey: ["conc-vendas"], queryFn: lerConciliacaoVendas });
  const fluxo = useQuery({ queryKey: ["fluxo-previsto"], queryFn: lerFluxoPrevisto });
  const fechos = useQuery({ queryKey: ["fechos"], queryFn: lerFechos });

  const fechar = useMutation({
    mutationFn: () => fecharDiaFinanceiro(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fechos"] });
      toast.success("Dia financeiro fechado.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const alertas = useMutation({
    mutationFn: gerarAlertasFinanceiros,
    onSuccess: async (n) => {
      await queryClient.invalidateQueries({ queryKey: ["alertas"] });
      toast.success(n > 0 ? `${n} alerta(s) criado(s).` : "Sem novos alertas.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const linhasCaixa = caixas.data ?? [];
  const comDiferenca = linhasCaixa.filter((c) => c.diferenca !== null && Number(c.diferenca) !== 0);
  const divergentes = (vendas.data ?? []).filter((v) => Math.abs(Number(v.divergencia)) >= 0.01);

  return (
    <div>
      <CabecalhoPagina
        titulo="Conciliação"
        descricao="Caixa contado versus esperado, vendas versus recebimentos e o que está previsto entrar e sair."
        acao={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => alertas.mutate()} disabled={alertas.isPending}>
              <BellRing className="mr-2 h-4 w-4" />
              Verificar alertas
            </Button>
            <Button onClick={() => fechar.mutate()} disabled={fechar.isPending}>
              Fechar o dia
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="dinheiro">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="dinheiro">Entradas e saídas</TabsTrigger>
          <TabsTrigger value="caixa">Caixa</TabsTrigger>
          <TabsTrigger value="vendas">Vendas vs recebimentos</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de caixa</TabsTrigger>
          <TabsTrigger value="fechos">Fechos</TabsTrigger>
        </TabsList>

        <TabsContent value="dinheiro">
          <EntradasSaidas />
        </TabsContent>

        <TabsContent value="caixa">
          {caixas.isPending && <Skeleton className="h-48 w-full rounded-lg" />}
          <p className="mb-3 text-sm text-muted-foreground">
            {comDiferenca.length === 0
              ? "Nenhum caixa fechado apresenta diferença."
              : `${comDiferenca.length} caixa(s) com diferença.`}
          </p>
          <ul className="space-y-2">
            {linhasCaixa.map((c) => {
              const dif = c.diferenca === null ? null : Number(c.diferenca);
              return (
                <li
                  key={c.caixa_id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <Scale className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {formatarData(c.data)} · {c.utilizador_nome ?? "Equipa"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      esperado {formatarDinheiro(c.esperado)} · contado{" "}
                      {c.contado === null ? "—" : formatarDinheiro(c.contado)}
                      {c.justificacao_diferenca ? ` · ${c.justificacao_diferenca}` : ""}
                    </p>
                  </div>
                  {dif === null ? (
                    <Badge variant="secondary" className="text-[11px]">
                      Em aberto
                    </Badge>
                  ) : dif === 0 ? (
                    <Badge variant="secondary" className="gap-1 text-[11px]">
                      <CheckCircle2 className="h-3 w-3" />
                      Sem diferença
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1 text-[11px]">
                      <AlertTriangle className="h-3 w-3" />
                      {formatarDinheiro(dif)}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </TabsContent>

        <TabsContent value="vendas">
          {vendas.isPending && <Skeleton className="h-48 w-full rounded-lg" />}
          <p className="mb-3 text-sm text-muted-foreground">
            {divergentes.length === 0
              ? "Zero divergências: todas as vendas estão cobertas por recebimentos."
              : `${divergentes.length} pedido(s) com divergência.`}
          </p>
          <ul className="space-y-2">
            {(divergentes.length > 0 ? divergentes : (vendas.data ?? []).slice(0, 30)).map((v) => (
              <li
                key={v.pedido_id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 ${
                  Math.abs(Number(v.divergencia)) >= 0.01 ? "border-destructive/60" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {v.numero} · {v.cliente_nome ?? "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    total {formatarDinheiro(v.total)} · confirmado{" "}
                    {formatarDinheiro(v.recebido_confirmado)} · pendente{" "}
                    {formatarDinheiro(v.pendente_confirmacao)} · na entrega{" "}
                    {formatarDinheiro(v.a_receber_entrega)}
                  </p>
                </div>
                <Badge
                  variant={Math.abs(Number(v.divergencia)) >= 0.01 ? "destructive" : "secondary"}
                  className="text-[11px]"
                >
                  {formatarDinheiro(v.divergencia)}
                </Badge>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="fluxo">
          {fluxo.isPending && <Skeleton className="h-48 w-full rounded-lg" />}
          <ul className="space-y-2">
            {(fluxo.data ?? []).map((s) => {
              const saldo = Number(s.a_receber) - Number(s.a_pagar);
              return (
                <li
                  key={s.semana}
                  className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {formatarData(s.semana)} a {formatarData(s.fim_semana)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      entra {formatarDinheiro(s.a_receber)} · sai {formatarDinheiro(s.a_pagar)}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-medium ${saldo < 0 ? "text-destructive" : ""}`}
                  >
                    {formatarDinheiro(saldo)}
                  </p>
                </li>
              );
            })}
          </ul>
        </TabsContent>

        <TabsContent value="fechos">
          {fechos.isPending && <Skeleton className="h-48 w-full rounded-lg" />}
          {(fechos.data ?? []).length === 0 && (
            <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
              Ainda não há fechos financeiros guardados.
            </div>
          )}
          <ul className="space-y-2">
            {(fechos.data ?? []).map((f) => (
              <li key={f.id} className="rounded-lg border bg-card px-4 py-3">
                <p className="text-sm font-medium">{formatarData(f.data)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  dinheiro {formatarDinheiro(f.recebido_dinheiro)} · outras{" "}
                  {formatarDinheiro(f.recebido_outras)} · pago {formatarDinheiro(f.pago)} · por
                  receber {formatarDinheiro(f.por_receber)} · por pagar{" "}
                  {formatarDinheiro(f.por_pagar)}
                </p>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function inicioDoMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function EntradasSaidas() {
  const [de, setDe] = useState(inicioDoMes);
  const [ate, setAte] = useState(() => new Date().toISOString().slice(0, 10));

  const movimentos = useQuery({
    queryKey: ["conc-mov", de, ate],
    queryFn: () => lerMovimentosConciliacao({ de, ate }),
  });
  const dias = useQuery({
    queryKey: ["conc-dias", de, ate],
    queryFn: () => lerDiasConciliacao({ de, ate }),
  });

  const porDia = useMemo(() => {
    const mapa = new Map<string, ConciliacaoMovimento[]>();
    for (const m of movimentos.data ?? []) {
      const lista = mapa.get(m.data) ?? [];
      lista.push(m);
      mapa.set(m.data, lista);
    }
    return mapa;
  }, [movimentos.data]);

  const linhasDias = dias.data ?? [];
  const totalEntradas = linhasDias.reduce((s, d) => s + Number(d.entradas), 0);
  const totalSaidas = linhasDias.reduce((s, d) => s + Number(d.saidas), 0);
  const saldo = totalEntradas - totalSaidas;

  function exportar() {
    descarregarCsv(
      `entradas-saidas-${de}-a-${ate}`,
      [
        { chave: "data", etiqueta: "Data" },
        { chave: "tipo", etiqueta: "Tipo" },
        { chave: "valor_assinado", etiqueta: "Valor" },
        { chave: "forma_nome", etiqueta: "Forma" },
        { chave: "pedido_numero", etiqueta: "Venda" },
        { chave: "cliente_nome", etiqueta: "Cliente" },
        { chave: "rota_nome", etiqueta: "Rota" },
        { chave: "utilizador_nome", etiqueta: "Responsável" },
        { chave: "motivo_descricao", etiqueta: "Motivo" },
        { chave: "descricao", etiqueta: "Descrição" },
      ],
      (movimentos.data ?? []) as unknown as Array<Record<string, unknown>>,
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="conc-de">De</Label>
          <Input id="conc-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="conc-ate">Até</Label>
          <Input id="conc-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <Button
          variant="outline"
          onClick={exportar}
          disabled={(movimentos.data ?? []).length === 0}
        >
          <Download className="mr-2 h-4 w-4" /> CSV
        </Button>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Entradas</p>
          <p className="text-lg font-semibold">{formatarDinheiro(totalEntradas)}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Saídas</p>
          <p className="text-lg font-semibold">{formatarDinheiro(totalSaidas)}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Saldo do período</p>
          <p className={`text-lg font-semibold ${saldo < 0 ? "text-destructive" : ""}`}>
            {formatarDinheiro(saldo)}
          </p>
        </div>
      </div>

      {movimentos.isPending || dias.isPending ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : linhasDias.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Não há entradas nem saídas de dinheiro neste período.
        </div>
      ) : (
        <div className="space-y-4">
          {linhasDias.map((d) => (
            <section key={d.data} className="rounded-lg border bg-card">
              <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                <p className="text-sm font-medium">{formatarData(d.data)}</p>
                <p className="text-xs text-muted-foreground">
                  entrou {formatarDinheiro(d.entradas)} · saiu {formatarDinheiro(d.saidas)}
                </p>
                <p
                  className={`ml-auto text-sm font-semibold ${
                    Number(d.saldo) < 0 ? "text-destructive" : ""
                  }`}
                >
                  {formatarDinheiro(d.saldo)}
                </p>
              </header>
              <ul className="divide-y">
                {(porDia.get(d.data) ?? []).map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    {m.sentido > 0 ? (
                      <ArrowDownCircle className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <span
                      className={`w-24 shrink-0 tabular-nums font-medium ${
                        m.sentido < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {formatarDinheiro(m.valor_assinado)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[11px]">
                          {ETIQUETA_MOVIMENTO_CAIXA[m.tipo]}
                        </Badge>
                        {m.forma_nome ? (
                          <span className="text-xs text-muted-foreground">{m.forma_nome}</span>
                        ) : null}
                        {m.pedido_id && m.pedido_numero ? (
                          <Link
                            to="/pedidos/$pedidoId"
                            params={{ pedidoId: m.pedido_id }}
                            className="text-xs font-medium hover:underline"
                          >
                            {m.pedido_numero}
                            {m.cliente_nome ? ` · ${m.cliente_nome}` : ""}
                          </Link>
                        ) : null}
                        {m.rota_id ? (
                          <Link
                            to="/rotas/$rotaId"
                            params={{ rotaId: m.rota_id }}
                            className="text-xs font-medium hover:underline"
                          >
                            Rota {m.rota_nome ?? ""}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Loja</span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {m.utilizador_nome ?? "—"}
                        {m.motivo_descricao ? ` · ${m.motivo_descricao}` : ""}
                        {m.descricao ? ` · ${m.descricao}` : ""}
                        {` · ${formatarDataCurta(m.ocorrido_em)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
