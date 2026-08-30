import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  Copy,
  Mail,
  PackageCheck,
  Printer,
  Send,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  cancelarOc,
  confirmarEtaOc,
  finalizarOc,
  guardarOc,
  guardarOcItem,
  lerOc,
  lerOcItens,
  lerRecebimentos,
  receberOc,
  registarEnvioOc,
} from "@/lib/erp/compras";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { composerEmailOc } from "@/lib/erp/oc-email";
import { ETIQUETA_OC, formatarData, formatarDinheiro } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/ordens-compra/$ocId")({
  head: () => ({
    meta: [
      { title: "Ordem de compra — UP Vendas" },
      {
        name: "description",
        content:
          "Detalhe da encomenda ao fornecedor: linhas, envio, data confirmada e receção de mercadoria.",
      },
      { property: "og:title", content: "Ordem de compra — UP Vendas" },
      {
        property: "og:description",
        content: "Finalize, envie, confirme a data e receba a encomenda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaOc,
});

function PaginaOc() {
  const { ocId } = useParams({ from: "/_authenticated/ordens-compra/$ocId" });
  const { comprar } = usePermissoes();
  const queryClient = useQueryClient();

  const [eta, setEta] = useState("");
  const [aReceber, setAReceber] = useState(false);
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [docFornecedor, setDocFornecedor] = useState("");
  const [aCancelar, setACancelar] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [notaCancelamento, setNotaCancelamento] = useState("");

  const oc = useQuery({ queryKey: ["oc", ocId], queryFn: () => lerOc(ocId) });
  const itens = useQuery({ queryKey: ["oc-itens", ocId], queryFn: () => lerOcItens(ocId) });
  const recebimentos = useQuery({
    queryKey: ["oc-recebimentos", ocId],
    queryFn: () => lerRecebimentos(ocId),
  });
  const motivos = useQuery({
    queryKey: ["motivos", "cancelamento"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_motivos")
        .select("id, descricao")
        .eq("contexto", "cancelamento")
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; descricao: string }>;
    },
  });
  const empresa = useQuery({
    queryKey: ["definicoes-empresa"],
    queryFn: async () => {
      const { data, error } = await erp().from("v_definicoes").select("chave, valor");
      if (error) throw error;
      const mapa: Record<string, string> = {};
      for (const linha of (data ?? []) as Array<{ chave: string; valor: string }>) {
        mapa[linha.chave] = linha.valor;
      }
      return mapa;
    },
  });

  const invalidar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["oc", ocId] }),
      queryClient.invalidateQueries({ queryKey: ["oc-itens", ocId] }),
      queryClient.invalidateQueries({ queryKey: ["oc-recebimentos", ocId] }),
      queryClient.invalidateQueries({ queryKey: ["ordens-compra"] }),
      queryClient.invalidateQueries({ queryKey: ["necessidades-abertas"] }),
    ]);
  };

  const finalizar = useMutation({
    mutationFn: () => finalizarOc(ocId),
    onSuccess: async (resultado) => {
      await invalidar();
      toast.success(`Ordem ${resultado.numero} pronta a enviar.`);
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const marcarEnviada = useMutation({
    mutationFn: (para: string | null) => registarEnvioOc({ oc_id: ocId, para }),
    onSuccess: async () => {
      await invalidar();
      toast.success("Envio registado.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const registarFalha = useMutation({
    mutationFn: () =>
      registarEnvioOc({ oc_id: ocId, erro: "Envio manual não concluído pelo utilizador." }),
    onSuccess: async () => {
      await invalidar();
      toast.error("Falha de envio registada. Pode tentar outra vez.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const confirmarEta = useMutation({
    mutationFn: () => confirmarEtaOc(ocId, eta),
    onSuccess: async () => {
      await invalidar();
      toast.success("Data do fornecedor confirmada.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const guardarCabecalho = useMutation({
    mutationFn: (campos: Record<string, unknown>) => guardarOc(ocId, campos),
    onSuccess: invalidar,
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const guardarLinha = useMutation({
    mutationFn: ({ id, campos }: { id: string; campos: Record<string, unknown> }) =>
      guardarOcItem(id, campos),
    onSuccess: invalidar,
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const receber = useMutation({
    mutationFn: async () => {
      const linhas = Object.entries(quantidades)
        .map(([item_id, valor]) => ({ item_id, quantidade: Number(valor.replace(",", ".")) }))
        .filter((l) => l.quantidade > 0);
      if (linhas.length === 0) throw new Error("Indique as quantidades recebidas.");
      return receberOc({ oc_id: ocId, linhas, doc: docFornecedor || null });
    },
    onSuccess: async (resultado) => {
      setAReceber(false);
      setQuantidades({});
      setDocFornecedor("");
      await invalidar();
      toast.success(`Recebidas ${resultado.unidades} unidades.`);
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const cancelar = useMutation({
    mutationFn: () => cancelarOc(ocId, motivoId, notaCancelamento || undefined),
    onSuccess: async () => {
      setACancelar(false);
      await invalidar();
      toast.success("Ordem de compra cancelada.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const email = useMemo(() => {
    if (!oc.data || !itens.data) return null;
    return composerEmailOc(oc.data, itens.data, {
      nome: empresa.data?.["empresa_nome"],
      morada: empresa.data?.["empresa_morada"],
      nif: empresa.data?.["empresa_nif"],
      telefone: empresa.data?.["empresa_telefone"],
      email: empresa.data?.["empresa_email"],
    });
  }, [oc.data, itens.data, empresa.data]);

  if (oc.isPending || itens.isPending) {
    return <Skeleton className="h-72 w-full rounded-lg" />;
  }
  if (oc.isError || !oc.data) {
    return <p className="text-sm text-muted-foreground">Não foi possível abrir esta ordem.</p>;
  }

  const dados = oc.data;
  const linhas = itens.data ?? [];
  const rascunho = dados.estado === "rascunho";
  const podeEnviar = dados.estado === "pronta_enviar" || Boolean(dados.envio_erro);
  const podeReceber = ["enviada", "confirmada", "recebida_parcial"].includes(dados.estado);
  const emFalta = linhas.filter((i) => Number(i.em_falta) > 0);

  return (
    <div className="print:px-0">
      <div className="mb-3 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/ordens-compra">
            <ArrowLeft className="mr-2 h-4 w-4" /> Ordens de compra
          </Link>
        </Button>
      </div>

      <CabecalhoPagina
        titulo={`${dados.numero} · ${dados.fornecedor_nome}`}
        descricao={`Emitida a ${formatarData(dados.data_emissao)}`}
        acao={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Badge variant="secondary">{ETIQUETA_OC[dados.estado]}</Badge>
            {dados.atrasada && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Atrasada
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir
            </Button>
          </div>
        }
      />

      {dados.envio_erro && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">O envio ao fornecedor não foi concluído.</p>
          <p className="mt-1 text-muted-foreground">
            {dados.envio_erro} · {dados.envio_tentativas} tentativa(s). Envie o email e volte a
            marcar como enviada.
          </p>
        </div>
      )}

      <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Caixa titulo="Total" valor={formatarDinheiro(dados.total)} />
        <Caixa
          titulo="Data prevista"
          valor={formatarData(dados.data_confirmada_fornecedor ?? dados.data_prevista) || "—"}
        />
        <Caixa
          titulo="Enviada"
          valor={
            dados.enviada_em ? `${formatarData(dados.enviada_em)} · ${dados.enviada_para ?? ""}` : "—"
          }
        />
      </section>

      <section className="mb-4 overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-muted-foreground">Artigo</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qtd</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Custo</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
              <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell">
                Em falta
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2">
                  <p className="font-medium">{i.descricao}</p>
                  {i.pedido_numero && (
                    <p className="text-xs text-muted-foreground">
                      Para {i.cliente_nome ?? "cliente"} · {i.pedido_numero}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {rascunho && comprar ? (
                    <Input
                      className="ml-auto h-8 w-20 text-right"
                      inputMode="decimal"
                      aria-label={`Quantidade de ${i.descricao}`}
                      defaultValue={String(i.quantidade)}
                      onBlur={(e) =>
                        guardarLinha.mutate({
                          id: i.id,
                          campos: { quantidade: Number(e.target.value.replace(",", ".")) },
                        })
                      }
                    />
                  ) : (
                    i.quantidade
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {rascunho && comprar ? (
                    <Input
                      className="ml-auto h-8 w-24 text-right"
                      inputMode="decimal"
                      aria-label={`Custo de ${i.descricao}`}
                      defaultValue={String(i.custo_unitario)}
                      onBlur={(e) =>
                        guardarLinha.mutate({
                          id: i.id,
                          campos: { custo_unitario: Number(e.target.value.replace(",", ".")) },
                        })
                      }
                    />
                  ) : (
                    formatarDinheiro(i.custo_unitario)
                  )}
                </td>
                <td className="px-3 py-2 text-right">{formatarDinheiro(i.total_linha)}</td>
                <td className="hidden px-3 py-2 text-right md:table-cell">{i.em_falta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {comprar && (
        <section className="mb-4 space-y-3 rounded-lg border bg-card p-4 print:hidden">
          <h2 className="text-sm font-medium">Ações</h2>

          {rascunho && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="obs-oc">Observações para o fornecedor</Label>
                <Textarea
                  id="obs-oc"
                  defaultValue={dados.observacoes ?? ""}
                  onBlur={(e) => guardarCabecalho.mutate({ observacoes: e.target.value || null })}
                />
              </div>
              <Button onClick={() => finalizar.mutate()} disabled={finalizar.isPending}>
                <PackageCheck className="mr-2 h-4 w-4" /> Finalizar ordem
              </Button>
            </div>
          )}

          {podeEnviar && email && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const destino = dados.fornecedor_email ?? "";
                  window.location.href = `mailto:${destino}?subject=${encodeURIComponent(email.assunto)}&body=${encodeURIComponent(email.corpo)}`;
                }}
              >
                <Mail className="mr-2 h-4 w-4" /> Abrir email
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(`${email.assunto}\n\n${email.corpo}`);
                  toast.success("Texto do email copiado.");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar texto
              </Button>
              <Button
                onClick={() => marcarEnviada.mutate(dados.fornecedor_email ?? null)}
                disabled={marcarEnviada.isPending}
              >
                <Send className="mr-2 h-4 w-4" /> Marcar como enviada
              </Button>
              <Button
                variant="outline"
                onClick={() => registarFalha.mutate()}
                disabled={registarFalha.isPending}
              >
                Registar falha de envio
              </Button>
            </div>
          )}

          {(dados.estado === "enviada" || dados.estado === "confirmada") && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-2">
                <Label htmlFor="eta">Data confirmada pelo fornecedor</Label>
                <Input id="eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
              </div>
              <Button
                variant="outline"
                disabled={!eta || confirmarEta.isPending}
                onClick={() => confirmarEta.mutate()}
              >
                <CalendarCheck className="mr-2 h-4 w-4" /> Confirmar data
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {podeReceber && emFalta.length > 0 && (
              <Button onClick={() => setAReceber(true)}>
                <PackageCheck className="mr-2 h-4 w-4" /> Receber mercadoria
              </Button>
            )}
            {dados.estado !== "cancelada" && dados.estado !== "recebida" && (
              <Button variant="outline" onClick={() => setACancelar(true)}>
                <XCircle className="mr-2 h-4 w-4" /> Cancelar ordem
              </Button>
            )}
          </div>
        </section>
      )}

      {(recebimentos.data ?? []).length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-medium">Receções</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {(recebimentos.data ?? []).map((r) => (
              <li key={r.id}>
                {formatarData(r.data)} · {r.unidades} un.
                {r.doc_fornecedor ? ` · ${r.doc_fornecedor}` : ""}
                {r.registado_por_nome ? ` · ${r.registado_por_nome}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <DialogoForm
        aberto={aReceber}
        onFechar={() => setAReceber(false)}
        titulo="Receber mercadoria"
        descricao="Indique quantas unidades chegaram de cada artigo."
        aGuardar={receber.isPending}
        onGuardar={() => receber.mutate()}
      >
        {emFalta.map((i) => (
          <div key={i.id} className="space-y-2">
            <Label htmlFor={`rec-${i.id}`}>
              {i.descricao} — faltam {i.em_falta}
            </Label>
            <Input
              id={`rec-${i.id}`}
              inputMode="decimal"
              value={quantidades[i.id] ?? ""}
              placeholder="0"
              onChange={(e) =>
                setQuantidades((atual) => ({ ...atual, [i.id]: e.target.value }))
              }
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="doc-rec">Guia ou fatura do fornecedor</Label>
          <Input
            id="doc-rec"
            value={docFornecedor}
            onChange={(e) => setDocFornecedor(e.target.value)}
          />
        </div>
      </DialogoForm>

      <DialogoForm
        aberto={aCancelar}
        onFechar={() => setACancelar(false)}
        titulo="Cancelar ordem de compra"
        descricao="As necessidades voltam a ficar abertas."
        aGuardar={cancelar.isPending}
        onGuardar={() => cancelar.mutate()}
      >
        <div className="space-y-2">
          <Label>Motivo</Label>
          <Select value={motivoId} onValueChange={setMotivoId}>
            <SelectTrigger aria-label="Motivo do cancelamento">
              <SelectValue placeholder="Escolha o motivo" />
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
        <div className="space-y-2">
          <Label htmlFor="nota-cancel">Nota</Label>
          <Textarea
            id="nota-cancel"
            value={notaCancelamento}
            onChange={(e) => setNotaCancelamento(e.target.value)}
          />
        </div>
      </DialogoForm>
    </div>
  );
}

function Caixa({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-sm font-medium">{valor}</p>
    </div>
  );
}
