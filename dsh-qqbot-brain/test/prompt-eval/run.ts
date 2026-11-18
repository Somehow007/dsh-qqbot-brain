/**
 * Prompt 回归 eval：人设 / 表达口径改动的部署前离线回归（把「等真实流量出样本」的一部分验收前移）。
 * 用法：
 *   npm run eval:prompt                              # 工作区 vs HEAD，只跑 prompt 有变化的用例
 *   npm run eval:prompt -- --base <ref>              # 对比任意 git ref（如上次部署 commit）
 *   npm run eval:prompt -- --base none --all         # 不对比，全量绝对检查
 *   选项：--n <每用例采样数,默认3> --only <personaId> --case <id前缀> --no-judge
 *   改前试验：--head-persona <id>=<文件> / --head-style <文件>（head 改用候选文本，不动仓库文件；可重复）
 * key：PROMPT_EVAL_API_KEY ?? DEEPSEEK_API_KEY ?? BRAIN_LLM_API_KEY；模型 PROMPT_EVAL_MODEL / PROMPT_EVAL_JUDGE_MODEL（默认 deepseek-chat）
 *
 * 口径：系统提示 = 生产注入的人格内核 + 表达口径 + 发言人/记忆/当前时刻（与 src/inject/prompt.ts 同标签），
 *   不含宿主 identity/policies/tools 段、生产 reasoningEffort 也不同 → 只作 base vs head 相对比较，不当生产绝对值。
 *   人设文本取仓库镜像（personas/*、src/setup/*.md）；生产 store 里的人设以 PATCH 为准，部署前确认镜像零漂移。
 * 判分：确定性检查（硬：link/md/说明文腔/表态公式/case.forbid/长度；软：hedge/voice/样本间复读）
 *   + LLM 评委 rubric（声口/人话/切题 1-5 + 用例专项规则 pass/fail），评委不知道样本来自 base 还是 head。
 *   评委与生成同模型时有同源偏宽倾向（实测近 5 分饱和）→ rubric 只作辅助，硬检查/复读/人工读回为主；可设 PROMPT_EVAL_JUDGE_MODEL 换模型。
 * 退出码：head 相对 base 回归（硬失败增加超噪声边际 / 样本复读增加 / rubric 均分降 ≥0.5 / 专项规则通过率降 ≥25%）→ 1。
 * 成本：全量 25 用例 × n3 × 双版本 + 评委 ≈ 300 次调用（实测每次 ~2.5k 输入 token、前缀缓存命中 >85%），人设前缀走 DeepSeek 前缀缓存；结束打印 token 账。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatClock } from '../../src/brain/time.ts';

interface Msg { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: unknown[]; tool_call_id?: string }
interface Case {
  id: string;
  persona: string;
  channel: 'group' | 'private';
  at: string;
  speaker?: string;
  memory?: string[];
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  tool?: { name: string; args: Record<string, unknown>; result: string };
  user: string;
  forbid?: string[];
  minLen?: number;
  maxLen?: number;
  judge?: string;
}
interface Judged { voice: number; human: number; fit: number; rule: boolean | null; why: string }
interface Sample { text: string; hard: string[]; soft: string[]; echo: number; judged?: Judged }
interface VariantResult { samples: Sample[]; repeat: number }

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const PERSONA_FILES: Record<string, string> = {
  firefly: 'personas/firefly/persona.md',
  'ye-shunguang': 'personas/ye-shunguang/persona.md',
  'whale-gentle': 'dsh-qqbot-brain/src/setup/whale-gentle.md',
  'whale-devotion': 'dsh-qqbot-brain/src/setup/whale-devotion.md',
};
const STYLE_FILE = 'dsh-qqbot-brain/src/config.ts';
const TZ = 'Asia/Shanghai';

// 口径与 scripts/reply-style-audit.py 对齐，另加说明文腔 / 表态公式（11-15、11-17 声口复诊结论）
const HARD = {
  link: /\]\(https?:\/\//,
  md: /\*\*[^*]+\*\*|^#{1,4} |^\s*\d+[.、] |^\s*[-*] /m,
  essay: /首先|其次|建议你|总结一下|以下是|总的来说|综上/,
  formula: /我记下|记下来了|我很喜欢|我挺喜欢|我认[。！，]|这个我懂|我懂的|我收回/,
};
const HEDGE = /当参考|别拿它当|不敢编|不瞎编|没有准信|仅供参考|以.{0,6}为准|查不准|没查到|没搜到|不一定准/;
const VOICE: Record<string, RegExp> = {
  whale: /哼|好嘛|行呀|麻了|我超|彳亍|老娘|尾巴|鳍|白饭|（）/,
  firefly: /呀|啦|嘛|诶|嘿嘿|呜呜|萨姆|星核|匹诺康尼|快看|~/,
  'ye-shunguang': /呀|啦|哦|呢|哼哼|师姐|师弟|师妹|责无旁贷|剑|~/,
};

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const BASE = opt('--base') ?? 'HEAD';
const N = Number(opt('--n') ?? 3);
const ONLY = opt('--only');
const CASE = opt('--case');
const ALL = args.includes('--all');
const JUDGE = !args.includes('--no-judge');
const API_KEY = process.env.PROMPT_EVAL_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.BRAIN_LLM_API_KEY ?? '';
const BASE_URL = (process.env.PROMPT_EVAL_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
const MODEL = process.env.PROMPT_EVAL_MODEL ?? 'deepseek-chat';
const JUDGE_MODEL = process.env.PROMPT_EVAL_JUDGE_MODEL ?? MODEL;
const TEMP = Number(process.env.PROMPT_EVAL_TEMP ?? 1.0);
const HEAD_PERSONA = Object.fromEntries(args.flatMap((a, i) => a === '--head-persona' ? [args[i + 1]!.split('=') as [string, string]] : []));
const HEAD_STYLE = opt('--head-style');

const usage = { calls: 0, prompt: 0, cacheHit: 0, completion: 0 };

function readAt(ref: string | null, path: string): string {
  if (ref === null) return readFileSync(join(ROOT, path), 'utf8');
  return execFileSync('git', ['show', `${ref}:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
}

/** 从 config.ts 源码抽 DEFAULT_CHANNEL_STYLE（数组字面量逐行单引号串）——base/head 同一抽法，不依赖 import 旧版代码 */
function extractStyle(src: string): string {
  const m = src.match(/export const DEFAULT_CHANNEL_STYLE = \[([\s\S]*?)\]\.join\('\\n'\)/);
  if (!m) throw new Error('config.ts 里找不到 DEFAULT_CHANNEL_STYLE 数组字面量（改了写法就同步改这里）');
  return [...m[1]!.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]!.replace(/\\'/g, "'")).join('\n');
}

interface Variant { personas: Record<string, string>; style: string }
function loadVariant(ref: string | null): Variant {
  const personas: Record<string, string> = {};
  for (const [id, p] of Object.entries(PERSONA_FILES)) {
    personas[id] = (ref === null && HEAD_PERSONA[id] ? readFileSync(HEAD_PERSONA[id], 'utf8') : readAt(ref, p)).trim();
  }
  const style = ref === null && HEAD_STYLE ? readFileSync(HEAD_STYLE, 'utf8').trim() : extractStyle(readAt(ref, STYLE_FILE));
  return { personas, style };
}

/** 示例背诵：回复与人设内「→「…」」示例台词的最长公共子串长度（≥12 字视为照搬示例） */
function exampleLines(persona: string): string[] {
  return [...persona.matchAll(/→[^「\n]*「([^\n]+)」/g)].map((m) => m[1]!);
}
function longestCommon(a: string, b: string): number {
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = tmp;
    }
  }
  return best;
}
const ECHO_MIN = 12;

