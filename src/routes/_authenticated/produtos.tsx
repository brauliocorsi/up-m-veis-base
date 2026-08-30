import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Boxes, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { GrupoAcoes } from "@/components/erp/acoes";
import { CabecalhoPagina } from "@/components/erp/app-shell";
import { DialogoEliminar } from "@/components/erp/dialogo-eliminar";
import { DialogoForm } from "@/components/erp/dialogo-form";
import { ImportarCsv } from "@/components/erp/importar-csv";
import { Interruptor } from "@/components/erp/interruptor";
import { Lista, type Coluna } from "@/components/erp/lista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useListagem } from "@/hooks/use-listagem";
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaProduto } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import {
  ETIQUETA_FORNECIMENTO,
  TIPOS_FORNECIMENTO,
  formatarDinheiro,
  type Categoria,
  type Familia,
  type Fornecedor,
  type Produto,
  type ProdutoColi,
  type TipoFornecimento,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos — UP Vendas" },
      {
        name: "description",
        content:
          "Catálogo de produtos da UP Móveis: preços, volumes, prazos, montagem e disponibilidade para venda.",
      },
      { property: "og:title", content: "Produtos — UP Vendas" },
      { property: "og:description", content: "Catálogo de produtos e preços da UP Móveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaProdutos,
});

const SEM = "__sem__";

interface Formulario {
  cod_barras: string;
  cod_modelo: string;
  categoria_id: string;
  familia_id: string;
  nome_cliente: string;
  nome_interno: string;
  descricao: string;
  tipo_fornecimento: TipoFornecimento;
  fornecedor_id: string;
  prazo_producao_dias: string;
  prazo_fornecedor_dias: string;
  n_colis: string;
  volume_m3: string;
  peso_kg: string;
  preco_base: string;
  preco_promocional: string;
  custo_ultimo: string;
  iva_pct: string;
  valor_montagem: string;
  montagem_obrigatoria: boolean;
  tempo_montagem_min: string;
  permite_desconto: boolean;
  margem_minima_pct: string;
  ponto_reposicao: string;
  imagem_url: string;
  vendavel: boolean;
  ativo: boolean;
}

const VAZIO: Formulario = {
  cod_barras: "",
  cod_modelo: "",
  categoria_id: "",
  familia_id: "",
  nome_cliente: "",
  nome_interno: "",
  descricao: "",
  tipo_fornecimento: "stock",
  fornecedor_id: "",
  prazo_producao_dias: "",
  prazo_fornecedor_dias: "",
  n_colis: "1",
  volume_m3: "",
  peso_kg: "",
  preco_base: "",
  preco_promocional: "",
  custo_ultimo: "",
  iva_pct: "23",
  valor_montagem: "0",
  montagem_obrigatoria: false,
  tempo_montagem_min: "",
  permite_desconto: true,
  margem_minima_pct: "",
  ponto_reposicao: "",
  imagem_url: "",
  vendavel: true,
  ativo: true,
};

