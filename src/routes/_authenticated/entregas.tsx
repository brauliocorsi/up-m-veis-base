import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { FiltrosVendasPainel } from "@/components/erp/filtros-vendas";
import { Lista, type Coluna } from "@/components/erp/lista";
import { Badge } from "@/components/ui/badge";
import { useListagem } from "@/hooks/use-listagem";
import { mensagemErro } from "@/lib/erp/db";
import { descarregarCsv } from "@/lib/erp/financeiro";
import { lerFiltros, type FiltrosVendas } from "@/lib/erp/filtros";
import { listar, type Filtro } from "@/lib/erp/listar";
import { formatarDataCurta, formatarDinheiro, type Entrega } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/entregas")({
  validateSearch: (busca: Record<string, unknown>): FiltrosVendas => lerFiltros(busca),
  head: () => ({
    meta: [
      { title: "Entregas — UP Vendas" },
      {
        name: "description",
        content:
          "Entregas da UP Móveis: totais e parciais, quem entregou, quem recebeu e reversões, com filtros por data, vendedora e zona.",
      },
      { property: "og:title", content: "Entregas — UP Vendas" },
      {
        property: "og:description",
        content: "Histórico de entregas totais e parciais, com reversões e exportação em CSV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaEntregas,
});

function PaginaEntregas() {
  const navigate = useNavigate();
  const lista = useListagem("data_entrega", false, 20);
  const filtros = Route.useSearch();

  const condicoes: Filtro[] = [];
  if (filtros.de) condicoes.push({ campo: "data_entrega", op: "gte", valor: filtros.de });
  if (filtros.ate) condicoes.push({ campo: "data_entrega", op: "lte", valor: filtros.ate });
  if (filtros.vendedor) condicoes.push({ campo: "vendedor_id", valor: filtros.vendedor });
  if (filtros.cp4) condicoes.push({ campo: "cp4_entrega", valor: filtros.cp4 });
  if (filtros.origem) condicoes.push({ campo: "pedido_origem", valor: filtros.origem });

  const { data, isLoading } = useQuery({
    queryKey: ["entregas", lista.pesquisa, lista.pagina, lista.ordenarPor, lista.ascendente, condicoes],
    queryFn: () =>
      listar<Entrega>({
        tabela: "v_entregas",
        camposPesquisa: ["pedido_numero", "cliente_nome", "cliente_telefone", "recebido_por_nome"],
        pesquisa: lista.pesquisa,
        ordenarPor: lista.ordenarPor,
        ascendente: lista.ascendente,
        pagina: lista.pagina,
        tamanho: lista.tamanho,
        filtros: condicoes,
      }),
  });

  const colunas: Array<Coluna<Entrega>> = [
    {
      chave: "data_entrega",
      cabecalho: "Data",
      ordenavel: true,
      celula: (e) => (
        <div className="leading-tight">
          <p>{formatarDataCurta(e.data_entrega)}</p>
          <p className="text-xs text-muted-foreground md:hidden">{e.cliente_nome}</p>
        </div>
      ),
    },
    {
      chave: "pedido_numero",
      cabecalho: "Venda",
      celula: (e) => (
        <Link
          to="/pedidos/$pedidoId"
          params={{ pedidoId: e.pedido_id }}
          className="font-medium hover:underline"
        >
          {e.pedido_numero}
        </Link>
      ),
    },
    {
      chave: "cliente_nome",
      cabecalho: "Cliente",
      esconderMobile: true,
      celula: (e) => (
        <div className="leading-tight">
          <p>{e.cliente_nome ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{e.zona_nome ?? e.cp4_entrega ?? "—"}</p>
        </div>
      ),
    },
    {
      chave: "tipo",
      cabecalho: "Tipo",
      celula: (e) => (
        <div className="space-y-1">
          <Badge variant="secondary">{e.tipo === "total" ? "Total" : "Parcial"}</Badge>
          {e.estado === "revertida" && (
            <Badge variant="secondary" className="block w-fit bg-destructive/10 text-destructive">
              Revertida
            </Badge>
          )}
        </div>
      ),
    },
    {
      chave: "unidades",
      cabecalho: "Unidades",
      alinharDireita: true,
      celula: (e) => e.unidades ?? 0,
    },
    {
      chave: "entregue_por_nome",
      cabecalho: "Entregue por",
      esconderMobile: true,
      celula: (e) => (
        <div className="leading-tight">
          <p>{e.entregue_por_nome ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {e.recebido_por_nome ? `Recebido por ${e.recebido_por_nome}` : "—"}
          </p>
        </div>
      ),
    },
    {
      chave: "pedido_total",
      cabecalho: "Total da venda",
      alinharDireita: true,
      esconderMobile: true,
      celula: (e) => formatarDinheiro(e.pedido_total ?? 0),
    },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Entregas"
        descricao="O stock só sai quando a entrega é registada. As entregas não se editam — revertem-se."
      />

      <FiltrosVendasPainel
        filtros={filtros}
        campos={["periodo", "vendedor", "cp4", "origem"]}
        resultados={data?.total ?? 0}
        atalhos={[]}
        onMudar={(novos) => {
          lista.onPagina(1);
          navigate({ to: "/entregas", search: novos });
        }}
        onExportar={() => {
          try {
            descarregarCsv(
              "entregas",
              [
                { chave: "data_entrega", etiqueta: "Data" },
                { chave: "pedido_numero", etiqueta: "Venda" },
                { chave: "cliente_nome", etiqueta: "Cliente" },
                { chave: "tipo", etiqueta: "Tipo" },
                { chave: "estado", etiqueta: "Estado" },
                { chave: "unidades", etiqueta: "Unidades" },
                { chave: "entregue_por_nome", etiqueta: "Entregue por" },
                { chave: "recebido_por_nome", etiqueta: "Recebido por" },
              ],
              (data?.linhas ?? []) as unknown as Array<Record<string, unknown>>,
            );
          } catch (erro) {
            toast.error(mensagemErro(erro));
          }
        }}
      />

      <Lista
        colunas={colunas}
        linhas={data?.linhas ?? []}
        total={data?.total ?? 0}
        pagina={lista.pagina}
        tamanho={lista.tamanho}
        aCarregar={isLoading}
        pesquisa={lista.pesquisa}
        ordenarPor={lista.ordenarPor}
        ascendente={lista.ascendente}
        vazio="Ainda não há entregas registadas."
        onPesquisa={lista.onPesquisa}
        onPagina={lista.onPagina}
        onOrdenar={lista.onOrdenar}
        chave={(e) => e.id}
      />

      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Truck className="h-4 w-4" /> Para registar uma entrega, abra a venda.
      </p>
    </>
  );
}
