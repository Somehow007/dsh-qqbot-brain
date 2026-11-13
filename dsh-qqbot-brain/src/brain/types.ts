/**
 * brain 核心类型
 *
 * 记忆分层：
 * - working   dsh 会话历史（宿主已有，本插件不重复实现）
 * - episodic  蒸馏笔记 MemoryNote（kind='episodic'），按保持率 R=e^(-t/S) 衰减
 * - semantic  用户画像 / 关系摘要（kind='semantic' 或 profiles）
 * - attitude  角色对人/事/话题的立场看法（kind='attitude'），自我的慢变量，
 *             随检索按相关性唤起，随时间与其他记忆同样衰减/被 merge 更新
 * 人格内核 persona core 为只读文本，不走可写记忆。
 */

/** 记忆写入时钉上的情绪快照（不带 updatedAt；缺失=老数据/未记录） */
export interface NoteEmotion {
  v: number;
  a: number;
  d: number;
  label: string;
  /** 受控情绪类别（默认 MOODS 之一，人设可配 moods 换词表）；可视化按它分桶，老数据缺省走 v/a 推断 */
  mood?: string;
}

/** 受控情绪类别：默认蒸馏枚举，脑图情绪桶与之同名对应；人设可用 PersonaEntry.moods 换自己的词表 */
export const MOODS = ['平静', '开心', '兴奋', '害羞', '好奇', '委屈', '炸毛', '记仇', '难过'] as const;

/** mood 的效价符号约定：mood 与 v 正负应一致（平静/好奇等歧义词无约束项）；按词名全局生效，人设自定义词同样适用 */
export const MOOD_VALENCE: Record<string, 1 | -1> = {
  开心: 1, 兴奋: 1, 害羞: 1, 释然: 1,
  委屈: -1, 炸毛: -1, 记仇: -1, 难过: -1, 心疼: -1, 寂寞: -1,
};

/** 默认时间渲染时区：群成员在国内，云服务器系统时区通常 UTC，必须显式给 */
export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

/** 一条长期记忆（蒸馏笔记） */
export interface MemoryNote {
  /** 稳定 id */
  id: string;
  /** 归属会话：dsh sessionId（peer 的确定性身份） */
  sessionId: string;
  /** 相关发言者（群聊中的用户标识，可选） */
  actor?: string;
  /** 一句话事实/事件，含相关实体 */
  content: string;
  /** 重要度 1-5（5=重大承诺/强偏好/关键事件） */
  importance: number;
  /** 记忆类型：episodic 情景记忆 | semantic 语义记忆 | attitude 态度立场 */
  kind: 'episodic' | 'semantic' | 'attitude';
  /** 形成时间 ms epoch */
  createdAt: number;
  /** 记忆强度 S（单位：天），被唤起时增强 */
  strength: number;
  /** 被检索命中次数 */
  hits: number;
  /** 最近一次被唤起 ms epoch（衰减从该时刻起算） */
  lastAccessAt: number;
  /** 语义向量（embedding API 产出；无 key 时缺省，检索回退 lexical） */
  embedding?: number[];
  /** 形成时的情绪快照：op 流水会 compact，直接存记忆上才是可靠的「形成时情绪」 */
  emotion?: NoteEmotion;
  /** 派生来源：巩固（consolidate）时喂入的情景记忆 id（真实的「沉淀自」关系，非推断） */
  sourceIds?: string[];
  /**
   * 形成时的活动人设 id（事实共享·态度分轨：kind=attitude 只对同人设召回）。
   * 缺失 = 分轨功能上线前的存量，一律视为 PRE_TAG_PERSONA_ID 时期形成。
   */
  personaId?: string;
  /**
   * 自我轨标记（角色→人设两级三轨）：true=角色自我内容（前史/承诺/感受），
   * 与 kind=attitude 同属自我轨——仅对同 character 可见；false=显式标世界轨
   * （手动修正语义，启发式/迁移不覆盖）；缺省=世界轨共享。
   */
  self?: boolean;
  /** 被语义巩固吸收的 ms epoch（设置后退出检索池与巩固候选，保留存档） */
  absorbedAt?: number;
  /**
   * 私域作用域手动覆盖；生效域 = private ?? 来源会话的域标记（sessionDomains）。
   * 取值：domain 名=同域会话可见；某 sessionId=仅该会话可见（原地私密）；
   * 'public'=强制公开（即便来源会话已标域）；undefined=按来源会话域派生。
   */
  private?: string;
  /**
   * 来源戳（迭代D provenance）：记忆由谁产出。
   * 'user'=用户对话蒸馏（默认语义，缺省视同）；'agent'=壳层主动消息相关产出；
   * 'manual'=脑图页/API 手写；'import'=备份/人设包导入。不可经 update op 修改。
   */
  source?: MemorySource;
}

