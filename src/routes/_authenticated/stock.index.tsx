import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, Shield, SlidersHorizontal } from "lucide-react";
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
import { useSessao } from "@/hooks/use-sessao";
import { primeiraMensagem } from "@/lib/erp/erros";
import { listar, type Filtro } from "@/lib/erp/listar";
import { ajusteManual, definirMargemSeguranca } from "@/lib/erp/stock";
import { ETIQUETA_FORNECIMENTO, type LinhaStock } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/stock/")({
  head: () => ({
    meta: [
      { title: "Stock — UP Vendas" },
      {
        name: "description",
        content:
          "Stock comercial da UP Móveis: físico, reservado, vendável e prometível por produto.",
      },
      { property: "og:title", content: "Stock — UP Vendas" },
      { property: "og:description", content: "O que existe, o que está preso e o que se pode vender." },
    ],
  }),
  component: PaginaStock,
});

type Vista = "todos" | "vendavel" | "abaixo" | "quarentena" | "reservado";

const VISTAS: Array<{ valor: Vista; etiqueta: string }> = [
  { valor: "todos", etiqueta: "Todos os produtos" },
  { valor: "vendavel", etiqueta: "Com unidades vendáveis" },
  { valor: "abaixo", etiqueta: "Sem stock vendável" },
  { valor: "quarentena", etiqueta: "Com quarentena" },
  { valor: "reservado", etiqueta: "Com reservas" },
];

function filtrosDaVista(vista: Vista): Filtro[] {
  switch (vista) {
    case "vendavel":
      return [{ campo: "vendavel", valor: 0, op: "gt" }];
    case "abaixo":
      return [{ campo: "vendavel", valor: 1, op: "lt" }];
    case "quarentena":
      return [{ campo: "quarentena", valor: 0, op: "gt" }];
    case "reservado":
      return [{ campo: "reservado", valor: 0, op: "gt" }];
    default:
      return [];
  }
}

