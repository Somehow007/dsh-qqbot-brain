const memories=[
  {id:'cat',kind:'episodic',label:'第一次提到小橘',text:'用户提起家里收养了一只橘猫，名字叫小橘。',r:92,weight:4,x:270,y:130},
  {id:'food',kind:'semantic',label:'小橘的饮食偏好',text:'小橘喜欢鸡肉口味猫粮，不爱吃鱼罐头。',r:88,weight:3,x:565,y:105},
  {id:'vet',kind:'episodic',label:'带小橘看医生',text:'用户曾带小橘去体检，检查结果没有异常。',r:79,weight:5,x:135,y:300},
  {id:'love',kind:'attitude',label:'关心小橘的近况',text:'对小橘：听用户聊起它时会关心近况，但不过度打扰。',r:86,weight:4,x:455,y:305},
  {id:'rain',kind:'episodic',label:'雨天取消散步',text:'下雨时用户取消了原定的散步，留在家里陪小橘。',r:62,weight:2,x:750,y:267},
  {id:'weekend',kind:'semantic',label:'周末喜欢散步',text:'用户通常喜欢在周末出门散步。',r:74,weight:3,x:230,y:460},
  {id:'park',kind:'episodic',label:'去公园拍照',text:'用户某个周末去公园拍照，提到想多出去走走。',r:52,weight:2,x:535,y:468},
  {id:'rest',kind:'attitude',label:'支持放松休息',text:'对休息：认可用户为自己留一点轻松时间。',r:68,weight:3,x:760,y:455}
];
const relations=[
  {from:'cat',to:'food',reason:'共同提及“小橘”',confidence:'较高'},
  {from:'cat',to:'vet',reason:'共同提及“小橘”',confidence:'较高'},
  {from:'cat',to:'love',reason:'共同提及“小橘”',confidence:'中等'},
  {from:'vet',to:'love',reason:'共同讨论小橘近况',confidence:'中等'},
  {from:'rain',to:'weekend',reason:'共同涉及散步',confidence:'中等'},
  {from:'weekend',to:'park',reason:'共同涉及周末活动',confidence:'较高'},
  {from:'rain',to:'rest',reason:'休息与居家话题',confidence:'较低'}
];
const themes={episodic:'情景',semantic:'语义',attitude:'态度'};
const $=id=>document.getElementById(id),svg=(tag,attrs={})=>{const element=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([key,value])=>element.setAttribute(key,value));return element};
const byId=id=>memories.find(note=>note.id===id);
let active='cat',kind='all',search='',scale=1,pan={x:0,y:0},moving=null,particleOn=!matchMedia('(prefers-reduced-motion: reduce)').matches;
const shown=n=>(kind==='all'||n.kind===kind)&&n.text.includes(search);
$('particleToggle').setAttribute('aria-pressed',String(particleOn));
$('particleToggle').textContent=particleOn?'动态粒子 · 开':'动态粒子 · 关';
function select(id){active=id;render()}
function render(){
  const current=memories.filter(shown),ids=new Set(current.map(note=>note.id)),focused=ids.has(active)?active:null;
  $('graphEmpty').hidden=!!current.length;
  $('graphTransform').setAttribute('transform',`translate(${pan.x} ${pan.y}) scale(${scale})`);
  $('edges').replaceChildren();$('nodes').replaceChildren();
  relations.filter(edge=>ids.has(edge.from)&&ids.has(edge.to)).forEach(edge=>{
    const a=byId(edge.from),b=byId(edge.to),highlight=focused&&(edge.from===focused||edge.to===focused);
    const path=svg('path',{class:`edge${highlight?' active':focused?' muted':''}`,d:`M${a.x} ${a.y} Q${(a.x+b.x)/2} ${(a.y+b.y)/2-19} ${b.x} ${b.y}`});
    $('edges').append(path);
  });
  const connected=new Set(relations.filter(edge=>edge.from===focused||edge.to===focused).flatMap(edge=>[edge.from,edge.to]));
  current.forEach(note=>{
    const group=svg('g',{class:`memory${note.id===focused?' active':''}${focused&&note.id!==focused&&!connected.has(note.id)?' muted':''}`,transform:`translate(${note.x} ${note.y})`,tabindex:0,role:'button','aria-label':`${themes[note.kind]}记忆：${note.text}`,'data-kind':note.kind});
    group.append(svg('circle',{class:'glow',r:28+note.weight*3}),svg('circle',{class:'ring',r:19+note.weight*2,opacity:.47+note.r/200}));
    const glyph=svg('text',{class:'glyph',y:5}),title=svg('text',{class:'label',y:46+note.weight*2}),meta=svg('text',{class:'meta',y:63+note.weight*2});
    glyph.textContent={episodic:'忆',semantic:'知',attitude:'态'}[note.kind];title.textContent=note.label;meta.textContent=`记忆保持 ${note.r}%`;
    group.append(glyph,title,meta);
    group.addEventListener('click',()=>select(note.id));
    group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select(note.id)}});
    $('nodes').append(group);
  });
  $('count').textContent=`${current.length} / ${memories.length} 条`;
  $('relationCount').textContent=`${relations.filter(edge=>ids.has(edge.from)&&ids.has(edge.to)).length} 条推断`;
  if(!focused){
    $('detailTitle').textContent=current.length?'选择一条记忆':'没有匹配的记忆';
    $('detailText').textContent='试试其他筛选条件。';$('detailType').textContent='';$('detailStats').textContent='';$('detailLinks').replaceChildren();
    if($('personaHint'))$('personaHint').textContent='点一条记忆，我带你看看它的关联。';
    return;
  }
  const note=byId(focused);
  $('detailTitle').textContent=note.label;$('detailText').textContent=note.text;
  $('detailType').textContent=themes[note.kind]+'记忆';$('detailStats').textContent=`重要度 ${note.weight}/5  ·  保持率 ${note.r}%`;
  $('detailLinks').replaceChildren();
  const neighbors=relations.filter(edge=>(edge.from===focused||edge.to===focused)&&ids.has(edge.from)&&ids.has(edge.to));
  if($('personaHint'))$('personaHint').textContent=
    neighbors.length>1?`这条附近连着 ${neighbors.length} 条记忆，要顺游吗？`:
    neighbors.length===1?'它还有一条邻居，点开就能顺着游过去～':'这里只有孤零零的一条记忆。';
  if(!neighbors.length){const empty=document.createElement('p');empty.className='link-empty';empty.textContent='该筛选范围内没有推断关联';$('detailLinks').append(empty)}
  neighbors.forEach(edge=>{
    const other=byId(edge.from===focused?edge.to:edge.from),button=document.createElement('button'),head=document.createElement('strong'),caption=document.createElement('small');
    button.className='link-card';button.type='button';head.textContent=other.label;caption.textContent=`推断 · ${edge.reason} · ${edge.confidence}`;
    button.append(head,caption);button.addEventListener('click',()=>select(other.id));$('detailLinks').append(button);
  });
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  kind=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));render();
}));
$('query').addEventListener('input',event=>{search=event.target.value.trim();render()});
function zoom(step){scale=Math.max(.75,Math.min(1.9,scale+step));render()}
$('zoomIn').onclick=()=>zoom(.15);$('zoomOut').onclick=()=>zoom(-.15);
$('zoomReset').onclick=()=>{scale=1;pan={x:0,y:0};render()};
$('particleToggle').onclick=()=>{
  particleOn=!particleOn;$('particleToggle').setAttribute('aria-pressed',String(particleOn));
  $('particleToggle').textContent=particleOn?'动态粒子 · 开':'动态粒子 · 关';
};
const graph=$('graph');
graph.addEventListener('pointerdown',event=>{
  if(event.target.closest('.memory'))return;
  moving={x:event.clientX,y:event.clientY,origin:{...pan}};graph.setPointerCapture(event.pointerId);
});
graph.addEventListener('pointermove',event=>{
  if(!moving)return;
  const box=graph.getBoundingClientRect();
  pan={x:moving.origin.x+(event.clientX-moving.x)*900/box.width,y:moving.origin.y+(event.clientY-moving.y)*570/box.height};render();
});
graph.addEventListener('pointerup',()=>{moving=null});graph.addEventListener('pointercancel',()=>{moving=null});
const canvas=$('particles'),context=canvas.getContext('2d'),bits=Array.from({length:65},(_,i)=>({x:(i*167%907)/907,y:(i*313%587)/587,phase:i*1.77,size:i%8===0?2:1}));
let frame=0;
function animate(){
  const box=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(box.width*ratio)),h=Math.max(1,Math.round(box.height*ratio));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  context.clearRect(0,0,w,h);
  if(particleOn){
    frame+=.0035;
    bits.forEach(bit=>{
      const x=((bit.x+frame*(bit.size===2?.25:.09))%1)*w,y=(bit.y+Math.sin(frame*5+bit.phase)*.023)*h;
      context.beginPath();context.arc(x,y,bit.size*ratio,0,Math.PI*2);
      context.fillStyle=document.body.dataset.theme==='abyss'?'rgba(108,225,247,.32)':'rgba(54,130,211,.30)';
      context.fill();
    });
  }
  requestAnimationFrame(animate);
}
animate();render();
