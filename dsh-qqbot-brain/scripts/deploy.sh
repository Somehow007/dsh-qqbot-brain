#!/usr/bin/env bash
# 一键部署（插件代码）：本地门禁 → 远端成对备份 → rsync → restart → 健康检查 → 失败自动回滚插件
#
# 用法：scripts/deploy.sh <tag> [--dry-run]
#   tag        备份名标签，如 e7 / mobile（产出 ~/backups/pre-<tag>-{plugin,data}-<UTC>.tgz）
#   --dry-run  只跑门禁 + rsync -acn 预览差异，不动远端
# 环境变量：DEPLOY_HOST / DEPLOY_HOME / DEPLOY_SERVICE / DEPLOY_PORT 覆盖默认；
#           ALLOW_DIRTY=1 允许 src/ 有未提交改动（默认拒绝：并行会话 WIP 会被一起构建上线）。
# 边界：只发布插件代码（dist + package.json），不动远端 cordis.patch.yml；
#       人设文本 PATCH（/api/personas）不在本脚本内；数据备份只做不自动恢复（数据回滚需人工确认）。
set -euo pipefail

TAG=${1:?用法: scripts/deploy.sh <tag> [--dry-run]}
DRY=${2:-}
HOST=${DEPLOY_HOST:-ubuntu@124.222.65.169}
RHOME=${DEPLOY_HOME:-/home/ubuntu}
SERVICE=${DEPLOY_SERVICE:-dsh-qqbot}
PORT=${DEPLOY_PORT:-4099}
PLUGIN=dsh-qqbot-brain
DATA=brain-data

cd "$(dirname "$0")/.."
LEDGER=../.trellis/deploy-log.tsv
START=$(date +%s)
TS=$(date -u +%Y%m%dT%H%M%SZ)
COMMIT=$(git rev-parse --short HEAD)
step() { printf '\n== %s\n' "$*"; }
remote() { ssh -o ConnectTimeout=15 "$HOST" "$@"; }
ledger() { printf '%s\t%s\t%s\t%s\t%ss\n' "$TS" "$TAG" "$COMMIT" "$1" "$(( $(date +%s) - START ))" >> "$LEDGER"; }

step "门禁：工作区 / typecheck / test / build"
if [[ -n "$(git status --porcelain -- src test package.json)" && "${ALLOW_DIRTY:-}" != 1 ]]; then
  git status --short -- src test package.json
  echo "✗ src/test 有未提交改动（可能是并行会话 WIP）。先提交或隔离；确认要带上线用 ALLOW_DIRTY=1" >&2
  exit 1
fi
npm run -s typecheck
npm test 2>&1 | tail -n 3
npm run -s build

if [[ "$DRY" == --dry-run ]]; then
  step "dry-run：远端差异预览（不写入）"
  rsync -acn --delete --itemize-changes dist package.json "$HOST:$RHOME/$PLUGIN/"
  exit 0
fi

step "远端成对备份 pre-$TAG-{plugin,data}-$TS.tgz"
BK_PLUGIN="$RHOME/backups/pre-$TAG-plugin-$TS.tgz"
BK_DATA="$RHOME/backups/pre-$TAG-data-$TS.tgz"
remote "set -e; mkdir -p $RHOME/backups
  tar czf $BK_PLUGIN -C $RHOME --exclude=$PLUGIN/node_modules $PLUGIN
  tar czf $BK_DATA -C $RHOME $DATA
  tar -tzf $BK_PLUGIN >/dev/null && tar -tzf $BK_DATA >/dev/null
  ls -lh $BK_PLUGIN $BK_DATA"
NR_BEFORE=$(remote "systemctl show -p NRestarts --value $SERVICE")

step "rsync dist + package.json（dist 不带尾斜杠）"
rsync -az --delete dist package.json "$HOST:$RHOME/$PLUGIN/"

health() {
  remote "set -e
    sudo systemctl restart $SERVICE
    for i in \$(seq 1 30); do
      code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/brain || true)
      [[ \$code == 200 || \$code == 401 ]] && break; sleep 1
    done
    [[ \$(systemctl is-active $SERVICE) == active ]] || { echo '✗ 服务未 active'; exit 1; }
    [[ \$code == 200 || \$code == 401 ]] || { echo \"✗ /brain 探活失败 code=\$code\"; exit 1; }
    sleep 5
    [[ \$(systemctl is-active $SERVICE) == active ]] || { echo '✗ 服务启动后掉线'; exit 1; }
    echo \"✓ active，/brain=\$code（401=存活需 token）\"
    tail -n 5 $RHOME/$DATA/brain.log 2>/dev/null || true"
}

step "restart + 健康检查"
LOCAL_MD5=$(md5 -q dist/index.js 2>/dev/null || md5sum dist/index.js | cut -d' ' -f1)
if health && [[ "$(remote "md5sum $RHOME/$PLUGIN/dist/index.js | cut -d' ' -f1")" == "$LOCAL_MD5" ]]; then
  NR_AFTER=$(remote "systemctl show -p NRestarts --value $SERVICE")
  [[ "$NR_AFTER" == "$NR_BEFORE" ]] || echo "⚠ NRestarts $NR_BEFORE→$NR_AFTER（systemctl restart 本身不计数；若增长说明进程崩溃自拉起，去看日志）"
  ledger ok
  step "✓ 部署完成 $COMMIT（备份 $BK_PLUGIN）"
  exit 0
fi

step "✗ 健康检查失败 → 自动回滚插件到 $BK_PLUGIN（数据不动）"
remote "set -e; rm -rf $RHOME/$PLUGIN/dist; tar xzf $BK_PLUGIN -C $RHOME"
if health; then ledger rolled-back; else ledger rollback-failed; fi
echo "已回滚插件代码；数据备份 $BK_DATA 未自动恢复（需人工确认）" >&2
exit 1
