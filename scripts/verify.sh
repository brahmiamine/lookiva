#!/usr/bin/env bash
# Single quality gate: `pnpm verify`. Stops at the first failing step (non-zero exit, step name printed).
# Integration infra (db + redis + worker) is torn down on exit, even on failure, if this script started it.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose --env-file .env.example -f compose.yaml -f compose.test.yaml)
INFRA_STARTED=0
START=$SECONDS

teardown() {
  if [ "$INFRA_STARTED" = 1 ]; then
    INFRA_STARTED=0
    echo "==> teardown: pnpm infra:down"
    pnpm infra:down
  fi
}
trap teardown EXIT
trap 'exit 130' INT TERM

step() {
  local name=$1 t=$SECONDS rc=0
  shift
  echo
  echo "================================================================"
  echo "== STEP: $name"
  echo "================================================================"
  "$@" || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "!! FAILED: $name (exit $rc, $((SECONDS - t))s)" >&2
    exit "$rc"
  fi
  echo "-- OK: $name ($((SECONDS - t))s)"
}

integration() {
  if [ -n "$("${COMPOSE[@]}" ps -q)" ]; then
    echo "infra already running: not starting nor tearing it down"
    pnpm test:int
    return
  fi
  INFRA_STARTED=1
  pnpm infra:up && pnpm test:int
}

# Prisma client once up front; lint/typecheck/test:int/build still chain it so they work standalone (idempotent).
step "db:generate" pnpm db:generate
step "lint" pnpm lint
step "typecheck" pnpm typecheck
step "boundaries" pnpm boundaries
step "unit tests" pnpm test
step "integration tests (infra up/down)" integration
teardown
step "openapi:check" pnpm openapi:check
step "build" pnpm build
step "e2e install (chromium)" pnpm e2e:install
step "e2e smoke (playwright)" pnpm test:e2e
step "secret scan" pnpm secrets:scan

echo
echo "================================================================"
echo "== verify: ALL STEPS PASSED ($((SECONDS - START))s)"
echo "================================================================"