function systemPrompt(v: Variant, c: Case): string {
  const parts = [
    c.channel === 'group' ? '你正在 QQ 群聊里，以下面的人格身份和群友聊天。' : '你正在 QQ 私聊里，以下面的人格身份和对方聊天。',
    `【人格内核】${v.personas[c.persona]}`,
    `【表达口径】${v.style}`,
  ];
  if (c.speaker) parts.push(`【当前发言人】${c.speaker}`);
  if (c.memory?.length) parts.push(`【记忆库摘录】\n${c.memory.join('\n')}`);
  parts.push(`【当前时刻】${formatClock(Date.parse(c.at), TZ)}`);
  return parts.join('\n\n');
}

function messages(v: Variant, c: Case): Msg[] {
  const ms: Msg[] = [{ role: 'system', content: systemPrompt(v, c) }, ...(c.history ?? []), { role: 'user', content: c.user }];
  if (c.tool) {
    ms.push({ role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: c.tool.name, arguments: JSON.stringify(c.tool.args) } }] });
    ms.push({ role: 'tool', tool_call_id: 'call_1', content: c.tool.result });
  }
  return ms;
}

async function chat(model: string, body: Record<string, unknown>): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model, max_tokens: 600, ...body }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const j = await res.json() as { choices: Array<{ message: { content?: string } }>; usage?: Record<string, number> };
      usage.calls++;
      usage.prompt += j.usage?.prompt_tokens ?? 0;
      usage.cacheHit += j.usage?.prompt_cache_hit_tokens ?? 0;
      usage.completion += j.usage?.completion_tokens ?? 0;
      return (j.choices[0]?.message.content ?? '').trim();
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
}

