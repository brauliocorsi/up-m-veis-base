import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Lista, type Coluna } from "@/components/erp/lista";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListagem } from "@/hooks/use-listagem";
import { erp } from "@/lib/erp/db";
import { TABELAS, formatarData, type Evento } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — UP Vendas" },
      {
        name: "description",
        content: "Registo de quem criou, alterou, eliminou ou restaurou dados na UP Móveis.",
      },
      { property: "og:title", content: "Histórico — UP Vendas" },
      { property: "og:description", content: "Auditoria completa das alterações." },
    ],
  }),
  component: PaginaHistorico,
});

const OPERACOES: Record<Evento["operacao"], string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  ELIMINACAO: "Eliminação",
  RESTAURO: "Restauro",
};

function Alteracoes({ evento }: { evento: Evento }) {
  const alteracoes = evento.alteracoes;
  if (!alteracoes || Object.keys(alteracoes).length === 0) return <span>—</span>;
  const entradas = Object.entries(alteracoes).slice(0, 4);
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {entradas.map(([campo, valor]) => {
        const par = valor as { antes?: unknown; depois?: unknown } | null;
        const antes = par && typeof par === "object" && "antes" in par ? par.antes : undefined;
        const depois = par && typeof par === "object" && "depois" in par ? par.depois : valor;
        return (
          <li key={campo}>
            <span className="font-medium text-foreground">{campo}</span>{" "}
            {antes !== undefined && <span>de {JSON.stringify(antes)} </span>}
            <span>para {JSON.stringify(depois)}</span>
          </li>
        );
      })}
      {Object.keys(alteracoes).length > entradas.length && <li>…</li>}
    </ul>
  );
}

function PaginaHistorico() {
  const estado = useListagem("ocorrido_em", false);
  const [tabelaFiltro, setTabelaFiltro] = useState("todas");
  const [operacaoFiltro, setOperacaoFiltro] = useState("todas");

  const { data, isPending } = useQuery({
    queryKey: [
      "historico",
      estado.pesquisa,
      estado.pagina,
      estado.ascendente,
      tabelaFiltro,
      operacaoFiltro,
    ],
    queryFn: async () => {
      const de = (estado.pagina - 1) * estado.tamanho;
      let consulta = erp()
        .from("eventos")
        .select("*", { count: "exact" })
        .order("ocorrido_em", { ascending: estado.ascendente })
        .range(de, de + estado.tamanho - 1);

      if (tabelaFiltro !== "todas") consulta = consulta.eq("tabela", tabelaFiltro);
      if (operacaoFiltro !== "todas") consulta = consulta.eq("operacao", operacaoFiltro);
      const termo = estado.pesquisa.trim();
      if (termo) consulta = consulta.ilike("utilizador_nome", `%${termo}%`);

      const { data: linhas, error, count } = await consulta;
      if (error) throw error;
      return { linhas: (linhas ?? []) as Evento[], total: count ?? 0 };
    },
  });

  const colunas: Array<Coluna<Evento>> = [
    {
      chave: "ocorrido_em",
      cabecalho: "Quando",
      ordenavel: true,
      celula: (linha) => (
        <div>
          <p className="whitespace-nowrap font-medium">{formatarData(linha.ocorrido_em)}</p>
          <p className="text-xs text-muted-foreground md:hidden">
            {linha.utilizador_nome ?? "Sistema"} · {OPERACOES[linha.operacao]}
          </p>
        </div>
      ),
    },
    {
      chave: "utilizador_nome",
      cabecalho: "Quem",
      esconderMobile: true,
      celula: (linha) => linha.utilizador_nome ?? "Sistema",
    },
    {
      chave: "tabela",
      cabecalho: "Onde",
      esconderMobile: true,
      celula: (linha) => TABELAS.find((t) => t.valor === linha.tabela)?.etiqueta ?? linha.tabela,
    },
    {
      chave: "operacao",
      cabecalho: "O que fez",
      celula: (linha) => (
        <Badge variant={linha.operacao === "ELIMINACAO" ? "destructive" : "secondary"}>
          {OPERACOES[linha.operacao] ?? linha.operacao}
        </Badge>
      ),
    },
    {
      chave: "alteracoes",
      cabecalho: "Detalhe",
      esconderMobile: true,
      celula: (linha) => <Alteracoes evento={linha} />,
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Histórico"
        descricao="Tudo o que foi criado, alterado, eliminado ou restaurado, com data e responsável."
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
        <div>
          <Label htmlFor="f-tabela" className="mb-2 block text-xs text-muted-foreground">
            Área
          </Label>
          <Select
            value={tabelaFiltro}
            onValueChange={(v) => {
              setTabelaFiltro(v);
              estado.onPagina(1);
            }}
          >
            <SelectTrigger id="f-tabela">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as áreas</SelectItem>
              {TABELAS.map((t) => (
                <SelectItem key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="f-operacao" className="mb-2 block text-xs text-muted-foreground">
            Tipo de alteração
          </Label>
          <Select
            value={operacaoFiltro}
            onValueChange={(v) => {
              setOperacaoFiltro(v);
              estado.onPagina(1);
            }}
          >
            <SelectTrigger id="f-operacao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos os tipos</SelectItem>
              {Object.entries(OPERACOES).map(([valor, etiqueta]) => (
                <SelectItem key={valor} value={valor}>
                  {etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Lista
        colunas={colunas}
        linhas={data?.linhas ?? []}
        total={data?.total ?? 0}
        pagina={estado.pagina}
        tamanho={estado.tamanho}
        aCarregar={isPending}
        pesquisa={estado.pesquisa}
        ordenarPor="ocorrido_em"
        ascendente={estado.ascendente}
        onPesquisa={estado.onPesquisa}
        onPagina={estado.onPagina}
        onOrdenar={estado.onOrdenar}
        chave={(linha) => String(linha.id)}
        vazio="Ainda não há registos de alterações."
      />
    </div>
  );
}
