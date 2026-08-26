import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { erp } from "@/lib/erp/db";
import type { Motivo } from "@/lib/erp/tipos";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  nomeRegisto: string;
  aGuardar?: boolean;
  onConfirmar: (motivo: string) => void;
  contexto?: string;
}

/** Eliminar abre sempre este diálogo: nome do registo + motivo da tabela de motivos. */
export function DialogoEliminar({
  aberto,
  onFechar,
  nomeRegisto,
  aGuardar,
  onConfirmar,
  contexto = "eliminacao",
}: Props) {
  const [motivoId, setMotivoId] = useState("");
  const [texto, setTexto] = useState("");

  const { data: motivos = [] } = useQuery<Motivo[]>({
    queryKey: ["motivos-contexto", contexto],
    queryFn: async () => {
      const { data, error } = await erp()
        .from("v_motivos")
        .select("*")
        .eq("contexto", contexto)
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Motivo[];
    },
  });

  useEffect(() => {
    if (aberto) {
      setMotivoId("");
      setTexto("");
    }
  }, [aberto]);

  const motivo = motivos.find((m) => m.id === motivoId);
  const precisaTexto = motivo?.exige_texto === true;
  const podeConfirmar = Boolean(motivo) && (!precisaTexto || texto.trim().length >= 3);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar “{nomeRegisto}”?</DialogTitle>
          <DialogDescription>
            O registo deixa de aparecer nas listas, mas fica guardado na lixeira e pode ser
            restaurado pela Administração.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo da eliminação</Label>
            <Select value={motivoId} onValueChange={setMotivoId}>
              <SelectTrigger id="motivo">
                <SelectValue placeholder="Escolha um motivo" />
              </SelectTrigger>
              <SelectContent>
                {motivos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {precisaTexto && (
            <div className="space-y-2">
              <Label htmlFor="detalhe">Explique melhor</Label>
              <Textarea
                id="detalhe"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreva o motivo com as suas palavras"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onFechar}>
            Manter registo
          </Button>
          <Button
            variant="destructive"
            disabled={!podeConfirmar || aGuardar}
            onClick={() =>
              onConfirmar(
                precisaTexto ? `${motivo?.descricao}: ${texto.trim()}` : (motivo?.descricao ?? ""),
              )
            }
          >
            {aGuardar ? "A eliminar…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
