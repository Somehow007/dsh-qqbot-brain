// 全局数据仓库：/api/state + ops + sessions + profiles + personas 定时拉取，
// 视图经 on() 订阅刷新。editing>0 时暂停拉取（管理表单编辑中不打断）。

import { api } from './api.js';

export const POLL_MS = 15000;

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 隐私模式等静默 */ }
}

export const store = {
  state: null,        // /api/state：notes/edges/stats/persona/emotion/digest/intents/config
  ops: [],            // /api/ops?limit=500
  sessions: [],       // /api/sessions
  profiles: [],       // /api/profiles
  personas: null,     // /api/personas：{activeId, personas[]}
  viewPersonaId: '',  // 查看人设（纯前端视角，不改服务端 activeId）
  editing: 0,         // 编辑中计数：>0 暂停自动刷新
  rev: 0,             // 每次成功刷新 +1，视图可据此判断数据是否变化
  error: '',          // 最近一次刷新错误（顶栏可提示）

  _listeners: new Set(),
  _timer: 0,

  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
  _emit(what) { for (const fn of this._listeners) { try { fn(what); } catch { /* 单个订阅者异常不拖垮 */ } } },

  /** 当前查看人设的条目；无 personas 或找不到时回落活动人设 */
  viewPersona() {
    const list = this.personas?.personas ?? [];
    const p = list.find((x) => x.id === this.viewPersonaId)
      ?? list.find((x) => x.id === this.personas?.activeId)
      ?? list[0];
    return p ?? null;
  },

  async refresh() {
    if (this.editing > 0) { this._emit('paused'); return; }
    if (document.hidden) return;
    try {
      const [state, ops, sessions, profiles, personas] = await Promise.all([
        api.get('/state'),
        api.get('/ops?limit=500'),
        api.get('/sessions'),
        api.get('/profiles'),
        api.get('/personas'),
      ]);
      this.state = state;
      this.ops = ops.ops ?? [];
      this.sessions = sessions.sessions ?? [];
      this.profiles = profiles.profiles ?? [];
      this.personas = personas;
      // 查看人设失效时回落活动人设
      const ids = (personas.personas ?? []).map((p) => p.id);
      if (!ids.includes(this.viewPersonaId)) {
        this.viewPersonaId = personas.activeId && ids.includes(personas.activeId)
          ? personas.activeId : (ids[0] ?? '');
      }
      this.error = '';
      this.rev++;
      this._emit('data');
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this._emit('error');
    }
  },

  /** 编辑开始/结束：管理表单 mount 时 begin，unmount/提交后 end */
  beginEdit() { this.editing++; this._emit('editing'); },
  endEdit() { this.editing = Math.max(0, this.editing - 1); this._emit('editing'); },

  start() {
    this.refresh();
    this._timer = setInterval(() => this.refresh(), POLL_MS);
  },
  stop() { clearInterval(this._timer); this._timer = 0; },
};

// localStorage 读写统一收口（theme.js 也用；导出给视图层做偏好读写）
export const prefs = { get: safeGet, set: safeSet };
