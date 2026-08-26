import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erp/db";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — UP Vendas" },
      {
        name: "description",
        content: "Acesso reservado à equipa da UP Móveis. Entre com o seu email e palavra-passe.",
      },
      { property: "og:title", content: "Entrar — UP Vendas" },
      { property: "og:description", content: "Acesso reservado à equipa da UP Móveis." },
    ],
  }),
  component: PaginaAuth,
});

function PaginaAuth() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "recuperar" | "nova-palavra-passe">(() =>
    typeof window !== "undefined" && window.location.hash.includes("type=recovery")
      ? "nova-palavra-passe"
      : "entrar",
  );
  const [email, setEmail] = useState("");
  const [palavraPasse, setPalavraPasse] = useState("");
  const [aProcessar, setAProcessar] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setAProcessar(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: palavraPasse });
    setAProcessar(false);
    if (error) {
      toast.error(mensagemErro(error, "Não foi possível entrar. Verifique os dados."));
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  async function recuperar(evento: React.FormEvent) {
    evento.preventDefault();
    setAProcessar(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setAProcessar(false);
    if (error) {
      toast.error(mensagemErro(error, "Não foi possível enviar o email de recuperação."));
      return;
    }
    toast.success("Enviámos-lhe um email com as instruções para definir nova palavra-passe.");
    setModo("entrar");
  }

  async function definirNova(evento: React.FormEvent) {
    evento.preventDefault();
    if (palavraPasse.length < 8) {
      toast.error("A palavra-passe tem de ter pelo menos 8 caracteres.");
      return;
    }
    setAProcessar(true);
    const { error } = await supabase.auth.updateUser({ password: palavraPasse });
    setAProcessar(false);
    if (error) {
      toast.error(mensagemErro(error, "Não foi possível guardar a nova palavra-passe."));
      return;
    }
    toast.success("Palavra-passe atualizada.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
            UP
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">UP Vendas</h1>
            <p className="text-xs text-muted-foreground">Gestão interna da UP Móveis</p>
          </div>
        </div>

        {modo === "entrar" && (
          <form onSubmit={entrar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@upmoveis.pt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="palavra-passe">Palavra-passe</Label>
              <Input
                id="palavra-passe"
                type="password"
                autoComplete="current-password"
                required
                value={palavraPasse}
                onChange={(e) => setPalavraPasse(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={aProcessar}>
              {aProcessar ? "A entrar…" : "Entrar"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setModo("recuperar")}
            >
              Esqueci-me da palavra-passe
            </button>
            <p className="text-center text-xs text-muted-foreground">
              As contas são criadas pela Administração. Não há registo público.
            </p>
          </form>
        )}

        {modo === "recuperar" && (
          <form onSubmit={recuperar} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escreva o seu email e enviamos-lhe instruções para definir uma nova palavra-passe.
            </p>
            <div className="space-y-2">
              <Label htmlFor="email-recuperar">Email</Label>
              <Input
                id="email-recuperar"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={aProcessar}>
              {aProcessar ? "A enviar…" : "Enviar instruções"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setModo("entrar")}
            >
              Voltar ao início
            </button>
          </form>
        )}

        {modo === "nova-palavra-passe" && (
          <form onSubmit={definirNova} className="space-y-4">
            <p className="text-sm text-muted-foreground">Defina a sua nova palavra-passe.</p>
            <div className="space-y-2">
              <Label htmlFor="nova">Nova palavra-passe</Label>
              <Input
                id="nova"
                type="password"
                autoComplete="new-password"
                required
                value={palavraPasse}
                onChange={(e) => setPalavraPasse(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={aProcessar}>
              {aProcessar ? "A guardar…" : "Guardar palavra-passe"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
