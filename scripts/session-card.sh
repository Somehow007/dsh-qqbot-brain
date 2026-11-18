#!/usr/bin/env bash
# 开工卡片（Devin SessionStart hook）：把「补课协议 + 范式体检」以 additionalContext 注入会话开头。
# 原则层 §一.3/§七 的机器化：开工补课不再靠 AI 记得读规则；体检数字随会话自动出现。
# 成本：卡片 ≤ ~1.5KB，只给指针和越线项，不注入事件流原文（原文仍按读法分级去读）。
set -uo pipefail
ROOT=${DEVIN_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}
SRC=$(python3 -c 'import json,sys;print(json.load(sys.stdin).get("source","startup"))' 2>/dev/null || echo startup)
HEALTH=""
T=$(command -v timeout || command -v gtimeout || true)
[[ -x "$ROOT/scripts/workflow-health.py" ]] && HEALTH=$(cd "$ROOT" && ${T:+$T 8} ./scripts/workflow-health.py --brief 2>/dev/null)
DIRTY=$(cd "$ROOT" && git status --porcelain 2>/dev/null | grep -v '^??' | head -8)
if [[ "$SRC" == resume ]]; then
  READ="恢复会话：从你最后活跃时点起增量读 .trellis/CHANGES.md（tail 只是起点，不够继续往前翻）。"
else
  READ="新会话：开工前全文读 .trellis/CHANGES.md；状态类问题查状态源（计划进度段/验收台账/任务目录/git log），事件流里没有≠没做过。"
fi
CARD="【开工卡片·自动注入】
$READ
${DIRTY:+未提交改动（可能属于并行会话，勿覆盖、勿一并提交）：
$DIRTY
}${HEALTH:+范式体检：
$HEALTH}"
python3 -c 'import json,sys;print(json.dumps({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":sys.argv[1]}},ensure_ascii=False))' "$CARD"
