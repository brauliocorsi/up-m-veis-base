import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina } from "@/components/erp/app-shell";
import { BotaoGuardar } from "@/components/erp/botao-guardar";
import { Interruptor } from "@/components/erp/interruptor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { erp } from "@/lib/erp/db";
import { primeiraMensagem } from "@/lib/erp/erros";
import { esquemaRegraDesconto } from "@/lib/erp/esquemas";
import { listar } from "@/lib/erp/listar";
import { ETIQUETA_PERFIL, type RegraDesconto } from "@/lib/erp/tipos";

export const Route = createFileRoute("/_authenticated/_adm/regras-desconto")({
  head: () => ({
    meta: [
      { title: "Regras de desconto — UP Vendas" },
      {
        name: "description",
        content:
          "Limites de desconto por perfil na UP Móveis, com aprovação obrigatória acima do limite definido.",
      },
      { property: "og:title", content: "Regras de desconto — UP Vendas" },
      { property: "og:description", content: "Quanto pode cada perfil descontar na UP Móveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaRegras,
});

interface Rascunho {
  desconto_max_pct: string;
  requer_aprovacao_acima_pct: string;
  pode_alterar_preco: boolean;
  pode_alterar_entrega: boolean;
}

function PaginaRegras() {
  const queryClient = useQueryClient();
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});

  const { data, isPending } = useQuery({
    queryKey: ["regras-desconto"],
    queryFn: () =>
      listar<RegraDesconto>({
        tabela: "v_regras_desconto",
        ordenarPor: "perfil",
        ascendente: true,
        tamanho: 50,
      }),
  });

  useEffect(() => {
    if (!data) return;
    const inicial: Record<string, Rascunho> = {};
    for (const linha of data.linhas) {
      inicial[linha.id] = {
        desconto_max_pct: String(linha.desconto_max_pct ?? 0),
        requer_aprovacao_acima_pct:
          linha.requer_aprovacao_acima_pct === null ? "" : String(linha.requer_aprovacao_acima_pct),
        pode_alterar_preco: linha.pode_alterar_preco,
        pode_alterar_entrega: linha.pode_alterar_entrega,
      };
    }
    setRascunhos(inicial);
  }, [data]);

  const mGuardar = useMutation({
    mutationFn: async (id: string) => {
      const linha = esquemaRegraDesconto.parse(rascunhos[id]);
      const { error } = await erp().from("regras_desconto").update(linha).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra guardada.");
      queryClient.invalidateQueries({ queryKey: ["regras-desconto"] });
    },
    onError: (erro) => toast.error(primeiraMensagem(erro)),
  });

  return (
    <div>
      <CabecalhoPagina
        titulo="Regras de desconto"
        descricao="Até quanto cada perfil pode descontar sozinho e a partir de que ponto precisa de aprovação."
      />

      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      <div className="space-y-4">
        {(data?.linhas ?? []).map((linha) => {
          const rascunho = rascunhos[linha.id];
          if (!rascunho) return null;
          const atualizar = (parcial: Partial<Rascunho>) =>
            setRascunhos((atual) => ({ ...atual, [linha.id]: { ...rascunho, ...parcial } }));

          return (
            <section key={linha.id} className="space-y-4 rounded-xl border bg-card p-4">
              <h2 className="text-base font-semibold">{ETIQUETA_PERFIL[linha.perfil]}</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`max-${linha.id}`}>Desconto máximo (%)</Label>
                  <Input
                    id={`max-${linha.id}`}
                    inputMode="decimal"
                    value={rascunho.desconto_max_pct}
                    onChange={(e) => atualizar({ desconto_max_pct: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`apr-${linha.id}`}>Pede aprovação acima de (%)</Label>
                  <Input
                    id={`apr-${linha.id}`}
                    inputMode="decimal"
                    placeholder="Nunca pede aprovação"
                    value={rascunho.requer_aprovacao_acima_pct}
                    onChange={(e) => atualizar({ requer_aprovacao_acima_pct: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Interruptor
                  id={`preco-${linha.id}`}
                  titulo="Pode alterar o preço"
                  descricao="Permite escrever um preço diferente do catálogo."
                  valor={rascunho.pode_alterar_preco}
                  onChange={(v) => atualizar({ pode_alterar_preco: v })}
                />
                <Interruptor
                  id={`entrega-${linha.id}`}
                  titulo="Pode alterar o valor da entrega"
                  descricao="Permite ajustar portes e transportes."
                  valor={rascunho.pode_alterar_entrega}
                  onChange={(v) => atualizar({ pode_alterar_entrega: v })}
                />
              </div>

              <BotaoGuardar
                aGuardar={mGuardar.isPending}
                onClick={() => mGuardar.mutate(linha.id)}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
