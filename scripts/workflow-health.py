#!/usr/bin/env python3
"""范式体检（原则层 §七）：一条命令输出范式自身的健康指标，越线标 ⚠。

用法：scripts/workflow-health.py [--brief] [--days 14]
路径按 Trellis 约定取默认值，可用参数覆盖（--changes/--acceptance/--deploy-log/--backlog/--rules）。
只读：不改任何文件。--brief 只输出越线项 + 一行摘要（供开工卡片注入，控制 token）。
"""
import argparse, datetime as dt, os, re, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument('--brief', action='store_true')
ap.add_argument('--days', type=int, default=14)
ap.add_argument('--changes', default='.trellis/CHANGES.md')
ap.add_argument('--changes-limit', type=int, default=100)
ap.add_argument('--acceptance', default='.trellis/acceptance.md')
ap.add_argument('--deploy-log', default='.trellis/deploy-log.tsv')
ap.add_argument('--backlog', default='AI-WORKFLOW.md')
ap.add_argument('--rules', nargs='*', default=['AGENTS.md', '.trellis/workflow.md'])
ap.add_argument('--rules-budget-kb', type=int, default=50)
a = ap.parse_args()
today = dt.date.today()
rows = []  # (ok, 指标, 值, 健康线)

def add(ok, name, val, line):
    rows.append((ok, name, val, line))

def read(p):
    try:
        return open(p, encoding='utf-8').read()
    except FileNotFoundError:
        return None

# 1. 记账类提交占比
try:
    subj = subprocess.run(['git', 'log', f'--since={a.days}.days', '--format=%s'], capture_output=True, text=True, check=True).stdout.splitlines()
    book = [s for s in subj if re.match(r'(chore|docs)(\(|:|!)', s)]
    r = len(book) / max(1, len(subj))
    add(r <= 0.4, f'记账类提交占比（近{a.days}天）', f'{len(book)}/{len(subj)} = {r:.0%}', '≤40%')
except Exception:
    pass

# 2. 变更失败率
log = read(a.deploy_log)
if log is None:
    add(True, '变更失败率（发布台账）', '尚无发布台账', '≤15%')
else:
    res = [l.split('\t')[3] for l in log.splitlines() if l.count('\t') >= 3]
    bad = [x for x in res if x != 'ok']
    if res:
        add(len(bad) / len(res) <= 0.15, '变更失败率（发布台账）', f'{len(bad)}/{len(res)}', '≤15%')
    else:
        add(True, '变更失败率（发布台账）', '尚无发布记录', '≤15%')

# 3. 待验收项陈龄：按「最近走查」列的 MM-DD 日期
acc = read(a.acceptance)
if acc:
    sec = acc.split('\n## ')[1] if '\n## ' in acc else acc
    open_items, stale = [], []
    for l in sec.splitlines():
        m = re.match(r'\|\s*(ACC-\d+)\s*\|', l)
        if not m:
            continue
        cols = [c.strip() for c in l.replace('\\|', '¦').strip('|').split('|')]
        if len(cols) < 8 or cols[6] in ('已通过', '打回'):
            continue
        open_items.append(m.group(1))
        d = re.match(r'(\d{1,2})-(\d{1,2})', cols[7])
        if not d:
            stale.append(f'{m.group(1)}(无走查日期)')
            continue
        walked = dt.date(today.year, int(d.group(1)), int(d.group(2)))
        if walked > today:
            walked = walked.replace(year=today.year - 1)
        age = (today - walked).days
        if age > 14:
            stale.append(f'{m.group(1)}({age}天)')
    add(not stale, '待验收项走查陈龄', f'开放 {len(open_items)} 项' + (f'，超 14 天未走查：{" ".join(stale)}' if stale else ''), '≤14天走查一次')

# 4. backlog：表格行 | ID | 条目 | 沉淀判据 | 复审日 | 状态 |
bl = read(a.backlog)
if bl and '待补纪律 backlog' in bl:
    part = bl.split('待补纪律 backlog', 1)[1]
    wip, overdue, total = [], [], 0
    for l in part.splitlines():
        cols = [c.strip() for c in l.strip().strip('|').split('|')]
        if not l.startswith('| B-') or len(cols) < 5:
            continue
        total += 1
        if cols[4].startswith('进行中'):
            wip.append(cols[0])
        if cols[4].startswith(('待办', '进行中')):
            try:
                if dt.date.fromisoformat(cols[3]) < today:
                    overdue.append(cols[0])
            except ValueError:
                overdue.append(f'{cols[0]}(无复审日)')
    add(len(wip) <= 2 and not overdue, 'backlog 在制/过期', f'共 {total}，在制 {len(wip)}' + (f'，过期 {" ".join(overdue)}' if overdue else ''), 'WIP≤2，过期 0')

# 5. 事件流长度
ch = read(a.changes)
if ch is not None:
    n = sum(1 for l in ch.splitlines() if re.match(r'- \d{4}-\d{2}-\d{2}', l) and '|' in l)
    add(n <= a.changes_limit, '事件流条目', f'{n}', f'≤{a.changes_limit}（超限跑 scripts/changes.py trim）')

# 6. 常驻规则体积
size = sum(os.path.getsize(p) for p in a.rules if os.path.exists(p))
if size:
    add(size <= a.rules_budget_kb * 1024, '常驻规则文件体积', f'{size / 1024:.0f}KB（{" + ".join(p for p in a.rules if os.path.exists(p))}）', f'≤{a.rules_budget_kb}KB')

bad = [r for r in rows if not r[0]]
if a.brief:
    for _, name, val, line in bad:
        print(f'⚠ {name}：{val}（健康线 {line}）')
    print(f'{len(rows) - len(bad)}/{len(rows)} 项健康' + ('' if not bad else '；越线项按 PRINCIPLES §七 处置'))
else:
    for ok, name, val, line in rows:
        print(f'{"✓" if ok else "⚠"} {name}：{val}  [健康线 {line}]')
sys.exit(0)
