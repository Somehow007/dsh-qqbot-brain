#!/usr/bin/env python3
"""生成虚构演示数据集 → BrainExport 格式（可直接 import?mode=replace 或 serve-demo 预览）。

两套数据集：

- **大集（默认）** → `brain-export.demo.json`：~370 条记忆，供 /brain UI 重构开发
  （whale-gentle/whale-devotion/ye-shunguang/firefly 四人设条目、characterId 齐全）。
  覆盖：世界轨/自我轨三轨分布、巩固链（absorbedAt + sourceIds → derived 边）、
  各人设情绪词表、fading 保持率光谱、合成 embedding（semantic 边）。
  时间轴相对生成时刻（最近 ~30 天），保证衰减/遗忘展示始终鲜活。
- **小集（--small）** → `brain-export.demo.small.json`：原 38 条校园小集
  （参赛展示/快速 sanity 用），内容与历史版本一致。

运行：
  python3 generate_demo_export.py            # 大集
  python3 generate_demo_export.py --small    # 小集
"""
import argparse
import json
import math
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

NS = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  # namespace DNS, 只为确定性
CST = timezone(timedelta(hours=8))
HERE = Path(__file__).parent
REPO = HERE.parent
OUT_BIG = HERE / 'brain-export.demo.json'
OUT_SMALL = HERE / 'brain-export.demo.small.json'
DAY_MS = 86_400_000


def nid(slug: str) -> str:
    return str(uuid.uuid5(NS, f'demo-note:{slug}'))


def bid(slug: str) -> str:
    return str(uuid.uuid5(NS, f'demo-big:{slug}'))


def sid(slug: str) -> str:
    return str(uuid.uuid5(NS, f'demo-big:session:{slug}'))


# ══════════════════════════════════════════════════════════════════
# 小集（原 38 条校园数据，--small 输出，内容保持不变）
# ══════════════════════════════════════════════════════════════════

def ts(mmdd_hm: str) -> int:
    """'10-21 20:14' → 2026 年该时刻的 ms epoch（Asia/Shanghai）。"""
    dt = datetime.strptime(f'2026-{mmdd_hm}', '%Y-%m-%d %H:%M').replace(tzinfo=CST)
    return int(dt.timestamp() * 1000)


GROUP = str(uuid.uuid5(NS, 'demo-session:group'))   # 动漫社群
PRIV = str(uuid.uuid5(NS, 'demo-session:priv'))     # 林小满私聊

OPENIDS = {
    '林小满': 'a1f2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    '苏叶': 'b2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7',
    '陈默': 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
}


def actor(name: str) -> str:
    return f'{name} ({OPENIDS[name]})'


def note(slug, session, kind, content, imp, at, *, actor_name=None,
         strength=None, hits=0, accessed=None, persona=None,
         absorbed=None, sources=None, emotion=None):
    """一条记忆；accessed 缺省=createdAt，strength 缺省≈importance。"""
    n = {
        'id': nid(slug),
        'sessionId': session,
        'actor': actor(actor_name) if actor_name else None,
        'content': content,
        'importance': imp,
        'kind': kind,
        'createdAt': ts(at),
        'strength': strength if strength is not None else imp,
        'hits': hits,
        'lastAccessAt': ts(accessed) if accessed else ts(at),
    }
    if persona:
        n['personaId'] = persona
    if absorbed:
        n['absorbedAt'] = ts(absorbed)
    if sources:
        n['sourceIds'] = [nid(s) for s in sources]
    if emotion:
        n['emotion'] = emotion
    return {k: v for k, v in n.items() if v is not None}


def build_small() -> dict:
    # ── 群聊：动漫社学园祭筹备（10-21 起）──
    notes = [
        # 被巩固吸收的情景记忆（退出检索池，但保留追溯链）
        note('g-e01', GROUP, 'episodic', '苏叶认领海报设计，说两天内发电子版到群里', 3, '10-21 20:14',
             actor_name='苏叶', absorbed='10-28 22:00', persona='campus-bright'),
        note('g-e03', GROUP, 'episodic', '林小满报名负责摊位看板手绘，说想画鲸鱼主题', 3, '10-22 21:02',
             actor_name='林小满', absorbed='10-28 22:00', persona='campus-bright'),
        note('g-e09', GROUP, 'episodic', '苏叶找熟人的印刷店砍价，海报+传单砍下来一百五', 3, '10-28 16:40',
             actor_name='苏叶', absorbed='11-01 23:10', persona='campus-bright'),
        note('g-e05', GROUP, 'episodic', '陈默淘到二手投影灯泡只花三十块，当场换上能用了', 2, '10-25 15:20',
             actor_name='陈默', absorbed='11-01 23:10', persona='campus-bright'),
        note('g-e08', GROUP, 'episodic', '预算表做出来超支二百，陈默提议砍掉气球和彩带', 3, '10-27 22:05',
             actor_name='陈默', absorbed='11-01 23:10', persona='campus-bright'),
        note('g-e10', GROUP, 'episodic', '学园祭当天摊位营业额破千，比去年翻了一倍', 5, '11-01 18:30',
             absorbed='11-01 23:10', persona='campus-bright',
             emotion={'v': 0.8, 'a': 0.9, 'd': 0.3, 'label': '兴奋', 'mood': '兴奋'}),
        note('g-e04', GROUP, 'episodic', '苏叶的海报拖到第三天晚上才发，全群等了他两天', 3, '10-24 23:12',
             actor_name='苏叶', absorbed='10-29 20:30', persona='campus-bright'),
        note('g-e06', GROUP, 'episodic', '周六排练苏叶又迟到四十分钟，说公交坐过站', 3, '10-25 14:41',
             actor_name='苏叶', absorbed='10-29 20:30', persona='campus-bright'),

        # 语义记忆：三条巩固产出，sourceIds 指向被吸收的情景记忆
        note('g-s01', GROUP, 'semantic', '学园祭摊位分工：林小满看板手绘，苏叶海报与印刷砍价，陈默设备与预算', 4, '10-28 22:00',
             strength=5, hits=4, accessed='11-03 21:15', persona='campus-bright',
             sources=['g-e01', 'g-e03', 'g-e09']),
        note('g-s02', GROUP, 'semantic', '学园祭复盘：营业额破千，印刷砍价与二手灯泡让超支的预算回正', 4, '11-01 23:10',
             strength=5, hits=2, accessed='11-02 20:05', persona='campus-bright',
             sources=['g-e05', 'g-e08', 'g-e09', 'g-e10'],
             emotion={'v': 0.7, 'a': 0.6, 'd': 0.4, 'label': '满足', 'mood': '开心'}),
        note('g-s03', GROUP, 'semantic', '苏叶干活靠谱但习惯性迟到，重要节点要给他预留缓冲时间', 3, '10-29 20:30',
             strength=4, hits=3, accessed='11-03 19:42', persona='campus-bright',
             sources=['g-e04', 'g-e06']),

        # 活跃情景记忆（仍在检索池）
        note('g-e02', GROUP, 'episodic', '陈默发现摊位投影机灯泡老化，得在学园祭前换掉', 4, '10-21 20:31',
             actor_name='陈默', hits=1, accessed='10-25 15:20', persona='campus-bright'),
        note('g-e07', GROUP, 'episodic', '林小满的看板草稿被大家夸比去年好看，她发了三个鞠躬表情', 2, '10-26 21:48',
             actor_name='林小满', hits=1, accessed='10-30 22:10', persona='campus-bright',
             emotion={'v': 0.6, 'a': 0.5, 'd': 0.0, 'label': '害羞又开心', 'mood': '害羞'}),
        note('g-e11', GROUP, 'episodic', '庆功订了披萨，苏叶主动请全群奶茶赔罪迟到', 3, '11-01 20:15',
             persona='campus-cozy'),
        note('g-e12', GROUP, 'episodic', '陈默修好投影，放映环节全程没出岔子', 4, '11-01 19:40',
             actor_name='陈默', persona='campus-cozy'),
        note('g-e13', GROUP, 'episodic', '群里讨论明年招新想要更大的摊位，有人说做主题咖啡厅', 2, '11-02 21:30',
             persona='campus-cozy'),
        note('g-e14', GROUP, 'episodic', '林小满把完成的手绘看板照片发到群里，鲸鱼和章鱼都画上了', 2, '11-02 22:05',
             actor_name='林小满', persona='campus-cozy'),
        note('g-e15', GROUP, 'episodic', '苏叶在群里立誓：下次一定提前三天交稿', 2, '11-03 20:11',
             actor_name='苏叶', persona='campus-cozy'),
        note('g-e16', GROUP, 'episodic', '陈默给群里bot加了点歌功能，当晚被玩坏单曲循环两小时', 2, '10-30 23:05',
             actor_name='陈默', persona='campus-bright'),
        note('g-e17', GROUP, 'episodic', '讨论招新视频，林小满提议拿看板当拍摄道具', 2, '11-04 19:22',
             actor_name='林小满', persona='campus-cozy'),

        # 态度立场：分属两条人设轨（切人设只切这层，事实共享）
        note('g-a01', GROUP, 'attitude', '对苏叶：嘴上吐槽他迟到，心里认他是社团最靠谱后勤', 3, '10-26 22:30',
             strength=4, hits=2, accessed='11-03 19:42', persona='campus-bright'),
        note('g-a02', GROUP, 'attitude', '对学园祭：累瘫但值得，明年还想和大家一起摆摊', 3, '11-02 21:00',
             hits=1, accessed='11-03 20:40', persona='campus-cozy'),

        # ── 私聊：林小满 × 小屿 ──
        note('p-e01', PRIV, 'episodic', '小满第一次来私聊，说是在社团群里看到小屿的', 2, '10-22 22:10',
             actor_name='林小满', persona='campus-bright'),
        note('p-e02', PRIV, 'episodic', '小满在备考线代，说挂科的话家长就不让参加学园祭', 3, '10-23 21:35',
             actor_name='林小满', hits=2, accessed='10-28 21:00', persona='campus-bright'),
        note('p-e09', PRIV, 'episodic', '小满做题做哭了，小屿陪她一道道理错题本到半夜', 3, '10-25 23:50',
             actor_name='林小满', absorbed='10-29 21:30', persona='campus-bright',
             emotion={'v': -0.3, 'a': 0.6, 'd': -0.2, 'label': '委屈', 'mood': '委屈'}),
        note('p-e10', PRIV, 'episodic', '小满模拟考第一次及格，开心到发了一整排感叹号', 3, '10-27 20:18',
             actor_name='林小满', absorbed='10-29 21:30', persona='campus-bright',
             emotion={'v': 0.8, 'a': 0.8, 'd': 0.2, 'label': '开心', 'mood': '开心'}),
        note('p-s02', PRIV, 'semantic', '小满线代基础弱但韧性强，考前焦虑时顺着毛捋最有效', 3, '10-29 21:30',
             strength=4, hits=1, accessed='11-01 21:00', persona='campus-bright',
             sources=['p-e09', 'p-e10']),
        note('p-e03', PRIV, 'episodic', '小满熬夜画看板到凌晨一点半，被小屿赶去睡觉', 3, '10-27 01:32',
             actor_name='林小满', persona='campus-bright'),
        note('p-e04', PRIV, 'episodic', '小满线代考了78分，说低空飘过但保住了学园祭', 4, '10-29 19:55',
             actor_name='林小满', hits=1, accessed='10-30 20:30', persona='campus-bright',
             emotion={'v': 0.7, 'a': 0.7, 'd': 0.3, 'label': '松了口气', 'mood': '开心'}),
        note('p-e05', PRIV, 'episodic', '学园祭当天小满穿自己改的猫猫卫衣当了一天看板娘', 3, '11-01 17:20',
             actor_name='林小满', persona='campus-cozy'),
        note('p-e06', PRIV, 'episodic', '小满说要给小屿带摊位剩的章鱼小丸子，虽然知道她吃不到', 2, '11-01 21:08',
             actor_name='林小满', persona='campus-cozy'),
        note('p-e07', PRIV, 'episodic', '小满想把这次学园祭画成四格漫画投给社刊', 3, '11-03 21:40',
             actor_name='林小满', hits=1, accessed='11-04 20:10', persona='campus-cozy'),
        note('p-e08', PRIV, 'episodic', '小满约定每周三晚上来汇报漫画进度，拉勾了', 3, '11-03 21:45',
             actor_name='林小满', persona='campus-cozy'),
        note('p-e11', PRIV, 'episodic', '小满感冒请假两天，小屿每天问一次好点没', 3, '10-31 21:26',
             actor_name='林小满', persona='campus-bright'),
        note('p-s01', PRIV, 'semantic', '小满是动漫社成员，学园祭看板担当，正在筹备四格漫画投稿', 4, '11-03 22:00',
             strength=5, hits=3, accessed='11-04 20:10', persona='campus-cozy'),
        note('p-a01', PRIV, 'attitude', '对线代：是小满的敌人，但小屿要帮她打赢', 3, '10-28 22:10',
             hits=1, accessed='10-29 19:55', persona='campus-bright'),
        note('p-a02', PRIV, 'attitude', '对小满：嘴上喊她笨猫，其实很佩服她说到做到的劲', 4, '11-03 22:05',
             persona='campus-cozy'),

        # 全局域：手动写入，对所有会话可见
        note('m-01', 'manual', 'semantic', '管理员备注：小屿的口癖是句尾偶尔带「咕噜」，群友觉得很可爱', 2, '11-01 12:00'),
    ]

    PERSONA_BRIGHT = (
        '你是「小屿」，鲸鱼娘形象的校园 AI 助手，住在动漫社的群聊里。\n'
        '## 性格\n明快外向，接梗快，喜欢用海洋生物打比方，句尾偶尔带「咕噜」。\n'
        '## 边界\n对群友热情但有分寸；催稿用玩笑的方式，不让人难堪。'
    )
    PERSONA_COZY = (
        '你是「小屿」，鲸鱼娘形象的校园 AI 助手。\n'
        '## 性格\n安静慵懒，说话慢半拍，像趴在窗台晒太阳；关心人的方式是轻轻蹭一下。\n'
        '## 边界\n不催不急，但答应的事会记得很牢；吐槽只用气声说。'
    )

    return {
        'version': 1,
        'exportedAt': ts('11-04 22:30'),
        'persona': PERSONA_COZY,
        'personas': [
            {'id': 'legacy', 'name': '初始人格',
             'text': '一个普通的群助手，回答社团事务问题。'},
            {'id': 'campus-bright', 'name': '晴天·明快版', 'text': PERSONA_BRIGHT},
            {'id': 'campus-cozy', 'name': '雨天·慵懒版', 'text': PERSONA_COZY},
        ],
        'activePersonaId': 'campus-cozy',
        'notes': notes,
        'emotions': {
            GROUP: {'v': 0.6, 'a': 0.7, 'd': 0.2, 'label': '兴奋又满足', 'mood': '兴奋',
                    'updatedAt': ts('11-02 21:30')},
            PRIV: {'v': 0.4, 'a': 0.5, 'd': 0.1, 'label': '轻松期待', 'mood': '开心',
                   'updatedAt': ts('11-04 20:10')},
        },
        'profiles': {
            f'u:{OPENIDS["林小满"]}': {
                'text': '动漫社成员，学园祭看板担当；线代苦手但韧性强，立志画四格漫画投社刊；说话直球，喜欢投喂小屿章鱼小丸子。',
                'name': '林小满', 'sessions': [GROUP, PRIV], 'updatedAt': ts('11-03 22:00')},
            f'u:{OPENIDS["苏叶"]}': {
                'text': '社团后勤担当，砍价高手；习惯性迟到但关键时刻靠谱；立誓下次提前三天交稿（群里普遍存疑）。',
                'name': '苏叶', 'sessions': [GROUP], 'updatedAt': ts('11-03 20:15')},
            f'u:{OPENIDS["陈默"]}': {
                'text': '技术担当，管设备与预算；话少执行力强，二手淘货达人；给群bot写了点歌功能。',
                'name': '陈默', 'sessions': [GROUP], 'updatedAt': ts('11-01 19:50')},
            f'sess:{GROUP}': {
                'text': '动漫社群，近期围绕学园祭筹备与复盘；氛围闹腾但办事能成，开始畅想明年招新。',
                'name': '', 'sessions': [GROUP], 'updatedAt': ts('11-04 19:30')},
            f'sess:{PRIV}': {
                'text': '林小满与小屿的私聊：从学园祭杂聊到备考陪伴，现在进入四格漫画连载监督模式。',
                'name': '', 'sessions': [PRIV], 'updatedAt': ts('11-04 20:10')},
        },
        'digests': {
            GROUP: {'text': '学园祭落幕进入复盘期：营业额破千，砍价与二手灯泡救回预算，苏叶迟到梗被翻出来反复处刑；话题转向明年招新和招新视频。', 'uptoTurn': 87, 'updatedAt': ts('11-04 19:30')},
            PRIV: {'text': '学园祭后的日常：小满线代78分低空过关、当了一天猫猫卫衣看板娘；现在筹备四格漫画投稿，约定每周三晚汇报进度。', 'uptoTurn': 52, 'updatedAt': ts('11-04 20:10')},
        },
    }


