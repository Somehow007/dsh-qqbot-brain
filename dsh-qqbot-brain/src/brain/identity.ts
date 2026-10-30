/**
 * 身份工具：发言人「昵称 (openid)」拆分与画像主键。
 *
 * 画像主键：
 * - `u:<openid>`    发言人身份（群聊 tag 带 openid，跨会话稳定）
 * - `sess:<sessionId>` 会话兜底（私聊无 tag；dsh 私聊 sessionId 本身由用户 openid 确定性派生）
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
