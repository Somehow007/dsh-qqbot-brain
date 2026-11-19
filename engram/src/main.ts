/**
 * engram — 记忆可观测的陪伴 Agent（brain 内核第二 deployment）
 *
 * 装配对照插件 src/index.ts apply()：
 *   BrainStore/Distiller/Embedder → Brain → persona 自举 → timers → 服务
 *
 *   chat :4100  — Web UI + /api/* + /brain/* 反代
 *   brain:4101  — BrainHttpServer 独立端口（127.0.0.1，反代注入 token）
 *
 * 单用户单会话：sessionId 固定 'main'，发言人 = cfg.userNick。
 */

import { resolve } from 'node:path';
import {
  Brain,
  BrainStore,
  DEFAULT_BRAIN_CONFIG,
  Distiller,
  Embedder,
  BrainHttpServer,
  writePersonaFile,
  readPersonaFile,
  type HttpConfig,
} from './brain.ts';
import { loadConfig, type EngramConfig } from './config.ts';
import { ChatLlm } from './chat/llm.ts';
import { ChatHistory } from './chat/history.ts';
import { ChatLoop } from './chat/loop.ts';
import { ProactiveService } from './chat/proactive.ts';
import { EngramServer } from './web/server.ts';
import { ensurePersona, loadPersonaPack } from './persona.ts';
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TAG = '[engram]';

/** 文件日志：追加写 <dataDir>/engram.log，超 1MB 轮转（模式同插件 file-log.ts） */
function makeEngramLogger(dataDir: string): (msg: string) => void {
  const file = join(dataDir, 'engram.log');
  const MAX = 1024 * 1024;
  return (msg: string): void => {
    try {
      if (existsSync(file) && statSync(file).size > MAX) renameSync(file, `${file}.old`);
      appendFileSync(file, `${new Date().toISOString()} ${TAG} ${msg}\n`);
    } catch { /* 日志失败静默 */ }
  };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const dataDir = resolve(cfg.dataDir);
  const fileLog = makeEngramLogger(dataDir);
  const log = (m: string) => { fileLog(m); console.log(`${TAG} ${m}`); };

  if (!cfg.http.token) {
    log('警告：ENGRAM_HTTP_TOKEN 未设置——chat API 无鉴权，仅限本机/内网调试');
  }

  // ── brain 装配（镜像插件 apply()）──
  const store = new BrainStore(dataDir, cfg.compactEvery);
  const distiller = new Distiller(cfg.llm);
  const embedder = new Embedder(cfg.embed);

  // persona 文本先解析（Brain 构造要 defaultPersona；store.setPersona 后它不再是兜底）
  const pack = loadPersonaPack(cfg.seedDir);
  if (!pack) log(`persona 包未找到：${cfg.seedDir}（将无种子/人设，brain 以空人格内核运行）`);
  const prePersona = readPersonaFile(dataDir) || pack?.personaText || '';

  const brain = new Brain({
    store,
    distiller,
    embedder,
    defaultPersona: prePersona,
    config: {
      ...cfg.retrieval,
      consolidateMinAgeDays: cfg.consolidation.minAgeDays,
      consolidateMinNotes: cfg.consolidation.minNotes,
      digestEveryTurns: cfg.digest.enabled ? cfg.digest.everyTurns : 0,
      digestWindowTurns: cfg.digest.windowTurns,
      digestTurnCharCap: cfg.digest.turnCharCap,
      distillEveryTurns: cfg.llm.distillEveryTurns,
      personaDigest: cfg.llm.personaDigest,
      timeZone: cfg.timeZone,
      deepRecall: {
        ...DEFAULT_BRAIN_CONFIG.deepRecall,
        ...(cfg.retrieval.deepRecall ?? {}),
        enabled: cfg.retrieval.deepRecall?.enabled ?? true,
      },
    },
    log,
  });

  // ── persona 自举：种子幂等导入 + persona.md 同步（design §6）──
  const boot = ensurePersona(brain, dataDir, pack, log);
  if (boot.personaText && !readPersonaFile(dataDir)) {
    try { writePersonaFile(dataDir, boot.personaText); } catch { /* ensurePersona 已试过 */ }
  }

  // ── 自愈（与插件同序）──
  const migrated = brain.migrateTracks();
  if (migrated.length) log(`三轨迁移：人设归属角色 ← ${migrated.join(', ')}`);
  const absorbed = brain.absorbCovered();
  if (absorbed > 0) log(`追溯退池：${absorbed} 条已覆盖情景记忆退出检索池`);

  // ── chat 侧装配 ──
  const chatLlm = new ChatLlm(cfg.chat);
  const history = new ChatHistory(dataDir, cfg.history, log);
  // web 与 proactive 互相引用（loop→proactive→broadcast→web→loop），
  // 用闭包延迟绑定断开构造期循环：web 赋值早于任何 proactive 触发路径。
  let web: EngramServer | undefined;
  const proactive = new ProactiveService(brain, chatLlm, history, cfg, log,
    (entry) => web?.broadcast(entry));
  const loop = new ChatLoop(brain, chatLlm, history, cfg, log, proactive);
  web = new EngramServer(loop, history, cfg, log);

  // ── 定时器三件套（镜像插件 index.ts:138-172）──
  // 语义巩固定时器
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

  // embedding 回填：低频清扫，给缺向量的记忆补 embedding
  if (embedder.enabled) {
    const refill = setInterval(async () => {
      const n = await brain.backfillEmbeddings(5);
      if (n > 0) log(`语义向量回填：${n} 条`);
    }, 30_000);
    refill.unref();
  }

  // standing intents 定时评估 + proactive deferred 重试（迭代D/F）
  const intentTick = setInterval(() => {
    const fired = brain.tickIntents();
    if (fired.length) log(`intent tick：${fired.length} 条到期触发`);
    proactive.onTick(fired);
  }, 60_000);
  intentTick.unref();

  // ── 服务 ──
  const where = web.start();

  const brainHttpCfg: HttpConfig = {
    enabled: true,
    port: cfg.http.brainPort,
    host: '127.0.0.1',
    prefix: '/brain',
    token: cfg.http.brainToken,
  };
  const brainHttp = new BrainHttpServer(brain, brainHttpCfg, log,
    (text) => { try { writePersonaFile(dataDir, text); } catch (e) { log(`persona.md 写入失败：${String(e)}`); } });
  const brainWhere = brainHttp.start(undefined);

  log(`已启动：人格内核(${boot.personaFrom}) / `
    + `蒸馏 ${distiller.enabled ? 'on' : 'off(无apiKey)'} / `
    + `向量 ${embedder.enabled ? 'on' : 'off(无apiKey)'} / `
    + `chat ${chatLlm.enabled ? 'on' : 'off(无apiKey)'} / `
    + `主动开口 ${proactive.enabled ? 'on' : 'off'} / `
    + `工具 brain_search ${cfg.tools.brainSearch ? 'on' : 'off'} / `
    + `chat ${where} / brain ${brainWhere} / 数据目录 ${dataDir}`);

  // ── 优雅停机 ──
  const shutdown = (sig: string) => {
    log(`${sig} 收到， flushing…`);
    try { brain.flush(); } catch { /* ignore */ }
    web.stop();
    brainHttp.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(`${TAG} 启动失败：`, e);
  process.exit(1);
});
