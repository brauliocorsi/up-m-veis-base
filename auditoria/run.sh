#!/usr/bin/env bash
# ============================================================
# UP Vendas — Auditoria automática do ERP
#
# Aplica as migrações do repositório numa base descartável e
# testa COMPORTAMENTO, não intenções. Corre isto depois de cada
# fase, antes de dar a fase por concluída.
#
#   ./run.sh                      # usa ./supabase/migrations
#   ./run.sh /caminho/do/repo     # ou o caminho que indicar
#
# Por defeito usa `su postgres -c psql ...` (Debian/Ubuntu).
# Para outra ligação local, exporta PSQL_CMD, por exemplo:
#   PSQL_CMD="psql -h /tmp/pg -p 5433 -U postgres" ./run.sh
#   PSQL_CMD="psql postgresql://postgres@localhost:5433" ./run.sh
# ============================================================
set -uo pipefail
REPO="${1:-.}"
MIGR="$REPO/supabase/migrations"
DB="auditoria_erp"
AQUI="$(cd "$(dirname "$0")" && pwd)"

[ -d "$MIGR" ] || { echo "Não encontrei $MIGR"; exit 1; }
command -v psql >/dev/null || { echo "psql não está instalado"; exit 1; }

# Ligação à base: PSQL_CMD (se definido) ou su postgres
if [ -n "${PSQL_CMD:-}" ]; then
  PSQL() { $PSQL_CMD -d "$DB" "$@" 2>&1; }
  PSQL_ADMIN() { $PSQL_CMD -d postgres "$@" 2>&1; }
else
  PSQL() { su postgres -c "psql -d $DB $(printf "%q " "$@")" 2>&1; }
  PSQL_ADMIN() { su postgres -c "psql -d postgres $(printf "%q " "$@")" 2>&1; }
fi

echo "════════════════════════════════════════════════════════"
echo " AUDITORIA DO ERP — $(date '+%Y-%m-%d %H:%M')"
echo "════════════════════════════════════════════════════════"

# ---------- 1. Base limpa ----------
PSQL_ADMIN -q -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null
for c in "create schema auth" "create schema extensions" "create extension pgcrypto" \
         "create extension pg_trgm with schema extensions" \
         "create table auth.users(id uuid primary key default gen_random_uuid(), email text)" \
         "create role anon nologin" "create role authenticated nologin" "create role service_role nologin"; do
  PSQL -q -c "$c" >/dev/null
done
PSQL -q -c "create or replace function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid \$\$" >/dev/null

# ---------- 2. Aplicar migrações ----------
echo
echo "── MIGRAÇÕES ──"
ERROS=0
for m in $(ls -1 "$MIGR"/*.sql | sort); do
  SAIDA=$(PSQL -f "$m")
  # erros esperados no ambiente local, não são problema do projeto
  REAIS=$(echo "$SAIDA" | grep "ERROR" | grep -viE "pg_cron|pg_net|schema \"cron\"|role \"authenticator\"|already exists|zz_teste|extension .* is not available")
  N=$(echo "$REAIS" | grep -c "ERROR")
  if [ "$N" -gt 0 ]; then
    echo "  ✗ $(basename "$m")"
    echo "$REAIS" | head -3 | sed 's/^/      /'
    ERROS=$((ERROS+N))
  fi
done
[ "$ERROS" -eq 0 ] && echo "  ✓ Todas as migrações aplicam limpas"

T=$(PSQL -t -c "select count(*) from pg_tables where schemaname='erp'" | tr -d ' ')
FN=$(PSQL -t -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp'" | tr -d ' ')
PO=$(PSQL -t -c "select count(*) from pg_policies where schemaname='erp'" | tr -d ' ')
echo "  tabelas: $T | funções: $FN | políticas: $PO"

# ---------- 3. Estrutura ----------
echo
echo "── ESTRUTURA ──"
PSQL -q -f "$AQUI/10_estrutural.sql" | grep -vE "^\s*$|^\(|row\)" | sed 's/^/  /'

# ---------- 4. Comportamento ----------
echo
echo "── COMPORTAMENTO ──"
# executar UMA vez e reutilizar: correr duas vezes na mesma base gera falhas falsas
RES=$(mktemp)
for t in "$AQUI"/[23]*_*.sql; do PSQL -f "$t"; done > "$RES" 2>&1
grep -E "PASSA|FALHA" "$RES" | sed 's/.*NOTICE:  //' | sed 's/^/  /'

# ---------- 5. Código ----------
echo
echo "── CÓDIGO ──"
bash "$AQUI/30_codigo.sh" "$REPO" | sed 's/^/  /'

echo
echo "════════════════════════════════════════════════════════"
TOTAL_FALHAS=$(grep -c "FALHA" "$RES" || true); TOTAL_PASSA=$(grep -c "PASSA" "$RES" || true); rm -f "$RES"
if [ "$TOTAL_FALHAS" -eq 0 ] && [ "$ERROS" -eq 0 ]; then
  echo " RESULTADO: $TOTAL_PASSA testes, todos a passar"
else
  echo " RESULTADO: $TOTAL_PASSA a passar, $TOTAL_FALHAS a falhar, $ERROS erro(s) de migração"
fi
echo "════════════════════════════════════════════════════════"
