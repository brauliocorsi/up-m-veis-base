import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { erp } from "@/lib/erp/db";
import { formatarData, type SyncEstado } from "@/lib/erp/tipos";
import { cn } from "@/lib/utils";

export function useEstadoSync() {
  return useQuery<SyncEstado | null>({
    queryKey: ["sync-estado"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await erp().from("v_sync_estado").select("*").eq("fonte", "contagem").maybeSingle();
      return (data ?? null) as SyncEstado | null;
    },
  });
}

const APARENCIA = {
  ok: { icone: CheckCircle2, cor: "text-emerald-600", texto: "Armazém sincronizado" },
  atrasado: { icone: Clock, cor: "text-amber-600", texto: "Sincronização atrasada" },
  erro: { icone: AlertTriangle, cor: "text-destructive", texto: "Sincronização com erro" },
} as const;

/** Semáforo da ligação ao armazém, sempre visível no topo. */
export function IndicadorSync({ podeGerir }: { podeGerir: boolean }) {
  const { data } = useEstadoSync();
  if (!data) return null;

  const estado = (data.estado_calculado ?? data.estado ?? "ok") as keyof typeof APARENCIA;
  const { icone: Icone, cor, texto } = APARENCIA[estado] ?? APARENCIA.ok;

  const detalhe = data.inventario_inicial_em
    ? `${texto}. Última sincronização: ${formatarData(data.ultima_sync_ok)}.${
        data.erro ? ` Erro: ${data.erro}` : ""
      }`
    : "Inventário inicial ainda não aplicado.";

  const conteudo = (
    <span className="flex items-center gap-1.5 text-xs">
      <Icone className={cn("h-4 w-4", cor)} />
      <span className="hidden text-muted-foreground sm:inline">{texto}</span>
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {podeGerir ? (
          <Link to="/sincronizacao" aria-label={detalhe}>
            {conteudo}
          </Link>
        ) : (
          <span aria-label={detalhe}>{conteudo}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>{detalhe}</TooltipContent>
    </Tooltip>
  );
}
