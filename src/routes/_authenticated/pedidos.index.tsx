import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { FiltrosVendasPainel } from "@/components/erp/filtros-vendas";
import { Lista, type Coluna } from "@/components/erp/lista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { erp, mensagemErro } from "@/lib/erp/db";
import {
  CAMPOS_PESQUISA_PEDIDO,
  exportarPedidosCsv,
  filtrosParaPedidos,
  idsPedidosComProduto,
  lerFiltros,
  type FiltrosVendas,
} from "@/lib/erp/filtros";
import { listar } from "@/lib/erp/listar";
import { normalizarTelefone } from "@/lib/erp/nif";

import {
  ETIQUETA_FISCAL,
  ETIQUETA_PEDIDO,
  formatarDataCurta,
  formatarDinheiro,
  type Cliente,
  type EstadoFiscal,
  type EstadoPedido,
  type Pedido,
} from "@/lib/erp/tipos";
import { criarOrcamento } from "@/lib/erp/vendas";

export const Route = createFileRoute("/_authenticated/pedidos/")({
  validateSearch: (busca: Record<string, unknown>): FiltrosVendas => lerFiltros(busca),
  head: () => ({
    meta: [
      { title: "Vendas — UP Vendas" },
      {
        name: "description",
        content:
          "Orçamentos e pedidos da UP Móveis: criar uma venda nova, filtrar por estado, entrega e faturação, e ver total, recebido e pendente.",
      },
      { property: "og:title", content: "Vendas — UP Vendas" },
      {
        property: "og:description",
        content: "Total, recebido e pendente de cada venda, com filtros partilháveis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pedidos,
});

const COR_ESTADO: Record<EstadoPedido, string> = {
  orcamento: "bg-muted text-foreground",
  confirmado: "bg-primary/10 text-primary",
  em_preparacao: "bg-amber-100 text-amber-900",
  pronto: "bg-emerald-100 text-emerald-900",
  agendado: "bg-sky-100 text-sky-900",

  entregue: "bg-emerald-600/10 text-emerald-800",
  cancelado: "bg-destructive/10 text-destructive",
};

const COR_FISCAL: Record<EstadoFiscal, string> = {
  sem_documento: "bg-muted text-muted-foreground",
  guia_emitida: "bg-amber-100 text-amber-900",
  faturado: "bg-emerald-100 text-emerald-900",
  nota_credito: "bg-destructive/10 text-destructive",
};

function Pedidos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lista = useListagem("criado_em", false, 20);
  const filtros = Route.useSearch();
  const [novaVenda, setNovaVenda] = useState(false);
  const [aExportar, setAExportar] = useState(false);

  const aplicar = (novos: FiltrosVendas) => {
    lista.onPagina(1);
    navigate({ to: "/pedidos", search: novos });
  };

  const { data: idsProduto } = useQuery({
    queryKey: ["pedidos-produto", filtros.produto],
    enabled: Boolean(filtros.produto),
    queryFn: () => idsPedidosComProduto(filtros.produto ?? ""),
  });

  const condicoes = filtrosParaPedidos(filtros, filtros.produto ? (idsProduto ?? []) : null);
  const prontoParaListar = !filtros.produto || idsProduto !== undefined;
  const pesquisa = filtros.cliente ?? lista.pesquisa;

  const { data, isLoading } = useQuery({
    queryKey: ["pedidos", pesquisa, lista.pagina, lista.ordenarPor, lista.ascendente, condicoes],
    enabled: prontoParaListar,
    queryFn: () =>
      listar<Pedido>({
        tabela: "v_pedidos",
        camposPesquisa: CAMPOS_PESQUISA_PEDIDO,
        pesquisa,
        ordenarPor: lista.ordenarPor,
        ascendente: lista.ascendente,
        pagina: lista.pagina,
        tamanho: lista.tamanho,
        temEliminacao: false,
        filtros: condicoes,
      }),
  });

  // Resumo do período: os mesmos números que a lista, somados.
  const { data: resumo } = useQuery({
    queryKey: ["pedidos-resumo", pesquisa, condicoes],
    enabled: prontoParaListar,
    queryFn: async () => {
      const { linhas } = await listar<Pedido>({
        tabela: "v_pedidos",
        camposPesquisa: CAMPOS_PESQUISA_PEDIDO,
        pesquisa,
        ordenarPor: "criado_em",
        ascendente: false,
        pagina: 1,
        tamanho: 2000,
        temEliminacao: false,
        filtros: condicoes,
      });
      const hoje = new Date().toISOString().slice(0, 10);
      let vendido = 0;
      let recebido = 0;
      let porConfirmar = 0;
      let naEntrega = 0;
      let vencido = 0;
      for (const p of linhas) {
        if (p.estado === "cancelado") continue;
        vendido += Number(p.total);
        recebido += Number(p.total_pago);
        porConfirmar += Number(p.pendente_confirmacao ?? 0);
        naEntrega += Number(p.a_receber_entrega ?? 0);
        const falta = Number(p.total) - Number(p.total_pago);
        if (falta > 0 && p.data_entrega_efetiva && p.data_entrega_efetiva < hoje) vencido += falta;
      }
      return { vendido, recebido, porConfirmar, naEntrega, vencido };
    },
  });

  const colunas: Array<Coluna<Pedido>> = [
    {
      chave: "numero",
      cabecalho: "Número",
      ordenavel: true,
      celula: (p) => (
        <Link
          to="/pedidos/$pedidoId"
          params={{ pedidoId: p.id }}
          className="block leading-tight hover:underline"
        >
          <span className="font-medium">{p.numero}</span>
          <span className="block text-xs text-muted-foreground md:hidden">{p.cliente_nome}</span>
        </Link>
      ),
    },
    {
      chave: "cliente_nome",
      cabecalho: "Cliente",
      esconderMobile: true,
      celula: (p) => (
        <div className="leading-tight">
          <p>{p.cliente_nome}</p>
          <p className="text-xs text-muted-foreground">{p.cliente_telefone ?? "—"}</p>
        </div>
      ),
    },
    {
      chave: "estado",
      cabecalho: "Estado",
      celula: (p) => (
        <div className="space-y-1">
          <Badge variant="secondary" className={COR_ESTADO[p.estado]}>
            {ETIQUETA_PEDIDO[p.estado]}
          </Badge>
          <Badge
            variant="secondary"
            className={`block w-fit ${COR_FISCAL[(p.estado_fiscal ?? "sem_documento") as EstadoFiscal]}`}
          >
            {ETIQUETA_FISCAL[(p.estado_fiscal ?? "sem_documento") as EstadoFiscal]}
          </Badge>
        </div>
      ),
    },
    {
      chave: "data_entrega_prevista",
      cabecalho: "Entrega",
      ordenavel: true,
      esconderMobile: true,
      celula: (p) => (
        <div className="leading-tight">
          <p>{formatarDataCurta(p.data_entrega_prometida ?? p.data_entrega_prevista)}</p>
          {p.data_entrega_efetiva && (
            <p className="text-xs text-emerald-700">
              Entregue {formatarDataCurta(p.data_entrega_efetiva)}
            </p>
          )}
          {!p.data_entrega_efetiva && Number(p.unidades_por_entregar ?? 0) > 0 && p.estado !== "orcamento" && (
            <p className="text-xs text-muted-foreground">
              {p.unidades_por_entregar} por entregar
            </p>
          )}
        </div>
      ),
    },
    {
      chave: "vendedor_nome",
      cabecalho: "Vendedora",
      esconderMobile: true,
      celula: (p) => p.vendedor_nome ?? "—",
    },
    {
      chave: "total",
      cabecalho: "Total",
      ordenavel: true,
      alinharDireita: true,
      celula: (p) => <span className="font-medium">{formatarDinheiro(p.total)}</span>,
    },
    {
      chave: "total_pago",
      cabecalho: "Recebido",
      ordenavel: true,
      alinharDireita: true,
      celula: (p) => formatarDinheiro(p.total_pago),
    },
    {
      chave: "pendente",
      cabecalho: "Pendente",
      alinharDireita: true,
      celula: (p) => {
        const pendente = Number(p.total) - Number(p.total_pago);
        return (
          <div className="leading-tight">
            <span className={pendente > 0 ? "font-medium text-destructive" : "font-medium"}>
              {formatarDinheiro(pendente)}
            </span>
            {Number(p.pendente_confirmacao ?? 0) > 0 && (
              <span className="block text-xs text-muted-foreground">
                {formatarDinheiro(p.pendente_confirmacao)} por confirmar
              </span>
            )}
            {Number(p.a_receber_entrega ?? 0) > 0 && (
              <span className="block text-xs text-muted-foreground">
                {formatarDinheiro(p.a_receber_entrega)} na entrega
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Vendas"
        descricao="Orçamentos e pedidos. Toque numa linha para abrir."
        acao={
          <Button onClick={() => setNovaVenda(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova venda
          </Button>
        }
      />

      <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { etiqueta: "Vendido", valor: resumo?.vendido },
          { etiqueta: "Recebido", valor: resumo?.recebido },
          { etiqueta: "Por confirmar", valor: resumo?.porConfirmar },
          { etiqueta: "A receber na entrega", valor: resumo?.naEntrega },
          { etiqueta: "Vencido", valor: resumo?.vencido },
        ].map((c) => (
          <div key={c.etiqueta} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{c.etiqueta}</p>
            <p className="text-lg font-semibold">{formatarDinheiro(c.valor ?? 0)}</p>
          </div>
        ))}
      </div>

      <FiltrosVendasPainel
        filtros={filtros}
        campos={[
          "periodo",
          "entrega_prevista",
          "entrega_efetiva",
          "vendedor",
          "estado",
          "fiscal",
          "pagamento",
          "produto",
          "cp4",
          "origem",
        ]}
        resultados={data?.total ?? 0}
        onMudar={aplicar}
        aExportar={aExportar}
        onExportar={async () => {
          setAExportar(true);
          try {
            await exportarPedidosCsv({
              filtros: condicoes,
              pesquisa,
              ordenarPor: lista.ordenarPor,
              ascendente: lista.ascendente,
            });
          } catch (erro) {
            toast.error(mensagemErro(erro));
          } finally {
            setAExportar(false);
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
        vazio="Nenhuma venda com estes filtros."
        onPesquisa={lista.onPesquisa}
        onPagina={lista.onPagina}
        onOrdenar={lista.onOrdenar}
        chave={(p) => p.id}
      />

      <DialogoNovaVenda
        aberto={novaVenda}
        onFechar={() => setNovaVenda(false)}
        onCriado={(id) => {
          queryClient.invalidateQueries({ queryKey: ["pedidos"] });
          navigate({ to: "/pedidos/$pedidoId", params: { pedidoId: id } });
        }}
      />
    </>
  );
}

function DialogoNovaVenda({
  aberto,
  onFechar,
  onCriado,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriado: (id: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [novo, setNovo] = useState(false);
  const [origem, setOrigem] = useState("loja");
  const [form, setForm] = useState({ nome: "", telefone_e164: "", email: "", morada: "", cp: "" });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-venda", termo],
    enabled: aberto && termo.trim().length >= 2,
    queryFn: () =>
      listar<Cliente>({
        tabela: "v_clientes",
        camposPesquisa: ["nome", "telefone_e164", "nif", "email"],
        pesquisa: termo,
        ordenarPor: "nome",
        ascendente: true,
        tamanho: 8,
      }),
  });

  const criar = useMutation({
    mutationFn: async (cliente: Cliente) =>
      criarOrcamento({
        cliente_id: cliente.id,
        origem,
        morada_entrega: cliente.morada,
        cp4_entrega: cliente.cp4,
        cp3_entrega: cliente.cp3,
        localidade_entrega: cliente.localidade,
        contacto_entrega: cliente.telefone_e164,
      }),
    onSuccess: (id) => {
      onFechar();
      onCriado(id);
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const criarCliente = useMutation({
    mutationFn: async () => {
      if (form.nome.trim().length < 3) throw new Error("Escreva o nome do cliente.");
      const telefone = normalizarTelefone(form.telefone_e164);
      if (!telefone) throw new Error("Escreva o telefone do cliente.");
      const digitos = form.cp.replace(/\D/g, "");
      if (digitos && digitos.length !== 4 && digitos.length !== 7) {
        throw new Error("O código postal tem de ter 4 ou 7 números (ex.: 4620-269).");
      }
      const { data, error } = await erp()
        .from("clientes")
        .insert({
          tipo: "particular",
          nome: form.nome.trim(),
          telefone_e164: telefone,
          email: form.email.trim() || null,
          morada: form.morada.trim() || null,
          cp4: digitos ? digitos.slice(0, 4) : null,
          cp3: digitos.length === 7 ? digitos.slice(4, 7) : null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Cliente;
    },
    onSuccess: (cliente) => criar.mutate(cliente),
    onError: (erro) => toast.error(mensagemErro(erro, (erro as Error).message)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova venda</DialogTitle>
          <DialogDescription>Escolha o cliente para começar o orçamento.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="origem-venda">Como chegou o pedido</Label>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger id="origem-venda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loja">Na loja</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!novo ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder="Nome, telefone ou NIF…"
                  className="pl-9"
                  aria-label="Procurar cliente"
                />
              </div>
              <div className="space-y-1">
                {(clientes?.linhas ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={criar.isPending}
                    onClick={() => criar.mutate(c)}
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{c.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.telefone_e164 ?? "sem telefone"} · {c.localidade ?? "—"}
                      </span>
                    </span>
                  </button>
                ))}
                {termo.trim().length >= 2 && (clientes?.linhas ?? []).length === 0 && (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    Nenhum cliente encontrado.
                  </p>
                )}
              </div>
              <Button variant="outline" className="w-full" onClick={() => setNovo(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Cliente novo
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="nc-nome">Nome</Label>
                <Input
                  id="nc-nome"
                  autoFocus
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nc-tel">Telefone</Label>
                <Input
                  id="nc-tel"
                  value={form.telefone_e164}
                  onChange={(e) => setForm({ ...form, telefone_e164: e.target.value })}
                  placeholder="912 345 678"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nc-email">Email (opcional)</Label>
                <Input
                  id="nc-email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nc-morada">Morada</Label>
                <Input
                  id="nc-morada"
                  value={form.morada}
                  onChange={(e) => setForm({ ...form, morada: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nc-cp">Código postal</Label>
                <Input
                  id="nc-cp"
                  value={form.cp}
                  onChange={(e) => setForm({ ...form, cp: e.target.value })}
                  placeholder="4620-269"
                  inputMode="numeric"
                />
              </div>

              <Button variant="ghost" size="sm" onClick={() => setNovo(false)}>
                Voltar à procura
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          {novo && (
            <Button onClick={() => criarCliente.mutate()} disabled={criarCliente.isPending}>
              Criar cliente e começar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