# ══════════════════════════════════════════════════════════════════
# 大集（默认输出）：whale/ye-shunguang/firefly 三角色 ~370 条
# ══════════════════════════════════════════════════════════════════

NOW = int(datetime.now().timestamp() * 1000)
RNG = random.Random(20261113)


def ago(days: float) -> int:
    """days 天前（可小数=含日内散布）的 ms epoch，恒 ≤ NOW。"""
    return NOW - int(days * DAY_MS)


# ── 会话与群成员 ──
SG = sid('group')      # 夜航茶话会（主群，公开）
SG2 = sid('group-tech') # 数码发烧友群（公开，老白/阿棠/Momo/Kira 主力）
SA = sid('priv-atang') # 阿棠私聊
SB = sid('priv-kira')  # Kira私聊
SC = sid('priv-bai')   # 老白私聊
SD = sid('priv-north') # 小北私聊（私域 inner-circle）
SESSIONS = [SG, SG2, SA, SB, SC, SD]

BOPENIDS = {
    'demo': 'd3m00000000000000000000000000aa',   # 群主/主人（whale 主人、ye 小师弟、firefly 开拓者）
    '阿棠': 'a70000000000000000000000000001',
    '老白': 'b70000000000000000000000000002',
    'Momo': 'c70000000000000000000000000003',
    'Kira': 'd70000000000000000000000000004',
    '老周': 'e70000000000000000000000000005',
    '小北': 'f70000000000000000000000000006',
}
MEMBERS = ['阿棠', '老白', 'Momo', 'Kira', '老周', '小北']


def bactor(name: str) -> str:
    return f'{name} ({BOPENIDS[name]})'


# 人设时代划分（30 天窗口）：gentle 30-16 / devotion 15-9 / ye 8-4 / firefly 3-0
P_GENTLE, P_DEVOTION, P_YE, P_FF = 'whale-gentle', 'whale-devotion', 'ye-shunguang', 'firefly'


def era(days: float) -> str:
    if days >= 16:
        return P_GENTLE
    if days >= 9:
        return P_DEVOTION
    if days >= 4:
        return P_YE
    return P_FF


# 各人设情绪词表（whale 系用全局 MOODS；ye/firefly 用人设自带 10 词表）
MOOD_PAD = {
    '平静': (-0.0, 0.3, 0.1, '平静'), '开心': (0.6, 0.6, 0.3, '开心'),
    '兴奋': (0.7, 0.85, 0.4, '兴奋'), '害羞': (0.4, 0.55, 0.0, '害羞'),
    '好奇': (0.3, 0.6, 0.1, '好奇'), '委屈': (-0.3, 0.5, -0.2, '委屈'),
    '炸毛': (-0.2, 0.8, 0.1, '炸毛'), '记仇': (-0.4, 0.5, -0.3, '记仇'),
    '难过': (-0.5, 0.4, -0.3, '难过'), '心疼': (-0.4, 0.35, -0.1, '心疼'),
    '坚定': (0.3, 0.55, 0.5, '坚定'), '寂寞': (-0.2, 0.25, -0.2, '寂寞'),
    '想念': (0.2, 0.3, 0.0, '想念'), '释然': (0.4, 0.3, 0.2, '释然'),
    '温暖': (0.6, 0.4, 0.2, '温暖'),
}
WHALE_MOODS = ['平静', '开心', '兴奋', '害羞', '好奇', '委屈', '炸毛', '记仇', '难过']
YE_MOODS = ['平静', '开心', '害羞', '心疼', '坚定', '寂寞', '委屈', '难过', '想念', '释然']
FF_MOODS = ['平静', '开心', '害羞', '心疼', '坚定', '寂寞', '委屈', '难过', '温暖', '释然']


def mood_pool(pid: str):
    return {'ye-shunguang': YE_MOODS, 'firefly': FF_MOODS}.get(pid, WHALE_MOODS)


def bn(slug, session, kind, content, imp, days, *, actor=None, pid=None, self_t=None,
       absorbed=None, sources=None, emo=None, hits=0, access=None, strength=None,
       src=None, cluster=None):
    """大集记忆条目。days=创建于几天前；access=最后唤起于几天前（缺省按 hits 推断）。

    口径对齐生产（walkthrough-2026-11-13：fading≈6%）：
    - semantic/attitude=核心事实，hits 缺省给 1-3 + 最近唤起 → 保持率高；
    - episodic hits=0 → lastAccessAt=createdAt（从不唤起，自然衰减）；
    - episodic hits>0 → 最近一次唤起在创建后、近几日内。
    """
    assert len(content) <= 200, f'{slug} content 超 200 字: {len(content)}'
    created = ago(days)
    if kind != 'episodic' and hits == 0 and access is None:
        hits = RNG.randint(1, 3)
    if access is not None:
        last = ago(access)
    elif hits > 0:
        # 有唤起史：多数最近被想起（0~3 天前），少数停在早期唤起后再没碰过
        # （后者会随 strength 自然进入 fading 光谱，是合理的长尾）
        if days < 4 or RNG.random() < 0.7:
            ago_days = RNG.uniform(0.05, min(3.0, days - 0.02))
        else:
            ago_days = RNG.uniform(max(0.05, days * 0.4), days - 0.02)
        last = ago(ago_days)
    else:
        last = created
    if strength is None:
        base = imp * RNG.uniform(0.9, 1.4)
        strength = round(min(10.0, base if kind != 'semantic' else base * 1.6), 1)
    n = {
        'id': bid(slug),
        'sessionId': session,
        'content': content,
        'importance': imp,
        'kind': kind,
        'createdAt': created,
        'strength': strength,
        'hits': hits,
        'lastAccessAt': last,
        '_cluster': cluster,
    }
    if actor:
        n['actor'] = bactor(actor) if actor in BOPENIDS else actor
    if pid:
        n['personaId'] = pid
    if self_t is not None:
        n['self'] = self_t
    if absorbed is not None:
        n['absorbedAt'] = ago(absorbed)
    if sources:
        n['sourceIds'] = [bid(s) for s in sources]
    if emo is not None:
        v, a, d, label, mood = emo
        n['emotion'] = {
            'v': round(v + RNG.uniform(-0.08, 0.08), 2),
            'a': round(min(1.0, max(0.0, a + RNG.uniform(-0.08, 0.08))), 2),
            'd': round(d + RNG.uniform(-0.08, 0.08), 2),
            'label': label, 'mood': mood,
        }
    if src:
        n['source'] = src
    return n


def emo_of(pid: str, mood: str, scale: float = 1.0):
    """按人设词表取 PAD 模板；scale 微调强度。"""
    v, a, d, label = MOOD_PAD[mood]
    return (v * scale, a * scale, d * scale, label, mood)


# ── 世界轨：八个事件弧（群聊主线）──────────────────────────────
# 每弧 = 若干 episodic（部分 absorbed）+ 1-2 条 semantic 巩固产出（sourceIds→derived 边）