function PaginaStock() {
  const estado = useListagem("nome_cliente", true);
  const queryClient = useQueryClient();
  const { data: sessao } = useSessao();
  const navigate = useNavigate();
  const eAdm = sessao?.utilizador?.perfil === "adm";

  const [vista, setVista] = useState<Vista>("todos");
  const [ajuste, setAjuste] = useState<LinhaStock | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [margem, setMargem] = useState<LinhaStock | null>(null);
  const [valorMargem, setValorMargem] = useState("0");

  const { data, isPending } = useQuery({
    queryKey: ["stock", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente, vista],
    queryFn: () =>
      listar<LinhaStock>({
        tabela: "v_stock",
        temEliminacao: false,
        camposPesquisa: ["nome_cliente", "cod_barras"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
        filtros: filtrosDaVista(vista),
      }),
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    queryClient.invalidateQueries({ queryKey: ["movimentos"] });
  };

  const mAjustar = useMutation({
    mutationFn: async () => {
      if (!ajuste) return;
      const valor = Number(quantidade);
      if (!Number.isInteger(valor) || valor === 0) {
        throw new Error("Indique um número inteiro diferente de zero.");
      }
      if (motivo.trim().length < 5) {
        throw new Error("Escreva um motivo com pelo menos 5 caracteres.");
      }
      await ajusteManual({ produto_id: ajuste.produto_id, quantidade: valor, motivo: motivo.trim() });
    },
    onSuccess: () => {
      toast.success("Ajuste registado no livro de movimentos.");
      setAjuste(null);
      setQuantidade("");
      setMotivo("");
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mMargem = useMutation({
    mutationFn: async () => {
      if (!margem) return;
      const valor = Number(valorMargem);
      if (!Number.isInteger(valor) || valor < 0) throw new Error("A margem tem de ser 0 ou mais.");
      await definirMargemSeguranca(margem.produto_id, valor);
    },
    onSuccess: () => {
      toast.success("Margem de segurança guardada.");
      setMargem(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const numero = (valor: number, destaque?: boolean) => (
    <span className={destaque ? "font-semibold" : "text-muted-foreground"}>{valor}</span>
  );

  const colunas: Array<Coluna<LinhaStock>> = [
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
          <div className="text-xs text-muted-foreground">
            {linha.cod_barras} · {ETIQUETA_FORNECIMENTO[linha.tipo_fornecimento]}
          </div>
        </div>
      ),
    },
    {
      chave: "fisico",
      cabecalho: "Físico",
      ordenavel: true,
      alinharDireita: true,
      celula: (linha) => numero(linha.fisico),
    },
    {
      chave: "reservado",
      cabecalho: "Reservado",
      ordenavel: true,
      alinharDireita: true,
      esconderMobile: true,
      celula: (linha) => numero(linha.reservado),
    },
    {
      chave: "quarentena",
      cabecalho: "Quarentena",
      ordenavel: true,
      alinharDireita: true,
      esconderMobile: true,
      celula: (linha) =>
        linha.quarentena > 0 ? (
          <Badge variant="outline" className="text-amber-600">
            {linha.quarentena}
          </Badge>
        ) : (
          numero(0)
        ),
    },
    {
      chave: "margem_seguranca",
      cabecalho: "Margem",
      alinharDireita: true,
      esconderMobile: true,
      celula: (linha) => numero(linha.margem_seguranca),
    },
    {
      chave: "vendavel",
      cabecalho: "Vendável",
      ordenavel: true,
      alinharDireita: true,
      celula: (linha) =>
        linha.vendavel > 0 ? (
          numero(linha.vendavel, true)
        ) : (
          <Badge variant="secondary">Esgotado</Badge>
        ),
    },
    {
      chave: "prometivel",
      cabecalho: "Prometível",
      ordenavel: true,
      alinharDireita: true,
      esconderMobile: true,
      celula: (linha) => numero(linha.prometivel),
    },
    {
      chave: "acoes",
      cabecalho: "",
      alinharDireita: true,
      celula: (linha) => {
        const acoes: Acao[] = [
          {
            chave: "ver",
            etiqueta: "Ver ficha de stock",
            icone: Eye,
            onSelect: () =>
              navigate({ to: "/stock/$produtoId", params: { produtoId: linha.produto_id } }),
          },
        ];
        if (eAdm) {
          acoes.push(
            {
              chave: "margem",
              etiqueta: "Margem de segurança",
              icone: Shield,
              onSelect: () => {
                setMargem(linha);
                setValorMargem(String(linha.margem_seguranca));
              },
            },
            {
              chave: "ajuste",
              etiqueta: "Ajuste manual",
              icone: SlidersHorizontal,
              onSelect: () => {
                setAjuste(linha);
                setQuantidade("");
                setMotivo("");
              },
            },
          );
        }
        return <GrupoAcoes acoes={acoes} />;
      },
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Stock"
        descricao="O número do ERP nasce do seu próprio livro de movimentos. Vendável = físico − reservado − margem de segurança."
      />

      <div className="mb-3 max-w-xs">
        <Select value={vista} onValueChange={(v) => setVista(v as Vista)}>
          <SelectTrigger aria-label="Filtrar stock">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISTAS.map((v) => (
              <SelectItem key={v.valor} value={v.valor}>
                {v.etiqueta}
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
        chave={(linha) => linha.produto_id}
        vazio="Ainda não há stock. Aplique o inventário inicial na sincronização."
      />

      <DialogoForm
        aberto={Boolean(ajuste)}
        onFechar={() => setAjuste(null)}
        titulo="Ajuste manual de stock"
        descricao={`${ajuste?.nome_cliente ?? ""} — os ajustes ficam registados com o seu nome e motivo.`}
        aGuardar={mAjustar.isPending}
        onGuardar={() => mAjustar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="ajuste-qtd">Quantidade (use − para retirar)</Label>
          <Input
            id="ajuste-qtd"
            type="number"
            step={1}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Ex.: -2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ajuste-motivo">Motivo</Label>
          <Input
            id="ajuste-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: peça danificada na loja"
          />
        </div>
      </DialogoForm>

      <DialogoForm
        aberto={Boolean(margem)}
        onFechar={() => setMargem(null)}
        titulo="Margem de segurança"
        descricao={`${margem?.nome_cliente ?? ""} — unidades que ficam de fora da venda.`}
        aGuardar={mMargem.isPending}
        onGuardar={() => mMargem.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="margem-valor">Unidades reservadas para segurança</Label>
          <Input
            id="margem-valor"
            type="number"
            min={0}
            step={1}
            value={valorMargem}
            onChange={(e) => setValorMargem(e.target.value)}
          />
        </div>
      </DialogoForm>
    </div>
  );
}
