import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeEuro, Check, Plus, Undo2, X } from "lucide-react";
import { useState } from "react";
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
  confirmarPagamento,
  devolverPagamento,
  lerFormasAtivas,
  lerPagamentos,
  registarPagamento,
  rejeitarPagamento,
} from "@/lib/erp/pagamentos";
import {
  ETIQUETA_PAGAMENTO,
  formatarDinheiro,
  type Pagamento,
  type Pedido,
} from "@/lib/erp/tipos";

const CORES: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  confirmado: "default",
  pendente: "secondary",
  pendente_confirmacao: "secondary",
  rejeitado: "destructive",
  devolvido: "outline",
};

export function PainelPagamentos({ pedido }: { pedido: Pedido }) {
  const queryClient = useQueryClient();
  const { perfil } = usePermissoes();
  const podeConfirmar = perfil === "adm" || perfil === "financeiro" || perfil === "escritorio";

  const [aberto, setAberto] = useState(false);
  const [formaId, setFormaId] = useState("");
  const [valor, setValor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [comprovativo, setComprovativo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [aDevolver, setADevolver] = useState<Pagamento | null>(null);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");

  const pagamentos = useQuery({
    queryKey: ["pagamentos", pedido.id],
    queryFn: () => lerPagamentos(pedido.id),
  });
  const formas = useQuery({ queryKey: ["formas-ativas"], queryFn: lerFormasAtivas });

  const lista = pagamentos.data ?? [];
  const registado = lista
    .filter((p) => p.estado !== "rejeitado" && p.estado !== "devolvido")
    .reduce((soma, p) => soma + Number(p.valor), 0);
  const falta = Math.max(Number(pedido.total) - registado, 0);

  function atualizar() {
    void queryClient.invalidateQueries({ queryKey: ["pagamentos", pedido.id] });
    void queryClient.invalidateQueries({ queryKey: ["pedido", pedido.id] });
    void queryClient.invalidateQueries({ queryKey: ["caixa"] });
  }

  const registar = useMutation({
    mutationFn: async () => {
      const numero = Number(valor.replace(",", "."));
      if (!formaId) throw new Error("Escolha a forma de pagamento.");
      if (!Number.isFinite(numero) || numero <= 0) throw new Error("Indique um valor válido.");
      await registarPagamento({
        pedido_id: pedido.id,
        forma_id: formaId,
        valor: Number(numero.toFixed(2)),
        referencia,
        comprovativo_url: comprovativo,
        observacoes,
      });
    },
    onSuccess: () => {
      toast.success("Pagamento registado.");
      setAberto(false);
      setValor("");
      setReferencia("");
      setComprovativo("");
      setObservacoes("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const confirmar = useMutation({
    mutationFn: (id: string) => confirmarPagamento(id),
    onSuccess: () => {
      toast.success("Pagamento confirmado.");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const rejeitar = useMutation({
    mutationFn: (id: string) => rejeitarPagamento(id, "Rejeitado no ecrã da venda."),
    onSuccess: () => {
      toast.success("Pagamento rejeitado.");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const devolver = useMutation({
    mutationFn: async () => {
      if (!aDevolver) return;
      if (!motivoDevolucao.trim()) throw new Error("Escreva o motivo da devolução.");
      await devolverPagamento(aDevolver.id, motivoDevolucao.trim());
    },
    onSuccess: () => {
      toast.success("Devolução registada.");
      setADevolver(null);
      setMotivoDevolucao("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeEuro className="h-4 w-4 text-primary" /> Pagamentos
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setValor(falta > 0 ? falta.toFixed(2) : "");
            setAberto(true);
          }}
          disabled={pedido.estado === "cancelado"}
        >
          <Plus className="mr-1 h-4 w-4" /> Receber
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-semibold">{formatarDinheiro(pedido.total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Recebido</p>
            <p className="font-semibold">{formatarDinheiro(pedido.total_pago)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Falta</p>
            <p className="font-semibold text-primary">{formatarDinheiro(falta)}</p>
          </div>
        </div>

        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há pagamentos registados.</p>
        ) : (
          <ul className="divide-y">
            {lista.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium">{formatarDinheiro(p.valor)}</span>
                <span className="text-muted-foreground">{p.forma_nome}</span>
                <Badge variant={CORES[p.estado] ?? "secondary"}>
                  {ETIQUETA_PAGAMENTO[p.estado]}
                </Badge>
                {p.referencia ? (
                  <span className="text-xs text-muted-foreground">Ref. {p.referencia}</span>
                ) : null}
                <span className="ml-auto flex gap-1">
                  {podeConfirmar && p.estado !== "confirmado" && p.estado !== "devolvido" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => confirmar.mutate(p.id)}
                        aria-label="Confirmar pagamento"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      {p.estado !== "rejeitado" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => rejeitar.mutate(p.id)}
                          aria-label="Rejeitar pagamento"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {podeConfirmar && p.estado === "confirmado" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setADevolver(p);
                        setMotivoDevolucao("");
                      }}
                      aria-label="Devolver pagamento"
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber pagamento</DialogTitle>
            <DialogDescription>
              Falta receber {formatarDinheiro(falta)} deste pedido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={formaId} onValueChange={setFormaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher…" />
                </SelectTrigger>
                <SelectContent>
                  {(formas.data ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (€)</Label>
              <Input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Referência (opcional)</Label>
              <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Comprovativo (ligação, opcional)</Label>
              <Input value={comprovativo} onChange={(e) => setComprovativo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => registar.mutate()} disabled={registar.isPending}>
              Registar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(aDevolver)} onOpenChange={(v) => !v && setADevolver(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver pagamento</DialogTitle>
            <DialogDescription>
              O pagamento fica registado como devolvido. Escreva o motivo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoDevolucao}
            onChange={(e) => setMotivoDevolucao(e.target.value)}
            rows={3}
            placeholder="Motivo da devolução"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setADevolver(null)}>
              Cancelar
            </Button>
            <Button onClick={() => devolver.mutate()} disabled={devolver.isPending}>
              Devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
