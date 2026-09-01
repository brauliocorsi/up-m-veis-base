import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Workflow } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { guardarEtapa, lerEtapas } from "@/lib/erp/producao";
import type { EtapaProducao } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/etapas-producao")({
  head: () => ({
    meta: [
      { title: "Etapas de produção — UP Vendas" },
      {
        name: "description",
        content:
          "A sequência do fabrico da UP Móveis: corte, costura, estrutura, branco, estofagem, qualidade e embalagem.",
      },
      { property: "og:title", content: "Etapas de produção — UP Vendas" },
      {
        property: "og:description",
        content: "Configure a ordem das etapas, o stock intermédio e a conferência obrigatória.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { gerirProducao } = usePermissoes();
  const [aEditar, setAEditar] = useState<EtapaProducao | null>(null);
  const [aCriar, setACriar] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["etapas-producao", "todas"],
    queryFn: () => lerEtapas(true),
  });

  const etapas = data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Etapas de produção"
        descricao="A ordem manda: cada ordem de produção percorre estas etapas de cima para baixo."
        acao={
          gerirProducao ? (
            <Button onClick={() => setACriar(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova etapa
            </Button>
          ) : undefined
        }
      />

      {isPending && <Skeleton className="h-48 w-full rounded-lg" />}

      <div className="space-y-3">
        {etapas.map((etapa) => (
          <Card key={etapa.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Workflow className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">{etapa.ordem}.</span> {etapa.nome}
                  <Badge variant="secondary">{etapa.codigo}</Badge>
                  {!etapa.ativo && <Badge variant="outline">inativa</Badge>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {etapa.permite_stock_intermedio ? "guarda stock intermédio" : "sem stock intermédio"}
                  {" · "}
                  {etapa.exige_conferencia ? "exige conferência" : "sem conferência"}
                </p>
              </div>
              {gerirProducao && (
                <Button variant="outline" size="sm" onClick={() => setAEditar(etapa)}>
                  Editar
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {(aCriar || aEditar) && (
        <DialogoEtapa
          etapa={aEditar}
          proximaOrdem={etapas.length + 1}
          onFechar={() => {
            setACriar(false);
            setAEditar(null);
          }}
        />
      )}
    </div>
  );
}

function DialogoEtapa({
  etapa,
  proximaOrdem,
  onFechar,
}: {
  etapa: EtapaProducao | null;
  proximaOrdem: number;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState(etapa?.codigo ?? "");
  const [nome, setNome] = useState(etapa?.nome ?? "");
  const [ordem, setOrdem] = useState(String(etapa?.ordem ?? proximaOrdem));
  const [stockIntermedio, setStockIntermedio] = useState(etapa?.permite_stock_intermedio ?? false);
  const [conferencia, setConferencia] = useState(etapa?.exige_conferencia ?? false);
  const [ativo, setAtivo] = useState(etapa?.ativo ?? true);

  const guardar = useMutation({
    mutationFn: () =>
      guardarEtapa(
        {
          codigo,
          nome,
          ordem: Number(ordem) || proximaOrdem,
          permite_stock_intermedio: stockIntermedio,
          exige_conferencia: conferencia,
          ativo,
        },
        etapa?.id,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["etapas-producao"] });
      toast.success("Etapa guardada.");
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={etapa ? "Editar etapa" : "Nova etapa"}
      descricao="O código serve para o sistema; o nome é o que a fábrica vê."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (codigo.trim().length < 2 || nome.trim().length < 2) {
          toast.error("Indique o código e o nome da etapa.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="et-codigo">Código</Label>
          <Input
            id="et-codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <Label htmlFor="et-ordem">Ordem</Label>
          <Input
            id="et-ordem"
            type="number"
            min={1}
            inputMode="numeric"
            value={ordem}
            onChange={(e) => setOrdem(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="et-nome">Nome</Label>
        <Input id="et-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor="et-stock">Guarda stock intermédio</Label>
        <Switch id="et-stock" checked={stockIntermedio} onCheckedChange={setStockIntermedio} />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor="et-conf">Exige conferência</Label>
        <Switch id="et-conf" checked={conferencia} onCheckedChange={setConferencia} />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor="et-ativo">Ativa</Label>
        <Switch id="et-ativo" checked={ativo} onCheckedChange={setAtivo} />
      </div>
    </DialogoForm>
  );
}
