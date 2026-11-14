# 墨刊地层图节点富集

## 现象（2026-11-14 用户截图反馈）

`/brain` 墨刊（dossier）皮肤的地层图出现「数据大量富集」：最近几天的自我轨节点在 semantic 带叠成一根纵向绿柱（~20+ 点压在同一 x），常驻标签逐行互印，巩固弧从柱心发散打成边束；左半版面大量空置。

## 根因分析（代码级）

三个「同一天的点挤一处」叠加，富集是必然结果而非数据问题：

1. **时间粒度=整数天**：`graphNoteItem` 里 `ageDays: Math.floor(ageInDays(n, now))`（src/brain/index.ts:72），`xOf(n.day)` 让同日历日所有点共享同一 x → 天然一列。`createdAt`（ms）其实已在投影里（index.ts:69），细粒度信息是前端自己丢掉的。
2. **LOD 选取随 recency 单调**：`quotaPick` 排序键 `importance × retention`，retention 随年龄衰减 → 60 个名额几乎被最近 0–3 天吃光 → 柱子挤右缘、时间轴中段空荡；sqrt 横轴给近端留出的分辨率被 LOD 饿死。
3. **碰撞解决半残**（`_layout`，dossier.js:121-140）：
   - 只挪 y，固定 30px 中心距不感知半径——imp=5 节点 r=15、self 环 r+3.5，两个大自我点要 ~37px 才不贴，30px 注定重叠；
   - `k<14` 后放弃治疗直接叠放；最大位移 ±140px 超出带半高（58px）溢进邻带；
   - `used` 按 kind 分桶 → 跨带碰撞从不检查，semantic 点可被推到 attitude/episodic 点上。
4. **左缘同款隐患**：`xOf` clamp DMAX=32 → >32 天的点全压 x=X0 一列，老化数据一多左缘复制同款柱子。
5. **标签同分选取**：`labelPick` top24 用同一 ret×imp 分 → pin 的全是柱内点，相同 x、20px 纵向一档、字号 ~11px → 文字逐行互印。
6. **边**：巩固弧全部锚在柱上 → 曲线束收敛成黑团（截图可见）。

## 优化方案（按性价比排序，全前端可落地）

- **P0a x 用连续年龄**：布局 x 改 `(vm.now - n.createdAt)/864e5` 浮点年龄（展示用 `n.day` 仍整数）；demo 大集 createdAt 含日内散布（day_plan jitter 0–0.9d），同日点自然摊开。生产同会话批量蒸馏的分钟级同刻仍需碰撞兜底。
- **P0b 碰撞改二维 + 真实半径**：minDist=ra+rb+4；`used` 全局一档（跨带也查）；让位顺序=先 x 向 ±10 步进、满了再 y ±20；y 位移 clamp 带内（|dy|≤46）；k 次未果取「最大净空」候选或直接弃画为 tick。
- **P1a LOD 时间配额**：kind 名额内按时间段（0-1/2-3/4-7/8-14/15-32/32+）小配额保底，保证地层覆盖全轴；重要性仍主导大头，别改成均匀分布。
- **P1b 标签 AABB 防叠**：labelPick 后按分贪心放框（估 w≈len×10、h≈14），撞框跳过（hover/select 仍显）；借 vm.js layoutSlots 的 taken 模式。
- **P2 32d+ 尾巴**：超 DMAX 的点或不进图（反正全 fading）或单列「32d+」lane y 排开。
- **P2 边度数 cap**：每点出边 ≤4；x 散开后大部分自愈。

预估改动面：dossier.js `_layout`/`_drawMap` ~40 行，vm.js quotaPick/labelPick ~20 行；纯前端不动 API。

## 复审修订（2026-11-14 第二轮）：弃碰撞补丁，改「数据诚实 + cell 聚合」

上一版 P0–P2 是碰撞补救思路，天花板低且漏了最大杠杆。复审结论：

- **absorbed 存档条全量进图**：`buildMapVM` 不消费 `absorbed` 字段，星图侧已实测生产 407 条中 237 条（58%）为 absorbed、84/150 画面星是幽灵存档；墨刊同病，且存档条集中在早期 episodic 正是塞柱主力。副标语「她记住了什么」画退池存档本身是信息失真。→ **退出绘制集**（dossier 内 filter，跨皮肤统一口径后续在 vm.js 层做 `active/archived` 划分）；masthead 加「已沉淀存档 N 条」。
- **连续年龄 x 的局限**：sqrt 轴下 day15→16 lane 宽仅 ~16px，老数据同天点照挤；碰撞算法是事后补救，「60 点挤 3 天」的信息失衡仍在。
- **密度即信息**：富集不抹平、设计成有意视觉——报刊致密层。

