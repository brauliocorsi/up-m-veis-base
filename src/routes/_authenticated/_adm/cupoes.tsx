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
import { esquemaCupao } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import {
  ETIQUETA_CUPAO,
  TIPOS_CUPAO,
  formatarDinheiro,
  type Cupao,
  type TipoCupao,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/cupoes")({
  head: () => ({
    meta: [
      { title: "Cupões — UP Vendas" },
      {
        name: "description",
        content:
          "Cupões de desconto da UP Móveis: percentagem, valor fixo ou entrega grátis, com validade e limites de utilização.",
      },
      { property: "og:title", content: "Cupões — UP Vendas" },
      { property: "og:description", content: "Gestão dos cupões de desconto das vendas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaCupoes,
});

interface Formulario {
  codigo: string;
  descricao: string;
  tipo: TipoCupao;
  valor: string;
  minimo_compra: string;
  valido_de: string;
  valido_ate: string;
  usos_max: string;
  usos_por_cliente: string;
  acumulavel: boolean;
  ativo: boolean;
}

const VAZIO: Formulario = {
  codigo: "",
  descricao: "",
  tipo: "percentagem",
  valor: "0",
  minimo_compra: "",
  valido_de: new Date().toISOString().slice(0, 10),
  valido_ate: "",
  usos_max: "",
  usos_por_cliente: "1",
  acumulavel: false,
  ativo: true,
};

function PaginaCupoes() {
  const estado = useListagem("codigo", true);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Cupao | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<Cupao | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["cupoes", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente],
    queryFn: () =>
      listar<Cupao>({
        tabela: "v_cupoes",
        camposPesquisa: ["codigo", "descricao"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
      }),
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["cupoes"] });

  const mGuardar = useMutation({
    mutationFn: async () => {
      const v = esquemaCupao.parse(form);
      const registo = {
        ...v,
        descricao: v.descricao || "",
        valido_ate: v.valido_ate || null,
      };
      if (emEdicao) {
        const { error } = await erp().from("cupoes").update(registo).eq("id", emEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("cupoes").insert(registo);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(emEdicao ? "Cupão guardado." : "Cupão criado.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("cupoes", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Cupão enviado para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const colunas: Array<Coluna<Cupao>> = [
    {
      chave: "codigo",
      cabecalho: "Código",
      ordenavel: true,
      celula: (l) => (
        <div>
          <p className="font-medium">{l.codigo}</p>
          <p className="text-xs text-muted-foreground">{l.descricao}</p>
        </div>
      ),
    },
    {
      chave: "tipo",
      cabecalho: "Desconto",
      esconderMobile: true,
      celula: (l) => (
        <div>
          <Badge variant="secondary">{ETIQUETA_CUPAO[l.tipo]}</Badge>
          <p className="mt-1 text-xs text-muted-foreground">
            {l.tipo === "percentagem"
              ? `${l.valor}%`
              : l.tipo === "valor"
                ? formatarDinheiro(l.valor)
                : "Entrega grátis"}
          </p>
        </div>
      ),
    },
    {
      chave: "usos_atuais",
      cabecalho: "Utilizações",
      esconderMobile: true,
      celula: (l) => `${l.usos_atuais}${l.usos_max ? ` de ${l.usos_max}` : ""}`,
    },
    {
      chave: "ativo",
      cabecalho: "Estado",
      celula: (l) => (l.ativo ? "Ativo" : "Desligado"),
    },
    {
      chave: "acoes",
      cabecalho: "",
      alinharDireita: true,
      celula: (l) => (
        <GrupoAcoes
          acoes={[
            {
              chave: "editar",
              etiqueta: "Editar",
              icone: Pencil,
              onSelect: () => {
                setEmEdicao(l);
                setForm({
                  codigo: l.codigo,
                  descricao: l.descricao ?? "",
                  tipo: l.tipo,
                  valor: String(l.valor ?? 0),
                  minimo_compra: l.minimo_compra == null ? "" : String(l.minimo_compra),
                  valido_de: (l.valido_de ?? "").slice(0, 10),
                  valido_ate: (l.valido_ate ?? "").slice(0, 10),
                  usos_max: l.usos_max == null ? "" : String(l.usos_max),
                  usos_por_cliente: String(l.usos_por_cliente ?? 1),
                  acumulavel: l.acumulavel,
                  ativo: l.ativo,
                });
                setAberto(true);
              },
            },
            {
              chave: "eliminar",
              etiqueta: "Eliminar",
              icone: Trash2,
              destrutiva: true,
              onSelect: () => setParaEliminar(l),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Cupões"
        descricao="Códigos de desconto que a vendedora pode aplicar numa venda."
        acao={
          <Button
            onClick={() => {
              setEmEdicao(null);
              setForm(VAZIO);
              setAberto(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo cupão
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
        chave={(l) => l.id}
        vazio="Ainda não há cupões."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? "Editar cupão" : "Novo cupão"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="codigo">Código</Label>
          <Input
            id="codigo"
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
            placeholder="NATAL10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Input
            id="descricao"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Campanha de Natal"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Select
              value={form.tipo}
              onValueChange={(v) => setForm({ ...form, tipo: v as TipoCupao })}
            >
              <SelectTrigger id="tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_CUPAO.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor">
              {form.tipo === "percentagem" ? "Percentagem" : "Valor (€)"}
            </Label>
            <Input
              id="valor"
              inputMode="decimal"
              value={form.valor}
              disabled={form.tipo === "entrega_gratis"}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="valido_de">Válido de</Label>
            <Input
              id="valido_de"
              type="date"
              value={form.valido_de}
              onChange={(e) => setForm({ ...form, valido_de: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valido_ate">Válido até</Label>
            <Input
              id="valido_ate"
              type="date"
              value={form.valido_ate}
              onChange={(e) => setForm({ ...form, valido_ate: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="minimo">Compra mínima (€)</Label>
            <Input
              id="minimo"
              inputMode="decimal"
              value={form.minimo_compra}
              onChange={(e) => setForm({ ...form, minimo_compra: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="usos_max">Utilizações totais</Label>
            <Input
              id="usos_max"
              inputMode="numeric"
              placeholder="Sem limite"
              value={form.usos_max}
              onChange={(e) => setForm({ ...form, usos_max: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="usos_cliente">Por cliente</Label>
            <Input
              id="usos_cliente"
              inputMode="numeric"
              value={form.usos_por_cliente}
              onChange={(e) => setForm({ ...form, usos_por_cliente: e.target.value })}
            />
          </div>
        </div>
        <Interruptor
          id="acumulavel"
          titulo="Pode juntar-se a outros descontos"
          descricao="Se desligado, não soma ao desconto geral da venda."
          valor={form.acumulavel}
          onChange={(v) => setForm({ ...form, acumulavel: v })}
        />
        <Interruptor
          id="ativo"
          titulo="Cupão ativo"
          valor={form.ativo}
          onChange={(v) => setForm({ ...form, ativo: v })}
        />
      </DialogoForm>

      <DialogoEliminar
        aberto={Boolean(paraEliminar)}
        onFechar={() => setParaEliminar(null)}
        nomeRegisto={paraEliminar?.codigo ?? ""}
        aGuardar={mEliminar.isPending}
        onConfirmar={(motivo) => mEliminar.mutate(motivo)}
      />
    </div>
  );
}
