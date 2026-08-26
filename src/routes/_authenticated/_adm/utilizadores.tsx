import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useListagem } from "@/hooks/use-listagem";
import { useSessao } from "@/hooks/use-sessao";
import { erp, mensagemErro } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaCriarUtilizador, esquemaEditarUtilizador } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import { criarUtilizador, definirPalavraPasse } from "@/lib/erp/utilizadores.functions";
import {
  ETIQUETA_PERFIL,
  PERFIS,
  formatarData,
  type Perfil,
  type Utilizador,
} from "@/lib/erp/tipos";


export const Route = createFileRoute("/_authenticated/_adm/utilizadores")({
  head: () => ({
    meta: [
      { title: "Utilizadores — UP Vendas" },
      {
        name: "description",
        content: "Criar contas, definir perfis e palavras-passe da equipa da UP Móveis.",
      },
      { property: "og:title", content: "Utilizadores — UP Vendas" },
      { property: "og:description", content: "Gestão das contas de acesso da UP Móveis." },
    ],
  }),
  component: PaginaUtilizadores,
});

const VAZIO = { nome: "", email: "", telefone: "", perfil: "vendedora" as Perfil, palavra_passe: "" };

function PaginaUtilizadores() {
  const estado = useListagem("nome", true);
  const queryClient = useQueryClient();
  const { data: sessao } = useSessao();
  const criar = useServerFn(criarUtilizador);
  const novaPalavraPasse = useServerFn(definirPalavraPasse);

  const [dialogoNovo, setDialogoNovo] = useState(false);
  const [novo, setNovo] = useState(VAZIO);
  const [emEdicao, setEmEdicao] = useState<Utilizador | null>(null);
  const [edicao, setEdicao] = useState({
    nome: "",
    telefone: "",
    perfil: "vendedora" as Perfil,
    ativo: true,
  });
  const [paraEliminar, setParaEliminar] = useState<Utilizador | null>(null);
  const [paraPalavraPasse, setParaPalavraPasse] = useState<Utilizador | null>(null);
  const [palavraPasse, setPalavraPasse] = useState("");

  const chaveLista = [
    "utilizadores",
    estado.pesquisa,
    estado.pagina,
    estado.ordenarPor,
    estado.ascendente,
  ];

  const { data, isPending } = useQuery({
    queryKey: chaveLista,
    queryFn: () =>
      listar<Utilizador>({
        tabela: "v_utilizadores",
        camposPesquisa: ["nome", "email", "telefone"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
      }),
  });

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["utilizadores"] });
  }

  const mCriar = useMutation({
    mutationFn: async () => {
      const validado = esquemaCriarUtilizador.parse(novo);
      await criar({ data: validado });
    },
    onSuccess: () => {
      toast.success("Utilizador criado. Já pode entrar com a palavra-passe que definiu.");
      setDialogoNovo(false);
      setNovo(VAZIO);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEditar = useMutation({
    mutationFn: async () => {
      const validado = esquemaEditarUtilizador.parse(edicao);
      const { error } = await erp()
        .from("utilizadores")
        .update({
          nome: validado.nome,
          telefone: validado.telefone || null,
          perfil: validado.perfil,
          ativo: validado.ativo,
        })
        .eq("id", emEdicao?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados guardados.");
      setEmEdicao(null);
      recarregar();
      queryClient.invalidateQueries({ queryKey: ["sessao"] });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mPalavraPasse = useMutation({
    mutationFn: async () => {
      if (!paraPalavraPasse) return;
      await novaPalavraPasse({
        data: { user_id: paraPalavraPasse.user_id, palavra_passe: palavraPasse },
      });
    },
    onSuccess: () => {
      toast.success("Palavra-passe atualizada.");
      setParaPalavraPasse(null);
      setPalavraPasse("");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (!paraEliminar) return;
      await eliminarRegisto("utilizadores", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Utilizador enviado para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(mensagemErro(erro)),
  });

  const colunas: Array<Coluna<Utilizador>> = [
    {
      chave: "nome",
      cabecalho: "Nome",
      ordenavel: true,
      celula: (linha) => (
        <div>
          <p className="font-medium">{linha.nome}</p>
          <p className="text-xs text-muted-foreground md:hidden">{linha.email}</p>
        </div>
      ),
    },
    {
      chave: "email",
      cabecalho: "Email",
      esconderMobile: true,
      celula: (linha) => linha.email,
    },
    {
      chave: "perfil",
      cabecalho: "Perfil",
      ordenavel: true,
      celula: (linha) => <Badge variant="secondary">{ETIQUETA_PERFIL[linha.perfil]}</Badge>,
    },
    {
      chave: "ativo",
      cabecalho: "Estado",
      esconderMobile: true,
      celula: (linha) => (
        <Badge variant={linha.ativo ? "default" : "outline"}>
          {linha.ativo ? "Ativo" : "Desativado"}
        </Badge>
      ),
    },
    {
      chave: "criado_em",
      cabecalho: "Criado",
      ordenavel: true,
      esconderMobile: true,
      celula: (linha) => formatarData(linha.criado_em),
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
                setEdicao({
                  nome: linha.nome,
                  telefone: linha.telefone ?? "",
                  perfil: linha.perfil,
                  ativo: linha.ativo,
                });
              },
            },
            {
              chave: "palavra-passe",
              etiqueta: "Definir palavra-passe",
              icone: KeyRound,
              onSelect: () => {
                setParaPalavraPasse(linha);
                setPalavraPasse("");
              },
            },
            {
              chave: "eliminar",
              etiqueta: "Eliminar",
              icone: Trash2,
              destrutiva: true,
              desativada: linha.user_id === sessao?.userId,
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
        titulo="Utilizadores"
        descricao="As contas são criadas aqui pela Administração. Não existe registo público."
        acao={
          <Button onClick={() => setDialogoNovo(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo utilizador
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
        vazio="Ainda não há utilizadores."
      />

      <DialogoForm
        aberto={dialogoNovo}
        onFechar={() => setDialogoNovo(false)}
        titulo="Novo utilizador"
        descricao="Defina o perfil e a palavra-passe inicial. A pessoa entra logo com estes dados."
        aGuardar={mCriar.isPending}
        onGuardar={() => mCriar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="nome">Nome completo</Label>
          <Input
            id="nome"
            value={novo.nome}
            onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={novo.email}
            onChange={(e) => setNovo({ ...novo, email: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone (opcional)</Label>
          <Input
            id="telefone"
            value={novo.telefone}
            onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="perfil">Perfil</Label>
          <Select
            value={novo.perfil}
            onValueChange={(v) => setNovo({ ...novo, perfil: v as Perfil })}
          >
            <SelectTrigger id="perfil">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERFIS.map((p) => (
                <SelectItem key={p.valor} value={p.valor}>
                  {p.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pp">Palavra-passe inicial</Label>
          <Input
            id="pp"
            type="text"
            autoComplete="new-password"
            value={novo.palavra_passe}
            onChange={(e) => setNovo({ ...novo, palavra_passe: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
        </div>
      </DialogoForm>

      <DialogoForm
        aberto={Boolean(emEdicao)}
        onFechar={() => setEmEdicao(null)}
        titulo={`Editar ${emEdicao?.nome ?? ""}`}
        descricao="O email de acesso não pode ser alterado."
        aGuardar={mEditar.isPending}
        onGuardar={() => mEditar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="e-nome">Nome completo</Label>
          <Input
            id="e-nome"
            value={edicao.nome}
            onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="e-telefone">Telefone</Label>
          <Input
            id="e-telefone"
            value={edicao.telefone}
            onChange={(e) => setEdicao({ ...edicao, telefone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="e-perfil">Perfil</Label>
          <Select
            value={edicao.perfil}
            onValueChange={(v) => setEdicao({ ...edicao, perfil: v as Perfil })}
          >
            <SelectTrigger id="e-perfil">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERFIS.map((p) => (
                <SelectItem key={p.valor} value={p.valor}>
                  {p.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="e-ativo">Conta ativa</Label>
            <p className="text-xs text-muted-foreground">Se desativar, deixa de poder entrar.</p>
          </div>
          <Switch
            id="e-ativo"
            checked={edicao.ativo}
            onCheckedChange={(v) => setEdicao({ ...edicao, ativo: v })}
          />
        </div>
      </DialogoForm>

      <DialogoForm
        aberto={Boolean(paraPalavraPasse)}
        onFechar={() => setParaPalavraPasse(null)}
        titulo={`Palavra-passe de ${paraPalavraPasse?.nome ?? ""}`}
        descricao="Escreva a nova palavra-passe e entregue-a à pessoa."
        aGuardar={mPalavraPasse.isPending}
        onGuardar={() => mPalavraPasse.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="nova-pp">Nova palavra-passe</Label>
          <Input
            id="nova-pp"
            value={palavraPasse}
            onChange={(e) => setPalavraPasse(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
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

export function primeiraMensagem(erro: unknown): string {
  const objeto = erro as { issues?: Array<{ message: string }>; message?: string };
  if (objeto?.issues?.length) return objeto.issues[0]!.message;
  return mensagemErro(erro, objeto?.message ?? undefined);
}
