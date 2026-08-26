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
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaServico } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import { TIPOS_SERVICO, formatarDinheiro, type Servico, type TipoServico } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/servicos")({
  head: () => ({
    meta: [
      { title: "Serviços — UP Vendas" },
      {
        name: "description",
        content:
          "Serviços cobrados pela UP Móveis: montagem, entrega, transporte especial e subidas sem elevador.",
      },
      { property: "og:title", content: "Serviços — UP Vendas" },
      { property: "og:description", content: "Serviços vendáveis da UP Móveis e respetivos preços." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaServicos,
});

interface Formulario {
  codigo: string;
  nome: string;
  tipo: TipoServico;
  preco_base: string;
  iva_pct: string;
  permite_desconto: boolean;
  ativo: boolean;
}

const VAZIO: Formulario = {
  codigo: "",
  nome: "",
  tipo: "outro",
  preco_base: "0",
  iva_pct: "23",
  permite_desconto: false,
  ativo: true,
};

function PaginaServicos() {
  const { editarCatalogo } = usePermissoes();
  const estado = useListagem("nome", true);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Servico | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<Servico | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["servicos", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente],
    queryFn: () =>
      listar<Servico>({
        tabela: "v_servicos",
        camposPesquisa: ["nome", "codigo"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
      }),
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["servicos"] });

  const mGuardar = useMutation({
    mutationFn: async () => {
      const linha = esquemaServico.parse(form);
      if (emEdicao) {
        const { error } = await erp().from("servicos").update(linha).eq("id", emEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("servicos").insert(linha);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(emEdicao ? "Serviço guardado." : "Serviço criado.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("servicos", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Serviço enviado para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const colunas: Array<Coluna<Servico>> = [
    {
      chave: "nome",
      cabecalho: "Serviço",
      ordenavel: true,
      celula: (l) => (
        <div>
          <p className="font-medium">{l.nome}</p>
          <p className="text-xs text-muted-foreground">{l.codigo}</p>
        </div>
      ),
    },
    {
      chave: "tipo",
      cabecalho: "Tipo",
      esconderMobile: true,
      celula: (l) => TIPOS_SERVICO.find((t) => t.valor === l.tipo)?.etiqueta ?? l.tipo,
    },
    {
      chave: "preco_base",
      cabecalho: "Preço",
      alinharDireita: true,
      celula: (l) => formatarDinheiro(l.preco_base),
    },
    {
      chave: "iva_pct",
      cabecalho: "IVA",
      esconderMobile: true,
      alinharDireita: true,
      celula: (l) => `${Number(l.iva_pct).toFixed(0)} %`,
    },
    {
      chave: "ativo",
      cabecalho: "Estado",
      celula: (l) => (
        <Badge variant={l.ativo ? "default" : "outline"}>{l.ativo ? "Ativo" : "Inativo"}</Badge>
      ),
    },
    {
      chave: "acoes",
      cabecalho: "",
      alinharDireita: true,
      celula: (l) =>
        editarCatalogo ? (
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
                    nome: l.nome,
                    tipo: l.tipo,
                    preco_base: String(l.preco_base ?? 0),
                    iva_pct: String(l.iva_pct ?? 23),
                    permite_desconto: l.permite_desconto,
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
        ) : null,
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Serviços"
        descricao="Aquilo que se cobra além dos móveis: montagem, entrega, transportes especiais e subidas."
        acao={
          editarCatalogo ? (
            <Button
              onClick={() => {
                setEmEdicao(null);
                setForm(VAZIO);
                setAberto(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Novo serviço
            </Button>
          ) : undefined
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
        vazio="Ainda não há serviços."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo serviço"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="s-codigo">Código</Label>
            <Input
              id="s-codigo"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
              placeholder="MONT"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-nome">Nome</Label>
            <Input
              id="s-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-tipo">Tipo</Label>
            <Select
              value={form.tipo}
              onValueChange={(v) => setForm({ ...form, tipo: v as TipoServico })}
            >
              <SelectTrigger id="s-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_SERVICO.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-preco">Preço base (€)</Label>
            <Input
              id="s-preco"
              inputMode="decimal"
              value={form.preco_base}
              onChange={(e) => setForm({ ...form, preco_base: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-iva">IVA (%)</Label>
            <Input
              id="s-iva"
              inputMode="decimal"
              value={form.iva_pct}
              onChange={(e) => setForm({ ...form, iva_pct: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <Interruptor
            id="s-desconto"
            titulo="Permite desconto"
            descricao="Desligue para serviços com preço fixo."
            valor={form.permite_desconto}
            onChange={(v) => setForm({ ...form, permite_desconto: v })}
          />
          <Interruptor
            id="s-ativo"
            titulo="Ativo"
            descricao="Só os serviços ativos aparecem nas vendas."
            valor={form.ativo}
            onChange={(v) => setForm({ ...form, ativo: v })}
          />
        </div>
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
