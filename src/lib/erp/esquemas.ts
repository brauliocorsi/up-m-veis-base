import { z } from "zod";

export const esquemaCriarUtilizador = z.object({
  nome: z.string().trim().min(3, "O nome tem de ter pelo menos 3 letras."),
  email: z.string().trim().email("Escreva um email válido."),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  perfil: z.enum(["vendedora", "escritorio", "compras", "financeiro", "adm"]),
  palavra_passe: z.string().min(8, "A palavra-passe tem de ter pelo menos 8 caracteres."),
});

export const esquemaEditarUtilizador = z.object({
  nome: z.string().trim().min(3, "O nome tem de ter pelo menos 3 letras."),
  telefone: z.string().trim().max(30).optional().or(z.literal("")),
  perfil: z.enum(["vendedora", "escritorio", "compras", "financeiro", "adm"]),
  ativo: z.boolean(),
});

export const esquemaNovaPalavraPasse = z.object({
  user_id: z.string().uuid(),
  palavra_passe: z.string().min(8, "A palavra-passe tem de ter pelo menos 8 caracteres."),
});

export const esquemaFormaPagamento = z.object({
  codigo: z
    .string()
    .trim()
    .min(2, "Indique um código.")
    .regex(/^[A-Z0-9_]+$/, "Use só letras maiúsculas, números e _."),
  nome: z.string().trim().min(2, "Indique o nome."),
  momento: z.enum(["loja", "entrega", "antecipado", "financiador"]),
  estado_inicial: z.enum(["confirmado", "pendente_confirmacao", "pendente"]),
  exige_comprovativo: z.boolean(),
  prazo_confirmacao_horas: z.coerce.number().int().positive().nullable().optional(),
  taxa_pct: z.coerce.number().min(0, "A taxa não pode ser negativa.").max(100, "Máximo 100%."),
  entra_caixa: z.boolean(),
  ordem: z.coerce.number().int().min(0),
  ativo: z.boolean(),
});

export const esquemaZonaEntrega = z
  .object({
    nome: z.string().trim().min(2, "Indique o nome da zona."),
    cp_inicio: z.string().regex(/^[0-9]{4}$/, "Use 4 dígitos."),
    cp_fim: z.string().regex(/^[0-9]{4}$/, "Use 4 dígitos."),
    valor_base: z.coerce.number().min(0),
    valor_por_m3: z.coerce.number().min(0),
    valor_min: z.coerce.number().min(0),
    gratis_acima: z.coerce.number().min(0).nullable().optional(),
    dias_rota: z.array(z.number().int().min(1).max(7)).min(1, "Escolha pelo menos um dia."),
    ativo: z.boolean(),
  })
  .refine((v) => v.cp_fim >= v.cp_inicio, {
    message: "O código postal final tem de ser maior ou igual ao inicial.",
    path: ["cp_fim"],
  });

export const esquemaDiaCalendario = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha uma data."),
  tipo: z.enum(["feriado", "paragem_fabrica", "fim_semana_excecional"]),
  descricao: z.string().trim().min(2, "Escreva uma descrição."),
});

export const esquemaMotivo = z.object({
  contexto: z.enum([
    "cancelamento",
    "alteracao_data",
    "eliminacao",
    "saida_caixa",
    "desconto_excecional",
    "reabertura",
  ]),
  descricao: z.string().trim().min(2, "Escreva a descrição do motivo."),
  exige_texto: z.boolean(),
  ordem: z.coerce.number().int().min(0),
  ativo: z.boolean(),
});

export const esquemaEmpresa = z.object({
  nome: z.string().trim().min(2, "Indique o nome da empresa."),
  nif: z
    .string()
    .trim()
    .regex(/^$|^[0-9]{9}$/, "O NIF tem 9 dígitos."),
  morada: z.string().trim().max(200),
  telefone: z.string().trim().max(30),
  email: z.string().trim().email("Email inválido.").or(z.literal("")),
  logotipo_url: z.string().trim().url("Endereço inválido.").or(z.literal("")),
});

