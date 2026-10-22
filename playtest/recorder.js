/* =========================================================
   《祭》内测试玩记录器  —  ?rec=1 时由 game.js 动态加载
   =========================================================
   只做三件事：
   1. 记录玩家真正做了什么（按键、屏幕上的每一句字幕与提示、状态变化）
   2. 可选地录下屏幕 + 麦克风（本地保存，不上传）
   3. 一局结束时导出成一个 JSON，report.html 可以直接读

   刻意不依赖游戏内部实现：只读 window.__jiThird 的公开状态和 DOM 上
   玩家看得见的文字，所以游戏怎么改，记录器都不用跟着改。
   ========================================================= */
(function(){
'use strict';
if (window.__jiRec) return;

const SCHEMA='ji-playtest/1';
const REC_VER='1.1';
const T0=Date.now();
const QS=new URLSearchParams(location.search);

// keys the game actually binds; anything else (devtools, browser shortcuts)
// would just be noise in the log
const GAME_KEYS=new Set([
  'KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ','KeyF','KeyR','KeyL','KeyM','KeyP','KeyC',
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Escape','Enter','Tab',
  'Digit1','Digit2','Digit3'
]);

function two(n){ return n<10?'0'+n:''+n; }
function clock(ms){
  ms=Math.max(0,Math.round(ms||0));
  const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60);
  return (h?h+':'+two(m%60):m)+':'+two(s%60);
}
function sid(){
  return 'p'+String(Date.now()).slice(-6)+Math.random().toString(36).slice(2,5);
}
function esc(s){
  return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

const S={
  id:sid(), name:'', notes:'', events:[],
  startedAt:new Date().toISOString(),
  open:false, exported:false, endingSeen:false,
  lastKeyAt:T0, lastActAt:T0,
  media:null, chunks:[], stream:null, bitRate:3000000, recStart:0, recBytes:0,
  jank:{n:0,max:0,sum:0}, errors:[], chapterAt:{}, chapterTimes:[],
  autoTried:false, closing:false, restored:null, lastChapter:0
};

/* ---------------------------------------------------------
   events
   --------------------------------------------------------- */
function ev(type,data){
  const e=Object.assign({t:Date.now()-T0,type},data||{});
  S.events.push(e);
  if (type!=='jank' && type!=='state') S.lastActAt=Date.now();
  scheduleSave();
  scheduleRender();
  return e;
}

/* ---------------------------------------------------------
   state snapshot + diff
   --------------------------------------------------------- */
function snapshot(st){
  const rt=st.ritual||{}, c=st.corr||{}, d=st.dark||{}, h=st.hunt||{}, hi=st.hide||{};
  const seen=(o)=>o?((o.line?1:0)+(o.bench?1:0)+(o.wall?1:0)):0;
  const seenC=(o)=>o?((o.roomSeen?1:0)+(o.facesSeen?1:0)+(o.nameSeen?1:0)):0;
  const cz=st.cameraScan||{};
  return {
    chapter: st.chapter||0,
    scene: st.scene||'',
    camera: st.camera?1:0,
    battery: Math.round(st.battery||0),
    paused: st.paused?1:0,
    review: st.review?1:0,
    case: st.caseOpen?1:0,
    transition: st.transition?1:0,
    ending: st.ending||'',
    ritual:{ i:rt.incense, b:rt.bowl, t:rt.thread, done:rt.done?1:0, loop:rt.loop||0 },
    hunt:{ mode:h.mode||'', count:h.count||0 },
    hide:{ round:hi.round||0, left:Math.round(hi.remaining||0), active:hi.active?1:0 },
    photos:{ i:st.photos&&st.photos.incense?1:0, b:st.photos&&st.photos.bowl?1:0, t:st.photos&&st.photos.thread?1:0 },
    anomaly:{ i:st.anomalies&&st.anomalies.incense?1:0, b:st.anomalies&&st.anomalies.bowl?1:0, t:st.anomalies&&st.anomalies.thread?1:0 },
    gate:{ frame:st.ch3FrameGate?1:0, ok:st.ch3FrameOk?1:0 },
    final:{ photo:st.finalPhoto?1:0, phone:st.phoneDone?1:0, hand:st.handRaised?1:0, mismatch:st.mismatch?1:0, choice:st.choice?1:0 },
    corridor:{ depth:+(c.depth||0).toFixed(2), answered:c.answered?1:0, seen:seenC(c), look:c.lookOn?1:0 },
    dark:{ depth:+(d.depth||0).toFixed(2), seen:seen(d&&d.seen?d.seen:null), open:d.open?1:0, split:d.split?1:0, print:d.print?1:0, off:d.v!=null&&d.target!=null?+((d.v-d.target)*100).toFixed(0):null }
  };
}
function flatten(o,prefix,out){
  out=out||{};
  for (const k in o){
    const v=o[k], key=prefix?prefix+'.'+k:k;
    if (v&&typeof v==='object'&&!Array.isArray(v)) flatten(v,key,out);
    else out[key]=v;
  }
  return out;
}

let lastFlat=null;
function poll(){
  const g=window.__jiThird;
  if (!g||!g.state) return;
  const st=g.state;
  const flat=flatten(snapshot(st),'',{});
  if (!lastFlat){
    lastFlat=flat;
    ev('state',{d:flat,first:1});
  } else {
    const d={};
    let n=0;
    for (const k in flat){ if (lastFlat[k]!==flat[k]){ d[k]=flat[k]; n++; } }
    if (n){
      lastFlat=flat;
      ev('state',{d:d});
    }
  }
  if (st.ended && st.ending && !S.endingSeen){
    S.endingSeen=true;
    ev('ending',{kind:st.ending});
    onEnding(st.ending);
  }
  if (st.chapter && S.lastChapter!==st.chapter){
    const now=Date.now();
    if (S.lastChapter){
      S.chapterTimes.push({chapter:S.lastChapter, ms:now-S.chapterAt[S.lastChapter]});
    }
    S.lastChapter=st.chapter;
    S.chapterAt[st.chapter]=now;
    ev('chapter',{n:st.chapter});
  }
}

/* ---------------------------------------------------------
   what the player can read
   --------------------------------------------------------- */
function watchText(id,type){
  const el=document.getElementById(id);
  if (!el) return;
  let shown='';
  const read=()=>{
    const vis=!el.classList.contains('hidden') && el.offsetParent!==null;
    const t=(el.textContent||'').replace(/\s+/g,' ').trim();
    if (vis && t && t!==shown){ shown=t; ev(type,{text:t}); }
    if (!vis) shown='';
  };
  new MutationObserver(read).observe(el,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
  read();
}
function watchChapter(){
  const name=document.getElementById('chapterName');
  const kick=document.getElementById('chapterKicker');
  const obj=document.getElementById('chapterObj');
  if (!name) return;
  let key='';
  const read=()=>{
    const k=(kick?kick.textContent:'')+'|'+name.textContent+'|'+(obj?obj.textContent:'');
    if (k!==key){ key=k; ev('goal',{kicker:(kick?kick.textContent:''),name:name.textContent,obj:(obj?obj.textContent:'').replace(/\s+/g,' ').trim()}); }
  };
  new MutationObserver(read).observe(name.parentNode||name,{childList:true,characterData:true,subtree:true});
  read();
}
function watchEnd(){
  const el=document.getElementById('endTitle');
  if (!el) return;
  new MutationObserver(()=>{
    const t=(el.textContent||'').trim();
    if (t) ev('endscreen',{title:t});
  }).observe(el,{childList:true,characterData:true,subtree:true});
}

/* ---------------------------------------------------------
   input / errors / perf
   --------------------------------------------------------- */
function bindInput(){
  window.addEventListener('keydown',e=>{
    if (e.repeat) return;
    if (!GAME_KEYS.has(e.code)) return;
    const now=Date.now();
    const gap=now-S.lastKeyAt;
    if (gap>20000 && S.lastKeyAt>T0+1500){
      ev('gap',{ms:gap, where:whereNow()});
    }
    S.lastKeyAt=now;
    const mods=(e.ctrlKey?'c': '')+(e.metaKey?'m':'')+(e.altKey?'a':'');
    ev('key',{k:e.code.replace(/^Key/,'').replace(/^Digit/,'#'), down:1, mods:mods});
  },true);
  window.addEventListener('keyup',e=>{
    if (!GAME_KEYS.has(e.code)) return;
    ev('key',{k:e.code.replace(/^Key/,'').replace(/^Digit/,'#'), down:0});
  },true);
  window.addEventListener('error',e=>{
    const m=(e.message||'error')+' @'+(e.lineno||0);
    if (S.errors.indexOf(m)<0){ S.errors.push(m); ev('error',{msg:m}); }
  });
  window.addEventListener('unhandledrejection',e=>{
    const m='promise: '+((e.reason&&e.reason.message)||e.reason||'?');
    if (S.errors.indexOf(m)<0){ S.errors.push(m); ev('error',{msg:m}); }
  });
  // frame stalls: the most useful perf signal for a 2D canvas game
  let prev=0;
  function raf(ts){
    if (prev && ts-prev>150 && document.visibilityState==='visible'){
      const ms=Math.round(ts-prev);
      S.jank.max=Math.max(S.jank.max,ms);
      S.jank.n++;
      S.jank.sum+=ms;
      if (ms>=250 && S.jank.n<200) ev('jank',{ms:ms});
    }
    prev=ts;
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}
function whereNow(){
  const g=window.__jiThird;
  if (!g||!g.state) return '';
  const st=g.state;
  if (st.ending) return '结局 '+st.ending;
  if (st.scene==='darkroom') return '第二幕 · 暗房';
  if (st.scene==='corridor') return '门后走廊';
  return '第 '+st.chapter+' 遍';
}

/* ---------------------------------------------------------
   screen + mic recording
   --------------------------------------------------------- */
function nowRecBytes(){
  return S.chunks.reduce((n,c)=>n+(c.size||0),0);
}
async function startMedia(){
  if (S.media) return;
  let disp;
  try {
    disp=await navigator.mediaDevices.getDisplayMedia({
      video:{frameRate:30},
      audio:false
    });
  } catch(err){
    toast('没有开始录屏：'+(err&&err.name==='NotAllowedError'?'你取消了共享':'浏览器不允许')+'。记录仍会继续。');
    return;
  }
  let mic=null;
  try {
    mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  } catch(err){ /* put on headphones and skip the mic; the log still works */ }

  const tracks=disp.getVideoTracks().slice();
  if (mic) tracks.push.apply(tracks,mic.getAudioTracks());
  S.stream=new MediaStream(tracks);

  const mimes=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mime=mimes.filter(m=>window.MediaRecorder&&MediaRecorder.isTypeSupported(m))[0]||'';
  try {
    S.media=new MediaRecorder(S.stream, mime?{
      mimeType:mime, videoBitsPerSecond:S.bitRate, audioBitsPerSecond:96000
    }:{});
  } catch(err){
    toast('这个浏览器不支持 MediaRecorder，录屏跳过。');
    S.stream.getTracks().forEach(t=>t.stop());
    S.stream=null; S.media=null;
    return;
  }
  S.chunks=[];
  S.media.ondataavailable=e=>{ if (e.data&&e.data.size) { S.chunks.push(e.data); scheduleRender(); } };
  S.media.onstop=()=>finishMedia();
  S.media.start(1000);
  S.recStart=Date.now();
  S.recBytes=0;
  ev('rec',{on:1,mime:mime||'default',bitrate:S.bitRate,mic:!!mic});
  const vt=disp.getVideoTracks()[0];
  if (vt) vt.addEventListener('ended',()=>stopMedia(true));
  toast('录屏开始。选中的标签页如果被切走，画面会跟着变。');
  render();
}
function stopMedia(auto){
  if (!S.media) return;
  try { S.media.stop(); } catch(err){}
  if (S.stream) S.stream.getTracks().forEach(t=>t.stop());
  S.stream=null;
  if (auto) toast('共享已结束，正在保存录屏…');
}
function finishMedia(){
  const ms=Date.now()-S.recStart;
  S.recBytes=nowRecBytes();
  ev('rec',{on:0,ms:ms,bytes:S.recBytes});
  const type=(S.media&&S.media.mimeType)||'video/webm';
  const blob=new Blob(S.chunks,{type:type.split(';')[0]});
  S.media=null;
  if (blob.size>0){
    saveBlob(`ji-playtest_${S.id}${nameSuffix()}.webm`, blob);
    toast('录屏已保存（'+Math.round(blob.size/1048576)+' MB）。');
  }
  S.chunks=[];
  render();
}

/* ---------------------------------------------------------
   export
   --------------------------------------------------------- */
function nameSuffix(){
  const n=(S.name||'').replace(/[^\w\u4e00-\u9fa5-]+/g,'_').slice(0,24);
  return n?'_'+n:'';
}
function summary(){
  let keys=0, gait=0, jank=0, jankMax=0, errors=0, longest=null;
  const keyCounts={};
  for (const e of S.events){
    if (e.type==='key'&&e.down){ keys++; keyCounts[e.k]=(keyCounts[e.k]||0)+1; }
    if (e.type==='gap'&&(!longest||e.ms>longest.ms)) longest={ms:e.ms,where:e.where,t:e.t};
    if (e.type==='jank') jank++;
    if (e.type==='error') errors++;
    if (e.type==='rec'&&e.on===0) gait=e.ms;
  }
  jankMax=S.jank.max;
  const g=window.__jiThird;
  const st=g&&g.state;
  return {
    durationMs: Date.now()-T0,
    // the game's own clock is the honest pacing number: wall time includes
    // tab switches and the pause menu
    gameSeconds: st&&typeof st.time==='number'?+st.time.toFixed(1):0,
    ending: st?(st.ending||''):'',
    chapter: st?st.chapter:0,
    scene: st?st.scene:'',
    keys: keys, keyCounts: keyCounts,
    events: S.events.length,
    longestGapMs: longest?longest.ms:0,
    longestGapWhere: longest?longest.where:'',
    jank: jank, jankMaxMs: jankMax,
    errors: errors,
    recordMs: gait,
    chapterTimes: S.chapterTimes.slice(),
    progress: st?{
      photos: st.photos?((st.photos.incense?1:0)+(st.photos.bowl?1:0)+(st.photos.thread?1:0)):0,
      corridorSeen: st.corr?((st.corr.roomSeen?1:0)+(st.corr.facesSeen?1:0)+(st.corr.nameSeen?1:0)):0,
      darkSeen: st.dark&&st.dark.seen?((st.dark.seen.line?1:0)+(st.dark.seen.bench?1:0)+(st.dark.seen.wall?1:0)):0,
      spliced: !!(st.dark&&st.dark.split),
      printed: !!(st.dark&&st.dark.print)
    }:null
  };
}
function payload(){
  const g=window.__jiThird;
  return {
    schema: SCHEMA,
    recorder: REC_VER,
    session: {
      id: S.id, startedAt: S.startedAt, endedAt: new Date().toISOString(),
      tester: S.name||'', notes: S.notes||'',
      url: location.href.split('?')[0],
      userAgent: navigator.userAgent,
      viewport: [window.innerWidth, window.innerHeight],
      dpr: window.devicePixelRatio||1,
      screen: [window.screen.width, window.screen.height],
      language: navigator.language,
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone||'')
    },
    game: {
      version: (document.querySelector('.creditsMeta span')||{}).textContent||'',
      mode: QS.get('rec')||''
    },
    summary: summary(),
    events: S.events,
    // a full state snapshot at the end, so a session can be replayed without
    // guessing what the last diff added up to
    finalState: (function(){
      try { return g&&g.state?snapshot(g.state):null; } catch(e){ return null; }
    })()
  };
}
function exportJSON(quiet){
  const data=payload();
  const text=JSON.stringify(data,null,2);
  saveBlob(`ji-playtest_${S.id}${nameSuffix()}.json`, new Blob([text],{type:'application/json'}));
  S.exported=true;
  ev('export',{bytes:text.length});
  if (!quiet) toast('已导出 JSON（'+Math.round(text.length/1024)+' KB）。录屏会在停止时单独保存。');
  render();
  return data;
}
function mdSummary(){
  const s=summary();
  const lines=[];
  lines.push('### 试玩记录 `'+S.id+'`');
  if (S.name) lines.push('- 试玩者：'+S.name);
  lines.push('- 时长：'+clock(s.durationMs)+'（游戏内章节 '+s.chapter+'）');
  lines.push('- 结局：'+(s.ending||'未到结局'));
  if (s.chapterTimes.length){
    lines.push('- 分章：'+s.chapterTimes.map(x=>'第'+x.chapter+'遍 '+clock(x.ms)).join(' · '));
  }
  lines.push('- 按键：'+s.keys+'　最长停顿：'+(s.longestGapMs?clock(s.longestGapMs)+'（'+s.longestGapWhere+'）':'无'));
  lines.push('- 卡顿：'+s.jank+' 次'+(s.jankMaxMs?'，最大 '+s.jankMaxMs+'ms':'')+'　报错：'+s.errors);
  if (s.progress){
    const p=s.progress;
    lines.push('- 进度：照片 '+p.photos+'/3 · 走廊 '+p.corridorSeen+'/3 · 暗房 '+p.darkSeen+'/3'+(p.spliced?' · 已接带':'')+(p.printed?' · 已洗印':''));
  }
  if (S.notes) lines.push('- 一句话感受：'+S.notes);
  lines.push('- 记录文件：`ji-playtest_'+S.id+'.json`');
  return lines.join('\n');
}
function saveBlob(name, blob){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),8000);
}
async function copySummary(){
  const t=mdSummary();
  try { await navigator.clipboard.writeText(t); toast('摘要已复制，可以直接贴给我。'); }
  catch(err){ toast('浏览器不让复制，请用下面的文本框手动复制。'); showRaw(t); }
}
function showRaw(t){
  let box=document.getElementById('recRaw');
  if (!box){
    box=document.createElement('textarea');
    box.id='recRaw'; box.className='recRaw';
    document.getElementById('recPanel').appendChild(box);
  }
  box.value=t; box.classList.remove('hidden'); box.focus(); box.select();
}

/* ---------------------------------------------------------
   persistence (a crash or an accidental refresh must not lose the log)
   --------------------------------------------------------- */
const LS='ji.rec.v1';
let saveAt=0, saveTimer=0;
function scheduleSave(){
  if (saveTimer) return;
  saveTimer=setTimeout(()=>{
    saveTimer=0;
    try {
      localStorage.setItem(LS, JSON.stringify({
        id:S.id, name:S.name, notes:S.notes, startedAt:S.startedAt,
        events:S.events.slice(-4000), exported:S.exported
      }));
    } catch(err){ /* quota: the log is exported at the end anyway */ }
  },1200);
}
function restoreOffer(){
  try {
    const raw=localStorage.getItem(LS);
    if (!raw) return;
    const d=JSON.parse(raw);
    if (!d||!d.events||d.events.length<5) return;
    const last=d.events[d.events.length-1];
    const dur=(last.t||0);
    if (dur<20000) return;
    S.restored=d;
    S.open=true;
    render();
    setTimeout(()=>toast('发现上次未导出的记录（'+clock(dur)+'）。点面板里的“导出上次”保存。'),900);
  } catch(err){}
}
function clearStored(){ try { localStorage.removeItem(LS); } catch(err){} }

/* ---------------------------------------------------------
   UI
   --------------------------------------------------------- */
let renderPending=false;
function scheduleRender(){
  if (renderPending) return;
  renderPending=true;
  requestAnimationFrame(()=>{ renderPending=false; render(); });
}
function buildUI(){
  const root=document.createElement('div');
  root.id='recRoot';
  root.innerHTML=[
    '<button id="recPill" type="button" aria-label="试玩记录器">',
      '<span id="recDot" class="recDot"></span>',
      '<span id="recTime">00:00</span>',
      '<span class="recSep">·</span>',
      '<span id="recN">0</span>',
    '</button>',
    '<section id="recPanel" class="hidden" aria-label="试玩记录">',
      '<header class="recHead">',
        '<b>试玩记录</b>',
        '<span id="recSid" class="recSid"></span>',
        '<button id="recX" type="button" class="recX" aria-label="收起">×</button>',
      '</header>',
      '<div class="recBody">',
        '<label class="recField"><span>试玩者</span><input id="recName" maxlength="24" placeholder="代号或昵称（可留空）" autocomplete="off"></label>',
        '<div class="recMediaRow">',
          '<button id="recScreen" type="button" class="recBtn">开始录屏</button>',
          '<select id="recQ" aria-label="录屏画质">',
            '<option value="1200000">省空间 1.2 Mbps</option>',
            '<option value="3000000" selected>标准 3 Mbps</option>',
            '<option value="6000000">清晰 6 Mbps</option>',
          '</select>',
        '</div>',
        '<div id="recMediaHint" class="recHint">录屏保存在本机，不会上传。选择“此标签页”即可，允许麦克风可以边玩边说。</div>',
        '<label class="recField"><span>一句话感受</span><textarea id="recNotes" rows="2" maxlength="400" placeholder="哪里卡住了 / 哪里吓到了 / 哪句没看懂"></textarea></label>',
        '<div class="recBtns">',
          '<button id="recExport" type="button" class="recBtn primary">导出 JSON</button>',
          '<button id="recCopy" type="button" class="recBtn">复制摘要</button>',
        '</div>',
        '<div id="recStats" class="recStats"></div>',
        '<div id="recRestore" class="recRestore hidden">',
          '<div id="recRestoreText" class="recHint"></div>',
          '<div class="recBtns">',
            '<button id="recRestoreGo" type="button" class="recBtn">导出上次</button>',
            '<button id="recRestoreDrop" type="button" class="recBtn ghost">丢弃</button>',
          '</div>',
        '</div>',
        '<div class="recFoot">快捷键 Alt+Shift+R 收起 / 展开　·　记录只在本机</div>',
      '</div>',
    '</section>',
    '<div id="recToast" class="recToast hidden"></div>'
  ].join('');
  document.body.appendChild(root);

  // typing in the panel must never drive the game
  ['keydown','keyup','keypress'].forEach(t=>{
    root.addEventListener(t,e=>{ if (e.target!==document.body) e.stopPropagation(); },true);
  });
  root.addEventListener('pointerdown',e=>e.stopPropagation());

  const pill=document.getElementById('recPill');
  const panel=document.getElementById('recPanel');
  pill.addEventListener('click',()=>{ S.open=!S.open; render(); });
  document.getElementById('recX').addEventListener('click',()=>{ S.open=false; render(); });

  const nameEl=document.getElementById('recName');
  nameEl.addEventListener('input',()=>{ S.name=nameEl.value.trim(); scheduleSave(); });
  const notesEl=document.getElementById('recNotes');
  notesEl.addEventListener('input',()=>{ S.notes=notesEl.value; scheduleSave(); });

  const q=document.getElementById('recQ');
  q.addEventListener('change',()=>{ S.bitRate=parseInt(q.value,10)||3000000; });

  document.getElementById('recScreen').addEventListener('click',()=>{
    if (S.media) stopMedia();
    else startMedia();
  });
  document.getElementById('recExport').addEventListener('click',()=>exportJSON());
  document.getElementById('recCopy').addEventListener('click',copySummary);
  document.getElementById('recRestoreGo').addEventListener('click',()=>{
    const d=S.restored; if (!d) return;
    saveBlob(`ji-playtest_${d.id}_rescued.json`, new Blob([JSON.stringify({
      schema:SCHEMA, recorder:REC_VER, rescued:true, session:d, events:d.events,
      summary:{durationMs:(d.events[d.events.length-1]||{}).t||0}
    },null,2)],{type:'application/json'}));
    clearStored(); S.restored=null; render();
    toast('上次的记录已导出。');
  });
  document.getElementById('recRestoreDrop').addEventListener('click',()=>{
    clearStored(); S.restored=null; render();
  });

  window.addEventListener('keydown',e=>{
    if (e.altKey && e.shiftKey && e.code==='KeyR'){ e.preventDefault(); S.open=!S.open; render(); }
  },true);
}
function render(){
  const pill=document.getElementById('recPill');
  if (!pill) return;
  const panel=document.getElementById('recPanel');
  panel.classList.toggle('hidden',!S.open);
  pill.classList.toggle('on',S.open);

  const dur=Date.now()-T0;
  document.getElementById('recTime').textContent=clock(dur);
  document.getElementById('recN').textContent=S.events.length;
  document.getElementById('recDot').classList.toggle('live',!!S.media);

  const sidEl=document.getElementById('recSid');
  if (sidEl) sidEl.textContent=S.id;

  const btn=document.getElementById('recScreen');
  if (btn){
    btn.textContent=S.media?('停止并保存 · '+clock(Date.now()-S.recStart)):'开始录屏';
    btn.classList.toggle('danger',!!S.media);
    document.getElementById('recMediaHint').textContent=S.media
      ? ('正在录 '+clock(Date.now()-S.recStart)+' · 约 '+Math.max(1,Math.round(nowRecBytes()/1048576))+' MB'+
         (document.getElementById('recQ').value==='6000000'?'':'')+'。别关这个标签页。')
      : '录屏保存在本机，不会上传。选择“此标签页”即可，允许麦克风可以边玩边说。';
  }
  const st=document.getElementById('recStats');
  if (st){
    const s=summary();
    st.innerHTML='<span>'+clock(dur)+'</span><span>'+(s.ending?('结局 '+esc(s.ending)):('第 '+esc(s.chapter)+' 遍'))+'</span>'+
      '<span>按键 '+s.keys+'</span><span>卡顿 '+s.jank+'</span>';
  }
  const rest=document.getElementById('recRestore');
  if (rest){
    rest.classList.toggle('hidden',!S.restored);
    if (S.restored){
      const d=S.restored;
      const last=d.events[d.events.length-1]||{};
      document.getElementById('recRestoreText').textContent=
        '上次的记录没有导出：'+clock(last.t||0)+' · '+d.events.length+' 条'+(d.name?(' · '+d.name):'')+'。';
    }
  }
  const nameEl=document.getElementById('recName');
  if (nameEl && document.activeElement!==nameEl) nameEl.value=S.name;
  const notesEl=document.getElementById('recNotes');
  if (notesEl && document.activeElement!==notesEl) notesEl.value=S.notes;
}
let toastTimer=0;
function toast(msg,ms){
  const el=document.getElementById('recToast');
  if (!el) return;
  el.textContent=msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.add('hidden'),ms||5200);
}
function onEnding(kind){
  scheduleRender();
  const label=({help:'结局 · 帮她',film:'结局 · 继续拍',bad:'坏结局'})[kind]||('结局 · '+kind);
  toast(label+'。点右下角导出记录'+(S.media?'，或先停止录屏':'')+'。',12000);
  // a tester who forgets is the normal case; try once, silently
  setTimeout(()=>{
    try { if (!S.exported) exportJSON(true); } catch(err){}
  },800);
}

