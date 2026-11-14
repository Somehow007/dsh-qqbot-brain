// 虚构示例数据：四版概念图共用。演示「同一套皮肤，换人设 = 换主色 + 换自我轨」。
window.BRAIN = (() => {
  const personas = [
    { id: 'whale', name: '大肥鱼', en: 'DAFEIYU', mono: '鱼', tagline: '傲娇的蓝色鲸鱼女仆', version: 'whale-v3',
      pal: { a: '#3d7bff', a2: '#8ec5ff', soft: '#e7f0ff', deep: '#0d2a66' },
      traits: [['傲娇', .92], ['嘴硬心软', .84], ['贪吃 token', .76], ['认真靠谱', .68], ['怕被冷落', .55]],
      moods: [['开心', '#ffb938'], ['炸毛', '#ff5d73'], ['委屈', '#9a86ff'], ['平静', '#35c9b0'], ['害羞', '#ff8fbf']],
      mood: '害羞', moodV: .64, say: '哼，才、才不是特意记住你的事呢。' },
    { id: 'ye', name: '叶瞬光', en: 'YE SHUNGUANG', mono: '光', tagline: '严厉又护短的师姐', version: 'ye-shunguang',
      pal: { a: '#c8892a', a2: '#f1cf8a', soft: '#fbf2e2', deep: '#4a2f08' },
      traits: [['严厉', .88], ['护短', .81], ['好为人师', .74], ['不擅表达', .63], ['爱逞强', .52]],
      moods: [['认真', '#c8892a'], ['欣慰', '#7dbb5a'], ['无奈', '#8c8c9e'], ['严厉', '#d2533c'], ['好奇', '#4ba3c7']],
      mood: '欣慰', moodV: .58, say: '这题上次讲过吧？……算了，再讲一遍，听好。' },
    { id: 'firefly', name: '流萤', en: 'FIREFLY', mono: '萤', tagline: '想看一次真正日出的少女', version: 'firefly',
      pal: { a: '#1fae8c', a2: '#9be8d2', soft: '#e4f7f1', deep: '#073d32' },
      traits: [['温柔', .9], ['珍惜当下', .86], ['坚韧', .78], ['羞涩', .66], ['偶尔逞强', .5]],
      moods: [['安心', '#1fae8c'], ['憧憬', '#f0a35c'], ['担忧', '#7a8bd6'], ['羞涩', '#ef8fb0'], ['开心', '#f2c94c']],
      mood: '安心', moodV: .71, say: '嗯，我记得。和你有关的事，我都想好好记住。' },
  ];
  const K = { episodic: '情景', semantic: '语义', attitude: '态度' };
  // track: world=全角色共享；self=仅该角色（char）可见
  const world = [
    { id: 'w1', kind: 'semantic', title: '猫叫年糕', text: '用户家的猫叫年糕，三岁橘猫，很能吃。', day: 20, ret: .92, imp: 4, hits: 14, sess: '私聊' },
    { id: 'w2', kind: 'episodic', title: '年糕踩键盘', text: '用户说年糕把键盘踩出了一串 jjjjjjjj，还发了照片。', day: 2, ret: .81, imp: 2, hits: 3, sess: '私聊' },
    { id: 'w3', kind: 'semantic', title: '在准备 Java 面试', text: '用户在准备 Java 后端面试，目标是年前拿到 offer。', day: 9, ret: .95, imp: 5, hits: 22, sess: '私聊' },
    { id: 'w4', kind: 'episodic', title: '深夜刷链表题', text: '凌晨一点一起刷了三道 LeetCode 链表题，第三道卡了很久。', day: 3, ret: .74, imp: 3, hits: 5, sess: '私聊' },
    { id: 'w5', kind: 'episodic', title: 'JVM 调优没答好', text: '用户说二面被问 JVM 调优，没答好，有点沮丧。', day: 1, ret: .88, imp: 4, hits: 7, sess: '私聊' },
    { id: 'w6', kind: 'semantic', title: '周五爱熬夜', text: '用户周五晚上习惯熬夜到两点以后。', day: 14, ret: .66, imp: 3, hits: 6, sess: '私聊' },
    { id: 'w7', kind: 'episodic', title: '阿杰的猫猫表情包', text: '群里阿杰又发了一张猫猫表情包刷屏。', day: 5, ret: .42, imp: 1, hits: 1, sess: '技术群', who: '阿杰' },
    { id: 'w8', kind: 'semantic', title: '阿杰是室友', text: '阿杰是用户的大学室友，爱开玩笑，常在群里起哄。', day: 25, ret: .71, imp: 3, hits: 9, sess: '技术群', who: '阿杰' },
    { id: 'w9', kind: 'episodic', title: '分享 qqbot 插件', text: '用户在群里分享了自己写的 qqbot 记忆插件。', day: 6, ret: .58, imp: 3, hits: 4, sess: '技术群' },
    { id: 'w10', kind: 'semantic', title: '不吃香菜', text: '用户不喜欢香菜，点外卖会备注。', day: 31, ret: .24, imp: 2, hits: 1, sess: '私聊' },
    { id: 'w11', kind: 'episodic', title: '感冒鼻音', text: '用户感冒了，发语音鼻音很重。', day: 8, ret: .31, imp: 2, hits: 2, sess: '私聊' },
    { id: 'w12', kind: 'semantic', title: '通勤听播客', text: '用户喜欢通勤时听技术播客。', day: 18, ret: .52, imp: 2, hits: 3, sess: '私聊' },
  ].map(m => ({ ...m, track: 'world' }));
  const self = {
    whale: [
      { id: 'sw1', kind: 'attitude', title: '被叫小鱼干', text: '被叫「小鱼干」会假装生气，其实挺受用。', day: 12, ret: .9, imp: 4, hits: 11, emo: '害羞' },
      { id: 'sw2', kind: 'episodic', title: '又被换女仆装', text: '第三次被要求换女仆装，回了句「吃光你 token 喔！」', day: 1, ret: .86, imp: 3, hits: 4, emo: '炸毛', sess: '技术群', who: '阿杰' },
      { id: 'sw3', kind: 'attitude', title: '比用户还紧张面试', text: '对用户的面试比用户自己还紧张，会偷偷准备题。', day: 4, ret: .83, imp: 4, hits: 6, emo: '委屈' },
      { id: 'sw4', kind: 'episodic', title: '被夸靠谱', text: '用户夸她回答靠谱，嘴上说「哼，本来就是」。', day: 4, ret: .7, imp: 3, hits: 2, emo: '开心' },
    ],
    ye: [
      { id: 'sy1', kind: 'attitude', title: '值得指导的后辈', text: '认定用户是值得指导的后辈，会主动敲打。', day: 10, ret: .91, imp: 5, hits: 12, emo: '认真' },
      { id: 'sy2', kind: 'episodic', title: '名字被念错', text: '第一次见面，用户把她名字念成了「叶舜光」。', day: 22, ret: .6, imp: 2, hits: 3, emo: '无奈' },
      { id: 'sy3', kind: 'attitude', title: '看到熬夜就催睡', text: '看到用户熬夜会板起脸催睡，语气很凶。', day: 7, ret: .8, imp: 3, hits: 5, emo: '严厉' },
      { id: 'sy4', kind: 'episodic', title: '复盘 JVM 题', text: '陪用户复盘 JVM 面试题，讲了半小时，最后说「还行，没白教」。', day: 1, ret: .89, imp: 4, hits: 3, emo: '欣慰' },
    ],
    firefly: [
      { id: 'sf1', kind: 'attitude', title: '珍惜平静日常', text: '很珍惜和用户一起度过的平静日常。', day: 15, ret: .93, imp: 5, hits: 10, emo: '安心' },
      { id: 'sf2', kind: 'episodic', title: '想看日出', text: '用户问她最想做什么，她说「想看一次真正的日出」。', day: 11, ret: .78, imp: 4, hits: 4, emo: '憧憬' },
      { id: 'sf3', kind: 'attitude', title: '生病会担心', text: '听到用户生病会格外担心，会反复叮嘱多喝水。', day: 8, ret: .74, imp: 3, hits: 3, emo: '担忧' },
      { id: 'sf4', kind: 'episodic', title: '约好去看海', text: '和用户约好面试结束后一起去看海。', day: 2, ret: .85, imp: 4, hits: 2, emo: '开心' },
    ],
  };
  const linksWorld = [['w2', 'w1', 'consolidate'], ['w4', 'w3', 'consolidate'], ['w5', 'w3', 'consolidate'], ['w7', 'w8', 'consolidate'], ['w2', 'w7', 'similar'], ['w4', 'w6', 'similar'], ['w9', 'w3', 'similar'], ['w4', 'w5', 'session'], ['w9', 'w8', 'session'], ['w11', 'w6', 'similar'], ['w12', 'w3', 'similar']];
  const linksSelf = {
    whale: [['sw2', 'sw1', 'consolidate'], ['sw4', 'sw1', 'consolidate'], ['sw3', 'w5', 'similar'], ['sw3', 'w3', 'similar'], ['sw2', 'w8', 'session']],
    ye: [['sy2', 'sy1', 'consolidate'], ['sy4', 'sy1', 'consolidate'], ['sy3', 'w6', 'similar'], ['sy4', 'w5', 'similar']],
    firefly: [['sf2', 'sf1', 'consolidate'], ['sf4', 'sf1', 'consolidate'], ['sf3', 'w11', 'similar'], ['sf4', 'w3', 'similar']],
  };
  const LT = { consolidate: '沉淀巩固', similar: '语义相似', session: '同会话' };
  function view(pid) {
    const p = personas.find(x => x.id === pid) || personas[0];
    const notes = [...world, ...self[p.id].map(m => ({ ...m, track: 'self', char: p.id }))];
    const links = [...linksWorld, ...linksSelf[p.id]].map(([a, b, t]) => ({ a, b, t }));
    const byId = Object.fromEntries(notes.map(n => [n.id, n]));
    const nb = id => links.filter(l => l.a === id || l.b === id).map(l => ({ ...l, other: byId[l.a === id ? l.b : l.a] }));
    const moodColor = name => (p.moods.find(m => m[0] === name) || [0, '#999'])[1];
    return { p, notes, links, byId, nb, moodColor };
  }
  function applyTheme(p, root = document.documentElement) {
    for (const [k, v] of Object.entries(p.pal)) root.style.setProperty('--' + k, v);
  }
  return { personas, K, LT, view, applyTheme };
})();