### 新方案（门面/视觉/信息效率优先）

1. **cell 聚合版式**：按 `(kind 带 × 天)` 分 cell；x=连续年龄 `(now-createdAt)/864e5`；每 cell ≤K≈4 点（按分取、槽位纵排、零碰撞算法）；超出渲染「+N」mono 小标记=密度信号；点击「+N」→侧栏列该 cell 全条目（复用 rel 列表样式，可进专栏）。
2. **两级 LOD**：先 cell 聚合、再按 cell 代表分数截断保 60 cap；`>32d` 自然落尾 cell「32 天前及以前」，左缘隐患顺带解决。
3. **标签/边随 cell 口径**：pins 从 cell 代表取 top24 + AABB 防叠；边仅两端皆被画节点时画（现有 `_pos` filter 天然兼容）。
4. **标签防叠**：AABB 贪心跳过（借 layoutSlots taken 模式）。

### 备选否决

- 蜂巢 circle-packing：与报刊风不搭、信息效率零提升、成本最高。
- 每日栏堆叠柱/heatmap：丢点身份、边无法表达。
- 纯碰撞补丁（v1）：治标不治本。

### 分期

- **第一期**：absorbed 退出 + cell 聚合全量 + 标签 AABB，~dossier.js 120 行 + vm.js 小改。
- **第二期可选**：带底密度尺 sparkline、cell 标记含存档数（「活3+存8」）、「+N」就地 SVG 展开。

## Resolution（2026-11-14）

**遇到的问题**：墨刊地层图同日记忆压成一根纵柱、标签互印、边束打结；复审发现 absorbed 存档条（生产实测 58%）全量挤占 LOD 名额是更深层失真。

**怎么解决的**（第一期全量落地，`dossier.js` 重写 `_layout` + 新增 `_sideCell`/`_selectCell`，`dossier.css` 补 `.cellmark`）：
- absorbed 退出绘制集，刊头统计行加「存档 N」；
- `(kind×天)` cell 聚合：每 cell ≤4 点成点、余量折「+N」计数标（带缝内、先行落位、节点把它当矩形障碍避让）；
- 预算三级配额 `allocBudget`（kind 保底6 → 时间桶6段保底一格 → cell 按分花预算），60 节点预算覆盖全时间轴；
- x 改连续年龄 `(now-createdAt)/864e5`；格内槽位纵排 + 全局碰撞 pass（y 全扫步4 × x±24，最大净空最小位移）；
- 标签改分数序+AABB 防叠（每 kind 保底3）；「+N」点击 → 侧栏全格 roster（标「上图」），选中联动地图/索引行高亮。

**验证结论**：typecheck+274 tests+build 全绿；headless dump-dom 实测（demo 大集 286 可见/43 存档）：60 节点满额、46 个「+N」标记、节点两两真重叠 0、标记互压 0、标记-节点 <20px 0、常驻标签 24 个 AABB 重叠 0、x 分布 160-720 全轴均布（原右缘柱消失）、无 console 报错。交互（点标记→侧栏名单→专栏）经代码走查，未做真机点击验证。

**后续优化方向**：① absorbed 口径跨皮肤统一（vm.js 拆 active/archived，nocturne 已各自落地星尘层、cortex 待评估）；② 带底密度尺 sparkline、「+N」就地展开、cell 标记含存档数（「活m+存a」）；③ 搜索命中落在聚合隐藏成员时地图无反馈，可考虑标记闪烁；④ >32d 尾格目前单格聚合，数据更老后可考虑尾格内再分桶。

**Key Decisions**：密度即信息（致密层显性化而非抹平）；标记先于节点落位保证计数可读；预算按「需求比例+保底」而非均匀分布，保住近端密度倾向；标记漂移 ±60px 换可读性，x 时间精度让位给门面。

**什么时候干的**：2026-11-14 分析→方案复审→拍板→实现→验证，同日完成（未部署生产）。

## Open questions

- absorbed 口径拍板：完全退出+masthead 计数（推荐）vs cell 标记含存档数（信息最全、复杂度+1）vs 跨皮肤统一走 vm.js `active/archived` 字段（范围扩大到 nocturne/cortex）。
- cell 展开交互：侧栏清单（推荐，零新组件）vs 就地 SVG 展开 vs 跳 #/admin/memories。
