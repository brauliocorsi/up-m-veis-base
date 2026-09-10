import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  MapPin,
  Package,
  Phone,
  Receipt,
  Truck,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp, mensagemErro } from "@/lib/erp/db";
import {
  agendarAssistencia,
  agendarAssistenciaRota,
  atualizarAssistencia,
  consumirPecaAssistencia,
  lerAssistencia,
  lerPecasAssistencia,
  lerRotas,
} from "@/lib/erp/rotas";
import {
  ESTADOS_ASSISTENCIA,
  ETIQUETA_ASSISTENCIA,
  formatarData,
  formatarDataCurta,
  formatarDinheiro,
  type Assistencia,
  type EstadoAssistencia,
  type LinhaStock,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/assistencias/$assistenciaId")({
  head: () => ({
    meta: [
      { title: "Detalhe da assistência — UP Vendas" },
      {
        name: "description",
        content:
          "Ficha completa da assistência: venda ligada, solução, peças dadas de baixa do stock e agendamento em rota.",
      },
      { property: "og:title", content: "Detalhe da assistência — UP Vendas" },
      {
        property: "og:description",
        content: "Ver a venda ligada, registar a solução, dar baixa de peças e agendar a visita.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const ETIQUETA_ORIGEM: Record<string, string> = {
  entrega: "Aberta na entrega",
  cliente: "Comunicada pelo cliente",
  oficina: "Detetada na oficina",
};

function Pagina() {
  const { assistenciaId } = Route.useParams();
  const perms = usePermissoes();
  const [aAtualizar, setAAtualizar] = useState(false);
  const [aDarBaixa, setADarBaixa] = useState(false);
  const [aAgendar, setAAgendar] = useState(false);

  const assistQ = useQuery({
    queryKey: ["assistencia", assistenciaId],
    queryFn: () => lerAssistencia(assistenciaId),
  });
  const pecasQ = useQuery({
    queryKey: ["assistencia-pecas", assistenciaId],
    queryFn: () => lerPecasAssistencia(assistenciaId),
  });

  const a = assistQ.data;
  const pecas = pecasQ.data ?? [];

  if (assistQ.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!a) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">Assistência não encontrada.</p>
        </CardContent>
      </Card>
    );
  }

  const morada = [a.morada_entrega, a.localidade_entrega].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo={a.numero}
        descricao={`${a.motivo} · ${ETIQUETA_ORIGEM[a.origem] ?? a.origem}`}
        acao={
          <div className="flex flex-wrap gap-2">
            <Badge variant={a.estado === "resolvida" ? "outline" : "secondary"}>
              {ETIQUETA_ASSISTENCIA[a.estado]}
            </Badge>
            {perms.tratarAssistencias && (
              <>
                <Button size="sm" variant="outline" onClick={() => setAAtualizar(true)}>
                  Atualizar solução
                </Button>
                <Button size="sm" variant="outline" onClick={() => setADarBaixa(true)}>
                  <Package className="mr-2 h-4 w-4" /> Baixa de peça
                </Button>
                <Button size="sm" onClick={() => setAAgendar(true)}>
                  <CalendarClock className="mr-2 h-4 w-4" /> Agendar
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Venda ligada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{a.pedido_numero}</span>
              <Button asChild size="sm" variant="outline">
                <Link to="/pedidos/$pedidoId" params={{ pedidoId: a.pedido_id }}>
                  <Receipt className="mr-2 h-4 w-4" /> Abrir venda
                </Link>
              </Button>
            </div>
            <p>{a.cliente ?? "Cliente"}</p>
            {typeof a.pedido_total === "number" && (
              <p className="text-muted-foreground">
                Total da venda: {formatarDinheiro(a.pedido_total)}
              </p>
            )}
            {a.item_descricao && (
              <p className="text-muted-foreground">Artigo: {a.item_descricao}</p>
            )}
            {morada && (
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {morada}
              </p>
            )}
            {a.cliente_telefone && (
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${a.cliente_telefone}`}>
                  <Phone className="mr-2 h-4 w-4" /> {a.cliente_telefone}
                </a>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Problema e solução</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Aberta em {formatarData(a.criado_em)}
              {a.aberta_por_nome ? ` por ${a.aberta_por_nome}` : ""}
            </p>
            {a.peca_afetada && <p>Peça afetada: {a.peca_afetada}</p>}
            <p>{a.descricao}</p>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">Solução</p>
              <p>{a.nota_resolucao ?? "Ainda sem descrição de solução."}</p>
              {a.resolvida_em && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Fechada em {formatarData(a.resolvida_em)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Agendamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {a.agendada_para ? (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <CalendarClock className="h-4 w-4" /> {formatarDataCurta(a.agendada_para)}
                  <Badge variant="secondary">
                    {a.agendamento_tipo === "entrega" ? "Na rota" : "Serviço"}
                  </Badge>
                </p>
                {a.rota_id && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      <Truck className="mr-1 inline h-4 w-4" />
                      {a.rota_nome ?? "Rota"}
                      {a.rota_data ? ` · ${formatarDataCurta(a.rota_data)}` : ""}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/rotas/$rotaId" params={{ rotaId: a.rota_id }}>
                        Ver rota
                      </Link>
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Sem data marcada.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              <Wrench className="mr-2 inline h-4 w-4" />
              Peças usadas ({pecas.reduce((s, p) => s + p.quantidade, 0)})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {pecas.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.produto_nome ?? "Produto"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatarDataCurta(p.criado_em)}
                    {p.motivo ? ` · ${p.motivo}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{p.quantidade} un.</Badge>
              </div>
            ))}
            {pecas.length === 0 && (
              <p className="text-muted-foreground">Nenhuma peça dada de baixa.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {aAtualizar && <DialogoSolucao assistencia={a} onFechar={() => setAAtualizar(false)} />}
      {aDarBaixa && <DialogoPeca assistencia={a} onFechar={() => setADarBaixa(false)} />}
      {aAgendar && <DialogoAgendar assistencia={a} onFechar={() => setAAgendar(false)} />}
    </div>
  );
}

function useAtualizarTudo(id: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["assistencia", id] });
    qc.invalidateQueries({ queryKey: ["assistencia-pecas", id] });
    qc.invalidateQueries({ queryKey: ["assistencias"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["rota-paragens"] });
  };
}

function DialogoSolucao({
  assistencia,
  onFechar,
}: {
  assistencia: Assistencia;
  onFechar: () => void;
}) {
  const atualizar = useAtualizarTudo(assistencia.id);
  const [estado, setEstado] = useState<EstadoAssistencia>(assistencia.estado);
  const [nota, setNota] = useState(assistencia.nota_resolucao ?? "");

  const guardar = useMutation({
    mutationFn: () => atualizarAssistencia(assistencia.id, estado, nota || null),
    onSuccess: () => {
      toast.success("Assistência atualizada.");
      atualizar();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={`Atualizar ${assistencia.numero}`}
      descricao="Estado e descrição da solução."
      aGuardar={guardar.isPending}
      onGuardar={() => guardar.mutate()}
    >
      <div>
        <Label>Estado</Label>
        <Select value={estado} onValueChange={(v) => setEstado(v as EstadoAssistencia)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS_ASSISTENCIA.map((e) => (
              <SelectItem key={e.valor} value={e.valor}>
                {e.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="solucao">Descrição da solução</Label>
        <Textarea
          id="solucao"
          rows={4}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="O que foi feito para resolver."
        />
      </div>
    </DialogoForm>
  );
}

function DialogoPeca({
  assistencia,
  onFechar,
}: {
  assistencia: Assistencia;
  onFechar: () => void;
}) {
  const atualizar = useAtualizarTudo(assistencia.id);
  const [pesquisa, setPesquisa] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");

  const produtosQ = useQuery({
    queryKey: ["stock", "pecas-assistencia", pesquisa],
    queryFn: async () => {
      let consulta = erp().from("v_stock").select("*").limit(30);
      if (pesquisa.trim()) consulta = consulta.ilike("nome_cliente", `%${pesquisa.trim()}%`);
      const { data, error } = await consulta;
      if (error) throw error;
      return (data ?? []) as LinhaStock[];
    },
  });
  const produtos = produtosQ.data ?? [];

  const guardar = useMutation({
    mutationFn: async () => {
      const qt = Number(quantidade);
      if (!produtoId) throw new Error("Escolha a peça.");
      if (!Number.isInteger(qt) || qt <= 0) throw new Error("Indique uma quantidade válida.");
      await consumirPecaAssistencia({
        assistencia_id: assistencia.id,
        produto_id: produtoId,
        quantidade: qt,
        motivo: motivo || null,
      });
    },
    onSuccess: () => {
      toast.success("Peça dada de baixa do stock.");
      atualizar();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Baixa de peça do stock"
      descricao={`A peça sai do stock para a assistência ${assistencia.numero}.`}
      aGuardar={guardar.isPending}
      onGuardar={() => guardar.mutate()}
    >
      <div>
        <Label htmlFor="pesq-peca">Procurar peça</Label>
        <Input
          id="pesq-peca"
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          placeholder="Nome do produto"
        />
      </div>
      <div>
        <Label>Peça</Label>
        <Select value={produtoId} onValueChange={setProdutoId}>
          <SelectTrigger>
            <SelectValue placeholder="Escolher peça" />
          </SelectTrigger>
          <SelectContent>
            {produtos.map((p) => (
              <SelectItem key={p.produto_id} value={p.produto_id}>
                {p.nome_cliente} · {p.fisico} em stock
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="qt-peca">Quantidade</Label>
        <Input
          id="qt-peca"
          type="number"
          min={1}
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="motivo-peca">Motivo</Label>
        <Input
          id="motivo-peca"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Substituição de peça danificada"
        />
      </div>
    </DialogoForm>
  );
}

function DialogoAgendar({
  assistencia,
  onFechar,
}: {
  assistencia: Assistencia;
  onFechar: () => void;
}) {
  const atualizar = useAtualizarTudo(assistencia.id);
  const [tipo, setTipo] = useState<"servico" | "entrega">(
    assistencia.agendamento_tipo ?? "servico",
  );
  const [data, setData] = useState(assistencia.agendada_para ?? "");
  const [rotaId, setRotaId] = useState(assistencia.rota_id ?? "");

  const rotasQ = useQuery({ queryKey: ["rotas", "agendar-assistencia"], queryFn: () => lerRotas() });
  const rotas = (rotasQ.data ?? []).filter(
    (r) => r.estado === "planeada" || r.estado === "em_curso",
  );

  const guardar = useMutation({
    mutationFn: async () => {
      if (tipo === "entrega") {
        if (!rotaId) throw new Error("Escolha a rota.");
        await agendarAssistenciaRota(assistencia.id, rotaId);
        return;
      }
      if (!data) throw new Error("Indique a data do serviço.");
      await agendarAssistencia(assistencia.id, data, "servico");
    },
    onSuccess: () => {
      toast.success("Assistência agendada.");
      atualizar();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={`Agendar ${assistencia.numero}`}
      descricao="Serviço com data marcada ou visita numa rota de entrega."
      aGuardar={guardar.isPending}
      onGuardar={() => guardar.mutate()}
    >
      <div>
        <Label>Tipo</Label>
        <Select value={tipo} onValueChange={(v) => setTipo(v as "servico" | "entrega")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="servico">Serviço com data marcada</SelectItem>
            <SelectItem value="entrega">Na rota de entrega</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {tipo === "servico" ? (
        <div>
          <Label htmlFor="data-assist">Data</Label>
          <Input
            id="data-assist"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
      ) : (
        <div>
          <Label>Rota</Label>
          <Select value={rotaId} onValueChange={setRotaId}>
            <SelectTrigger>
              <SelectValue placeholder="Escolher rota" />
            </SelectTrigger>
            <SelectContent>
              {rotas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {formatarDataCurta(r.data)} · {r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            A paragem aparece na rota com o número {assistencia.numero}.
          </p>
        </div>
      )}
    </DialogoForm>
  );
}
