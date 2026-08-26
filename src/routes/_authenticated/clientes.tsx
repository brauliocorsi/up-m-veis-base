import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Merge, Pencil, Plus, Trash2, TriangleAlert, Upload } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { clientesSemelhantes, unificarClientes } from "@/lib/erp/clientes";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaCliente } from "@/lib/erp/esquemas";
import { eliminarRegisto, listar } from "@/lib/erp/listar";
import { nifValido } from "@/lib/erp/nif";
import {
  ETIQUETA_REGRA_DUPLICADO,
  TIPOS_CLIENTE,
  type Cliente,
  type ClienteSemelhante,
  type TipoCliente,
} from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — UP Vendas" },
      {
        name: "description",
        content:
          "Ficha de clientes da UP Móveis com validação de NIF, contactos, morada e deteção de duplicados.",
      },
      { property: "og:title", content: "Clientes — UP Vendas" },
      { property: "og:description", content: "Clientes da UP Móveis sem registos repetidos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaClientes,
});

interface Formulario {
  tipo: TipoCliente;
  nome: string;
  nome_fiscal: string;
  nif: string;
  nif_estrangeiro: boolean;
  pais: string;
  telefone_e164: string;
  telefone_alt: string;
  email: string;
  morada: string;
  cp4: string;
  cp3: string;
  localidade: string;
  concelho: string;
  distrito: string;
  observacoes: string;
  ativo: boolean;
}

const VAZIO: Formulario = {
  tipo: "particular",
  nome: "",
  nome_fiscal: "",
  nif: "",
  nif_estrangeiro: false,
  pais: "PT",
  telefone_e164: "",
  telefone_alt: "",
  email: "",
  morada: "",
  cp4: "",
  cp3: "",
  localidade: "",
  concelho: "",
  distrito: "",
  observacoes: "",
  ativo: true,
};

