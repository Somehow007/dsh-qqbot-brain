# 生产 SSH kex 阶段被断开（待用户处理）

## 问题存档

- **时间**：2026-11-18（`11-18-ai-workflow-review` 实施 deploy.sh 时发现，同日三次复现）
- **现象**：`ssh ubuntu@124.222.65.169` → `kex_exchange_identification: Connection closed by remote host`。TCP 22 可连（`nc -z` 成功），公网 `/brain` 返回 401（服务本身存活）。`ssh -v` 显示本地密钥 `~/.ssh/id_ed25519` 正常加载，断开发生在协议版本交换前——**不是认证失败**。
- **影响**：阻塞 ACC-13（deploy.sh 正式发布 + 回滚演练）、ACC-14（口令 cookie 线上走查）、B-09（只读走查账号）；产品修复（`11-18-persona-product-fixes`）上线也要等它。

## 排查方向（按可能性）

1. **fail2ban / sshguard 封了本机出口 IP**：当天会话有多次 SSH 连接（含失败重试），最常见原因。服务器控制台（腾讯云 VNC 登录）：`sudo fail2ban-client status sshd` 看 Banned IP，`sudo fail2ban-client set sshd unbanip <IP>`。
2. **sshd `MaxStartups` 限流**：并发未认证连接过多时随机丢弃，表现一致。`grep -i maxstartups /etc/ssh/sshd_config`；日志 `journalctl -u ssh --since today | grep -i 'drop\|startups'`。
3. **`/etc/hosts.deny` 或安全组 / 云防火墙策略变更**：看腾讯云安全组 22 端口来源；`cat /etc/hosts.deny`。
4. **本机网络出口变化**（代理 / VPN 劫持 22 端口）：换网络（手机热点）重试 `ssh -v` 对照。

## 恢复后要做的（顺序）

1. `ssh ubuntu@124.222.65.169 'echo ok'` 通；
2. `cd dsh-qqbot-brain && scripts/deploy.sh <tag> --dry-run` → 看 rsync 差异；
3. 正式发布（会带上口令 cookie 改动）→ 按 ACC-14 浏览器走查；
4. 回滚演练：`DEPLOY_PORT=1 scripts/deploy.sh drill`（探活必失败 → 自动回滚 → 复探活 active）→ 关 ACC-13；
5. 建只读走查账号（B-09），并把 agent 走查改用它。

## 状态

- 未解决，**用户稍后自行处理**（2026-11-18 用户：「ssh 问题不着急，存档就好」）。本任务保持开放，不归档。

## 进展（2026-11-19）

- **SSH 已恢复**（用户侧处理，kex 不再断）；远端巡检：`dsh-qqbot` active、NRestarts=0、`/brain`=401 存活、每日 brain 备份 cron 正常（brain-2026-11-19.tgz 在）。
- **B-09 已完成**：新建 `brain-ro@124.222.65.169` 只读账号（uid 1002，无 sudo 组；authorized_keys=本机 agent 公钥）。ACL 授权：`/home/ubuntu` 与 `~/.dsh` 仅遍历位（--x），`~/.dsh/sessions` 树 rX + 默认 ACL（未来新会话文件自动可读），`~/.dsh/brain.env` 只读（走查取 `BRAIN_HTTP_TOKEN` 用；注意该文件含 LLM key，账号仅 agent 持钥）。实测：brain-data/sessions/dist 可读、`touch` 写被拒、`sudo -n` 要密码。注意 `~`=brain-ro 自家目录，走查命令用 `/home/ubuntu/` 绝对路径。约定已写进 AGENTS.md「线上数据在哪」。
- **人设零漂移确认**：生产 `~/brain-data/persona.md` 与仓库改前版本逐字一致（md5 28a37dd…），PATCH 可直接上新版。
- **阻塞中**：deploy.sh 门禁仍被并行会话 `distill.ts` WIP 挡住（用户去确认该会话）。恢复后顺序：dry-run → 正式发布（含 token cookie + channelStyle）→ ACC-14 走查 → 回滚演练（DEPLOY_PORT=1）→ 四人设 PATCH（仅 firefly 有新文本）→ ACC-15/16 走查。
