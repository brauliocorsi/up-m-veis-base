import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Unlock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { GrupoAcoes, type Acao } from "@/components/erp/acoes";
import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Lista, type Coluna } from "@/components/erp/lista";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { listar, type Filtro } from "@/lib/erp/listar";
import { libertarReserva } from "@/lib/erp/stock";
import { ESTADOS_RESERVA, ETIQUETA_RESERVA, formatarData, type Reserva } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/reservas")({
  head: () => ({
    meta: [
      { title: "Reservas de stock — UP Vendas" },
      {
        name: "description",
        content:
          "Reservas de stock da UP Móveis por documento: o que está preso, até quando e para quem.",
      },
      { property: "og:title", content: "Reservas de stock — UP Vendas" },
      { property: "og:description", content: "Unidades presas a pedidos e vendas em curso." },
    ],
  }),
  component: PaginaReservas,
});

function PaginaReservas() {
  const estado = useListagem("criado_em", false);
  const queryClient = useQueryClient();
  const [filtroEstado, setFiltroEstado] = useState("ativa");
  const [aLibertar, setALibertar] = useState<Reserva | null>(null);
  const [motivo, setMotivo] = useState("");

  const filtros: Filtro[] = filtroEstado === "todos" ? [] : [{ campo: "estado", valor: filtroEstado }];

  const { data, isPending } = useQuery({
    queryKey: ["reservas", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente, filtroEstado],
    queryFn: () =>
      listar<Reserva>({
        tabela: "v_reservas_detalhe",
        camposPesquisa: ["nome_cliente", "cod_barras", "documento_tipo"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
        filtros,
      }),
  });

  const mLibertar = useMutation({
    mutationFn: async () => {
      if (!aLibertar) return;
      if (motivo.trim().length < 5) throw new Error("Escreva um motivo com pelo menos 5 caracteres.");
      await libertarReserva(aLibertar.id, motivo.trim());
    },
    onSuccess: () => {
      toast.success("Reserva libertada. As unidades voltaram ao vendável.");
      setALibertar(null);
      setMotivo("");
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const colunas: Array<Coluna<Reserva>> = [
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
            {linha.nome_cliente ?? "Produto"}
          </Link>
          <div className="text-xs text-muted-foreground">{linha.cod_barras}</div>
        </div>
      ),
    },
    {
      chave: "quantidade",
      cabecalho: "Qtd.",
      ordenavel: true,
      alinharDireita: true,
      celula: (linha) => <span className="font-medium">{linha.quantidade}</span>,
    },
    {
      chave: "documento_tipo",
      cabecalho: "Documento",
      ordenavel: true,
      esconderMobile: true,
      celula: (linha) => (
        <span className="text-muted-foreground">
          {linha.documento_tipo} · {linha.documento_id.slice(0, 8)}
        </span>
      ),
    },
    {
      chave: "estado",
      cabecalho: "Estado",
      ordenavel: true,
      celula: (linha) => (
        <Badge variant={linha.estado === "ativa" ? "default" : "secondary"}>
          {ETIQUETA_RESERVA[linha.estado]}
        </Badge>
      ),
    },
    {
      chave: "expira_em",
      cabecalho: "Expira",
      ordenavel: true,
      esconderMobile: true,
      celula: (linha) => (
        <span className="text-muted-foreground">{formatarData(linha.expira_em)}</span>
      ),
    },
    {
      chave: "acoes",
      cabecalho: "",
      alinharDireita: true,
      celula: (linha) => {
        const acoes: Acao[] = [
          {
            chave: "libertar",
            etiqueta: "Libertar reserva",
            icone: Unlock,
            desativada: linha.estado !== "ativa",
            onSelect: () => {
              setALibertar(linha);
              setMotivo("");
            },
          },
        ];
        return <GrupoAcoes acoes={acoes} />;
      },
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Reservas"
        descricao="Unidades presas a documentos abertos. Libertar devolve as unidades ao vendável."
      />

      <div className="mb-3 max-w-xs">
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os estados</SelectItem>
            {ESTADOS_RESERVA.map((e) => (
              <SelectItem key={e.valor} value={e.valor}>
                {e.etiqueta}
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
        chave={(linha) => linha.id}
        vazio="Não há reservas com este estado."
      />

      <DialogoForm
        aberto={Boolean(aLibertar)}
        onFechar={() => setALibertar(null)}
        titulo="Libertar reserva"
        descricao={`${aLibertar?.nome_cliente ?? ""} — ${aLibertar?.quantidade ?? 0} unidade(s) voltam ao vendável.`}
        aGuardar={mLibertar.isPending}
        onGuardar={() => mLibertar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="motivo-libertar">Motivo</Label>
          <Input
            id="motivo-libertar"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: pedido cancelado pelo cliente"
          />
        </div>
      </DialogoForm>
    </div>
  );
}
