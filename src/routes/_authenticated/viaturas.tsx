import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import { eliminarViatura, guardarViatura, lerViaturas } from "@/lib/erp/rotas";
import type { Viatura } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/viaturas")({
  head: () => ({
    meta: [
      { title: "Viaturas de entrega — UP Vendas" },
      {
        name: "description",
        content:
          "Registo das viaturas da UP Móveis: cubicagem, peso máximo e consumo, para planear a carga de cada rota.",
      },
      { property: "og:title", content: "Viaturas de entrega — UP Vendas" },
      {
        property: "og:description",
        content: "Cubicagem e peso máximo de cada carrinha, usados no planeamento das rotas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const perms = usePermissoes();
  const [aEditar, setAEditar] = useState<Viatura | null>(null);
  const [nova, setNova] = useState(false);
  const clientQuery = useQueryClient();

  const viaturasQ = useQuery({
    queryKey: ["viaturas", "todas"],
    queryFn: () => lerViaturas({ incluirInativas: true }),
  });

  const apagar = useMutation({
    mutationFn: (v: Viatura) => eliminarViatura(v.id, "Viatura retirada da frota"),
    onSuccess: () => {
      toast.success("Viatura retirada da frota.");
      clientQuery.invalidateQueries({ queryKey: ["viaturas"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const viaturas = viaturasQ.data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Viaturas"
        descricao="A cubicagem e o peso máximo de cada viatura servem para avisar quando a rota já não cabe no carro."
        acao={
          perms.montarRotas ? (
            <Button onClick={() => setNova(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova viatura
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        {viaturas.map((v) => (
          <Card key={v.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium">
                  <Truck className="h-4 w-4 text-primary" /> {v.nome}
                  {!v.ativa && <Badge variant="outline">Inativa</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {v.matricula ?? "sem matrícula"} · {Number(v.cubicagem_m3).toFixed(2)} m³
                  {v.peso_max_kg ? ` · até ${Number(v.peso_max_kg).toFixed(0)} kg` : ""}
                  {v.consumo_l_100km ? ` · ${Number(v.consumo_l_100km).toFixed(1)} l/100 km` : ""}
                </p>
              </div>
              {perms.montarRotas && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAEditar(v)}>
                    <Pencil className="mr-1 h-4 w-4" /> Editar
                  </Button>
                  {v.ativa && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => apagar.mutate(v)}
                      disabled={apagar.isPending}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Retirar
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!viaturasQ.isLoading && viaturas.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Truck className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Ainda não há viaturas</p>
              <p className="text-sm text-muted-foreground">
                Registe as carrinhas para o planeamento poder avisar quando a carga não cabe.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {(nova || aEditar) && (
        <DialogoViatura
          viatura={aEditar}
          onFechar={() => {
            setNova(false);
            setAEditar(null);
          }}
        />
      )}
    </div>
  );
}

function DialogoViatura({
  viatura,
  onFechar,
}: {
  viatura: Viatura | null;
  onFechar: () => void;
}) {
  const clientQuery = useQueryClient();
  const [nome, setNome] = useState(viatura?.nome ?? "");
  const [matricula, setMatricula] = useState(viatura?.matricula ?? "");
  const [cubicagem, setCubicagem] = useState(String(viatura?.cubicagem_m3 ?? ""));
  const [peso, setPeso] = useState(viatura?.peso_max_kg ? String(viatura.peso_max_kg) : "");
  const [consumo, setConsumo] = useState(
    viatura?.consumo_l_100km ? String(viatura.consumo_l_100km) : "",
  );
  const [observacoes, setObservacoes] = useState(viatura?.observacoes ?? "");
  const [ativa, setAtiva] = useState(viatura?.ativa ?? true);

  const guardar = useMutation({
    mutationFn: () =>
      guardarViatura(
        {
          nome,
          matricula,
          cubicagem_m3: Number(cubicagem),
          peso_max_kg: peso ? Number(peso) : null,
          consumo_l_100km: consumo ? Number(consumo) : null,
          observacoes,
          ativa,
        },
        viatura?.id,
      ),
    onSuccess: () => {
      toast.success("Viatura guardada.");
      clientQuery.invalidateQueries({ queryKey: ["viaturas"] });
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={viatura ? "Editar viatura" : "Nova viatura"}
      descricao="A cubicagem é obrigatória; é ela que diz quando a carga já não cabe."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!nome.trim()) {
          toast.error("Dê um nome à viatura.");
          return;
        }
        if (!cubicagem || Number(cubicagem) <= 0) {
          toast.error("Indique a cubicagem em metros cúbicos.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="v-nome">Nome</Label>
          <Input id="v-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="v-matricula">Matrícula</Label>
          <Input
            id="v-matricula"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="v-cub">Cubicagem (m³)</Label>
          <Input
            id="v-cub"
            type="number"
            step="0.01"
            min={0}
            value={cubicagem}
            onChange={(e) => setCubicagem(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="v-peso">Peso máximo (kg)</Label>
          <Input
            id="v-peso"
            type="number"
            step="1"
            min={0}
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="v-consumo">Consumo (l/100 km)</Label>
          <Input
            id="v-consumo"
            type="number"
            step="0.1"
            min={0}
            value={consumo}
            onChange={(e) => setConsumo(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch id="v-ativa" checked={ativa} onCheckedChange={setAtiva} />
          <Label htmlFor="v-ativa">Viatura ativa</Label>
        </div>
      </div>
      <div>
        <Label htmlFor="v-obs">Observações</Label>
        <Textarea
          id="v-obs"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </div>
    </DialogoForm>
  );
}
