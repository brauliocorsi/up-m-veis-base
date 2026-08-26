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
