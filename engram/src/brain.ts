/**
 * brain 引用唯一入口——丑路径集中在这一个文件。
 *
 * engram 与 dsh-qqbot-brain 平级，直接消费插件包内的 brain 内核 .ts 源码：
 * 同一份源码两个 deployment（dsh 插件 tsc→dist；engram 由 Node ≥22.18
 * type stripping 直跑，零构建）。brain 内部签名漂移时本文件 typecheck 即暴露。
 *
 * 注意：这里只做 re-export，不写任何逻辑。新增 brain API 时在此登记。
 */

// ── 内核构造与门面 ──
export {
  Brain,
  BrainStore,
  DEFAULT_BRAIN_CONFIG,
  Distiller,
  Embedder,
} from '../../dsh-qqbot-brain/src/brain/index.ts';

// ── 常量与类型（types.ts 经 index.ts export * 透出）──
export {
  GLOBAL_SESSION_ID,
  DEFAULT_TIME_ZONE,
} from '../../dsh-qqbot-brain/src/brain/types.ts';
export type {
  BrainContext,
  Turn,
  IntentEntry,
  IntentDraft,
  IntentConfigPatch,
  IntentKind,
  IntentStatus,
  MemoryNote,
  BrainSearchOptions,
  BrainConfig,
  EmotionState,
  SessionDigest,
  NoteEmotion,
  ProfileEntry,
} from '../../dsh-qqbot-brain/src/brain/types.ts';

// ── store 侧类型（index.ts 只透出 BrainStore 类，条目类型从源文件取）──
export type {
  PersonaEntry,
  PersonaExtra,
  PersonaPatch,
  PersonaMeta,
  BrainExport,
  ImportResult,
} from '../../dsh-qqbot-brain/src/brain/store.ts';

// ── 脑图 HTTP 服务（page.html/web 静态资源随 src/server/ 走）──
export { BrainHttpServer } from '../../dsh-qqbot-brain/src/server/http.ts';

// ── setup 工具 ──
export {
  readPersonaFile,
  writePersonaFile,
  personaFilePath,
} from '../../dsh-qqbot-brain/src/setup/persona-file.ts';
export { makeFileLogger } from '../../dsh-qqbot-brain/src/setup/file-log.ts';

// ── 插件 config 形状（engram 复用其 LLM/embed/retrieval/consolidation/digest/http 类型，
//    不复用 DEFAULT_CONFIG/DEFAULT_PERSONA——那是 whale 群聊语境）──
export type {
  LlmConfig,
  EmbedConfig,
  RetrievalConfig,
  ConsolidationConfig,
  DigestConfig,
  HttpConfig,
} from '../../dsh-qqbot-brain/src/config.ts';
