import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Receipt, Repeat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { criarDespesa, lerCategoriasDespesa, lerDespesas } from "@/lib/erp/financeiro";
import {
  ETIQUETA_CONTA,
  ETIQUETA_PERIODICIDADE,
  formatarData,
  formatarDinheiro,
  type Fornecedor,
  type Periodicidade,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/despesas")({
  head: () => ({
    meta: [
      { title: "Despesas — UP Vendas" },
      {
        name: "description",
        content:
          "Despesas da UP Móveis fora das ordens de compra: rendas, combustível, seguros e outras, com recorrência automática.",
      },
      { property: "og:title", content: "Despesas — UP Vendas" },
      {
        property: "og:description",
        content: "Registe despesas pontuais e recorrentes e acompanhe o seu pagamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaDespesas,
});

function PaginaDespesas() {
  const { pagar } = usePermissoes();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [valor, setValor] = useState("");
  const [dataDespesa, setDataDespesa] = useState(new Date().toISOString().slice(0, 10));
  const [dataVencimento, setDataVencimento] = useState(new Date().toISOString().slice(0, 10));
  const [recorrente, setRecorrente] = useState(false);
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("mensal");
  const [comprovativo, setComprovativo] = useState("");

  const { data: despesas, isPending } = useQuery({ queryKey: ["despesas"], queryFn: lerDespesas });
  const { data: categorias } = useQuery({
    queryKey: ["categorias-despesa"],
    queryFn: lerCategoriasDespesa,
  });
  const { data: fornecedores } = useQuery({
    queryKey: ["fornecedores-despesa"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("fornecedores")
        .select("id,nome")
        .is("eliminado_em", null)
        .order("nome")
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Array<Pick<Fornecedor, "id" | "nome">>;
    },
  });

  const criar = useMutation({
    mutationFn: async () =>
      criarDespesa({
        descricao,
        categoria,
        valor: Number(valor.replace(",", ".")),
        data_vencimento: dataVencimento,
        data_despesa: dataDespesa,
        fornecedor_id: fornecedorId || null,
        recorrente,
        periodicidade: recorrente ? periodicidade : null,
        comprovativo_url: comprovativo || null,
      }),
    onSuccess: async () => {
      setAberto(false);
      setDescricao("");
      setValor("");
      setComprovativo("");
      await queryClient.invalidateQueries({ queryKey: ["despesas"] });
      await queryClient.invalidateQueries({ queryKey: ["contas-pagar"] });
      toast.success("Despesa registada com a respetiva conta a pagar.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const lista = despesas ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Despesas"
        descricao="Despesas que não vêm de ordens de compra. Cada despesa cria a sua conta a pagar."
        acao={
          pagar ? (
            <Button
              onClick={() => {
                setCategoria(categorias?.[0]?.nome ?? "");
                setAberto(true);
              }}
            >
              Nova despesa
            </Button>
          ) : null
        }
      />

      {isPending && <Skeleton className="h-56 w-full rounded-lg" />}

      {!isPending && lista.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          Ainda não há despesas registadas.
        </div>
      )}

      <ul className="space-y-2">
        {lista.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <Receipt className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {d.descricao}
                {d.fornecedor_nome ? ` · ${d.fornecedor_nome}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {d.categoria} · vence {formatarData(d.data_vencimento)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{formatarDinheiro(d.valor)}</p>
              {d.recorrente && d.periodicidade && (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Repeat className="h-3 w-3" />
                  {ETIQUETA_PERIODICIDADE[d.periodicidade]}
                </Badge>
              )}
              {d.conta_estado && (
                <Badge variant="secondary" className="text-[11px]">
                  {ETIQUETA_CONTA[d.conta_estado] ?? d.conta_estado}
                </Badge>
              )}
            </div>
          </li>
        ))}
      </ul>

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo="Nova despesa"
        descricao="A conta a pagar é criada automaticamente com estes dados."
        aGuardar={criar.isPending}
        onGuardar={() => criar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="desp-descricao">Descrição</Label>
          <Input
            id="desp-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desp-categoria">Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger id="desp-categoria">
              <SelectValue placeholder="Escolha a categoria" />
            </SelectTrigger>
            <SelectContent>
              {(categorias ?? []).map((c) => (
                <SelectItem key={c.id} value={c.nome}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="desp-fornecedor">Fornecedor (opcional)</Label>
          <Select value={fornecedorId} onValueChange={setFornecedorId}>
            <SelectTrigger id="desp-fornecedor">
              <SelectValue placeholder="Sem fornecedor" />
            </SelectTrigger>
            <SelectContent>
              {(fornecedores ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="desp-valor">Valor (€)</Label>
          <Input
            id="desp-valor"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="desp-data">Data da despesa</Label>
            <Input
              id="desp-data"
              type="date"
              value={dataDespesa}
              onChange={(e) => setDataDespesa(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desp-venc">Vencimento</Label>
            <Input
              id="desp-venc"
              type="date"
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="desp-recorrente"
            checked={recorrente}
            onCheckedChange={(v) => setRecorrente(v === true)}
          />
          <Label htmlFor="desp-recorrente">Despesa recorrente</Label>
        </div>
        {recorrente && (
          <div className="space-y-2">
            <Label htmlFor="desp-periodo">Periodicidade</Label>
            <Select
              value={periodicidade}
              onValueChange={(v) => setPeriodicidade(v as Periodicidade)}
            >
              <SelectTrigger id="desp-periodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="trimestral">Trimestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="desp-comp">Comprovativo (opcional)</Label>
          <Input
            id="desp-comp"
            value={comprovativo}
            onChange={(e) => setComprovativo(e.target.value)}
          />
        </div>
      </DialogoForm>
    </div>
  );
}
