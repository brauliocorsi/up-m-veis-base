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
  Truck,
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
  lerRotasContas,
} from "@/lib/erp/financeiro";
import {
  ETIQUETA_MOVIMENTO_CAIXA,
  formatarData,
  formatarDataCurta,
  formatarDinheiro,
  type ConciliacaoMovimento,
  type ConciliacaoVenda,
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
          <TabsTrigger value="rotas">Rotas</TabsTrigger>
          <TabsTrigger value="por-receber">Por receber</TabsTrigger>
          <TabsTrigger value="caixa">Caixa</TabsTrigger>
          <TabsTrigger value="vendas">Vendas vs recebimentos</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de caixa</TabsTrigger>
          <TabsTrigger value="fechos">Fechos</TabsTrigger>
        </TabsList>

        <TabsContent value="rotas">
          <RotasFinanceiro />
        </TabsContent>

        <TabsContent value="por-receber">
          <VendasPorReceber linhas={vendas.data ?? []} aCarregar={vendas.isPending} />
        </TabsContent>

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
                  <p className={`text-sm font-medium ${saldo < 0 ? "text-destructive" : ""}`}>
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

/** Vendas confirmadas que ainda têm dinheiro por receber. */
function VendasPorReceber({
  linhas,
  aCarregar,
}: {
  linhas: ConciliacaoVenda[];
  aCarregar: boolean;
}) {
  const [apenasAbertas, setApenasAbertas] = useState(true);
  const confirmadas = linhas.filter((v) => v.estado !== "orcamento");
  const abertas = confirmadas.filter((v) => !v.fechada);
  const lista = apenasAbertas ? abertas : confirmadas;
  const total = abertas.reduce((s, v) => s + Number(v.por_registar), 0);
  const naEntrega = abertas.reduce((s, v) => s + Number(v.a_receber_entrega), 0);
  const porConfirmar = abertas.reduce((s, v) => s + Number(v.pendente_confirmacao), 0);

  if (aCarregar) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Falta receber</p>
          <p className="text-lg font-semibold">{formatarDinheiro(total)}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Aguarda confirmação</p>
          <p className="text-lg font-semibold">{formatarDinheiro(porConfirmar)}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">A cobrar na entrega</p>
          <p className="text-lg font-semibold">{formatarDinheiro(naEntrega)}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button
          variant={apenasAbertas ? "default" : "outline"}
          size="sm"
          onClick={() => setApenasAbertas(true)}
        >
          Em aberto ({abertas.length})
        </Button>
        <Button
          variant={apenasAbertas ? "outline" : "default"}
          size="sm"
          onClick={() => setApenasAbertas(false)}
        >
          Todas ({confirmadas.length})
        </Button>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Todas as vendas confirmadas estão liquidadas.
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((v) => (
            <li
              key={v.pedido_id}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/pedidos/$pedidoId"
                  params={{ pedidoId: v.pedido_id }}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {v.numero} · {v.cliente_nome ?? "—"}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  total {formatarDinheiro(v.total)} · recebido{" "}
                  {formatarDinheiro(v.recebido_confirmado)} · por confirmar{" "}
                  {formatarDinheiro(v.pendente_confirmacao)} · na entrega{" "}
                  {formatarDinheiro(v.a_receber_entrega)}
                  {v.confirmado_em ? ` · venda de ${formatarDataCurta(v.confirmado_em)}` : ""}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {formatarDinheiro(v.por_registar)}
              </p>
              <Badge
                variant={v.fechada ? "secondary" : "destructive"}
                className="gap-1 text-[11px]"
              >
                {v.fechada ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" /> Fechada
                  </>
                ) : v.estado_recebimento === "parcial" ? (
                  "Recebida em parte"
                ) : (
                  "Sem recebimento"
                )}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Rotas: o que estava previsto receber face ao que entrou e foi conferido. */
function RotasFinanceiro() {
  const rotas = useQuery({ queryKey: ["rotas-financeiro"], queryFn: () => lerRotasContas() });
  const linhas = rotas.data ?? [];
  const previsto = linhas.reduce((s, r) => s + Number(r.previsto_receber ?? 0), 0);
  const recebido = linhas.reduce((s, r) => s + Number(r.recebido ?? 0), 0);
  const comDivergencia = linhas.filter((r) => Math.abs(Number(r.divergencia_previsto)) >= 0.01);

  if (rotas.isPending) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Previsto nas rotas</p>
          <p className="text-lg font-semibold">{formatarDinheiro(previsto)}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Recebido nas rotas</p>
          <p className="text-lg font-semibold">{formatarDinheiro(recebido)}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Rotas com divergência</p>
          <p
            className={`text-lg font-semibold ${comDivergencia.length > 0 ? "text-destructive" : ""}`}
          >
            {comDivergencia.length}
          </p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Ainda não há rotas para conferir.
        </div>
      ) : (
        <ul className="space-y-2">
          {linhas.map((r) => {
            const dif = Number(r.divergencia_previsto);
            const difEnvelope = r.diferenca === null ? null : Number(r.diferenca);
            return (
              <li
                key={r.rota_id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 ${
                  Math.abs(dif) >= 0.01 ? "border-destructive/60" : ""
                }`}
              >
                <Truck className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/rotas/$rotaId"
                    params={{ rotaId: r.rota_id }}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {formatarData(r.data)} · {r.nome}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    previsto {formatarDinheiro(r.previsto_receber ?? 0)} · recebido{" "}
                    {formatarDinheiro(r.recebido ?? 0)} · dinheiro{" "}
                    {formatarDinheiro(r.dinheiro ?? 0)} · saídas {formatarDinheiro(r.saidas ?? 0)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    entregas {r.entregas_feitas ?? 0}/{r.previsto_entregas ?? 0} · envelope esperado{" "}
                    {formatarDinheiro(r.esperado_envelope ?? 0)} · conferido{" "}
                    {r.valor_conferido === null ? "—" : formatarDinheiro(r.valor_conferido)}
                    {r.justificacao_diferenca ? ` · ${r.justificacao_diferenca}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      Math.abs(dif) >= 0.01 ? "text-destructive" : ""
                    }`}
                  >
                    {formatarDinheiro(dif)}
                  </span>
                  <Badge
                    variant={
                      r.conferida
                        ? difEnvelope !== null && Math.abs(difEnvelope) >= 0.01
                          ? "destructive"
                          : "secondary"
                        : "outline"
                    }
                    className="text-[11px]"
                  >
                    {r.conferida ? "Conferida" : r.fechada ? "Fechada" : "Em curso"}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