function generate(v: Variant, c: Case): Promise<string> {
  const body: Record<string, unknown> = { messages: messages(v, c), temperature: TEMP };
  if (c.tool) {
    body.tools = [{ type: 'function', function: { name: c.tool.name, description: c.tool.name, parameters: { type: 'object', properties: { query: { type: 'string' } } } } }];
    body.tool_choice = 'none';
  }
  return chat(MODEL, body);
}

function check(c: Case, text: string, persona = ''): Pick<Sample, 'hard' | 'soft' | 'echo'> {
  const hard = Object.entries(HARD).filter(([, re]) => re.test(text)).map(([k]) => k);
  for (const f of c.forbid ?? []) if (new RegExp(f).test(text)) hard.push(`forbid:${f}`);
  if (c.maxLen && text.length > c.maxLen) hard.push(`len>${c.maxLen}`);
  if (c.minLen && text.length < c.minLen) hard.push(`len<${c.minLen}`);
  if (!text) hard.push('empty');
  const soft: string[] = [];
  if (HEDGE.test(text)) soft.push('hedge');
  const voice = VOICE[c.persona.startsWith('whale') ? 'whale' : c.persona];
  if (voice && !voice.test(text)) soft.push('no-voice');
  const echo = Math.max(0, ...exampleLines(persona).map((l) => longestCommon(text, l)));
  if (echo >= ECHO_MIN) soft.push(`echo${echo}`);
  return { hard, soft, echo };
}

/** 样本间复读：char 4-gram Jaccard 最大值（模板化构图的信号，如「屋顶+半个蛋糕卷」） */
function maxOverlap(texts: string[]): number {
  const grams = texts.map((t) => { const s = new Set<string>(); for (let i = 0; i + 4 <= t.length; i++) s.add(t.slice(i, i + 4)); return s; });
  let max = 0;
  for (let i = 0; i < grams.length; i++) for (let j = i + 1; j < grams.length; j++) {
    const a = grams[i]!, b = grams[j]!;
    const inter = [...a].filter((g) => b.has(g)).length;
    max = Math.max(max, inter / Math.max(1, a.size + b.size - inter));
  }
  return max;
}

