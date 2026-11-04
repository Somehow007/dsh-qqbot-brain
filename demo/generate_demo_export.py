#!/usr/bin/env python3
"""生成虚构演示数据集 → brain-export.demo.json（BrainExport 格式，可直接 import?mode=replace）。

设计目标（参赛展示）：
- 全虚构：人物/会话/openid 均为编造，内容公开安全，无任何真实隐私
- 覆盖三类记忆：episodic 情景 / semantic 语义 / attitude 态度
- 展示生命周期：部分情景记忆被语义巩固吸收（absorbedAt + sourceIds 追溯链）
- 展示人设分轨：attitude 分属两个人设轨（10-31 前 bright，11-01 起 cozy）
- 配套情绪态、画像（u:/sess: 两类键）、会话 digest、一条 manual 全局记忆
- 时间线 2026-10-21 ~ 11-04，强度/命中/访问时间有自然散布

运行：python3 generate_demo_export.py  （输出到本目录 brain-export.demo.json）
"""
import json
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

NS = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  # namespace DNS, 只为确定性
CST = timezone(timedelta(hours=8))
OUT = Path(__file__).parent / 'brain-export.demo.json'


def ts(mmdd_hm: str) -> int:
    """'10-21 20:14' → 2026 年该时刻的 ms epoch（Asia/Shanghai）。"""
    dt = datetime.strptime(f'2026-{mmdd_hm}', '%Y-%m-%d %H:%M').replace(tzinfo=CST)
    return int(dt.timestamp() * 1000)


def nid(slug: str) -> str:
    return str(uuid.uuid5(NS, f'demo-note:{slug}'))


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

export = {
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

OUT.write_text(json.dumps(export, ensure_ascii=False, indent=2))
kinds = {}
absorbed = sum(1 for n in notes if n.get('absorbedAt'))
for n in notes:
    kinds[n['kind']] = kinds.get(n['kind'], 0) + 1
print(f'wrote {OUT}  notes={len(notes)} {kinds} absorbed={absorbed}')