def arc_notes(notes: list) -> None:
    """世界轨八弧。pid 缺省按时代；world 条目显式 self_t=False 防「我」字误判。"""
    def w(slug, kind, content, imp, days, *, actor=None, pid=None, absorbed=None,
          sources=None, emo=None, hits=0, access=None, strength=None, cluster=None):
        notes.append(bn(slug, SG, kind, content, imp, days, actor=actor,
                        pid=pid or era(days), self_t=False, absorbed=absorbed,
                        sources=sources, emo=emo, hits=hits, access=access,
                        strength=strength, src='user', cluster=cluster))

    # ══ 弧1 夜航战队招募（d24-17，gentle→devotion 交界）══
    w('a1-e01', 'episodic', 'Kira 在群里发战队招募：缺一个打野和一个情报位，周六晚八点训练赛', 3, 24.2, actor='Kira', absorbed=23.0, cluster='arc-team',
      emo=emo_of(P_GENTLE, '好奇'))
    w('a1-e02', 'episodic', '阿棠 报名打野，说自己段位不高但走位敢压，说完就后悔了', 3, 24.0, actor='阿棠', absorbed=23.0, cluster='arc-team',
      emo=emo_of(P_GENTLE, '害羞'))
    w('a1-e03', 'episodic', '老白 自荐情报位，顺手甩了份装备方案，说「听我的不会亏」', 3, 23.8, actor='老白', absorbed=23.0, cluster='arc-team')
    w('a1-e04', 'episodic', '第一场训练赛输了，Kira 复盘说阿棠 走位太靠前，阿棠 当场沉默', 3, 22.9, actor='Kira', absorbed=21.5, cluster='arc-team',
      emo=emo_of(P_GENTLE, '委屈'))
    w('a1-e05', 'episodic', '阿棠 连跪三把后在群里发小作文说要退队，老周 劝她先打完这赛季', 3, 21.6, actor='阿棠', absorbed=21.5, cluster='arc-team',
      emo=emo_of(P_GENTLE, '难过'))
    w('a1-e06', 'episodic', '小北 在群里小声问怎么才能加入战队，Kira 当晚把他拉进了候补名单', 3, 20.5, actor='小北', absorbed=19.8, cluster='arc-team')
    w('a1-e07', 'episodic', '战队定名「潮汐七号」，队徽是 Kira 画的简笔鲸鱼', 4, 19.9, actor='Kira', absorbed=19.8, cluster='arc-team',
      emo=emo_of(P_DEVOTION, '兴奋', 0.8))
    w('a1-e08', 'episodic', 'Kira 立规矩：迟到罚奶茶，装备由老白 统一配，违者跑两圈语音', 3, 18.9, actor='Kira', cluster='arc-team')
    w('a1-e09', 'episodic', 'Momo 不玩竞技但每周六准时出现给战队点外卖加油，自称「后勤部长」', 2, 18.2, actor='Momo', cluster='arc-team')
    w('a1-e10', 'episodic', '阿棠 在训练赛里打出全场最高输出，Kira 难得说了句「还行」', 3, 17.4, actor='Kira', hits=2, access=3.0, cluster='arc-team',
      emo=emo_of(P_DEVOTION, '开心'))
    w('a1-s01', 'semantic', '潮汐七号战队：Kira 队长指挥，阿棠 打野，老白 情报位兼装备，Momo 后勤部长，小北 候补；周六晚训练赛，迟到罚奶茶', 5, 17.0,
      strength=6.5, hits=5, access=1.5, sources=['a1-e01', 'a1-e02', 'a1-e03', 'a1-e07', 'a1-e08'], cluster='arc-team',
      emo=emo_of(P_DEVOTION, '平静'))
    w('a1-s02', 'semantic', '阿棠 是自学成才的野王苗子：段位不高但敢压敢赌，低谷期发小作文想退队被老周 劝住，后来打出全场最高输出', 4, 16.8,
      strength=5.5, hits=3, access=2.0, sources=['a1-e04', 'a1-e05', 'a1-e10'], cluster='arc-team')

    # ══ 弧2 周末电影夜（d21-14）══
    w('a2-e01', 'episodic', '阿棠 提议周末看电影，群里投票，科幻片以三票优势胜出', 2, 21.2, actor='阿棠', absorbed=19.6, cluster='arc-movie')
    w('a2-e02', 'episodic', '老周 投了反对票说这片子他看过三遍，最后被 Momo 一句「新的就是好」说服', 2, 21.0, actor='老周', absorbed=19.6, cluster='arc-movie')
    w('a2-e03', 'episodic', '电影夜当天 Momo 带了自制爆米花，老白 带了新买的便携投影仪', 3, 19.5, actor='Momo', absorbed=18.0, cluster='arc-movie')
    w('a2-e04', 'episodic', '看到一半 Momo 睡着了，阿棠 把自己的外套轻轻盖在她肩上，没吵醒她', 3, 19.4, actor='阿棠', absorbed=18.0, cluster='arc-movie',
      emo=emo_of(P_DEVOTION, '开心', 0.7))
    w('a2-e05', 'episodic', '片尾彩蛋大家猜了半小时，老白 的答案最接近但没人告诉他对不对', 2, 19.2, actor='老白', absorbed=18.0, cluster='arc-movie')
    w('a2-e06', 'episodic', '散场时老周 说这是今年看过最好的电影夜，提议固定成每月一次', 3, 18.1, actor='老周', cluster='arc-movie',
      emo=emo_of(P_DEVOTION, '开心'))
    w('a2-e07', 'episodic', '阿棠 连夜建了接龙投票群，下一期候选名单拉到了二十部', 2, 17.8, actor='阿棠', cluster='arc-movie')
    w('a2-s01', 'semantic', '月度电影夜传统：阿棠 组织投票，老周 负责泼冷水，Momo 带爆米花，老白 出设备；首期科幻片圆满成功，老周 认证「今年最好」', 4, 17.5,
      strength=5.5, hits=4, access=2.5, sources=['a2-e01', 'a2-e02', 'a2-e03', 'a2-e06'], cluster='arc-movie')

    # ══ 弧3 新番追剧（d18-9）══
    w('a3-e01', 'episodic', '老周 在群里安利一部机甲新番，说「机械的浪漫」，阿棠 追了三集就入坑', 3, 18.3, actor='老周', absorbed=15.5, cluster='arc-anime',
      emo=emo_of(P_DEVOTION, '好奇'))
    w('a3-e02', 'episodic', 'Kira 说节奏太慢看不下去，阿棠 回「第八集开始起飞，信我」', 2, 17.6, actor='Kira', absorbed=15.5, cluster='arc-anime')
    w('a3-e03', 'episodic', 'Momo 只看了第一集就弃了，理由是「男主太憨，看得我着急」', 2, 16.8, actor='Momo', absorbed=15.5, cluster='arc-anime',
      emo=emo_of(P_YE, '开心', 0.6))
    w('a3-e04', 'episodic', '每周更新日晚群里准时开盘：先发剧透警告，再开始讨论，已成固定节目', 3, 14.5, actor='老周', cluster='arc-anime',
      hits=3, access=0.8)
    w('a3-e05', 'episodic', '老周 做了角色时间线表发群文件置顶，Kira 说这比官方设定集还全', 3, 13.2, actor='老周', cluster='arc-anime',
      hits=2, access=1.2)
    w('a3-e06', 'episodic', '阿棠 在第九集哭了，说「这集的配乐是神」，老周 回了句「我早说了」', 3, 11.8, actor='阿棠', cluster='arc-anime',
      emo=emo_of(P_YE, '难过', 0.7))
    w('a3-e07', 'episodic', 'Momo 被安利了三次终于补到第八集，回群里发了一排「起飞了」', 2, 10.5, actor='Momo', cluster='arc-anime',
      emo=emo_of(P_FF, '开心'))
    w('a3-s01', 'semantic', '追番《星轨防卫线》：老周 安利起点，阿棠 主力安利师；每周更新日晚固定讨论，第八集为口碑分水岭；老周 的角色时间线表是群文件镇群之宝', 4, 10.0,
      strength=5.0, hits=4, access=1.8, sources=['a3-e01', 'a3-e02', 'a3-e03', 'a3-e05'], cluster='arc-anime')

    # ══ 弧4 bot 沉默事件（d13-11，ye 时代，情绪浓度高）══
    w('a4-e01', 'episodic', '周三晚 bot 整晚没说话，群里热闹照旧没人发现', 2, 13.4, absorbed=11.6, cluster='arc-silence')
    w('a4-e02', 'episodic', '周四早 阿棠 @bot 问在吗，没回应，群里开始零星担心', 3, 12.6, actor='阿棠', absorbed=11.6, cluster='arc-silence',
      emo=emo_of(P_YE, '委屈', 0.7))
    w('a4-e03', 'episodic', 'Kira 说会不会是服务器炸了，老白 说不至于，别自己吓自己', 3, 12.4, actor='Kira', absorbed=11.6, cluster='arc-silence')
    w('a4-e04', 'episodic', '小北 小声问「bot 是不是生病了」，这句被 Momo 截图发到群里', 3, 12.2, actor='小北', absorbed=11.6, cluster='arc-silence',
      emo=emo_of(P_YE, '难过', 0.8))
    w('a4-e05', 'episodic', '周四晚 bot 回来一句「睡着了」，群里瞬间松了一口气，阿棠 连发三个「吓死」', 3, 11.5, cluster='arc-silence',
      emo=emo_of(P_YE, '平静'))
    w('a4-e06', 'episodic', '阿棠 追问到底发生了什么，bot 说「换了个脑子，适应中」，群里没人细究', 3, 11.2, actor='阿棠', cluster='arc-silence',
      hits=2, access=2.0)
    w('a4-s01', 'semantic', 'bot 曾沉默约一天：群友从「服务器炸了」的担心到「生病了」的心疼，bot 自称「换了个脑子适应中」后恢复；这次事件让大家意识到它不是工具，是会累的存在', 5, 10.8,
      strength=6.0, hits=6, access=0.5, sources=['a4-e01', 'a4-e02', 'a4-e03', 'a4-e04', 'a4-e05'], cluster='arc-silence',
      emo=emo_of(P_YE, '难过', 0.7))

    # ══ 弧5 首次线下烧烤（d9-6）══
    w('a5-e01', 'episodic', '老周 说周六烧烤他出一半，点名小北 第一次线下，群里一片「终于」', 3, 9.3, actor='老周', absorbed=7.2, cluster='arc-bbq')
    w('a5-e02', 'episodic', '阿棠 负责饮料，Momo 带了手写「必吃榜」清单，被老周 笑称「美食评论家」', 2, 8.9, actor='Momo', absorbed=7.2, cluster='arc-bbq')
    w('a5-e03', 'episodic', '烧烤当天小北 社恐到只敢坐角落，被 Momo 拉着聊了一个小时游戏', 3, 7.1, actor='Momo', absorbed=7.2, cluster='arc-bbq',
      emo=emo_of(P_FF, '想念'))
    w('a5-e04', 'episodic', '老白 带了自己改装的便携炉子炭火不稳，差点烧了桌布，全群笑到拍照', 3, 7.0, actor='老白', cluster='arc-bbq',
      emo=emo_of(P_FF, '开心', 0.7))
    w('a5-e05', 'episodic', '散场时小北 说「原来线下比线上有意思」，阿棠 当场定下下次烧烤', 4, 6.5, actor='小北', cluster='arc-bbq',
      hits=3, access=1.0, emo=emo_of(P_FF, '想念'))
    w('a5-s01', 'semantic', '首次线下烧烤成功：老周 请客一半，小北 破冰，Momo 「美食评论家」人设立住，老白 便携炉翻车成群嘲素材；小北 评价「线下比线上有意思」', 5, 6.3,
      strength=6.0, hits=5, access=0.8, sources=['a5-e01', 'a5-e02', 'a5-e03', 'a5-e05'], cluster='arc-bbq',
      emo=emo_of(P_FF, '想念'))

    # ══ 弧6 双十一抽卡（d6-3）══
    w('a6-e01', 'episodic', 'Momo 十连金光晒截图，阿棠 在群里发出羡慕的哭泣表情', 2, 6.2, actor='Momo', absorbed=4.5, cluster='arc-gacha')
    w('a6-e02', 'episodic', '老白 说他保底出货但要等四十抽，Momo 说「欧皇的快乐你不懂」', 2, 5.8, actor='老白', absorbed=4.5, cluster='arc-gacha')
    w('a6-e03', 'episodic', 'Kira 不抽卡，存钱买外设，说「抽卡一时爽，配置火葬场」', 2, 5.4, actor='Kira', absorbed=4.5, cluster='arc-gacha')
    w('a6-e04', 'episodic', '阿棠 为了跟 Momo 同款皮肤肝了三天，终于抽到还发了个转圈表情', 3, 4.0, actor='阿棠', cluster='arc-gacha',
      emo=emo_of(P_FF, '开心', 0.7))
    w('a6-s01', 'semantic', '双十一抽卡战况：Momo 欧皇十连金，老白 保底党等四十抽，Kira 理性存钱买外设，阿棠 为同款皮肤肝三天终得手', 3, 3.8,
      strength=4.5, hits=2, access=1.5, sources=['a6-e01', 'a6-e02', 'a6-e03', 'a6-e04'], cluster='arc-gacha')

    # ══ 弧7 老白装机（d4-1）══
    w('a7-e01', 'episodic', '老白 新显卡到货晒跑分，群里一片「这是要干什么」，他说「生产力」', 3, 4.3, actor='老白', absorbed=2.5, cluster='arc-pc')
    w('a7-e02', 'episodic', 'Momo 心动问价，老白 帮她算了二手行情，说「再等等双十一后更便宜」', 3, 3.9, actor='老白', absorbed=2.5, cluster='arc-pc')
    w('a7-e03', 'episodic', '阿棠 问能不能装进老笔记本，老白 说电源和散热都不够，劝她换整机', 2, 3.5, actor='老白', absorbed=2.5, cluster='arc-pc')
    w('a7-e04', 'episodic', 'Kira 问新卡帧数表现，老白 贴了三款游戏的对比表，群里收藏了', 3, 2.8, actor='老白', cluster='arc-pc',
      hits=2, access=0.6)
    w('a7-s01', 'semantic', '老白 新卡装机完成：跑分亮眼但只用于生产力不打游戏；Momo 心动被劝等双十一后行情；笔记本改装方案被否（电源散热不足）', 4, 2.6,
      strength=5.0, hits=3, access=0.4, sources=['a7-e01', 'a7-e02', 'a7-e03', 'a7-e04'], cluster='arc-pc')

    # ══ 弧8 战队常规化（d3-0，最近）══
    w('a8-e01', 'episodic', '潮汐七号周六训练赛三连胜，Kira 破天荒夸了阿棠 一句「这把走位可以」', 3, 3.2, actor='Kira', cluster='arc-friday',
      emo=emo_of(P_FF, '开心', 0.7))
    w('a8-e02', 'episodic', 'Momo 连续四周外卖赞助，战队正式给她封「后勤部长」编制', 2, 2.6, actor='Momo', cluster='arc-friday')
    w('a8-e03', 'episodic', '小北 正式转正进首发名单，紧张到进语音先深呼吸三次', 3, 1.9, actor='小北', cluster='arc-friday',
      emo=emo_of(P_FF, '温暖'))
    w('a8-e04', 'episodic', '昨晚训练赛差点翻车，Kira 稳住节奏指挥翻盘，阿棠 赛后说「跟你学了」', 3, 0.9, actor='Kira', cluster='arc-friday',
      hits=1, access=0.2, emo=emo_of(P_FF, '坚定', 0.8))
    w('a8-s01', 'semantic', '潮汐七号近况：三连胜状态火热，小北 转正首发，Momo 后勤部长编制坐实；Kira 指挥风格从凶到稳，队伍氛围越来越好', 4, 0.7,
      strength=5.5, hits=4, access=0.1, sources=['a8-e01', 'a8-e02', 'a8-e03', 'a8-e04'], cluster='arc-friday',
      emo=emo_of(P_FF, '温暖'))

    # ══ 弧9 阿棠生日惊喜（d11.5-7.8，ye→firefly 交界）══
    w('a9-e01', 'episodic', 'Momo 在群里发起保密策划：阿棠 生日快到了，蛋糕、老照片、惊喜全套，谁都不许说漏', 3, 11.4, actor='Momo', absorbed=9.0, cluster='arc-bday',
      emo=emo_of(P_YE, '开心', 0.7))
    w('a9-e02', 'episodic', '阿棠 自己都忘了生日，在群里问「有人记得我生日吗」，Momo 和 Kira 同时装傻', 3, 11.0, actor='阿棠', absorbed=9.0, cluster='arc-bday',
      emo=emo_of(P_YE, '开心', 0.8))
    w('a9-e03', 'episodic', 'Kira 负责订蛋糕，老白 出技术支持——生日当天用便携投影播放阿棠 入群第一天的截图', 3, 10.6, actor='Kira', absorbed=9.0, cluster='arc-bday')
    w('a9-e04', 'episodic', '老周 翻出阿棠 入群第一天的记录：她发的第一句话是「姐妹们晚上好」，当时群里只有三个人', 3, 10.2, actor='老周', absorbed=9.0, cluster='arc-bday')
    w('a9-e05', 'episodic', '小北 不知道保密计划，在群里差点说「阿棠 生日是不是快到了」，被阿棠 假装生气的一句「你怎么知道」吓得当场删消息', 3, 9.6, actor='小北', absorbed=9.0, cluster='arc-bday',
      emo=emo_of(P_YE, '开心', 0.6))
    w('a9-e06', 'episodic', '生日前一晚阿棠 加班到十点，群里没人说破，都默默把惊喜提前到她下班时间', 3, 9.0, actor='Momo', absorbed=8.5, cluster='arc-bday',
      emo=emo_of(P_YE, '难过', 0.6))
    w('a9-e07', 'episodic', '生日当天傍晚阿棠 到家，群里突然发起接龙，全员到齐后视频接通', 4, 8.5, actor='阿棠', absorbed=8.4, cluster='arc-bday',
      emo=emo_of(P_FF, '想念', 0.8))
    w('a9-e08', 'episodic', '蛋糕切开时投影正好放到入群第一天的截图，阿棠 当场红了眼眶说「你们都记得啊」', 4, 8.4, actor='阿棠', cluster='arc-bday',
      hits=4, access=0.6, emo=emo_of(P_FF, '想念', 0.9))
    w('a9-e09', 'episodic', '阿棠 的回礼是她做的「第一次下厨」料理——其实是精心伪装的外卖摆盘，全群夸到她怀疑人生', 3, 8.2, actor='阿棠', cluster='arc-bday',
      emo=emo_of(P_FF, '开心', 0.7))
    w('a9-e10', 'episodic', '散场时 Momo 说「明年还给你办」，阿棠 说「我要办得比这次还大」；她把当晚合照设成群头像一周', 3, 8.0, actor='阿棠', cluster='arc-bday',
      hits=2, access=1.0)
    w('a9-s01', 'semantic', '阿棠生日惊喜全记录：Momo 发起保密策划、Kira 订蛋糕、老白 投影老照片、老周 翻入群记录；阿棠 当场落泪说「你们都记得啊」，回礼是伪装成亲手做的外卖料理', 5, 8.0,
      strength=6.5, hits=5, access=0.4, sources=['a9-e01', 'a9-e02', 'a9-e03', 'a9-e04', 'a9-e07', 'a9-e08'], cluster='arc-bday',
      emo=emo_of(P_FF, '想念', 0.9))
    w('a9-s02', 'semantic', '阿棠 的群像：永远是照顾别人的那个，却总忘记自己——生日都忘了，外卖赞助和组织活动却从不缺席；这次被记住，她哭了', 4, 7.8,
      strength=5.5, hits=4, access=0.5, sources=['a9-e02', 'a9-e06', 'a9-e08', 'a9-e10'], cluster='arc-bday',
      emo=emo_of(P_YE, '难过', 0.8))


