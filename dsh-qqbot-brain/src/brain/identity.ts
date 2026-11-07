/**
 * 身份工具：发言人「昵称 (openid)」拆分与画像主键。
 *
 * 画像主键：
 * - `u:<openid>`    发言人身份（群聊 tag 带 openid，跨会话稳定）
 * - `sess:<sessionId>` 会话兜底（私聊无 tag；dsh 私聊 sessionId 本身由用户 openid 确定性派生）。
 *   sess 条目的 name 字段兼作「私聊发言人绑定」：人工填发言人昵称后，
 *   Brain.boundSpeakerNick 把它当该会话的发言人（读路径按昵称点亮 u: 画像/态度/跨群召回）。
 */

/** actor 形如「昵称 (openid)」，昵称本身可能含括号，取末尾 (id) 组 */
const ACTOR_TAIL_RE = /^(.*?)\s*\(([0-9A-Fa-f-]{8,64})\)\s*$/;

export function splitActor(actor: string): { nick: string; openid?: string } {
  const m = actor.match(ACTOR_TAIL_RE);
  return { nick: (m?.[1] ?? actor).trim(), openid: m?.[2] };
}

export const userProfileKey = (openid: string): string => `u:${openid}`;
export const sessionProfileKey = (sessionId: string): string => `sess:${sessionId}`;

export const isUserKey = (key: string): boolean => key.startsWith('u:');
export const isSessionKey = (key: string): boolean => key.startsWith('sess:');

/** 旧数据迁移：无前缀的裸 sessionId 归一为 sess: 键 */
export function normalizeProfileKey(key: string): string {
  return isUserKey(key) || isSessionKey(key) ? key : sessionProfileKey(key);
}

/**
 * 记忆落库身份规整：蒸馏产出的 actor 常只写裸昵称——用「真实出现过的
 * 昵称→全tag」映射回填，让 note.actor 尽量落为「昵称 (openid)」。
 * 已是全 tag 或 tags 里查不到该昵称时返回原文（去首尾空白）。
 * tags 为可信来源：本轮 turns 的 actor / 巩固源记忆的 actor。
 */
export function resolveActorTag(actor: string | undefined, tags: (string | undefined)[]): string | undefined {
  if (!actor || splitActor(actor).openid) return actor;
  const want = actor.trim();
  for (const t of tags) {
    if (!t) continue;
    const id = splitActor(t);
    if (id.openid && id.nick === want) return t;
  }
  return want || undefined;
}
