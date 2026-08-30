import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPinned, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp, mensagemErro } from "@/lib/erp/db";
import { abrirRota, lerRotas } from "@/lib/erp/rotas";
import {
  ETIQUETA_ROTA,
  formatarDinheiro,
  type Utilizador,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/rotas/")({
  head: () => ({
    meta: [
      { title: "Rotas de entrega — UP Vendas" },
      {
        name: "description",
        content:
          "Montar e acompanhar as rotas de entrega da UP Móveis: paragens previstas, dinheiro recebido e fecho de contas.",
      },
      { property: "og:title", content: "Rotas de entrega — UP Vendas" },
      {
        property: "og:description",
        content: "Montar rotas, atribuir entregadores e conferir o dinheiro do dia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const hoje = () => new Date().toISOString().slice(0, 10);

interface PedidoEntregavel {
  id: string;
  numero: string;
  cliente_nome: string | null;
  localidade_entrega: string | null;
  data_entrega_prevista: string | null;
  falta_pagar: number;
  total: number;
}

function Pagina() {
  const perms = usePermissoes();
  const [novaAberta, setNovaAberta] = useState(false);
  const rotasQ = useQuery({ queryKey: ["rotas"], queryFn: () => lerRotas() });

  return (
    <div>
      <CabecalhoPagina
        titulo="Rotas de entrega"
        descricao="Cada dia de rota tem um previsto e um realizado, e no fecho os dois têm de bater."
        acao={
          perms.montarRotas ? (
            <Button onClick={() => setNovaAberta(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova rota
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        {(rotasQ.data ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {r.data} · {r.responsavel ?? "—"} · {r.viatura ?? "sem viatura"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="outline">{ETIQUETA_ROTA[r.estado]}</Badge>
                <span className="tabular-nums text-muted-foreground">
                  {r.paragens_fechadas ?? 0}/{r.paragens ?? 0} paragens
                </span>
                <span className="tabular-nums">
                  {formatarDinheiro(r.realizado_recebido ?? 0)} /{" "}
                  {formatarDinheiro(r.previsto_receber)}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link to="/rotas/$rotaId" params={{ rotaId: r.id }}>
                    Abrir
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!rotasQ.isLoading && (rotasQ.data ?? []).length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <MapPinned className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Ainda não há rotas</p>
              <p className="text-sm text-muted-foreground">
                Monte a primeira rota com as vendas prontas a entregar.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {novaAberta && <DialogoNovaRota onFechar={() => setNovaAberta(false)} />}
    </div>
  );
}

function DialogoNovaRota({ onFechar }: { onFechar: () => void }) {
  const clientQuery = useQueryClient();
  const [data, setData] = useState(hoje());
  const [nome, setNome] = useState("");
  const [viatura, setViatura] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  const entregadoresQ = useQuery({
    queryKey: ["entregadores"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("utilizadores")
        .select("*")
        .eq("perfil", "entregador")
        .eq("ativo", true)
        .is("eliminado_em", null)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Utilizador[];
    },
  });

  const pedidosQ = useQuery({
    queryKey: ["pedidos-entregaveis", data],
    queryFn: async () => {
      const { data: linhas, error } = await erp()
        .from("v_pedidos")
        .select(
          "id, numero, cliente_nome, localidade_entrega, data_entrega_prevista, falta_pagar, total",
        )
        .in("estado", ["confirmado", "em_preparacao", "pronto"])
        .is("eliminado_em", null)
        .lte("data_entrega_prevista", data)
        .order("data_entrega_prevista", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (linhas ?? []) as PedidoEntregavel[];
    },
  });

  const guardar = useMutation({
    mutationFn: () =>
      abrirRota({
        nome: nome || `Rota ${data}`,
        responsavel_id: responsavel,
        pedidos: escolhidos,
        data,
        viatura: viatura || null,
      }),
    onSuccess: () => {
      toast.success("Rota criada.");
      clientQuery.invalidateQueries({ queryKey: ["rotas"] });
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const pedidos = pedidosQ.data ?? [];
  const previsto = pedidos
    .filter((p) => escolhidos.includes(p.id))
    .reduce((t, p) => t + Number(p.falta_pagar ?? 0), 0);

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Nova rota"
      descricao="Escolha o entregador e as vendas que vão na carrinha."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!responsavel) return toast.error("Escolha o entregador.");
        if (escolhidos.length === 0) return toast.error("Escolha pelo menos uma venda.");
        guardar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rota-data">Data</Label>
          <Input
            id="rota-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rota-nome">Nome</Label>
          <Input
            id="rota-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Rota Norte"
          />
        </div>
        <div>
          <Label>Entregador</Label>
          <Select value={responsavel} onValueChange={setResponsavel}>
            <SelectTrigger>
              <SelectValue placeholder="Escolher" />
            </SelectTrigger>
            <SelectContent>
              {(entregadoresQ.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="rota-viatura">Viatura</Label>
          <Input
            id="rota-viatura"
            value={viatura}
            onChange={(e) => setViatura(e.target.value)}
            placeholder="Matrícula"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Vendas a entregar ({escolhidos.length} · previsto {formatarDinheiro(previsto)})
        </p>
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
          {pedidos.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted"
            >
              <Checkbox
                checked={escolhidos.includes(p.id)}
                onCheckedChange={(v) =>
                  setEscolhidos((ids) =>
                    v ? [...ids, p.id] : ids.filter((x) => x !== p.id),
                  )
                }
              />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-medium">
                  {p.numero} · {p.cliente_nome ?? "Cliente"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {p.localidade_entrega ?? "sem morada"} · prevista{" "}
                  {p.data_entrega_prevista ?? "—"} · a receber{" "}
                  {formatarDinheiro(p.falta_pagar ?? 0)}
                </span>
              </span>
            </label>
          ))}
          {pedidos.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              Nenhuma venda pronta a entregar até esta data.
            </p>
          )}
        </div>
      </div>
    </DialogoForm>
  );
}
