import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft, ChevronRight, MapPinned, Plus, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp, mensagemErro } from "@/lib/erp/db";
import { criarRota, lerRotas, lerViaturas } from "@/lib/erp/rotas";
import {
  ETIQUETA_ROTA,
  formatarDinheiro,
  type EstadoRota,
  type Rota,
  type Utilizador,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/rotas/")({
  head: () => ({
    meta: [
      { title: "Planeamento de rotas — UP Vendas" },
      {
        name: "description",
        content:
          "Planear as rotas de entrega da UP Móveis: calendário, capacidade por viatura, paragens previstas e fecho de contas.",
      },
      { property: "og:title", content: "Planeamento de rotas — UP Vendas" },
      {
        property: "og:description",
        content: "Calendário das rotas, capacidade de cada viatura e vendas encaixadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const hoje = () => new Date().toISOString().slice(0, 10);

const ESTADOS: EstadoRota[] = [
  "planeada",
  "em_curso",
  "concluida",
  "fechada",
  "conferida",
  "cancelada",
];

function useEntregadores() {
  return useQuery({
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
}

function Pagina() {
  const perms = usePermissoes();
  const [novaAberta, setNovaAberta] = useState(false);
  const [dataInicial, setDataInicial] = useState(hoje());
  const [entregadorInicial, setEntregadorInicial] = useState("");
  const [estado, setEstado] = useState<EstadoRota | "todos">("todos");

  const rotasQ = useQuery({ queryKey: ["rotas"], queryFn: () => lerRotas() });
  const entregadoresQ = useEntregadores();
  const dia = hoje();
  const rotas = rotasQ.data ?? [];
  const rotasDeHoje = rotas.filter((r) => r.data === dia);
  const lista = estado === "todos" ? rotas : rotas.filter((r) => r.estado === estado);

  return (
    <div>
      <CabecalhoPagina
        titulo="Rotas de entrega"
        descricao="A rota existe antes das vendas: define-se a capacidade e as vendas vão sendo encaixadas."
        acao={
          perms.montarRotas ? (
            <Button
              onClick={() => {
                setEntregadorInicial("");
                setDataInicial(hoje());
                setNovaAberta(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nova rota
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Truck className="h-4 w-4 text-primary" /> Entregadores hoje
          </p>
          {entregadoresQ.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (entregadoresQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há entregadores ativos. Crie os utilizadores com o perfil Entregador.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {(entregadoresQ.data ?? []).map((u) => {
                const rota = rotasDeHoje.find((r) => r.responsavel_id === u.id);
                return (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">{u.nome}</span>
                    {rota ? (
                      <>
                        <Badge variant="outline">{ETIQUETA_ROTA[rota.estado]}</Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {rota.paragens_fechadas ?? 0}/{rota.paragens ?? 0} paragens ·{" "}
                          {formatarDinheiro(rota.realizado_recebido ?? 0)} /{" "}
                          {formatarDinheiro(rota.previsto_receber)}
                        </span>
                        <Button asChild size="sm" variant="outline" className="ml-auto">
                          <Link to="/rotas/$rotaId" params={{ rotaId: rota.id }}>
                            Abrir
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">Sem rota hoje</span>
                        {perms.montarRotas ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto"
                            onClick={() => {
                              setEntregadorInicial(u.id);
                              setDataInicial(hoje());
                              setNovaAberta(true);
                            }}
                          >
                            <Plus className="mr-1 h-4 w-4" /> Abrir rota
                          </Button>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Cada entregador só vê a rota que lhe foi atribuída, em “A minha rota”.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="calendario">
        <TabsList className="mb-4">
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="calendario">
          <Calendario
            rotas={rotas}
            podeCriar={perms.montarRotas}
            onCriar={(data) => {
              setEntregadorInicial("");
              setDataInicial(data);
              setNovaAberta(true);
            }}
          />
        </TabsContent>

        <TabsContent value="lista">
          <div className="mb-3 max-w-xs">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoRota | "todos")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {ESTADOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {ETIQUETA_ROTA[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {lista.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.data} · {r.responsavel ?? "sem entregador"} ·{" "}
                      {r.viatura_nome ?? r.viatura ?? "sem viatura"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.ocup_entregas ?? 0}
                      {r.max_entregas ? `/${r.max_entregas}` : ""} entregas ·{" "}
                      {r.ocup_montagem_min ?? 0}
                      {r.max_minutos_montagem ? `/${r.max_minutos_montagem}` : ""} min ·{" "}
                      {Number(r.ocup_cubicagem_m3 ?? 0).toFixed(2)}
                      {r.viatura_cubicagem_m3
                        ? `/${Number(r.viatura_cubicagem_m3).toFixed(2)}`
                        : ""}{" "}
                      m³
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
            {!rotasQ.isLoading && lista.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <MapPinned className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">Sem rotas neste estado</p>
                  <p className="text-sm text-muted-foreground">
                    Crie a rota primeiro e depois encaixe as vendas.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {novaAberta && (
        <DialogoNovaRota
          entregadorInicial={entregadorInicial}
          dataInicial={dataInicial}
          onFechar={() => setNovaAberta(false)}
        />
      )}
    </div>
  );
}

const NOMES_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function Calendario({
  rotas,
  podeCriar,
  onCriar,
}: {
  rotas: Rota[];
  podeCriar: boolean;
  onCriar: (data: string) => void;
}) {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());

  const dias = useMemo(() => {
    const primeiro = new Date(Date.UTC(ano, mes, 1));
    const inicioSemana = (primeiro.getUTCDay() + 6) % 7; // segunda = 0
    const total = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const celulas: Array<string | null> = Array.from({ length: inicioSemana }, () => null);
    for (let d = 1; d <= total; d += 1) {
      celulas.push(
        `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      );
    }
    return celulas;
  }, [ano, mes]);

  function mudarMes(delta: number) {
    const novo = new Date(Date.UTC(ano, mes + delta, 1));
    setAno(novo.getUTCFullYear());
    setMes(novo.getUTCMonth());
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => mudarMes(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium">
            {NOMES_MES[mes]} de {ano}
          </p>
          <Button variant="outline" size="icon" onClick={() => mudarMes(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {dias.map((data, i) => {
            if (!data) return <span key={`v-${i}`} />;
            const doDia = rotas.filter((r) => r.data === data && r.estado !== "cancelada");
            return (
              <div
                key={data}
                className="min-h-20 rounded-md border p-1 text-left align-top text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{Number(data.slice(8, 10))}</span>
                  {podeCriar && (
                    <button
                      type="button"
                      aria-label={`Criar rota em ${data}`}
                      className="text-muted-foreground hover:text-primary"
                      onClick={() => onCriar(data)}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {doDia.map((r) => {
                  const excede =
                    (r.max_entregas != null && (r.ocup_entregas ?? 0) > r.max_entregas) ||
                    (r.max_minutos_montagem != null &&
                      (r.ocup_montagem_min ?? 0) > r.max_minutos_montagem) ||
                    (r.viatura_cubicagem_m3 != null &&
                      Number(r.ocup_cubicagem_m3 ?? 0) > Number(r.viatura_cubicagem_m3));
                  return (
                    <Link
                      key={r.id}
                      to="/rotas/$rotaId"
                      params={{ rotaId: r.id }}
                      className="mt-1 block truncate rounded bg-muted px-1 py-0.5 hover:bg-accent"
                    >
                      <span className="flex items-center gap-1">
                        {excede && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        <span className="truncate">{r.nome}</span>
                      </span>
                      <span className="block text-muted-foreground">
                        {r.ocup_entregas ?? 0}
                        {r.max_entregas ? `/${r.max_entregas}` : ""} entregas
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DialogoNovaRota({
  entregadorInicial,
  dataInicial,
  onFechar,
}: {
  entregadorInicial?: string;
  dataInicial: string;
  onFechar: () => void;
}) {
  const clientQuery = useQueryClient();
  const [data, setData] = useState(dataInicial);
  const [nome, setNome] = useState("");
  const [viaturaId, setViaturaId] = useState("");
  const [responsavel, setResponsavel] = useState(entregadorInicial ?? "");
  const [maxEntregas, setMaxEntregas] = useState("");
  const [maxMinutos, setMaxMinutos] = useState("");

  const entregadoresQ = useEntregadores();
  const viaturasQ = useQuery({ queryKey: ["viaturas"], queryFn: () => lerViaturas() });

  const guardar = useMutation({
    mutationFn: () =>
      criarRota({
        nome: nome || `Rota ${data}`,
        data,
        responsavel_id: responsavel || null,
        viatura_id: viaturaId || null,
        max_entregas: maxEntregas ? Number(maxEntregas) : null,
        max_minutos_montagem: maxMinutos ? Number(maxMinutos) : null,
      }),
    onSuccess: () => {
      toast.success("Rota criada em planeamento. Agora encaixe as vendas.");
      clientQuery.invalidateQueries({ queryKey: ["rotas"] });
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Nova rota"
      descricao="A rota nasce vazia e em planeamento. A viatura e o entregador podem ficar para depois."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!data) {
          toast.error("Indique a data da rota.");
          return;
        }
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
              <SelectValue placeholder="A definir depois" />
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
          <Label>Viatura</Label>
          <Select value={viaturaId} onValueChange={setViaturaId}>
            <SelectTrigger>
              <SelectValue placeholder="A definir depois" />
            </SelectTrigger>
            <SelectContent>
              {(viaturasQ.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nome} · {Number(v.cubicagem_m3).toFixed(2)} m³
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="rota-max-e">Máximo de entregas</Label>
          <Input
            id="rota-max-e"
            type="number"
            min={1}
            value={maxEntregas}
            onChange={(e) => setMaxEntregas(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rota-max-m">Máximo de minutos de montagem</Label>
          <Input
            id="rota-max-m"
            type="number"
            min={1}
            value={maxMinutos}
            onChange={(e) => setMaxMinutos(e.target.value)}
          />
        </div>
      </div>
    </DialogoForm>
  );
}
