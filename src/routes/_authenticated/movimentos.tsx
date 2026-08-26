import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Lista, type Coluna } from "@/components/erp/lista";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListagem } from "@/hooks/use-listagem";
import { listar, type Filtro } from "@/lib/erp/listar";
import {
  ETIQUETA_MOVIMENTO,
  ORIGENS_MOVIMENTO,
  TIPOS_MOVIMENTO,
  formatarData,
  type Movimento,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/movimentos")({
  head: () => ({
    meta: [
      { title: "Movimentos de stock — UP Vendas" },
      {
        name: "description",
        content:
          "Livro de movimentos de stock da UP Móveis: entradas, saídas, ajustes e quarentena, sem apagar nada.",
      },
      { property: "og:title", content: "Movimentos de stock — UP Vendas" },
      { property: "og:description", content: "Tudo o que entrou e saiu, com data, origem e motivo." },
    ],
  }),
  component: PaginaMovimentos,
});

function PaginaMovimentos() {
  const estado = useListagem("ocorrido_em", false);
  const [tipo, setTipo] = useState("todos");
  const [origem, setOrigem] = useState("todas");

  const filtros: Filtro[] = [];
  if (tipo !== "todos") filtros.push({ campo: "tipo", valor: tipo });
  if (origem !== "todas") filtros.push({ campo: "origem", valor: origem });

  const { data, isPending } = useQuery({
    queryKey: ["movimentos", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente, tipo, origem],
    queryFn: () =>
      listar<Movimento>({
        tabela: "v_stock_movimentos",
        temEliminacao: false,
        camposPesquisa: ["nome_cliente", "cod_barras", "motivo", "ref_externa"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
        filtros,
      }),
  });

  const colunas: Array<Coluna<Movimento>> = [
    {
      chave: "ocorrido_em",
      cabecalho: "Quando",
      ordenavel: true,
      celula: (linha) => (
        <span className="text-muted-foreground">{formatarData(linha.ocorrido_em)}</span>
      ),
    },
    {
      chave: "nome_cliente",
      cabecalho: "Produto",
      ordenavel: true,
      celula: (linha) => (
        <div>
          <Link
            to="/stock/$produtoId"
            params={{ produtoId: linha.produto_id }}
            className="font-medium hover:underline"
          >
            {linha.nome_cliente}
          </Link>
          <div className="text-xs text-muted-foreground">{linha.cod_barras}</div>
        </div>
      ),
    },
    {
      chave: "tipo",
      cabecalho: "Tipo",
      ordenavel: true,
      celula: (linha) => <Badge variant="outline">{ETIQUETA_MOVIMENTO[linha.tipo]}</Badge>,
    },
    {
      chave: "quantidade",
      cabecalho: "Qtd.",
      ordenavel: true,
      alinharDireita: true,
      celula: (linha) => (
        <span className={linha.quantidade < 0 ? "text-destructive" : ""}>
          {linha.quantidade > 0 ? `+${linha.quantidade}` : linha.quantidade}
        </span>
      ),
    },
    {
      chave: "origem",
      cabecalho: "Origem",
      ordenavel: true,
      esconderMobile: true,
      celula: (linha) => <span className="text-muted-foreground">{linha.origem}</span>,
    },
    {
      chave: "motivo",
      cabecalho: "Motivo / referência",
      esconderMobile: true,
      celula: (linha) => (
        <span className="text-muted-foreground">
          {linha.motivo ?? linha.ref_externa ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Movimentos de stock"
        descricao="Livro só de escrita: nada é alterado nem apagado. Correções entram como novos movimentos."
      />

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:max-w-xl">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger aria-label="Filtrar por tipo">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPOS_MOVIMENTO.map((t) => (
              <SelectItem key={t.valor} value={t.valor}>
                {t.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={origem} onValueChange={setOrigem}>
          <SelectTrigger aria-label="Filtrar por origem">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as origens</SelectItem>
            {ORIGENS_MOVIMENTO.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Lista
        colunas={colunas}
        linhas={data?.linhas ?? []}
        total={data?.total ?? 0}
        pagina={estado.pagina}
        tamanho={estado.tamanho}
        aCarregar={isPending}
        pesquisa={estado.pesquisa}
        ordenarPor={estado.ordenarPor}
        ascendente={estado.ascendente}
        onPesquisa={estado.onPesquisa}
        onPagina={estado.onPagina}
        onOrdenar={estado.onOrdenar}
        chave={(linha) => String(linha.id)}
        vazio="Ainda não há movimentos de stock."
      />
    </div>
  );
}
