import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, PackageCheck, Truck } from "lucide-react";
import { useState } from "react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { erp } from "@/lib/erp/db";
import {
  ESTADOS_OC,
  ETIQUETA_OC,
  formatarData,
  formatarDinheiro,
  type OrdemCompra,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/ordens-compra/")({
  head: () => ({
    meta: [
      { title: "Ordens de compra — UP Vendas" },
      {
        name: "description",
        content:
          "Todas as encomendas a fornecedores da UP Móveis, com estado, data prevista e atrasos à vista.",
      },
      { property: "og:title", content: "Ordens de compra — UP Vendas" },
      {
        property: "og:description",
        content: "Acompanhe encomendas enviadas, confirmadas e recebidas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaOrdens,
});

function PaginaOrdens() {
  const [estado, setEstado] = useState<string>("abertas");
  const [pagamento, setPagamento] = useState<string>("todos");
  const [pesquisa, setPesquisa] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["ordens-compra", estado],
    queryFn: async () => {
      let consulta = erp()
        .from("v_ordens_compra")
        .select("*")
        .order("data_emissao", { ascending: false })
        .limit(300);
      if (estado === "abertas") {
        consulta = consulta.in("estado", [
          "rascunho",
          "pronta_enviar",
          "enviada",
          "confirmada",
          "recebida_parcial",
        ]);
      } else if (estado !== "todas") {
        consulta = consulta.eq("estado", estado);
      }
      const { data, error } = await consulta;
      if (error) throw error;
      return (data ?? []) as OrdemCompra[];
    },
  });

  const termo = pesquisa.trim().toLowerCase();
  const todas = (data ?? []).filter(
    (oc) =>
      !termo ||
      oc.numero.toLowerCase().includes(termo) ||
      (oc.fornecedor_nome ?? "").toLowerCase().includes(termo),
  );
  const linhas =
    pagamento === "todos"
      ? todas
      : pagamento === "por_pagar"
        ? todas.filter((oc) => oc.estado_pagamento === "pendente" || oc.estado_pagamento === "parcial")
        : todas.filter((oc) => oc.estado_pagamento === pagamento);
  const soma = (lista: OrdemCompra[], f: (oc: OrdemCompra) => number) =>
    lista.reduce((t, oc) => t + Number(f(oc) ?? 0), 0);
  const aCaminho = todas.filter(
    (oc) => oc.estado === "enviada" || oc.estado === "confirmada" || oc.estado === "recebida_parcial",
  );

  return (
    <div>
      <CabecalhoPagina
        titulo="Ordens de compra"
        descricao="O que já foi encomendado aos fornecedores e em que ponto está."
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Unidades a caminho</p>
          <p className="text-lg font-semibold">
            {soma(aCaminho, (oc) => oc.unidades_em_falta)}
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Unidades recebidas</p>
          <p className="text-lg font-semibold">
            {soma(todas, (oc) => oc.unidades_recebidas)}
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Por pagar</p>
          <p className="text-lg font-semibold">
            {formatarDinheiro(soma(todas, (oc) => oc.valor_em_divida))}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          placeholder="Número ou fornecedor…"
          aria-label="Pesquisar ordens de compra"
        />
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="sm:w-56" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Em curso</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
            {ESTADOS_OC.map((e) => (
              <SelectItem key={e.valor} value={e.valor}>
                {e.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pagamento} onValueChange={setPagamento}>
          <SelectTrigger className="sm:w-56" aria-label="Filtrar por pagamento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Qualquer pagamento</SelectItem>
            <SelectItem value="por_pagar">Por pagar</SelectItem>
            <SelectItem value="parcial">Pagas em parte</SelectItem>
            <SelectItem value="pago">Pagas</SelectItem>
            <SelectItem value="sem_conta">Sem conta a pagar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending && <Skeleton className="h-56 w-full rounded-lg" />}

      {!isPending && linhas.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Não há ordens de compra para este filtro.
        </div>
      )}

      <ul className="space-y-2">
        {linhas.map((oc) => (
          <li key={oc.id}>
            <Link
              to="/ordens-compra/$ocId"
              params={{ ocId: oc.id }}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {oc.numero} · {oc.fornecedor_nome}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatarData(oc.data_emissao)}
                  {oc.data_confirmada_fornecedor || oc.data_prevista
                    ? ` · prevista ${formatarData(oc.data_confirmada_fornecedor ?? oc.data_prevista)}`
                    : ""}
                  {` · ${oc.n_itens} linhas`}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    pedidas {Number(oc.unidades_pedidas)}
                  </span>
                  {Number(oc.unidades_em_falta) > 0 &&
                    oc.estado !== "rascunho" &&
                    oc.estado !== "cancelada" && (
                      <span className="flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600 dark:text-blue-400">
                        <Truck className="h-3 w-3" />a caminho {Number(oc.unidades_em_falta)}
                      </span>
                    )}
                  {Number(oc.unidades_recebidas) > 0 && (
                    <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                      <PackageCheck className="h-3 w-3" />
                      recebidas {Number(oc.unidades_recebidas)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-medium">{formatarDinheiro(oc.total)}</span>
                <span className="flex items-center gap-1">
                  {oc.atrasada && (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Atrasada" />
                  )}
                  <Badge variant="secondary" className="text-[11px]">
                    {ETIQUETA_OC[oc.estado]}
                  </Badge>
                </span>
                {oc.estado_pagamento !== "sem_conta" && (
                  <Badge
                    variant={oc.estado_pagamento === "pago" ? "secondary" : "outline"}
                    className="text-[11px]"
                  >
                    {oc.estado_pagamento === "pago"
                      ? "Pago"
                      : oc.estado_pagamento === "parcial"
                        ? `Pago em parte · falta ${formatarDinheiro(oc.valor_em_divida)}`
                        : `Por pagar ${formatarDinheiro(oc.valor_em_divida)}`}
                  </Badge>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
