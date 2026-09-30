<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Regras técnicas
- Fábrica: execução/planeamento vivem no UP Fábrica; o ERP só envia pela outbox `erp.fabrica_outbox` (contrato em docs/contrato-up-fabrica-v1.md) — evita dois sistemas a mandar na produção.
- Funções `security definer` que o cliente chama começam por `erp.exigir_utilizador_ativo(...)` — RLS não protege definers e `perfil_atual()` pode ser NULL.
- Execução de funções no schema `erp` nunca é dada a PUBLIC/anon; internas só a service_role — evita chamadas diretas pela API.
- Saldo por receber de uma OC passa para OC diferida (`diferir_saldo_oc`), dívida fica na OC raiz — evita duplicar contas a pagar.
- Testes: `auditoria/run.sh` numa base descartável; qualquer ERROR SQL conta como falha.
