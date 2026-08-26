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
import { Textarea } from "@/components/ui/textarea";
import { useListagem } from "@/hooks/use-listagem";
import { usePermissoes } from "@/hooks/use-permissoes";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaFornecedor } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import {
  IDIOMAS,
  METODOS_ENVIO,
  formatarDinheiro,
  type Fornecedor,
  type MetodoEnvio,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores — UP Vendas" },
      {
        name: "description",
        content:
          "Fornecedores da UP Móveis: contactos de encomenda, prazos, valor mínimo e condições de pagamento.",
      },
      { property: "og:title", content: "Fornecedores — UP Vendas" },
      { property: "og:description", content: "Gestão dos fornecedores da UP Móveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaFornecedores,
});

interface Formulario {
  nome: string;
  nif: string;
  pais: string;
  email_encomendas: string;
  telefone: string;
  morada: string;
  idioma: string;
  metodo_envio: MetodoEnvio;
  enviar_automatico: boolean;
  prazo_dias: string;
  valor_minimo_encomenda: string;
  condicoes_pagamento: string;
  observacoes: string;
  ativo: boolean;
}

const VAZIO: Formulario = {
  nome: "",
  nif: "",
  pais: "PT",
  email_encomendas: "",
  telefone: "",
  morada: "",
  idioma: "pt",
  metodo_envio: "email_manual",
  enviar_automatico: false,
  prazo_dias: "15",
  valor_minimo_encomenda: "",
  condicoes_pagamento: "",
  observacoes: "",
  ativo: true,
};