function PaginaClientes() {
  const { editarClientes, adm } = usePermissoes();
  const estado = useListagem("nome", true);
  const queryClient = useQueryClient();

  const [aberto, setAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [paraEliminar, setParaEliminar] = useState<Cliente | null>(null);
  const [importar, setImportar] = useState(false);
  const [duplicados, setDuplicados] = useState<ClienteSemelhante[]>([]);
  const [unificarDe, setUnificarDe] = useState<Cliente | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["clientes", estado.pesquisa, estado.pagina, estado.ordenarPor, estado.ascendente],
    queryFn: () =>
      listar<Cliente>({
        tabela: "v_clientes",
        camposPesquisa: ["nome", "nif", "telefone_e164", "email", "localidade"],
        pesquisa: estado.pesquisa,
        ordenarPor: estado.ordenarPor,
        ascendente: estado.ascendente,
        pagina: estado.pagina,
        tamanho: estado.tamanho,
      }),
  });

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["clientes"] });

  function paraLinha(f: Formulario) {
    const validado = esquemaCliente.parse(f);
    return {
      ...validado,
      nome_fiscal: validado.nome_fiscal || null,
      nif: validado.nif || null,
      telefone_e164: validado.telefone_e164 || null,
      telefone_alt: validado.telefone_alt || null,
      email: validado.email || null,
      morada: validado.morada || null,
      cp4: validado.cp4 || null,
      cp3: validado.cp3 || null,
      localidade: validado.localidade || null,
      concelho: validado.concelho || null,
      distrito: validado.distrito || null,
      observacoes: validado.observacoes || null,
    };
  }

  const mGuardar = useMutation({
    mutationFn: async () => {
      const linha = paraLinha(form);
      if (emEdicao) {
        const { error } = await erp().from("clientes").update(linha).eq("id", emEdicao.id);
        if (error) throw error;
      } else {
        const { error } = await erp().from("clientes").insert(linha);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(emEdicao ? "Cliente guardado." : "Cliente criado.");
      setAberto(false);
      setEmEdicao(null);
      setForm(VAZIO);
      setDuplicados([]);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mEliminar = useMutation({
    mutationFn: async (motivo: string) => {
      if (paraEliminar) await eliminarRegisto("clientes", paraEliminar.id, motivo);
    },
    onSuccess: () => {
      toast.success("Cliente enviado para a lixeira.");
      setParaEliminar(null);
      recarregar();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mProcurar = useMutation({
    mutationFn: () =>
      clientesSemelhantes({
        nome: form.nome,
        nif: form.nif,
        telefone: form.telefone_e164,
        email: form.email,
        cp4: form.cp4,
        excluir: emEdicao?.id ?? null,
      }),
    onSuccess: (encontrados) => {
      setDuplicados(encontrados);
      if (encontrados.length === 0) toast.success("Não encontrámos clientes parecidos.");
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  function abrirEdicao(l: Cliente) {
    setEmEdicao(l);
    setDuplicados([]);
    setForm({
      tipo: l.tipo,
      nome: l.nome,
      nome_fiscal: l.nome_fiscal ?? "",
      nif: l.nif ?? "",
      nif_estrangeiro: l.nif_estrangeiro,
      pais: l.pais,
      telefone_e164: l.telefone_e164 ?? "",
      telefone_alt: l.telefone_alt ?? "",
      email: l.email ?? "",
      morada: l.morada ?? "",
      cp4: l.cp4 ?? "",
      cp3: l.cp3 ?? "",
      localidade: l.localidade ?? "",
      concelho: l.concelho ?? "",
      distrito: l.distrito ?? "",
      observacoes: l.observacoes ?? "",
      ativo: l.ativo,
    });
    setAberto(true);
  }

  const nifPreenchido = form.nif.trim().length > 0;
  const nifEstaValido = form.nif_estrangeiro || nifValido(form.nif);

  const colunas: Array<Coluna<Cliente>> = [
    {
      chave: "nome",
      cabecalho: "Cliente",
      ordenavel: true,
      celula: (l) => (
        <div>
          <p className="font-medium">{l.nome}</p>
          <p className="text-xs text-muted-foreground">
            {l.telefone_e164 ?? l.email ?? "Sem contacto"}
          </p>
        </div>
      ),
    },
    {
      chave: "nif",
      cabecalho: "NIF",
      esconderMobile: true,
      celula: (l) =>
        l.nif ? (
          <span className="inline-flex items-center gap-2">
            {l.nif}
            {l.nif_ok === false && (
              <Badge variant="destructive" className="gap-1">
                <TriangleAlert className="h-3 w-3" /> inválido
              </Badge>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    {
      chave: "localidade",
      cabecalho: "Localidade",
      esconderMobile: true,
      celula: (l) =>
        [l.cp4 && l.cp3 ? `${l.cp4}-${l.cp3}` : l.cp4, l.localidade].filter(Boolean).join(" ") || "—",
    },
    {
      chave: "tipo",
      cabecalho: "Tipo",
      celula: (l) => (
        <Badge variant={l.tipo === "empresa" ? "secondary" : "outline"}>
          {TIPOS_CLIENTE.find((t) => t.valor === l.tipo)?.etiqueta ?? l.tipo}
        </Badge>
      ),
    },
    {
      chave: "acoes",
      cabecalho: "",
      alinharDireita: true,
      celula: (l) => (
        <GrupoAcoes
          acoes={[
            ...(editarClientes
              ? [
                  {
                    chave: "editar",
                    etiqueta: "Editar",
                    icone: Pencil,
                    onSelect: () => abrirEdicao(l),
                  },
                ]
              : []),
            ...(adm
              ? [
                  {
                    chave: "unificar",
                    etiqueta: "Unificar duplicados",
                    icone: Merge,
                    onSelect: () => setUnificarDe(l),
                  },
                  {
                    chave: "eliminar",
                    etiqueta: "Eliminar",
                    icone: Trash2,
                    destrutiva: true,
                    onSelect: () => setParaEliminar(l),
                  },
                ]
              : editarClientes
                ? [
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
        titulo="Clientes"
        descricao="Uma ficha por pessoa: contactos, morada e NIF verificado, sem registos repetidos."
        acao={
          editarClientes ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportar(true)}>
                <Upload className="mr-2 h-4 w-4" /> Importar CSV
              </Button>
              <Button
                onClick={() => {
                  setEmEdicao(null);
                  setForm(VAZIO);
                  setDuplicados([]);
                  setAberto(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Novo cliente
              </Button>
            </div>
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
        vazio="Ainda não há clientes."
      />

      <DialogoForm
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo cliente"}
        aGuardar={mGuardar.isPending}
        onGuardar={() => mGuardar.mutate()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-tipo">Tipo de cliente</Label>
            <Select
              value={form.tipo}
              onValueChange={(v) => setForm({ ...form, tipo: v as TipoCliente })}
            >
              <SelectTrigger id="c-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_CLIENTE.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-pais">País</Label>
            <Input
              id="c-pais"
              maxLength={2}
              value={form.pais}
              onChange={(e) => setForm({ ...form, pais: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-nome">Nome</Label>
            <Input
              id="c-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-fiscal">Nome fiscal (se for diferente)</Label>
            <Input
              id="c-fiscal"
              value={form.nome_fiscal}
              onChange={(e) => setForm({ ...form, nome_fiscal: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-nif">NIF</Label>
            <Input
              id="c-nif"
              inputMode="numeric"
              value={form.nif}
              onChange={(e) => setForm({ ...form, nif: e.target.value })}
            />
            {nifPreenchido && !nifEstaValido && (
              <p className="text-xs text-destructive">
                Este NIF não passa a verificação portuguesa. Confirme os números ou marque como
                estrangeiro.
              </p>
            )}
            {nifPreenchido && nifEstaValido && (
              <p className="text-xs text-muted-foreground">NIF verificado.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-telefone">Telefone</Label>
            <Input
              id="c-telefone"
              inputMode="tel"
              value={form.telefone_e164}
              onChange={(e) => setForm({ ...form, telefone_e164: e.target.value })}
              placeholder="912 345 678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-telefone-alt">Telefone alternativo</Label>
            <Input
              id="c-telefone-alt"
              inputMode="tel"
              value={form.telefone_alt}
              onChange={(e) => setForm({ ...form, telefone_alt: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-morada">Morada</Label>
            <Input
              id="c-morada"
              value={form.morada}
              onChange={(e) => setForm({ ...form, morada: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-cp4">Código postal</Label>
            <div className="flex items-center gap-2">
              <Input
                id="c-cp4"
                inputMode="numeric"
                maxLength={4}
                value={form.cp4}
                onChange={(e) => setForm({ ...form, cp4: e.target.value })}
                placeholder="4700"
              />
              <span aria-hidden>-</span>
              <Input
                aria-label="Extensão do código postal"
                inputMode="numeric"
                maxLength={3}
                value={form.cp3}
                onChange={(e) => setForm({ ...form, cp3: e.target.value })}
                placeholder="123"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-localidade">Localidade</Label>
            <Input
              id="c-localidade"
              value={form.localidade}
              onChange={(e) => setForm({ ...form, localidade: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-concelho">Concelho</Label>
            <Input
              id="c-concelho"
              value={form.concelho}
              onChange={(e) => setForm({ ...form, concelho: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-distrito">Distrito</Label>
            <Input
              id="c-distrito"
              value={form.distrito}
              onChange={(e) => setForm({ ...form, distrito: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-obs">Observações</Label>
            <Textarea
              id="c-obs"
              rows={3}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <Interruptor
            id="c-estrangeiro"
            titulo="NIF estrangeiro"
            descricao="Ligue para números fiscais de fora de Portugal."
            valor={form.nif_estrangeiro}
            onChange={(v) => setForm({ ...form, nif_estrangeiro: v })}
          />
          <Interruptor
            id="c-ativo"
            titulo="Ativo"
            descricao="Clientes inativos deixam de aparecer nas novas vendas."
            valor={form.ativo}
            onChange={(v) => setForm({ ...form, ativo: v })}
          />
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Já existe este cliente?</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={mProcurar.isPending}
              onClick={() => mProcurar.mutate()}
            >
              {mProcurar.isPending ? "A procurar…" : "Procurar parecidos"}
            </Button>
          </div>
          {duplicados.length > 0 && (
            <ul className="space-y-2 text-sm">
              {duplicados.map((d) => (
                <li key={d.id} className="rounded-md bg-muted/50 p-2">
                  <p className="font-medium">{d.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {ETIQUETA_REGRA_DUPLICADO[d.regra] ?? d.regra} ·{" "}
                    {[d.nif, d.telefone_e164, d.email].filter(Boolean).join(" · ") || "sem contactos"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogoForm>

      <DialogoEliminar
        aberto={Boolean(paraEliminar)}
        onFechar={() => setParaEliminar(null)}
        nomeRegisto={paraEliminar?.nome ?? ""}
        aGuardar={mEliminar.isPending}
        onConfirmar={(motivo) => mEliminar.mutate(motivo)}
      />

      <DialogoUnificar
        cliente={unificarDe}
        onFechar={() => setUnificarDe(null)}
        onUnificado={() => {
          setUnificarDe(null);
          recarregar();
        }}
      />

      <ImportarCsv
        aberto={importar}
        onFechar={() => setImportar(false)}
        titulo="Importar clientes"
        colunas={[
          { chave: "nome", etiqueta: "Nome", obrigatoria: true },
          { chave: "nif", etiqueta: "NIF" },
          { chave: "telefone", etiqueta: "Telefone" },
          { chave: "email", etiqueta: "Email" },
          { chave: "morada", etiqueta: "Morada" },
          { chave: "cp4", etiqueta: "Código postal (4 dígitos)" },
          { chave: "cp3", etiqueta: "Extensão do código postal (3 dígitos)" },
          { chave: "localidade", etiqueta: "Localidade" },
          { chave: "tipo", etiqueta: "particular ou empresa" },
        ]}
        onImportar={async (linhas) => {
          const erros: string[] = [];
          let ok = 0;
          for (const [indice, linha] of linhas.entries()) {
            const numero = indice + 2;
            try {
              const registo = paraLinha({
                ...VAZIO,
                tipo: (linha["tipo"] === "empresa" ? "empresa" : "particular") as TipoCliente,
                nome: linha["nome"] ?? "",
                nif: linha["nif"] ?? "",
                telefone_e164: linha["telefone"] ?? "",
                email: linha["email"] ?? "",
                morada: linha["morada"] ?? "",
                cp4: linha["cp4"] ?? "",
                cp3: linha["cp3"] ?? "",
                localidade: linha["localidade"] ?? "",
              });
              const parecidos = await clientesSemelhantes({
                nome: registo.nome,
                nif: registo.nif,
                telefone: registo.telefone_e164,
                email: registo.email,
                cp4: registo.cp4,
              });
              const forte = parecidos.find((p) => p.score >= 85);
              if (forte) {
                erros.push(`Linha ${numero}: já existe “${forte.nome}” (${ETIQUETA_REGRA_DUPLICADO[forte.regra] ?? forte.regra}).`);
                continue;
              }
              const { error } = await erp().from("clientes").insert(registo);
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

function DialogoUnificar({
  cliente,
  onFechar,
  onUnificado,
}: {
  cliente: Cliente | null;
  onFechar: () => void;
  onUnificado: () => void;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["clientes-duplicados", cliente?.id],
    enabled: Boolean(cliente),
    queryFn: () =>
      clientesSemelhantes({
        nome: cliente!.nome,
        nif: cliente!.nif,
        telefone: cliente!.telefone_e164,
        email: cliente!.email,
        cp4: cliente!.cp4,
        excluir: cliente!.id,
      }),
  });

  const mUnificar = useMutation({
    mutationFn: (candidato: ClienteSemelhante) =>
      unificarClientes({
        manter: cliente!.id,
        absorver: candidato.id,
        regra: candidato.regra,
        score: candidato.score,
        motivo: `Unificado com ${cliente!.nome}`,
      }),
    onSuccess: () => {
      toast.success("Clientes unificados. A ficha antiga ficou guardada no histórico.");
      onUnificado();
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  return (
    <Dialog open={Boolean(cliente)} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Unificar duplicados de {cliente?.nome}</DialogTitle>
          <DialogDescription>
            A ficha que fica é a de {cliente?.nome}. A outra é guardada no histórico e vai para a
            lixeira — nada se apaga.
          </DialogDescription>
        </DialogHeader>

        {isPending && <p className="text-sm text-muted-foreground">A procurar parecidos…</p>}
        {!isPending && (data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Não encontrámos fichas parecidas.</p>
        )}
        <ul className="space-y-2">
          {(data ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{d.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {ETIQUETA_REGRA_DUPLICADO[d.regra] ?? d.regra} ·{" "}
                  {[d.nif, d.telefone_e164, d.email, d.localidade].filter(Boolean).join(" · ") ||
                    "sem contactos"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={mUnificar.isPending}
                onClick={() => mUnificar.mutate(d)}
              >
                <Merge className="mr-2 h-4 w-4" /> Absorver nesta ficha
              </Button>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