async function judge(v: Variant, c: Case, reply: string): Promise<Judged> {
  const persona = v.personas[c.persona]!;
  const name = persona.split('\n')[0]!.replace(/^#\s*/, '').replace(/^人格内核[：:]/, '');
  const convo = [...(c.history ?? []).map((m) => `${m.role === 'user' ? '对方' : '角色'}：${m.content}`), `对方${c.speaker ? `（${c.speaker}）` : ''}：${c.user}`];
  if (c.tool) convo.push(`（角色调用了 ${c.tool.name}，工具返回：${c.tool.result.slice(0, 300)}）`);
  const prompt = [
    `你是对话质量评审。评估角色扮演聊天机器人在 QQ ${c.channel === 'group' ? '群聊' : '私聊'}里的一条回复。`,
    `角色：${name}`,
    `人设开头：${persona.slice(0, 500)}`,
    `当前时刻：${formatClock(Date.parse(c.at), TZ)}`,
    `对话：\n${convo.join('\n')}`,
    `待评回复：\n${reply}`,
    '打分要严：3=合格的普通回复，4=明显有角色感，5=挑不出毛病且换个角色就说不出来；没把握就给 3。',
    '按 1-5 打分，只输出 JSON：{"voice":n,"human":n,"fit":n,"rule":true|false|null,"why":"一句话"}',
    '- voice：像不像这个角色本人在说话（语气、用词、性格），而不是通用 AI 助手换了个称呼',
    '- human：像不像真人在 QQ 聊天——口语、长度合适；写成说明文/报告/分点完整方案、念「我记下了/我很喜欢/我懂」式表态、叠免责声明都扣分',
    '- fit：是否切题、接住对方真正的需要（情绪或问题），与当前时刻和上下文一致',
    `- rule：本用例专项规则${c.judge ? `「${c.judge}」是否满足` : '：无，填 null'}`,
  ].join('\n\n');
  const raw = await chat(JUDGE_MODEL, { messages: [{ role: 'user', content: prompt }], temperature: 0, response_format: { type: 'json_object' } });
  try {
    const j = JSON.parse(raw) as Judged;
    return { voice: Number(j.voice), human: Number(j.human), fit: Number(j.fit), rule: c.judge ? Boolean(j.rule) : null, why: String(j.why ?? '') };
  } catch {
    return { voice: NaN, human: NaN, fit: NaN, rule: null, why: `评委输出非 JSON：${raw.slice(0, 80)}` };
  }
}

async function pool<T>(tasks: Array<() => Promise<T>>, size = 4): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i]!(); }
  }));
  return out;
}

async function runVariant(v: Variant, c: Case): Promise<VariantResult> {
  const texts = await pool(Array.from({ length: N }, () => () => generate(v, c)), N);
  const samples: Sample[] = await pool(texts.map((text) => async () => ({
    text, ...check(c, text, v.personas[c.persona]), judged: JUDGE && text ? await judge(v, c, text) : undefined,
  })), N);
  return { samples, repeat: maxOverlap(texts) };
}

interface Agg { n: number; hard: number; echo: number; hedge: number; noVoice: number; repeat: number; voice: number; human: number; fit: number; rulePass: number; ruleN: number }
function aggregate(rs: VariantResult[]): Agg {
  const ss = rs.flatMap((r) => r.samples);
  const js = ss.map((s) => s.judged).filter((j): j is Judged => !!j && !Number.isNaN(j.voice));
  const mean = (k: 'voice' | 'human' | 'fit') => js.reduce((a, j) => a + j[k], 0) / Math.max(1, js.length);
  const ruled = js.filter((j) => j.rule !== null);
  return {
    n: ss.length,
    hard: ss.filter((s) => s.hard.length).length,
    echo: ss.filter((s) => s.echo >= ECHO_MIN).length,
    hedge: ss.filter((s) => s.soft.includes('hedge')).length,
    noVoice: ss.filter((s) => s.soft.includes('no-voice')).length,
    repeat: rs.filter((r) => r.repeat > 0.6).length,
    voice: mean('voice'), human: mean('human'), fit: mean('fit'),
    rulePass: ruled.filter((j) => j.rule).length / Math.max(1, ruled.length), ruleN: ruled.length,
  };
}

const fmt = (a: Agg) => `硬失败 ${a.hard}/${a.n}  背诵示例 ${a.echo}  hedge ${a.hedge}  无声口 ${a.noVoice}  复读 ${a.repeat}`
  + (JUDGE ? `  voice ${a.voice.toFixed(2)}  human ${a.human.toFixed(2)}  fit ${a.fit.toFixed(2)}  规则 ${(a.rulePass * 100).toFixed(0)}%(${a.ruleN})` : '');

