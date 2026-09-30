import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@tanstack/react-start";
import { erp, mensagemErro } from "@/lib/erp/db";
import { enviarFilaFabrica, estadoIntegracaoFabrica } from "@/lib/erp/fabrica.functions";

export const Route = createFileRoute("/_authenticated/encomendas-fabrica")({
  head: () => ({
    meta: [
      { title: "Encomendas à fábrica — UP Vendas" },
      { name: "description", content: "O que cada venda pede ao UP Fábrica: descrição, quantidade, data e estado." },
      { property: "og:title", content: "Encomendas à fábrica — UP Vendas" },
      { property: "og:description", content: "Lista simples de fabrico por venda e linha, sem agrupar personalizações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

interface Encomenda {
  id: string;
  pedido_id: string;
  pedido_numero: string | null;
  cliente_nome: string | null;
  produto_nome: string | null;
  produto_codigo: string | null;
  descricao: string | null;
  nota: string | null;
  quantidade_fabricar: number;
  data_necessaria: string | null;
  estado_necessidade: string;
  estado_envio: string | null;
  ultimo_erro: string | null;
  unidades_aceites: number;
  unidades_produzidas: number;
  unidades_recebidas: number;
  ordens_externas: string | null;
}

const ENVIO: Record<string, string> = {
  em_fila: "Em fila (ainda não enviada)",
  a_enviar: "A enviar",
  incerto: "Envio por confirmar",
  erro: "Erro no envio",
  aceite: "Aceite pela fábrica",
  bloqueado_pagamento: "Bloqueada: transferência por confirmar",
  cancelado: "Cancelada",
};

function Pagina() {
  const qc = useQueryClient();
  const lerEstado = useServerFn(estadoIntegracaoFabrica);
  const enviar = useServerFn(enviarFilaFabrica);
  const estado = useQuery({ queryKey: ["fabrica-estado"], queryFn: () => lerEstado() });
  const { data, isPending } = useQuery({
    queryKey: ["encomendas-fabrica"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_encomendas_fabrica")
        .select("*")
        .neq("estado_necessidade", "cancelada")
        .order("data_necessaria", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Encomenda[];
    },
  });
  const envio = useMutation({
    mutationFn: () => enviar({ data: { testMode: false } }),
    onSuccess: (r) => {
      toast.success(`Aceites: ${r.aceites} · por confirmar: ${r.incertos} · erros: ${r.erros}`);
      qc.invalidateQueries({ queryKey: ["encomendas-fabrica"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const est = estado.data;
  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Encomendas à fábrica"
        descricao="O fabrico é feito no UP Fábrica. Aqui vê o que cada venda pediu e em que ponto está."
      />

      <div className="rounded-lg border p-3 text-sm">
        {!est ? (
          <Skeleton className="h-5 w-64" />
        ) : !est.configurada ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Ligação ao UP Fábrica não configurada. Nada é
            enviado.
          </p>
        ) : !est.ativa ? (
          <div className="space-y-1">
            <p className="font-medium">Ligação configurada mas desligada.</p>
            {est.bloqueios.map((b) => (
              <p key={b} className="text-muted-foreground">
                • {b}
              </p>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p>Ligação ao UP Fábrica ativa.</p>
            <Button size="sm" onClick={() => envio.mutate()} disabled={envio.isPending}>
              <Send className="mr-1 h-4 w-4" /> Enviar fila
            </Button>
          </div>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Não há encomendas à fábrica.</p>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((e) => (
            <div key={e.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  to="/pedidos/$pedidoId"
                  params={{ pedidoId: e.pedido_id }}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {e.pedido_numero ?? "Venda"} · {e.cliente_nome ?? "—"}
                </Link>
                <span className="text-muted-foreground">
                  {e.data_necessaria ? new Date(e.data_necessaria).toLocaleDateString("pt-PT") : "sem data"}
                </span>
              </div>
              <p className="mt-1 font-medium">
                {e.quantidade_fabricar} × {e.produto_nome}
                {e.produto_codigo ? ` (${e.produto_codigo})` : ""}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {[e.descricao, e.nota].filter(Boolean).join("\n")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">
                  Envio: {e.estado_envio ? (ENVIO[e.estado_envio] ?? e.estado_envio) : "Não enviada (ligação desligada)"}
                </Badge>
                <Badge variant="outline">
                  Produzidas {e.unidades_produzidas}/{e.quantidade_fabricar}
                </Badge>
                <Badge variant="outline">
                  Recebidas no armazém {e.unidades_recebidas}/{e.quantidade_fabricar}
                </Badge>
                {e.ordens_externas && <Badge variant="secondary">UP Fábrica: {e.ordens_externas}</Badge>}
              </div>
              {e.ultimo_erro && <p className="mt-1 text-xs text-destructive">{e.ultimo_erro}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
