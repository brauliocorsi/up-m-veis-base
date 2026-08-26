import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSessao } from "@/hooks/use-sessao";

export const Route = createFileRoute("/_authenticated/_adm")({
  component: LayoutAdm,
});

function LayoutAdm() {
  const { data: sessao, isLoading } = useSessao();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">A carregar…</p>;
  }

  if (sessao?.utilizador?.perfil !== "adm") {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-lg font-semibold">Área reservada à Administração</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta página só pode ser aberta por quem tem o perfil de Administração.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/painel">Voltar ao painel</Link>
        </Button>
      </div>
    );
  }

  return <Outlet />;
}
