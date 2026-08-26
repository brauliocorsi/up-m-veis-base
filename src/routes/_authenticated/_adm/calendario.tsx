import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { GrupoAcoes } from "@/components/erp/acoes";
import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoEliminar } from "@/components/erp/dialogo-eliminar";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { Lista, type Coluna } from "@/components/erp/lista";
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
import { useListagem } from "@/hooks/use-listagem";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaDiaCalendario } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import { TIPOS_CALENDARIO, type DiaCalendario, type TipoCalendario } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário — UP Vendas" },
      {
        name: "description",
        content: "Feriados, paragens de fábrica e fins de semana excecionais da UP Móveis.",
      },
      { property: "og:title", content: "Calendário — UP Vendas" },
      { property: "og:description", content: "Dias que afetam produção e entregas." },
    ],
  }),
  component: PaginaCalendario,
});

const VAZIO = { data: "", tipo: "feriado" as TipoCalendario, descricao: "" };

function etiquetaTipo(tipo: TipoCalendario) {
  return TIPOS_CALENDARIO.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

function PaginaCalendario() {
  const estado = useListagem("data", true);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<DiaCalendario | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<DiaCalendario | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["calendario", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente],
    queryFn: () =>
      listar<DiaCalendario>({
        tabela: "v_calendario",
        camposPesquisa: ["descricao"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
      }),
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["calendario"] });

  const mGuardar = useMutation({
    mutationFn: async () => {
      const validado = esquemaDiaCalendario.parse(form);
      if (emEdicao) {
        const { error } = await erp().from("calendario").update(validado).eq("id", emEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("calendario").insert(validado);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(emEdicao ? "Dia guardado." : "Dia adicionado ao calendário.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("calendario", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Dia enviado para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const colunas: Array<Coluna<DiaCalendario>> = [
    {
      chave: "data",
      cabecalho: "Data",
      ordenavel: true,
      celula: (linha) => (
        <div>
          <p className="font-medium">
            {new Date(`${linha.data}T00:00:00`).toLocaleDateString("pt-PT", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
          <p className="text-xs text-muted-foreground md:hidden">{linha.descricao}</p>
        </div>
      ),
    },
    {
      chave: "descricao",
      cabecalho: "Descrição",
      esconderMobile: true,
      celula: (linha) => linha.descricao,
    },
    {
      chave: "tipo",
      cabecalho: "Tipo",
      ordenavel: true,
      celula: (linha) => <Badge variant="secondary">{etiquetaTipo(linha.tipo)}</Badge>,
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
              onSelect: () => {
                setEmEdicao(linha);
                setForm({ data: linha.data, tipo: linha.tipo, descricao: linha.descricao });
                setAberto(true);
              },
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
        titulo="Calendário"
        descricao="Feriados, paragens de fábrica e fins de semana em que se trabalha."
        acao={
          <Button
            onClick={() => {
              setEmEdicao(null);
              setForm(VAZIO);
              setAberto(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo dia
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
        vazio="Ainda não há dias marcados."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? "Editar dia" : "Novo dia"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="data">Data</Label>
          <Input
            id="data"
            type="date"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo</Label>
          <Select
            value={form.tipo}
            onValueChange={(v) => setForm({ ...form, tipo: v as TipoCalendario })}
          >
            <SelectTrigger id="tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_CALENDARIO.map((t) => (
                <SelectItem key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Input
            id="descricao"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Feriado municipal"
          />
        </div>
      </DialogoForm>

      <DialogoEliminar
        aberto={Boolean(paraEliminar)}
        onFechar={() => setParaEliminar(null)}
        nomeRegisto={paraEliminar?.descricao ?? ""}
        aGuardar={mEliminar.isPending}
        onConfirmar={(motivo) => mEliminar.mutate(motivo)}
      />
    </div>
  );
}
