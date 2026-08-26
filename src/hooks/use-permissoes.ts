import { useSessao } from "@/hooks/use-sessao";
import type { Perfil } from "@/lib/erp/tipos";

/** Quem pode editar cada área da Fase 2. */
export function usePermissoes() {
  const { data: sessao, isLoading } = useSessao();
  const perfil = (sessao?.utilizador?.perfil ?? null) as Perfil | null;
  const ativo = Boolean(sessao?.utilizador?.ativo);

  return {
    isLoading,
    perfil,
    adm: ativo && perfil === "adm",
    editarCatalogo: ativo && (perfil === "adm" || perfil === "compras"),
    editarClientes:
      ativo && (perfil === "adm" || perfil === "vendedora" || perfil === "escritorio"),
  };
}