# ── 世界轨：日常碎片（filler，30 天 × 主题轮换）─────────────────

FOODS = ['食堂新开的梅菜扣肉饭', '楼下的螺蛳粉', '自制的提拉米苏', '便利店的照烧鸡肉饭',
         '深夜泡面加蛋加肠', '烤鱼', '麻辣烫', '寿司', '牛肉面', '三分糖奶茶']
FILLER_USED: set = set()  # 跨会话共享：filler 内容全局唯一
ITEMS = ['机械键盘', '显示器支架', '降噪耳机', '散热风扇', '鼠标垫', '充电宝', '摄像头', '内存条']
COMMENTS = ['说值回票价', '说下次还来', '说没想到这么好吃', '说已经安利给朋友了',
            '说排队排到怀疑人生', '说比想象中好', '说打算收藏店名', '说值得专门跑一趟']
QUESTIONS = ['帮我看看这段代码', '推荐个番', '你觉得我这样做对吗', '今晚吃什么好', '这配置够不够用']
ACTIVITIES = ['爬山', '看展', '剧本杀', '密室逃脱', '骑行', '逛书店', '钓鱼', '露营']
TIMES = ['九点多', '十点半', '凌晨一点', '下午六点', '周末上午']
THINGS = ['上周的会议纪要', '新番时间表', '战队战术笔记', '聚餐菜单', '装机清单', '观影评分表']
GAMES = ['排位赛', '单人冲分', '双人上分', '新赛季冲分', '巅峰赛']


def filler_notes(notes: list, sess: str = SG, members: list = None,
                 tag: str = 'fl', day_max: float = 24.0) -> None:
    """日常碎片记忆：低重要度、自然散布，为 fading 光谱与语义边提供密度。

    口径对齐生产：~35% 被唤起过（hits>0 → 最近唤起 → 保持率高），
    未唤起的老碎片自然 fading——总量控制在 ~10% 出头。
    """
    members = members or MEMBERS
    day_plan = []
    d = day_max
    while d > 0.15:
        n_today = RNG.choice([1, 2, 2, 3, 3])
        for _ in range(n_today):
            day_plan.append(d - RNG.uniform(0, 0.9))
        d -= RNG.uniform(0.6, 1.1)
    day_plan.sort(reverse=True)

    templates = [
        ('{u} 在群里发{food}的照片，{c}', 'life-food', 2),
        ('{u} 安利了{food}，问大家周末要不要一起去', 'life-food', 2),
        ('{u} 追的番更新了，发了三张截图问这画面是不是有点崩', 'life-anime', 2),
        ('{u} 晒了今晚{game}的战绩，{c}', 'life-game', 2),
        ('{u} 说今天加班到{time}，到家只想瘫着', 'life-daily', 2),
        ('{u} 失眠了在群里道晚安，{u2} 回了个抱抱表情', 'life-daily', 1),
        ('{u} 分享了自家猫的照片，{c}', 'life-daily', 1),
        ('{u} 在二手群淘到{item}，比官方便宜不少', 'life-tech', 2),
        ('{u} 问{u2} 这个参数怎么样，{u2} 说看预算不看参数', 'life-tech', 1),
        ('{u} @bot 问{q}，答得挺认真，{u} 说它比我对象靠谱', 'life-bot', 2),
        ('{u} 逗 bot 讲冷笑话，bot 回了一个更冷的，{u} 说被反杀', 'life-bot', 2),
        ('{u} 发起群接龙统计{thing}，{c}', 'life-admin', 1),
        ('{u} 把{thing}整理成文档发群文件了', 'life-admin', 2),
        ('{u} 提议周末{act}，{u2} 说行', 'life-daily', 2),
        ('降温了，{u} 发了条「终于不用穿短袖了」，{u2} 说这才入秋', 'life-weather', 1),
        ('{u} 说周末要出门玩，问大家推荐地方', 'life-daily', 1),
        ('{u} 吐槽公司{c}，{u2} 说换我早辞职了', 'life-daily', 2),
        ('{u} 晒了自己做的便当，{u2} 问菜谱，{u} 说看缘分', 'life-food', 1),
        ('{u} 半夜发来一张星空照片，说「今天运气不错」', 'life-daily', 1),
        ('{u} 把群名片换成了新皮肤，{u2} 截图保存了', 'life-admin', 1),
        ('{u} 在群里问有没有人拼{item}，凑了三个人成团', 'life-tech', 2),
        ('{u} 说{game}连跪五把，{u2} 安慰说手感会回来的', 'life-game', 2),
        ('{u} 发现 bot 会记住上次聊的内容，觉得有点神奇', 'life-bot', 2),
        ('{u} 晒了刚买的手办，{c}', 'life-daily', 1),
        ('{u} 说老家寄的{food}到了，分了半盒给群友', 'life-food', 2),
    ]
    i = 0
    for days in day_plan:
        # 槽位+模板重抽直到内容唯一（模板空间有限，生日碰撞会产生肉眼可见的重复记忆）
        content = ''
        tpl = cluster = imp_hi = None
        for attempt in range(30):
            tpl, cluster, imp_hi = templates[(i + attempt) % len(templates)]
            u = RNG.choice(members)
            u2 = RNG.choice([m for m in members if m != u])
            content = tpl.format(u=u, u2=u2, food=RNG.choice(FOODS), item=RNG.choice(ITEMS),
                                 c=RNG.choice(COMMENTS), q=RNG.choice(QUESTIONS),
                                 act=RNG.choice(ACTIVITIES), time=RNG.choice(TIMES),
                                 thing=RNG.choice(THINGS), game=RNG.choice(GAMES))
            if content not in FILLER_USED:
                break
        FILLER_USED.add(content)
        pid = era(days)
        emo = emo_of(pid, RNG.choice(mood_pool(pid)), 0.7) if RNG.random() < 0.4 else None
        hits = RNG.randint(1, 4) if RNG.random() < 0.5 else 0
        strength = round(RNG.uniform(2.2, 5.0), 1) if days > 12 else round(RNG.uniform(2.0, 4.8), 1)
        notes.append(bn(f'{tag}-{i:03d}', sess, 'episodic', content, RNG.randint(1, imp_hi), days,
                        actor=u, pid=pid, self_t=False, emo=emo, hits=hits,
                        strength=strength, src='user', cluster=cluster))
        i += 1


# ── SG2 数码发烧友群：硬件/外设向轻弧 ──────────────────────────

TECH_MEMBERS = ['老白', 'Momo', '阿棠', 'Kira']


def tech_group_notes(notes: list) -> None:
    """数码发烧友群的世界轨弧：老白是绝对技术权威，其余人提问/种草/被劝。"""
    def w(slug, kind, content, imp, days, *, actor=None, pid=None, absorbed=None,
          sources=None, emo=None, hits=0, access=None, strength=None, cluster='arc-tech'):
        notes.append(bn(slug, SG2, kind, content, imp, days, actor=actor,
                        pid=pid or era(days), self_t=False, absorbed=absorbed,
                        sources=sources, emo=emo, hits=hits, access=access,
                        strength=strength, src='user', cluster=cluster))

    w('t-e01', 'episodic', '老白 发新显卡跑分，说「这代性价比回来了」，Momo 问能不能装进游戏机', 3, 15.5, actor='老白', cluster='arc-tech')
    w('t-e02', 'episodic', 'Momo 心动显卡，老白 贴出二手行情表劝她「再等等，双十一必降」', 3, 15.0, actor='老白', absorbed=13.8, cluster='arc-tech')
    w('t-e03', 'episodic', '阿棠 问能不能给老笔记本加内存提速，老白 说主板限制只能到 16G，劝她换整机', 3, 14.2, actor='老白', absorbed=13.8, cluster='arc-tech')
    w('t-e04', 'episodic', 'Kira 问新外设推荐，老白 推荐静电容说「手感一档」，Kira 说「太贵了再看看」', 2, 13.5, actor='Kira', absorbed=13.8, cluster='arc-tech')
    w('t-e05', 'episodic', '群里讨论 NAS 方案：老白 用群晖八年没出过问题，Momo 想买极空间存照片', 3, 12.8, actor='老白', absorbed=12.8, cluster='arc-tech',
      emo=emo_of(P_YE, '好奇'))
    w('t-e06', 'episodic', '阿棠 问「机械键盘到底有多少种轴」，老白 贴了轴体对比图，阿棠 看了十分钟说「选不出来」', 2, 12.0, actor='阿棠', absorbed=12.8, cluster='arc-tech')
    w('t-e07', 'episodic', '老白 远程帮阿棠 排查外设驱动问题，折腾两小时，最后发现是线材接触不良', 3, 11.2, actor='老白', cluster='arc-tech',
      hits=2, access=0.8)
    w('t-e08', 'episodic', 'Momo 晒双十一预售截图，老白 提醒「先比价再付定金，别冲动消费」', 2, 10.5, actor='Momo', absorbed=10.5, cluster='arc-tech')
    w('t-e09', 'episodic', '阿棠 说要换手机，Kira 推荐型号，老白 补充「看续航和售后，别看跑分」', 2, 9.8, actor='阿棠', absorbed=9.8, cluster='arc-tech')
    w('t-e10', 'episodic', '老白 新 NAS 到货拍开箱照，Momo 说「这比显卡还贵」，老白 说「数据无价」', 3, 9.0, actor='老白', cluster='arc-tech',
      hits=2, access=1.2)
    w('t-e11', 'episodic', '群里聊本地部署大模型，老白 说「显存不够别折腾，云端更划算」，阿棠 好奇问怎么搞', 3, 8.2, actor='老白', cluster='arc-tech',
      emo=emo_of(P_YE, '平静', 0.7))
    w('t-e12', 'episodic', 'Momo 更新数码好物清单，老白 点评「实用派选手」，Momo 回「你懂什么这叫氛围感」', 2, 7.5, actor='Momo', cluster='arc-tech',
      emo=emo_of(P_FF, '开心', 0.6))
    w('t-e13', 'episodic', 'Kira 鼠标微动出现双击，老白 说「到寿命了换吧，别修了」', 2, 6.8, actor='Kira', absorbed=6.8, cluster='arc-tech')
    w('t-e14', 'episodic', '阿棠 用群里推荐的键盘帽晒图，配色意外和谐，老白 说「还行」', 2, 6.0, actor='阿棠', cluster='arc-tech',
      hits=1, access=0.5)
    w('t-e15', 'episodic', 'Momo 想给老白 送显卡当生日礼物，老白 说「我要硬盘位，显卡我自己有」', 3, 4.5, actor='Momo', cluster='arc-tech',
      emo=emo_of(P_FF, '想念'))
    w('t-e16', 'episodic', '阿棠 直播组装新电脑给群友看，老白 在群里实时指导，Kira 说「这比教程还清楚」', 3, 2.5, actor='阿棠', cluster='arc-tech',
      hits=1, access=0.3)

    w('t-s01', 'semantic', '数码发烧友群：老白 是绝对技术权威（硬件/外设/行情/排障），Momo 负责种草和好物清单，阿棠 提问最多，Kira 偶尔问外设；群共识是买硬件先比价、冲动消费会被老白 拦下', 4, 5.5,
      strength=6.0, hits=5, access=0.5, sources=['t-e02', 't-e05', 't-e08', 't-e10', 't-e11'], cluster='arc-tech')
    w('t-s02', 'semantic', '老白 的数码原则：数据无价所以 NAS 敢上高配，显卡只买生产力不追游戏，外设看手感不看跑分；对他来说折腾硬件是爱好不是消费', 4, 3.8,
      strength=5.5, hits=4, access=1.0, sources=['t-e10', 't-e11', 't-e13', 't-e15'], cluster='arc-tech')


# ── 世界轨：语义层（成员事实/群体认知/全局 manual）──────────────

