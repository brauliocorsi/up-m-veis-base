# UP Móveis Base

UP Vendas — Fase 1: Fundação

Prompt para colar no Lovable

Vais construir a fundação de um ERP para a UP Móveis, uma fábrica e loja de mobiliário em Paços de Ferreira, Portugal. Esta fase não tem vendas ainda — constrói a base sobre a qual tudo o resto assenta: base de dados, autenticação, perfis, segurança, auditoria e os ecrãs de configuração.

Toda a interface é em português europeu. Mobile-first, com vista desktop mais rica. Cor de marca: vermelho #DD2424 sobre branco.

Não avances para vendas, stock ou compras. Faz só o que está aqui, e faz bem.

1. Regras de arquitetura (obrigatórias em tudo o que criares)

Tudo no schema erp, exposto na API. Nada no public.

Nada se apaga fisicamente. Todas as tabelas têm eliminação lógica. Revoga o DELETE às roles da aplicação.

Auditoria universal: qualquer INSERT ou UPDATE em qualquer tabela do erp grava um evento.

Dinheiro em numeric(12,2), nunca float ou real.

Validação na base de dados, com CHECK e FOREIGN KEY, além da validação no ecrã.

RLS ativo em todas as tabelas, negar por defeito, permitir por política.

Numeração de documentos por SEQUENCE do Postgres — nunca contagem no frontend.

2. Colunas comuns

Todas as tabelas do erp levam obrigatoriamente:

id              uuid primary key default gen_random_uuid(),
criado_em       timestamptz not null default now(),
criado_por      uuid references auth.users(id),
atualizado_em   timestamptz,
atualizado_por  uuid references auth.users(id),
eliminado_em    timestamptz,
eliminado_por   uuid references auth.users(id),
motivo_eliminacao text


Cria um trigger erp.tg_campos_auditoria() que preenche criado_por/atualizado_em/atualizado_por automaticamente a partir de auth.uid(). O frontend nunca escreve estes campos.

3. Tabelas desta fase

3.1 Utilizadores e perfis

create type erp.perfil as enum
  ('vendedora','escritorio','compras','financeiro','adm');

create table erp.utilizadores (
  -- colunas comuns +
  user_id   uuid not null unique references auth.users(id) on delete restrict,
  nome      text not null check (length(trim(nome)) >= 3),
  email     text not null,
  telefone  text,
  perfil    erp.perfil not null default 'vendedora',
  ativo     boolean not null default true
);


Trigger em auth.users que cria o registo em erp.utilizadores no signup, com perfil vendedora por defeito.

Funções auxiliares, ambas security definer e stable:

erp.perfil_atual() returns erp.perfil

erp.is_adm() returns boolean

Importante: o perfil vive nesta tabela, nunca nos metadados do utilizador (esses são editáveis pelo próprio).

3.2 Auditoria

create table erp.eventos (
  id           bigserial primary key,
  tabela       text not null,
  registo_id   uuid not null,
  operacao     text not null check (operacao in ('INSERT','UPDATE','ELIMINACAO','RESTAURO')),
  alteracoes   jsonb,          -- só os campos que mudaram: {campo: {antes, depois}}
  utilizador_id uuid,
  utilizador_nome text,
  ocorrido_em  timestamptz not null default now()
);


Trigger genérico erp.tg_auditoria() aplicado a todas as tabelas do erp, em AFTER INSERT/UPDATE.

No UPDATE grava só os campos alterados, não o registo inteiro.

Se eliminado_em passou de nulo a preenchido → operação ELIMINACAO; ao contrário → RESTAURO.

Tabela append-only: sem políticas de UPDATE nem DELETE para ninguém. Só ADM lê.

Índices em (tabela, registo_id) e (ocorrido_em desc).

3.3 Configurações

create table erp.formas_pagamento (
  -- comuns +
  codigo text not null unique,
  nome text not null,
  momento text not null check (momento in ('loja','entrega','antecipado','financiador')),
  estado_inicial text not null check (estado_inicial in ('confirmado','pendente_confirmacao','pendente')),
  exige_comprovativo boolean not null default false,
  prazo_confirmacao_horas int check (prazo_confirmacao_horas > 0),
  taxa_pct numeric(5,2) not null default 0 check (taxa_pct >= 0 and taxa_pct <= 100),
  entra_caixa boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true
);

create table erp.zonas_entrega (
  -- comuns +
  nome text not null,
  cp_inicio char(4) not null check (cp_inicio ~ '^[0-9]{4}$'),
  cp_fim    char(4) not null check (cp_fim ~ '^[0-9]{4}$'),
  valor_base numeric(12,2) not null default 0 check (valor_base >= 0),
  valor_por_m3 numeric(12,2) not null default 0 check (valor_por_m3 >= 0),
  valor_min numeric(12,2) not null default 0,
  gratis_acima numeric(12,2),
  dias_rota int[] not null default '{2,3,4,5,6}',  -- 1=domingo … 7=sábado
  ativo boolean not null default true,
  check (cp_fim >= cp_inicio)
);

create table erp.calendario (
  -- comuns +
  data date not null unique,
  tipo text not null check (tipo in ('feriado','paragem_fabrica','fim_semana_excecional')),
  descricao text not null
);

create table erp.motivos (
  -- comuns +
  contexto text not null check (contexto in
    ('cancelamento','alteracao_data','eliminacao','saida_caixa','desconto_excecional','reabertura')),
  descricao text not null,
  exige_texto boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true
);

create table erp.definicoes (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz, atualizado_por uuid
);


