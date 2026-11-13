#!/usr/bin/env python3
"""
回复风格走查：按「人设 × 是否联网检索」统计宿主会话里 bot 回复的活人感指标。

用法（服务器上，stdlib only）：
  zstd -dc ~/.dsh/sessions/<ws>/<sid>/session.v4.jsonl.zstd \\
    | python3 reply-style-audit.py --export /tmp/brain-export.json [--since 2026-11-13] [--samples 3]

人设归属：宿主转录不记录激活人设，用 brain export 里同期记忆的 personaId 时间线近似
（取回合时间点之后最近一条非巩固记忆的 personaId；无戳=legacy）。人设切换当天的边界回合可能错归。

指标（11-13 走查基线见 tasks/11-13-search-reply-liveliness）：
  avgLen  回复均长（字）——搜索回合目标 ≤ 非搜回合 1.5×
  link%   含 markdown 链接语法 [x](http..)——QQ 不渲染，目标 ≈0
  md%     含加粗/标题/编号列表等 markdown 版式
  hedge%  免责句（当参考/不敢编/没查到…）——目标 ≤15
  voice%  人设口吻标记命中（粗口径正则，按角色维护 VOICE 表）
"""
import argparse
import bisect
import datetime
import json
import re
import statistics
import sys
from collections import defaultdict

HEDGE = re.compile(r'当参考|别拿它当|不敢编|不瞎编|没有准信|仅供参考|以.{0,6}为准|查不准|没查到|没搜到|不一定准')
LINK = re.compile(r'\]\(https?://')
MD = re.compile(r'\*\*[^*]+\*\*|^#{1,4} |^\s*\d+[.、] |^\s*[-*] ', re.M)
VOICE = {
    'legacy': r'白饭|说白了|就这|懒得|嘴硬',
    'whale': r'哼|好嘛|行呀|麻了|我超|彳亍|老娘|尾巴|鳍|白饭|（）',
    'firefly': r'呀|啦|嘛|诶|嘿嘿|呜呜|萨姆|星核|匹诺康尼|快看|~',
    'ye-shunguang': r'呀|啦|哦|呢|哼哼|师姐|师弟|师妹|责无旁贷|剑|~',
}
WEB_TOOLS = ('web_search', 'web_fetch')


def char_of(pid: str) -> str:
    return 'whale' if pid.startswith('whale') else pid


def load_timeline(path: str):
    notes = json.load(open(path, encoding='utf-8'))['notes']
    pts = sorted((n['createdAt'], n.get('personaId') or 'legacy') for n in notes if not n.get('sourceIds'))
    times = [t for t, _ in pts]

    def pid_at(ms: int) -> str:
        i = min(bisect.bisect_left(times, ms), len(pts) - 1)
        return char_of(pts[i][1])
    return pid_at


def turns(stream):
    cur = None
    for line in stream:
        try:
            o = json.loads(line)
        except ValueError:
            continue
        t, d = o.get('type'), o.get('data') or {}
        if t == 'user/message':
            text = ''.join(c.get('text', '') for c in d.get('content', []) if isinstance(c, dict))
            if cur:
                yield cur
            cur = {'time': o.get('time', 0), 'user': text, 'web': False, 'reply': []}
        elif cur is None:
            continue
        elif t == 'tool/call' and d.get('name') in WEB_TOOLS:
            cur['web'] = True
        elif t == 'assistant/message':
            for c in (d.get('message') or {}).get('content', []):
                if isinstance(c, dict) and c.get('type') == 'text' and c.get('text', '').strip():
                    cur['reply'].append(c['text'])
    if cur:
        yield cur


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--export', required=True, help='brain /api/export 落盘的 JSON')
    ap.add_argument('--since', help='YYYY-MM-DD（本地时区），只统计此后的回合')
    ap.add_argument('--samples', type=int, default=0, help='每组打印最近 N 条搜索回合样本')
    a = ap.parse_args()
    pid_at = load_timeline(a.export)
    since = datetime.datetime.strptime(a.since, '%Y-%m-%d').timestamp() * 1000 if a.since else 0
    rows = defaultdict(list)
    for x in turns(sys.stdin):
        r = ' '.join(x['reply']).strip()
        if not r or x['time'] < since:
            continue
        rows[(pid_at(x['time']), x['web'])].append((x, r))

    print(f"{'persona':14}{'kind':6}{'N':>5}{'avgLen':>8}{'link%':>7}{'md%':>6}{'hedge%':>8}{'voice%':>8}")
    for (pid, web), items in sorted(rows.items()):
        rs = [r for _, r in items]
        pct = lambda rx: 100 * sum(bool(rx.search(r)) for r in rs) / len(rs)
        voice = re.compile(VOICE.get(pid, r'(?!)'))
        print(f"{pid:14}{'搜索' if web else '非搜':6}{len(rs):>5}{statistics.mean(len(r) for r in rs):>8.0f}"
              f"{pct(LINK):>7.0f}{pct(MD):>6.0f}{pct(HEDGE):>8.0f}{pct(voice):>8.0f}")
    if a.samples:
        for (pid, web), items in sorted(rows.items()):
            if not web:
                continue
            print(f"\n== {pid} 搜索样本")
            for x, r in items[-a.samples:]:
                ts = datetime.datetime.fromtimestamp(x['time'] / 1000).strftime('%m-%d %H:%M')
                print(f"[{ts}] U: {x['user'][-80:]}\n    A: {r[:240]}".replace('\n/', ' /'))


if __name__ == '__main__':
    main()