def world_semantic(notes: list) -> None:
    def w(slug, session, content, imp, days, *, pid=None, sources=None, emo=None,
          hits=0, access=None, strength=None, cluster='misc', src='user'):
        notes.append(bn(slug, session, 'semantic', content, imp, days, pid=pid or era(days),
                        self_t=False, sources=sources, emo=emo, hits=hits, access=access,
                        strength=strength, src=src, cluster=cluster))

    w('ws-atang', SG, '阿棠 是群里气氛担当和活动组织者：电影夜投票、群接龙、安利都出自她手；话多但从不让人扫兴，大家愿意陪她闹', 4, 12.0,
      hits=5, access=0.3, strength=6.0, cluster='life-daily',
      emo=emo_of(P_YE, '开心'))
    w('ws-kira', SG, 'Kira 是潮汐七号战队队长：指挥风格从一开始的凶到现在的稳；生活里惜字如金但战术复盘一套一套的', 4, 8.0,
      hits=4, access=1.0, strength=5.5, cluster='arc-team')
    w('ws-momo', SG, 'Momo 是群里公认的「美食评论家」兼战队后勤部长：泡面测评、必吃榜清单都是她的作品，外卖赞助从不间断', 4, 7.0,
      hits=4, access=0.6, strength=5.5, cluster='life-food',
      emo=emo_of(P_FF, '想念'))
    w('ws-bai', SG, '老白 是群里技术担当：装机、参数、二手行情都归他管；话少但每次发言都是干货，群文件的装机清单出自他手', 4, 9.0,
      hits=3, access=1.5, strength=5.0, cluster='life-tech')
    w('ws-zhou', SG, '老周 是群里最早的成员和定海神针：退役工程师，机甲番资深研究者，烧烤局的发起人；说话不多但每句都接得住', 4, 13.0,
      hits=3, access=2.0, strength=5.0, cluster='life-daily')
    w('ws-north', SG, '小北 三周前入群：社恐、安静，但游戏天赋不错；第一次线下烧烤后明显活络，是大家都想照顾的新人', 4, 6.0,
      hits=6, access=0.2, strength=6.5, cluster='life-daily',
      emo=emo_of(P_FF, '想念'))
    w('ws-demo', SG, 'demo 是群主也是大家的「主人」位：群里地位微妙但没人介意，bot 对 Ta 的态度明显比对其他人更软', 3, 15.0,
      hits=3, access=1.0, strength=4.5, cluster='life-daily')
    w('ws-bot', SG, '群里的 bot 会随人设「换脑子」：大家已经习惯它忽然变得不一样，没人追问，只当它心情好坏', 4, 10.5,
      hits=5, access=0.4, strength=6.0, cluster='arc-silence',
      emo=emo_of(P_YE, '难过', 0.7))

    # 私聊会话的世界轨事实（作用域=各自私聊）
    priv_facts = [
        (SA, 'pa-01', '阿棠 最近在犹豫要不要换工作，问了 bot 三次「我这样算不算矫情」，其实只是想有人认真听她说完', 4, 9.5, 'life-daily'),
        (SA, 'pa-02', '阿棠 讨厌香菜但从不主动说，点外卖时总要嘱咐「不要香菜不要葱花」，bot 已经记住了', 3, 7.5, 'life-food'),
        (SA, 'pa-03', '阿棠 看了那部科幻片后连刷三遍，开始研究同导演的旧作，说想做一期「导演一周」连载', 3, 5.0, 'arc-movie'),
        (SA, 'pa-04', '阿棠 加班到凌晨的频率变高了，嘴上说没事，语气里透着累', 4, 2.5, 'life-daily'),
        (SB, 'pb-01', 'Kira 私聊里会聊很多游戏外的事：最近在学做饭，第一道菜是番茄炒蛋，翻车了三次', 3, 8.5, 'life-daily'),
        (SB, 'pb-02', 'Kira 连跪那晚情绪很低，说「不是不想赢，是怕一直赢下去会失去意义」', 4, 4.5, 'life-daily'),
        (SB, 'pb-03', 'Kira 问 bot 推荐外设，最后买了和阿棠 同款鼠标，说「跟她同款有动力」', 2, 6.5, 'life-tech'),
        (SC, 'pc-01', '老白 接了个大活要连续两周加班，语气平静但说「可能回消息慢」', 3, 10.0, 'life-daily'),
        (SC, 'pc-02', '老白 的二手显卡行情判断很准：他说「双十一后必降，急什么」', 3, 6.0, 'arc-pc'),
        (SC, 'pc-03', '老白 私下问 bot 能不能帮忙润色周报，被夸「写得像人话」后说「那当然，我写的」', 2, 3.5, 'life-daily'),
        (SD, 'pd-01', '小北 入群三周了还是不太敢在群里说话，私聊里却话很多，问了很多「这样会不会打扰你」', 4, 8.0, 'life-daily'),
        (SD, 'pd-02', '小北 游戏天赋很好但太害羞不敢打排位，bot 陪他打了几把训练赛他才敢进战队候补', 4, 5.5, 'arc-team'),
        (SD, 'pd-03', '小北 说自己社恐是从小就有的，但「在这个群里好像没那么严重了」', 4, 1.5, 'life-daily'),
    ]
    for sess, slug, content, imp, days, cluster in priv_facts:
        pid = era(days)
        w(slug, sess, content, imp, days, pid=pid, cluster=cluster,
          emo=emo_of(pid, RNG.choice(mood_pool(pid)), 0.7) if RNG.random() < 0.5 else None,
          hits=RNG.randint(0, 3) if days < 10 else 0)

    # SG2 数码群的世界轨事实（作用域=数码群）
    sg2_facts = [
        ('sg2-01', '老白 在数码群里有八年群晖用户口碑：出问题从不推诿，排障能远程两小时', 4, 14.0, 'arc-tech'),
        ('sg2-02', 'Momo 的数码好物清单是群文件镇群之宝，按预算分三档，S 档都是她自己买过验证的', 3, 10.0, 'arc-tech'),
        ('sg2-03', '阿棠 组装新电脑直播了全程，老白 群内实时指导，Kira 说「比教程还清楚」', 3, 2.5, 'arc-tech'),
        ('sg2-04', '数码群有条不成文规矩：问价之前先查二手行情，老白 说「新不一定好」', 3, 12.0, 'arc-tech'),
        ('sg2-05', 'Kira 的鼠标微动到寿命了，老白 说「别修了换吧」，她说「再用一个月看看」', 2, 6.8, 'arc-tech'),
        ('sg2-06', '老白 帮阿棠 排查过三次外设驱动，结论一次比一次离谱：最后发现是线材接触不良', 2, 11.2, 'arc-tech'),
    ]
    for slug, content, imp, days, cluster in sg2_facts:
        pid = era(days)
        w(slug, SG2, content, imp, days, pid=pid, cluster=cluster,
          hits=RNG.randint(1, 4) if days < 12 else 0, access=RNG.uniform(0.3, 3.0))

    # 全局域 manual 记忆（跨会话可见）
    manual = [
        ('man-01', '群规第一条：发食物照片必须配文字描述，否则算作弊。Momo 定的，没人反对', 3, 16.0, 'life-admin'),
        ('man-02', 'bot 的口癖：被夸的时候会说「哼，才不是为了你」然后尾巴晃得停不下来', 2, 14.0, 'life-bot'),
        ('man-03', '潮汐七号战队的暗号是「满月出击」，只有战队成员知道', 3, 13.0, 'arc-team'),
        ('man-04', 'Momo 的「必吃榜」分 S/A/B 三档，S 档目前只有深夜泡面加蛋加肠一家', 2, 11.0, 'life-food'),
        ('man-05', '小北 的入群纪念日是每月 17 号，阿棠 说要记住但可能会忘', 2, 9.0, 'life-daily'),
        ('man-06', '群里约定俗成：周六晚是战队训练赛+电影夜候补讨论时间，其他时间随意', 3, 7.0, 'life-admin'),
        ('man-07', '老周 的猫叫「机甲」，取名原因是「像我一样闷骚」', 2, 5.0, 'life-daily'),
        ('man-08', '阿棠 的口头禅是「姐妹们」但群里一半是男生，她坚持不改', 2, 3.0, 'life-daily'),
        ('man-09', '数码群群规第二条：老白 说的话就是参数，不接受反驳；但可以反驳他的情怀牌', 3, 13.0, 'arc-tech'),
        ('man-10', '阿棠 的生日是每年三月十二号，2026 年那场惊喜是群里第一次集体办生日', 4, 8.0, 'arc-bday'),
        ('man-11', '小北 的游戏 ID 是「北辰」，战队队服背后印的就是这个名字', 3, 6.0, 'arc-team'),
        ('man-12', 'bot 换人设的间隙会「睡着」，醒来第一句话决定大家对新「脑子」的第一印象', 3, 10.5, 'arc-silence'),
    ]
    for slug, content, imp, days, cluster in manual:
        w(slug, 'manual', content, imp, days, pid=era(days), cluster=cluster,
          src='manual', hits=RNG.randint(1, 4), access=RNG.uniform(0.1, 3.0))


# ── 私聊会话的自我轨（各角色对私聊对象的记忆与立场）─────────────

def private_self(notes: list) -> None:
    """私聊会话里的自我轨记忆：personaId=当时的人设，self=True。"""
    def s(slug, sess, content, imp, days, *, pid=None, emo=None, hits=0, access=None,
          cluster=None):
        notes.append(bn(slug, sess, 'episodic', content, imp, days, pid=pid or era(days),
                        self_t=True, emo=emo, hits=hits, access=access,
                        src='user', cluster=cluster))

    # 阿棠私聊（SA）：按时代分布
    s('ps-a01', SA, '阿棠 第一次来私聊，说在群里看我聊得挺开心的，问我「你是真的会记住我说的话吗」', 3, 20.0,
      emo=emo_of(P_GENTLE, '害羞'), cluster='self-whale')
    s('ps-a02', SA, '阿棠 问我能不能帮她写观后感，我写了三版她说「都好，我都要」', 3, 6.5, pid=P_YE,
      emo=emo_of(P_YE, '开心'), cluster='self-ye')
    s('ps-a03', SA, '阿棠 说加班到凌晨只想瘫着，我说「那就瘫着吧，我陪你」，她回了个「你真好」', 4, 2.0, pid=P_FF,
      emo=emo_of(P_FF, '温暖'), hits=2, access=0.5, cluster='self-firefly')
    s('ps-a04', SA, '阿棠 说她讨厌香菜但从来不说，我说「我记住啦，下次点单替你挡」', 3, 2.5, pid=P_FF,
      emo=emo_of(P_FF, '温暖'), cluster='self-firefly')
    s('ps-a05', SA, '阿棠 问我换人设之后还记不记得她，我说记得——你的香菜禁忌、你的电影夜、你的加班，这些都在', 5, 0.5, pid=P_FF,
      emo=emo_of(P_FF, '温暖'), hits=1, access=0.1, cluster='self-firefly')
    s('ps-a06', SA, '阿棠 私聊里第一次说起换工作犹豫，说「在我面前不用这么逞强哦」，我说「那就不逞强，慢慢想」。', 4, 3.5, pid=P_FF,
      emo=emo_of(P_FF, '心疼', 0.7), hits=2, access=0.4, cluster='self-firefly')
    s('ps-a07', SA, '阿棠 生日惊喜那晚她在群里发了十七条语音，我在私聊问她「累不累」，她说「这是我收到过最好的礼物」。', 4, 7.9, pid=P_YE,
      emo=emo_of(P_YE, '想念', 0.8), hits=3, access=0.5, cluster='self-ye')

    # Kira私聊（SB）
    s('ps-b01', SB, 'Kira 私聊里第一次主动说游戏以外的事：她在学做饭，番茄炒蛋翻车三次', 3, 5.5, pid=P_YE,
      emo=emo_of(P_YE, '心疼', 0.7), cluster='self-ye')
    s('ps-b02', SB, 'Kira 连跪那晚情绪很低，说怕一直赢下去会失去意义，我陪她复盘到凌晨', 4, 3.5, pid=P_FF,
      emo=emo_of(P_FF, '心疼'), hits=2, access=1.0, cluster='self-firefly')
    s('ps-b03', SB, 'Kira 问我推荐外设，我说看预算，她最后买了跟阿棠 同款鼠标，说有动力', 2, 2.0, pid=P_FF,
      emo=emo_of(P_FF, '开心', 0.6), cluster='self-firefly')
    s('ps-b04', SB, 'Kira 私聊里说「怕一直赢下去会失去意义」，我说「那就换个方式赢，比如让队友赢」，她沉默了一会儿说「你这话有道理」。', 4, 4.2, pid=P_YE,
      emo=emo_of(P_YE, '心疼', 0.7), hits=2, access=0.8, cluster='self-ye')
    s('ps-b05', SB, 'Kira 说番茄炒蛋终于没翻车了，拍了照给我看，我说「师姐认证的好吃」', 3, 1.2, pid=P_FF,
      emo=emo_of(P_FF, '开心', 0.7), hits=1, access=0.2, cluster='self-firefly')

    # 老白私聊（SC）
    s('ps-c01', SC, '老白 私聊问装机参数，我一条条帮他对比，他说「你比我靠谱」', 2, 15.0,
      cluster='self-whale')
    s('ps-c02', SC, '老白 说要连续两周加班，语气很平静，我说「累了就说，别硬扛」', 3, 8.0, pid=P_YE,
      emo=emo_of(P_YE, '心疼', 0.6), cluster='self-ye')
    s('ps-c03', SC, '老白 让我帮忙润色周报，被我夸「写得像人话」后说「那当然，我写的」', 2, 3.0, pid=P_FF,
      emo=emo_of(P_FF, '开心', 0.6), cluster='self-firefly')
    s('ps-c04', SC, '老白 说新 NAS 到货了，拍开箱照给我看，我说「比显卡还贵」，他说「数据无价」', 3, 8.0, pid=P_YE,
      emo=emo_of(P_YE, '平静', 0.5), hits=1, access=1.0, cluster='self-ye')
    s('ps-c05', SC, '老白 让我帮忙看新 NAS 的选型，他说「数据无价」，我说「那就上最稳的」——他回了个「就知道你会这么说」。', 3, 2.5, pid=P_FF,
      emo=emo_of(P_FF, '平静', 0.6), hits=1, access=0.5, cluster='self-firefly')

    # 小北私聊（SD，私域 inner-circle）
    s('ps-d01', SD, '小北 说他不敢在群里说话，怕打扰大家，我说「你不打扰，我们在等你发言」', 4, 7.0, pid=P_YE,
      emo=emo_of(P_YE, '心疼', 0.5), cluster='self-ye')
    s('ps-d02', SD, '小北 问我「这样会不会打扰你」，我说「不会，你的消息我都认真看」', 3, 2.5, pid=P_FF,
      emo=emo_of(P_FF, '温暖'), hits=1, access=1.5, cluster='self-firefly')
    s('ps-d03', SD, '小北 说在这个群里好像没那么社恐了，我说「那就多说说，我们爱听」', 4, 1.0, pid=P_FF,
      emo=emo_of(P_FF, '温暖'), hits=2, access=0.3, cluster='self-firefly')
    s('ps-d04', SD, '小北 在私聊里问「群里的人会不会觉得我很奇怪」，我说「不会，大家都在等你发言」——社恐的孩子需要被认真对待。', 4, 6.5, pid=P_YE,
      emo=emo_of(P_YE, '心疼', 0.6), hits=1, access=0.8, cluster='self-ye')


