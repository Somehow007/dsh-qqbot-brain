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
  /** 情绪/记忆/画像/发言人注入开关 */
  injectPersona: boolean;
  injectEmotion: boolean;
  injectMemory: boolean;
  /** 注入「当前立场」section（kind=attitude 态度记忆命中） */
  injectAttitude: boolean;
  /** 注入「当前发言人」section（群聊下标识谁在说） */
  injectSpeaker: boolean;
  /** 蒸馏用的 LLM 配置 */
  llm: LlmConfig;
  retrieval: RetrievalConfig;
  /** 语义巩固（episodic→semantic 周期性提炼） */
  consolidation: ConsolidationConfig;
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
  retrieval: { topK: 6, alpha: 0.6, beta: 0.4, gamma: 0.2 },
  /** 语义巩固：周期性把老情景记忆提炼为语义记忆/重写画像 */
  consolidation: { enabled: true, tickMinutes: 60, cooldownHours: 24, minAgeDays: 1, minNotes: 4 },
  http: { enabled: true, port: 4099, host: '0.0.0.0', prefix: '/brain', token: '' },
  compactEvery: 200,
  debug: false,
};