function PaginaFornecedores() {
  const { editarCatalogo } = usePermissoes();
  const estado = useListagem("nome", true);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<Fornecedor | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["fornecedores", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente],
    queryFn: () =>
      listar<Fornecedor>({
        tabela: "v_fornecedores",
        camposPesquisa: ["nome", "nif", "email_encomendas"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
      }),
  });

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["fornecedores"] });
    queryClient.invalidateQueries({ queryKey: ["fornecedores-opcoes"] });
  };

  const mGuardar = useMutation({
    mutationFn: async () => {
      const validado = esquemaFornecedor.parse(form);
      const linha = {
        ...validado,
        nif: validado.nif || null,
        email_encomendas: validado.email_encomendas || null,
        telefone: validado.telefone || null,
        morada: validado.morada || null,
        condicoes_pagamento: validado.condicoes_pagamento || null,
        observacoes: validado.observacoes || null,
      };
      if (emEdicao) {
        const { error } = await erp().from("fornecedores").update(linha).eq("id", emEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("fornecedores").insert(linha);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(emEdicao ? "Fornecedor guardado." : "Fornecedor criado.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("fornecedores", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Fornecedor enviado para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  function abrirEdicao(l: Fornecedor) {
    setEmEdicao(l);
    setForm({
      nome: l.nome,
      nif: l.nif ?? "",
      pais: l.pais,
      email_encomendas: l.email_encomendas ?? "",
      telefone: l.telefone ?? "",
      morada: l.morada ?? "",
      idioma: l.idioma,
      metodo_envio: l.metodo_envio,
      enviar_automatico: l.enviar_automatico,
      prazo_dias: String(l.prazo_dias ?? 15),
      valor_minimo_encomenda:
        l.valor_minimo_encomenda === null ? "" : String(l.valor_minimo_encomenda),
      condicoes_pagamento: l.condicoes_pagamento ?? "",
      observacoes: l.observacoes ?? "",
      ativo: l.ativo,
    });
    setAberto(true);
  }

  const colunas: Array<Coluna<Fornecedor>> = [
    {
      chave: "nome",
      cabecalho: "Fornecedor",
      ordenavel: true,
      celula: (l) => (
        <div>
          <p className="font-medium">{l.nome}</p>
          <p className="text-xs text-muted-foreground">
            {l.email_encomendas ?? "Sem email de encomendas"}
          </p>
        </div>
      ),
    },
    {
      chave: "metodo_envio",
      cabecalho: "Envio",
      esconderMobile: true,
      celula: (l) => (
        <div>
          {METODOS_ENVIO.find((m) => m.valor === l.metodo_envio)?.etiqueta ?? l.metodo_envio}
          {l.enviar_automatico && (
            <Badge variant="secondary" className="ml-2">
              Automático
            </Badge>
          )}
        </div>
      ),
    },
    {
      chave: "prazo_dias",
      cabecalho: "Prazo",
      alinharDireita: true,
      celula: (l) => `${l.prazo_dias} dias`,
    },
    {
      chave: "valor_minimo_encomenda",
      cabecalho: "Mínimo",
      esconderMobile: true,
      alinharDireita: true,
      celula: (l) => (l.valor_minimo_encomenda === null ? "—" : formatarDinheiro(l.valor_minimo_encomenda)),
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
              { chave: "editar", etiqueta: "Editar", icone: Pencil, onSelect: () => abrirEdicao(l) },
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
        titulo="Fornecedores"
        descricao="Quem nos abastece: para onde vão as encomendas, em quanto tempo chegam e com que condições."
        acao={
          editarCatalogo ? (
            <Button
              onClick={() => {
                setEmEdicao(null);
                setForm(VAZIO);
                setAberto(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Novo fornecedor
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
        vazio="Ainda não há fornecedores."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo fornecedor"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="f-nome">Nome</Label>
            <Input
              id="f-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-nif">NIF</Label>
            <Input
              id="f-nif"
              value={form.nif}
              onChange={(e) => setForm({ ...form, nif: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-pais">País</Label>
            <Input
              id="f-pais"
              maxLength={2}
              value={form.pais}
              onChange={(e) => setForm({ ...form, pais: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-email">Email de encomendas</Label>
            <Input
              id="f-email"
              type="email"
              value={form.email_encomendas}
              onChange={(e) => setForm({ ...form, email_encomendas: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-telefone">Telefone</Label>
            <Input
              id="f-telefone"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="f-morada">Morada</Label>
            <Input
              id="f-morada"
              value={form.morada}
              onChange={(e) => setForm({ ...form, morada: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-idioma">Idioma das encomendas</Label>
            <Select value={form.idioma} onValueChange={(v) => setForm({ ...form, idioma: v })}>
              <SelectTrigger id="f-idioma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDIOMAS.map((i) => (
                  <SelectItem key={i.valor} value={i.valor}>
                    {i.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-metodo">Método de envio</Label>
            <Select
              value={form.metodo_envio}
              onValueChange={(v) => setForm({ ...form, metodo_envio: v as MetodoEnvio })}
            >
              <SelectTrigger id="f-metodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODOS_ENVIO.map((m) => (
                  <SelectItem key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-prazo">Prazo de entrega (dias)</Label>
            <Input
              id="f-prazo"
              inputMode="numeric"
              value={form.prazo_dias}
              onChange={(e) => setForm({ ...form, prazo_dias: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-minimo">Valor mínimo de encomenda (€)</Label>
            <Input
              id="f-minimo"
              inputMode="decimal"
              placeholder="Sem mínimo"
              value={form.valor_minimo_encomenda}
              onChange={(e) => setForm({ ...form, valor_minimo_encomenda: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="f-condicoes">Condições de pagamento</Label>
            <Input
              id="f-condicoes"
              placeholder="30 dias após fatura"
              value={form.condicoes_pagamento}
              onChange={(e) => setForm({ ...form, condicoes_pagamento: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="f-obs">Observações</Label>
            <Textarea
              id="f-obs"
              rows={3}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <Interruptor
            id="f-auto"
            titulo="Enviar encomendas automaticamente"
            descricao="Precisa do email de encomendas preenchido."
            valor={form.enviar_automatico}
            onChange={(v) => setForm({ ...form, enviar_automatico: v })}
          />
          <Interruptor
            id="f-ativo"
            titulo="Ativo"
            descricao="Só fornecedores ativos podem ser escolhidos nos produtos."
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