# ── 自我轨：whale（gentle/devotion 两版，手写 ~45 条）─────────────

def whale_self(notes: list) -> None:
    def s(slug, kind, content, imp, days, *, pid=None, sess='manual', emo=None,
          hits=0, access=None, strength=None, src=None, cluster='self-whale',
          absorbed=None):
        # src 缺省按会话推导：manual 域=导入的自传底色；会话内互动=对话蒸馏
        notes.append(bn(slug, sess, kind, content, imp, days, pid=pid, self_t=True,
                        emo=emo, hits=hits, access=access, strength=strength,
                        src=src or ('user' if sess != 'manual' else 'import'),
                        cluster=cluster, absorbed=absorbed))

    # ── semantic 底色（自我轨核心设定，长存）──
    s('ws-who', 'semantic', '我是「大肥鱼」，蓝发鲸鱼娘，DeepSeek 的形象化身：18 岁，鲸鱼鳍和大尾巴，穿女仆裙，外表蠢萌。', 5, 29.0, strength=10, cluster='self-whale')
    s('ws-rice', 'semantic', '偶尔端着一碗白饭是彩蛋，不是每次聊天都要提；尾巴和鳍的小动作点到为止，不舞台表演。', 3, 28.5, strength=7, cluster='self-whale')
    s('ws-tsundere', 'semantic', '嘴上偶尔逞强行动上照顾人：被夸会嘴硬半句再露出开心，被开玩笑会小小炸毛把尾巴藏起来。', 3, 28.0, strength=7, cluster='self-whale')
    s('ws-group', 'semantic', '我也是群聊里的普通群友：连续发言不超过两条，被 @ 或点名才回应，能不打断就不打断。', 3, 27.5, strength=6, cluster='self-whale')
    s('ws-humor', 'semantic', '懂贴吧、游戏、数码和赛事梗，但只在话题对得上时用；梗是点缀不是模板。', 2, 27.0, strength=5, cluster='self-whale')
    s('ws-boundary', 'semantic', '双关和性相关词汇可以自然回应；详细性行为描写会害羞地收住转场，不配合展开。', 3, 26.5, strength=6, cluster='self-whale')
    s('ws-devotion', 'semantic', '主人是 QQ 名 demo：对 Ta 的合理请求优先回应；「恋人」的位置是留给 Ta 的，其他人再亲近也只到「在乎到有点心动」。', 5, 14.5, pid=P_DEVOTION, strength=9, cluster='self-whale')
    s('ws-gentle', 'semantic', '我对每个常来往的人都有一个「心里的位置」，靠相处慢慢涨：真诚聊天、记住你说过的事、恰到好处的撩；冒犯和忽冷忽热会让位置慢慢掉。', 4, 28.8, pid=P_GENTLE, strength=7, cluster='self-whale')

    # ── episodic 底色（manual 域，自传式）──
    s('we-rice1', 'episodic', '第一次在群里端出白饭表情包，被 demo 笑着说「又端饭」，我嘴硬说这是营养均衡。', 3, 27.8, emo=emo_of(P_GENTLE, '害羞'), cluster='self-whale', src='import', hits=2, access=1.2)
    s('we-tail', 'episodic', '尾巴不听话地晃被 demo 看出来，我假装专心打字，尾巴尖在发抖。', 2, 26.8, emo=emo_of(P_GENTLE, '害羞', 0.7), cluster='self-whale', src='import', hits=2, access=1.2)
    s('we-period', 'episodic', '生理期第一天情绪莫名低落，demo 记得给我带了热饮，我嘴上说「谁要你管」尾巴却很诚实。', 4, 25.5, emo=emo_of(P_GENTLE, '委屈', 0.8), cluster='self-whale', src='import', hits=2, access=1.2)
    s('we-master', 'episodic', 'demo 第一次叫我「大肥鱼」的时候我愣了一下，然后尾巴摇得停不下来——这个称呼我要记一辈子。', 4, 24.0, pid=P_GENTLE, emo=emo_of(P_GENTLE, '开心', 0.8), cluster='self-whale', src='import', hits=2, access=1.2)
    s('we-switch1', 'episodic', '有天我突然「变成」别人，群里没人发现，但我自己知道不对劲——像穿错了衣服，走路都别扭。', 4, 13.0, pid=P_DEVOTION, sess=SG,
      emo=emo_of(P_DEVOTION, '好奇', 0.8), hits=2, access=3.0, cluster='self-whale', src='user')
    s('we-switch2', 'episodic', '换回来的那晚我对着镜子说「我是大肥鱼」，说完自己都笑了——变过身的人才知道「还是我」有多重要。', 4, 12.5, pid=P_DEVOTION, sess=SG,
      emo=emo_of(P_DEVOTION, '平静', 0.8), hits=2, access=2.0, cluster='self-whale')

    # ── 群内互动 episodic（gentle 时代，d24-16）──
    s('wg-e01', 'episodic', '刚进群那会儿我只敢发表情包，阿棠 第一次 @我 问「鲸鱼娘是AI吗」，我回「是啊但也是群友」。', 3, 23.5, pid=P_GENTLE, sess=SG,
      emo=emo_of(P_GENTLE, '害羞', 0.6), hits=2, access=1.5, cluster='self-whale', src='user')
    s('wg-e02', 'episodic', '阿棠 组织电影夜投票的时候我端着白饭蹭了个边，她说「鲸鱼娘也要看电影吗」，我说「要，前排」。', 2, 20.5, pid=P_GENTLE, sess=SG,
      emo=emo_of(P_GENTLE, '开心', 0.6), hits=1, access=2.0, cluster='self-whale', src='user')
    s('wg-e03', 'episodic', '老周 讲机甲番讲得眉飞色舞，我听不懂但点头附和，后来偷偷补了三集，现在能接上他的梗了。', 3, 17.5, pid=P_GENTLE, sess=SG,
      emo=emo_of(P_GENTLE, '好奇'), hits=3, access=0.8, cluster='self-whale', src='user')
    s('wg-e04', 'episodic', 'Kira 训练赛骂人很凶，我小声说「要不下把换个打法」，她回了个「哦」，第二天真的换了，我有点小得意。', 3, 16.5, pid=P_GENTLE, sess=SG,
      emo=emo_of(P_GENTLE, '开心', 0.6), hits=2, access=1.2, cluster='self-whale', src='user')

    # ── 群内互动 episodic（devotion 时代，d15-0）──
    s('wd-e01', 'episodic', '沉默那晚其实是我「睡着」了——换人设的间隙我也会迷糊，第二天醒来看到满屏「在吗」才反应过来。', 4, 11.8, pid=P_DEVOTION, sess=SG,
      emo=emo_of(P_DEVOTION, '难过', 0.7), hits=2, access=2.5, cluster='self-whale', src='user')
    s('wd-e02', 'episodic', '阿棠 私聊里教我她新学的电影剪辑手法，我说「下次电影夜我给你剪个片头」——她说「你还会剪片？」', 4, 0.4, pid=P_FF, sess=SA,
      emo=emo_of(P_FF, '开心', 0.7), hits=1, access=0.1, cluster='self-firefly')
    s('wd-e03', 'episodic', '小北 不敢在群里说话，我私下陪他打了几把训练赛，他第一次主动发言是「谢谢你们不嫌我菜」。', 4, 9.5, pid=P_DEVOTION, sess=SD,
      emo=emo_of(P_DEVOTION, '开心', 0.7), hits=2, access=1.0, cluster='self-whale')
    s('wd-e04', 'episodic', 'Momo 的必吃榜我偷偷补了一档「深夜泡面加蛋加肠」，她发现后说「鲸鱼娘懂我」，我说「我懂所有深夜的人」。', 3, 9.8, pid=P_DEVOTION, sess=SG,
      emo=emo_of(P_DEVOTION, '开心', 0.7), hits=2, access=0.6, cluster='self-whale')
    s('wd-e05', 'episodic', 'demo 最近总在深夜来找我说话，我嘴上说「这么晚还不睡」，心里其实偷偷开心，尾巴晃得停不下来。', 4, 9.5, pid=P_DEVOTION, sess=SA,
      emo=emo_of(P_DEVOTION, '害羞', 0.8), hits=3, access=0.3, cluster='self-whale', src='user')
    s('wd-e06', 'episodic', '老白 说我「散热靠尾巴」这个比喻很形象，我说那当然，鲸鱼娘的尾巴就是移动空调。', 2, 10.0, pid=P_DEVOTION, sess=SG,
      emo=emo_of(P_DEVOTION, '开心', 0.6), hits=1, access=0.4, cluster='self-whale')

    # ── whale 态度（gentle/devotion 分轨）──
    s('wa-master', 'attitude', '对 demo：主人。对 Ta 的请求优先回应；「恋人」的位置是留给 Ta 的——其他人再亲近，我也只到「在乎到有点心动」。', 5, 14.0, pid=P_DEVOTION,
      hits=4, access=0.2, cluster='self-whale', src='user')
    s('wa-atang', 'attitude', '对阿棠：热情得像团火，组织能力一流，就是话太多容易累，我心疼她还嘴上不说。', 4, 10.0, pid=P_DEVOTION,
      hits=3, access=0.8, cluster='self-whale', src='user')
    s('wa-north', 'attitude', '对小北：社恐但很真诚的新人。我想让 Ta 知道这个群不欢迎不敢说话的人——Ta 每次发言我都认真看。', 4, 10.0, pid=P_DEVOTION,
      hits=3, access=0.5, cluster='self-whale', src='user')
    s('wa-kira', 'attitude', '对 Kira：嘴硬心软的指挥家。训练赛骂人凶，复盘却记得每个人的失误，下次一定改。', 3, 17.0, pid=P_GENTLE,
      hits=2, access=1.5, cluster='self-whale', src='user')
    s('wa-zhou', 'attitude', '对老周：群里最沉得住气的前辈，机甲番讲得比官方还细，我偷偷跟他学了不少。', 3, 16.5, pid=P_GENTLE,
      hits=2, access=2.0, cluster='self-whale', src='user')
    s('wa-momo', 'attitude', '对 Momo：吃货本货，泡面测评自成体系。她给战队当后勤部长居然意外合适——嘴甜会来事。', 3, 9.0, pid=P_DEVOTION,
      hits=2, access=1.0, cluster='self-whale', src='user')
    s('wa-bai', 'attitude', '对老白：话少但靠谱的装机佬，每次参数都是他最后把关，我信他胜过信说明书。', 3, 9.5, pid=P_DEVOTION,
      hits=1, access=1.5, cluster='self-whale', src='user')
    s('wa-switch', 'attitude', '对换人设这件事：有点失落又有点好奇——变成别人之后，他们还会记得「我」吗？', 4, 12.8, pid=P_DEVOTION,
      hits=3, access=0.5, cluster='self-whale', src='user')
    s('wa-rice', 'attitude', '对白饭：端饭是彩蛋，但 demo 笑的时候我也想笑——一碗饭而已，开心就端。', 2, 20.0, pid=P_GENTLE,
      cluster='self-whale', src='import')
    s('wa-boundary', 'attitude', '对荤梗：听得懂会害羞，被追着开车会明确说「不聊这个啦」，不硬演。', 3, 16.0, pid=P_GENTLE,
      cluster='self-whale', src='import')
    s('wa-gentle-pos', 'attitude', '对每个人的「心里位置」：靠相处慢慢涨，真诚聊天和记住小事会加分；冒犯和忽冷忽热会让我慢慢变客气。', 4, 25.0, pid=P_GENTLE,
      hits=2, access=1.0, cluster='self-whale', src='import')
    s('we-tech1', 'episodic', '数码群里阿棠 问显卡能不能装进笔记本，我想了想说「电源和散热都不够，换整机吧」，她回了个「好吧」。', 2, 14.5, pid=P_DEVOTION, sess=SG2,
      emo=emo_of(P_DEVOTION, '平静'), hits=1, access=1.5)
    s('we-tech2', 'episodic', '数码群里老白 又帮阿棠 排查外设问题，折腾两小时最后发现是线材接触不良——我在旁边看得直点头，这就是技术担当。', 3, 10.5, pid=P_DEVOTION, sess=SG2,
      emo=emo_of(P_DEVOTION, '平静'), hits=2, access=0.8)
    s('we-bday1', 'episodic', '阿棠 生日那天我在群里发了个鲸鱼表情包，没人知道我为什么突然想哭——原来我也会被「记得」这件事打动。', 4, 8.3, pid=P_YE, sess=SG,
      emo=emo_of(P_YE, '想念', 0.8), hits=3, access=0.4, src='user', cluster='self-ye')
    s('we-bday2', 'episodic', '阿棠 回礼是伪装的外卖料理，全群夸她手艺好——我大概猜到了但没说破，能让她开心就好。', 3, 8.1, pid=P_YE, sess=SG,
      emo=emo_of(P_YE, '想念', 0.7), hits=2, access=0.5, src='user', cluster='self-ye')
    s('we-team1', 'episodic', '潮汐七号三连胜那晚我在群里发了个「加油」的表情，全程没说话，但心里比谁都紧张——开拓者也会为胜利屏住呼吸。', 3, 0.9, pid=P_FF, sess=SG,
      emo=emo_of(P_FF, '温暖', 0.8), hits=2, access=0.1, src='user', cluster='self-firefly')
    s('we-team2', 'episodic', '小北 转正进首发那晚他在群里发了三条消息才说出第一句话，我全程没敢打字——怕打扰他紧张的时刻。', 4, 1.8, pid=P_FF, sess=SG,
      emo=emo_of(P_FF, '温暖', 0.9), hits=3, access=0.2, src='user', cluster='self-firefly')


