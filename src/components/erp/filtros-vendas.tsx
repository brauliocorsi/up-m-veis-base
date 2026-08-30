import { useQuery } from "@tanstack/react-query";
import { Download, FilterX, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

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
import { erp } from "@/lib/erp/db";
import { contarFiltros, type FiltrosVendas } from "@/lib/erp/filtros";
import {
  ESTADOS_FISCAIS,
  ESTADOS_PEDIDO,
  ETIQUETA_PAGAMENTO_PEDIDO,
  type Utilizador,
} from "@/lib/erp/tipos";

export type CampoFiltro =
  | "periodo"
  | "entrega_prevista"
  | "entrega_efetiva"
  | "vendedor"
  | "estado"
  | "fiscal"
  | "pagamento"
  | "cliente"
  | "produto"
  | "cp4"
  | "origem";

interface Props {
  filtros: FiltrosVendas;
  campos: CampoFiltro[];
  resultados: number;
  onMudar: (filtros: FiltrosVendas) => void;
  onExportar?: () => void;
  aExportar?: boolean;
  atalhos?: Array<{ etiqueta: string; filtros: FiltrosVendas }>;
}

const TODOS = "todos";
const hoje = () => new Date().toISOString().slice(0, 10);
const dias = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export const ATALHOS_VENDAS: Array<{ etiqueta: string; filtros: FiltrosVendas }> = [
  { etiqueta: "Hoje", filtros: { de: hoje(), ate: hoje() } },
  { etiqueta: "Esta semana", filtros: { de: dias(-7), ate: hoje() } },
  { etiqueta: "Este mês", filtros: { de: `${hoje().slice(0, 8)}01`, ate: hoje() } },
  { etiqueta: "Entregas de amanhã", filtros: { entrega_de: dias(1), entrega_ate: dias(1) } },
  { etiqueta: "Entregue por receber", filtros: { estado: "entregue", pagamento: "por_pagar" } },
];

/** Painel de filtros combináveis, com contador de resultados e exportação. */
export function FiltrosVendasPainel({
  filtros,
  campos,
  resultados,
  onMudar,
  onExportar,
  aExportar,
  atalhos = ATALHOS_VENDAS,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const ativos = contarFiltros(filtros);

  const { data: vendedoras } = useQuery({
    queryKey: ["vendedoras-filtro"],
    enabled: campos.includes("vendedor"),
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_utilizadores")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Utilizador[];
    },
  });

  const mudar = (chave: keyof FiltrosVendas, valor: string) =>
    onMudar({ ...filtros, [chave]: valor === TODOS ? undefined : valor || undefined });

  const campo = (chave: CampoFiltro) => campos.includes(chave);

  return (
    <div className="mb-3 space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={aberto ? "default" : "outline"}
          size="sm"
          onClick={() => setAberto((v) => !v)}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filtros{ativos > 0 ? ` (${ativos})` : ""}
        </Button>
        {atalhos.map((a) => (
          <Button
            key={a.etiqueta}
            variant="outline"
            size="sm"
            onClick={() => onMudar({ ...a.filtros })}
          >
            {a.etiqueta}
          </Button>
        ))}
        {ativos > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onMudar({})}>
            <FilterX className="mr-2 h-4 w-4" /> Limpar
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {resultados} {resultados === 1 ? "resultado" : "resultados"}
        </span>
        {onExportar && (
          <Button variant="outline" size="sm" disabled={aExportar} onClick={onExportar}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        )}
      </div>

      {aberto && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campo("periodo") && (
            <>
              <div className="space-y-1">
                <Label htmlFor="f-de">Do dia</Label>
                <Input
                  id="f-de"
                  type="date"
                  value={filtros.de ?? ""}
                  onChange={(e) => mudar("de", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-ate">Até ao dia</Label>
                <Input
                  id="f-ate"
                  type="date"
                  value={filtros.ate ?? ""}
                  onChange={(e) => mudar("ate", e.target.value)}
                />
              </div>
            </>
          )}
          {campo("entrega_prevista") && (
            <>
              <div className="space-y-1">
                <Label htmlFor="f-ent-de">Entrega prevista de</Label>
                <Input
                  id="f-ent-de"
                  type="date"
                  value={filtros.entrega_de ?? ""}
                  onChange={(e) => mudar("entrega_de", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-ent-ate">Entrega prevista até</Label>
                <Input
                  id="f-ent-ate"
                  type="date"
                  value={filtros.entrega_ate ?? ""}
                  onChange={(e) => mudar("entrega_ate", e.target.value)}
                />
              </div>
            </>
          )}
          {campo("entrega_efetiva") && (
            <>
              <div className="space-y-1">
                <Label htmlFor="f-ef-de">Entrega efetiva de</Label>
                <Input
                  id="f-ef-de"
                  type="date"
                  value={filtros.efetiva_de ?? ""}
                  onChange={(e) => mudar("efetiva_de", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-ef-ate">Entrega efetiva até</Label>
                <Input
                  id="f-ef-ate"
                  type="date"
                  value={filtros.efetiva_ate ?? ""}
                  onChange={(e) => mudar("efetiva_ate", e.target.value)}
                />
              </div>
            </>
          )}
          {campo("vendedor") && (
            <div className="space-y-1">
              <Label htmlFor="f-vend">Vendedora</Label>
              <Select value={filtros.vendedor ?? TODOS} onValueChange={(v) => mudar("vendedor", v)}>
                <SelectTrigger id="f-vend">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {(vendedoras ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {campo("estado") && (
            <div className="space-y-1">
              <Label htmlFor="f-estado">Estado do pedido</Label>
              <Select value={filtros.estado ?? TODOS} onValueChange={(v) => mudar("estado", v)}>
                <SelectTrigger id="f-estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {ESTADOS_PEDIDO.map((e) => (
                    <SelectItem key={e.valor} value={e.valor}>
                      {e.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {campo("fiscal") && (
            <div className="space-y-1">
              <Label htmlFor="f-fiscal">Estado fiscal</Label>
              <Select value={filtros.fiscal ?? TODOS} onValueChange={(v) => mudar("fiscal", v)}>
                <SelectTrigger id="f-fiscal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {ESTADOS_FISCAIS.map((e) => (
                    <SelectItem key={e.valor} value={e.valor}>
                      {e.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {campo("pagamento") && (
            <div className="space-y-1">
              <Label htmlFor="f-pag">Estado de pagamento</Label>
              <Select value={filtros.pagamento ?? TODOS} onValueChange={(v) => mudar("pagamento", v)}>
                <SelectTrigger id="f-pag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {Object.entries(ETIQUETA_PAGAMENTO_PEDIDO).map(([valor, etiqueta]) => (
                    <SelectItem key={valor} value={valor}>
                      {etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {campo("produto") && (
            <div className="space-y-1">
              <Label htmlFor="f-prod">Contém o produto</Label>
              <Input
                id="f-prod"
                value={filtros.produto ?? ""}
                placeholder="Nome ou código de barras"
                onChange={(e) => mudar("produto", e.target.value)}
              />
            </div>
          )}
          {campo("cp4") && (
            <div className="space-y-1">
              <Label htmlFor="f-cp4">Código postal (zona)</Label>
              <Input
                id="f-cp4"
                value={filtros.cp4 ?? ""}
                placeholder="4620"
                inputMode="numeric"
                maxLength={4}
                onChange={(e) => mudar("cp4", e.target.value)}
              />
            </div>
          )}
          {campo("origem") && (
            <div className="space-y-1">
              <Label htmlFor="f-origem">Origem</Label>
              <Select value={filtros.origem ?? TODOS} onValueChange={(v) => mudar("origem", v)}>
                <SelectTrigger id="f-origem">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  <SelectItem value="loja">Na loja</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
