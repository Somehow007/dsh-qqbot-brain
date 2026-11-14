# 设计：/brain 脑图页重构（三皮肤 + D-admin 管理端）

> 读者：后续按切片开发的模型。**这里写的是硬约定**，切片 brief 里引用本文的章节号。
> 视觉以概念图为准：`tasks/11-13-brain-generic-skin-concepts/concepts/{a-dossier,b-nocturne}.html`、`tasks/archive/2026-11/11-13-brain-admin-spec/d-admin.html`（冻结定稿）。现行鲸脑皮层以 `dsh-qqbot-brain/src/server/page.html`（迁移前版本）为准。

## 1. 总体结构

```
┌ 顶栏（壳层，所有页共用）────────────────────────────────────────────┐
│ [单字头像/立绘] 人设名 · 角色   [脑图 | 管理]   [鲸脑|墨刊|星图]  查看人设▾  统计条 │
└──────────────────────────────────────────────────────────────────┘
#/map            展示区：当前皮肤（cortex / dossier / nocturne）全屏渲染
#/admin/<page>   管理端：D-admin 七页（overview memories personas profiles ops graph backup）
#/companion/*    预留（本次不实现，router 注册表留位即可）
```

- **两层分离**：「皮肤」只管展示区（布局 + 图谱 + 动效）；管理端结构固定为 D-admin，只吃当前皮肤提供的**管理端 token 集**（§4.3）。
- 皮肤切换按钮只在 `#/map` 可点；在 `#/admin` 时仍显示（决定管理端配色），不切页面。
- **查看人设 ≠ 激活人设**：顶栏「查看人设」只改前端视角（自我轨过滤 + 主题色），不调用任何写接口；真正「设为当前人设」只在 `#/admin/personas` 里做，且二次确认（它会改变 bot 线上人格）。

## 2. 文件布局（替代单文件 page.html）

零依赖、无打包、浏览器原生 ES module。目录 `dsh-qqbot-brain/src/server/web/`：

```
web/
  index.html            壳层骨架：顶栏 + <main id="view"> + toast/confirm/drawer 容器；<script type="module" src="./web/app.js">
  app.js                启动：读 token → store.start() → router.start()
  core/
    api.js              fapi()：唯一 fetch 出口，带 x-brain-token 头；JSON/错误统一处理
    store.js            全局状态：state/personas/profiles/sessions；15s 轮询 /api/state；editing 计数器（>0 跳过刷新，顶栏显示「编辑中 · 自动刷新已暂停」）；订阅 on(change)
    vm.js               **纯函数**：API 原始数据 → 皮肤视图模型 MapVM（§3）；迁入现 page.html 的 helper（cleanText nodeLabel mapLabel previewText buildRelations relationWhy emotionBucket emotionOps matchEmotion personaFacets matchFacet layoutSlots labelPick companionLine scopeBadge notePid noteChar isSelfTrack）
    theme.js            **纯函数**：人设主题解析 + 兜底派生 + 皮肤默认规则（§4）
    router.js           hash 路由注册表：{ '#/map': mapView, '#/admin/:page': adminView }；未知 → #/map
    ui.js               toast / confirm(要求输入确认词) / drawer / esc() / fmtT()
  skins/
    index.js            皮肤注册表 [cortex, dossier, nocturne]
    cortex.js + cortex.css      鲸脑皮层（从 page.html 原样迁移，§5.1）
    dossier.js + dossier.css    A 墨刊（§5.2）
    nocturne.js + nocturne.css  B 夜航星图（§5.3）
  admin/
    shell.js + admin.css        D-admin 左栏导航 + 页容器 + 开发标注不带
    overview.js memories.js personas.js profiles.js ops.js graph.js backup.js
  assets/
    whale-avatar.png whale-banner.jpg   从 page.html 的 base64 常量（:503-504）落成文件
```

### 2.1 皮肤接口（所有皮肤必须实现，不得私自加 API 调用）

```js
export default {
  id: 'nocturne', name: '星图',
  tokens: { /* §4.3 管理端 token 集 */ },
  mount(el, ctx),     // ctx = { vm, persona, theme, motion, onSelect(id), params }
  update(vm),         // 15s 轮询后调用：增量更新，保留当前选中/缩放，不重播入场动画
  highlight(ids),     // 顶栏搜索命中（/api/query）→ 高亮；ids=[] 清除
  select(id|null),    // 外部选中（?sel= / 管理端跳转）
  unmount(),          // 必须取消全部 rAF / interval / 监听器
}
```

