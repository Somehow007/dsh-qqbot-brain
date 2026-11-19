/**
 * brain_search tool（slice2，design.md §8）：模型自主决定调用，
 * 结果以〔记忆检索〕段注入下一轮 messages。topK≤5 截断。
 *
 * 内核走 Brain.search 纯召回原语——不 reinforce（tool 命中不加命中数，
 * 唤起语义归调用方；assemble 的 lane-1 命中才走强化路径）。
 */

import type { Brain, BrainSearchOptions } from '../brain.ts';
import type { ToolDef } from './llm.ts';

export const BRAIN_SEARCH_TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'brain_search',
    description: '搜索长期记忆：对方的偏好/约定/往事/画像/你的立场。需要回忆具体细节时调用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词或问题' },
      },
      required: ['query'],
    },
  },
};

const RESULT_CAP = 5;
const LINE_CAP = 120;

export interface ToolExecResult {
  /** 注入下一轮 messages 的 tool 消息 content */
  content: string;
  /** 供日志/成本统计 */
  hits: number;
}

/**
 * 执行一次 brain_search。brain 为 undefined/查询为空 → 返回提示文本不报错
 * （tool 失败不应中断对话）。
 */
export async function execBrainSearch(
  brain: Brain,
  sessionId: string,
  query: string,
  opts?: BrainSearchOptions,
): Promise<ToolExecResult> {
  const q = query.trim();
  if (!q) return { content: '〔记忆检索〕查询为空', hits: 0 };
  try {
    const scored = await brain.search(sessionId, q, { ...opts, limit: RESULT_CAP });
    if (!scored.length) return { content: '〔记忆检索〕没有相关记忆', hits: 0 };
    const lines = scored.slice(0, RESULT_CAP).map((s) => {
      const n = s.note;
      const content = n.content.length > LINE_CAP ? `${n.content.slice(0, LINE_CAP)}…` : n.content;
      const kindTag = n.kind === 'attitude' ? '立场' : n.kind === 'semantic' ? '语义' : '情景';
      return `- [${kindTag}] ${content}`;
    });
    return { content: `〔记忆检索〕\n${lines.join('\n')}`, hits: scored.length };
  } catch {
    return { content: '〔记忆检索〕检索失败', hits: 0 };
  }
}
