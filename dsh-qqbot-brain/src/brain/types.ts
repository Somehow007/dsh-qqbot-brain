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
}

/** PAD 情绪状态：v 效价[-1,1] a 唤醒[0,1] d 支配[-1,1] */
export interface EmotionState {
  v: number;
  a: number;
  d: number;
  /** 自然语言状态行，注入 prompt 用，如「慵懒满足」 */
  label: string;
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
  emotion?: { label: string; v: number; a: number; d: number };
  /** 旧字段：会话级画像全文（兼容旧 LLM 输出与调用方） */
  profile?: string;
  /** 结构化画像：群聊按发言人各一条，单聊/会话级省略 actor */
  profiles?: ProfileDraft[];
  /** 遗忘意图：数字=已有记忆编号（distill 附带列表下标），字符串=按内容子串匹配删除 */
  forget?: (number | string)[];
}

/** 一轮对话（蒸馏输入） */
export interface Turn {
  userText: string;
  assistantText: string;
  actor?: string;
  at: number;
}

/** 注入 prompt 的组装产物 */
export interface BrainContext {
  /** 人格内核 section 文本（可为空串表示未启用） */
  persona: string;
  /** 情绪态一行（可为空串） */
  emotion: string;
  /** 记忆摘录行（已带时间标注），可为空数组 */
  memoryLines: string[];
  /** 态度立场行（kind=attitude 命中条目），可为空数组 */
  attitudeLines: string[];
  /** 本次命中的记忆（用于统计/调试/可视化） */
  hits: MemoryNote[];
}

export interface BrainConfig {
  /** 检索 top-k */
  topK: number;
  /** score = alpha*cos + beta*R + gamma*imp_norm */
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
  /** 语义巩固：只汇总 age >= 该天数 的情景记忆 */
  consolidateMinAgeDays: number;
  /** 语义巩固：会话内情景记忆达到该数量才触发 */
  consolidateMinNotes: number;
  /** 物理遗忘：快照时删除 hits=0 且低于遗忘阈值 且 age>=该天数 的记忆（0=不物理删除） */
  evictAfterDays: number;
}

export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  topK: 6,
  alpha: 0.6,
  beta: 0.4,
  gamma: 0.2,
  reinforceStep: 1,
  strengthCap: 10,
  forgetThreshold: 0.2,
  emotionDecayPerDay: 0.35,
  candidatePool: 200,
  minCosine: 0.04,
  consolidateMinAgeDays: 1,
  consolidateMinNotes: 4,
  evictAfterDays: 30,
};

export const DAY_MS = 86_400_000;
