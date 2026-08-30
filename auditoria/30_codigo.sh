#!/usr/bin/env bash
# ============================================================
# 30 — Verificações no código do frontend
# Padrões obrigatórios: sem cores fixas, views v_ nas leituras,
# sem service role no cliente, mensagens em português.
# ============================================================
REPO="${1:-.}"
SRC="$REPO/src"
FALHAS=0
diz() { echo "$1"; }
mal() { echo "✗ $1"; FALHAS=$((FALHAS+1)); }
bem() { echo "✓ $1"; }

cd "$REPO" || exit 1

# cores fixas em componentes
N=$(grep -rnE "text-white|bg-black|#[0-9a-fA-F]{6}" src --include="*.tsx" 2>/dev/null | grep -v "styles.css" | wc -l | tr -d ' ')
[ "$N" -eq 0 ] && bem "sem cores fixas nos componentes" || mal "$N cores fixas em componentes (usar tokens semânticos)"

# chave privilegiada no cliente
N=$(grep -rn "SERVICE_ROLE\|service_role" src --include="*.tsx" --include="*.ts" 2>/dev/null \
    | grep -v "client.server\|\.server\.ts" | wc -l | tr -d ' ')
[ "$N" -eq 0 ] && bem "nenhuma chave privilegiada no código do cliente" || mal "$N usos de service role fora do servidor"

# escrita direta em campos de auditoria
N=$(grep -rnE "(criado_por|atualizado_por|eliminado_por|criado_em|atualizado_em)\s*:" src --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
[ "$N" -eq 0 ] && bem "frontend não escreve campos de auditoria" || mal "$N escritas de campos de auditoria no frontend"

# leituras devem usar as views v_
N=$(grep -rnE '\.from\("(pedidos|pedido_itens|stock_atual|ordens_compra|oc_itens|contas_pagar|pagamentos)"\)' src --include="*.ts" 2>/dev/null | grep -c "select(" | tr -d ' ')
[ "${N:-0}" -eq 0 ] && bem "leituras usam as views v_" || diz "· $N leituras diretas a tabelas (confirmar se são escritas)"

# ícones lucide-react
grep -rq "lucide-react" src && bem "ícones lucide-react em uso" || mal "lucide-react não é usado"

# rotas declaradas existem
N=0
for r in $(grep -rhoE 'to="/[a-z0-9/-]+"' src --include="*.tsx" 2>/dev/null | sed 's/to="//;s/"//' | sort -u); do
  P="${r#/}"
  [ -z "$P" ] && continue
  if ! ls src/routes/**/"${P%%/*}"*.tsx src/routes/"${P%%/*}"*.tsx src/routes/_authenticated/"${P%%/*}"*.tsx \
        src/routes/_authenticated/_adm/"${P%%/*}"*.tsx >/dev/null 2>&1; then
    diz "· rota sem ficheiro evidente: $r"
    N=$((N+1))
  fi
done
[ "$N" -eq 0 ] && bem "todas as rotas ligadas têm ficheiro"

# typecheck
if command -v bunx >/dev/null; then
  if bunx tsgo --noEmit >/tmp/auditoria-tsc.log 2>&1; then bem "typecheck sem erros"
  else mal "typecheck com erros ($(grep -c "error" /tmp/auditoria-tsc.log) ocorrências)"; fi
fi

[ "$FALHAS" -gt 0 ] && echo "($FALHAS problema(s) de código)"
exit 0
