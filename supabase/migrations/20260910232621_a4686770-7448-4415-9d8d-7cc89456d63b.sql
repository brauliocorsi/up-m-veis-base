CREATE OR REPLACE VIEW erp.v_rota_paragens WITH (security_invoker = true) AS
SELECT rp.id,
    rp.criado_em,
    rp.criado_por,
    rp.atualizado_em,
    rp.atualizado_por,
    rp.eliminado_em,
    rp.eliminado_por,
    rp.motivo_eliminacao,
    rp.rota_id,
    rp.pedido_id,
    rp.ordem,
    rp.previsto_receber,
    rp.desfecho,
    rp.data_reagendamento,
    rp.motivo_id,
    rp.motivo,
    rp.entrega_id,
    rp.concluida_em,
    r.data AS rota_data,
    r.nome AS rota_nome,
    r.estado AS rota_estado,
    r.responsavel_id,
    p.numero AS pedido_numero,
    p.estado AS pedido_estado,
    p.total,
    p.total_pago,
    erp.por_registar_pedido(p.id) AS pendente,
    p.morada_entrega,
    p.localidade_entrega,
    p.cp4_entrega,
    p.cp3_entrega,
    p.contacto_entrega,
    p.notas_entrega,
    p.entrega_domicilio,
    c.nome AS cliente,
    c.telefone_e164 AS cliente_telefone,
    c.telefone_alt AS cliente_telefone_alt,
    m.descricao AS motivo_descricao,
    rp.excedeu_capacidade,
    COALESCE(it.n_itens, 0) AS n_itens,
    COALESCE(it.n_montagens, 0) AS n_montagens,
    COALESCE(p.desconto_entrega, 0::numeric) AS desconto_entrega
FROM erp.rota_paragens rp
JOIN erp.rotas r ON r.id = rp.rota_id
JOIN erp.pedidos p ON p.id = rp.pedido_id
LEFT JOIN erp.clientes c ON c.id = p.cliente_id
LEFT JOIN erp.motivos m ON m.id = rp.motivo_id
LEFT JOIN LATERAL (
  SELECT sum(pe.qt_por_entregar)::integer AS n_itens,
         sum(CASE WHEN i.montagem_incluida THEN pe.qt_por_entregar ELSE 0 END)::integer AS n_montagens
  FROM erp.v_pedido_entrega pe
  JOIN erp.pedido_itens i ON i.id = pe.pedido_item_id
  WHERE pe.pedido_id = p.id AND pe.qt_por_entregar > 0
) it ON true
WHERE rp.eliminado_em IS NULL;

DO $$
DECLARE
  v_paragem_id uuid := 'b4ef3460-1b47-4973-a16f-a63aa9d8a116';
  v_pedido_id uuid := '2dde144e-c781-4e4b-90dd-a86d6e0c8f00';
  v_item_id uuid := 'a88ce857-d888-467c-b18a-615e28995c37';
  v_user_id uuid := '08b21f75-83d0-4984-8315-999846fa22ef';
  v_resultado jsonb;
  v_entrega_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM erp.rota_paragens
    WHERE id = v_paragem_id AND eliminado_em IS NULL AND desfecho IS NULL
  ) AND NOT EXISTS (
    SELECT 1
    FROM erp.entrega_itens ei
    JOIN erp.entregas e ON e.id = ei.entrega_id
    WHERE e.pedido_id = v_pedido_id
      AND e.eliminado_em IS NULL
      AND e.estado = 'registada'
      AND ei.eliminado_em IS NULL
  ) THEN
    PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
    PERFORM set_config('erp.entrega_rota', '1', true);
    v_resultado := erp.registar_entrega(
      v_pedido_id,
      jsonb_build_array(jsonb_build_object('pedido_item_id', v_item_id, 'quantidade', 3)),
      DATE '2026-09-11',
      NULL,
      'Regularização da paragem registada na rota Porto de 11/09/2026'
    );
    PERFORM set_config('erp.entrega_rota', '', true);
    v_entrega_id := (v_resultado->>'entrega_id')::uuid;

    UPDATE erp.rota_paragens
       SET desfecho = 'entregue',
           entrega_id = v_entrega_id,
           concluida_em = now(),
           atualizado_em = now(),
           atualizado_por = '3a0d7e18-3aed-42c3-b191-47033092a030'
     WHERE id = v_paragem_id;
  END IF;
END $$;