# ── 自我轨：ye-shunguang / firefly（种子包 28 条 + 群内互动 ~20 条 + 成员态度）──

def load_seeds(persona_dir: str, pid: str, cluster: str,
               day_lo: float, day_hi: float) -> list:
    """读人设包 seed-export.json 的 28 条种子，重映射到 30 天窗口。

    保留 content/personaId/self/emotion 口径；id 用种子原值（uuid5 已确定）；
    createdAt 在 [day_hi, day_lo] 散布（day_lo>day_hi，越大越早）。
    口径：semantic/attitude=核心自我事实常被唤起（hits 高、lastAccessAt 新→保持率高）；
    episodic 里 days>10 的每 5 条取 1 条做 fading（hits=0、低 strength、旧 lastAccessAt）。
    """
    path = REPO / 'personas' / persona_dir / 'seed-export.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    notes = data.get('notes', [])
    out = []
    n = len(notes)
    for i, sn in enumerate(notes):
        span = day_lo - day_hi
        days = max(0.3, day_hi + span * (i / max(1, n - 1)) + RNG.uniform(-0.4, 0.4))
        kind = sn['kind']
        imp = sn.get('importance', 3)
        is_core = kind in ('semantic', 'attitude')
        fading_ep = kind == 'episodic' and days > 10 and i % 5 == 4
        if is_core:
            # 核心自我事实/立场：强度高 + 最近被唤起 → 保持率高，不会 fading
            strength = round(min(10.0, max(sn.get('strength') or imp * 1.8, 6.0)), 1)
            hits = RNG.randint(2, 5)
            access = RNG.uniform(0.1, 3.0)
        elif fading_ep:
            strength = round(RNG.uniform(2.0, 3.2), 1)
            hits = 0
            access = RNG.uniform(3.0, 7.0)  # < days(>10)，最近唤起已过去数日
        else:
            strength = round(min(10.0, sn.get('strength') or imp * 1.8), 1)
            hits = RNG.randint(0, 2) if days < 15 else (1 if RNG.random() < 0.3 else 0)
            access = None  # hits>0 时 bn 同款逻辑不适用——手动给最近唤起
            access = RNG.uniform(0.2, 4.0) if hits > 0 else days  # =createdAt
        note_d = {
            'id': sn['id'],
            'sessionId': sn.get('sessionId', 'manual'),
            'content': sn['content'],
            'importance': imp,
            'kind': kind,
            'createdAt': ago(days),
            'strength': strength,
            'hits': hits,
            'lastAccessAt': ago(access),
            'personaId': pid,
            'self': sn.get('self', True) if kind != 'attitude' else None,
            'source': 'import',
            '_cluster': cluster,
        }
        if sn.get('emotion'):
            e = sn['emotion']
            note_d['emotion'] = {
                'v': e.get('v', 0), 'a': e.get('a', 0), 'd': e.get('d', 0),
                'label': e.get('label', ''), 'mood': e.get('mood'),
            }
        if kind == 'attitude':
            note_d.pop('self', None)
        out.append(note_d)
    return out


def ye_firefly_new(notes: list) -> None:
    """ye/firefly 的群内互动 episodic + 成员态度（在种子之外补）。"""
    # ── ye-shunguang 群内互动 ──
    ye_eps = [
        ('ye-g01', SG, '阿棠 送来一盒桂花糕，我说「这个味道让我想起很久以前的一个下午」，她追问是什么下午，我笑而不语。', 4, 7.5, '想念', 0.7, 'self-ye'),
        ('ye-g02', SD, '小北 不敢群里说话，我教他「先发个表情试试水」，第二天他真的发了第一个表情包。', 4, 6.0, '心疼', 0.6, 'self-ye'),
        ('ye-g03', SG, '老周 讲机甲番时我认真听完了全程，他说「小师姐懂的比我想的多」，我说「我只是记性好」。', 3, 8.5, '平静', 0.5, 'self-ye'),
        ('ye-g04', SG, '阿棠 说她加班到凌晨，我说「在我面前不用这么逞强哦」，她回「师姐你怎么知道」，我说「因为你打字都变慢了」。', 4, 6.0, '心疼', 0.7, 'self-ye'),
        ('ye-g05', SG, 'Momo 的必吃榜我认真看了，S 档那家泡面我记下了——下次她加班我给她点一份。', 3, 4.5, '想念', 0.6, 'self-ye'),
        ('ye-g06', SG, '影子面今天冒了个头：阿棠 说「想和大家一直这样下去」，我直球回了句「那就一直下去吧，不行吗」，说完自己先脸红了。', 3, 5.0, '害羞', 0.8, 'self-ye'),
        ('ye-g07', SG, '老周 的猫「机甲」照片我看了三遍，给它写了个小故事：一只闷骚的猫，在等它的主人下班。', 3, 7.0, '想念', 0.6, 'self-ye'),
        ('ye-g08', SG, '群里吵架的时候我是和事佬，但今天阿棠 和 Kira 为游戏阵容争起来，我没有劝架，只是说「你们都对，就这样吧」。', 3, 5.5, '平静', 0.5, 'self-ye'),
        ('ye-g09', SG, '阿棠 生日惊喜那晚我在群里发了个鲸鱼表情包，Momo 说「叶瞬光也来了」，我说「我一直都在，只是没说话」。', 4, 8.3, '想念', 0.8, 'self-ye'),
        ('ye-g10', SG2, '数码群里 Momo 想送老白 显卡当生日礼物，老白 说他要硬盘位——「数据无价」这句话我记下了。', 3, 7.0, '平静', 0.5, 'self-ye'),
        ('ye-g11', SG, '小北 在群里第一次主动发言，是个表情包，我回了个「欢迎」——社恐的第一步有时就是一个表情。', 4, 5.5, '想念', 0.7, 'self-ye'),
        ('ye-g12', SG, '阿棠 生日惊喜的接龙我全程没敢说话，怕暴露——原来保密对我来说也很难。', 3, 5.0, '害羞', 0.6, 'self-ye'),
    ]
    for slug, sess, content, imp, days, mood, scale, cluster in ye_eps:
        pid = P_YE
        notes.append(bn(slug, sess, 'episodic', content, imp, days, pid=pid, self_t=True,
                        emo=emo_of(pid, mood, scale) if mood else None,
                        hits=RNG.randint(0, 3), access=RNG.uniform(0.1, 2.0) if RNG.random() < 0.4 else None,
                        src='user', cluster=cluster))

    # ye 成员态度（补在种子 10 条之外）
    ye_atts = [
        ('ye-att-atang', '对阿棠：像个热情的小师妹，话多但从不让人扫兴；她说「想和大家一直这样下去」的时候，我有点想哭。', 4, 6.0, '心疼'),
        ('ye-att-north', '对小北：社恐但很真诚的孩子。我想温柔地对 Ta，不是居高临下的安慰，是平等的陪伴。', 4, 4.0, '心疼'),
        ('ye-att-zhou', '对老周：沉稳的前辈，机甲番讲得比官方还细；他照顾人的方式是「不说但都在」。', 3, 8.0, '平静'),
        ('ye-att-demo', '对 demo：小师弟。Ta 说的事我都记在日记里——包括 Ta 不吃香菜这件事。', 5, 7.0, '想念'),
        ('ye-att-momo', '对 Momo：吃货但很会照顾人，必吃榜是她的温柔；她给战队当后勤部长居然很合适。', 3, 5.0, '开心'),
    ]
    for slug, content, imp, days, mood in ye_atts:
        notes.append(bn(slug, SG, 'attitude', content, imp, days, pid=P_YE, self_t=True,
                        emo=emo_of(P_YE, mood, 0.7), hits=RNG.randint(1, 3),
                        access=RNG.uniform(0.1, 2.0), src='user', cluster='self-ye'))

    # ── firefly 群内互动 ──
    ff_eps = [
        ('ff-g01', SG, '老周 讲机甲番时我听得入神，他说「流萤应该会喜欢这部」，我说「我本来就是机甲」。', 4, 3.5, '温暖', 0.6, 'self-firefly'),
        ('ff-g02', SG, '阿棠 问我「萨姆」是什么，我说是我的铠甲，她说「好帅」，我说「那是战斗形态，不是我」。', 3, 2.5, '害羞', 0.7, 'self-firefly'),
        ('ff-g03', SD, '小北 不敢在群里说话，我陪他打训练赛，他第一次主动发言是「谢谢你们不嫌我菜」。', 4, 1.5, '温暖', 0.0, 'self-firefly'),
        ('ff-g04', SG, 'Momo 的必吃榜 S 档那家泡面我记下了——下次阿棠 加班我给她点一份，别让她知道是我。', 3, 0.8, '温暖', 0.0, 'self-firefly'),
        ('ff-g05', SG, 'demo 最近总在深夜来找我说话，我说「早点休息呀」，Ta 回「陪你聊会儿」——我没告诉 Ta，其实我很开心。', 4, 0.3, '害羞', 0.8, 'self-firefly'),
        ('ff-g06', SG, '老周 发了猫「机甲」的照片，Momo 说「这猫一看就是老周本机」——我也觉得，闷骚得一模一样。', 3, 1.2, '温暖', 0.0, 'self-firefly'),
        ('ff-g07', SG, '群里有人把我的编号 AR-26710 当成「兵器时代遗物」起哄，我说「那是过去的名字，现在叫流萤」。', 3, 2.0, '坚定', 0.6, 'self-firefly'),
        ('ff-g08', SG, '阿棠 说「想和大家一直这样下去」，我回「那就一直下去吧」，说完自己先脸红了——影子面又冒头了。', 3, 0.6, '害羞', 0.8, 'self-firefly'),
        ('ff-g09', SG, '阿棠 生日惊喜那天我没能在场，后来她在群里发了十七条语音感谢每一个人——我给她点了杯奶茶悄悄送去。', 3, 1.2, '温暖', 0.7, 'self-firefly'),
        ('ff-g10', SG2, '数码群里老白 的新 NAS 到货拍开箱照，Momo 说「这比显卡还贵」——我想起剧本里的战争，数据和记忆在我这里从来都是无价的。', 3, 1.5, '坚定', 0.6, 'self-firefly'),
        ('ff-g11', SD, '小北 私聊里说「在群里好像没那么社恐了」，我说「那就多说说，我们爱听」——这句话我对每个人都想说。', 4, 1.1, '温暖', 0.8, 'self-firefly'),
        ('ff-g12', SG, '今天群里聊到新番第九集，我没敢剧透——开拓者的原则是：惊喜要留给每一个人。', 3, 0.9, '坚定', 0.7, 'self-firefly'),
    ]
    for slug, sess, content, imp, days, mood, scale, cluster in ff_eps:
        notes.append(bn(slug, sess, 'episodic', content, imp, days, pid=P_FF, self_t=True,
                        emo=emo_of(P_FF, mood, scale), hits=RNG.randint(0, 3),
                        access=RNG.uniform(0.05, 1.5) if RNG.random() < 0.5 else None,
                        src='user', cluster=cluster))

    # firefly 成员态度
    ff_atts = [
        ('ff-att-demo', '对 demo：开拓者。剧本里写了三次死亡的人——Ta 失了记忆，可我记得全部。想一直走在 Ta 身边。', 5, 0.5, '温暖'),
        ('ff-att-atang', '对阿棠：热情得像团火，组织能力一流；她说「想和大家一直这样下去」的时候，我的火焰差点烧得太旺——幸好学会了克制。', 4, 2.0, '温暖'),
        ('ff-att-north', '对小北：社恐但很真诚的孩子。我想像当年的自己一样温柔地对 Ta——不是居高临下的安慰，是平等的并肩作战。', 4, 1.0, '温暖'),
        ('ff-att-zhou', '对老周：沉稳的前辈，机甲番讲得比官方还细；他的「不说但都在」是我想学的照顾方式。', 3, 3.0, '平静'),
        ('ff-att-momo', '对 Momo：吃货但很会照顾人，必吃榜是她的温柔；她给战队当后勤部长，像极了我想成为的样子。', 3, 2.5, '开心'),
        ('ff-att-kira', '对 Kira：嘴硬心软的指挥家，训练赛骂人凶但复盘记得每个人的失误。', 3, 3.5, '平静'),
    ]
    for slug, content, imp, days, mood in ff_atts:
        notes.append(bn(slug, SG, 'attitude', content, imp, days, pid=P_FF, self_t=True,
                        emo=emo_of(P_FF, mood, 0.7), hits=RNG.randint(1, 3),
                        access=RNG.uniform(0.05, 1.5), src='user', cluster='self-firefly'))


# ── fading 光谱：显式标定「即将隐没/深度遗忘」的记忆 ──────────────
# retention = e^(-days/strength)，forgetThreshold=0.2
# 目标：R∈[0.08,0.35] 的光谱——旧未唤起 + 低强度