export const esquemaDefinicoesGerais = z.object({
  iva_pct: z.coerce.number().min(0).max(100),
  dias_separacao: z.coerce.number().int().min(0).max(60),
  validade_orcamento_dias: z.coerce.number().int().min(1).max(365),
  limite_vendedora: z.coerce.number().min(0).max(100),
  limite_escritorio: z.coerce.number().min(0).max(100),
  limite_compras: z.coerce.number().min(0).max(100),
  limite_financeiro: z.coerce.number().min(0).max(100),
  limite_adm: z.coerce.number().min(0).max(100),
});

// ===================== Fase 2: catálogo, fornecedores e clientes

const opcional = (max = 500) => z.string().trim().max(max).optional().or(z.literal(""));
const numeroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().min(0, "Não pode ser negativo.").nullable(),
);
const inteiroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().int("Use um número inteiro.").min(0, "Não pode ser negativo.").nullable(),
);

export const esquemaCategoria = z.object({
  codigo: z
    .string()
    .trim()
    .min(2, "Indique o código.")
    .regex(/^[A-Z0-9]+$/, "Use só letras maiúsculas e números."),
  nome: z.string().trim().min(2, "Indique o nome."),
  ordem: z.coerce.number().int().min(0),
  ativo: z.boolean(),
});

export const esquemaFamilia = z.object({
  categoria_id: z.string().uuid("Escolha a categoria."),
  codigo: z
    .string()
    .trim()
    .min(2, "Indique o código.")
    .regex(/^[A-Z0-9]+$/, "Use só letras maiúsculas e números."),
  nome_interno: z.string().trim().min(2, "Indique o nome interno."),
  nome_cliente: z.string().trim().min(2, "Indique o nome que o cliente vê."),
  ativo: z.boolean(),
});

export const esquemaFornecedor = z
  .object({
    nome: z.string().trim().min(2, "Indique o nome do fornecedor."),
    nif: z
      .string()
      .trim()
      .max(20)
      .optional()
      .or(z.literal("")),
    pais: z.string().trim().length(2, "Use o código do país com 2 letras."),
    email_encomendas: z.string().trim().email("Email inválido.").optional().or(z.literal("")),
    telefone: opcional(30),
    morada: opcional(300),
    idioma: z.enum(["pt", "en", "es", "fr", "pl"]),
    metodo_envio: z.enum(["email", "email_manual", "portal", "whatsapp"]),
    enviar_automatico: z.boolean(),
    prazo_dias: z.coerce.number().int().min(0).max(365),
    valor_minimo_encomenda: numeroOpcional,
    condicoes_pagamento: opcional(200),
    observacoes: opcional(1000),
    ativo: z.boolean(),
  })
  .refine((v) => !v.enviar_automatico || Boolean(v.email_encomendas), {
    message: "Para enviar encomendas automaticamente precisa do email do fornecedor.",
    path: ["email_encomendas"],
  });

export const esquemaProduto = z
  .object({
    cod_barras: z.string().trim().min(3, "Indique o código de barras."),
    cod_modelo: opcional(60),
    categoria_id: z.string().uuid("Escolha a categoria."),
    familia_id: z.string().uuid().nullable().optional(),
    nome_cliente: z.string().trim().min(2, "Indique o nome do produto."),
    nome_interno: opcional(150),
    descricao: opcional(2000),
    tipo_fornecimento: z.enum(["stock", "producao", "compra"]),
    fornecedor_id: z.string().uuid().nullable().optional(),
    prazo_producao_dias: inteiroOpcional,
    prazo_fornecedor_dias: inteiroOpcional,
    n_colis: z.coerce.number().int().min(1, "Pelo menos 1 volume.").max(50),
    volume_m3: numeroOpcional,
    peso_kg: numeroOpcional,
    preco_base: numeroOpcional,
    preco_promocional: numeroOpcional,
    custo_ultimo: numeroOpcional,
    iva_pct: z.coerce.number().min(0).max(100),
    valor_montagem: z.coerce.number().min(0),
    montagem_obrigatoria: z.boolean(),
    tempo_montagem_min: inteiroOpcional,
    permite_desconto: z.boolean(),
    margem_minima_pct: numeroOpcional,
    ponto_reposicao: inteiroOpcional,
    imagem_url: z.string().trim().url("Endereço inválido.").optional().or(z.literal("")),
    vendavel: z.boolean(),
    ativo: z.boolean(),
  })
  .refine((v) => !v.vendavel || v.preco_base !== null, {
    message: "Um produto sem preço fica sob consulta: desligue “vendável” ou indique o preço.",
    path: ["preco_base"],
  })
  .refine((v) => v.tipo_fornecimento !== "producao" || v.prazo_producao_dias !== null, {
    message: "Indique o prazo de produção.",
    path: ["prazo_producao_dias"],
  })
  .refine(
    (v) =>
      v.tipo_fornecimento !== "compra" ||
      (Boolean(v.fornecedor_id) && v.prazo_fornecedor_dias !== null),
    {
      message: "Produtos de compra precisam de fornecedor e prazo.",
      path: ["fornecedor_id"],
    },
  );

