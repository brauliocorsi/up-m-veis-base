import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { useState } from "react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissoes } from "@/hooks/use-permissoes";
import {
  descarregarCsv,
  lerFluxoPrevisto,
  lerRelAtrasoFornecedores,
  lerRelContasPagar,
  lerRelCupoes,
  lerRelMargens,
  lerRelRecebimentos,
  lerRelVendas,
} from "@/lib/erp/financeiro";
import { formatarData, formatarDinheiro } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — UP Vendas" },
      {
        name: "description",
        content:
          "Relatórios da UP Móveis: vendas, margem, recebimentos, contas a pagar, fluxo de caixa, atraso de fornecedores e cupões.",
      },
      { property: "og:title", content: "Relatórios — UP Vendas" },
      {
        property: "og:description",
        content: "Filtre por período e exporte em CSV ou imprima os mesmos números do ecrã.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaRelatorios,
});

const hoje = () => new Date().toISOString().slice(0, 10);
const trintaDias = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

interface Coluna {
  chave: string;
  etiqueta: string;
  dinheiro?: boolean;
  data?: boolean;
}

function Tabela({
  nome,
  colunas,
  linhas,
  aCarregar,
}: {
  nome: string;
  colunas: Coluna[];
  linhas: ReadonlyArray<Record<string, unknown>>;
  aCarregar: boolean;
}) {
  if (aCarregar) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (linhas.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
        Sem dados para este período.
      </div>
    );
  }
  const mostrar = (l: Record<string, unknown>, c: Coluna) => {
    const v = l[c.chave];
    if (v === null || v === undefined || v === "") return "—";
    if (c.dinheiro) return formatarDinheiro(Number(v));
    if (c.data) return formatarData(String(v));
    return String(v);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            descarregarCsv(
              nome,
              colunas.map((c) => ({ chave: c.chave, etiqueta: c.etiqueta })),
              linhas,
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {colunas.map((c) => (
                <th key={c.chave} className="whitespace-nowrap px-3 py-2 font-medium">
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className="border-t">
                {colunas.map((c) => (
                  <td key={c.chave} className="whitespace-nowrap px-3 py-2">
                    {mostrar(l, c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaginaRelatorios() {
  const { verCustos } = usePermissoes();
  const [de, setDe] = useState(trintaDias());
  const [ate, setAte] = useState(hoje());

  const vendas = useQuery({ queryKey: ["rel-vendas", de, ate], queryFn: () => lerRelVendas(de, ate) });
  const margens = useQuery({
    queryKey: ["rel-margens", de, ate],
    queryFn: () => lerRelMargens(de, ate),
    enabled: verCustos,
  });
  const recebimentos = useQuery({
    queryKey: ["rel-recebimentos", de, ate],
    queryFn: () => lerRelRecebimentos(de, ate),
  });
  const contas = useQuery({ queryKey: ["rel-contas-pagar"], queryFn: lerRelContasPagar });
  const fluxo = useQuery({ queryKey: ["fluxo-previsto"], queryFn: lerFluxoPrevisto });
  const atrasos = useQuery({ queryKey: ["rel-atrasos"], queryFn: lerRelAtrasoFornecedores });
  const cupoes = useQuery({ queryKey: ["rel-cupoes"], queryFn: lerRelCupoes });

  const fluxoLinhas = (fluxo.data ?? []).map((s) => ({
    ...s,
    saldo: Number(s.a_receber) - Number(s.a_pagar),
  }));

  return (
    <div>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Números do negócio, filtráveis por período e exportáveis para CSV."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md print:hidden">
        <div className="space-y-2">
          <Label htmlFor="rel-de">De</Label>
          <Input id="rel-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rel-ate">Até</Label>
          <Input id="rel-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>

      <Tabs defaultValue="vendas">
        <TabsList className="mb-4 flex-wrap print:hidden">
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          {verCustos && <TabsTrigger value="margem">Margem</TabsTrigger>}
          <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
          <TabsTrigger value="contas">Contas a pagar</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de caixa</TabsTrigger>
          <TabsTrigger value="atrasos">Atraso de fornecedores</TabsTrigger>
          <TabsTrigger value="cupoes">Cupões</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas">
          <Tabela
            nome="vendas"
            aCarregar={vendas.isPending}
            linhas={(vendas.data ?? []) as unknown as Array<Record<string, unknown>>}
            colunas={[
              { chave: "data", etiqueta: "Data", data: true },
              { chave: "numero", etiqueta: "Pedido" },
              { chave: "cliente_nome", etiqueta: "Cliente" },
              { chave: "vendedor_nome", etiqueta: "Vendedora" },
              { chave: "formas", etiqueta: "Formas" },
              { chave: "total", etiqueta: "Total", dinheiro: true },
              { chave: "total_pago", etiqueta: "Pago", dinheiro: true },
              { chave: "estado_pagamento", etiqueta: "Pagamento" },
            ]}
          />
        </TabsContent>

        {verCustos && (
          <TabsContent value="margem">
            <Tabela
              nome="margem"
              aCarregar={margens.isPending}
              linhas={(margens.data ?? []) as unknown as Array<Record<string, unknown>>}
              colunas={[
                { chave: "pedido_numero", etiqueta: "Pedido" },
                { chave: "vendedor_nome", etiqueta: "Vendedora" },
                { chave: "vendido", etiqueta: "Vendido", dinheiro: true },
                { chave: "custo", etiqueta: "Custo", dinheiro: true },
                { chave: "margem", etiqueta: "Margem", dinheiro: true },
                { chave: "margem_pct", etiqueta: "Margem %" },
              ]}
            />
          </TabsContent>
        )}

        <TabsContent value="recebimentos">
          <Tabela
            nome="recebimentos"
            aCarregar={recebimentos.isPending}
            linhas={(recebimentos.data ?? []) as unknown as Array<Record<string, unknown>>}
            colunas={[
              { chave: "data", etiqueta: "Data", data: true },
              { chave: "forma_nome", etiqueta: "Forma" },
              { chave: "estado", etiqueta: "Estado" },
              { chave: "n_pagamentos", etiqueta: "Nº" },
              { chave: "valor", etiqueta: "Valor", dinheiro: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="contas">
          <Tabela
            nome="contas-a-pagar"
            aCarregar={contas.isPending}
            linhas={contas.data ?? []}
            colunas={[
              { chave: "data_vencimento", etiqueta: "Vencimento", data: true },
              { chave: "categoria", etiqueta: "Categoria" },
              { chave: "estado", etiqueta: "Estado" },
              { chave: "n_contas", etiqueta: "Nº" },
              { chave: "valor", etiqueta: "Valor", dinheiro: true },
              { chave: "valor_pago", etiqueta: "Pago", dinheiro: true },
              { chave: "em_divida", etiqueta: "Em dívida", dinheiro: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="fluxo">
          <Tabela
            nome="fluxo-de-caixa"
            aCarregar={fluxo.isPending}
            linhas={fluxoLinhas as unknown as Array<Record<string, unknown>>}
            colunas={[
              { chave: "semana", etiqueta: "Semana", data: true },
              { chave: "fim_semana", etiqueta: "Até", data: true },
              { chave: "a_receber", etiqueta: "A receber", dinheiro: true },
              { chave: "a_pagar", etiqueta: "A pagar", dinheiro: true },
              { chave: "saldo", etiqueta: "Saldo", dinheiro: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="atrasos">
          <Tabela
            nome="atraso-fornecedores"
            aCarregar={atrasos.isPending}
            linhas={(atrasos.data ?? []) as unknown as Array<Record<string, unknown>>}
            colunas={[
              { chave: "fornecedor_nome", etiqueta: "Fornecedor" },
              { chave: "numero", etiqueta: "Ordem" },
              { chave: "prometido", etiqueta: "Prometido", data: true },
              { chave: "recebido", etiqueta: "Recebido", data: true },
              { chave: "dias_atraso", etiqueta: "Dias de atraso" },
              { chave: "estado", etiqueta: "Estado" },
            ]}
          />
        </TabsContent>

        <TabsContent value="cupoes">
          <Tabela
            nome="cupoes"
            aCarregar={cupoes.isPending}
            linhas={(cupoes.data ?? []) as unknown as Array<Record<string, unknown>>}
            colunas={[
              { chave: "codigo", etiqueta: "Código" },
              { chave: "tipo", etiqueta: "Tipo" },
              { chave: "usos", etiqueta: "Usos" },
              { chave: "desconto_total", etiqueta: "Desconto dado", dinheiro: true },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