/* ---------------------------------------------------------
   boot
   --------------------------------------------------------- */
if (!document.getElementById('recCss')){
  const l=document.createElement('link');
  l.id='recCss'; l.rel='stylesheet'; l.href='playtest/recorder.css';
  document.head.appendChild(l);
}
buildUI();
watchText('subtitle','say');
watchText('prompt','prompt');
watchChapter();
watchEnd();
bindInput();
ev('begin',{ua:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio});
poll();
setInterval(poll,200);
setInterval(()=>{ if (S.open||S.media) render(); else scheduleRender(); },1000);
window.addEventListener('beforeunload',e=>{
  if (S.media||(!S.exported&&S.events.length>20)){
    e.preventDefault();
    e.returnValue='记录还没导出，确定离开？';
    return e.returnValue;
  }
});
document.addEventListener('visibilitychange',()=>{
  if (document.visibilityState==='hidden') scheduleSave();
});
restoreOffer();
render();
if (QS.get('rectest')){
  // Headless smoke test. Writes the payload into the DOM (not the title) so it
  // can coexist with the e2e harness, which owns the title.
  const dump=()=>{
    const old=document.getElementById('recVerdict');
    if (old) old.remove();
    const el=document.createElement('div');
    el.id='recVerdict';
    el.style.display='none';
    try {
      const p=payload();
      const bad=[];
      if (!p.events.length) bad.push('no-events');
      if (!p.finalState) bad.push('no-state');
      if (!p.summary||typeof p.summary.durationMs!=='number') bad.push('no-summary');
      el.dataset.verdict=bad.length?('FAIL '+bad.join(',')):'PASS';
      el.dataset.events=String(p.events.length);
      el.dataset.keys=String(p.summary.keys);
      el.dataset.seconds=String(Math.round(p.summary.durationMs/1000));
      el.dataset.ending=p.summary.ending||'';
      el.dataset.full=JSON.stringify(p);
    } catch(err){
      el.dataset.verdict='FAIL '+(err&&err.message||err);
    }
    document.body.appendChild(el);
  };
  if (QS.get('rectest')==='now') setTimeout(dump,1200);
  else setTimeout(dump,6000);
}
setTimeout(()=>toast('内测记录已开启：右下角是记录器（Alt+Shift+R）。',7000),1400);

window.__jiRec={
  get session(){ return S.id; },
  get events(){ return S.events.slice(); },
  summary, exportJSON, payload,
  startMedia, stopMedia,
  mark(tag,data){ ev('mark',Object.assign({tag:tag},data||{})); },
  clock
};
})();
