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
- 4xx → **erro** (revisão manual).
- Transferência bancária pendente na venda → **bloqueado_pagamento** (não envia).

## 2. Fábrica → ERP: `POST {ERP}/api/integrations/factory/events`

```json
{ "schema_version": 1, "event_id": "UUID", "source_system": "up-fabrica", "sale_id": "UUID",
  "line_id": "UUID", "order_id": "string", "unit_index": 1,
  "status": "produced" | "warehouse_received", "quantity": 1, "occurred_at": "ISO-8601" }
```

Respostas: 401 token inválido · 503 não configurado · 422 corpo/ordem inválida · 200 `{accepted:true,result}`
com `result` ∈ `aplicado | duplicado | fora_de_ordem`.

- Todos os eventos ficam guardados (`erp.fabrica_eventos`), únicos por `event_id`.
- Monotonia: aceite → produced → warehouse_received. Estados anteriores ficam registados sem efeito.
- Entrada em stock: **uma vez por ordem** (`chave_idempotencia = fabrica:<order_id>`), reservada à linha da venda.
- Política de entrada (`fabrica_politica_entrada`): **por definir** ⇒ nenhum stock entra.

## 3. Ativação (desligada)

`erp.fabrica_definir_ativa(true)` recusa enquanto:
1. a política de entrada não for `produced` ou `warehouse_received`;
2. `fabrica_reconciliacao_contagem` não for `true` (garantia de que a sincronização Contagem não volta a contar estas entradas).

Vendas anteriores à ativação não são enviadas (a fila só nasce de necessidades novas).
