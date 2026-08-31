import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  LifeBuoy,
  Lock,
  MapPin,
  Package,
  Phone,
  Route as RouteIcon,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useSessao } from "@/hooks/use-sessao";
import { mensagemErro } from "@/lib/erp/db";
import { lerLinhasEntrega } from "@/lib/erp/entregas";
import { lerFormasAtivas } from "@/lib/erp/pagamentos";
import {
  abrirAssistencia,
  aplicarDescontoEntrega,
  fecharRota,
  lerContasDaRota,
  lerMotivosDe,
  lerMovimentosDaRota,
  lerParagem,
  lerParagens,
  lerRotaDeHoje,
  registarDesfecho,
  registarRecebimentoEntrega,
  registarSaidaRota,
  retirarItemEntrega,
  type LinhaRecebimento,
} from "@/lib/erp/rotas";
import {
  ETIQUETA_DESFECHO,
  ETIQUETA_ROTA,
  formatarDinheiro,
  type Desfecho,
  type RotaParagem,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/rota")({
  head: () => ({
    meta: [
      { title: "A minha rota — UP Vendas" },
      {
        name: "description",
        content:
          "Rota do dia do entregador da UP Móveis: paragens, entregas, recebimentos, despesas e fecho do envelope.",
      },
      { property: "og:title", content: "A minha rota — UP Vendas" },
      {
        property: "og:description",
        content: "Rota do dia: paragens, entregas, recebimentos e fecho de contas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const hoje = () => new Date().toISOString().slice(0, 10);

function Pagina() {
  const { data: sessao } = useSessao();
  const utilizadorId = sessao?.utilizador?.id ?? "";
  const clientQuery = useQueryClient();

  const rotaQ = useQuery({
    queryKey: ["rota-hoje", utilizadorId],
    queryFn: () => lerRotaDeHoje(utilizadorId),
    enabled: Boolean(utilizadorId),
  });
  const rota = rotaQ.data ?? null;

  const paragensQ = useQuery({
    queryKey: ["rota-paragens", rota?.id],
    queryFn: () => lerParagens(rota!.id),
    enabled: Boolean(rota?.id),
  });
  const contasQ = useQuery({
    queryKey: ["rota-contas", rota?.id],
    queryFn: () => lerContasDaRota(rota!.id),
    enabled: Boolean(rota?.id),
  });
  const movimentosQ = useQuery({
    queryKey: ["rota-movimentos", rota?.id],
    queryFn: () => lerMovimentosDaRota(rota!.id),
    enabled: Boolean(rota?.id),
  });

  const [paragemAberta, setParagemAberta] = useState<RotaParagem | null>(null);
  const [saidaAberta, setSaidaAberta] = useState(false);
  const [fechoAberto, setFechoAberto] = useState(false);

  const atualizar = () => {
    clientQuery.invalidateQueries({ queryKey: ["rota-hoje"] });
    clientQuery.invalidateQueries({ queryKey: ["rota-paragens"] });
    clientQuery.invalidateQueries({ queryKey: ["rota-contas"] });
    clientQuery.invalidateQueries({ queryKey: ["rota-movimentos"] });
  };

  const paragens = paragensQ.data ?? [];
  const pendentes = paragens.filter((p) => !p.desfecho);
  const fechadas = paragens.filter((p) => p.desfecho);
  const contas = contasQ.data ?? null;
  const podeTrabalhar = rota?.estado === "planeada" || rota?.estado === "em_curso";

  if (!rota) {
    return (
      <div>
        <CabecalhoPagina titulo="A minha rota" descricao="A rota de hoje aparece aqui." />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <RouteIcon className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Ainda não tem rota para hoje</p>
            <p className="text-sm text-muted-foreground">
              O escritório monta a rota e ela aparece aqui automaticamente.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <CabecalhoPagina
        titulo={rota.nome}
        descricao={`${rota.data} · ${rota.viatura ?? "sem viatura"} · ${ETIQUETA_ROTA[rota.estado]}`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Resumo
          titulo="Paragens"
          valor={`${fechadas.length}/${paragens.length}`}
          nota="fechadas"
        />
        <Resumo
          titulo="Previsto receber"
          valor={formatarDinheiro(rota.previsto_receber)}
          nota={contas ? `recebido ${formatarDinheiro(contas.recebido)}` : undefined}
        />
        <Resumo
          titulo="Dinheiro na mão"
          valor={formatarDinheiro(contas?.esperado_envelope ?? 0)}
          nota={contas ? `saídas ${formatarDinheiro(contas.saidas)}` : undefined}
        />
        <Resumo
          titulo="Envelope"
          valor={rota.valor_envelope === null ? "—" : formatarDinheiro(rota.valor_envelope)}
          nota={rota.fechada_em ? "entregue" : "por fechar"}
        />
      </div>

      {podeTrabalhar && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSaidaAberta(true)}>
            <Wallet className="mr-2 h-4 w-4" /> Registar despesa
          </Button>
          <Button size="sm" onClick={() => setFechoAberto(true)} disabled={pendentes.length > 0}>
            <Lock className="mr-2 h-4 w-4" /> Fechar rota
          </Button>
          {pendentes.length > 0 && (
            <p className="w-full text-xs text-muted-foreground">
              Feche todas as paragens antes de fechar a rota.
            </p>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Por fazer ({pendentes.length})
        </h2>
        {pendentes.map((p) => (
          <CartaoParagem
            key={p.id}
            paragem={p}
            onAbrir={() => setParagemAberta(p)}
            ativa={Boolean(podeTrabalhar)}
          />
        ))}
        {pendentes.length === 0 && (
          <p className="text-sm text-muted-foreground">Todas as paragens estão fechadas.</p>
        )}

        {fechadas.length > 0 && (
          <>
            <h2 className="pt-3 text-sm font-semibold text-muted-foreground">
              Fechadas ({fechadas.length})
            </h2>
            {fechadas.map((p) => (
              <CartaoParagem key={p.id} paragem={p} onAbrir={() => setParagemAberta(p)} ativa={false} />
            ))}
          </>
        )}
      </section>

      {(movimentosQ.data ?? []).length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Movimentos do dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(movimentosQ.data ?? []).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {m.tipo === "saida" ? "Despesa" : "Recebimento"}
                  {m.forma ? ` · ${m.forma}` : ""}
                  {m.motivo ? ` · ${m.motivo}` : ""}
                  {m.descricao ? ` · ${m.descricao}` : ""}
                </span>
                <span className={m.sentido < 0 ? "text-destructive" : "font-medium"}>
                  {m.sentido < 0 ? "−" : "+"}
                  {formatarDinheiro(m.valor)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {paragemAberta && (
        <DialogoParagem
          paragem={paragemAberta}
          editavel={Boolean(podeTrabalhar) && !paragemAberta.desfecho}
          onFechar={() => setParagemAberta(null)}
          onFeito={() => {
            setParagemAberta(null);
            atualizar();
          }}
        />
      )}

      {saidaAberta && (
        <DialogoSaida rotaId={rota.id} onFechar={() => setSaidaAberta(false)} onFeito={atualizar} />
      )}

      {fechoAberto && (
        <DialogoFecho
          rotaId={rota.id}
          esperado={contas?.esperado_envelope ?? 0}
          onFechar={() => setFechoAberto(false)}
          onFeito={atualizar}
        />
      )}
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  nota,
}: {
  titulo: string;
  valor: string;
  nota?: string | undefined;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-lg font-semibold tabular-nums">{valor}</p>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

const COR_DESFECHO: Record<Desfecho, "default" | "secondary" | "destructive" | "outline"> = {
  entregue: "default",
  parcial: "secondary",
  reagendada: "outline",
  cancelada: "destructive",
  ausente: "destructive",
};

function CartaoParagem({
  paragem,
  onAbrir,
  ativa,
}: {
  paragem: RotaParagem;
  onAbrir: () => void;
  ativa: boolean;
}) {
  const morada = [paragem.morada_entrega, paragem.localidade_entrega].filter(Boolean).join(", ");
  const telefone = paragem.contacto_entrega || paragem.cliente_telefone;
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {paragem.ordem}. {paragem.cliente ?? "Cliente"}
            </p>
            <p className="text-xs text-muted-foreground">{paragem.pedido_numero}</p>
          </div>
          {paragem.desfecho ? (
            <Badge variant={COR_DESFECHO[paragem.desfecho]}>
              {ETIQUETA_DESFECHO[paragem.desfecho]}
            </Badge>
          ) : (
            <Badge variant="outline">{formatarDinheiro(paragem.previsto_receber)} a receber</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">
            <Package className="mr-1 h-3 w-3" />
            {paragem.n_itens ?? 0} {(paragem.n_itens ?? 0) === 1 ? "item" : "itens"}
          </Badge>
          {(paragem.n_montagens ?? 0) > 0 && (
            <Badge variant="secondary">
              <Wrench className="mr-1 h-3 w-3" />
              {paragem.n_montagens} com montagem
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2 text-center text-xs">
          <div>
            <p className="text-muted-foreground">Total</p>
            <p className="font-medium tabular-nums">{formatarDinheiro(paragem.total ?? 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Já pago</p>
            <p className="font-medium tabular-nums">{formatarDinheiro(paragem.total_pago ?? 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Falta receber</p>
            <p
              className={
                (paragem.pendente ?? 0) > 0
                  ? "font-semibold tabular-nums text-primary"
                  : "font-medium tabular-nums"
              }
            >
              {formatarDinheiro(paragem.pendente ?? 0)}
            </p>
          </div>
        </div>
        {(paragem.desconto_entrega ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            Desconto dado na entrega: {formatarDinheiro(paragem.desconto_entrega ?? 0)}
          </p>
        )}

        {morada && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {morada}
          </p>
        )}
        {paragem.notas_entrega && (
          <p className="text-sm text-muted-foreground">{paragem.notas_entrega}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {telefone && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${telefone}`}>
                <Phone className="mr-2 h-4 w-4" /> Ligar
              </a>
            </Button>
          )}
          {morada && (
            <Button asChild variant="outline" size="sm">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin className="mr-2 h-4 w-4" /> Mapa
              </a>
            </Button>
          )}
          <Button size="sm" variant={ativa ? "default" : "secondary"} onClick={onAbrir}>
            {ativa ? "Abrir paragem" : "Ver"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------- paragem
function DialogoParagem({
  paragem,
  editavel,
  onFechar,
  onFeito,
}: {
  paragem: RotaParagem;
  editavel: boolean;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [passo, setPasso] = useState<
    "escolher" | Desfecho | "recebimento" | "assistencia" | "retirar" | "desconto"
  >("escolher");
  const qc = useQueryClient();

  const linhasQ = useQuery({
    queryKey: ["paragem-linhas", paragem.pedido_id],
    queryFn: () => lerLinhasEntrega(paragem.pedido_id),
  });
  // O entregador só vê o que ainda falta entregar nesta venda.
  const linhas = (linhasQ.data ?? []).filter((l) => (l.qt_por_entregar ?? 0) > 0);
  const paragemQ = useQuery({
    queryKey: ["paragem", paragem.id],
    queryFn: () => lerParagem(paragem.id),
    initialData: paragem,
  });
  const atual = paragemQ.data ?? paragem;
  const faltaReceber = Number(atual.pendente ?? atual.previsto_receber ?? 0);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["paragem", paragem.id] });
    qc.invalidateQueries({ queryKey: ["paragem-linhas", paragem.pedido_id] });
    qc.invalidateQueries({ queryKey: ["rota-paragens"] });
    qc.invalidateQueries({ queryKey: ["rota-contas"] });
    qc.invalidateQueries({ queryKey: ["rota-movimentos"] });
  };

  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [recebidoPor, setRecebidoPor] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [dataNova, setDataNova] = useState(hoje());
  const [entregaId, setEntregaId] = useState<string | null>(null);

  const contextoMotivo =
    passo === "reagendada" ? "reagendamento" : passo === "ausente" ? "nao_entrega" : "nao_entrega";
  const motivosQ = useQuery({
    queryKey: ["motivos", contextoMotivo],
    queryFn: () => lerMotivosDe(contextoMotivo),
  });

  const desfecho = useMutation({
    mutationFn: (d: Desfecho) =>
      registarDesfecho({
        paragem_id: paragem.id,
        desfecho: d,
        linhas:
          d === "entregue" || d === "parcial"
            ? linhas
                .filter((l) => (quantidades[l.pedido_item_id] ?? 0) > 0)
                .map((l) => ({
                  pedido_item_id: l.pedido_item_id,
                  quantidade: quantidades[l.pedido_item_id] ?? 0,
                }))
            : null,
        motivo_id: motivoId || null,
        motivo: motivo || null,
        data_reagendamento: d === "reagendada" ? dataNova : null,
        recebido_por: recebidoPor || null,
      }),
    onSuccess: (res, d) => {
      if (d === "entregue" || d === "parcial") {
        setEntregaId(res.entrega_id ?? null);
        toast.success("Entrega registada. Falta receber o dinheiro.");
        setPasso("recebimento");
      } else {
        toast.success("Paragem fechada.");
        onFeito();
      }
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const total = faltaReceber;

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={`${paragem.cliente ?? "Cliente"} · ${paragem.pedido_numero ?? ""}`}
      descricao={
        editavel
          ? `Falta receber ${formatarDinheiro(total)} · ${atual.n_itens ?? 0} itens${
              (atual.n_montagens ?? 0) > 0 ? ` · ${atual.n_montagens} com montagem` : ""
            }`
          : `Desfecho: ${paragem.desfecho ? ETIQUETA_DESFECHO[paragem.desfecho] : "—"}`
      }
      onGuardar={onFechar}
    >
      {!editavel && passo === "escolher" && (
        <div className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Total: </span>
            {formatarDinheiro(atual.total ?? 0)} ·{" "}
            <span className="text-muted-foreground">pago </span>
            {formatarDinheiro(atual.total_pago ?? 0)} ·{" "}
            <span className="text-muted-foreground">falta </span>
            {formatarDinheiro(faltaReceber)}
          </p>
          <p className="text-muted-foreground">
            {atual.n_itens ?? 0} itens
            {(atual.n_montagens ?? 0) > 0 ? ` · ${atual.n_montagens} com montagem` : ""}
          </p>
          {paragem.motivo_descricao && (
            <p>
              <span className="text-muted-foreground">Motivo: </span>
              {paragem.motivo_descricao}
            </p>
          )}
          {paragem.motivo && <p className="text-muted-foreground">{paragem.motivo}</p>}
          {paragem.data_reagendamento && (
            <p>
              <span className="text-muted-foreground">Reagendada para: </span>
              {paragem.data_reagendamento}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setPasso("assistencia")}
          >
            <LifeBuoy className="mr-2 h-5 w-5" /> Abrir assistência
          </Button>
        </div>
      )}

      {editavel && passo === "escolher" && (
        <div className="grid gap-2">
          <Button
            type="button"
            className="h-14 justify-start"
            onClick={() => {
              setQuantidades(
                Object.fromEntries(linhas.map((l) => [l.pedido_item_id, l.qt_por_entregar])),
              );
              setPasso("entregue");
            }}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" /> Entreguei tudo
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-14 justify-start"
            onClick={() => {
              setQuantidades({});
              setPasso("parcial");
            }}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" /> Entreguei parte
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 justify-start"
            onClick={() => setPasso("reagendada")}
          >
            <CalendarClock className="mr-2 h-5 w-5" /> Reagendar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-14 justify-start"
            onClick={() => setPasso("ausente")}
          >
            <XCircle className="mr-2 h-5 w-5" /> Não entreguei
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-12 justify-start"
            onClick={() => setPasso("assistencia")}
          >
            <LifeBuoy className="mr-2 h-5 w-5" /> Abrir assistência
          </Button>
        </div>
      )}

      {editavel && (passo === "entregue" || passo === "parcial") && (
        <div className="space-y-3">
          {linhas.map((l) => (
            <div key={l.pedido_item_id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{l.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  falta entregar {l.qt_por_entregar}
                </p>
              </div>
              <Input
                type="number"
                min={0}
                max={l.qt_por_entregar}
                step="1"
                className="w-24"
                value={quantidades[l.pedido_item_id] ?? 0}
                onChange={(e) =>
                  setQuantidades((q) => ({
                    ...q,
                    [l.pedido_item_id]: Math.min(
                      Number(e.target.value || 0),
                      l.qt_por_entregar,
                    ),
                  }))
                }
              />
            </div>
          ))}
          <div>
            <Label htmlFor="recebido-por">Quem recebeu</Label>
            <Input
              id="recebido-por"
              value={recebidoPor}
              onChange={(e) => setRecebidoPor(e.target.value)}
              placeholder="Nome de quem assinou"
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Falta receber: </span>
              <span className="font-semibold tabular-nums">{formatarDinheiro(faltaReceber)}</span>
            </p>
            {passo === "entregue" && faltaReceber > 0.004 && (
              <p className="text-xs text-muted-foreground">
                Para fechar a entrega tem de receber o valor, retirar um produto ou dar desconto.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPasso("recebimento")}
                disabled={faltaReceber <= 0.004}
              >
                <Wallet className="mr-2 h-4 w-4" /> Receber
              </Button>
              <Button type="button" variant="outline" onClick={() => setPasso("retirar")}>
                <Package className="mr-2 h-4 w-4" /> Retirar produto
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasso("desconto")}
                disabled={faltaReceber <= 0.004}
              >
                Dar desconto
              </Button>
            </div>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={desfecho.isPending || (passo === "entregue" && faltaReceber > 0.004)}
            onClick={() => desfecho.mutate(passo)}
          >
            {desfecho.isPending ? "A registar…" : "Confirmar entrega"}
          </Button>
        </div>
      )}

      {editavel && passo === "retirar" && (
        <FormRetirar
          paragemId={paragem.id}
          linhas={linhas}
          onFeito={() => {
            recarregar();
            setPasso("entregue");
          }}
          onVoltar={() => setPasso("entregue")}
        />
      )}

      {editavel && passo === "desconto" && (
        <FormDesconto
          paragemId={paragem.id}
          maximo={faltaReceber}
          onFeito={() => {
            recarregar();
            setPasso("entregue");
          }}
          onVoltar={() => setPasso("entregue")}
        />
      )}


      {editavel && (passo === "reagendada" || passo === "ausente") && (
        <div className="space-y-3">
          {passo === "reagendada" && (
            <div>
              <Label htmlFor="nova-data">Nova data</Label>
              <Input
                id="nova-data"
                type="date"
                value={dataNova}
                onChange={(e) => setDataNova(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label>Motivo</Label>
            <Select value={motivoId} onValueChange={setMotivoId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher motivo" />
              </SelectTrigger>
              <SelectContent>
                {(motivosQ.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="nota-motivo">Nota</Label>
            <Textarea
              id="nota-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="O que aconteceu"
            />
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={desfecho.isPending || !motivoId}
            onClick={() => desfecho.mutate(passo)}
          >
            {desfecho.isPending ? "A registar…" : "Fechar paragem"}
          </Button>
        </div>
      )}

      {editavel && passo === "recebimento" && (
        <FormRecebimento
          paragemId={paragem.id}
          previsto={total}
          onFeito={() => {
            if (entregaId) {
              onFeito();
            } else {
              recarregar();
              setPasso("entregue");
            }
          }}
          onSaltar={() => {
            if (entregaId) {
              onFeito();
            } else {
              setPasso("entregue");
            }
          }}
          entregaId={entregaId}
        />
      )}

      {passo === "assistencia" && (
        <FormAssistencia
          paragem={paragem}
          onFeito={() => setPasso("escolher")}
        />
      )}
    </DialogoForm>
  );
}

// ------------------------------------------------------ retirar produto na rua
function FormRetirar({
  paragemId,
  linhas,
  onFeito,
  onVoltar,
}: {
  paragemId: string;
  linhas: { pedido_item_id: string; descricao: string; qt_por_entregar: number }[];
  onFeito: () => void;
  onVoltar: () => void;
}) {
  const [itemId, setItemId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [motivo, setMotivo] = useState("");

  const guardar = useMutation({
    mutationFn: () =>
      retirarItemEntrega({
        paragem_id: paragemId,
        pedido_item_id: itemId,
        quantidade,
        motivo,
      }),
    onSuccess: (r) => {
      toast.success(
        `Produto retirado. Falta receber ${formatarDinheiro(Number(r.falta_receber ?? 0))}.`,
      );
      onFeito();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-3">
      <div>
        <Label>Produto a retirar</Label>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger>
            <SelectValue placeholder="Escolher produto" />
          </SelectTrigger>
          <SelectContent>
            {linhas.map((l) => (
              <SelectItem key={l.pedido_item_id} value={l.pedido_item_id}>
                {l.descricao} ({l.qt_por_entregar} por entregar)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="qt-retirar">Quantidade</Label>
        <Input
          id="qt-retirar"
          type="number"
          min={1}
          step="1"
          value={quantidade}
          onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value || 1)))}
        />
      </div>
      <div>
        <Label htmlFor="motivo-retirar">Motivo</Label>
        <Textarea
          id="motivo-retirar"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Porque é que o produto não ficou com o cliente"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={onVoltar}>
          Voltar
        </Button>
        <Button
          type="button"
          disabled={guardar.isPending || !itemId || motivo.trim().length < 3}
          onClick={() => guardar.mutate()}
        >
          {guardar.isPending ? "A retirar…" : "Retirar produto"}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- desconto
function FormDesconto({
  paragemId,
  maximo,
  onFeito,
  onVoltar,
}: {
  paragemId: string;
  maximo: number;
  onFeito: () => void;
  onVoltar: () => void;
}) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");

  const guardar = useMutation({
    mutationFn: () => aplicarDescontoEntrega(paragemId, Number(valor || 0), motivo),
    onSuccess: (r) => {
      toast.success(
        `Desconto registado. Falta receber ${formatarDinheiro(Number(r.falta_receber ?? 0))}.`,
      );
      onFeito();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Desconto máximo nesta paragem: {formatarDinheiro(maximo)}. Fica registado com o seu nome.
      </p>
      <div>
        <Label htmlFor="valor-desconto">Valor do desconto</Label>
        <Input
          id="valor-desconto"
          type="number"
          min={0}
          max={maximo}
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="motivo-desconto">Motivo</Label>
        <Textarea
          id="motivo-desconto"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Porque é que deu desconto ao cliente"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={onVoltar}>
          Voltar
        </Button>
        <Button
          type="button"
          disabled={
            guardar.isPending ||
            Number(valor || 0) <= 0 ||
            Number(valor || 0) > maximo + 0.004 ||
            motivo.trim().length < 3
          }
          onClick={() => guardar.mutate()}
        >
          {guardar.isPending ? "A registar…" : "Dar desconto"}
        </Button>
      </div>
    </div>
  );
}


function FormRecebimento({
  paragemId,
  previsto,
  onFeito,
  onSaltar,
  entregaId,
}: {
  paragemId: string;
  previsto: number;
  onFeito: () => void;
  onSaltar: () => void;
  entregaId: string | null;
}) {
  const formasQ = useQuery({ queryKey: ["formas-pagamento"], queryFn: lerFormasAtivas });
  const formas = formasQ.data ?? [];
  const [linhas, setLinhas] = useState<LinhaRecebimento[]>([{ forma_id: "", valor: previsto }]);
  const soma = useMemo(() => linhas.reduce((t, l) => t + (Number(l.valor) || 0), 0), [linhas]);

  const guardar = useMutation({
    mutationFn: () =>
      registarRecebimentoEntrega(
        paragemId,
        linhas.filter((l) => l.forma_id && Number(l.valor) > 0),
      ),
    onSuccess: () => {
      toast.success("Recebimento registado.");
      onFeito();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A receber nesta paragem: <strong>{formatarDinheiro(previsto)}</strong>
        {entregaId ? " · entrega registada" : ""}
      </p>
      {linhas.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Select
            value={l.forma_id}
            onValueChange={(v) =>
              setLinhas((ls) => ls.map((x, j) => (i === j ? { ...x, forma_id: v } : x)))
            }
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Forma" />
            </SelectTrigger>
            <SelectContent>
              {formas.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            step="0.01"
            min={0}
            className="w-28"
            value={l.valor}
            onChange={(e) =>
              setLinhas((ls) =>
                ls.map((x, j) => (i === j ? { ...x, valor: Number(e.target.value || 0) } : x)),
              )
            }
          />
        </div>
      ))}
      <div className="flex items-center justify-between text-sm">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLinhas((ls) => [...ls, { forma_id: "", valor: 0 }])}
        >
          Outra forma
        </Button>
        <span className="tabular-nums">Total {formatarDinheiro(soma)}</span>
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={guardar.isPending || soma <= 0}
        onClick={() => guardar.mutate()}
      >
        {guardar.isPending ? "A registar…" : "Registar recebimento"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onSaltar}>
        Não recebi nada nesta paragem
      </Button>
    </div>
  );
}

function FormAssistencia({
  paragem,
  onFeito,
}: {
  paragem: RotaParagem;
  onFeito: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [peca, setPeca] = useState("");
  const [descricao, setDescricao] = useState("");

  const guardar = useMutation({
    mutationFn: () =>
      abrirAssistencia({
        pedido_id: paragem.pedido_id,
        origem: "entrega",
        motivo,
        descricao,
        peca_afetada: peca || null,
        paragem_id: paragem.id,
        entrega_id: paragem.entrega_id,
      }),
    onSuccess: () => {
      toast.success("Assistência aberta. O escritório trata daqui.");
      onFeito();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="assist-motivo">Motivo</Label>
        <Input
          id="assist-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Peça riscada, medida errada…"
        />
      </div>
      <div>
        <Label htmlFor="assist-peca">Peça afetada</Label>
        <Input id="assist-peca" value={peca} onChange={(e) => setPeca(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="assist-desc">Descrição</Label>
        <Textarea
          id="assist-desc"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={guardar.isPending || !motivo || !descricao}
        onClick={() => guardar.mutate()}
      >
        {guardar.isPending ? "A abrir…" : "Abrir assistência"}
      </Button>
    </div>
  );
}

// -------------------------------------------------------------- saída e fecho
function DialogoSaida({
  rotaId,
  onFechar,
  onFeito,
}: {
  rotaId: string;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const motivosQ = useQuery({
    queryKey: ["motivos", "saida_rota"],
    queryFn: () => lerMotivosDe("saida_rota"),
  });
  const [valor, setValor] = useState(0);
  const [motivoId, setMotivoId] = useState("");
  const [descricao, setDescricao] = useState("");

  const guardar = useMutation({
    mutationFn: () =>
      registarSaidaRota({ rota_id: rotaId, valor, motivo_id: motivoId, descricao }),
    onSuccess: () => {
      toast.success("Despesa registada.");
      onFeito();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Registar despesa da rota"
      descricao="Sai do dinheiro que entrega no fim do dia."
      aGuardar={guardar.isPending}
      onGuardar={() => guardar.mutate()}
    >
      <div>
        <Label htmlFor="saida-valor">Valor</Label>
        <Input
          id="saida-valor"
          type="number"
          step="0.01"
          min={0}
          value={valor}
          onChange={(e) => setValor(Number(e.target.value || 0))}
        />
      </div>
      <div>
        <Label>Motivo</Label>
        <Select value={motivoId} onValueChange={setMotivoId}>
          <SelectTrigger>
            <SelectValue placeholder="Escolher motivo" />
          </SelectTrigger>
          <SelectContent>
            {(motivosQ.data ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.descricao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="saida-desc">Descrição</Label>
        <Input id="saida-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>
    </DialogoForm>
  );
}

function DialogoFecho({
  rotaId,
  esperado,
  onFechar,
  onFeito,
}: {
  rotaId: string;
  esperado: number;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [envelope, setEnvelope] = useState(esperado);
  const [justificacao, setJustificacao] = useState("");
  const diferenca = Number((envelope - esperado).toFixed(2));

  const guardar = useMutation({
    mutationFn: () => fecharRota(rotaId, envelope, justificacao || null),
    onSuccess: () => {
      toast.success("Rota fechada. Entregue o envelope no escritório.");
      onFeito();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Fechar rota"
      descricao={`Dinheiro esperado no envelope: ${formatarDinheiro(esperado)}.`}
      aGuardar={guardar.isPending}
      onGuardar={() => guardar.mutate()}
    >
      <div>
        <Label htmlFor="envelope">Valor que vai no envelope</Label>
        <Input
          id="envelope"
          type="number"
          step="0.01"
          min={0}
          value={envelope}
          onChange={(e) => setEnvelope(Number(e.target.value || 0))}
        />
      </div>
      <p className={diferenca === 0 ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
        Diferença: {formatarDinheiro(diferenca)}
      </p>
      {diferenca !== 0 && (
        <div>
          <Label htmlFor="just">Justificação</Label>
          <Textarea
            id="just"
            value={justificacao}
            onChange={(e) => setJustificacao(e.target.value)}
            placeholder="Explique a diferença"
          />
        </div>
      )}
    </DialogoForm>
  );
}
