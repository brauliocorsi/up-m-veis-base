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
import { esquemaFormaPagamento } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import {
  ESTADOS_INICIAIS,
  MOMENTOS,
  type EstadoInicial,
  type FormaPagamento,
  type Momento,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/formas-pagamento")({
  head: () => ({
    meta: [
      { title: "Formas de pagamento — UP Vendas" },
      {
        name: "description",
        content:
          "Configurar formas de pagamento da UP Móveis: momento, estado inicial, taxa e caixa.",
      },
      { property: "og:title", content: "Formas de pagamento — UP Vendas" },
      { property: "og:description", content: "Configuração das formas de pagamento da UP Móveis." },
    ],
  }),
  component: PaginaFormas,
});

interface Formulario {
  codigo: string;
  nome: string;
  momento: Momento;
  estado_inicial: EstadoInicial;
  exige_comprovativo: boolean;
  prazo_confirmacao_horas: string;
  taxa_pct: string;
  entra_caixa: boolean;
  ordem: string;
  ativo: boolean;
}

const VAZIO: Formulario = {
  codigo: "",
  nome: "",
  momento: "loja",
  estado_inicial: "confirmado",
  exige_comprovativo: false,
  prazo_confirmacao_horas: "",
  taxa_pct: "0",
  entra_caixa: true,
  ordem: "0",
  ativo: true,
};

function PaginaFormas() {
  const estado = useListagem("ordem", true);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<FormaPagamento | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<FormaPagamento | null>(null);

  const { data, isPending } = useQuery({
    queryKey: [
      "formas-pagamento",
      estado.pesquisa,
      estado.pagina,
      estado.ordenarPor,
      estado.ascendente,
    ],
    queryFn: () =>
      listar<FormaPagamento>({
        tabela: "v_formas_pagamento",
        camposPesquisa: ["nome", "codigo"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
      }),
  });

  const recarregar = () =>
    queryClient.invalidateQueries({ queryKey: ["formas-pagamento"] });

  const mGuardar = useMutation({
    mutationFn: async () => {
      const validado = esquemaFormaPagamento.parse({
        ...form,
        prazo_confirmacao_horas: form.prazo_confirmacao_horas
          ? Number(form.prazo_confirmacao_horas)
          : null,
      });
      const linha = { ...validado };
      if (emEdicao) {
        const { error } = await erp().from("formas_pagamento").update(linha).eq("id", emEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("formas_pagamento").insert(linha);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(emEdicao ? "Forma de pagamento guardada." : "Forma de pagamento criada.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("formas_pagamento", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Forma de pagamento enviada para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  function abrirNovo() {
    setEmEdicao(null);
    setForm(VAZIO);
    setAberto(true);
  }

  function abrirEdicao(linha: FormaPagamento) {
    setEmEdicao(linha);
    setForm({
      codigo: linha.codigo,
      nome: linha.nome,
      momento: linha.momento,
      estado_inicial: linha.estado_inicial,
      exige_comprovativo: linha.exige_comprovativo,
      prazo_confirmacao_horas: linha.prazo_confirmacao_horas?.toString() ?? "",
      taxa_pct: String(linha.taxa_pct ?? 0),
      entra_caixa: linha.entra_caixa,
      ordem: String(linha.ordem ?? 0),
      ativo: linha.ativo,
    });
    setAberto(true);
  }

  const colunas: Array<Coluna<FormaPagamento>> = [
    {
      chave: "nome",
      cabecalho: "Nome",
      ordenavel: true,
      celula: (linha) => (
        <div>
          <p className="font-medium">{linha.nome}</p>
          <p className="text-xs text-muted-foreground">{linha.codigo}</p>
        </div>
      ),
    },
    {
      chave: "momento",
      cabecalho: "Momento",
      esconderMobile: true,
      celula: (linha) => MOMENTOS.find((m) => m.valor === linha.momento)?.etiqueta ?? linha.momento,
    },
    {
      chave: "estado_inicial",
      cabecalho: "Estado inicial",
      esconderMobile: true,
      celula: (linha) =>
        ESTADOS_INICIAIS.find((e) => e.valor === linha.estado_inicial)?.etiqueta ??
        linha.estado_inicial,
    },
    {
      chave: "taxa_pct",
      cabecalho: "Taxa",
      alinharDireita: true,
      celula: (linha) => `${Number(linha.taxa_pct ?? 0).toFixed(2)} %`,
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
        titulo="Formas de pagamento"
        descricao="Como o dinheiro entra: momento do pagamento, estado inicial, taxa e entrada em caixa."
        acao={
          <Button onClick={abrirNovo}>
            <Plus className="mr-2 h-4 w-4" /> Nova forma
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
        vazio="Ainda não há formas de pagamento."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Nova forma de pagamento"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="codigo">Código</Label>
            <Input
              id="codigo"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
              placeholder="MBWAY"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="momento">Momento</Label>
            <Select
              value={form.momento}
              onValueChange={(v) => setForm({ ...form, momento: v as Momento })}
            >
              <SelectTrigger id="momento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOMENTOS.map((m) => (
                  <SelectItem key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="estado-inicial">Estado inicial</Label>
            <Select
              value={form.estado_inicial}
              onValueChange={(v) => setForm({ ...form, estado_inicial: v as EstadoInicial })}
            >
              <SelectTrigger id="estado-inicial">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_INICIAIS.map((e) => (
                  <SelectItem key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxa">Taxa (%)</Label>
            <Input
              id="taxa"
              inputMode="decimal"
              value={form.taxa_pct}
              onChange={(e) => setForm({ ...form, taxa_pct: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prazo">Prazo de confirmação (horas)</Label>
            <Input
              id="prazo"
              inputMode="numeric"
              value={form.prazo_confirmacao_horas}
              onChange={(e) => setForm({ ...form, prazo_confirmacao_horas: e.target.value })}
              placeholder="Sem prazo"
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
        </div>

        <div className="space-y-3">
          <Interruptor
            id="comprovativo"
            titulo="Exige comprovativo"
            descricao="Obriga a anexar prova do pagamento."
            valor={form.exige_comprovativo}
            onChange={(v) => setForm({ ...form, exige_comprovativo: v })}
          />
          <Interruptor
            id="caixa"
            titulo="Entra na caixa da loja"
            descricao="Desligue para transferências e financiamentos."
            valor={form.entra_caixa}
            onChange={(v) => setForm({ ...form, entra_caixa: v })}
          />
          <Interruptor
            id="ativo"
            titulo="Ativa"
            descricao="Só as formas ativas aparecem nas vendas."
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