/**
 * 分轨上线前全部记忆的归属人设：当时唯一实际活跃的人设是 whale-gentle
 * （其前还有寥寥数条 legacy 期态度，误归 whale-gentle 可接受，免去迁移）。
 */
export const PRE_TAG_PERSONA_ID = 'whale-gentle';

/**
 * 迭代A迁移常量：存量 whale 系三人设（温柔/依恋/原版）归并到同一角色 'whale'——
 * 自我轨按角色隔离，同角色换版本共享自我轨。
 */
export const WHALE_PERSONA_IDS = ['whale-gentle', 'whale-devotion', 'legacy'] as const;
export const WHALE_CHARACTER_ID = 'whale';

/**
 * 自我轨启发式：剥掉引号转述（「我…」可能是他人原话/作品名）后含「我」→ 角色自我内容。
 * 「角色」不判——「X 对角色说Y」是用户事实高频句式，误伤会把世界轨挖成自我轨。
 * 实测校准见 tasks/11-09-iteration-a-three-track/design.md §2。
 */
const QUOTED_RE = /[「『“"'][\s\S]*?[」』”"']/g;
export function isSelfContent(content: string): boolean {
  return /我/.test(content.replace(QUOTED_RE, ''));
}

/**
 * 草稿 self 归一（addNote/判重/导入共用单一出处）：
 * attitude 恒走自我轨不写 self；其余显式 self（LLM/手动修正）优先，
 * 缺省走启发式兜底——false 必须保留，否则「我」字内容的手动世界轨修正
 * 会被启发式翻回自我轨。
 */
export function resolveSelfFlag(kind: string | undefined, self: boolean | undefined, content: string): boolean | undefined {
  if (kind === 'attitude') return undefined;
  if (self !== undefined) return self;
  return isSelfContent(content) ? true : undefined;
}

/** 全局作用域：不绑定具体会话的记忆（脑图页手动写入默认入此域），检索时对全体会话可见 */
export const GLOBAL_SESSION_ID = 'manual';

/**
 * 立场类记忆的规范行文：「对<对象>：<立场>」。
 * 同对象归并（findAttitudeSameObject）与入库格式校验共用同一出处——
 * 只认「对」前缀，存量「X：」式人物事实不是立场。
 */
export const ATTITUDE_OBJECT_RE = /^对(.{1,24}?)[：:]/;

/**
 * 时效锚点：含相对时间词或具体月日的陈述是「一次性事件」而非稳定语义。
 * 巩固产出命中此表的候选按 episodic 入库（信息仍可检索，只是不占语义位）——
 * 线上实测「11月6日不用早起」「项目截止明天」曾被提升为 semantic 长期驻留。
 */
export const EPHEMERAL_TIME_RE = /今天|今晚|明天|昨天|昨晚|前天|后天|刚才|刚刚|这周|本周|上周|下周|今早|\d+\s*月\s*\d+\s*[日号]/;

/**
 * 召回意图启发式（迭代C）：疑似「考问记忆」的发言是深挖召回的第一道门。
 * 只作门控信号之一——还需 lane-1 真相关命中不足才追加深挖（成本纪律双门）。
 * 词表偏宽（「去年」「当时」），由弱命中门 + 同地板 + ≤limit 条上限收敛噪声；
 * 线上观察误触发率后再收紧。
 */
export const RECALL_INTENT_RE = /还记得|记得吗|记不记得|记得不|之前(说|提|聊|讲)|以前(说|提|聊|讲)|上次(说|提|聊|讲)|去年|当时|什么来着|咱们(之前|上次|聊过|说过)|你忘了|忘了没|do you remember|remember when/i;

/** 记忆归属人设：缺 personaId 的存量按 PRE_TAG_PERSONA_ID 计 */
export function notePersonaId(n: { personaId?: string }): string {
  return n.personaId ?? PRE_TAG_PERSONA_ID;
}

/** PAD 情绪状态：v 效价[-1,1] a 唤醒[0,1] d 支配[-1,1] */
export interface EmotionState {
  v: number;
  a: number;
  d: number;
  /** 自然语言状态行，注入 prompt 用，如「慵懒满足」 */
  label: string;
  /** 受控情绪类别（MOODS 或人设 moods 之一）；旧数据可缺省，可视化回退 v/a 推断 */
  mood?: string;
  /**
   * 形成该情绪时的人设 id（情绪按角色隔离）：读侧 character 与活动角色不符→中性。
   * 缺失=分轨前存量，按 PRE_TAG_PERSONA_ID（whale）角色计，自愈于下次 apply。
   */
  personaId?: string;
  updatedAt: number;
}

/** 蒸馏产出的记忆草稿（入库前） */
export interface NoteDraft {
  content: string;
  importance?: number;
  actor?: string;
  kind?: 'episodic' | 'semantic' | 'attitude';
  /** 判重：若为对已有记忆（distill 时附带的编号列表）的更新/合并，为对应下标 */
  mergeIndex?: number;
  /** 写入时钉上的情绪快照（由 Brain 层注入） */
  emotion?: NoteEmotion;
  /** 初始强度乘数（Brain 层用于强情绪加权；入库 clamp 到 [0.1, 3]） */
  strengthBoost?: number;
  /** 派生来源（巩固路径注入）：喂出这条语义记忆的情景记忆 id */
  sourceIds?: string[];
  /** 归属人设（Brain 层注入=当前活动人设）；缺省由读侧按 PRE_TAG_PERSONA_ID 计 */
  personaId?: string;
  /** 自我轨标记（蒸馏 LLM 可选输出；缺省由 addNote 启发式兜底判定） */
  self?: boolean;
  /** 私域手动覆盖（脑图页/API 指定）；缺省按来源会话域派生，见 MemoryNote.private */
  private?: string;
  /** 来源戳（迭代D）：缺省由写入路径决定——蒸馏='user'、脑图/API='manual' */
  source?: MemorySource;
}

/**
 * 画像条目：按人存储，键见 identity.ts（u:<openid> / sess:<sessionId>）
 */
export interface ProfileEntry {
  /** 画像全文，蒸馏整体覆盖重写 */
  text: string;
  /** 展示名：发言人昵称；sess 键可为空（页面用 sessionId 短码） */
  name: string;
  /** 该画像在哪些会话中出现过 */
  sessions: string[];
  /** 最近一次重写时刻 ms epoch */
  updatedAt: number;
  /**
   * 最近一次画像审核产出的文本（与 text 相同=当前内容已过审）。
   * 持久化替代进程内 reviewedProfiles map——重启后不再每会话重审一遍存量画像。
   */
  reviewed?: string;
  /** 最近一次重写时的活动人设（仅展示标签：画像共享不分版，但可解释「这段是谁写的」） */
  lastWrittenByPersona?: string;
}

/** 蒸馏产出的单条画像（入库前；actor 缺失=会话整体画像） */
export interface ProfileDraft {
  /** 发言人标识，群聊为「昵称 (openid)」，缺省=会话级画像 */
  actor?: string;
  text: string;
}

/** 蒸馏结果 */
export interface DistillResult {
  memories: NoteDraft[];
  emotion?: { label: string; v: number; a: number; d: number; mood?: string };
  /** 旧字段：会话级画像全文（兼容旧 LLM 输出与调用方） */
  profile?: string;
  /** 结构化画像：群聊按发言人各一条，单聊/会话级省略 actor */
  profiles?: ProfileDraft[];
  /** 遗忘意图：数字=已有记忆编号（distill 附带列表下标），字符串=按内容子串匹配删除 */
  forget?: (number | string)[];
}

/** 记忆来源戳取值（迭代D provenance；与 MemoryNote.source/NoteDraft.source 共用） */
export const MEMORY_SOURCES = ['user', 'agent', 'manual', 'import'] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

/** 一轮对话（蒸馏输入） */
export interface Turn {
  userText: string;
  assistantText: string;
  actor?: string;
  at: number;
  /**
   * 轮次来源（迭代D session-kind）：'user'=用户发起（缺省，兼容存量）；
   * 'agent'=角色主动开口（companion 壳层 proactive turn）；'system'=系统/心跳。
   * agent/system 轮次在蒸馏中不作用户发言归因；整批无 user 轮次→跳过蒸馏。
   */
  via?: 'user' | 'agent' | 'system';
  /**
   * 群聊环境上下文（[Chat history] 末段，界内截断保留标记）。
   * 只进 distill convo 做背景；digest/检索 query/embedding 不读——
   * 否则同一批环境消息在 40 轮窗口里被重复计费近 10 次。
   */
  contextText?: string;
  /**
   * 形成该轮对话时的活动人设 id（Brain.ingest 钉「形成时人设」）：
   * 蒸馏批次归属以此为准，修「切换瞬间在途批次归新人设」窗口。
   */
  personaId?: string;
}

/** 会话滚动摘要（digest）：transcript 与 note 之间的中间层 */
export interface SessionDigest {
  /** 摘要文本（滚动合并，非增量） */
  text: string;
  /** 覆盖到的最近一轮序号（Brain 内自增计数） */
  uptoTurn: number;
  updatedAt: number;
}

// ── standing intents（迭代D prospective memory）──

export type IntentKind = 'event' | 'time';
/** pending 活跃 / fired 终态（一次性触发或达 maxFires）/ expired 过期 / cancelled 人工取消 */
export type IntentStatus = 'pending' | 'fired' | 'expired' | 'cancelled';

/** event 型匹配器：text/actor 同给按 AND；各自支持子串（大小写不敏感）或 /正则/flags */
export interface IntentMatch {
  /** 匹配入站正文 turn.userText（不含 contextText 环境消息） */
  text?: string;
  /** 匹配发言人 actor tag「昵称 (openid)」 */
  actor?: string;
}

/** 一条 standing intent：会记得在未来触发的意图（companion 主动开口的内核前置） */
export interface IntentEntry {
  id: string;
  kind: IntentKind;
  /** 意图描述（人读 + 壳层生成消息的语义输入），≤200 字 */
  text: string;
  status: IntentStatus;
  createdAt: number;
  /** time 一次性触发时刻 ms epoch；与 dailyAt 互斥（存在即一次性，触发→fired 终态） */
  fireAt?: number;
  /** time 每日复发 'HH:mm'（cfg.timeZone 口径；场次晚于 createdAt 才补触发） */
  dailyAt?: string;
  /** event 匹配器：text/actor 至少其一非空 */
  match?: IntentMatch;
  /** 触发后冷却时长 ms（防刷屏；缺省=无冷却） */
  cooldownMs?: number;
  /** 冷却截止（内核在 fire 时写=lastFiredAt+cooldownMs） */
  cooldownUntil?: number;
  /** 触发次数上限：firedCount 达到→status='fired' 终态；缺省不限 */
  maxFires?: number;
  firedCount: number;
  lastFiredAt?: number;
  /** 失效时刻 ms epoch：pending 过此点→expired（每日型=停止复发窗口） */
  expiresAt?: number;
  /** 创建时活动人设 id（标签/壳层路由用；不参与触发判定） */
  personaId?: string;
  /** event 匹配范围限定：缺省=任意会话的入站 turn 都可触发 */
  sessionId?: string;
}

/** intent 创建/更新入参（Brain 层校验归一后落库） */
export interface IntentDraft {
  kind: IntentKind;
  text: string;
  match?: IntentMatch;
  fireAt?: number;
  dailyAt?: string;
  cooldownMs?: number;
  maxFires?: number;
  expiresAt?: number;
  personaId?: string;
  sessionId?: string;
}

/**
 * intent 可变字段补丁（store op 与 Brain.updateIntent 共用）：
 * undefined=不动，null=清除可选字段；status 仅内核终态转移用（公开 updateIntent 不暴露）。
 * kind/createdAt/firedCount/lastFiredAt/cooldownUntil 不可补丁——分别由创建、fire op 维护。
 */
export interface IntentUpdatePatch {
  text?: string;
  match?: IntentMatch | null;
  fireAt?: number | null;
  dailyAt?: string | null;
  cooldownMs?: number | null;
  maxFires?: number | null;
  expiresAt?: number | null;
  sessionId?: string | null;
  personaId?: string | null;
  status?: IntentStatus;
}

/** 公开 updateIntent 入参：配置字段可空清除，不含 status（终态转移走 cancelIntent/内核） */
export type IntentConfigPatch = Omit<IntentUpdatePatch, 'status'>;

/** 注入 prompt 的组装产物 */
export interface BrainContext {
  /** 人格内核 section 文本（可为空串表示未启用） */
  persona: string;
  /** 情绪态一行（可为空串） */
  emotion: string;
  /** 会话脉络摘要（可为空串） */
  digest: string;
  /** 当前时刻一行（按 timeZone 渲染，供模型锚定相对时间） */
  clock: string;
  /** 记忆摘录行（已带时间标注），可为空数组 */
  memoryLines: string[];
  /** 态度立场行（kind=attitude 命中条目），可为空数组 */
  attitudeLines: string[];
  /**
   * 深挖召回行（迭代C）：召回意图∧lane-1 弱命中时追加，标 [深挖] 前缀；
   * 恒在场，空数组=未触发。与 memoryLines 分列——lane-1 口径不被深挖污染。
   */
  deepRecallLines: string[];
  /** 本次命中的记忆（用于统计/调试/可视化） */
  hits: MemoryNote[];
}

/**
 * Brain.search 检索选项（迭代C 主动召回原语；companion 壳层 brain_search tool 同款口径）。
 * 纯检索无副作用——不 reinforce；唤起语义由调用方决定。
 */
export interface BrainSearchOptions {
  /** 返回上限（默认 cfg.topK；仍受 candidatePool 粗排帽） */
  limit?: number;
  /** 记忆类型过滤（默认全部三类） */
  kinds?: readonly MemoryNote['kind'][];
  /** 跨会话召回：false=本会话+全局域（同 assemble lane-1）；true=scopeVisible 允许的全部会话 */
  crossSession?: boolean;
  /** 覆盖 cfg.minCosine 的 lex 相关性地板 */
  minCos?: number;
  /** 覆盖 cfg.embedMinCos 的 emb 相关性地板 */
  minEmbedCos?: number;
}

export interface BrainConfig {
  /** 检索 top-k */
  topK: number;
  /**
   * score = alpha·rel·(1 + beta·R) + gamma·imp/5
   * rel 为相关性（embedding 余弦或 lexical 余弦），是硬门槛项；
   * R 只对相关命中做 boost，不再独立撑起排名。
   */
  alpha: number;
  beta: number;
  gamma: number;
  /** 每次命中强度增量（天） */
  reinforceStep: number;
  /** 强度上限（天） */
  strengthCap: number;
  /** 保持率阈值（仅可视化标记"将遗忘"） */
  forgetThreshold: number;
  /** 情绪衰减速率（每天向中性回归的比例） */
  emotionDecayPerDay: number;
  /** 检索候选数上限（粗排） */
  candidatePool: number;
  /** 检索相关性门槛：余弦低于该值的记忆不返回（0=不过滤） */
  minCosine: number;
  /** 只有 rel >= 该阈值的命中才做唤起强化（保底/弱相关不刷 hits） */
  reinforceMinCos: number;
  /** embedding 相关性门槛（启用 embedding 时替代 minCosine；百炼 v3 噪声底~0.4，取 0.47） */
  embedMinCos: number;
  /** emb 命中强化阈值（emb 余弦分布整体偏高且噪声底~0.56，与 lexical 分开判；0.62 卡清晰相关带下沿） */
  reinforceMinEmbedCos: number;
  /** 会话滚动摘要：每累计该轮数触发一次（0=关闭） */
  digestEveryTurns: number;
  /** 滚动摘要输入的最近轮数上限 */
  digestWindowTurns: number;
  /** 语义巩固：只汇总 age >= 该天数 的情景记忆 */
  consolidateMinAgeDays: number;
  /** 语义巩固：会话内情景记忆达到该数量才触发 */
  consolidateMinNotes: number;
  /** 蒸馏攒批：累计该轮数才调一次蒸馏 LLM（1=每轮都蒸；>1 情绪更新粒度同步变粗） */
  distillEveryTurns: number;
  /** 蒸馏/脉络/巩固内部 prompt 用的人设精简版；空=用全量人格内核 */
  personaDigest: string;
  /** digest convo 单行截断字符数（user/assistant 各自上限） */
  digestTurnCharCap: number;
  /** 写入判重：新记忆与既有记忆向量余弦 ≥ 该值时强化旧记忆而非新增（0=关闭） */
  dedupeEmbedCos: number;
  /** 物理遗忘：快照时删除 hits=0 且低于遗忘阈值 且 age>=该天数 的记忆（0=不物理删除） */
  evictAfterDays: number;
  /** 时间渲染时区（当前时刻行 / convo 时间戳；非法值降级系统时区） */
  timeZone: string;
  /** 主动召回深挖门控（迭代C；嵌套对象按整对象覆盖，部分字段在插件层合并） */
  deepRecall: DeepRecallConfig;
}

/** 主动召回深挖门控配置（BrainConfig.deepRecall） */
export interface DeepRecallConfig {
  /** 总开关：false=整路关闭（成本纪律） */
  enabled: boolean;
  /** 深挖池是否跨会话（仍受 trackVisible/scopeVisible/absorbed 硬过滤） */
  crossSession: boolean;
  /** lane-1 真相关（rel≥路径强化阈）命中数低于该值才触发深挖 */
  weakRelHits: number;
  /** 深挖注入条数上限 */
  limit: number;
  /** 深挖候选深度（送排序的候选数上限） */
  candidates: number;
  /**
   * 深挖 lex 相关性地板（候选生成与注入同阈）：默认 0.07 严于 lane-1 的
   * minCosine=0.04——深挖行以「[深挖]」权威口径呈现，宁可漏召不可注噪声；
   * 0=不限（慎用）。eval 校准：fixture 噪声顶 ~0.066、真命中底 ~0.084。
   */
  minCos: number;
  /**
   * 深挖 emb 相关性地板：默认 0.55 居 embedMinCos=0.47 与
   * reinforceMinEmbedCos=0.62 之间（emb 噪声底~0.56），首版取值待线上观察再调；
   * 0=不限（慎用）。
   */
  minEmbedCos: number;
}

export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  topK: 6,
  alpha: 1.0,
  beta: 0.5,
  gamma: 0.2,
  reinforceStep: 1,
  strengthCap: 10,
  forgetThreshold: 0.2,
  emotionDecayPerDay: 0.35,
  candidatePool: 200,
  minCosine: 0.04,
  reinforceMinCos: 0.15,
  embedMinCos: 0.47,
  reinforceMinEmbedCos: 0.62,
  digestEveryTurns: 15,
  digestWindowTurns: 40,
  consolidateMinAgeDays: 1,
  consolidateMinNotes: 4,
  distillEveryTurns: 1,
  personaDigest: '',
  digestTurnCharCap: 300,
  dedupeEmbedCos: 0.9,
  evictAfterDays: 30,
  timeZone: DEFAULT_TIME_ZONE,
  deepRecall: {
    enabled: true,
    crossSession: true,
    weakRelHits: 2,
    limit: 3,
    candidates: 12,
    minCos: 0.07,
    minEmbedCos: 0.55,
  },
};

export const DAY_MS = 86_400_000;
