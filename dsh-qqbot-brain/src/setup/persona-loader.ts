import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 人格内核迁移：从 profile 的 cordis.patch.yml 提取官方插件的 groupPrompt/directPrompt，
 * 作为 brain:persona 的人格内核默认值，免去手工迁移。
 */

/** 仿官方 getProfileDir：跨过一个 node_modules 后向上找 cordis.patch.yml */
export function findProfileDir(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  let crossed = false;
  for (let i = 0; i < 32; i++) {
    if (basename(dir) === 'node_modules') crossed = true;
    if (crossed && existsSync(join(dir, 'cordis.patch.yml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 极简 YAML 提取：只解析 `key: "v"` / `key: v` / `key: |` 块标量，够读 prompt 即可 */
function readYamlScalar(text: string, key: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(new RegExp(`^(\\s*)${key}:\\s*(.*)$`));
    if (!m) continue;
    const indent = m[1]!.length;
    const val = (m[2] ?? '').trim();
    // 块标量 | 或 >（含 |-/|- 修饰）
    if (/^[|>][+-]?$/.test(val)) {
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const ln = lines[j]!;
        if (ln.trim() === '') { block.push(''); continue; }
        const ind = (ln.match(/^(\s*)/)?.[1] ?? '').length;
        if (ind <= indent) break;
        block.push(ln.slice(indent + 2));
      }
      const v = block.join('\n').trim();
      if (v) return v;
      continue;
    }
    if (!val || val.startsWith('#')) continue;
    return val.replace(/^(['"])(.*)\1\s*$/, '$2').replace(/\s+#.*$/, '').trim();
  }
  return '';
}

/**
 * 从 profile patch 读人设：优先 groupPrompt，其次 directPrompt。
 * 文件不存在或字段缺失返回 ''。
 */
export function loadPersonaFromPatch(profileDir: string | null): { text: string; source: string } {
  if (!profileDir) return { text: '', source: 'none' };
  const file = join(profileDir, 'cordis.patch.yml');
  if (!existsSync(file)) return { text: '', source: 'none' };
  try {
    const yml = readFileSync(file, 'utf8');
    const group = readYamlScalar(yml, 'groupPrompt');
    if (group) return { text: group, source: 'cordis.patch.yml:groupPrompt' };
    const direct = readYamlScalar(yml, 'directPrompt');
    if (direct) return { text: direct, source: 'cordis.patch.yml:directPrompt' };
  } catch { /* 读不到就放弃 */ }
  return { text: '', source: 'none' };
}
