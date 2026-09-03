#!/usr/bin/env bash
# OPTIONAL. `npm run test:db:*` (plain `k6 run tests/db/*.ts`) works out of
# the box on k6 v1.2.0+ -- k6's automatic extension resolution transparently
# provisions k6/x/sql + its Postgres driver on first run (see README.md
# "Database performance testing"). You do NOT need this script for normal use.
#
# Use this script instead when you need a binary with the SQL extension
# versions pinned/reproducible (auto-resolution picks versions dynamically),
# or when running somewhere without network access to k6's extension
# provisioning service (air-gapped CI, etc).
#
# Produces ./bin/k6-sql, a drop-in replacement for the regular `k6` binary
# (same CLI, same flags, same TS support) -- just with the extra k6/x/sql
# module pinned in. Point at it explicitly: `./bin/k6-sql run tests/db/smoke.ts`.
#
# Usage: npm run build:k6-sql
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${REPO_ROOT}/bin/k6-sql"
EXTENSIONS=(
  "--with" "github.com/grafana/xk6-sql@latest"
  "--with" "github.com/grafana/xk6-sql-driver-postgres@latest"
)

mkdir -p "${REPO_ROOT}/bin"

# Target the host OS/arch so the resulting binary runs directly (both the
# local `xk6` and the `grafana/xk6` Docker image default to linux/amd64
# otherwise).
case "$(uname -s)" in
  Darwin) TARGET_OS=darwin ;;
  Linux) TARGET_OS=linux ;;
  *)
    echo "Unsupported OS for this script: $(uname -s). Build manually with xk6 -- see README.md." >&2
    exit 1
    ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) TARGET_ARCH=amd64 ;;
  arm64 | aarch64) TARGET_ARCH=arm64 ;;
  *)
    echo "Unsupported architecture for this script: $(uname -m). Build manually with xk6 -- see README.md." >&2
    exit 1
    ;;
esac

if command -v xk6 >/dev/null 2>&1; then
  echo "Building ${OUTPUT} with local xk6 (${TARGET_OS}/${TARGET_ARCH})..."
  xk6 build \
    --os "${TARGET_OS}" --arch "${TARGET_ARCH}" \
    "${EXTENSIONS[@]}" \
    --output "${OUTPUT}"
elif command -v docker >/dev/null 2>&1; then
  echo "xk6 not found locally; building ${OUTPUT} via the grafana/xk6 Docker image (${TARGET_OS}/${TARGET_ARCH})..."
  docker run --rm -u "$(id -u):$(id -g)" -v "${REPO_ROOT}:/xk6" grafana/xk6 build \
    --os "${TARGET_OS}" --arch "${TARGET_ARCH}" \
    "${EXTENSIONS[@]}" \
    --output "bin/k6-sql"
else
  cat >&2 <<'EOF'
Neither `xk6` nor `docker` is available.

Install one of:
  - xk6 (requires Go):  go install go.k6.io/xk6@latest
  - Docker:              https://docs.docker.com/get-docker/

Then re-run: npm run build:k6-sql
EOF
  exit 1
fi

echo "Built ${OUTPUT}"
echo 'Run DB tests with: ./bin/k6-sql run tests/db/smoke.ts'
