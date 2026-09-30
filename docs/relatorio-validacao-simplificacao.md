# Relatório de validação — Simplificação (2026-09-30)

Auditoria: `PSQL_CMD=... ./auditoria/run.sh` numa base descartável local → **228 testes, todos a passar, 0 erros SQL**.
Typecheck e build: OK. Nada publicado, nenhum email, nenhum dado histórico alterado.

## Implementado e testado
- Permissões: `EXECUTE` retirado a PUBLIC/anon em todo o schema `erp`; `criar_op_interna`, funções `tg_*` e funções da integração só servidor (T13.A1–A4).
- Guarda `exigir_utilizador_ativo`: nega sessão anónima, utilizador inativo/ausente (NULL) e perfil errado. Injetada em confirmar/cancelar/reabrir venda, pagamentos, devoluções, documentos fiscais, custos, caixa, rotas/envelopes, receção/finalização de OC, agendar entrega (T13.B1–B2).
- Execução/planeamento interno da fábrica bloqueado no servidor e retirado do menu; histórico de OPs em leitura (T13.C1).
- "Encomendas à fábrica": uma linha por linha de venda, descrição+nota integrais, sem agrupar por produto (T13.D1–D2).
- Outbox idempotente: resposta inválida recusada, timeout = incerto com a mesma chave, reenvio não duplica (T13.D3–D5).
- Callback: guardado, duplicado ignorado, fora de ordem sem efeito, venda/linha errada recusada, política por definir = sem stock (T13.D6–D10).
- Cancelar venda com ordem externa em curso é bloqueado; cancelamento liberta todas as reservas ativas sem engolir erros (T13.D11, F1).
- Ativação bloqueada com motivo até definir política e garantir reconciliação Contagem (T13.D12).
- Compras: receção idempotente por chave; saldo diferido 10→6+4 com alocações preservadas, sem nova dívida, repetição devolve a mesma OC, segunda receção fecha, saldo não recebido em duplicado (T13.E1–E9).
- `run.sh`: erros SQL fora de blocos de exceção e verificações de código deixam de ser escondidos; código de saída ≠ 0 quando há falhas.

## Implementado, não testado ponta a ponta
- Envio real ao UP Fábrica e callback HTTP: sem receptor, sem `UP_FACTORY_URL`/`UP_FACTORY_TOKEN`. **A integração NÃO está funcional.**

## Pendente
- Decisão do proprietário: entrada em `produced` ou `warehouse_received`.
- Garantia de reconciliação com a sincronização Contagem.
- Redesenho das compras em "Por encomendar / Encomendado / Receber / Histórico" com seleção multi-venda.
- Venda: mostrar recebido/falta/OC atual/ETA e nova versão da nota PDF.
- Financeiro: chaves de idempotência em pagamentos/devoluções/caixa, testes de estorno e dupla confirmação, simplificação dos ecrãs de contas e conciliação.
- Stock: cartões Físico/Reservado/Disponível/A receber/A fabricar e decimais para materiais.
- `agendar_entrega`: validar cobertura/ETA e distinguir pré-agendado de confirmado.
- Pré-existentes no verificador de código: 10 cores fixas e 31 escritas de campos de auditoria no frontend.
