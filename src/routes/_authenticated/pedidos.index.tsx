import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
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
import { listar } from "@/lib/erp/listar";
import {
  ESTADOS_PEDIDO,
  ETIQUETA_PEDIDO,
  formatarDataCurta,
  formatarDinheiro,
  type Cliente,
  type EstadoPedido,
  type Pedido,
} from "@/lib/erp/tipos";
import { criarOrcamento } from "@/lib/erp/vendas";

export const Route = createFileRoute("/_authenticated/pedidos/")({
  head: () => ({
    meta: [
      { title: "Vendas — UP Vendas" },
      {
        name: "description",
        content:
          "Orçamentos e pedidos da UP Móveis: criar uma venda nova, acompanhar estados e datas de entrega.",
      },
      { property: "og:title", content: "Vendas — UP Vendas" },
      {
        property: "og:description",
        content: "Orçamentos e pedidos da UP Móveis num só sítio.",
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
  entregue: "bg-emerald-600/10 text-emerald-800",
  cancelado: "bg-destructive/10 text-destructive",
};

function Pedidos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lista = useListagem("criado_em", false, 20);
  const [estado, setEstado] = useState<string>("todos");
  const [novaVenda, setNovaVenda] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [
      "pedidos",
      lista.pesquisa,
      lista.pagina,
      lista.ordenarPor,
      lista.ascendente,
      estado,
    ],
    queryFn: () =>
      listar<Pedido>({
        tabela: "v_pedidos",
        camposPesquisa: ["numero", "cliente_nome", "cliente_telefone"],
        pesquisa: lista.pesquisa,
        ordenarPor: lista.ordenarPor,
        ascendente: lista.ascendente,
        pagina: lista.pagina,
        tamanho: lista.tamanho,
        temEliminacao: false,
        filtros: estado === "todos" ? [] : [{ campo: "estado", valor: estado }],
      }),
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
        <Badge variant="secondary" className={COR_ESTADO[p.estado]}>
          {ETIQUETA_PEDIDO[p.estado]}
        </Badge>
      ),
    },
    {
      chave: "data_entrega_prevista",
      cabecalho: "Entrega",
      ordenavel: true,
      esconderMobile: true,
      celula: (p) => formatarDataCurta(p.data_entrega_prometida ?? p.data_entrega_prevista),
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

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant={estado === "todos" ? "default" : "outline"}
          size="sm"
          onClick={() => setEstado("todos")}
        >
          Todos
        </Button>
        {ESTADOS_PEDIDO.map((e) => (
          <Button
            key={e.valor}
            variant={estado === e.valor ? "default" : "outline"}
            size="sm"
            onClick={() => setEstado(e.valor)}
          >
            {e.etiqueta}
          </Button>
        ))}
      </div>

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
        vazio="Ainda não há vendas."
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
  const [form, setForm] = useState({ nome: "", telefone_e164: "", email: "", morada: "", cp4: "", cp3: "" });

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
      if (form.telefone_e164.trim().length < 9) throw new Error("Escreva o telefone do cliente.");
      const { data, error } = await erp()
        .from("clientes")
        .insert({
          tipo: "particular",
          nome: form.nome.trim(),
          telefone_e164: form.telefone_e164.trim(),
          email: form.email.trim() || null,
          morada: form.morada.trim() || null,
          cp4: form.cp4.trim() || null,
          cp3: form.cp3.trim() || null,
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="nc-cp4">Código postal</Label>
                  <Input
                    id="nc-cp4"
                    value={form.cp4}
                    onChange={(e) => setForm({ ...form, cp4: e.target.value })}
                    placeholder="4590"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nc-cp3">Extensão</Label>
                  <Input
                    id="nc-cp3"
                    value={form.cp3}
                    onChange={(e) => setForm({ ...form, cp3: e.target.value })}
                    placeholder="000"
                  />
                </div>
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
