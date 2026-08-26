import type { LucideIcon } from "lucide-react";
import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface Acao {
  chave: string;
  etiqueta: string;
  icone: LucideIcon;
  onSelect: () => void;
  destrutiva?: boolean;
  desativada?: boolean;
}

/** Ícone com tooltip. O mesmo ícone significa sempre a mesma ação. */
export function BotaoAcao({ acao }: { acao: Acao }) {
  const Icone = acao.icone;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={acao.desativada ?? false}
          aria-label={acao.etiqueta}
          onClick={acao.onSelect}
          className={cn("h-8 w-8", acao.destrutiva && "text-destructive hover:text-destructive")}
        >
          <Icone className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{acao.etiqueta}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Em desktop mostra ícones; em mobile agrupa tudo num menu.
 * As ações destrutivas ficam sempre afastadas das restantes.
 */
export function GrupoAcoes({ acoes, extra }: { acoes: Acao[]; extra?: ReactNode }) {
  const normais = acoes.filter((a) => !a.destrutiva);
  const destrutivas = acoes.filter((a) => a.destrutiva);

  return (
    <>
      <div className="hidden items-center justify-end gap-1 sm:flex">
        {normais.map((acao) => (
          <BotaoAcao key={acao.chave} acao={acao} />
        ))}
        {destrutivas.length > 0 && <span className="mx-2 h-5 w-px bg-border" aria-hidden />}
        {destrutivas.map((acao) => (
          <BotaoAcao key={acao.chave} acao={acao} />
        ))}
        {extra}
      </div>
      <div className="flex justify-end sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {normais.map((acao) => (
              <DropdownMenuItem
                key={acao.chave}
                disabled={acao.desativada ?? false}
                onSelect={acao.onSelect}
              >
                <acao.icone className="mr-2 h-4 w-4" />
                {acao.etiqueta}
              </DropdownMenuItem>
            ))}
            {destrutivas.length > 0 && <DropdownMenuSeparator />}
            {destrutivas.map((acao) => (
              <DropdownMenuItem
                key={acao.chave}
                disabled={acao.desativada ?? false}
                onSelect={acao.onSelect}
                className="text-destructive focus:text-destructive"
              >
                <acao.icone className="mr-2 h-4 w-4" />
                {acao.etiqueta}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
