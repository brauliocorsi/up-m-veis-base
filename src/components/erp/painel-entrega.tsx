import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, FileText, Truck, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import {
  anularDocumentoFiscal,
  lerDocumentosDoPedido,
  lerEntregasDoPedido,
  lerLinhasEntrega,
  registarDocumentoFiscal,
  registarEntrega,
  reverterEntrega,
  type LinhaARegistar,
} from "@/lib/erp/entregas";
import {
  ETIQUETA_DOCUMENTO,
  ETIQUETA_ESTADO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  formatarData,
  formatarDataCurta,
  formatarDinheiro,
  type Pedido,
  type TipoDocumentoFiscal,
} from "@/lib/erp/tipos";

const hoje = () => new Date().toISOString().slice(0, 10);

const ESTADOS_ENTREGAVEIS = ["confirmado", "em_preparacao", "pronto"];

/** Entregas e documentos fiscais de uma venda. Uma entrega nunca se edita: reverte-se. */
export function PainelEntrega({ pedido }: { pedido: Pedido }) {
  const qc = useQueryClient();
  const perms = usePermissoes();
  const [registar, setRegistar] = useState(false);
  const [reverter, setReverter] = useState<string | null>(null);
  const [motivoReversao, setMotivoReversao] = useState("");
  const [novoDoc, setNovoDoc] = useState(false);
  const [anular, setAnular] = useState<string | null>(null);
  const [motivoAnular, setMotivoAnular] = useState("");

  const linhas = useQuery({
    queryKey: ["entrega-linhas", pedido.id],
    queryFn: () => lerLinhasEntrega(pedido.id),
  });
  const entregas = useQuery({
    queryKey: ["entregas-pedido", pedido.id],
    queryFn: () => lerEntregasDoPedido(pedido.id),
  });
  const documentos = useQuery({
    queryKey: ["documentos-pedido", pedido.id],
    queryFn: () => lerDocumentosDoPedido(pedido.id),
  });

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["entrega-linhas", pedido.id] });
    qc.invalidateQueries({ queryKey: ["entregas-pedido", pedido.id] });
    qc.invalidateQueries({ queryKey: ["documentos-pedido", pedido.id] });
    qc.invalidateQueries({ queryKey: ["pedido", pedido.id] });
    qc.invalidateQueries({ queryKey: ["pedido-itens", pedido.id] });
    qc.invalidateQueries({ queryKey: ["pedidos"] });
  };

  const reversao = useMutation({
    mutationFn: async () => {
      if (motivoReversao.trim().length < 5) throw new Error("Escreva o motivo da reversão.");
      await reverterEntrega(reverter!, motivoReversao.trim());
    },
    onSuccess: () => {
      toast.success("Entrega revertida. O stock foi devolvido.");
      setReverter(null);
      setMotivoReversao("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro, (erro as Error).message)),
  });

  const anulacao = useMutation({
    mutationFn: async () => {
      if (motivoAnular.trim().length < 5) throw new Error("Escreva o motivo da anulação.");
      await anularDocumentoFiscal(anular!, motivoAnular.trim());
    },
    onSuccess: () => {
      toast.success("Documento anulado.");
      setAnular(null);
      setMotivoAnular("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro, (erro as Error).message)),
  });

  const porEntregar = (linhas.data ?? []).reduce((s, l) => s + Number(l.qt_por_entregar), 0);
  const entregue = (linhas.data ?? []).reduce((s, l) => s + Number(l.qt_entregue), 0);
  const podeEntregar =
    perms.entregar && ESTADOS_ENTREGAVEIS.includes(pedido.estado) && porEntregar > 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" /> Entregas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {entregue} entregues · {porEntregar} por entregar
          </p>

          {(entregas.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Ainda não há entregas registadas.</p>
          )}

          <div className="space-y-2">
            {(entregas.data ?? []).map((e) => (
              <div key={e.id} className="rounded-md border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {e.tipo === "total" ? "Entrega total" : "Entrega parcial"}
                  </Badge>
                  <span>{formatarDataCurta(e.data_entrega)}</span>
                  {e.estado === "revertida" && (
                    <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                      Revertida
                    </Badge>
                  )}
                  <span className="text-muted-foreground">{e.unidades ?? 0} unidades</span>
                  {e.estado === "registada" && perms.receber && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setReverter(e.id)}
                    >
                      <Undo2 className="mr-2 h-4 w-4" /> Reverter
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Entregue por {e.entregue_por_nome ?? "—"}
                  {e.recebido_por_nome ? ` · recebido por ${e.recebido_por_nome}` : ""}
                </p>
                {e.observacoes && <p className="mt-1 text-xs">{e.observacoes}</p>}
                {e.motivo_reversao && (
                  <p className="mt-1 text-xs text-destructive">
                    Revertida em {formatarData(e.revertida_em)}: {e.motivo_reversao}
                  </p>
                )}
              </div>
            ))}
          </div>

          {podeEntregar && (
            <Button className="w-full" onClick={() => setRegistar(true)}>
              <Truck className="mr-2 h-4 w-4" /> Registar entrega
            </Button>
          )}
          {!perms.entregar && (
            <p className="text-xs text-muted-foreground">
              O seu perfil não pode registar entregas.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Faturação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(documentos.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Sem documentos fiscais.</p>
          )}
          {(documentos.data ?? []).map((d) => (
            <div key={d.id} className="rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ETIQUETA_DOCUMENTO[d.tipo]}</span>
                <Badge variant="secondary">{ETIQUETA_ESTADO_DOCUMENTO[d.estado]}</Badge>
                {d.valor_divergente && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                    Valor diferente do pedido
                  </Badge>
                )}
                {d.estado !== "anulado" && perms.faturar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setAnular(d.id)}
                  >
                    <Ban className="mr-2 h-4 w-4" /> Anular
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[d.serie, d.numero].filter(Boolean).join(" ") || "sem número"} ·{" "}
                {formatarDataCurta(d.data_emissao)} ·{" "}
                {d.valor === null ? "—" : formatarDinheiro(d.valor)}
                {d.codigo_at ? ` · AT ${d.codigo_at}` : ""}
              </p>
            </div>
          ))}

          {perms.faturar && (
            <Button variant="outline" className="w-full" onClick={() => setNovoDoc(true)}>
              <FileText className="mr-2 h-4 w-4" /> Registar documento
            </Button>
          )}
        </CardContent>
      </Card>

      <DialogoRegistarEntrega
        aberto={registar}
        pedidoId={pedido.id}
        linhas={linhas.data ?? []}
        onFechar={() => setRegistar(false)}
        onRegistado={atualizar}
      />

      <DialogoDocumento
        aberto={novoDoc}
        pedido={pedido}
        entregas={(entregas.data ?? [])
          .filter((e) => e.estado === "registada")
          .map((e) => ({ id: e.id, etiqueta: `${formatarDataCurta(e.data_entrega)} · ${e.tipo}` }))}
        onFechar={() => setNovoDoc(false)}
        onRegistado={atualizar}
      />

      <Dialog open={Boolean(reverter)} onOpenChange={(v) => !v && setReverter(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverter entrega</DialogTitle>
            <DialogDescription>
              A entrega fica no histórico como revertida e o stock volta a existir. Depois registe
              uma entrega nova com os valores certos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-rev">Motivo</Label>
            <Textarea
              id="motivo-rev"
              value={motivoReversao}
              onChange={(e) => setMotivoReversao(e.target.value)}
              placeholder="Ex.: cliente devolveu o sofá por defeito no tecido."
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setReverter(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={reversao.isPending}
              onClick={() => reversao.mutate()}
            >
              Reverter entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(anular)} onOpenChange={(v) => !v && setAnular(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular documento</DialogTitle>
            <DialogDescription>
              O documento fica no histórico como anulado. Não é apagado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-anular">Motivo</Label>
            <Textarea
              id="motivo-anular"
              value={motivoAnular}
              onChange={(e) => setMotivoAnular(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setAnular(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={anulacao.isPending}
              onClick={() => anulacao.mutate()}
            >
              Anular documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DialogoRegistarEntrega({
  aberto,
  pedidoId,
  linhas,
  faltaPagar = 0,
  onFechar,
  onRegistado,
}: {
  aberto: boolean;
  pedidoId: string;
  linhas: Array<{
    pedido_item_id: string;
    descricao: string;
    linha: number;
    qt_por_entregar: number;
    qt_entregue: number;
  }>;
  /** Valor ainda por receber da venda. Não se fecha uma venda com dinheiro em falta. */
  faltaPagar?: number;
  onFechar: () => void;
  onRegistado: () => void;
}) {
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [data, setData] = useState(hoje());
  const [recebidoPor, setRecebidoPor] = useState("");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (!aberto) return;
    const iniciais: Record<string, string> = {};
    for (const l of linhas) iniciais[l.pedido_item_id] = String(Number(l.qt_por_entregar));
    setQuantidades(iniciais);
    setMotivos({});
    setData(hoje());
    setRecebidoPor("");
    setObservacoes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, linhas.length]);

  const registo = useMutation({
    mutationFn: async () => {
      const escolhidas: LinhaARegistar[] = [];
      for (const l of linhas) {
        const qt = Number(quantidades[l.pedido_item_id] ?? 0);
        if (!Number.isFinite(qt) || qt <= 0) continue;
        if (qt > Number(l.qt_por_entregar)) {
          throw new Error(`Na linha ${l.linha} só faltam ${l.qt_por_entregar} unidades.`);
        }
        escolhidas.push({
          pedido_item_id: l.pedido_item_id,
          quantidade: qt,
          motivo_nao_entrega:
            qt < Number(l.qt_por_entregar) ? motivos[l.pedido_item_id]?.trim() || null : null,
        });
      }
      if (escolhidas.length === 0) throw new Error("Indique as quantidades que vai entregar.");
      const fecha =
        linhas.reduce((s, l) => s + Number(l.qt_por_entregar), 0) ===
        escolhidas.reduce((s, e) => s + Number(e.quantidade), 0);
      if (fecha && Number(faltaPagar) > 0.004) {
        throw new Error(
          `Esta venda ainda tem ${formatarDinheiro(faltaPagar)} a receber. Registe o recebimento antes de marcar como entregue.`,
        );
      }
      return registarEntrega({
        pedido_id: pedidoId,
        linhas: escolhidas,
        data,
        recebido_por: recebidoPor.trim() || null,
        observacoes: observacoes.trim() || null,
      });
    },
    onSuccess: (r) => {
      toast.success(
        r.tipo === "total"
          ? "Entrega total registada. O pedido ficou entregue."
          : `Entrega parcial registada. Faltam ${r.por_entregar} unidades.`,
      );
      onFechar();
      onRegistado();
    },
    onError: (erro) => toast.error(mensagemErro(erro, (erro as Error).message)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registar entrega</DialogTitle>
          <DialogDescription>
            Confirme o que vai sair hoje. O stock só sai no momento da entrega.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {linhas
            .filter((l) => Number(l.qt_por_entregar) > 0)
            .map((l) => (
              <div key={l.pedido_item_id} className="space-y-2 rounded-md border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm leading-tight">
                    <p className="font-medium">{l.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      Faltam {l.qt_por_entregar} · já entregues {l.qt_entregue}
                    </p>
                  </div>
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    max={Number(l.qt_por_entregar)}
                    step={1}
                    aria-label={`Quantidade a entregar da linha ${l.linha}`}
                    value={quantidades[l.pedido_item_id] ?? ""}
                    onChange={(e) =>
                      setQuantidades({ ...quantidades, [l.pedido_item_id]: e.target.value })
                    }
                  />
                </div>
                {Number(quantidades[l.pedido_item_id] ?? 0) < Number(l.qt_por_entregar) && (
                  <Input
                    placeholder="Porque não vai tudo? (opcional)"
                    value={motivos[l.pedido_item_id] ?? ""}
                    onChange={(e) => setMotivos({ ...motivos, [l.pedido_item_id]: e.target.value })}
                  />
                )}
              </div>
            ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ent-data">Data da entrega</Label>
              <Input
                id="ent-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ent-recebido">Quem recebeu</Label>
              <Input
                id="ent-recebido"
                value={recebidoPor}
                onChange={(e) => setRecebidoPor(e.target.value)}
                placeholder="Nome de quem assinou"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ent-obs">Observações</Label>
            <Textarea
              id="ent-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={registo.isPending} onClick={() => registo.mutate()}>
            {registo.isPending ? "A registar…" : "Registar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoDocumento({
  aberto,
  pedido,
  entregas,
  onFechar,
  onRegistado,
}: {
  aberto: boolean;
  pedido: Pedido;
  entregas: Array<{ id: string; etiqueta: string }>;
  onFechar: () => void;
  onRegistado: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDocumentoFiscal>("fatura");
  const [entregaId, setEntregaId] = useState("nenhuma");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [valor, setValor] = useState(String(Number(pedido.total ?? 0)));
  const [dataEmissao, setDataEmissao] = useState(hoje());
  const [codigoAt, setCodigoAt] = useState("");
  const [atcud, setAtcud] = useState("");

  const registo = useMutation({
    mutationFn: async () => {
      if (!numero.trim()) throw new Error("Escreva o número do documento.");
      return registarDocumentoFiscal({
        pedido_id: pedido.id,
        tipo,
        entrega_id: entregaId === "nenhuma" ? null : entregaId,
        serie: serie.trim() || null,
        numero: numero.trim(),
        valor: valor === "" ? null : Number(valor),
        data_emissao: dataEmissao,
        codigo_at: codigoAt.trim() || null,
        atcud: atcud.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Documento registado.");
      onFechar();
      onRegistado();
    },
    onError: (erro) => toast.error(mensagemErro(erro, (erro as Error).message)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registar documento fiscal</DialogTitle>
          <DialogDescription>
            Escreva os dados do documento emitido no programa de faturação.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="doc-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDocumentoFiscal)}>
              <SelectTrigger id="doc-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DOCUMENTO.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-entrega">Entrega associada</Label>
            <Select value={entregaId} onValueChange={setEntregaId}>
              <SelectTrigger id="doc-entrega">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Nenhuma</SelectItem>
                {entregas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-serie">Série</Label>
            <Input id="doc-serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-numero">Número</Label>
            <Input id="doc-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-valor">Valor</Label>
            <Input
              id="doc-valor"
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-data">Data de emissão</Label>
            <Input
              id="doc-data"
              type="date"
              value={dataEmissao}
              onChange={(e) => setDataEmissao(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-at">Código AT</Label>
            <Input id="doc-at" value={codigoAt} onChange={(e) => setCodigoAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-atcud">ATCUD</Label>
            <Input id="doc-atcud" value={atcud} onChange={(e) => setAtcud(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={registo.isPending} onClick={() => registo.mutate()}>
            Registar documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