export const esquemaColi = z.object({
  cod_barras_coli: opcional(60),
  descricao: opcional(150),
});

export const esquemaServico = z.object({
  codigo: z
    .string()
    .trim()
    .min(2, "Indique o código.")
    .regex(/^[A-Z0-9_]+$/, "Use só letras maiúsculas, números e _."),
  nome: z.string().trim().min(2, "Indique o nome."),
  tipo: z.enum(["montagem", "entrega", "transporte", "assistencia", "outro"]),
  preco_base: z.coerce.number().min(0),
  iva_pct: z.coerce.number().min(0).max(100),
  permite_desconto: z.boolean(),
  ativo: z.boolean(),
});

export const esquemaCliente = z.object({
  tipo: z.enum(["particular", "empresa"]),
  nome: z.string().trim().min(3, "O nome tem de ter pelo menos 3 letras."),
  nome_fiscal: opcional(150),
  nif: opcional(20),
  nif_estrangeiro: z.boolean(),
  pais: z.string().trim().length(2, "Use o código do país com 2 letras."),
  telefone_e164: opcional(30),
  telefone_alt: opcional(30),
  email: z.string().trim().email("Email inválido.").optional().or(z.literal("")),
  morada: opcional(300),
  cp4: z
    .string()
    .trim()
    .regex(/^$|^[0-9]{4}$/, "O código postal tem 4 dígitos.")
    .optional()
    .or(z.literal("")),
  cp3: z
    .string()
    .trim()
    .regex(/^$|^[0-9]{3}$/, "A extensão do código postal tem 3 dígitos.")
    .optional()
    .or(z.literal("")),
  localidade: opcional(120),
  concelho: opcional(120),
  distrito: opcional(120),
  observacoes: opcional(1000),
  ativo: z.boolean(),
});

export const esquemaRegraDesconto = z.object({
  desconto_max_pct: z.coerce.number().min(0).max(100),
  requer_aprovacao_acima_pct: numeroOpcional,
  pode_alterar_preco: z.boolean(),
  pode_alterar_entrega: z.boolean(),
});

export const esquemaCupao = z.object({
  codigo: z
    .string()
    .trim()
    .min(3, "Indique o código do cupão.")
    .regex(/^[A-Z0-9_-]+$/, "Use só letras maiúsculas, números, - e _."),
  descricao: z.string().trim().max(200).optional().or(z.literal("")),
  tipo: z.enum(["percentagem", "valor", "entrega_gratis"]),
  valor: z.coerce.number().min(0, "O valor não pode ser negativo."),
  minimo_compra: numeroOpcional,
  valido_de: z.string().trim().min(10, "Indique a data de início."),
  valido_ate: z.string().trim().optional().or(z.literal("")),
  usos_max: numeroOpcional,
  usos_por_cliente: z.coerce.number().int().min(1, "Pelo menos 1 utilização por cliente."),
  acumulavel: z.boolean(),
  ativo: z.boolean(),
});
