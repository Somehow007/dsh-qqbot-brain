/**
 * dsh-qqbot-brain — 类脑架构插件
 *
 * 与官方 @tencent-connect/dsh-qqbot 并存：
 *   system-prompt/assemble  → 注入[人格内核+情绪态+检索记忆]
 *   ctx.on('session/event') → 配对 user/assistant 轮次，turn/end 触发蒸馏
 *   ctx.webServer / node:http → /brain 脑图页 + JSON API
 */
import { resolve } from 'node:path';
import { Brain, BrainStore, Distiller } from './brain/index.ts';
import { DEFAULT_CONFIG, type BrainPluginConfig } from './config.ts';
import { PromptInjector } from './inject/prompt.ts';
import { SessionCapture } from './capture/events.ts';
import { BrainHttpServer } from './server/http.ts';
import { findProfileDir, loadPersonaFromPatch } from './setup/persona-loader.ts';
import { readPersonaFile, writePersonaFile, personaFilePath } from './setup/persona-file.ts';

export const name = 'qqbot-brain';
export const inject: string[] = [];

export type { BrainPluginConfig } from './config.ts';
export { DEFAULT_CONFIG, DEFAULT_PERSONA } from './config.ts';

function env(k: string): string | undefined {
  const v = process.env[k];
  return v && v.trim() ? v : undefined;
}

function mergeConfig(user: Partial<BrainPluginConfig> | undefined): BrainPluginConfig {
  const u = user ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...u,
    llm: { ...DEFAULT_CONFIG.llm, ...(u.llm ?? {}) },
    retrieval: { ...DEFAULT_CONFIG.retrieval, ...(u.retrieval ?? {}) },
    consolidation: { ...DEFAULT_CONFIG.consolidation, ...(u.consolidation ?? {}) },
    http: { ...DEFAULT_CONFIG.http, ...(u.http ?? {}) },
    // 环境变量兜底
    dataDir: env('BRAIN_DATA_DIR') ?? u.dataDir ?? DEFAULT_CONFIG.dataDir,
    personaCore: env('BRAIN_PERSONA') ?? u.personaCore ?? DEFAULT_CONFIG.personaCore,
  };
}

export async function apply(ctx: unknown, config?: Partial<BrainPluginConfig>): Promise<void> {
  const cfg = mergeConfig(config);
  cfg.llm.apiKey = env('BRAIN_LLM_API_KEY') ?? env('DEEPSEEK_API_KEY') ?? cfg.llm.apiKey;
  cfg.llm.baseUrl = env('BRAIN_LLM_BASE_URL') ?? cfg.llm.baseUrl;
  cfg.llm.model = env('BRAIN_LLM_MODEL') ?? cfg.llm.model;

  const logger = ((ctx as { logger?: { info(m: string): void } }).logger ?? console);
  const log = (m: string) => logger.info(`[qqbot-brain] ${m}`);

  // ── brain 装配 ──
  const store = new BrainStore(resolve(cfg.dataDir), cfg.compactEvery);
  const distiller = new Distiller(cfg.llm);

  // 人格内核优先级：persona.md > store > config/env > groupPrompt迁移 > 默认
  const dataDir = resolve(cfg.dataDir);
  let persona = readPersonaFile(dataDir);
  let personaFrom = 'persona.md';
  if (!persona) {
    persona = store.persona();
    personaFrom = 'store';
  }
  if (!persona) {
    const loaded = loadPersonaFromPatch(findProfileDir());
    if (loaded.text) { persona = loaded.text; personaFrom = loaded.source; }
    else { persona = cfg.personaCore; personaFrom = 'config'; }
  }
  const brain = new Brain({
    store,
    distiller,
    defaultPersona: persona,
    config: {
      consolidateMinAgeDays: cfg.consolidation.minAgeDays,
      consolidateMinNotes: cfg.consolidation.minNotes,
    },
  });
  if (persona && !store.persona()) store.setPersona(persona);
  // 初次落盘导出：让 persona.md 始终反映当前内核
  if (persona && !readPersonaFile(dataDir)) writePersonaFile(dataDir, persona);

  // ── 注入 + 捕获 ──
  const injector = new PromptInjector(brain, cfg, log);
  injector.register(ctx);
  const capture = new SessionCapture(brain, injector, log, cfg.debug);
  capture.register(ctx);

  // ── 语义巩固定时器：episodic → semantic 周期性提炼 ──
  if (cfg.consolidation.enabled && distiller.enabled) {
    const lastRun = new Map<string, number>();
    const cooldownMs = cfg.consolidation.cooldownHours * 3_600_000;
    const tick = setInterval(() => {
      for (const sid of brain.sessionsNeedingConsolidation()) {
        const last = lastRun.get(sid) ?? 0;
        if (Date.now() - last < cooldownMs) continue;
        lastRun.set(sid, Date.now());
        brain.consolidate(sid).then((n) => {
          if (n > 0) log(`语义巩固：${sid.slice(0, 8)}… 提炼 ${n} 条语义记忆`);
        }).catch(() => { /* 巩固失败静默，下一轮再试 */ });
      }
    }, cfg.consolidation.tickMinutes * 60_000);
    tick.unref();
  }

  // ── 脑图服务 ──
  const http = new BrainHttpServer(brain, cfg.http, log,
    (text) => writePersonaFile(dataDir, text));
  const where = http.start(ctx);

  log(`已启动：人格内核(${personaFrom}) ${cfg.injectPersona ? 'on' : 'off'} / `
    + `情绪 ${cfg.injectEmotion ? 'on' : 'off'} / 记忆 ${cfg.injectMemory ? 'on' : 'off'} / `
    + `蒸馏 ${distiller.enabled ? 'on' : 'off(无apiKey)'} / 脑图 ${where}`);
}
