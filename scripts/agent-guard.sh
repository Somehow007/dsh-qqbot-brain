#!/usr/bin/env bash
# agent 护栏（Devin PreToolUse hook，matcher=exec）：拦截 AI 会话里的不可逆/高危命令，交还人工。
# 原则层 §六「agent 最小权限」的机器化实现——规则写给 AI 读 ≠ 被执行，所以由 hook 执行。
# 输入：stdin JSON {tool_name, tool_input:{command}}；拦截：stdout 输出 decision=block JSON + exit 2。
# 项目配置：$DEVIN_PROJECT_DIR/.devin/prod-hosts（每行一个生产主机正则，# 注释）。
# 放行生产写操作的唯一通道是项目发布脚本（命令行里不含 ssh/rsync 到生产的原文）。
# 想临时解除：人工在 /hooks 中禁用或编辑 .devin/hooks.v1.json——不提供命令内开关（AI 能写的开关等于没有）。
set -uo pipefail
exec python3 -c '
import json, os, re, sys
try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "") or ""
except Exception:
    sys.exit(0)
root = os.environ.get("DEVIN_PROJECT_DIR", ".")
hosts = []
try:
    for l in open(os.path.join(root, ".devin", "prod-hosts"), encoding="utf-8"):
        l = l.strip()
        if l and not l.startswith("#"): hosts.append(l)
except FileNotFoundError:
    pass
prod = re.compile("|".join(hosts)) if hosts else None

RULES = [
    (r"\bgit\s+push\b[^|;&]*\s(--force\b|--force-with-lease\b|-f\b)", "强推会改写远端历史"),
    (r"\bgit\s+reset\s+--hard\b", "reset --hard 丢弃未提交改动（并行会话 WIP 也会丢）"),
    (r"\bgit\s+clean\s+-[a-z]*f", "git clean -f 删除未跟踪文件"),
    (r"\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)", "整树 checkout/restore 覆盖未提交改动"),
    (r"\bgit\s+branch\s+-D\b", "强删分支"),
    (r"--no-verify\b", "绕过 git hook 门禁——需要人工决定"),
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]+\s+)*(/|~|\$HOME|\.\.?/?)(\s|$|\*)", "递归删除根/家目录/上级目录"),
]
def block(why):
    print(json.dumps({"decision": "block", "reason": f"agent-guard 拦截：{why}。如确需执行，请交给用户手动运行或由用户调整 .devin/hooks.v1.json。"}, ensure_ascii=False))
    sys.exit(2)
for pat, why in RULES:
    if re.search(pat, cmd): block(why)
if prod and prod.search(cmd):
    REMOTE = [
        (r"\brm\s+-[a-zA-Z]*[rf]", "生产机删除文件"),
        (r"systemctl\s+(stop|disable|mask)\b", "停用生产服务"),
        (r"mode=replace|-X\s*DELETE|--request\s+DELETE", "覆盖导入/删除类生产 API"),
        (r"\btar\s+[a-zA-Z-]*x", "在生产机解包覆盖（恢复类操作需人工确认）"),
        (r"\brsync\b[^|;&]*--delete", "直接 rsync --delete 到生产——请走发布脚本"),
        (r">>?\s*(~|\$HOME|/home/|/etc/|/opt/|/var/lib/)", "重定向写入生产机持久目录（/tmp 与 /dev/null 放行）"),
        (r"\bmv\s", "生产机移动/覆盖文件"),
    ]
    for pat, why in REMOTE:
        if re.search(pat, cmd): block(why)
sys.exit(0)
'
