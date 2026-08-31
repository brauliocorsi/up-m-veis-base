import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp, mensagemErro } from "@/lib/erp/db";
import {
  eliminarTemplate,
  gerarRotasDosTemplates,
  guardarTemplate,
  lerTemplates,
  lerViaturas,
  preverDatasTemplate,
} from "@/lib/erp/rotas";
import {
  DIAS_SEMANA_ROTA,
  ETIQUETA_PERIODICIDADE_ROTA,
  type PeriodicidadeRota,
  type RotaTemplate,
  type Utilizador,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/rota-modelos")({
  head: () => ({
    meta: [
      { title: "Modelos de rota — UP Vendas" },
      {
        name: "description",
        content:
          "Modelos de rota da UP Móveis: periodicidade, dias da semana, limites de entregas e de montagem, viatura e zona servida.",
      },
      { property: "og:title", content: "Modelos de rota — UP Vendas" },
      {
        property: "og:description",
        content: "As rotas das próximas semanas nascem sozinhas a partir destes modelos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function useEntregadores() {
  return useQuery({
    queryKey: ["entregadores"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("utilizadores")
        .select("*")
        .eq("perfil", "entregador")
        .eq("ativo", true)
        .is("eliminado_em", null)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Utilizador[];
    },
  });
}

function Pagina() {
  const perms = usePermissoes();
  const clientQuery = useQueryClient();
  const [nova, setNova] = useState(false);
  const [aEditar, setAEditar] = useState<RotaTemplate | null>(null);

  const modelosQ = useQuery({
    queryKey: ["rota-templates", "todos"],
    queryFn: () => lerTemplates({ incluirInativos: true }),
  });

  const gerar = useMutation({
    mutationFn: () => gerarRotasDosTemplates(6),
    onSuccess: (n) => {
      toast.success(
        n === 0 ? "Já estavam todas criadas." : `${n} rota(s) criada(s) para as próximas 6 semanas.`,
      );
      clientQuery.invalidateQueries({ queryKey: ["rotas"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const apagar = useMutation({
    mutationFn: (t: RotaTemplate) => eliminarTemplate(t.id, "Modelo desativado"),
    onSuccess: () => {
      toast.success("Modelo desativado. As rotas já criadas mantêm-se.");
      clientQuery.invalidateQueries({ queryKey: ["rota-templates"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const modelos = modelosQ.data ?? [];

  return (
    <div>
      <CabecalhoPagina
        titulo="Modelos de rota"
        descricao="Cada modelo diz em que dias a rota acontece e quanto cabe nela. As rotas das próximas 6 semanas são criadas todos os dias de manhã."
        acao={
          perms.montarRotas ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => gerar.mutate()}
                disabled={gerar.isPending}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Gerar rotas
              </Button>
              <Button onClick={() => setNova(true)}>
                <Plus className="mr-2 h-4 w-4" /> Novo modelo
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="space-y-3">
        {modelos.map((t) => (
          <Card key={t.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium">
                  <CalendarClock className="h-4 w-4 text-primary" /> {t.nome}
                  {!t.ativo && <Badge variant="outline">Inativo</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ETIQUETA_PERIODICIDADE_ROTA[t.periodicidade]} ·{" "}
                  {(t.dias_semana ?? [])
                    .map((d) => DIAS_SEMANA_ROTA.find((x) => x.valor === d)?.curto ?? d)
                    .join(", ")}
                  {t.responsavel ? ` · ${t.responsavel}` : ""}
                  {t.viatura ? ` · ${t.viatura}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.max_entregas ? `${t.max_entregas} entregas` : "sem limite de entregas"} ·{" "}
                  {t.max_minutos_montagem
                    ? `${t.max_minutos_montagem} min de montagem`
                    : "sem limite de montagem"}
                  {t.cp_inicio ? ` · CP ${t.cp_inicio}–${t.cp_fim ?? t.cp_inicio}` : ""}
                </p>
              </div>
              {perms.montarRotas && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAEditar(t)}>
                    <Pencil className="mr-1 h-4 w-4" /> Editar
                  </Button>
                  {t.ativo && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => apagar.mutate(t)}
                      disabled={apagar.isPending}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Desativar
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!modelosQ.isLoading && modelos.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <CalendarClock className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Ainda não há modelos de rota</p>
              <p className="text-sm text-muted-foreground">
                Crie o primeiro modelo para as rotas passarem a nascer sozinhas.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {(nova || aEditar) && (
        <DialogoModelo
          modelo={aEditar}
          onFechar={() => {
            setNova(false);
            setAEditar(null);
          }}
        />
      )}
    </div>
  );
}

function DialogoModelo({
  modelo,
  onFechar,
}: {
  modelo: RotaTemplate | null;
  onFechar: () => void;
}) {
  const clientQuery = useQueryClient();
  const entregadoresQ = useEntregadores();
  const viaturasQ = useQuery({ queryKey: ["viaturas"], queryFn: () => lerViaturas() });

  const [nome, setNome] = useState(modelo?.nome ?? "");
  const [periodicidade, setPeriodicidade] = useState<PeriodicidadeRota>(
    modelo?.periodicidade ?? "semanal",
  );
  const [dias, setDias] = useState<number[]>(modelo?.dias_semana ?? []);
  const [semanaRef, setSemanaRef] = useState(modelo?.semana_referencia ?? "");
  const [maxEntregas, setMaxEntregas] = useState(
    modelo?.max_entregas ? String(modelo.max_entregas) : "",
  );
  const [maxMinutos, setMaxMinutos] = useState(
    modelo?.max_minutos_montagem ? String(modelo.max_minutos_montagem) : "",
  );
  const [viaturaId, setViaturaId] = useState(modelo?.viatura_id ?? "");
  const [responsavelId, setResponsavelId] = useState(modelo?.responsavel_id ?? "");
  const [cpInicio, setCpInicio] = useState(modelo?.cp_inicio ?? "");
  const [cpFim, setCpFim] = useState(modelo?.cp_fim ?? "");
  const [ativo, setAtivo] = useState(modelo?.ativo ?? true);

  const previsaoQ = useQuery({
    queryKey: ["datas-template", periodicidade, dias.join(","), semanaRef],
    queryFn: () =>
      preverDatasTemplate({
        periodicidade,
        dias_semana: dias,
        semana_referencia: semanaRef || null,
      }),
    enabled: dias.length > 0,
  });

  const guardar = useMutation({
    mutationFn: () =>
      guardarTemplate(
        {
          nome,
          periodicidade,
          dias_semana: dias,
          semana_referencia: semanaRef || null,
          max_entregas: maxEntregas ? Number(maxEntregas) : null,
          max_minutos_montagem: maxMinutos ? Number(maxMinutos) : null,
          viatura_id: viaturaId || null,
          responsavel_id: responsavelId || null,
          cp_inicio: cpInicio || null,
          cp_fim: cpFim || cpInicio || null,
          ativo,
        },
        modelo?.id,
      ),
    onSuccess: () => {
      toast.success("Modelo guardado.");
      clientQuery.invalidateQueries({ queryKey: ["rota-templates"] });
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <DialogoForm
      aberto
      onFechar={onFechar}
      titulo={modelo ? "Editar modelo de rota" : "Novo modelo de rota"}
      descricao="As rotas geradas herdam estes valores, mas cada semana pode ser ajustada depois."
      aGuardar={guardar.isPending}
      onGuardar={() => {
        if (!nome.trim()) {
          toast.error("Dê um nome ao modelo.");
          return;
        }
        if (dias.length === 0) {
          toast.error("Escolha pelo menos um dia da semana.");
          return;
        }
        if (periodicidade === "quinzenal" && !semanaRef) {
          toast.error("Nas rotas quinzenais indique a semana de referência.");
          return;
        }
        guardar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="t-nome">Nome</Label>
          <Input id="t-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div>
          <Label>Periodicidade</Label>
          <Select
            value={periodicidade}
            onValueChange={(v) => setPeriodicidade(v as PeriodicidadeRota)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ETIQUETA_PERIODICIDADE_ROTA) as PeriodicidadeRota[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {ETIQUETA_PERIODICIDADE_ROTA[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Dias da semana</Label>
        <div className="mt-2 flex flex-wrap gap-3">
          {DIAS_SEMANA_ROTA.map((d) => (
            <label key={d.valor} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={dias.includes(d.valor)}
                onCheckedChange={(v) =>
                  setDias((atual) =>
                    v ? [...atual, d.valor] : atual.filter((x) => x !== d.valor),
                  )
                }
              />
              {d.curto}
            </label>
          ))}
        </div>
      </div>

      {periodicidade === "quinzenal" && (
        <div>
          <Label htmlFor="t-ref">Semana de referência</Label>
          <Input
            id="t-ref"
            type="date"
            value={semanaRef}
            onChange={(e) => setSemanaRef(e.target.value)}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="t-max-e">Máximo de entregas</Label>
          <Input
            id="t-max-e"
            type="number"
            min={1}
            value={maxEntregas}
            onChange={(e) => setMaxEntregas(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="t-max-m">Máximo de minutos de montagem</Label>
          <Input
            id="t-max-m"
            type="number"
            min={1}
            value={maxMinutos}
            onChange={(e) => setMaxMinutos(e.target.value)}
          />
        </div>
        <div>
          <Label>Viatura por defeito</Label>
          <Select value={viaturaId} onValueChange={setViaturaId}>
            <SelectTrigger>
              <SelectValue placeholder="Sem viatura" />
            </SelectTrigger>
            <SelectContent>
              {(viaturasQ.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nome} · {Number(v.cubicagem_m3).toFixed(2)} m³
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Entregador por defeito</Label>
          <Select value={responsavelId} onValueChange={setResponsavelId}>
            <SelectTrigger>
              <SelectValue placeholder="A definir depois" />
            </SelectTrigger>
            <SelectContent>
              {(entregadoresQ.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="t-cp1">Código postal de</Label>
          <Input
            id="t-cp1"
            maxLength={4}
            value={cpInicio}
            onChange={(e) => setCpInicio(e.target.value.replace(/\D/g, ""))}
            placeholder="4590"
          />
        </div>
        <div>
          <Label htmlFor="t-cp2">Código postal até</Label>
          <Input
            id="t-cp2"
            maxLength={4}
            value={cpFim}
            onChange={(e) => setCpFim(e.target.value.replace(/\D/g, ""))}
            placeholder="4620"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="t-ativo" checked={ativo} onCheckedChange={setAtivo} />
        <Label htmlFor="t-ativo">Modelo ativo</Label>
      </div>

      {dias.length > 0 && (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Próximas datas: {(previsaoQ.data ?? []).slice(0, 8).join(" · ") || "—"}
        </p>
      )}
    </DialogoForm>
  );
}
