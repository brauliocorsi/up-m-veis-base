import type { OcItem, OrdemCompra } from "./tipos";

type Idioma = "pt" | "en" | "es" | "fr" | "pl";

interface Textos {
  assunto: (numero: string) => string;
  saudacao: string;
  intro: (empresa: string) => string;
  cabecalhos: { linha: string; artigo: string; qtd: string; custo: string; total: string };
  prevista: string;
  totalGeral: string;
  pedido: string;
  despedida: string;
}

const TEXTOS: Record<Idioma, Textos> = {
  pt: {
    assunto: (n) => `Ordem de compra ${n}`,
    saudacao: "Bom dia,",
    intro: (e) => `Segue a nossa ordem de compra da ${e}.`,
    cabecalhos: { linha: "Linha", artigo: "Artigo", qtd: "Qtd", custo: "Custo", total: "Total" },
    prevista: "Data prevista",
    totalGeral: "Total da encomenda",
    pedido: "Agradecemos a confirmação da encomenda e da data de entrega.",
    despedida: "Com os melhores cumprimentos,",
  },
  en: {
    assunto: (n) => `Purchase order ${n}`,
    saudacao: "Hello,",
    intro: (e) => `Please find below our purchase order from ${e}.`,
    cabecalhos: { linha: "Line", artigo: "Item", qtd: "Qty", custo: "Unit cost", total: "Total" },
    prevista: "Expected date",
    totalGeral: "Order total",
    pedido: "Please confirm the order and the delivery date.",
    despedida: "Best regards,",
  },
  es: {
    assunto: (n) => `Orden de compra ${n}`,
    saudacao: "Buenos días,",
    intro: (e) => `Adjuntamos nuestra orden de compra de ${e}.`,
    cabecalhos: { linha: "Línea", artigo: "Artículo", qtd: "Cant.", custo: "Coste", total: "Total" },
    prevista: "Fecha prevista",
    totalGeral: "Total del pedido",
    pedido: "Les agradecemos la confirmación del pedido y de la fecha de entrega.",
    despedida: "Saludos cordiales,",
  },
  fr: {
    assunto: (n) => `Bon de commande ${n}`,
    saudacao: "Bonjour,",
    intro: (e) => `Veuillez trouver ci-dessous notre bon de commande de ${e}.`,
    cabecalhos: { linha: "Ligne", artigo: "Article", qtd: "Qté", custo: "Coût", total: "Total" },
    prevista: "Date prévue",
    totalGeral: "Total de la commande",
    pedido: "Merci de confirmer la commande et la date de livraison.",
    despedida: "Cordialement,",
  },
  pl: {
    assunto: (n) => `Zamówienie zakupu ${n}`,
    saudacao: "Dzień dobry,",
    intro: (e) => `Poniżej nasze zamówienie zakupu od ${e}.`,
    cabecalhos: { linha: "Poz.", artigo: "Produkt", qtd: "Ilość", custo: "Koszt", total: "Razem" },
    prevista: "Przewidywana data",
    totalGeral: "Wartość zamówienia",
    pedido: "Prosimy o potwierdzenie zamówienia i daty dostawy.",
    despedida: "Z poważaniem,",
  },
};

export interface DadosEmpresa {
  nome?: string | undefined;
  morada?: string | undefined;
  nif?: string | undefined;
  telefone?: string | undefined;
  email?: string | undefined;
}

/** Compõe o assunto e o texto do email da ordem de compra, no idioma do fornecedor. */
export function composerEmailOc(
  oc: OrdemCompra,
  itens: OcItem[],
  empresa: DadosEmpresa,
): { assunto: string; corpo: string } {
  const idioma = (["pt", "en", "es", "fr", "pl"] as Idioma[]).includes(
    (oc.fornecedor_idioma ?? "pt").trim() as Idioma,
  )
    ? ((oc.fornecedor_idioma ?? "pt").trim() as Idioma)
    : "pt";
  const t = TEXTOS[idioma];
  const nomeEmpresa = empresa.nome || "UP Móveis";
  const euros = (v: number | string) => `${Number(v).toFixed(2)} €`;

  const linhas = itens
    .map(
      (i) =>
        `${i.linha}. ${i.descricao} — ${t.cabecalhos.qtd} ${i.quantidade} × ${euros(i.custo_unitario)} = ${euros(i.total_linha)}`,
    )
    .join("\n");

  const prevista = oc.data_confirmada_fornecedor ?? oc.data_prevista;

  const corpo = [
    t.saudacao,
    "",
    t.intro(nomeEmpresa),
    "",
    `${t.assunto(oc.numero)}`,
    prevista ? `${t.prevista}: ${prevista}` : "",
    "",
    linhas,
    "",
    `${t.totalGeral}: ${euros(oc.total)}`,
    oc.observacoes ? `\n${oc.observacoes}` : "",
    "",
    t.pedido,
    "",
    t.despedida,
    nomeEmpresa,
    empresa.morada ?? "",
    empresa.telefone ?? "",
    empresa.email ?? "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return { assunto: t.assunto(oc.numero), corpo };
}
