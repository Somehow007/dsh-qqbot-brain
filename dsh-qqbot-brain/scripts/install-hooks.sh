#!/usr/bin/env bash
# 把仓库 .githooks/* 软链进 .git/hooks（不改 git config；重复执行幂等）
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
for h in "$ROOT"/.githooks/*; do
  ln -sf "$h" "$ROOT/.git/hooks/$(basename "$h")"
  echo "installed $(basename "$h")"
done
