import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PackageCheck, ScanLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
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
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissoes } from "@/hooks/use-permissoes";
import { lerOcItens, receberOc } from "@/lib/erp/compras";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { formatarData, type OrdemCompra } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/recepcao")({
  head: () => ({
    meta: [
      { title: "Receção de mercadoria — UP Vendas" },
      {
        name: "description",
        content:
          "Ecrã de armazém da UP Móveis para dar entrada às encomendas dos fornecedores, artigo a artigo.",
      },
      { property: "og:title", content: "Receção de mercadoria — UP Vendas" },
      {
        property: "og:description",
        content: "Dê entrada às encomendas com leitor de código de barras ou à mão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaRecepcao,
});

function PaginaRecepcao() {
  const { comprar } = usePermissoes();
  const queryClient = useQueryClient();
  const [ocId, setOcId] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [codigo, setCodigo] = useState("");
  const [doc, setDoc] = useState("");

  const ordens = useQuery({
    queryKey: ["ordens-a-receber"],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_ordens_compra")
        .select("*")
        .in("estado", ["enviada", "confirmada", "recebida_parcial"])
        .order("data_emissao", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrdemCompra[];
    },
  });

  const itens = useQuery({
    queryKey: ["oc-itens", ocId],
    queryFn: () => lerOcItens(ocId),
    enabled: Boolean(ocId),
  });

  const registar = useMutation({
    mutationFn: async () => {
      const linhas = Object.entries(quantidades)
        .map(([item_id, valor]) => ({ item_id, quantidade: Number(valor.replace(",", ".")) }))
        .filter((l) => l.quantidade > 0);
      if (linhas.length === 0) throw new Error("Indique as quantidades recebidas.");
      return receberOc({ oc_id: ocId, linhas, doc: doc || null });
    },
    onSuccess: async (resultado) => {
      setQuantidades({});
      setDoc("");
      await queryClient.invalidateQueries({ queryKey: ["oc-itens", ocId] });
      await queryClient.invalidateQueries({ queryKey: ["ordens-a-receber"] });
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      toast.success(`Entrada registada: ${resultado.unidades} unidades.`);
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  const emFalta = (itens.data ?? []).filter((i) => Number(i.em_falta) > 0);

  function lerCodigo(valor: string) {
    const limpo = valor.trim();
    if (!limpo) return;
    const linha = emFalta.find((i) => i.cod_barras === limpo);
    setCodigo("");
    if (!linha) {
      toast.error("Este código não está em falta nesta ordem de compra.");
      return;
    }
    setQuantidades((atual) => ({
      ...atual,
      [linha.id]: String((Number(atual[linha.id] ?? "0") || 0) + 1),
    }));
  }

  if (!comprar) {
    return (
      <p className="text-sm text-muted-foreground">
        A receção de mercadoria é feita pelas Compras ou pela Administração.
      </p>
    );
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Receção de mercadoria"
        descricao="Escolha a encomenda que chegou e dê entrada ao que veio na carga."
      />

      <div className="mb-4 space-y-2">
        <Label>Ordem de compra</Label>
        {ordens.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={ocId} onValueChange={(v) => { setOcId(v); setQuantidades({}); }}>
            <SelectTrigger aria-label="Escolher ordem de compra">
              <SelectValue placeholder="Escolha a encomenda" />
            </SelectTrigger>
            <SelectContent>
              {(ordens.data ?? []).map((oc) => (
                <SelectItem key={oc.id} value={oc.id}>
                  {oc.numero} · {oc.fornecedor_nome} ·{" "}
                  {formatarData(oc.data_confirmada_fornecedor ?? oc.data_prevista) || "sem data"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {ocId && (
        <>
          <div className="mb-4 space-y-2">
            <Label htmlFor="codigo-barras">Código de barras</Label>
            <div className="relative">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="codigo-barras"
                className="pl-9"
                value={codigo}
                placeholder="Leia ou escreva o código e prima Enter"
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lerCodigo(codigo);
                  }
                }}
              />
            </div>
          </div>

          {itens.isPending && <Skeleton className="h-40 w-full rounded-lg" />}

          {!itens.isPending && emFalta.length === 0 && (
            <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
              Esta encomenda já está toda recebida.
            </div>
          )}

          {emFalta.length > 0 && (
            <div className="space-y-2">
              {emFalta.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.descricao}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Faltam {i.em_falta} de {i.quantidade}
                      {i.cliente_nome ? ` · para ${i.cliente_nome} (${i.pedido_numero})` : ""}
                    </p>
                  </div>
                  <Input
                    className="w-24 text-right"
                    inputMode="decimal"
                    aria-label={`Quantidade recebida de ${i.descricao}`}
                    value={quantidades[i.id] ?? ""}
                    placeholder="0"
                    onChange={(e) =>
                      setQuantidades((atual) => ({ ...atual, [i.id]: e.target.value }))
                    }
                  />
                </div>
              ))}

              <div className="space-y-2 pt-2">
                <Label htmlFor="doc-recepcao">Guia ou fatura do fornecedor</Label>
                <Input id="doc-recepcao" value={doc} onChange={(e) => setDoc(e.target.value)} />
              </div>

              <Button
                className="w-full sm:w-auto"
                onClick={() => registar.mutate()}
                disabled={registar.isPending}
              >
                <PackageCheck className="mr-2 h-4 w-4" /> Registar entrada
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
