import { useSessao } from "@/hooks/use-sessao";
import type { Perfil } from "@/lib/erp/tipos";

/** Quem pode editar cada área do ERP. */
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
    /** Compras e Administração emitem e recebem ordens de compra. */
    comprar: ativo && (perfil === "adm" || perfil === "compras"),
    /** Financeiro e Administração pagam a fornecedores. */
    pagar: ativo && (perfil === "adm" || perfil === "financeiro"),
    /** Escritório também acompanha necessidades e estados de fornecimento. */
    verCompras: ativo && perfil !== "vendedora",
  };
}
