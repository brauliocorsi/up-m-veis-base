# UP Vendas — Fase 1: Fundação

ERP da UP Móveis. Esta fase entrega apenas a base: base de dados no schema `erp`, autenticação, perfis, segurança, auditoria e os ecrãs de configuração. Sem vendas, stock ou compras.

Interface toda em português europeu, mobile-first, marca vermelho `#DD2424` sobre branco.

## 1. Backend (Lovable Cloud)

Ativação do backend integrado (base de dados + autenticação). Tudo criado no schema `erp`, exposto na API; nada em `public`.

### Colunas comuns em todas as tabelas
`id`, `criado_em`, `criado_por`, `atualizado_em`, `atualizado_por`, `eliminado_em`, `eliminado_por`, `motivo_eliminacao`, preenchidas por trigger `erp.tg_campos_auditoria()` a partir do utilizador autenticado. O frontend nunca escreve estes campos.

### Tabelas
- `erp.utilizadores` — ligação a contas de acesso, nome, email, telefone, perfil (`vendedora`, `escritorio`, `compras`, `financeiro`, `adm`), ativo
- `erp.eventos` — auditoria append-only (tabela, registo, operação, alterações campo a campo)
- `erp.formas_pagamento`
- `erp.zonas_entrega`
- `erp.calendario`
- `erp.motivos`
- `erp.definicoes`

Enum `erp.perfil`. Sequências `seq_pedido`, `seq_orcamento`, `seq_ordem_compra`, `seq_recibo` + função `erp.proximo_numero(tipo)` que devolve, por exemplo, `PED-2026-000123`.

### Auditoria
Trigger genérico `erp.tg_auditoria()` em AFTER INSERT/UPDATE de todas as tabelas do `erp`. No UPDATE grava só os campos alterados. Passar `eliminado_em` de vazio a preenchido gera `ELIMINACAO`; o inverso gera `RESTAURO`. Índices em `(tabela, registo_id)` e `(ocorrido_em desc)`.

### Segurança
- RLS ativo em todas as tabelas, negar por defeito
- `DELETE` revogado às roles da aplicação — nada se apaga fisicamente
- Todas as políticas exigem `erp.utilizadores.ativo = true`
- Funções `erp.perfil_atual()` e `erp.is_adm()` (security definer, stable); o perfil vive na tabela, nunca nos metadados da conta
- `erp.eventos`: leitura só ADM, sem escrita para ninguém (só trigger)
- Configurações e definições: leitura para qualquer autenticado ativo, escrita só ADM
- `erp.utilizadores`: cada um vê o seu registo; ADM vê e edita todos
- View `erp.v_<tabela>` por tabela filtrando `eliminado_em is null` — o frontend usa as views; a Lixeira usa as tabelas

### Dados iniciais (na migração)
- Formas de pagamento: Dinheiro, Multibanco/TPA, MB Way (loja, confirmado, entram no caixa); Transferência bancária (antecipado, pendente de confirmação, exige comprovativo, 48h); Pagar na entrega (entrega, pendente); Sequra e Scalapay (financiador, pendente)
- Feriados nacionais portugueses de 2026 e 2027
- Motivos base para cada contexto
- Definições: dados da empresa, `iva_pct = 23`, `dias_separacao = 1`, `validade_orcamento_dias = 15`, limites de desconto por perfil
- Conta `brauliocorsi@upmoveis.pt` criada com a palavra-passe indicada e perfil **adm**

## 2. Autenticação
Login com email e palavra-passe e recuperação de palavra-passe. Sem registo público — as contas são criadas pelo ADM, que define a palavra-passe inicial. Utilizadores inativos entram mas vêem um ecrã de bloqueio com mensagem clara.

## 3. Estrutura da aplicação
Barra lateral em desktop; barra inferior + menu em mobile. Só aparecem as secções permitidas ao perfil — nunca opções desativadas. Cabeçalho com nome, perfil e sair.

## 4. Ecrãs
1. **Painel** — boas-vindas e cartões placeholder
2. **Utilizadores** (ADM) — lista, criar com palavra-passe inicial, editar, ativar/desativar, alterar perfil
3. **Formas de pagamento** (ADM) — lista ordenável, criar/editar/ativar, com explicação em texto simples do efeito de cada combinação
4. **Zonas de entrega** (ADM) — lista, criar/editar, aviso de sobreposição de intervalos de código postal
5. **Calendário** (ADM) — vista de ano, marcar feriados e paragens
6. **Motivos** (ADM) — agrupados por contexto
7. **Definições** (ADM) — empresa, IVA, limites de desconto por perfil
8. **Lixeira** (ADM) — por tabela: quem eliminou, quando, porquê, e restaurar
9. **Histórico** (ADM) — eventos com filtros por tabela, utilizador e data, alterações campo a campo

## 5. Padrões de interface
Ícones lucide-react com tooltip e significado fixo: Eye ver, Pencil editar, Copy duplicar, Printer imprimir, Download PDF, Mail email, Trash2 eliminar (vermelho), RotateCcw restaurar, Ban cancelar, Check confirmar, Lock fechado, History histórico. Eliminar abre sempre diálogo com o nome do registo e escolha de motivo. Ações destrutivas separadas e a vermelho; em mobile passam para menu MoreVertical. Tabelas com pesquisa, ordenação e paginação no servidor. Formulários react-hook-form + zod, validação ao sair do campo, botão com estado Guardar / A guardar / Guardado. Mensagens sempre em português claro, sem jargão técnico.

## Notas técnicas
- Stack TanStack Start; leituras e escritas via server functions autenticadas (RLS aplicada como o utilizador). Criação de contas e definição de palavra-passe usam a API de administração no servidor, só após verificar que quem chama é ADM.
- Design system em tokens semânticos no CSS global (vermelho de marca como `primary`), sem cores fixas nos componentes.
- Erros da base de dados traduzidos numa camada única para mensagens de utilizador.

## Fica por fazer (fases seguintes)
Vendas, orçamentos, stock, compras, caixa, entregas e relatórios.
