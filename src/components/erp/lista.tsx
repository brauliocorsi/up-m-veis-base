import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export interface Coluna<T> {
  chave: string;
  cabecalho: string;
  ordenavel?: boolean;
  esconderMobile?: boolean;
  celula: (linha: T) => ReactNode;
  alinharDireita?: boolean;
}

interface Props<T> {
  colunas: Array<Coluna<T>>;
  linhas: T[];
  total: number;
  pagina: number;
  tamanho: number;
  aCarregar?: boolean;
  pesquisa: string;
  ordenarPor: string;
  ascendente: boolean;
  vazio?: string;
  onPesquisa: (valor: string) => void;
  onPagina: (pagina: number) => void;
  onOrdenar: (campo: string) => void;
  chave: (linha: T) => string;
}

export function Lista<T>({
  colunas,
  linhas,
  total,
  pagina,
  tamanho,
  aCarregar,
  pesquisa,
  ordenarPor,
  ascendente,
  vazio = "Ainda não há registos.",
  onPesquisa,
  onPagina,
  onOrdenar,
  chave,
}: Props<T>) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={pesquisa}
          onChange={(e) => onPesquisa(e.target.value)}
          placeholder="Pesquisar…"
          className="pl-9"
          aria-label="Pesquisar na lista"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                {colunas.map((coluna) => (
                  <th
                    key={coluna.chave}
                    className={[
                      "px-3 py-2 font-medium text-muted-foreground",
                      coluna.esconderMobile ? "hidden md:table-cell" : "",
                      coluna.alinharDireita ? "text-right" : "",
                    ].join(" ")}
                  >
                    {coluna.ordenavel ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => onOrdenar(coluna.chave)}
                      >
                        {coluna.cabecalho}
                        {ordenarPor === coluna.chave &&
                          (ascendente ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          ))}
                      </button>
                    ) : (
                      coluna.cabecalho
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aCarregar &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`s-${i}`} className="border-t">
                    {colunas.map((coluna) => (
                      <td
                        key={coluna.chave}
                        className={`px-3 py-3 ${coluna.esconderMobile ? "hidden md:table-cell" : ""}`}
                      >
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!aCarregar && linhas.length === 0 && (
                <tr className="border-t">
                  <td
                    colSpan={colunas.length}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    {vazio}
                  </td>
                </tr>
              )}
              {!aCarregar &&
                linhas.map((linha) => (
                  <tr key={chave(linha)} className="border-t align-middle hover:bg-muted/40">
                    {colunas.map((coluna) => (
                      <td
                        key={coluna.chave}
                        className={[
                          "px-3 py-2",
                          coluna.esconderMobile ? "hidden md:table-cell" : "",
                          coluna.alinharDireita ? "text-right" : "",
                        ].join(" ")}
                      >
                        {coluna.celula(linha)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {total} {total === 1 ? "registo" : "registos"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            {pagina} / {paginas}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Página seguinte"
            disabled={pagina >= paginas}
            onClick={() => onPagina(pagina + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
