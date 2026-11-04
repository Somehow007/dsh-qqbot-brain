/**
 * 演示数据独立预览：脱离 dsh 起脑图页，加载 brain-export.demo.json。
 * 用法：node --experimental-strip-types demo/serve-demo.ts  → http://127.0.0.1:4099/brain
 * 数据目录为临时目录，每次启动都是新鲜的演示状态；Ctrl+C 退出。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { BrainStore } from '../dsh-qqbot-brain/src/brain/store.ts';
import { Brain } from '../dsh-qqbot-brain/src/brain/index.ts';
import { Distiller } from '../dsh-qqbot-brain/src/brain/distill.ts';
import { BrainHttpServer } from '../dsh-qqbot-brain/src/server/http.ts';

const dir = mkdtempSync(join(tmpdir(), 'brain-demo-'));
const store = new BrainStore(dir);
const dump = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'brain-export.demo.json'), 'utf8'));
const res = store.importData(dump, 'replace', Date.now());
console.log(`demo 数据已装载：${res.notes} 条记忆 / ${res.profiles} 份画像 / ${res.emotions} 份情绪`);

const brain = new Brain({
  store,
  distiller: new Distiller(
    { enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 5 },
    async () => ({ ok: false, status: 0, json: async () => ({}) }),
  ),
  defaultPersona: '',
  log: (m) => console.log(m),
});

const server = new BrainHttpServer(brain, { enabled: true, host: '127.0.0.1', port: 4099, prefix: '/brain', token: '' }, console.log);
console.log(`预览地址 → ${server.start({ get: () => undefined })}（数据目录 ${dir}，临时）`);
