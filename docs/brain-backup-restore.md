# 大脑数据备份与恢复指南

`qqbot-brain` 的全部持久化状态（人设、记忆、情绪、画像、会话脉络）是一个 `BrainExport` JSON，
可以通过 HTTP API 整包导出/导入，用于迁移、换数据集、或新 profile 恢复记忆。

## 备份文件结构

```jsonc
{
  "version": 1,
  "exportedAt": 1762xxx,
  "persona": "当前人设文本",
  "personas": [{ "id": "...", "name": "...", "text": "..." }],
  "activePersonaId": "...",
  "notes": [{ "id", "sessionId", "actor", "content", "importance", "kind",
              "createdAt", "strength", "hits", "lastAccessAt",
              "e": "base64向量(可选)", "emotion"(可选), "sourceIds"(可选),
              "personaId"(可选), "absorbedAt"(可选) }],
  "emotions": { "<sessionId>": { "mood", "arousal", "valence", ... } },
  "profiles": { "u:<openid>": "...", "sess:<sessionId>": "..." },
  "digests":  { "<sessionId>": "..." }
}
```

**包含**：人设全集 + 激活态、全部记忆（含已吸收的存档条、embedding 向量）、情绪态、画像、会话 digest。
**不包含**：会话原文转录（宿主 `~/.dsh/sessions/*.zstd`）、brain map 事件流水（内存环形缓冲）、`brain.log`。
导入后这些外围物重新从零积累，不影响记忆本身。

## 导出

```bash
# 线上（token 见服务器 ~/.dsh/brain.env 的 BRAIN_HTTP_TOKEN）
curl -s "http://<host>:4099/brain/api/export?token=<TOKEN>" -o backup.json

# 本机插件实例同理，host 换成 BRAIN_HTTP_HOST:PORT
```

建议立即校验：`python3 -c "import json;d=json.load(open('backup.json'));print(len(d['notes']))"`。
文件含全部私人记忆，不要提交 git（本仓库 `brain-data/` 已在 .gitignore）。

## 导入

```bash
curl -s -X POST "http://<host>:4099/brain/api/import?mode=replace" \
  -H "Content-Type: application/json" --data-binary @backup.json
```

| mode | 语义 | 场景 |
|---|---|---|
| `replace` | 先写 reset op 清空全部，再整包回放 | 迁移、换数据集、恢复到某个时间点 |
| `merge` | 按 id 去重补入，已存在的 id 跳过（本地优先） | 把一份备份叠加进现有数据 |

导入时每条 note 过 `sanitizeNote`：content 截 200 字、importance 收敛 1–5、
kind 只认 `semantic`/`attitude`（其他归 episodic）、缺 `sessionId` 归 `'imported'`。
`absorbedAt`/`personaId`/`sourceIds`/向量随导入保留，衰减计时（strength/hits/lastAccessAt）不重置。

## 记忆可见性规则（恢复后"记不得"先查这里）

- **主检索池只含本会话 notes + `sessionId='manual'` 的全局条**——sessionId 决定记忆归属哪条会话
- **跨会话通道**：其他 session 的 `semantic`/`attitude` 且 `actor` 的 openid 或昵称匹配当前发言人时，
  最多带 2 条进 memoryLines（`recallLines` 前缀"跨群:"）
- **画像**：`u:<openid>` 跟人走、跨会话可见；`sess:<sessionId>` 只在本会话注入
- **情绪/digest**：严格 per-sessionId，换了会话就从头开始
- **personaId 只管 attitude 分轨**：事实类（episodic/semantic）跨人设可见，切人设不丢恋爱史
- **已吸收条**（absorbedAt）退出检索池但仍随导出迁移，不占召回名额

openid 的稳定性依赖同一 QQ bot AppID——换新 bot 账号意味着所有 `u:` 画像和
`actor` 匹配失效，只剩昵称兜底。

## 新 profile 恢复 SOP

### 场景 A：同 profile 重部署/重启

sessionId 由宿主 session-manager 按 (bot, 群/人) 持久化，数据目录不动就什么都不用做。

### 场景 B：全新 profile（新 sessionId）

1. **装插件**：新 profile 安装 `qqbot-brain`，配 `BRAIN_DATA_DIR` 指向新目录 +
   `BRAIN_LLM_API_KEY`（+ 可选 `BRAIN_HTTP_HOST/PORT/TOKEN`），启动
2. **产生新会话**：用目标用户随便聊一轮，让宿主建好新 session
3. **拿新 sessionId**：`GET /brain/api/state` 看 `digests`/`emotions` 键，
   或 brain.log 里 `[<前8位>]` 前缀
4. **改装备份**：把备份里的旧 sessionId 换成新的——否则恋人线 notes 在新会话里
   只能靠跨会话通道零星召回，digest/情绪/会话画像全挂空

   ```bash
   python3 - <<'EOF'
   import json
   OLD, NEW = '<旧sessionId>', '<新sessionId>'
   d = json.load(open('backup.json'))
   for n in d['notes']:
       if n.get('sessionId') == OLD: n['sessionId'] = NEW
   for key in ('emotions', 'digests'):
       if OLD in d.get(key, {}): d[key][NEW] = d[key].pop(OLD)
   d['profiles'] = {k.replace(f'sess:{OLD}', f'sess:{NEW}'): v
                    for k, v in d.get('profiles', {}).items()}
   json.dump(d, open('backup-remap.json', 'w'), ensure_ascii=False)
   EOF
   ```

   多会话备份按会话逐条处理；想让某条记忆对**所有**会话可见可改 `sessionId='manual'`（慎用）。

5. **导入**：`POST /brain/api/import?mode=replace`（body≤10MB，超了先拆分 notes 分批 merge）
6. **验证**：
   - `GET /brain/api/state` — notes/emotions/profiles/digests 数量与备份一致
   - `GET /brain/api/query?q=<恋人线关键词>` — 命中预期记忆
   - `GET /brain/api/personas` — 人设列表与 `activePersonaId` 正确
   - 新聊一轮看注入是否带出恋人线记忆

## 坑清单

- **replace 是毁灭性的**：导入前必先对目标导出备份，顺序反了本地数据就没了
- **人设文本双写**：persona.md 文件与 BrainExport.persona 共存；import 的 persona 字段
  会覆盖当前活跃人设文本（merge 模式下若备份带 personas 则以 personas 为准）
- **备份不含会话原文**：想保留聊天原文需另行拷贝 `~/.dsh/sessions/<ws>/<sessionId>/`
- **向量随包走**：`e` 字段是 Float32 base64，跨实例通用无需重算
- **token 泄漏面**：`?token=` 会进 nginx/日志，敏感环境用 `Authorization: Bearer` 头

## 本机模拟数据约定

本机/参赛用虚构数据，落点任选：
- `brain-data/<name>.json`（gitignored，可直接 import 灌本机实例）
- `test/eval/cases.json` 风格 fixture（进 git，供 eval runner 用）
虚构数据的 actor/openid 不用真人真实 id；createdAt 散布在数天内别堆同一时刻。
