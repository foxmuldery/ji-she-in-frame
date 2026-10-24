// Simulated-player harness for 《祭：她在画面里》.
//
// Loaded only when index.html?sim=<runs> is opened (see game.js tail).
// It drives the *real* state machine: movement goes through the same
// collision + advanceMovement code, interactions go through interact(),
// camera through setCamera(), and simulated time goes through tickJobs().
// Rendering/HUD/audio are short-circuited by G.setFuzz(true) so that a run is
// pure logic and 1000 runs stay fast.
//
// Result is written to <body data-sim="..."> and document.title='SIM DONE'.
(function(){
  'use strict';
  const G=window.__jiThird;
  if (!G){ document.title='SIM FAIL: __jiThird missing'; return; }
  const q=new URLSearchParams(location.search);
  const RUNS=Math.max(1,Math.min(20000,parseInt(q.get('sim'),10)||1000));
  const DT=0.05;
  // The ritual props sit inside the table collision box, so the player can only
  // stand *near* them; scanTarget() uses a 2.1 radius, which these points satisfy.
  const SPOTS={incense:[9.35,6.25],bowl:[5.55,5.0],thread:[3.7,1.0]};
  const ALTAR=[7.05,6.3], WOMAN=[9.5,3.1], DOOR=[2.0,1.2], REVIEW_SPOT=[5.0,7.6];

  // ---------- deterministic RNG ----------
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

  // ---------- grid path-finding over the real collision test ----------
  const X0=0.6, Y0=0.6, X1=11.4, Y1=8.4, STEP=0.2;
  const NX=Math.round((X1-X0)/STEP)+1, NY=Math.round((Y1-Y0)/STEP)+1;
  const CLEAR=Math.ceil(0.26/STEP);     // plan with clearance so legs don't hug corners
  const free=new Uint8Array(NX*NY);
  const raw=new Uint8Array(NX*NY);
  for (let ix=0;ix<NX;ix++) for (let iy=0;iy<NY;iy++){
    raw[iy*NX+ix]=G.blocked(X0+ix*STEP,Y0+iy*STEP)?0:1;
  }
  for (let ix=0;ix<NX;ix++) for (let iy=0;iy<NY;iy++){
    let ok=raw[iy*NX+ix];
    for (let dx=-CLEAR;dx<=CLEAR&&ok;dx++) for (let dy=-CLEAR;dy<=CLEAR&&ok;dy++){
      const jx=ix+dx, jy=iy+dy;
      if (jx<0||jy<0||jx>=NX||jy>=NY) { ok=0; continue; }
      if (!raw[jy*NX+jx]) ok=0;
    }
    free[iy*NX+ix]=ok;
  }
  const idx=(ix,iy)=>iy*NX+ix;
  const planCache={};
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

  // ---------- run context ----------
  function newCtx(seed,opts){
    return {seed,opts,t:0,events:[],issues:[],marks:{},bat:{},minBat:100,nextGrief:0,pauseUntil:0,lastProgress:0,lastSig:'',done:false};
  }
  function issue(g,kind,detail){
    const k=kind+' | '+detail;
    if (g.issues.indexOf(k)<0) g.issues.push(k);
  }
  function clearKeys(){ G.keys.left=G.keys.right=G.keys.up=G.keys.down=false; }

  // One simulation step: mirrors the per-frame update order in frame().
  function griefTick(g){
    const s=G.state;
    if (s.paused && g.pauseUntil && g.t>g.pauseUntil){ G.resumeGame(); g.pauseUntil=0; return; }
    if (g.t<g.nextGrief) return;
    g.nextGrief=g.t+1.2+g.rnd()*2.2;
    if (s.transition||s.ended) return;      // overlays during black screens aren't a play action
    const a=Math.floor(g.rnd()*10);
    if (a===0){ G.pauseGame(); g.pauseUntil=g.t+0.4; }
    else if (a===1){ if (s.caseOpen) G.closeCase(); else G.openCase(); }
    else if (a===2){ G.toggleMute(); G.toggleMute(); }
    else if (a===3){ G.toggleFlashSafe(); G.toggleFlashSafe(); }
    else if (a===4){ if (s.review) G.exitReview(); }
    else if (a===5){ if (!s.camera) G.setCamera(true); }
    else if (a===6){ if (s.camera) G.setCamera(false); }
    else if (a===7){ G.commitRitual(); }
    else if (a===8){ G.takePhoto(); }
    else if (a===9){ if (!s.caseOpen) G.interact(); }
  }
  function step(g){
    // Headless Chrome fires blur/visibilitychange, and the game auto-pauses on
    // focus loss. Treat that as the player clicking back into the window.
    if (G.state.paused && !(g.pauseUntil && g.t<=g.pauseUntil)) G.resumeGame();
    g.t+=DT;
    G.state.time+=DT;
    G.tickJobs();
    if (g.opts.grief) griefTick(g);
    const s=G.state;
    if (s.scene==='corridor'){
      G.updateCorridor(DT);
    } else if (s.scene==='darkroom'){
      G.updateDarkroom(DT);
    } else {
      if (!s.review) G.advanceMovement(DT);
      G.updateBattery(DT);
      if (G.state.battery<g.minBat) g.minBat=G.state.battery;
      G.updateHide(DT);
    }
  }
  // Walk the first-person hall/room to a depth the way W/S would.
  function goDepth(g,scene,target,timeout){
    const maxT=Math.round((timeout||18)/DT);
    for (let i=0;i<maxT;i++){
      const s=G.state;
      if (s.paused) G.resumeGame();
      if (s.review) G.exitReview();
      if (s.caseOpen) G.closeCase();
      if (s.transition){ clearKeys(); step(g); continue; }
      if (s.scene!==scene||s.ending){ clearKeys(); return false; }
      const d=scene==='corridor'?s.corr.depth:s.dark.depth;
      if (Math.abs(d-target)<0.02){ clearKeys(); tick(g,0.05); return true; }
      clearKeys();
      G.keys[d<target?'up':'down']=true;
      step(g);
    }
    clearKeys();
    return false;
  }
  function tick(g,sec){
    const n=Math.max(1,Math.round(sec/DT));
    for (let i=0;i<n;i++) step(g);
  }

  function holdCamera(g){
    for (let i=0;i<8;i++){
      ensureFree(g);
      G.setCamera(true);
      if (G.state.camera) return true;
      tick(g,0.12);
    }
    return !!G.state.camera;
  }
  // Player keeps F held: if the camera drops (focus loss, overlay), raise it again.
  function keepCamera(g,sec){
    const n=Math.max(1,Math.round(sec/DT));
    for (let i=0;i<n;i++){
      const st=G.state;
      if (!st.camera){
        if (st.paused) G.resumeGame();
        if (st.review) G.exitReview();
        if (st.caseOpen) G.closeCase();
        G.setCamera(true);
      }
      step(g);
    }
    return !!G.state.camera;
  }
  function ensureFree(g){
    // A real player clears these overlays before acting; the harness does the same.
    if (G.state.paused) G.resumeGame();
    if (G.state.review) G.exitReview();
    if (G.state.caseOpen) G.closeCase();
    if (G.state.camera) G.setCamera(false);
  }
  function goTo(g,x,y,timeout,tol){
    timeout=timeout||30;
    tol=tol||0.32;
    ensureFree(g);
    let path=plan(G.state.wx,G.state.wy,x,y);
    if (!path){ issue(g,'NAV','no path to '+x.toFixed(2)+','+y.toFixed(2)); return false; }
    let wi=0;
    const maxT=Math.round(timeout/DT);
    let lastX=G.state.wx, lastY=G.state.wy, stuckT=0, replans=0;
    for (let i=0;i<maxT;i++){
      const st=G.state;
      if (st.ending) { clearKeys(); return false; }
      if (st.paused){
        clearKeys();
        if (g.pauseUntil && g.t<=g.pauseUntil){ step(g); continue; }
        G.resumeGame();
      }
      if (st.transition||st.inputLock){ clearKeys(); step(g); continue; }
      if (st.review||st.caseOpen){ clearKeys(); ensureFree(g); step(g); continue; }
      if (st.camera){ clearKeys(); G.setCamera(false); step(g); continue; }
      if (Math.hypot(st.wx-x,st.wy-y)<tol){ clearKeys(); step(g); return true; }
      while (wi<path.length-1 && Math.hypot(st.wx-path[wi][0],st.wy-path[wi][1])<0.26) wi++;
      // Clearance planning keeps the last node slightly short of the exact
      // goal when the goal sits on a collision edge; accept that as arrival.
      if (wi>=path.length-1 && Math.hypot(st.wx-path[wi][0],st.wy-path[wi][1])<0.24){
        clearKeys(); step(g); return true;
      }
      if (Math.hypot(st.wx-lastX,st.wy-lastY)<0.004){
        stuckT+=DT;
        if (stuckT>0.6 && replans<3){
          stuckT=0; replans++;
          const p2=plan(st.wx,st.wy,x,y);
          if (p2){ path=p2; wi=0; }
        }
      } else stuckT=0;
      lastX=st.wx; lastY=st.wy;
      const wp=path[wi];
      clearKeys();
      const dx=wp[0]-st.wx, dy=wp[1]-st.wy;
      if (Math.abs(dx)>0.05) G.keys[dx>0?'right':'left']=true;
      if (Math.abs(dy)>0.05) G.keys[dy>0?'down':'up']=true;
      step(g);
    }
    clearKeys();
    issue(g,'NAV','walk timeout to '+x.toFixed(2)+','+y.toFixed(2)+' at '+
      G.state.wx.toFixed(2)+','+G.state.wy.toFixed(2));
    return false;
  }

  function waitFor(g,pred,maxSec){
    const n=Math.round((maxSec||10)/DT);
    for (let i=0;i<n;i++){
      if (pred()) return true;
      step(g);
    }
    return pred();
  }

  function camWhy(g){
    const s=G.state;
    return 'started='+s.started+' ended='+s.ended+' tr='+s.transition+' rev='+s.review+
      ' paused='+s.paused+' case='+s.caseOpen+' bat='+s.battery.toFixed(1)+' cam='+s.camera+
      ' takes='+s.takes+' talked='+s.talked+' nearW='+
      (Math.hypot(s.wx-G.OLD.x,s.wy-G.OLD.y)<1.8)+' hand='+s.handRaised+' mismatch='+s.mismatch+
      ' afterOpen='+(g?g.talkedAfterOpen:'?')+' ch='+s.chapter+' scene='+s.scene;
  }
  function probe(){
    const s=G.state;
    return 'sc='+s.scene+' ch='+s.chapter+' cam='+s.camera+' tr='+s.transition+
      ' lock='+s.inputLock+' rev='+s.review+' case='+s.caseOpen+' paused='+s.paused+
      ' ended='+s.ended+' takes='+s.takes+' hand='+s.handRaised+' bat='+s.battery.toFixed(0)+
      ' pq='+s.pauseQueued+' pos='+s.wx.toFixed(2)+','+s.wy.toFixed(2);
  }
  function invariant(g){
    const s=G.state;
    if (!isFinite(s.wx)||!isFinite(s.wy)) issue(g,'STATE','non-finite position');
    if (s.wx<0.5||s.wx>11.5||s.wy<0.5||s.wy>8.5) issue(g,'STATE','out of bounds '+s.wx.toFixed(2)+','+s.wy.toFixed(2));
    if (s.battery<-0.001||s.battery>100.001) issue(g,'STATE','battery '+s.battery.toFixed(2));
    if (s.chapter<1||s.chapter>5) issue(g,'STATE','chapter '+s.chapter);
    if (s.hide&&s.hide.active&&s.hide.remaining<-0.001) issue(g,'STATE','hide remaining '+s.hide.remaining.toFixed(2));
    if (s.chapter===4&&s.hide&&s.hide.round>3) issue(g,'STATE','hide round '+s.hide.round);
  }
  function signature(){
    const s=G.state;
    return [s.chapter,s.scene,s.ritual&&s.ritual.done?1:0,s.ritual&&s.ritual.loop,s.hunt?s.hunt.count:-1,
      s.hide?s.hide.round:-1,s.corr?s.corr.answered?1:0:0,s.ending||'',s.review?1:0].join(':');
  }

  // ---------- chapter routines ----------
  function openFirstCamera(g){
    if (!goTo(g,WOMAN[0],WOMAN[1])) return false;
    G.interact();               // 老妇：手给我看看
    step(g);
    if (!holdCamera(g)) { issue(g,'CH1','camera refused at opening'); return false; }
    if (!waitFor(g,()=>G.state.revealed,3)) {
      const s=G.state;
      issue(g,'CH1','not revealed cam='+s.camera+' talked='+s.talked+' trans='+s.transition+
        ' lock='+s.inputLock+' bat='+s.battery.toFixed(1)+' pos='+s.wx.toFixed(2)+','+s.wy.toFixed(2));
      return false;
    }
    tick(g,0.5);
    for (let i=0;i<3 && G.state.choice===false && G.state.uncannyDone===false;i++){
      if (G.state.camera) G.setCamera(false);
      tick(g,0.4);
      if (G.state.choice||G.state.uncannyDone) break;
      if (!G.state.camera) holdCamera(g);
      tick(g,0.3);
    }
    if (!waitFor(g,()=>G.state.ritual.active,3) && G.state.camera){
      G.setCamera(false); tick(g,0.4);
    }
    if (!waitFor(g,()=>G.state.ritual.active,6)){
      const s=G.state;
      issue(g,'CH1','ritual inactive choice='+s.choice+' uncannyDone='+s.uncannyDone+
        ' cam='+s.camera+' chapter='+s.chapter+' trans='+s.transition+' ended='+s.ended);
      return false;
    }
    g.talkedAfterOpen=G.state.talked;
    return true;
  }

  function setRitual(g,want){
    const order=['incense','bowl','thread'];
    for (let guard=0;guard<80;guard++){
      const r=G.state.ritual;
      if (r.incense===want[0]&&r.bowl===want[1]&&r.thread===want[2]) return true;
      let k=null;
      for (const name of order){
        const cur={incense:r.incense,bowl:r.bowl,thread:r.thread}[name];
        const tgt={incense:want[0],bowl:want[1],thread:want[2]}[name];
        if (cur!==tgt){ k=name; break; }
      }
      if (!k) return true;
      if (!goTo(g,SPOTS[k][0],SPOTS[k][1],18,0.16)) return false;
      G.interact();
      tick(g,0.1);
      if (G.state.inputLock) tick(g,1.7);
    }
    issue(g,'CH1','ritual cycle guard exhausted');
    return false;
  }

  function shootRitualSet(g){
    for (const k of ['incense','bowl','thread']){
      if (!goTo(g,SPOTS[k][0],SPOTS[k][1])) return false;
      for (let att=0;att<3 && !G.state.photos[k];att++){
        if (!holdCamera(g)) continue;
        keepCamera(g,1.3);
        if (!G.state.camera) continue;
        G.completeCameraScan();
        G.takePhoto();
        tick(g,0.12);
      }
      if (G.state.camera) G.setCamera(false);
      tick(g,0.25);
      if (!G.state.photos[k]){ issue(g,'CH1','photo missing '+k+' '+probe()); return false; }
    }
    if (!G.photosAll()){ issue(g,'CH1','photosAll false '+probe()); return false; }
    return true;
  }

  function openReview(g){
    ensureFree(g);
    for (let i=0;i<6 && !G.state.review;i++){ G.startReview(); tick(g,0.2); }
    return !!G.state.review;
  }
  function doTapeReview(g){
    if (!G.state.review && !openReview(g)){ issue(g,'REVIEW','review refused '+probe()); return; }
    let gap=false;
    for (let p=0;p<=1.0001;p+=0.05){
      G.state.reviewPos=Math.min(1,p);
      G.updateReviewKind();
      if (G.state.reviewKind==='gap'){ gap=true; break; }
    }
    if (!gap) issue(g,'REVIEW','no gap window in timeline');
    for (let i=0;i<4;i++){
      const st=G.state.reviewQuiz;
      if (!st || st.locked) break;
      const q=G.REVIEW_QUIZ[st.step];
      if (!q) break;
      G.reviewPick(q.ans+1);
      tick(g,0.1);
    }
    const qz=G.state.reviewQuiz;
    if (!qz||!qz.locked) issue(g,'REVIEW','quiz not locked step='+(qz&&qz.step)+' kind='+G.state.reviewKind);
    else {
      G.setReconOffset(0);
      if (!G.state.reconAligned) issue(g,'REVIEW','recon not aligned at offset 0');
    }
    G.toggleReviewSplit();
    G.exitReview(); tick(g,0.3);
  }
  function chapter1(g){
    if (g.opts.skipIntro!==true){
      if (!openFirstCamera(g)) return 'CH1_OPEN';
    } else {
      G.state.ritual.active=true; G.state.uncannyDone=true; G.state.choice=true; G.state.talked=true;
      G.state.ritual.loop=0;
    }
    // optional review/case detour
    if (g.opts.readsTape){ if (openReview(g)) G.exitReview(); tick(g,0.2); }
    if (!shootRitualSet(g)) return 'CH1_PHOTO';
    // deliberate wrong ritual to exercise the loop <=3 path
    if (g.opts.wrongRitual>0){
      for (let i=0;i<g.opts.wrongRitual;i++){
        if (!goTo(g,ALTAR[0],ALTAR[1],12)) return 'CH1_ALTAR';
        G.commitRitual();
        tick(g,0.4);
        if (G.state.inputLock) tick(g,1.8);
        waitFor(g,()=>!G.state.inputLock,4);
        if (G.state.ending) return 'BAD_ENDING';
        // restore a wrong take for next attempt: flip incense by one
        if (G.state.ritual.loop>=3) break;
        if (!goTo(g,SPOTS.bowl[0],SPOTS.bowl[1])) return 'CH1_ALTAR';
        G.interact(); tick(g,0.1);
        G.interact(); tick(g,0.1);
      }
    }
    if (!setRitual(g,[3,0,2])) return 'CH1_SET';
    if (!goTo(g,ALTAR[0],ALTAR[1],12)) return 'CH1_ALTAR';
    if (!setRitual(g,[3,0,2])) return 'CH1_SET';
    let committed=false;
    for (let attempt=0;attempt<4&&!committed;attempt++){
      if (G.currentTake()!==G.RITUAL_TRUE){ if (!setRitual(g,[3,0,2])) break; }
      if (!goTo(g,ALTAR[0],ALTAR[1],12)) break;
      ensureFree(g);
      G.commitRitual();
      tick(g,0.3);
      committed=waitFor(g,()=>G.state.ritual.done||G.state.chapter>1,4);
    }
    if (!committed){
      issue(g,'CH1','commit did not complete take='+G.currentTake()+' loop='+G.state.ritual.loop+
        ' done='+G.state.ritual.done+' seen='+JSON.stringify(G.state.ritual.camSeen)+
        ' photos='+JSON.stringify(G.state.photos)+' '+probe());
      return 'CH1_COMMIT';
    }
    if (!waitFor(g,()=>G.state.chapter===2,12)){
      issue(g,'CH1','chapter2 not reached done='+G.state.ritual.done+' loop='+G.state.ritual.loop+
        ' scare='+G.state.scareUntil.toFixed(2));
      return 'CH1_STALL';
    }
    waitFor(g,()=>!G.state.transition,6);
    return null;
  }

  function chapter2(g){
    for (let i=0;i<10;i++){
      if (G.state.chapter!==2) break;
      if (G.state.hunt&&G.state.hunt.count>=4){ tick(g,0.4); continue; }
      const pos=G.state.hunt.pos;
      G.setCamera(true); tick(g,0.4); G.setCamera(false); tick(g,0.2);   // read the hint
      if (g.opts.wrongHunt && i===0){
        const wrong=(pos+1+G.rndInt(2))%G.HIDE_SPOTS.length;
        if (goTo(g,G.HIDE_SPOTS[wrong].x,G.HIDE_SPOTS[wrong].y,14,1.2)) G.interact();
        tick(g,0.3);
        waitFor(g,()=>!G.state.transition,3);
        continue;
      }
      if (!goTo(g,G.HIDE_SPOTS[pos].x,G.HIDE_SPOTS[pos].y,14,1.2)) { issue(g,'CH2','unreachable spot '+pos+' count='+G.state.hunt.count+' '+probe()); return 'CH2_WALK'; }
      G.interact();
      tick(g,0.3);
      waitFor(g,()=>!G.state.transition,3);
    }
    if (!waitFor(g,()=>G.state.chapter===3,6)) { issue(g,'CH2','did not reach ch3 count='+(G.state.hunt?G.state.hunt.count:-1)+' '+probe()); return 'CH2_STALL'; }
    return null;
  }

  function chapter3(g){
    for (const k of ['incense','bowl','thread']){
      if (G.state.chapter!==3) break;
      if (!goTo(g,SPOTS[k][0],SPOTS[k][1])) { issue(g,'CH3','unreachable '+k); return 'CH3_WALK'; }
      for (let att=0;att<3 && !G.state.anomalies[k];att++){
        if (!holdCamera(g)) continue;
        keepCamera(g,1.2);
        if (!G.state.camera) continue;
        G.state.scanDone=true;      // mirrors renderCameraScan's s>=1.0 branch
        G.takeAnomalyPhoto();
        tick(g,0.12);
      }
      if (G.state.camera) G.setCamera(false);
      tick(g,0.25);
      if (!G.state.anomalies[k]){ issue(g,'CH3','anomaly missing '+k+' '+probe()); return 'CH3_PHOTO'; }
    }
    if (!waitFor(g,()=>G.state.ch3FrameGate||G.state.chapter===4,3)) {
      const a=G.state.anomalies;
      issue(g,'CH3','frame gate not set, count='+G.state.hunt.count+' inc='+a.incense+
        ' bowl='+a.bowl+' thr='+a.thread+' '+probe());
      return 'CH3_GATE';
    }
    if (G.state.ch3FrameGate){
      if (!goTo(g,REVIEW_SPOT[0],REVIEW_SPOT[1],12)) return 'CH3_WALK';
      for (let att=0;att<3 && G.state.ch3FrameGate;att++){
        let open=!!G.state.review;
        for (let t=0;t<6 && !open;t++){ open=openReview(g); if (!open) tick(g,0.2); }
        if (!open){ issue(g,'CH3','review refused while gated '+probe()); return 'CH3_REVIEW'; }
        for (let i=0;i<12 && G.state.lookFrame<5;i++){ G.stepLookFrame(1); tick(g,0.2); }
        if (G.state.lookFrame<5) issue(g,'CH3','lookFrame capped at '+G.state.lookFrame);
        G.exitReview(); tick(g,0.4);
      }
      if (!waitFor(g,()=>G.state.chapter===4,6)) {
        issue(g,'CH3','gate exit did not advance frame='+G.state.lookFrame+' ok='+G.state.ch3FrameOk+
          ' gate='+G.state.ch3FrameGate+' '+probe());
        return 'CH3_EXIT';
      }
    }
    return null;
  }

  function chapter4(g){
    for (let round=0;round<6 && G.state.chapter===4;round++){
      const h=G.state.hide;
      if (!h||!h.active){ tick(g,0.4); continue; }
      let pick;
      if (g.opts.hideMistake && round===0) pick=h.facing;                       // deliberately wrong
      else {
        const opts=[0,1,2].filter(i=>i!==h.facing&&i!==h.lastSpot);
        pick=opts[G.rndInt(opts.length)];
      }
      if (pick===undefined) pick=(h.facing+1)%3;
      if (pick===h.facing){
        if (h.remaining>4) tick(g,Math.min(h.remaining-3,6));
      }
      if (!goTo(g,G.HIDE_SPOTS[pick].x,G.HIDE_SPOTS[pick].y,18,1.4)) { issue(g,'CH4','unreachable hide spot '+pick+' '+probe()); return 'CH4_WALK'; }
      G.interact();
      tick(g,0.3);
      waitFor(g,()=>!G.state.transition,3);
      if (G.state.ending) return 'BAD_ENDING';
    }
    if (!waitFor(g,()=>G.state.chapter===5,6)) { issue(g,'CH4','did not reach ch5 round='+(G.state.hide?G.state.hide.round:-1)); return 'CH4_STALL'; }
    return null;
  }

  function chapter5(g){
    if (!goTo(g,WOMAN[0],WOMAN[1],14)) return 'CH5_WALK';
    for (let att=0;att<3 && !G.state.finalPhoto;att++){
      if (!holdCamera(g)) continue;
      keepCamera(g,0.3);
      if (!G.state.camera) continue;
      G.takeFinalPhoto();
      tick(g,0.12);
    }
    if (G.state.camera) G.setCamera(false);
    tick(g,0.3);
    if (!G.state.finalPhoto){ issue(g,'CH5','final photo failed '+camWhy(g)); return 'CH5_PHOTO'; }
    if (!goTo(g,DOOR[0],DOOR[1],16,1.2)) return 'CH5_DOOR';
    ensureFree(g);
    G.interact();
    if (!waitFor(g,()=>G.state.scene==='corridor',5)) { issue(g,'CH5','corridor did not start'); return 'CH5_CORRIDOR'; }
    return corridor(g);
  }

  function corridor(g){
    G.keys.up=true;
    let pausedN=0, transN=0, stall=0, lastD=-1;
    for (let i=0;i<3000 && !G.state.corr.answered;i++){
      step(g);
      if (G.state.paused) pausedN++;
      if (G.state.transition) transN++;
      if (!G.keys.up) { G.keys.up=true; }
      const d=G.state.corr.depth;
      // The corridor's three beats are viewfinder-only; a player holds F there.
      if (d>=0.20 && !G.state.corr.roomSeen){ clearKeys(); G.corridorLookOn(); tick(g,0.1); G.corridorLookOff(); }
      if (d>=0.50 && !G.state.corr.facesSeen){ clearKeys(); G.corridorLookOn(); tick(g,0.1); G.corridorLookOff(); }
      if (d>=0.80 && !G.state.corr.nameSeen){ clearKeys(); G.corridorLookOn(); tick(g,0.1); G.corridorLookOff(); }
      if (d>0.3 && !G.state.corr.portrait) G.interact();
      if (d>0.55 && !G.state.corr.threadSeen) G.interact();
      if (d>=0.9){ clearKeys(); G.interact(); break; }
      if (d<=lastD+1e-9) stall++; else stall=0;
      lastD=d;
      if (stall>200) break;
    }
    clearKeys();
    if (!G.state.corr.answered){ issue(g,'CORR','never reached phone depth='+G.state.corr.depth.toFixed(2)+
      ' '+probe()+' pausedN='+pausedN+' transN='+transN+' stall='+stall+' port='+G.state.corr.portrait+
      ' thr='+G.state.corr.threadSeen+' name='+G.state.corr.nameSeen); return 'CORR_STALL'; }
    if (!G.state.corr.nameSeen) issue(g,'CORR','phone answered without seeing the nameplate');
    if (!waitFor(g,()=>G.state.corr.doorOpen,5)) { issue(g,'CORR','door did not open'); return 'CORR_DOOR'; }
    if (!goDepth(g,'corridor',0.9,4)) return 'CORR_DOOR';
    G.interact();
    if (!waitFor(g,()=>G.state.scene==='darkroom',5)) { issue(g,'CORR','darkroom did not start'); return 'CORR_DARK'; }
    const r=darkroom(g);
    if (r) return r;
    if (!waitFor(g,()=>G.state.scene==='room'&&G.state.phoneDone,6)) { issue(g,'CORR','phone did not return'); return 'CORR_RETURN'; }
    return finale(g);
  }

  function darkroom(g){
    for (const [d,key] of [[0.22,'line'],[0.55,'bench'],[0.80,'wall']]){
      if (G.state.paused) G.resumeGame();
      if (G.state.transition) tick(g,0.3);
      if (G.state.review) G.exitReview();
      if (G.state.caseOpen) G.closeCase();
      if (!goDepth(g,'darkroom',d,8)){ issue(g,'DARK','depth failed want='+d+
        ' got='+(G.state.dark?G.state.dark.depth.toFixed(2):'-')+
        ' look='+(G.state.dark?G.state.dark.lookOn:'-')+' open='+(G.state.dark?G.state.dark.open:'-')+
        ' paused='+G.state.paused+' trans='+G.state.transition+' scene='+G.state.scene);
      return 'DARK_DEPTH'; }
      if (G.state.paused) G.resumeGame();
      if (G.state.transition) tick(g,0.3);
      if (G.state.review) G.exitReview();
      if (G.state.caseOpen) G.closeCase();
      G.darkLookOn(); tick(g,0.12); G.darkLookOff();
      if (!G.state.dark.seen[key]){ issue(g,'DARK','beat not seen '+key); return 'DARK_LOOK'; }
    }
    if (!goDepth(g,'darkroom',0.55,8)) return 'DARK_DEPTH';
    G.darkInteract(); tick(g,0.15);
    if (!G.state.dark.open){ issue(g,'DARK','splicer did not open'); return 'DARK_OPEN'; }
    for (let i=0;i<60 && !G.state.dark.split;i++){
      const k=G.state.dark;
      const off=k.v-k.target;
      if (Math.abs(off)<=0.02){ G.spliceCommit(); tick(g,0.2); break; }
      G.spliceAdjust(off>0?-1:1); tick(g,0.02);
    }
    if (!G.state.dark.split){ issue(g,'DARK','splice not committed v='+G.state.dark.v+' t='+G.state.dark.target); return 'DARK_SPLICE'; }
    G.darkPrint(); tick(g,0.2);
    if (!goDepth(g,'darkroom',0.06,8)) return 'DARK_DEPTH';
    G.darkInteract();
    if (!waitFor(g,()=>G.state.scene==='room',5)){ issue(g,'DARK','exit failed'); return 'DARK_EXIT'; }
    return null;
  }

  function finale(g){
    if (G.state.ended) return null;
    if (!goTo(g,WOMAN[0],WOMAN[1],12)) return 'FIN_WALK';
    ensureFree(g);
    if (G.state.paused) G.resumeGame();
    G.raiseHand();
    tick(g,0.2);
    if (G.state.ended) return null;
    if (!G.state.handRaised){ issue(g,'FIN','raiseHand refused '+probe()); return 'FIN_HAND'; }
    ensureFree(g);
    if (!holdCamera(g)) { issue(g,'FIN','camera refused before mismatch '+camWhy(g)); return 'FIN_MISMATCH'; }
    if (!waitFor(g,()=>G.state.mismatch,3)) { issue(g,'FIN','mismatch did not fire '+camWhy(g)); return 'FIN_MISMATCH'; }
    G.setCamera(false);
    tick(g,0.6);

    if (g.opts.ending==='film'){
      if (!G.state.choice && !G.state.takes){ issue(g,'FIN','choice false before film '+probe()); return 'FIN_CHOICE'; }
      if (!G.state.takes){
        if (G.state.paused) G.resumeGame();
        if (G.state.caseOpen) G.closeCase();
        if (G.state.review) G.exitReview();
        G.setCamera(true); tick(g,0.3);
        if (!G.state.takes && !G.state.ended){ issue(g,'FIN','second take did not start '+probe()); return 'FIN_TAKE'; }
        G.setCamera(false);
      }
      if (!waitFor(g,()=>G.state.ended,6)) { issue(g,'FIN','film ending missing'); return 'FIN_END'; }
      return null;
    }

    if (g.opts.reviewsTape && !G.state.ended) doTapeReview(g);
    if (!goTo(g,WOMAN[0],WOMAN[1],10)){
      ensureFree(g); tick(g,0.2);
      if (!goTo(g,WOMAN[0],WOMAN[1],10)){ if (!G.state.ended) issue(g,'FIN','cannot walk to her '+probe()); return 'FIN_WALK2'; }
    }
    G.interact();
    if (!waitFor(g,()=>G.state.ended,5)) { issue(g,'FIN','help ending missing choice='+G.state.choice+' hand='+G.state.handRaised); return 'FIN_END'; }
    return null;
  }

  // ---------- one run ----------
  function runOnce(seed,opts){
    const g=newCtx(seed,opts);
    const rand=rng(seed);
    g.rnd=rand;
    G.rndInt=n=>Math.floor(rand()*Math.max(1,n));
    // Loud mode: the real progression chain (ritual scare -> chapter 2) only
    // runs when state.silent is false. Subtitles/audio are still cheap because
    // FUZZ_ACTIVE short-circuits them.
    G.setFuzz(true);
    try{
      G.startGame(false);
      G.state.silent=false;
      tick(g,0.8);
      if (opts.badPath){
        // three wrong rituals -> bad ending. The ritual gate still demands the
        // three scans + three photos, so the bot does the real prep first.
        G.state.ritual.active=true; G.state.uncannyDone=true; G.state.choice=true; G.state.talked=true;
        if (!shootRitualSet(g)) return finish(g,'BAD_PATH');
        for (let i=0;i<3;i++){
          if (!setRitual(g,i%2===0?[2,1,0]:[1,2,0])) break;
          if (!goTo(g,ALTAR[0],ALTAR[1],12)) break;
          for (let a=0;a<3;a++){
            ensureFree(g); tick(g,0.15);
            if (G.currentTake()<0) setRitual(g,i%2===0?[2,1,0]:[1,2,0]);
            G.commitRitual(); tick(g,0.4); waitFor(g,()=>!G.state.inputLock,4);
            if (G.state.ritual.loop>i||G.state.ending) break;
          }
          if (G.state.ending) break;
        }
        if (!waitFor(g,()=>G.state.ended,5)) { issue(g,'BAD','bad ending missing loop='+G.state.ritual.loop); return finish(g,'BAD_PATH'); }
        if (G.state.ending!=='bad') issue(g,'BAD','wrong ending '+G.state.ending);
        return finish(g,'BAD_ENDING');
      }
      const done=(r)=>{ if (G.state.ended) return finish(g,G.state.ending||'ended'); return finish(g,r); };
      let r=chapter1(g); if (r) return done(r);
      g.marks.ch1=g.t; g.bat.ch2=G.state.battery;
      r=chapter2(g); if (r) return done(r);
      g.marks.ch2=g.t; g.bat.ch3=G.state.battery;
      r=chapter3(g); if (r) return done(r);
      g.marks.ch3=g.t; g.bat.ch4=G.state.battery;
      r=chapter4(g); if (r) return done(r);
      g.marks.ch4=g.t;
      r=chapter5(g); if (r) return done(r);
      g.marks.ch5=g.t;
      if (!G.state.ended) { issue(g,'END','still running at end of script'); return finish(g,'NO_END'); }
      return finish(g,G.state.ending||'ended');
    }catch(e){
      issue(g,'EXCEPTION',(e&&e.message||e)+' @ '+(e&&e.stack?String(e.stack).split('\n')[1].trim():''));
      return finish(g,'EXCEPTION');
    }
  }

  function finish(g,outcome){
    const s=G.state;
    invariant(g);
    g.done=true;
    return {
      seed:g.seed,
      outcome,
      ending:s.ending||null,
      chapter:s.chapter,
      scene:s.scene,
      wallSec:+g.t.toFixed(1),
      playSec:+g.t.toFixed(1),
      minBat:+g.minBat.toFixed(0),
      bat:g.bat,
      segments:{ch1:+(g.marks.ch1||g.t).toFixed(1),
        ch2:+Math.max(0,(g.marks.ch2||g.t)-(g.marks.ch1||g.t)).toFixed(1),
        ch3:+Math.max(0,(g.marks.ch3||g.t)-(g.marks.ch2||g.t)).toFixed(1),
        ch4:+Math.max(0,(g.marks.ch4||g.t)-(g.marks.ch3||g.t)).toFixed(1),
        ch5:+Math.max(0,(g.marks.ch5||g.t)-(g.marks.ch4||g.t)).toFixed(1),
        finale:+(g.t-(g.marks.ch5||g.t)).toFixed(1)},
      issues:g.issues.slice(0,6)
    };
  }

  // ---------- batch ----------
  const results=[];
  const issueCount={};
  const outcomes={};
  const t0=performance.now();
  for (let i=0;i<RUNS;i++){
    const rand=rng(i*7919+13);
    const opts={
      readsTape:rand()<0.5,
      wrongRitual:rand()<0.35?1:0,
      wrongHunt:rand()<0.3,
      hideMistake:rand()<0.25,
      reviewsTape:rand()<0.7,
      ending:rand()<0.25?'film':'help',
      badPath:rand()<0.12,
      grief:rand()<0.35
    };
    let res;
    try{ res=runOnce(i,opts); }
    catch(e){ res={seed:i,outcome:'HARNESS_EXCEPTION',ending:null,chapter:-1,scene:'-',wallSec:0,playSec:0,chapterTimes:[],issues:['EXCEPTION | '+(e&&e.message||e)]}; }
    results.push(res);
    outcomes[res.outcome]=(outcomes[res.outcome]||0)+1;
    for (const it of res.issues){
      const key=it.split(' | ')[0]+' | '+it.split(' | ')[1].replace(/\d+(\.\d+)?/g,'#');
      issueCount[key]=(issueCount[key]||0)+1;
    }
  }
  const ok=results.filter(r=>r.outcome==='help'||r.outcome==='film'||r.outcome==='BAD_ENDING');
  const secs=ok.map(r=>r.playSec).sort((a,b)=>a-b);
  const pct=p=>secs.length?secs[Math.min(secs.length-1,Math.floor(secs.length*p))]:0;
  const segNames=['ch1','ch2','ch3','ch4','ch5','finale'];
  const segMed={};
  for (const k of segNames){
    const v=ok.map(r=>r.segments[k]).filter(x=>typeof x==='number').sort((a,b)=>a-b);
    segMed[k]=v.length?+v[Math.floor(v.length/2)].toFixed(1):0;
  }
  const batKeys=['ch2','ch3','ch4'];
  const batMed={};
  for (const k of batKeys){
    const v=ok.map(r=>r.bat&&r.bat[k]).filter(x=>typeof x==='number').sort((a,b)=>a-b);
    batMed[k]=v.length?+v[Math.floor(v.length/2)].toFixed(0):0;
  }
  const minBats=ok.map(r=>r.minBat).filter(x=>typeof x==='number').sort((a,b)=>a-b);
  const summary={
    runs:RUNS,
    ms:Math.round(performance.now()-t0),
    outcomes,
    issueCount,
    duration:{p10:pct(0.1),p50:pct(0.5),p90:pct(0.9),min:secs[0]||0,max:secs[secs.length-1]||0},
    segmentMedian:segMed,
    battery:{medianAtChapterStart:batMed,minP10:minBats[Math.floor(minBats.length*0.1)]||0,
      minEver:minBats[0]||0},
    sample:results.filter(r=>r.issues.length).slice(0,12)
  };
  document.body.setAttribute('data-sim',JSON.stringify(summary));
  document.title=Object.keys(issueCount).length?'SIM ISSUES':'SIM PASS';
  window.__simSummary=summary;
})();
