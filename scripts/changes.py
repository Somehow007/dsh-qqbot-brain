#!/usr/bin/env python3
"""事件流（CHANGES.md）记账工具：格式统一 + 超限自动滚动归档（移到 CHANGES-archive.md，不删）。

  scripts/changes.py add "<事件>" "<指针>"   # 追加 `- YYYY-MM-DD HH:MM | 事件 | → 指针`，随后自动 trim
  scripts/changes.py trim [--limit 100]       # 只做滚动归档
事件写结论不写过程（细节在任务档案）；指针必填——没有指针的事件说明没存档。
"""
import argparse, datetime as dt, os, re, sys

ap = argparse.ArgumentParser()
ap.add_argument('cmd', choices=['add', 'trim'])
ap.add_argument('event', nargs='?')
ap.add_argument('pointer', nargs='?')
ap.add_argument('--file', default='.trellis/CHANGES.md')
ap.add_argument('--limit', type=int, default=100)
a = ap.parse_args()

def is_entry(l):
    return re.match(r'- \d{4}-\d{2}-\d{2}', l) is not None and '|' in l

if a.cmd == 'add':
    if not a.event or not a.pointer:
        sys.exit('add 需要 <事件> 和 <指针> 两个参数（指针必填）')
    if '\n' in a.event:
        sys.exit('事件必须单行')
    stamp = dt.datetime.now().strftime('%Y-%m-%d %H:%M')
    with open(a.file, 'a', encoding='utf-8') as f:
        f.write(f'- {stamp} | {a.event} | → {a.pointer}\n')
    print(f'+ {stamp} | {a.event[:60]}')

lines = open(a.file, encoding='utf-8').read().split('\n')
idx = [i for i, l in enumerate(lines) if is_entry(l)]
over = len(idx) - a.limit
if over > 0:
    move = set(idx[:over])
    arch = os.path.join(os.path.dirname(a.file), 'CHANGES-archive.md')
    new = not os.path.exists(arch)
    with open(arch, 'a', encoding='utf-8') as f:
        if new:
            f.write('# CHANGES 归档（滚动移出的旧条目，按原顺序追加）\n\n')
        f.write('\n'.join(lines[i] for i in sorted(move)) + '\n')
    open(a.file, 'w', encoding='utf-8').write('\n'.join(l for i, l in enumerate(lines) if i not in move))
    print(f'trim：{over} 条旧条目移入 {arch}')
elif a.cmd == 'trim':
    print(f'未超限（{len(idx)}/{a.limit}）')
