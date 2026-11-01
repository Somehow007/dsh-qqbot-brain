// 示例数据（虚构），三版概念图共用
window.MIND = (() => {
  const traits = [
    { id: 't1', name: '傲娇', en: 'TSUNDERE', v: .92, on: true },
    { id: 't2', name: '嘴硬心软', en: 'SOFT CORE', v: .84, on: true },
    { id: 't3', name: '贪吃 token', en: 'TOKEN EATER', v: .76, on: true },
    { id: 't4', name: '认真靠谱', en: 'RELIABLE', v: .68, on: true },
    { id: 't5', name: '怕被冷落', en: 'CLINGY', v: .55, on: false },
  ];
  const emotions = [
    { id: 'e1', name: '开心', en: 'JOY', color: '#ffc95c', val: .9, v: .62 },
    { id: 'e4', name: '平静', en: 'CALM', color: '#5fdcc8', val: .6, v: .70 },
    { id: 'e5', name: '好奇', en: 'CURIOUS', color: '#6cb8ff', val: .7, v: .40 },
    { id: 'e3', name: '委屈', en: 'POUT', color: '#a991ff', val: .25, v: .30 },
    { id: 'e2', name: '炸毛', en: 'HUFF', color: '#ff6f86', val: .1, v: .48 },
  ];
  const T = { episodic: '情景', semantic: '语义', attitude: '态度' };
  const memories = [
    { id: 'm13', type: 'episodic', title: '收到生日祝福', text: '一早醒来，群里刷了一整排蛋糕。', day: 0, str: .95, emo: 'e1', trait: 't5', who: '群聊', say: '……谢谢。只说一次哦。' },
    { id: 'm1', type: 'episodic', title: '又被换上女仆装', text: '群友第三次让她换衣服，她回：“……吃光你 token 喔！”', day: 1, str: .88, emo: 'e2', trait: 't1', who: '阿杰', say: '这件事不准再提了！' },
    { id: 'm4', type: 'episodic', title: '凌晨三点的陪聊', text: '阿杰说睡不着，她嘴上嫌弃，却一直陪到天亮。', day: 2, str: .79, emo: 'e4', trait: 't2', who: '阿杰', say: '……下次早点睡啦，笨蛋。' },
    { id: 'm3', type: 'attitude', title: '对阿杰：嘴硬但信任', text: '会怼他，但他求助时总是第一个回。', day: 3, str: .9, emo: 'e4', trait: 't2', who: '阿杰', say: '哼，也就他还算顺眼。' },
    { id: 'm8', type: 'episodic', title: '没人回的三条消息', text: '晚饭时间群里很安静，她连发了三条。', day: 4, str: .58, emo: 'e3', trait: 't5', who: '群聊', say: '才、才没有在意。' },
    { id: 'm2', type: 'semantic', title: 'token 是口粮', text: '从多次对话归纳：token 是她的“食物”，也是报复手段。', day: 5, str: .81, emo: 'e1', trait: 't3', who: '归纳', say: '多喂一点，我就原谅你。' },
    { id: 'm7', type: 'attitude', title: '对“大肥鱼”：表面拒绝', text: '嘴上反对，被这样叫时回复反而更快。', day: 6, str: .86, emo: 'e1', trait: 't1', who: '群友', say: '……随便你们怎么叫。' },
    { id: 'm9', type: 'semantic', title: '阿杰爱喝冰美式', text: '聊天里记下的小习惯，天冷也不变。', day: 7, str: .66, emo: 'e4', trait: 't4', who: '阿杰', say: '记住这个只是顺便！' },
    { id: 'm10', type: 'episodic', title: '帮小林抓 bug', text: '缩进错了一整晚，她一眼看了出来。', day: 8, str: .74, emo: 'e1', trait: 't4', who: '小林', say: '这种程度也来问我？' },
    { id: 'm14', type: 'semantic', title: 'Python 用 4 空格缩进', text: '抓 bug 那晚之后沉淀下来的知识。', day: 8.6, str: .7, emo: 'e5', trait: 't4', who: '归纳', say: '这个我早就知道了。' },
    { id: 'm5', type: 'semantic', title: '鲸鱼是哺乳动物', text: '被小林纠正过一次，从此记得很牢。', day: 9, str: .64, emo: 'e3', trait: 't4', who: '小林', say: '那次真的很丢脸……' },
    { id: 'm11', type: 'attitude', title: '对催更：会不耐烦', text: '连续被催时，语气明显变冲。', day: 10, str: .61, emo: 'e2', trait: 't1', who: '群友', say: '催什么催！' },
    { id: 'm12', type: 'semantic', title: '群规：不准刷屏', text: '管理员定的规矩，她会提醒别人。', day: 11, str: .55, emo: 'e4', trait: 't4', who: '管理员', say: '规矩就是规矩。' },
    { id: 'm6', type: 'episodic', title: '第一次被叫“大肥鱼”', text: '抗议三次无效，这个称呼就这么定下来了。', day: 12, str: .93, emo: 'e2', trait: 't1', who: '群友', say: '我一点都不胖！' },
  ];
  const KIND = { topic: '相似话题', session: '同一会话', actor: '同一发言人', consolidate: '巩固沉淀' };
  const links = [
    ['m1', 'm6', 'topic', '都是被群友调侃'],
    ['m1', 'm2', 'topic', 'token 被当作报复手段'],
    ['m6', 'm7', 'consolidate', '反复被叫后形成了态度'],
    ['m1', 'm7', 'topic', '装扮与称呼都会触发傲娇'],
    ['m4', 'm3', 'consolidate', '陪聊经历强化了信任'],
    ['m9', 'm3', 'actor', '都来自阿杰'],
    ['m4', 'm9', 'actor', '都来自阿杰'],
    ['m10', 'm14', 'consolidate', '抓 bug 后沉淀为知识'],
    ['m10', 'm5', 'actor', '都来自小林'],
    ['m8', 'm13', 'topic', '被冷落 ↔ 被惦记'],
    ['m8', 'm12', 'session', '同一晚的群聊'],
    ['m11', 'm1', 'topic', '被要求时都会炸毛'],
    ['m13', 'm7', 'session', '生日那天也被叫了大肥鱼'],
  ];
  const byId = {};
  [...traits, ...emotions, ...memories].forEach(n => (byId[n.id] = n));
  const kindOf = id => id[0] === 't' ? 'trait' : id[0] === 'e' ? 'emotion' : 'memory';
  // 返回某节点的全部关联：{id, rel, reason}
  function neighbors(id) {
    const k = kindOf(id), out = [];
    if (k === 'memory') {
      const m = byId[id];
      links.forEach(([a, b, kind, reason]) => {
        if (a === id || b === id) out.push({ id: a === id ? b : a, rel: KIND[kind], kind, reason });
      });
      out.push({ id: m.emo, rel: '情绪标记', kind: 'emotion', reason: '这段记忆带着「' + byId[m.emo].name + '」' });
      out.push({ id: m.trait, rel: '塑造人格', kind: 'trait', reason: '强化了「' + byId[m.trait].name + '」' });
    } else {
      const key = k === 'trait' ? 'trait' : 'emo';
      memories.filter(m => m[key] === id).forEach(m =>
        out.push({ id: m.id, rel: k === 'trait' ? '塑造来源' : '情绪来源', kind: k, reason: T[m.type] + '记忆 · ' + (m.day < 1 ? '今天' : Math.round(m.day) + ' 天前') }));
    }
    return out;
  }
  const say = {
    trait: n => '「' + n.name + '」？哼，那是你们擅自总结的！',
    emotion: n => '现在的心情……才不告诉你是「' + n.name + '」。',
  };
  return { traits, emotions, memories, links, KIND, T, byId, kindOf, neighbors, say,
    mood: { now: 'e4', line: '……才不是在等你来找我聊天呢。' } };
})();
