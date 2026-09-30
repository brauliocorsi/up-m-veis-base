# Contrato v1 — UP Móveis Base (ERP) ⇄ UP Fábrica

Autenticação servidor-a-servidor: cabeçalho `x-up-integration-token`.
Segredos só no servidor: `UP_FACTORY_URL`, `UP_FACTORY_TOKEN` (mesmo token nos dois sentidos).
Sem URL/token: o ERP mostra "não configurado" e não envia nada. Nunca há sucesso simulado.

## 1. ERP → Fábrica: `POST {UP_FACTORY_URL}/api/integrations/erp/orders`

```json
{ "schema_version": 1, "source_system": "up-moveis-base", "event_id": "UUID",
  "sale_id": "UUID", "sale_number": "PED-2026-000123", "line_id": "UUID",
  "product_id": "UUID", "product_code": "string|null", "description": "texto integral da linha + nota",
  "quantity": 2, "due_date": "YYYY-MM-DD|null", "customization": {"nota": "..."} , "test_mode": false }
```

- Uma mensagem por **linha de venda + revisão** (`unique(item_id, revisao)`); `event_id` é a chave de idempotência.
- O receptor TEM de ser idempotente por `event_id`: o mesmo `event_id` devolve as mesmas ordens.
- Resposta obrigatória (HTTP 2xx):
  `{ "accepted": true, "event_id": "<igual>", "orders": [{ "id": "...", "order_number": "...", "unit_index": 1..quantity }] }`
  — exatamente `quantity` ordens, `unit_index` distintos.
- Só após validar a resposta o ERP marca **aceite**. "Em fila" ≠ aceite.
- Timeout, rede, 5xx ou resposta fora do contrato → estado **incerto**; reenvia com o mesmo `event_id`.
- 4xx → **erro** (revisão manual; não há reenvio automático).
- O ERP valida a mensagem antes de enviar (zod `pedidoEncomenda`) e o ACK exige `unit_index` = 1..quantity e `id` distintos.
- Envio: `fabrica_outbox_reclamar` usa lease de 2 min (`for update skip locked`); `incerto` espera 2,4,8…60 min.
- Envio automático: `POST /api/public/hooks/fabrica-outbox` (autenticado pelo segredo do agendador). Só corre com
  `fabrica_integracao_ativa=true` **e** `fabrica_worker_ativo=true`. Nenhum agendamento está criado.
- Transferência bancária pendente na venda → **bloqueado_pagamento** (não envia).

## 2. Fábrica → ERP: `POST {ERP}/api/integrations/factory/events`

```json
{ "schema_version": 1, "event_id": "UUID", "source_system": "up-fabrica", "sale_id": "UUID",
  "line_id": "UUID", "order_id": "string", "unit_index": 1,
  "status": "produced" | "warehouse_received", "quantity": 1, "occurred_at": "ISO-8601" }
```

Endereços (mesmo tratamento, mesmo token):
- `POST {ERP}/api/integrations/factory/events`
- `POST {ERP}/api/public/integrations/factory/events` — alias fora da proteção de login do site, só com `x-up-integration-token` válido.

Respostas: 401 token inválido · 503 não configurado · 422 corpo/ordem inválida ·
**200 `{ "accepted": true, "event_id": "<igual ao recebido>", "result": "aplicado|duplicado|fora_de_ordem" }`**.
O remetente da fábrica valida `accepted === true && event_id === <enviado>`; `result` é informativo.
Duplicados e fora de ordem também recebem ACK positivo (ficam guardados sem efeito), para a fábrica não reenviar em ciclo.

- Todos os eventos ficam guardados (`erp.fabrica_eventos`), únicos por `event_id`.
- Monotonia: aceite → produced → warehouse_received. Estados anteriores ficam registados sem efeito.
- Entrada em stock: **uma vez por ordem** (`chave_idempotencia = fabrica:<order_id>`), reservada à linha da venda.
- Política de entrada (`fabrica_politica_entrada`): **por definir** ⇒ nenhum stock entra.

## 3. Ativação (desligada)

`erp.fabrica_definir_ativa(true)` recusa enquanto:
1. a política de entrada não for `produced` ou `warehouse_received`;
2. existirem entradas do Contagem suspeitas (`v_contagem_fabrica_suspeitos`: entradas sem referência à ordem, em produtos
   com ordens da fábrica próximas no tempo).

Prevenção concreta de dupla entrada: `registar_movimentos_contagem` não dá stock a entradas cuja `referencia`
(ou `fabrica_order_id`) corresponda a uma ordem da fábrica — ficam em `erp.contagem_fabrica_ignorados`.
A fábrica (callback) é a única fonte dessas unidades.

Vendas anteriores à ativação não são enviadas (a fila só nasce de necessidades novas).
