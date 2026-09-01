import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Factory, Plus, UserPlus, X } from "lucide-react";
import { useState } from "react";
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
import { usePermissoes } from "@/hooks/use-permissoes";
import { mensagemErro } from "@/lib/erp/db";
import {
  atribuirOperador,
  gravarCentro,
  lerCentros,
  lerOperadoresCentro,
  ligarEtapaCentro,
  retirarOperador,
  utilizadoresAtivos,
} from "@/lib/erp/mrp";
import { lerEtapas } from "@/lib/erp/producao";
import type { CentroTrabalho } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/centros-trabalho")({
  head: () => ({
    meta: [
      { title: "Centros de trabalho — UP Vendas" },
      {
        name: "description",
        content:
          "Capacidade da fábrica da UP Móveis: minutos por dia, postos, eficiência e operadores de cada centro.",
      },
      { property: "og:title", content: "Centros de trabalho — UP Vendas" },
      {
        property: "og:description",
        content: "Sem capacidade declarada não há simulação de plano que valha.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { gerirProducao } = usePermissoes();
  const queryClient = useQueryClient();
  const [aEditar, setAEditar] = useState<CentroTrabalho | null>(null);
  const [aCriar, setACriar] = useState(false);
  const [aAtribuir, setAAtribuir] = useState<CentroTrabalho | null>(null);

  const centrosQ = useQuery({ queryKey: ["centros-trabalho"], queryFn: () => lerCentros(true) });
  const operadoresQ = useQuery({
    queryKey: ["centro-operadores"],
    queryFn: () => lerOperadoresCentro(),
  });
  const etapasQ = useQuery({ queryKey: ["etapas-producao"], queryFn: () => lerEtapas(true) });

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["centros-trabalho"] });
    queryClient.invalidateQueries({ queryKey: ["centro-operadores"] });
    queryClient.invalidateQueries({ queryKey: ["etapas-producao"] });
  }

  const retirar = useMutation({
    mutationFn: (id: string) => retirarOperador(id),
    onSuccess: () => {
      toast.success("Operador retirado do centro.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const ligar = useMutation({
    mutationFn: (p: { etapaId: string; centroId: string | null }) =>
      ligarEtapaCentro(p.etapaId, p.centroId),
    onSuccess: () => {
      toast.success("Etapa ligada ao centro.");
      recarregar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const centros = centrosQ.data ?? [];
  const operadores = operadoresQ.data ?? [];
  const etapas = etapasQ.data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Centros de trabalho"
        descricao="A capacidade de cada centro: com operadores atribuídos vale a soma dos minutos deles; sem eles, minutos por dia × postos."
        acao={
          gerirProducao ? (
            <Button onClick={() => setACriar(true)}>
              <Plus className="mr-2 h-4 w-4" /> Novo centro
            </Button>
          ) : undefined
        }
      />

      {centrosQ.isPending && <Skeleton className="h-48 w-full rounded-lg" />}

      <div className="space-y-4">
        {centros.map((centro) => {
          const meus = operadores.filter((o) => o.centro_id === centro.id);
          return (
            <section key={centro.id} className="rounded-lg border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Factory className="h-4 w-4 text-primary" />
                  <h2 className="font-medium">{centro.nome}</h2>
                  <Badge variant="secondary">{centro.codigo}</Badge>
                  {!centro.ativo && <Badge variant="outline">inativo</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {Number(centro.capacidade_dia ?? 0).toLocaleString("pt-PT")} min/dia ·{" "}
                    {centro.n_postos} posto{centro.n_postos === 1 ? "" : "s"} ·{" "}
                    {centro.eficiencia_pct}% eficiência
                  </span>
                  {gerirProducao && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setAAtribuir(centro)}>
                        <UserPlus className="mr-2 h-4 w-4" /> Operador
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAEditar(centro)}>
                        Editar
                      </Button>
                    </>
                  )}
                </div>
              </header>

              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Operadores
                  </p>
                  {meus.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Sem operadores atribuídos — a capacidade vem dos postos.
                    </p>
                  )}
                  <ul className="space-y-1">
                    {meus.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {o.utilizador_nome} · {o.minutos_dia} min/dia
                        </span>
                        {gerirProducao && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Retirar ${o.utilizador_nome}`}
                            onClick={() => retirar.mutate(o.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Etapas</p>
                  <ul className="space-y-1 text-sm">
                    {etapas
                      .filter((e) => e.centro_id === centro.id)
                      .map((e) => (
                        <li key={e.id}>{e.nome}</li>
                      ))}
                    {etapas.filter((e) => e.centro_id === centro.id).length === 0 && (
                      <li className="text-muted-foreground">Nenhuma etapa ligada a este centro.</li>
                    )}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {gerirProducao && etapas.some((e) => !e.centro_id) && (
        <section className="mt-6 rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-medium">Etapas sem centro</h2>
          <ul className="space-y-2">
            {etapas
              .filter((e) => !e.centro_id)
              .map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{e.nome}</span>
                  <Select onValueChange={(v) => ligar.mutate({ etapaId: e.id, centroId: v })}>
                    <SelectTrigger className="w-56" aria-label={`Centro para ${e.nome}`}>
                      <SelectValue placeholder="Escolher centro" />
                    </SelectTrigger>
                    <SelectContent>
                      {centros.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
          </ul>
        </section>
      )}

      {(aCriar || aEditar) && (
        <DialogoCentro
          centro={aEditar}
          onFechar={() => {
            setACriar(false);
            setAEditar(null);
          }}
          onGuardado={recarregar}
        />
      )}

      {aAtribuir && (
        <DialogoOperador
          centro={aAtribuir}
          onFechar={() => setAAtribuir(null)}
          onGuardado={recarregar}
        />
      )}
    </div>
  );
}

function DialogoCentro({
  centro,
  onFechar,
  onGuardado,
}: {
  centro: CentroTrabalho | null;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [codigo, setCodigo] = useState(centro?.codigo ?? "");
  const [nome, setNome] = useState(centro?.nome ?? "");
  const [responsavel, setResponsavel] = useState(centro?.responsavel_id ?? "");
  const [minutos, setMinutos] = useState(String(centro?.capacidade_min_dia ?? 480));
  const [postos, setPostos] = useState(String(centro?.n_postos ?? 1));
  const [eficiencia, setEficiencia] = useState(String(centro?.eficiencia_pct ?? 100));
  const [ativo, setAtivo] = useState(centro?.ativo ?? true);

  const pessoasQ = useQuery({ queryKey: ["utilizadores-ativos"], queryFn: utilizadoresAtivos });

  const guardar = useMutation({
    mutationFn: () =>
      gravarCentro({
        id: centro?.id ?? null,
        codigo,
        nome,
        responsavel_id: responsavel || null,
        capacidade_min_dia: Number(minutos) || 480,
        n_postos: Number(postos) || 1,
        eficiencia_pct: Number(eficiencia) || 100,
        ativo,
      }),
    onSuccess: () => {
      toast.success("Centro guardado.");
      onGuardado();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={centro ? `Editar ${centro.nome}` : "Novo centro de trabalho"}
      descricao="A capacidade declarada é o que a simulação usa para dizer se o plano cabe."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!codigo.trim() || !nome.trim()) {
          toast.error("Preencha o código e o nome.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ct-codigo">Código</Label>
          <Input id="ct-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ct-nome">Nome</Label>
          <Input id="ct-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ct-min">Minutos por dia</Label>
          <Input
            id="ct-min"
            type="number"
            value={minutos}
            onChange={(e) => setMinutos(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ct-postos">Postos</Label>
          <Input
            id="ct-postos"
            type="number"
            value={postos}
            onChange={(e) => setPostos(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ct-efi">Eficiência (%)</Label>
          <Input
            id="ct-efi"
            type="number"
            value={eficiencia}
            onChange={(e) => setEficiencia(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ct-resp">Responsável</Label>
          <Select
            value={responsavel || "nenhum"}
            onValueChange={(v) => setResponsavel(v === "nenhum" ? "" : v)}
          >
            <SelectTrigger id="ct-resp">
              <SelectValue placeholder="Sem responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhum">Sem responsável</SelectItem>
              {(pessoasQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ct-ativo">Ativo</Label>
          <Select value={ativo ? "sim" : "nao"} onValueChange={(v) => setAtivo(v === "sim")}>
            <SelectTrigger id="ct-ativo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sim">Sim</SelectItem>
              <SelectItem value="nao">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </DialogoForm>
  );
}

function DialogoOperador({
  centro,
  onFechar,
  onGuardado,
}: {
  centro: CentroTrabalho;
  onFechar: () => void;
  onGuardado: () => void;
}) {
  const [utilizador, setUtilizador] = useState("");
  const [minutos, setMinutos] = useState("480");
  const pessoasQ = useQuery({ queryKey: ["utilizadores-ativos"], queryFn: utilizadoresAtivos });

  const guardar = useMutation({
    mutationFn: () =>
      atribuirOperador({
        centro_id: centro.id,
        utilizador_id: utilizador,
        minutos_dia: Number(minutos) || 480,
      }),
    onSuccess: () => {
      toast.success("Operador atribuído ao centro.");
      onGuardado();
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={`Operador em ${centro.nome}`}
      descricao="Os minutos por dia deste operador entram na capacidade do centro."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!utilizador) {
          toast.error("Escolha a pessoa.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div>
        <Label htmlFor="op-pessoa">Pessoa</Label>
        <Select value={utilizador} onValueChange={setUtilizador}>
          <SelectTrigger id="op-pessoa">
            <SelectValue placeholder="Escolher pessoa" />
          </SelectTrigger>
          <SelectContent>
            {(pessoasQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="op-min">Minutos por dia</Label>
        <Input
          id="op-min"
          type="number"
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
        />
      </div>
    </DialogoForm>
  );
}
