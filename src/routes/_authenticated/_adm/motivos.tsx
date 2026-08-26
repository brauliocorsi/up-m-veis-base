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
import { esquemaMotivo } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import { CONTEXTOS, type Contexto, type Motivo } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/motivos")({
  head: () => ({
    meta: [
      { title: "Motivos — UP Vendas" },
      {
        name: "description",
        content:
          "Motivos usados em cancelamentos, eliminações, saídas de caixa e descontos na UP Móveis.",
      },
      { property: "og:title", content: "Motivos — UP Vendas" },
      { property: "og:description", content: "Listas de motivos por contexto." },
    ],
  }),
  component: PaginaMotivos,
});

interface Formulario {
  contexto: Contexto;
  descricao: string;
  exige_texto: boolean;
  ordem: string;
  ativo: boolean;
}

const VAZIO: Formulario = {
  contexto: "eliminacao",
  descricao: "",
  exige_texto: false,
  ordem: "0",
  ativo: true,
};

function PaginaMotivos() {
  const estado = useListagem("ordem", true);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Motivo | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<Motivo | null>(null);
  const [contextoFiltro, setContextoFiltro] = useState<string>("todos");

  const { data, isPending } = useQuery({
    queryKey: [
      "motivos",
      estado.pesquisa,
      estado.pagina,
      estado.ordenarPor,
      estado.ascendente,
      contextoFiltro,
    ],
    queryFn: () =>
      listar<Motivo>({
        tabela: "v_motivos",
        camposPesquisa: ["descricao"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
        filtros: contextoFiltro === "todos" ? [] : [{ campo: "contexto", valor: contextoFiltro }],
      }),
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["motivos"] });
    queryClient.invalidateQueries({ queryKey: ["motivos-contexto"] });
  };

  const mGuardar = useMutation({
    mutationFn: async () => {
      const validado = esquemaMotivo.parse(form);
      if (emEdicao) {
        const { error } = await erp().from("motivos").update(validado).eq("id", emEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("motivos").insert(validado);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(emEdicao ? "Motivo guardado." : "Motivo criado.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("motivos", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Motivo enviado para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const colunas: Array<Coluna<Motivo>> = [
    {
      chave: "descricao",
      cabecalho: "Motivo",
      ordenavel: true,
      celula: (linha) => (
        <div>
          <p className="font-medium">{linha.descricao}</p>
          <p className="text-xs text-muted-foreground md:hidden">
            {CONTEXTOS.find((c) => c.valor === linha.contexto)?.etiqueta}
          </p>
        </div>
      ),
    },
    {
      chave: "contexto",
      cabecalho: "Contexto",
      ordenavel: true,
      esconderMobile: true,
      celula: (linha) => (
        <Badge variant="secondary">
          {CONTEXTOS.find((c) => c.valor === linha.contexto)?.etiqueta ?? linha.contexto}
        </Badge>
      ),
    },
    {
      chave: "exige_texto",
      cabecalho: "Pede explicação",
      esconderMobile: true,
      celula: (linha) => (linha.exige_texto ? "Sim" : "Não"),
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
                setForm({
                  contexto: linha.contexto,
                  descricao: linha.descricao,
                  exige_texto: linha.exige_texto,
                  ordem: String(linha.ordem ?? 0),
                  ativo: true,
                });
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
        titulo="Motivos"
        descricao="As listas de motivos que aparecem quando se cancela, elimina ou altera algo."
        acao={
          <Button
            onClick={() => {
              setEmEdicao(null);
              setForm(VAZIO);
              setAberto(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo motivo
          </Button>
        }
      />

      <div className="mb-3 max-w-xs">
        <Label htmlFor="filtro-contexto" className="mb-2 block text-xs text-muted-foreground">
          Filtrar por contexto
        </Label>
        <Select
          value={contextoFiltro}
          onValueChange={(v) => {
            setContextoFiltro(v);
            estado.onPagina(1);
          }}
        >
          <SelectTrigger id="filtro-contexto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os contextos</SelectItem>
            {CONTEXTOS.map((c) => (
              <SelectItem key={c.valor} value={c.valor}>
                {c.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        vazio="Ainda não há motivos neste contexto."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? "Editar motivo" : "Novo motivo"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="contexto">Contexto</Label>
          <Select
            value={form.contexto}
            onValueChange={(v) => setForm({ ...form, contexto: v as Contexto })}
          >
            <SelectTrigger id="contexto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTEXTOS.map((c) => (
                <SelectItem key={c.valor} value={c.valor}>
                  {c.etiqueta}
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
            placeholder="Cliente desistiu"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ordem">Ordem na lista</Label>
          <Input
            id="ordem"
            inputMode="numeric"
            value={form.ordem}
            onChange={(e) => setForm({ ...form, ordem: e.target.value })}
          />
        </div>
        <Interruptor
          id="exige-texto"
          titulo="Pedir explicação escrita"
          descricao="Quem escolher este motivo tem de escrever o porquê."
          valor={form.exige_texto}
          onChange={(v) => setForm({ ...form, exige_texto: v })}
        />
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
