import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Linha com título, explicação e interruptor — usada em todos os formulários. */
export function Interruptor({
  id,
  titulo,
  descricao,
  valor,
  onChange,
}: {
  id: string;
  titulo: string;
  descricao?: string;
  valor: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div>
        <Label htmlFor={id}>{titulo}</Label>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      <Switch id={id} checked={valor} onCheckedChange={onChange} />
    </div>
  );
}