- 皮肤只读 `ctx.vm`，不 fetch。搜索框、查看人设、皮肤切换、动效开关都在壳层。
- 动效：壳层给 `ctx.motion`（localStorage `brain-motion`，`prefers-reduced-motion` 时默认关；`?still=1` 强制关）。`document.hidden` 时皮肤必须暂停 rAF。

### 2.2 服务端静态服务（http.ts）

- 新路由 `${prefix}/web/<path>`：启动时 `readdirSync` 递归建白名单（扩展名限 `.js .css .png .jpg .svg`），不在白名单 → 404；拒绝 `..`；Content-Type 按扩展名；`Cache-Control: no-cache`。
- **静态资源免口令**：ES module 的相对 import 不带 `?token=`，且 web/ 下只有代码与立绘、没有数据。口令校验仍覆盖 `/brain` HTML 与全部 `/api/*`。在 http.ts 口令检查前判路径前缀。
- `/brain` 返回 `web/index.html`；`/brain?ui=legacy` 返回旧 `page.html`（过渡期保留，§7）。
- 宿主 webServer 模式：把白名单每个文件路径逐条 `register`（与现有 API 白名单同方式）。
- build 脚本：`cpSync('src/server/web','dist/server/web',{recursive:true})`，旧 page.html 照旧拷贝。部署 rsync `dist` 自然带上，runbook 不变。

## 3. 视图模型 MapVM（vm.js，三皮肤共用）

`buildMapVM(state, ops, personas, profiles, viewPersonaId, now) → MapVM`。概念图 `data.js` 的字段 ↔ 真实数据映射如下，**概念里的随机/虚构数据必须换成右列口径，换不了的就删掉**：

| VM 字段 | 概念图来源 | 真实口径 |
|---|---|---|
| `notes[].id/kind/content` | id kind text | note.id / kind / content（content 永不截断，展示截断交给 CSS） |
| `notes[].title` | title（人写） | `mapLabel(note, notes)`（现 helper，去公共前缀取区分段） |
| `notes[].day` | day | note.ageDays |
| `notes[].ret / imp / hits` | ret imp hits | retention / importance / hits |
| `notes[].track` | track | `isSelfTrack(n) ? 'self' : 'world'` |
| 自我轨过滤 | self[p.id] | 只保留 `noteChar(n) === viewCharacterId` 的自我轨；世界轨全保留 |
| `notes[].emo` | emo | `note.emotion` → `emotionBucket()`，再映射到人设 moods 词与颜色（§4.1）；无则 null |
| `notes[].sess` | sess | sessionId → `/api/sessions` 的显示名，缺省「私聊/群聊+尾号」 |
| `notes[].who` | who / grp | note.actor → 画像显示名（/api/profiles），无画像用 actor 原值；人设自身不算 |
| `notes[].fading` | — | note.fading（遗忘线 = state.config.forgetThreshold） |
| `links[]` `t=consolidate` | consolidate | edges.kind=`derived` |
| `links[]` `t=similar` | similar | edges.kind=`semantic` |
| `links[]` `t=session` | session | `buildRelations()` 同会话关系（只在点选时显示） |
| `links[]` `t=facet` | — | edges.kind=`facet`（仅 cortex 用：记忆↔人格小节） |
| `mood` 当前心情 | p.mood/moodV | state.emotion → bucket + PAD 强度 |
| `say` 一句话 | p.say | `companionLine(kind,count,name)`：确定性模板，**零 LLM 调用** |
| 七日心情 | weekSeries（随机） | `emotionOps(ops)` 按本地日分桶取当日最后一次；无记录日显示「—」不补随机值（ops 是 500 条环形缓冲，可能不满 7 天，如实显示） |
| 最近被想起 | recalls（随机时间+注入位） | 按 `lastAccessAt` 降序 top 6，时间=lastAccessAt；**删除「注入第 N 位」**（无此数据） |
| 即将隐没 | fading | retention 升序 top 5，「约 N 天后隐没」用 `S·ln(R/阈值)` 真实计算 |
| 观测对象 | WHOS 硬编码 | actor 计数 top 3（含「用户」= 会话主人） |
| 星等分布 / 星座谱 | — | 同概念算法，输入换成真实 notes/links |

