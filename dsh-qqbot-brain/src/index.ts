/**
 * dsh-qqbot-brain — 类脑架构插件
 *
 * 与官方 @tencent-connect/dsh-qqbot 并存：
 *   system-prompt/assemble  → 注入[人格内核+情绪态+检索记忆]
 *   ctx.on('session/event') → 配对 user/assistant 轮次，turn/end 触发蒸馏
 *   ctx.webServer / node:http → /brain 脑图页 + JSON API
 */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { Brain, BrainStore, Distiller, Embedder } from './brain/index.ts';
import { DEFAULT_CONFIG, type BrainPluginConfig } from './config.ts';
import { PromptInjector } from './inject/prompt.ts';
import { SessionCapture } from './capture/events.ts';
import { BrainHttpServer } from './server/http.ts';
import { findProfileDir, loadPersonaFromPatch } from './setup/persona-loader.ts';
import { readPersonaFile, writePersonaFile, personaFilePath } from './setup/persona-file.ts';
import { makeFileLogger } from './setup/file-log.ts';

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
    embed: { ...DEFAULT_CONFIG.embed, ...(u.embed ?? {}) },
    retrieval: { ...DEFAULT_CONFIG.retrieval, ...(u.retrieval ?? {}) },
    consolidation: { ...DEFAULT_CONFIG.consolidation, ...(u.consolidation ?? {}) },
    digest: { ...DEFAULT_CONFIG.digest, ...(u.digest ?? {}) },
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
  cfg.embed.apiKey = env('BRAIN_EMBED_API_KEY') ?? cfg.embed.apiKey;
  cfg.embed.baseUrl = env('BRAIN_EMBED_BASE_URL') ?? cfg.embed.baseUrl;
  cfg.embed.model = env('BRAIN_EMBED_MODEL') ?? cfg.embed.model;
  // 脑图 host/token 可走环境变量：密钥放 brain.env 而非 patch 文件，
  // 且 rsync 覆盖部署 patch 后公网直连配置不会丢。
  cfg.http.host = env('BRAIN_HTTP_HOST') ?? cfg.http.host;
  cfg.http.token = env('BRAIN_HTTP_TOKEN') ?? cfg.http.token;

  const logger = ((ctx as { logger?: { info(m: string): void } }).logger ?? console);
  const dataDir = resolve(cfg.dataDir);
  const fileLog = makeFileLogger(dataDir);
  const log = (m: string) => { fileLog(m); logger.info(`[qqbot-brain] ${m}`); };

  // ── brain 装配 ──
  const store = new BrainStore(dataDir, cfg.compactEvery);
  const distiller = new Distiller(cfg.llm);

  // 人格内核优先级：persona.md > store > config/env > groupPrompt迁移 > 默认
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
  const embedder = new Embedder(cfg.embed);
  const brain = new Brain({
    store,
    distiller,
    embedder,
    defaultPersona: persona,
    config: {
      // 此前漏接：retrieval.* 配了不生效，现在并入 BrainConfig
      ...cfg.retrieval,
      consolidateMinAgeDays: cfg.consolidation.minAgeDays,
      consolidateMinNotes: cfg.consolidation.minNotes,
      digestEveryTurns: cfg.digest.enabled ? cfg.digest.everyTurns : 0,
      digestWindowTurns: cfg.digest.windowTurns,
    },
    log,
  });
  if (persona && persona !== store.persona()) store.setPersona(persona);
  if (!store.listPersonas().some((p) => p.id === 'whale-gentle')) {
    store.createPersona('鲸鱼娘 · 温柔版', readFileSync(new URL('./setup/whale-gentle.md', import.meta.url), 'utf8'), 'whale-gentle');
  }
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

  // ── embedding 回填：启动后分批给旧记忆补向量 ──
  if (embedder.enabled) {
    const refill = setInterval(async () => {
      const n = await brain.backfillEmbeddings(5);
      if (n > 0) log(`语义向量回填：${n} 条`);
      if (n === 0) clearInterval(refill);
    }, 30_000);
    refill.unref();
  }

  // ── 脑图服务 ──
  const http = new BrainHttpServer(brain, cfg.http, log,
    (text) => writePersonaFile(dataDir, text));
  const where = http.start(ctx);

  log(`已启动：人格内核(${personaFrom}) ${cfg.injectPersona ? 'on' : 'off'} / `
    + `情绪 ${cfg.injectEmotion ? 'on' : 'off'} / 脉络 ${cfg.injectDigest ? 'on' : 'off'} / `
    + `立场 ${cfg.injectAttitude ? 'on' : 'off'} / 记忆 ${cfg.injectMemory ? 'on' : 'off'} / `
    + `蒸馏 ${distiller.enabled ? 'on' : 'off(无apiKey)'} / `
    + `向量 ${embedder.enabled ? 'on' : 'off(无apiKey)'} / 脑图 ${where} / 数据目录 ${dataDir}`);
}
