create or replace view erp.v_rota_paragens
with (security_invoker = true) as
 SELECT rp.id, rp.criado_em, rp.criado_por, rp.atualizado_em, rp.atualizado_por,
    rp.eliminado_em, rp.eliminado_por, rp.motivo_eliminacao,
    rp.rota_id, rp.pedido_id, rp.ordem, rp.previsto_receber, rp.desfecho,
    rp.data_reagendamento, rp.motivo_id, rp.motivo, rp.entrega_id, rp.concluida_em,
    r.data AS rota_data, r.nome AS rota_nome, r.estado AS rota_estado, r.responsavel_id,
    p.numero AS pedido_numero, p.estado AS pedido_estado, p.total, p.total_pago,
    erp.pendente_pedido(p.id) AS pendente,
    p.morada_entrega, p.localidade_entrega, p.cp4_entrega, p.cp3_entrega,
    p.contacto_entrega, p.notas_entrega, p.entrega_domicilio,
    c.nome AS cliente, c.telefone_e164 AS cliente_telefone, c.telefone_alt AS cliente_telefone_alt,
    m.descricao AS motivo_descricao,
    rp.excedeu_capacidade
   FROM erp.rota_paragens rp
     JOIN erp.rotas r ON r.id = rp.rota_id
     JOIN erp.pedidos p ON p.id = rp.pedido_id
     LEFT JOIN erp.clientes c ON c.id = p.cliente_id
     LEFT JOIN erp.motivos m ON m.id = rp.motivo_id
  WHERE rp.eliminado_em IS NULL;

grant select on erp.v_rota_paragens to authenticated;