function PaginaProdutos() {
  const { editarCatalogo, adm, editarCustos } = usePermissoes();
  const estado = useListagem("nome_cliente", true);
  const queryClient = useQueryClient();

  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Produto | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<Produto | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState(SEM);
  const [filtroTipo, setFiltroTipo] = useState(SEM);
  const [importar, setImportar] = useState(false);
  const [volumesDe, setVolumesDe] = useState<Produto | null>(null);

  const { data: categorias } = useQuery({
    queryKey: ["categorias-opcoes"],
    queryFn: () =>
      listar<Categoria>({ tabela: "v_categorias", ordenarPor: "ordem", ascendente: true, tamanho: 200 }),
  });
  const { data: familias } = useQuery({
    queryKey: ["familias-opcoes"],
    queryFn: () =>
      listar<Familia>({ tabela: "v_familias", ordenarPor: "nome_interno", ascendente: true, tamanho: 500 }),
  });
  const { data: fornecedores } = useQuery({
    queryKey: ["fornecedores-opcoes"],
    queryFn: () =>
      listar<Fornecedor>({ tabela: "v_fornecedores", ordenarPor: "nome", ascendente: true, tamanho: 500 }),
  });

  const filtros = [
    ...(filtroCategoria !== SEM ? [{ campo: "categoria_id", valor: filtroCategoria }] : []),
    ...(filtroTipo !== SEM ? [{ campo: "tipo_fornecimento", valor: filtroTipo }] : []),
  ];

  const { data, isPending } = useQuery({
    queryKey: [
      "produtos",
      estado.pesquisa,
      estado.pagina,
      estado.ordenarPor,
      estado.ascendente,
      filtroCategoria,
      filtroTipo,
    ],
    queryFn: () =>
      listar<Produto>({
        tabela: "v_produtos",
        camposPesquisa: ["nome_cliente", "nome_interno", "cod_barras", "cod_modelo"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
        filtros,
      }),
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["produtos"] });

  function paraLinha(f: Formulario) {
    const validado = esquemaProduto.parse({
      ...f,
      familia_id: f.familia_id || null,
      fornecedor_id: f.fornecedor_id || null,
    });
    return {
      ...validado,
      cod_modelo: validado.cod_modelo || null,
      nome_interno: validado.nome_interno || null,
      descricao: validado.descricao || null,
      imagem_url: validado.imagem_url || null,
      familia_id: validado.familia_id ?? null,
      fornecedor_id: validado.fornecedor_id ?? null,
    };
  }

  async function guardarCustos(produtoId: string) {
    if (!editarCustos) return;
    const custo = form.custo_ultimo.trim().replace(",", ".");
    const margem = form.margem_minima_pct.trim().replace(",", ".");
    const { error } = await erp().rpc("definir_custos", {
      p_produto_id: produtoId,
      p_custo: custo === "" ? null : Number(custo),
      p_margem_minima_pct: margem === "" ? null : Number(margem),
    });
    if (error) throw error;
  }

  const mGuardar = useMutation({
    mutationFn: async () => {
      const linha = paraLinha(form);
      if (emEdicao) {
        const payload = adm ? linha : { ...linha, cod_barras: emEdicao.cod_barras };
        const { error } = await erp().from("produtos").update(payload).eq("id", emEdicao.id);
        if (error) throw error;
        await guardarCustos(emEdicao.id);
      } else {
        const { data, error } = await erp().from("produtos").insert(linha).select("id").single();
        if (error) throw error;
        if (data?.id) await guardarCustos(data.id as string);
      }
    },

    onSuccess: () => {
      toast.success(emEdicao ? "Produto guardado." : "Produto criado.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("produtos", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Produto enviado para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  async function abrirEdicao(l: Produto) {
    setEmEdicao(l);
    setForm({
      cod_barras: l.cod_barras,
      cod_modelo: l.cod_modelo ?? "",
      categoria_id: l.categoria_id,
      familia_id: l.familia_id ?? "",
      nome_cliente: l.nome_cliente,
      nome_interno: l.nome_interno ?? "",
      descricao: l.descricao ?? "",
      tipo_fornecimento: l.tipo_fornecimento,
      fornecedor_id: l.fornecedor_id ?? "",
      prazo_producao_dias: l.prazo_producao_dias === null ? "" : String(l.prazo_producao_dias),
      prazo_fornecedor_dias: l.prazo_fornecedor_dias === null ? "" : String(l.prazo_fornecedor_dias),
      n_colis: String(l.n_colis ?? 1),
      volume_m3: l.volume_m3 === null ? "" : String(l.volume_m3),
      peso_kg: l.peso_kg === null ? "" : String(l.peso_kg),
      preco_base: l.preco_base === null ? "" : String(l.preco_base),
      preco_promocional: l.preco_promocional === null ? "" : String(l.preco_promocional),
      custo_ultimo: "",
      iva_pct: String(l.iva_pct ?? 23),
      valor_montagem: String(l.valor_montagem ?? 0),
      montagem_obrigatoria: l.montagem_obrigatoria,
      tempo_montagem_min: l.tempo_montagem_min === null ? "" : String(l.tempo_montagem_min),
      permite_desconto: l.permite_desconto,
      margem_minima_pct: "",
      ponto_reposicao: l.ponto_reposicao === null ? "" : String(l.ponto_reposicao),
      imagem_url: l.imagem_url ?? "",
      vendavel: l.vendavel,
      ativo: l.ativo,
    });
    setAberto(true);
    if (editarCustos) {
      const { data: custos } = await erp()
        .from("v_produto_custos")
        .select("custo_ultimo, margem_minima_pct")
        .eq("produto_id", l.id)
        .maybeSingle();
      if (custos) {
        setForm((atual) => ({
          ...atual,
          custo_ultimo: custos.custo_ultimo === null ? "" : String(custos.custo_ultimo),
          margem_minima_pct:
            custos.margem_minima_pct === null ? "" : String(custos.margem_minima_pct),
        }));
      }
    }
  }


  const familiasDaCategoria = (familias?.linhas ?? []).filter(
    (f) => f.categoria_id === form.categoria_id,
  );

  const colunas: Array<Coluna<Produto>> = [
    {
      chave: "nome_cliente",
      cabecalho: "Produto",
      ordenavel: true,
      celula: (l) => (
        <div>
          <p className="font-medium">{l.nome_cliente}</p>
          <p className="text-xs text-muted-foreground">
            {l.cod_barras}
            {l.cod_modelo ? ` · ${l.cod_modelo}` : ""}
          </p>
        </div>
      ),
    },
    {
      chave: "tipo_fornecimento",
      cabecalho: "Fornecimento",
      esconderMobile: true,
      celula: (l) => ETIQUETA_FORNECIMENTO[l.tipo_fornecimento],
    },
    {
      chave: "n_colis",
      cabecalho: "Volumes",
      esconderMobile: true,
      alinharDireita: true,
      celula: (l) => l.n_colis,
    },
    {
      chave: "preco_base",
      cabecalho: "Preço",
      ordenavel: true,
      alinharDireita: true,
      celula: (l) =>
        l.preco_base === null ? (
          <span className="text-muted-foreground">Sob consulta</span>
        ) : (
          <div>
            {formatarDinheiro(l.preco_base)}
            {l.preco_promocional !== null && (
              <p className="text-xs text-primary">Promo {formatarDinheiro(l.preco_promocional)}</p>
            )}
          </div>
        ),
    },
    {
      chave: "vendavel",
      cabecalho: "Estado",
      celula: (l) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={l.ativo ? "default" : "outline"}>{l.ativo ? "Ativo" : "Inativo"}</Badge>
          {!l.vendavel && <Badge variant="secondary">Não vendável</Badge>}
        </div>
      ),
    },
    {
      chave: "acoes",
      cabecalho: "",
      alinharDireita: true,
      celula: (l) => (
        <GrupoAcoes
          acoes={[
            {
              chave: "volumes",
              etiqueta: "Volumes",
              icone: Boxes,
              onSelect: () => setVolumesDe(l),
            },
            ...(editarCatalogo
              ? [
                  {
                    chave: "editar",
                    etiqueta: "Editar",
                    icone: Pencil,
                    onSelect: () => abrirEdicao(l),
                  },
                  {
                    chave: "eliminar",
                    etiqueta: "Eliminar",
                    icone: Trash2,
                    destrutiva: true,
                    onSelect: () => setParaEliminar(l),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Produtos"
        descricao="O catálogo da loja: preços, volumes, prazos e o que pode ou não ser vendido."
        acao={
          editarCatalogo ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportar(true)}>
                <Upload className="mr-2 h-4 w-4" /> Importar CSV
              </Button>
              <Button
                onClick={() => {
                  setEmEdicao(null);
                  setForm({ ...VAZIO, categoria_id: categorias?.linhas[0]?.id ?? "" });
                  setAberto(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Novo produto
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="filtro-categoria" className="mb-2 block text-xs text-muted-foreground">
            Categoria
          </Label>
          <Select
            value={filtroCategoria}
            onValueChange={(v) => {
              setFiltroCategoria(v);
              estado.onPagina(1);
            }}
          >
            <SelectTrigger id="filtro-categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Todas as categorias</SelectItem>
              {(categorias?.linhas ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filtro-tipo" className="mb-2 block text-xs text-muted-foreground">
            Fornecimento
          </Label>
          <Select
            value={filtroTipo}
            onValueChange={(v) => {
              setFiltroTipo(v);
              estado.onPagina(1);
            }}
          >
            <SelectTrigger id="filtro-tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Todos os tipos</SelectItem>
              {TIPOS_FORNECIMENTO.map((t) => (
                <SelectItem key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        chave={(l) => l.id}
        vazio="Ainda não há produtos no catálogo."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome_cliente}` : "Novo produto"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="p-barras">Código de barras</Label>
            <Input
              id="p-barras"
              value={form.cod_barras}
              disabled={Boolean(emEdicao) && !adm}
              onChange={(e) => setForm({ ...form, cod_barras: e.target.value })}
            />
            {Boolean(emEdicao) && !adm && (
              <p className="text-xs text-muted-foreground">
                Só a Administração pode alterar o código de barras.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-modelo">Código do modelo</Label>
            <Input
              id="p-modelo"
              value={form.cod_modelo}
              onChange={(e) => setForm({ ...form, cod_modelo: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-categoria">Categoria</Label>
            <Select
              value={form.categoria_id}
              onValueChange={(v) => setForm({ ...form, categoria_id: v, familia_id: "" })}
            >
              <SelectTrigger id="p-categoria">
                <SelectValue placeholder="Escolha a categoria" />
              </SelectTrigger>
              <SelectContent>
                {(categorias?.linhas ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-familia">Família</Label>
            <Select
              value={form.familia_id || SEM}
              onValueChange={(v) => setForm({ ...form, familia_id: v === SEM ? "" : v })}
            >
              <SelectTrigger id="p-familia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Sem família</SelectItem>
                {familiasDaCategoria.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome_interno}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-nome">Nome que o cliente vê</Label>
            <Input
              id="p-nome"
              value={form.nome_cliente}
              onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-interno">Nome interno</Label>
            <Input
              id="p-interno"
              value={form.nome_interno}
              onChange={(e) => setForm({ ...form, nome_interno: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-descricao">Descrição</Label>
            <Textarea
              id="p-descricao"
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-tipo">Como é fornecido</Label>
            <Select
              value={form.tipo_fornecimento}
              onValueChange={(v) => setForm({ ...form, tipo_fornecimento: v as TipoFornecimento })}
            >
              <SelectTrigger id="p-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_FORNECIMENTO.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.tipo_fornecimento === "producao" && (
            <div className="space-y-2">
              <Label htmlFor="p-prazo-prod">Prazo de produção (dias)</Label>
              <Input
                id="p-prazo-prod"
                inputMode="numeric"
                value={form.prazo_producao_dias}
                onChange={(e) => setForm({ ...form, prazo_producao_dias: e.target.value })}
              />
            </div>
          )}
          {form.tipo_fornecimento === "compra" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="p-fornecedor">Fornecedor</Label>
                <Select
                  value={form.fornecedor_id || SEM}
                  onValueChange={(v) => setForm({ ...form, fornecedor_id: v === SEM ? "" : v })}
                >
                  <SelectTrigger id="p-fornecedor">
                    <SelectValue placeholder="Escolha o fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Sem fornecedor</SelectItem>
                    {(fornecedores?.linhas ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-prazo-forn">Prazo do fornecedor (dias)</Label>
                <Input
                  id="p-prazo-forn"
                  inputMode="numeric"
                  value={form.prazo_fornecedor_dias}
                  onChange={(e) => setForm({ ...form, prazo_fornecedor_dias: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="p-colis">Número de volumes</Label>
            <Input
              id="p-colis"
              inputMode="numeric"
              value={form.n_colis}
              onChange={(e) => setForm({ ...form, n_colis: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-volume">Volume (m³)</Label>
            <Input
              id="p-volume"
              inputMode="decimal"
              value={form.volume_m3}
              onChange={(e) => setForm({ ...form, volume_m3: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-peso">Peso (kg)</Label>
            <Input
              id="p-peso"
              inputMode="decimal"
              value={form.peso_kg}
              onChange={(e) => setForm({ ...form, peso_kg: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-preco">Preço base (€)</Label>
            <Input
              id="p-preco"
              inputMode="decimal"
              placeholder="Sob consulta"
              value={form.preco_base}
              onChange={(e) => setForm({ ...form, preco_base: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-promo">Preço promocional (€)</Label>
            <Input
              id="p-promo"
              inputMode="decimal"
              value={form.preco_promocional}
              onChange={(e) => setForm({ ...form, preco_promocional: e.target.value })}
            />
          </div>
          {editarCustos ? (
            <div className="space-y-2">
              <Label htmlFor="p-custo">Último custo (€)</Label>
              <Input
                id="p-custo"
                inputMode="decimal"
                value={form.custo_ultimo}
                onChange={(e) => setForm({ ...form, custo_ultimo: e.target.value })}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="p-iva">IVA (%)</Label>
            <Input
              id="p-iva"
              inputMode="decimal"
              value={form.iva_pct}
              onChange={(e) => setForm({ ...form, iva_pct: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-montagem">Valor da montagem (€)</Label>
            <Input
              id="p-montagem"
              inputMode="decimal"
              value={form.valor_montagem}
              onChange={(e) => setForm({ ...form, valor_montagem: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-tempo">Tempo de montagem (min)</Label>
            <Input
              id="p-tempo"
              inputMode="numeric"
              value={form.tempo_montagem_min}
              onChange={(e) => setForm({ ...form, tempo_montagem_min: e.target.value })}
            />
          </div>
          {editarCustos ? (
            <div className="space-y-2">
              <Label htmlFor="p-margem">Margem mínima (%)</Label>
              <Input
                id="p-margem"
                inputMode="decimal"
                value={form.margem_minima_pct}
                onChange={(e) => setForm({ ...form, margem_minima_pct: e.target.value })}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="p-reposicao">Ponto de reposição</Label>
            <Input
              id="p-reposicao"
              inputMode="numeric"
              value={form.ponto_reposicao}
              onChange={(e) => setForm({ ...form, ponto_reposicao: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-imagem">Endereço da imagem</Label>
            <Input
              id="p-imagem"
              value={form.imagem_url}
              onChange={(e) => setForm({ ...form, imagem_url: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <Interruptor
            id="p-mont-obr"
            titulo="Montagem obrigatória"
            descricao="A montagem é sempre incluída na venda deste produto."
            valor={form.montagem_obrigatoria}
            onChange={(v) => setForm({ ...form, montagem_obrigatoria: v })}
          />
          <Interruptor
            id="p-desconto"
            titulo="Permite desconto"
            descricao="Desligue para produtos com preço fixo."
            valor={form.permite_desconto}
            onChange={(v) => setForm({ ...form, permite_desconto: v })}
          />
          <Interruptor
            id="p-vendavel"
            titulo="Vendável"
            descricao="Sem preço definido o produto fica sob consulta e não pode ser vendido."
            valor={form.vendavel}
            onChange={(v) => setForm({ ...form, vendavel: v })}
          />
          <Interruptor
            id="p-ativo"
            titulo="Ativo"
            descricao="Só produtos ativos aparecem nas listas de venda."
            valor={form.ativo}
            onChange={(v) => setForm({ ...form, ativo: v })}
          />
        </div>
      </DialogoForm>

      <DialogoEliminar
        aberto={Boolean(paraEliminar)}
        onFechar={() => setParaEliminar(null)}
        nomeRegisto={paraEliminar?.nome_cliente ?? ""}
        aGuardar={mEliminar.isPending}
        onConfirmar={(motivo) => mEliminar.mutate(motivo)}
      />

      <DialogoVolumes produto={volumesDe} onFechar={() => setVolumesDe(null)} podeEditar={editarCatalogo} />

      <ImportarCsv
        aberto={importar}
        onFechar={() => setImportar(false)}
        titulo="Importar produtos"
        colunas={[
          { chave: "cod_barras", etiqueta: "Código de barras", obrigatoria: true },
          { chave: "nome_cliente", etiqueta: "Nome do produto", obrigatoria: true },
          { chave: "categoria", etiqueta: "Código da categoria (ex.: CAM)", obrigatoria: true },
          { chave: "cod_modelo", etiqueta: "Código do modelo" },
          { chave: "tipo_fornecimento", etiqueta: "stock, producao ou compra" },
          { chave: "preco_base", etiqueta: "Preço base" },
          { chave: "iva_pct", etiqueta: "IVA (%)" },
          { chave: "n_colis", etiqueta: "Número de volumes" },
          { chave: "volume_m3", etiqueta: "Volume em m³" },
          { chave: "peso_kg", etiqueta: "Peso em kg" },
        ]}
        onImportar={async (linhas) => {
          const erros: string[] = [];
          let ok = 0;
          for (const [indice, linha] of linhas.entries()) {
            const numero = indice + 2;
            const categoria = (categorias?.linhas ?? []).find(
              (c) => c.codigo.toUpperCase() === (linha["categoria"] ?? "").trim().toUpperCase(),
            );
            if (!categoria) {
              erros.push(`Linha ${numero}: categoria “${linha["categoria"] ?? ""}” não existe.`);
              continue;
            }
            try {
              const preco = (linha["preco_base"] ?? "").replace(",", ".");
              const registo = paraLinha({
                ...VAZIO,
                cod_barras: linha["cod_barras"] ?? "",
                nome_cliente: linha["nome_cliente"] ?? "",
                cod_modelo: linha["cod_modelo"] ?? "",
                categoria_id: categoria.id,
                tipo_fornecimento: ((linha["tipo_fornecimento"] || "stock") as TipoFornecimento),
                preco_base: preco,
                iva_pct: (linha["iva_pct"] ?? "23").replace(",", ".") || "23",
                n_colis: linha["n_colis"] || "1",
                volume_m3: (linha["volume_m3"] ?? "").replace(",", "."),
                peso_kg: (linha["peso_kg"] ?? "").replace(",", "."),
                vendavel: Boolean(preco),
              });
              const { error } = await erp().from("produtos").insert(registo);
              if (error) throw error;
              ok += 1;
            } catch (erro) {
              erros.push(`Linha ${numero}: ${primeiraMensagem(erro)}`);
            }
          }
          recarregar();
          return { ok, erros };
        }}
      />
    </div>
  );
}

function DialogoVolumes({
  produto,
  onFechar,
  podeEditar,
}: {
  produto: Produto | null;
  onFechar: () => void;
  podeEditar: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["produto-colis", produto?.id],
    enabled: Boolean(produto),
    queryFn: async () => {
      const { data: linhas, error } = await erp()
        .from("v_produto_colis")
        .select("*")
        .eq("produto_id", produto!.id)
        .order("numero", { ascending: true });
      if (error) throw error;
      return (linhas ?? []) as ProdutoColi[];
    },
  });

  const mGuardar = useMutation({
    mutationFn: async (coli: { id: string; cod_barras_coli: string; descricao: string }) => {
      const { error } = await erp()
        .from("produto_colis")
        .update({
          cod_barras_coli: coli.cod_barras_coli || null,
          descricao: coli.descricao || null,
        })
        .eq("id", coli.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Volume guardado.");
      queryClient.invalidateQueries({ queryKey: ["produto-colis"] });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  return (
    <Dialog open={Boolean(produto)} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Volumes de {produto?.nome_cliente}</DialogTitle>
        </DialogHeader>
        {isPending && <p className="text-sm text-muted-foreground">A carregar…</p>}
        <div className="space-y-4">
          {(data ?? []).map((coli) => (
            <LinhaVolume
              key={coli.id}
              coli={coli}
              podeEditar={podeEditar}
              aGuardar={mGuardar.isPending}
              onGuardar={(valores) => mGuardar.mutate({ id: coli.id, ...valores })}
            />
          ))}
          {!isPending && (data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Este produto não tem volumes.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinhaVolume({
  coli,
  podeEditar,
  aGuardar,
  onGuardar,
}: {
  coli: ProdutoColi;
  podeEditar: boolean;
  aGuardar: boolean;
  onGuardar: (valores: { cod_barras_coli: string; descricao: string }) => void;
}) {
  const [barras, setBarras] = useState(coli.cod_barras_coli ?? "");
  const [descricao, setDescricao] = useState(coli.descricao ?? "");

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Volume {coli.numero}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label={`Código de barras do volume ${coli.numero}`}
          placeholder="Código de barras"
          value={barras}
          disabled={!podeEditar}
          onChange={(e) => setBarras(e.target.value)}
        />
        <Input
          aria-label={`Descrição do volume ${coli.numero}`}
          placeholder="Descrição (ex.: cabeceira)"
          value={descricao}
          disabled={!podeEditar}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>
      {podeEditar && (
        <Button
          size="sm"
          variant="outline"
          disabled={aGuardar}
          onClick={() => onGuardar({ cod_barras_coli: barras, descricao })}
        >
          Guardar volume
        </Button>
      )}
    </div>
  );
}
