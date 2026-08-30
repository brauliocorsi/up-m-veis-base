import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { erp } from "@/lib/erp/db";
import { carregarLogotipo, urlDocumento } from "@/lib/erp/empresa.functions";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaDefinicoesGerais, esquemaEmpresa } from "@/lib/erp/esquemas";
import { PERFIS, type Perfil } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/definicoes")({
  head: () => ({
    meta: [
      { title: "Definições — UP Vendas" },
      {
        name: "description",
        content: "Dados da empresa, IVA, prazos e limites de desconto por perfil na UP Móveis.",
      },
      { property: "og:title", content: "Definições — UP Vendas" },
      { property: "og:description", content: "Regras gerais do ERP da UP Móveis." },
    ],
  }),
  component: PaginaDefinicoes,
});

interface Empresa {
  nome: string;
  nif: string;
  morada: string;
  telefone: string;
  email: string;
  logotipo_url: string;
  logotipo_path: string;
  mensagem_documento: string;
  apoio_url: string;
  observacoes_documento: string;
}

const EMPRESA_VAZIA: Empresa = {
  nome: "",
  nif: "",
  morada: "",
  telefone: "",
  email: "",
  logotipo_url: "",
  logotipo_path: "",
  mensagem_documento: "",
  apoio_url: "",
  observacoes_documento: "",
};

type Limites = Record<Perfil, number>;

