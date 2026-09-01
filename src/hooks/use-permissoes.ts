import { useSessao } from "@/hooks/use-sessao";
import type { Perfil } from "@/lib/erp/tipos";

/** Quem pode editar cada área do ERP. */
export function usePermissoes() {
  const { data: sessao, isLoading } = useSessao();
  const perfil = (sessao?.utilizador?.perfil ?? null) as Perfil | null;
  const ativo = Boolean(sessao?.utilizador?.ativo);
  const é = (...perfis: Perfil[]) => ativo && perfil !== null && perfis.includes(perfil);

  return {
    isLoading,
    perfil,
    adm: é("adm"),
    /** O entregador vive na área da rota e não entra no resto do ERP. */
    entregador: é("entregador"),
    /** O operador de fábrica vive no chão de fábrica. */
    operadorProducao: é("producao"),
    /** Ver ordens de produção, etapas e lista de materiais. */
    verProducao: é("adm", "escritorio", "compras", "producao", "financeiro"),
    /** Planear: abrir ordens, configurar etapas e componentes. */
    gerirProducao: é("adm", "escritorio", "compras"),
    /** Registar trabalho de fábrica: iniciar, concluir e conferir etapas. */
    registarProducao: é("adm", "escritorio", "compras", "producao"),
    editarCatalogo: é("adm", "compras"),
    editarClientes: é("adm", "vendedora", "escritorio"),
    /** Compras e Administração emitem e recebem ordens de compra. */
    comprar: é("adm", "compras"),
    /** Financeiro e Administração pagam a fornecedores. */
    pagar: é("adm", "financeiro"),
    /** Escritório também acompanha necessidades e estados de fornecimento. */
    verCompras: é("adm", "compras", "escritorio", "financeiro"),
    /** Ecrãs financeiros: nem vendedoras nem entregadores. */
    verFinanceiro: é("adm", "financeiro", "escritorio", "compras"),
    /** Custos e margens: só Financeiro e Administração. */
    verCustos: é("adm", "financeiro"),
    /** Quem pode ler e gravar custos e margens mínimas de produto. */
    editarCustos: é("adm", "financeiro", "compras"),

    /** Confirmar e devolver recebimentos. */
    receber: é("adm", "financeiro", "escritorio"),
    /** Registar entradas de dinheiro no caixa da loja. */
    registarEntradas: é("adm", "financeiro", "escritorio"),


    /** Quem registra entregas — inclui vendedoras e entregadores. */
    entregar: ativo,
    /** Documentos fiscais: emitir e anular. */
    faturar: é("adm", "financeiro", "escritorio"),

    /** Montar rotas, atribuir responsáveis e tratar reagendamentos. */
    montarRotas: é("adm", "escritorio"),
    /** Abrir envelopes e conferir o dinheiro das rotas. */
    conferirRotas: é("adm", "financeiro"),
    /** Ver o previsto contra o realizado das rotas de toda a equipa. */
    verRotas: é("adm", "escritorio", "financeiro"),
    /** Tratar assistências abertas na rua ou pelo cliente. */
    tratarAssistencias: é("adm", "escritorio", "financeiro"),
  };
}
