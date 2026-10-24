// Random-player fuzz harness for 《祭：她在画面里》.
//
// Loaded only when index.html?fuzz=<runs> is opened (see game.js tail).
//
// What it does, per run:
//   * boots the real game with G.startGame(false) and drives the real state
//     machine (same functions the keyboard handlers call);
//   * chooses every action from a seeded RNG: which prop to scan first, which
//     hiding place to run to, whether to misread the tape, whether to hit
//     pause / Tab / R / F at the worst moment, how long to wait;
//   * in "chaos" runs it stops goal-seeking and mashes random legal verbs,
//     which is where re-entrancy bugs show up;
//   * checks invariants every tick (NaN, negative counts, out-of-range
//     coordinates/depth, unknown scene/chapter, impossible hide round …);
//   * records uncaught exceptions and console.error calls;
//   * stops on an ending, on a 120 s no-progress stall, or at the step cap.
//
// Rendering, audio and DOM writing are short-circuited by G.setFuzz(true), so
// a run is pure logic and 1000 runs finish in seconds. The page exposes a JSON
// summary on <body data-fuzz="..."> and window.__fuzzSummary.
(function(){
  'use strict';
  const G=window.__jiThird;
  const q=new URLSearchParams(location.search);
  const RUNS=Math.max(1,Math.min(5000,parseInt(q.get('fuzz'),10)||1000));
  const BASE=parseInt(q.get('fuzzseed'),10)||20261024;
  const CHAOS_FRAC=Math.max(0,Math.min(1,parseFloat(q.get('chaos'))||0.15));
  const DT=0.05;
  const STEP_CAP=Math.round(1200/DT);   // 20 simulated minutes hard cap
  const STALL_SEC=120;
  const PROGRESS_GRACE=8;

  if (!G){
    document.title='FUZZ FAIL: __jiThird missing';
    return;
  }

  // ---------- error capture ----------
  const PAGE_ERRORS=[];
  window.addEventListener('error',(e)=>{
    if (!e || (!e.message && !e.filename)) return;
    PAGE_ERRORS.push('window.error: '+(e.message||'?')+' @'+(e.filename||'').split('/').pop()+':'+(e.lineno||0));
  });
  window.addEventListener('unhandledrejection',(e)=>{
    const r=e&&e.reason;
    PAGE_ERRORS.push('unhandledrejection: '+((r&&r.message)||String(r)));
  });
  const nativeError=console.error.bind(console);
  console.error=(...args)=>{
    try{ PAGE_ERRORS.push('console.error: '+args.map(a=>a&&a.stack?String(a.stack).split('\n')[0]:String(a)).join(' ')); }catch(_){}
    try{ nativeError(...args); }catch(_){}
  };
  const errorMark=()=>PAGE_ERRORS.length;

  // ---------- deterministic RNG ----------
  function rng(seed){
    let a=(seed>>>0)||1;
    return function(){
      a=(a+0x6D2B79F5)>>>0;
      let t=a;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }

  // ---------- grid path-finding over the real collision test ----------
  const X0=0.6, Y0=0.6, X1=11.4, Y1=8.4, STEP=0.2;
  const NX=Math.round((X1-X0)/STEP)+1, NY=Math.round((Y1-Y0)/STEP)+1;
  const CLEAR=Math.ceil(0.26/STEP);
  const free=new Uint8Array(NX*NY), raw=new Uint8Array(NX*NY);
  for (let ix=0;ix<NX;ix++) for (let iy=0;iy<NY;iy++){
    raw[iy*NX+ix]=G.blocked(X0+ix*STEP,Y0+iy*STEP)?0:1;
  }
  for (let ix=0;ix<NX;ix++) for (let iy=0;iy<NY;iy++){
    let ok=raw[iy*NX+ix];
    for (let dx=-CLEAR;dx<=CLEAR&&ok;dx++) for (let dy=-CLEAR;dy<=CLEAR&&ok;dy++){
      const jx=ix+dx, jy=iy+dy;
      if (jx<0||jy<0||jx>=NX||jy>=NY){ ok=0; continue; }
      if (!raw[jy*NX+jx]) ok=0;
    }
    free[iy*NX+ix]=ok;
  }
  const idx=(ix,iy)=>iy*NX+ix;
  function nearestFree(x,y){
    const cx=Math.round((x-X0)/STEP), cy=Math.round((y-Y0)/STEP);
    for (let r=0;r<8;r++){
      for (let dx=-r;dx<=r;dx++) for (let dy=-r;dy<=r;dy++){
        const ix=cx+dx, iy=cy+dy;
        if (ix<0||iy<0||ix>=NX||iy>=NY) continue;
        if (free[idx(ix,iy)]) return [ix,iy];
      }
    }
    return null;
  }
  function plan(sx,sy,tx,ty){
    const s=nearestFree(sx,sy), t=nearestFree(tx,ty);
    if (!s||!t) return null;
    const prev=new Int32Array(NX*NY).fill(-1);
    const seen=new Uint8Array(NX*NY);
    const queue=new Int32Array(NX*NY);
    let head=0, tail=0;
    const start=idx(s[0],s[1]);
    queue[tail++]=start; seen[start]=1; prev[start]=-2;
    const goal=idx(t[0],t[1]);
    while (head<tail){
      const cur=queue[head++];
      if (cur===goal) break;
      const cx=cur%NX, cy=(cur-cx)/NX;
      const nb=[[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx,dy] of nb){
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
    path.reverse();
    return path;
  }

  // ---------- fixed geometry (what a sighted player can see) ----------
  const SPOTS={incense:[9.35,6.25],bowl:[5.55,5.0],thread:[3.7,1.0]};
  const ALTAR=[7.05,6.3], WOMAN=[9.5,3.1], DOOR=[2.0,1.2];
  const TRUE_TAKE=[3,0,2];               // take 乙, the only correct ritual
  const TAKE_NAMES=['甲','乙','丙'];

  // ---------- run context ----------
  function newCtx(seed,mode){
    return {seed,mode,rnd:rng(seed),t:0,steps:0,mayhems:0,issues:[],issueSet:{},
      minBat:100,bat0:100,cameraRaises:0,goFails:0,chaosAct:0,bursts:0,
      lastSig:'',lastProgressAt:0,lastX:0,lastY:0,lastD:'',done:false};
  }
  function issue(g,kind,detail){
    const key=kind+' | '+detail;
    if (g.issueSet[key]) return;
    g.issueSet[key]=1;
    if (g.issues.length<16) g.issues.push(key);
  }
  function clearKeys(){ G.keys.left=G.keys.right=G.keys.up=G.keys.down=false; }
  function key(code,down){
    try{
      window.dispatchEvent(new KeyboardEvent(down===false?'keyup':'keydown',
        {code,key:code,bubbles:true,cancelable:true}));
    }catch(e){}
  }
  function burst(g,n){
    // Rapid switching: real key events with no simulation tick in between, so
    // overlay/re-entrancy guards get hammered exactly like an impatient player.
    const codes=['KeyF','KeyE','KeyL','KeyR','KeyQ','Space','Tab','Escape',
      'KeyW','KeyA','KeyS','KeyD','Digit1','Digit2','Digit3'];
    for (let i=0;i<n;i++){
      const c=codes[Math.floor(g.rnd()*codes.length)];
      key(c,true);
      if (c==='KeyF'||c==='KeyW'||c==='KeyA'||c==='KeyS'||c==='KeyD') key(c,false);
    }
    g.bursts++;
  }

  // ---------- invariants ----------
  const SCENES={room:1,corridor:1,darkroom:1};
  function invariants(g){
    const s=G.state;
    const bad=(kind,detail)=>{ issue(g,kind,detail); g.failed=true; };
    const fin=v=>typeof v==='number'&&isFinite(v);
    if (!fin(s.wx)||!fin(s.wy)) bad('ABNORMAL','non-finite position '+s.wx+','+s.wy);
    else if (s.wx<0.55||s.wx>11.45||s.wy<0.55||s.wy>8.45)
      bad('ABNORMAL','position out of room '+s.wx.toFixed(2)+','+s.wy.toFixed(2));
    if (!fin(s.battery)||s.battery<-0.01||s.battery>100.01)
      bad('ABNORMAL','battery '+s.battery);
    if (!fin(s.time)) bad('ABNORMAL','time '+s.time);
    if (!Number.isInteger(s.chapter)||s.chapter<1||s.chapter>5)
      bad('ABNORMAL','chapter '+s.chapter);
    if (!SCENES[s.scene]) bad('ABNORMAL','scene '+String(s.scene));
    if (s.ending!==null&&s.ending!==undefined&&typeof s.ending!=='string')
      bad('ABNORMAL','ending type '+typeof s.ending);
    if (s.hunt){
      const c=s.hunt.count;
      if (!Number.isInteger(c)||c<0||c>4) bad('ABNORMAL','hunt count '+c);
      if (s.chapter===2&&(!Number.isInteger(s.hunt.pos)||s.hunt.pos<0||s.hunt.pos>2))
        bad('ABNORMAL','hunt pos '+s.hunt.pos);
      if (s.chapter===3&&c>3) bad('ABNORMAL','ch3 hunt count '+c);
    }
    if (s.hide){
      if (!Number.isInteger(s.hide.round)||s.hide.round<0||s.hide.round>4)
        bad('ABNORMAL','hide round '+s.hide.round);
      if (!fin(s.hide.remaining)) bad('ABNORMAL','hide remaining '+s.hide.remaining);
    }
    if (s.ritual){
      const r=s.ritual;
      if (![1,2,3].includes(r.incense)) bad('ABNORMAL','ritual incense '+r.incense);
      if (![0,1,2].includes(r.bowl)) bad('ABNORMAL','ritual bowl '+r.bowl);
      if (![0,1,2].includes(r.thread)) bad('ABNORMAL','ritual thread '+r.thread);
      if (!Number.isInteger(r.loop)||r.loop<0||r.loop>3) bad('ABNORMAL','ritual loop '+r.loop);
    }
    if (s.photos) for (const k of ['incense','bowl','thread'])
      if (typeof s.photos[k]!=='boolean') bad('ABNORMAL','photos.'+k+' '+s.photos[k]);
    if (s.anomalies) for (const k of ['incense','bowl','thread'])
      if (typeof s.anomalies[k]!=='boolean') bad('ABNORMAL','anomalies.'+k+' '+s.anomalies[k]);
    if (s.corr){
      if (!fin(s.corr.depth)||s.corr.depth<-0.001||s.corr.depth>1.001)
        bad('ABNORMAL','corridor depth '+s.corr.depth);
    }
    if (s.dark){
      if (!fin(s.dark.depth)||s.dark.depth<-0.001||s.dark.depth>1.001)
        bad('ABNORMAL','darkroom depth '+s.dark.depth);
      if (!fin(s.dark.v)||s.dark.v<-0.001||s.dark.v>1.001)
        bad('ABNORMAL','splicer v '+s.dark.v);
      if (!fin(s.dark.target)||s.dark.target<-0.001||s.dark.target>1.001)
        bad('ABNORMAL','splicer target '+s.dark.target);
      if (!Number.isInteger(s.dark.tries)||s.dark.tries<0)
        bad('ABNORMAL','splicer tries '+s.dark.tries);
    }
    if (s.scanT<-0.001||s.scanT>4.21) bad('ABNORMAL','scanT '+s.scanT);
    if (s.reconOffset<-0.181||s.reconOffset>0.181) bad('ABNORMAL','recon offset '+s.reconOffset);
    if (s.ended&&s.review) bad('LEAK','review overlay still open after ending');
    if (s.battery<g.minBat) g.minBat=s.battery;
  }
  function signature(){
    const s=G.state;
    return [s.chapter,s.scene,s.ended?1:0,s.transition?1:0,s.review?1:0,s.caseOpen?1:0,
      s.ritual?s.ritual.loop+':'+(s.ritual.done?1:0):'-',
      s.hunt?s.hunt.count+'/'+(s.hunt.done?1:0):'-',
      s.hide?s.hide.round+'/'+(s.hide.active?1:0):'-',
      s.chapter===3?((s.anomalies.incense?1:0)+(s.anomalies.bowl?1:0)+(s.anomalies.thread?1:0)):'-',
      s.corr?((s.corr.portrait?1:0)+(s.corr.threadSeen?1:0)+(s.corr.nameSeen?1:0)+'/'+(s.corr.answered?1:0)+'/'+(s.corr.doorOpen?1:0)):'-',
      s.dark?((s.dark.seen&&s.dark.seen.line?1:0)+(s.dark.seen&&s.dark.seen.bench?1:0)+(s.dark.seen&&s.dark.seen.wall?1:0)+'/'+(s.dark.open?1:0)+'/'+(s.dark.split?1:0)):'-',
      Math.round(s.battery/10)].join('|');
  }

  // ---------- one simulation tick, mirroring frameBody order ----------
  function step(g){
    const s=G.state;
    if (s.paused) G.resumeGame();
    g.t+=DT; g.steps++;
    s.time+=DT;
    G.tickJobs();
    if (s.scene==='corridor') G.updateCorridor(DT);
    else if (s.scene==='darkroom') G.updateDarkroom(DT);
    else {
      if (!s.review) G.advanceMovement(DT);
      if (!s.review){ G.updateBattery(DT); G.updateHide(DT); }
      if (s.camera&&!s.review) G.updateScanProgress();
    }
    if (s.battery<g.minBat) g.minBat=s.battery;
    invariants(g);
    // No-progress detector: a run that spends two simulated minutes with the
    // exact same narrative/overlay signature is stuck, not just walking.
    const sig=signature();
    if (sig!==g.lastSig){ g.lastSig=sig; g.lastProgressAt=g.t; }
    else if (g.t-g.lastProgressAt>STALL_SEC && !g.done){
      // Chaos runs deliberately stop making progress; a cap there is the
      // expected end of the experiment, not a stalled player.
      if (g.mode==='chaos'){ g.done=true; g.chaosCap='stall'; }
      else {
        issue(g,'STALL','no progress for '+STALL_SEC+'s at ch'+s.chapter+' '+s.scene+' '+sig);
        g.stalled=true; g.done=true;
      }
    }
    if (g.steps>=STEP_CAP && !g.done){
      if (g.mode==='chaos'){ g.done=true; g.chaosCap='cap'; }
      else { issue(g,'CAP','step cap '+STEP_CAP+' at ch'+s.chapter+' '+s.scene); g.done=true; }
    }
  }
  function tick(g,sec){ const n=Math.max(1,Math.round(sec/DT)); for (let i=0;i<n&&!g.done;i++) step(g); }
  function waitFor(g,pred,maxSec){
    const n=Math.round((maxSec||8)/DT);
    for (let i=0;i<n;i++){ if (pred()) return true; step(g); if (g.done) break; }
    return !!pred();
  }

  // ---------- actions ----------
  function ensureFree(g){
    if (G.state.paused) G.resumeGame();
    if (G.state.review) G.exitReview();
    if (G.state.caseOpen) G.closeCase();
    if (G.state.camera) G.setCamera(false);
  }
  function goTo(g,x,y,timeout,tol){
    timeout=timeout||25; tol=tol||0.34;
    ensureFree(g);
    let path=plan(G.state.wx,G.state.wy,x,y);
    if (!path){ issue(g,'NAV','no path to '+x.toFixed(2)+','+y.toFixed(2)); g.goFails++; return false; }
    let wi=0, replans=0, stuck=0, lastX=G.state.wx, lastY=G.state.wy;
    const maxT=Math.round(timeout/DT);
    for (let i=0;i<maxT;i++){
      const s=G.state;
      if (s.ending){ clearKeys(); return false; }
      if (s.paused) G.resumeGame();
      if (s.caseOpen) G.closeCase();
      if (s.review) G.exitReview();
      if (s.camera){ clearKeys(); G.setCamera(false); step(g); continue; }
      if (s.transition||s.inputLock){ clearKeys(); step(g); continue; }
      if (Math.hypot(s.wx-x,s.wy-y)<tol){ clearKeys(); step(g); return true; }
      while (wi<path.length-1&&Math.hypot(s.wx-path[wi][0],s.wy-path[wi][1])<0.26) wi++;
      if (wi>=path.length-1&&Math.hypot(s.wx-path[wi][0],s.wy-path[wi][1])<0.24){
        clearKeys(); step(g); return true;
      }
      if (Math.hypot(s.wx-lastX,s.wy-lastY)<0.004){
        stuck+=DT;
        if (stuck>0.6&&replans<3){ stuck=0; replans++; const p2=plan(s.wx,s.wy,x,y); if (p2){ path=p2; wi=0; } }
      } else stuck=0;
      lastX=s.wx; lastY=s.wy;
      const wp=path[wi];
      clearKeys();
      const dx=wp[0]-s.wx, dy=wp[1]-s.wy;
      if (Math.abs(dx)>0.05) G.keys[dx>0?'right':'left']=true;
      if (Math.abs(dy)>0.05) G.keys[dy>0?'down':'up']=true;
      step(g);
      if (g.done) break;
    }
    clearKeys();
    issue(g,'NAV','walk timeout to '+x.toFixed(2)+','+y.toFixed(2)+
      ' at '+G.state.wx.toFixed(2)+','+G.state.wy.toFixed(2));
    g.goFails++;
    return false;
  }
  function wander(g,sec){
    const codes=[['left','KeyA'],['right','KeyD'],['up','KeyW'],['down','KeyS']];
    clearKeys();
    for (let i=0;i<2;i++){
      const [k]=codes[Math.floor(g.rnd()*codes.length)];
      G.keys[k]=true;
    }
    tick(g,sec||0.5);
    clearKeys();
  }
  function openCamera(g){
    for (let i=0;i<10;i++){
      const s=G.state;
      if (s.ended) return false;
      if (s.paused) G.resumeGame();
      if (s.review) G.exitReview();
      if (s.caseOpen) G.closeCase();
      if (s.scene!=='room') return false;
      if (s.camera) return true;
      if (s.battery<8){ tick(g,1); continue; }
      G.setCamera(true);
      if (G.state.camera){ g.cameraRaises++; return true; }
      tick(g,0.2);
    }
    return false;
  }
  function closeCamera(g){
    if (G.state.camera) G.setCamera(false);
    tick(g,0.1);
  }
  function holdCamera(g,sec){
    const n=Math.round(sec/DT);
    for (let i=0;i<n&&!g.done;i++){
      const s=G.state;
      if (!s.camera){
        if (s.battery<8){ tick(g,0.5); continue; }
        if (s.scene==='room') G.setCamera(true);
      }
      step(g);
    }
    return !!G.state.camera;
  }

  // Random but legal interference. Returns true when it disturbed the plan, so
  // the chapter routines can re-open the camera / re-check where they are.
  function chaos(g,force){
    if (!force&&g.rnd()>0.22) return false;
    const s=G.state;
    if (!s.started||s.ended||s.transition) return false;
    const pick=Math.floor(g.rnd()*14);
    g.chaosAct++;
    if (pick===0){ G.pauseGame(); tick(g,0.2+g.rnd()*0.8); G.resumeGame(); return true; }
    if (pick===1){ G.openCase(); tick(g,0.1); G.closeCase(); return true; }
    if (pick===2){ G.toggleMute(); G.toggleMute(); return false; }
    if (pick===3){ G.toggleFlashSafe(); G.toggleFlashSafe(); return false; }
    if (pick===4){ if (!s.camera) G.setCamera(true); else G.setCamera(false); tick(g,0.1); return true; }
    if (pick===5){ G.takePhoto(); tick(g,0.1); return true; }
    if (pick===6){ G.interact(); tick(g,0.1); return true; }
    if (pick===7){ G.commitRitual(); tick(g,0.1); return true; }
    if (pick===8){ G.raiseHand(); tick(g,0.1); return true; }
    if (pick===9){ if (s.review) G.exitReview(); else G.startReview(); tick(g,0.1); return true; }
    if (pick===10){ G.toggleReviewSplit(); return false; }
    if (pick===11){ burst(g,4+Math.floor(g.rnd()*14)); tick(g,0.2); return true; }
    if (pick===12){ wander(g,0.2+g.rnd()*0.8); return true; }
    if (pick===13){ if (s.scene==='corridor'){ key('KeyF',true); tick(g,0.3); key('KeyF',false); } return true; }
    return false;
  }

  // A few real key events, no tick between them, then a clean recovery. This is
  // the "impatient player" case: Esc / Tab / R / F / L mashed at a scene change.
  function mayhem(g,prob){
    if (g.rnd()>(prob===undefined?0.28:prob)) return;
    g.mayhems++;
    ensureFree(g);
    burst(g,5+Math.floor(g.rnd()*18));
    tick(g,0.25);
    ensureFree(g);
    tick(g,0.1);
  }

  function setRitual(g,want,mistakes){
    const order=['incense','bowl','thread'];
    const r=G.state.ritual;
    for (let guard=0;guard<90;guard++){
      const at=()=>({incense:r.incense,bowl:r.bowl,thread:r.thread});
      if (r.incense===want[0]&&r.bowl===want[1]&&r.thread===want[2]) return true;
      let k=null;
      const cur=at(), tgt={incense:want[0],bowl:want[1],thread:want[2]};
      for (const name of order){ if (cur[name]!==tgt[name]){ k=name; break; } }
      if (!k) return true;
      if (!goTo(g,SPOTS[k][0],SPOTS[k][1],18,0.16)) return false;
      G.interact();
      tick(g,0.1);
      if (G.state.inputLock) tick(g,1.7);
      if (mistakes&&guard<mistakes) G.interact();
    }
    issue(g,'CH1','ritual cycle guard exhausted take='+G.currentTake()+
      ' vals='+r.incense+','+r.bowl+','+r.thread+' want='+want.join(',')+
      ' active='+r.active+' done='+r.done+' pos='+G.state.wx.toFixed(2)+','+G.state.wy.toFixed(2)+
      ' cam='+G.state.camera+' ch='+G.state.chapter);
    return false;
  }

  // ---------- chapter routines ----------
  function chapter1(g){
    if (!G.state.talked){
      if (!goTo(g,WOMAN[0],WOMAN[1],15)) return 'CH1_WALK';
      G.interact(); tick(g,0.1);
    }
    if (!openCamera(g)){ issue(g,'CH1','camera refused at opening'); return 'CH1_CAM'; }
    if (!g.firstCloseupChecked){
      g.firstCloseupChecked=true;
      if (!(G.state.closeupUntil>performance.now()))
        issue(g,'CAMERA','first raise near her did not set the close-up');
    }
    if (!waitFor(g,()=>G.state.revealed,3)){ issue(g,'CH1','not revealed'); return 'CH1_CAM'; }
    tick(g,0.3+g.rnd()*0.8);
    if (G.state.camera) closeCamera(g);
    if (!waitFor(g,()=>G.state.ritual.active,6)){
      // press E once more in case the uncanny branch was skipped
      G.interact(); tick(g,0.2);
      if (!waitFor(g,()=>G.state.ritual.active,6)){
        issue(g,'CH1','ritual inactive choice='+G.state.choice+' uncanny='+G.state.uncannyDone);
        return 'CH1_RITUAL';
      }
    }
    mayhem(g,0.3);
    if (!g.badPath){
      // random scanning order; sometimes one prop is scanned twice or skipped
      const order=['incense','bowl','thread'].sort(()=>g.rnd()-0.5);
      for (const k of order){
        if (G.state.ended) return 'END';
        if (!goTo(g,SPOTS[k][0],SPOTS[k][1],18)) return 'CH1_WALK';
        if (!openCamera(g)) continue;
        holdCamera(g,1.45);
        G.takePhoto();
        closeCamera(g);
        if (!G.state.photos[k]) issue(g,'CH1','photo failed for '+k+' camSeen='+JSON.stringify(G.state.ritual.camSeen));
      }
      // (the scan itself is driven by updateScanProgress in step())
    } else {
      // bad-end path still needs a legal prep before three wrong rituals
      for (const k of ['incense','bowl','thread']){
        if (!goTo(g,SPOTS[k][0],SPOTS[k][1],18)) return 'CH1_WALK';
        if (!openCamera(g)) continue;
        holdCamera(g,1.45); G.takePhoto(); closeCamera(g);
      }
    }
    const wrong=!g.badPath&&g.rnd()<0.22?1:0;
    if (wrong){
      const w=[[2,1,0],[1,2,0]][Math.floor(g.rnd()*2)];
      if (!setRitual(g,w,0)) return 'CH1_WALK';
      if (!goTo(g,ALTAR[0],ALTAR[1],15)) return 'CH1_WALK';
      G.commitRitual(); tick(g,0.4);
      waitFor(g,()=>!G.state.inputLock,4);
    }
    if (g.badPath){
      for (let i=0;i<3;i++){
        const w=[[2,1,0],[1,2,0],[2,1,0]][i%3];
        if (!setRitual(g,w,0)) break;
        if (!goTo(g,ALTAR[0],ALTAR[1],15)) break;
        G.commitRitual(); tick(g,0.4);
        waitFor(g,()=>!G.state.inputLock,4);
        if (G.state.ending) break;
      }
    }
    if (!G.state.ending){
      if (!setRitual(g,TRUE_TAKE,0)) return 'CH1_WALK';
      if (!goTo(g,ALTAR[0],ALTAR[1],15)) return 'CH1_WALK';
      G.commitRitual(); tick(g,0.4);
      waitFor(g,()=>G.state.chapter===2||G.state.ending,12);
    }
    if (G.state.ending) return 'END';
    if (G.state.chapter!==2){ issue(g,'CH1','chapter2 not reached loop='+G.state.ritual.loop); return 'CH1_STALL'; }
    return null;
  }

  function chapter2(g){
    mayhem(g,0.35);
    for (let i=0;i<16&&!g.done;i++){
      if (G.state.ending) return 'END';
      if (G.state.chapter!==2) break;
      if (G.state.hunt&&G.state.hunt.count>=4){ tick(g,0.4); continue; }
      const pos=G.state.hunt?G.state.hunt.pos:0;
      if (g.rnd()<0.45){
        if (openCamera(g)){ holdCamera(g,0.35); closeCamera(g); }
      }
      let target=pos;
      if (g.wrongHunt&&i===0) target=(pos+1+Math.floor(g.rnd()*2))%3;
      if (!goTo(g,G.HIDE_SPOTS[target].x,G.HIDE_SPOTS[target].y,18)) return 'CH2_WALK';
      G.interact(); tick(g,0.25);
      waitFor(g,()=>!G.state.transition,3);
    }
    if (!waitFor(g,()=>G.state.chapter===3||G.state.ending,8)){
      issue(g,'CH2','did not reach ch3 count='+(G.state.hunt?G.state.hunt.count:-1));
      return 'CH2_STALL';
    }
    return G.state.ending?'END':null;
  }

  function chapter3(g){
    mayhem(g,0.3);
    const order=['incense','bowl','thread'].sort(()=>g.rnd()-0.5);
    for (const k of order){
      if (G.state.ending) return 'END';
      if (G.state.chapter!==3) break;
      if (G.state.anomalies[k]) continue;
      if (!goTo(g,SPOTS[k][0],SPOTS[k][1],18)) return 'CH3_WALK';
      let shot=false;
      for (let att=0;att<4&&!shot&&!g.done;att++){
        if (!openCamera(g)){ tick(g,1); continue; }
        holdCamera(g,1.35);
        if (!G.state.camera){ continue; }
        G.takePhoto(); tick(g,0.12);
        shot=!!G.state.anomalies[k];
        closeCamera(g);
      }
      if (!shot) issue(g,'CH3','photo failed for '+k+' count='+(G.state.hunt?G.state.hunt.count:-1));
    }
    if (G.state.ending) return 'END';
    if (G.state.chapter!==3) return null;
    // 3/3 -> frame gate; review and stop on the blinking frame
    if (G.state.ch3FrameGate&&!G.state.ch3FrameOk){
      mayhem(g,0.25);
      for (let att=0;att<4&&!G.state.ch3FrameOk&&!g.done;att++){
        G.startReview(); tick(g,0.15);
        if (!G.state.review){ issue(g,'CH3','review did not open'); break; }
        if (att===0&&g.rnd()<0.3){
          key('Escape',true);
          tick(g,0.15);
          if (G.state.review||G.state.paused)
            issue(g,'REVIEW_ESC','Esc left review open='+G.state.review+' paused='+G.state.paused);
          ensureFree(g);
          if (!G.state.review){ G.startReview(); tick(g,0.15); }
        }
        const frames=att<2?(3+Math.floor(g.rnd()*4)):5;  // last attempt always lands
        for (let f=0;f<frames;f++){ G.stepLookFrame(1); tick(g,0.2); }
        if (g.rnd()<0.25){ G.stepLookFrame(-1); tick(g,0.2); }
        G.exitReview(); tick(g,0.15);
        if (!G.state.ch3FrameOk) tick(g,0.3);
      }
    }
    if (!waitFor(g,()=>G.state.chapter===4||G.state.ending,8)){
      issue(g,'CH3','did not reach ch4 frameOk='+G.state.ch3FrameOk+
        ' gate='+G.state.ch3FrameGate+' count='+(G.state.hunt?G.state.hunt.count:-1)+
        ' anomalies='+((G.state.anomalies.incense?1:0)+(G.state.anomalies.bowl?1:0)+(G.state.anomalies.thread?1:0))+
        ' review='+G.state.review+' frame='+G.state.lookFrame+' rc='+G.state.reviewCount);
      return 'CH3_STALL';
    }
    return G.state.ending?'END':null;
  }

  function chapter4(g){
    mayhem(g,0.3);
    let rounds=0;
    while (rounds<12&&!g.done){
      if (G.state.ending) return 'END';
      if (G.state.chapter!==4) break;
      const h=G.state.hide;
      if (!h) break;
      if (!h.active){ tick(g,0.2); continue; }
      if (g.rnd()<0.4){ if (openCamera(g)){ holdCamera(g,0.25); closeCamera(g); } }
      const facing=h.facing;
      const choices=[0,1,2].filter(i=>i!==facing&&i!==h.lastSpot);
      let spot=choices.length?choices[Math.floor(g.rnd()*choices.length)]:(facing+1)%3;
      if (g.hideMistakes>rounds&&g.rnd()<0.5) spot=facing;
      if (!goTo(g,G.HIDE_SPOTS[spot].x,G.HIDE_SPOTS[spot].y,16)) return 'CH4_WALK';
      G.interact(); tick(g,0.25);
      if (g.rnd()<0.12&&G.state.chapter===4&&G.state.hide&&G.state.hide.active){
        // impatient player waits out the countdown on purpose (timeout branch)
        tick(g,12.2);
      }
      waitFor(g,()=>!G.state.transition,3);
      rounds++;
    }
    if (!waitFor(g,()=>G.state.chapter===5||G.state.ending,8)){
      issue(g,'CH4','did not reach ch5 round='+(G.state.hide?G.state.hide.round:-1));
      return 'CH4_STALL';
    }
    return G.state.ending?'END':null;
  }

  function moveDepth(g,target,scene,timeout){
    const maxT=Math.round((timeout||14)/DT);
    for (let i=0;i<maxT;i++){
      const s=G.state;
      if (s.scene!==scene||s.ending) { clearKeys(); return s.scene===scene; }
      const d=scene==='corridor'?s.corr.depth:s.dark.depth;
      if (Math.abs(d-target)<0.02){ clearKeys(); tick(g,0.05); return true; }
      clearKeys();
      if (d<target) G.keys.up=true; else G.keys.down=true;
      step(g);
    }
    clearKeys();
    issue(g,'MOVE','depth timeout '+scene+' want '+target+' got '+
      (scene==='corridor'?G.state.corr.depth:G.state.dark.depth));
    return false;
  }

  function corridor(g){
    mayhem(g,0.3);
    const beat=[0.22,0.55,0.80];
    for (const d of beat){
      if (G.state.ending) return 'END';
      if (G.state.scene!=='corridor') break;
      moveDepth(g,d,'corridor');
      key('KeyF',true); tick(g,0.3); key('KeyF',false); tick(g,0.1);
      if (g.rnd()<0.4){ G.corridorInteract(); tick(g,0.15); }
    }
    if (G.state.scene!=='corridor') return null;
    moveDepth(g,0.92,'corridor');
    key('KeyF',true); tick(g,0.3); key('KeyF',false); tick(g,0.1);
    if (!G.state.corr.nameSeen){
      // a second look, as a player would
      key('KeyF',true); tick(g,0.5); key('KeyF',false); tick(g,0.1);
    }
    if (!G.state.corr.nameSeen) issue(g,'CORR','name not seen at depth '+G.state.corr.depth);
    G.corridorInteract(); tick(g,0.2);
    if (G.state.corr.answered){
      waitFor(g,()=>G.state.corr.doorOpen||G.state.ending,5);
      if (G.state.corr.doorOpen) G.corridorInteract();
    }
    if (!waitFor(g,()=>G.state.scene==='darkroom'||G.state.ending,6)){
      issue(g,'CORR','darkroom not reached answered='+G.state.corr.answered+
        ' door='+G.state.corr.doorOpen);
      return 'CORR_STALL';
    }
    return G.state.ending?'END':darkroom(g);
  }

  function darkroom(g){
    mayhem(g,0.3);
    for (const [d,key] of [[0.22,'line'],[0.55,'bench'],[0.80,'wall']]){
      if (G.state.ending) return 'END';
      if (G.state.scene!=='darkroom') break;
      moveDepth(g,d,'darkroom');
      key2F(g,'KeyF',true); tick(g,0.3); key2F(g,'KeyF',false); tick(g,0.1);
      if (!G.state.dark.seen[key]) issue(g,'DARK','beat not seen '+key+' d='+G.state.dark.depth);
    }
    if (G.state.scene!=='darkroom') return null;
    moveDepth(g,0.55,'darkroom');
    G.darkInteract(); tick(g,0.2);
    if (!G.state.dark.open){ issue(g,'DARK','splicer did not open'); return 'DARK_OPEN'; }
    let aligned=false;
    for (let i=0;i<80&&!aligned&&!g.done;i++){
      const k=G.state.dark;
      const off=k.v-k.target;
      if (Math.abs(off)<=0.02){ aligned=true; break; }
      G.spliceAdjust(off>0?-1:1); tick(g,0.03);
    }
    G.spliceCommit(); tick(g,0.2);
    if (!G.state.dark.split){
      // a player misses the tolerance; nudge with a second pass
      for (let i=0;i<80&&!G.state.dark.split&&!g.done;i++){
        const k=G.state.dark;
        const off=k.v-k.target;
        G.spliceAdjust(off>0?-1:1); tick(g,0.03);
        if (Math.abs(k.v-k.target)<=0.02){ G.spliceCommit(); tick(g,0.2); }
      }
    }
    if (!G.state.dark.split) issue(g,'DARK','splice did not commit v='+G.state.dark.v+' target='+G.state.dark.target);
    G.darkPrint(); tick(g,0.2);
    moveDepth(g,0.05,'darkroom');
    G.darkInteract();
    if (!waitFor(g,()=>G.state.scene==='room'||G.state.ending,5)){ issue(g,'DARK','exit failed'); return 'DARK_EXIT'; }
    return G.state.ending?'END':null;
  }
  // darkroom's F is darkLookOn; the fuzzer drives it through the real key event
  function key2F(g,code,down){ key(code,down); }

  function chapter5(g){
    mayhem(g,0.25);
    if (!goTo(g,WOMAN[0],WOMAN[1],16)) return 'CH5_WALK';
    if (!openCamera(g)) return 'CH5_CAM';
    G.takeFinalPhoto(); tick(g,0.15);
    closeCamera(g);
    if (!G.state.finalPhoto){ issue(g,'CH5','final photo failed'); return 'CH5_PHOTO'; }
    if (!goTo(g,DOOR[0],DOOR[1],18)) return 'CH5_WALK';
    G.interact();
    if (!waitFor(g,()=>G.state.scene==='corridor'||G.state.ending,5)){ issue(g,'CH5','corridor not reached'); return 'CH5_CORR'; }
    if (G.state.ending) return 'END';
    const r=corridor(g); if (r) return r;
    if (G.state.ending) return 'END';
    if (!goTo(g,WOMAN[0],WOMAN[1],16)) return 'FIN_WALK';
    G.raiseHand(); tick(g,0.2);
    if (!G.state.handRaised){ issue(g,'FIN','raiseHand refused'); return 'FIN_HAND'; }
    if (!openCamera(g)) return 'FIN_CAM';
    if (!waitFor(g,()=>G.state.mismatch,3)){ issue(g,'FIN','mismatch did not fire'); return 'FIN_MISMATCH'; }
    closeCamera(g);
    tick(g,0.6);
    if (g.ending==='film'){
      G.setCamera(true); tick(g,0.3);
      if (!G.state.takes) issue(g,'FIN','second take did not start');
      // The film card is delayed 3.6 s; impatient players open the tape in that
      // window. The card must close it rather than land underneath it.
      if (g.rnd()<0.5){ G.startReview(); tick(g,0.2); }
      closeCamera(g);
      if (!waitFor(g,()=>G.state.ended,8)){ issue(g,'FIN','film ending missing'); return 'FIN_END'; }
      return 'END';
    }
    if (!goTo(g,WOMAN[0],WOMAN[1],12)) return 'FIN_WALK';
    G.interact();
    if (!waitFor(g,()=>G.state.ended,5)){ issue(g,'FIN','help ending missing'); return 'FIN_END'; }
    return 'END';
  }

  // ---------- batch ----------
  function runOnce(seed,mode,extra){
    const g=newCtx(seed,mode);
    g.badPath=!!extra.badPath;
    g.wrongHunt=!!extra.wrongHunt;
    g.hideMistakes=extra.hideMistakes||0;
    g.ending=extra.ending||'help';
    g.chaos=!!extra.chaos;
    const errs0=errorMark();
    const t0=performance.now();
    let result='';
    try{
      G.setFuzz(true);
      G.startGame(false);
      G.state.silent=false;
      G.setScanClock(()=>g.t*1000);
      tick(g,0.9);
      if (g.chaos){
        // pure chaos: no goal seeking, just legal verbs until the cap
        for (let i=0;i<4000&&!g.done;i++){
          chaos(g,true);
          if (g.rnd()<0.25) wander(g,0.2+g.rnd()*0.8);
          else step(g);
          if (G.state.ended){ g.done=true; break; }
        }
      } else {
        let r=chapter1(g);
        if (!r&&!G.state.ending) r=chapter2(g);
        if (!r&&!G.state.ending) r=chapter3(g);
        if (!r&&!G.state.ending) r=chapter4(g);
        if (!r&&!G.state.ending) r=chapter5(g);
        if (r&&r!=='END'&&!g.done) result=r;
      }
      if (!g.done){
        if (G.state.ended) g.done=true;
        else if (!result){ issue(g,'CAP','script ended before an ending at ch'+G.state.chapter+' '+G.state.scene); g.done=true; }
      }
    }catch(e){
      issue(g,'EXCEPTION',(e&&e.message||e)+' @ '+(e&&e.stack?String(e.stack).split('\n').slice(1,3).join(' '):''));
      g.done=true;
    }
    clearKeys();
    const s=G.state;
    const ended=!!s.ended&&!!s.ending;
    const errs=PAGE_ERRORS.slice(errs0);
    for (const e of errs) issue(g,'CONSOLE',e);
    return {
      seed,mode,
      outcome: ended?(s.ending||'ended'):(g.mode==='chaos'?'CHAOS_CAP':(g.stalled?'STALL':(result||'NO_END'))),
      ending:s.ending||null,
      chapter:s.chapter,
      scene:s.scene,
      simSec:+g.t.toFixed(1),
      steps:g.steps,
      minBattery:+g.minBat.toFixed(1),
      turns:g.cameraRaises,
      bursts:g.bursts,
      chaos:g.chaosAct, mayhems:g.mayhems,
      navFails:g.goFails,
      errors:errs.length,
      ms:+(performance.now()-t0).toFixed(1),
      issues:g.issues.slice(0,8)
    };
  }

  const results=[];
  const outcomes={};
  const issueCount={};
  const t0=performance.now();
  for (let i=0;i<RUNS;i++){
    const rand=rng((BASE+i*7919)>>>0);
    const chaos=i%Math.max(1,Math.round(1/Math.max(0.01,CHAOS_FRAC)))===0;
    const extra={
      badPath:rand()<0.10,
      wrongHunt:rand()<0.22,
      hideMistakes:rand()<0.30?1:0,
      ending:rand()<0.28?'film':'help',
      chaos
    };
    let res;
    try{ res=runOnce(BASE+i,chaos?'chaos':'player',extra); }
    catch(e){
      res={seed:BASE+i,mode:chaos?'chaos':'player',outcome:'HARNESS_EXCEPTION',ending:null,
        chapter:-1,scene:'-',simSec:0,steps:0,minBattery:0,turns:0,bursts:0,chaos:0,navFails:0,
        errors:1,ms:0,issues:['EXCEPTION | '+(e&&e.message||e)]};
    }
    results.push(res);
    outcomes[res.outcome]=(outcomes[res.outcome]||0)+1;
    for (const it of res.issues){
      const k=it.split(' | ')[0]+' | '+String(it.split(' | ')[1]).replace(/\d+(\.\d+)?/g,'#');
      issueCount[k]=(issueCount[k]||0)+1;
    }
  }
  const ms=Math.round(performance.now()-t0);
  const ended=results.filter(r=>r.ending==='help'||r.ending==='film'||r.ending==='bad');
  const bad=results.filter(r=>r.ending==='bad').length;
  const players=results.filter(r=>r.mode==='player');
  const noEnd=players.filter(r=>!r.ending).length;
  const name={help:0,film:0,bad:0};
  for (const r of ended) if (name[r.ending]!==undefined) name[r.ending]++;
  const times=ended.map(r=>r.simSec).sort((a,b)=>a-b);
  const pct=p=>times.length?times[Math.min(times.length-1,Math.floor(times.length*p))]:0;
  const completedPlayers=players.filter(r=>r.ending==='help'||r.ending==='film').length;
  const chaosCaps=results.filter(r=>r.outcome==='CHAOS_CAP').length;
  const summary={
    schema:'ji-fuzz/1',
    seedBase:BASE,
    runs:RUNS,
    chaosRuns:results.filter(r=>r.mode==='chaos').length,
    playerRuns:players.length,
    ms,
    simulatedSec:Math.round(results.reduce((a,r)=>a+r.simSec,0)),
    steps:results.reduce((a,r)=>a+r.steps,0),
    outcomes,
    endings:name,
    reachedEnding:ended.length,
    noEnding:noEnd,
    completedPlayers,
    playerCompletionPct:players.length?+(100*completedPlayers/players.length).toFixed(2):0,
    badEndings:bad,
    duration:{p10:pct(0.1),p50:pct(0.5),p90:pct(0.9),
      min:times[0]||0,max:times[times.length-1]||0},
    minBattery:results.reduce((a,r)=>Math.min(a,typeof r.minBattery==='number'?r.minBattery:100),100),
    problemCounts:{
      exceptions:results.filter(r=>r.outcome==='EXCEPTION'||r.outcome==='HARNESS_EXCEPTION').length,
      consoleErrors:results.filter(r=>r.errors>0).length,
      stalls:players.filter(r=>r.outcome==='STALL').length,
      noEnding:noEnd,
      chaosCaps,
      navFailures:results.filter(r=>r.navFails>0).length
    },
    issueCount,
    sampleFailures:results.filter(r=>r.issues.length&&!r.ending).slice(0,10),
    sampleEndings:results.filter(r=>r.ending).slice(0,5)
  };
  document.body.setAttribute('data-fuzz',JSON.stringify(summary));
  window.__fuzzSummary=summary;
  document.title=Object.keys(issueCount).length?'FUZZ ISSUES':'FUZZ PASS';
})();
