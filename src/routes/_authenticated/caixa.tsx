import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Inbox,
  Lock,
  PackageCheck,
  Unlock,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
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
import { useSessao } from "@/hooks/use-sessao";
import { mensagemErro } from "@/lib/erp/db";
import {
  abrirCaixa,
  fecharCaixa,
  lerCaixaAtual,
  lerCaixas,
  lerMotivosEntrada,
  lerMotivosSaida,
  lerMovimentos,
  registarEntradaCaixa,
  registarSaidaCaixa,
} from "@/lib/erp/pagamentos";
import { lerEnvelopes, receberEnvelopeRota } from "@/lib/erp/rotas";
import {
  ETIQUETA_MOVIMENTO_CAIXA,
  formatarDataCurta,
  formatarDinheiro,
} from "@/lib/erp/tipos";


export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({
    meta: [
      { title: "Caixa do dia — UP Vendas" },
      {
        name: "description",
        content:
          "Caixa diário da UP Móveis: abrir o dia, ver recebimentos em dinheiro, registar saídas e fechar com contagem.",
      },
      { property: "og:title", content: "Caixa do dia — UP Vendas" },
      { property: "og:description", content: "Caixa diário da UP Móveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaCaixa,
});

function PaginaCaixa() {
  const queryClient = useQueryClient();
  const { data: sessao } = useSessao();
  const { adm } = usePermissoes();
  const utilizadorId = sessao?.utilizador?.id ?? "";

  const [saldoInicial, setSaldoInicial] = useState("");
  const [saidaAberta, setSaidaAberta] = useState(false);
  const [valorSaida, setValorSaida] = useState("");
  const [motivoSaida, setMotivoSaida] = useState("");
  const [descricaoSaida, setDescricaoSaida] = useState("");
  const [fechoAberto, setFechoAberto] = useState(false);
  const [contado, setContado] = useState("");
  const [justificacao, setJustificacao] = useState("");

  const caixa = useQuery({
    queryKey: ["caixa", utilizadorId],
    enabled: Boolean(utilizadorId),
    queryFn: () => lerCaixaAtual(utilizadorId),
  });
  const movimentos = useQuery({
    queryKey: ["caixa-movimentos", caixa.data?.id],
    enabled: Boolean(caixa.data?.id),
    queryFn: () => lerMovimentos(caixa.data!.id),
  });
  const anteriores = useQuery({
    queryKey: ["caixas-meus", utilizadorId],
    enabled: Boolean(utilizadorId),
    queryFn: () => lerCaixas({ utilizadorId }),
  });
  const motivos = useQuery({ queryKey: ["motivos-saida-caixa"], queryFn: lerMotivosSaida });

  function atualizar() {
    void queryClient.invalidateQueries({ queryKey: ["caixa"] });
    void queryClient.invalidateQueries({ queryKey: ["caixa-movimentos"] });
    void queryClient.invalidateQueries({ queryKey: ["caixas-meus"] });
  }

  const abrir = useMutation({
    mutationFn: async () => {
      const numero = saldoInicial.trim() ? Number(saldoInicial.replace(",", ".")) : null;
      await abrirCaixa(numero);
    },
    onSuccess: () => {
      toast.success("Caixa aberto.");
      setSaldoInicial("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const saida = useMutation({
    mutationFn: async () => {
      const numero = Number(valorSaida.replace(",", "."));
      if (!Number.isFinite(numero) || numero <= 0) throw new Error("Indique um valor válido.");
      if (!motivoSaida) throw new Error("Indique o motivo da saída de caixa.");
      await registarSaidaCaixa({
        valor: Number(numero.toFixed(2)),
        motivo_id: motivoSaida,
        descricao: descricaoSaida,
      });
    },
    onSuccess: () => {
      toast.success("Saída registada.");
      setSaidaAberta(false);
      setValorSaida("");
      setDescricaoSaida("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const fechar = useMutation({
    mutationFn: async () => {
      const numero = Number(contado.replace(",", "."));
      if (!Number.isFinite(numero) || numero < 0) throw new Error("Indique o dinheiro contado.");
      return fecharCaixa(caixa.data!.id, Number(numero.toFixed(2)), justificacao);
    },
    onSuccess: (resultado) => {
      toast.success(
        Number(resultado.diferenca) === 0
          ? "Caixa fechado sem diferenças."
          : `Caixa fechado com diferença de ${formatarDinheiro(resultado.diferenca)}.`,
      );
      setFechoAberto(false);
      setContado("");
      setJustificacao("");
      atualizar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const atual = caixa.data;
  const lista = movimentos.data ?? [];
  const diferencaPrevista = contado.trim()
    ? Number(contado.replace(",", ".")) - Number(atual?.saldo_esperado ?? 0)
    : 0;

  return (
    <div>
      <CabecalhoPagina
        titulo="Caixa do dia"
        descricao="Só o dinheiro conta para o saldo. Multibanco, MB Way e transferências ficam registados para relatório."
      />

      {!atual ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Unlock className="h-4 w-4 text-primary" /> Abrir o caixa de hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O saldo de abertura é o dinheiro contado no último fecho. No primeiro caixa, um
              administrador tem de escrever o saldo inicial.
            </p>
            {adm ? (
              <div className="space-y-1.5">
                <Label>Saldo inicial (€) — só para o primeiro caixa</Label>
                <Input
                  inputMode="decimal"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            ) : null}
            <Button onClick={() => abrir.mutate()} disabled={abrir.isPending}>
              <Wallet className="mr-1 h-4 w-4" /> Abrir caixa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">
                {formatarDataCurta(atual.data)}{" "}
                <Badge variant="default" className="ml-1">
                  Aberto
                </Badge>
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSaidaAberta(true)}>
                  <ArrowUpCircle className="mr-1 h-4 w-4" /> Saída
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setContado("");
                    setJustificacao("");
                    setFechoAberto(true);
                  }}
                >
                  <Lock className="mr-1 h-4 w-4" /> Fechar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Valor titulo="Abertura" valor={atual.saldo_abertura} />
              <Valor titulo="Dinheiro recebido" valor={atual.total_dinheiro ?? 0} />
              <Valor titulo="Saídas e sangrias" valor={(atual.total_saidas ?? 0) + (atual.total_sangrias ?? 0)} />
              <Valor titulo="Saldo esperado" valor={atual.saldo_esperado} destaque />
              <Valor titulo="Multibanco" valor={atual.total_multibanco ?? 0} />
              <Valor titulo="MB Way" valor={atual.total_mbway ?? 0} />
              <Valor titulo="Transferências" valor={atual.total_transferencia ?? 0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Movimentos</CardTitle>
            </CardHeader>
            <CardContent>
              {lista.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há movimentos hoje.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {lista.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                      {m.sentido > 0 ? (
                        <ArrowDownCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{formatarDinheiro(m.valor * m.sentido)}</span>
                      <span className="text-muted-foreground">
                        {ETIQUETA_MOVIMENTO_CAIXA[m.tipo]}
                        {m.forma_nome ? ` · ${m.forma_nome}` : ""}
                      </span>
                      {m.pedido_numero ? <Badge variant="outline">{m.pedido_numero}</Badge> : null}
                      {m.de_dia_anterior ? <Badge variant="secondary">Dia anterior</Badge> : null}
                      <span className="text-xs text-muted-foreground">
                        {m.motivo_descricao ?? m.descricao ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Caixas anteriores</CardTitle>
        </CardHeader>
        <CardContent>
          {(anteriores.data ?? []).filter((c) => c.estado === "fechado").length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não fechou nenhum caixa.</p>
          ) : (
            <ul className="divide-y text-sm">
              {(anteriores.data ?? [])
                .filter((c) => c.estado === "fechado")
                .map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{formatarDataCurta(c.data)}</span>
                    <span className="text-muted-foreground">
                      Esperado {formatarDinheiro(c.saldo_esperado)} · Contado{" "}
                      {formatarDinheiro(c.saldo_contado)}
                    </span>
                    <Badge variant={Number(c.diferenca) === 0 ? "outline" : "destructive"}>
                      {Number(c.diferenca) === 0
                        ? "Sem diferença"
                        : formatarDinheiro(c.diferenca)}
                    </Badge>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={saidaAberta} onOpenChange={setSaidaAberta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registar saída de caixa</DialogTitle>
            <DialogDescription>Toda a saída precisa de um motivo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Valor (€)</Label>
              <Input
                inputMode="decimal"
                value={valorSaida}
                onChange={(e) => setValorSaida(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select value={motivoSaida} onValueChange={setMotivoSaida}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher…" />
                </SelectTrigger>
                <SelectContent>
                  {(motivos.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={descricaoSaida}
                onChange={(e) => setDescricaoSaida(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaidaAberta(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saida.mutate()} disabled={saida.isPending}>
              Registar saída
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fechoAberto} onOpenChange={setFechoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar o caixa</DialogTitle>
            <DialogDescription>
              Saldo esperado em dinheiro: {formatarDinheiro(atual?.saldo_esperado)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Dinheiro contado (€)</Label>
              <Input
                inputMode="decimal"
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                placeholder="0,00"
              />
            </div>
            {contado.trim() && diferencaPrevista !== 0 ? (
              <div className="space-y-1.5">
                <Label>Justificação da diferença de {formatarDinheiro(diferencaPrevista)}</Label>
                <Textarea
                  value={justificacao}
                  onChange={(e) => setJustificacao(e.target.value)}
                  rows={3}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFechoAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => fechar.mutate()} disabled={fechar.isPending}>
              Fechar caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Valor({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number | string | null | undefined;
  destaque?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={destaque ? "font-semibold text-primary" : "font-semibold"}>
        {formatarDinheiro(valor)}
      </p>
    </div>
  );
}
