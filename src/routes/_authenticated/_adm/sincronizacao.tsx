import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock, Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  aplicarInventario,
  estadoLigacaoContagem,
  preverInventario,
  sincronizarAgora,
} from "@/lib/erp/contagem.functions";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { formatarData, type SyncEstado, type SyncPendente } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/sincronizacao")({
  head: () => ({
    meta: [
      { title: "Sincronização com o armazém — UP Vendas" },
      {
        name: "description",
        content:
          "Estado da ligação ao Contagem, inventário inicial e movimentos que ficaram pendentes na UP Móveis.",
      },
      { property: "og:title", content: "Sincronização com o armazém — UP Vendas" },
      { property: "og:description", content: "Ligação entre o ERP e o armazém físico." },
    ],
  }),
  component: PaginaSincronizacao,
});

const APARENCIA = {
  ok: { icone: CheckCircle2, cor: "text-emerald-600", texto: "Sincronizado" },
  atrasado: { icone: Clock, cor: "text-amber-600", texto: "Atrasado" },
  erro: { icone: AlertTriangle, cor: "text-destructive", texto: "Com erro" },
} as const;

function PaginaSincronizacao() {
  const queryClient = useQueryClient();
  const fnSincronizar = useServerFn(sincronizarAgora);
  const fnPrever = useServerFn(preverInventario);
  const fnAplicar = useServerFn(aplicarInventario);
  const fnLigacao = useServerFn(estadoLigacaoContagem);

  const [dialogo, setDialogo] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [previsao, setPrevisao] = useState<{ produtos: number; unidades: number } | null>(null);

  const { data: ligacao } = useQuery({
    queryKey: ["contagem-ligacao"],
    queryFn: () => fnLigacao({}),
  });

  const { data: estado, isPending } = useQuery({
    queryKey: ["sync-estado"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await erp()
        .from("v_sync_estado")
        .select("*")
        .eq("fonte", "contagem")
        .maybeSingle();
      return (data ?? null) as SyncEstado | null;
    },
  });

  const { data: pendentes } = useQuery({
    queryKey: ["sync-pendentes"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("sync_pendentes")
        .select("*")
        .is("resolvido_em", null)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as SyncPendente[];
    },
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["sync-estado"] });
    queryClient.invalidateQueries({ queryKey: ["sync-pendentes"] });
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    queryClient.invalidateQueries({ queryKey: ["movimentos"] });
  };

  const mSincronizar = useMutation({
    mutationFn: () => fnSincronizar({}),
    onSuccess: (r) => {
      toast.success(
        `Sincronização concluída: ${r.processados} movimento(s) novos, ${r.ignorados} repetido(s).`,
      );
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mPrever = useMutation({
    mutationFn: () => fnPrever({}),
    onSuccess: (r) => {
      setPrevisao({ produtos: r.produtos, unidades: r.unidades });
      setConfirmacao("");
      setDialogo(true);
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mAplicar = useMutation({
    mutationFn: () => fnAplicar({ data: { confirmacao } }),
    onSuccess: () => {
      toast.success("Inventário inicial aplicado. A sincronização já pode correr.");
      setDialogo(false);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  if (isPending) return <Skeleton className="h-56 w-full" />;

  const chave = (estado?.estado_calculado ?? estado?.estado ?? "ok") as keyof typeof APARENCIA;
  const { icone: Icone, cor, texto } = APARENCIA[chave] ?? APARENCIA.ok;
  const inventarioFeito = Boolean(estado?.inventario_inicial_em);

  return (
    <div>
      <CabecalhoPagina
        titulo="Sincronização com o armazém"
        descricao="O ERP lê os movimentos do Contagem e escreve-os no seu próprio livro. Nunca copia números."
        acao={
          <Button
            type="button"
            onClick={() => mSincronizar.mutate()}
            disabled={mSincronizar.isPending || !inventarioFeito}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {mSincronizar.isPending ? "A sincronizar…" : "Sincronizar agora"}
          </Button>
        }
      />

      {!ligacao?.configurado && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          A ligação ao Contagem ainda não tem endereço e chave configurados. Sem isso a
          sincronização e o inventário inicial não conseguem correr.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado</p>
          <p className={`mt-1 flex items-center gap-2 text-lg font-semibold ${cor}`}>
            <Icone className="h-5 w-5" /> {texto}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Última com sucesso</p>
          <p className="mt-1 text-sm font-medium">{formatarData(estado?.ultima_sync_ok)}</p>
          <p className="text-xs text-muted-foreground">
            Tentativa: {formatarData(estado?.ultima_tentativa)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Movimentos processados
          </p>
          <p className="mt-1 text-lg font-semibold">{estado?.movimentos_processados ?? 0}</p>
          <p className="text-xs text-muted-foreground">Marcador: {estado?.cursor ?? "—"}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Inventário inicial</p>
          {inventarioFeito ? (
            <p className="mt-1 text-sm font-medium">
              {formatarData(estado?.inventario_inicial_em)}
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => mPrever.mutate()}
              disabled={mPrever.isPending || !ligacao?.configurado}
            >
              <Download className="mr-2 h-4 w-4" />
              {mPrever.isPending ? "A ler o armazém…" : "Importar do Contagem"}
            </Button>
          )}
        </div>
      </div>

      {estado?.erro && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Último erro</p>
          <p className="mt-1 text-muted-foreground">{estado.erro}</p>
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Movimentos pendentes</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Movimentos que o Contagem enviou mas o ERP não conseguiu aceitar — normalmente por o
          produto não existir aqui. Depois de corrigir o catálogo, sincronize outra vez.
        </p>
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">Quando</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Problema</th>
                <th className="hidden px-3 py-2 font-medium text-muted-foreground md:table-cell">
                  Conteúdo
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tentativas</th>
              </tr>
            </thead>
            <tbody>
              {(pendentes ?? []).length === 0 && (
                <tr className="border-t">
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Nada pendente. Tudo o que o armazém enviou entrou no livro.
                  </td>
                </tr>
              )}
              {(pendentes ?? []).map((linha) => (
                <tr key={linha.id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">{formatarData(linha.criado_em)}</td>
                  <td className="px-3 py-2">{linha.erro ?? "—"}</td>
                  <td className="hidden max-w-md truncate px-3 py-2 text-xs text-muted-foreground md:table-cell">
                    {JSON.stringify(linha.payload)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Badge variant="outline">{linha.tentativas}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DialogoForm
        aberto={dialogo}
        onFechar={() => setDialogo(false)}
        titulo="Aplicar inventário inicial"
        descricao="Esta operação só pode ser feita uma vez e cria os movimentos de arranque do stock."
        aGuardar={mAplicar.isPending}
        onGuardar={() => mAplicar.mutate()}
      >
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          O Contagem indica <strong>{previsao?.produtos ?? 0}</strong> produto(s) e{" "}
          <strong>{previsao?.unidades ?? 0}</strong> unidade(s) em armazém.
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmacao">
            Escreva <strong>APLICAR</strong> para confirmar
          </Label>
          <Input
            id="confirmacao"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            placeholder="APLICAR"
          />
        </div>
      </DialogoForm>
    </div>
  );
}