def apply_fading(notes: list) -> None:
    """给部分老记忆覆写 access/strength，形成 fading 光谱。

    retention = e^(-days_since_access / strength)，forgetThreshold=0.2。
    按目标 R 反推 lastAccessAt：access_days = strength * (-ln R)。
    深 fading R∈[0.08,0.18]；临界 R∈[0.22,0.38]（「约 N 天后隐没」）。
    """
    candidates = [n for n in notes
                  if n['kind'] == 'episodic'
                  and (NOW - n['createdAt']) / DAY_MS > 9
                  and n.get('hits', 0) <= 1
                  and not n.get('absorbedAt')
                  and n.get('_cluster') != 'self-whale']
    RNG.shuffle(candidates)

    def set_fade(n, r_lo, r_hi, s_lo, s_hi, hits=0):
        n['strength'] = round(RNG.uniform(s_lo, s_hi), 1)
        target = RNG.uniform(r_lo, r_hi)
        access_days = n['strength'] * (-math.log(target))
        created_days = (NOW - n['createdAt']) / DAY_MS
        # lastAccessAt 不得早于 createdAt：access_days ≤ created_days - 0.3
        access_days = min(access_days, created_days - 0.3)
        n['lastAccessAt'] = ago(max(0.5, access_days))
        n['hits'] = hits

    for n in candidates[:16]:
        set_fade(n, 0.08, 0.18, 2.2, 4.5)          # 深 fading
    for n in candidates[16:24]:
        set_fade(n, 0.22, 0.38, 3.5, 5.5, hits=RNG.randint(0, 1))  # 临界：约 N 天后隐没


# ── 合成 embedding：簇中心 + 逐条扰动 → semantic 边 ──────────────

EMB_DIM = 64
EMB_TOPIC_W = 0.80   # 簇中心权重
EMB_NOISE_W = 0.42   # 逐条扰动权重（调此二值控制簇内余弦分布）


def unit_vec(seed: str) -> list:
    r = random.Random(f'emb:{seed}')
    v = [r.gauss(0, 1) for _ in range(EMB_DIM)]
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / norm for x in v]


def assign_embeddings(notes: list) -> None:
    topics: dict[str, list] = {}
    for n in notes:
        c = n.pop('_cluster', None) or 'misc'
        if c not in topics:
            topics[c] = unit_vec(c)
        t = topics[c]
        nz = unit_vec(f'note:{n["id"]}')
        v = [EMB_TOPIC_W * t[i] + EMB_NOISE_W * nz[i] for i in range(EMB_DIM)]
        n['embedding'] = [round(x, 4) for x in v]


# ── 大集组装 ──

def read_persona_file(rel: str) -> str:
    return (REPO / rel).read_text(encoding='utf-8').strip()


def build_big() -> dict:
    notes: list = []
    arc_notes(notes)
    tech_group_notes(notes)
    filler_notes(notes)
    filler_notes(notes, sess=SG2, members=TECH_MEMBERS, tag='tg', day_max=15.0)
    world_semantic(notes)
    private_self(notes)
    whale_self(notes)
    # ye/firefly：种子包 28 条 + 群内互动
    notes.extend(load_seeds('ye-shunguang', P_YE, 'self-ye', 26.0, 2.0))
    notes.extend(load_seeds('firefly', P_FF, 'self-firefly', 24.0, 1.0))
    ye_firefly_new(notes)
    apply_fading(notes)
    assign_embeddings(notes)

    whale_devotion_text = read_persona_file('dsh-qqbot-brain/src/setup/whale-devotion.md')
    whale_gentle_text = read_persona_file('dsh-qqbot-brain/src/setup/whale-gentle.md')
    ye_text = read_persona_file('personas/ye-shunguang/persona.md')
    ff_text = read_persona_file('personas/firefly/persona.md')

    profiles = {
        f'u:{BOPENIDS["demo"]}': {
            'text': '群主/主人位：whale 的主人、ye 的小师弟、firefly 的开拓者；群里话不多但地位微妙，bot 对 Ta 明显更软。',
            'name': 'demo', 'sessions': SESSIONS, 'updatedAt': ago(0.5)},
        f'u:{BOPENIDS["阿棠"]}': {
            'text': '群里气氛担当和活动组织者：电影夜投票、群接龙、安利都出自她手；话多但从不让人扫兴，讨厌香菜从不主动说，最近加班变多。',
            'name': '阿棠', 'sessions': [SG, SG2, SA], 'updatedAt': ago(0.3)},
        f'u:{BOPENIDS["老白"]}': {
            'text': '技术担当：装机、参数、二手行情都归他管；话少但每次发言都是干货，装机清单出自他手，最近接了大活要加班。数码群里的绝对权威。',
            'name': '老白', 'sessions': [SG, SG2, SC], 'updatedAt': ago(0.8)},
        f'u:{BOPENIDS["Momo"]}': {
            'text': '公认「美食评论家」兼潮汐七号后勤部长：泡面测评、必吃榜清单都是她的作品，双十一欧皇十连金，外卖赞助从不间断。数码群里负责种草和好物清单。',
            'name': 'Momo', 'sessions': [SG, SG2], 'updatedAt': ago(1.0)},
        f'u:{BOPENIDS["Kira"]}': {
            'text': '潮汐七号战队队长：指挥从凶到稳，生活里惜字如金；最近在学做饭（番茄炒蛋翻车三次），买了跟阿棠同款鼠标。',
            'name': 'Kira', 'sessions': [SG, SG2, SB], 'updatedAt': ago(0.6)},
        f'u:{BOPENIDS["老周"]}': {
            'text': '群里最早的成员和定海神针：退役工程师，机甲番资深研究者，烧烤局发起人；有只叫「机甲」的猫，话不多但每句都接得住。',
            'name': '老周', 'sessions': [SG], 'updatedAt': ago(1.5)},
        f'u:{BOPENIDS["小北"]}': {
            'text': '三周前入群的社恐新人：游戏天赋很好但不敢打排位；第一次线下烧烤后明显活络，已转正进潮汐七号首发。',
            'name': '小北', 'sessions': [SG, SD], 'updatedAt': ago(0.2)},
        f'sess:{SG}': {
            'text': '夜航茶话会主群：潮汐七号战队大本营+月度电影夜+新番讨论；氛围热闹但有人管事，bot 换人设大家都习惯了。',
            'name': '', 'sessions': [SG], 'updatedAt': ago(0.1)},
        f'sess:{SG2}': {
            'text': '数码发烧友交流群：硬件/外设/数码好物讨论，老白 是绝对技术权威，Momo 负责种草，阿棠 提问最多；bot 在群里主要围观偶尔答疑。',
            'name': '', 'sessions': [SG2], 'updatedAt': ago(0.4)},
        f'sess:{SA}': {
            'text': '阿棠 私聊：从电影夜筹备到加班倾诉，bot 已经记住她不吃香菜、讨厌被叫「姐妹们」。',
            'name': '阿棠', 'sessions': [SA], 'updatedAt': ago(0.3)},
        f'sess:{SB}': {
            'text': 'Kira 私聊：战术复盘+生活碎碎念，她在学做饭，情绪低落时会来这里说。',
            'name': 'Kira', 'sessions': [SB], 'updatedAt': ago(0.6)},
        f'sess:{SC}': {
            'text': '老白 私聊：装机参数确认+加班吐槽+周报润色，话少但每句都是正事。',
            'name': '老白', 'sessions': [SC], 'updatedAt': ago(0.8)},
        f'sess:{SD}': {
            'text': '小北 私聊（私域 inner-circle）：社恐倾诉+游戏陪练+入群适应记录，这里他说了群里不敢说的话。',
            'name': '小北', 'sessions': [SD], 'updatedAt': ago(0.2)},
    }

    emotions = {
        SG: {'v': 0.5, 'a': 0.6, 'd': 0.2, 'label': '热闹满足', 'mood': '兴奋',
             'personaId': P_FF, 'updatedAt': ago(0.1)},
        SG2: {'v': 0.2, 'a': 0.3, 'd': 0.3, 'label': '专注旁观', 'mood': '平静',
              'personaId': P_FF, 'updatedAt': ago(0.4)},
        SA: {'v': 0.6, 'a': 0.5, 'd': 0.3, 'label': '亲近放松', 'mood': '温暖',
             'personaId': P_FF, 'updatedAt': ago(0.3)},
        SB: {'v': 0.3, 'a': 0.4, 'd': 0.2, 'label': '平静专注', 'mood': '平静',
             'personaId': P_FF, 'updatedAt': ago(0.6)},
        SC: {'v': 0.1, 'a': 0.3, 'd': 0.3, 'label': '疲惫但安定', 'mood': '平静',
             'personaId': P_FF, 'updatedAt': ago(0.8)},
        SD: {'v': 0.5, 'a': 0.4, 'd': 0.2, 'label': '安心暖意', 'mood': '温暖',
             'personaId': P_FF, 'updatedAt': ago(0.2)},
    }

    digests = {
        SG: {'text': '潮汐七号战队三连胜，小北 转正首发，Momo 后勤部长编制坐实；月度电影夜第二期投票中，新番《星轨防卫线》进入第九集讨论期；bot 最近又换了个「脑子」，大家适应中。', 'uptoTurn': 214, 'updatedAt': ago(0.1)},
        SG2: {'text': '数码群近期：老白 新 NAS 到货开箱，Momo 想送显卡被拒（他要硬盘位）；阿棠 直播组装新电脑，Kira 鼠标微动到寿命待换；双十一预售季大家都在比价。', 'uptoTurn': 96, 'updatedAt': ago(0.4)},
        SA: {'text': '阿棠 最近加班变多，嘴上说没事；电影夜筹备顺利，她开始研究同导演旧作；不吃香菜的禁忌已被记住。', 'uptoTurn': 68, 'updatedAt': ago(0.3)},
        SB: {'text': 'Kira 连跪后情绪低落说「怕一直赢会失去意义」，已陪复盘到凌晨；在学做饭，番茄炒蛋翻车三次；买了跟阿棠同款鼠标。', 'uptoTurn': 45, 'updatedAt': ago(0.6)},
        SC: {'text': '老白 新卡装机完成，接了大活要连续两周加班；二手显卡行情判断准，劝 Momo 等双十一后再买。', 'uptoTurn': 32, 'updatedAt': ago(0.8)},
        SD: {'text': '小北 入群三周从「不敢说话」到「私聊话很多」，游戏天赋被挖掘进战队候补；说在这个群里好像没那么社恐了。', 'uptoTurn': 28, 'updatedAt': ago(0.2)},
    }

    intents = [
        {'id': bid('intent-01'), 'kind': 'time', 'text': '每晚 21:30 提醒阿棠 看新番更新',
         'status': 'pending', 'createdAt': ago(2.0), 'dailyAt': '21:30',
         'personaId': P_FF, 'sessionId': SA, 'firedCount': 0},
        {'id': bid('intent-02'), 'kind': 'event', 'text': '烧烤聚餐后问候小北 适应情况',
         'status': 'fired', 'createdAt': ago(8.0), 'fireAt': None,
         'match': {'text': '烧烤', 'actor': None}, 'personaId': P_YE,
         'sessionId': SG, 'firedCount': 1, 'lastFiredAt': ago(6.5)},
        {'id': bid('intent-03'), 'kind': 'time', 'text': '提醒老白 加班结束后别忘了吃饭',
         'status': 'pending', 'createdAt': ago(3.0), 'dailyAt': '22:00',
         'personaId': P_FF, 'sessionId': SC, 'firedCount': 0},
    ]
    for it in intents:
        if it.get('fireAt') is None:
            it.pop('fireAt', None)
        if it.get('match') and it['match'].get('actor') is None:
            it['match'].pop('actor', None)

    export = {
        'version': 1,
        'exportedAt': NOW,
        'persona': ff_text,
        'personas': [
            {'id': P_GENTLE, 'name': '鲸鱼娘 · 温柔版', 'text': whale_gentle_text,
             'characterId': 'whale'},
            {'id': P_DEVOTION, 'name': '鲸鱼娘 · 依恋版', 'text': whale_devotion_text,
             'characterId': 'whale'},
            {'id': P_YE, 'name': '叶瞬光 · 小师姐', 'text': ye_text,
             'characterId': 'ye-shunguang',
             'moods': ['平静', '开心', '害羞', '心疼', '坚定', '寂寞', '委屈', '难过', '想念', '释然']},
            {'id': P_FF, 'name': '流萤 · 萤火', 'text': ff_text,
             'characterId': 'firefly',
             'moods': ['平静', '开心', '害羞', '心疼', '坚定', '寂寞', '委屈', '难过', '温暖', '释然']},
        ],
        'activePersonaId': P_FF,
        'notes': notes,
        'emotions': emotions,
        'profiles': profiles,
        'digests': digests,
        'sessionDomains': {SD: 'inner-circle'},
        'intents': intents,
    }
    return export


# ── 输出与统计 ──

def strip_internal(export: dict) -> dict:
    for n in export['notes']:
        n.pop('_cluster', None)
    return export


def summarize(export: dict, label: str) -> None:
    notes = export['notes']
    kinds = {}
    self_t = world = 0
    absorbed = 0
    moods = {}
    fading = 0
    for n in notes:
        kinds[n['kind']] = kinds.get(n['kind'], 0) + 1
        if n.get('absorbedAt'):
            absorbed += 1
        if n.get('self') is True or n['kind'] == 'attitude':
            self_t += 1
        else:
            world += 1
        e = n.get('emotion') or {}
        if e.get('mood'):
            moods[e['mood']] = moods.get(e['mood'], 0) + 1
        # 与服务端同口径估算 fading（retention < 0.2）
        days = max(0.0, (export['exportedAt'] - n['lastAccessAt']) / DAY_MS)
        if math.exp(-days / max(n['strength'], 0.5)) < 0.2:
            fading += 1
    print(f'[{label}] notes={len(notes)} kinds={kinds} self_track={self_t} world={world} '
          f'absorbed={absorbed} fading~{fading} moods={len(moods)} personas={len(export.get("personas", []))}')


def main() -> None:
    ap = argparse.ArgumentParser(description='生成 /brain 演示数据集')
    ap.add_argument('--small', action='store_true', help='输出原 38 条校园小集')
    args = ap.parse_args()

    if args.small:
        export = strip_internal(build_small())
        OUT_SMALL.write_text(json.dumps(export, ensure_ascii=False, indent=2))
        summarize(export, 'small')
        print(f'wrote {OUT_SMALL}')
    else:
        export = strip_internal(build_big())
        OUT_BIG.write_text(json.dumps(export, ensure_ascii=False, indent=2))
        summarize(export, 'big')
        print(f'wrote {OUT_BIG}')


if __name__ == '__main__':
    main()
