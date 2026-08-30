import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, HandCoins, Landmark } from "lucide-react";
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
import { usePermissoes } from "@/hooks/use-permissoes";
import { lerContasReceber, lerFinanciadores } from "@/lib/erp/financeiro";
import { primeiraMensagem } from "@/lib/erp/erros";
import { confirmarPagamento, devolverPagamento } from "@/lib/erp/pagamentos";
import {
  ETIQUETA_PAGAMENTO,
  formatarData,
  formatarDinheiro,
  type ContaReceber,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/contas-receber")({
  head: () => ({
    meta: [
      { title: "Contas a receber — UP Vendas" },
      {
        name: "description",
        content:
          "Recebimentos por confirmar da UP Móveis: transferências, valores a receber na entrega e financiadores.",
      },
      { property: "og:title", content: "Contas a receber — UP Vendas" },
      {
        property: "og:description",
        content: "Veja o que está por cobrar e confirme recebimentos com comprovativo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaContasReceber,
});

function PaginaContasReceber() {
  const { receber } = usePermissoes();
  const queryClient = useQueryClient();
  const [aConfirmar, setAConfirmar] = useState<ContaReceber | null>(null);
  const [referencia, setReferencia] = useState("");
  const [comprovativo, setComprovativo] = useState("");
  const [aDevolver, setADevolver] = useState<ContaReceber | null>(null);
  const [motivo, setMotivo] = useState("");

  const { data: linhas, isPending } = useQuery({
    queryKey: ["contas-receber"],
    queryFn: lerContasReceber,
  });

  const { data: financiadores } = useQuery({
    queryKey: ["financiadores"],
    queryFn: lerFinanciadores,
  });

  const atualizar = async () => {
    await queryClient.invalidateQueries({ queryKey: ["contas-receber"] });
    await queryClient.invalidateQueries({ queryKey: ["financiadores"] });
    await queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
  };

  const confirmar = useMutation({
    mutationFn: async () => {
      if (!aConfirmar) return;
      await confirmarPagamento(aConfirmar.id, comprovativo || null, referencia || null);
    },
    onSuccess: async () => {
      setAConfirmar(null);
      await atualizar();
      toast.success("Recebimento confirmado.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const devolver = useMutation({
    mutationFn: async () => {
      if (!aDevolver) return;
      await devolverPagamento(aDevolver.id, motivo);
    },
    onSuccess: async () => {
      setADevolver(null);
      await atualizar();
      toast.success("Devolução registada.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const contas = linhas ?? [];
  const naEntrega = contas.filter((c) => c.forma_momento === "entrega");
  const financiados = contas.filter((c) => c.forma_momento === "financiador");
  const pendentes = contas.filter(
    (c) => c.forma_momento !== "entrega" && c.forma_momento !== "financiador",
  );
  const soma = (lista: ContaReceber[]) => lista.reduce((t, c) => t + Number(c.valor), 0);
  const atrasadas = contas.filter((c) => c.em_atraso);

  const abrirConfirmacao = (c: ContaReceber) => {
    setAConfirmar(c);
    setReferencia(c.referencia ?? "");
    setComprovativo(c.comprovativo_url ?? "");
  };

  const Lista = ({ itens }: { itens: ContaReceber[] }) => {
    if (isPending) return <Skeleton className="h-56 w-full rounded-lg" />;
    if (itens.length === 0) {
      return (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Não há nada por receber aqui.
        </div>
      );
    }
    return (
      <ul className="space-y-2">
        {itens.map((c) => (
          <li
            key={c.id}
            className={`flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 ${
              c.em_atraso ? "border-destructive/60" : ""
            }`}
          >
            <HandCoins
              className={`h-4 w-4 shrink-0 ${c.em_atraso ? "text-destructive" : "text-primary"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {c.cliente_nome} · {c.pedido_numero}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.forma_nome}
                {c.data_prevista ? ` · previsto ${formatarData(c.data_prevista)}` : ""}
                {c.data_limite_confirmacao
                  ? ` · limite ${formatarData(c.data_limite_confirmacao)}`
                  : ""}
                {c.referencia ? ` · ref. ${c.referencia}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={`text-sm font-medium ${c.em_atraso ? "text-destructive" : ""}`}
              >
                {formatarDinheiro(c.valor)}
              </p>
              <Badge variant={c.em_atraso ? "destructive" : "secondary"} className="text-[11px]">
                {c.em_atraso ? "Fora do prazo" : (ETIQUETA_PAGAMENTO[c.estado] ?? c.estado)}
              </Badge>
              {receber && (
                <>
                  <Button size="sm" onClick={() => abrirConfirmacao(c)}>
                    Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setADevolver(c);
                      setMotivo("");
                    }}
                  >
                    Devolver
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div>
      <CabecalhoPagina
        titulo="Contas a receber"
        descricao="O que os clientes ainda devem à UP Móveis, por forma de pagamento."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cartao titulo="Total por receber" valor={soma(contas)} />
        <Cartao titulo="Fora do prazo" valor={soma(atrasadas)} destaque />
        <Cartao titulo="A receber na entrega" valor={soma(naEntrega)} />
      </div>

      {atrasadas.length > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {atrasadas.length} recebimento(s) passaram o prazo de confirmação.
        </p>
      )}

      <Tabs defaultValue="pendentes">
        <TabsList className="mb-4">
          <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="entrega">Na entrega ({naEntrega.length})</TabsTrigger>
          <TabsTrigger value="financiadores">Financiadores ({financiados.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pendentes">
          <Lista itens={pendentes} />
        </TabsContent>
        <TabsContent value="entrega">
          <Lista itens={naEntrega} />
        </TabsContent>
        <TabsContent value="financiadores">
          <Lista itens={financiados} />
          <div className="mt-6 space-y-2">
            <h2 className="text-sm font-semibold">Resumo por financiador</h2>
            {(financiadores ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ainda não há pagamentos com taxa de financiador.
              </p>
            )}
            {(financiadores ?? []).map((f) => (
              <div
                key={`${f.forma_codigo}-${f.estado}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm"
              >
                <Landmark className="h-4 w-4 text-primary" />
                <span className="flex-1 font-medium">{f.forma_nome}</span>
                <Badge variant="secondary" className="text-[11px]">
                  {ETIQUETA_PAGAMENTO[f.estado as keyof typeof ETIQUETA_PAGAMENTO] ?? f.estado}
                </Badge>
                <span className="text-muted-foreground">
                  bruto {formatarDinheiro(f.bruto)} · taxa {formatarDinheiro(f.taxa)}
                </span>
                <span className="font-medium">{formatarDinheiro(f.liquido)}</span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <DialogoForm
        aberto={Boolean(aConfirmar)}
        onFechar={() => setAConfirmar(null)}
        titulo="Confirmar recebimento"
        descricao={
          aConfirmar
            ? `${aConfirmar.cliente_nome} · ${formatarDinheiro(aConfirmar.valor)} · ${aConfirmar.forma_nome}`
            : ""
        }
        aGuardar={confirmar.isPending}
        onGuardar={() => confirmar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="ref-receb">Referência</Label>
          <Input
            id="ref-receb"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Referência bancária ou do financiador"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="comp-receb">
            Comprovativo{aConfirmar?.exige_comprovativo ? " (obrigatório)" : ""}
          </Label>
          <Input
            id="comp-receb"
            value={comprovativo}
            onChange={(e) => setComprovativo(e.target.value)}
            placeholder="Ligação ao comprovativo"
          />
        </div>
      </DialogoForm>

      <DialogoForm
        aberto={Boolean(aDevolver)}
        onFechar={() => setADevolver(null)}
        titulo="Devolver recebimento"
        descricao={
          aDevolver
            ? `${aDevolver.cliente_nome} · ${formatarDinheiro(aDevolver.valor)}`
            : ""
        }
        aGuardar={devolver.isPending}
        onGuardar={() => devolver.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="motivo-dev">Motivo da devolução</Label>
          <Input id="motivo-dev" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
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
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p
        className={`mt-1 text-xl font-semibold ${destaque && valor > 0 ? "text-destructive" : ""}`}
      >
        {formatarDinheiro(valor)}
      </p>
    </div>
  );
}
