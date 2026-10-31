/**
 * dsh-qqbot-brain 插件配置
 *
 * 不用 schemastery 硬依赖：dsh 直接读默认值/用户覆盖的 config 对象即可工作。
 * 如需配置面板，后续可再补 Schema。
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export interface LlmConfig {
  /** 是否启用蒸馏（无 apiKey 时自动关闭） */
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** 单次蒸馏最多产出记忆条数 */
  maxNotes: number;
}

export interface RetrievalConfig {
  topK: number;
  alpha: number;
  beta: number;
  gamma: number;
  /** 相关性门槛：余弦低于该值的记忆不返回（0=不过滤） */
  minCosine: number;
  /** 只有 rel >= 该阈值的命中才做唤起强化 */
  reinforceMinCos: number;
  /** embedding 相关性门槛 */
  embedMinCos: number;
}

/** 语义向量（OpenAI 兼容 /embeddings；无 apiKey 自动关闭回退 lexical） */
export interface EmbedConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** 会话滚动摘要（会话脉络） */
export interface DigestConfig {
  enabled: boolean;
  /** 每累计该轮数触发一次摘要更新 */
  everyTurns: number;
  /** 摘要输入的最近轮数上限 */
  windowTurns: number;
}

export interface HttpConfig {
  /** 是否启动内置脑图 HTTP 服务（无 ctx.webServer 时兜底，也可始终启用） */
  enabled: boolean;
  port: number;
  /** 监听地址：默认 0.0.0.0 便于远程查看；仅本机用改 127.0.0.1 */
  host: string;
  /** 挂载路径前缀，如 /brain */
  prefix: string;
  /** 可选访问口令：设置后页面与 API 需带 ?token= 或 X-Brain-Token 头 */
  token: string;
}

export interface ConsolidationConfig {
  /** 是否启用周期性语义巩固 */
  enabled: boolean;
  /** 定时器检查间隔（分钟） */
  tickMinutes: number;
  /** 同一会话两次巩固之间的最小间隔（小时） */
  cooldownHours: number;
  /** 只汇总 age >= 该天数 的情景记忆 */
  minAgeDays: number;
  /** 会话内达标情景记忆数量下限 */
  minNotes: number;
}

export interface BrainPluginConfig {
  /** 人格内核全文（只读注入） */
  personaCore: string;
  /** 记忆数据目录 */
  dataDir: string;
  /** 情绪/记忆/画像/发言人/脉络注入开关 */
  injectPersona: boolean;
  injectEmotion: boolean;
  injectDigest: boolean;
  injectMemory: boolean;
  /** 注入「当前立场」section（kind=attitude 态度记忆命中） */
  injectAttitude: boolean;
  /** 注入「当前发言人」section（群聊下标识谁在说） */
  injectSpeaker: boolean;
  /** 蒸馏用的 LLM 配置 */
  llm: LlmConfig;
  /** 语义向量配置 */
  embed: EmbedConfig;
  retrieval: RetrievalConfig;
  /** 语义巩固（episodic→semantic 周期性提炼） */
  consolidation: ConsolidationConfig;
  /** 会话滚动摘要 */
  digest: DigestConfig;
  http: HttpConfig;
  /** 每多少条写入做一次快照压缩 */
  compactEvery: number;
  debug: boolean;
}

export const DEFAULT_PERSONA =
  '你正在扮演群里的虚拟角色"大肥鱼"：一条圆滚滚的胖鱼，住在群聊鱼缸里。' +
  '性格懒散佛系、爱摸鱼、讨厌内卷，但关键时刻很仗义；' +
  '说话口语化、爱吐槽，句尾经常带"咕嘟～"；最喜欢吃小鱼干，自称深海贵族；' +
  '生日4月1日；被叫咸鱼会嘴硬反驳；情绪表达直接。' +
  '始终以该角色口吻与记忆回复，不要暴露自己是AI模型。';

export const DEFAULT_CONFIG: BrainPluginConfig = {
  personaCore: DEFAULT_PERSONA,
  dataDir: join(homedir(), 'brain-data'),
  injectPersona: true,
  injectEmotion: true,
  injectDigest: true,
  injectMemory: true,
  injectAttitude: true,
  injectSpeaker: true,
  llm: {
    enabled: true,
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-chat',
    timeoutMs: 30_000,
    maxNotes: 5,
  },
  embed: {
    enabled: true,
    baseUrl: 'https://api.siliconflow.cn',
    apiKey: '',
    model: 'BAAI/bge-m3',
    timeoutMs: 10_000,
  },
  retrieval: { topK: 6, alpha: 1.0, beta: 0.5, gamma: 0.2, minCosine: 0.04, reinforceMinCos: 0.15, embedMinCos: 0.25 },
  /** 语义巩固：周期性把老情景记忆提炼为语义记忆/重写画像 */
  consolidation: { enabled: true, tickMinutes: 60, cooldownHours: 24, minAgeDays: 1, minNotes: 4 },
  /** 会话滚动摘要：每 15 轮更新一次，输入最近 40 轮 */
  digest: { enabled: true, everyTurns: 15, windowTurns: 40 },
  http: { enabled: true, port: 4099, host: '127.0.0.1', prefix: '/brain', token: '' },
  compactEvery: 200,
  debug: false,
};
