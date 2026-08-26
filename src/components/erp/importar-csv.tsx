import { Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface ColunaCsv {
  chave: string;
  etiqueta: string;
  obrigatoria?: boolean;
}

interface Props {
  titulo: string;
  colunas: ColunaCsv[];
  aberto: boolean;
  onFechar: () => void;
  onImportar: (linhas: Array<Record<string, string>>) => Promise<{ ok: number; erros: string[] }>;
}

/** Lê um ficheiro CSV (vírgula ou ponto e vírgula) com cabeçalho na primeira linha. */
export function lerCsv(texto: string): Array<Record<string, string>> {
  const linhas = texto
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (linhas.length < 2) return [];
  const separador = (linhas[0]!.match(/;/g)?.length ?? 0) > (linhas[0]!.match(/,/g)?.length ?? 0)
    ? ";"
    : ",";
  const cabecalho = linhas[0]!.split(separador).map((c) => c.trim().replace(/^"|"$/g, ""));
  return linhas.slice(1).map((linha) => {
    const valores = linha.split(separador).map((c) => c.trim().replace(/^"|"$/g, ""));
    const registo: Record<string, string> = {};
    cabecalho.forEach((coluna, i) => {
      registo[coluna] = valores[i] ?? "";
    });
    return registo;
  });
}

export function ImportarCsv({ titulo, colunas, aberto, onFechar, onImportar }: Props) {
  const [linhas, setLinhas] = useState<Array<Record<string, string>>>([]);
  const [aImportar, setAImportar] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; erros: string[] } | null>(null);

  function fechar() {
    setLinhas([]);
    setResultado(null);
    onFechar();
  }

  async function escolher(ficheiro: File | undefined) {
    setResultado(null);
    if (!ficheiro) {
      setLinhas([]);
      return;
    }
    setLinhas(lerCsv(await ficheiro.text()));
  }

  async function importar() {
    setAImportar(true);
    try {
      setResultado(await onImportar(linhas));
    } finally {
      setAImportar(false);
    }
  }

  const modelo = colunas.map((c) => c.chave).join(";");

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            A primeira linha do ficheiro tem de ter os nomes das colunas. Pode usar vírgula ou
            ponto e vírgula.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="mb-1 font-medium">Colunas aceites</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {colunas.map((c) => (
                <li key={c.chave}>
                  <code>{c.chave}</code> — {c.etiqueta}
                  {c.obrigatoria ? " (obrigatória)" : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 break-all text-muted-foreground">
              Exemplo de cabeçalho: <code>{modelo}</code>
            </p>
          </div>

          <Input
            type="file"
            accept=".csv,text/csv"
            aria-label="Escolher ficheiro CSV"
            onChange={(e) => void escolher(e.target.files?.[0])}
          />

          {linhas.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {linhas.length} {linhas.length === 1 ? "linha lida" : "linhas lidas"} do ficheiro.
            </p>
          )}

          {resultado && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">{resultado.ok} registos importados.</p>
              {resultado.erros.length > 0 && (
                <>
                  <p className="text-destructive">{resultado.erros.length} linhas com problemas:</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {resultado.erros.map((erro, i) => (
                      <li key={i}>{erro}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={fechar}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={linhas.length === 0 || aImportar}
            onClick={() => void importar()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {aImportar ? "A importar…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