Semear erp.definicoes com: dados da empresa (nome, NIF, morada, telefone, email, logótipo), iva_pct = 23, dias_separacao = 1, validade_orcamento_dias = 15, e limites de desconto por perfil.

Dados iniciais a semear:

Formas de pagamento: Dinheiro (loja, confirmado, entra no caixa) · Multibanco/TPA (loja, confirmado, entra no caixa) · MB Way (loja, confirmado, entra no caixa) · Transferência bancária (antecipado, pendente de confirmação, exige comprovativo, 48h) · Pagar na entrega (entrega, pendente) · Sequra (financiador, pendente) · Scalapay (financiador, pendente)

Feriados nacionais portugueses do ano corrente e do seguinte

Motivos base para cada contexto

3.4 Sequências

create sequence erp.seq_pedido start 1;
create sequence erp.seq_orcamento start 1;
create sequence erp.seq_ordem_compra start 1;
create sequence erp.seq_recibo start 1;


Função erp.proximo_numero(tipo text) returns text que devolve formatado, ex.: PED-2026-000123.

4. Segurança

alter table <cada tabela> enable row level security;
revoke delete on all tables in schema erp from authenticated, anon;
revoke all on erp.eventos from authenticated, anon;
grant select on erp.eventos to authenticated;  -- filtrado por política de ADM


Políticas:

Tabela SELECT INSERT / UPDATE utilizadores autenticado vê o seu registo; ADM vê todos só ADM eventos só ADM ninguém (só trigger) Configurações qualquer autenticado ativo só ADM definicoes qualquer autenticado ativo só ADM

Todas as políticas exigem erp.utilizadores.ativo = true. Um utilizador desativado não lê nada.

Cria também, para cada tabela, uma view erp.v_<tabela> que filtra eliminado_em is null — o frontend usa as views, o ADM usa as tabelas na lixeira.

5. Ecrãs

Autenticação

Login com email e palavra-passe, recuperação de palavra-passe. Sem registo público — os utilizadores são criados pelo ADM. Ecrã de bloqueio para utilizadores inativos com mensagem clara.

Estrutura

Barra lateral em desktop, barra inferior + menu em mobile. Só aparecem as secções a que o perfil tem acesso — nunca opções desativadas a gerar dúvida. Cabeçalho com nome do utilizador, perfil e sair.

Ecrãs a construir

Painel — vazio nesta fase, com cartões placeholder e boas-vindas

Utilizadores (ADM) — lista, criar, editar, ativar/desativar, alterar perfil

Formas de pagamento (ADM) — lista ordenável, criar, editar, ativar/desativar. Ao criar, mostrar em texto simples o que cada combinação significa: "Esta forma será registada como confirmada no momento da venda e entra no caixa da vendedora."

Zonas de entrega (ADM) — lista, criar, editar; validar sobreposição de intervalos de código postal e avisar

Calendário (ADM) — vista de ano, marcar feriados e paragens

Motivos (ADM) — agrupados por contexto

Definições (ADM) — dados da empresa, IVA, limites de desconto por perfil

Lixeira (ADM) — tudo o que tem eliminado_em, por tabela, com quem eliminou, quando e porquê, e botão restaurar

Histórico (ADM) — erp.eventos com filtros por tabela, utilizador e data; ver alterações campo a campo

6. Padrões de interface (aplicar em todos os ecrãs desta e das próximas fases)

Ícones lucide-react, sempre com tooltip. Mesmo ícone = mesma ação em todo o lado:

Ícone Ação Eye Ver Pencil Editar Copy Duplicar Printer Imprimir Download Descarregar PDF Mail Enviar por email Trash2 Eliminar (lógica, a vermelho) RotateCcw Restaurar Ban Cancelar documento Check Confirmar (ação principal) Lock Fechado, não editável History Histórico do registo

Regras:

Eliminar abre sempre diálogo com o nome do registo e seleção de motivo da tabela erp.motivos.

Ações destrutivas afastadas das restantes, a vermelho.

Em mobile as ações passam para menu MoreVertical.

Toast de sucesso e de erro em português claro, sem jargão técnico: nunca "violation of foreign key constraint", sempre "Não é possível eliminar: esta forma de pagamento está a ser usada".

Tabelas com pesquisa, ordenação e paginação do lado do servidor.

Formulários com react-hook-form + zod, validação ao sair do campo, botão de guardar sempre visível com estado (Guardar / A guardar / Guardado).

7. Critérios de aceitação

A fase está pronta quando:

[ ] Um utilizador não-ADM não consegue ler nem escrever configurações, testado com o token dele

[ ] Tentar DELETE numa tabela do erp pela API falha por falta de permissão

[ ] Eliminar um registo pela interface preenche eliminado_em, eliminado_por e motivo_eliminacao, e o registo desaparece das listas mas aparece na lixeira

[ ] Restaurar da lixeira devolve o registo às listas

[ ] Cada criação e alteração gera uma linha em erp.eventos com os campos alterados

[ ] Um utilizador desativado faz login mas não lê nenhum dado

[ ] erp.proximo_numero('pedido') devolve números sequenciais sem saltos nem repetições, mesmo com chamadas simultâneas

[ ] Formas de pagamento, zonas, feriados e motivos estão semeados e editáveis

[ ] A interface funciona bem num telemóvel e num computador

[ ] Nenhuma mensagem de erro técnica chega ao utilizador

Quando terminares, mostra-me: a lista de tabelas criadas, as políticas RLS de cada uma, e um resumo do que ficou por fazer.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a479053a-f2b6-4010-abc1-2ab75647be91).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