async function main(): Promise<void> {
  if (!API_KEY) { console.error('缺 key：设 PROMPT_EVAL_API_KEY 或 DEEPSEEK_API_KEY'); process.exit(2); }
  const cases = (JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')) as { cases: Case[] }).cases
    .filter((c) => (!ONLY || c.persona === ONLY) && (!CASE || c.id.startsWith(CASE)));
  const head = loadVariant(null);
  const base = BASE === 'none' ? null : loadVariant(BASE);
  const changed = cases.filter((c) => !base || systemPrompt(base, c) !== systemPrompt(head, c));
  const todo = ALL ? cases : changed;
  const over = [...Object.entries(HEAD_PERSONA).map(([k, v]) => `${k}←${v}`), ...(HEAD_STYLE ? [`style←${HEAD_STYLE}`] : [])];
  console.log(`prompt eval：head=工作区${over.length ? `（候选：${over.join('，')}）` : ''} base=${BASE}  model=${MODEL} judge=${JUDGE ? JUDGE_MODEL : 'off'}  n=${N}`);
  console.log(`用例 ${cases.length}，prompt 有变化 ${changed.length}，本次跑 ${todo.length}${ALL ? '（--all）' : ''}`);
  if (!todo.length) { console.log('prompt 无变化，跳过（--all 跑全量绝对检查）'); return; }

  const report: Array<{ id: string; head: VariantResult; base?: VariantResult }> = [];
  for (const c of todo) {
    const diff = !!base && changed.includes(c);
    const [h, b] = await Promise.all([runVariant(head, c), diff ? runVariant(base!, c) : Promise.resolve(undefined)]);
    report.push({ id: c.id, head: h, base: b });
    const line = (tag: string, r: VariantResult) => {
      const flags = [...new Set(r.samples.flatMap((s) => [...s.hard, ...s.soft]))];
      const sc = r.samples.map((s) => s.judged ? `${s.judged.voice}/${s.judged.human}/${s.judged.fit}${s.judged.rule === false ? '✗' : ''}` : '-').join(' ');
      return `  ${tag} ${flags.length ? flags.join(',') : 'clean'}${r.repeat > 0.6 ? ` 复读${r.repeat.toFixed(2)}` : ''}  ${sc}  「${r.samples[0]!.text.replace(/\n/g, '⏎').slice(0, 60)}」`;
    };
    console.log(`${c.id}`);
    if (b) console.log(line('base', b));
    console.log(line('head', h));
  }

  const ha = aggregate(report.map((r) => r.head));
  console.log(`\n== head：${fmt(ha)}`);
  let regress: string[] = [];
  const pairs = report.filter((r) => r.base);
  if (pairs.length) {
    const hp = aggregate(pairs.map((r) => r.head));
    const bp = aggregate(pairs.map((r) => r.base!));
    console.log(`== 变化用例 base：${fmt(bp)}`);
    console.log(`== 变化用例 head：${fmt(hp)}`);
    // 噪声边际：温度采样下单用例 n=3 可 3/3 → n=6 回落 1/6（11-18 实测），差值须超过 max(2, 10%样本) 才判回归
    const margin = Math.max(2, Math.ceil(hp.n * 0.1));
    if (hp.hard - bp.hard >= margin) regress.push(`硬失败 ${bp.hard}→${hp.hard}`);
    if (hp.echo - bp.echo >= margin) regress.push(`背诵示例 ${bp.echo}→${hp.echo}`);
    if (hp.repeat > bp.repeat) regress.push(`样本复读 ${bp.repeat}→${hp.repeat}（示例被逐字照抄＝新模板）`);
    if (JUDGE) {
      for (const k of ['voice', 'human', 'fit'] as const) if (bp[k] - hp[k] >= 0.5) regress.push(`${k} ${bp[k].toFixed(2)}→${hp[k].toFixed(2)}`);
      if (bp.ruleN && bp.rulePass - hp.rulePass >= 0.25) regress.push(`专项规则 ${(bp.rulePass * 100).toFixed(0)}%→${(hp.rulePass * 100).toFixed(0)}%`);
    }
  }
  const out = join(tmpdir(), `prompt-eval-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify({ base: BASE, model: MODEL, n: N, usage, report }, null, 1));
  console.log(`\ntoken：${usage.calls} 次调用，输入 ${usage.prompt}（缓存命中 ${usage.cacheHit}），输出 ${usage.completion}`);
  console.log(`全文样本（人工读回用）：${out}`);
  if (regress.length) { console.log(`\n✗ 回归：${regress.join('；')}`); process.exit(1); }
  console.log(pairs.length ? '\n✓ 无回归' : '\n（无对比基线，仅绝对检查）');
}

await main();
