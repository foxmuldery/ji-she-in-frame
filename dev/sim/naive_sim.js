// Zero-knowledge first-player simulation for 《祭：她在画面里》.
//
// Loaded only when index.html?naive=<runs> is opened (see game.js tail).
//
// Premise: the player has never seen the game. The bot therefore:
//   * knows ONLY what is on screen — the prompt bar, subtitles and the chapter
//     objective panel. It reads nothing from game state for decisions.
//   * presses real keys via window KeyboardEvent, so every guard in the game's
//     keydown handler applies (inputLock, caseOpen, paused, review mode, ...).
//   * can see the room (props, the woman, the door, three hiding places) the
//     way a sighted player can, but knows no rules, no values, no answers.
//   * learns puzzle rules only from text: scan reveals, the case book (Tab),
//     failure lines, timecodes.
//   * has human limitations: reaction delay, mis-keys, impatient releases
//     (lets go of F before the scan finishes), wrong guesses, and it gives up.
//
// Output: document.body[data-naive] + document.title, consumed by dev/naive.sh
(function(){
  'use strict';
  const ERRS=window.__naiveErrs=window.__naiveErrs||[];
  window.addEventListener('error',e=>{
    const m=(e.message||'')+' @'+(e.filename||'').split('/').pop()+':'+e.lineno+':'+e.colno;
    if (ERRS.indexOf(m)<0) ERRS.push(m);
  });
  const G=window.__jiThird;
  if (!G){ document.title='NAIVE FAIL: __jiThird missing'; return; }
  const U=G.ui;
  const q=new URLSearchParams(location.search);
  const RUNS=Math.max(1,Math.min(500,parseInt(q.get('naive'),10)||100));
  // Sharding: four browsers can run disjoint seed ranges and be merged, so a
  // 100-player batch does not have to be one long serial session.
  const OFF=parseInt(q.get('noff'),10)||0;
  const RAW=q.get('nraw')==='1';
  // Cohort switches for the report: a player who never opens the notebook, and
  // one who is also half-reading the screen.
  const NOBOOK=q.get('nobook')==='1';
  const INATT=q.get('inatt')==='1';
  // Real-key regression spec (dev/e2e/run.sh): one deterministic playthrough
  // per ending, driven only by KeyboardEvent and judged from on-screen text.
  const E2E=(q.get('e2e')||'').toLowerCase();
  const E2E_OK=['help','film','bad'].indexOf(E2E)>=0;
  // Human pacing: a first-timer actually reads the two lines on screen before
  // pressing anything. The plain bot decides in under a second, so it measures
  // the floor, not the felt length of the session.
  const PACE=(q.get('pace')||'').toLowerCase();
  const HUMAN=PACE==='human';
  const END_TITLE={help:'你走过去了。',film:'你一直在拍她。',bad:'她替你摆好了。'};
  const DT=0.1;
  // Generous but finite: a first-timer who wanders for 15 in-game minutes and
  // still has no idea has, for our purposes, bounced off the slice.
  const BUDGET=900;
  const STUCK=120;   // no screen/game-state change for this long = hesitation
  const MAX_CONFUSIONS=3;

  // ---------------- deterministic RNG ----------------
  function rng(seed){
    let a=seed>>>0;
    return function(){
      a=(a+0x6D2B79F5)>>>0;
      let t=a;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }

  // ---------------- geometry the player can see ----------------
  const PROP={incense:[9.35,6.25],bowl:[5.55,5.0],thread:[3.7,1.0]};
  const WOMAN=[9.5,3.1], ALTAR=[7.05,6.3], DOOR=[2.3,1.2];
  const LABEL={curtain:'帘子',table:'供桌',chair:'椅子'};
  const PROP_NAME={incense:'香炉',bowl:'水碗',thread:'门框'};

  const X0=0.6,Y0=0.6,X1=11.4,Y1=8.4,STEP=0.2;
  const NX=Math.round((X1-X0)/STEP)+1, NY=Math.round((Y1-Y0)/STEP)+1;
  const free=new Uint8Array(NX*NY), raw=new Uint8Array(NX*NY);
  const idx=(ix,iy)=>iy*NX+ix;
  for (let ix=0;ix<NX;ix++) for (let iy=0;iy<NY;iy++) raw[iy*NX+ix]=G.blocked(X0+ix*STEP,Y0+iy*STEP)?0:1;
  const CLEAR=1;
  for (let ix=0;ix<NX;ix++) for (let iy=0;iy<NY;iy++){
    let ok=raw[iy*NX+ix];
    for (let dx=-CLEAR;dx<=CLEAR&&ok;dx++) for (let dy=-CLEAR;dy<=CLEAR&&ok;dy++){
      const jx=ix+dx,jy=iy+dy;
      if (jx<0||jy<0||jx>=NX||jy>=NY||!raw[jy*NX+jx]) ok=0;
    }
    free[iy*NX+ix]=ok;
  }
  function nearestFree(x,y){
    const cx=Math.round((x-X0)/STEP), cy=Math.round((y-Y0)/STEP);
    for (let r=0;r<9;r++) for (let dx=-r;dx<=r;dx++) for (let dy=-r;dy<=r;dy++){
      const ix=cx+dx, iy=cy+dy;
      if (ix<0||iy<0||ix>=NX||iy>=NY) continue;
      if (free[idx(ix,iy)]) return [ix,iy];
    }
    return null;
  }
  function plan(sx,sy,tx,ty){
    const s=nearestFree(sx,sy), t=nearestFree(tx,ty);
    if (!s||!t) return null;
    const prev=new Int32Array(NX*NY).fill(-1), seen=new Uint8Array(NX*NY), queue=new Int32Array(NX*NY);
    let head=0,tail=0; const start=idx(s[0],s[1]), goal=idx(t[0],t[1]);
    queue[tail++]=start; seen[start]=1; prev[start]=-2;
    while (head<tail){
      const cur=queue[head++];
      if (cur===goal) break;
      const cx=cur%NX, cy=(cur-cx)/NX;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=cx+dx, ny=cy+dy;
        if (nx<0||ny<0||nx>=NX||ny>=NY) continue;
        const ni=idx(nx,ny);
        if (seen[ni]||!free[ni]) continue;
        seen[ni]=1; prev[ni]=cur; queue[tail++]=ni;
      }
    }
    if (!seen[goal]) return null;
    const path=[];
    for (let cur=goal;cur!==-2;cur=prev[cur]){
      if (cur<0) break;
      const cx=cur%NX, cy=(cur-cx)/NX;
      path.push([X0+cx*STEP,Y0+cy*STEP]);
    }
    return path.reverse();
  }
  const WANDER=[];
  for (let ix=0;ix<NX;ix++) for (let iy=0;iy<NY;iy++)
    if (free[idx(ix,iy)]) WANDER.push([X0+ix*STEP,Y0+iy*STEP]);

  // ---------------- input: real key events ----------------
  let clock=0;                 // simulated milliseconds for scan timing
  G.setScanClock(()=>clock);
  const held={};
  function key(code,on){
    if (!!held[code]===on) return;
    held[code]=on;
    window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true}));
  }
  function tap(code){ key(code,true); key(code,false); }
  function releaseAll(){ for (const k of Object.keys(held)) if (held[k]) key(k,false); }

  function step(){
    const s=G.state;
    if (s.paused){
      // lost focus / self-inflicted Esc: a player clicks back in.
      if (Math.random()<0.25) tap('Escape');
      clock+=DT*1000; return;
    }
    clock+=DT*1000;
    s.time+=DT;
    G.tickJobs();
    G.advanceMovement(DT);
    G.updateBattery(DT);
    G.updateHide(DT);
    if (s.scene==='corridor') G.updateCorridor(DT);
    if (s.scene==='darkroom') G.updateDarkroom(DT);
    if (s.camera && (s.chapter===3 || (s.ritual.active && !s.ritual.done))) G.updateScanProgress();
  }

  // ---------------- perception: the real DOM, nothing else ----------------
  // The bot is deliberately NOT run with the fuzz short-circuit, so the game
  // writes to its real HUD. Reading #prompt / #subtitle / #chapter* means the
  // bot sees exactly the pixels a player sees, including hint expiry.
  const el={
    prompt:document.getElementById('prompt'),
    sub:document.getElementById('subtitle'),
    kicker:document.getElementById('chapterKicker'),
    name:document.getElementById('chapterName'),
    obj:document.getElementById('chapterObj'),
    count:document.getElementById('chapterCount'),
    caseEl:document.getElementById('case'),
    caseNow:document.getElementById('caseNow'),
    panel:document.getElementById('chapterHud')
  };
  const visible=(n)=>!!n && !n.classList.contains('hidden');
  const txt=(n)=>n?n.textContent:'';
  function perceive(){
    return {
      prompt:visible(el.prompt)?txt(el.prompt):'',
      say:visible(el.sub)?txt(el.sub):'',
      kicker:visible(el.panel)?txt(el.kicker):'',
      name:visible(el.panel)?txt(el.name):'',
      obj:visible(el.panel)?txt(el.obj):'',
      count:visible(el.panel)?txt(el.count):'',
      camera:G.state.camera,chapter:G.state.chapter,scene:G.state.scene
    };
  }
  const T={
    has:(s,...k)=>k.some(x=>s.indexOf(x)>=0),
    key:(s,codes)=>codes.filter(c=>s.indexOf(c)>=0)
  };

  // ---------------- a first player's brain ----------------
  function newBrain(seed,R){
    const B0={
      seed,R,
      attentive:R()<0.62,          // reads the reveal subtitles
      bookAware:R()<0.58,          // discovers the Tab notebook at all
      impatience:0.1+R()*0.35,     // chance of releasing F before the scan lands
      error:0.015+R()*0.045,       // mis-key / wrong guess rate
      decisionAt:0,
      walk:null, holdUntil:0, holdArmed:false,
      need:{},known:{incense:false,bowl:false,thread:false},
      scanned:{},photoed:{},
      lastSig:'',lastProgressAt:0,confusions:[],giveUp:false,
      counters:{scanTries:0,shortHolds:0,wrongRitual:0,wrongHunt:0,wrongHide:0,
        hideTimeout:0,quizWrong:0,tabs:0,reviews:0,fumbles:0,emotes:0},
      chapterAt:{},marks:{},tabAt:-99,reviewAt:-99,lastFacing:null,
      ch1Phase:'find',pendingL:0,quizTried:0,filmTry:R()<0.22,filmTried:false,
      minBat:100
    };
    if (E2E_OK){
      // a competent player: reads everything, presses deliberately
      B0.attentive=true; B0.bookAware=true; B0.impatience=0; B0.error=0;
      B0.filmTry=E2E==='film'; B0.filmForced=E2E==='film'; B0.sabotage=E2E==='bad';
    }
    if (NOBOOK) B0.neverBook=true;
    if (INATT) B0.attentive=false;
    if (NOBOOK) B0.bookAware=false;
    return B0;
  }

  function sig(){
    const s=G.state;
    const seen=Object.values(s.ritual.camSeen||{}).filter(Boolean).length;
    const ph=Object.values(s.photos||{}).filter(Boolean).length;
    return [s.chapter,s.ritual.active?1:0,s.ritual.done?1:0,seen,ph,
      s.hunt?s.hunt.count:-1,s.hide?s.hide.round:-1,
      Object.values(s.anomalies).filter(Boolean).length,s.finalPhoto?1:0,s.phoneDone?1:0,
      s.corr?s.corr.answered?1:0:0,s.ch3FrameOk?1:0,s.ended?1:0].join(':');
  }
  function debugState(B){
    const s=G.state;
    return {ch:s.chapter,ritualActive:s.ritual.active,done:s.ritual.done,loop:s.ritual.loop,
      choice:s.choice,uncanny:s.uncannyDone,talked:s.talked,cam:s.camera,
      seen:s.ritual.camSeen,photos:s.photos,bat:+s.battery.toFixed(0),
      wx:+s.wx.toFixed(2),wy:+s.wy.toFixed(2),inputLock:s.inputLock,
      rev:s.review,caseOpen:s.caseOpen,paused:s.paused,trans:s.transition,
      walk:B.walk?[+B.walk.x.toFixed(2),+B.walk.y.toFixed(2)]:null,planFail:B.planFail||0,
      bookReads:B.bookReads||0,bookText:B.bookText||'',
      t1:B.t1||[],need:B.need||{},known:B.known||{},live:B.live||{},tried:B.tried||{},
      hlog:B.hlog||[],clog:B.clog||[],t3:B.t3||[],phaseT:B.phaseT||{},br:B.br||{},probe:G.probe(),heldF:!!held['KeyF'],raises:B.raises||0,lastRelease:B.lastRelease||[],holdUntil:+B.holdUntil.toFixed(2),time:+s.time.toFixed(1),
      trace:(B.trace||[]).slice(-14),
      scanned:B.scanned,photoed:B.photoed};
  }

  // Learn from what just appeared on screen. This is the only way the bot
  // acquires puzzle knowledge.
  function learn(B,p){
    const all=p.say+' '+p.prompt;
    // A reveal line is on screen for ~3.8s. Anyone staring at the DV reads it;
    // the difference between players is whether they were looking, so roll once
    // per line instead of granting perfect comprehension.
    const pick=(label)=>{
      if (!T.has(p.say,label)) return false;
      if (B.revLine===label) return false;
      B.revLine=label;
      return !!B.attentive || B.R()<0.55;
    };
    if (pick('香三炷')){ B.need.incense=3; B.known.incense=true; }
    if (pick('水靠左')){ B.need.bowl=0; B.known.bowl=true; }
    if (pick('线高结')){ B.need.thread=2; B.known.thread=true; }
    if (T.has(p.say,'三样都对上了')){
      B.known.incense=B.known.bowl=B.known.thread=true; B.need={incense:3,bowl:0,thread:2};
    }
    // notebook: 残页 tells the bowl outright, and the 实物 rows show values
    if (G.state.caseOpen){
      const c=txt(el.caseEl);
      if (c.indexOf('水 · 靠左')>=0){ B.need.bowl=0; B.known.bowl=true; }
      if (c.indexOf('炉身孔数3')>=0){ B.need.incense=3; B.known.incense=true; }
      if (c.indexOf('门框绳痕高')>=0){ B.need.thread=2; B.known.thread=true; }
    }
    // The answer to your own keypress is always read, by anyone.
    let m=p.say.match(/香炉：(\d) 炷/); if (m){ B.live=B.live||{}; B.live.incense=+m[1]; }
    m=p.say.match(/水碗：([左中右])/); if (m){ B.live=B.live||{}; B.live.bowl='左中右'.indexOf(m[1]); }
    m=p.say.match(/红绳：([低中高])/); if (m){ B.live=B.live||{}; B.live.thread='低中高'.indexOf(m[1]); }
    if (T.has(all,'她已经不在')) {}
  }

  function walk(B,x,y){
    const path=plan(G.state.wx,G.state.wy,x,y);
    if (!path){ B.planFail=(B.planFail||0)+1; return false; }
    B.walk={path,x,y,wi:0,replans:0,stuck:0,lastX:G.state.wx,lastY:G.state.wy};
    return true;
  }
  function walkStep(B){
    const w=B.walk; if (!w) return true;
    const s=G.state;
    if (Math.hypot(s.wx-w.x,s.wy-w.y)<0.5){ stopWalk(B); return true; }
    while (w.wi<w.path.length-1 && Math.hypot(s.wx-w.path[w.wi][0],s.wy-w.path[w.wi][1])<0.3) w.wi++;
    if (Math.hypot(s.wx-w.lastX,s.wy-w.lastY)<0.004){
      w.stuck+=DT;
      if (w.stuck>0.8 && w.replans<3){
        w.stuck=0; w.replans++;
        const p=plan(s.wx,s.wy,w.x,w.y);
        if (p){ w.path=p; w.wi=0; }
      }
    } else w.stuck=0;
    w.lastX=s.wx; w.lastY=s.wy;
    const wp=w.path[w.wi];
    const dx=wp[0]-s.wx, dy=wp[1]-s.wy;
    key('KeyD',dx>0.15); key('KeyA',dx<-0.15);
    key('KeyS',dy>0.15); key('KeyW',dy<-0.15);
    return false;
  }
  function stopWalk(B){ B.walk=null; key('KeyW',false);key('KeyA',false);key('KeyS',false);key('KeyD',false); }

  function wander(B,p){
    const s=G.state;
    // bias toward walls/props: players inspect things, they don't grid-sweep
    for (let i=0;i<12;i++){
      const c=WANDER[Math.floor(B.R()*WANDER.length)];
      if (Math.hypot(c[0]-s.wx,c[1]-s.wy)<1.5) continue;
      if (walk(B,c[0],c[1])) return;
    }
    const c=WANDER[Math.floor(B.R()*WANDER.length)];
    walk(B,c[0],c[1]);
  }

  // The DV is the only source of information in several chapters, so a
  // first-timer who forgets the battery simply stops being able to play.
  // A player notices "电量不够" and waits; the wait is measured as friction.
  function powerGate(B,floor){
    const s=G.state;
    if (s.camera){ if (s.battery<floor-12){ releaseF(B); B.charging=true; return true; } return false; }
    if (s.battery<floor || B.charging){
      if (s.battery<Math.min(100,floor+6)){ B.charging=true; return true; }
      B.charging=false;
    }
    return false;
  }
  function waitPower(B){
    B.counters.chargeSec=+((B.counters.chargeSec||0)+DT).toFixed(1);
    stopWalk(B);
  }

  function holdF(B,ms){
    if (G.state.camera) return;
    key('KeyF',false);          // a fresh press even if a stale hold remained
    key('KeyF',true);
    B.holdUntil=G.state.time+ms/1000;
    B.raises=(B.raises||0)+1;
  }
  function releaseF(B){
    key('KeyF',false);          // always clear the physical key, even if the
    B.holdUntil=0;              // game already dropped the camera for us
  }

  // ---------------- chapter behaviours ----------------
  function doChapter1(B,p){
    const s=G.state, r=s.ritual;
    const ph=(!r.active?'talk':B.wantBook?'book'
      :(['incense','bowl','thread'].some(k=>!B.scanned[k])?'scan'
      :['incense','bowl','thread'].some(k=>!B.photoed[k])?'photo':'set'));
    B.phaseT=B.phaseT||{};
    B.phaseT[ph]=+((B.phaseT[ph]||0)+Math.min(4,s.time-(B.phaseAt!==undefined?B.phaseAt:s.time))).toFixed(1);
    B.phaseAt=s.time;
    (B.t1=B.t1||[]).push([+s.time.toFixed(1),ph,+s.wx.toFixed(1),+s.wy.toFixed(1),
      B.walk?'walk':'-',(p.prompt||'').slice(0,12),s.camera?'cam':'-',
      Math.round(s.battery),B.why||'']);
    if (B.t1.length>14) B.t1.shift();
    if (!r.active){
      // Objective is only discoverable by talking to her.
      if (Math.hypot(s.wx-WOMAN[0],s.wy-WOMAN[1])>1.6){
        if (!B.walk) walk(B,WOMAN[0],WOMAN[1]);
        return;
      }
      if (B.R()<0.15){ tap('KeyE'); return; }        // press E to talk
      if (!s.camera && B.R()<0.2){ holdF(B,900+B.R()*1400); return; }
      if (T.has(p.prompt,'举起 DV')||T.has(p.prompt,'举起DV')){ holdF(B,1200+B.R()*1200); return; }
      tap('KeyE');
      return;
    }
    if (r.done) return;
    if (B.wantBook && B.bookAware && !B.neverBook){ bookTick(B,p); return; }

    // The notebook is the only progress readout the game offers, so a careful
    // player keeps checking it. It is also where a stuck player looks first.
    if (s.time-(B.bookAt||-99)>(B.bookEvery||7) && !s.camera && B.R()<0.5 &&
        (B.bookAware && !B.neverBook && (B.attentive || T.has(p.prompt,'Tab')))){
      B.wantBook=true; return;
    }

    // 1) reveal the three props with the DV
    for (const k of ['incense','bowl','thread']){
      if (B.scanned[k]) continue;
      if (!B.walk && Math.hypot(s.wx-PROP[k][0],s.wy-PROP[k][1])>0.9){ walk(B,PROP[k][0],PROP[k][1]); return; }
      if (!s.camera){
        if (s.battery<22){ waitPower(B); return; }
        B.counters.scanTries++;
        const base=B.holdBase||1500;
        const hold=(B.R()<B.impatience?base*0.45:base)+B.R()*400;
        if (hold<1150) B.counters.shortHolds++;
        holdF(B,hold);
        return;
      }
      if (B.holdUntil && s.time<B.holdUntil) return;
      if (s.scanTarget!==k){ B.counters.aimMiss=(B.counters.aimMiss||0)+1; releaseF(B); return; }   // 没有对准
      if (s.scanDone){
        // "scanned" must be knowledge, not a flag: a player who saw nothing on
        // screen has not learned the value and will try again (or ask the book).
        if (B.known[k]){ B.scanned[k]=true; if (B.bookAware) B.wantBook=true; }
        else if (B.bookAware){ B.scanned[k]=true; B.wantBook=true; }
        else {
          B.scanRetry=(B.scanRetry||0)+1;
          B.holdBase=Math.min(2600,(B.holdBase||1500)+300);
          if (B.scanRetry>4) B.scanned[k]=true;   // gives up believing it worked
        }
      } else B.holdBase=Math.min(2600,(B.holdBase||1500)+300);           // hold it longer
      releaseF(B);
      return;
    }
    // 2) one photo of each revealed prop (L only fires once the scan lands)
    for (const k of ['incense','bowl','thread']){
      if (B.photoed[k]) continue;
      if (!B.walk && Math.hypot(s.wx-PROP[k][0],s.wy-PROP[k][1])>0.9){ walk(B,PROP[k][0],PROP[k][1]); return; }
      if (!s.camera){
        // A shot costs 16 and the hold costs ~9, so a first-timer has to wait
        // for the DV to charge between pictures.
        if (s.battery<44){ waitPower(B); return; }
        if (B.R()<0.1){ B.counters.photoWaste=(B.counters.photoWaste||0)+1; tap('KeyL'); return; }      // fires before the scan lands
        B.counters.scanTries++;
        B.ch1Shot=false;
        holdF(B,1300+B.R()*300);   // long enough for the reveal, short of the risk
        return;
      }
      if (B.holdUntil && s.time<B.holdUntil) return;
      if (s.scanTarget!==k){ B.why='aim '+s.scanTarget+'!='+k; B.counters.aimMiss=(B.counters.aimMiss||0)+1; releaseF(B); return; }   // 没有对准
      if (!B.ch1Shot){
        if (B.R()<0.08){ releaseF(B); return; }                        // lets go too early
        tap('KeyL'); B.ch1Shot=true; B.ch1ShotAt=s.time;
        if (G.state.photos[k]) B.photoed[k]=true;
        return;
      }
      if (G.state.photos[k]) B.photoed[k]=true;
      B.ch1Shot=false;
      releaseF(B);
      return;
    }
    if (B.sabotage){
      // E2E bad path: the player commits 甲 (2 / 中 / 低) on purpose, three times.
      const wrong={incense:2,bowl:1,thread:0};
      B.known={incense:true,bowl:true,thread:true}; B.need=wrong;
      for (const k of ['incense','bowl','thread']){
        if ((B.live||{})[k]===wrong[k]) continue;
        if (!B.walk && Math.hypot(s.wx-PROP[k][0],s.wy-PROP[k][1])>0.9){ walk(B,PROP[k][0],PROP[k][1]); return; }
        tap('KeyE'); return;
      }
      if (Math.hypot(s.wx-ALTAR[0],s.wy-ALTAR[1])>1.0){ if (!B.walk) walk(B,ALTAR[0],ALTAR[1]); return; }
      tap('Space'); return;
    }
    // 3) dial the three values in. A player who never read the notebook has to
    //    guess, and the guess is what the counter 'wrongRitual' measures.
    for (const k of ['incense','bowl','thread']){
      const want=B.known[k]?B.need[k]:null;
      const live=(B.live||{})[k];
      if (want!=null && live===want) continue;
      if (want==null && B.tried&&B.tried[k]) continue;
      if (!B.walk && Math.hypot(s.wx-PROP[k][0],s.wy-PROP[k][1])>0.9){ walk(B,PROP[k][0],PROP[k][1]); return; }
      if (B.R()<0.05){ tap('Space'); return; }
      tap('KeyE');
      if (want==null){ B.tried=B.tried||{}; B.tried[k]=true; }
      return;
    }
    // 4) commit
    if (Math.hypot(s.wx-ALTAR[0],s.wy-ALTAR[1])>1.0){ if (!B.walk) walk(B,ALTAR[0],ALTAR[1]); return; }
    if ((s.ritual.loop||0)>=(B.lastLoop||0)+1){
      B.lastLoop=s.ritual.loop;
      if (!B.bookAware && !B.neverBook && B.R()<0.5){ B.bookAware=true; B.wantBook=true; }
    }
    tap('Space');
  }

  // Open the notebook, read what it says, close it. This is how the bot learns
  // whether a scan landed and whether a photo exists.
  function bookTick(B,p){
    const s=G.state;
    if (!s.caseOpen){ tap('Tab'); B.bookAt=s.time; B.bookTickAt=s.time; return; }
    if (s.time-(B.bookTickAt||0)<0.5) return;
    const c=txt(el.caseEl), now=txt(el.caseNow);
    B.bookReads=(B.bookReads||0)+1;
    const ix=c.indexOf('炉身');
    B.bookText='len='+c.length+' ix='+ix+' :: '+(ix>=0?c.slice(ix,ix+40).replace(/\s+/g,'|'):'-')
      +' || '+now.replace(/\s+/g,'|').slice(0,50);
    const before=Object.keys(B.scanned).length+Object.keys(B.photoed).length;
    if (/炉身孔数\s*3/.test(c)) B.scanned.incense=true;
    if (/桌面水痕\s*左/.test(c)) B.scanned.bowl=true;
    if (/门框绳痕\s*高/.test(c)) B.scanned.thread=true;
    if (/炉身孔数\s*未显影/.test(c)) B.scanned.incense=false;
    if (/桌面水痕\s*未显影/.test(c)) B.scanned.bowl=false;
    if (/门框绳痕\s*未显影/.test(c)) B.scanned.thread=false;
    if (/香\s*[✓√]/.test(now)) B.photoed.incense=true;
    if (/水\s*[✓√]/.test(now)) B.photoed.bowl=true;
    if (/线\s*[✓√]/.test(now)) B.photoed.thread=true;
    // Reading the notebook is reading it — what separates players is whether
    // they think to open it, not whether they can parse a table.
    if (/炉身孔数\s*3/.test(c)){ B.need.incense=3; B.known.incense=true; }
    if (/桌面水痕\s*左/.test(c)){ B.need.bowl=0; B.known.bowl=true; }
    if (/门框绳痕\s*高/.test(c)){ B.need.thread=2; B.known.thread=true; }
    if (/用 E 摆成乙/.test(c)){ B.need={incense:3,bowl:0,thread:2};
      B.known={incense:true,bowl:true,thread:true}; }
    const after=Object.keys(B.scanned).length+Object.keys(B.photoed).length;
    if (after<=before && s.time-(B.bookAt||0)>3) B.holdBase=Math.min(2600,(B.holdBase||1500)+350); // learns to hold longer
    tap('Tab');
    B.wantBook=false;
    B.bookEvery=6+B.R()*6;
  }

  function doChapter2(B,p){
    const s=G.state;
    if (!s.hunt) return;
    (B.clog=B.clog||[]).push([+s.time.toFixed(1),s.camera?'cam':'-',(p.say||'').slice(0,16),
      (p.prompt||'').slice(0,14),B.huntPos,s.hunt.count,+s.battery.toFixed(0)]);
    if (B.clog.length>10) B.clog.shift();
    if (powerGate(B,26)){ waitPower(B); return; }
    if (B.huntPos==null || B.huntCount!==s.hunt.count){
      // learn her position only by looking through the viewfinder
      if (!s.camera){ if (!B.walk) holdF(B,900+B.R()*900); return; }
      if (B.holdUntil && s.time<B.holdUntil) return;
      const m=p.say.match(/取景器：(左侧有衣角|低处有人影|右侧有袖口)/);
      if (G.state.camera && !m && B.R()<0.2){ releaseF(B); return; }
      if (m){
        B.huntPos=m[1]==='左侧有衣角'?0:m[1]==='低处有人影'?1:2;
        B.huntCount=s.hunt.count;
      } else {
        releaseF(B); B.huntPos=Math.floor(B.R()*3); B.huntCount=s.hunt.count;
        return;
      }
      releaseF(B);
      return;
    }
    if (B.holdUntil && s.time<B.holdUntil) return;
    let pick=B.huntPos;
    if (B.R()<B.error) pick=(pick+1+Math.floor(B.R()*2))%3;   // wrong guess
    const sp=G.HIDE_SPOTS[pick];
    if (Math.hypot(s.wx-sp.x,s.wy-sp.y)>1.2){ if (!B.walk) walk(B,sp.x,sp.y); return; }
    (B.hlog=B.hlog||[]).push([+s.time.toFixed(1),pick,s.hunt.pos,
      +Math.hypot(s.wx-sp.x,s.wy-sp.y).toFixed(2),s.hunt.count]);
    if (B.hlog.length>8) B.hlog.shift();
    tap('KeyE');
    if (pick!==B.huntPos) B.counters.wrongHunt++;
    B.huntPos=null;
  }

  function doChapter3(B,p){
    const s=G.state;
    // Answer the frame gate before worrying about power: the DV does not charge
    // while the tape is open, so a player who waits inside the review waits for
    // ever. (A human exits first; the bot must be told the same rule.)
    if (!(s.ch3FrameGate && s.review) && powerGate(B,30)){ waitPower(B); return; }
    if (s.ch3FrameGate && s.ch3FrameOk){ tap('KeyR'); return; }   // 带子对上了，退出回看
    if (s.ch3FrameGate && !s.ch3FrameOk){
      // HUD: R 回看，A / D 停在 00:41:17 闭眼那一帧
      if (!s.review){
        if (B.R()<0.08){ wander(B,p); return; }
        tap('KeyR'); B.counters.reviews++;
        B.frameSteps=0; B.frameAt=s.time;
        return;
      }
      if (T.has(p.say,'带子和房间对上了')){ tap('KeyR'); return; }
      if ((B.frameSteps||0)>12){ tap('KeyR'); return; }  // gives up, comes back later
      if (s.time-(B.frameAt||0)>0.22){
        B.frameAt=s.time;
        B.frameSteps=(B.frameSteps||0)+1;
        G.stepLookFrame(B.R()<0.1?-1:1);   // nudge one frame, like holding A/D
      }
      return;
    }
    if (T.has(p.say,'带子和房间对上了')&&s.ch3FrameGate&&!s.ch3FrameOk){ tap('KeyR'); return; }
    (B.t3=B.t3||[]).push([+s.time.toFixed(1),s.camera?'cam':'-',s.scanTarget||'-',
      s.scanDone?1:0,+s.battery.toFixed(0),(p.count||'').slice(0,10),
      B.ch3Shot?1:0,s.ch3FrameGate?(s.ch3FrameOk?'gateOk':'gate'):'-']);
    if (B.t3.length>12) B.t3.shift();

    // "拍到 N / 3" is on the chapter panel, so the bot can count progress.
    const m=(p.count||'').match(/拍到\s*(\d)/);
    const taken=m?+m[1]:(B.ch3Taken||0);
    if (taken>=3) return;                    // waiting for the next chapter
    if (B.ch3Shot && B.ch3Aimed && taken>(B.ch3Taken||0)){ B.ch3Done=B.ch3Done||{}; B.ch3Done[B.ch3Aimed]=true; }
    B.ch3Taken=taken;
    const left=['incense','bowl','thread'].filter(x=>!(B.ch3Done&&B.ch3Done[x])&&!(B.ch3Skip&&B.ch3Skip[x]));
    const k=left[0]||['incense','bowl','thread'][Math.min(2,taken)];
    if (!B.walk && Math.hypot(s.wx-PROP[k][0],s.wy-PROP[k][1])>0.9){ walk(B,PROP[k][0],PROP[k][1]); return; }
    if (!s.camera){
      if (s.battery<34){ waitPower(B); return; }
      B.counters.scanTries++;
      B.ch3Shot=false; B.ch3Aimed=k;
      holdF(B,1300+B.R()*400);
      return;
    }
    if (B.holdUntil && s.time<B.holdUntil) return;
    if (s.scanTarget!==k){ releaseF(B); B.wantBook=true; return; }   // 没有对准
    if (!B.ch3Shot){
      if (B.R()<0.08){ releaseF(B); return; }        // lets go before the shutter
      tap('KeyL'); B.ch3Shot=true; B.ch3ShotAt=s.time;
      if (G.state.anomalies[k]) B.ch3Done=Object.assign(B.ch3Done||{},{[k]:true});
      return;
    }
    if (G.state.anomalies[k]) B.ch3Done=Object.assign(B.ch3Done||{},{[k]:true});
    releaseF(B);
    B.ch3Tries=B.ch3Tries||{};
    const tk=B.ch3Aimed||k;
    B.ch3Tries[tk]=(B.ch3Tries[tk]||0)+1;
    if (B.ch3Tries[tk]>=3){ B.ch3Skip=B.ch3Skip||{}; B.ch3Skip[tk]=true;
      B.counters.wrongAnomaly=(B.counters.wrongAnomaly||0)+1; }
  }

  function doChapter4(B,p){
    const s=G.state, h=s.hide;
    if (!h||!h.active){ return; }
    // Charging does not stop the 12-second clock, so looking is a luxury:
    // only look when there is time and battery to spare.
    const canLook=h.remaining>6.5 && s.battery>24;
    if (!s.camera && canLook && B.facing==null){
      holdF(B,800+B.R()*500);
      return;
    }
    if (s.camera){
      if (B.holdUntil && s.time<B.holdUntil) return;
      const m=p.say.match(/她正看着(帘子后面|供桌下面|椅子后面)/);
      if (m) B.facing=['帘子后面','供桌下面','椅子后面'].indexOf(m[1]);
      releaseF(B);
      return;
    }
    let pick;
    if (B.facing==null){
      pick=Math.floor(B.R()*3);
      B.counters.wrongHide++;
    } else {
      const opts=[0,1,2].filter(i=>i!==B.facing&&i!==B.lastHide);
      pick=opts.length?opts[Math.floor(B.R()*opts.length)]:(B.facing+1)%3;
      if (B.R()<B.error){ pick=B.facing; B.counters.wrongHide++; }
    }
    const sp=G.HIDE_SPOTS[pick];
    if (Math.hypot(s.wx-sp.x,s.wy-sp.y)>1.2){
      if (!B.walk) walk(B,sp.x,sp.y);
      return;
    }
    tap('KeyE');
    B.lastHide=pick;
  }

  function doChapter5(B,p){
    const s=G.state;
    if (s.scene==='corridor'){
      // Three things in the hall are only legible through the corridor's own
      // viewfinder, and the phone stays silent until the nameplate is read.
      const c=s.corr;
      (B.clog2=B.clog2||[]).push([+s.time.toFixed(1),+c.depth.toFixed(2),c.lookOn?1:0,
        (c.roomSeen?1:0),(c.facesSeen?1:0),(c.nameSeen?1:0),
        +(B.holdUntil-s.time).toFixed(2),B.raises||0,s.phoneDone?1:0]);
      if (B.clog2.length>200) B.clog2.shift();
      if (c.lookOn){                       // always lower the DV before moving on
        if (B.holdUntil && s.time<B.holdUntil) return;
        releaseF(B);
        return;
      }
      const band=(!c.roomSeen && c.depth>=0.16 && c.depth<=0.38)?'room'
        :(!c.facesSeen && c.depth>=0.46 && c.depth<=0.74)?'faces'
        :(!c.nameSeen && c.depth>=0.76)?'name':null;
      if (band){
        if (c.lookOn){
          if (B.holdUntil && s.time<B.holdUntil) return;
          releaseF(B);
          return;
        }
        holdF(B,600+B.R()*400);
        return;
      }
      key('KeyW',true);
      if (s.corr.depth>=0.80 && !s.phoneDone) tap('KeyE');
      else if (s.corr.depth>0.30 && s.corr.depth<0.60 && !s.corr.portrait && B.R()<0.5) tap('KeyE');
      return;
    }
    if (s.scene==='darkroom'){
      // Act 2: three things to develop under the safelight, then a splicer.
      // The bot reads the same two supports a player has — the offset number on
      // the chapter panel and the red head line on the tape.
      const k=s.dark;
      (B.dlog=B.dlog||[]).push([+s.time.toFixed(1),+k.depth.toFixed(2),k.lookOn?1:0,
        (k.seen.line?1:0),(k.seen.bench?1:0),(k.seen.wall?1:0),k.open?1:0,
        +(k.v-k.target).toFixed(3),k.split?1:0]);
      if (B.dlog.length>200) B.dlog.shift();
      if (k.split){
        // the joined frame is worth keeping, but never required to leave
        if (!k.print && B.R()<0.85){ tap('KeyL'); return; }
        if (k.depth>0.08){ key('KeyS',true); key('KeyW',false); return; }
        key('KeyS',false); key('KeyW',false);
        tap('KeyE');
        return;
      }
      if (k.open){
        const off=k.v-k.target;
        if (Math.abs(off)<=0.018){ tap('Space'); return; }
        tap(off>0?'KeyQ':'KeyE');            // seam right of the head => pull left
        return;
      }
      if (k.lookOn){
        if (B.holdUntil && s.time<B.holdUntil) return;
        releaseF(B);
        return;
      }
      const band=(!k.seen.line && k.depth>=0.12 && k.depth<=0.38)?'line'
        :(!k.seen.bench && k.depth>=0.46 && k.depth<=0.70)?'bench'
        :(!k.seen.wall && k.depth>=0.78)?'wall':null;
      if (band){
        key('KeyW',false); key('KeyS',false);
        holdF(B,700+B.R()*350);
        return;
      }
      const allSeen=k.seen.line&&k.seen.bench&&k.seen.wall;
      if (allSeen){
        if (k.depth>0.62){ key('KeyS',true); key('KeyW',false); }
        else if (k.depth<0.50){ key('KeyW',true); key('KeyS',false); }
        else { key('KeyW',false); key('KeyS',false); tap('KeyE'); }
        return;
      }
      const next=!k.seen.line?0.24:(!k.seen.bench?0.58:0.86);
      if (k.depth<next-0.02){ key('KeyW',true); key('KeyS',false); }
      else if (k.depth>next+0.04){ key('KeyS',true); key('KeyW',false); }
      else { key('KeyW',false); key('KeyS',false); }
      return;
    }
    key('KeyW',false);
    if (s.scene==='room' && powerGate(B,30)){ waitPower(B); return; }
    if (!s.finalPhoto){
      if (Math.hypot(s.wx-WOMAN[0],s.wy-WOMAN[1])>1.7){ if (!B.walk) walk(B,WOMAN[0],WOMAN[1]); return; }
      if (!s.camera){ holdF(B,1300+B.R()*600); return; }
      if (B.holdUntil && s.time<B.holdUntil) return;
      if (B.R()<0.12){ releaseF(B); return; }
      tap('KeyL'); releaseF(B);
      return;
    }
    if (!s.phoneDone){
      if (Math.hypot(s.wx-DOOR[0],s.wy-DOOR[1])>1.3){ if (!B.walk) walk(B,DOOR[0],DOOR[1]); return; }
      tap('KeyE');
      return;
    }
    if (!s.handRaised){
      if (Math.hypot(s.wx-WOMAN[0],s.wy-WOMAN[1])>1.7){ if (!B.walk) walk(B,WOMAN[0],WOMAN[1]); return; }
      tap('KeyQ');
      return;
    }
    if (!s.mismatch){
      if (!s.camera) holdF(B,700+B.R()*500);
      else if (B.holdUntil && s.time<B.holdUntil) return;
      else releaseF(B);
      return;
    }
    // film ending route: raise the DV a second time instead of walking to her.
    // The mirror only fires on a fresh press, so the DV must be lowered first;
    // holding F without releasing just leaves the first take on screen.
    if (B.filmTry && !B.filmTried && (B.filmForced || B.R()<0.5)){
      if (s.camera){ releaseF(B); return; }
      B.filmTried=true;
      holdF(B,1200);
      return;
    }
    if (Math.hypot(s.wx-WOMAN[0],s.wy-WOMAN[1])>1.4){ if (!B.walk) walk(B,WOMAN[0],WOMAN[1]); return; }
    tap('KeyE');
  }

  // ---------------- the loop ----------------
  function onChapter(B,g){
    const s=G.state;
    if (B.lastChapter===undefined){ B.lastChapter=s.chapter; B.chEntry=s.time; return; }
    if (s.chapter===B.lastChapter) return;
    B.dwell=B.dwell||{}; B.dwell[B.lastChapter]=+(s.time-(B.chEntry||0)).toFixed(1);
    B.lastChapter=s.chapter; B.chEntry=s.time;
    B.scanned={}; B.photoed={}; B.tried={}; B.huntPos=null; B.facing=null;
    B.lastHide=null; B.wantBook=false; B.ch3Shot=false; B.ch3Tries=0;
  }

  function runOnce(seed){
    const R=rng(seed*104729+7);
    const B=newBrain(seed,R);
    const g={t:0,B,events:[],issues:[]};
    heldReset();
    document.getElementById('startBtn').click();
    // the title screen already told the player the keys; nothing else
    step();

    let lastDecide=0;
    while (g.t<BUDGET && !G.state.ended && !B.giveUp){
      const s=G.state;
      const p=perceive();
      learn(B,p);
      const bc=(k)=>{ B.br=B.br||{}; B.br[k]=+((B.br[k]||0)+DT).toFixed(1); };
      if (s.paused){ bc('paused'); releaseAll(); step(); g.t+=DT; continue; }
      if (s.transition||s.inputLock){ bc(s.transition?'transition':'inputLock'); releaseAll(); step(); g.t+=DT; continue; }
      if (s.caseOpen){
        bc('case');
        if (B.wantBook||B.forceBook) bookTick(B,p);
        else if (g.t-(B.tabAt||0)>1.6+B.R()*1.4) tap('Tab');
        step(); g.t+=DT; continue;
      }
      if (s.review && !(s.chapter===3&&s.ch3FrameGate)){ bc('review'); tap('KeyR'); step(); g.t+=DT; continue; }

      // reading dwell: whichever line is on screen has to be read first
      // Reading pauses the hands, not a held viewfinder: someone with the DV
      // raised is looking, not reading, and the battery keeps draining.
      if (HUMAN && !G.state.camera && !B.walk){
        const line=(p.say||'')+' '+(p.prompt||'');
        if (line!==B.readLine){
          B.readLine=line;
          B.readUntil=g.t+Math.min(3.4,0.8+line.length*0.085);
        }
      }
      // human decision cadence
      if (g.t-lastDecide>0.55+R()*0.9 && (!HUMAN || g.t>=(B.readUntil||0))){
        lastDecide=g.t;
        if (R()<B.error) { B.counters.fumbles++; tap(['KeyE','KeyL','KeyR','KeyQ','Tab','Space'][Math.floor(R()*6)]); }
        else if (B.R()<0.03) { B.counters.tabs++; tap('Tab'); B.tabAt=g.t; }
        else {
          (B.trace=B.trace||[]).push([+g.t.toFixed(1),s.chapter,(p.prompt||'').slice(0,18),
            (p.say||'').slice(0,18),s.camera?'cam':'-',Math.round(s.battery)]);
          if (B.trace.length>40) B.trace.shift();
          const ch=s.chapter;
          if (s.scene==='corridor') doChapter5(B,p);
          else if (ch===1) doChapter1(B,p);
          else if (ch===2) doChapter2(B,p);
          else if (ch===3) doChapter3(B,p);
          else if (ch===4) doChapter4(B,p);
          else doChapter5(B,p);
        }
      }

      if (B.walk) walkStep(B);
      bc('act');
      step(); g.t+=DT;
      if (G.state.battery<B.minBat) B.minBat=G.state.battery;

      // progress / confusion tracking
      onChapter(B,g);
      const sg=sig();
      if (sg!==B.lastSig){
        B.lastSig=sg; B.lastProgressAt=g.t;
        B.counters.emotes++;

        if (B.chapterAt[s.chapter]===undefined) B.chapterAt[s.chapter]=g.t;
        if (s.chapter>=2) B.chapterAt['in'+s.chapter]=B.chapterAt['in'+s.chapter]!==undefined?B.chapterAt['in'+s.chapter]:g.t;
      } else if (g.t-B.lastProgressAt>STUCK && !s.ended){
        B.confusions.push({chapter:s.chapter,name:p.name||'-',secs:+(g.t-B.lastProgressAt).toFixed(0),
          prompt:p.prompt.slice(0,40),say:p.say.slice(0,40)});
        B.lastProgressAt=g.t;
        stopWalk(B); releaseF(B);
        if (B.confusions.length>=MAX_CONFUSIONS) B.giveUp=true;
        else { B.tabs++; tap('Tab'); B.tabAt=g.t; B.huntPos=null; B.tried={}; }  // re-read the notes
      }
    }
    releaseAll();
    const s=G.state;
    B.dwell=B.dwell||{}; B.dwell[s.chapter]=+(s.time-(B.chEntry||0)).toFixed(1);
    return {
      seed, outcome:s.ended?(s.ending||'ended'):(B.giveUp?'ABANDON':'TIMEOUT'),
      chapter:s.chapter, scene:s.scene,
      sec:+g.t.toFixed(1),
      dwell:dwellOf(B),
      seg:segments(B,g),
      minBat:+B.minBat.toFixed(0),
      counters:Object.assign({},B.counters,{wrongRitual:G.state.ritual.loop||0}),
      phaseT:Object.assign({},B.phaseT),
      bookAware:!!B.bookAware,attentive:!!B.attentive,
      confusions:B.confusions.slice(0,4),
      dbg:Object.assign(debugState(B),{c2:B.clog2}),
      issues:g.issues
    };
  }
  function dwellOf(B){
    const out={};
    for (const k of [1,2,3,4,5]) if (B.dwell&&B.dwell[k]!==undefined) out['ch'+k]=B.dwell[k];
    return out;
  }
  function heldReset(){ for (const k of Object.keys(held)) held[k]=false; }
  function segments(B,g){
    const out={};
    for (const k of ['in2','in3','in4','in5']) out[k]=B.chapterAt[k]!==undefined?+B.chapterAt[k].toFixed(1):null;
    return out;
  }

  // ---------------- batch ----------------
  if (E2E_OK){
    let r=null, err=null;
    try{ r=runOnce(101); }catch(e){ err=e; }
    // The ending card is written by a deferred job (520ms). Advance the same
    // simulated clock the player has been using so the card actually exists.
    const endEl2=document.getElementById('end');
    for (let i=0;i<200 && endEl2 && endEl2.classList.contains('hidden');i++){
      G.state.time+=DT; G.tickJobs();
    }
    const endTxt=(document.getElementById('endTitle')||{}).textContent||'';
    const ending=(G.state&&G.state.ending)||'';
    const want=END_TITLE[E2E];
    const ok=!err && ending===E2E && endTxt.trim()===want && !(ERRS.length);
    const detail=ok?'':('ending='+JSON.stringify(ending)+' endTitle='+JSON.stringify(endTxt.trim())
      +(err?' err='+err.message:'')+(ERRS.length?' pageerror='+ERRS[0]:''));
    document.title=(ok?'E2E PASS ':'E2E FAIL ')+E2E+(r?' '+(r.sec).toFixed(1)+'s':'')+(detail?' :: '+detail:'');
    document.body.setAttribute('data-e2e',JSON.stringify({ending:E2E,ok,sec:r&&r.sec,seg:r&&r.seg,dwell:r&&r.dwell,c2:r&&r.dbg&&r.dbg.c2,
      keys:r&&r.counters,_endTitle:endTxt.trim(),err:err&&err.message,pageErrors:ERRS.slice(0,4)}));
    window.__stopLoop=true;
    return;
  }
  const results=[];
  const outcomes={}, conf={}, counters={}, abandonAt={};
  const t0=performance.now();
  for (let i=0;i<RUNS;i++){
    let r;
    try{ r=runOnce(i+OFF); r.seed=i+OFF; }
    catch(e){ r={seed:i,outcome:'HARNESS_EXCEPTION',chapter:-1,scene:'-',sec:0,seg:{},minBat:0,
      counters:{},confusions:[],issues:['EXCEPTION | '+(e&&e.message||e)]}; }
    // a full reset between players
    try{ G.state.ended=true; document.getElementById('restartBtn').click(); }catch(e){}
    results.push(r);
    outcomes[r.outcome]=(outcomes[r.outcome]||0)+1;
    if (r.outcome==='ABANDON'||r.outcome==='TIMEOUT'){
      const key='第'+(r.chapter||'?')+'章';
      abandonAt[key]=(abandonAt[key]||0)+1;
    }
    for (const c of r.confusions||[]){
      const key='第'+c.chapter+'章 · '+(c.name||'-')+' · '+(c.prompt||'(无提示)').replace(/\s+/g,' ').replace(/\d+/g,'#');
      conf[key]=(conf[key]||0)+1;
    }
    for (const k of Object.keys(r.counters||{})) counters[k]=(counters[k]||0)+(r.counters[k]||0);
  }
  const finished=results.filter(r=>r.outcome==='help'||r.outcome==='film');
  const series=(f)=>{ const v=results.map(f).filter(x=>typeof x==='number'&&isFinite(x)).sort((a,b)=>a-b);
    return v.length?{p10:+v[Math.floor(v.length*0.1)].toFixed(1),p50:+v[Math.floor(v.length*0.5)].toFixed(1),
      p90:+v[Math.floor(v.length*0.9)].toFixed(1)}:null; };
  const phaseMed={};
  for (const ph of ['talk','scan','book','photo','set']){
    const v=finished.map(r=>r.phaseT&&r.phaseT[ph]).filter(x=>typeof x==='number').sort((a,b)=>a-b);
    phaseMed[ph]=v.length?+v[Math.floor(v.length/2)].toFixed(1):null;
  }
  const secs=finished.map(r=>r.sec).sort((a,b)=>a-b);
  const pct=p=>secs.length?secs[Math.min(secs.length-1,Math.floor(secs.length*p))]:0;
  const median=(arr)=>{ const v=arr.filter(x=>typeof x==='number').sort((a,b)=>a-b);
    return v.length?+v[Math.floor(v.length/2)].toFixed(1):null; };
  const summary={
    runs:RUNS,
    ms:Math.round(performance.now()-t0),
    outcomes,
    finishedSec:{p10:pct(0.1),p50:pct(0.5),p90:pct(0.9),min:secs[0]||0,max:secs[secs.length-1]||0},
    reachChapter:{},
    chapterEnteredAt:{in2:median(finished.map(r=>r.seg.in2)),in3:median(finished.map(r=>r.seg.in3)),
      in4:median(finished.map(r=>r.seg.in4)),in5:median(finished.map(r=>r.seg.in5))},
    abandonAt,
    dwell:{ch1:median(finished.map(r=>r.dwell&&r.dwell.ch1)),ch2:median(finished.map(r=>r.dwell&&r.dwell.ch2)),
      ch3:median(finished.map(r=>r.dwell&&r.dwell.ch3)),ch4:median(finished.map(r=>r.dwell&&r.dwell.ch4)),
      ch5:median(finished.map(r=>r.dwell&&r.dwell.ch5))},
    confusion:Object.entries(conf).sort((a,b)=>b[1]-a[1]).slice(0,14),
    counters,
    minBattery:median(results.map(r=>r.minBat)),
    ch1Phase:phaseMed,
    chargeSec:series(r=>r.counters&&r.counters.chargeSec),
    dwellPct:{ch1:series(r=>r.dwell&&r.dwell.ch1),ch2:series(r=>r.dwell&&r.dwell.ch2),
      ch3:series(r=>r.dwell&&r.dwell.ch3),ch4:series(r=>r.dwell&&r.dwell.ch4),
      ch5:series(r=>r.dwell&&r.dwell.ch5)},
    stillStuck:results.filter(r=>!r.outcome||r.outcome==='HARNESS_EXCEPTION').length,
    byArchetype:archetypeStats(finished),
    sample:results.filter(r=>r.outcome!=='help'&&r.outcome!=='film').slice(0,8)
  };
  for (const r of results) summary.reachChapter[r.chapter]=(summary.reachChapter[r.chapter]||0)+1;
  function archetypeStats(fin){
    const out={};
    for (const a of [true,false]){
      const g=fin.filter(r=>r.attentive===a);
      if (!g.length) continue;
      out['readsSubs_'+a]={n:g.length,p50:+g.map(r=>r.sec).sort((x,y)=>x-y)[Math.floor(g.length/2)].toFixed(0),
        bookPct:Math.round(100*g.filter(r=>r.bookAware).length/g.length)};
    }
    return out;
  }
  if (ERRS.length) summary.errors=ERRS.slice(0,10);
  if (RAW) summary.results=results;
  document.body.setAttribute('data-naive',JSON.stringify(summary));
  // Stop the rAF loop so the headless run exits as soon as the batch is done.
  window.__stopLoop=true;
  document.title='NAIVE DONE';
  window.__naiveSummary=summary;
})();
