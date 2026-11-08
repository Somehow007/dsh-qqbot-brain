# Implement：私域放行阀

## 已完成

- [x] L1 佐证放行·note 对：`sweepNearDups` 跨「公开↔域」近重复 → `releaseCorroborated` 放域内副本 `private:'public'`（update op 留痕）→ 正常并簇合并
- [x] L1 佐证放行·画像语料：`corroboratedByText` bigram 覆盖≥60% 命中公开 u: 画像（剥私后）→ 放行
- [x] 钉死保护：`releaseableDomainScope` 排除 `private=<sessionId>` 人工钉死条；域↔域跨域对仍 skip
- [x] L2 人工队列：`releaseCandidates()` 无私词域条按重要度排队 → `GET /api/release-candidates` → 记忆库「域内待放行」筛选一键放行/删
- [x] 私词正则两轮线上实测补强（避孕/射精/枕边→丝袜/生理期/按腰/带饭）
- [x] 测试 +5：佐证放行合并、域↔域/钉死不放、画像佐证、候选过滤、HTTP 端点——167/167
- [x] 部署：备份 `dsh-qqbot-brain-pre-releasevalve-20261108-1901.tgz` → rsync → restart active

## 线上效果（走查实录）

- `POST /api/dedup`：`released:[fc9a92cf,f964667a]`（考研/菠萝被画像佐证自动放出）+ 1 簇合并
- 人工放行 3 条：`8426887d`（真名要求）/`053fab06`（背单词108天）/`5bc649a2`（失眠菠萝）
- 队列 26 条待人工裁决（剩余多为关系肌理灰带，正则降噪到位）
- assemble 验证：群侧良性事实命中 4 条（`[跨群]`回流），私词命中 0——放良性不带私货
