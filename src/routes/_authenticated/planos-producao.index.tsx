import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CalendarRange, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { criarPlano, lerPlanos } from "@/lib/erp/mrp";
import { ETIQUETA_ESTADO_PLANO } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/planos-producao/")({
  head: () => ({
    meta: [
      { title: "Planos de produção — UP Vendas" },
      {
        name: "description",
        content:
          "Planeamento semanal da fábrica da UP Móveis: junte as necessidades, simule a carga dos centros e aprove.",
      },
      { property: "og:title", content: "Planos de produção — UP Vendas" },
      {
        property: "og:description",
        content: "Simular não mexe em nada. Só a aprovação cria ordens de fabrico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function proximaSemana() {
  const hoje = new Date();
  const dia = hoje.getDay();
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() + ((8 - dia) % 7 || 7));
  const sabado = new Date(segunda);
  sabado.setDate(segunda.getDate() + 5);
  return {
    inicio: segunda.toISOString().slice(0, 10),
    fim: sabado.toISOString().slice(0, 10),
  };
}

function data(valor: string | null) {
  return valor ? new Date(valor).toLocaleDateString("pt-PT") : "—";
}

function Pagina() {
  const { gerirProducao } = usePermissoes();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [aCriar, setACriar] = useState(false);

  const { data: planos, isPending } = useQuery({ queryKey: ["planos"], queryFn: lerPlanos });

  const lista = planos ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Planos de produção"
        descricao="Um plano é uma semana de fábrica: o que se faz, quanto, e se cabe na capacidade dos centros."
        acao={
          gerirProducao ? (
            <Button onClick={() => setACriar(true)}>
              <Plus className="mr-2 h-4 w-4" /> Novo plano
            </Button>
          ) : undefined
        }
      />

      {isPending && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {lista.map((plano) => (
          <Card key={plano.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  <Link
                    to="/planos-producao/$planoId"
                    params={{ planoId: plano.id }}
                    className="underline-offset-2 hover:underline"
                  >
                    {plano.nome}
                  </Link>
                  <Badge variant="secondary">{ETIQUETA_ESTADO_PLANO[plano.estado]}</Badge>
                  {plano.viavel === false && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> não cabe
                    </Badge>
                  )}
                  {plano.forcado && <Badge variant="outline">aprovado à força</Badge>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data(plano.data_inicio)} a {data(plano.data_fim)} · {plano.dias_uteis} dias úteis ·{" "}
                  {plano.linhas} linha{plano.linhas === 1 ? "" : "s"} · {plano.unidades} un.
                  {plano.centros_em_excesso > 0
                    ? ` · ${plano.centros_em_excesso} centro(s) acima da capacidade`
                    : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/planos-producao/$planoId" params={{ planoId: plano.id }}>
                  Abrir
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}

        {!isPending && lista.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <CalendarRange className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Ainda não há planos</p>
              <p className="text-sm text-muted-foreground">
                Crie o plano da próxima semana e junte as necessidades das vendas.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {aCriar && (
        <DialogoPlano
          onFechar={() => setACriar(false)}
          onCriado={async (id) => {
            await queryClient.invalidateQueries({ queryKey: ["planos"] });
            navigate({ to: "/planos-producao/$planoId", params: { planoId: id } });
          }}
        />
      )}
    </div>
  );
}

function DialogoPlano({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: (id: string) => void;
}) {
  const semana = proximaSemana();
  const [nome, setNome] = useState(`Semana de ${data(semana.inicio)}`);
  const [inicio, setInicio] = useState(semana.inicio);
  const [fim, setFim] = useState(semana.fim);
  const [notas, setNotas] = useState("");

  const guardar = useMutation({
    mutationFn: () => criarPlano({ nome, data_inicio: inicio, data_fim: fim, notas }),
    onSuccess: (id) => {
      toast.success("Plano criado.");
      onCriado(id);
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo="Novo plano de produção"
      descricao="Escolha o período. Depois junta-se o que está por fabricar e simula-se."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!nome.trim() || !inicio || !fim) {
          toast.error("Preencha o nome e as datas.");
          return;
        }
        if (fim < inicio) {
          toast.error("A data de fim é antes do início.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div>
        <Label htmlFor="pl-nome">Nome</Label>
        <Input id="pl-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pl-inicio">Início</Label>
          <Input
            id="pl-inicio"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="pl-fim">Fim</Label>
          <Input id="pl-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="pl-notas">Notas</Label>
        <Textarea id="pl-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </DialogoForm>
  );
}
