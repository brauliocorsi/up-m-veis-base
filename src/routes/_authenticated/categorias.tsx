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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useListagem } from "@/hooks/use-listagem";
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaCategoria, esquemaFamilia } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import type { Categoria, Familia } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias e famílias — UP Vendas" },
      {
        name: "description",
        content:
          "Organize o catálogo da UP Móveis em categorias e famílias, com nome interno e nome para o cliente.",
      },
      { property: "og:title", content: "Categorias e famílias — UP Vendas" },
      {
        property: "og:description",
        content: "Estrutura do catálogo de produtos da UP Móveis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaCategorias,
});

const CAT_VAZIA = { codigo: "", nome: "", ordem: "0", ativo: true };
const FAM_VAZIA = {
  categoria_id: "",
  codigo: "",
  nome_interno: "",
  nome_cliente: "",
  ativo: true,
};

function PaginaCategorias() {
  const { editarCatalogo } = usePermissoes();
  const queryClient = useQueryClient();

  const estadoCat = useListagem("ordem", true);
  const estadoFam = useListagem("nome_interno", true);

  const [catAberta, setCatAberta] = useState(false);
  const [catEdicao, setCatEdicao] = useState<Categoria | null>(null);
  const [catForm, setCatForm] = useState(CAT_VAZIA);
  const [catEliminar, setCatEliminar] = useState<Categoria | null>(null);

  const [famAberta, setFamAberta] = useState(false);
  const [famEdicao, setFamEdicao] = useState<Familia | null>(null);
  const [famForm, setFamForm] = useState(FAM_VAZIA);
  const [famEliminar, setFamEliminar] = useState<Familia | null>(null);

  const { data: todasCategorias } = useQuery({
    queryKey: ["categorias-opcoes"],
    queryFn: () =>
      listar<Categoria>({ tabela: "v_categorias", ordenarPor: "ordem", ascendente: true, tamanho: 200 }),
  });

  const { data: categorias, isPending: catPendente } = useQuery({
    queryKey: ["categorias", estadoCat.pesquisa, estadoCat.pagina, estadoCat.ordenarPor, estadoCat.ascendente],
    queryFn: () =>
      listar<Categoria>({
        tabela: "v_categorias",
        camposPesquisa: ["nome", "codigo"],
        pesquisa: estadoCat.pesquisa,
        ordenarPor: estadoCat.ordenarPor,
        ascendente: estadoCat.ascendente,
        pagina: estadoCat.pagina,
        tamanho: estadoCat.tamanho,
      }),
  });

  const { data: familias, isPending: famPendente } = useQuery({
    queryKey: ["familias", estadoFam.pesquisa, estadoFam.pagina, estadoFam.ordenarPor, estadoFam.ascendente],
    queryFn: () =>
      listar<Familia>({
        tabela: "v_familias",
        camposPesquisa: ["nome_interno", "nome_cliente", "codigo"],
        pesquisa: estadoFam.pesquisa,
        ordenarPor: estadoFam.ordenarPor,
        ascendente: estadoFam.ascendente,
        pagina: estadoFam.pagina,
        tamanho: estadoFam.tamanho,
      }),
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["categorias"] });
    queryClient.invalidateQueries({ queryKey: ["categorias-opcoes"] });
    queryClient.invalidateQueries({ queryKey: ["familias"] });
  };

  const nomeCategoria = (id: string) =>
    todasCategorias?.linhas.find((c) => c.id === id)?.nome ?? "—";

  const mGuardarCat = useMutation({
    mutationFn: async () => {
      const linha = esquemaCategoria.parse(catForm);
      if (catEdicao) {
        const { error } = await erp().from("categorias").update(linha).eq("id", catEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("categorias").insert(linha);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(catEdicao ? "Categoria guardada." : "Categoria criada.");
      setCatAberta(false);
      setCatEdicao(null);
      setCatForm(CAT_VAZIA);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminarCat = useMutation({
    mutationFn: async (motivo: string) => {
      if (catEliminar) await eliminarRegisto("categorias", catEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Categoria enviada para a lixeira.");
      setCatEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mGuardarFam = useMutation({
    mutationFn: async () => {
      const linha = esquemaFamilia.parse(famForm);
      if (famEdicao) {
        const { error } = await erp().from("familias").update(linha).eq("id", famEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("familias").insert(linha);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(famEdicao ? "Família guardada." : "Família criada.");
      setFamAberta(false);
      setFamEdicao(null);
      setFamForm(FAM_VAZIA);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminarFam = useMutation({
    mutationFn: async (motivo: string) => {
      if (famEliminar) await eliminarRegisto("familias", famEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Família enviada para a lixeira.");
      setFamEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const colunasCat: Array<Coluna<Categoria>> = [
    {
      chave: "nome",
      cabecalho: "Categoria",
      ordenavel: true,
      celula: (l) => (
        <div>
          <p className="font-medium">{l.nome}</p>
          <p className="text-xs text-muted-foreground">{l.codigo}</p>
        </div>
      ),
    },
    { chave: "ordem", cabecalho: "Ordem", ordenavel: true, alinharDireita: true, celula: (l) => l.ordem },
    {
      chave: "ativo",
      cabecalho: "Estado",
      celula: (l) => (
        <Badge variant={l.ativo ? "default" : "outline"}>{l.ativo ? "Ativa" : "Inativa"}</Badge>
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
                  setCatEdicao(l);
                  setCatForm({
                    codigo: l.codigo,
                    nome: l.nome,
                    ordem: String(l.ordem ?? 0),
                    ativo: l.ativo,
                  });
                  setCatAberta(true);
                },
              },
              {
                chave: "eliminar",
                etiqueta: "Eliminar",
                icone: Trash2,
                destrutiva: true,
                onSelect: () => setCatEliminar(l),
              },
            ]}
          />
        ) : null,
    },
  ];

  const colunasFam: Array<Coluna<Familia>> = [
    {
      chave: "nome_interno",
      cabecalho: "Família",
      ordenavel: true,
      celula: (l) => (
        <div>
          <p className="font-medium">{l.nome_interno}</p>
          <p className="text-xs text-muted-foreground">
            {l.codigo} · o cliente vê “{l.nome_cliente}”
          </p>
        </div>
      ),
    },
    {
      chave: "categoria_id",
      cabecalho: "Categoria",
      esconderMobile: true,
      celula: (l) => nomeCategoria(l.categoria_id),
    },
    {
      chave: "ativo",
      cabecalho: "Estado",
      celula: (l) => (
        <Badge variant={l.ativo ? "default" : "outline"}>{l.ativo ? "Ativa" : "Inativa"}</Badge>
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
                  setFamEdicao(l);
                  setFamForm({
                    categoria_id: l.categoria_id,
                    codigo: l.codigo,
                    nome_interno: l.nome_interno,
                    nome_cliente: l.nome_cliente,
                    ativo: l.ativo,
                  });
                  setFamAberta(true);
                },
              },
              {
                chave: "eliminar",
                etiqueta: "Eliminar",
                icone: Trash2,
                destrutiva: true,
                onSelect: () => setFamEliminar(l),
              },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Categorias e famílias"
        descricao="A arrumação do catálogo: a categoria é o grande grupo, a família é a variante que o cliente vê."
      />

      <Tabs defaultValue="categorias">
        <TabsList className="mb-4">
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="familias">Famílias</TabsTrigger>
        </TabsList>

        <TabsContent value="categorias" className="space-y-3">
          {editarCatalogo && (
            <Button
              onClick={() => {
                setCatEdicao(null);
                setCatForm(CAT_VAZIA);
                setCatAberta(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nova categoria
            </Button>
          )}
          <Lista
            colunas={colunasCat}
            linhas={categorias?.linhas ?? []}
            total={categorias?.total ?? 0}
            pagina={estadoCat.pagina}
            tamanho={estadoCat.tamanho}
            aCarregar={catPendente}
            pesquisa={estadoCat.pesquisa}
            ordenarPor={estadoCat.ordenarPor}
            ascendente={estadoCat.ascendente}
            onPesquisa={estadoCat.onPesquisa}
            onPagina={estadoCat.onPagina}
            onOrdenar={estadoCat.onOrdenar}
            chave={(l) => l.id}
            vazio="Ainda não há categorias."
          />
        </TabsContent>

        <TabsContent value="familias" className="space-y-3">
          {editarCatalogo && (
            <Button
              onClick={() => {
                setFamEdicao(null);
                setFamForm({
                  ...FAM_VAZIA,
                  categoria_id: todasCategorias?.linhas[0]?.id ?? "",
                });
                setFamAberta(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nova família
            </Button>
          )}
          <Lista
            colunas={colunasFam}
            linhas={familias?.linhas ?? []}
            total={familias?.total ?? 0}
            pagina={estadoFam.pagina}
            tamanho={estadoFam.tamanho}
            aCarregar={famPendente}
            pesquisa={estadoFam.pesquisa}
            ordenarPor={estadoFam.ordenarPor}
            ascendente={estadoFam.ascendente}
            onPesquisa={estadoFam.onPesquisa}
            onPagina={estadoFam.onPagina}
            onOrdenar={estadoFam.onOrdenar}
            chave={(l) => l.id}
            vazio="Ainda não há famílias."
          />
        </TabsContent>
      </Tabs>

      <DialogoForm
        aberto={catAberta}
        onFechar={() => setCatAberta(false)}
        titulo={catEdicao ? `Editar ${catEdicao.nome}` : "Nova categoria"}
        aGuardar={mGuardarCat.isPending}
        onGuardar={() => mGuardarCat.mutate()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cat-codigo">Código</Label>
            <Input
              id="cat-codigo"
              value={catForm.codigo}
              onChange={(e) => setCatForm({ ...catForm, codigo: e.target.value.toUpperCase() })}
              placeholder="CAM"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-nome">Nome</Label>
            <Input
              id="cat-nome"
              value={catForm.nome}
              onChange={(e) => setCatForm({ ...catForm, nome: e.target.value })}
              placeholder="Camas"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-ordem">Ordem na lista</Label>
            <Input
              id="cat-ordem"
              inputMode="numeric"
              value={catForm.ordem}
              onChange={(e) => setCatForm({ ...catForm, ordem: e.target.value })}
            />
          </div>
        </div>
        <Interruptor
          id="cat-ativo"
          titulo="Ativa"
          descricao="Só as categorias ativas aparecem na criação de produtos."
          valor={catForm.ativo}
          onChange={(v) => setCatForm({ ...catForm, ativo: v })}
        />
      </DialogoForm>

      <DialogoForm
        aberto={famAberta}
        onFechar={() => setFamAberta(false)}
        titulo={famEdicao ? `Editar ${famEdicao.nome_interno}` : "Nova família"}
        aGuardar={mGuardarFam.isPending}
        onGuardar={() => mGuardarFam.mutate()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fam-categoria">Categoria</Label>
            <Select
              value={famForm.categoria_id}
              onValueChange={(v) => setFamForm({ ...famForm, categoria_id: v })}
            >
              <SelectTrigger id="fam-categoria">
                <SelectValue placeholder="Escolha a categoria" />
              </SelectTrigger>
              <SelectContent>
                {(todasCategorias?.linhas ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fam-codigo">Código</Label>
            <Input
              id="fam-codigo"
              value={famForm.codigo}
              onChange={(e) => setFamForm({ ...famForm, codigo: e.target.value.toUpperCase() })}
              placeholder="COX"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fam-interno">Nome interno</Label>
            <Input
              id="fam-interno"
              value={famForm.nome_interno}
              onChange={(e) => setFamForm({ ...famForm, nome_interno: e.target.value })}
              placeholder="Coxim"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fam-cliente">Nome que o cliente vê</Label>
            <Input
              id="fam-cliente"
              value={famForm.nome_cliente}
              onChange={(e) => setFamForm({ ...famForm, nome_cliente: e.target.value })}
              placeholder="Almofadada"
            />
          </div>
        </div>
        <Interruptor
          id="fam-ativo"
          titulo="Ativa"
          descricao="Só as famílias ativas aparecem na criação de produtos."
          valor={famForm.ativo}
          onChange={(v) => setFamForm({ ...famForm, ativo: v })}
        />
      </DialogoForm>

      <DialogoEliminar
        aberto={Boolean(catEliminar)}
        onFechar={() => setCatEliminar(null)}
        nomeRegisto={catEliminar?.nome ?? ""}
        aGuardar={mEliminarCat.isPending}
        onConfirmar={(motivo) => mEliminarCat.mutate(motivo)}
      />

      <DialogoEliminar
        aberto={Boolean(famEliminar)}
        onFechar={() => setFamEliminar(null)}
        nomeRegisto={famEliminar?.nome_interno ?? ""}
        aGuardar={mEliminarFam.isPending}
        onConfirmar={(motivo) => mEliminarFam.mutate(motivo)}
      />
    </div>
  );
}
