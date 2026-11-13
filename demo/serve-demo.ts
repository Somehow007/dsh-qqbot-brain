/**
 * 演示数据独立预览：脱离 dsh 起脑图页，加载演示导出 JSON。
 * 用法：node --experimental-strip-types demo/serve-demo.ts [数据文件]
 *   默认加载 brain-export.demo.json（大集）；加 --small 或传
 *   brain-export.demo.small.json 可预览原 38 条校园小集。
 * → http://127.0.0.1:4099/brain
 * 数据目录为临时目录，每次启动都是新鲜的演示状态；Ctrl+C 退出。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { BrainStore } from '../dsh-qqbot-brain/src/brain/store.ts';
import { Brain } from '../dsh-qqbot-brain/src/brain/index.ts';
import { Distiller } from '../dsh-qqbot-brain/src/brain/distill.ts';
import { BrainHttpServer } from '../dsh-qqbot-brain/src/server/http.ts';

const demoDir = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
const dataFile = !arg || arg === '--small'
  ? join(demoDir, arg === '--small' ? 'brain-export.demo.small.json' : 'brain-export.demo.json')
  : resolve(arg);

const dir = mkdtempSync(join(tmpdir(), 'brain-demo-'));
const store = new BrainStore(dir);
const dump = JSON.parse(readFileSync(dataFile, 'utf8'));
const res = store.importData(dump, 'replace', Date.now());
console.log(`demo 数据已装载（${dataFile}）：${res.notes} 条记忆 / ${res.profiles} 份画像 / ${res.emotions} 份情绪`);

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
