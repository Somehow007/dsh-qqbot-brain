#!/usr/bin/env bash
# 收工记账一条命令（Trellis 项目）：任务归档 + journal + 事件流 → 合成一个提交。
# 动机：原流程每个任务产出 2-3 个自动 chore 提交（archive / record journal / CHANGES），记账提交占比实测 69%。
# 用法：scripts/wrap-up.sh <任务名> "<journal 标题>" "<journal 摘要>" "<事件一行>" [<工作提交 hash，默认 HEAD>]
#   事件指针自动指向归档后的任务目录；无代码提交的讨论任务传 - 作 hash。
# 只暂存本任务相关路径（并行会话的未跟踪任务目录、WIP 不会被带上）。
set -euo pipefail
TASK=${1:?任务名}; TITLE=${2:?journal 标题}; SUMMARY=${3:?journal 摘要}; EVENT=${4:?事件一行}; HASH=${5:-$(git rev-parse --short HEAD)}
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
SRC=".trellis/tasks/$TASK"
[[ -d "$SRC" ]] || { echo "✗ 找不到 $SRC" >&2; exit 1; }
grep -q '^## Resolution' "$SRC/prd.md" || { echo "✗ $SRC/prd.md 缺 ## Resolution 段（归档前必填）" >&2; exit 1; }

python3 .trellis/scripts/task.py archive "$TASK" --no-commit --skip-branch-validation
DEST=$(ls -d .trellis/tasks/archive/*/"$TASK" | tail -1)
python3 .trellis/scripts/add_session.py --title "$TITLE" --commit "$HASH" --summary "$SUMMARY" --no-commit
python3 scripts/changes.py add "$EVENT" "\`${DEST#.trellis/}/prd.md\`"

git add -A -- "$DEST" .trellis/workspace .trellis/CHANGES.md
[[ -n "$(git ls-files -- "$SRC")" ]] && git add -A -- "$SRC"   # 原目录已跟踪时才暂存其删除
[[ -f .trellis/CHANGES-archive.md ]] && git add .trellis/CHANGES-archive.md
git commit -q -m "chore(trellis): 收工记账 — $TASK" && git log -1 --format='✓ %h %s'
