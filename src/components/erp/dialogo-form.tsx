import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  aGuardar?: boolean;
  onGuardar: () => void;
  children: ReactNode;
}

/** Diálogo padrão de criação/edição: mesmo layout e mesmos botões em todo o ERP. */
export function DialogoForm({
  aberto,
  onFechar,
  titulo,
  descricao,
  aGuardar,
  onGuardar,
  children,
}: Props) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onGuardar();
          }}
        >
          {children}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={aGuardar}>
              {aGuardar ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
