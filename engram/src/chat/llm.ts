/**
 * chat 生成 LLM：OpenAI 兼容 /chat/completions。
 * 模式对齐 brain/distill.ts——可注入 fetch、AbortController+timeout、失败静默。
 * 与蒸馏 Distiller 独立：聊天可用不同档位/供应商（CHAT_LLM_*）。
 */

import type { ChatLlmConfig } from '../config.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** slice2 tool calling：assistant 回执与 tool 结果关联 */
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatResult {
  content: string;
  usage?: ChatUsage;
  toolCalls?: ToolCall[];
}

type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export class ChatLlm {
  private cfg: ChatLlmConfig;
  private fetchImpl: FetchLike;

  constructor(cfg: ChatLlmConfig, fetchImpl?: FetchLike) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl ?? (fetch as unknown as FetchLike);
  }

  get enabled(): boolean {
    return this.cfg.enabled && !!this.cfg.apiKey;
  }

  /**
   * 单次 chat completion。失败/超时/非 2xx 返回 undefined（调用方决定降级文案）。
   * tools 传入时返回 toolCalls（slice2 brain_search 用；loop 负责 ≤2 轮上限）。
   */
  async chat(
    messages: ChatMessage[],
    opts?: { tools?: ToolDef[]; maxTokens?: number; temperature?: number },
  ): Promise<ChatResult | undefined> {
    if (!this.enabled || messages.length === 0) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model: this.cfg.model,
        temperature: opts?.temperature ?? this.cfg.temperature,
        max_tokens: opts?.maxTokens ?? this.cfg.maxTokens,
        messages,
      };
      if (opts?.tools?.length) {
        body.tools = opts.tools;
        body.tool_choice = 'auto';
      }
      const res = await this.fetchImpl(
        `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.cfg.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) return undefined;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const msg = data.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls?.length ? msg.tool_calls : undefined;
      const content = (msg?.content ?? '').trim();
      if (!content && !toolCalls?.length) return undefined;
      const u = data.usage;
      return {
        content,
        toolCalls,
        usage: u
          ? {
              promptTokens: u.prompt_tokens,
              completionTokens: u.completion_tokens,
              totalTokens: u.total_tokens,
            }
          : undefined,
      };
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