规模上限（真实库约 350 条，且会增长）：

- VM 本身不截断；**各皮肤自己做 LOD**，上限写在 §5 每个皮肤里。截断时三类 kind 按比例分配名额（同 d-admin 关联图口径），优先级 `importance × retention`，标签用 `labelPick()`。
- 被截掉的记忆仍能经搜索 / `?sel=` 定位：皮肤收到不在画面内的 id 时，在侧栏详情里显示，图上不画。

## 4. 主题

### 4.1 人设主题 PersonaTheme

```ts
{ a, a2, soft, deep,          // 四色，#rrggbb
  moodColors: Record<string,string>, // 情绪词 → 色
  traits: { name: string; v: number }[],  // 0..1，最多 6 条
  mono: string, en: string, tagline: string }  // 单字头像 / 英文名 / 一句话简介
```

解析顺序（theme.js `resolveTheme(persona)`）：

1. `persona.meta.*`（后端新增字段，§6 B1）逐字段取；
2. 内置预设：whale 系（`characterId==='whale'` 或 id ∈ WHALE_IDS）= 概念图 data.js 的大肥鱼色板；`ye-shunguang`、`firefly` 同理用 data.js 的色板（预设只是兜底，写在 theme.js 常量里）；
3. 派生：按 characterId 哈希取色相 → HSL 生成四色；moodColors 按词名哈希；mono=name 首字；traits 为空（皮肤需容忍空 traits，隐藏该块）。

### 4.2 皮肤默认规则（用户拍板：跟人设走、鲸脑通用）

`resolveSkin(characterId)`：`?skin=` 参数（不持久化） > localStorage `brain-skin:<characterId>` > 默认（whale 系 → `cortex`，其余 → `nocturne`）。按钮切换 = 写 localStorage 当前角色键。切「查看人设」到另一个角色时重新 resolve。

### 4.3 管理端 token 集

D-admin 的 CSS 只用以下变量，每个皮肤在 `tokens` 里给一套：

| token | cortex（深海暗） | dossier（纸面亮） | nocturne（夜空暗） |
|---|---|---|---|
| `--bg --panel --ink --ink2 --line --accent --accent2 --danger --font-head --font-body` | 取现 page.html `:root` 对应色 | 取 a-dossier `:root` | 取 b-nocturne `:root` |

`--accent/--accent2` 永远 = 当前查看人设的 `a/a2`。D-admin 的版式（粗分隔、大数字、表格密度）不变，只换色与字体。

## 5. 三个皮肤

### 5.1 cortex 鲸脑皮层（迁移，不重设计）

- **大肥鱼 + cortex 必须与现页视觉一致**：解剖图、六类节点、连线、神经信号、漂浮粒子、缩放平移、立绘气泡、Inspector、TOP RETENTION 卡片原样迁移。现有 `localStorage brain-signal / brain-particles` 继续生效。
- 迁移时去掉 vault 区（记忆库等五 tab 归管理端）；卡片区「查看全部记忆 ↗」改为跳 `#/admin/memories`。
- **非大肥鱼人设**：标题/品牌/气泡名用 persona.name，`WHALE CORTEX` eyebrow 换 `persona.en + ' CORTEX'`；立绘位换成 `mono` 单字大头像块（`deep` 底 `a` 字）；人格六边形节点与气泡强调色用 `a/a2`；脑解剖形状、记忆三色（情景/语义/态度）不变。
- 现 `page.html:1103` 等硬编码「大肥鱼」全部改读 persona。

### 5.2 dossier A 墨刊

- 以 `a-dossier.html` 为像素参照：刊头（人设名/特质/今日一句）→ 时间轴地层图（x=时间平方根刻度，三层 情景→语义→态度，巩固画弧）→ 侧栏详情 → 底部记忆索引表。
- LOD：地层图最多 60 个点（按 §3 比例分配），标签最多 24 个；索引表默认按 retention 降序前 50 条，「查看全部」跳 `#/admin/memories`。
- 自我轨点用人设色实心、世界轨用墨色空心（同概念）。

### 5.3 nocturne B 夜航星图

