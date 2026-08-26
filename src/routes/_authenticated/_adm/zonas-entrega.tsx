import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { GrupoAcoes } from "@/components/erp/acoes";
import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoEliminar } from "@/components/erp/dialogo-eliminar";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Interruptor } from "@/components/erp/interruptor";
import { Lista, type Coluna } from "@/components/erp/lista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useListagem } from "@/hooks/use-listagem";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaZonaEntrega } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import { DIAS_SEMANA, formatarDinheiro, type ZonaEntrega } from "@/lib/erp/tipos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_adm/zonas-entrega")({
  head: () => ({
    meta: [
      { title: "Zonas de entrega — UP Vendas" },
      {
        name: "description",
        content: "Zonas de entrega da UP Móveis por código postal, com portes e dias de rota.",
      },
      { property: "og:title", content: "Zonas de entrega — UP Vendas" },
      { property: "og:description", content: "Portes e dias de rota por código postal." },
    ],
  }),
  component: PaginaZonas,
});

interface Formulario {
  nome: string;
  cp_inicio: string;
  cp_fim: string;
  valor_base: string;
  valor_por_m3: string;
  valor_min: string;
  gratis_acima: string;
  dias_rota: number[];
  ativo: boolean;
}

const VAZIO: Formulario = {
  nome: "",
  cp_inicio: "",
  cp_fim: "",
  valor_base: "0",
  valor_por_m3: "0",
  valor_min: "0",
  gratis_acima: "",
  dias_rota: [],
  ativo: true,
};

