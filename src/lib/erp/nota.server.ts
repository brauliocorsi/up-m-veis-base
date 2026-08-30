import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface DadosEmpresa {
  nome?: string;
  nif?: string;
  morada?: string;
  telefone?: string;
  email?: string;
  logotipo_url?: string;
  mensagem_documento?: string;
  apoio_url?: string;
  observacoes_documento?: string;
}

export interface LinhaNota {
  codigo: string | null;
  descricao: string;
  unidade: string;
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
    email?: string | null;
    morada: string | null;
  };
  produtos: LinhaNota[];
  servicos: LinhaNota[];
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
const BORDA = rgb(0.72, 0.72, 0.75);
const FUNDO_BARRA = rgb(0.925, 0.925, 0.933);

function euros(valor: number): string {
  return `${Number(valor ?? 0).toFixed(2).replace(".", ",")} \u20AC`;
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
  const margem = 36;
  const fim = largura - margem;
  const interior = fim - margem;

  let pagina: PDFPage = doc.addPage([largura, altura]);
  let y = altura - margem;

  function novaPagina() {
    pagina = doc.addPage([largura, altura]);
    y = altura - margem;
  }

  function garantir(espacoNecessario: number) {
    if (y - espacoNecessario < margem + 30) novaPagina();
  }

  function fonteDe(forte?: boolean): PDFFont {
    return forte ? negrito : normal;
  }

  function texto(
    valor: string,
    x: number,
    yy: number,
    o: { tamanho?: number; forte?: boolean; cor?: typeof PRETO } = {},
  ) {
    pagina.drawText(valor, {
      x,
      y: yy,
      size: o.tamanho ?? 8.5,
      font: fonteDe(o.forte),
      color: o.cor ?? PRETO,
    });
  }

  function direita(
    valor: string,
    xFim: number,
    yy: number,
    o: { tamanho?: number; forte?: boolean; cor?: typeof PRETO } = {},
  ) {
    const tamanho = o.tamanho ?? 8.5;
    const fonte = fonteDe(o.forte);
    texto(valor, xFim - fonte.widthOfTextAtSize(valor, tamanho), yy, o);
  }

  function centro(
    valor: string,
    xInicio: number,
    xFim: number,
    yy: number,
    o: { tamanho?: number; forte?: boolean; cor?: typeof PRETO } = {},
  ) {
    const tamanho = o.tamanho ?? 8.5;
    const fonte = fonteDe(o.forte);
    const w = fonte.widthOfTextAtSize(valor, tamanho);
    texto(valor, xInicio + (xFim - xInicio - w) / 2, yy, o);
  }

  function embrulhar(valor: string, max: number, tamanho: number, forte = false): string[] {
    const fonte = fonteDe(forte);
    const palavras = (valor ?? "").split(/\s+/).filter(Boolean);
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= max) {
        atual = tentativa;
      } else {
        if (atual) linhas.push(atual);
        atual = p;
        while (fonte.widthOfTextAtSize(atual, tamanho) > max && atual.length > 1) {
          let corte = atual;
          while (corte.length > 1 && fonte.widthOfTextAtSize(corte, tamanho) > max)
            corte = corte.slice(0, -1);
          linhas.push(corte);
          atual = atual.slice(corte.length);
        }
      }
    }
    if (atual) linhas.push(atual);
    return linhas.length ? linhas : ["—"];
  }

  function caixa(x: number, yTopo: number, w: number, h: number, fundo?: typeof PRETO) {
    pagina.drawRectangle({
      x,
      y: yTopo - h,
      width: w,
      height: h,
      ...(fundo ? { color: fundo } : {}),
      borderColor: BORDA,
      borderWidth: 0.6,
    });
  }

  function barraSeccao(titulo: string) {
    garantir(30);
    caixa(margem, y, interior, 15, FUNDO_BARRA);
    texto(titulo, margem + 6, y - 10.5, { forte: true, tamanho: 8.5 });
    y -= 15;
  }

  // ------------------------------------------------------------- cabeçalho
  const alturaCabecalho = 74;
  caixa(margem, y, interior, alturaCabecalho);
  const xTextoEsq = margem + 96;

  if (dados.logotipo) {
    try {
      const img = await doc.embedPng(dados.logotipo).catch(() => doc.embedJpg(dados.logotipo!));
      const maxL = 78;
      const maxA = 52;
      const escala = Math.min(maxL / img.width, maxA / img.height);
      pagina.drawImage(img, {
        x: margem + 8 + (maxL - img.width * escala) / 2,
        y: y - alturaCabecalho / 2 - (img.height * escala) / 2,
        width: img.width * escala,
        height: img.height * escala,
      });
    } catch {
      // logótipo inválido: segue sem imagem
    }
  } else {
    texto(dados.empresa.nome || "UP Móveis", margem + 8, y - alturaCabecalho / 2, {
      forte: true,
      tamanho: 11,
      cor: VERMELHO,
    });
  }

  const direitaLinhas = [
    dados.empresa.telefone ?? "",
    dados.empresa.email ?? "",
    `Vendedor: ${dados.vendedora}`,
  ].filter(Boolean);
  let yDir = y - 14;
  for (const [i, linha] of direitaLinhas.entries()) {
    for (const parte of embrulhar(linha, 150, 8, i !== 1)) {
      direita(parte, fim - 8, yDir, { tamanho: 8, forte: i !== 1 });
      yDir -= 10;
    }
  }

  let yEsq = y - 14;
  texto(dados.empresa.nome || "UP Móveis", xTextoEsq, yEsq, { forte: true, tamanho: 11 });
  yEsq -= 13;
  for (const parte of embrulhar(dados.empresa.mensagem_documento ?? "", 300, 8)) {
    if (parte === "—") break;
    texto(parte, xTextoEsq, yEsq, { tamanho: 8, cor: CINZA });
    yEsq -= 9.5;
  }
  y -= alturaCabecalho + 12;

  // -------------------------------------------------------------- título
  caixa(margem, y, interior, 20, FUNDO_BARRA);
  centro(`NOTA DE ENCOMENDA Nº ${dados.numero}`, margem, fim, y - 13.5, {
    forte: true,
    tamanho: 11,
  });
  direita(dataPt(dados.data), fim - 8, y - 13.5, { forte: true, tamanho: 10 });
  y -= 20 + 8;

  // ------------------------------------------------------------- cliente
  barraSeccao("DADOS DO CLIENTE");
  const etiquetaL = 62;
  function linhaCliente(pares: Array<{ etiqueta: string; valor: string; peso: number }>) {
    const alturaLinha = 17;
    garantir(alturaLinha + 10);
    let x = margem;
    const total = pares.reduce((s, p) => s + p.peso, 0);
    for (const par of pares) {
      const w = (interior * par.peso) / total;
      caixa(x, y, etiquetaL, alturaLinha, FUNDO_BARRA);
      texto(par.etiqueta, x + 5, y - 11.5, { forte: true, tamanho: 8.5 });
      caixa(x + etiquetaL, y, w - etiquetaL, alturaLinha);
      texto(embrulhar(par.valor || "—", w - etiquetaL - 10, 8.5)[0]!, x + etiquetaL + 5, y - 11.5, {
        tamanho: 8.5,
      });
      x += w;
    }
    y -= alturaLinha;
  }

  linhaCliente([{ etiqueta: "Cliente:", valor: dados.cliente.nome, peso: 1 }]);
  linhaCliente([{ etiqueta: "Endereço:", valor: dados.cliente.morada ?? "—", peso: 1 }]);
  linhaCliente([
    { etiqueta: "NIF:", valor: dados.cliente.nif ?? "—", peso: 1 },
    { etiqueta: "Telefone:", valor: dados.cliente.telefone ?? "—", peso: 1 },
  ]);
  y -= 8;

  // -------------------------------------------------------------- tabelas
  function tabela(titulo: string, linhas: LinhaNota[], comUnidade: boolean) {
    barraSeccao(titulo);

    const xCodigo = margem;
    const wCodigo = 96;
    const wUnd = comUnidade ? 38 : 0;
    const wQtd = 40;
    const wUnit = 68;
    const wSub = 72;
    const wNome = interior - wCodigo - wUnd - wQtd - wUnit - wSub;

    const xNome = xCodigo + wCodigo;
    const xUnd = xNome + wNome;
    const xQtd = xUnd + wUnd;
    const xUnit = xQtd + wQtd;
    const xSub = xUnit + wUnit;

    function cabecalho() {
      garantir(24);
      const h = 16;
      caixa(xCodigo, y, wCodigo, h);
      caixa(xNome, y, wNome, h);
      if (comUnidade) caixa(xUnd, y, wUnd, h);
      caixa(xQtd, y, wQtd, h);
      caixa(xUnit, y, wUnit, h);
      caixa(xSub, y, wSub, h);
      const yt = y - 11;
      texto("CÓDIGO", xCodigo + 5, yt, { forte: true, tamanho: 7.5 });
      texto("NOME", xNome + 5, yt, { forte: true, tamanho: 7.5 });
      if (comUnidade) centro("UND.", xUnd, xUnd + wUnd, yt, { forte: true, tamanho: 7.5 });
      direita("QTD.", xQtd + wQtd - 5, yt, { forte: true, tamanho: 7.5 });
      direita("VR. UNIT.", xUnit + wUnit - 5, yt, { forte: true, tamanho: 7.5 });
      direita("SUBTOTAL", xSub + wSub - 5, yt, { forte: true, tamanho: 7.5 });
      y -= h;
    }

    cabecalho();

    if (linhas.length === 0) {
      const h = 18;
      caixa(margem, y, interior, h);
      texto("Sem linhas.", margem + 5, y - 12, { tamanho: 8.5, cor: CINZA });
      y -= h;
      return;
    }

    let somaQtd = 0;
    let somaTotal = 0;

    for (const linha of linhas) {
      const partes = embrulhar(linha.descricao, wNome - 10, 8.5);
      const h = Math.max(18, 8 + partes.length * 10);
      if (y - h < margem + 60) {
        novaPagina();
        cabecalho();
      }
      caixa(xCodigo, y, wCodigo, h);
      caixa(xNome, y, wNome, h);
      if (comUnidade) caixa(xUnd, y, wUnd, h);
      caixa(xQtd, y, wQtd, h);
      caixa(xUnit, y, wUnit, h);
      caixa(xSub, y, wSub, h);

      const yt = y - 12;
      texto(embrulhar(linha.codigo || "——", wCodigo - 10, 8)[0]!, xCodigo + 5, yt, { tamanho: 8 });
      let yNome = yt;
      for (const parte of partes) {
        texto(parte, xNome + 5, yNome, { tamanho: 8.5 });
        yNome -= 10;
      }
      if (comUnidade) centro(linha.unidade || "UN", xUnd, xUnd + wUnd, yt, { tamanho: 8 });
      direita(String(linha.quantidade), xQtd + wQtd - 5, yt, { tamanho: 8.5 });
      direita(euros(linha.preco_unitario), xUnit + wUnit - 5, yt, { tamanho: 8.5 });
      direita(euros(linha.total), xSub + wSub - 5, yt, { tamanho: 8.5 });

      somaQtd += Number(linha.quantidade ?? 0);
      somaTotal += Number(linha.total ?? 0);
      y -= h;
    }

    garantir(24);
    const h = 17;
    caixa(margem, y, interior, h, FUNDO_BARRA);
    texto("TOTAL", margem + 5, y - 11.5, { forte: true, tamanho: 8.5 });
    direita(String(somaQtd), xQtd + wQtd - 5, y - 11.5, { forte: true, tamanho: 8.5 });
    direita(euros(somaTotal), xSub + wSub - 5, y - 11.5, { forte: true, tamanho: 8.5 });
    y -= h + 8;
  }

  tabela("PRODUTOS", dados.produtos, true);
  tabela("SERVIÇOS", dados.servicos, false);

  // --------------------------------------------------------------- totais
  function totalLinha(etiqueta: string, valor: string, destaque = false) {
    garantir(22);
    const h = destaque ? 19 : 16;
    caixa(margem + interior / 2, y, interior / 2, h, destaque ? FUNDO_BARRA : undefined);
    texto(etiqueta, margem + interior / 2 + 6, y - (destaque ? 13 : 11), {
      forte: destaque,
      tamanho: destaque ? 9.5 : 8.5,
    });
    direita(valor, fim - 6, y - (destaque ? 13 : 11), {
      forte: destaque,
      tamanho: destaque ? 9.5 : 8.5,
    });
    y -= h;
  }

  totalLinha("Subtotal", euros(dados.subtotal));
  if (dados.descontos > 0) totalLinha("Descontos", `- ${euros(dados.descontos)}`);
  totalLinha("IVA", euros(dados.iva));
  totalLinha("TOTAL DO PEDIDO", euros(dados.total), true);
  y -= 10;

  // ----------------------------------------------------------- pagamentos
  barraSeccao("DADOS DO PAGAMENTO");
  const colsPag = [
    { titulo: "DATA", w: 90 },
    { titulo: "VALOR", w: 90 },
    { titulo: "FORMA DE PAGAMENTO", w: 180 },
    { titulo: "OBSERVAÇÃO", w: interior - 360 },
  ];

  function cabecalhoPagamentos() {
    garantir(24);
    let x = margem;
    for (const c of colsPag) {
      caixa(x, y, c.w, 16);
      texto(c.titulo, x + 5, y - 11, { forte: true, tamanho: 7.5 });
      x += c.w;
    }
    y -= 16;
  }

  cabecalhoPagamentos();

  if (dados.pagamentos.length === 0) {
    caixa(margem, y, interior, 18);
    texto("Sem pagamentos registados.", margem + 5, y - 12, { tamanho: 8.5, cor: CINZA });
    y -= 18;
  }
  for (const pg of dados.pagamentos) {
    if (y - 18 < margem + 60) {
      novaPagina();
      cabecalhoPagamentos();
    }
    const valores = [dataPt(pg.data), euros(pg.valor), pg.forma, pg.estado];
    let x = margem;
    for (const [i, c] of colsPag.entries()) {
      caixa(x, y, c.w, 18);
      texto(embrulhar(valores[i] ?? "—", c.w - 10, 8.5)[0]!, x + 5, y - 12, { tamanho: 8.5 });
      x += c.w;
    }
    y -= 18;
  }

  y -= 10;
  garantir(70);
  pagina.drawRectangle({
    x: margem,
    y: y - 24,
    width: interior,
    height: 24,
    color: rgb(0.996, 0.937, 0.937),
    borderColor: VERMELHO,
    borderWidth: 0.8,
  });
  texto(`Já pago: ${euros(dados.pago)}`, margem + 8, y - 15.5, { tamanho: 9, cor: CINZA });
  direita(`A PAGAR NA ENTREGA: ${euros(dados.falta)}`, fim - 8, y - 15.5, {
    tamanho: 10,
    forte: true,
    cor: VERMELHO,
  });
  y -= 24 + 12;

  texto(`Data de entrega prevista: ${dataPt(dados.data_entrega)}`, margem, y - 10, {
    tamanho: 9.5,
    forte: true,
  });
  y -= 24;

  // --------------------------------------------------------- observações
  const observacoes: string[] = [];
  if (dados.empresa.nif) observacoes.push(`NIF da empresa: ${dados.empresa.nif}`);
  if (dados.empresa.morada) observacoes.push(dados.empresa.morada);
  for (const linha of (dados.empresa.observacoes_documento ?? "").split(/\r?\n/)) {
    if (linha.trim()) observacoes.push(linha.trim());
  }
  if (dados.empresa.apoio_url) observacoes.push(`Apoio ao cliente: ${dados.empresa.apoio_url}`);

  if (observacoes.length > 0) {
    barraSeccao("OBSERVAÇÕES");
    y -= 4;
    for (const linha of observacoes) {
      for (const parte of embrulhar(linha, interior - 4, 8)) {
        garantir(14);
        texto(parte, margem + 2, y - 9, { tamanho: 8, cor: CINZA });
        y -= 10;
      }
    }
    y -= 12;
  }

  // ---------------------------------------------------------- assinatura
  if (y < margem + 120) novaPagina();
  texto(
    "A assinatura do cliente confirma a encomenda acima e a data de entrega acordada.",
    margem,
    y - 10,
    { tamanho: 8, cor: CINZA },
  );
  y -= 52;
  pagina.drawLine({
    start: { x: margem, y },
    end: { x: margem + 250, y },
    thickness: 0.8,
    color: PRETO,
  });
  pagina.drawLine({
    start: { x: fim - 160, y },
    end: { x: fim, y },
    thickness: 0.8,
    color: PRETO,
  });
  texto("Assinatura do cliente", margem, y - 11, { tamanho: 8, cor: CINZA });
  direita("Data", fim, y - 11, { tamanho: 8, cor: CINZA });

  return await doc.save();
}
