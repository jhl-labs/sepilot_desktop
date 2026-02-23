#!/bin/bash
# Extension SDK 빌드
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[build-sdk] Building Extension SDK..."
cd "$PROJECT_ROOT/lib/extension-sdk" && pnpm build

echo "[build-sdk] Done!"
