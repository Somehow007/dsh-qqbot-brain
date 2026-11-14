// 全局数据仓库：/api/state + ops + sessions + profiles + personas 定时拉取，
// 视图经 on() 订阅刷新。editing>0 时暂停拉取（管理表单编辑中不打断）。

import { api } from './api.js';
import { buildMapVM } from './vm.js';

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
  mapVM: null,        // buildMapVM 产物；查看人设/数据变化时重建
  _sig: '',           // 上次 payload 指纹：内容未变则跳过 rebuildVM（皮肤 vm 引用不变 → 不整层重绘）

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
      // payload 指纹：五份响应 + 当日桶（跨天时 week/recalls 口径会变，至少每日重建一次）。
      // 两处服务端连续漂移要量化，否则指纹永不命中、15s 轮询照旧整层重绘：
      //  - emotion.v/a/d/updatedAt：PAD 衰减每请求都变 → 量化 .2f（=展示精度）并剔除 updatedAt
      //  - notes[].retention：逐秒衰减 → 量化到整数百分比（=UI 展示精度），亚百分比漂移不触发重建
      const emo = state?.emotion;
      const stateSig = state && {
        ...state,
        notes: (state.notes ?? []).map((n) => n && typeof n === 'object'
          ? { ...n, retention: Math.round((n.retention ?? 0) * 100) / 100 } : n),
        emotion: emo && typeof emo === 'object' ? {
          mood: emo.mood, label: emo.label, personaId: emo.personaId,
          v: Math.round((emo.v ?? 0) * 100) / 100,
          a: Math.round((emo.a ?? 0) * 100) / 100,
          d: Math.round((emo.d ?? 0) * 100) / 100,
        } : emo,
      };
      const sig = JSON.stringify([stateSig, ops, sessions, profiles, personas])
        + '|' + Math.floor(Date.now() / 86400e3);
      if (sig === this._sig) {
        this.rev++;
        this._emit('data');
        return;
      }
      this._sig = sig;
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
      this.rebuildVM();
      this.error = '';
      this.rev++;
      this._emit('data');
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this._emit('error');
    }
  },

  /** 用缓存的原始数据重建 MapVM（查看人设切换等不触发拉取的场景） */
  rebuildVM() {
    if (!this.state) { this.mapVM = null; return; }
    this.mapVM = buildMapVM(this.state, this.ops, this.personas, this.profiles, this.viewPersonaId, Date.now(), this.sessions);
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
