#!/usr/bin/env bash
# Single quality gate: `pnpm verify`. Stops at the first failing step (non-zero exit, step name printed).
# Integration infra (db + redis + worker) lives in its own compose project, so `down -v` can only ever remove
# resources of that project and never a developer's default-project containers or volumes.
set -euo pipefail
cd "$(dirname "$0")/.."

export COMPOSE_PROJECT_NAME=lookiva-verify
INFRA_STARTED=0
START=$SECONDS

teardown() {
  if [ "$INFRA_STARTED" = 1 ]; then
    INFRA_STARTED=0
    echo "==> teardown: pnpm infra:down (project $COMPOSE_PROJECT_NAME)"
    pnpm infra:down || echo "teardown failed" >&2
  fi
}
trap teardown EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Fail before touching anything if another process already owns a port verify needs.
preflight_ports() {
  local port
  for port in 3307 6380 3100; do
    if nc -z 127.0.0.1 "$port" 2>/dev/null; then
      echo "!! port $port is already in use: stop your dev stack or whatever listens on $port first" >&2
      return 1
    fi
  done
}

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
  INFRA_STARTED=1
  pnpm infra:up && pnpm test:int
}

# A leftover lookiva-verify project from an interrupted run is ours: remove it first, then check ports.
INFRA_STARTED=1
teardown
step "preflight (leftover project, ports)" preflight_ports
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