- 以 `b-nocturne.html` 第四轮为像素参照：鎏金星盘、星云夜空、银河 canvas、时间指针、彗星（最多 3）、流星、视差、切人设颜色补间、侧栏「今夜星语 / 本命星座」、底部星历六块（按 §3 真实口径）。
- LOD：星体最多 150 颗，标签最多 24 个；彗星只沿已画出的 consolidate 连线走。
- 必须支持 `?still=1`（静态终态，截图验收用）与 `?sel=<id>`。
- 性能：银河 canvas 按 devicePixelRatio 但上限 2；`document.hidden` 暂停；动效关时零 rAF。

## 6. 后端新增（先于前端对应切片）

全部**不新增 LLM 调用**，成本一线无影响。每项都要单测 + http 测。

| # | 能力 | 契约 | 谁用 |
|---|---|---|---|
| B1 | 人设主题字段 | `PersonaEntry.meta?: { theme?:{a,a2,soft,deep}; moodColors?:Record<string,string>; traits?:{name,v}[]; mono?; en?; tagline? }`；POST/PATCH 透传（`'meta' in o` 才覆盖，null 清除，同 moods 口径）；校验：色值 `^#[0-9a-f]{6}$`i、traits ≤6 且 v∈[0,1]、文本字段 ≤40 字；export/import 随 personas 带走；不进任何 prompt | theme.js、admin/personas |
| B2 | 记忆分页查询 | `GET /api/notes?page=1&size=20&q=&kind=&track=world\|self&char=&persona=&scope=priv\|pub&status=fading\|fresh&session=&sort=retention\|age\|importance\|hits&dir=asc\|desc` → `{ items, total, page, size }`；items 字段同 graph() notes；size ∈ {20,50,100} | admin/memories |
| B3 | 流水分页 | `/api/ops` 加 `page&size&type=<op名,逗号分隔>&from&to`（ms），旧 `limit` 参数保持兼容；在 500 条环形缓冲内分页，不新增落盘 | admin/ops |
| B4 | 批量操作 | `POST /api/notes/batch { ids: string[≤200], patch?: {importance?,kind?,private?}, delete?: true }` → `{ ok, affected }`；逐条走现有写路径保证 op 可重放 | admin/memories |
| B5 | 去重预估 | `POST /api/dedup?dry=1` → `{ pairs, wouldMerge }` 不写；无 dry 行为不变 | admin/backup |

延后（不在本任务）：画像分页（量小前端分页即可）、记忆手动指定 characterId、recall/decay 独立事件落盘、intents 管理页。

## 7. 迁移与回滚

- 过渡期 `/brain?ui=legacy` 返回旧 page.html，功能完整；新壳层的「管理」导航在 admin 各页完成前**跳旧页**（`?ui=legacy`），所以每个上线点都不丢功能。
- 上线点（串行小步，每点走查 → 部署 → 观察）：
  - **P1**：B1 + 壳层 + cortex 迁移 → 默认新 UI；管理跳旧页。验收重点：大肥鱼视觉零回退。
  - **P2**：dossier + nocturne 上线，皮肤按钮可用。
  - **P3**：B2–B5 + admin 七页 → 管理不再跳旧页。
  - **P4**：删除 page.html 与 `?ui=legacy`，`page.test.ts` 已迁完。
- 回滚：任一上线点出问题 → 回滚 dist（服务器 `~/backups` 成对备份），数据层只有 B1 的可选字段，旧代码读到 `meta` 会忽略，无需数据回滚。

## 8. 测试口径

- 纯函数（vm.js、theme.js、admin 的筛选/分页工具）用 `node --test` 直接 `import`，**取代** page.test.ts 的正则抠脚本方式；现有 page.test.ts 用例逐条迁到 `test/web-*.test.ts`，断言不变。
- http.test.ts 补：静态白名单命中/404/`..` 拒绝/免口令仅限 web/、`?ui=legacy`、B1–B5。
- 视觉：`node --experimental-strip-types demo/serve-demo.ts` 起 demo，headless Chrome 截图 `#/map?skin=<id>&still=1`（× 查看人设 whale/ye-shunguang/firefly）与 `#/admin/<page>`，和概念图同参截图并排比对。cortex+大肥鱼 与旧页 `?ui=legacy` 并排比对。
- 自检：沿用 d-admin `?selftest=1` 思路，admin 每页一组 DOM 自检可选，不强制。
