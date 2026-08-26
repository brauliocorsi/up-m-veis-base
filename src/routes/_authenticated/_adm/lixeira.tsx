import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Lista, type Coluna } from "@/components/erp/lista";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListagem } from "@/hooks/use-listagem";
import { primeiraMensagem } from "@/lib/erp/erros";
import { listar, restaurarRegisto } from "@/lib/erp/listar";
import { TABELAS, formatarData } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/lixeira")({
  head: () => ({
    meta: [
      { title: "Lixeira — UP Vendas" },
      {
        name: "description",
        content: "Registos eliminados da UP Móveis, com motivo, autor e opção de restauro.",
      },
      { property: "og:title", content: "Lixeira — UP Vendas" },
      { property: "og:description", content: "Restaure registos eliminados por engano." },
    ],
  }),
  component: PaginaLixeira,
});

type LinhaEliminada = Record<string, unknown> & {
  id: string;
  eliminado_em: string | null;
  motivo_eliminacao: string | null;
};

function PaginaLixeira() {
  const estado = useListagem("eliminado_em", false);
  const queryClient = useQueryClient();
  const [tabela, setTabela] = useState(TABELAS[0]!.valor);

  const definicao = TABELAS.find((t) => t.valor === tabela)!;

  const { data, isPending } = useQuery({
    queryKey: ["lixeira", tabela, estado.pesquisa, estado.pagina, estado.ascendente],
    queryFn: () =>
      listar<LinhaEliminada>({
        tabela,
        camposPesquisa: [definicao.rotulo, "motivo_eliminacao"],
        pesquisa: estado.pesquisa,
        ordenarPor: "eliminado_em",
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
        eliminados: true,
      }),
  });

  const mRestaurar = useMutation({
    mutationFn: (id: string) => restaurarRegisto(tabela, id),
    onSuccess: () => {
      toast.success("Registo restaurado.");
      queryClient.invalidateQueries({ queryKey: ["lixeira"] });
      queryClient.invalidateQueries();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const colunas: Array<Coluna<LinhaEliminada>> = [
    {
      chave: definicao.rotulo,
      cabecalho: "Registo",
      celula: (linha) => (
        <div>
          <p className="font-medium">{String(linha[definicao.rotulo] ?? "—")}</p>
          <p className="text-xs text-muted-foreground md:hidden">
            {linha.motivo_eliminacao ?? "Sem motivo registado"}
          </p>
        </div>
      ),
    },
    {
      chave: "motivo_eliminacao",
      cabecalho: "Motivo",
      esconderMobile: true,
      celula: (linha) => linha.motivo_eliminacao ?? "—",
    },
    {
      chave: "eliminado_em",
      cabecalho: "Eliminado",
      ordenavel: true,
      celula: (linha) => formatarData(linha.eliminado_em),
    },
    {
      chave: "acoes",
      cabecalho: "",
      alinharDireita: true,
      celula: (linha) => (
        <Button
          variant="outline"
          size="sm"
          disabled={mRestaurar.isPending}
          onClick={() => mRestaurar.mutate(linha.id)}
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Restaurar
        </Button>
      ),
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Lixeira"
        descricao="Nada se perde: aqui estão os registos eliminados e pode devolvê-los às listas."
      />

      <div className="mb-3 max-w-xs">
        <Label htmlFor="tabela" className="mb-2 block text-xs text-muted-foreground">
          Ver eliminados de
        </Label>
        <Select
          value={tabela}
          onValueChange={(v) => {
            setTabela(v);
            estado.onPagina(1);
          }}
        >
          <SelectTrigger id="tabela">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABELAS.map((t) => (
              <SelectItem key={t.valor} value={t.valor}>
                {t.etiqueta}
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
        ordenarPor="eliminado_em"
        ascendente={estado.ascendente}
        onPesquisa={estado.onPesquisa}
        onPagina={estado.onPagina}
        onOrdenar={estado.onOrdenar}
        chave={(linha) => linha.id}
        vazio="A lixeira está vazia."
      />
    </div>
  );
}
