# 云服务器内存余量检查 + 委托方演示方式评估

> 存档约定：纯检查/讨论也存档——记录「遇到了什么问题 / 怎么解决的 / 什么时候干的」。

## Goal

确认云服务器在 dsh-qqbot 常驻运行下的内存余量，判断能否继续承载本项目；并确定「像以前一样」向委托方演示脑图的访问方式。

## 实测数据（2026-11-01，服务器 ubuntu@124.222.65.169）

- 内存：total 1.9Gi / used 693Mi / free 296Mi / buff-cache 1.1Gi / **available 1.2Gi**；swap 1.9Gi 仅用 148Mi
- dsh-qqbot.service：active，NRestarts=0，MainPID RSS ≈194Mi（cgroup MemoryCurrent ≈138Mi），10:05 CST 启动（即今早 persona-cloud-rollout 部署后的进程）
- 磁盘：`/` 50G 用 23G，余 25G
- 脑图：`127.0.0.1:4099` 本机监听 HTTP 200；`/brain/api/personas` 返回 `activeId=whale-gentle`，含 legacy + whale-gentle
- 结论：**项目已在云服务器上正常跑着**（今早部署的就是最新代码，本地之后只有归档 chore 提交），无需重新部署；内存余量充足，插件跑在 dsh 进程内不额外占内存

## 演示访问方式选项

| 方案 | 体验 | 代价 |
|------|------|------|
| A. SSH 隧道 + 屏幕共享 | 最安全，委托人看你屏幕 | 委托方无法自己点开 |
| B. patch 改 `host: 0.0.0.0` + `token` + 安全组放行 4099 | 委托方手机/浏览器直连 `http://ip:4099/brain?token=x` | HTTP 明文、token 在 URL，改配置+重启 |
| C. nginx 反代 + HTTPS | 正式 | 第一轮设计时明确延后 |

页面 token 感知（design D2）已落地，B 开箱可用。

## Resolution（2026-11-01）

- **遇到了什么问题**：用户想确认跑了 dsh 后服务器还剩多少内存、能否把项目跑在云上给委托方看。
- **怎么解决的**：SSH 只读核对——内存 available 1.2Gi、服务 active、脑图 4099 健康、部署已是最新；结论是可跑且已在跑，剩下唯一待决项是委托方的访问入口（A/B/C 待用户选）。
- **后续优化方向**：若委托方需长期自助访问，考虑 C（反代+HTTPS）；临时演示 B 足够。
- **什么时候干的**：2026-11-01。
