# 脑图底部图例与脑区标签堆叠

## Goal

脑图页底部 `.stage-foot` 图例条以 absolute 覆盖在 `#brain` SVG 上，与 SVG 底部元素堆叠：AMYGDALA/HIPPOCAMPUS 脑区标签、`+N 条未显示 ↗` 溢出链接、`#map-current` 悬停摘要、引线互相穿插，截图中底部一片文字重叠。改为 flex 文档流让图例条真正占据底部空间，SVG 视口随之上移。

## Requirements

- `.stage` 改为 flex 纵列；`#brain` 不再 absolute 铺满，改为 `flex:1` 占据剩余空间
- `.stage-foot` 改为文档流（`position:relative` 保留 z-index 以盖过 `.stage:after` 内阴影），padding 替代原 left/right/bottom 偏移
- 不挪 SVG 内部坐标（REGIONS/overflow/leader），footer 高度随图例换行自适应，避免硬编码安全区
- 移动端 ≤1000px 媒体查询行为不变（图例本来隐藏）

## Acceptance Criteria

- [x] 底部图例、悬停摘要、`+N 条未显示`、AMYGDALA/HIPPOCAMPUS 标签互不重叠
- [x] 图例换行/窗口变窄时仍不重叠（footer 高度自适应，不在 SVG 内）
- [x] `dsh-qqbot-brain` `npm test` 通过

## Resolution（2026-11-03）

- **遇到了什么问题**：`.stage-foot`（图例/`#map-current`/按钮组）`position:absolute;bottom:16px` 覆盖在 `#brain` SVG（absolute inset:0 铺满 stage）底部。SVG 底部正好是 AMYGDALA(200,546)、HIPPOCAMPUS(460,574) 脑区标签与 `+N 条未显示 ↗`(560,590)，导致 HTML 文字与 SVG 标签、引线互相穿插堆叠。
- **怎么解决的**：`.stage` 改 `display:flex;flex-direction:column`；`#brain` 去掉 absolute 改 `flex:1;min-height:0` 占剩余空间；`.stage-foot` 改 `position:relative`（保留 z-index:2 盖过 `.stage:after` 内阴影）进入文档流，padding 替代原 left/right/bottom 偏移。footer 占据真实布局高度，物理上不再可能与 SVG 内容重叠；preserveAspectRatio meet 自动把脑图居中于缩小后的视口。
- **后续优化方向**：若想恢复「脑图铺满出血」的视觉，可给 viewBox 底部加空白带并让 footer 重新覆盖在空白区；目前结构优先，footer 高度随图例换行自适应无需维护安全区常量。
- **什么时候干的**：2026-11-03，`dsh-qqbot-brain/src/server/page.html` 纯 CSS 三处改动。
- **Key Decisions**：选 flex 文档流而非挪 REGIONS 坐标——footer 是 HTML 层、高度随换行变化，给 SVG 让位比给标签定死坐标更稳；未动 SVG 内部任何坐标/JS。
- **验证结论**：`npm test` 121/121 通过（含内联脚本语法检查）；静态预览确认无重叠（API 404 不影响布局验证）。