function PaginaZonas() {
  const estado = useListagem("cp_inicio", true);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<ZonaEntrega | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<ZonaEntrega | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["zonas-entrega", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente],
    queryFn: () =>
      listar<ZonaEntrega>({
        tabela: "v_zonas_entrega",
        camposPesquisa: ["nome", "cp_inicio", "cp_fim"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
      }),
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["zonas-entrega"] });

  const mGuardar = useMutation({
    mutationFn: async () => {
      const validado = esquemaZonaEntrega.parse({
        ...form,
        gratis_acima: form.gratis_acima ? Number(form.gratis_acima) : null,
      });
      if (emEdicao) {
        const { error } = await erp().from("zonas_entrega").update(validado).eq("id", emEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("zonas_entrega").insert(validado);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(emEdicao ? "Zona guardada." : "Zona criada.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("zonas_entrega", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Zona enviada para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  function abrirEdicao(linha: ZonaEntrega) {
    setEmEdicao(linha);
    setForm({
      nome: linha.nome,
      cp_inicio: linha.cp_inicio,
      cp_fim: linha.cp_fim,
      valor_base: String(linha.valor_base ?? 0),
      valor_por_m3: String(linha.valor_por_m3 ?? 0),
      valor_min: String(linha.valor_min ?? 0),
      gratis_acima: linha.gratis_acima != null ? String(linha.gratis_acima) : "",
      dias_rota: linha.dias_rota ?? [],
      ativo: linha.ativo,
    });
    setAberto(true);
  }

  const colunas: Array<Coluna<ZonaEntrega>> = [
    {
      chave: "nome",
      cabecalho: "Zona",
      ordenavel: true,
      celula: (linha) => (
        <div>
          <p className="font-medium">{linha.nome}</p>
          <p className="text-xs text-muted-foreground">
            {linha.cp_inicio} — {linha.cp_fim}
          </p>
        </div>
      ),
    },
    {
      chave: "valor_base",
      cabecalho: "Base",
      alinharDireita: true,
      celula: (linha) => formatarDinheiro(linha.valor_base),
    },
    {
      chave: "valor_por_m3",
      cabecalho: "Por m³",
      alinharDireita: true,
      esconderMobile: true,
      celula: (linha) => formatarDinheiro(linha.valor_por_m3),
    },
    {
      chave: "dias_rota",
      cabecalho: "Dias de rota",
      esconderMobile: true,
      celula: (linha) =>
        (linha.dias_rota ?? [])
          .map((d) => DIAS_SEMANA.find((x) => x.valor === d)?.etiqueta ?? d)
          .join(", ") || "—",
    },
    {
      chave: "ativo",
      cabecalho: "Estado",
      celula: (linha) => (
        <Badge variant={linha.ativo ? "default" : "outline"}>
          {linha.ativo ? "Ativa" : "Inativa"}
        </Badge>
      ),
    },
    {
      chave: "acoes",
      cabecalho: "",
      alinharDireita: true,
      celula: (linha) => (
        <GrupoAcoes
          acoes={[
            {
              chave: "editar",
              etiqueta: "Editar",
              icone: Pencil,
              onSelect: () => abrirEdicao(linha),
            },
            {
              chave: "eliminar",
              etiqueta: "Eliminar",
              icone: Trash2,
              destrutiva: true,
              onSelect: () => setParaEliminar(linha),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Zonas de entrega"
        descricao="Intervalos de código postal com portes e dias de rota da carrinha."
        acao={
          <Button
            onClick={() => {
              setEmEdicao(null);
              setForm(VAZIO);
              setAberto(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Nova zona
          </Button>
        }
      />

      <Lista
        colunas={colunas}
        linhas={data?.linhas ?? []}
        total={data?.total ?? 0}
        pagina={estado.pagina}
        tamanho={estado.tamanho}
        aCarregar={isPending}
        pesquisa={estado.pesquisa}
        ordenarPor={estado.ordenarPor}
        ascendente={estado.ascendente}
        onPesquisa={estado.onPesquisa}
        onPagina={estado.onPagina}
        onOrdenar={estado.onOrdenar}
        chave={(linha) => linha.id}
        vazio="Ainda não há zonas de entrega."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Nova zona de entrega"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="nome">Nome da zona</Label>
          <Input
            id="nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Grande Porto"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cp-inicio">Código postal inicial</Label>
            <Input
              id="cp-inicio"
              inputMode="numeric"
              maxLength={4}
              value={form.cp_inicio}
              onChange={(e) => setForm({ ...form, cp_inicio: e.target.value.replace(/\D/g, "") })}
              placeholder="4000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-fim">Código postal final</Label>
            <Input
              id="cp-fim"
              inputMode="numeric"
              maxLength={4}
              value={form.cp_fim}
              onChange={(e) => setForm({ ...form, cp_fim: e.target.value.replace(/\D/g, "") })}
              placeholder="4499"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor-base">Porte base (€)</Label>
            <Input
              id="valor-base"
              inputMode="decimal"
              value={form.valor_base}
              onChange={(e) => setForm({ ...form, valor_base: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor-m3">Valor por m³ (€)</Label>
            <Input
              id="valor-m3"
              inputMode="decimal"
              value={form.valor_por_m3}
              onChange={(e) => setForm({ ...form, valor_por_m3: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor-min">Porte mínimo (€)</Label>
            <Input
              id="valor-min"
              inputMode="decimal"
              value={form.valor_min}
              onChange={(e) => setForm({ ...form, valor_min: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gratis">Entrega grátis acima de (€)</Label>
            <Input
              id="gratis"
              inputMode="decimal"
              value={form.gratis_acima}
              onChange={(e) => setForm({ ...form, gratis_acima: e.target.value })}
              placeholder="Sem oferta"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Dias de rota</Label>
          <div className="flex flex-wrap gap-2">
            {DIAS_SEMANA.map((dia) => {
              const escolhido = form.dias_rota.includes(dia.valor);
              return (
                <button
                  key={dia.valor}
                  type="button"
                  aria-pressed={escolhido}
                  onClick={() =>
                    setForm({
                      ...form,
                      dias_rota: escolhido
                        ? form.dias_rota.filter((d) => d !== dia.valor)
                        : [...form.dias_rota, dia.valor].sort((a, b) => a - b),
                    })
                  }
                  className={cn(
                    "h-10 w-12 rounded-md border text-sm transition-colors",
                    escolhido
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {dia.etiqueta}
                </button>
              );
            })}
          </div>
        </div>

        <Interruptor
          id="zona-ativa"
          titulo="Zona ativa"
          descricao="Só as zonas ativas são usadas no cálculo dos portes."
          valor={form.ativo}
          onChange={(v) => setForm({ ...form, ativo: v })}
        />
      </DialogoForm>

      <DialogoEliminar
        aberto={Boolean(paraEliminar)}
        onFechar={() => setParaEliminar(null)}
        nomeRegisto={paraEliminar?.nome ?? ""}
        aGuardar={mEliminar.isPending}
        onConfirmar={(motivo) => mEliminar.mutate(motivo)}
      />
    </div>
  );
}
