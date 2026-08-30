import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeEuro, CalendarClock } from "lucide-react";
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
import { usePermissoes } from "@/hooks/use-permissoes";
import { registarPagamentoConta } from "@/lib/erp/compras";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { ETIQUETA_CONTA, formatarData, formatarDinheiro, type ContaPagar } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({
    meta: [
      { title: "Contas a pagar — UP Vendas" },
      {
        name: "description",
        content:
          "Compromissos com fornecedores da UP Móveis por data de vencimento, com registo de pagamentos.",
      },
      { property: "og:title", content: "Contas a pagar — UP Vendas" },
      {
        property: "og:description",
        content: "Veja o que vence esta semana e registe pagamentos a fornecedores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaContas,
});

function PaginaContas() {
  const { pagar } = usePermissoes();
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState("em_divida");
  const [emPagamento, setEmPagamento] = useState<ContaPagar | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");
  const [doc, setDoc] = useState("");

  const { data: linhas, isPending } = useQuery({
    queryKey: ["contas-pagar", estado],
    queryFn: async () => {
      let consulta = erp()
        .from("v_contas_pagar")
        .select("*")
        .order("data_vencimento", { ascending: true })
        .limit(400);
      if (estado === "em_divida") consulta = consulta.in("estado", ["pendente", "paga_parcial"]);
      else if (estado !== "todas") consulta = consulta.eq("estado", estado);
      const { data, error } = await consulta;
      if (error) throw error;
      return (data ?? []) as ContaPagar[];
    },
  });

  const pagamento = useMutation({
    mutationFn: async () => {
      if (!emPagamento) return;
      await registarPagamentoConta({
        conta_id: emPagamento.id,
        valor: Number(valor.replace(",", ".")),
        data: data || null,
        doc: doc || null,
      });
    },
    onSuccess: async () => {
      setEmPagamento(null);
      await queryClient.invalidateQueries({ queryKey: ["contas-pagar"] });
      toast.success("Pagamento registado.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const contas = linhas ?? [];
  const emDivida = contas.filter((c) => c.estado === "pendente" || c.estado === "paga_parcial");
  const soma = (lista: ContaPagar[]) => lista.reduce((t, c) => t + Number(c.em_divida), 0);
  const vencidas = emDivida.filter((c) => Number(c.dias_para_vencer) < 0);
  const semana = emDivida.filter(
    (c) => Number(c.dias_para_vencer) >= 0 && Number(c.dias_para_vencer) <= 7,
  );

  return (
    <div>
      <CabecalhoPagina
        titulo="Contas a pagar"
        descricao="O que a UP Móveis deve aos fornecedores, por data de vencimento."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cartao titulo="Já vencido" valor={soma(vencidas)} destaque />
        <Cartao titulo="Vence em 7 dias" valor={soma(semana)} />
        <Cartao titulo="Total em dívida" valor={soma(emDivida)} />
      </div>

      <div className="mb-4">
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="sm:w-64" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="em_divida">Em dívida</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="paga">Pagas</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending && <Skeleton className="h-56 w-full rounded-lg" />}

      {!isPending && contas.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Não há contas para este filtro.
        </div>
      )}

      <ul className="space-y-2">
        {contas.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <BadgeEuro className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {c.fornecedor_nome}
                {c.oc_numero ? ` · ${c.oc_numero}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.descricao} · vence {formatarData(c.data_vencimento)}
                {Number(c.dias_para_vencer) < 0 &&
                (c.estado === "pendente" || c.estado === "paga_parcial")
                  ? ` · ${Math.abs(Number(c.dias_para_vencer))} dias de atraso`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">{formatarDinheiro(c.em_divida)}</p>
                <p className="text-[11px] text-muted-foreground">
                  de {formatarDinheiro(c.valor)}
                </p>
              </div>
              <Badge variant="secondary" className="text-[11px]">
                {ETIQUETA_CONTA[c.estado] ?? c.estado}
              </Badge>
              {pagar && (c.estado === "pendente" || c.estado === "paga_parcial") && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEmPagamento(c);
                    setValor(String(Number(c.em_divida).toFixed(2)));
                    setData(new Date().toISOString().slice(0, 10));
                    setDoc(c.doc_fornecedor ?? "");
                  }}
                >
                  Pagar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <DialogoForm
        aberto={Boolean(emPagamento)}
        onFechar={() => setEmPagamento(null)}
        titulo="Registar pagamento"
        descricao={emPagamento ? `${emPagamento.fornecedor_nome} · ${emPagamento.descricao}` : ""}
        aGuardar={pagamento.isPending}
        onGuardar={() => pagamento.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="valor-pago">Valor pago (€)</Label>
          <Input
            id="valor-pago"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="data-pago">Data do pagamento</Label>
          <Input
            id="data-pago"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-pago">Documento do fornecedor</Label>
          <Input id="doc-pago" value={doc} onChange={(e) => setDoc(e.target.value)} />
        </div>
      </DialogoForm>
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        {titulo}
      </p>
      <p
        className={`mt-1 text-xl font-semibold ${destaque && valor > 0 ? "text-destructive" : ""}`}
      >
        {formatarDinheiro(valor)}
      </p>
    </div>
  );
}
