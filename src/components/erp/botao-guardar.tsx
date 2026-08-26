import { Check, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";

export type EstadoGuardar = "inativo" | "a-guardar" | "guardado";

/** Botão de guardar sempre visível, com estado: Guardar / A guardar / Guardado. */
export function BotaoGuardar({
  estado,
  desativado,
  etiqueta = "Guardar",
}: {
  estado: EstadoGuardar;
  desativado?: boolean;
  etiqueta?: string;
}) {
  return (
    <Button type="submit" disabled={desativado || estado === "a-guardar"}>
      {estado === "a-guardar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {estado === "guardado" && <Check className="mr-2 h-4 w-4" />}
      {estado === "inativo" && <Save className="mr-2 h-4 w-4" />}
      {estado === "a-guardar" ? "A guardar…" : estado === "guardado" ? "Guardado" : etiqueta}
    </Button>
  );
}