function PaginaDefinicoes() {
  const queryClient = useQueryClient();

  const { data: definicoes } = useQuery({
    queryKey: ["definicoes"],
    queryFn: async () => {
      const { data, error } = await erp().from("v_definicoes").select("chave, valor");
      if (error) throw error;
      const mapa: Record<string, unknown> = {};
      for (const linha of (data ?? []) as Array<{ chave: string; valor: unknown }>) {
        mapa[linha.chave] = linha.valor;
      }
      return mapa;
    },
  });

  const [empresa, setEmpresa] = useState<Empresa>(EMPRESA_VAZIA);
  const [gerais, setGerais] = useState({
    iva_pct: "23",
    dias_separacao: "1",
    validade_orcamento_dias: "15",
  });
  const [limites, setLimites] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!definicoes) return;
    const e = (definicoes["empresa"] ?? {}) as Partial<Empresa>;
    setEmpresa({ ...EMPRESA_VAZIA, ...e });
    setGerais({
      iva_pct: String(definicoes["iva_pct"] ?? 23),
      dias_separacao: String(definicoes["dias_separacao"] ?? 1),
      validade_orcamento_dias: String(definicoes["validade_orcamento_dias"] ?? 15),
    });
    const l = (definicoes["limites_desconto_pct"] ?? {}) as Partial<Limites>;
    setLimites(
      Object.fromEntries(PERFIS.map((p) => [p.valor, String(l[p.valor] ?? 0)])) as Record<
        string,
        string
      >,
    );
  }, [definicoes]);

  const enviarLogotipo = useServerFn(carregarLogotipo);
  const pedirUrl = useServerFn(urlDocumento);
  const [prevLogo, setPrevLogo] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  useEffect(() => {
    if (!empresa.logotipo_path) {
      setPrevLogo(null);
      return;
    }
    let vivo = true;
    pedirUrl({ data: { caminho: empresa.logotipo_path } })
      .then((r) => {
        if (vivo) setPrevLogo(r.url);
      })
      .catch(() => setPrevLogo(null));
    return () => {
      vivo = false;
    };
  }, [empresa.logotipo_path, pedirUrl]);

  async function escolherLogotipo(ficheiro: File) {
    if (!/^image\/(png|jpeg)$/.test(ficheiro.type)) {
      toast.error("Use uma imagem PNG ou JPG.");
      return;
    }
    setAEnviar(true);
    try {
      const buffer = await ficheiro.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
      const resultado = await enviarLogotipo({
        data: { base64: btoa(bin), tipo: ficheiro.type as "image/png" | "image/jpeg" },
      });
      const atualizada = { ...empresa, logotipo_path: resultado.caminho };
      setEmpresa(atualizada);
      setPrevLogo(resultado.url);
      await gravar("empresa", esquemaEmpresa.parse(atualizada));
      queryClient.invalidateQueries({ queryKey: ["definicoes"] });
      toast.success("Logótipo atualizado.");
    } catch (erro) {
      toast.error(primeiraMensagem(erro));
    } finally {
      setAEnviar(false);
    }
  }


  async function gravar(chave: string, valor: unknown) {
    const { error } = await erp().from("definicoes").update({ valor }).eq("chave", chave);
    if (error) throw error;
  }

  const mEmpresa = useMutation({
    mutationFn: async () => {
      const validado = esquemaEmpresa.parse(empresa);
      await gravar("empresa", validado);
    },
    onSuccess: () => {
      toast.success("Dados da empresa guardados.");
      queryClient.invalidateQueries({ queryKey: ["definicoes"] });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const mGerais = useMutation({
    mutationFn: async () => {
      const validado = esquemaDefinicoesGerais.parse({
        ...gerais,
        limite_vendedora: limites["vendedora"] ?? 0,
        limite_escritorio: limites["escritorio"] ?? 0,
        limite_compras: limites["compras"] ?? 0,
        limite_financeiro: limites["financeiro"] ?? 0,
        limite_adm: limites["adm"] ?? 0,
      });
      await gravar("iva_pct", validado.iva_pct);
      await gravar("dias_separacao", validado.dias_separacao);
      await gravar("validade_orcamento_dias", validado.validade_orcamento_dias);
      await gravar("limites_desconto_pct", {
        vendedora: validado.limite_vendedora,
        escritorio: validado.limite_escritorio,
        compras: validado.limite_compras,
        financeiro: validado.limite_financeiro,
        adm: validado.limite_adm,
      });
    },
    onSuccess: () => {
      toast.success("Definições guardadas.");
      queryClient.invalidateQueries({ queryKey: ["definicoes"] });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Definições"
        descricao="Dados da empresa, IVA, prazos e limites de desconto por perfil."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresa</CardTitle>
          <CardDescription>Aparecem nos documentos entregues ao cliente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="emp-nome">Nome</Label>
              <Input
                id="emp-nome"
                value={empresa.nome}
                onChange={(e) => setEmpresa({ ...empresa, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-nif">NIF</Label>
              <Input
                id="emp-nif"
                inputMode="numeric"
                maxLength={9}
                value={empresa.nif}
                onChange={(e) => setEmpresa({ ...empresa, nif: e.target.value.replace(/\D/g, "") })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="emp-morada">Morada</Label>
              <Input
                id="emp-morada"
                value={empresa.morada}
                onChange={(e) => setEmpresa({ ...empresa, morada: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-telefone">Telefone</Label>
              <Input
                id="emp-telefone"
                value={empresa.telefone}
                onChange={(e) => setEmpresa({ ...empresa, telefone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-email">Email</Label>
              <Input
                id="emp-email"
                type="email"
                value={empresa.email}
                onChange={(e) => setEmpresa({ ...empresa, email: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="emp-logo">Endereço do logótipo (opcional)</Label>
              <Input
                id="emp-logo"
                value={empresa.logotipo_url}
                onChange={(e) => setEmpresa({ ...empresa, logotipo_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
          </div>
          <Button onClick={() => mEmpresa.mutate()} disabled={mEmpresa.isPending}>
            {mEmpresa.isPending ? "A guardar…" : "Guardar empresa"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras de venda</CardTitle>
          <CardDescription>
            IVA, prazos de separação e validade dos orçamentos, mais o desconto máximo de cada
            perfil.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="iva">IVA (%)</Label>
              <Input
                id="iva"
                inputMode="decimal"
                value={gerais.iva_pct}
                onChange={(e) => setGerais({ ...gerais, iva_pct: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="separacao">Dias de separação</Label>
              <Input
                id="separacao"
                inputMode="numeric"
                value={gerais.dias_separacao}
                onChange={(e) => setGerais({ ...gerais, dias_separacao: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validade">Validade do orçamento (dias)</Label>
              <Input
                id="validade"
                inputMode="numeric"
                value={gerais.validade_orcamento_dias}
                onChange={(e) => setGerais({ ...gerais, validade_orcamento_dias: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {PERFIS.map((perfil) => (
              <div key={perfil.valor} className="space-y-2">
                <Label htmlFor={`limite-${perfil.valor}`}>Desconto máx. {perfil.etiqueta} (%)</Label>
                <Input
                  id={`limite-${perfil.valor}`}
                  inputMode="decimal"
                  value={limites[perfil.valor] ?? "0"}
                  onChange={(e) => setLimites({ ...limites, [perfil.valor]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <Button onClick={() => mGerais.mutate()} disabled={mGerais.isPending}>
            {mGerais.isPending ? "A guardar…" : "Guardar definições"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
