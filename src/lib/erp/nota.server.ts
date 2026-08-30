import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface DadosEmpresa {
  nome?: string;
  nif?: string;
  morada?: string;
  telefone?: string;
  email?: string;
  logotipo_url?: string;
}

export interface LinhaNota {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
}

export interface PagamentoNota {
  forma: string;
  valor: number;
  estado: string;
  data: string | null;
}

export interface DadosNota {
  numero: string;
  data: string | null;
  vendedora: string;
  cliente: {
    nome: string;
    nif: string | null;
    telefone: string | null;
    morada: string | null;
  };
  linhas: LinhaNota[];
  montagem: number;
  entrega: number;
  subtotal: number;
  descontos: number;
  iva: number;
  total: number;
  pago: number;
  falta: number;
  pagamentos: PagamentoNota[];
  data_entrega: string | null;
  empresa: DadosEmpresa;
  logotipo?: Uint8Array | null;
}

const VERMELHO = rgb(0.867, 0.141, 0.141);
const CINZA = rgb(0.42, 0.42, 0.45);
const PRETO = rgb(0.1, 0.1, 0.12);

function euros(valor: number): string {
  const n = Number(valor ?? 0);
  return `${n.toFixed(2).replace(".", ",")} EUR`;
}

function dataPt(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor.length <= 10 ? `${valor}T00:00:00` : valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Constrói o PDF da nota de encomenda. Devolve os bytes do ficheiro. */
export async function construirNotaPdf(dados: DadosNota): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Nota de encomenda ${dados.numero}`);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  const largura = 595.28;
  const altura = 841.89;
  const margem = 40;
  let pagina = doc.addPage([largura, altura]);
  let y = altura - margem;

  function novaPagina() {
    pagina = doc.addPage([largura, altura]);
    y = altura - margem;
  }

  function espaco(n: number) {
    y -= n;
    if (y < margem + 60) novaPagina();
  }

  function texto(
    valor: string,
    opcoes: { x?: number; tamanho?: number; forte?: boolean; cor?: typeof PRETO } = {},
  ) {
    const tamanho = opcoes.tamanho ?? 9.5;
    pagina.drawText(valor, {
      x: opcoes.x ?? margem,
      y,
      size: tamanho,
      font: opcoes.forte ? negrito : normal,
      color: opcoes.cor ?? PRETO,
    });
  }

  function direita(
    valor: string,
    xFim: number,
    opcoes: { tamanho?: number; forte?: boolean; cor?: typeof PRETO } = {},
  ) {
    const tamanho = opcoes.tamanho ?? 9.5;
    const fonte = opcoes.forte ? negrito : normal;
    const w = fonte.widthOfTextAtSize(valor, tamanho);
    pagina.drawText(valor, {
      x: xFim - w,
      y,
      size: tamanho,
      font: fonte,
      color: opcoes.cor ?? PRETO,
    });
  }

  function corta(valor: string, max: number, tamanho = 9.5, forte = false): string {
    const fonte = forte ? negrito : normal;
    let s = valor ?? "";
    while (s.length > 1 && fonte.widthOfTextAtSize(s, tamanho) > max) s = s.slice(0, -1);
    return s.length < (valor ?? "").length ? `${s.slice(0, -1)}…` : s;
  }

  function linhaHorizontal(cor = rgb(0.87, 0.87, 0.89)) {
    pagina.drawLine({
      start: { x: margem, y },
      end: { x: largura - margem, y },
      thickness: 0.7,
      color: cor,
    });
  }

  const fim = largura - margem;

  // ------------------------------------------------------------ cabeçalho
  if (dados.logotipo) {
    try {
      const img = await doc.embedPng(dados.logotipo).catch(() => doc.embedJpg(dados.logotipo!));
      const escala = 46 / img.height;
      pagina.drawImage(img, {
        x: fim - img.width * escala,
        y: y - 40,
        width: img.width * escala,
        height: 46,
      });
    } catch {
      // logótipo inválido: segue sem imagem
    }
  }

  texto(dados.empresa.nome || "UP Móveis", { tamanho: 17, forte: true, cor: VERMELHO });
  espaco(15);
  for (const parte of [
    dados.empresa.morada,
    [dados.empresa.telefone, dados.empresa.email].filter(Boolean).join(" · "),
    dados.empresa.nif ? `NIF ${dados.empresa.nif}` : "",
  ]) {
    if (parte) {
      texto(parte, { tamanho: 8.5, cor: CINZA });
      espaco(11);
    }
  }

  espaco(12);
  texto(`Nota de encomenda ${dados.numero}`, { tamanho: 13, forte: true });
  espaco(14);
  texto(`Data: ${dataPt(dados.data)}   ·   Vendedora: ${dados.vendedora}`, {
    tamanho: 9,
    cor: CINZA,
  });
  espaco(16);
  linhaHorizontal(VERMELHO);
  espaco(18);

  // --------------------------------------------------------------- cliente
  texto("Cliente", { forte: true, tamanho: 10.5 });
  espaco(14);
  texto(dados.cliente.nome, { tamanho: 10 });
  espaco(12);
  const detalhesCliente = [
    dados.cliente.nif ? `NIF ${dados.cliente.nif}` : "",
    dados.cliente.telefone ? `Telefone ${dados.cliente.telefone}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (detalhesCliente) {
    texto(detalhesCliente, { tamanho: 9, cor: CINZA });
    espaco(12);
  }
  if (dados.cliente.morada) {
    texto(`Entrega: ${corta(dados.cliente.morada, fim - margem, 9)}`, { tamanho: 9, cor: CINZA });
    espaco(12);
  }

  espaco(10);

  // ----------------------------------------------------------------- linhas
  const colQtd = margem + 300;
  const colPreco = margem + 360;
  const colDesc = margem + 430;

  function cabecalhoTabela() {
    texto("Descrição", { forte: true, tamanho: 9 });
    direita("Qtd.", colQtd, { forte: true, tamanho: 9 });
    direita("Preço", colPreco, { forte: true, tamanho: 9 });
    direita("Desc.", colDesc, { forte: true, tamanho: 9 });
    direita("Total", fim, { forte: true, tamanho: 9 });
    espaco(6);
    linhaHorizontal();
    espaco(13);
  }

  cabecalhoTabela();

  for (const linha of dados.linhas) {
    texto(corta(linha.descricao, 250));
    direita(String(linha.quantidade), colQtd);
    direita(euros(linha.preco_unitario), colPreco);
    direita(linha.desconto > 0 ? euros(linha.desconto) : "—", colDesc);
    direita(euros(linha.total), fim);
    espaco(15);
    if (y === altura - margem) cabecalhoTabela();
  }

  if (dados.montagem > 0) {
    texto("Montagem em casa do cliente");
    direita(euros(dados.montagem), fim);
    espaco(15);
  }
  if (dados.entrega > 0) {
    texto("Entrega ao domicílio");
    direita(euros(dados.entrega), fim);
    espaco(15);
  }

  espaco(2);
  linhaHorizontal();
  espaco(16);

  // ----------------------------------------------------------------- totais
  function totalLinha(etiqueta: string, valor: string, forte = false) {
    direita(etiqueta, colDesc, { forte, tamanho: forte ? 11 : 9.5 });
    direita(valor, fim, { forte, tamanho: forte ? 11 : 9.5 });
    espaco(forte ? 18 : 14);
  }

  totalLinha("Subtotal", euros(dados.subtotal));
  if (dados.descontos > 0) totalLinha("Descontos", `- ${euros(dados.descontos)}`);
  totalLinha("IVA", euros(dados.iva));
  totalLinha("Total", euros(dados.total), true);

  espaco(4);
  linhaHorizontal();
  espaco(18);

  // ------------------------------------------------------------- pagamentos
  texto("Pagamentos", { forte: true, tamanho: 10.5 });
  espaco(14);
  if (dados.pagamentos.length === 0) {
    texto("Sem pagamentos registados.", { tamanho: 9, cor: CINZA });
    espaco(13);
  }
  for (const pg of dados.pagamentos) {
    texto(`${pg.forma} · ${pg.estado}${pg.data ? ` · ${dataPt(pg.data)}` : ""}`, { tamanho: 9 });
    direita(euros(pg.valor), fim, { tamanho: 9 });
    espaco(13);
  }
  espaco(3);
  texto(`Já pago: ${euros(dados.pago)}`, { tamanho: 9.5, forte: true });
  espaco(16);

  pagina.drawRectangle({
    x: margem,
    y: y - 6,
    width: fim - margem,
    height: 26,
    color: rgb(0.996, 0.937, 0.937),
    borderColor: VERMELHO,
    borderWidth: 0.8,
  });
  texto(`A pagar na entrega: ${euros(dados.falta)}`, {
    x: margem + 10,
    tamanho: 11,
    forte: true,
    cor: VERMELHO,
  });
  espaco(34);

  texto(`Data de entrega prevista: ${dataPt(dados.data_entrega)}`, { tamanho: 10, forte: true });
  espaco(30);

  // -------------------------------------------------------------- assinatura
  if (y < margem + 130) novaPagina();
  linhaHorizontal();
  espaco(18);
  texto(
    "A assinatura do cliente confirma a encomenda acima e a data de entrega acordada.",
    { tamanho: 8.5, cor: CINZA },
  );
  espaco(46);
  pagina.drawLine({
    start: { x: margem, y },
    end: { x: margem + 240, y },
    thickness: 0.8,
    color: PRETO,
  });
  pagina.drawLine({
    start: { x: fim - 160, y },
    end: { x: fim, y },
    thickness: 0.8,
    color: PRETO,
  });
  espaco(12);
  texto("Assinatura do cliente", { tamanho: 8, cor: CINZA });
  direita("Data", fim, { tamanho: 8, cor: CINZA });

  return await doc.save();
}
