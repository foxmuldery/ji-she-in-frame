/* =========================================================
   《祭：她在画面里》— 第三人称像素 + 第一人称主观摄像机
   你以为你在扮演她；举起 DV，她在画面里。
   ========================================================= */
(() => {
'use strict';

const PW=480, PH=270, CW=640, CH=480;
const pixel=document.getElementById('pixel');
const pctx=pixel.getContext('2d');
pctx.imageSmoothingEnabled=false;
const camera=document.getElementById('camera');
const cctx=camera.getContext('2d');
cctx.imageSmoothingEnabled=true;
cctx.setTransform(2,0,0,2,0,0);
const reviewPixel=document.createElement('canvas');
reviewPixel.width=PW; reviewPixel.height=PH;
const reviewPctx=reviewPixel.getContext('2d');
reviewPctx.imageSmoothingEnabled=false;
const camLow=document.createElement('canvas');
camLow.width=640; camLow.height=480;
const camLowCtx=camLow.getContext('2d');
camLowCtx.imageSmoothingEnabled=false;

const stage=document.getElementById('stage');
const fadeEl=document.getElementById('fade');

// ---------- HUD scale ----------
// The pixel canvas is upscaled to the stage, so on a 1080p or 1440p display the
// artwork grows while fixed-px HUD type does not: subtitles end up looking like
// footnotes on a cinema screen. --u tracks the stage height against the 720p
// reference (577 px tall), capped so a small window keeps today's sizes.
const UI_REF_H=577, UI_MAX=2.25;
function syncUiScale(){
  const h=stage.getBoundingClientRect().height||UI_REF_H;
  const u=Math.max(1,Math.min(UI_MAX,h/UI_REF_H));
  document.documentElement.style.setProperty('--u',u.toFixed(3));
}
syncUiScale();
if (window.ResizeObserver) new ResizeObserver(syncUiScale).observe(stage);
else window.addEventListener('resize',syncUiScale);
window.addEventListener('orientationchange',syncUiScale);

// ---------- first-person DV footage layer ----------
// The video is a local, muted, looping file. It is drawn as its own layer
// underneath the 640x480 OSD canvas; the CRT shader stays attached to the
// camera canvas. If the file is missing or cannot play, the camera canvas
// keeps rendering the original procedural pixel scene.
const dvVideo=document.getElementById('dvVideo');
const dvVideoCanvas=document.getElementById('dvVideoCanvas');
const dvCtx=dvVideoCanvas?dvVideoCanvas.getContext('2d'):null;
if (dvCtx) dvCtx.imageSmoothingEnabled=true;
let videoDrewFrame=false;
const VIDEO_SOURCES=[
  'assets/video/footage_clip_5s.mp4'
];
let videoSourceIndex=0;
let videoReady=false;
let videoFailed=false;
let videoDisabled=false;
const FACE_CLOSEUP_IMG=new Image();
FACE_CLOSEUP_IMG.src=(window.JI_FACE_DATA||'assets/references/v2/ji_oldwoman_face_v2_480.png');
const POSTER_IMG=new Image();
POSTER_IMG.src=(window.JI_POSTER_DATA||'assets/images/ji_clip_v1_poster.jpg');
let videoPlayPending=false;
let videoPlayBlocked=false;
let videoFrozen=false;
let forcePoster=false;
const videoEvents=[];

function ritualScanMode(){
  return state.camera && state.ritual.active && !state.ritual.done && !state.review && !state.ended;
}
function videoWanted(){
  return !videoDisabled && !videoFailed && state.camera && !state.review && !state.ended && !state.paused
    && !state.mismatch && state.takes<1 && !ritualScanMode() && !huntScanMode() && !anomalyScanMode() && !hideScanMode();
}
function videoLive(){
  return videoWanted() && videoReady && !videoPlayBlocked && !forcePoster;
}
function updateVideoLayer(){
  if (!dvVideo) return false;
  const live=videoLive();
  if (live){
    stage.classList.add('videoActive');
    if (dvVideoCanvas) dvVideoCanvas.classList.add('on');
    dvVideo.setAttribute('aria-hidden','false');
    if (videoFrozen){
      try{ if (!dvVideo.paused) dvVideo.pause(); }catch(e){}
    } else if (dvVideo.paused && !videoPlayPending){
      videoPlayPending=true;
      let p=null;
      try{ p=dvVideo.play(); }catch(e){ videoPlayPending=false; videoPlayBlocked=true; }
      if (p && typeof p.then==='function'){
        p.then(()=>{ videoPlayPending=false; })
         .catch(()=>{ videoPlayPending=false; videoPlayBlocked=true; });
      } else {
        videoPlayPending=false;
      }
    }
  } else {
    try{ if (videoReady && !dvVideo.paused) dvVideo.pause(); }catch(e){}
    stage.classList.remove('videoActive');
    if (dvVideoCanvas) dvVideoCanvas.classList.remove('on');
    dvVideo.setAttribute('aria-hidden','true');
  }
  // While the decoder is spinning up (or autoplay is blocked), hold on the
  // poster frame instead of flashing the pixel fallback. It is a real frame
  // from the same tape, so the transition reads as the tape catching up.
  const pending = !videoDisabled && !videoFailed && !!state.camera
    && !state.review && !state.ended && !state.mismatch && state.takes<1
    && (forcePoster || !videoReady || videoPlayBlocked);
  stage.classList.toggle('videoPending',pending);
  return live;
}
function initVideoLayer(){
  if (!dvVideo || videoDisabled){ videoFailed=!!videoDisabled; setTimeout(startRetroDisplay,0); return; }
  dvVideo.muted=true;
  dvVideo.loop=true;
  dvVideo.playsInline=true;
  dvVideo.preload='auto';
  ['loadstart','progress','loadedmetadata','loadeddata','canplay','canplaythrough','suspend','stalled','waiting','error','playing','pause'].forEach(ev=>{
    dvVideo.addEventListener(ev,()=>{ videoEvents.push(ev+':'+dvVideo.readyState); if (videoEvents.length>24) videoEvents.shift(); });
  });
  dvVideo.addEventListener('loadeddata',()=>{ videoReady=true; videoPlayBlocked=false; updateVideoLayer(); });
  dvVideo.addEventListener('canplay',()=>{ videoReady=true; videoPlayBlocked=false; updateVideoLayer(); });
  dvVideo.addEventListener('playing',()=>{ videoReady=true; updateVideoLayer(); });
  dvVideo.addEventListener('error',()=>{
    if (videoSourceIndex<VIDEO_SOURCES.length-1){
      videoSourceIndex++;
      videoReady=false;
      videoPlayBlocked=false;
      dvVideo.src=VIDEO_SOURCES[videoSourceIndex];
      try{ dvVideo.load(); }catch(e){ videoFailed=true; updateVideoLayer(); }
    } else {
      videoFailed=true;
      videoReady=false;
      updateVideoLayer();
      setTimeout(startRetroDisplay,0);
      console.warn('DV footage unavailable; using the pixel camera fallback.');
    }
  });
  try{
    dvVideo.src=VIDEO_SOURCES[0];
    dvVideo.load();
    // Kick the decoder once. If the camera is off we pause as soon as the
    // file is ready; this only makes the muted preload reliable on file://.
    const p=dvVideo.play();
    if (p && typeof p.catch==='function') p.catch(()=>{});
    // Poll for readiness too: media events can lag behind readyState on
    // file:// under software rendering.
    const watch=setInterval(()=>{
      if (videoFailed || videoDisabled){ clearInterval(watch); return; }
      if (!videoReady && dvVideo.readyState>=3){
        videoReady=true;
        videoPlayBlocked=false;
        updateVideoLayer();
      }
      if (videoReady) clearInterval(watch);
    },100);
    // Last-resort shader start in case the media pipeline never reports back.
    // (While the video layer is live, startRetroDisplay is a no-op.)
    setTimeout(()=>{ if (!stage.classList.contains('videoActive')) startRetroDisplay(); },6000);
  }catch(e){
    videoFailed=true;
    setTimeout(startRetroDisplay,0);
  }
}

let retroDisplay=null;
let retroStarted=false;
function startRetroDisplay(){
  if (state.silent) return;
  if (retroStarted) return;
  // The live footage layer uses the CSS CRT fallback: a file:// video taints
  // its canvas for WebGL. Defer RetroZone until the camera is back on the
  // untainted pixel canvas (review / mismatch / second take / fallback).
  if (stage.classList.contains('videoActive') || stage.classList.contains('videoPending')) return;
  retroStarted=true;
  // Creating the shader context before the media loads can stall the local
  // video by several seconds under software rendering; the deferred starts
  // above avoid that on the normal path.
  if (/[?&]noshader=1/.test(location.search)) return;
  initRetroDisplay();
}
function syncCameraOverlay(){
  if (!retroDisplay || !retroDisplay.overlay) return;
  const on=camera.classList.contains('on') && !stage.classList.contains('videoActive');
  retroDisplay.overlay.style.opacity=on?'1':'0';
  retroDisplay.overlay.style.display=on?'block':'none';
}
function initRetroDisplay(){
  try{
    if (!window.RetroZoneShader) return;
    retroDisplay=window.RetroZoneShader.createShaderOverlay(camera,{
      mode:'crt',
      virtualWidth:960,
      virtualHeight:720,
      zIndex:3
    });
    if (retroDisplay && retroDisplay.overlay){
      retroDisplay.overlay.style.zIndex='3';
      retroDisplay.overlay.style.transition='opacity .14s ease';
      retroDisplay.overlay.style.display='none';
    }
  }catch(e){ console.warn('RetroZone shader unavailable',e); retroDisplay=null; }
  syncCameraOverlay();
}
const roleName=document.getElementById('roleName');
const modeEl=document.getElementById('mode');
const camMeta=document.getElementById('camMeta');
const subjectEl=document.getElementById('subject');
const filmerEl=document.getElementById('filmer');
const subtitleEl=document.getElementById('subtitle');
const promptEl=document.getElementById('prompt');
const controlsEl=document.getElementById('controls');
const ritualEl=document.getElementById('ritual');
const ritualIncenseEl=document.getElementById('ritualIncense');
const ritualBowlEl=document.getElementById('ritualBowl');
const ritualThreadEl=document.getElementById('ritualThread');
const ritualBatteryEl=document.getElementById('ritualBattery');
const chapterEl=document.getElementById('chapterHud');
const chapterKickerEl=document.getElementById('chapterKicker');
const chapterNameEl=document.getElementById('chapterName');
const chapterObjEl=document.getElementById('chapterObj');
const chapterCountEl=document.getElementById('chapterCount');
const endRunEl=document.getElementById('endRun');
const pauseRunEl=document.getElementById('pauseRun');
const caseBtn=document.getElementById('caseBtn');
const caseEl=document.getElementById('case');
const caseTapeEl=document.getElementById('caseTape');
const caseCluesEl=document.getElementById('caseClues');
const caseTakesEl=document.getElementById('caseTakes');
const caseNowEl=document.getElementById('caseNow');
const caseBackEl=document.getElementById('caseBack');
const ritualNoteEl=document.getElementById('ritualNote');
const dvBtn=document.getElementById('dvBtn');
const reviewBtn=document.getElementById('reviewBtn');
const timelineEl=document.getElementById('timeline');
const tlHead=document.getElementById('tlHead');
const tlTime=document.getElementById('tlTime');
const tlMode=document.getElementById('tlMode');
const tlReconTrack=document.getElementById('tlReconTrack');
const tlReconBar=document.getElementById('tlReconBar');
const tlDelta=document.getElementById('tlDelta');
const muteBtn=document.getElementById('muteBtn');
const startEl=document.getElementById('start');
const endEl=document.getElementById('end');
const endTitle=document.getElementById('endTitle');
const endText=document.getElementById('endText');

const C={
  ink:'#070806', wall:'#352f23', wallDark:'#282217',
  floor:'#211c16', floorDark:'#17130f',
  wood:'#4a3724', woodLight:'#6a4e30', woodDark:'#2e2217',
  bone:'#d8c9a8', paper:'#c9bb9e', ochre:'#b8873f', ochreDim:'#7d5c2c',
  red:'#7a1f1a', redBright:'#b33a2f', redDark:'#4a1210',
  skin:'#c3a98c', skinDark:'#8d6f57', skinLight:'#d6bb9a',
  white:'#efe7d4', gray:'#8f8877', grayDark:'#5a554a',
  green:'#2b3a2a', blue:'#26333a'
};

const state={
  started:false, ended:false,
  wx:2.5, wy:6.5, dir:'S', walk:0, moving:false,
  camera:false, revealed:false, firstCameraDone:false,
  talked:false, choice:false, ending:null,
  uncanny:false, uncannyDone:false, front:false, handRaised:false, mismatch:false, takes:0, uncannyTimer:null,
  review:false, reviewPos:0.15, reviewKind:'normal', reviewFoundGap:false, reviewSplit:false,
  ritual:{incense:2,bowl:1,thread:0,active:false,seen:false,done:false,loop:0,reviews:0,eyeSaid:false,inspected:{incense:false,bowl:false,thread:false},camSeen:{incense:false,bowl:false,thread:false}},
  reconOffset:0.08, reconAligned:false, reconEver:false, reconDragging:false, reconDragX:0, reconDragStart:0, reviewQuiz:{step:0,locked:false,wrong:0},
  glitch:0, glitchAt:0, time:0, last:0,
  muted:false, paused:false, flashSafe:false, silent:false, scareUntil:0, scareAt:0, caseOpen:false, scanStart:0, scanT:0, scanDone:false, scanRisked:false, scanTarget:null, battery:100, lastBatteryAt:0, photos:{incense:false,bowl:false,thread:false}, photoScarePending:false, photoFlashUntil:0, photoRevealUntil:0, photoRevealTarget:null, chapter:1, scene:'room', hunt:null, hide:null, anomalies:{incense:false,bowl:false,thread:false}, ch3FrameGate:false, ch3FrameOk:false, finalPhoto:false, phoneDone:false, corr:{depth:0,answered:false,ringAt:0,portrait:false,threadSeen:false}, oldWomanGone:false, darkChapter:false, runStart:0, runEnd:0, chapterStartedAt:0, chapterTimes:[], inputLock:false, runId:0, transition:false, closeupUntil:0, lookFrame:0, lookStepAt:0, reviewCount:0, blinkSaid:false
};
const keys={left:false,right:false,up:false,down:false};
// Simulated-player / fuzz mode: logic runs, render + audio + DOM HUD are skipped.
let FUZZ_ACTIVE=false;
const scheduledJobs=[];
let jobSeq=0;
function later(fn,ms){
  const job={id:++jobSeq, at:state.time+ms/1000, fn, run:state.runId};
  scheduledJobs.push(job);
  return job.id;
}
function cancelLater(id){
  if (!id) return;
  const i=scheduledJobs.findIndex(j=>j.id===id);
  if (i>=0) scheduledJobs.splice(i,1);
}
function tickJobs(){
  for (let i=0;i<scheduledJobs.length;){
    const j=scheduledJobs[i];
    if (j.run!==state.runId){ scheduledJobs.splice(i,1); continue; }
    if (state.time>=j.at){
      scheduledJobs.splice(i,1);
      try{ j.fn(); }catch(e){ console.error('scheduled job failed',e); }
      continue;
    }
    i++;
  }
}
let noGlitch=false;

// ---------- audio ----------
let actx=null, master=null, hissSrc=null, hissGain=null;
let droneOsc=null, droneGain=null, droneLfo=null;
function initAudio(){
  if (actx) return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    actx=new AC();
    master=actx.createGain(); master.gain.value=0.55; master.connect(actx.destination);
    const buf=actx.createBuffer(1,actx.sampleRate*2,actx.sampleRate);
    const d=buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*0.32;
    hissSrc=actx.createBufferSource(); hissSrc.buffer=buf; hissSrc.loop=true;
    const hp=actx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800;
    const lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=6000;
    hissGain=actx.createGain(); hissGain.gain.value=0.02;
    hissSrc.connect(hp).connect(lp).connect(hissGain).connect(master);
    hissSrc.start();
  }catch(e){}
}
function ensureAudio(){
  if (FUZZ_ACTIVE) return;
  if (!actx) initAudio();
  if (actx && actx.state==='suspended') actx.resume();
}
function tone(freq,dur,type='sine',gain=0.08,slide=null){
  if (!actx||state.muted) return;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type=type; o.frequency.value=freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),actx.currentTime+dur);
  g.gain.value=gain; g.gain.exponentialRampToValueAtTime(0.0001,actx.currentTime+dur);
  o.connect(g).connect(master); o.start(); o.stop(actx.currentTime+dur+0.02);
}
function noise(dur=0.1,freq=1200,gain=0.08,q=0.8){
  if (!actx||state.muted) return;
  const len=Math.max(1,Math.floor(actx.sampleRate*dur));
  const b=actx.createBuffer(1,len,actx.sampleRate);
  const d=b.getChannelData(0);
  for (let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const s=actx.createBufferSource(); s.buffer=b;
  const f=actx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=q;
  const g=actx.createGain(); g.gain.value=gain;
  s.connect(f).connect(g).connect(master); s.start();
}
function sClick(){ noise(0.04,2200,0.035,1.2); }
function sCam(){ noise(0.08,900,0.07,0.7); tone(140,0.07,'square',0.025,90); }
function startDrone(){
  if (!actx||droneOsc||state.muted) return;
  droneOsc=actx.createOscillator(); droneGain=actx.createGain();
  droneOsc.type='sine'; droneOsc.frequency.value=44;
  droneGain.gain.value=0.0001;
  droneGain.gain.exponentialRampToValueAtTime(0.05,actx.currentTime+1.2);
  droneOsc.connect(droneGain).connect(master); droneOsc.start();
  droneLfo=actx.createOscillator(); const lg=actx.createGain();
  droneLfo.frequency.value=0.18; lg.gain.value=2.4;
  droneLfo.connect(lg).connect(droneOsc.frequency); droneLfo.start();
}
function stopDrone(){
  if (!droneOsc) return;
  try{ droneGain.gain.exponentialRampToValueAtTime(0.0001,actx.currentTime+0.5); droneOsc.stop(actx.currentTime+0.6); if(droneLfo) droneLfo.stop(actx.currentTime+0.6); }catch(e){}
  droneOsc=null; droneGain=null; droneLfo=null;
}

// ---------- placeholder media (HTMLAudio, local files) ----------
// MiniMax Design 桌面端早先生成的占位声音；不是《祭》专属素材。
// 用 <audio> 而不是 decodeAudioData：file:// 下 fetch/XHR 会被 CORS 拦，
// 但本地媒体文件可以直接由媒体元素读取。所有音量在 play 前设为 0 再淡入，
// 尾部淡出，避免爆音/惊吓式音量尖峰。
const AUDIO_DIR='assets/audio/';
const AUDIO_FILES={
  ambience:'ambience_45s.mp3',
  uncannySwell:'music_cue_60s.mp3',
  revealImpact:'reveal_impact.mp3',
  breath:'breath.mp3',
  moan:'moan.mp3',
  squelch:'squelch.mp3',
  collapse:'collapse.mp3',
  collapse2:'collapse2.mp3',
  scream:'scream.mp3',
  shriek:'shriek.mp3',
  clock:'clock_tick.mp3',
  water:'water_drip.mp3',
  door:'door_creak.mp3',
  steps:'wet_steps.mp3',
  chair:'chair_scrape.mp3',
  incense:'incense_whisper.mp3',
  bulb:'bulb_hum.wav',
  rain:'window_rain.wav',
  oldBreath:'oldwoman_breath.mp3',
  musicBed:'music_eerie_bed_90s.mp3',
  voiceHand:'voice_hand.mp3',
  voiceWhat:'voice_what.mp3',
  voiceTurn:'voice_turn.mp3',
  voiceOpen:'voice_open.mp3',
  shutter:'shutter.mp3',
  roomShift:'room_shift.mp3',
  huntEmpty:'hunt_empty.mp3',
  scanPing:'scan_ping.mp3',
  phoneRing:'phone_ring.mp3',
  voicePhone:'voice_phone.mp3',
  ritualOk:'ritual_ok.mp3',
  anomalySnap:'anomaly_snap.mp3',
  hideFail:'hide_fail.mp3',
  hideLure:'hide_lure.mp3'
};
const AMBIENCE_LAYERS=[
  {key:'ambience',volume:0.16},
  {key:'rain',volume:0.055},
  {key:'bulb',volume:0.030}
];
const MUSIC_VOLUME=0.085;
let clockTimer=null, waterTimer=null;
const lastDetail={door:0,chair:0,steps:0,incense:0,breath:0};
const VOICE_LINES=[
  {text:'过来，让我看看你',key:'voiceOpen'},
  {text:'手给我看看',key:'voiceHand'},
  {text:'你在拍什么',key:'voiceWhat'},
  {text:'她总是这样回头',key:'voiceTurn'},
  {text:'别让她抬手',key:'voicePhone'},
  {text:'你终于接电话了',key:'voicePhone'}
];
const BED_VOLUME=0.16;
const MEDIA_CUES={
  cameraReveal:{label:'firstCameraReveal',tracks:[
    {key:'revealImpact',volume:0.18,fadeIn:0.06},
    {key:'breath',volume:0.95,fadeIn:0.25}
  ]},
  uncanny:{label:'uncannyTurn',tracks:[
    {key:'uncannySwell',volume:0.45,fadeIn:0.45},
    {key:'moan',volume:0.95,fadeIn:0.3}
  ]},
  mismatch:{label:'actionMismatch',tracks:[
    {key:'squelch',volume:0.30,fadeIn:0.08}
  ]},
  reviewGap:{label:'reviewGap',tracks:[
    {key:'collapse',volume:0.38,fadeIn:0.12}
  ]},
  endingHelp:{label:'endingHelp',tracks:[
    {key:'collapse2',volume:0.55,fadeIn:0.4}
  ]},
  endingFilm:{label:'endingFilm',tracks:[
    {key:'scream',volume:0.40,fadeIn:0.1},
    {key:'shriek',volume:0.18,fadeIn:0.3}
  ]}
};
const mediaEls={};
let bedEl=null;
let bedActive=false;
function getMedia(key){
  if (Object.prototype.hasOwnProperty.call(mediaEls,key)) return mediaEls[key];
  let el=null;
  try{
    el=new Audio(AUDIO_DIR+AUDIO_FILES[key]);
    el.preload='auto';
    el.volume=0;
    el.muted=state.muted;
    el._ramp=0;
    el._endTimer=0;
    el.addEventListener('ended',()=>{ el.volume=0; });
    el.addEventListener('error',()=>{ console.warn('音频占位加载失败',AUDIO_FILES[key]); });
  }catch(e){ el=null; }
  mediaEls[key]=el;
  return el;
}
function rampMedia(el,to,ms,done){
  if (!el) return;
  if (el._ramp) clearInterval(el._ramp);
  const from=el.volume, t0=performance.now(), dur=Math.max(1,ms);
  const tick=()=>{
    if (!el){ return; }
    const k=Math.min(1,(performance.now()-t0)/dur);
    el.volume=Math.max(0,Math.min(1,from+(to-from)*k));
    if (k<1) return;
    clearInterval(el._ramp); el._ramp=0;
    if (done) done();
  };
  el._ramp=setInterval(tick,30);
  tick();
}
function armCueFade(el){
  clearTimeout(el._endTimer);
  const arm=()=>{
    if (!el || !isFinite(el.duration) || el.duration<=0) return;
    const fade=Math.min(0.45,Math.max(0.18,el.duration*0.2));
    const delay=Math.max(0,(el.duration-fade)*1000);
    el._endTimer=setTimeout(()=>{
      if (el.paused) return;
      rampMedia(el,0,fade*1000,()=>{
        try{ el.pause(); }catch(e){}
        el.volume=0;
      });
    },delay);
  };
  if (el.readyState>=1) arm();
  else el.addEventListener('loadedmetadata',arm,{once:true});
}
function playMedia(key,volume,fadeIn=0.15){
  if (FUZZ_ACTIVE) return null;
  const el=getMedia(key);
  if (!el) return null;
  clearTimeout(el._endTimer);
  if (el._ramp){ clearInterval(el._ramp); el._ramp=0; }
  try{ el.currentTime=0; }catch(e){}
  el.volume=0;
  el.muted=state.muted;
  let p=null;
  try{ p=el.play(); }catch(e){}
  if (p && p.catch) p.catch(()=>{});
  rampMedia(el,Math.max(0,Math.min(1,volume)),Math.max(1,fadeIn*1000));
  armCueFade(el);
  return el;
}
function playCue(name){
  if (state.muted) return; // 静音时不要在半途解除静音后突然冒出一段音效
  const cue=MEDIA_CUES[name];
  if (!cue) return;
  for (const track of cue.tracks) playMedia(track.key,track.volume,track.fadeIn);
}
function getBed(){
  if (bedEl) return bedEl;
  bedEl=getMedia('ambience');
  if (bedEl) bedEl.loop=true;
  return bedEl;
}
function startAmbience(){
  if (FUZZ_ACTIVE) return;
  bedActive=true;
  for (const L of AMBIENCE_LAYERS){
    const el=getMedia(L.key);
    if (!el) continue;
    el.loop=true; el.muted=state.muted;
    if (el.paused){
      try{ el.currentTime=0; }catch(e){}
      el.volume=0;
      let p=null; try{ p=el.play(); }catch(e){}
      if (p && p.catch) p.catch(()=>{});
    }
    rampMedia(el,L.volume,1800);
  }
  const music=getMedia('musicBed');
  if (music){
    music.loop=true; music.muted=state.muted;
    if (music.paused){
      try{ music.currentTime=0; }catch(e){}
      music.volume=0;
      let p=null; try{ p=music.play(); }catch(e){}
      if (p && p.catch) p.catch(()=>{});
    }
    rampMedia(music,MUSIC_VOLUME,3000);
  }
  startRoomDetails();
}
function startRoomDetails(){
  clearInterval(clockTimer); clearInterval(waterTimer);
  clockTimer=setInterval(()=>{
    if (!state.started || state.ended || state.paused || state.muted || !bedActive) return;
    playMedia('clock',0.22,0.02);
  },11000);
  waterTimer=setInterval(()=>{
    if (!state.started || state.ended || state.paused || state.muted || !bedActive) return;
    if (state.review || state.camera) playMedia('water',0.26,0.02);
  },9000);
}
function stopAmbience(fade=1.2){
  bedActive=false;
  clearInterval(clockTimer); clockTimer=null;
  clearInterval(waterTimer); waterTimer=null;
  for (const L of AMBIENCE_LAYERS){
    const el=mediaEls[L.key];
    if (!el) continue;
    const e=el;
    rampMedia(e,0,Math.max(1,fade*1000),()=>{ if (bedActive) return; try{ e.pause(); }catch(err){} e.volume=0; });
  }
  const music=mediaEls['musicBed'];
  if (music){
    const m=music;
    rampMedia(m,0,Math.max(1,fade*1400),()=>{ if (bedActive) return; try{ m.pause(); }catch(err){} m.volume=0; });
  }
}
// one-shots tied to the new set dressing / proximity
function updateDetailAudio(now){
  if (!state.started || state.ending || state.review || state.muted) return;
  const t=performance.now();
  const d=(x,y)=>Math.hypot(state.wx-x,state.wy-y);
  if (nearDoor() && t-lastDetail.door>7000){ lastDetail.door=t; playMedia('door',0.38,0.04); }
  if (d(1.35,1.85)<2.2 && t-lastDetail.chair>9000){ lastDetail.chair=t; playMedia('chair',0.30,0.02); }
  if (d(4.6,2.4)<2.4 && t-lastDetail.steps>12000){ lastDetail.steps=t; playMedia('steps',0.34,0.08); }
  if (d(7.0,4.8)<2.6 && t-lastDetail.incense>10000){ lastDetail.incense=t; playMedia('incense',0.24,0.10); }
  if (nearWoman() && t-lastDetail.breath>8000){ lastDetail.breath=t; playMedia('oldBreath',0.48,0.18); }
}
function stopCues(){
  for (const key of Object.keys(mediaEls)){
    if (key==='ambience'||key==='rain'||key==='bulb'||key==='musicBed') continue;
    const el=mediaEls[key];
    if (!el) continue;
    clearTimeout(el._endTimer);
    if (el._ramp){ clearInterval(el._ramp); el._ramp=0; }
    try{ el.pause(); }catch(e){}
    try{ el.currentTime=0; }catch(e){}
    el.volume=0;
  }
}
function syncMediaMute(){
  for (const key of Object.keys(mediaEls)){
    const el=mediaEls[key];
    if (el) el.muted=state.muted;
  }
}
function toggleMute(){
  state.muted=!state.muted;
  if (master) master.gain.value=state.muted?0:0.55;
  syncMediaMute();
  updateMuteLabels();
}

// ---------- draw helpers ----------
function r(ctx,x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); }
function ln(ctx,x1,y1,x2,y2,c,w=1){ ctx.strokeStyle=c; ctx.lineWidth=w; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
function circ(ctx,x,y,rad,c){ ctx.fillStyle=c; ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.fill(); }
function ell(ctx,x,y,rx,ry,c){ ctx.fillStyle=c; ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2); ctx.fill(); }
function poly(ctx,pts,c){ ctx.fillStyle=c; ctx.beginPath(); pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath(); ctx.fill(); }
function grad(ctx,x0,y0,x1,y1,stops){ const g=ctx.createLinearGradient(x0,y0,x1,y1); for(const [p,c] of stops)g.addColorStop(p,c); return g; }
function rgrad(ctx,x,y,r0,r1,stops){ const g=ctx.createRadialGradient(x,y,r0,x,y,r1); for(const [p,c] of stops)g.addColorStop(p,c); return g; }
function blur(ctx,px,fn){ const old=ctx.filter; try{ctx.filter=`blur(${px}px)`;}catch(e){} fn(); ctx.filter=old||'none'; }
function vignette(ctx,w,h,s=0.6){ const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.25,w/2,h/2,Math.max(w,h)*0.72); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,0,0,${s})`); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); }
let grainCanvas=null;
function makeGrain(){
  grainCanvas=document.createElement('canvas'); grainCanvas.width=160; grainCanvas.height=120;
  const g=grainCanvas.getContext('2d'); const id=g.createImageData(160,120);
  for (let i=0;i<id.data.length;i+=4){ const v=Math.random()*255; id.data[i]=v; id.data[i+1]=v; id.data[i+2]=v; id.data[i+3]=24; }
  g.putImageData(id,0,0);
}
function drawGrain(ctx,w,h,a=0.08){
  if (!grainCanvas) makeGrain();
  ctx.save(); ctx.globalAlpha=a; ctx.globalCompositeOperation='screen';
  ctx.drawImage(grainCanvas,-Math.random()*160,-Math.random()*120,w+160,h+120); ctx.restore();
}
function drawScanlines(ctx,w,h,a=0.06){
  ctx.save(); ctx.globalAlpha=a; ctx.fillStyle='#000';
  for (let y=0;y<h;y+=3) ctx.fillRect(0,y,w,1);
  ctx.restore();
}

// =========================================================
//  THIRD-PERSON PIXEL ROOM
// =========================================================
function ditherEllipse(ctx,cx,cy,rx,ry,color,alpha,step=2){
  ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=color;
  for (let y=-ry;y<=ry;y+=step){
    const t=1-(y*y)/(ry*ry); if (t<=0) continue;
    const w=Math.sqrt(t)*rx;
    for (let x=-w;x<=w;x+=step*2){
      ctx.fillRect(cx+Math.floor(x),cy+y,1,1);
    }
  }
  ctx.restore();
}
function ditherRect(ctx,x,y,w,h,color,alpha,step=2){
  ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=color;
  for (let yy=y;yy<y+h;yy+=step){
    for (let xx=x+((yy/step)&1);xx<x+w;xx+=step*2){
      ctx.fillRect(xx,yy,1,1);
    }
  }
  ctx.restore();
}
function ditherRing(ctx,cx,cy,rx,ry,thickness,color,alpha,step=2){
  ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=color;
  for (let y=-ry;y<=ry;y+=step){
    for (let x=-rx;x<=rx;x+=step){
      const d=(x*x)/(rx*rx)+(y*y)/(ry*ry);
      if (d>1-thickness && d<=1) ctx.fillRect(cx+x,cy+y,1,1);
    }
  }
  ctx.restore();
}
function ditherLine(ctx,x1,y1,x2,y2,color,alpha,step=2){
  ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=color;
  const dx=x2-x1, dy=y2-y1;
  const n=Math.max(Math.abs(dx),Math.abs(dy));
  for (let i=0;i<=n;i+=step){
    const x=Math.round(x1+dx*i/n), y=Math.round(y1+dy*i/n);
    ctx.fillRect(x,y,1,1);
  }
  ctx.restore();
}
// =========================================================
//  THIRD-PERSON PIXEL ROOM — true isometric 12×9
//  A warm memory rebuilt in a cold room.
// =========================================================
const PAL={
  ink:'#050608', void:'#020304',
  wallNE:'#2a343b', wallNW:'#20282e', wallLo:'#161c21', wallHi:'#41505a',
  wallDamp:'#16211f', wallSoot:'#0b0a08',
  beam:'#0b0a08', beamHi:'#2c2218',
  panel:'#263038', panelHi:'#42505a', panelLo:'#0c1014',
  floor0:'#1a2025', floor1:'#20272c', floor2:'#2a3237', floor3:'#394247',
  floorCool:'#1e2c33', grout:'#06080a', floorHi:'#565b57',
  woodDeep:'#0a0706', woodDark:'#18100c', wood:'#2a1d14', woodLit:'#48301e', woodHi:'#6a4828', woodPale:'#8a6540',
  woodTop:'#39281a', woodTopHi:'#5a3f28', clothOchre:'#6a4a26',
  redDeep:'#1e0506', redDark:'#3a0a0c', red:'#5a1215', redLit:'#8a2224', redHi:'#b83a30',
  bone:'#cfc6b0', boneDim:'#968d7a', paper:'#a89f8a', paperHi:'#d8cfb8', paperDim:'#665f52',
  skinDeep:'#3a241c', skinDark:'#5a3a2c', skin:'#8a5f4a', skinLit:'#b08062', skinHi:'#cfa080',
  grayDeep:'#2a2a28', gray:'#565650', grayLit:'#86867c', grayHi:'#b4b1a2',
  brassDark:'#3a2410', brass:'#6a4a1e', brassLit:'#a87a32', brassHi:'#d9a84a',
  flame:'#d98a2e', flameLit:'#f2b85a', flameHi:'#ffe6a8',
  coolDeep:'#08141a', coolDark:'#102329', cool:'#1e3a42', coolLit:'#35606a', coolHi:'#6a9aa0', coolGlow:'#b0d0c8',
  warm:'#c08a45', warmLit:'#d9a85a', warmHi:'#f2cf8a',
  black:'#040506', white:'#e6dfcf',
  jacket:'#2e4a5a', jacketLit:'#4a6a72', jacketDark:'#1a2a32',
  eyeMilk:'#d8d6c2', eyeDark:'#12100c',
  thread:'#8a1f1f', fog:'#1a2428', smoke:'#6a6a62',
  shadow:'#020304'
};
const BAYER4=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const DITHER_TILES=new Map();
function ditherTile(color,level){
  const lv=Math.max(1,Math.min(16,Math.round(level)));
  const key=color+'|'+lv;
  let cv=DITHER_TILES.get(key);
  if (!cv){
    cv=document.createElement('canvas'); cv.width=4; cv.height=4;
    const g=cv.getContext('2d'); g.fillStyle=color;
    for (let i=0;i<16;i++) if (BAYER4[i]<lv) g.fillRect(i&3,i>>2,1,1);
    DITHER_TILES.set(key,cv);
  }
  return cv;
}
const DITHER_PATTERNS=new WeakMap();
function ditherPattern(ctx,color,level){
  let m=DITHER_PATTERNS.get(ctx);
  if (!m){ m=new Map(); DITHER_PATTERNS.set(ctx,m); }
  const key=color+'|'+level;
  let pat=m.get(key);
  if (!pat){ pat=ctx.createPattern(ditherTile(color,level),'repeat'); m.set(key,pat); }
  return pat;
}
function dithFill(ctx,pts,color,level,alpha=1,comp='source-over'){
  if (level<=0 || !pts.length) return;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for (const p of pts){ if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0]; if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1]; }
  ctx.save(); ctx.globalAlpha=alpha; ctx.globalCompositeOperation=comp;
  ctx.beginPath(); ctx.moveTo(Math.round(pts[0][0]),Math.round(pts[0][1]));
  for (let i=1;i<pts.length;i++) ctx.lineTo(Math.round(pts[i][0]),Math.round(pts[i][1]));
  ctx.closePath(); ctx.clip();
  ctx.fillStyle=ditherPattern(ctx,color,level);
  ctx.fillRect(Math.floor(x0)-2,Math.floor(y0)-2,Math.ceil(x1-x0)+4,Math.ceil(y1-y0)+4);
  ctx.restore();
}
function dithEllipse(ctx,cx,cy,rx,ry,color,level,alpha=1,comp='source-over'){
  if (level<=0) return;
  ctx.save(); ctx.globalAlpha=alpha; ctx.globalCompositeOperation=comp;
  ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.clip();
  ctx.fillStyle=ditherPattern(ctx,color,level);
  ctx.fillRect(Math.floor(cx-rx)-1,Math.floor(cy-ry)-1,Math.ceil(rx*2)+2,Math.ceil(ry*2)+2);
  ctx.restore();
}
function glowEllipse(ctx,cx,cy,rx,ry,color,alpha,comp='screen'){
  ctx.save(); ctx.globalAlpha=alpha; ctx.globalCompositeOperation=comp;
  ctx.fillStyle=color; ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.fill(); ctx.restore();
}
function glowFill(ctx,pts,color,alpha,comp='source-over'){
  ctx.save(); ctx.globalAlpha=alpha; ctx.globalCompositeOperation=comp;
  ctx.fillStyle=color; ctx.beginPath();
  ctx.moveTo(pts[0][0],pts[0][1]);
  for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function pxLine(ctx,x0,y0,x1,y1,color,w=1){
  x0=Math.round(x0); y0=Math.round(y0); x1=Math.round(x1); y1=Math.round(y1);
  const dx=Math.abs(x1-x0), sx=x0<x1?1:-1;
  const dy=-Math.abs(y1-y0), sy=y0<y1?1:-1;
  let err=dx+dy; ctx.fillStyle=color;
  for(;;){
    ctx.fillRect(x0,y0,w,w);
    if (x0===x1 && y0===y1) break;
    const e2=2*err;
    if (e2>=dy){ err+=dy; x0+=sx; }
    if (e2<=dx){ err+=dx; y0+=sy; }
  }
}
function pxPoly(ctx,pts,color){
  const n=pts.length; if (!n) return;
  let minY=Infinity,maxY=-Infinity;
  for (const p of pts){ if(p[1]<minY)minY=p[1]; if(p[1]>maxY)maxY=p[1]; }
  minY=Math.floor(minY); maxY=Math.ceil(maxY);
  ctx.fillStyle=color;
  const xs=[];
  for (let y=minY;y<=maxY;y++){
    const sy=y+0.5; xs.length=0;
    for (let i=0;i<n;i++){
      const a=pts[i], b=pts[(i+1)%n];
      if ((a[1]<=sy && b[1]>sy) || (b[1]<=sy && a[1]>sy))
        xs.push(a[0]+(sy-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    xs.sort((a,b)=>a-b);
    for (let i=0;i+1<xs.length;i+=2){
      const xa=Math.round(xs[i]), xb=Math.round(xs[i+1]);
      if (xb>xa) ctx.fillRect(xa,y,xb-xa,1);
    }
  }
}
function pxEllipse(ctx,cx,cy,rx,ry,color){
  ctx.fillStyle=color;
  for (let y=-Math.ceil(ry);y<=Math.ceil(ry);y++){
    const t=1-(y*y)/(ry*ry); if (t<=0) continue;
    const w=Math.floor(rx*Math.sqrt(t));
    ctx.fillRect(Math.round(cx-w),Math.round(cy+y),w*2+1,1);
  }
}
function iso(wx,wy){ return {x:Math.round(240+(wx-wy)*16), y:Math.round(52+(wx+wy)*8)}; }
function shrinkQuad(pts,inset){
  const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length, cy=pts.reduce((a,p)=>a+p[1],0)/pts.length;
  const k=1-inset;
  return pts.map(p=>[cx+(p[0]-cx)*k,cy+(p[1]-cy)*k]);
}
function wallNEQuad(x0,x1,h0,h1){
  const a=iso(x0,0), b=iso(x1,0);
  return [[a.x,a.y-h0],[b.x,b.y-h0],[b.x,b.y-h1],[a.x,a.y-h1]];
}
function wallNWQuad(y0,y1,h0,h1){
  const a=iso(0,y0), b=iso(0,y1);
  return [[a.x,a.y-h0],[b.x,b.y-h0],[b.x,b.y-h1],[a.x,a.y-h1]];
}
function wallNEPt(x,h){ const p=iso(x,0); return [p.x,p.y-h]; }
function wallNWPt(y,h){ const p=iso(0,y); return [p.x,p.y-h]; }

let SCENE_LAYERS=null;
function makeSceneLayer(){
  const c=document.createElement('canvas'); c.width=PW; c.height=PH;
  const g=c.getContext('2d'); g.imageSmoothingEnabled=false;
  return c;
}
function ensureSceneLayers(){
  if (SCENE_LAYERS) return SCENE_LAYERS;
  const room=makeSceneLayer();
  const rg=room.getContext('2d');
  r(rg,0,0,PW,PH,PAL.ink);
  drawIsoWalls(rg,0,1);
  drawIsoFloor(rg,0);
  drawFloorLight(rg,0,1);
  drawRoomShadows(rg,0);
  drawHangingBulb(rg,0,1);
  const bucket=makeSceneLayer();
  drawBucketAndStool(bucket.getContext('2d'),0);
  const oldwoman=makeSceneLayer();
  drawIsoOldWoman(oldwoman.getContext('2d'),0);
  const table=makeSceneLayer();
  const tg=table.getContext('2d');
  drawIsoTable(tg,0,false);
  drawOldWomanTableHand(tg,0);
  const foreground=makeSceneLayer();
  const fg=foreground.getContext('2d');
  drawForeground(fg,0);
  vignette(fg,PW,PH,0.52);
  SCENE_LAYERS={room,bucket,oldwoman,table,foreground};
  return SCENE_LAYERS;
}
function drawTableDynamics(ctx,t){
  const LIFT=23;
  // candle flame: stepped 3-colour pixel flame, flicker in height and halo
  const cd=iso(7.15,4.82);
  const cx=cd.x, cy=cd.y-LIFT;
  const candleFlick=0.78+0.16*Math.sin(t*9.7)+0.06*Math.sin(t*21.3);
  const fl=2+Math.round(1+(0.5+0.5*Math.sin(t*15.3))*1.4);
  r(ctx,cx-1,cy-8-fl,2,fl,PAL.flame);
  r(ctx,cx,cy-9-fl,1,Math.max(1,fl-1),PAL.flameLit);
  r(ctx,cx,cy-9-fl,1,1,PAL.flameHi);
  glowEllipse(ctx,cx,cy-10,10,9,PAL.flame,0.10*candleFlick,'screen');
  // incense: 1–3 sticks, live, because the ritual count is a puzzle state
  const inc=iso(8.12,4.45);
  const ix=inc.x, iy=inc.y-LIFT;
  const nInc=Math.max(1,Math.min(3,state.ritual.incense));
  for (let i=0;i<nInc;i++){
    const sx=ix+(i-(nInc-1)/2)*4;
    pxLine(ctx,sx,iy,sx-1.5,iy-10,PAL.woodPale);
    pxLine(ctx,sx+1,iy,sx-0.5,iy-10,'rgba(108,76,46,.55)');
    r(ctx,sx-1,iy-11,1,1,PAL.flame);
    r(ctx,sx-1,iy-12,1,1,PAL.flameHi);
    dithEllipse(ctx,sx-1,iy-11,4,3,PAL.flame,3,0.12,'screen');
    for (let k=0;k<5;k++){
      const yy=iy-15-k*3;
      const xx=sx-1+Math.round(Math.sin(t*1.1+k*1.7+i)*3)+k;
      ctx.globalAlpha=0.24-k*0.035;
      r(ctx,xx,yy,1,1,k<2?PAL.paper:PAL.paperDim);
      ctx.globalAlpha=1;
    }
  }
  // rice / tea steam
  for (let i=0;i<5;i++){
    const p=iso(6.55,4.65);
    const qx=p.x+Math.sin(t*1.3+i*1.8)*2;
    const qy=p.y-LIFT-5-i*2-Math.round((t*3)%3);
    ctx.globalAlpha=0.16-i*0.02;
    r(ctx,Math.round(qx),qy,1,1,PAL.paperHi);
    ctx.globalAlpha=1;
  }
  drawTableReflection(ctx,t);
  drawSmokeHand(ctx,t);
}

// ---------- eerie set dressing (portraits, talisman, chair, shoes, prints, thread) ----------
function drawAncestorPortraits(ctx,t){
  const specs=[[4.62,5.22],[5.36,5.96],[6.10,6.70],[6.84,7.44],[7.58,8.18]];
  for (let k=0;k<specs.length;k++){
    const [x0,x1]=specs[k];
    const q=wallNEQuad(x0,x1,19,33);
    pxPoly(ctx,q,PAL.woodDeep);
    const q2=wallNEQuad(x0+0.10,x1-0.10,19.7,32.3); pxPoly(ctx,q2,PAL.woodDark);
    const q3=wallNEQuad(x0+0.22,x1-0.22,20.5,31.5); pxPoly(ctx,q3,PAL.paperDim);
    dithFill(ctx,q3,PAL.black,3,0.20);
    const fx0=x0+(x1-x0)*0.34, fx1=x0+(x1-x0)*0.66;
    const fq=wallNEQuad(fx0,fx1,22,28.8); pxPoly(ctx,fq,PAL.skinDark);
    const fq2=wallNEQuad(fx0+0.06,fx1-0.06,22.6,28.2); pxPoly(ctx,fq2,PAL.paperDim);
    const ey=wallNEQuad(x0+(x1-x0)*0.40,x0+(x1-x0)*0.60,25.0,25.5); pxPoly(ctx,ey,PAL.eyeMilk);
    const e2=wallNEQuad(x0+(x1-x0)*0.44,x0+(x1-x0)*0.56,25.1,25.4); pxPoly(ctx,e2,PAL.eyeDark);
    pxLine(ctx,fq2[1][0]-3,fq2[1][1]+2,fq2[3][0]+2,fq2[3][1]-2,'rgba(18,14,10,.70)');
    r(ctx,q3[2][0]-2,q3[2][1]+2,2,2,PAL.thread);
  }
}
function drawTalismanFace(ctx,t){
  const q=wallNEQuad(4.58,5.02,19,30);
  pxPoly(ctx,q,PAL.paperDim);
  dithFill(ctx,q,PAL.black,2,0.16);
  const f=wallNEQuad(4.64,4.96,21.5,27.5); pxPoly(ctx,f,PAL.paper);
  r(ctx,f[1][0]+1,f[1][1]+2,1,1,PAL.eyeDark);
  r(ctx,f[2][0]-2,f[2][1]+2,1,1,PAL.eyeDark);
  pxLine(ctx,f[3][0]+1,f[3][1]-2,f[2][0]-1,f[2][1]+3,PAL.thread);
  for (let i=0;i<4;i++){ const h=19.6+i*2.3; const a=wallNEPt(4.60,h), b=wallNEPt(5.00,h+0.35); pxLine(ctx,a[0],a[1],b[0],b[1],'rgba(30,24,18,.40)'); }
}
function drawChairFacingWall(ctx,t){
  const p=iso(1.35,1.85); const x=p.x, y=p.y;
  dithEllipse(ctx,x+2,y+1,13,3,PAL.black,7,0.30);
  pxPoly(ctx,[[x-12,y-36],[x+8,y-40],[x+10,y-32],[x-10,y-28]],PAL.woodDark);
  pxPoly(ctx,[[x-10,y-35],[x+6,y-38],[x+8,y-33],[x-8,y-30]],PAL.wood);
  pxLine(ctx,x-9,y-35,x+5,y-37,PAL.woodHi);
  pxLine(ctx,x-10,y-30,x+8,y-33,PAL.woodDark);
  for (const dx of [-8,6]){ pxLine(ctx,x+dx,y-30,x+dx+1,y-7,PAL.woodDeep); pxLine(ctx,x+dx+1,y-30,x+dx+2,y-7,PAL.woodLit); }
  pxLine(ctx,x-12,y-36,x-10,y-28,'rgba(110,160,160,.20)');
}
function drawWetShoes(ctx,t){
  const p=iso(3.55,1.12);
  for (const dx of [-4,4]){
    pxEllipse(ctx,p.x+dx,p.y,4,2.2,PAL.ink);
    pxEllipse(ctx,p.x+dx-1,p.y-1,2.6,1.2,PAL.woodDeep);
    r(ctx,p.x+dx-2,p.y-1,1,1,PAL.coolGlow);
  }
  dithEllipse(ctx,p.x,p.y+1,9,2,PAL.black,6,0.25);
}
function drawFootprints(ctx,t){
  const pts=[[3.8,1.5],[4.15,2.0],[4.5,2.45],[4.9,2.9],[5.3,3.3],[5.7,3.6]];
  for (let i=0;i<pts.length;i++){
    const p=iso(pts[i][0],pts[i][1]);
    dithEllipse(ctx,p.x,p.y,3,1.4,PAL.coolDeep,5,0.18);
    r(ctx,p.x,p.y,1,1,i%2?PAL.coolGlow:PAL.coolHi);
  }
}
function drawRedThread(ctx,t){
  // The red thread leaves the altar and ties to the door frame. Its knot
  // height is the third ritual state, so it has to be drawn live.
  const a=iso(6.0,4.35), b=iso(3.9,0.65);
  const h=[0,7,14][state.ritual.thread]||0;
  const ex=b.x, ey=b.y-h;
  ctx.save(); ctx.strokeStyle=PAL.thread; ctx.lineWidth=1; ctx.beginPath();
  ctx.moveTo(a.x,a.y);
  ctx.quadraticCurveTo((a.x+ex)/2+6,(a.y+ey)/2+8,ex,ey);
  ctx.stroke(); ctx.restore();
  // knot / tassel
  r(ctx,ex,ey,2,2,PAL.redHi);
  r(ctx,ex-1,ey+2,1,2,PAL.redLit);
  r(ctx,ex+2,ey+2,1,2,PAL.redLit);
  r(ctx,ex,ey+4,2,1,PAL.redDark);
}
function drawSecondShadow(ctx,t){
  const a=wallNEPt(7.6,4), b=wallNEPt(8.9,4);
  // a tall hunched shadow with a second head, cast on the NE wall
  const q=[[a[0]+5,a[1]-40],[b[0]+2,b[1]-38],[b[0]+9,b[1]-2],[a[0]+12,a[1]-4]];
  dithFill(ctx,q,PAL.shadow,4,0.22);
  // shoulders / head / second head
  dithFill(ctx,[[a[0]+4,a[1]-40],[a[0]+9,a[1]-46],[a[0]+15,a[1]-42],[a[0]+14,a[1]-32]],PAL.shadow,5,0.26);
  dithFill(ctx,[[a[0]+9,a[1]-44],[a[0]+13,a[1]-49],[a[0]+17,a[1]-45],[a[0]+15,a[1]-38]],PAL.shadow,4,0.22);
  // two pale pinprick eyes in the larger head
  r(ctx,a[0]+8,a[1]-43,1,1,PAL.eyeMilk); r(ctx,a[0]+11,a[1]-43,1,1,PAL.eyeMilk);
}
function drawTableReflection(ctx,t){
  const p=iso(6.55,4.45); const x=p.x+(state.ritual.bowl-1)*8, y=p.y-23;
  // a shallow white bowl of water
  pxEllipse(ctx,x,y,6,2.4,PAL.woodDeep);
  pxEllipse(ctx,x,y-0.5,5.2,2,PAL.boneDim);
  pxEllipse(ctx,x,y-1,4.4,1.6,PAL.coolDeep);
  pxLine(ctx,x-4,y-1,x+4,y-1,PAL.coolLit);
  // a single large eye floats in the water: milky sclera, dark iris
  pxEllipse(ctx,x,y-1.5,2.4,1.2,PAL.eyeMilk);
  r(ctx,x-1,y-2,1,1,PAL.eyeDark); r(ctx,x,y-2,1,1,PAL.eyeDark);
  r(ctx,x-1,y-1,2,1,PAL.white);
  r(ctx,x,y-3,1,1,PAL.coolGlow);
  if ((t%2.4)<0.4) pxLine(ctx,x-4,y+1,x+4,y+1,'rgba(120,170,165,.22)');
}
function drawSmokeHand(ctx,t){
  const inc=iso(8.12,4.45), ix=inc.x, iy=inc.y-23;
  const base=iy-30;
  const sway=Math.sin(t*1.2)*2;
  const pts=[[ix-1,base+8],[ix+1,base+6],[ix-2,base+4],[ix+2,base+3],[ix-1,base+1],[ix+2,base-1],[ix,base-3]];
  for (let i=0;i<pts.length;i++){ ctx.globalAlpha=0.30-i*0.035; r(ctx,pts[i][0]+sway,pts[i][1],1,1,PAL.smoke); ctx.globalAlpha=1; }
}
function drawWatcherEyes(ctx,t){
  const n=Math.min(6,state.ritual.reviews||0);
  if (!n) return;
  const spots=[[126,146],[352,118],[396,176],[112,196],[300,204],[430,152]];
  for (let i=0;i<n;i++){
    const [x,y]=spots[i];
    const blink=Math.sin(t*1.3+i*2.1)>-0.82;
    if (!blink) continue;
    r(ctx,x,y,1,1,PAL.eyeMilk); r(ctx,x+2,y,1,1,PAL.eyeMilk);
    r(ctx,x+1,y,1,1,PAL.eyeDark);
    if (i%2===0) r(ctx,x,y+2,1,1,'rgba(216,214,194,.18)');
  }
}
function drawThirdPerson(ctx,t){
  const L=ensureSceneLayers();
  const bulbFlick=0.90+0.07*Math.sin(t*5.1)+0.03*Math.sin(t*13.7);
  const candleFlick=0.78+0.16*Math.sin(t*9.7)+0.06*Math.sin(t*21.3);
  ctx.clearRect(0,0,PW,PH);
  ctx.drawImage(L.room,0,0);
  drawRedThread(ctx,t);
  const items=[];
  items.push({d:8.6, draw:()=>ctx.drawImage(L.bucket,0,0)});
  if (!state.oldWomanGone) items.push({d:10.4, draw:()=>ctx.drawImage(L.oldwoman,0,0)});
  items.push({d:13.4, draw:()=>{ ctx.drawImage(L.table,0,0); drawTableDynamics(ctx,t); }});
  items.push({d:state.wx+state.wy, draw:()=>{
    const p=iso(state.wx,state.wy);
    drawXie(ctx,p.x,p.y,state.dir,state.walk,state.moving,t,state.front,state.handRaised);
  }});
  items.sort((a,b)=>a.d-b.d);
  for (const it of items) it.draw();
  // the old woman's gaze: one milky eye finds the player
  if (!state.oldWomanGone){
    const ow=iso(8.5,2.5), gx=ow.x+8, gy=ow.y-2-54;
    const lookX=Math.max(-1,Math.min(1,Math.round((state.wx-8.5)/2)));
    const lookY=Math.max(-1,Math.min(1,Math.round((state.wy-2.5)/2)));
    r(ctx,gx-3+lookX,gy+lookY,1,1,PAL.eyeMilk);
    if ((t%3.7)<0.16) r(ctx,gx+3+lookX,gy+lookY,1,1,PAL.eyeMilk);
  }
  if (LIGHT_MODE === '0') {
    // 旧方案：加法光晕（保留做 A/B 对比，?light=0）
    drawCandleBloom(ctx,t,candleFlick);
    glowEllipse(ctx,288,82,46,37,PAL.warm,0.045*bulbFlick,'screen');
    glowEllipse(ctx,288,82,23,20,PAL.flame,0.030*bulbFlick,'screen');
  } else {
    // 新方案：算照明图 → multiply 叠回，再补一层很小的加法光芯（光源自身要发光）
    LightRig.update({ bulb: bulbFlick, candle: candleFlick });
    LightRig.apply(ctx);
    const cc = iso(7.15, 4.95);
    glowEllipse(ctx, 288, 82, 30, 25, PAL.warm, 0.055 * bulbFlick, 'screen');
    glowEllipse(ctx, 288, 82, 14, 12, PAL.flame, 0.075 * bulbFlick, 'screen');
    glowEllipse(ctx, cc.x, cc.y - 29, 17, 15, PAL.flame, 0.105 * candleFlick, 'screen');
    glowEllipse(ctx, cc.x, cc.y - 29, 8, 7, PAL.flameHi, 0.09 * candleFlick, 'screen');
  }
  drawDust(ctx,t);
  if ((state.chapter===4 && state.hide) || (state.chapter===5 && !state.finalPhoto)){
    const sp=state.chapter===4?iso(7.0,4.0):iso(8.3,2.9);
    drawStandingOldWoman(ctx,sp.x,sp.y,state.time);
  }
  if (state.scareUntil && state.time<state.scareUntil){
    ctx.fillStyle='rgba(4,6,7,.38)'; ctx.fillRect(0,0,PW,PH);
    const sp=iso(state.wx,state.wy);
    drawStandingOldWoman(ctx,sp.x+13,sp.y+5,state.time);
  }
  drawWatcherEyes(ctx,t);
  if (state.darkChapter){
    ctx.fillStyle='rgba(3,5,6,.52)';
    ctx.fillRect(0,0,PW,PH);
  }
  ctx.drawImage(L.foreground,0,0);
}

// ---------- walls, panels, door, window, shelf, wall props ----------
function drawIsoWalls(ctx,t,flick){
  const A=iso(0,0), B=iso(12,0), W0=iso(0,9), H=49;
  // base planes
  pxPoly(ctx,[[A.x,A.y],[B.x,B.y],[B.x,B.y-H],[A.x,A.y-H]],PAL.wallNE);
  pxPoly(ctx,[[A.x,A.y],[W0.x,W0.y],[W0.x,W0.y-H],[A.x,A.y-H]],PAL.wallNW);
  // stepped wall light: warm bulb on the NE wall, cold rain-light on the west
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.lineTo(B.x,B.y-H); ctx.lineTo(A.x,A.y-H); ctx.closePath();
  ctx.moveTo(A.x,A.y); ctx.lineTo(W0.x,W0.y); ctx.lineTo(W0.x,W0.y-H); ctx.lineTo(A.x,A.y-H); ctx.closePath();
  ctx.clip();
  // broad light: flat stepped glows; the dither only touches the band edges
  glowEllipse(ctx,292,94,84,50,PAL.warm,0.125,'screen');
  glowEllipse(ctx,292,94,50,30,PAL.warmLit,0.110,'screen');
  glowEllipse(ctx,286,86,22,16,PAL.flameHi,0.090,'screen');
  glowEllipse(ctx,188,64,84,62,PAL.coolHi,0.150,'screen');
  glowEllipse(ctx,188,64,40,34,PAL.coolGlow,0.095,'screen');
  ditherRing(ctx,292,94,92,56,0.035,PAL.warmLit,0.16,2);
  ditherRing(ctx,292,94,62,38,0.045,PAL.flameHi,0.14,2);
  ditherRing(ctx,188,64,56,44,0.04,PAL.coolGlow,0.18,2);
  // damp stains / soot
  dithEllipse(ctx,168,112,26,15,PAL.coolDeep,4,0.30);
  dithEllipse(ctx,230,116,14,9,PAL.wallDamp,3,0.24);
  dithEllipse(ctx,356,96,18,7,PAL.wallSoot,3,0.24);
  dithEllipse(ctx,406,72,22,12,PAL.wallDamp,3,0.20);
  dithEllipse(ctx,120,96,30,10,PAL.coolDeep,3,0.22);
  dithEllipse(ctx,208,84,20,10,PAL.coolDeep,2,0.16);
  ctx.restore();
  // wainscot / plinth on both walls
  for (const side of ['NE','NW']){
    const quad=(h0,h1)=> side==='NE'?wallNEQuad(0,12,h0,h1):wallNWQuad(0,9,h0,h1);
    pxPoly(ctx,quad(0,15),PAL.panel);
    pxPoly(ctx,quad(0,4),PAL.panelLo);
    pxPoly(ctx,quad(13,15),PAL.panelHi);
    pxPoly(ctx,quad(4,5),(side==='NE'?PAL.wallHi:PAL.panelHi));
    // planks
    const n=side==='NE'?12:9;
    for (let i=1;i<n;i++){
      const p=side==='NE'?wallNEPt(i,3):wallNWPt(i,3);
      const q=side==='NE'?wallNEPt(i,12):wallNWPt(i,12);
      pxLine(ctx,p[0],p[1],q[0],q[1],PAL.panelLo);
      pxLine(ctx,p[0]+1,p[1],q[0]+1,q[1],'rgba(120,92,56,.16)');
    }
  }
  // upper timber posts and rail
  for (const side of ['NE','NW']){
    const n=side==='NE'?4:3;
    for (let i=0;i<=n;i++){
      const u=(side==='NE'?12:9)*(i/n);
      const a=side==='NE'?wallNEPt(u,15):wallNWPt(u,15);
      const b=side==='NE'?wallNEPt(u,45):wallNWPt(u,45);
      pxLine(ctx,a[0],a[1],b[0],b[1],PAL.panelLo);
      pxLine(ctx,a[0]+1,a[1],b[0]+1,b[1],'rgba(120,88,52,.13)');
    }
    const rail0=side==='NE'?wallNEPt(0,31):wallNWPt(0,31);
    const rail1=side==='NE'?wallNEPt(side==='NE'?12:9,31):wallNWPt(9,31);
    pxLine(ctx,rail0[0],rail0[1],rail1[0],rail1[1],PAL.panelLo);
    pxLine(ctx,rail0[0],rail0[1]-1,rail1[0],rail1[1]-1,'rgba(130,98,58,.16)');
  }
  // top beam, ceiling shadow
  pxPoly(ctx,wallNEQuad(0,12,44,49),PAL.beam);
  pxPoly(ctx,wallNWQuad(0,9,44,49),PAL.beam);
  pxPoly(ctx,wallNEQuad(0,12,43,44),PAL.beamHi);
  pxPoly(ctx,wallNWQuad(0,9,43,44),PAL.beamHi);
  glowFill(ctx,wallNEQuad(0,12,36,43),PAL.black,0.12);
  glowFill(ctx,wallNWQuad(0,9,36,43),PAL.black,0.14);
  ditherLine(ctx,240,52-36,432,148-36,'rgba(0,0,0,.55)',0.35,2);
  ditherLine(ctx,240,52-36,96,124-36,'rgba(0,0,0,.50)',0.32,2);
  // corner post
  pxLine(ctx,A.x,A.y-H,A.x,A.y,PAL.panelLo,2);
  pxLine(ctx,A.x+2,A.y-H+2,A.x+2,A.y-1,'rgba(146,108,64,.20)');
  // cracks
  pxLine(ctx,196,58,191,68,PAL.panelLo); pxLine(ctx,191,68,194,78,'rgba(10,9,7,.55)'); pxLine(ctx,194,78,188,86,'rgba(10,9,7,.45)');
  pxLine(ctx,152,48,148,57,'rgba(10,9,7,.5)'); pxLine(ctx,148,57,151,64,'rgba(10,9,7,.4)');
  // wall props + openings
  drawDoor(ctx,t);
  drawWindowNW(ctx,t);
  drawShelf(ctx,t);
  drawWallCalendar(ctx,t);
  drawWallClock(ctx,t);
  drawHangingClothes(ctx,t);
  drawAncestorPortraits(ctx,t);
  drawTalismanFace(ctx,t);
}

function drawDoor(ctx,t){
  const x0=1.95,x1=4.45,H=34;
  const a=iso(x0,0), b=iso(x1,0);
  const p=(x,h)=>{ const q=iso(x,0); return [q.x,q.y-h]; };
  // recess frame
  pxPoly(ctx,[[a.x-4,a.y+1],[b.x+4,b.y+1],[b.x+4,b.y-H-4],[a.x-4,a.y-H-4]],PAL.woodDeep);
  pxPoly(ctx,[[a.x-2,a.y],[b.x+2,b.y],[b.x+2,b.y-H-2],[a.x-2,a.y-H-2]],PAL.woodDark);
  // dark interior / door leaf
  pxPoly(ctx,wallNEQuad(x0+0.15,x1-0.15,2,H-2),PAL.redDeep);
  pxPoly(ctx,wallNEQuad(x0+0.35,x1-0.35,3,H-4),PAL.woodDark);
  // door planks
  for (let i=1;i<4;i++){
    const xx=x0+(x1-x0)*i/4;
    const q0=p(xx,4), q1=p(xx,H-3);
    pxLine(ctx,q0[0],q0[1],q1[0],q1[1],PAL.woodDeep);
  }
  // horizontal braces
  for (const h of [10,22]){
    const q0=p(x0+0.4,h), q1=p(x1-0.4,h);
    pxLine(ctx,q0[0],q0[1],q1[0],q1[1],PAL.woodDeep);
    pxLine(ctx,q0[0],q0[1]-1,q1[0],q1[1]-1,'rgba(142,104,62,.16)');
  }
  // warm frame rim (bulb side) / cold left rim
  const f0=p(x1,2), f1=p(x1,H-2);
  pxLine(ctx,f0[0]+1,f0[1],f1[0]+1,f1[1],PAL.woodLit);
  pxLine(ctx,f0[0]-2,f0[1],f1[0]-2,f1[1],PAL.woodDeep);
  // red couplets
  const c0=p(x1-0.18,9), c1=p(x1-0.18,29);
  pxLine(ctx,c0[0],c0[1],c1[0],c1[1],PAL.red,2);
  pxLine(ctx,c0[0],c0[1]-2,c1[0],c1[1]-2,PAL.redLit);
  for (let i=0;i<4;i++){ const q=p(x1-0.18,12+i*4); r(ctx,q[0]-1,q[1],2,2,PAL.paperDim); }
  // latch
  const l=p(x1-0.35,15);
  r(ctx,l[0]-2,l[1]-1,5,3,PAL.brass); r(ctx,l[0]-1,l[1]-1,3,1,PAL.brassHi);
  r(ctx,l[0]-4,l[1],2,2,PAL.brassDark);
  // light leak under the door
  pxLine(ctx,a.x+2,a.y,b.x-2,b.y,PAL.coolHi);
  dithFill(ctx,[[a.x,a.y-1],[b.x,b.y-1],[b.x,b.y+2],[a.x,a.y+2]],PAL.coolHi,5,0.28,'screen');
  // door shadow on wall frame
  pxLine(ctx,a.x-4,a.y-H-3,b.x+4,b.y-H-3,PAL.black);
  // the door is ajar: a black gap at the latch side
  const g0=p(x1-0.10,3), g1=p(x1-0.10,H-3);
  pxLine(ctx,g0[0]+1,g0[1],g1[0]+1,g1[1],PAL.void,2);
  pxLine(ctx,g0[0]+3,g0[1],g1[0]+3,g1[1],PAL.woodDeep);
  // a worn red knot mark high on the door frame
  const km=p(x1-0.07,29);
  pxLine(ctx,km[0]-2,km[1],km[0]+2,km[1],'rgba(74,18,16,.62)');
  pxLine(ctx,km[0]-1,km[1]-1,km[0]+1,km[1]-1,'rgba(140,45,32,.32)');
  // a small handprint in the dust on the frame
  const hp=p(x1+0.16,17);
  r(ctx,hp[0]-1,hp[1],3,1,'rgba(8,7,6,.60)');
  r(ctx,hp[0],hp[1]-1,1,1,'rgba(8,7,6,.60)');
  r(ctx,hp[0]-1,hp[1]+1,1,1,'rgba(8,7,6,.45)');
}

function drawWindowNW(ctx,t){
  const y0=2.12,y1=4.48,H=32;
  const p=(yy,h)=>{ const q=iso(0,yy); return [q.x,q.y-h]; };
  const a=p(y0,0), b=p(y1,0);
  // recessed frame
  pxPoly(ctx,wallNWQuad(y0-0.16,y1+0.16,-2,H+4),PAL.woodDeep);
  pxPoly(ctx,wallNWQuad(y0-0.02,y1+0.02,0,H+2),PAL.woodDark);
  pxPoly(ctx,wallNWQuad(y0+0.14,y1-0.14,1,H+1),PAL.woodDeep);
  // glass: cold, wet, stepped light
  const glass=wallNWQuad(y0+0.2,y1-0.2,2,H-1);
  pxPoly(ctx,glass,PAL.coolDark);
  glowFill(ctx,wallNWQuad(y0+0.24,y1-0.24,H*0.5,H-2),PAL.cool,0.55);
  glowFill(ctx,wallNWQuad(y0+0.26,y1-0.26,H*0.66,H-4),PAL.coolLit,0.32,'screen');
  glowFill(ctx,wallNWQuad(y0+0.28,y1-0.28,4,H*0.5),PAL.coolDeep,0.55);
  glowEllipse(ctx,p(3.3,17)[0],p(3.3,17)[1],20,14,PAL.coolGlow,0.18,'screen');
  // rain drops running down the panes
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(glass[0][0],glass[0][1]);
  for (let i=1;i<4;i++) ctx.lineTo(glass[i][0],glass[i][1]);
  ctx.closePath(); ctx.clip();
  for (let i=0;i<13;i++){
    const yy=y0+0.26+((i*0.31)%(y1-y0-0.5));
    const h=H-3-((i*7)%14)-((t*9+i*3)%10);
    const q=p(yy,h);
    pxLine(ctx,q[0]-1,q[1],q[0]+1,q[1]+5,PAL.coolHi);
    if (i%4===0) r(ctx,q[0]+1,q[1]+3,1,1,PAL.coolGlow);
  }
  ctx.restore();
  // vertical mullion and sloped cross bars
  const mid=(y0+y1)/2;
  const m0=p(mid,3), m1=p(mid,H-2);
  pxLine(ctx,m0[0],m0[1],m1[0],m1[1],PAL.woodDark,2);
  pxLine(ctx,m0[0]+1,m0[1],m1[0]+1,m1[1],PAL.woodLit);
  for (const h of [13,23]){
    const q0=p(y0+0.05,h), q1=p(y1-0.05,h);
    pxLine(ctx,q0[0],q0[1],q1[0],q1[1],PAL.woodDark,2);
    pxLine(ctx,q0[0],q0[1]-1,q1[0],q1[1]-1,PAL.wood);
  }
  // a pale shape behind the wet glass: a face that is not quite a face
  const sp=p(3.28,16);
  pxEllipse(ctx,sp[0],sp[1],3,4,'rgba(178,196,186,.18)');
  r(ctx,sp[0]-1,sp[1]-1,1,1,'rgba(16,26,26,.55)');
  r(ctx,sp[0]+1,sp[1]-1,1,1,'rgba(16,26,26,.55)');
  pxLine(ctx,sp[0]-1,sp[1]+2,sp[0]+1,sp[1]+2,'rgba(16,26,26,.40)');
  // taped paper patch / wet highlight
  const pa=p(y0+0.45,8), pb=p(y1-0.5,18);
  pxPoly(ctx,[[pa[0],pa[1]],[pb[0]-3,pb[1]-1],[pb[0]-4,pb[1]+6],[pa[0]+1,pa[1]+7]],PAL.paperDim);
  pxLine(ctx,pa[0]+1,pa[1]+1,pb[0]-4,pb[1]+6,'rgba(20,18,14,.28)');
  r(ctx,pa[0]+2,pa[1]+2,2,1,PAL.paper);
  pxLine(ctx,pa[0]-1,pa[1]-7,pb[0]-2,pb[1]-8,'rgba(180,225,225,.18)');
  // sill protruding into the room (+x)
  const s0=p(y0-0.08,1), s1=p(y1+0.08,1);
  pxPoly(ctx,[[s0[0],s0[1]],[s1[0],s1[1]],[s1[0]+7,s1[1]+3],[s0[0]+7,s0[1]+3]],PAL.wood);
  pxLine(ctx,s0[0],s0[1],s1[0],s1[1],PAL.woodHi);
  pxLine(ctx,s0[0]+7,s0[1]+3,s1[0]+7,s1[1]+3,PAL.woodDeep);
  dithFill(ctx,[[s0[0]+2,s0[1]+4],[s1[0]+2,s1[1]+4],[s1[0]+6,s1[1]+7],[s0[0]+6,s0[1]+7]],PAL.black,5,0.25);
  // dark curtain on the upper edge
  const cu0=p(y0+0.02,1), cu1=p(y0+0.02,H-1);
  pxPoly(ctx,[[cu0[0]-1,cu0[1]],[cu0[0]+7,cu0[1]],[cu1[0]+7,cu1[1]],[cu1[0]-1,cu1[1]]],PAL.redDeep);
  pxLine(ctx,cu0[0]+6,cu0[1],cu1[0]+6,cu1[1],PAL.red);
  pxLine(ctx,cu0[0]+4,cu0[1],cu1[0]+4,cu1[1],'rgba(160,64,42,.35)');
  // cold spill on the wall / frame rims
  glowEllipse(ctx,p(3.3,16)[0],p(3.3,16)[1],38,34,PAL.coolGlow,0.09,'screen');
  pxLine(ctx,a[0]-3,a[1]-H-2,b[0]+3,b[1]-H-2,PAL.black);
  pxLine(ctx,a[0]-2,a[1]-H-1,a[0]-2,a[1]-1,'rgba(150,200,195,.25)');
  // wind chime / small charm on the sill
  const ch=p(y1+0.05,2);
  pxLine(ctx,ch[0],ch[1],ch[0]+2,ch[1]+6,PAL.paperDim);
  r(ctx,ch[0]+1,ch[1]+6,2,2,PAL.brass);
}

function drawShelf(ctx,t){
  const x0=8.85,x1=11.35,h=30;
  const p=(x,hh)=>{ const q=iso(x,0); return [q.x,q.y-hh]; };
  // wall shadow behind shelf
  const sh0=p(x0,h+1), sh1=p(x1,h+1);
  dithFill(ctx,[[sh0[0]+2,sh0[1]],[sh1[0]+2,sh1[1]],[sh1[0]+4,sh1[1]+9],[sh0[0]+4,sh0[1]+9]],PAL.black,5,0.32);
  // brackets
  for (const xx of [x0+0.15,x1-0.15]){
    const q=p(xx,h);
    pxPoly(ctx,[[q[0]-1,q[1]],[q[0]+3,q[1]],[q[0]+1,q[1]+8],[q[0]-1,q[1]+8]],PAL.woodDark);
    pxLine(ctx,q[0]+2,q[1]+1,q[0]+1,q[1]+7,PAL.woodLit);
  }
  // board
  const a=p(x0,h), b=p(x1,h);
  pxPoly(ctx,[[a[0],a[1]],[b[0],b[1]],[b[0],b[1]+4],[a[0],a[1]+4]],PAL.wood);
  pxLine(ctx,a[0],a[1],b[0],b[1],PAL.woodHi);
  pxLine(ctx,a[0],a[1]+4,b[0],b[1]+4,PAL.woodDeep);
  for (let i=1;i<8;i++){ const q=p(x0+(x1-x0)*i/8,h); pxLine(ctx,q[0],q[1]+1,q[0],q[1]+3,'rgba(38,25,14,.5)'); }
  // jars and bowls sitting on the board
  const items=[
    {x:9.12,w:6,h:11,kind:'jar',c:PAL.gray,r:PAL.grayHi},
    {x:9.55,w:5,h:8,kind:'cup',c:PAL.boneDim,r:PAL.bone},
    {x:9.98,w:7,h:12,kind:'jar',c:PAL.woodDark,r:PAL.woodLit},
    {x:10.5,w:6,h:9,kind:'red',c:PAL.red,c2:PAL.redLit},
    {x:10.98,w:7,h:7,kind:'bowl',c:PAL.boneDim,r:PAL.paper}
  ];
  for (const it of items){
    const q=p(it.x,h);
    // wall shadow
    dithEllipse(ctx,q[0]+2,q[1]-it.h*0.45,it.w+2,it.h*0.6,PAL.black,5,0.28);
    if (it.kind==='jar'){
      pxPoly(ctx,[[q[0]-it.w/2,q[1]],[q[0]+it.w/2,q[1]],[q[0]+it.w/2-1,q[1]-it.h],[q[0]-it.w/2+1,q[1]-it.h]],it.c);
      pxEllipse(ctx,q[0],q[1]-it.h,it.w/2-0.5,1.6,PAL.woodDeep);
      pxEllipse(ctx,q[0],q[1]-it.h-1,it.w/2-1.5,1.5,it.r);
      pxLine(ctx,q[0]-it.w/2+1,q[1]-2,q[0]-it.w/2+1,q[1]-it.h+2,'rgba(230,220,190,.20)');
      r(ctx,q[0]-2,q[1]-it.h*0.55,4,3,PAL.paperDim);
    } else if (it.kind==='cup'){
      pxPoly(ctx,[[q[0]-2,q[1]],[q[0]+2,q[1]],[q[0]+3,q[1]-it.h],[q[0]-3,q[1]-it.h]],it.c);
      pxEllipse(ctx,q[0],q[1]-it.h,3,1.4,it.r);
      pxLine(ctx,q[0]-2,q[1]-it.h+1,q[0]-2,q[1]-1,'rgba(240,230,200,.22)');
    } else if (it.kind==='red'){
      pxPoly(ctx,[[q[0]-it.w/2,q[1]],[q[0]+it.w/2,q[1]],[q[0]+it.w/2-1,q[1]-it.h],[q[0]-it.w/2+1,q[1]-it.h]],it.c);
      pxLine(ctx,q[0]-it.w/2+1,q[1]-2,q[0]-it.w/2+1,q[1]-it.h+2,it.c2);
      pxEllipse(ctx,q[0],q[1]-it.h,it.w/2-1,1.2,PAL.brass);
    } else {
      pxEllipse(ctx,q[0],q[1]-2,it.w/2,2.4,it.c);
      pxEllipse(ctx,q[0],q[1]-3,it.w/2-1,1.6,it.r);
      pxLine(ctx,q[0]-it.w/2,q[1]-1,q[0]+it.w/2,q[1]-1,PAL.woodDeep);
    }
  }
  // hanging red charm and dried bundle
  const ch=p(10.2,h-1);
  pxLine(ctx,ch[0],ch[1],ch[0],ch[1]+8,PAL.paperDim);
  pxPoly(ctx,[[ch[0]-2,ch[1]+8],[ch[0]+2,ch[1]+8],[ch[0]+2,ch[1]+16],[ch[0]-2,ch[1]+16]],PAL.red);
  r(ctx,ch[0]-1,ch[1]+11,2,1,PAL.paper);
  const dr=p(11.05,h+2);
  for (let i=0;i<5;i++) pxLine(ctx,dr[0]-3+i*1.5,dr[1],dr[0]-5+i*2,dr[1]+9+i%2,PAL.woodLit);
  // warm/cold rim on board
  pxLine(ctx,a[0],a[1],b[0],b[1],PAL.warmLit);
}

function drawWallCalendar(ctx,t){
  const x0=7.45,x1=8.25,u0=21,u1=35;
  const a=wallNEPt(x0,u0), b=wallNEPt(x1,u0), c=wallNEPt(x1,u1), d=wallNEPt(x0,u1);
  // drop shadow and paper
  dithFill(ctx,[[a[0]+2,a[1]+1],[b[0]+2,b[1]+1],[c[0]+2,c[1]+1],[d[0]+2,d[1]+1]],PAL.black,6,0.32);
  pxPoly(ctx,[[a[0],a[1]],[b[0],b[1]],[c[0],c[1]],[d[0],d[1]]],PAL.paper);
  pxPoly(ctx,[[d[0],d[1]],[c[0],c[1]],[c[0],c[1]-4],[d[0],d[1]-4]],PAL.red);
  // red header and grid
  pxLine(ctx,a[0],a[1]-4,b[0],b[1]-4,PAL.redDeep);
  for (let i=0;i<4;i++){
    const q0=wallNEPt(x0+0.06,u1-6-i*2.5), q1=wallNEPt(x1-0.06,u1-6-i*2.5);
    pxLine(ctx,q0[0],q0[1],q1[0],q1[1],'rgba(74,60,44,.35)');
  }
  for (let i=1;i<4;i++){
    const q0=wallNEPt(x0+0.2*i,u0+2), q1=wallNEPt(x0+0.2*i,u1-4);
    pxLine(ctx,q0[0],q0[1],q1[0],q1[1],'rgba(74,60,44,.28)');
  }
  // red circled date + torn corner + pin
  const q=wallNEPt(x0+0.5,u0+8);
  ctx.strokeStyle=PAL.red; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(q[0],q[1],3,0,Math.PI*2); ctx.stroke();
  pxPoly(ctx,[[c[0],c[1]],[c[0]-4,c[1]],[c[0],c[1]-4]],PAL.wallNE);
  r(ctx,d[0]+2,d[1]+1,1,1,PAL.brass);
}

function drawWallClock(ctx,t){
  const c=wallNEPt(6.0,37);
  const cx=c[0], cy=c[1];
  // shadow + rim
  dithEllipse(ctx,cx+2,cy+2,11,10,PAL.black,6,0.30);
  pxEllipse(ctx,cx,cy,9,9,PAL.woodDeep);
  pxEllipse(ctx,cx,cy,8,8,PAL.woodDark);
  pxEllipse(ctx,cx,cy,7,7,PAL.boneDim);
  pxEllipse(ctx,cx,cy,6,6,PAL.paper);
  // ticks
  for (const [dx,dy] of [[0,-5],[0,5],[-5,0],[5,0],[3,-3],[-3,-3],[3,3],[-3,3]]) r(ctx,cx+dx,cy+dy,1,1,PAL.woodDark);
  // hands stopped at 3:47
  pxLine(ctx,cx,cy,cx+4,cy+2,PAL.woodDeep);
  pxLine(ctx,cx,cy,cx-5,cy-1,PAL.woodDark);
  r(ctx,cx,cy,1,1,PAL.brass);
  pxLine(ctx,cx,cy,cx+4,cy-2,PAL.woodDeep);
  r(ctx,cx,cy,1,1,PAL.red);
  // hanging nail / warm rim
  pxLine(ctx,cx,cy-11,cx,cy-8,PAL.paperDim);
  pxLine(ctx,cx+6,cy-3,cx+7,cy+2,'rgba(240,190,120,.45)');
  pxLine(ctx,cx-6,cy-2,cx-7,cy+2,'rgba(150,190,185,.28)');
  dithEllipse(ctx,cx,cy,11,10,PAL.warm,1,0.16,'screen');
}

function drawHangingClothes(ctx,t){
  // padded coat on a peg (north-west wall)
  let coatShift=0;
  if (state.chapter===2 && state.hunt && state.hunt.layout){
    coatShift=state.hunt.layout===1?6:(state.hunt.layout===2?-5:0);
  }
  const c=wallNWPt(5.85,35);
  const cx=c[0]+coatShift, cy=c[1];
  r(ctx,cx-1,cy-2,2,2,PAL.woodPale);
  pxPoly(ctx,[[cx-9,cy+4],[cx-6,cy],[cx+6,cy],[cx+9,cy+4],[cx+7,cy+31],[cx-7,cy+31]],PAL.wallSoot);
  pxPoly(ctx,[[cx-6,cy+5],[cx-4,cy+2],[cx+4,cy+2],[cx+6,cy+5],[cx+5,cy+28],[cx-5,cy+28]],'#242821');
  pxPoly(ctx,[[cx-4,cy+6],[cx-2,cy+4],[cx+2,cy+4],[cx+4,cy+6],[cx+3,cy+26],[cx-3,cy+26]],'#2d322a');
  // quilted channels and a worn fur collar
  pxLine(ctx,cx,cy+3,cx,cy+27,PAL.black);
  for (let i=0;i<3;i++){
    pxLine(ctx,cx-4+i*4,cy+7,cx-4+i*4,cy+27,'rgba(8,10,9,.55)');
    pxLine(ctx,cx-3+i*4,cy+8,cx-3+i*4,cy+26,'rgba(132,142,124,.12)');
  }
  pxLine(ctx,cx-5,cy+5,cx+5,cy+5,'rgba(158,150,126,.34)');
  pxLine(ctx,cx-4,cy+6,cx+4,cy+6,'rgba(90,84,68,.55)');
  pxLine(ctx,cx-6,cy+5,cx-6,cy+28,'rgba(240,190,120,.42)');
  pxLine(ctx,cx+6,cy+5,cx+6,cy+28,'rgba(126,178,172,.26)');
  r(ctx,cx+3,cy+12,1,2,PAL.brassDark); r(ctx,cx+3,cy+18,1,2,PAL.brassDark);
  // sleeves hanging either side, so the silhouette reads as a coat, not a post
  pxPoly(ctx,[[cx-6,cy+8],[cx-9,cy+13],[cx-8,cy+25],[cx-5,cy+23]],'#1d211b');
  pxPoly(ctx,[[cx-6,cy+8],[cx-8,cy+13],[cx-7,cy+23],[cx-5,cy+21]],'#282d26');
  pxPoly(ctx,[[cx+6,cy+8],[cx+9,cy+13],[cx+8,cy+25],[cx+5,cy+23]],'#1d211b');
  pxPoly(ctx,[[cx+6,cy+8],[cx+8,cy+13],[cx+7,cy+23],[cx+5,cy+21]],'#2b302a');
  pxLine(ctx,cx-8,cy+13,cx-7,cy+24,'rgba(126,178,172,.22)');
  pxLine(ctx,cx+8,cy+13,cx+7,cy+24,'rgba(240,190,120,.34)');
  // straw hat hanging beside it
  const h=wallNWPt(6.95,31);
  const hx=h[0], hy=h[1];
  pxEllipse(ctx,hx,hy,10,3,PAL.woodDark);
  pxEllipse(ctx,hx,hy-1,9,2,PAL.woodLit);
  pxPoly(ctx,[[hx-5,hy-1],[hx+5,hy-1],[hx+3,hy-5],[hx-3,hy-5]],PAL.wood);
  for (let i=-3;i<=3;i+=3) pxLine(ctx,hx+i,hy-1,hx+i*0.6,hy-4,PAL.woodPale);
  pxLine(ctx,hx-9,hy-1,hx+9,hy-1,PAL.woodHi);
  pxLine(ctx,hx+8,hy-2,hx+10,hy-2,PAL.warmLit);
  // peg shadow
  dithEllipse(ctx,cx+2,cy+30,13,4,PAL.black,5,0.22);
}

// ---------- floor, rug, leaves, bucket, light ----------
function drawIsoFloor(ctx,t){
  // stone tiles
  for (let y=0;y<9;y++){
    for (let x=0;x<12;x++){
      const p0=iso(x,y), p1=iso(x+1,y), p2=iso(x+1,y+1), p3=iso(x,y+1);
      const n=(x*7+y*11+x*y*3)%17;
      let c=PAL.floor1;
      if (n===0) c=PAL.floor3;
      else if (n===1||n===7) c=PAL.floor2;
      else if (n===4||n===12) c=PAL.floorCool;
      else if (n===9) c=PAL.floor0;
      pxPoly(ctx,[[p0.x,p0.y],[p1.x,p1.y],[p2.x,p2.y],[p3.x,p3.y]],c);
      // worn top-left lip
      if ((n%3)===0) pxLine(ctx,p0.x+1,p0.y+1,p3.x-1,p3.y-1,PAL.floorHi);
      // deterministic chips and hairline cracks
      if (n===2||n===8){
        const q=iso(x+0.35,y+0.55);
        pxLine(ctx,q.x,q.y,q.x+4,q.y+2,PAL.grout);
      }
      if (n===5){ const q=iso(x+0.6,y+0.3); pxLine(ctx,q.x,q.y,q.x+2,q.y+3,'rgba(90,76,54,.40)'); }
      if (n===11){ const q=iso(x+0.2,y+0.8); r(ctx,q.x,q.y,2,1,PAL.floorHi); }
      // grout
      pxLine(ctx,p0.x,p0.y,p1.x,p1.y,PAL.grout);
      pxLine(ctx,p0.x,p0.y,p3.x,p3.y,PAL.grout);
    }
  }
  // contact shadows at wall bases
  const A=iso(0,0), B=iso(12,0), W0=iso(0,9);
  dithFill(ctx,[[A.x,A.y],[B.x,B.y],[B.x-7,B.y+4],[A.x-7,A.y+4]],PAL.black,6,0.30);
  dithFill(ctx,[[A.x,A.y],[W0.x,W0.y],[W0.x+5,W0.y+3],[A.x+5,A.y+3]],PAL.black,7,0.28);
  // rug and leaf litter
  drawRug(ctx,t);
  drawLeafPile(ctx,t);
  drawDoorStep(ctx,t);
  drawPuddles(ctx,t);
  // a few dry straws / dust at the far wall
  for (let i=0;i<9;i++){
    const q=iso(0.5+((i*29)%40)/10,0.35+((i*17)%12)/10);
    pxLine(ctx,q.x,q.y,q.x+3,q.y+1,i%2?PAL.woodLit:PAL.paperDim);
  }
}

function drawPuddles(ctx,t){
  // Rain has been coming in for years: shallow, oily puddles that catch the
  // window and the practical bulb. Drawn as hard pixels, never a blur.
  const spots=[
    [2.62,3.18,17,4.6],[1.52,6.28,11,3.2],[3.24,1.02,14,3.8],[4.42,2.18,7,2.2]
  ];
  for (let k=0;k<spots.length;k++){
    const [wx,wy,rx,ry]=spots[k];
    const p=iso(wx,wy);
    dithEllipse(ctx,p.x+1,p.y+1,rx+2,ry+1,PAL.black,7,0.30);
    pxEllipse(ctx,p.x,p.y,rx,ry,PAL.coolDeep);
    pxEllipse(ctx,p.x-1,p.y-1,Math.max(2,rx-4),Math.max(1,ry-1.4),PAL.coolDark);
    // hard specular streaks
    pxLine(ctx,p.x-rx+3,p.y-1,p.x-rx+7,p.y-1,PAL.coolHi);
    pxLine(ctx,p.x-rx+2,p.y,p.x-rx+5,p.y,'rgba(176,208,200,.35)');
    if (k===0){
      pxLine(ctx,p.x+2,p.y-2,p.x+7,p.y-2,PAL.coolGlow);
      pxLine(ctx,p.x+4,p.y-1,p.x+9,p.y-1,'rgba(176,208,200,.30)');
      r(ctx,p.x+7,p.y-3,1,1,PAL.boneDim);
    }
    ditherRing(ctx,p.x,p.y,rx,ry,0.18,PAL.coolGlow,0.18,2);
  }
  // a thin wet track from the door to the table
  const a=iso(3.4,1.3), b=iso(4.3,2.6);
  for (let i=0;i<7;i++){
    const x=Math.round(a.x+(b.x-a.x)*i/7), y=Math.round(a.y+(b.y-a.y)*i/7);
    r(ctx,x,y,2,1,i%2?'rgba(176,208,200,.18)':'rgba(30,58,66,.35)');
  }
}

function drawRug(ctx,t){
  const c0=iso(3.15,6.15), c1=iso(6.45,6.15), c2=iso(6.45,8.45), c3=iso(3.15,8.45);
  const base=[[c0.x,c0.y],[c1.x,c1.y],[c2.x,c2.y],[c3.x,c3.y]];
  // shadow under the rug
  dithFill(ctx,base.map(p=>[p[0]+3,p[1]+3]),PAL.black,7,0.35);
  const inner=shrinkQuad(base,0.035);
  pxPoly(ctx,inner,PAL.redDeep);
  const field=shrinkQuad(base,0.11);
  pxPoly(ctx,field,PAL.redDark);
  // borders
  const b1=shrinkQuad(base,0.055), b2=shrinkQuad(base,0.125);
  ctx.save(); ctx.beginPath(); ctx.moveTo(b1[0][0],b1[0][1]); for(let i=1;i<4;i++)ctx.lineTo(b1[i][0],b1[i][1]); ctx.closePath();
  ctx.strokeStyle=PAL.redLit; ctx.lineWidth=1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(b2[0][0],b2[0][1]); for(let i=1;i<4;i++)ctx.lineTo(b2[i][0],b2[i][1]); ctx.closePath();
  ctx.strokeStyle=PAL.ochre; ctx.lineWidth=1; ctx.stroke(); ctx.restore();
  // woven bands
  for (let i=0;i<4;i++){
    const a=iso(3.5,6.55+i*0.42), b=iso(6.1,6.55+i*0.42);
    pxLine(ctx,a.x,a.y,b.x,b.y,i%2?PAL.redLit:'#7e3322');
  }
  // central motifs
  for (let i=0;i<3;i++){
    const c=iso(4.05+i*0.8,7.35);
    const w=5+ (i===1?2:0);
    pxPoly(ctx,[[c.x,c.y-w/2-2],[c.x+w,c.y],[c.x,c.y+w/2+2],[c.x-w,c.y]],i===1?PAL.ochre:PAL.redLit);
    pxPoly(ctx,[[c.x,c.y-w/2],[c.x+w-2,c.y],[c.x,c.y+w/2],[c.x-w+2,c.y]],PAL.redDark);
    r(ctx,c.x,c.y,1,1,PAL.boneDim);
  }
  // wear / folds (dithered pixels, not a filter)
  dithFill(ctx,field,PAL.floor1,3,0.24);
  dithFill(ctx,[[c0.x,c0.y],[c1.x,c1.y],[c1.x-6,c1.y+3],[c0.x-6,c0.y+3]],PAL.floorHi,2,0.18,'screen');
  dithFill(ctx,[[c2.x,c2.y],[c3.x,c3.y],[c3.x+4,c3.y-2],[c2.x+4,c2.y-2]],PAL.black,4,0.22);
  // fringe on the two short ends
  for (let i=0;i<9;i++){
    const p=iso(3.18,6.3+i*0.25), q=iso(6.42,6.3+i*0.25);
    pxLine(ctx,p.x-2,p.y+1,p.x-4,p.y+2,i%2?PAL.paperDim:PAL.redLit);
    pxLine(ctx,q.x+2,q.y-1,q.x+4,q.y-2,i%2?PAL.paperDim:PAL.redLit);
  }
  // raised lit edge
  pxLine(ctx,c0.x+2,c0.y,c1.x-2,c1.y,PAL.redLit);
  pxLine(ctx,c0.x+2,c0.y+1,c1.x-2,c1.y+1,'rgba(210,120,70,.25)');
}

function drawLeafPile(ctx,t){
  const c=iso(10.05,7.65);
  // solid mound under the litter, a few dry leaves spilling out
  glowEllipse(ctx,c.x+3,c.y+3,28,10,PAL.black,0.24);
  pxEllipse(ctx,c.x+1,c.y+2,24,8,PAL.woodDeep);
  pxEllipse(ctx,c.x-1,c.y-1,20,7,PAL.woodDark);
  pxEllipse(ctx,c.x-4,c.y-3,14,5,PAL.wood);
  pxEllipse(ctx,c.x-6,c.y-4,8,3,PAL.woodLit);
  dithEllipse(ctx,c.x-5,c.y-4,20,7,PAL.woodHi,3,0.20);
  const cols=[PAL.woodLit,PAL.woodHi,PAL.brass,PAL.woodPale,PAL.redLit,PAL.redDark,PAL.woodDark];
  for (let i=0;i<38;i++){
    const wx=9.45+((i*37)%165)/100;
    const wy=7.18+((i*53)%145)/100;
    const q=iso(wx,wy);
    const jx=((i*13)%7)-3, jy=((i*17)%5)-2;
    const col=cols[i%cols.length];
    const w=2+(i%3), h=1+((i>>1)%2);
    // dark under-leaf and lit top face
    pxPoly(ctx,[[q.x+jx-1,q.y+jy],[q.x+jx+w,q.y+jy-1],[q.x+jx+w+1,q.y+jy+h],[q.x+jx-1,q.y+jy+h+1]],PAL.woodDeep);
    pxPoly(ctx,[[q.x+jx,q.y+jy],[q.x+jx+w,q.y+jy],[q.x+jx+w,q.y+jy+h],[q.x+jx,q.y+jy+h]],col);
    if (i%3===0) pxLine(ctx,q.x+jx+1,q.y+jy+h,q.x+jx+3,q.y+jy+h+2,PAL.woodDark);
    if (i%4===0) r(ctx,q.x+jx+1,q.y+jy,1,1,PAL.flameHi);
    if (i%5===0) pxLine(ctx,q.x+jx-w,q.y+jy+1,q.x+jx-2,q.y+jy+2,PAL.woodDark);
  }
  // a few leaves carried away from the pile
  for (let i=0;i<9;i++){
    const q=iso(8.9+((i*31)%130)/100,6.7+((i*47)%90)/100);
    pxPoly(ctx,[[q.x-2,q.y],[q.x+2,q.y-1],[q.x+1,q.y+2],[q.x-2,q.y+1]],i%2?PAL.redDark:PAL.woodDark);
    pxLine(ctx,q.x,q.y,q.x+2,q.y+1,i%2?PAL.redLit:PAL.woodLit);
  }
  // a rusted tin lid half buried in the pile
  const lid=iso(10.7,7.25);
  pxEllipse(ctx,lid.x,lid.y,6,2.5,PAL.woodDeep);
  pxEllipse(ctx,lid.x,lid.y-1,5,2,PAL.cool);
  pxLine(ctx,lid.x-4,lid.y-2,lid.x+3,lid.y-2,PAL.coolHi);
  pxLine(ctx,lid.x-1,lid.y-3,lid.x+2,lid.y-3,'rgba(180,220,210,.25)');
  drawChairFacingWall(ctx,t);
  drawWetShoes(ctx,t);
  drawFootprints(ctx,t);
}

function drawDoorStep(ctx,t){
  const a=iso(1.85,0.0), b=iso(4.55,0.0);
  const c=iso(4.55,0.36), d=iso(1.85,0.36);
  const q=[[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]];
  dithFill(ctx,q.map(p=>[p[0]+2,p[1]+3]),PAL.black,6,0.36);
  pxPoly(ctx,q,PAL.floorCool);
  pxLine(ctx,a.x,a.y,b.x,b.y,PAL.paperDim);
  pxLine(ctx,d.x,d.y,c.x,c.y,'rgba(20,18,14,.55)');
  // threshold crack
  pxLine(ctx,a.x+18,a.y+4,a.x+23,a.y+7,PAL.grout);
  // cold light leak under the door
  dithFill(ctx,[[a.x+3,a.y+1],[b.x-3,b.y+1],[b.x-3,b.y+4],[a.x+3,a.y+4]],PAL.coolHi,5,0.25,'screen');
}

function drawFloorLight(ctx,t,flick){
  // cold window patch on the floor (NW light): flat stepped bands, dithered only at the rim
  const f0=iso(1.35,2.75), f1=iso(3.95,2.75), f2=iso(3.95,5.05), f3=iso(1.35,5.05);
  const patch=[[f0.x,f0.y],[f1.x,f1.y],[f2.x,f2.y],[f3.x,f3.y]];
  glowFill(ctx,patch,PAL.coolHi,0.125,'screen');
  const pin=shrinkQuad(patch,0.24);
  glowFill(ctx,pin,PAL.coolGlow,0.100,'screen');
  const pcore=shrinkQuad(patch,0.44);
  glowFill(ctx,pcore,PAL.coolGlow,0.070,'screen');
  ditherLine(ctx,f0.x,f0.y,f1.x,f1.y,PAL.coolGlow,0.28,2);
  ditherLine(ctx,f1.x,f1.y,f2.x,f2.y,PAL.coolGlow,0.20,2);
  ditherLine(ctx,f2.x,f2.y,f3.x,f3.y,PAL.coolGlow,0.18,2);
  ditherLine(ctx,f3.x,f3.y,f0.x,f0.y,PAL.coolGlow,0.24,2);
  // faint volume of rain-light from the window to the floor
  const w0=iso(0,2.25), w1=iso(0,4.35);
  const wl=[w0.x+2,w0.y-2], wr=[w1.x+2,w1.y-2];
  glowFill(ctx,[[wl[0],wl[1]],[wr[0],wr[1]],[f2.x,f2.y],[f3.x,f3.y]],PAL.coolHi,0.060,'screen');
  ditherLine(ctx,wl[0],wl[1],f3.x,f3.y,PAL.coolGlow,0.16,2);
  ditherLine(ctx,wr[0],wr[1],f2.x,f2.y,PAL.coolGlow,0.13,2);
  glowEllipse(ctx,218,116,34,13,PAL.coolHi,0.12,'screen');
  // warm bulb pool: concentric stepped ellipses
  glowEllipse(ctx,292,142,92,44,PAL.warm,0.120,'screen');
  glowEllipse(ctx,292,142,62,30,PAL.warm,0.130,'screen');
  glowEllipse(ctx,292,142,40,20,PAL.warmLit,0.120,'screen');
  glowEllipse(ctx,292,142,26,13,PAL.flame,0.095*flick,'screen');
  glowEllipse(ctx,292,142,14,7,PAL.flameHi,0.080*flick,'screen');
  ditherRing(ctx,292,142,86,40,0.035,PAL.warmLit,0.11,2);
  ditherRing(ctx,292,142,60,28,0.05,PAL.warmLit,0.12,2);
  ditherRing(ctx,292,142,40,18,0.07,PAL.flameHi,0.01,2);
  // room-edge falloff: broad flat darkening
  glowFill(ctx,[[iso(0,0).x,iso(0,0).y],[iso(0,9).x,iso(0,9).y],[iso(0,9).x+24,iso(0,9).y-4],[iso(0,0).x+24,iso(0,0).y-4]],PAL.black,0.14);
  glowFill(ctx,[[iso(12,0).x,iso(12,0).y],[iso(12,9).x,iso(12,9).y],[iso(12,9).x-20,iso(12,9).y-2],[iso(12,0).x-20,iso(12,0).y-2]],PAL.black,0.12);
  // a soft stepped shaft from the wet window to the floor patch
  const sw0=iso(0,2.25), sw1=iso(0,4.35);
  const shaft=[[sw0.x+3,sw0.y-34],[sw1.x+3,sw1.y-34],[f2.x+12,f2.y],[f3.x+12,f3.y]];
  glowFill(ctx,shaft,PAL.coolHi,0.045,'screen');
  dithFill(ctx,shaft,PAL.coolGlow,2,0.10,'screen');
  dithFill(ctx,shrinkQuad(shaft,0.08),PAL.coolGlow,2,0.06,'screen');
}

function drawRoomShadows(ctx,t){
  // table footprint shadow, offset away from the bulb
  const a=iso(5.9,3.9), b=iso(9.1,3.9), c=iso(9.1,6.1), d=iso(5.9,6.1);
  const sh=[[a.x-8,a.y+7],[b.x-8,b.y+7],[c.x-8,c.y+7],[d.x-8,d.y+7]];
  const shOut=[[sh[0][0]-4,sh[0][1]+3],[sh[1][0]+4,sh[1][1]+3],[sh[2][0]+4,sh[2][1]+3],[sh[3][0]-4,sh[3][1]+3]];
  glowFill(ctx,shOut,PAL.black,0.17);
  dithFill(ctx,shOut,PAL.black,3,0.13);
  glowFill(ctx,shrinkQuad(sh,0.06),PAL.black,0.32);
  glowFill(ctx,shrinkQuad(sh,0.30),PAL.black,0.23);
  // chair / old woman: solid core with a sparse dithered fringe
  const o=iso(8.5,2.5);
  glowEllipse(ctx,o.x+19,o.y+3,25,9,PAL.black,0.15);
  glowEllipse(ctx,o.x+19,o.y+3,19,7,PAL.black,0.26);
  glowEllipse(ctx,o.x+19,o.y+2,12,4,PAL.black,0.22);
  ditherRing(ctx,o.x+19,o.y+3,27,10,0.05,PAL.black,0.22,2);
  // bucket and stool
  const bk=iso(1.3,7.45);
  glowEllipse(ctx,bk.x+4,bk.y+2,14,4.5,PAL.black,0.30);
  const st=iso(2.55,7.9);
  glowEllipse(ctx,st.x+3,st.y+2,10,3.4,PAL.black,0.28);
  // soft cool shadow along the west wall
  glowFill(ctx,[[iso(0,3).x,iso(0,3).y],[iso(0,9).x,iso(0,9).y],[iso(0,9).x+18,iso(0,9).y-2],[iso(0,3).x+18,iso(0,3).y-2]],PAL.coolDeep,0.12);
  drawSecondShadow(ctx,t);
}

function drawHangingBulb(ctx,t,flick){
  const bx=288, by=80;
  // cord and ceiling cap (the foreground beam covers the very top)
  pxLine(ctx,bx,0,bx,by-6,PAL.beam);
  pxLine(ctx,bx+1,0,bx+1,by-8,'rgba(130,96,58,.22)');
  r(ctx,bx-2,by-8,5,3,PAL.woodDark);
  r(ctx,bx-1,by-7,3,1,PAL.woodLit);
  // warm halo behind the bulb
  glowEllipse(ctx,bx,by,40,33,PAL.warm,0.15*flick,'screen');
  glowEllipse(ctx,bx,by,20,17,PAL.flame,0.16*flick,'screen');
  ditherRing(ctx,bx,by,30,25,0.10,PAL.flameLit,0.24,2);
  // small enamel pendant shade above the bare bulb
  pxEllipse(ctx,bx,by-8,10,3,PAL.woodDeep);
  pxPoly(ctx,[[bx-10,by-9],[bx+10,by-9],[bx+6,by-3],[bx-6,by-3]],PAL.woodDark);
  pxPoly(ctx,[[bx-8,by-8],[bx+8,by-8],[bx+5,by-4],[bx-5,by-4]],PAL.wood);
  pxLine(ctx,bx-9,by-9,bx+9,by-9,PAL.woodHi);
  pxLine(ctx,bx-8,by-8,bx+8,by-8,'rgba(239,185,108,.50)');
  pxLine(ctx,bx-5,by-3,bx+5,by-3,PAL.warmLit);
  pxLine(ctx,bx-2,by-9,bx-2,by-13,PAL.woodDeep);
  pxLine(ctx,bx+2,by-9,bx+2,by-13,PAL.woodDark);
  // bulb
  pxEllipse(ctx,bx,by,3,4,PAL.warmLit);
  pxEllipse(ctx,bx,by-1,2,2,PAL.flameHi);
  r(ctx,bx-1,by-5,2,2,PAL.boneDim);
  pxLine(ctx,bx-1,by-4,bx+1,by-3,PAL.brassHi);
  r(ctx,bx,by+3,1,1,PAL.woodHi);
  // a few dust motes caught in the halo
  for (let i=0;i<7;i++){
    const x=bx+Math.sin(t*0.4+i*1.8)*22+Math.sin(t*1.1+i)*3;
    const y=by+Math.cos(t*0.5+i*2.1)*17+((i*7)%13);
    r(ctx,Math.round(x),Math.round(y),1,1,PAL.flameLit);
  }
}

function drawBucketAndStool(ctx,t){
  // wooden bucket
  const p=iso(1.3,7.45);
  const bx=p.x, by=p.y;
  dithEllipse(ctx,bx+3,by+2,14,4,PAL.black,9,0.36);
  // body (slightly tapered)
  pxPoly(ctx,[[bx-9,by-14],[bx+9,by-14],[bx+7,by+1],[bx-7,by+1]],PAL.woodDark);
  pxPoly(ctx,[[bx-8,by-13],[bx+7,by-13],[bx+5,by],[bx-5,by]],PAL.wood);
  pxLine(ctx,bx-8,by-10,bx+7,by-10,PAL.woodDeep);
  pxLine(ctx,bx-7,by-4,bx+6,by-4,PAL.woodDeep);
  // staves
  for (let i=-2;i<=2;i++) pxLine(ctx,bx+i*3.2,by-13,bx+i*2.6,by+1,i%2?'rgba(28,18,10,.45)':'rgba(160,116,66,.22)');
  // hoops
  pxLine(ctx,bx-9,by-12,bx+9,by-12,PAL.brass);
  pxLine(ctx,bx-8,by-5,bx+8,by-5,PAL.brass);
  pxLine(ctx,bx-9,by-11,bx+9,by-11,PAL.brassHi);
  pxLine(ctx,bx-8,by-4,bx+8,by-4,PAL.brassDark);
  // rim / dark water
  pxEllipse(ctx,bx,by-14,9,3,PAL.woodDeep);
  pxEllipse(ctx,bx,by-14,8,2,PAL.woodHi);
  pxEllipse(ctx,bx,by-14,6,1.5,PAL.coolDeep);
  // handle
  ctx.strokeStyle=PAL.woodDeep; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(bx,by-15,9,Math.PI*0.08,Math.PI*0.92,true); ctx.stroke();
  // rim light
  pxLine(ctx,bx-8,by-13,bx-7,by-2,PAL.warmLit);
  pxLine(ctx,bx+8,by-13,bx+6,by-2,'rgba(120,170,168,.30)');

  // low wooden stool
  const q=iso(2.55,7.9);
  const sx=q.x, sy=q.y;
  dithEllipse(ctx,sx+2,sy+2,11,4,PAL.black,9,0.34);
  pxEllipse(ctx,sx,sy-8,10,3.4,PAL.woodDark);
  pxEllipse(ctx,sx,sy-9,9,3,PAL.wood);
  pxEllipse(ctx,sx,sy-10,8,2.2,PAL.woodLit);
  for (let i=0;i<3;i++){
    const lx=sx-7+i*7;
    pxLine(ctx,lx,sy-8,lx-1,sy,PAL.woodDark);
    pxLine(ctx,lx,sy-7,lx-1,sy-1,PAL.woodLit);
  }
  pxLine(ctx,sx-8,sy-11,sx+6,sy-12,PAL.warmLit);
  // a rag on the stool
  pxPoly(ctx,[[sx-3,sy-11],[sx+4,sy-11],[sx+5,sy-8],[sx-2,sy-8]],PAL.redDark);
  pxLine(ctx,sx-2,sy-10,sx+4,sy-10,PAL.red);
}

// =========================================================
//  LightRig —— 真正的像素光照层
//  每两帧算一张 480×270 的照明图（环境光 + 若干点光），用 4×4 Bayer 矩阵
//  量化成若干阶，最后以 multiply 叠回场景。
//  与原来 glowEllipse('screen') 的区别：加法把颜色往白里推（越亮越灰），
//  乘法先压暗、再让光把局部还原成本色——暗部保留色相，亮部才有颜色倾向。
// =========================================================
const LIGHT_MODE = (new URLSearchParams(location.search).get('light') || '1');
const LightRig = (() => {
  const PW2 = 480, PH2 = 270;
  const AMB = [170, 179, 193];       // 环境光：冷、偏青，乘上去把房间压暗
  const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
  const LEVELS = 5;                   // 量化阶数，越低越"像素"
  let cv = null, g2 = null, img = null, acc = 0, first = true;
  const lights = [];

  function ensure() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.width = PW2; cv.height = PH2;
    g2 = cv.getContext('2d');
    img = g2.createImageData(PW2, PH2);
  }

  function addLight(x, y, rx, ry, r, g, b, k) { lights.push({ x, y, rx, ry, r, g, b, k }); }

  function rebuild() {
    ensure();
    const d = img.data, n = lights.length;
    for (let py = 0; py < PH2; py++) {
      const byRow = (py & 3) << 2;
      for (let px = 0; px < PW2; px++) {
        let lr = AMB[0], lg = AMB[1], lb = AMB[2];
        for (let i = 0; i < n; i++) {
          const L = lights[i];
          const dx = (px - L.x) / L.rx, dy = (py - L.y) / L.ry;
          const d2 = dx * dx + dy * dy;
          if (d2 >= 1) continue;
          const f = 1 - d2, q = f * f * L.k;   // 平方衰减，边缘更硬
          lr += L.r * q; lg += L.g * q; lb += L.b * q;
        }
        // Bayer 抖动后量化：色阶之间出现像素画特有的点状过渡
        const by = BAYER[byRow | (px & 3)];
        const o = (py * PW2 + px) << 2;
        let s = (lr / 255) * LEVELS + (by / 16) - 0.5;
        s = s < 0 ? 0 : s > LEVELS ? LEVELS : s;
        d[o] = (s / LEVELS) * 255;
        s = (lg / 255) * LEVELS + (by / 16) - 0.5;
        s = s < 0 ? 0 : s > LEVELS ? LEVELS : s;
        d[o + 1] = (s / LEVELS) * 255;
        s = (lb / 255) * LEVELS + (by / 16) - 0.5;
        s = s < 0 ? 0 : s > LEVELS ? LEVELS : s;
        d[o + 2] = (s / LEVELS) * 255;
        d[o + 3] = 255;
      }
    }
    g2.putImageData(img, 0, 0);
    cv.ready = true;
  }

  function update(flicker) {
    acc++;
    if (!first && acc % 2) return;     // 每两帧重算，肉眼无感
    const c = iso(7.15, 4.95);
    lights.length = 0;
    addLight(288, 82, 122, 100, 255, 198, 136, 0.62 * flicker.bulb);   // 顶灯
    addLight(c.x, c.y - 29, 52, 44, 255, 160, 76, 0.95 * flicker.candle); // 烛台
    addLight(196, 72, 86, 104, 120, 168, 205, 0.30);                  // 窗口冷光
    rebuild();
    first = false;
  }

  function apply(ctx) {
    if (first) update({ bulb: 1, candle: 1 });
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(cv, 0, 0);
    ctx.restore();
  }
  return { update, apply };
})();

function drawCandleBloom(ctx,t,candleFlick){
  const c=iso(7.15,4.95);
  const bx=c.x, by=c.y-20;
  glowEllipse(ctx,bx,by-9,38,33,PAL.warm,0.120*candleFlick,'screen');
  glowEllipse(ctx,bx,by-9,22,19,PAL.flame,0.130*candleFlick,'screen');
  glowEllipse(ctx,bx,by-9,11,10,PAL.flameHi,0.100*candleFlick,'screen');
  ditherRing(ctx,bx,by-9,32,28,0.10,PAL.flameLit,0.18*candleFlick,2);
  // the bulb's broad bloom, layered over the room
  glowEllipse(ctx,288,82,110,88,PAL.warm,0.050,'screen');
  glowEllipse(ctx,288,82,62,52,PAL.warmLit,0.045,'screen');
  glowEllipse(ctx,288,82,30,26,PAL.flame,0.035,'screen');
  ditherRing(ctx,288,82,92,74,0.035,PAL.warmLit,0.10,2);
}

function drawDust(ctx,t){
  // warm dust in the bulb cone + cold motes at the window
  ctx.save();
  for (let i=0;i<24;i++){
    const warm=i<15;
    const x=warm?288+Math.sin(t*0.35+i*2.1)*56+Math.sin(t*1.3+i)*4
                :344+Math.sin(t*0.22+i*1.7)*26;
    const y=warm?92+((i*31+t*7)%88)
                :78+((i*23+t*4)%70);
    const a=0.10+0.08*(0.5+0.5*Math.sin(t*1.7+i*1.3));
    ctx.globalAlpha=a;
    r(ctx,Math.round(x),Math.round(y),1,1,warm?PAL.flameLit:PAL.coolGlow);
  }
  ctx.restore();
}

function drawForeground(ctx,t){
  // cold floor fog: low dither that swallows the floor edge
  for (let i=0;i<20;i++){
    ctx.globalAlpha=0.10*(1-i/20);
    ctx.fillStyle=PAL.fog;
    ctx.fillRect(24+i*2,198+i*2.4,PW-48-i*4,2);
  }
  ctx.globalAlpha=1;
  dithFill(ctx,[[0,198],[PW,198],[PW,252],[0,252]],PAL.fog,2,0.10);
  // top rafter
  pxPolyFromRect(ctx,0,0,PW,7,PAL.void);
  pxPolyFromRect(ctx,18,0,PW-36,4,PAL.beam);
  pxLine(ctx,24,7,PW-24,7,'rgba(130,96,58,.30)');
  for (let i=0;i<18;i++){ const x=26+i*24; pxLine(ctx,x,0,x+5,6,'rgba(50,36,22,.50)'); }
  // left jamb / curtain
  pxPoly(ctx,[[0,0],[25,0],[25,270],[0,270]],PAL.void);
  pxPoly(ctx,[[14,0],[27,0],[23,270],[10,270]],'#0a0b0a');
  for (let i=0;i<5;i++){
    const x=15+i*2.4;
    pxLine(ctx,x,0,x-3,270,i%2?'rgba(26,22,17,.8)':'rgba(7,8,7,.8)');
  }
  pxLine(ctx,25,0,21,270,'rgba(200,150,88,.18)');
  // bottom sill
  pxPolyFromRect(ctx,0,253,PW,17,PAL.void);
  pxPoly(ctx,[[0,253],[PW,253],[PW,262],[0,262]],PAL.beam);
  pxLine(ctx,0,253,PW,253,'rgba(148,110,66,.32)');
  for (let i=0;i<24;i++){ const x=i*21; pxLine(ctx,x,254,x+9,261,'rgba(34,24,14,.5)'); }
  // right curtain: irregular hem, folds, a red cord
  const hem=[258,257,259,256,258,260,257,259,258,256,259,260,257];
  ctx.beginPath(); ctx.moveTo(480,0); ctx.lineTo(452,0);
  for (let i=0;i<hem.length;i++) ctx.lineTo(452+i*2.4,hem[i]);
  ctx.lineTo(480,262); ctx.closePath();
  ctx.fillStyle='#080a09'; ctx.fill();
  for (let i=0;i<4;i++){ const x=454+i*6; pxLine(ctx,x,0,x-4,259,i%2?'rgba(28,24,18,.55)':'rgba(4,5,4,.6)'); }
  pxLine(ctx,452,0,448,258,'rgba(120,168,164,.16)');
  pxLine(ctx,455,0,451,258,'rgba(210,158,96,.14)');
  // red cord / tassel on the curtain
  pxLine(ctx,465,0,463,120,PAL.redDark);
  pxLine(ctx,463,120,460,158,PAL.red);
  pxLine(ctx,461,126,466,132,PAL.redLit);
  r(ctx,459,158,3,4,PAL.redDark);
  for (let i=0;i<4;i++) pxLine(ctx,459+i,162,458+i*2,170,PAL.redDark);
  // grain on bottom sill
  for (let i=0;i<9;i++) pxLine(ctx,20+i*50,256,42+i*50,260,'rgba(60,42,26,.35)');
}
function pxPolyFromRect(ctx,x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(x,y,w,h); }

// ---------- table, food, candle, incense ----------
function drawIsoTable(ctx,t,anim=true){
  const a=iso(5.9,3.9), b=iso(9.1,3.9), c=iso(9.1,6.1), d=iso(5.9,6.1);
  const LIFT=23;
  const A=[a.x,a.y-LIFT], B=[b.x,b.y-LIFT], C=[c.x,c.y-LIFT], D=[d.x,d.y-LIFT];
  // far legs first, then near legs
  const leg=(x,y,lit)=>{
    pxPoly(ctx,[[x-2,y-LIFT+2],[x+3,y-LIFT+2],[x+3,y],[x-2,y]],PAL.woodDeep);
    pxLine(ctx,x-1,y-LIFT+3,x-1,y-1,PAL.woodDark);
    pxLine(ctx,x+1,y-LIFT+4,x+1,y-1,lit?PAL.woodLit:PAL.woodDark);
    pxLine(ctx,x+2,y-LIFT+4,x+2,y-1,'rgba(235,186,116,.22)');
    r(ctx,x-3,y-2,7,2,PAL.woodDeep);
    r(ctx,x-2,y-3,2,1,PAL.woodLit);
  };
  leg(a.x+1,a.y-1,false); leg(b.x-1,b.y-1,false);
  // side faces / apron (two visible planes)
  pxPoly(ctx,[[D[0],D[1]],[C[0],C[1]],[C[0],C[1]+9],[D[0],D[1]+9]],PAL.woodDark);
  pxPoly(ctx,[[B[0],B[1]],[C[0],C[1]],[C[0],C[1]+9],[B[0],B[1]+9]],PAL.woodDeep);
  // apron rail highlights and inset panel
  pxLine(ctx,D[0],D[1]+1,C[0],C[1]+1,PAL.woodLit);
  pxLine(ctx,D[0],D[1]+8,C[0],C[1]+8,PAL.woodDeep);
  pxLine(ctx,B[0],B[1]+1,C[0],C[1]+1,PAL.wood);
  pxLine(ctx,B[0],B[1]+8,C[0],C[1]+8,PAL.woodDeep);
  const ap0=[D[0]+6,D[1]+3], ap1=[C[0]-8,C[1]+3], ap2=[C[0]-8,C[1]+6], ap3=[D[0]+6,D[1]+6];
  pxPoly(ctx,[ap0,ap1,ap2,ap3],PAL.wood);
  pxLine(ctx,ap0[0],ap0[1],ap1[0],ap1[1],'rgba(210,162,96,.35)');
  // near legs over the apron shadow
  leg(d.x+1,d.y-1,true); leg(c.x-1,c.y-1,true);
  // a stretcher between the near legs
  pxLine(ctx,d.x+1,d.y-6,c.x-3,c.y-6,PAL.woodDark);
  pxLine(ctx,d.x+1,d.y-5,c.x-3,c.y-5,PAL.woodLit);
  // table top
  const top=[[A[0],A[1]],[B[0],B[1]],[C[0],C[1]],[D[0],D[1]]];
  pxPoly(ctx,top,PAL.woodTop);
  // plank seams, grain, knots
  for (let i=1;i<5;i++){
    const u=i/5;
    const p0=[A[0]+(B[0]-A[0])*u,A[1]+(B[1]-A[1])*u];
    const p1=[D[0]+(C[0]-D[0])*u,D[1]+(C[1]-D[1])*u];
    pxLine(ctx,p0[0],p0[1],p1[0],p1[1],'rgba(37,23,12,.48)');
    pxLine(ctx,p0[0]+1,p0[1],p1[0]+1,p1[1],'rgba(183,135,75,.10)');
  }
  for (let i=0;i<4;i++){
    const p0=[A[0]+8+i*10,A[1]+3+i*2];
    const p1=[D[0]+10+i*7,D[1]-2-i*2];
    pxLine(ctx,p0[0],p0[1],p1[0],p1[1],'rgba(30,19,10,.28)');
  }
  const knot=[A[0]+17,A[1]+6]; pxEllipse(ctx,knot[0],knot[1],2,1,PAL.woodDark);
  // warm/cold light on the tabletop (clipped to the top)
  ctx.save();
  ctx.beginPath(); ctx.moveTo(top[0][0],top[0][1]); for (let i=1;i<4;i++)ctx.lineTo(top[i][0],top[i][1]); ctx.closePath(); ctx.clip();
  glowEllipse(ctx,296,120,52,28,PAL.warmLit,0.17,'screen');
  glowEllipse(ctx,296,120,28,16,PAL.flame,0.10,'screen');
  glowEllipse(ctx,260,134,34,18,PAL.coolHi,0.07,'screen');
  ctx.restore();
  // edge highlights: thick top lip, warm toward the bulb
  pxLine(ctx,A[0]+1,A[1]+1,B[0]-1,B[1]-1,PAL.woodTopHi);
  pxLine(ctx,D[0]+1,D[1]-1,C[0]-1,C[1]-1,PAL.woodLit);
  pxLine(ctx,B[0]-1,B[1]+1,C[0]+1,C[1]-1,PAL.woodDeep);
  pxLine(ctx,A[0]+2,A[1]+2,B[0]-2,B[1]-2,'rgba(238,190,120,.20)');
  // red runner
  const r0=iso(6.15,4.55), r1=iso(8.85,4.55), r2=iso(8.85,5.5), r3=iso(6.15,5.5);
  const runner=[[r0.x,r0.y-LIFT],[r1.x,r1.y-LIFT],[r2.x,r2.y-LIFT],[r3.x,r3.y-LIFT]];
  pxPoly(ctx,runner,PAL.redDark);
  const runIn=shrinkQuad(runner,0.12);
  pxPoly(ctx,runIn,PAL.red);
  pxLine(ctx,runIn[0][0],runIn[0][1],runIn[1][0],runIn[1][1],PAL.redLit);
  pxLine(ctx,runIn[3][0],runIn[3][1],runIn[2][0],runIn[2][1],PAL.ochre);
  for (let i=0;i<3;i++){
    const q=iso(6.6+i*0.7,5.0);
    const qy=q.y-LIFT;
    pxPoly(ctx,[[q.x,qy-3],[q.x+3,qy],[q.x,qy+3],[q.x-3,qy]],i===1?PAL.ochre:PAL.redLit);
    r(ctx,q.x,qy,1,1,PAL.boneDim);
  }
  // red cloth spilling over the near edge, with heavy folds
  const cl=[[D[0]-3,D[1]+2],[C[0]+3,C[1]+2],[C[0]+2,C[1]+16],[D[0]-4,D[1]+16]];
  pxPoly(ctx,cl,PAL.redDark);
  const cl2=[[D[0]-2,D[1]+3],[C[0]+2,C[1]+3],[C[0]+1,C[1]+14],[D[0]-3,D[1]+14]];
  pxPoly(ctx,cl2,PAL.red);
  // cloth: dark folds, one thin lit edge, no solid bright panel
  for (let i=0;i<5;i++){
    const x0=D[0]+6+i*15;
    pxLine(ctx,x0,D[1]+3,x0-2,D[1]+15,PAL.redDeep);
    pxLine(ctx,x0+1,D[1]+4,x0-1,D[1]+13,'rgba(160,70,48,.20)');
  }
  pxLine(ctx,D[0]-2,D[1]+4,C[0]+2,C[1]+4,PAL.redLit);
  pxLine(ctx,D[0]-1,D[1]+5,C[0]+1,C[1]+5,'rgba(220,140,90,.18)');
  dithFill(ctx,cl,PAL.black,2,0.22);
  dithFill(ctx,[[D[0]-2,D[1]+10],[C[0]+2,C[1]+10],[C[0]+2,C[1]+15],[D[0]-3,D[1]+15]],PAL.redDeep,3,0.30);
  pxLine(ctx,D[0]-3,D[1]+16,C[0]+3,C[1]+16,PAL.redDark);
  // three hanging tongues of cloth
  for (let i=0;i<3;i++){
    const t0=D[0]+18+i*26, t1=t0+16;
    pxPoly(ctx,[[t0,D[1]+13],[t1,D[1]+13],[t1+2,D[1]+19],[t0-1,D[1]+19]],PAL.redDark);
    pxLine(ctx,t0,D[1]+13,t0-1,D[1]+19,PAL.red);
    pxLine(ctx,t1,D[1]+13,t1+2,D[1]+19,PAL.redLit);
  }
  dithFill(ctx,[[D[0]-4,D[1]+16],[C[0]+3,C[1]+16],[C[0]+5,C[1]+18],[D[0]-6,D[1]+18]],PAL.black,4,0.20);
  // food: big bowl, plate with fish, teapot, cup, candle, incense
  drawTableFood(ctx,t,anim);
}

function drawTableFood(ctx,t,anim=true){
  const LIFT=23;
  let chopShift=0;
  if (state.chapter===2 && state.hunt && state.hunt.layout){
    chopShift=state.hunt.layout===1?7:(state.hunt.layout===2?-6:0);
  }
  const at=(wx,wy)=>iso(wx,wy);
  // a dry ring on the tabletop, left of center: the bowl used to sit there
  const wr=at(6.55,4.45); const wrx=wr.x-8, wry=wr.y-LIFT-1;
  pxEllipse(ctx,wrx,wry,5,1.8,'rgba(160,190,180,.16)');
  pxEllipse(ctx,wrx,wry,4,1.2,PAL.woodTop);
  pxLine(ctx,wrx-3,wry-1,wrx+3,wry-1,'rgba(210,230,220,.20)');
  // big bowl of rice
  let p=at(6.55,4.65); let x=p.x, y=p.y-LIFT;
  dithEllipse(ctx,x+1,y+1,9,3,PAL.black,8,0.35);
  pxEllipse(ctx,x,y,9,3.4,PAL.black);
  pxEllipse(ctx,x,y-1,8,2.9,PAL.woodDeep);
  pxEllipse(ctx,x,y-2,7,2.4,PAL.boneDim);
  pxEllipse(ctx,x,y-3,6,1.9,'#e4d6b4');
  pxLine(ctx,x-6,y-3,x+5,y-3,PAL.paperHi);
  pxLine(ctx,x-7,y-1,x-6,y+1,PAL.redDark);
  for (let i=0;i<7;i++){ r(ctx,x-4+((i*7)%9),y-4+((i*3)%3),2,1,PAL.paper); }
  r(ctx,x+4,y-2,1,1,PAL.boneDim);
  r(ctx,x-1,y-4,2,1,'#c97a36'); // egg yolk / pickle
  r(ctx,x-2,y-4,1,1,'#e6a34e');
  pxLine(ctx,x-7+chopShift,y-1,x-10+chopShift,y-5,PAL.woodPale); // chopstick
  pxLine(ctx,x-7+chopShift,y,x-11+chopShift,y-3,PAL.woodLit);
  // plate with fish
  p=at(7.62,4.95); x=p.x; y=p.y-LIFT;
  dithEllipse(ctx,x+1,y+1,10,3,PAL.black,7,0.30);
  pxEllipse(ctx,x,y,9,2.8,PAL.woodDeep);
  pxEllipse(ctx,x,y-1,8,2,PAL.boneDim);
  pxEllipse(ctx,x,y-2,7,1.5,PAL.paper);
  pxEllipse(ctx,x-2,y-3,5,2,PAL.woodDark);
  pxEllipse(ctx,x-2,y-4,4,1.2,PAL.woodLit);
  pxLine(ctx,x-5,y-3,x-1,y-4,PAL.woodHi);
  pxPoly(ctx,[[x+3,y-4],[x+8,y-6],[x+9,y-2],[x+4,y-2]],PAL.woodDark);
  pxPoly(ctx,[[x+4,y-4],[x+7,y-5],[x+7,y-3],[x+4,y-3]],PAL.woodLit);
  r(ctx,x-1,y-4,1,1,PAL.black);
  r(ctx,x-2,y-5,1,1,PAL.paperDim);
  pxLine(ctx,x-4,y-2,x+3,y-2,'#6f9a4e');
  pxLine(ctx,x+1,y-5,x+4,y-6,'#86a95c');
  // brass / clay teapot
  p=at(6.28,5.35); x=p.x; y=p.y-LIFT;
  dithEllipse(ctx,x+1,y+1,8,3,PAL.black,7,0.32);
  pxEllipse(ctx,x,y-2,7,4,PAL.brassDark);
  pxEllipse(ctx,x,y-3,6,3,PAL.brass);
  pxEllipse(ctx,x,y-5,4,1.5,PAL.brassLit);
  pxLine(ctx,x+5,y-5,x+8,y-7,PAL.brass);
  pxLine(ctx,x-6,y-4,x-9,y-2,PAL.brassDark);
  pxLine(ctx,x-6,y-2,x-9,y-1,PAL.brass);
  pxLine(ctx,x+2,y-7,x+5,y-8,PAL.brassLit);
  r(ctx,x,y-8,1,1,PAL.brassHi);
  pxLine(ctx,x-4,y-3,x-4,y-1,PAL.brassLit);
  // cup
  p=at(8.42,5.0); x=p.x; y=p.y-LIFT;
  dithEllipse(ctx,x+1,y+1,4,2,PAL.black,6,0.30);
  r(ctx,x-2,y-5,5,4,PAL.boneDim); r(ctx,x-1,y-6,3,1,PAL.paper);
  pxLine(ctx,x+2,y-4,x+3,y-3,PAL.bone);
  pxLine(ctx,x-2,y-4,x-2,y-2,PAL.paper);
  pxLine(ctx,x-1,y-4,x+1,y-4,PAL.red);
  // little dish of orange fruit
  p=at(8.42,5.62); x=p.x; y=p.y-LIFT;
  pxEllipse(ctx,x,y+1,7,2.2,PAL.woodDeep);
  pxEllipse(ctx,x,y,6,1.6,PAL.redDark);
  pxEllipse(ctx,x-2,y-2,2.5,2,PAL.ochre); pxEllipse(ctx,x-3,y-2,1.5,1,'#e6a34e');
  pxEllipse(ctx,x+2,y-2,2.2,1.8,'#b65a2d'); pxEllipse(ctx,x+2,y-3,1,1,'#e0a05a');
  r(ctx,x-3,y-3,1,1,PAL.flameHi); r(ctx,x+2,y-3,1,1,PAL.flameHi);
  // steam above the rice and tea
  if (anim){
    for (let i=0;i<5;i++){
      const qx=at(6.55,4.65).x+Math.sin(t*1.3+i*1.8)*2;
      const qy=at(6.55,4.65).y-LIFT-5-i*2-Math.round((t*3)%3);
      ctx.globalAlpha=0.16-i*0.02; r(ctx,Math.round(qx),qy,1,1,PAL.paperHi); ctx.globalAlpha=1;
    }
  }
  // candle in a small red dish
  const cd=at(7.15,4.82);
  const cx=cd.x, cy=cd.y-LIFT;
  dithEllipse(ctx,cx+1,cy+2,7,2,PAL.black,7,0.28);
  pxEllipse(ctx,cx,cy+2,5,1.8,PAL.brassDark);
  pxEllipse(ctx,cx,cy+1,4,1.4,PAL.brass);
  pxPoly(ctx,[[cx-2,cy+1],[cx+2,cy+1],[cx+2,cy-6],[cx-2,cy-6]],PAL.red);
  pxLine(ctx,cx-1,cy,cx-0.5,cy-5,PAL.redLit);
  // drips
  r(ctx,cx-3,cy-4,1,2,PAL.redHi); r(ctx,cx+2,cy-2,1,2,PAL.redLit);
  r(ctx,cx-1,cy-8,2,2,PAL.boneDim);
  if (anim){
    const fl=2+Math.round(1+(0.5+0.5*Math.sin(t*15.3))*1.4);
    r(ctx,cx-1,cy-8-fl,2,fl,PAL.flame);
    r(ctx,cx,cy-9-fl,1,Math.max(1,fl-1),PAL.flameLit);
    r(ctx,cx,cy-9-fl,1,1,PAL.flameHi);
    dithEllipse(ctx,cx,cy-11,10,9,PAL.flame,3,0.10,'screen');
  } else {
    r(ctx,cx-1,cy-9,1,1,PAL.ink);
  }
  // incense burner + sticks + smoke
  const inc=at(8.12,4.45);
  const ix=inc.x, iy=inc.y-LIFT;
  dithEllipse(ctx,ix+1,iy+2,6,2,PAL.black,7,0.28);
  pxEllipse(ctx,ix,iy+2,5,1.8,PAL.brassDark);
  pxEllipse(ctx,ix,iy+1,4,1.4,PAL.brass);
  pxEllipse(ctx,ix,iy+1,2.5,0.8,PAL.woodDeep);
  // sticks are drawn live in drawTableDynamics so the ritual can change their count
  // old woman's side of the table: a folded cloth
  const cl=at(8.72,5.48); const clx=cl.x, cly=cl.y-LIFT;
  pxPoly(ctx,[[clx-7,cly],[clx+2,cly-2],[clx+6,cly+2],[clx-3,cly+4]],PAL.paperDim);
  pxLine(ctx,clx-6,cly,clx+4,cly+2,PAL.paper);
  pxLine(ctx,clx-5,cly+2,clx+3,cly+3,PAL.boneDim);
}

// ---------- old woman, chair, shawl, face, cane ----------
function drawIsoOldWoman(ctx,t){
  const p=iso(8.5,2.5);
  ctx.save(); ctx.translate(p.x+8,p.y-2);
  const breathe=Math.sin(t*0.9)>0.4?0:0;
  drawChair(ctx);
  drawOldWomanBody(ctx,t,breathe);
  drawCane(ctx);
  ctx.restore();
}

function drawChair(ctx){
  // back posts
  for (const x of [-15,14]){
    pxPoly(ctx,[[x-1,-63],[x+3,-63],[x+3,-17],[x-1,-17]],PAL.woodDark);
    pxLine(ctx,x+2,-62,x+2,-18,PAL.woodLit);
    pxLine(ctx,x-1,-62,x-1,-18,PAL.woodDeep);
    r(ctx,x-1,-66,5,4,PAL.wood); r(ctx,x,-66,3,2,PAL.woodHi);
  }
  // solid carved back panel (keeps the silhouette readable)
  pxPoly(ctx,[[-15,-62],[16,-61],[16,-31],[-15,-32]],PAL.woodDark);
  pxPoly(ctx,[[-13,-60],[14,-59],[14,-33],[-13,-34]],PAL.wood);
  pxPoly(ctx,[[-10,-57],[11,-56],[11,-40],[-10,-41]],PAL.woodDark);
  pxLine(ctx,-10,-57,11,-56,'rgba(214,166,98,.34)');
  pxLine(ctx,-9,-44,10,-43,'rgba(214,166,98,.20)');
  pxLine(ctx,13,-59,13,-34,'rgba(245,197,135,.30)');
  pxLine(ctx,-14,-59,-14,-34,'rgba(110,165,160,.16)');
  // top rail
  pxPoly(ctx,[[-16,-64],[17,-63],[17,-59],[-16,-60]],PAL.wood);
  pxLine(ctx,-16,-64,17,-63,PAL.woodHi);
  // old red cushion over the top rail
  pxPoly(ctx,[[-14,-60],[14,-59],[13,-55],[-13,-56]],PAL.redDark);
  pxLine(ctx,-13,-59,13,-58,PAL.red);
  pxLine(ctx,-12,-57,12,-56,PAL.redLit);
  // seat
  pxPoly(ctx,[[-17,-26],[-1,-18],[18,-26],[1,-33]],PAL.woodDark);
  pxPoly(ctx,[[-15,-26],[0,-20],[16,-26],[1,-31]],PAL.wood);
  pxLine(ctx,-15,-26,0,-20,PAL.woodHi);
  pxLine(ctx,0,-20,16,-26,PAL.redLit);
  // front legs / back legs
  for (const x of [-13,13]){
    pxPoly(ctx,[[x-1,-21],[x+2,-21],[x+1,-1],[x-2,-1]],PAL.woodDeep);
    pxLine(ctx,x,-20,x-1,-2,PAL.woodDark);
    pxLine(ctx,x+1,-20,x,-3,PAL.woodLit);
    r(ctx,x-2,-2,4,2,PAL.woodDeep);
  }
  for (const x of [-10,9]){
    pxPoly(ctx,[[x-1,-28],[x+2,-28],[x+1,-2],[x-2,-2]],PAL.woodDeep);
    pxLine(ctx,x+1,-27,x,-3,'rgba(148,106,62,.18)');
  }
  // armrests
  pxLine(ctx,-15,-38,-12,-22,PAL.woodDark); pxLine(ctx,-14,-38,-11,-23,PAL.woodLit);
  pxLine(ctx,14,-38,12,-22,PAL.woodDark); pxLine(ctx,15,-38,13,-23,PAL.woodLit);
  r(ctx,-16,-40,4,3,PAL.wood); r(ctx,14,-40,4,3,PAL.wood);
  // warm/cold rims
  pxLine(ctx,16,-60,14,-19,'rgba(240,190,120,.25)');
  pxLine(ctx,-16,-60,-14,-19,'rgba(120,175,170,.14)');
}

function drawOldWomanBody(ctx,t){
  // lap / skirt under the shawl
  pxPoly(ctx,[[-14,-23],[14,-22],[12,-6],[-12,-6]],PAL.grayDeep);
  pxPoly(ctx,[[-11,-21],[11,-20],[9,-8],[-9,-8]],PAL.gray);
  for (let i=0;i<3;i++) pxLine(ctx,-7+i*7,-20,-6+i*7,-8,PAL.grayDeep);
  // shoes
  r(ctx,-9,-4,6,3,PAL.black); r(ctx,3,-4,6,3,PAL.black);
  r(ctx,-9,-4,4,1,PAL.woodDark); r(ctx,3,-4,4,1,PAL.woodDark);
  // shawl silhouette: a hunched, solid shape
  const shawl=[[-17,-26],[-15,-43],[-9,-49],[-2,-51],[8,-50],[15,-45],[17,-27],[12,-12],[-11,-12]];
  pxPoly(ctx,shawl,PAL.black);
  pxPoly(ctx,[[-15,-28],[-13,-43],[-8,-47],[-1,-49],[8,-48],[13,-43],[15,-28],[10,-15],[-9,-15]],PAL.jacketDark);
  pxPoly(ctx,[[-13,-29],[-11,-42],[-5,-46],[2,-47],[9,-46],[13,-41],[14,-30],[9,-17],[-8,-17]],PAL.jacket);
  // few broad folds, not a striped cage
  for (const x of [-9,0,8]){
    pxLine(ctx,x,-45,x-4,-17,'rgba(6,12,15,.52)');
    pxLine(ctx,x+1,-44,x-3,-18,'rgba(96,128,134,.16)');
  }
  // warm shoulder plane and cool left rim
  dithFill(ctx,[[3,-47],[13,-43],[14,-30],[7,-33]],PAL.jacketLit,3,0.18,'screen');
  dithFill(ctx,[[-14,-42],[-9,-47],[-8,-30],[-13,-28]],PAL.cool,2,0.14,'screen');
  pxLine(ctx,-14,-43,-9,-48,PAL.jacketDark);
  pxLine(ctx,8,-47,13,-42,PAL.jacketLit);
  pxLine(ctx,11,-44,14,-30,'rgba(245,197,135,.30)');
  // collar / shoulder line
  pxLine(ctx,-9,-46,0,-49,PAL.jacketLit);
  pxLine(ctx,0,-49,9,-46,'rgba(225,179,116,.34)');
  // shawl edge (thin red ochre border) + woven dashes
  pxLine(ctx,-15,-27,-11,-13,PAL.jacketDark);
  pxLine(ctx,12,-28,9,-14,PAL.jacket);
  pxLine(ctx,-14,-26,-10,-14,PAL.jacketLit);
  for (let i=0;i<4;i++){ r(ctx,-12+i*7,-13,2,2,i%2?PAL.redDark:PAL.grayDeep); r(ctx,-13+i*6,-20,2,1,i%2?PAL.clothOchre:'rgba(120,110,88,.45)'); }
  // neck + high faded-blue collar
  pxPoly(ctx,[[-4,-51],[4,-51],[4,-45],[-4,-45]],PAL.skinDark);
  pxLine(ctx,-3,-50,3,-50,PAL.skin);
  pxPoly(ctx,[[-8,-46],[8,-45],[7,-50],[0,-53],[-7,-50]],PAL.jacketDark);
  pxLine(ctx,-7,-47,7,-46,PAL.jacketLit);
  pxLine(ctx,-6,-49,5,-48,PAL.jacket);
  pxLine(ctx,-6,-46,5,-45,PAL.thread);
  for (let i=0;i<3;i++) r(ctx,-1,-42+i*4,2,2,i===1?PAL.brass:PAL.brassDark);
  // right hand on the lap, fingers a little too long
  pxPoly(ctx,[[6,-30],[12,-29],[11,-23],[5,-24]],PAL.skinDark);
  pxEllipse(ctx,8,-25,4,2.5,PAL.skin);
  for (let i=0;i<4;i++){ const fx=6.2+i*1.5; pxLine(ctx,fx,-24,fx-0.6,-20,PAL.skinDark); r(ctx,fx-0.6,-20,1,1,PAL.skin); }
  pxLine(ctx,6,-25,10,-26,PAL.skinLit);
  r(ctx,7,-24,1,1,PAL.skinHi);
  // left sleeve reaching to the table (hand drawn after the table)
  pxPoly(ctx,[[-14,-42],[-18,-39],[-19,-28],[-14,-26],[-11,-38]],PAL.grayDeep);
  pxLine(ctx,-17,-40,-18,-29,PAL.gray);
  pxLine(ctx,-14,-41,-15,-28,'rgba(220,175,115,.20)');
  r(ctx,-18,-27,5,2,PAL.grayDeep);
  // head outline / hair
  const sway=Math.sin(t*0.8)>0.65?1:0;
  ctx.save(); ctx.translate(0,sway);
  pxEllipse(ctx,0,-54,9,10,PAL.black);
  pxEllipse(ctx,0,-54,7,8,PAL.grayDeep);
  pxEllipse(ctx,0,-55,8,8,PAL.gray);
  // hair mass / bun, with a clear dark silhouette behind the silver
  pxEllipse(ctx,-1,-58,7,5,PAL.gray);
  pxEllipse(ctx,0,-60,5,2.5,PAL.grayLit);
  pxEllipse(ctx,-4,-57,5,2,'rgba(40,38,33,.45)');
  pxEllipse(ctx,7,-58,4,3.2,PAL.grayDeep);
  pxEllipse(ctx,7.5,-58,3,2.4,PAL.gray);
  pxEllipse(ctx,8,-59,1.8,1.3,PAL.grayHi);
  r(ctx,10,-60,1,3,PAL.grayDeep);
  // hairpin
  pxLine(ctx,5,-61,11,-63,PAL.brass);
  r(ctx,11,-63,2,1,PAL.brassHi);
  // face: warmer, lit from the right
  pxEllipse(ctx,0,-53,6,7,PAL.skinDeep);
  pxEllipse(ctx,0,-53,5,6,PAL.skin);
  pxPoly(ctx,[[-5,-55],[-4,-49],[-2,-45],[2,-45],[5,-49],[5,-55],[1,-58],[-3,-58]],PAL.skin);
  pxPoly(ctx,[[0,-56],[5,-55],[5,-49],[2,-45],[0,-45]],PAL.skinLit);
  // cool/warm face planes
  dithFill(ctx,[[-6,-59],[-1,-59],[-1,-45],[-5,-47]],PAL.skinDark,3,0.50);
  pxLine(ctx,4,-57,5,-48,'rgba(250,205,145,.55)');
  pxLine(ctx,0,-58,4,-57,'rgba(250,205,145,.25)');
  // eye sockets, brows, eyes
  pxLine(ctx,-4,-55,-2,-55,'rgba(70,44,32,.65)');
  pxLine(ctx,2,-55,4,-55,'rgba(70,44,32,.65)');
  pxLine(ctx,-4,-56,-2,-56,PAL.grayDeep);
  pxLine(ctx,2,-56,4,-56,PAL.grayDeep);
  // one milky eye, one dark; the milky one has a pinprick pupil
  r(ctx,-4,-54,2,1,PAL.eyeMilk); r(ctx,-4,-54,1,1,PAL.white);
  r(ctx,3,-54,2,1,PAL.eyeDark); r(ctx,3,-54,1,1,PAL.black);
  r(ctx,-3,-53,1,1,PAL.eyeDark);
  r(ctx,4,-53,1,1,PAL.skinHi);
  // nose, folds, mouth
  pxLine(ctx,0,-54,0,-50,PAL.skinDeep);
  r(ctx,0,-50,2,1,PAL.skinDeep);
  pxLine(ctx,-4,-49,-3,-46,PAL.skinDeep);
  pxLine(ctx,4,-49,3,-46,PAL.skinDeep);
  pxLine(ctx,-3,-46,3,-46,'#2a1814');
  pxLine(ctx,-4,-47,-3,-46,'#2a1814');
  pxLine(ctx,4,-47,3,-46,'#2a1814');
  r(ctx,-2,-45,1,1,'#4a2a22');
  r(ctx,3,-47,1,1,'rgba(120,78,58,.45)');
  r(ctx,-4,-47,1,1,'rgba(120,78,58,.35)');
  // forehead / chin / cheek wrinkles
  pxLine(ctx,-3,-59,3,-59,'rgba(80,52,38,.45)');
  pxLine(ctx,-2,-57,2,-57,'rgba(80,52,38,.30)');
  pxLine(ctx,-3,-47,0,-46,'rgba(80,52,38,.30)');
  pxLine(ctx,2,-47,4,-48,'rgba(80,52,38,.24)');
  r(ctx,-5,-49,1,1,PAL.skinDark); r(ctx,5,-49,1,1,PAL.skinDark);
  // ear + earring
  pxEllipse(ctx,-7,-53,1.5,2,PAL.skinDark);
  r(ctx,-8,-52,1,1,PAL.brass);
  // gray wisps
  pxLine(ctx,-7,-57,-9,-58,PAL.grayLit);
  pxLine(ctx,6,-57,8,-57,PAL.grayHi);
  // rim
  pxLine(ctx,6,-60,7,-47,'rgba(245,197,135,.36)');
  pxLine(ctx,-7,-59,-8,-48,'rgba(126,178,172,.20)');
  ctx.restore();
}

function drawOldWomanTableHand(ctx,t){
  const p=iso(8.5,2.5);
  const hx=p.x-19, hy=p.y-10;
  // little tea cup under the hand, so the hand has a reason to be here
  const cx=hx-4, cy=hy+1;
  dithEllipse(ctx,cx+1,cy+2,6,2,PAL.black,9,0.30);
  pxEllipse(ctx,cx,cy+2,5,1.6,PAL.woodDeep);
  pxPoly(ctx,[[cx-3,cy+2],[cx+3,cy+2],[cx+2,cy-4],[cx-2,cy-4]],PAL.boneDim);
  pxLine(ctx,cx-3,cy+1,cx+3,cy+1,PAL.bone);
  pxLine(ctx,cx-2,cy-3,cx+2,cy-3,PAL.paper);
  pxLine(ctx,cx-2,cy-1,cx+1,cy-1,'#4b2a1c');
  pxLine(ctx,cx-3,cy-4,cx+3,cy-4,PAL.woodDark);
  r(ctx,cx-1,cy-2,1,1,'#d8a15c');
  // steam from the cup
  for (let i=0;i<4;i++){
    ctx.globalAlpha=0.16-i*0.02;
    r(ctx,Math.round(cx+Math.sin(t*1.4+i*1.6)*2),cy-6-i*2,1,1,PAL.paperHi);
    ctx.globalAlpha=1;
  }
  // hand shadow on the tabletop
  dithEllipse(ctx,hx+1,hy+2,7,2,PAL.black,9,0.34);
  // cuff
  pxPoly(ctx,[[hx+5,hy-1],[hx+10,hy-2],[hx+11,hy+2],[hx+6,hy+3]],PAL.grayDeep);
  pxLine(ctx,hx+6,hy-1,hx+10,hy-2,PAL.gray);
  // aged hand, fingers curled around the cup
  pxEllipse(ctx,hx,hy,5.5,3,PAL.skinDark);
  pxEllipse(ctx,hx-1,hy-1,4.5,2.4,PAL.skin);
  pxLine(ctx,hx-4,hy,hx+3,hy-1,PAL.skinLit);
  for (let i=0;i<4;i++){
    const fx=hx-4+i*2.6;
    pxLine(ctx,fx,hy,fx-2,hy+2,PAL.skinDark);
    pxLine(ctx,fx,hy,fx-2,hy+1,PAL.skin);
    r(ctx,fx-3,hy+2,1,1,PAL.skinHi);
  }
  // thumb / gold ring
  pxLine(ctx,hx+2,hy-2,hx+4,hy+1,PAL.skinDark);
  pxLine(ctx,hx+1,hy-2,hx+3,hy+1,PAL.skinLit);
  ctx.strokeStyle=PAL.brass; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(hx+3,hy-1,2,0,Math.PI*2); ctx.stroke();
  pxLine(ctx,hx-4,hy-2,hx-1,hy-2,'rgba(240,200,150,.25)');
}

function drawCane(ctx){
  // old woman's cane leaning by the chair
  pxLine(ctx,20,-25,29,0,PAL.woodDeep,2);
  pxLine(ctx,21,-25,30,0,PAL.wood,1);
  pxLine(ctx,21,-24,29,-1,PAL.woodLit);
  ctx.strokeStyle=PAL.woodDark; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(19,-26,4,Math.PI*0.9,Math.PI*2.15); ctx.stroke();
  pxLine(ctx,16,-27,17,-27,PAL.brassHi);
  pxLine(ctx,28,0,32,0,PAL.black);
  dithEllipse(ctx,30,1,5,2,PAL.black,7,0.30);
}

// ---------- Xie: four-direction idle / walk sprites ----------
function drawXie(ctx,x,y,dir,walk,moving,t,front,handRaised){
  const d=front?'S':dir;
  const frame=moving?Math.floor(walk)%4:0;
  const step=frame===1?1:frame===3?-1:0;
  const bob=moving&&step!==0?-1:0;
  const blink=((t+0.9)%4.6)<0.12;
  ctx.save();
  ctx.translate(Math.round(x),Math.round(y+bob));
  // contact shadow, shifted away from the bulb
  const shx=Math.max(-6,Math.min(6,Math.round((x-288)/22)));
  dithEllipse(ctx,shx,2,14,4.8,PAL.black,10,0.40);
  glowEllipse(ctx,shx,2,8,2.6,PAL.black,0.28);
  // the wrong shadow: a hunched old-woman silhouette with a bun and a second head
  ctx.save(); ctx.globalAlpha=0.22; ctx.fillStyle=PAL.black;
  ctx.beginPath(); ctx.moveTo(shx-13,2); ctx.lineTo(shx-9,-3); ctx.quadraticCurveTo(shx-2,-11,shx+7,-4); ctx.lineTo(shx+11,2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(shx-4,-7,2.8,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(shx+6,-6,2.1,0,7); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.scale(1.08,1.08);
  if (d==='S') drawXieFront(ctx,step,blink,handRaised,walk,moving);
  else if (d==='N') drawXieBack(ctx,step,handRaised,walk,moving);
  else {
    ctx.save();
    if (d==='W') ctx.scale(-1,1);
    drawXieProfile(ctx,step,blink,handRaised,walk,moving);
    ctx.restore();
  }
  // fixed warm/cold silhouette rims
  ctx.globalAlpha=0.70;
  pxLine(ctx,8,-39,8,-24,'rgba(245,195,125,.55)');
  pxLine(ctx,9,-53,8,-47,'rgba(245,195,125,.35)');
  pxLine(ctx,-8,-40,-8,-26,'rgba(125,180,176,.32)');
  pxLine(ctx,-8,-54,-8,-48,'rgba(125,180,176,.25)');
  // cold corpse-blue rim: separate the girl's back from the soot
  pxLine(ctx,7,-41,7,-25,'rgba(86,146,168,.58)');
  pxLine(ctx,6,-55,6,-46,'rgba(86,146,168,.40)');
  pxLine(ctx,-9,-38,-9,-26,'rgba(70,120,140,.26)');
  // cold rim on the hair strands
  pxLine(ctx,5,-58,4,-52,'rgba(86,146,168,.50)');
  pxLine(ctx,-6,-56,-7,-50,'rgba(86,146,168,.32)');
  r(ctx,3,-57,1,1,'rgba(150,200,210,.55)');
  ctx.globalAlpha=1;
  ctx.restore();
  ctx.restore();
}

function drawXieFront(ctx,step,blink,handRaised,walk,moving){
  // legs / shoes
  const lf=step>0?1:0, rf=step<0?1:0;
  pxPoly(ctx,[[-5,-13+lf],[-2,-13+lf],[-2,-1],[-5,-1]],PAL.woodDeep);
  pxPoly(ctx,[[1,-13+rf],[4,-13+rf],[4,-1],[1,-1]],PAL.woodDeep);
  pxLine(ctx,-4,-12+lf,-4,-2,PAL.grayDeep);
  pxLine(ctx,3,-12+rf,3,-2,PAL.grayDeep);
  r(ctx,-6,-2+ (lf?0:2),5,2,PAL.black);
  r(ctx,1,-2+ (rf?0:2),5,2,PAL.black);
  r(ctx,-6,-2+(lf?0:2),4,1,PAL.grayDark);
  r(ctx,1,-2+(rf?0:2),4,1,PAL.grayDark);
  // skirt
  pxPoly(ctx,[[-8,-27],[8,-27],[9,-11],[-9,-11]],PAL.black);
  pxPoly(ctx,[[-7,-26],[7,-26],[8,-12],[-8,-12]],PAL.redDark);
  pxPoly(ctx,[[-7,-26],[8,-26],[8,-12],[-8,-12]],PAL.red);
  pxPoly(ctx,[[-7,-25],[-1,-25],[-1,-12],[-8,-12]],PAL.redDark);
  pxPoly(ctx,[[5,-25],[8,-25],[8,-13],[5,-13]],PAL.redLit);
  pxLine(ctx,-7,-26,7,-26,PAL.redHi);
  pxLine(ctx,-8,-12,8,-12,PAL.redLit);
  for (const x of [-3,1,4]) pxLine(ctx,x,-24,x+(x<0?-1:1),-13,PAL.redDeep);
  pxLine(ctx,5,-24,6,-13,PAL.redHi);
  r(ctx,-2,-11,4,1,PAL.black);
  // blouse
  pxPoly(ctx,[[-7,-41],[7,-41],[7,-26],[-7,-26]],PAL.black);
  pxPoly(ctx,[[-6,-40],[6,-40],[6,-27],[-6,-27]],PAL.paper);
  pxPoly(ctx,[[-6,-40],[-1,-40],[-1,-27],[-6,-27]],PAL.boneDim);
  pxPoly(ctx,[[1,-40],[6,-40],[6,-28],[1,-28]],PAL.paperHi);
  pxLine(ctx,5,-39,6,-28,PAL.bone);
  pxLine(ctx,0,-39,0,-27,PAL.boneDim);
  r(ctx,0,-36,1,1,PAL.woodDark); r(ctx,0,-32,1,1,PAL.woodDark);
  pxLine(ctx,-4,-29,-2,-27,PAL.boneDim);
  pxLine(ctx,3,-29,4,-27,PAL.boneDim);
  // collar / neck
  pxPoly(ctx,[[-3,-41],[0,-38],[3,-41],[2,-42],[-2,-42]],PAL.paper);
  pxLine(ctx,-3,-41,0,-37,PAL.boneDim);
  r(ctx,-2,-43,4,3,PAL.skinDark); r(ctx,-1,-43,2,2,PAL.skin);
  // short sleeves
  pxPoly(ctx,[[-9,-40],[-6,-41],[-5,-34],[-8,-33]],PAL.boneDim);
  pxPoly(ctx,[[6,-41],[9,-40],[8,-33],[5,-34]],PAL.bone);
  // arms
  const swing=step*1;
  if (handRaised){
    // left arm hangs, right arm lifted clear of the head, taped hand to camera
    pxPoly(ctx,[[-8,-36],[-5,-36],[-5,-24],[-8,-24]],PAL.skinDark);
    pxPoly(ctx,[[-7,-35],[-5,-35],[-5,-25],[-7,-25]],PAL.skin);
    r(ctx,-8,-25,3,3,PAL.skinLit);
    pxPoly(ctx,[[5,-38],[8,-39],[11,-43],[9,-45]],PAL.skinDark);
    pxPoly(ctx,[[6,-37],[8,-38],[10,-42],[8,-44]],PAL.skin);
    pxPoly(ctx,[[8,-43],[11,-43],[11,-47],[8,-47]],PAL.skinLit);
    pxPoly(ctx,[[7,-47],[13,-47],[13,-51],[7,-51]],PAL.woodDeep);
    pxPoly(ctx,[[8,-47],[12,-47],[12,-50],[8,-50]],PAL.white);
    pxLine(ctx,9,-49,11,-49,PAL.gray);
    pxLine(ctx,8,-48,11,-48,PAL.paperHi);
    pxLine(ctx,8,-45,10,-45,PAL.skinHi);
    // fingers
    r(ctx,11,-49,1,2,PAL.paper);
    r(ctx,9,-51,1,1,PAL.paper);
  } else {
    pxPoly(ctx,[[-10,-38],[-5,-38],[-5,-23+swing],[-10,-23+swing]],PAL.woodDeep);
    pxPoly(ctx,[[-9,-37],[-6,-37],[-6,-24+swing],[-9,-24+swing]],PAL.skinDark);
    pxPoly(ctx,[[-8,-36],[-6,-36],[-6,-25+swing],[-8,-25+swing]],PAL.skin);
    r(ctx,-9,-24+swing,3,2,PAL.boneDim);
    r(ctx,-9,-22+swing,3,3,PAL.skinLit);
    r(ctx,-8,-21+swing,1,1,PAL.skinHi);
    pxPoly(ctx,[[5,-38],[10,-38],[10,-23-swing],[5,-23-swing]],PAL.woodDeep);
    pxPoly(ctx,[[6,-37],[9,-37],[9,-24-swing],[6,-24-swing]],PAL.skinDark);
    pxPoly(ctx,[[6,-36],[8,-36],[8,-25-swing],[6,-25-swing]],PAL.skin);
    r(ctx,6,-24-swing,3,2,PAL.boneDim);
    r(ctx,6,-22-swing,3,3,PAL.skinLit);
    r(ctx,7,-21-swing,2,2,PAL.white);
    pxLine(ctx,6,-24-swing,8,-24-swing,PAL.gray);
  }
  // head
  pxEllipse(ctx,0,-49,7,8,PAL.black);
  pxEllipse(ctx,0,-49,6,7,PAL.skin);
  pxEllipse(ctx,0,-49,5,6,PAL.skinLit);
  pxPoly(ctx,[[-5,-52],[5,-52],[4,-56],[-4,-56]],PAL.skin);
  pxPoly(ctx,[[-3,-51],[1,-51],[0,-56],[-4,-55]],PAL.skinDark);
  r(ctx,5,-50,1,2,PAL.skin);
  r(ctx,-6,-50,1,2,PAL.skinDark);
  // hair
  pxEllipse(ctx,0,-54,7,5,PAL.black);
  pxEllipse(ctx,0,-55,6,4,'#18130e');
  pxEllipse(ctx,-1,-56,4,2,'#2a2119');
  pxPoly(ctx,[[-8,-53],[-5,-53],[-5,-42],[-8,-43]],PAL.black);
  pxPoly(ctx,[[5,-53],[8,-53],[8,-43],[5,-42]],PAL.black);
  pxLine(ctx,-6,-54,-5,-44,PAL.woodDeep);
  pxLine(ctx,5,-54,5,-44,PAL.woodDeep);
  // fringe
  pxPoly(ctx,[[-5,-54],[5,-54],[4,-51],[3,-53],[1,-51],[-1,-53],[-3,-51],[-4,-53]],PAL.black);
  // face marks
  if (!blink){
    pxLine(ctx,-4,-50,-3,-50,PAL.black); pxLine(ctx,2,-50,3,-50,PAL.black);
    r(ctx,-3,-50,1,1,PAL.skinHi); r(ctx,2,-50,1,1,PAL.skinHi);
  } else {
    pxLine(ctx,-4,-50,-2,-50,PAL.woodDeep);
    pxLine(ctx,2,-50,4,-50,PAL.woodDeep);
  }
  pxLine(ctx,-4,-52,-2,-52,PAL.woodDeep);
  pxLine(ctx,2,-52,4,-52,PAL.woodDeep);
  pxLine(ctx,-4,-48,-3,-48,'rgba(120,78,58,.40)');
  pxLine(ctx,2,-48,4,-48,'rgba(120,78,58,.35)');
  r(ctx,0,-48,1,1,PAL.skinDark);
  pxLine(ctx,0,-47,1,-47,PAL.skinDeep);
  pxLine(ctx,-1,-45,2,-45,'#6a2c24');
  r(ctx,0,-44,1,1,PAL.skinLit);
  // hair shine / red tie
  pxLine(ctx,-3,-57,1,-58,'rgba(140,112,78,.65)');
  pxLine(ctx,-6,-55,-5,-46,'rgba(90,68,48,.40)');
  pxLine(ctx,1,-58,4,-56,'rgba(160,126,88,.42)');
  r(ctx,6,-51,1,1,PAL.red);
  // warm/cold face rim
  pxLine(ctx,5,-55,6,-46,'rgba(240,190,120,.28)');
  pxLine(ctx,-6,-55,-7,-46,'rgba(120,175,172,.18)');
}

function drawXieBack(ctx,step,handRaised,walk,moving){
  const lf=step>0?1:0, rf=step<0?1:0;
  pxPoly(ctx,[[-5,-13+lf],[-2,-13+lf],[-2,-1],[-5,-1]],PAL.woodDeep);
  pxPoly(ctx,[[1,-13+rf],[4,-13+rf],[4,-1],[1,-1]],PAL.woodDeep);
  r(ctx,-6,-2+(lf?0:2),5,2,PAL.black); r(ctx,1,-2+(rf?0:2),5,2,PAL.black);
  // skirt
  pxPoly(ctx,[[-8,-27],[8,-27],[9,-11],[-9,-11]],PAL.black);
  pxPoly(ctx,[[-7,-26],[7,-26],[8,-12],[-8,-12]],PAL.redDark);
  pxPoly(ctx,[[-6,-26],[6,-26],[7,-13],[-7,-13]],PAL.red);
  pxPoly(ctx,[[-7,-25],[-1,-25],[-1,-12],[-8,-12]],PAL.redDark);
  pxLine(ctx,-7,-26,7,-26,PAL.redHi);
  pxLine(ctx,-8,-12,8,-12,PAL.redDark);
  for (const x of [-4,-1,2,5]) pxLine(ctx,x,-24,x,-13,PAL.redDeep);
  // blouse back
  pxPoly(ctx,[[-7,-41],[7,-41],[7,-26],[-7,-26]],PAL.black);
  pxPoly(ctx,[[-6,-40],[6,-40],[6,-27],[-6,-27]],PAL.boneDim);
  pxPoly(ctx,[[-6,-40],[6,-40],[6,-38],[-6,-38]],PAL.paperHi);
  pxPoly(ctx,[[-6,-30],[6,-30],[6,-27],[-6,-27]],PAL.bone);
  pxLine(ctx,0,-39,0,-28,PAL.boneDim);
  for (let i=0;i<3;i++) pxLine(ctx,-5+i*5,-37,-6+i*5,-29,'rgba(126,110,84,.30)');
  // nape / collar
  r(ctx,-2,-43,4,4,PAL.skinDark); r(ctx,-1,-43,2,2,PAL.skin);
  pxLine(ctx,-4,-41,4,-41,PAL.paper);
  // arms
  const swing=step*1;
  if (handRaised){
    pxPoly(ctx,[[-8,-37],[-5,-37],[-5,-24],[-8,-24]],PAL.skinDark);
    pxPoly(ctx,[[-7,-36],[-5,-36],[-5,-25],[-7,-25]],PAL.skin);
    r(ctx,-8,-25,3,3,PAL.skinLit);
    pxPoly(ctx,[[5,-38],[8,-38],[9,-46],[6,-46]],PAL.skinDark);
    pxPoly(ctx,[[6,-37],[8,-37],[9,-45],[6,-45]],PAL.skin);
    pxPoly(ctx,[[5,-47],[9,-47],[9,-50],[5,-50]],PAL.white);
    pxLine(ctx,6,-48,8,-48,PAL.gray);
  } else {
    pxPoly(ctx,[[-9,-38],[-6,-38],[-6,-24+swing],[-9,-24+swing]],PAL.skinDark);
    pxPoly(ctx,[[-8,-37],[-6,-37],[-6,-25+swing],[-8,-25+swing]],PAL.skin);
    r(ctx,-9,-25+swing,3,3,PAL.skinLit);
    pxPoly(ctx,[[6,-38],[9,-38],[9,-24-swing],[6,-24-swing]],PAL.skinDark);
    pxPoly(ctx,[[6,-37],[8,-37],[8,-25-swing],[6,-25-swing]],PAL.skin);
    r(ctx,6,-25-swing,3,3,PAL.skinLit);
    r(ctx,7,-25-swing,2,2,PAL.white);
    pxLine(ctx,6,-27-swing,8,-27-swing,PAL.gray);
  }
  // hair mass, no face
  pxEllipse(ctx,0,-51,8,9,PAL.black);
  pxEllipse(ctx,0,-51,7,8,'#15100d');
  pxEllipse(ctx,0,-54,7,5,'#201811');
  pxEllipse(ctx,-2,-56,4,2,'#33261b');
  pxPoly(ctx,[[-8,-55],[-5,-55],[-5,-42],[-8,-43]],PAL.black);
  pxPoly(ctx,[[5,-55],[8,-55],[8,-43],[5,-42]],PAL.black);
  pxLine(ctx,-4,-58,0,-59,'rgba(140,110,78,.30)');
  pxLine(ctx,-3,-55,-3,-44,'rgba(120,96,66,.18)');
  pxLine(ctx,3,-55,3,-44,'rgba(20,15,11,.55)');
  // nape skin and hairline
  pxLine(ctx,-2,-43,2,-43,PAL.skin);
  r(ctx,-3,-42,6,1,PAL.skinDark);
  pxLine(ctx,6,-53,7,-45,'rgba(240,190,120,.30)');
  pxLine(ctx,-7,-53,-8,-45,'rgba(120,175,172,.18)');
}

function drawXieProfile(ctx,step,blink,handRaised,walk,moving){
  // one leg forward, one back (screen-right profile)
  const s=step;
  pxPoly(ctx,[[-4+s,-13],[1+s,-13],[1+s,-1],[-4+s,-1]],PAL.woodDeep);
  pxPoly(ctx,[[1-s,-13],[5-s,-13],[5-s,-1],[1-s,-1]],PAL.woodDeep);
  r(ctx,-5+s,-2,6,2,PAL.black); r(ctx,0-s,-2,5,2,PAL.black);
  // skirt
  pxPoly(ctx,[[-7,-27],[5,-27],[7,-11],[-7,-11]],PAL.black);
  pxPoly(ctx,[[-6,-26],[5,-26],[6,-12],[-6,-12]],PAL.red);
  pxPoly(ctx,[[-6,-26],[-1,-26],[-1,-12],[-7,-12]],PAL.redDark);
  pxPoly(ctx,[[3,-25],[5,-25],[5,-13],[3,-13]],PAL.redLit);
  pxLine(ctx,-7,-11,7,-11,PAL.redDark);
  for (const x of [-3,0,3]) pxLine(ctx,x,-24,x+1,-13,PAL.redDeep);
  // blouse profile
  pxPoly(ctx,[[-6,-41],[5,-41],[6,-27],[-6,-27]],PAL.black);
  pxPoly(ctx,[[-5,-40],[5,-40],[5,-28],[-5,-28]],PAL.bone);
  pxPoly(ctx,[[-5,-40],[-1,-40],[-1,-28],[-5,-28]],PAL.boneDim);
  pxPoly(ctx,[[3,-40],[5,-40],[5,-29],[3,-29]],PAL.paperHi);
  pxLine(ctx,1,-39,1,-28,PAL.boneDim);
  // collar
  pxPoly(ctx,[[-4,-41],[-2,-38],[2,-40],[1,-42],[-3,-42]],PAL.paper);
  r(ctx,-1,-43,3,3,PAL.skinDark);
  // arm
  const sw=step*1;
  if (handRaised){
    pxPoly(ctx,[[3,-38],[7,-39],[10,-43],[8,-45]],PAL.skinDark);
    pxPoly(ctx,[[4,-37],[7,-38],[9,-42],[7,-44]],PAL.skin);
    pxPoly(ctx,[[7,-43],[10,-43],[10,-47],[7,-47]],PAL.skinLit);
    pxPoly(ctx,[[7,-47],[11,-47],[11,-50],[7,-50]],PAL.white);
    pxLine(ctx,8,-49,10,-49,PAL.gray);
  } else {
    pxPoly(ctx,[[4,-38],[7,-38],[7,-24+sw],[4,-24+sw]],PAL.skinDark);
    pxPoly(ctx,[[4,-37],[6,-37],[6,-25+sw],[4,-25+sw]],PAL.skin);
    r(ctx,4,-25+sw,3,3,PAL.skinLit);
    r(ctx,5,-25+sw,2,2,PAL.white);
  }
  // head: face to the right
  pxEllipse(ctx,0,-49,7,8,PAL.black);
  pxEllipse(ctx,0,-49,6,7,PAL.skinDark);
  pxEllipse(ctx,1,-49,5.5,6.5,PAL.skin);
  pxPoly(ctx,[[2,-52],[8,-51],[9,-48],[8,-45],[5,-43],[2,-43]],PAL.skin);
  pxPoly(ctx,[[3,-50],[7,-49],[7,-46],[4,-45]],PAL.skinLit);
  // hair at the back
  pxEllipse(ctx,-2,-54,6,5,PAL.black);
  pxEllipse(ctx,-2,-55,5,4,'#1a140e');
  pxPoly(ctx,[[-8,-54],[-4,-54],[-4,-42],[-8,-43]],PAL.black);
  pxPoly(ctx,[[-6,-54],[1,-55],[2,-52],[-2,-50],[-4,-46],[-6,-45]],PAL.black);
  pxLine(ctx,-3,-57,0,-58,'rgba(130,102,72,.35)');
  // profile face marks
  r(ctx,4,-50,1,1,PAL.black);
  r(ctx,5,-49,1,1,PAL.skinHi);
  pxLine(ctx,3,-52,6,-52,PAL.woodDeep);
  pxLine(ctx,8,-49,9,-48,PAL.skinDark);
  pxLine(ctx,8,-47,6,-46,PAL.skinDark);
  pxLine(ctx,6,-44,8,-44,'#6a2c24');
  r(ctx,3,-45,1,1,PAL.skinDark);
  pxLine(ctx,6,-55,7,-46,'rgba(240,190,120,.30)');
  pxLine(ctx,-8,-53,-8,-44,'rgba(120,175,172,.18)');
  // red tie + hair shine
  r(ctx,-5,-51,1,1,PAL.red);
}

// =========================================================
//  FIRST-PERSON SUBJECTIVE CAMERA
//  Xu Yingzi's DV: Xie is in the frame.
// =========================================================
function drawCameraScene(ctx,t,opts={}){
  const looking=opts.looking!==undefined?opts.looking:state.takes>=1;
  const mismatch=opts.mismatch!==undefined?opts.mismatch:state.mismatch;
  const rig=opts.rig!==false;
  const label=opts.label||'REC';
  const stamp=opts.stamp!==false;
  const tc=opts.timecode||(mismatch?'00:42:30':looking?'00:41:12':'00:18:06');
  const shakeX=Math.sin(t*11.3)*0.6+Math.sin(t*3.1)*0.3;
  const shakeY=Math.cos(t*9.1)*0.5;
  ctx.clearRect(0,0,CW,CH);
  ctx.save(); ctx.translate(shakeX,shakeY);

  // base exposure
  ctx.fillStyle=grad(ctx,0,0,0,CH,[[0,'#3b362a'],[0.52,'#231e17'],[1,'#0d0b08']]);
  ctx.fillRect(0,0,CW,CH);
  // warm key from the bulb
  ctx.save(); ctx.globalCompositeOperation='screen';
  ctx.fillStyle=rgrad(ctx,330,150,10,460,[[0,'rgba(255,205,135,.38)'],[0.36,'rgba(180,125,72,.12)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0,0,CW,CH); ctx.restore();
  // cold window rim
  ctx.save(); ctx.globalCompositeOperation='screen';
  ctx.fillStyle=rgrad(ctx,80,230,10,300,[[0,'rgba(95,135,145,.16)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0,0,CW,CH); ctx.restore();

  // background
  blur(ctx,1.8,()=>{
    for (let x=0;x<CW;x+=38){ ctx.fillStyle='rgba(0,0,0,.14)'; ctx.fillRect(x,0,1,CH*0.7); }
    ctx.fillStyle=grad(ctx,0,CH*0.7,0,CH,[[0,'#1b1712'],[1,'#080706']]);
    ctx.fillRect(0,CH*0.7,CW,CH*0.3);
    // window
    ctx.fillStyle='#0d1517'; ctx.fillRect(40,100,96,110);
    ctx.fillStyle='#24363a'; ctx.fillRect(46,106,84,98);
    for (let i=0;i<14;i++){ ctx.fillStyle='rgba(180,210,210,.16)'; ctx.fillRect(50+((i*9)%74),108+((i*13)%92),1,5); }
    // shelf / jars
    ctx.fillStyle='#2a2318'; ctx.fillRect(420,92,200,12);
    for (let i=0;i<4;i++){
      ctx.fillStyle='#2f2a1e'; ctx.fillRect(440+i*44,54,26,38);
      ctx.fillStyle='#4a3a22'; ctx.fillRect(444+i*44,48,18,8);
    }
    // door frame right
    ctx.fillStyle='#0a0907'; ctx.fillRect(600,90,40,340);
    ctx.fillStyle='#5e1a15'; ctx.fillRect(606,100,5,60);
    // table
    ctx.fillStyle='#3a2b1b'; ctx.fillRect(70,360,280,18);
    ctx.fillStyle='#241a10'; ctx.fillRect(90,378,14,80); ctx.fillRect(322,378,14,80);
    ctx.fillStyle='#5a1a14'; ctx.fillRect(120,354,120,6);
    // bowl / cup / plate
    ctx.fillStyle='#1b1710'; ctx.beginPath(); ctx.ellipse(160,350,40,12,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#5a5540'; ctx.beginPath(); ctx.ellipse(160,345,34,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#b9b09a'; ctx.beginPath(); ctx.ellipse(240,342,16,8,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#d8cfb8'; ctx.beginPath(); ctx.ellipse(240,339,13,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1a1712'; ctx.beginPath(); ctx.ellipse(300,352,34,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#57503c'; ctx.beginPath(); ctx.ellipse(300,348,28,7,0,0,Math.PI*2); ctx.fill();
    // hanging bulb
    ctx.fillStyle='rgba(255,220,150,.9)'; ctx.beginPath(); ctx.arc(330,38,7,0,Math.PI*2); ctx.fill();
  });

  // ---- old woman behind Xie ----
  ctx.save();
  // shawl
  const shawl=grad(ctx,480,240,620,440,[[0,'#1d1a14'],[0.5,'#12100c'],[1,'#080706']]);
  ctx.fillStyle=shawl;
  ctx.beginPath();
  ctx.moveTo(486,440); ctx.lineTo(490,306);
  ctx.quadraticCurveTo(500,250,548,244);
  ctx.quadraticCurveTo(596,250,606,310);
  ctx.lineTo(614,440); ctx.closePath(); ctx.fill();
  // shawl folds
  ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=2;
  for (let i=0;i<4;i++){
    ctx.beginPath(); ctx.moveTo(500+i*28,300); ctx.quadraticCurveTo(508+i*26,360,502+i*30,436); ctx.stroke();
  }
  ctx.strokeStyle='rgba(150,120,80,.12)'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(500,306); ctx.quadraticCurveTo(506,360,500,436); ctx.stroke();
  // neck
  const oneck=grad(ctx,528,250,568,290,[[0,'#9c765c'],[1,'#6a4a38']]);
  ctx.fillStyle=oneck;
  ctx.beginPath(); ctx.ellipse(548,270,15,17,0,0,Math.PI*2); ctx.fill();
  // collar
  ctx.fillStyle='#1a1711';
  ctx.beginPath(); ctx.moveTo(524,282); ctx.lineTo(548,292); ctx.lineTo(572,282); ctx.lineTo(566,300); ctx.lineTo(530,300); ctx.closePath(); ctx.fill();

  // head
  const oskin=ctx.createLinearGradient(520,208,576,268);
  oskin.addColorStop(0,'#b98f70');
  oskin.addColorStop(.55,'#a88266');
  oskin.addColorStop(1,'#7a5744');
  ctx.fillStyle=oskin;
  ctx.beginPath();
  ctx.moveTo(524,224);
  ctx.bezierCurveTo(519,238,521,252,529,261);
  ctx.bezierCurveTo(537,269,559,269,567,261);
  ctx.bezierCurveTo(575,252,577,238,572,224);
  ctx.bezierCurveTo(560,209,536,209,524,224);
  ctx.closePath(); ctx.fill();
  // ears
  ctx.fillStyle='#956e55';
  ctx.beginPath(); ctx.ellipse(522,238,5,9,-0.15,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(574,238,5,9,0.15,0,Math.PI*2); ctx.fill();
  // cheek / temple hollows
  ctx.fillStyle='rgba(70,42,30,.18)';
  ctx.beginPath(); ctx.ellipse(560,246,12,20,0.1,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(530,246,9,16,-0.1,0,Math.PI*2); ctx.fill();
  // gray hair
  ctx.fillStyle='#6f6a5c';
  ctx.beginPath();
  ctx.moveTo(520,228); ctx.quadraticCurveTo(514,208,534,200);
  ctx.quadraticCurveTo(550,194,568,202);
  ctx.quadraticCurveTo(582,210,576,230);
  ctx.quadraticCurveTo(570,214,552,212);
  ctx.quadraticCurveTo(534,214,520,228);
  ctx.closePath(); ctx.fill();
  // bun
  ctx.fillStyle='#615c50';
  ctx.beginPath(); ctx.ellipse(570,204,10,9,0.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#7a7464';
  ctx.beginPath(); ctx.ellipse(568,202,6,5,0.2,0,Math.PI*2); ctx.fill();
  // hair strands
  ctx.strokeStyle='rgba(200,195,175,.22)'; ctx.lineWidth=1;
  for (let i=0;i<5;i++){
    ctx.beginPath(); ctx.moveTo(526+i*10,204); ctx.quadraticCurveTo(520+i*11,214,524+i*10,226); ctx.stroke();
  }
  // forehead / eye shadows
  ctx.fillStyle='rgba(60,36,26,.30)';
  ctx.beginPath(); ctx.ellipse(536,234,11,5,0.05,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(560,234,11,5,-0.05,0,Math.PI*2); ctx.fill();
  // deep-set eyes
  ctx.fillStyle='#0a0907';
  ctx.beginPath(); ctx.ellipse(536,238,4.2,2.2,0.05,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(560,238,4.2,2.2,-0.05,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(235,215,180,.8)';
  ctx.beginPath(); ctx.ellipse(537,237,1.1,1,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(561,237,1.1,1,0,0,Math.PI*2); ctx.fill();
  // brows / wrinkles
  ctx.strokeStyle='rgba(50,30,20,.55)'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(528,230); ctx.quadraticCurveTo(536,227,544,230); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(552,230); ctx.quadraticCurveTo(560,227,568,230); ctx.stroke();
  ctx.strokeStyle='rgba(60,36,26,.35)'; ctx.lineWidth=0.9;
  ctx.beginPath(); ctx.moveTo(530,222); ctx.quadraticCurveTo(544,218,560,222); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(526,244); ctx.quadraticCurveTo(532,247,538,245); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(558,245); ctx.quadraticCurveTo(564,247,570,244); ctx.stroke();
  // nose
  ctx.strokeStyle='rgba(80,50,36,.55)'; ctx.lineWidth=1.3;
  ctx.beginPath(); ctx.moveTo(548,236); ctx.quadraticCurveTo(551,248,546,256); ctx.stroke();
  ctx.fillStyle='rgba(50,28,20,.35)';
  ctx.beginPath(); ctx.ellipse(542,256,2.2,1.4,0.2,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(553,256,2.2,1.4,-0.2,0,Math.PI*2); ctx.fill();
  // mouth (thin, down)
  ctx.strokeStyle='#4a2a22'; ctx.lineWidth=1.8;
  ctx.beginPath(); ctx.moveTo(538,264); ctx.quadraticCurveTo(548,262,558,264); ctx.stroke();
  ctx.strokeStyle='rgba(120,70,56,.35)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(540,267); ctx.quadraticCurveTo(548,268,556,267); ctx.stroke();
  // nasolabial folds / chin shadow
  ctx.strokeStyle='rgba(60,36,26,.28)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(534,252); ctx.quadraticCurveTo(532,260,536,266); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(562,252); ctx.quadraticCurveTo(564,260,560,266); ctx.stroke();
  // warm rim on the left
  ctx.strokeStyle='rgba(255,205,150,.25)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(523,226); ctx.quadraticCurveTo(519,244,528,262); ctx.stroke();
  // cane
  ctx.strokeStyle='#231a10'; ctx.lineWidth=7;
  ctx.beginPath(); ctx.moveTo(606,300); ctx.lineTo(618,440); ctx.stroke();
  ctx.restore();

  // ---- Xie standing in the frame ----
  drawCameraXie(ctx,t,looking,mismatch);

  // ---- old woman's hand on Xie's shoulder ----
  drawOldWomanHand(ctx);

  // ---- Xu's hand + DV foreground ----
  if (rig) drawCameraRig(ctx,t);

  ctx.restore(); // shake

  // grade / grain / overlay
  ctx.save();
  ctx.fillStyle='rgba(40,46,36,.08)'; ctx.fillRect(0,0,CW,CH);
  ctx.fillStyle='rgba(100,66,34,.05)'; ctx.fillRect(0,0,CW,CH);
  ctx.restore();

  // bloom around the practical light
  ctx.save();
  ctx.globalCompositeOperation='screen';
  ctx.fillStyle=rgrad(ctx,330,44,4,190,[[0,'rgba(255,214,150,.20)'],[0.4,'rgba(200,140,70,.06)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0,0,CW,CH);
  ctx.restore();
  // cinematic grade: cool shadows, warm highlights
  ctx.save();
  ctx.globalCompositeOperation='overlay';
  ctx.fillStyle=grad(ctx,0,0,0,CH,[[0,'rgba(70,105,115,.12)'],[0.48,'rgba(255,205,145,.05)'],[1,'rgba(15,25,28,.16)']]);
  ctx.fillRect(0,0,CW,CH);
  ctx.restore();
  // directional shadow from the right
  ctx.save();
  ctx.fillStyle=grad(ctx,0,0,CW,0,[[0,'rgba(0,0,0,0)'],[0.58,'rgba(0,0,0,.10)'],[1,'rgba(0,0,0,.34)']]);
  ctx.fillRect(0,0,CW,CH);
  ctx.restore();
  // warm key on the left
  ctx.save();
  ctx.globalCompositeOperation='screen';
  ctx.fillStyle=rgrad(ctx,210,260,20,340,[[0,'rgba(255,200,140,.10)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0,0,CW,CH);
  ctx.restore();
  // tape tracking band
  const trackY=((t*26)%(CH+160))-80;
  ctx.fillStyle='rgba(235,225,205,.035)'; ctx.fillRect(0,trackY,CW,5);
  ctx.fillStyle='rgba(0,0,0,.06)'; ctx.fillRect(0,trackY+5,CW,2);
  // dropouts
  for (let i=0;i<3;i++){
    if (Math.random()<0.25){ ctx.fillStyle='rgba(240,235,220,.05)'; ctx.fillRect(0,Math.random()*CH,CW,1); }
  }
  // dust in the light
  ctx.save();
  for (let i=0;i<26;i++){
    const x=260+Math.sin(t*0.3+i*2.7)*180 + Math.sin(t*1.7+i)*20;
    const y=120+((i*37+t*8)%230);
    ctx.globalAlpha=0.05+0.05*Math.sin(t*2+i);
    ctx.fillStyle='#ffd9a0';
    ctx.fillRect(x,y,1.2,1.2);
  }
  ctx.restore();
  // film scratches
  ctx.save();
  ctx.globalAlpha=0.10;
  for (let i=0;i<3;i++){
    const x=(i*211+97)%CW;
    ctx.strokeStyle='rgba(235,220,200,.5)'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+2,CH); ctx.stroke();
  }
  ctx.restore();
  vignette(ctx,CW,CH,0.54);
  drawGrain(ctx,CW,CH,0.05);
  drawScanlines(ctx,CW,CH,0.03);
  if (opts.overlay!==false) drawCameraOverlay(ctx,t,tc,label,stamp);
}

function drawCameraXie(ctx,t,looking,mismatch){
  const breathe=Math.sin(t*1.15)*1.2;
  ctx.save();
  ctx.translate(398,436+breathe);
  if (looking) ctx.rotate(0.012);

  // contact shadow
  ctx.fillStyle='rgba(0,0,0,.5)';
  ctx.beginPath(); ctx.ellipse(0,0,64,13,0,0,Math.PI*2); ctx.fill();

  // skirt (back)
  const skirt=ctx.createLinearGradient(-38,-128,38,-8);
  skirt.addColorStop(0,'#7d2b22'); skirt.addColorStop(.45,'#571814'); skirt.addColorStop(1,'#2a0907');
  ctx.fillStyle=skirt;
  ctx.beginPath();
  ctx.moveTo(-30,-128); ctx.quadraticCurveTo(-35,-70,-39,-8);
  ctx.lineTo(38,-8); ctx.quadraticCurveTo(34,-70,27,-128);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(20,4,4,.38)'; ctx.lineWidth=1.6;
  for (let i=0;i<4;i++){
    const x=-20+i*14;
    ctx.beginPath(); ctx.moveTo(x,-124); ctx.quadraticCurveTo(x-4,-70,x-7,-10); ctx.stroke();
  }
  ctx.strokeStyle='rgba(220,120,100,.16)'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(-25,-124); ctx.quadraticCurveTo(-31,-70,-34,-10); ctx.stroke();
  ctx.fillStyle='#3a0e0b'; ctx.fillRect(-30,-132,59,6);

  // blouse (back)
  const bl=ctx.createLinearGradient(-34,-200,34,-124);
  bl.addColorStop(0,'#e1d5b8'); bl.addColorStop(.45,'#cbbfa2'); bl.addColorStop(1,'#a4977c');
  ctx.fillStyle=bl;
  ctx.beginPath();
  ctx.moveTo(-32,-196); ctx.quadraticCurveTo(-37,-160,-32,-126);
  ctx.lineTo(32,-126); ctx.quadraticCurveTo(36,-160,30,-196);
  ctx.quadraticCurveTo(0,-202,-32,-196);
  ctx.closePath(); ctx.fill();
  // center seam
  ctx.strokeStyle='rgba(110,95,72,.32)'; ctx.lineWidth=1.1;
  ctx.beginPath(); ctx.moveTo(0,-196); ctx.lineTo(0,-128); ctx.stroke();
  // shoulder blades
  ctx.fillStyle='rgba(120,104,78,.12)';
  ctx.beginPath(); ctx.ellipse(-15,-174,12,16,0.15,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(15,-174,12,16,-0.15,0,Math.PI*2); ctx.fill();
  // folds
  ctx.strokeStyle='rgba(110,95,72,.26)'; ctx.lineWidth=1.2;
  for (let i=0;i<4;i++){
    const x=-22+i*15;
    ctx.beginPath(); ctx.moveTo(x,-190); ctx.quadraticCurveTo(x-2,-160,x-3,-130); ctx.stroke();
  }
  // nape collar
  ctx.fillStyle='#c9bd9f';
  ctx.beginPath();
  ctx.moveTo(-14,-199); ctx.quadraticCurveTo(0,-206,14,-199);
  ctx.quadraticCurveTo(8,-192,0,-190); ctx.quadraticCurveTo(-8,-192,-14,-199);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(90,74,54,.45)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-13,-198); ctx.quadraticCurveTo(0,-193,13,-198); ctx.stroke();
  // short sleeves
  ctx.fillStyle='#c4b899';
  ctx.beginPath(); ctx.moveTo(-32,-196); ctx.quadraticCurveTo(-43,-184,-40,-168); ctx.lineTo(-29,-166); ctx.quadraticCurveTo(-30,-184,-26,-194); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(30,-196); ctx.quadraticCurveTo(41,-184,38,-168); ctx.lineTo(27,-166); ctx.quadraticCurveTo(28,-184,24,-194); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(100,86,62,.35)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-39,-175); ctx.quadraticCurveTo(-35,-179,-30,-177); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(37,-175); ctx.quadraticCurveTo(33,-179,28,-177); ctx.stroke();
  // rim light
  ctx.strokeStyle='rgba(255,215,160,.32)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(-31,-194); ctx.quadraticCurveTo(-36,-164,-32,-130); ctx.stroke();

  // nape / neck
  const neck=ctx.createLinearGradient(-12,-212,12,-186);
  neck.addColorStop(0,'#c9a686'); neck.addColorStop(1,'#9c745a');
  ctx.fillStyle=neck;
  ctx.beginPath(); ctx.ellipse(0,-200,10,16,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(90,55,38,.3)';
  ctx.beginPath(); ctx.ellipse(0,-210,11,6,0,0,Math.PI*2); ctx.fill();

  // arms / hands
  const skinArm=ctx.createLinearGradient(-52,-210,52,-140);
  skinArm.addColorStop(0,'#d6b697'); skinArm.addColorStop(1,'#a37c61');
  if (mismatch){
    // left arm raised (seen from behind)
    ctx.strokeStyle=skinArm; ctx.lineWidth=13; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-28,-192); ctx.quadraticCurveTo(-40,-208,-42,-226); ctx.stroke();
    ctx.fillStyle='#c9a686';
    ctx.beginPath(); ctx.ellipse(-43,-236,11,13,0.1,0,Math.PI*2); ctx.fill();
    for (let i=0;i<4;i++){
      ctx.strokeStyle='#d2ae8f'; ctx.lineWidth=4.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-50+i*4,-244); ctx.lineTo(-52+i*4,-256); ctx.stroke();
    }
    // right arm down with tape
    ctx.strokeStyle=skinArm; ctx.lineWidth=12; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(28,-192); ctx.quadraticCurveTo(38,-170,37,-154); ctx.stroke();
    ctx.fillStyle='#c9a686';
    ctx.beginPath(); ctx.ellipse(37,-147,10,12,-0.15,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#e5e0cf'; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(40,-152); ctx.lineTo(42,-142); ctx.stroke();
  } else {
    // left arm down
    ctx.strokeStyle=skinArm; ctx.lineWidth=12; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-28,-192); ctx.quadraticCurveTo(-37,-170,-37,-152); ctx.stroke();
    ctx.fillStyle='#c9a686';
    ctx.beginPath(); ctx.ellipse(-38,-145,10,12,0.15,0,Math.PI*2); ctx.fill();
    // right arm down with tape
    ctx.strokeStyle=skinArm; ctx.lineWidth=12; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(28,-192); ctx.quadraticCurveTo(38,-170,37,-154); ctx.stroke();
    ctx.fillStyle='#c9a686';
    ctx.beginPath(); ctx.ellipse(37,-147,10,12,-0.15,0,Math.PI*2); ctx.fill();
    // fingers (back of hand)
    for (let i=0;i<4;i++){
      ctx.strokeStyle='#d2ae8f'; ctx.lineWidth=3.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(33+i*3,-140); ctx.lineTo(34+i*3,-131); ctx.stroke();
    }
    ctx.strokeStyle='#e5e0cf'; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(41,-152); ctx.lineTo(43,-142); ctx.stroke();
    ctx.strokeStyle='#bdb7a3'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(39,-148); ctx.lineTo(45,-149); ctx.stroke();
  }

  // back of the head / hair
  const hair=ctx.createLinearGradient(-34,-272,34,-206);
  hair.addColorStop(0,'#241a14'); hair.addColorStop(.5,'#15100d'); hair.addColorStop(1,'#0c0907');
  ctx.fillStyle=hair;
  ctx.beginPath();
  ctx.moveTo(-33,-264);
  ctx.quadraticCurveTo(-42,-238,-33,-208);
  ctx.quadraticCurveTo(-20,-198,0,-198);
  ctx.quadraticCurveTo(20,-198,33,-208);
  ctx.quadraticCurveTo(42,-238,33,-264);
  ctx.quadraticCurveTo(0,-282,-33,-264);
  ctx.closePath(); ctx.fill();
  // hair shine
  ctx.strokeStyle='rgba(160,130,100,.20)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(-18,-268); ctx.quadraticCurveTo(-27,-242,-20,-214); ctx.stroke();
  ctx.strokeStyle='rgba(160,130,100,.10)'; ctx.lineWidth=1.4;
  for (let i=0;i<6;i++){
    ctx.beginPath(); ctx.moveTo(-26+i*9,-270); ctx.quadraticCurveTo(-30+i*9,-244,-26+i*9,-212); ctx.stroke();
  }
  // nape hairline
  ctx.fillStyle='#1a1410';
  ctx.beginPath(); ctx.ellipse(0,-204,14,7,0,0,Math.PI*2); ctx.fill();

  // profile if she turns to the lens
  if (looking){
    const pskin=ctx.createLinearGradient(16,-262,44,-214);
    pskin.addColorStop(0,'#d9b697'); pskin.addColorStop(1,'#a87e63');
    ctx.fillStyle=pskin;
    ctx.beginPath();
    ctx.moveTo(15,-262);
    ctx.bezierCurveTo(28,-260,37,-250,39,-238);
    ctx.bezierCurveTo(40,-230,37,-222,32,-216);
    ctx.bezierCurveTo(27,-210,20,-208,14,-208);
    ctx.closePath(); ctx.fill();
    // forehead / cheek shadow
    ctx.fillStyle='rgba(90,55,38,.18)';
    ctx.beginPath(); ctx.ellipse(31,-230,9,18,0.1,0,Math.PI*2); ctx.fill();
    // ear
    ctx.fillStyle='#b98f72';
    ctx.beginPath(); ctx.ellipse(16,-238,4,8,0.1,0,Math.PI*2); ctx.fill();
    // eye
    ctx.fillStyle='#ece0cc';
    ctx.beginPath(); ctx.ellipse(34,-240,4.2,1.9,0.08,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#5a3d2a';
    ctx.beginPath(); ctx.arc(35,-240,1.7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#120c08';
    ctx.beginPath(); ctx.arc(35,-240,0.8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,245,225,.9)';
    ctx.beginPath(); ctx.arc(36,-241,0.6,0,Math.PI*2); ctx.fill();
    // lids / brow
    ctx.strokeStyle='rgba(40,24,16,.8)'; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(30,-243); ctx.quadraticCurveTo(35,-245,39,-242); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30,-246); ctx.quadraticCurveTo(35,-248,39,-245); ctx.stroke();
    // nose / lips
    ctx.strokeStyle='rgba(120,78,54,.5)'; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(39,-238); ctx.quadraticCurveTo(44,-232,41,-227); ctx.stroke();
    ctx.fillStyle='#8a4a44';
    ctx.beginPath(); ctx.ellipse(37,-220,4,1.3,0.1,0,Math.PI*2); ctx.fill();
    // jaw / chin shadow
    ctx.fillStyle='rgba(90,55,38,.12)';
    ctx.beginPath(); ctx.ellipse(24,-214,10,5,0.1,0,Math.PI*2); ctx.fill();
    // hair falling over the profile
    ctx.fillStyle='#15100d';
    ctx.beginPath();
    ctx.moveTo(14,-264); ctx.quadraticCurveTo(26,-258,22,-238);
    ctx.quadraticCurveTo(18,-220,20,-208);
    ctx.quadraticCurveTo(12,-214,12,-238);
    ctx.closePath(); ctx.fill();
    // warm catch on the profile
    ctx.strokeStyle='rgba(255,210,150,.35)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(38,-244); ctx.quadraticCurveTo(42,-232,38,-220); ctx.stroke();
  }

  ctx.restore();
}

function drawOldWomanHand(ctx){
  ctx.save();
  // arm from the old woman's body to Xie's shoulder
  ctx.strokeStyle='#15130f'; ctx.lineWidth=30; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(535,300); ctx.quadraticCurveTo(500,278,466,262); ctx.stroke();
  ctx.strokeStyle='#2a2620'; ctx.lineWidth=30;
  ctx.beginPath(); ctx.moveTo(474,265); ctx.lineTo(458,260); ctx.stroke();
  // hand on the shoulder
  ctx.translate(448,256);
  ctx.rotate(-0.12);
  ctx.fillStyle='#b99c80';
  ctx.beginPath(); ctx.ellipse(0,0,20,14,0.1,0,Math.PI*2); ctx.fill();
  // fingers curling over the shoulder
  for (let i=0;i<4;i++){
    ctx.strokeStyle='#b99c80'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(6,-5+i*4); ctx.quadraticCurveTo(-2,2+i*4,-10,6+i*4); ctx.stroke();
  }
  // thumb
  ctx.strokeStyle='#b99c80'; ctx.lineWidth=7;
  ctx.beginPath(); ctx.moveTo(12,10); ctx.lineTo(22,16); ctx.stroke();
  // dark cuff at the wrist
  ctx.strokeStyle='#15130f'; ctx.lineWidth=16;
  ctx.beginPath(); ctx.moveTo(14,14); ctx.lineTo(22,20); ctx.stroke();
  // gold ring
  ctx.strokeStyle='#b8873f'; ctx.lineWidth=2.2;
  ctx.beginPath(); ctx.arc(-8,6,5,0.2,Math.PI*1.6); ctx.stroke();
  // wrinkles / nails
  ctx.strokeStyle='rgba(80,52,36,.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-4,-4); ctx.quadraticCurveTo(2,-2,6,2); ctx.stroke();
  ctx.fillStyle='#4a3020';
  for (let i=0;i<4;i++){ ctx.beginPath(); ctx.arc(-14,8+i*4,1.2,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}

function drawCameraRig(ctx,t){
  const shake=Math.sin(t*1.7)*0.8;
  ctx.save();
  ctx.translate(540+shake,400);

  // dark sleeve / forearm
  const sleeve=ctx.createLinearGradient(30,50,120,140);
  sleeve.addColorStop(0,'#12100d'); sleeve.addColorStop(.5,'#0b0a08'); sleeve.addColorStop(1,'#050504');
  ctx.fillStyle=sleeve;
  ctx.beginPath(); ctx.ellipse(72,92,104,84,0.2,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(90,74,54,.18)'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(36,66); ctx.quadraticCurveTo(70,90,96,130); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(56,58); ctx.quadraticCurveTo(86,86,112,120); ctx.stroke();

  // DV body
  const body=ctx.createLinearGradient(-50,-56,66,30);
  body.addColorStop(0,'#1a1a17'); body.addColorStop(.45,'#0d0d0b'); body.addColorStop(1,'#050504');
  ctx.fillStyle=body;
  ctx.beginPath();
  ctx.moveTo(-50,-44); ctx.lineTo(46,-56); ctx.lineTo(66,10); ctx.lineTo(-38,30);
  ctx.closePath(); ctx.fill();
  // top specular edge
  ctx.strokeStyle='rgba(220,215,195,.18)'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(-48,-43); ctx.lineTo(45,-55); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.06)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-46,-38); ctx.lineTo(42,-50); ctx.stroke();
  // side panel
  ctx.fillStyle='#141412';
  ctx.beginPath(); ctx.moveTo(-40,-32); ctx.lineTo(38,-44); ctx.lineTo(52,12); ctx.lineTo(-28,28); ctx.closePath(); ctx.fill();

  // lens barrel
  ctx.fillStyle='#060605'; ctx.beginPath(); ctx.arc(-12,-20,22,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#2e2c26'; ctx.lineWidth=2.4; ctx.beginPath(); ctx.arc(-12,-20,22,0,Math.PI*2); ctx.stroke();
  const glass=ctx.createRadialGradient(-16,-25,2,-12,-20,17);
  glass.addColorStop(0,'#4a6a70'); glass.addColorStop(.45,'#1d2c30'); glass.addColorStop(1,'#0a0d0e');
  ctx.fillStyle=glass; ctx.beginPath(); ctx.arc(-12,-20,15,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(140,180,180,.35)'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(-12,-20,15,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='rgba(190,225,225,.45)';
  ctx.beginPath(); ctx.ellipse(-17,-26,4.6,2.4,-0.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.22)';
  ctx.beginPath(); ctx.ellipse(-8,-14,2.2,1.1,0.4,0,Math.PI*2); ctx.fill();

  // REC light
  ctx.fillStyle='rgba(216,74,56,.22)'; ctx.beginPath(); ctx.arc(-38,-24,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#e1543e'; ctx.beginPath(); ctx.arc(-38,-24,3.4,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,190,170,.8)'; ctx.beginPath(); ctx.arc(-39,-25,1,0,Math.PI*2); ctx.fill();

  // small screen with a faint image
  ctx.fillStyle='#0e1412'; ctx.fillRect(-30,4,30,18);
  ctx.strokeStyle='rgba(180,200,180,.22)'; ctx.lineWidth=1; ctx.strokeRect(-30,4,30,18);
  const scr=ctx.createLinearGradient(-30,4,-0,22);
  scr.addColorStop(0,'rgba(120,145,125,.16)'); scr.addColorStop(1,'rgba(40,55,45,.20)');
  ctx.fillStyle=scr; ctx.fillRect(-28,6,26,14);
  ctx.fillStyle='rgba(220,200,160,.55)'; ctx.fillRect(-22,10,6,5);
  ctx.fillStyle='rgba(150,80,60,.4)'; ctx.fillRect(-12,13,4,4);

  // palm shadow on the DV
  ctx.fillStyle='rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(34,20,30,22,-0.2,0,Math.PI*2); ctx.fill();

  // hand
  const skin=ctx.createLinearGradient(0,-10,60,55);
  skin.addColorStop(0,'#d4b394'); skin.addColorStop(.55,'#c09a7b'); skin.addColorStop(1,'#8f6c52');
  ctx.fillStyle=skin;
  ctx.beginPath(); ctx.ellipse(42,32,36,27,-0.25,0,Math.PI*2); ctx.fill();
  // fingers wrapping the right side
  for (let i=0;i<4;i++){
    ctx.strokeStyle=i===0?'#d8b899':'#c9a686';
    ctx.lineWidth=9; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(16+i*8,-4+i*3); ctx.quadraticCurveTo(30+i*4,8+i*2,27+i*5,31+i*2); ctx.stroke();
    // knuckle shadow
    ctx.strokeStyle='rgba(90,55,40,.22)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(20+i*8,4+i*3); ctx.lineTo(26+i*7,6+i*3); ctx.stroke();
    // nail
    ctx.fillStyle='rgba(235,210,185,.55)';
    ctx.beginPath(); ctx.ellipse(27+i*5,33+i*2,2,1.2,0.2,0,Math.PI*2); ctx.fill();
  }
  // thumb
  ctx.strokeStyle='#c9a686'; ctx.lineWidth=11;
  ctx.beginPath(); ctx.moveTo(22,2); ctx.quadraticCurveTo(12,-8,6,-18); ctx.stroke();
  ctx.fillStyle='rgba(235,210,185,.5)';
  ctx.beginPath(); ctx.ellipse(5,-19,2.2,1.4,0.3,0,Math.PI*2); ctx.fill();
  // wrist / bracelet
  ctx.strokeStyle='#8e2a22'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.ellipse(35,62,24,7,0.2,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='#c04a38'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.ellipse(35,62,24,7,0.2,0,Math.PI*2); ctx.stroke();
  // bracelet knot
  ctx.fillStyle='#8e2a22'; ctx.beginPath(); ctx.arc(57,66,2.2,0,Math.PI*2); ctx.fill();
  // hand highlight
  ctx.strokeStyle='rgba(255,235,210,.18)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(20,18); ctx.quadraticCurveTo(34,10,50,18); ctx.stroke();

  ctx.restore();
}

function drawCameraOverlay(ctx,t,timecode,label='REC',showStamp=true,focusBracket=true){
  ctx.save();
  ctx.strokeStyle='rgba(220,210,190,.28)'; ctx.lineWidth=2;
  ctx.strokeRect(6,6,CW-12,CH-12);
  // corner brackets
  ctx.strokeStyle='rgba(230,220,200,.7)'; ctx.lineWidth=3;
  const L=26;
  const corners=[[10,10,1,1],[CW-10,10,-1,1],[10,CH-10,1,-1],[CW-10,CH-10,-1,-1]];
  for (const [x,y,dx,dy] of corners){
    ctx.beginPath(); ctx.moveTo(x,y+dy*L); ctx.lineTo(x,y); ctx.lineTo(x+dx*L,y); ctx.stroke();
  }
  // focus bracket around Xie's face (not during playback)
  if (focusBracket && !state.review){
    ctx.strokeStyle='rgba(230,220,200,.28)'; ctx.lineWidth=1;
    ctx.strokeRect(326,236,68,96);
  }
  // REC / PLAY
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(22,20,104,30);
  if (label==='PLAY'){
    ctx.fillStyle='#e8dfc8'; ctx.beginPath(); ctx.moveTo(32,29); ctx.lineTo(44,35); ctx.lineTo(32,41); ctx.closePath(); ctx.fill();
    ctx.font='15px "Courier New",monospace'; ctx.fillText('PLAY',52,41);
  } else if (label==='PAUSE'){
    ctx.fillStyle='#d84a38'; ctx.fillRect(32,27,5,13); ctx.fillRect(41,27,5,13);
    ctx.fillStyle='#e8dfc8'; ctx.font='15px "Courier New",monospace';
    ctx.fillText('PAUSE',52,41);
  } else if (label==='SCAN'){
    ctx.fillStyle='#7fb8ae'; ctx.fillRect(32,27,5,13); ctx.fillRect(41,27,5,13);
    ctx.fillStyle='#bfe4dc'; ctx.font='15px "Courier New",monospace';
    ctx.fillText('SCAN',52,41);
  } else {
    ctx.fillStyle='#d84a38'; ctx.beginPath(); ctx.arc(38,35,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#e8dfc8'; ctx.font='15px "Courier New",monospace';
    ctx.fillText('REC',52,41);
  }
  // battery
  ctx.strokeStyle='rgba(232,223,200,.7)'; ctx.lineWidth=1;
  ctx.strokeRect(CW-78,26,40,15);
  const battW=Math.max(0,Math.min(26,Math.round(26*state.battery/100)));
  ctx.fillStyle=state.battery<20?'rgba(216,74,56,.85)':'rgba(232,223,200,.75)';
  ctx.fillRect(CW-74,30,battW,7);
  ctx.fillRect(CW-36,31,4,5);
  // date / timecode
  if (showStamp){
    ctx.fillStyle='rgba(232,223,200,.78)'; ctx.font='13px "Courier New",monospace';
    ctx.fillText('2003.08.17',22,CH-22);
    ctx.textAlign='right';
    ctx.fillText(timecode,CW-22,CH-22);
    ctx.textAlign='left';
    ctx.fillStyle='rgba(232,223,200,.35)'; ctx.font='10px "Courier New",monospace';
    ctx.fillText('SONY  DCR-VX2000',22,CH-40);
  }
  ctx.restore();
}

// Clearly label the procedural stand-in so it is never mistaken for final
// 《祭》 footage. Only drawn when the video layer is actually supplying pixels.
function drawFootageBadge(ctx){
  const text='PLACEHOLDER FOOTAGE · 占位素材';
  const bx=42, by=CH-78;
  ctx.save();
  ctx.font='10px "Courier New","PingFang SC","Hiragino Sans GB",monospace';
  const tw=Math.ceil(ctx.measureText(text).width);
  ctx.fillStyle='rgba(0,0,0,.46)';
  ctx.fillRect(bx,by,tw+16,18);
  ctx.fillStyle='rgba(232,223,200,.82)';
  ctx.fillText(text,bx+8,by+13);
  ctx.restore();
}
function drawVideoFrame(ctx){
  if (!dvCtx || !dvVideo || dvVideo.readyState<2) return false;
  try{
    dvCtx.drawImage(dvVideo,0,0,dvVideoCanvas.width,dvVideoCanvas.height);
    videoDrewFrame=true;
    return true;
  }catch(e){
    return false;
  }
}
function renderCameraPending(ctx,t){
  // While the decoder spins up, paint the same tape's poster frame directly
  // into the DV canvas, then the OSD on top. Keeping both on one canvas avoids
  // DOM compositing flicker and keeps the scanlines/OSD perfectly aligned.
  ctx.clearRect(0,0,CW,CH);
  if (POSTER_IMG.complete && POSTER_IMG.naturalWidth){
    ctx.drawImage(POSTER_IMG,0,0,CW,CH);
  } else {
    ctx.fillStyle='#08090a'; ctx.fillRect(0,0,CW,CH);
  }
  drawCameraOverlay(ctx,t,cameraTimecode({}),'REC',true,false);
  return true;
}
function renderCameraVideoOSD(ctx,t,opts={}){
  // The footage itself lives on #dvVideoCanvas; this canvas only carries the
  // transparent OSD so the CSS CRT layer can sit above both.
  if (!drawVideoFrame() && !videoDrewFrame) return false;
  ctx.clearRect(0,0,CW,CH);
  drawCameraOverlay(ctx,t,cameraTimecode(opts),opts.label||'REC',opts.stamp!==false,false);
  return true;
}

// =========================================================
//  UI / FLOW
// =========================================================
let subtitleTimer=null;
// Mirror of what is actually on screen, so a headless bot can only "see" the
// same text a player sees. Populated only while FUZZ_ACTIVE is on.
const FUZZ_UI={prompt:'',promptDur:0,promptAt:0,say:'',sayDur:0,sayAt:0,
  kicker:'',name:'',obj:'',count:''};
// Chinese read-aloud is ~4.5 chars/second. Lines that carry a clue get at least
// that much time, so a slow reader never loses the instruction mid-sentence.
function readingTime(text,dur){
  const t=(text||'').replace(/\s+/g,'').length;
  return Math.max(dur,Math.min(9000,700+t*230));
}
function say(text,dur=3600){
  if (FUZZ_ACTIVE){ FUZZ_UI.say=text; FUZZ_UI.sayDur=dur; FUZZ_UI.sayAt=state.time; return; }
  subtitleEl.textContent=text;
  subtitleEl.classList.remove('hidden');
  cancelLater(subtitleTimer);
  subtitleTimer=later(()=>subtitleEl.classList.add('hidden'),readingTime(text,dur));
  if (!state.muted){
    for (const v of VOICE_LINES){
      if (text.includes(v.text)){ playMedia(v.key,0.88,0.08); break; }
    }
  }
}
let promptTimer=null;
function prompt(text,dur=0){
  if (FUZZ_ACTIVE){ FUZZ_UI.prompt=text||''; FUZZ_UI.promptDur=dur; FUZZ_UI.promptAt=state.time; return; }
  if (!text){ cancelLater(promptTimer); promptTimer=null; promptEl.classList.add('hidden'); return; }
  promptEl.textContent=text;
  promptEl.classList.remove('hidden');
  cancelLater(promptTimer);
  if (dur) promptTimer=later(()=>promptEl.classList.add('hidden'),dur);
}
const RITUAL_TAKES=[
  {id:'甲',incense:2,bowl:1,thread:0},
  {id:'乙',incense:3,bowl:0,thread:2},
  {id:'丙',incense:1,bowl:2,thread:0}
];
const RITUAL_TRUE=1;
const BOWL_LABEL=['左','中','右'];
const HIDE_SPOTS=[
  {id:'curtain',x:2.2,y:4.6,label:'帘子后面',cam:'左'},
  {id:'table',x:7.0,y:6.65,label:'供桌下面',cam:'中'},
  {id:'chair',x:9.55,y:2.6,label:'椅子后面',cam:'右'}
];
const REVIEW_QUIZ=[
  {q:'这盘带是哪一年？',opts:['1998','1999','2003'],ans:1},
  {q:'23:06 缺了哪一帧？',opts:['空椅子','门','白胶布的手'],ans:2},
  // Paid off by the corridor nameplate, so it can only be answered by someone
  // who actually looked at the door instead of walking straight to the phone.
  {q:'走廊尽头的门牌上，是谁的名字？',opts:['谢雨洁','徐英子','曾阿婆'],ans:1}
];
const THREAD_LABEL=['低','中','高'];
function currentTake(){
  const r=state.ritual;
  return RITUAL_TAKES.findIndex(t=>t.incense===r.incense&&t.bowl===r.bowl&&t.thread===r.thread);
}
function ritualScansComplete(){
  const c=state.ritual.camSeen;
  return !!(c && c.incense && c.bowl && c.thread);
}
function ritualReadyForCommit(){
  return ritualScansComplete() && photosAll();
}
function huntViewHint(pos){
  return ['左侧有衣角','低处有人影','右侧有袖口'][pos]||'有什么在动';
}
function shiftHuntLayout(){
  if (!state.hunt) return;
  state.hunt.layout=((state.hunt.layout||0)+1)%3;
  if (!state.silent){
    playMedia('roomShift',0.42,0.04);
    glitchNow();
  }
}
function updateRitualHUD(){
  if (FUZZ_ACTIVE) return;
  if (!ritualEl) return;
  const r=state.ritual;
  ritualEl.classList.toggle('hidden',!r.active);
  if (caseBtn) caseBtn.classList.toggle('hidden',!r.active||r.done||state.caseOpen);
  if (!r.active) return;
  const take=currentTake();
  ritualIncenseEl.innerHTML='香 <b>'+r.incense+'</b>';
  ritualBowlEl.innerHTML='水 <b>'+BOWL_LABEL[r.bowl]+'</b>';
  ritualThreadEl.innerHTML='线 <b>'+THREAD_LABEL[r.thread]+'</b>';
  ritualIncenseEl.classList.remove('ok');
  ritualBowlEl.classList.remove('ok');
  ritualThreadEl.classList.remove('ok');
  ritualNoteEl.textContent=r.done?'完成'
    : '第'+(r.loop+1)+'遍 · '+(take>=0?'当前 '+RITUAL_TAKES[take].id:'未成仪');
  updateBatteryHUD();
  if (state.caseOpen) renderCase();
}
function runClock(ms){
  const total=Math.max(0,Math.floor(ms/1000));
  const m=Math.floor(total/60), s=total%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function updateRunText(){
  const elapsed=state.runEnd||(state.runStart?performance.now()-state.runStart:0);
  if (pauseRunEl) pauseRunEl.textContent='本次用时 '+runClock(elapsed);
  if (endRunEl) endRunEl.textContent='用时 '+runClock(elapsed);
}
function updateBatteryHUD(){
  if (FUZZ_ACTIVE) return;
  if (!ritualBatteryEl) return;
  const pct=Math.max(0,Math.min(100,Math.round(state.battery)));
  ritualBatteryEl.textContent='DV 电 '+pct+'%';
  ritualBatteryEl.classList.toggle('low',pct<25);
}
function updateChapterHUD(){
  if (!chapterEl) return;
  const on=state.chapter>=2 && state.chapter<=5 && !state.ended;
  let kicker='',name='',obj='',count='';
  if (on){
    if (state.chapter===2){
      kicker='第 2 遍'; name='找她';
      obj='按 <b>F</b> 看取景器里的局部线索。<br/>放下 DV，在房间里找到同一处，按 <b>E</b>。';
      count='找到 '+(state.hunt?state.hunt.count:0)+' / 4';
    } else if (state.chapter===3){
      kicker='第 3 遍';
      if (state.ch3FrameGate && !state.ch3FrameOk){
        name='选帧';
        obj='按 <b>R</b> 回看，<b>A / D</b> 停在 00:41:17 闭眼那一帧。';
        count='回看 · 找闭眼帧';
      } else {
        name='拍异常';
        obj='房间被改过。走到香炉/水碗/门框旁，按 <b>F</b> 看取景器，按 <b>L</b> 拍下不对的地方。';
        count='拍到 '+(state.hunt?state.hunt.count:0)+' / 3　·　DV 电 '+Math.round(state.battery)+'%';
      }
    } else if (state.chapter===4){
      kicker='第 4 遍'; name='躲她';
      obj='按 <b>F</b> 看她正看着哪里；<br/>躲到另外两个地方之一，按 <b>E</b>。';
      const h=state.hide;
      count=h?('第 '+Math.min(4,h.round+1)+' / 4 轮　·　'+Math.max(0,h.remaining).toFixed(1)+'s'):'';
    } else {
      kicker='最后一遍';
      if (!state.finalPhoto){
        name='拍她'; obj='走近她，举起 <b>F</b>，按 <b>L</b> 拍下。';
        count='照片：未拍　·　DV 电 '+Math.round(state.battery)+'%';
      } else if (!state.phoneDone){
        if (state.scene==='darkroom'){
          const k=state.dark||{};
          name='暗房';
          const n=(k.seen?((k.seen.line?1:0)+(k.seen.bench?1:0)+(k.seen.wall?1:0)):0);
          if (n<3){
            obj='按住 <b>F</b> 在红灯下显影：洗印线、剪辑台、放大机。';
            count='显影 '+n+' / 3　·　距离 '+Math.round((k.depth||0)*100)+'%';
          } else if (k.open){
            const off=(k.v||0)-(k.target||0);
            const ok=Math.abs(off)<=0.03;
            obj='按 <b>Q / E</b> 把断口对到红线上；按 <b>空格</b> 接带。';
            count=ok?'接缝 已对齐　·　空格 接带'
              :('接缝 偏移 '+(off>0?'+':'')+(off*100).toFixed(0)+'%');
          } else if (!k.split){
            obj='回剪辑台，按 <b>E</b> 接回剪掉的那 23 分钟。';
            count='显影 3 / 3';
          } else {
            obj=k.print
              ? '照片洗出来了。<br/>往回走到门口，按 <b>E</b> 推门。'
              : '那 23 分钟接回去了。按 <b>L</b> 拍下这一格，<br/>再往回走到门口，按 <b>E</b> 推门。';
            count=k.print?'照片：已拍':'照片：未拍';
          }
        } else if (state.scene==='corridor'){
          const c=state.corr||{};
          name=c.answered?'门':'门后';
          obj=c.answered
            ? '电话挂了。<b>W</b> 走到尽头，按 <b>E</b> 推开那扇门。'
            : '<b>W</b> 前进。看到侧门、遗像、门牌时按住 <b>F</b> 看清；<br/>看清门牌后，走到尽头按 <b>E</b> 接电话。';
          const seen=(c.roomSeen?1:0)+(c.facesSeen?1:0)+(c.nameSeen?1:0);
          count=c.answered?'电话：已接':'看清 '+seen+' / 3　·　距离 '+Math.round((c.depth||0)*100)+'%';
        } else {
          name='电话'; obj='门后的电话在响。<br/>走到门口按 <b>E</b> 接电话。';
          count='电话：未接';
        }
      } else {
        name='手'; obj='她坐回椅子。<br/>按 <b>Q</b> 让她抬手。';
        count='';
      }
    }
  }
  if (FUZZ_ACTIVE){
    FUZZ_UI.kicker=kicker; FUZZ_UI.name=name; FUZZ_UI.count=count;
    FUZZ_UI.obj=obj.replace(/<br\s*\/?>/g,' ').replace(/<[^>]+>/g,'');
    return;
  }
  chapterEl.classList.toggle('hidden',!on);
  if (!on) return;
  chapterKickerEl.textContent=kicker;
  chapterNameEl.textContent=name;
  chapterObjEl.innerHTML=obj;
  chapterCountEl.textContent=count;
}
function updateBattery(dt){
  if (!state.started || state.ended) return;
  dt=Math.max(0,Math.min(.2,dt));
  if (state.paused || state.review || state.caseOpen){ updateBatteryHUD(); return; }
  if (state.camera && state.takes<1){
    state.battery=Math.max(0,state.battery-dt*5.5);
    if (state.battery<=0) forceCameraOff();
  } else {
    state.battery=Math.min(100,state.battery+dt*1.4);
  }
  updateBatteryHUD();
}
function forceCameraOff(){
  if (!state.camera) return;
  setCamera(false);
  glitchNow();
  if (state.ritual.active && !state.ritual.done) state.ritual.reviews=(state.ritual.reviews||0)+1;
  if (!state.silent){
    playMedia('oldBreath',0.75,0.03);
    say('电量见底。镜头自己灭了。',3600);
    prompt('E 调整　/　Tab 记录　/　R 看带',4600);
  }
}
function renderCase(){
  if (!caseEl) return;
  const r=state.ritual;
  const take=currentTake();
  if (r.loop===0){
    caseTapeEl.innerHTML='<div class="row"><span>甲</span><span>香二 · 水中 · 线低</span></div><div class="note">带子说：照这个摆。</div>';
  } else if (r.loop===1){
    caseTapeEl.innerHTML='<div class="row unknown"><span>信号</span><span>损坏</span></div><div class="note">这一页不对。</div>';
  } else {
    caseTapeEl.innerHTML='<div class="row"><span>残页</span><span>水 · 靠左 · 其余未知</span></div><div class="note">带子只对上了一项。香和绳要看实物。</div>';
  }
  const clueRow=(label,val,found)=>'<div class="row'+(found?'':' unknown')+'"><span>'+label+'</span><span>'+(found?val:'未显影')+'</span></div>';
  caseCluesEl.innerHTML=
    clueRow('炉身孔数','3',r.camSeen.incense)
    +clueRow('桌面水痕','左',r.camSeen.bowl)
    +clueRow('门框绳痕','高',r.camSeen.thread)
    +(ritualReadyForCommit()?'<div class="note">实物不会说谎。用 E 摆成乙，供桌前空格起仪。</div>'
      :ritualScansComplete()?'<div class="note">三处已显影。各拍一张（L），再起仪。</div>'
      :'<div class="note">靠近香炉 / 水碗 / 门框，按住 F 显影。</div>');
  caseTakesEl.innerHTML=RITUAL_TAKES.map((t,i)=>
    '<div class="take'+(i===take?' now':'')+'"><b>'+t.id+'</b><span>香'+t.incense+' · '+BOWL_LABEL[t.bowl]+' · '+THREAD_LABEL[t.thread]+'</span></div>'
  ).join('');
  const scanAll=r.camSeen&&r.camSeen.incense&&r.camSeen.bowl&&r.camSeen.thread;
  const ph=state.photos;
  const pn=(ph.incense?1:0)+(ph.bowl?1:0)+(ph.thread?1:0);
  caseNowEl.innerHTML='当前：<b>'+(take>=0?RITUAL_TAKES[take].id:'未成仪')+'</b>　·　第 '+(r.loop+1)+' 遍'
    +'<br><span class="scanLine">取景器：'+(scanAll?'香三 · 水左 · 线高':'未显影')+'　·　DV 电 '+Math.round(state.battery)+'%</span>'
    +'<br><span class="scanLine">照片：香'+(ph.incense?'✓':'○')+' 水'+(ph.bowl?'✓':'○')+' 线'+(ph.thread?'✓':'○')+'　'+pn+'/3</span>';
}
function openCase(){
  const r=state.ritual;
  if (!state.started||state.ended||state.camera||state.review||state.paused||!r.active||r.done||state.caseOpen) return;
  state.caseOpen=true;
  document.body.classList.add('caseOpen');
  caseEl.classList.remove('hidden');
  if (caseBtn) caseBtn.classList.add('hidden');
  renderCase();
}
function closeCase(){
  if (!state.caseOpen) return;
  state.caseOpen=false;
  document.body.classList.remove('caseOpen');
  if (caseEl) caseEl.classList.add('hidden');
  updateRitualHUD();
}
function ritualNearest(){
  const r=state.ritual;
  if (!r.active || r.done) return null;
  const pts={incense:[8.12,5.05],bowl:[6.55,5.15],thread:[3.7,1.0]};
  let best=null, bestD=2.0;
  for (const k of Object.keys(pts)){
    const [x,y]=pts[k];
    const d=Math.hypot(state.wx-x,state.wy-y);
    if (d<bestD){ best=k; bestD=d; }
  }
  return best;
}
function scanTarget(){
  if (!((state.ritual.active && !state.ritual.done) || state.chapter===3)) return null;
  const pts={incense:[8.12,5.05],bowl:[6.55,5.15],thread:[3.7,1.0]};
  let best=null,bestD=2.1;
  for (const k of Object.keys(pts)){
    const [x,y]=pts[k];
    const d=Math.hypot(state.wx-x,state.wy-y);
    if (d<bestD){ best=k; bestD=d; }
  }
  return best;
}
function nearAltar(){ return Math.hypot(state.wx-7.05,state.wy-5.25)<2.2; }
function cycleRitual(key){
  const r=state.ritual;
  if (!r.active || r.done) return;
  r.inspected[key]=true;
  if (key==='incense'){
    r.incense=r.incense%3+1;
    say('香炉：'+r.incense+' 炷。',1900);
  } else if (key==='bowl'){
    r.bowl=(r.bowl+1)%3;
    say('水碗：'+BOWL_LABEL[r.bowl]+'。',1900);
  } else if (key==='thread'){
    r.thread=(r.thread+1)%3;
    say('红绳：'+THREAD_LABEL[r.thread]+'。',1900);
  }
  sClick();
  updateRitualHUD();
  const scanHint=ritualReadyForCommit()?'空格 起仪　/　Tab 记录'
    :ritualScansComplete()?'L 拍照三处　/　Tab 记录':'按住 F 显影三处　/　Tab 记录';
  prompt(scanHint+'　/　E 继续调整',4600);
}
function completeRitual(){
  const r=state.ritual;
  if (r.done) return;
  r.done=true;
  updateRitualHUD();
  playMedia('ritualOk',0.38,0.06);
  playMedia('incense',0.22,0.10);
  if (state.silent){
    say('老妇：……对了。手给我。',3800);
    prompt('Q 让她抬手　/　按住 F 举起 DV',5200);
  } else {
    say('老妇：……对了。',1800);
    startRitualScare();
  }
  later(()=>{
    if (state.ritual.done){ state.ritual.active=false; updateRitualHUD(); }
  },7000);
}
function wrongRitual(take){
  const r=state.ritual;
  r.loop++;
  if (r.loop>=3){ chooseBad(); return; }
  state.inputLock=true;
  later(()=>{ state.inputLock=false; },1600);
  r.seen=false;
  r.reviews=Math.max(r.reviews||0,r.loop*2);
  updateRitualHUD();
  playMedia('door',0.42,0.03);
  playMedia('oldBreath',0.55,0.04);
  glitchNow();
  if (state.silent){
    say('不对。'+RITUAL_TAKES[take].id+' 不是原样。',3600);
    prompt('E 重新摆　/　Tab 记录　/　R 看旧带　/　空格 起仪',5600);
    return;
  }
  fadeEl.classList.add('on');
  later(()=>fadeEl.classList.remove('on'),450);
  if (r.loop===2) state.scareUntil=state.time+1.6;
  later(()=>{
    if (state.ending) return;
    state.scareUntil=0;
    say(r.loop===1?'不对。带子里的供桌，和你看见的不一样。':'她离你更近了。',3800);
    prompt('E 重新摆　/　R 看旧带　/　空格 起仪',5200);
  },1500);
}
function commitRitual(){
  const r=state.ritual;
  if (!r.active || r.done || state.ending || state.camera || state.review || state.caseOpen) return;
  if (!nearAltar()){ say('走到供桌前。',2200); return; }
  if (!ritualScansComplete()){
    const c=r.camSeen;
    const miss=[];
    if (!c.incense) miss.push('香炉');
    if (!c.bowl) miss.push('水碗');
    if (!c.thread) miss.push('门框');
    say('起仪前，先在取景器里显影：'+miss.join('、')+'。',3600);
    prompt('按住 F 显影　/　Tab 记录　/　R 看旧带',5200);
    return;
  }
  if (!photosAll()){
    const ph=state.photos;
    const miss=[];
    if (!ph.incense) miss.push('香炉');
    if (!ph.bowl) miss.push('水碗');
    if (!ph.thread) miss.push('门框');
    say('起仪前，三处各拍一张：'+miss.join('、')+'。',3600);
    prompt('按住 F　·　L 快门　/　Tab 记录',5200);
    return;
  }
  const take=currentTake();
  if (take<0){ say('先把香、水、线摆成完整的一遍。',3000); prompt('F 取景器　/　E 调整供桌　/　Tab 记录　/　R 看旧带',5200); return; }
  if (take===RITUAL_TRUE){ completeRitual(); }
  else wrongRitual(take);
}
function startRitualScare(){
  if (state.silent || state.ending || state.scareUntil) return;
  state.scareUntil=state.time+2.6;
  state.scareAt=performance.now();
  playMedia('oldBreath',0.95,0.02);
  playMedia('door',0.32,0.02);
  if (actx){ tone(36,1.4,'sine',0.12); tone(48,0.9,'sine',0.06); }
  glitchNow();
  fadeEl.classList.add('on');
  later(()=>{ fadeEl.classList.remove('on'); },500);
  later(()=>{
    if (state.ending || state.handRaised) return;
    state.scareUntil=0;
    say('她刚才，站在你后面。',3800);
    prompt('第二遍要开始了。',3200);
    glitchNow();
    playMedia('oldBreath',0.5,0.04);
    later(()=>{ if (!state.ending) startChapter(2); },3000);
  },2600);
}
function startPhotoScare(){
  if (state.silent || state.ending || state.scareUntil) return;
  state.scareUntil=state.time+2.4;
  playMedia('oldBreath',0.9,0.02);
  playMedia('door',0.3,0.02);
  if (actx){ tone(36,1.4,'sine',0.12); tone(48,0.9,'sine',0.06); }
  glitchNow();
  fadeEl.classList.add('on');
  later(()=>fadeEl.classList.remove('on'),500);
  later(()=>{
    if (state.ending) return;
    state.scareUntil=0;
    say('照片里，站在你身后的，不是老妇。',4200);
    prompt('E 重新摆　/　Tab 记录　/　空格 起仪',5400);
    glitchNow();
  },2400);
}
function drawStandingOldWoman(ctx,x,y,t){
  // hallucination: the seated old woman, standing, too close.
  const sway=Math.sin(t*1.1)*1;
  ctx.save();
  glowEllipse(ctx,x,y-40,26,34,PAL.coolHi,0.045,'screen');
  dithEllipse(ctx,x+2,y+2,20,5,PAL.black,0.40,3);
  // long dark skirt
  pxPoly(ctx,[[x-14,y-1],[x-11,y-38],[x+11,y-38],[x+14,y-1]],PAL.grayDeep);
  pxPoly(ctx,[[x-10,y-2],[x-8,y-35],[x+8,y-35],[x+10,y-2]],PAL.gray);
  for (let i=0;i<3;i++) pxLine(ctx,x-6+i*6,y-34,x-7+i*7,y-3,PAL.grayDeep);
  // hunched blue jacket
  pxPoly(ctx,[[x-16,y-37],[x-14,y-58],[x-7,y-65],[x+7,y-65],[x+14,y-58],[x+16,y-37]],PAL.jacketDark);
  pxPoly(ctx,[[x-13,y-38],[x-11,y-57],[x-5,y-62],[x+5,y-62],[x+11,y-57],[x+13,y-38]],PAL.jacket);
  pxLine(ctx,x-12,y-39,x-10,y-56,PAL.jacketLit);
  pxLine(ctx,x+12,y-39,x+10,y-56,'rgba(240,190,120,.32)');
  pxLine(ctx,x-9,y-58,x+9,y-58,PAL.jacketLit);
  pxLine(ctx,x-3,y-62,x+3,y-62,'rgba(225,179,116,.35)');
  // hanging arms
  pxPoly(ctx,[[x-13,y-57],[x-17,y-52],[x-16,y-36],[x-11,y-38]],PAL.jacketDark);
  pxPoly(ctx,[[x+13,y-57],[x+17,y-52],[x+16,y-36],[x+11,y-38]],PAL.jacketDark);
  pxEllipse(ctx,x-15,y-35,3,4,PAL.skinDark);
  pxEllipse(ctx,x+15,y-35,3,4,PAL.skinDark);
  for (let i=0;i<3;i++){ pxLine(ctx,x-17+i,y-35,x-17+i,y-31,PAL.skin); pxLine(ctx,x+13+i,y-35,x+13+i,y-31,PAL.skin); }
  // head, hair, one milky eye
  pxEllipse(ctx,x,y-72,9,10,PAL.black);
  pxEllipse(ctx,x,y-72,7,8,PAL.grayDeep);
  pxEllipse(ctx,x,y-73,7,7,PAL.gray);
  pxEllipse(ctx,x-3,y-77,6,4,PAL.gray);
  pxEllipse(ctx,x+5,y-76,4,3,PAL.grayDeep);
  pxEllipse(ctx,x+6,y-77,2.5,1.8,PAL.grayLit);
  pxEllipse(ctx,x,y-71,5,6,PAL.skin);
  pxPoly(ctx,[[x-5,y-74],[x-4,y-68],[x-1,y-65],[x+3,y-66],[x+5,y-70],[x+4,y-74]],PAL.skin);
  pxLine(ctx,x-4,y-73,x-2,y-73,'rgba(70,44,32,.7)');
  pxLine(ctx,x+2,y-73,x+4,y-73,'rgba(70,44,32,.7)');
  r(ctx,x-4,y-72,2,1,PAL.eyeMilk); r(ctx,x-4,y-72,1,1,PAL.white);
  r(ctx,x+3,y-72,1,1,PAL.eyeDark);
  r(ctx,x-3,y-71,1,1,PAL.eyeDark);
  pxLine(ctx,x,y-72,x,y-68,PAL.skinDeep);
  pxLine(ctx,x-2,y-66,x+2,y-66,'#2a1814');
  r(ctx,x+2,y-67,1,1,'#5a3428');
  pxLine(ctx,x-6,y-74,x-3,y-76,'rgba(80,52,38,.5)');
  pxLine(ctx,x+3,y-76,x+6,y-75,'rgba(80,52,38,.35)');
  // cold rim, warm edge
  pxLine(ctx,x+8,y-78,x+8,y-66,'rgba(126,178,172,.30)');
  pxLine(ctx,x-8,y-78,x-9,y-67,'rgba(245,197,135,.32)');
  ctx.restore();
}
function glitchNow(){
  if (noGlitch || state.flashSafe){ state.glitch=0; return; }
  state.glitch=1; state.glitchAt=performance.now();
}
const OLD={x:8.5,y:2.5};
function nearWoman(){ return Math.hypot(state.wx-OLD.x,state.wy-OLD.y)<1.8; }
function nearDoor(){ return Math.hypot(state.wx-2.0,state.wy-0.6)<1.6; }
function blocked(wx,wy){
  if (wx<0.6||wx>11.4||wy<0.6||wy>8.4) return true;
  if (wx>5.8&&wx<9.2&&wy>3.8&&wy<6.2) return true; // table
  if (wx>7.7&&wx<9.3&&wy>1.7&&wy<3.3) return true; // old woman / chair
  return false;
}
function setCamera(on){
  if (state.scene!=='room') return;
  if (!state.started || state.ended || state.transition || state.review || state.paused || state.caseOpen) return;
  if (on){
    if (!state.camera && state.battery<8){ say('电量不够。等它回一点。',2400); return; }
    if (state.handRaised && state.uncannyDone && !state.mismatch){ startMismatch(); return; }
    if (state.choice && state.mismatch){ startSecondTake(); return; }
    if (state.camera || state.takes>=1) return;
    // The proximity/talk gate only teaches the first raise. After that the
    // player must be able to use the DV at the altar props (ch1/ch3), which are
    // far from her chair — gating those made the run unwinnable if the intro
    // dialogue was skipped.
    if (!state.firstCameraDone && !state.talked && !nearWoman()){ say('先走近她。',2200); return; }
    state.camera=true;
    if (!state.firstCameraDone){ state.firstCameraDone=true; }
    if (nearWoman() && !state.firstCameraDone){ state.closeupUntil=performance.now()+1500; glitchNow(); }
    camera.classList.add('on');
    dvBtn.classList.add('active');
    roleName.textContent='主观摄像机';
    modeEl.textContent='徐英子的 DV';
    camMeta.classList.remove('hidden');
    subjectEl.textContent='拍摄对象：谢雨洁';
    filmerEl.classList.remove('show');
    glitchNow();
    sCam();
    if (!state.revealed){
      state.revealed=true;
      playCue('cameraReveal');
      later(()=>{ if (state.camera) say('老妇：你在拍什么？',3200); },1300);
      later(()=>{ if (state.camera) filmerEl.classList.add('show'); },1100);
    } else {
      later(()=>{ if (state.camera) filmerEl.classList.add('show'); },500);
    }
    startDrone();
    updateVideoLayer();
    prompt('松开 F / 右键 放下 DV　·　M 静音　·　Esc 暂停',5200);
    if (huntScanMode()){
      state.hunt.seen=true;
      modeEl.textContent=state.chapter===2?'取景器 · 找她':'取景器 · 拍她';
      subjectEl.textContent='拍摄对象：她';
      filmerEl.classList.add('show');
      prompt('松开放下　·　'+(state.chapter===2?'对照房间找位置，E 确认':'L 快门'),5600);
      if (state.chapter===2){
        say('取景器：'+huntViewHint(state.hunt.pos)+'。',3200);
      } else {
        say('取景器里，她在'+HIDE_SPOTS[state.hunt.pos].label+'。',3000);
      }
    }
    if (anomalyScanMode()){
      state.scanTarget=scanTarget();
      state.scanStart=scanNow(); state.scanT=0; state.scanDone=false; state.scanRisked=false;
      modeEl.textContent='取景器 · 看错';
      subjectEl.textContent='拍摄对象：不对的地方';
      filmerEl.classList.add('show');
      prompt('保持 F　·　L 快门　·　Tab 记录',5600);
      say('取景器里，这里和第一遍不一样。',3000);
    }
    if (hideScanMode()){
      state.hide.seen=true;
      modeEl.textContent='取景器 · 她的视线';
      subjectEl.textContent='拍摄对象：她在看哪里';
      filmerEl.classList.add('show');
      prompt('松开放下　·　E 躲　·　别让她看见',5600);
      say('她正看着'+HIDE_SPOTS[state.hide.facing].label+'。',3000);
    }
    if (ritualScanMode()){
      state.scanTarget=scanTarget();
      state.scanStart=scanNow(); state.scanT=0; state.scanRisked=false;
      state.scanDone=!!(state.scanTarget && state.ritual.camSeen[state.scanTarget]);
      const nm={incense:'香炉',bowl:'水碗',thread:'门框'}[state.scanTarget]||'未对准';
      modeEl.textContent='取景器 · '+nm;
      subjectEl.textContent=state.scanTarget?'拍摄对象：'+nm:'拍摄对象：？';
      prompt(state.scanTarget?'保持 F 显影　·　松开放下　·　Tab 记录':'靠近香炉 / 水碗 / 门框再举起',6000);
      say(state.scanTarget?'取景器里，'+nm+'好像不止一层。':'没有对准。靠近香炉、水碗或门框。',3000);
    }
  } else {
    if (!state.camera) return;
    if (state.takes>=1) return;
    state.camera=false;
    state.scanStart=0; state.scanT=0;
    if (state.photoScarePending && !state.ending){
      state.photoScarePending=false;
      later(()=>{ if (!state.camera && !state.ending && !state.scareUntil) startPhotoScare(); },300);
    }
    camera.classList.remove('on');
    dvBtn.classList.remove('active');
    roleName.textContent='谢雨洁（重建）';
    modeEl.textContent='徐英子的记忆';
    camMeta.classList.add('hidden');
    glitchNow(); stopDrone(); sCam();
    updateVideoLayer();
    prompt('');
    if (state.chapter===2) prompt('F 取景器　/　E 靠近她',4200);
    if (state.chapter===3) prompt('F 看取景器　/　L 快门',4200);
    if (state.chapter===4) prompt('F 看她　/　E 躲',4200);
    updateChapterHUD();
    if (state.mismatch && !state.ending){
      state.choice=true;
      later(()=>{
        if (!state.ending){
          say('你放下摄影机。她的手还抬着。',3000);
          prompt('E 走向她　/　按住 F 继续拍');
        }
      },300);
      return;
    }
    if (!state.choice && !state.ending && !state.uncannyDone){
      state.choice=true;
      later(()=>{
        if (state.choice && !state.ending && !state.uncannyDone){
          say('你放下摄影机。她还在那里。',2400);
          later(()=>{ if (state.choice && !state.ending) triggerUncanny(); },1500);
        }
      },350);
    }
  }
}
function triggerUncanny(){
  if (state.ending || state.uncannyDone) return;
  state.uncannyDone=true; state.uncanny=true; state.front=true;
  playCue('uncanny');
  const name='谢雨洁（重建）', mode='徐英子的记忆';
  let n=0;
  clearInterval(state.uncannyTimer);
  state.uncannyTimer=setInterval(()=>{
    if (state.ending){ clearInterval(state.uncannyTimer); state.uncannyTimer=null; return; }
    roleName.textContent = n%2 ? '谢雨洁' : name;
    modeEl.textContent = n%2 ? '第三人称' : mode;
    n++;
    if (n>9){
      clearInterval(state.uncannyTimer); state.uncannyTimer=null;
      roleName.textContent=name; modeEl.textContent=mode;
    }
  },140);
  state.ritual.active=true;
  updateRitualHUD();
  say('你明明没有让她回头。',3200);
  later(()=>{ if (!state.ending) say('老妇：她总是这样回头。先把香、水、线摆回去。',4200); },3300);
  later(()=>{
    if (state.choice && !state.ending && !state.ritual.done) prompt('F 取景器显影　/　R 看旧带　/　E 调整供桌　/　Tab 记录',6200);
  },1800);
  reviewBtn.classList.remove('hidden');
}
function raiseHand(){
  if (state.scene!=='room' || state.inputLock) return;
  if (!state.uncannyDone || state.ending || state.camera || state.review || state.handRaised || state.caseOpen) return;
  if (state.chapter<5){ say(state.chapter===1?'先摆好供桌。':state.chapter===2?'先找到她。':state.chapter===3?'先拍异常。':'先躲好。',2400); return; }
  if (state.chapter===5 && !state.finalPhoto){ say('先拍她一张。',2400); return; }
  if (state.chapter===5 && !state.phoneDone){ say('先接电话。',2400); return; }
  if (state.ritual.active && !state.ritual.done){
    say('老妇：先摆好供桌。',2600);
    prompt('F 取景器　/　R 看旧带　/　E 调整香、水、线',5200);
    return;
  }
  state.handRaised=true; state.front=true;
  say('她抬起手。指尖缠着白胶布。',3200);
  prompt('按住 F 看她抬的是哪只手');
  sClick();
  later(()=>{ if (!state.ending && state.handRaised) say('老妇：对，就是这只。',2800); },1600);
}
function startMismatch(){
  if (state.ending || state.mismatch) return;
  state.mismatch=true; state.camera=true;
  camera.classList.add('on');
  dvBtn.classList.add('active');
  roleName.textContent='主观摄像机';
  modeEl.textContent='徐英子的 DV';
  camMeta.classList.remove('hidden');
  subjectEl.textContent='拍摄对象：谢雨洁';
  filmerEl.classList.add('show');
  glitchNow(); sCam(); startDrone();
  playCue('mismatch');
  prompt('松开 F 放下 DV　·　R 回看　·　Esc 暂停',4200);
  reviewBtn.classList.remove('hidden');
  updateVideoLayer();
  later(startRetroDisplay,0);
  say('取景器里，她抬的是另一只手。',3600);
}
function startSecondTake(){
  if (state.ending || state.takes>=1) return;
  state.takes=1; state.choice=false;
  state.camera=true;
  camera.classList.add('on');
  dvBtn.classList.add('active');
  roleName.textContent='主观摄像机';
  modeEl.textContent='徐英子的 DV';
  camMeta.classList.remove('hidden');
  subjectEl.textContent='拍摄对象：谢雨洁';
  filmerEl.classList.add('show');
  glitchNow(); sCam(); startDrone();
  updateVideoLayer();
  prompt('松开 F 放下 DV',3600);
  later(startRetroDisplay,0);
  say('这不是你刚才拍的那一条。',3200);
  later(()=>{ if (!state.ending) choose('film'); },3600);
}
function canReview(){
  return state.scene==='room' && state.started && !state.ending
    && (state.uncannyDone || state.mismatch || state.ch3FrameGate);
}
function stepLookFrame(dir){
  if (!dir) return;
  state.lookFrame=Math.max(0,Math.min(7,(state.lookFrame||0)+dir));
  playMedia('clock',0.18,0.01);
  renderTimeline();
  if (state.lookFrame===5 && state.ch3FrameGate && !state.ch3FrameOk){
    state.ch3FrameOk=true;
    state.blinkSaid=true;
    playMedia('scanPing',0.28,0.03);
    say('……闭眼了。带子和房间对上了。',3600);
    prompt('R 退出回看',4800);
  } else if (state.lookFrame===5 && (state.reviewCount||0)>=2 && !state.blinkSaid){
    state.blinkSaid=true;
    say('……她刚才，是不是闭眼了？',3400);
  }
}
function reviewTimecode(){
  switch(state.reviewKind){    case 'normal': return '00:18:06';
    case 'look': return '00:41:'+String(12+(state.lookFrame||0)).padStart(2,'0');
    case 'mismatch': return '00:42:30';
    case 'gap': return '00:18:07—00:41:11';
    default: return '--:--:--';
  }
}
function renderTimeline(){
  if (FUZZ_ACTIVE) return;
  tlHead.style.left=(Math.max(0,Math.min(1,state.reviewPos))*100)+'%';
  tlTime.textContent=reviewTimecode();
  tlMode.textContent=state.reviewKind==='gap'
    ? '回看 · 空白'
    : (state.reviewKind==='look'||state.reviewKind==='static') ? '回看 · PAUSE' : '回看 · PLAY';
  tlReconBar.style.left=(10+state.reconOffset*100)+'%';
  tlReconBar.style.width='80%';
  tlReconBar.classList.toggle('aligned',state.reconAligned);
  tlDelta.textContent=state.reconAligned
    ? '对齐 · 补上的 23:06'
    : `偏移 ${state.reconOffset>=0?'+':''}${Math.round(state.reconOffset*100)}%`;
}
function setReconOffset(v){
  if (state.reviewKind==='gap' && state.reviewQuiz && !state.reviewQuiz.locked){
    say('先校验带子：哪一年、缺了哪一帧、门牌上是谁。',3400);
    return;
  }
  state.reconOffset=Math.max(-0.18,Math.min(0.18,v));
  if (Math.abs(state.reconOffset)<0.015){
    state.reconOffset=0;
    if (!state.reconEver){
      state.reconEver=true;
      say('对上了。这 23 分钟是重建补的。',3800);
      prompt('P 看这段重建　/　R 退出');
    }
    state.reconAligned=true;
  } else {
    state.reconAligned=false;
  }
  renderTimeline();
}
function reviewPick(n){
  if (!state.review || state.reviewKind!=='gap' || !state.reviewQuiz || state.reviewQuiz.locked) return;
  const step=state.reviewQuiz.step;
  const item=REVIEW_QUIZ[step];
  if (!item) return;
  if (n-1===item.ans){
    state.reviewQuiz.step++;
    if (state.reviewQuiz.step>=REVIEW_QUIZ.length){
      state.reviewQuiz.locked=true;
      say('磁带 1999，缺的是白胶布的手。门牌上的名字是徐英子。补帧。',4200);
      prompt('拖动重建条对齐　/　Q / E 微调　/　P 分屏',5200);
    } else {
      const next=REVIEW_QUIZ[state.reviewQuiz.step];
      say('1999。下一题：'+next.q,3200);
      prompt(next.opts.map((o,i)=>(i+1)+' '+o).join('　'),4600);
    }
    sClick();
  } else {
    state.reviewQuiz.wrong++;
    glitchNow();
    playMedia('oldBreath',0.45,0.04);
    say('不对。带子不是这么剪的。',3000);
  }
}
function updateReviewKind(){
  const p=state.reviewPos;
  let k='static';
  if (p<0.14) k='static';
  else if (p<0.22) k='normal';
  else if (p<0.60) k='gap';
  else if (p<0.70) k='look';
  else if (p<0.80) k='mismatch';
  else k='static';
  state.reviewKind=k;
  if (k==='normal' && state.ritual.active && !state.ritual.done && !state.ritual.seen){
    state.ritual.seen=true;
    updateRitualHUD();
  }
  if (k!=='gap') state.reviewSplit=false;
  if (k==='gap' && !state.reviewFoundGap){
    state.reviewFoundGap=true;
    playCue('reviewGap');
    say('这段没有录到。23 分 06 秒。',4200);
    prompt(REVIEW_QUIZ[0].opts.map((o,i)=>(i+1)+' '+o).join('　')+'　/　A / D 倒带');
  }
  renderTimeline();
}
function toggleReviewSplit(){
  if (!state.review || state.reviewKind!=='gap') return;
  state.reviewSplit=!state.reviewSplit;
  prompt(state.reviewSplit?'P 关掉重建　/　A / D 继续倒带':'P 看重建　/　A / D 继续倒带');
  say(state.reviewSplit?'素材是空的；重建有画面。':'你关掉了重建。',2600);
}
function startReview(){
  if (state.scene!=='room' || state.transition || !canReview() || state.review) return;
  if (state.camera){
    state.camera=false;
    camera.classList.remove('on');
    dvBtn.classList.remove('active');
  }
  state.review=true;
  state.reviewCount=(state.reviewCount||0)+1;
  state.blinkSaid=false;
  state.reviewPos=0.15;
  state.reviewSplit=false;
  state.reviewKind='normal';
  state.reconOffset=0.08;
  state.reconAligned=false;
  state.reconEver=false;
  state.reconDragging=false;
  state.reviewQuiz={step:0,locked:false,wrong:0};
  state.glitch=0;
  camera.classList.add('on');
  roleName.textContent='回看';
  modeEl.textContent='徐英子的 DV';
  camMeta.classList.remove('hidden');
  subjectEl.textContent='拍摄对象：谢雨洁';
  filmerEl.classList.add('show');
  reviewBtn.classList.add('active');
  timelineEl.classList.remove('hidden');
  stage.classList.add('reviewing');
  prompt('');
  subtitleEl.classList.add('hidden');
  cancelLater(subtitleTimer);
  updateReviewKind();
  renderTimeline();
  updateVideoLayer();
  // Review is pixel-tape playback; it does not use the video layer, but it
  // still needs the CRT shader over the camera canvas.
  later(startRetroDisplay,0);
  if (state.ch3FrameGate){
    state.reviewPos=0.65;
    state.reviewKind='look';
    state.lookFrame=0;
    state.blinkSaid=false;
    renderTimeline();
    say('你停在 '+reviewTimecode()+'。她那一下，是不是闭眼了？',4000);
    prompt('A / D 逐帧　/　R 退出',5200);
  } else {
    say('A / D 倒带。看看带子里有什么。',3600);
  }
}
function exitReview(){
  if (!state.review) return;
  state.review=false;
  state.reviewSplit=false;
  camera.classList.remove('on');
  syncCameraOverlay();
  updateVideoLayer();
  timelineEl.classList.add('hidden');
  stage.classList.remove('reviewing');
  roleName.textContent='谢雨洁（重建）';
  modeEl.textContent='徐英子的记忆';
  camMeta.classList.add('hidden');
  reviewBtn.classList.remove('active');
  if (state.ch3FrameGate){
    if (state.ch3FrameOk){
      state.ch3FrameGate=false;
      say('带子对上了。她站起来了。',3200);
      later(()=>{ if (!state.ending) startChapter(4); },900);
    } else {
      prompt('R 回看　/　A D 停在闭眼那一帧',4800);
      say('还没停在闭眼那一帧。',2800);
    }
    return;
  }
  prompt('E 走向她　/　按住 F 继续拍　/　R 回看');
  say('你按下暂停。',2200);
  if (state.ritual.active && !state.ritual.done && !state.ending){
    state.ritual.reviews=(state.ritual.reviews||0)+1;
    if (state.ritual.reviews===1) playMedia('oldBreath',0.30,0.05);
    if (state.ritual.reviews>=2 && !state.ritual.eyeSaid){
      state.ritual.eyeSaid=true;
      playMedia('oldBreath',0.55,0.05);
      later(()=>{ if (!state.ending && !state.review) say('……别回头。',3000); },550);
    }
  }
}
function drawNoise(ctx,x,y,w,h,n=160){
  ctx.save();
  for (let i=0;i<n;i++){
    const v=Math.random();
    ctx.fillStyle=v>.72?'rgba(220,220,210,.18)':'rgba(120,120,110,.12)';
    ctx.fillRect(x+Math.random()*w,y+Math.random()*h,1+Math.random()*2,1);
  }
  ctx.restore();
}
function ditherImage(ctx,w,h,levels=6,amount=0.6){
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const bay=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  const step=255/(levels-1);
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const i=(y*w+x)*4;
      const t=(bay[(y&3)*4+(x&3)]/16-0.5)*step*amount;
      for (let c=0;c<3;c++){
        let v=d[i+c]+t;
        v=Math.round(v/step)*step;
        d[i+c]=v<0?0:v>255?255:v;
      }
    }
  }
  ctx.putImageData(img,0,0);
}
function cameraTimecode(opts){
  if (opts.timecode) return opts.timecode;
  const looking=opts.looking!==undefined?opts.looking:state.takes>=1;
  const mismatch=opts.mismatch!==undefined?opts.mismatch:state.mismatch;
  return mismatch?'00:42:30':looking?'00:41:12':'00:18:06';
}

// ===== pixel-art DV footage, 320x240 =====

// A dedicated close-up for the pixel fallback: the old woman's face fills ~1/3 of the DV frame.
function drawFaceCover(ctx,W,H,opts={}){
  if (!(FACE_CLOSEUP_IMG.complete && FACE_CLOSEUP_IMG.naturalWidth)) return false;
  const frame=opts.frame||0;
  const sw=FACE_CLOSEUP_IMG.naturalWidth, sh=FACE_CLOSEUP_IMG.naturalHeight;
  const zoom=1+(frame%2)*0.012;
  const scale=Math.max(W/sw,H/sh)*zoom;
  const w=sw*scale, h=sh*scale;
  const dx=(frame%3-1)*1.5, dy=(frame%2)*1.5;
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(FACE_CLOSEUP_IMG,(W-w)/2+dx,(H-h)/2+dy,w,h);
  ctx.globalCompositeOperation='screen';
  ctx.fillStyle='rgba(70,120,140,.05)'; ctx.fillRect(0,0,W,H);
  ctx.restore();
  // slight per-frame exposure drift
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,'+(0.02+(frame%3)*0.015).toFixed(3)+')'; ctx.fillRect(0,0,W,H);
  ctx.restore();
  // one anomalous frame: the milky eye closes
  if (frame===5 && (state.reviewCount||0)>=2){
    const ex=W*0.40, ey=H*0.42, ew=W*0.105, eh=H*0.045;
    ctx.save();
    ctx.fillStyle='#8a5f4a'; ctx.fillRect(ex-ew/2,ey-eh/2,ew,eh);
    ctx.fillStyle='#5a3a2c'; ctx.fillRect(ex-ew/2,ey+eh/2-1,ew,1);
    ctx.fillStyle='#b08062'; ctx.fillRect(ex-ew/2+1,ey-eh/2+1,ew-2,1);
    ctx.restore();
  }
  return true;
}
function drawCameraFaceCloseup(ctx,t){
  // use the desktop-generated 480x270 portrait as the cut-in when available
  if (drawFaceCover(ctx,640,480)) return;
  // drawn fallback (only used if the reference PNG is missing)
  // soot background with a faint warm halo behind the head
  ctx.fillStyle='#050506'; ctx.fillRect(0,0,640,480);
  ctx.save(); ctx.globalCompositeOperation='screen';
  ctx.fillStyle='rgba(120,80,34,.10)'; ctx.beginPath(); ctx.arc(330,220,180,0,7); ctx.fill();
  ctx.fillStyle='rgba(90,150,160,.05)'; ctx.fillRect(0,0,160,480);
  ctx.restore();
  // shoulders / faded blue high-collar jacket
  ctx.fillStyle='#1a2a32';
  ctx.beginPath(); ctx.moveTo(90,480); ctx.lineTo(150,360); ctx.quadraticCurveTo(240,320,330,320);
  ctx.quadraticCurveTo(430,320,500,360); ctx.lineTo(560,480); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#2e4a5a';
  ctx.beginPath(); ctx.moveTo(120,480); ctx.lineTo(175,372); ctx.quadraticCurveTo(250,340,330,340);
  ctx.quadraticCurveTo(420,340,485,372); ctx.lineTo(530,480); ctx.closePath(); ctx.fill();
  // collar
  ctx.fillStyle='#3f5f6e'; ctx.beginPath(); ctx.moveTo(250,340); ctx.lineTo(330,380); ctx.lineTo(410,340); ctx.lineTo(400,318); ctx.lineTo(330,350); ctx.lineTo(260,318); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#1a2a32'; ctx.fillRect(324,345,12,8);
  ctx.fillStyle='#8a6a38'; ctx.fillRect(327,347,6,4);
  // hair / bun
  ctx.fillStyle='#2a2a28'; ctx.beginPath(); ctx.ellipse(330,150,110,80,0,0,7); ctx.fill();
  ctx.fillStyle='#565650'; ctx.beginPath(); ctx.ellipse(330,150,96,68,0,0,7); ctx.fill();
  ctx.fillStyle='#86867c'; ctx.beginPath(); ctx.ellipse(300,120,62,40,-0.1,0,7); ctx.fill();
  ctx.fillStyle='#b4b1a2'; ctx.beginPath(); ctx.ellipse(286,108,34,20,-0.15,0,7); ctx.fill();
  ctx.fillStyle='#2a2a28'; ctx.beginPath(); ctx.ellipse(390,96,42,34,0.1,0,7); ctx.fill();
  ctx.fillStyle='#565650'; ctx.beginPath(); ctx.ellipse(392,98,34,26,0.1,0,7); ctx.fill();
  ctx.fillStyle='#86867c'; ctx.beginPath(); ctx.ellipse(396,94,22,16,0.1,0,7); ctx.fill();
  // face
  ctx.fillStyle='#5a3a2c'; ctx.beginPath(); ctx.ellipse(330,225,98,120,0,0,7); ctx.fill();
  ctx.fillStyle='#8a5f4a'; ctx.beginPath(); ctx.ellipse(330,228,90,112,0,0,7); ctx.fill();
  ctx.fillStyle='#b08062'; ctx.beginPath(); ctx.ellipse(310,220,62,100,-0.05,0,7); ctx.fill();
  // jaw / chin shadow
  ctx.fillStyle='#5a3a2c'; ctx.beginPath(); ctx.ellipse(330,324,58,20,0,0,7); ctx.fill();
  // forehead / cheek wrinkles
  ctx.strokeStyle='rgba(58,36,28,.55)'; ctx.lineWidth=1;
  for (const y of [120,136,152]){ ctx.beginPath(); ctx.moveTo(270,y); ctx.quadraticCurveTo(330,y-6,390,y); ctx.stroke(); }
  for (const y of [270,286]){ ctx.beginPath(); ctx.moveTo(250,y); ctx.quadraticCurveTo(280,y+8,300,y+4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(360,y+4); ctx.quadraticCurveTo(385,y+8,410,y); ctx.stroke(); }
  // brows
  ctx.strokeStyle='#3a241c'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(258,190); ctx.quadraticCurveTo(280,180,306,188); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(354,188); ctx.quadraticCurveTo(380,180,404,190); ctx.stroke();
  // eye sockets
  ctx.fillStyle='rgba(58,36,28,.35)';
  ctx.beginPath(); ctx.ellipse(280,206,32,18,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(380,206,32,18,0,0,7); ctx.fill();
  // milky blind eye (left)
  ctx.fillStyle='#d8d6c2'; ctx.beginPath(); ctx.ellipse(280,206,26,13,0,0,7); ctx.fill();
  ctx.fillStyle='#c8c8b8'; ctx.beginPath(); ctx.arc(280,206,10,0,7); ctx.fill();
  ctx.fillStyle='#6a6a5a'; ctx.beginPath(); ctx.arc(280,206,4,0,7); ctx.fill();
  ctx.fillStyle='rgba(255,255,240,.6)'; ctx.fillRect(266,199,7,3);
  // dark eye (right)
  ctx.fillStyle='#e8dcc8'; ctx.beginPath(); ctx.ellipse(380,206,26,13,0,0,7); ctx.fill();
  ctx.fillStyle='#3a2418'; ctx.beginPath(); ctx.arc(380,206,10,0,7); ctx.fill();
  ctx.fillStyle='#120c08'; ctx.beginPath(); ctx.arc(380,206,6,0,7); ctx.fill();
  ctx.fillStyle='rgba(255,245,225,.9)'; ctx.fillRect(384,200,4,3);
  // under-eye bags
  ctx.strokeStyle='rgba(58,36,28,.45)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(254,222); ctx.quadraticCurveTo(280,232,306,222); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(354,222); ctx.quadraticCurveTo(380,232,406,222); ctx.stroke();
  // nose
  ctx.fillStyle='#6a4636'; ctx.beginPath(); ctx.moveTo(326,214); ctx.lineTo(316,268); ctx.lineTo(338,272); ctx.lineTo(340,268); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#3a241c'; ctx.beginPath(); ctx.ellipse(318,274,8,4,0.2,0,7); ctx.fill(); ctx.beginPath(); ctx.ellipse(340,274,8,4,-0.2,0,7); ctx.fill();
  // asymmetric shallow smile
  ctx.strokeStyle='#3a241c'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(292,306); ctx.quadraticCurveTo(330,318,378,300); ctx.stroke();
  ctx.strokeStyle='#5a3428'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(300,308); ctx.quadraticCurveTo(330,316,360,306); ctx.stroke();
  ctx.fillStyle='#6a3a30'; ctx.fillRect(326,309,22,3);
  // warm rim on the left cheek, cold rim on the right
  ctx.save(); ctx.globalCompositeOperation='screen';
  ctx.strokeStyle='rgba(240,190,120,.35)'; ctx.lineWidth=5;
  ctx.beginPath(); ctx.ellipse(330,228,96,116,0,Math.PI*0.7,Math.PI*1.3); ctx.stroke();
  ctx.strokeStyle='rgba(90,150,170,.42)'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.ellipse(330,228,96,116,0,Math.PI*1.6,Math.PI*2.2); ctx.stroke();
  ctx.restore();
  // a few gray wisps
  ctx.strokeStyle='rgba(180,177,162,.5)'; ctx.lineWidth=1;
  for (const [x0,y0,x1,y1] of [[236,170,220,198],[424,168,438,194],[250,138,236,118]]){ ctx.beginPath(); ctx.moveTo(x0,y0); ctx.quadraticCurveTo((x0+x1)/2,y0-8,x1,y1); ctx.stroke(); }
}
function drawCameraPixelScene(ctx,t,opts={}){
  const W=640,H=480;
  const looking=opts.looking!==undefined?opts.looking:state.takes>=1;
  const mismatch=opts.mismatch!==undefined?opts.mismatch:state.mismatch;
  const P={
    ink:'#060706', wall:'#25261f', wall2:'#1b1c16', wall3:'#2e2f26',
    floor:'#12130f', floor2:'#0c0d0a',
    wood:'#4a3523', wood2:'#2f2115', wood3:'#6a4e30',
    win:'#2a4248', win2:'#3f6066', rain:'#7a9aa0',
    skin:'#a87e62', skin2:'#8a634c', skin3:'#c49a78', skin4:'#6e4d3a',
    hair:'#0d0a08', hair2:'#1c1511', hair3:'#33261c',
    blouse:'#a59d88', blouse2:'#8a8270', blouse3:'#c0b8a0',
    red:'#5a1e18', red2:'#7a2a22', red3:'#3a100c',
    shawl:'#1a1a15', shawl2:'#24241d', shawl3:'#0f0f0c',
    jacket:'#2e4a5a', jacket2:'#3f5f6e', jacket3:'#1a2a32',
    eyeMilk:'#d8d6c2', eyeDark:'#12100c',
    gray:'#8f8a7c', gray2:'#b5af9d', gray3:'#6a6558',
    dv:'#0b0b09', dv2:'#151513', lens:'#2a3d40', lens2:'#5a7a80',
    tape:'#d8d2c0', warm:'#e8c27a', warm2:'#ffedc0'
  };
  ctx.clearRect(0,0,W,H);

  // ---- room ----
  r(ctx,0,0,W,H,P.wall);
  for (let x=0;x<W;x+=40) r(ctx,x,0,1,H,P.wall2);
  for (let y=0;y<H;y+=54) r(ctx,0,y,W,1,'rgba(0,0,0,.18)');
  // stains / knots
  r(ctx,120,150,60,20,'rgba(20,30,24,.18)');
  r(ctx,380,90,80,26,'rgba(40,30,18,.16)');
  r(ctx,200,220,2,2,'#171811'); r(ctx,300,140,2,2,'#171811');
  // floor
  r(ctx,0,380,W,100,P.floor);
  for (let y=388;y<H;y+=12) r(ctx,0,y,W,1,P.floor2);
  for (let i=-4;i<12;i++){ ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(320+i*50,380); ctx.lineTo(320+i*110,480); ctx.stroke(); }

  // window
  r(ctx,94,78,124,104,P.wood2);
  r(ctx,100,84,112,92,P.win);
  for (let i=0;i<18;i++) r(ctx,104+((i*17)%104),88+((i*13)%84),1,7,P.rain);
  r(ctx,94,78,124,3,P.wood3); r(ctx,94,176,124,4,P.wood3); r(ctx,152,78,3,102,P.wood3);
  ctx.save(); ctx.globalCompositeOperation='screen';
  ctx.fillStyle='rgba(90,150,160,.07)'; ctx.fillRect(70,60,180,150);
  ctx.restore();

  // shelf
  r(ctx,416,96,190,10,P.wood2);
  r(ctx,416,96,190,2,P.wood3);
  for (let i=0;i<5;i++){
    const x=430+i*34;
    r(ctx,x,64,20,32,'#2a2418'); r(ctx,x+3,58,14,8,'#4a3a22');
    r(ctx,x+7,68,3,16,'rgba(180,160,110,.25)');
  }
  r(ctx,574,70,5,5,'#8e2a22');

  // table
  r(ctx,88,316,340,14,P.wood);
  r(ctx,88,316,340,3,P.wood3);
  r(ctx,88,330,340,5,P.wood2);
  r(ctx,112,335,14,110,P.wood2); r(ctx,390,335,14,110,P.wood2);
  r(ctx,190,312,140,5,P.red);
  for (let i=0;i<8;i++) r(ctx,100+i*36,322,30,1,'rgba(40,28,16,.35)');
  // bowls / cup / candle / incense
  r(ctx,150,300,68,12,'#2a2014'); r(ctx,156,294,54,8,'#8a7a58'); r(ctx,164,290,38,5,'#c9b98e');
  r(ctx,300,286,20,20,'#b9b09a'); r(ctx,302,286,16,3,'#e6ddc8');
  r(ctx,370,300,52,12,'#2a2014'); r(ctx,376,296,40,6,'#8a7a58');
  r(ctx,250,292,8,20,'#7a1f1a'); r(ctx,252,296,4,10,'#c04a38');
  r(ctx,252,282,4,10,'#ffcf8a'); r(ctx,253,278,2,5,'#fff2c8');
  ctx.save(); ctx.globalCompositeOperation='screen'; ctx.fillStyle='rgba(255,180,90,.12)'; ctx.fillRect(220,250,80,80); ctx.restore();
  r(ctx,336,270,2,46,'#7a5a3a'); r(ctx,344,278,2,38,'#7a5a3a');
  r(ctx,336,266,2,4,'#e8a060'); r(ctx,344,274,2,4,'#e8a060');
  ctx.save(); ctx.globalAlpha=.25;
  for (let i=0;i<6;i++){ r(ctx,337-i,258-i*5,1,1,'#c9bfa4'); r(ctx,345+i,266-i*5,1,1,'#c9bfa4'); }
  ctx.restore();

  // door
  r(ctx,0,108,78,280,'#0a0907');
  r(ctx,0,108,78,5,P.wood2); r(ctx,74,108,4,280,P.wood2);
  r(ctx,8,120,58,256,'#171009');
  r(ctx,60,132,7,70,'#6a1f1a'); r(ctx,62,138,3,18,'#c9bfa4');

  // bulb
  r(ctx,320,8,2,30,'#1a160f');
  r(ctx,314,38,14,12,P.warm); r(ctx,317,40,8,8,P.warm2);
  ctx.save(); ctx.globalCompositeOperation='screen';
  ctx.fillStyle='rgba(255,205,130,.12)'; ctx.fillRect(250,50,140,130);
  ctx.fillStyle='rgba(255,205,130,.05)'; ctx.fillRect(160,120,320,260);
  ctx.restore();

  // ---- old woman ----
  // faded blue jacket (scaled up so the face reads at the DV's 640x480)
  ctx.save(); ctx.translate(505,300); ctx.scale(1.16,1.16); ctx.translate(-505,-300);
  r(ctx,438,300,150,180,P.jacket3);
  r(ctx,444,306,138,168,P.jacket);
  r(ctx,430,360,166,120,P.jacket3);
  for (let i=0;i<5;i++) r(ctx,452+i*26,312,6,160,P.jacket3);
  // high collar + front placket
  r(ctx,452,308,120,12,P.jacket3);
  r(ctx,470,318,84,6,P.jacket2);
  r(ctx,470,312,84,4,P.jacket2);
  r(ctx,486,306,10,3,P.jacket2);
  for (let i=0;i<4;i++) r(ctx,510,336+i*26,2,2,'#8a6a38');
  r(ctx,508,326,6,2,'#8a6a38');
  // head hair
  r(ctx,476,216,36,10,P.gray);
  r(ctx,468,224,12,26,P.gray);
  r(ctx,508,224,12,26,P.gray);
  r(ctx,512,206,18,18,P.gray3);
  r(ctx,516,210,10,10,P.gray2);
  r(ctx,480,220,26,4,P.gray2);
  // face
  r(ctx,476,232,36,6,P.skin3);
  r(ctx,470,238,48,34,P.skin);
  r(ctx,474,272,40,10,P.skin2);
  r(ctx,480,282,28,6,P.skin4);
  r(ctx,500,238,18,34,P.skin2);
  r(ctx,508,244,10,26,P.skin4);
  // ears
  r(ctx,466,252,6,14,P.skin2); r(ctx,514,252,6,14,P.skin2);
  // eye sockets / eyes
  r(ctx,480,246,16,8,'rgba(60,36,26,.45)');
  r(ctx,498,246,16,8,'rgba(60,36,26,.45)');
  // one milky blind eye (left), one dark eye (right)
  r(ctx,484,248,9,3,P.eyeMilk); r(ctx,502,248,9,3,'#e8dcc8');
  r(ctx,488,248,3,3,'#c8c8b8'); r(ctx,506,248,3,3,'#3a2418');
  r(ctx,489,248,1,1,'#6a6a5a'); r(ctx,507,248,1,1,'#120c08');
  r(ctx,490,247,1,1,'#f2f0e2'); r(ctx,508,247,1,1,'rgba(255,245,225,.9)');
  r(ctx,485,249,2,1,'rgba(255,255,240,.45)');
  // brows
  r(ctx,480,242,14,2,'rgba(50,30,20,.55)'); r(ctx,500,242,14,2,'rgba(50,30,20,.55)');
  // nose
  r(ctx,496,252,3,12,P.skin2); r(ctx,494,262,7,2,P.skin4);
  r(ctx,494,264,2,1,P.skin4); r(ctx,501,264,2,1,P.skin4);
  // mouth: faint asymmetric smile, one corner higher
  r(ctx,489,272,20,1,'#3a241c');
  r(ctx,492,273,8,1,'#5a3428');
  r(ctx,507,271,1,1,'#3a241c');
  r(ctx,487,271,2,1,'#3a241c');
  // wrinkles
  r(ctx,478,238,10,1,'rgba(60,36,26,.35)'); r(ctx,504,238,10,1,'rgba(60,36,26,.35)');
  r(ctx,476,258,6,1,'rgba(60,36,26,.3)'); r(ctx,510,258,6,1,'rgba(60,36,26,.3)');
  r(ctx,480,278,6,1,'rgba(60,36,26,.25)'); r(ctx,500,278,6,1,'rgba(60,36,26,.25)');
  // warm rim on the left
  r(ctx,468,236,2,40,'rgba(255,205,150,.28)');
  r(ctx,472,218,2,16,'rgba(255,205,150,.18)');
  // cane
  r(ctx,574,320,5,160,P.wood2);
  ctx.restore();

  // ---- Xie from behind (skipped in the reconstruction scan) ----
  if (!opts.scan){
  // skirt
  r(ctx,316,384,76,86,P.red);
  r(ctx,316,384,76,5,P.red2);
  r(ctx,316,462,76,8,P.red3);
  for (let i=0;i<3;i++) r(ctx,328+i*20,392,4,72,P.red3);
  r(ctx,320,390,6,60,'rgba(180,80,60,.18)');
  // blouse
  r(ctx,312,316,76,76,P.blouse);
  r(ctx,312,316,76,5,P.blouse3);
  r(ctx,312,380,76,12,P.blouse2);
  r(ctx,348,320,2,66,P.blouse2);
  r(ctx,316,336,5,40,P.blouse3);
  r(ctx,382,336,4,40,P.blouse2);
  // shoulder blades
  r(ctx,322,340,18,24,'rgba(120,104,78,.14)'); r(ctx,360,340,18,24,'rgba(120,104,78,.14)');
  // sleeves
  r(ctx,300,322,14,22,P.blouse2); r(ctx,386,322,14,22,P.blouse2);
  // arms
  r(ctx,302,344,10,58,P.skin); r(ctx,388,344,10,58,P.skin);
  r(ctx,302,390,10,14,P.skin2); r(ctx,388,390,10,14,P.skin2);
  // right hand + tape
  r(ctx,388,398,10,14,P.skin3); r(ctx,390,400,6,10,P.tape); r(ctx,390,404,6,2,'#b8b2a0');
  // neck / nape
  r(ctx,332,306,36,14,P.skin2);
  r(ctx,336,314,28,8,P.skin4);
  // head back hair
  r(ctx,326,238,52,6,P.hair);
  r(ctx,320,244,64,8,P.hair);
  r(ctx,314,252,76,44,P.hair);
  r(ctx,318,296,68,10,P.hair);
  r(ctx,326,306,52,6,P.hair);
  r(ctx,332,246,40,52,P.hair2);
  r(ctx,338,242,28,8,P.hair3);
  // hair shine
  r(ctx,330,256,4,40,'rgba(120,95,70,.28)');
  r(ctx,336,250,18,2,'rgba(120,95,70,.22)');
  for (let i=0;i<4;i++) r(ctx,326+i*8,258,2,38,'rgba(80,60,44,.18)');
  // nape hairline
  r(ctx,326,306,52,6,P.hair);

  }
  // profile if she turns to the lens
  if (looking){
    r(ctx,380,250,22,10,P.skin3);
    r(ctx,376,260,28,44,P.skin);
    r(ctx,392,264,16,36,P.skin2);
    r(ctx,404,276,8,18,P.skin4);
    // hair over the profile
    r(ctx,372,248,16,54,P.hair);
    r(ctx,368,256,10,42,P.hair2);
    // eye
    r(ctx,390,276,12,5,'#ece0cc');
    r(ctx,396,276,4,5,'#5a3d2a');
    r(ctx,398,276,2,5,'#120c08');
    r(ctx,398,275,1,1,'rgba(255,245,225,.9)');
    r(ctx,388,272,14,2,'rgba(40,24,16,.8)');
    // nose / lips
    r(ctx,404,284,4,12,P.skin2);
    r(ctx,402,296,8,2,P.skin4);
    r(ctx,398,302,10,2,'#8a4a44');
    r(ctx,400,304,6,1,'#b86b5f');
    // jaw shadow / rim
    r(ctx,388,306,18,3,'rgba(90,55,38,.25)');
    r(ctx,406,270,2,30,'rgba(255,205,150,.3)');
  }

  if (mismatch){
    // left arm raised, no tape
    r(ctx,294,312,18,18,P.blouse2);
    r(ctx,286,284,12,34,P.skin);
    r(ctx,280,262,12,26,P.skin);
    r(ctx,276,250,12,14,P.skin3);
    r(ctx,278,244,2,8,P.skin3); r(ctx,282,242,2,10,P.skin3); r(ctx,286,244,2,8,P.skin3);
    // right hand with tape down
    r(ctx,388,398,10,14,P.skin3); r(ctx,390,400,6,10,P.tape);
  }

  // ---- Xu's hand + DV ----
  r(ctx,468,408,158,70,'#050504');
  r(ctx,474,414,140,56,P.dv2);
  r(ctx,470,408,154,4,'#1e1e1a');
  r(ctx,470,472,154,4,'#0a0a08');
  // lens
  r(ctx,490,424,44,44,'#060605');
  r(ctx,496,430,32,32,P.lens);
  r(ctx,500,434,24,24,P.lens2);
  r(ctx,504,438,10,10,'#7a9aa0');
  r(ctx,504,438,4,4,'rgba(220,240,240,.6)');
  r(ctx,520,448,2,6,'rgba(220,240,240,.35)');
  // rec / screen
  r(ctx,540,416,8,8,'#e1543e'); r(ctx,542,418,4,4,'#ff8a70');
  r(ctx,556,434,40,24,'#0e1412'); r(ctx,558,436,36,20,'#2a3a32');
  r(ctx,562,440,12,8,'rgba(220,200,160,.5)'); r(ctx,578,444,8,6,'rgba(150,80,60,.4)');
  // fist gripping the DV
  // wrist / sleeve
  r(ctx,608,444,32,36,'#0a0908');
  r(ctx,606,444,6,36,'#1a1814');
  r(ctx,612,450,2,24,'rgba(90,74,54,.18)');
  // back of the hand
  r(ctx,556,406,64,8,P.skin3);
  r(ctx,552,412,72,36,P.skin);
  r(ctx,556,444,64,18,P.skin2);
  r(ctx,560,412,52,12,P.skin3);
  // knuckles
  for (let i=0;i<4;i++){
    r(ctx,560+i*14,402,10,10,P.skin3);
    r(ctx,561+i*14,410,8,3,'rgba(60,30,20,.28)');
  }
  // finger tips curling around the left edge
  for (let i=0;i<4;i++){
    r(ctx,544,414+i*9,12,7,P.skin2);
    r(ctx,544,414+i*9,4,5,P.skin3);
    r(ctx,546,420+i*9,10,1,'rgba(60,30,20,.2)');
  }
  // thumb
  r(ctx,540,424,12,22,P.skin3);
  r(ctx,542,428,6,14,P.skin);
  r(ctx,541,425,4,3,'rgba(235,210,185,.5)');
  // red string
  r(ctx,586,454,54,4,'#8e2a22'); r(ctx,586,458,54,2,'#c04a38');
  r(ctx,636,450,6,14,'#8e2a22');
  // hand highlight
  r(ctx,566,414,34,2,'rgba(255,230,200,.25)');

  // cold cast / scanlines
  ctx.save();
  ctx.globalCompositeOperation='overlay';
  ctx.fillStyle='rgba(30,80,74,.10)'; ctx.fillRect(0,0,W,H);
  ctx.restore();
  r(ctx,0,0,W,H,'rgba(0,0,0,.04)');
  for (let y=0;y<H;y+=4) r(ctx,0,y,W,1,'rgba(0,0,0,.10)');
  for (let i=0;i<140;i++){
    ctx.fillStyle=i%2?'rgba(220,220,200,.035)':'rgba(0,0,0,.04)';
    ctx.fillRect((i*53)%W,(i*97)%H,1,1);
  }
  const ty=((t*15)%(H+60))-30;
  r(ctx,0,ty,W,3,'rgba(230,225,205,.03)');
  const vg=ctx.createRadialGradient(W/2,H/2,150,W/2,H/2,410);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.5)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
  // dedicated fallback close-up when the operator is right in front of her
  if (nearWoman() && state.camera && !state.review && !state.mismatch && performance.now()<state.closeupUntil){
    drawCameraFaceCloseup(ctx,t);
  }
}

function huntScanMode(){
  return state.camera && state.chapter===2 && !state.review && !state.ended;
}
function anomalyScanMode(){
  return state.camera && state.chapter===3 && !state.review && !state.ended;
}
function hideScanMode(){
  return state.camera && state.chapter===4 && !state.review && !state.ended;
}
function hardCloseCamera(){
  if (!state.camera) return;
  state.camera=false; state.scanStart=0; state.scanT=0; state.scanTarget=null;
  camera.classList.remove('on'); dvBtn.classList.remove('active');
  camMeta.classList.add('hidden');
  updateVideoLayer();
  stopDrone();
}
function endTransition(){
  state.transition=false;
  if (state.pauseQueued){ state.pauseQueued=false; pauseGame(); }
}
function startChapter(n){
  if (state.ending || state.transition || state.chapter===n) return;
  if (state.chapterStartedAt){
    state.chapterTimes.push({chapter:state.chapter,ms:performance.now()-state.chapterStartedAt});
  }
  state.chapterStartedAt=performance.now();
  if (state.review) exitReview();
  hardCloseCamera();
  closeCase();
  state.scareUntil=0;
  const apply=()=>{
    state.chapter=n;
    state.choice=(n===4);
    state.oldWomanGone=(n===2||n===3);
    state.darkChapter=(n===3);
    state.handRaised=false; state.mismatch=false; state.takes=0;
    state.wx=2.5; state.wy=6.5; state.dir='S'; state.walk=0; state.moving=false;
    state.scanStart=0; state.scanT=0; state.scanDone=false; state.scanTarget=null;
    state.battery=100; state.photoScarePending=false;
    state.ritual.active=false; updateRitualHUD();
    if (n===2){
      state.hunt={mode:'find',pos:Math.floor(Math.random()*HIDE_SPOTS.length),count:0,seen:false,layout:0};
      state.ritual.reviews=Math.max(state.ritual.reviews||0,2);
    } else if (n===3){
      state.hunt={mode:'anomaly',count:0,seen:false};
      state.anomalies={incense:false,bowl:false,thread:false};
      state.ch3FrameGate=false; state.ch3FrameOk=false;
      state.ritual.incense=1; state.ritual.bowl=2; state.ritual.thread=0;
      state.ritual.active=false; state.ritual.done=true;
      updateRitualHUD();
    } else if (n===4){
      state.hunt=null;
      state.hide={round:0,facing:Math.floor(Math.random()*HIDE_SPOTS.length),remaining:12,active:true,lastHud:-1,lastSpot:-1,lureAt:performance.now()+4500};
      state.ch3FrameGate=false; state.ch3FrameOk=false;
      state.ritual.done=true;
      state.oldWomanGone=true; state.darkChapter=true;
      state.choice=false;
    } else if (n===5){
      state.hunt=null; state.hide=null;
      state.finalPhoto=false;
      state.oldWomanGone=true; state.darkChapter=true;
      state.choice=false;
      state.ritual.done=true;
    }
    updateChapterHUD();
    fadeEl.classList.remove('on');
    if (n===2){ say('第二遍。椅子上没有人。',3600); prompt('F 取景器找她　/　E 靠近她',5600); }
    if (n===3){ say('第三遍。房间暗了。有三处不对。',3600); prompt('F 看取景器　/　L 快门',5600); }
    if (n===4){ say('第四遍。她站起来了。躲好。',3200); prompt('F 看她　/　E 躲',5200); }
    if (n===5){ say('最后一遍。先拍她。',3200); prompt('F 拍她　/　L 快门',5200); }
    endTransition();
  };
  if (state.silent){ apply(); return; }
  state.transition=true;
  fadeEl.classList.add('on');
  later(apply,700);
}
function nearestHuntSpot(){
  if (state.chapter!==2 && state.chapter!==3 && state.chapter!==4) return null;
  let best=null,bestD=1.8;
  for (const sp of HIDE_SPOTS){
    const d=Math.hypot(state.wx-sp.x,state.wy-sp.y);
    if (d<bestD){ best=sp; bestD=d; }
  }
  return best;
}
function startCorridor(){
  if (state.scene!=='room' || state.transition || state.ending) return;
  hardCloseCamera(); closeCase();
  const apply=()=>{
    state.scene='corridor';
    state.corr={depth:0,answered:false,ringAt:0,portrait:false,threadSeen:false,
      lookOn:false,roomSeen:false,facesSeen:false,nameSeen:false};
    state.choice=false;
    state.camera=false;
    camera.classList.remove('on'); dvBtn.classList.remove('active');
    stage.classList.remove('cameraOn','reviewing');
    camMeta.classList.add('hidden');
    roleName.textContent='走廊 / 主观';
    modeEl.textContent='门后';
    updateChapterHUD();
    fadeEl.classList.remove('on');
    prompt('W 前进　/　E 接电话',5200);
    say('门后是一条走廊。电话在响。',3200);
    endTransition();
  };
  if (state.silent){ apply(); return; }
  state.transition=true; fadeEl.classList.add('on');
  later(apply,500);
}
// The corridor has its own camera: the room DV is closed here, so F becomes a
// slow look instead of the shutter rig. Three things are only legible through
// it — the side room, the missing face, the name on the far door — and the
// phone will not answer until the name has been read.
function corridorLookOn(){
  const c=state.corr;
  if (!c || c.lookOn || state.ended || state.transition || state.paused) return;
  c.lookOn=true;
  const d=c.depth||0;
  playMedia('scanPing',0.22,0.02);
  if (d>0.14 && d<0.38 && !c.roomSeen){
    c.roomSeen=true;
    playMedia('roomShift',0.34,0.06);
    glitchNow();
    say('侧门开着一条缝。里面是同一把椅子，坐着另一个你。',4200);
    prompt('松开 F 放下　·　W 前进　·　E 查看',5200);
    return;
  }
  if (d>0.46 && d<0.74 && !c.facesSeen){
    c.facesSeen=true;
    playMedia('oldBreath',0.4,0.06);
    say('五张遗像，只有四张有脸。空的那张，别着白胶布。',4200);
    prompt('松开 F 放下　·　W 前进　·　E 查看',5200);
    return;
  }
  if (d>=0.76 && !c.nameSeen){
    c.nameSeen=true;
    playMedia('clock',0.2,0.02);
    say('门牌上是两个字：徐英子。',3600);
    prompt('松开 F　·　E 接电话',5200);
    return;
  }
  say(d<0.74?'取景器里只有灰和门缝。':'门牌已经看清了。',2200);
  prompt('松开 F 放下 DV　·　W 前进　·　E 查看',3200);
}
function corridorLookOff(){
  if (state.corr) state.corr.lookOn=false;
}
function corridorInteract(){
  if (state.scene!=='corridor') return false;
  const d=state.corr.depth||0;
  if (d<0.78){
    if (d>=0.28 && d<0.58 && !state.corr.portrait){
      state.corr.portrait=true;
      playMedia('oldBreath',0.32,0.04);
      say('相框里没有人。只有一块白胶布。',3400);
      prompt('W 前进　/　E 继续',4200);
      return true;
    }
    if (d>=0.52 && !state.corr.threadSeen){
      state.corr.threadSeen=true;
      say('地上的红绳，一直牵到门后。',3000);
      prompt('W 前进　/　E 接电话',4200);
      return true;
    }
    say('再往前走。电话在尽头。',2600);
    prompt('W 前进　/　E 查看',3600);
    return true;
  }
  if (!state.corr.nameSeen){
    say('门牌落了灰。按住 F，看清这是谁的门。',3400);
    prompt('按住 F 看清门牌',4200);
    return true;
  }
  if (state.corr.answered && state.corr.doorOpen){ startDarkroom(); return true; }
  if (state.corr.answered){ say('电话刚挂上。等门开。',2200); return true; }
  answerPhone();
  return true;
}
function answerPhone(){
  if (state.scene!=='corridor' || state.corr.answered) return;
  state.corr.answered=true;
  playMedia('voicePhone',0.82,0.06);
  say('电话里：你终于接电话了。别让她抬手。',4200);
  prompt('');
  // The call opens a door the corridor never had. Act 2 is behind it.
  const open=()=>{
    if (state.ending || state.scene!=='corridor') return;
    playMedia('door',0.38,0.06);
    state.corr.doorOpen=true;
    say('挂上电话，尽头的门自己开了一条缝。',3400);
    prompt('W 走到门口　/　E 推门进去',4800);
  };
  if (state.silent){ open(); return; }
  later(open,2200);
}
function updateCorridor(dt){
  if (state.paused || state.transition) return;
  const look=!!state.corr.lookOn;
  if (!look){
    if (keys.up) state.corr.depth=Math.min(1,state.corr.depth+dt*0.19);
    if (keys.down) state.corr.depth=Math.max(0,state.corr.depth-dt*0.2);
    // Nudge the player toward each thing that only the viewfinder can resolve,
    // once per beat, so the hall is not a guessing game at walking speed.
    const c=state.corr, d=c.depth||0;
    const beat=(!c.roomSeen && d>=0.12 && d<=0.40 && c.hint!=='room')?'room'
      :(!c.facesSeen && d>=0.44 && d<=0.72 && c.hint!=='faces')?'faces'
      :(!c.nameSeen && d>=0.74 && c.hint!=='name')?'name':null;
    if (beat){
      c.hint=beat;
      if (beat==='room'){
        playMedia('roomShift',0.3,0.05);
        say('左边的门开着一条缝。按住 F 看看里面。',3200);
        prompt('按住 F 看门缝　/　W 前进',4200);
      } else if (beat==='faces'){
        playMedia('oldBreath',0.3,0.05);
        say('墙上五张遗像。有一张，看不清脸。',3200);
        prompt('按住 F 看遗像　/　W 前进',4200);
      } else {
        say('尽头那扇门上，挂着门牌。',3000);
        prompt('按住 F 看清门牌',4200);
      }
    }
  }
  const now=performance.now();
  if (!state.corr.answered && now>(state.corr.ringAt||0)){
    state.corr.ringAt=now+1600;
    playMedia('phoneRing',0.48,0.04);
  }
  if (state.chapter===5) updateChapterHUD();
}
function drawCorridor(ctx,t){
  const W=PW,H=PH;
  const vx=240, vy=126;
  const depth=state.corr.depth||0;
  ctx.fillStyle='#070806'; ctx.fillRect(0,0,W,H);
  // ceiling
  pxPoly(ctx,[[0,0],[W,0],[vx+58,vy-18],[vx-58,vy-18]],'#141610');
  // side walls
  pxPoly(ctx,[[0,0],[vx-58,vy-18],[vx-58,vy+36],[0,H]],'#3a3a2e');
  pxPoly(ctx,[[W,0],[vx+58,vy-18],[vx+58,vy+36],[W,H]],'#35352a');
  // wall wainscot / panels
  for (let i=0;i<5;i++){
    const k=i/5;
    const lx=lerp(0,vx-58,k), ly=lerp(0,vy-18,k), ly2=lerp(H,vy+36,k);
    const rx=lerp(W,vx+58,k);
    pxLine(ctx,lx,ly,lx,ly2,'rgba(0,0,0,.28)');
    pxLine(ctx,rx,ly,rx,ly2,'rgba(0,0,0,.28)');
  }
  for (let i=0;i<3;i++){
    const k=0.12+i*0.24;
    const lx=lerp(0,vx-58,k), ly=lerp(0,vy-18,k), ly2=lerp(H,vy+36,k);
    const h=(ly2-ly);
    ctx.fillStyle='rgba(15,16,12,.45)';
    ctx.fillRect(lx,ly+h*0.28,Math.max(2,10-k*8),h*0.34);
    const rx=lerp(W,vx+58,k);
    ctx.fillRect(rx-Math.max(2,10-k*8),ly+h*0.28,Math.max(2,10-k*8),h*0.34);
  }
  // floor
  pxPoly(ctx,[[0,H],[W,H],[vx+58,vy+36],[vx-58,vy+36]],'#1d1e17');
  // floor planks
  for (let i=-7;i<=7;i++){
    const bx=240+i*38;
    pxLine(ctx,vx,vy+36,bx,H,'rgba(0,0,0,.38)');
  }
  for (let i=0;i<5;i++){
    const k=i/5;
    const y=lerp(H,vy+36,k);
    pxLine(ctx,0,y,W,y,'rgba(130,128,106,.10)');
  }
  // side doors (receding)
  for (let i=0;i<2;i++){
    const k=0.18+i*0.34;
    const lx=lerp(0,vx-58,k), ly=lerp(0,vy-18,k), ly2=lerp(H,vy+36,k);
    const dh=(ly2-ly)*0.52;
    const dw=Math.max(10,44-k*42);
    const dx=lx+8;
    ctx.fillStyle='#0a0907'; ctx.fillRect(dx,ly+dh*0.2,dw,dh);
    ctx.fillStyle='#6b4a2f'; ctx.fillRect(dx,ly+dh*0.2,2,dh);
    ctx.fillRect(dx+dw-2,ly+dh*0.2,2,dh);
    pxLine(ctx,dx+dw*0.7,ly+dh*0.5,dx+dw*0.7,ly+dh*0.5+3,'#b8873f');
    ctx.fillStyle='#0a0907'; ctx.fillRect(W-dx-dw,ly+dh*0.2,dw,dh);
  }
  // framed portraits on the walls
  for (let i=0;i<2;i++){
    const k=0.28+i*0.28;
    const lx=lerp(0,vx-58,k), ly=lerp(0,vy-18,k), ly2=lerp(H,vy+36,k);
    const w=Math.max(8,26-k*18), h=w*1.25;
    ctx.fillStyle='#2a2418'; ctx.fillRect(lx+12,ly+(ly2-ly)*0.35,w,h);
    ctx.fillStyle='#9a9382'; ctx.fillRect(lx+13,ly+(ly2-ly)*0.35+1,w-2,h-2);
    ctx.fillStyle='#171811'; ctx.fillRect(lx+14,ly+(ly2-ly)*0.35+2,w-4,h-4);
  }
  // far door (grows as you approach)
  const dw=58+depth*30, dh=104+depth*34;
  const dx=240-dw/2, dy=vy+36-dh;
  ctx.fillStyle='#0c0a08'; ctx.fillRect(dx,dy,dw,dh);
  ctx.fillStyle='#6b4a2f'; ctx.fillRect(dx,dy,4,dh); ctx.fillRect(dx+dw-4,dy,4,dh);
  ctx.fillRect(dx,dy,dw,4);
  ctx.fillStyle='#8a6a44'; ctx.fillRect(dx+4,dy+4,dw-8,2);
  // door panels
  ctx.strokeStyle='rgba(120,90,55,.35)'; ctx.lineWidth=1;
  ctx.strokeRect(dx+10,dy+14,dw-20,dh*0.38);
  ctx.strokeRect(dx+10,dy+dh*0.58,dw-20,dh*0.30);
  // light under door
  ctx.fillStyle='rgba(238,202,132,.46)'; ctx.fillRect(dx+4,dy+dh-3,dw-8,2);
  // phone table
  const tw=30+depth*8;
  ctx.fillStyle='#3f2c1c'; ctx.fillRect(240-tw/2,dy+dh-18,tw,4);
  ctx.fillRect(240-tw/2+4,dy+dh-14,3,12); ctx.fillRect(240+tw/2-7,dy+dh-14,3,12);
  // phone
  const pw=13+depth*4;
  ctx.fillStyle='#0b0b09'; ctx.fillRect(240-pw/2,dy+dh-28,pw,9);
  ctx.fillStyle='#1b1b17'; ctx.fillRect(240-pw/2-3,dy+dh-30,pw+6,3);
  ctx.fillStyle='#d84a38'; ctx.fillRect(240+pw/2-2,dy+dh-26,2,2);
  pxLine(ctx,240,dy+dh-19,240,dy+dh-15,'rgba(180,160,120,.4)');
  // ringing arcs
  if (!state.corr.answered){
    ctx.strokeStyle='rgba(216,74,56,'+(0.35+0.25*Math.sin(t*8))+')';
    ctx.lineWidth=1;
    for (let i=1;i<=2;i++){ ctx.beginPath(); ctx.arc(240,dy+dh-26,8+i*7,Math.PI*1.1,Math.PI*1.9); ctx.stroke(); }
  }
  // red thread on floor
  pxLine(ctx,240,H-6,240,dy+dh-8,'rgba(150,40,30,.55)');
  // bulb / wire
  pxLine(ctx,240,0,240,34,'#1a160f');
  pxEllipse(ctx,240,38,5,7,PAL.warm);
  glowEllipse(ctx,240,38,60,66,PAL.warm,.13,'screen');
  // warm light pool on floor
  glowEllipse(ctx,240,H-24,126,26,PAL.warm,.09,'screen');
  // dust
  for (let i=0;i<18;i++){
    const x=(i*97+((t*11)%97))%W, y=60+((i*53+((t*7)%53))%150);
    r(ctx,x,y,1,1,'rgba(200,190,160,.22)');
  }
  // faint bounce from the camera side: near floor readable, corners still die
  pxPoly(ctx,[[0,H],[W,H],[300,168],[180,168]],'rgba(130,120,94,.075)');
  // vignette
  ctx.fillStyle='rgba(0,0,0,.38)';
  ctx.fillRect(0,0,W,24); ctx.fillRect(0,H-24,W,24);
  ctx.fillRect(0,0,26,H); ctx.fillRect(W-26,0,26,H);
  if (state.corr.lookOn){
    // low-light viewfinder: scanlines, a colder wash, corner brackets
    ctx.fillStyle='rgba(10,18,20,.20)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(0,0,0,.16)';
    for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    ctx.strokeStyle='rgba(226,232,214,.45)'; ctx.lineWidth=1;
    const m=10;
    ctx.beginPath();
    ctx.moveTo(m,m+12); ctx.lineTo(m,m); ctx.lineTo(m+12,m);
    ctx.moveTo(W-m-12,m); ctx.lineTo(W-m,m); ctx.lineTo(W-m,m+12);
    ctx.moveTo(m,H-m-12); ctx.lineTo(m,H-m); ctx.lineTo(m+12,H-m);
    ctx.moveTo(W-m-12,H-m); ctx.lineTo(W-m,H-m); ctx.lineTo(W-m,H-m-12);
    ctx.stroke();
    if (Math.floor(t*2)%2===0){
      ctx.fillStyle='rgba(216,74,56,.8)';
      ctx.beginPath(); ctx.arc(W-30,18,3,0,Math.PI*2); ctx.fill();
    }
  }
}
// =========================================================
//  ACT 2 — 暗房 / the darkroom behind the door
// =========================================================
// The corridor's phone call opens a door that was not in the plan. Behind it is
// 徐英子's darkroom: six prints of every take, a splicer holding the 23 minutes
// she cut out, and an enlarger throwing an empty frame at the wall. Nothing here
// can be failed permanently and nothing kills the player — this act exists to
// explain both endings, so the only verb is "look closer".
const DARK_DOOR_DEPTH=0.74;   // the enlarger end of the room
const DARK_EXIT_DEPTH=0.16;   // the way back in, behind the player
function startDarkroom(){
  if (state.scene!=='corridor' || state.transition || state.ending) return;
  const apply=()=>{
    state.scene='darkroom';
    state.dark={depth:0,lookOn:false,hint:null,
      seen:{line:false,bench:false,wall:false},
      split:false,open:false,v:0.5,target:0.24+Math.random()*0.52,
      tries:0,alignPing:0,tickAt:0,print:false};
    state.choice=false;
    state.camera=false;
    camera.classList.remove('on'); dvBtn.classList.remove('active');
    stage.classList.remove('cameraOn','reviewing');
    camMeta.classList.add('hidden');
    roleName.textContent='暗房';
    modeEl.textContent='徐英子的剪片室';
    updateChapterHUD();
    fadeEl.classList.remove('on');
    playMedia('door',0.4,0.06);
    say('门后不是房间。是一间暗房，红灯还亮着。',3800);
    prompt('按住 F 在红灯下显影　/　W 前进',5400);
    endTransition();
  };
  if (state.silent){ apply(); return; }
  state.transition=true; fadeEl.classList.add('on');
  later(apply,600);
}
function darkLookOn(){
  const k=state.dark;
  if (!k || k.lookOn || k.open || state.ended || state.transition || state.paused) return;
  k.lookOn=true;
  const d=k.depth||0;
  playMedia('scanPing',0.2,0.02);
  if (d>0.08 && d<0.42 && !k.seen.line){
    k.seen.line=true;
    playMedia('water',0.26,0.05);
    say('洗印线上挂着六张。每一张，她都在看镜头。',4200);
    prompt('松开 F　·　W 前进',4400);
    return;
  }
  if (d>0.40 && d<0.74 && !k.seen.bench){
    k.seen.bench=true;
    playMedia('clock',0.22,0.03);
    say('剪辑台上一段带子被剪断了。断口正好是 23 分钟。',4200);
    prompt('松开 F　·　回台前按 E 接带',4400);
    return;
  }
  if (d>=DARK_DOOR_DEPTH && !k.seen.wall){
    k.seen.wall=true;
    playMedia('oldBreath',0.3,0.05);
    glitchNow();
    say('放大机在墙上打出一格空画面。里面没有人。',4200);
    prompt('松开 F　·　回到剪辑台',4600);
    return;
  }
  say('红灯下只有药水味。',2200);
  prompt('松开 F　·　W 前进　/　S 后退',3200);
}
function darkLookOff(){
  if (state.dark) state.dark.lookOn=false;
}
function darkAllSeen(){
  const s=state.dark&&state.dark.seen;
  return !!(s && s.line && s.bench && s.wall);
}
function darkInteract(){
  if (state.scene!=='darkroom') return false;
  const k=state.dark;
  if (!k) return true;
  if (k.open) return true;                       // Q / E / Space drive the splicer
  const d=k.depth||0;
  if (k.split){
    if (d<=DARK_EXIT_DEPTH){ finishDarkroom(); return true; }
    say('带子接回去了。往回走，门在身后。',3000);
    prompt('S 后退到门口　/　E 推门',4400);
    return true;
  }
  if (d>0.38 && d<0.78){
    if (!darkAllSeen()){
      const left=3-((k.seen.line?1:0)+(k.seen.bench?1:0)+(k.seen.wall?1:0));
      say('先看清这三样：洗印线、剪辑台、放大机。',3000);
      prompt('按住 F 显影　·　还差 '+left+' 处',4400);
      return true;
    }
    k.open=true; k.lookOn=false;
    playMedia('chair',0.3,0.04);
    say('两段带子，中间差一点点。把它对上。',3400);
    prompt('Q / E 移动带子　·　空格 接带　·　F 放下',6200);
    updateChapterHUD();
    return true;
  }
  if (d<=DARK_EXIT_DEPTH){ say('门在身后。先处理剪辑台上的带子。',3000); prompt('W 前进　/　回到剪辑台',4200); return true; }
  say('暗房很小。洗印线、剪辑台、放大机。',2800);
  prompt('W 前进　/　按住 F 显影',4200);
  return true;
}
function closeSplicer(){
  const k=state.dark;
  if (!k || !k.open) return;
  k.open=false;
  updateChapterHUD();
  prompt('按 E 重新接带　/　W 前进',4200);
}
function spliceAdjust(dir){
  const k=state.dark;
  if (!k || !k.open || k.split || !dir) return;
  k.v=Math.max(0,Math.min(1,k.v+dir*0.022));
  const now=performance.now();
  if (now-(k.tickAt||0)>95){ k.tickAt=now; playMedia('clock',0.12,0.01); }
  if (Math.abs(k.v-k.target)<=0.03 && now-(k.alignPing||0)>700){
    k.alignPing=now; playMedia('scanPing',0.24,0.02);
  }
  updateChapterHUD();
}
function spliceCommit(){
  const k=state.dark;
  if (!k || !k.open || k.split) return;
  const off=k.v-k.target;
  if (Math.abs(off)<=0.03){
    k.split=true; k.open=false;
    playMedia('anomalySnap',0.5,0.03);
    playMedia('revealImpact',0.2,0.05);
    glitchNow();
    updateChapterHUD();
    later(()=>{ if (state.scene==='darkroom') say('接上了。那 23 分钟开始跑。',3200); },180);
    later(()=>{ if (state.scene==='darkroom') say('画面里，她先回头——摄影机才跟上。',3800); },3000);
    later(()=>{
      if (state.scene!=='darkroom') return;
      say('所以不是她在看你。是你在替她记。',4200);
      prompt('L 拍下这一格　/　E 推门回去',5600);
      playMedia('oldBreath',0.42,0.06);
    },6200);
    return;
  }
  k.tries=(k.tries||0)+1;
  playMedia('squelch',0.3,0.03);
  glitchNow();
  say(off>0?'切口错开了。往左一点。':'切口错开了。往右一点。',2600);
}
function darkPrint(){
  const k=state.dark;
  if (state.scene!=='darkroom' || !k || !k.split || k.print) return;
  k.print=true;
  playMedia('shutter',0.5,0.02);
  playMedia('oldBreath',0.5,0.05);
  state.photoFlashUntil=performance.now()+220;
  glitchNow();
  say('洗出来两个人。站着的是她，举机器的是你。',4200);
  prompt('E 推门回去',5200);
  updateChapterHUD();
}
function finishDarkroom(){
  if (state.scene!=='darkroom' || state.transition || state.ending) return;
  const back=()=>{
    if (state.ending) return;
    if (state.dark) state.dark.lookOn=false;
    state.scene='room'; state.phoneDone=true;
    state.chapter=5; state.oldWomanGone=false; state.finalPhoto=true;
    state.choice=true; state.darkChapter=false;
    state.camera=false;
    roleName.textContent='谢雨洁（重建）'; modeEl.textContent='徐英子的记忆';
    updateChapterHUD();
    fadeEl.classList.remove('on');
    say('暗房的门在身后合上。她坐回椅子。',3400);
    prompt('Q 让她抬手　/　按住 F 看取景器',5200);
    endTransition();
  };
  if (state.silent){ back(); return; }
  state.transition=true; fadeEl.classList.add('on');
  playMedia('door',0.44,0.05);
  later(back,760);
}
function updateDarkroom(dt){
  const k=state.dark;
  if (!k || state.paused || state.transition || state.ended) return;
  if (!k.open && !k.lookOn){
    if (keys.up) k.depth=Math.min(1,k.depth+dt*0.2);
    if (keys.down) k.depth=Math.max(0,k.depth-dt*0.22);
    const d=k.depth;
    const beat=(!k.seen.line && d>0.06 && d<0.42 && k.hint!=='line')?'line'
      :(!k.seen.bench && d>0.38 && d<0.76 && k.hint!=='bench')?'bench'
      :(!k.seen.wall && d>=DARK_DOOR_DEPTH && k.hint!=='wall')?'wall':null;
    if (beat){
      k.hint=beat;
      if (beat==='line'){
        playMedia('water',0.22,0.04);
        say('洗印线上挂着一排照片。按住 F，红灯下能显出来。',3400);
        prompt('按住 F 显影　/　W 前进',4400);
      } else if (beat==='bench'){
        playMedia('clock',0.18,0.03);
        say('剪辑台上有一段剪断的带子，和一个接带器。',3400);
        prompt('按住 F 看台面　/　W 前进',4400);
      } else {
        say('最里面是放大机，正对着墙。按住 F 看它投出的画面。',3600);
        prompt('按住 F 显影　/　S 退回剪辑台',4600);
      }
    }
  }
  if (state.chapter===5) updateChapterHUD();
}
// --- drawing -------------------------------------------------
function drawDarkroom(ctx,t){
  const W=PW,H=PH;
  const k=state.dark||{depth:0};
  const d=k.depth||0;
  const seen=k.seen||{};
  const vx=240, vy=118;
  const lift=1+d*0.09;
  ctx.save();
  ctx.translate(vx,vy); ctx.scale(lift,lift); ctx.translate(-vx,-vy);

  // shell
  r(ctx,0,0,W,H,'#060404');
  pxPoly(ctx,[[0,H],[W,H],[330,162],[150,162]],'#1c0f0c');
  pxPoly(ctx,[[0,0],[W,0],[330,74],[150,74]],'#120a08');
  pxPoly(ctx,[[0,0],[150,74],[150,162],[0,H]],'#331714');
  pxPoly(ctx,[[W,0],[330,74],[330,162],[W,H]],'#2b1310');
  r(ctx,150,74,180,88,'#24120f');
  // safelight falloff: the middle of the room is the only place anything reads
  glowEllipse(ctx,240,96,206,150,'#c04a38',.055,'screen');
  glowEllipse(ctx,240,120,120,92,'#d05a40',.05,'screen');
  // floor boards + back wall seam
  for (let i=-6;i<=6;i++) pxLine(ctx,vx,162,vx+i*44,H,'rgba(0,0,0,.42)');
  for (let i=1;i<=4;i++){ const y=lerp(162,H,i/5); pxLine(ctx,0,y,W,y,'rgba(150,110,95,.05)'); }
  pxLine(ctx,150,162,330,162,'rgba(0,0,0,.6)');
  // skirting + wall stains
  r(ctx,150,158,180,4,'#0e0706');
  r(ctx,0,238,150,4,'#0d0605'); r(ctx,330,238,150,4,'#0d0605');
  for (let i=0;i<7;i++){
    const sx=160+((i*47)%160), sy=78+((i*31)%78);
    r(ctx,sx,sy,3+((i*5)%7),2,'rgba(10,6,5,.5)');
  }
  // enlarger beam (left column -> far wall)
  const projX=176, projY=92, projW=58, projH=52;
  pxPoly(ctx,[[92,150],[projX+projW,projY+8],[projX+projW,projY+projH],[92,176]],'rgba(216,140,110,.055)');
  // projection frame on the wall
  r(ctx,projX,projY,projW,projH,'#201110');
  r(ctx,projX+2,projY+2,projW-4,projH-4,seen.wall?'#2a1a16':'#0d0807');
  if (k.split){
    // two figures standing where you stood
    r(ctx,projX+16,projY+20,9,26,'#4a2a24'); r(ctx,projX+16,projY+14,7,8,'#6a463c');
    r(ctx,projX+34,projY+22,9,24,'#3a201c'); r(ctx,projX+34,projY+16,7,8,'#5a3a32');
  } else if (seen.wall){
    r(ctx,projX+2,projY+2,projW-4,projH-4,'rgba(120,60,50,.10)');
  }
  // enlarger column + head
  r(ctx,72,150,10,86,'#2a2622');
  r(ctx,64,214,26,6,'#1a1714');
  r(ctx,66,140,34,16,'#332e28');
  r(ctx,88,146,14,8,'#454038');
  r(ctx,92,152,6,4,'#8a6a4a');
  r(ctx,66,138,34,3,'#4a443c');
  // drying line with prints
  pxLine(ctx,146,88,334,88,'#8a7460');
  pxLine(ctx,146,89,334,89,'rgba(0,0,0,.5)');
  for (let i=0;i<6;i++){
    const x=158+i*29;
    const sway=Math.sin(t*0.9+i*1.3)*(k.lookOn?0.6:1.6);
    const py=90+sway;
    r(ctx,x,py,2,4,'#3a2c22');
    r(ctx,x-7,py+4,18,24,'#0d0907');
    r(ctx,x-6,py+5,16,22,seen.line?'#ddd0b4':'#9a8f78');
    if (seen.line){
      // a face that is looking at the lens, in every single print
      r(ctx,x-2,py+10,7,8,'#8a6450');
      r(ctx,x-3,py+8,9,4,'#241a15');
      r(ctx,x-1,py+12,1,1,'#100c09'); r(ctx,x+3,py+12,1,1,'#100c09');
      r(ctx,x-2,py+18,6,5,'#3a2c22');
    } else {
      r(ctx,x-3,py+11,10,10,'rgba(60,50,42,.5)');
    }
  }
  // editing bench (right, near camera)
  pxPoly(ctx,[[292,178],[436,166],[454,180],[308,194]],'#4a3322');
  pxPoly(ctx,[[308,194],[454,180],[454,188],[308,202]],'#291a10');
  r(ctx,314,201,6,46,'#1a100a'); r(ctx,440,188,6,48,'#1a100a');
  // edge highlight on the bench top + the bench lamp's pool on the work surface
  pxLine(ctx,292,178,436,166,'rgba(226,178,136,.45)');
  glowEllipse(ctx,420,162,40,18,'#c85a3c',.075,'screen');
  glowEllipse(ctx,392,174,22,10,'#e0906a',.05,'screen');
  // splicer on the bench
  r(ctx,328,169,46,14,'#5a5a52');
  r(ctx,332,164,38,7,'#6e6e64');
  r(ctx,338,160,9,5,'#8e8e82'); r(ctx,355,160,9,5,'#8e8e82');
  r(ctx,348,166,9,9,'#2a2a24');
  r(ctx,350,168,5,2,'#d85a44');
  r(ctx,330,181,42,2,'rgba(0,0,0,.45)');
  // two reels
  ctx.fillStyle='#231f1a'; ctx.beginPath(); ctx.arc(392,168,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#3a342c'; ctx.beginPath(); ctx.arc(392,168,6,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#231f1a'; ctx.beginPath(); ctx.arc(412,164,7,0,Math.PI*2); ctx.fill();
  // loose tape strip
  pxLine(ctx,336,176,404,171,'rgba(206,196,176,.50)');
  // red bench lamp
  r(ctx,420,150,3,20,'#1a1a16');
  pxPoly(ctx,[[410,150],[434,148],[430,140],[414,142]],'#5a1c16');
  glowEllipse(ctx,422,152,26,20,'#c04a38',.10,'screen');
  // chemical trays
  for (let i=0;i<3;i++){
    const tx=18+i*38, ty=214+i*3;
    pxPoly(ctx,[[tx,ty],[tx+34,ty-3],[tx+38,ty+10],[tx+3,ty+14]],'#241a16');
    r(ctx,tx+2,ty+2,32,7,['#3a1410','#20242a','#2a2418'][i]);
    r(ctx,tx+2,ty+2,32,1,'rgba(200,180,160,.10)');
  }
  // a slow drip into the first tray
  const drip=((t*0.5)%1);
  if (drip<0.6) r(ctx,30,196+drip*20,1,2,'rgba(200,170,150,.35)');
  // right wall: a shelf of reels and two film strips drying
  r(ctx,398,118,74,3,'#3a2418');
  r(ctx,398,121,74,2,'rgba(0,0,0,.5)');
  for (let i=0;i<4;i++){
    const rx=404+i*17;
    ctx.fillStyle='#1e1913'; ctx.beginPath(); ctx.arc(rx,112,7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#40382c'; ctx.beginPath(); ctx.arc(rx,112,4,0,Math.PI*2); ctx.fill();
  }
  r(ctx,360,96,2,40,'#2a1d14'); r(ctx,382,92,2,44,'#2a1d14');
  for (let i=0;i<5;i++){
    r(ctx,359,98+i*7,4,4,'rgba(200,180,150,.20)');
    r(ctx,381,94+i*7,4,4,'rgba(200,180,150,.16)');
  }
  // door back to the corridor (left wall)
  // the doorway you came in by: close to camera, so it fills the left edge
  pxPoly(ctx,[[0,104],[72,127],[72,216],[0,246]],'#140c09');
  pxPoly(ctx,[[7,112],[65,132],[65,208],[7,234]],'#2a1f16');
  pxPoly(ctx,[[7,112],[65,132],[65,136],[7,117]],'#120c08');
  pxLine(ctx,4,106,4,242,'#6a4a2e');
  pxLine(ctx,70,127,70,214,'#8a6440');
  pxLine(ctx,7,112,65,132,'#7a5836');
  r(ctx,56,168,5,9,'#d0a05a');
  r(ctx,58,170,2,5,'#4a3418');
  // light under the door: this is the way back out
  pxPoly(ctx,[[7,230],[65,204],[65,209],[7,236]],'rgba(232,186,122,.34)');
  pxPoly(ctx,[[7,236],[65,209],[65,212],[7,240]],'rgba(232,186,122,.12)');
  r(ctx,71,128,2,86,'rgba(190,150,100,.35)');
  // walked past it: the doorway sinks into the dark behind you
  pxPoly(ctx,[[0,104],[72,127],[72,216],[0,246]],'rgba(8,5,4,'+Math.min(0.68,0.08+d*0.75).toFixed(2)+')');
  // safelight
  pxLine(ctx,240,0,240,20,'#2e2018');
  pxPoly(ctx,[[230,20],[250,20],[256,32],[224,32]],'#4a2018');
  r(ctx,226,30,28,3,'#e0603c');
  glowEllipse(ctx,240,34,84,64,'#c04a38',.12,'screen');
  glowEllipse(ctx,240,34,30,24,'#f07a4e',.14,'screen');
  // wedge of red light on the floor
  pxPoly(ctx,[[232,34],[248,34],[318,H-18],[162,H-18]],'rgba(200,72,50,.045)');
  // dust
  for (let i=0;i<20;i++){
    const x=(i*89+((t*9)%89))%W, y=30+((i*41+((t*6)%41))%190);
    r(ctx,x,y,1,1,'rgba(210,150,130,.14)');
  }
  ctx.restore();
  // proximity brackets: what is within reach right now
  if (!k.open){
    let box=null;
    if (k.split && d<=DARK_EXIT_DEPTH) box=[1,102,70,144];
    else if (d>0.08 && d<0.42) box=[146,82,190,40];
    else if (d>0.40 && d<0.74) box=[318,158,124,54];
    else if (d>=DARK_DOOR_DEPTH) box=[168,84,74,66];
    if (box && !k.split){
      ctx.strokeStyle='rgba(216,150,120,.30)'; ctx.lineWidth=1;
      const [bx,by,bw,bh]=box;
      ctx.beginPath();
      ctx.moveTo(bx,by+8); ctx.lineTo(bx,by); ctx.lineTo(bx+8,by);
      ctx.moveTo(bx+bw-8,by); ctx.lineTo(bx+bw,by); ctx.lineTo(bx+bw,by+8);
      ctx.moveTo(bx,by+bh-8); ctx.lineTo(bx,by+bh); ctx.lineTo(bx+8,by+bh);
      ctx.moveTo(bx+bw-8,by+bh); ctx.lineTo(bx+bw,by+bh); ctx.lineTo(bx+bw,by+bh-8);
      ctx.stroke();
    }
  }
  // red wash + vignette
  ctx.fillStyle='rgba(120,26,20,.10)'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(0,0,0,.34)';
  ctx.fillRect(0,0,W,26); ctx.fillRect(0,H-26,W,26);
  ctx.fillRect(0,0,28,H); ctx.fillRect(W-28,0,28,H);
  if (k.lookOn){
    ctx.fillStyle='rgba(14,20,22,.22)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(0,0,0,.14)';
    for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    ctx.strokeStyle='rgba(232,214,196,.42)'; ctx.lineWidth=1;
    const m=10;
    ctx.beginPath();
    ctx.moveTo(m,m+12); ctx.lineTo(m,m); ctx.lineTo(m+12,m);
    ctx.moveTo(W-m-12,m); ctx.lineTo(W-m,m); ctx.lineTo(W-m,m+12);
    ctx.moveTo(m,H-m-12); ctx.lineTo(m,H-m); ctx.lineTo(m+12,H-m);
    ctx.moveTo(W-m-12,H-m); ctx.lineTo(W-m,H-m); ctx.lineTo(W-m,H-m-12);
    ctx.stroke();
    if (Math.floor(t*2)%2===0){
      ctx.fillStyle='rgba(216,74,56,.85)';
      ctx.beginPath(); ctx.arc(W-30,18,3,0,Math.PI*2); ctx.fill();
    }
  }
  if (k.open) drawSplicer(ctx,t);
}
function drawSplicer(ctx,t){
  const k=state.dark||{v:0.5,target:0.5};
  const off=k.v-k.target;
  const aligned=Math.abs(off)<=0.03;
  ctx.fillStyle='rgba(5,3,3,.70)'; ctx.fillRect(0,0,PW,PH);
  // bench close-up panel
  const px=52, py=44, pw=376, ph=184;
  r(ctx,px,py,pw,ph,'#1d1411');
  r(ctx,px+1,py+1,pw-2,ph-2,'#170f0d');
  r(ctx,px,py,pw,1,'#7a3a2e'); r(ctx,px,py+ph-1,pw,1,'#7a3a2e');
  r(ctx,px,py,1,ph,'#4a2620'); r(ctx,px+pw-1,py,1,ph,'#4a2620');
  r(ctx,px+14,py+34,pw-28,1,'rgba(216,170,130,.22)');
  // header
  ctx.fillStyle='#c8a478'; ctx.font='13px "Songti SC",serif';
  ctx.fillText('接　带',px+16,py+26);
  ctx.fillStyle='rgba(200,180,150,.45)'; ctx.font='9px "Courier New",monospace';
  ctx.fillText('23:06 — 23:29',px+92,py+25);
  // magnifier frame: the two halves of the cut frame
  const mx=px+pw/2-58, my=py+42, mw=116, mh=70;
  r(ctx,mx-2,my-2,mw+4,mh+4,'#1c1512');
  r(ctx,mx,my,mw,mh,'#0a0706');
  // The two pieces of the torn frame are separate bits of paper: they slide
  // past each other, so the photo only lines up when the seam meets the head.
  // Two pieces of paper, not one image with a moving cut: each half keeps its
  // own side of the frame and they slide apart, so the gap is real.
  const gap=Math.max(-mw*0.30,Math.min(mw*0.30,off*160));
  const mid=mx+mw/2;
  r(ctx,mx-gap,my,Math.min(mw,gap+mid-mx+mw/2+gap),mh,'#080505');
  ctx.save();
  ctx.beginPath(); ctx.rect(mx,my,Math.max(0,(mid-gap)-mx),mh); ctx.clip();
  darkFrame(ctx,mx-gap,my,mw,mh,aligned);
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(mid+gap,my,Math.max(0,mx+mw-(mid+gap)),mh); ctx.clip();
  darkFrame(ctx,mx+gap,my,mw,mh,aligned);
  ctx.restore();
  if (aligned){
    r(ctx,mid-1,my,2,mh,'rgba(150,220,190,.18)');
  } else {
    r(ctx,mid-gap-1,my,1,mh,'rgba(216,74,56,.55)');
    r(ctx,mid+gap,my,1,mh,'rgba(216,74,56,.55)');
  }
  // tape bed
  const ty=py+130, tx0=px+22, tx1=px+pw-22;
  r(ctx,tx0,ty-4,tx1-tx0,24,'#0c0806');
  const seam=tx0+8+(k.v*(tx1-tx0-16));
  const head=tx0+8+(k.target*(tx1-tx0-16));
  // sprockets
  for (let x=tx0+2;x<tx1-2;x+=6){
    r(ctx,x,ty-1,2,2,'rgba(0,0,0,.55)');
    r(ctx,x,ty+15,2,2,'rgba(0,0,0,.55)');
  }
  // tape surface, split at the seam
  r(ctx,tx0,ty+2,seam-tx0,12,'#453b2e');
  r(ctx,seam,ty+2,tx1-seam,12,'#453b2e');
  r(ctx,tx0,ty+2,tx1-tx0,1,'rgba(240,220,190,.28)');
  r(ctx,tx0,ty+13,tx1-tx0,1,'rgba(0,0,0,.45)');
  // seam + head
  r(ctx,seam-1,ty+1,2,14,'rgba(232,90,66,.95)');
  r(ctx,head-1,ty-9,2,32,aligned?'rgba(150,220,190,.95)':'rgba(240,224,200,.75)');
  r(ctx,head-11,ty-11,22,2,aligned?'rgba(150,220,190,.75)':'rgba(240,224,200,.45)');
  r(ctx,head-11,ty+21,22,2,aligned?'rgba(150,220,190,.75)':'rgba(240,224,200,.45)');
  // readout
  ctx.font='10px "Courier New",monospace';
  ctx.fillStyle=aligned?'#9fd8c0':'rgba(232,214,190,.7)';
  const pct=(off*100);
  ctx.fillText(aligned?'SEAM OK':('OFFSET '+(pct>0?'+':'')+pct.toFixed(0)+'%'),px+pw-104,py+ph-26);
  ctx.fillStyle='rgba(220,198,168,.6)';
  ctx.fillText('Q / E  MOVE',px+26,py+ph-26);
  ctx.fillStyle='rgba(220,198,168,.42)';
  ctx.fillText('SPACE  SPLICE　·　F  LOWER',px+26,py+ph-12);
  // reel turning while the splicer is open
  const spin=t*0.6;
  ctx.fillStyle='#1d1915'; ctx.beginPath(); ctx.arc(px+pw-40,py+38,12,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(200,180,150,.25)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(px+pw-40,py+38,12,0,Math.PI*2); ctx.stroke();
  for (let i=0;i<3;i++){
    const a=spin+i*2.09;
    ctx.beginPath(); ctx.moveTo(px+pw-40,py+38);
    ctx.lineTo(px+pw-40+Math.cos(a)*10,py+38+Math.sin(a)*10); ctx.stroke();
  }
}
function darkFrame(ctx,x,y,w,h,aligned){
  // the cut frame: a face and a room; the seam rips it until the splice lands
  ctx.fillStyle='#241a16'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle='#3a2a22'; ctx.fillRect(x,y+h*0.6,w,h*0.4);
  // head, shoulders: the subject of every print in this room
  const cx=x+w*0.5, cy=y+h*0.42;
  ctx.fillStyle='#8a6450'; ctx.fillRect(cx-13,cy-17,26,24);
  ctx.fillStyle='#8a6450'; ctx.fillRect(cx-11,cy+7,22,6);
  ctx.fillStyle='#2a1c16'; ctx.fillRect(cx-15,cy-22,30,8);
  ctx.fillStyle='#2a1c16'; ctx.fillRect(cx-15,cy-16,4,12); ctx.fillRect(cx+11,cy-16,4,12);
  ctx.fillStyle='#0d0906'; ctx.fillRect(cx-8,cy-6,4,3); ctx.fillRect(cx+4,cy-6,4,3);
  ctx.fillStyle='#4a3026'; ctx.fillRect(cx-2,cy+1,4,2);
  ctx.fillStyle='#3a2a22'; ctx.fillRect(cx-13,cy+13,26,18);   // shoulders
  ctx.fillStyle='#1a1210'; ctx.fillRect(cx-4,cy+13,8,10);     // collar gap
  if (aligned){
    ctx.fillStyle='rgba(150,220,190,.14)'; ctx.fillRect(x,y,w,h);
  }
}

function lerp(a,b,t){ return a+(b-a)*t; }
function hideFail(msg){
  const h=state.hide;
  if (!h || !h.active) return;
  h.active=false;
  hardCloseCamera();
  state.transition=true;
  state.ritual.reviews=(state.ritual.reviews||0)+1;
  playMedia('hideFail',0.52,0.04);
  playMedia('oldBreath',0.65,0.03); glitchNow();
  say(msg||'她到你了。躲错了。',3000);
  fadeEl.classList.add('on');
  later(()=>{
    if (state.ending || state.chapter!==4) return;
    h.facing=Math.floor(Math.random()*HIDE_SPOTS.length);
    h.remaining=12; h.active=true; h.lureAt=performance.now()+4500;
    state.wx=2.5; state.wy=6.5; state.dir='S';
    fadeEl.classList.remove('on');
    updateChapterHUD();
    prompt('F 看她　/　E 躲',4800);
    endTransition();
  },900);
}
function hideInteract(){
  if (state.chapter!==4 || !state.hide || !state.hide.active) return false;
  const spot=nearestHuntSpot();
  if (!spot){
    say('快躲到帘子/供桌下/椅子后。',2600);
    prompt('F 看她　/　E 躲',4200);
    return true;
  }
  const spotIndex=HIDE_SPOTS.indexOf(spot);
  if (spotIndex===state.hide.facing){
    hideFail('她正看着这里。');
    return true;
  }
  if (spotIndex===state.hide.lastSpot){
    say('别躲同一个地方。',2400);
    return true;
  }
  state.hide.lastSpot=spotIndex;
  state.hide.round++;
  if (state.hide.round>=4){
    state.hide.active=false;
    say('四次都躲开了。她不再看你。',3000);
    later(()=>startChapter(5),900);
  } else {
    state.hide.facing=(state.hide.facing+1+Math.floor(Math.random()*2))%HIDE_SPOTS.length;
    state.hide.remaining=12;
    state.hide.lastHud=-1;
    state.hide.lureAt=performance.now()+4500;
    say('躲好了。她转向别处。',2800);
    prompt('F 看她　/　E 躲',4200);
  }
  updateChapterHUD();
  return true;
}
function updateHide(dt){
  const h=state.hide;
  if (state.chapter!==4 || !h || !h.active) return;
  if (state.paused || state.review || state.caseOpen || state.transition) return;
  h.remaining-=Math.max(0,Math.min(.2,dt));
  if (h.remaining<=0){ hideFail('她到你了。'); return; }
  const tenth=Math.ceil(h.remaining*10);
  if (tenth!==h.lastHud){ h.lastHud=tenth; updateChapterHUD(); }
  const now=performance.now();
  if (!state.camera && h.remaining>5 && now>(h.lureAt||0)){
    h.lureAt=now+4800+Math.random()*3200;
    playMedia('hideLure',0.4,0.05);
    say(HIDE_SPOTS[h.facing].label+'那边，响了一下。',2800);
  }
}
function huntInteract(){
  if (state.chapter!==2 || !state.hunt) return false;
  if (state.hunt.count>=4){ startChapter(3); return true; }
  const spot=nearestHuntSpot();
  if (!spot){
    say('她不在椅子上。按 F 用取景器找。',3000);
    prompt('F 取景器　/　Tab 记录',4200);
    return true;
  }
  if (HIDE_SPOTS.indexOf(spot)===state.hunt.pos){
    state.hunt.count++;
    state.hunt.seen=false;
    state.ritual.reviews=(state.ritual.reviews||0)+1;
    playMedia('oldBreath',0.55,0.04); glitchNow();
    if (state.hunt.count>=4){
      say('四次。她站起来了。',3000);
      later(()=>startChapter(3),900);
    } else {
      state.hunt.pos=(state.hunt.pos+1+Math.floor(Math.random()*2))%HIDE_SPOTS.length;
      shiftHuntLayout();
      say('找到你了。她又换了地方。房间好像也动了一下。',3600);
      prompt('F 取景器　/　E 靠近',5200);
    }
  } else {
    state.ritual.reviews=(state.ritual.reviews||0)+1;
    state.hunt.pos=(state.hunt.pos+1)%HIDE_SPOTS.length;
    shiftHuntLayout();
    playMedia('huntEmpty',0.38,0.05);
    say('这里只有灰。她换了地方；供桌边的东西也不一样了。',3600);
  }
  updateChapterHUD();
  return true;
}
function takeHuntPhoto(){
  if (state.chapter!==3 || !state.hunt) return;
  if (state.hunt.count>=3){ startChapter(4); return; }
  if (!state.camera){ say('先举起 F 看她。',2600); return; }
  const spot=nearestHuntSpot();
  if (!spot){ say('太远了。走近她再拍。',2800); prompt('E 靠近　/　F 看她',4200); return; }
  if (state.battery<16){ say('电量不够拍。',2400); return; }
  state.battery-=16;
  state.hunt.count++;
  state.photoFlashUntil=performance.now()+160;
  state.photoRevealUntil=performance.now()+900;
  state.photoRevealTarget='hunt';
  sCam(); if (actx) tone(1400,.06,'square',.04);
  glitchNow();
  state.ritual.reviews=(state.ritual.reviews||0)+1;
  if (state.hunt.count>=3){
    say('三张。照片里没有她。',3000);
    later(()=>startChapter(4),1100);
  } else {
    state.hunt.pos=(state.hunt.pos+1+Math.floor(Math.random()*2))%HIDE_SPOTS.length;
    say('拍到了。她换了位置。',3000);
    prompt('F 看她　/　L 快门',4600);
  }
  updateChapterHUD();
}
function takeAnomalyPhoto(){
  if (state.chapter!==3) return;
  if (!state.camera){ say('先举起 F 看取景器。',2600); return; }
  const target=state.scanTarget;
  if (!target){ say('靠近香炉、水碗或门框，再按 L。',3000); return; }
  if (!state.scanDone){ say('先按住 F 显影看清，再按 L。',2800); prompt('保持 F　/　L 快门',4200); return; }
  if (state.anomalies[target]){ say('这处已经拍过了。',2400); return; }
  if (state.battery<16){ say('电量不够拍。',2400); return; }
  state.battery=Math.max(0,state.battery-16);
  state.anomalies[target]=true;
  state.hunt.count++;
  state.photoFlashUntil=performance.now()+160;
  state.photoRevealUntil=performance.now()+1000;
  state.photoRevealTarget=target;
  playMedia('anomalySnap',0.5,0.03);
  playMedia('shutter',0.35,0.02);
  sCam(); glitchNow();
  updateChapterHUD();
  if (state.hunt.count>=3){
    if (!state.ch3FrameOk){
      state.ch3FrameGate=true;
      say('三处都对上了。回带子里找闭眼那一帧。',3800);
      prompt('R 回看　/　A D 逐帧',5200);
      return;
    }
    say('三处都对上了。',3000);
    later(()=>startChapter(4),1100);
  } else {
    say('拍到了。还有 '+(3-state.hunt.count)+' 处不对。',3000);
    prompt('F 看取景器　/　L 快门',4600);
  }
}
function takeFinalPhoto(){
  if (state.chapter!==5 || state.finalPhoto) return;
  if (!state.camera){ say('先举起 F 拍她。',2400); return; }
  if (!nearWoman()){ say('走近她再拍。',2400); return; }
  if (state.battery<16){ say('电量不够拍。',2400); return; }
  state.battery=Math.max(0,state.battery-16);
  state.finalPhoto=true;
  state.oldWomanGone=false;
  state.darkChapter=false;
  state.choice=true;
  state.photoFlashUntil=performance.now()+160;
  state.photoRevealUntil=performance.now()+900;
  state.photoRevealTarget='final';
  sCam(); if (actx) tone(1400,.06,'square',.04);
  glitchNow();
  playMedia('oldBreath',0.55,0.04);
  say('拍到了。电话响了。',3000);
  prompt('走到门口按 E 接电话',5200);
  updateChapterHUD();
}
function photosAll(){
  return state.photos.incense && state.photos.bowl && state.photos.thread;
}
function takePhoto(){
  if (state.scene!=='room' || state.inputLock) return;
  if (state.chapter===5){ takeFinalPhoto(); return; }
  if (state.chapter===3){ takeAnomalyPhoto(); return; }
  if (state.chapter===4){ say('先躲。现在不是拍照的时候。',2400); return; }
  if (state.chapter===2){ say('先找到她。',2200); return; }
  if (!state.camera || !state.ritual.active || state.ritual.done || state.ending) return;
  const target=state.scanTarget;
  if (!target){ say('没有对准。先靠近香炉、水碗或门框。',3000); return; }
  if (!state.ritual.camSeen[target]){ say('先显影看清，再拍。',2800); prompt('保持 F 显影　/　Tab 记录',4200); return; }
  if (state.photos[target]){ say('这张已经拍过了。',2400); return; }
  if (state.battery<16){ say('电量不够拍。',2400); return; }
  state.battery=Math.max(0,state.battery-16);
  state.photos[target]=true;
  state.photoFlashUntil=performance.now()+160;
  state.photoRevealUntil=performance.now()+1200;
  state.photoRevealTarget=target;
  playMedia('shutter',0.55,0.02);
  sCam(); if (actx) tone(1400,.04,'square',.03);
  glitchNow();
  updateRitualHUD();
  if (state.caseOpen) renderCase();
  if (photosAll()){
    state.photoScarePending=true;
    say('三张照片里，站的位置都不一样。',3600);
  } else {
    say('快门。照片里好像多了一只手。',3000);
  }
}
function completeCameraScan(){
  const target=state.scanTarget;
  if (!target) return;
  const r=state.ritual;
  if (r.camSeen[target]){
    state.scanDone=true;
    // Re-scanning an already-revealed prop used to be silent, which read as
    // "there is nothing here" to a player who came back to double-check.
    const had={incense:'香三炷',bowl:'水靠左',thread:'线高结'}[target];
    if (!state.silent) say('取景器：'+had+'。（已记录）',2200);
    return;
  }
  r.camSeen[target]=true;
  state.scanDone=true;
  updateRitualHUD();
  if (state.caseOpen) renderCase();
  const all=r.camSeen.incense&&r.camSeen.bowl&&r.camSeen.thread;
  const line={incense:'香三炷',bowl:'水靠左',thread:'线高结'}[target];
  if (!state.silent){
    playMedia('scanPing',0.32,0.02);
    playMedia('oldBreath',0.28,0.05);
    glitchNow();
    say(all?'取景器：三样都对上了。各拍一张，再起仪。':'取景器：'+line+'。',3800);
  } else {
    say(all?'取景器：三样都对上了。各拍一张。':'取景器：'+line+'。',3000);
  }
  const photoLine=photosAll()?'':'　·　L 拍照';
  prompt('松开 F 放下 DV　·　Tab 记录'+photoLine+'　·　R 看旧带',4600);
}
function scanRisk(){
  const r=state.ritual;
  if (state.scanRisked || !state.scanTarget) return;
  state.scanRisked=true;
  r.reviews=Math.max(r.reviews||0,2);
  glitchNow();
  if (!state.silent){
    playMedia('oldBreath',0.8,0.03);
    if (actx) tone(40,1.1,'sine',0.09);
    say('取景器里多了一个人。',2800);
  }
}
// Dev/sim seam: scan timing normally reads performance.now(); a harness can
// point it at its own simulated clock so "hold F for 1.3s" advances honestly.
let scanClock=null;
function scanNow(){ return scanClock?scanClock():performance.now(); }
function updateScanProgress(){
  const target=state.scanTarget;
  const now=scanNow();
  if (!state.scanStart) state.scanStart=now;
  state.scanT=Math.min(4.2,(now-state.scanStart)/1000);
  const s=state.scanT;
  if (state.chapter===3){
    if (target && s>=1.0 && !state.scanDone) state.scanDone=true;
  } else {
    if (target && s>=1.2 && !state.scanDone) completeCameraScan();
    if (target && s>=2.8) scanRisk();
  }
}
function renderCameraScan(ctx,t){
  updateScanProgress();
  const r=state.ritual;
  const target=state.scanTarget;
  const s=state.scanT;
  camLowCtx.setTransform(1,0,0,1,0,0);
  camLowCtx.clearRect(0,0,640,480);
  drawCameraPixelScene(camLowCtx,t,{scan:true,looking:false,mismatch:false});
  const a=Math.max(0,Math.min(1,(s-0.12)/0.55));
  const done=r.camSeen[target]||state.scanDone;
  const ga=done?1:a;
  // Ghost layers, drawn in the base 640×480 scene before the crop.
  camLowCtx.save();
  camLowCtx.globalCompositeOperation='screen';
  if (target==='incense'){
    for (let k=0;k<3;k++){
      const x=328+k*6, y=316, h=54;
      camLowCtx.fillStyle='rgba(160,220,210,'+(0.65*ga)+')';
      camLowCtx.fillRect(x,y-h,1.5,h);
      camLowCtx.fillStyle='rgba(225,255,242,'+(0.85*ga)+')';
      camLowCtx.fillRect(x,y-h-2,1.5,2);
    }
    // the face behind the censer
    camLowCtx.fillStyle='rgba(190,210,198,'+(0.24*ga)+')';
    camLowCtx.fillRect(370,222,30,38);
    camLowCtx.fillStyle='rgba(12,16,14,'+(0.55*ga)+')';
    camLowCtx.fillRect(376,232,4,3); camLowCtx.fillRect(390,232,4,3);
    camLowCtx.fillRect(382,246,8,2);
  } else if (target==='bowl'){
    camLowCtx.strokeStyle='rgba(150,225,210,'+(0.8*ga)+')';
    camLowCtx.lineWidth=1.5;
    camLowCtx.beginPath(); camLowCtx.ellipse(190,302,28,10,0,0,Math.PI*2); camLowCtx.stroke();
    camLowCtx.fillStyle='rgba(120,200,190,'+(0.10*ga)+')';
    camLowCtx.beginPath(); camLowCtx.ellipse(190,302,27,9,0,0,Math.PI*2); camLowCtx.fill();
    // reflection of eyes in the water
    camLowCtx.fillStyle='rgba(220,245,232,'+(0.7*ga)+')';
    camLowCtx.fillRect(181,299,2,1); camLowCtx.fillRect(197,299,2,1);
    camLowCtx.fillStyle='rgba(10,14,12,'+(0.8*ga)+')';
    camLowCtx.fillRect(182,299,1,1); camLowCtx.fillRect(198,299,1,1);
    // a hand under the table
    camLowCtx.fillStyle='rgba(150,120,96,'+(0.22*ga)+')';
    camLowCtx.fillRect(170,338,8,20); camLowCtx.fillRect(180,342,7,16);
  } else if (target==='thread'){
    camLowCtx.strokeStyle='rgba(225,92,66,'+(0.8*ga)+')';
    camLowCtx.setLineDash([4,4]);
    camLowCtx.beginPath(); camLowCtx.moveTo(190,300); camLowCtx.lineTo(58,150); camLowCtx.stroke();
    camLowCtx.setLineDash([]);
    camLowCtx.fillStyle='rgba(245,160,110,'+(0.85*ga)+')';
    camLowCtx.fillRect(55,146,6,2); camLowCtx.fillRect(57,143,2,8);
    // a hanging shadow behind the door frame
    camLowCtx.fillStyle='rgba(4,8,8,'+(0.42*ga)+')';
    camLowCtx.fillRect(22,112,34,150);
    camLowCtx.fillStyle='rgba(150,170,160,'+(0.18*ga)+')';
    camLowCtx.fillRect(32,126,4,2); camLowCtx.fillRect(43,126,4,2);
  }
  camLowCtx.restore();
  const crops={
    incense:{x:245,y:200,w:220,h:165},
    bowl:{x:95,y:225,w:220,h:165},
    thread:{x:0,y:95,w:180,h:135},
    null:{x:40,y:70,w:560,h:420}
  };
  const c=crops[target]||crops.null;
  ctx.save(); ctx.imageSmoothingEnabled=false;
  ctx.drawImage(camLow,c.x,c.y,c.w,c.h,0,0,CW,CH);
  ctx.restore();
  // cold scan cast
  ctx.fillStyle='rgba(18,42,38,.13)'; ctx.fillRect(0,0,CW,CH);
  // shutter flash + the hand that only exists in the photo
  const nowMs=performance.now();
  const flashLeft=state.photoFlashUntil-nowMs;
  if (flashLeft>0){
    ctx.fillStyle='rgba(252,246,226,'+(0.78*Math.min(1,flashLeft/150))+')';
    ctx.fillRect(0,0,CW,CH);
  }
  const revealLeft=state.photoRevealUntil-nowMs;
  if (revealLeft>0 && state.photoRevealTarget){
    const a=Math.min(1,revealLeft/900)*0.55;
    ctx.save();
    ctx.globalAlpha=a;
    ctx.fillStyle='rgba(196,198,178,.75)';
    ctx.fillRect(CW-82,CH-205,20,74);
    ctx.fillRect(CW-88,CH-236,7,34);
    ctx.fillRect(CW-76,CH-240,7,38);
    ctx.fillRect(CW-64,CH-238,7,36);
    ctx.fillRect(CW-52,CH-230,7,28);
    ctx.fillStyle='rgba(120,118,102,.6)';
    ctx.fillRect(CW-80,CH-170,4,30);
    ctx.restore();
  }
  if (!target){
    ctx.save();
    ctx.font='13px "Courier New","PingFang SC",monospace';
    ctx.fillStyle='rgba(210,240,232,.8)';
    ctx.textAlign='center';
    ctx.fillText('没有对准',CW/2,CH/2-10);
    ctx.font='10px "PingFang SC",sans-serif';
    ctx.fillStyle='rgba(210,240,232,.5)';
    ctx.fillText('靠近香炉、水碗或门框，再举起 DV。',CW/2,CH/2+14);
    ctx.restore();
  } else if (done){
    ctx.save();
    ctx.font='11px "Courier New","PingFang SC",monospace';
    ctx.fillStyle='rgba(170,225,212,.82)';
    const label={incense:'香 3',bowl:'水 左',thread:'线 高'}[target];
    ctx.fillText(label,40,CH-120);
    ctx.font='9px "PingFang SC",sans-serif';
    ctx.fillStyle='rgba(170,225,212,.5)';
    ctx.fillText('已显影',40,CH-102);
    ctx.restore();
  }
  // develop bar
  const pct=target?Math.min(100,Math.round(state.scanT/1.2*100)):0;
  ctx.save();
  ctx.font='10px "Courier New",monospace';
  ctx.fillStyle='rgba(210,240,232,.65)';
  ctx.fillText('显影',44,CH-74);
  ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(84,CH-82,220,8);
  ctx.fillStyle=pct>=100?'rgba(160,225,205,.8)':'rgba(120,190,180,.65)';
  ctx.fillRect(85,CH-81,Math.max(0,(218*pct/100)),6);
  ctx.fillStyle='rgba(210,240,232,.45)';
  ctx.fillText(pct+'%',314,CH-74);
  ctx.restore();
  ctx.save();
  ctx.font='10px "Courier New",monospace';
  ctx.textAlign='right';
  ctx.fillStyle='rgba(210,240,232,.5)';
  const n=state.chapter===3?(state.hunt?state.hunt.count:0):Object.values(state.photos).filter(Boolean).length;
  ctx.fillText('PHOTO '+n+'/3',CW-44,CH-74);
  ctx.restore();
  drawCameraOverlay(ctx,t,'00:00:00','SCAN',false,false);
  drawScanlines(ctx,CW,CH,.055);
}
function renderHideScan(ctx,t){
  const h=state.hide;
  camLowCtx.setTransform(1,0,0,1,0,0);
  camLowCtx.clearRect(0,0,640,480);
  drawCameraPixelScene(camLowCtx,t,{scan:true,looking:false,mismatch:false});
  ctx.save(); ctx.imageSmoothingEnabled=false;
  ctx.drawImage(camLow,0,0,640,480,0,0,CW,CH);
  ctx.restore();
  ctx.fillStyle='rgba(18,42,38,.14)'; ctx.fillRect(0,0,CW,CH);
  const px=[140,320,500][h.facing]||320;
  ctx.save();
  ctx.strokeStyle='rgba(210,80,60,.45)';
  ctx.setLineDash([5,5]);
  ctx.beginPath(); ctx.moveTo(520,250); ctx.lineTo(px,250); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='rgba(220,240,228,.7)';
  ctx.fillRect(px-8,240,3,3); ctx.fillRect(px+5,240,3,3);
  ctx.fillStyle='rgba(10,14,12,.75)';
  ctx.fillRect(px-7,240,1,1); ctx.fillRect(px+6,240,1,1);
  ctx.restore();
  ctx.save();
  ctx.font='11px "Courier New","PingFang SC",monospace';
  ctx.fillStyle='rgba(170,225,212,.85)';
  ctx.fillText('她正看着'+HIDE_SPOTS[h.facing].label,40,CH-120);
  ctx.font='9px "PingFang SC",sans-serif';
  ctx.fillStyle='rgba(170,225,212,.55)';
  ctx.fillText('松开放下，躲到另外两个地方之一。',40,CH-102);
  ctx.restore();
  ctx.save();
  ctx.font='10px "Courier New",monospace';
  ctx.textAlign='right';
  ctx.fillStyle='rgba(210,240,232,.65)';
  ctx.fillText('第 '+(h.round+1)+'/3 轮　'+Math.max(0,h.remaining).toFixed(1)+'s',CW-44,CH-74);
  ctx.restore();
  drawCameraOverlay(ctx,t,'00:00:00','SCAN',false,false);
  drawScanlines(ctx,CW,CH,.055);
}
function renderHuntScan(ctx,t){
  const h=state.hunt;
  camLowCtx.setTransform(1,0,0,1,0,0);
  camLowCtx.clearRect(0,0,640,480);
  drawCameraPixelScene(camLowCtx,t,{scan:true,looking:false,mismatch:false});
  ctx.save(); ctx.imageSmoothingEnabled=false;
  ctx.drawImage(camLow,0,0,640,480,0,0,CW,CH);
  ctx.restore();
  ctx.fillStyle='rgba(18,42,38,.14)'; ctx.fillRect(0,0,CW,CH);
  ctx.fillStyle='rgba(3,5,4,.88)'; ctx.fillRect(CW*0.64,0,CW*0.36,CH);
  const flashLeft=state.photoFlashUntil-performance.now();
  if (flashLeft>0){
    ctx.fillStyle='rgba(252,246,226,'+(0.78*Math.min(1,flashLeft/150))+')';
    ctx.fillRect(0,0,CW,CH);
  }
  const px=[140,320,500][h.pos]||320, py=258;
  const a=0.55+0.12*Math.sin(t*3.1);
  ctx.save();
  ctx.globalCompositeOperation='screen';
  ctx.fillStyle='rgba(185,205,190,'+(0.42*a)+')';
  ctx.fillRect(px-5,py,16,70);
  ctx.fillRect(px-12,py-34,7,42);
  ctx.fillRect(px-2,py-38,7,46);
  ctx.fillRect(px+8,py-36,7,44);
  ctx.fillRect(px+18,py-28,7,36);
  ctx.fillStyle='rgba(220,240,228,'+(0.55*a)+')';
  ctx.fillRect(px-10,py-52,3,2); ctx.fillRect(px-3,py-52,3,2);
  ctx.fillStyle='rgba(8,12,10,'+(0.7*a)+')';
  ctx.fillRect(px-9,py-52,1,1); ctx.fillRect(px-2,py-52,1,1);
  ctx.restore();
  ctx.save();
  ctx.font='11px "Courier New","PingFang SC",monospace';
  ctx.fillStyle='rgba(170,225,212,.82)';
  ctx.fillText(state.chapter===2?('取景器：'+huntViewHint(h.pos)):'取景器：她在'+HIDE_SPOTS[h.pos].label,40,CH-120);
  ctx.font='9px "PingFang SC",sans-serif';
  ctx.fillStyle='rgba(170,225,212,.55)';
  ctx.fillText(state.chapter===2?'放下 DV，在房间里找同一处。':'走近她，按 L 快门。',40,CH-102);
  ctx.restore();
  ctx.save();
  ctx.font='10px "Courier New",monospace';
  ctx.textAlign='right';
  ctx.fillStyle='rgba(210,240,232,.55)';
  ctx.fillText(state.chapter===3?('PHOTO '+h.count+'/3'):'FIND '+h.count+'/3',CW-44,CH-74);
  ctx.restore();
  drawCameraOverlay(ctx,t,'00:00:00','SCAN',false,false);
  drawScanlines(ctx,CW,CH,.055);
}
function renderCameraPixel(ctx,t,opts={}){
  const low=camLowCtx;
  low.setTransform(1,0,0,1,0,0);
  low.clearRect(0,0,640,480);
  drawCameraPixelScene(low,t,opts);
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(camLow,0,0,640,480,0,0,CW,CH);
  ctx.restore();
  drawCameraOverlay(ctx,t,cameraTimecode(opts),opts.label||'REC',opts.stamp!==false);
}
function drawReviewQuiz(ctx){
  if (state.reviewKind!=='gap') return;
  const q=state.reviewQuiz;
  if (!q) return;
  const x=36, y=CH-300, w=568, h=156;
  ctx.save();
  ctx.fillStyle='rgba(6,7,6,.93)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='rgba(192,74,56,.45)'; ctx.strokeRect(x+.5,y+.5,w-1,h-1);
  ctx.fillStyle='#b8873f'; ctx.font='9px "Courier New",monospace';
  ctx.fillText('回看校验 · 23:06',x+16,y+20);
  ctx.fillStyle='#e8dfc8'; ctx.font='17px "Songti SC","STSong",serif';
  if (!q.locked){
    const item=REVIEW_QUIZ[q.step];
    ctx.fillText(item?item.q:'',x+16,y+46);
    ctx.font='12px "Courier New","PingFang SC",monospace';
    ctx.fillStyle='rgba(216,201,168,.8)';
    if (item) ctx.fillText(item.opts.map((o,i)=>(i+1)+'  '+o).join('　　'),x+18,y+78);
    ctx.fillStyle='rgba(216,201,168,.4)'; ctx.font='10px "PingFang SC",sans-serif';
    ctx.fillText('按数字键选择。选错会跳带。',x+18,y+102);
  } else {
    ctx.fillText('磁带 1999 · 缺帧：白胶布的手',x+16,y+46);
    ctx.fillStyle='rgba(160,220,200,.75)'; ctx.font='12px "Courier New","PingFang SC",monospace';
    ctx.fillText('拖动重建条对齐 23:06；Q / E 微调。',x+18,y+78);
  }
  ctx.fillStyle='rgba(192,74,56,.65)'; ctx.font='9px "Courier New",monospace';
  ctx.fillText('WRONG '+q.wrong,x+w-80,y+20);
  ctx.restore();
}
function drawReview(ctx,t){
  const kind=state.reviewKind;
  if (kind==='look'){
    // a paused frame of the old woman's face, treated as tape evidence
    ctx.fillStyle='#050506'; ctx.fillRect(0,0,CW,CH);
    if (!drawFaceCover(ctx,CW,CH,{frame:state.lookFrame||0})){
      ctx.fillStyle='#12130f'; ctx.fillRect(0,0,CW,CH);
      ctx.fillStyle='#d84a38'; ctx.font='24px "Courier New",monospace';
      ctx.fillText('NO SIGNAL',CW/2-90,CH/2);
      drawCameraOverlay(ctx,t,'00:41:12','PAUSE',false);
      return;
    }
    // tape tracking band drifting down the paused frame
    const bandY=Math.floor((CH*0.16 + ((t*22)%(CH*0.72))));
    ctx.save();
    ctx.globalAlpha=0.20;
    try{ ctx.drawImage(ctx.canvas,0,bandY,CW,16,7,bandY,CW,16); }catch(e){}
    ctx.fillStyle='rgba(200,200,190,.07)'; ctx.fillRect(0,bandY,CW,16);
    ctx.fillStyle='rgba(190,40,30,.10)'; ctx.fillRect(0,bandY+6,CW,3);
    ctx.restore();
    // chroma fringe at the edges
    ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=0.10;
    ctx.fillStyle='#c03020'; ctx.fillRect(0,0,8,CH);
    ctx.fillStyle='#2080a0'; ctx.fillRect(CW-8,0,8,CH);
    ctx.restore();
    // pause bars + label
    ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,CH-78,CW,78);
    ctx.fillStyle='#d84a38'; ctx.fillRect(38,CH-56,10,30);
    ctx.fillStyle='#d84a38'; ctx.fillRect(56,CH-56,10,30);
    ctx.fillStyle='#e8dfc8'; ctx.font='16px "Courier New",monospace';
    ctx.fillText('PAUSE',78,CH-34);
    ctx.fillStyle='#8d8574'; ctx.font='12px "Courier New",monospace';
    ctx.fillText('一帧被暂停的素材 · 00:41:'+String(12+(state.lookFrame||0)).padStart(2,'0')+'　A / D 逐帧',170,CH-34);
    drawCameraOverlay(ctx,t,'00:41:12','PAUSE',false);
    return;
  }
  if (kind==='gap' || kind==='static'){
    ctx.fillStyle='#050605'; ctx.fillRect(0,0,CW,CH);
    if (state.reviewSplit && kind==='gap'){
      // left: empty tape
      ctx.fillStyle='#000'; ctx.fillRect(0,0,CW/2,CH);
      drawNoise(ctx,0,0,CW/2,CH,700);
      for (let i=0;i<5;i++){ ctx.fillStyle='rgba(200,200,190,.05)'; ctx.fillRect(0,60+i*70,CW/2,2); }
      ctx.fillStyle='#d84a38'; ctx.font='15px "Courier New",monospace';
      ctx.fillText('NO SIGNAL',34,104);
      ctx.fillStyle='#e8dfc8'; ctx.font='13px "Courier New",monospace';
      ctx.fillText('00:18:07—00:41:11',34,132);
      ctx.fillStyle='#8d8574'; ctx.font='12px "Courier New",monospace';
      ctx.fillText('23:06 空白',34,156);
      ctx.fillText('素材 / 徐英子的 DV',34,CH-30);
      // right: reconstruction
      ctx.fillStyle='#070806'; ctx.fillRect(CW/2,0,CW/2,CH);
      reviewPctx.clearRect(0,0,PW,PH);
      drawThirdPerson(reviewPctx,state.time);
      const rw=CW/2-18, rh=rw*9/16;
      ctx.drawImage(reviewPixel,CW/2+9,128,rw,rh);
      ctx.strokeStyle='rgba(216,201,168,.30)'; ctx.lineWidth=1;
      ctx.strokeRect(CW/2+9,128,rw,rh);
      ctx.fillStyle='#e8dfc8'; ctx.font='13px "Courier New",monospace';
      ctx.fillText('重建 / 徐英子的记忆',CW/2+22,52);
      ctx.fillStyle='#8d8574'; ctx.font='11px "Courier New",monospace';
      ctx.fillText('素材里没有她的脸；重建替她补了一张。',CW/2+22,78);
      if (state.reconAligned){
        ctx.fillStyle='#c04a38'; ctx.font='12px "Courier New",monospace';
        ctx.fillText('补上的 23:06',CW/2+22,128+rh+20);
      } else {
        ctx.fillStyle='#5d574a'; ctx.font='11px "Courier New",monospace';
        ctx.fillText('拖动重建条，对齐时间码',CW/2+22,128+rh+20);
      }
      // divider
      ctx.strokeStyle='rgba(192,74,56,.6)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(CW/2,0); ctx.lineTo(CW/2,CH); ctx.stroke();
      drawCameraOverlay(ctx,t,'--:--:--','PLAY',false);
    } else {
      drawNoise(ctx,0,0,CW,CH,1600);
      for (let i=0;i<8;i++){ ctx.fillStyle='rgba(200,200,190,.04)'; ctx.fillRect(0,40+i*54,CW,2); }
      // tape tear
      ctx.fillStyle='rgba(180,30,20,.18)'; ctx.fillRect(0,CH*0.47,CW,4);
      ctx.fillStyle='rgba(220,220,210,.45)'; ctx.fillRect(0,CH*0.47+5,CW,1);
      // large blank marker
      ctx.fillStyle='#d84a38'; ctx.font='20px "Courier New",monospace';
      ctx.fillText('NO SIGNAL',CW/2-86,CH/2-72);
      ctx.fillStyle='#e8dfc8'; ctx.font='52px "Courier New",monospace';
      ctx.fillText('23:06',CW/2-86,CH/2-16);
      ctx.fillStyle='#8d8574'; ctx.font='15px "Courier New",monospace';
      ctx.fillText('空白 / 00:18:07—00:41:11',CW/2-86,CH/2+22);
      ctx.fillStyle='#5d574a'; ctx.font='11px "Courier New",monospace';
      ctx.fillText('磁带 02 · 徐英子的 DV',CW/2-86,CH/2+48);
      drawCameraOverlay(ctx,t,reviewTimecode(),'PLAY',false);
    }
    drawReviewQuiz(ctx);
    return;
  }
  renderCameraPixel(ctx,t,{
    looking:kind==='look'||kind==='mismatch',
    mismatch:kind==='mismatch',
    label:'PLAY',
    stamp:false,
    timecode:reviewTimecode()
  });
  if (kind==='normal' && state.ritual.active && !state.ritual.done) drawRitualClue(ctx);
}

// The tape clue is deliberately a diegetic paper strip, not a quest popup.
function drawRitualClue(ctx){
  const loop=state.ritual.loop||0;
  const x=CW-270, y=80, w=248, h=206;
  const damaged=loop===1;
  const mercy=loop>=2;
  const rows=loop===0
    ? [['香','二炷'],['水','居中'],['线','低结']]
    : mercy
      ? [['香','？'],['水','靠左'],['线','？']]
      : [['香','？'],['水','？'],['线','？']];
  const title=loop===0?'供桌原样':(mercy?'只对上一项':'这一页不对');
  const note=loop===0?'照这个摆回去。':(mercy?'带子只对上了水。香和绳，看实物。':'带子在骗你。看实物。');
  ctx.save();
  ctx.fillStyle='rgba(7,8,6,.92)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=damaged?'rgba(192,74,56,.62)':'rgba(216,201,168,.36)'; ctx.lineWidth=1;
  ctx.strokeRect(x+.5,y+.5,w-1,h-1);
  ctx.fillStyle=damaged?'#d84a38':'#c04a38'; ctx.fillRect(x+16,y+16,4,28);
  ctx.fillStyle='#b8873f'; ctx.font='9px "Courier New",monospace';
  ctx.fillText(damaged?'旧带 · 信号损坏':'旧带 · 18:06',x+30,y+24);
  ctx.fillStyle=damaged?'#d84a38':'#e8dfc8'; ctx.font='18px "Songti SC","STSong",serif';
  ctx.fillText(title,x+30,y+48);
  ctx.strokeStyle='rgba(216,201,168,.18)'; ctx.beginPath();
  ctx.moveTo(x+16,y+62); ctx.lineTo(x+w-16,y+62); ctx.stroke();
  ctx.font='12px "Courier New","PingFang SC",monospace';
  for (let i=0;i<rows.length;i++){
    const yy=y+86+i*26;
    ctx.fillStyle='rgba(216,201,168,.55)'; ctx.fillText(rows[i][0],x+22,yy);
    ctx.fillStyle=mercy?'#f0b38a':'#f0e7d2'; ctx.fillText(rows[i][1],x+92,yy);
    ctx.fillStyle=mercy?'#d84a38':'#c04a38';
    if (i===0){
      const n=loop===0?2:0;
      for (let k=0;k<n;k++) ctx.fillRect(x+58+k*4,yy-10,1,10);
      if (!n){ ctx.font='16px "Courier New",monospace'; ctx.fillText('×',x+58,yy); ctx.font='12px "Courier New","PingFang SC",monospace'; }
    }
    if (i===1){
      if (loop===0){ ctx.strokeStyle='#c04a38'; ctx.beginPath(); ctx.arc(x+60,yy-5,5,0,Math.PI); ctx.stroke(); }
      else if (mercy){ ctx.strokeStyle='#d84a38'; ctx.beginPath(); ctx.arc(x+56,yy-5,5,0,Math.PI); ctx.stroke(); }
      else { ctx.font='16px "Courier New",monospace'; ctx.fillText('×',x+58,yy); ctx.font='12px "Courier New","PingFang SC",monospace'; }
    }
    if (i===2){
      if (loop===0){ ctx.fillRect(x+59,yy-6,2,2); ctx.fillRect(x+60,yy-4,1,5); }
      else { ctx.font='16px "Courier New",monospace'; ctx.fillText('×',x+58,yy); ctx.font='12px "Courier New","PingFang SC",monospace'; }
    }
  }
  if (damaged){
    ctx.strokeStyle='rgba(192,74,56,.55)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x+12,y+112); ctx.lineTo(x+w-14,y+94); ctx.stroke();
    ctx.strokeStyle='rgba(7,8,6,.9)'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(x+10,y+114); ctx.lineTo(x+w-12,y+96); ctx.stroke();
  }
  ctx.fillStyle='rgba(216,201,168,.5)'; ctx.font='10px "PingFang SC",sans-serif';
  ctx.fillText(note,x+22,y+176);
  ctx.strokeStyle='rgba(192,74,56,.55)'; ctx.strokeRect(x+w-46,y+h-40,28,22);
  ctx.fillStyle='rgba(192,74,56,.8)'; ctx.font='12px "Songti SC",serif';
  ctx.fillText('仪',x+w-38,y+h-24);
  ctx.restore();
}
function chooseBad(){
  if (state.ending) return;
  state.runEnd=state.runStart?performance.now()-state.runStart:0;
  updateRunText();
  closeCase();
  state.ending='bad';
  state.ended=true;
  document.body.classList.add('ended');
  state.choice=false;
  state.camera=false;
  camera.classList.remove('on');
  updateVideoLayer();
  camMeta.classList.add('hidden');
  prompt('');
  subtitleEl.classList.add('hidden');
  cancelLater(subtitleTimer);
  clearInterval(state.uncannyTimer); state.uncannyTimer=null;
  state.ritual.active=false; updateRitualHUD();
  stopDrone();
  stopAmbience(1.2);
  playMedia('collapse2',0.55,0.3);
  playMedia('door',0.42,0.05);
  fadeEl.classList.add('on');
  later(()=>{
    endTitle.textContent='她替你摆好了。';
    endText.innerHTML='你摆了三次。<br/>第四次，她的手从供桌后面伸过来。';
    endEl.classList.remove('hidden');
    fadeEl.classList.remove('on');
  },520);
}
function choose(ending){
  if (state.ending) return;
  state.runEnd=state.runStart?performance.now()-state.runStart:0;
  updateRunText();
  closeCase();
  state.ending=ending;
  state.ended=true;
  document.body.classList.add('ended');
  state.choice=false;
  state.camera=false;
  camera.classList.remove('on');
  updateVideoLayer();
  camMeta.classList.add('hidden');
  prompt('');
  subtitleEl.classList.add('hidden');
  cancelLater(subtitleTimer);
  clearInterval(state.uncannyTimer); state.uncannyTimer=null;
  stopDrone();
  stopAmbience(1.4);
  playCue(ending==='help'?'endingHelp':'endingFilm');
  fadeEl.classList.add('on');
  later(()=>{
    if (ending==='help'){
      endTitle.textContent='你走过去了。';
      endText.innerHTML = state.reconAligned
        ? '你把重建对齐了。<br/>那 23 分钟是徐英子补的。'
        : state.reviewFoundGap
        ? '你没有拍到那 23 分钟。<br/>你碰到的，是徐英子的记忆。'
        : (state.mismatch
          ? '她抬起的是另一只手。<br/>你碰到的，是徐英子的记忆。'
          : '她还在看镜头。<br/>你碰到的，是徐英子的记忆。');
    } else {
      endTitle.textContent='你一直在拍她。';
      endText.innerHTML = state.reconAligned
        ? '你拍到的，是她没有抬起的手。<br/>那 23 分钟是重建补的。'
        : state.reviewFoundGap
        ? '你拍到的，是她没有抬起的手。<br/>那 23 分钟是空的。'
        : (state.mismatch
          ? '你拍到的，是她没有抬起的手。<br/>第三人称是徐英子的重建。'
          : '你拍的，不是你看见的。<br/>第三人称是徐英子的重建。');
    }
    if (photosAll()) endText.innerHTML += '<br/>三张照片里，站在你身后的人，是徐英子。';
    endEl.classList.remove('hidden');
    fadeEl.classList.remove('on');
  },520);
}
function interact(){
  if (!state.started || state.ended || state.camera || state.review || state.caseOpen || state.transition) return;
  if (state.scene==='darkroom'){ darkInteract(); return; }
  if (state.scene==='corridor'){ corridorInteract(); return; }
  if (state.chapter===5 && state.finalPhoto && !state.phoneDone){
    if (nearDoor()) startCorridor();
    else { say('电话在门后。',2400); prompt('走到门口按 E 接电话',3600); }
    return;
  }
  if (state.chapter===2 && huntInteract()) return;
  if (state.chapter===3){ say('房间被改过。举起 F，对准不对的地方按 L。',2800); return; }
  if (state.chapter===4 && hideInteract()) return;
  const rk=ritualNearest();
  if (rk){ cycleRitual(rk); return; }
  if (state.choice){
    if (!state.uncannyDone){ triggerUncanny(); return; }
    if (state.ritual.active && !state.ritual.done){
      say('老妇：先摆好供桌。香、水、线。',3000);
      prompt('R 看旧带　/　E 调整供桌',4200);
      return;
    }
    if (!state.handRaised && !state.reviewFoundGap){
      say('老妇：手给我看看。',2800);
      prompt('Q 让她抬手　/　按住 F 举起 DV',4600);
      return;
    }
    if (!nearWoman()){ say('走近她。',2200); prompt('WASD 走近她',3000); return; }
    choose('help'); return;
  }
  if (nearWoman()){
    state.talked=true;
    say('老妇：手给我看看。',3200);
    prompt('按住 F / 右键，举起 DV',5200);
    sClick();
  } else if (nearDoor()){
    say('门闩着。你出不去了。',2600);
    sClick();
  } else {
    say('她看着你，没有说话。',2200);
    sClick();
  }
}

// =========================================================
//  INPUT
// =========================================================
if (new URLSearchParams(location.search).get('dump')==='1'){
  // headless state probe: every field a screenshot cannot show
  setInterval(()=>{
    const d={scene:state.scene,ch:state.chapter,ph:state.phoneDone,fp:state.finalPhoto,
      corr:state.corr,dark:state.dark,trans:state.transition,lk:state.inputLock,
      started:state.started,ended:state.ended,st:+state.time.toFixed(1)};
    document.title='DUMP '+JSON.stringify(d);
  },500);
}
window.addEventListener('keydown',(e)=>{
  // Keyboard-only players finish the game on the keyboard, so the shelves need
  // keys too: Enter restarts, C opens credits, Esc returns to the title.
  if (state.ended && !endEl.classList.contains('hidden')
      && (creditsEl===null || creditsEl.classList.contains('hidden'))){
    if (e.code==='Enter'||e.code==='NumpadEnter'||e.code==='Space'){
      e.preventDefault(); ensureAudio(); startGame(false); return;
    }
    if (e.code==='KeyC'){ e.preventDefault(); showCredits('end'); return; }
    if (e.code==='Escape'){ e.preventDefault(); returnToTitle(); return; }
  }
  if (!state.started && !startEl.classList.contains('hidden')
      && (creditsEl===null || creditsEl.classList.contains('hidden'))){
    if (e.code==='Enter'||e.code==='NumpadEnter'||e.code==='Space'){
      e.preventDefault(); ensureAudio(); startGame(false); return;
    }
  }
  if (state.paused && e.code!=='Escape') return;
  // Case board: Tab opens/closes; Esc closes before pause.
  if (e.code==='Tab' && state.started && !state.ended){
    e.preventDefault();
    if (state.caseOpen) closeCase(); else openCase();
    return;
  }
  if (state.caseOpen){
    if (e.code==='Escape'){ e.preventDefault(); closeCase(); }
    return;
  }
  // Shelf chrome first: Esc closes credits, otherwise toggles pause.
  if (e.code==='Escape' && creditsEl && !creditsEl.classList.contains('hidden')){
    e.preventDefault(); hideCredits(); return;
  }
  if (e.code==='Escape' && state.started && !state.ended){
    e.preventDefault();
    if (state.paused) resumeGame(); else pauseGame();
    return;
  }
  if (state.paused) return;
  // Hands in the splicer: Q / E slide the tape, Space joins it, F lets go.
  if (state.scene==='darkroom' && state.dark && state.dark.open && !state.ended){
    if (e.code==='KeyQ'||e.code==='ArrowLeft'){ e.preventDefault(); spliceAdjust(-1); return; }
    if (e.code==='KeyE'||e.code==='ArrowRight'){ e.preventDefault(); spliceAdjust(1); return; }
    if (e.code==='Space'||e.code==='Enter'){ e.preventDefault(); spliceCommit(); return; }
    if (e.code==='KeyF' && !e.repeat){ e.preventDefault(); closeSplicer(); return; }
    if (e.code==='KeyW'||e.code==='KeyS'||e.code==='ArrowUp'||e.code==='ArrowDown'){ e.preventDefault(); return; }
  }
  if (e.repeat && !['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){
    e.preventDefault(); return;
  }
  if (state.inputLock && e.code!=='Escape'){ e.preventDefault(); return; }
  if (e.code==='KeyM'){ e.preventDefault(); ensureAudio(); toggleMute(); return; }
  if (e.code==='Space'){ e.preventDefault(); commitRitual(); return; }
  if (e.code==='KeyL'){
    e.preventDefault();
    if (state.scene==='darkroom') darkPrint(); else takePhoto();
    return;
  }
  if (e.code==='KeyA'||e.code==='ArrowLeft') keys.left=true;
  if (e.code==='KeyD'||e.code==='ArrowRight') keys.right=true;
  if (e.code==='KeyW'||e.code==='ArrowUp') keys.up=true;
  if (e.code==='KeyS'||e.code==='ArrowDown') keys.down=true;
  if (state.review){
    if (state.reviewKind==='gap' && state.reviewQuiz && !state.reviewQuiz.locked){
      if (e.code==='Digit1'||e.code==='Numpad1'){ e.preventDefault(); reviewPick(1); return; }
      if (e.code==='Digit2'||e.code==='Numpad2'){ e.preventDefault(); reviewPick(2); return; }
      if (e.code==='Digit3'||e.code==='Numpad3'){ e.preventDefault(); reviewPick(3); return; }
    }
    if (e.code==='KeyQ'){ e.preventDefault(); setReconOffset(state.reconOffset-0.01); }
    if (e.code==='KeyE'){ e.preventDefault(); setReconOffset(state.reconOffset+0.01); }
    if (e.code==='KeyP'){ e.preventDefault(); toggleReviewSplit(); }
    if (e.code==='KeyR'||e.code==='Escape'){ e.preventDefault(); exitReview(); }
    return;
  }
  if (e.code==='KeyE'){ e.preventDefault(); interact(); }
  if (e.code==='KeyQ'){ e.preventDefault(); raiseHand(); }
  if (e.code==='KeyR'){ e.preventDefault(); if (state.review) exitReview(); else if (canReview()) startReview(); }
  if (e.code==='KeyP'){ e.preventDefault(); toggleReviewSplit(); }
  if (e.code==='Escape' && state.review){ e.preventDefault(); exitReview(); }
  if (e.code==='KeyF'){
    e.preventDefault();
    if (state.scene==='darkroom') darkLookOn();
    else if (state.scene==='corridor') corridorLookOn();
    else if (!state.camera) setCamera(true);
  }
});
window.addEventListener('keyup',(e)=>{
  if (e.code==='KeyA'||e.code==='ArrowLeft') keys.left=false;
  if (e.code==='KeyD'||e.code==='ArrowRight') keys.right=false;
  if (e.code==='KeyW'||e.code==='ArrowUp') keys.up=false;
  if (e.code==='KeyS'||e.code==='ArrowDown') keys.down=false;
  if (e.code==='KeyF'){
    e.preventDefault();
    if (state.scene==='darkroom') darkLookOff();
    else if (state.scene==='corridor') corridorLookOff();
    else if (state.camera) setCamera(false);
  }
});
function clearKeys(){
  keys.left=false; keys.right=false; keys.up=false; keys.down=false;
}
window.addEventListener('blur',()=>{
  clearKeys();
  if (state.camera) hardCloseCamera();
  if (state.started && !state.ended && !state.paused) pauseGame();
});
document.addEventListener('visibilitychange',()=>{
  if (document.hidden){
    clearKeys();
    if (state.camera) hardCloseCamera();
    if (state.started && !state.ended && !state.paused) pauseGame();
  }
});
dvBtn.addEventListener('pointerdown',(e)=>{ e.preventDefault(); ensureAudio(); try{ dvBtn.setPointerCapture(e.pointerId); }catch(err){} setCamera(true); });
dvBtn.addEventListener('pointerup',(e)=>{ try{ dvBtn.releasePointerCapture(e.pointerId); }catch(err){} if (state.camera) setCamera(false); });
dvBtn.addEventListener('pointercancel',()=>{ if (state.camera) setCamera(false); });
muteBtn.addEventListener('click',()=>{ ensureAudio(); toggleMute(); });
if (caseBtn) caseBtn.addEventListener('click',openCase);
if (caseBackEl) caseBackEl.addEventListener('click',closeCase);
reviewBtn.addEventListener('click',()=>{ ensureAudio(); if (state.review) exitReview(); else startReview(); });
tlReconBar.addEventListener('pointerdown',(e)=>{
  if (!state.review) return;
  e.preventDefault();
  state.reconDragging=true;
  state.reconDragX=e.clientX;
  state.reconDragStart=state.reconOffset;
  try{ tlReconBar.setPointerCapture(e.pointerId); }catch(err){}
});
window.addEventListener('pointermove',(e)=>{
  if (!state.reconDragging) return;
  const rect=tlReconTrack.getBoundingClientRect();
  const dx=(e.clientX-state.reconDragX)/Math.max(1,rect.width);
  setReconOffset(state.reconDragStart+dx);
});
window.addEventListener('pointerup',()=>{ state.reconDragging=false; });
stage.addEventListener('pointerdown',(e)=>{
  if (e.button===2){ e.preventDefault(); ensureAudio(); if (!state.camera) setCamera(true); }
});
window.addEventListener('pointerup',(e)=>{
  if (e.button===2 && state.camera) setCamera(false);
});
stage.addEventListener('contextmenu',(e)=>e.preventDefault());

// Shared by the render loop and the simulated-player harness so that both
// drive exactly the same movement rules.
function advanceMovement(dt){
  if (!state.camera && !state.ending && state.started && !state.caseOpen && !state.transition && !state.inputLock){
    let dx=0,dy=0;
    if (keys.left) dx-=1;
    if (keys.right) dx+=1;
    if (keys.up) dy-=1;
    if (keys.down) dy+=1;
    if (dx||dy){
      const l=Math.hypot(dx,dy); dx/=l; dy/=l;
      const nx=state.wx+dx*2.6*dt;
      if (!blocked(nx,state.wy)) state.wx=nx;
      const ny=state.wy+dy*2.6*dt;
      if (!blocked(state.wx,ny)) state.wy=ny;
      state.moving=true;
      state.walk+=dt*9;
      if (Math.abs(dx)>Math.abs(dy)) state.dir=dx>0?'E':'W';
      else state.dir=dy>0?'S':'N';
    } else {
      state.moving=false;
    }
  } else {
    state.moving=false;
  }
}
// =========================================================
//  LOOP
// =========================================================
function frame(now){
  if (window.__stopLoop) return;
  const dt=Math.min(0.05,(now-state.last)/1000||0);
  if (FUZZ_ACTIVE){ requestAnimationFrame(frame); return; }
  state.last=now;
  if (state.started && !state.paused){
    state.time+=dt;
    tickJobs();
    if (state.scene==='darkroom'){
      updateDarkroom(dt);
      pctx.clearRect(0,0,PW,PH);
      drawDarkroom(pctx,state.time);
      cctx.clearRect(0,0,CW,CH);
      camera.classList.remove('on');
      stage.classList.remove('cameraOn','reviewing');
      updateVideoLayer();
      syncCameraOverlay();
      requestAnimationFrame(frame);
      return;
    }
    if (state.scene==='corridor'){
      updateCorridor(dt);
      pctx.clearRect(0,0,PW,PH);
      drawCorridor(pctx,state.time);
      cctx.clearRect(0,0,CW,CH);
      camera.classList.remove('on');
      stage.classList.remove('cameraOn','reviewing');
      updateVideoLayer();
      syncCameraOverlay();
      requestAnimationFrame(frame);
      return;
    }
    const videoOn=updateVideoLayer();
    stage.classList.toggle('cameraOn',!!state.camera);
    if (state.glitch>0) state.glitch=Math.max(0,1-(now-state.glitchAt)/260);
    if (state.review){
      let dir=0;
      if (keys.left) dir-=1;
      if (keys.right) dir+=1;
      if (state.reviewKind==='look'){
        if (dir && now-(state.lookStepAt||0)>170){
          state.lookStepAt=now;
          stepLookFrame(dir);
        }
      } else if (dir){
        state.reviewPos=Math.max(0,Math.min(1,state.reviewPos+dir*0.12*dt));
        updateReviewKind();
      }
      pctx.clearRect(0,0,PW,PH);
      pctx.fillStyle='#000'; pctx.fillRect(0,0,PW,PH);
      drawReview(cctx,state.time);
      syncCameraOverlay();
      requestAnimationFrame(frame);
      return;
    }
    // movement
    advanceMovement(dt);
    updateBattery(dt);
    updateHide(dt);
    updateDetailAudio(now);
    // render
    pctx.clearRect(0,0,PW,PH);
    drawThirdPerson(pctx,state.time);
    if (state.camera){
      pctx.fillStyle='rgba(0,0,0,.92)'; pctx.fillRect(0,0,PW,PH);
    }
    if (state.camera || state.glitch>0){
      if (state.camera && hideScanMode()){
        renderHideScan(cctx,state.time);
      } else if (state.camera && huntScanMode()){
        renderHuntScan(cctx,state.time);
      } else if (state.camera && anomalyScanMode()){
        renderCameraScan(cctx,state.time);
      } else if (state.camera && ritualScanMode()){
        renderCameraScan(cctx,state.time);
      } else if (state.camera && videoOn && renderCameraVideoOSD(cctx,state.time)){
        // OSD sits on the separate footage canvas.
      } else if (state.camera && stage.classList.contains('videoPending')){
        renderCameraPending(cctx,state.time);
      } else {
        renderCameraPixel(cctx,state.time);
      }
      if (state.glitch>0){
        const g=state.glitch;
        cctx.save(); cctx.globalAlpha=0.4*g;
        for (let i=0;i<4+Math.floor(g*6);i++){
          const sy=Math.random()*CH, sh=2+Math.random()*8;
          cctx.drawImage(camera,0,sy*2,CW*2,sh*2,(Math.random()-0.5)*30*g,sy,CW,sh);
        }
        cctx.restore();
      }
    } else {
      cctx.clearRect(0,0,CW,CH);
    }
  }
  syncCameraOverlay();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// =========================================================
//  START / END / DEBUG
// =========================================================
function reset(){
  state.runId=(state.runId||0)+1;
  scheduledJobs.length=0;
  state.started=true; state.ended=false; state.paused=false;
  document.body.classList.remove('paused');
  document.body.classList.remove('ended');
  fadeEl.classList.remove('on');
  stage.classList.remove('cameraOn');
  const _p=document.getElementById('pause'); if (_p) _p.classList.add('hidden');
  const _c=document.getElementById('credits'); if (_c) _c.classList.add('hidden');
  state.wx=2.5; state.wy=6.5; state.dir='S'; state.walk=0; state.moving=false;
  state.camera=false; state.revealed=false; state.firstCameraDone=false;
  state.talked=false; state.choice=false; state.ending=null;
  state.uncanny=false; state.uncannyDone=false; state.front=false; state.handRaised=false; state.mismatch=false; state.takes=0;
  state.review=false; state.reviewPos=0.15; state.reviewKind='normal'; state.reviewFoundGap=false; state.reviewSplit=false;
  state.lookFrame=0; state.lookStepAt=0; state.reviewCount=0; state.blinkSaid=false; state.closeupUntil=0;
  state.ritual={incense:2,bowl:1,thread:0,active:false,seen:false,done:false,loop:0,reviews:0,eyeSaid:false,inspected:{incense:false,bowl:false,thread:false},camSeen:{incense:false,bowl:false,thread:false}};
  state.scareUntil=0; state.scareAt=0; state.caseOpen=false; state.scanStart=0; state.scanT=0; state.scanDone=false; state.scanRisked=false; state.scanTarget=null; state.battery=100; state.lastBatteryAt=0; state.photos={incense:false,bowl:false,thread:false}; state.photoScarePending=false; state.photoFlashUntil=0; state.photoRevealUntil=0; state.photoRevealTarget=null;
  state.chapter=1; state.scene='room'; state.hunt=null; state.hide=null;
  state.anomalies={incense:false,bowl:false,thread:false}; state.ch3FrameGate=false; state.ch3FrameOk=false;
  state.finalPhoto=false; state.phoneDone=false;
  state.corr={depth:0,answered:false,doorOpen:false,ringAt:0,portrait:false,threadSeen:false,
    lookOn:false,roomSeen:false,facesSeen:false,nameSeen:false};
  state.dark=null;
  state.oldWomanGone=false; state.darkChapter=false;
  state.reviewQuiz={step:0,locked:false,wrong:0}; state.reconOffset=0.08; state.reconAligned=false; state.reconEver=false; state.reconDragging=false;
  state.runStart=0; state.runEnd=0; state.chapterStartedAt=0; state.chapterTimes=[]; state.inputLock=false; state.pauseQueued=false; state.last=0;
  if (caseEl) caseEl.classList.add('hidden');
  if (chapterEl) chapterEl.classList.add('hidden');
  document.body.classList.remove('caseOpen');
  updateRitualHUD();
  updateChapterHUD();
  clearInterval(state.uncannyTimer); state.uncannyTimer=null;
  state.glitch=0; state.glitchAt=0; state.time=0; state.transition=false;
  keys.left=false; keys.right=false; keys.up=false; keys.down=false;
  camera.classList.remove('on');
  syncCameraOverlay();
  timelineEl.classList.add('hidden');
  stage.classList.remove('reviewing');
  reviewBtn.classList.add('hidden');
  reviewBtn.classList.remove('active');
  camMeta.classList.add('hidden');
  filmerEl.classList.remove('show');
  roleName.textContent='谢雨洁';
  modeEl.textContent='第三人称';
  prompt('');
  subtitleEl.classList.add('hidden');
  endEl.classList.add('hidden');
  startEl.classList.add('hidden');
  stopDrone();
  updateVideoLayer();
  stopCues();
}
function startGame(silent=false){
  reset();
  state.silent=!!silent;
  state.runStart=performance.now();
  state.chapterStartedAt=state.runStart;
  state.runEnd=0; state.chapterTimes=[];
  updateRunText();
  if (!silent){
    ensureAudio();
    startAmbience();
  }
  later(()=>{
    if (state.started && !state.ended && !state.camera && !state.review && !state.paused){
      say('老妇：过来，让我看看你。',3800);
      prompt('W / A / S / D 走近她',5200);
    }
  },900);
  later(()=>{
    if (state.started && !state.ended && !state.camera && !state.review && !state.paused && state.talked){
      prompt('按住 F / 右键，举起 DV',5200);
    }
  },6200);
}
document.getElementById('startBtn').addEventListener('click',()=>{ ensureAudio(); startGame(false); });
document.getElementById('restartBtn').addEventListener('click',()=>{ ensureAudio(); startGame(false); });


// =========================================================
//  SHELF CHROME — credits / pause / title
// =========================================================
const creditsEl=document.getElementById('credits');
const pauseEl=document.getElementById('pause');
const pauseBtn=document.getElementById('pauseBtn');
const titleMuteBtn=document.getElementById('titleMuteBtn');
const pauseMuteBtn=document.getElementById('pauseMuteBtn');
let creditsFrom='title';

function updateMuteLabels(){
  const label=state.muted?'声音：关':'声音：开';
  muteBtn.textContent=state.muted?'声音 关':'声音 开';
  if (titleMuteBtn) titleMuteBtn.textContent=label;
  if (pauseMuteBtn) pauseMuteBtn.textContent=label;
}
function showCredits(from){
  creditsFrom=from||'title';
  if (creditsFrom==='pause') pauseEl.classList.add('hidden');
  creditsEl.classList.remove('hidden');
}
function hideCredits(){
  creditsEl.classList.add('hidden');
  if (creditsFrom==='pause' && state.paused) pauseEl.classList.remove('hidden');
}
function pauseGame(){
  if (state.transition){ state.pauseQueued=true; return; }
  updateRunText();
  hardCloseCamera();
  if (!state.started || state.ended || state.paused || state.transition) return;
  state.paused=true;
  keys.left=keys.right=keys.up=keys.down=false;
  state.moving=false;
  document.body.classList.add('paused');
  pauseEl.classList.remove('hidden');
  // Hold the ambience bed and music exactly where they are; cut one-shots.
  for (const L of AMBIENCE_LAYERS){
    const el=mediaEls[L.key];
    if (el){ try{ el.pause(); }catch(e){} }
  }
  const music=mediaEls['musicBed'];
  if (music){ try{ music.pause(); }catch(e){} }
  stopCues();
  updateVideoLayer();
  syncCameraOverlay();
  if (pauseBtn) pauseBtn.textContent='暂停中 · Esc';
}
function resumeGame(){
  if (!state.paused) return;
  state.paused=false;
  document.body.classList.remove('paused');
  pauseEl.classList.add('hidden');
  creditsEl.classList.add('hidden');
  if (pauseBtn) pauseBtn.textContent='暂停 · Esc';
  if (bedActive){
    for (const L of AMBIENCE_LAYERS){
      const el=mediaEls[L.key];
      if (el && el.paused){
        el.muted=state.muted;
        let p=null; try{ p=el.play(); }catch(e){}
        if (p && p.catch) p.catch(()=>{});
      }
    }
    const music=mediaEls['musicBed'];
    if (music && music.paused){
      music.muted=state.muted;
      let p=null; try{ p=music.play(); }catch(e){}
      if (p && p.catch) p.catch(()=>{});
    }
  }
  updateVideoLayer();
  syncCameraOverlay();
}
function returnToTitle(){
  stopAmbience(0.5);
  stopCues();
  reset();
  state.started=false; state.ended=false; state.paused=false;
  document.body.classList.remove('paused');
  endEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  creditsEl.classList.add('hidden');
  startEl.classList.remove('hidden');
  if (pauseBtn) pauseBtn.textContent='暂停 · Esc';
  updateMuteLabels();
}
if (pauseBtn) pauseBtn.addEventListener('click',()=>{ ensureAudio(); if (state.paused) resumeGame(); else pauseGame(); });
document.getElementById('resumeBtn').addEventListener('click',()=>{ resumeGame(); });
document.getElementById('pauseRestartBtn').addEventListener('click',()=>{ ensureAudio(); resumeGame(); startGame(false); });
document.getElementById('pauseCreditsBtn').addEventListener('click',()=>{ showCredits('pause'); });
document.getElementById('titleCreditsBtn').addEventListener('click',()=>{ showCredits('title'); });
document.getElementById('endCreditsBtn').addEventListener('click',()=>{ showCredits('end'); });
document.getElementById('creditsBack').addEventListener('click',()=>{ hideCredits(); });
document.getElementById('titleMuteBtn').addEventListener('click',()=>{ ensureAudio(); toggleMute(); });
document.getElementById('pauseMuteBtn').addEventListener('click',()=>{ ensureAudio(); toggleMute(); });
document.getElementById('endTitleBtn').addEventListener('click',()=>{ returnToTitle(); });
// Accessibility: soften CRT roll + glitch flashes.
function applyFlashSafe(){
  document.body.classList.toggle('no-flash',!!state.flashSafe);
  const btn=document.getElementById('pauseFlashBtn');
  if (btn) btn.textContent=state.flashSafe?'闪烁效果：柔和':'闪烁效果：标准';
}
function toggleFlashSafe(){
  state.flashSafe=!state.flashSafe;
  applyFlashSafe();
}
const pauseFlashBtn=document.getElementById('pauseFlashBtn');
if (pauseFlashBtn) pauseFlashBtn.addEventListener('click',()=>{ toggleFlashSafe(); });
// Reduced-motion users start in the soft profile.
try{
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    state.flashSafe=true;
  }
}catch(e){}
applyFlashSafe();
// Fullscreen is optional chrome: both buttons call the same tiny helper.
function toggleFullscreen(){
  try{
    if (!document.fullscreenElement){
      const p=document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(()=>{});
    } else {
      document.exitFullscreen();
    }
  }catch(e){}
}
for (const id of ['titleFullBtn','pauseFullBtn']){
  const b=document.getElementById(id);
  if (b) b.addEventListener('click',()=>{ ensureAudio(); toggleFullscreen(); });
}
updateMuteLabels();

const params=new URLSearchParams(location.search);
noGlitch = params.get('noglitch')==='1';
// Asset-capture helper: ?clean=1 hides every UI chrome so the iso room can be
// screenshotted as a clean still for the procedural DV placeholder footage.
// Gameplay is untouched.
if (params.get('clean')==='1') document.body.classList.add('clean');
// Screenshot/reduced-effects helper: hard cuts instead of CSS transitions.
if (params.get('nofx')==='1') document.body.classList.add('nofx');
if (params.get('noui')==='1') document.body.classList.add('noui');
// ?novideo=1 forces the pixel camera fallback, useful for regression shots.
videoDisabled = params.get('novideo')==='1';
if (params.get('vposter')==='1'){ forcePoster=true; videoFailed=false; }
initVideoLayer();
// Dev/screenshot helper: freeze the footage on a chosen second.
if (params.get('vfreeze')){
  const at=parseFloat(params.get('vfreeze'))||3.8;
  const seek=()=>{
    if (!dvVideo || dvVideo.readyState<2){ later(seek,180); return; }
    videoFrozen=true;
    try{ dvVideo.currentTime=at; }catch(e){}
    try{ dvVideo.pause(); }catch(e){}
  };
  later(seek,900);
}
if (params.get('audiodbg')==='1'){
  setTimeout(()=>{
    const rows=[];
    for (const [key,file] of Object.entries(AUDIO_FILES)){
      const a=new Audio(AUDIO_DIR+file);
      a.preload='auto';
      const row={key,file,readyState:-1,error:null,duration:null};
      rows.push(row);
      a.addEventListener('error',()=>{ row.error=a.error?a.error.code:'err'; });
      try{ a.load(); }catch(e){ row.error='load'; }
      setTimeout(()=>{
        row.readyState=a.readyState;
        row.duration=isFinite(a.duration)?Number(a.duration.toFixed(2)):null;
      },1700);
    }
    setTimeout(()=>{
      const el=document.createElement('pre');
      el.id='audioDebug';
      el.style.cssText='position:fixed;right:8px;bottom:8px;z-index:9999;background:#000;color:#0f0;font:10px monospace;padding:6px;max-width:46vw;white-space:pre-wrap;';
      const bad=rows.filter(r=>r.readyState<2||r.error);
      el.textContent=JSON.stringify({total:rows.length,bad:bad.length,badRows:bad,rows},null,1);
      document.body.appendChild(el);
      document.title=bad.length?'AUDIO FAIL':'AUDIO PASS';
    },2300);
  },500);
}
if (params.get('videodbg')==='1'){
  later(()=>{
    const el=document.createElement('pre');
    el.id='videoDebug';
    el.style.cssText='position:fixed;right:8px;bottom:8px;z-index:9999;background:#000;color:#0f0;font:10px monospace;padding:6px;max-width:46vw;white-space:pre-wrap;';
    const info={ready:videoReady,failed:videoFailed,active:stage.classList.contains('videoActive'),
      readyState:dvVideo?dvVideo.readyState:-1,networkState:dvVideo?dvVideo.networkState:-1,
      paused:dvVideo?dvVideo.paused:null,currentTime:dvVideo?Number(dvVideo.currentTime.toFixed(2)):null,
      currentSrc:dvVideo?dvVideo.currentSrc:'',videoWidth:dvVideo?dvVideo.videoWidth:0,events:videoEvents.slice()};
    info.drewFrame=videoDrewFrame;
    info.cameraOn=!!(window.__jiThird&&window.__jiThird.state.camera);
    info.retroStarted=retroStarted;
    try{
      const cc=document.getElementById('camera');
      const cx=cc.getContext('2d');
      info.cameraCanvas=[cc.width,cc.height];
      info.cameraPx={center:[...cx.getImageData(640,480,1,1).data],topLeft:[...cx.getImageData(10,10,1,1).data],rec:[...cx.getImageData(70,70,1,1).data],bottomLeft:[...cx.getImageData(60,900,1,1).data]};
      const cs=getComputedStyle(cc);
      info.cameraStyle={opacity:cs.opacity,zIndex:cs.zIndex,visibility:cs.visibility,display:cs.display,background:cs.backgroundColor,className:cc.className};
      info.stageClass=stage.className;
    }catch(e){ info.cameraPx='err:'+e.message; }
    el.textContent=JSON.stringify(info,null,2);
    document.body.appendChild(el);
  },2600);
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function waitGame(sec){
  const target=state.time+sec;
  let guard=0;
  while(state.time<target && guard++<500){
    if (params.get('test')==='1'){
      state.time=Math.min(target, state.time+0.1);
      tickJobs();
    }
    await sleep(20);
  }
}
async function runTest(){
  const out=[]; const check=(n,c,x='')=>out.push({name:n,pass:!!c,extra:x});
  startGame(true);
  await sleep(200);
  check('thirdPerson', state.started && !state.camera && roleName.textContent==='谢雨洁');
  state.wx=9.9; state.wy=3.6; state.talked=true;
  setCamera(true);
  await sleep(200);
  check('cameraOn', state.camera && state.revealed);
  check('subjectLabel', subjectEl.textContent.includes('谢雨洁'));
  await waitGame(1.4);
  check('filmerShown', filmerEl.classList.contains('show'));
  setCamera(false);
  await sleep(700);
  check('choice', state.choice);
  check('rebuildLabel', roleName.textContent.includes('重建'));
  await sleep(1900);
  check('uncanny', state.uncanny);
  // Regression: skipping the E dialogue used to leave talked=false forever,
  // which blocked raising the DV anywhere away from her (ch1 props, corridor).
  state.firstCameraDone=true; state.talked=false; state.camera=false;
  state.wx=6.3; state.wy=6.6;
  setCamera(true);
  check('cameraAfterIntro', state.camera, 'talked=false far from her');
  setCamera(false);
  state.talked=true;
  check('frontFacing', state.front);
  check('ritualActive', state.ritual.active && !state.ritual.done);
  state.wx=7.05; state.wy=6.3; commitRitual();
  check('scanGate', !state.ritual.done && state.ritual.loop===0);
  state.battery=100; state.camera=true; updateBattery(1);
  check('batteryDrain', state.battery<100);
  state.camera=false; state.battery=100;
  state.camera=true; state.scanStart=performance.now();
  state.scanTarget='incense'; completeCameraScan();
  state.scanTarget='bowl'; completeCameraScan();
  state.scanTarget='thread'; completeCameraScan();
  check('cameraScan', state.ritual.camSeen.incense && state.ritual.camSeen.bowl && state.ritual.camSeen.thread);
  state.camera=false; state.wx=7.05; state.wy=6.3; commitRitual();
  check('photoGate', !state.ritual.done && state.ritual.loop===0);
  state.camera=true;
  for (const tgt of ['incense','bowl','thread']){
    state.scanTarget=tgt; state.battery=100; takePhoto();
  }
  check('photoAll', photosAll());
  state.camera=false; state.scanStart=0; state.scanTarget=null;
  openCase();
  check('caseBoard', state.caseOpen && caseTapeEl.textContent.includes('甲'));
  closeCase();
  check('caseClose', !state.caseOpen);
  state.wx=7.05; state.wy=6.3; commitRitual();             // 甲 is the tape's lie
  check('wrongLoop', state.ritual.loop===1 && !state.ritual.done);
  state.inputLock=false;
  state.wx=9.65; state.wy=5.1; interact();                 // incense: 2 -> 3
  state.wx=6.55; state.wy=6.3; interact(); interact();    // bowl: mid -> right -> left
  state.wx=3.7;  state.wy=1.0; interact(); interact();     // thread: low -> mid -> high
  state.wx=7.05; state.wy=6.3; commitRitual();            // 乙
  check('ritualDone', state.ritual.done && currentTake()===RITUAL_TRUE);
  startChapter(2);
  check('chapter2', state.chapter===2 && state.hunt && state.hunt.mode==='find' && state.chapterTimes.length>=1);
  state.hunt.pos=0; state.wx=HIDE_SPOTS[0].x; state.wy=HIDE_SPOTS[0].y; interact();
  check('findOne', state.hunt.count===1);
  startChapter(3);
  check('chapter3', state.chapter===3 && state.hunt.mode==='anomaly');
  for (const tgt of ['incense','bowl','thread']){
    state.camera=true; state.battery=100; state.scanTarget=tgt; state.scanDone=true;
    takeAnomalyPhoto();
  }
  check('anomalyAll', state.anomalies.incense&&state.anomalies.bowl&&state.anomalies.thread&&state.hunt.count===3);
  check('ch3FrameGate', state.ch3FrameGate && !state.ch3FrameOk && state.chapter===3);
  state.camera=false;
  startReview();
  check('ch3LookReview', state.review && state.reviewKind==='look');
  state.lookFrame=5; state.ch3FrameOk=true;
  exitReview();
  await waitGame(1.2);
  check('ch3ToCh4', state.chapter===4 && !state.ch3FrameGate && state.hide && state.oldWomanGone);
  state.hide.facing=0; state.wx=HIDE_SPOTS[1].x; state.wy=HIDE_SPOTS[1].y; interact();
  state.hide.round=2; state.hide.facing=0; state.wx=HIDE_SPOTS[2].x; state.wy=HIDE_SPOTS[2].y; interact();
  startChapter(5);
  check('chapter5', state.chapter===5 && !state.finalPhoto && state.oldWomanGone);
  state.camera=true; state.battery=100; state.wx=8.5; state.wy=3.6; takeFinalPhoto();
  check('finalPhoto', state.finalPhoto && !state.oldWomanGone);
  startCorridor();
  check('corridor', state.scene==='corridor');
  state.corr.depth=1; answerPhone();
  await sleep(60);
  check('phoneAnswered', state.corr.answered && state.scene==='corridor' && !state.phoneDone);
  startDarkroom();
  check('darkroom', state.scene==='darkroom' && !!state.dark);
  state.dark.depth=0.24; darkLookOn(); darkLookOff();
  check('darkLine', state.dark.seen.line);
  state.dark.depth=0.56; darkLookOn(); darkLookOff();
  check('darkBench', state.dark.seen.bench);
  state.dark.depth=0.84; darkLookOn(); darkLookOff();
  check('darkWall', state.dark.seen.wall);
  check('darkAllSeen', darkAllSeen());
  state.dark.depth=0.56; darkInteract();
  check('splicerOpen', state.dark.open && !state.dark.split);
  // a splice that misses must not lock the player out
  state.dark.v=0.2; state.dark.target=0.74;
  spliceCommit();
  check('splicerReject', !state.dark.split && state.dark.tries>0 && state.dark.open);
  for (let i=0;i<24;i++) spliceAdjust(1);
  check('splicerNear', Math.abs(state.dark.v-state.dark.target)<=0.03,
    'v='+state.dark.v.toFixed(2)+' t='+state.dark.target.toFixed(2));
  spliceCommit();
  check('spliced', state.dark.split && !state.dark.open);
  darkPrint();
  check('darkPrint', state.dark.print);
  darkPrint();                       // idempotent: no double shutter
  check('darkPrintOnce', state.dark.print);
  state.dark.depth=0.56;
  darkInteract();
  check('exitNotYet', state.scene==='darkroom');
  state.dark.depth=0.06;
  darkInteract();
  check('exitDoor', state.scene==='room');
  finishDarkroom();
  check('phone', state.phoneDone && state.scene==='room');
  check('darkroomHudOff', !document.getElementById('chapterName').textContent.includes('暗房'));
  state.camera=false; state.wx=9.9; state.wy=3.6;
  raiseHand();
  await sleep(200);
  check('handRaised', state.handRaised);
  setCamera(true);
  await sleep(250);
  check('mismatch', state.mismatch);
  setCamera(false);
  await sleep(700);
  check('choiceAfterMismatch', state.choice);
  startReview();
  await sleep(200);
  check('review', state.review);
  state.reviewPos=0.4; updateReviewKind();
  check('gap', state.reviewKind==='gap');
  check('gapFound', state.reviewFoundGap);
  reviewPick(2); reviewPick(3); reviewPick(2);
  check('reviewQuiz', state.reviewQuiz.locked);
  setReconOffset(0);
  check('aligned', state.reconAligned);
  toggleReviewSplit();
  check('split', state.reviewSplit);
  exitReview();
  check('reviewExit', !state.review);
  // shelf chrome: pause, credits round-trip, resume
  pauseGame();
  await sleep(120);
  check('pauseOverlay', state.paused && !pauseEl.classList.contains('hidden'));
  showCredits('pause');
  await sleep(80);
  check('pauseCredits', !creditsEl.classList.contains('hidden') && pauseEl.classList.contains('hidden'));
  hideCredits();
  await sleep(80);
  check('creditsBack', creditsEl.classList.contains('hidden') && !pauseEl.classList.contains('hidden'));
  resumeGame();
  await sleep(120);
  check('resume', !state.paused && pauseEl.classList.contains('hidden'));
  toggleMute();
  check('muteLabels', state.muted && muteBtn.textContent==='声音 关' && pauseMuteBtn.textContent==='声音：关');
  toggleMute();
  toggleFlashSafe();
  check('flashSafe', state.flashSafe && document.body.classList.contains('no-flash') && pauseFlashBtn.textContent.includes('柔和'));
  toggleFlashSafe();
  interact();
  await sleep(800);
  check('helpEnding', state.ending==='help' && state.ended);
  check('runEnd', state.runEnd>0 && endRunEl.textContent.includes('用时'));
  // keyboard-only ending shelf: Enter restarts, C opens credits, Esc → title
  const key=(code)=>window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));
  key('KeyC');
  await sleep(80);
  check('endCreditsKey', !creditsEl.classList.contains('hidden'));
  key('Escape');
  await sleep(80);
  check('endCreditsEsc', creditsEl.classList.contains('hidden') && !endEl.classList.contains('hidden'));
  key('Enter');
  await sleep(160);
  check('endEnterRestart', state.started && !state.ended && endEl.classList.contains('hidden') && state.runStart>0);
  state.talked=true; choose('help');
  await sleep(700);
  check('endedAgain', state.ended && !endEl.classList.contains('hidden'));
  key('Escape');
  await sleep(160);
  check('endEscToTitle', !state.started && !startEl.classList.contains('hidden'));
  key('Enter');
  await sleep(140);
  check('titleEnterStart', state.started && !state.ended && startEl.classList.contains('hidden'));
  returnToTitle();
  await sleep(160);
  check('titleReturn', !state.started && !startEl.classList.contains('hidden') && endEl.classList.contains('hidden'));
  startGame(true);
  await sleep(120);
  check('freshRun', state.started && state.reviewCount===0 && state.lookFrame===0 && !state.ended);
  state.silent=false; state.scareUntil=0;
  startRitualScare();
  await sleep(60);
  check('scareTrigger', state.scareUntil>0 && fadeEl.classList.contains('on'));
  state.scareUntil=0; fadeEl.classList.remove('on'); state.silent=true;
  const el=document.createElement('pre');
  el.id='testResult';
  el.style.cssText='position:fixed;left:8px;top:8px;z-index:9999;background:#000;color:#0f0;font:11px monospace;padding:8px;max-height:90vh;overflow:auto;';
  el.textContent=JSON.stringify(out,null,2);
  document.body.appendChild(el);
  const okN=out.filter(x=>x.pass).length;
  document.title=(out.every(x=>x.pass)?'TEST PASS ':'TEST FAIL ')+okN+'/'+out.length;
}

// =========================================================
//  READABILITY AUDIT  (?lumtest=1)
// =========================================================
// The release checklist asks a human "is the darkroom readable on a dim
// screen?" That is a measurable question on the rendered frame, so measure it:
// paint each of the three development beats, crop the proximity bracket the
// game itself draws around the target, and require that after a 55% display
// gain (a cheap TN panel at low brightness) the target still carries a
// highlight and real edge structure instead of a flat black box.
const DIM_GAIN=0.55, DIM_LIFT=8;   // crude "dim laptop in a dark room" transfer
function lumOf(r,g,b){ return 0.2126*r+0.7152*g+0.0722*b; }
function dimLum(l){ return Math.max(0,(l-DIM_LIFT)*DIM_GAIN); }
// A region's readability is not its average brightness — most of a dark room is
// legitimately black. What matters is whether the thing carries highlights
// (can I find an edge?) and local contrast (can I tell it from the wall?).
function frameStats(box){
  const x0=Math.max(0,Math.round(box[0])), y0=Math.max(0,Math.round(box[1]));
  const x1=Math.min(PW,Math.round(box[0]+box[2])), y1=Math.min(PH,Math.round(box[1]+box[3]));
  const w=Math.max(1,x1-x0), h=Math.max(1,y1-y0);
  const d=pctx.getImageData(x0,y0,w,h).data;
  const raw=[], dim=[]; let edge=0, edgeN=0;
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const i=(y*w+x)*4;
      const l=lumOf(d[i],d[i+1],d[i+2]);
      raw.push(l); dim.push(dimLum(l));
      if (x+1<w){ edge+=Math.abs(dimLum(lumOf(d[i+4],d[i+5],d[i+6]))-dimLum(l)); edgeN++; }
      if (y+1<h){ const j=i+w*4; edge+=Math.abs(dimLum(lumOf(d[j],d[j+1],d[j+2]))-dimLum(l)); edgeN++; }
    }
  }
  raw.sort((a,b)=>a-b); dim.sort((a,b)=>a-b);
  const q=(arr,p)=>arr[Math.min(arr.length-1,Math.floor(arr.length*p))]||0;
  return {
    mean:+(dim.reduce((a,b)=>a+b,0)/dim.length).toFixed(1),
    rawP50:+q(raw,.5).toFixed(0), rawP90:+q(raw,.9).toFixed(0), rawP99:+q(raw,.99).toFixed(0),
    rawMax:+(raw[raw.length-1]||0).toFixed(0),
    dimP99:+q(dim,.99).toFixed(0),
    dimContrast:+(q(dim,.95)-q(dim,.5)).toFixed(1),
    edge:+(edge/Math.max(1,edgeN)).toFixed(2)
  };
}
function drawAndGrab(scene){
  state.time=(state.time||0)+0.4;
  if (scene==='darkroom') drawDarkroom(pctx,state.time);
  else drawCorridor(pctx,state.time);
}
function frameDiff(A,B){
  let s=0,n=0;
  for (let k=0;k<A.length;k+=4*37){ s+=Math.abs(A[k]-B[k])+Math.abs(A[k+1]-B[k+1]); n++; }
  return +(s/n).toFixed(2);
}
async function runLumTest(){
  const out=[]; const check=(n,c,x='')=>out.push({name:n,pass:!!c,extra:x});
  startGame(true); state.silent=true;
  await sleep(200);
  state.ended=false; state.transition=false; state.paused=false;

  // --- darkroom: the three development beats
  // "must be findable" = there is a highlight AND local contrast, even after a
  // 55% display gain. Mood (low mean) is allowed and expected.
  const beats=[
    {key:'line',  depth:0.24, box:[146,82,190,40]},
    {key:'bench', depth:0.56, box:[300,150,150,60]},
    {key:'wall',  depth:0.84, box:[168,84,74,66]}
  ];
  const darkFrames=[];
  state.scene='darkroom';
  state.dark={depth:0.24,lookOn:false,hint:null,seen:{line:false,bench:false,wall:false},
    open:false,split:false,print:false,v:0.5,target:0.5};
  const darkStats={};
  for (const b of beats){
    state.dark.depth=b.depth;
    state.dark.lookOn=false; state.dark.open=false;
    pctx.clearRect(0,0,PW,PH);
    drawAndGrab('darkroom');
    const st=frameStats(b.box);
    darkStats[b.key]=st;
    darkFrames.push(pctx.getImageData(0,0,PW,PH).data.slice());
    check('dark '+b.key+' has a highlight', st.rawP99>=95 && st.dimP99>=45, JSON.stringify(st));
    check('dark '+b.key+' reads against the wall', st.dimContrast>=6 && st.rawP90-st.rawP50>=10,
      'dimContrast '+st.dimContrast+' raw '+(st.rawP90-st.rawP50));
    check('dark '+b.key+' still looks like a darkroom', st.mean<=60, 'mean '+st.mean);
  }
  for (let i=0;i<beats.length;i++){
    for (let j=i+1;j<beats.length;j++){
      const d=frameDiff(darkFrames[i],darkFrames[j]);
      check('dark '+beats[i].key+' != '+beats[j].key, d>=4, 'diff '+d);
    }
  }
  // the splicer overlay: its whole job is a 1-2% misalignment, so the bench
  // close-up must keep contrast even when the display is dim
  state.dark.seen={line:true,bench:true,wall:true};
  state.dark.depth=0.56; state.dark.open=true; state.dark.v=0.5; state.dark.target=0.72;
  pctx.clearRect(0,0,PW,PH);
  drawAndGrab('darkroom');
  const sp=frameStats([52,44,376,184]);
  check('splicer text has contrast', sp.rawP99-sp.rawP50>=60 && sp.dimContrast>=10, JSON.stringify(sp));
  check('splicer panel has edges', sp.rawP90-sp.rawP50>=20, 'p90-p50 '+(sp.rawP90-sp.rawP50));

  // --- corridor: the hall is meant to be black until the viewfinder is up, so
  // the readable state is lookOn=true. Same rule: highlights + contrast, not mean.
  state.scene='corridor';
  state.chapter=5;
  state.corr={depth:0.24,answered:false,ringAt:0,portrait:false,threadSeen:false,
    lookOn:true,roomSeen:false,facesSeen:false,nameSeen:false};
  const corrFrames=[];
  for (const d of [0.24,0.56,0.9]){
    state.corr.depth=d;
    pctx.clearRect(0,0,PW,PH);
    drawAndGrab('corridor');
    corrFrames.push(pctx.getImageData(0,0,PW,PH).data.slice());
    const st=frameStats([0,24,480,222]);
    // a practical brighter than mid-grey, plus structure above 18% grey that
    // survives the dim transfer — the hall may be dark, it may not be blank
    check('corridor depth '+d+' has light to follow',
      st.rawMax>=110 && st.rawP90>=45 && st.dimContrast>=8, JSON.stringify(st));
    check('corridor depth '+d+' keeps shapes', st.dimContrast>=4, 'contrast '+st.dimContrast);
  }
  check('corridor responds to depth', frameDiff(corrFrames[0],corrFrames[2])>=1.5,
    'diff '+frameDiff(corrFrames[0],corrFrames[2]));
  // viewfinder on must not make the hall brighter than the bulb: it is an
  // overlay, not a light source
  state.corr.depth=0.56; state.corr.lookOn=false;
  pctx.clearRect(0,0,PW,PH); drawAndGrab('corridor');
  const lookOff=frameStats([0,0,PW,PH]);
  state.corr.lookOn=true;
  pctx.clearRect(0,0,PW,PH); drawAndGrab('corridor');
  const lookOn=frameStats([0,0,PW,PH]);
  check('viewfinder is an overlay, not a lamp', lookOn.rawP99<=lookOff.rawP99+6,
    'off '+lookOff.rawP99+' on '+lookOn.rawP99);

  // --- subtitles: bone text sits on its own 72% black band. Worst case is the
  // brightest gameplay frame, so measure against the lit room.
  state.scene='room';
  pctx.clearRect(0,0,PW,PH); drawThirdPerson(pctx,state.time);
  const under=frameStats([PW*0.2,PH*0.78,PW*0.6,PH*0.14]);
  const bandLum=under.rawP99*0.28;
  const boneLum=lumOf(0xe8,0xdf,0xc8);
  const ratio=(Math.max(boneLum,bandLum)+5)/(Math.min(boneLum,bandLum)+5);
  check('subtitle keeps contrast over the brightest scene', ratio>=4.5,
    'ratio '+ratio.toFixed(2)+' bg '+bandLum.toFixed(0));

  const el=document.createElement('pre');
  el.id='lumResult';
  el.style.cssText='position:fixed;left:8px;top:8px;z-index:9999;background:#000;color:#0f0;font:11px monospace;padding:8px;max-height:90vh;overflow:auto;';
  el.textContent=JSON.stringify({checks:out,darkStats:darkStats},null,2);
  document.body.appendChild(el);
  const bad=out.filter(x=>!x.pass);
  document.title=(bad.length?'LUM FAIL '+bad.length+'/'+out.length:'LUM PASS '+out.length+'/'+out.length);
}

// =========================================================
//  UI LAYOUT AUDIT  (?uitest=1)
// =========================================================
// Every HUD line is absolutely positioned inside #stage, which clips with
// overflow:hidden. A long Chinese sentence (the corridor objective, the tape
// quiz, an ending paragraph) can therefore be silently cut in half — invisible
// in a normal playtest, obvious once a player cannot read an instruction.
// This walks the real UI states, pushes the longest strings the game actually
// produces into each slot, and fails if anything is clipped, off-stage, or
// overlapping another line.
const LONGEST={
  prompt:['W 前进。看到侧门、遗像、门牌时按住 F 看清；看清门牌后，走到尽头按 E 接电话。',
    '松开 F 放下 DV　·　W 前进　·　E 查看',
    '按住 F 看她　/　E 躲　/　R 回看　/　Tab 记录',
    '拖动重建条对齐　/　Q / E 微调　/　P 分屏'],
  subtitle:['五张遗像，只有四张有脸。空的那张，别着白胶布。',
    '电话里：你终于接电话了。别让她抬手。',
    '你把重建对齐了。那 23 分钟是徐英子补的。'],
  obj:['W 前进。看到侧门、遗像、门牌时按住 F 看清；看清门牌后，走到尽头按 E 接电话。',
    '房间被改过。走到香炉/水碗/门框旁，按 F 看取景器，按 L 拍下不对的地方。',
    '那 23 分钟接回去了。按 L 拍下这一格，再往门那边走，按 E 推门。',
    '按住 F 在红灯下显影：洗印线、剪辑台、放大机。'],
  count:['看清 3 / 3　·　距离 100%','第 4 / 4 轮　·　12.0s','拍到 3 / 3　·　DV 电 100%'],
  end:['她抬起的是另一只手。你碰到的，是徐英子的记忆。三张照片里，站在你身后的人，是徐英子。']
};
function layoutFacts(el){
  if (!el) return null;
  const cs=getComputedStyle(el);
  const vis=cs.display!=='none' && cs.visibility!=='hidden' && parseFloat(cs.opacity)>0.01;
  const r=el.getBoundingClientRect();
  return {vis,rect:r,
    clipX:el.scrollWidth-el.clientWidth, clipY:el.scrollHeight-el.clientHeight,
    font:parseFloat(cs.fontSize)||0};
}
// Text is only "clipped" if it cannot be reached: an overflow:auto panel with
// a scrollbar is a fine answer in a 500 px-tall window, hidden overflow is not.
function reachable(el,f){
  if (!f) return false;
  if (f.clipX>1) return false;
  if (f.clipY<=1) return true;
  const oy=getComputedStyle(el).overflowY;
  return oy==='auto' || oy==='scroll';
}
function within(inner,outer,pad=1){
  return inner.left>=outer.left-pad && inner.right<=outer.right+pad
    && inner.top>=outer.top-pad && inner.bottom<=outer.bottom+pad;
}
function overlap(a,b){
  return !(a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top);
}
async function runUiTest(){
  const out=[]; const check=(n,c,x='')=>out.push({name:n,pass:!!c,extra:x});
  const stageR=()=>stage.getBoundingClientRect();
  // widest strings in the game must render without clipping, in every slot
  const slots=[['prompt',promptEl],['subtitle',subtitleEl]];
  startGame(true);
  state.silent=true;
  await sleep(220);

  for (const [name,el] of slots){
    for (const s of LONGEST[name]){
      el.textContent=s; el.classList.remove('hidden');
      const f=layoutFacts(el);
      check(name+' fit '+s.slice(0,6), reachable(el,f), 'clip '+f.clipX+'/'+f.clipY+' "'+s.slice(0,10)+'"');
      check(name+' inside '+s.slice(0,6), within(f.rect,stageR()), 'rect '+Math.round(f.rect.left)+'..'+Math.round(f.rect.right));
    }
    el.classList.add('hidden');
  }
  // the two lowest lines must not collide when both are long
  promptEl.textContent=LONGEST.prompt[1]; promptEl.classList.remove('hidden');
  subtitleEl.textContent=LONGEST.subtitle[0]; subtitleEl.classList.remove('hidden');
  const pr=promptEl.getBoundingClientRect(), sr=subtitleEl.getBoundingClientRect();
  check('subtitleClearOfPrompt', !overlap(sr,pr),
    'sub '+Math.round(sr.top)+'-'+Math.round(sr.bottom)+' prompt '+Math.round(pr.top)+'-'+Math.round(pr.bottom));
  promptEl.classList.add('hidden'); subtitleEl.classList.add('hidden');

  // persistent chrome: role plate, button row, control legend, camera meta
  const chrome=[document.getElementById('role'),document.getElementById('hudRight'),
    document.getElementById('controls'),camMeta];
  camMeta.classList.remove('hidden');
  camMeta.querySelector('#subject').textContent='拍摄对象：谢雨洁';
  camMeta.querySelector('#filmer').textContent='拍摄者：徐英子';
  camMeta.querySelector('#tape').textContent='带号：旧带 1999 · 素材';
  await sleep(30);
  for (const k of chrome){
    const cs=getComputedStyle(k);
    if (cs.display==='none'){
      // The corner legend is the only chrome allowed to stand down, and only in
      // windows short enough that it would collide with the subtitle band.
      check('chrome hidden by design '+k.id, k.id==='controls' && innerHeight<=600,
        'display:none at vh '+innerHeight);
      continue;
    }
    const f=layoutFacts(k);
    check('chrome inside '+k.id, within(f.rect,stageR()),
      Math.round(f.rect.left)+'..'+Math.round(f.rect.right)+' stage '+Math.round(stageR().left)+'..'+Math.round(stageR().right));
    check('chrome fit '+k.id, reachable(k,f), 'clip '+f.clipX+'/'+f.clipY);
  }
  check('hud no collision', !overlap(document.getElementById('role').getBoundingClientRect(),
    document.getElementById('hudRight').getBoundingClientRect()));
  camMeta.classList.add('hidden');

  // chapter panel: kicker / name / objective / count
  chapterEl.classList.remove('hidden');
  const chapKids=[document.getElementById('chapterKicker'),document.getElementById('chapterName'),
    document.getElementById('chapterObj'),document.getElementById('chapterCount')];
  for (let i=0;i<LONGEST.obj.length;i++){
    chapKids[2].textContent=LONGEST.obj[i];
    chapKids[3].textContent=LONGEST.count[i];
    for (const k of chapKids){
      const f=layoutFacts(k);
      check('chapter fit '+k.id, reachable(k,f), 'clip '+f.clipX+'/'+f.clipY);
      check('chapter inside '+k.id, within(f.rect,stageR()));
    }
  }
  check('chapterNoOverlap', !overlap(chapKids[2].getBoundingClientRect(),chapKids[3].getBoundingClientRect()));
  chapterEl.classList.add('hidden');

  // ritual strip (ch1 HUD) must stay clear of the subtitle band
  ritualEl.classList.remove('hidden'); updateRitualHUD();
  await sleep(40);
  ritualEl.classList.add('hidden');

  // case board: the notebook is the densest screen in the game
  state.ritual.active=true; state.ritual.done=false;
  openCase();
  await sleep(120);
  const caseR=caseEl.getBoundingClientRect();
  check('case inside stage', within(caseR,stageR()),
    'case '+[Math.round(caseR.left),Math.round(caseR.top),Math.round(caseR.right),Math.round(caseR.bottom)]
    +' stage '+[Math.round(stageR().left),Math.round(stageR().top),Math.round(stageR().right),Math.round(stageR().bottom)]);
  check('case no scroll', caseEl.scrollHeight<=caseEl.clientHeight+2,
    'scroll '+caseEl.scrollHeight+'/'+caseEl.clientHeight);
  closeCase();

  // timeline: marks, recon row, hint
  state.uncannyDone=true; state.choice=true; state.mismatch=true;
  startReview();
  await sleep(150);
  for (const sel of ['.tlTop','.tlTrack','.tlReconRow','.tlHint']){
    const k=timelineEl.querySelector(sel);
    const f=layoutFacts(k);
    check('timeline inside '+sel, f && within(f.rect,stageR()), f?('clip '+f.clipX+'/'+f.clipY):'missing');
    check('timeline fit '+sel, f && f.clipX<=1, f?('clip '+f.clipX):'missing');
  }
  exitReview();
  await sleep(80);

  // pause / credits / ending card
  pauseGame();
  await sleep(120);
  const pi=pauseEl.querySelector('.pauseInner');
  check('pause inside stage', within(pi.getBoundingClientRect(),stageR()));
  check('pause fit', reachable(pi,layoutFacts(pi)), 'clip '+layoutFacts(pi).clipY);
  const pbtns=[...pauseEl.querySelectorAll('.pauseBtns button')].filter(b=>b.offsetParent!==null);
  check('pause buttons present', pbtns.length>=5, 'count '+pbtns.length);
  let pOverlap=false, pSmall=[];
  for (let i=0;i<pbtns.length;i++){
    const a=pbtns[i].getBoundingClientRect();
    if (a.height<30 || a.width<80) pSmall.push(pbtns[i].id+' '+Math.round(a.width)+'x'+Math.round(a.height));
    for (let j=i+1;j<pbtns.length;j++){
      if (overlap(a,pbtns[j].getBoundingClientRect())) pOverlap=true;
    }
  }
  check('pause buttons no overlap', !pOverlap);
  check('pause buttons hit area', pSmall.length===0, pSmall.join(', '));
  showCredits('pause');
  await sleep(120);
  const ci=creditsEl.querySelector('.creditsInner')||creditsEl.firstElementChild;
  check('credits inside stage', ci && within(ci.getBoundingClientRect(),stageR()));
  hideCredits(); resumeGame();
  await sleep(80);

  endTitle.textContent='她替你摆好了。';
  endText.textContent=LONGEST.end[0];
  endEl.classList.remove('hidden');
  await sleep(80);
  const ei=endEl.querySelector('.endInner');
  check('end inside stage', within(ei.getBoundingClientRect(),stageR()),
    'inner '+Math.round(ei.getBoundingClientRect().top)+'-'+Math.round(ei.getBoundingClientRect().bottom)
    +' stage '+Math.round(stageR().top)+'-'+Math.round(stageR().bottom));
  check('end fit', reachable(ei,layoutFacts(ei)),
    'clip '+layoutFacts(ei).clipX+'/'+layoutFacts(ei).clipY);
  endEl.classList.add('hidden');

  // title screen at this window size
  returnToTitle();
  await sleep(150);
  const si=startEl.querySelector('.startInner');
  check('title inside stage', within(si.getBoundingClientRect(),stageR()),
    'inner '+Math.round(si.getBoundingClientRect().top)+'-'+Math.round(si.getBoundingClientRect().bottom)
    +' stage '+Math.round(stageR().top)+'-'+Math.round(stageR().bottom));
  check('title fit', layoutFacts(si).clipX<=1, 'clip '+layoutFacts(si).clipX);
  check('stage inside viewport', stageR().width<=innerWidth+1 && stageR().height<=innerHeight+1,
    Math.round(stageR().width)+'x'+Math.round(stageR().height)+' vp '+innerWidth+'x'+innerHeight);

  const el=document.createElement('pre');
  el.id='uiResult';
  el.style.cssText='position:fixed;left:8px;top:8px;z-index:9999;background:#000;color:#0f0;font:11px monospace;padding:8px;max-height:90vh;overflow:auto;';
  el.textContent=JSON.stringify({size:[innerWidth,innerHeight],checks:out},null,2);
  document.body.appendChild(el);
  const bad=out.filter(x=>!x.pass);
  document.title=(bad.length?'UI FAIL '+bad.length+' ':'UI PASS ')+innerWidth+'x'+innerHeight;
}
if (params.get('nointro')==='1'){
  startGame(true);
  if (params.get('camera')==='1') later(()=>{ state.wx=9.9; state.wy=3.6; state.talked=true; setCamera(true); },300);
  if (params.get('reveal')==='1') later(()=>{ state.wx=9.9; state.wy=3.6; state.talked=true; setCamera(true); later(()=>setCamera(false),1200); },400);
  if (params.get('end')==='film') later(()=>{ state.firstCameraDone=true; choose('film'); },700);
  if (params.get('end')==='help') later(()=>{ state.firstCameraDone=true; choose('help'); },700);
  if (params.get('act2')) later(()=>{
    state.chapter=5; state.finalPhoto=true; state.scene='corridor';
    state.corr={depth:1,answered:true,ringAt:0,portrait:true,threadSeen:true,
      lookOn:false,roomSeen:true,facesSeen:true,nameSeen:true};
    startDarkroom();
    later(()=>{
      const d=params.get('act2');
      if (d==='line'){ state.dark.depth=0.24; state.dark.seen.line=true; state.dark.lookOn=true; }
      if (d==='bench'){ state.dark.depth=0.56; state.dark.seen.bench=true; state.dark.lookOn=true; }
      if (d==='wall'){ state.dark.depth=0.84; state.dark.seen.wall=true; state.dark.lookOn=true; }
      if (d==='door'){ state.dark.depth=0.92; state.dark.seen={line:true,bench:true,wall:true}; state.dark.split=true; }
      if (d==='exit'){ state.dark.depth=0.05; state.dark.seen={line:true,bench:true,wall:true}; state.dark.split=true; state.dark.print=true; }
      if (d==='seen'){ state.dark.seen={line:true,bench:true,wall:true}; state.dark.depth=0.56; }
      if (d==='splice'){
        state.dark.seen={line:true,bench:true,wall:true}; state.dark.depth=0.56;
        state.dark.open=true; state.dark.v=0.5; state.dark.target=0.72;
      }
      if (d==='aligned'){
        state.dark.seen={line:true,bench:true,wall:true}; state.dark.depth=0.56;
        state.dark.open=true; state.dark.target=0.62; state.dark.v=0.62;
      }
      if (d==='split'){ state.dark.split=true; state.dark.seen={line:true,bench:true,wall:true}; state.dark.depth=0.6; }
      updateChapterHUD();
      // headless screenshots: rAF is frozen under --virtual-time-budget, so
      // paint the frame we just configured instead of waiting for one.
      pctx.clearRect(0,0,PW,PH); drawDarkroom(pctx,state.time);
    },900);
  },400);
  if (params.get('take2')==='1') later(()=>{ state.wx=9.9; state.wy=3.6; state.talked=true; state.choice=true; startSecondTake(); },400);
  if (params.get('hand')==='1') later(()=>{
    state.wx=9.9; state.wy=3.6; state.talked=true; state.uncannyDone=true; state.choice=true; state.front=true;
    state.ritual.active=true; state.ritual.incense=3; state.ritual.bowl=0; state.ritual.thread=2; state.ritual.done=true;
    updateRitualHUD();
    roleName.textContent='谢雨洁（重建）'; modeEl.textContent='徐英子的记忆';
    prompt(''); raiseHand();
  },1500);
  if (params.get('mismatch')==='1') later(()=>{
    state.wx=9.9; state.wy=3.6; state.talked=true; state.uncannyDone=true; state.choice=true; state.front=true; state.handRaised=true;
    prompt(''); startMismatch();
  },1500);
  if (params.get('uncanny')==='1') later(()=>{ state.wx=9.9; state.wy=3.6; state.talked=true; state.choice=true; triggerUncanny(); },1100);
  if (params.get('review')==='1') later(()=>{
    state.wx=9.9; state.wy=3.6; state.talked=true; state.uncannyDone=true; state.choice=true;
    state.front=true; state.handRaised=true; state.mismatch=true;
    prompt(''); startReview();
    if (params.get('pos')){ state.reviewPos=parseFloat(params.get('pos')); updateReviewKind(); }
    if (params.get('aligned')==='1'){ setReconOffset(0); }
    if (params.get('split')==='1'){ toggleReviewSplit(); }
  },900);
  if (params.get('ritual')==='1') later(()=>{
    state.wx=9.65; state.wy=5.1; state.dir='W'; state.talked=true; state.uncannyDone=true; state.choice=true; state.front=true;
    state.ritual.active=true;
    if (params.get('loop')) state.ritual.loop=Math.max(0,parseInt(params.get('loop'))||0);
    if (params.get('rtarget')==='1'){ state.ritual.incense=3; state.ritual.bowl=0; state.ritual.thread=2; }
    if (params.get('rdone')==='1'){ state.ritual.incense=3; state.ritual.bowl=0; state.ritual.thread=2; state.ritual.done=true; }
    updateRitualHUD();
    prompt(state.ritual.done?'Q 让她抬手':'E 调整供桌　/　R 看旧带',0);
  },1500);
  if (params.get('clue')==='1') later(()=>{
    state.wx=7.05; state.wy=6.35; state.talked=true; state.uncannyDone=true; state.choice=true; state.front=true;
    state.ritual.active=true; state.ritual.seen=false;
    if (params.get('loop')) state.ritual.loop=Math.max(0,parseInt(params.get('loop'))||0);
    updateRitualHUD();
    startReview();
  },1600);
  if (params.get('scare')==='1') later(()=>{
    state.wx=9.65; state.wy=5.1; state.dir='W'; state.front=false; state.ritual.active=true; state.silent=false; state.ending=false;
    startRitualScare();
  },1600);
  if (params.get('figure')==='1') later(()=>{
    state.wx=9.65; state.wy=5.1; state.dir='W'; state.front=false;
    state.scareUntil=performance.now()+100000;
  },1200);
  if (params.get('eyes')==='1') later(()=>{
    state.wx=9.65; state.wy=5.1; state.dir='W'; state.front=false;
    state.ritual.active=true; state.ritual.reviews=4;
  },1600);
  if (params.get('chapter')){
    later(()=>{
      state.talked=true; state.uncannyDone=true; state.choice=false;
      startChapter(parseInt(params.get('chapter'))||2);
      if (params.get('huntcam')==='1' && (state.hunt||state.hide)){
        state.wx=9.65; state.wy=5.1; state.dir='W';
        if (state.hunt) state.hunt.pos=Math.min(2,Math.max(0,parseInt(params.get('huntpos'))||0));
        setCamera(true);
      }
    },1200);
  }
  if (params.get('corridor')==='1') later(()=>{
    state.chapter=5; state.finalPhoto=true; state.phoneDone=false;
    state.uncannyDone=true; state.talked=true;
    startCorridor(); state.corr.depth=params.get('depth')?parseFloat(params.get('depth')):0.9;
    // ?look=1 raises the corridor viewfinder for screenshots of each beat.
    if (params.get('look')==='1') later(()=>corridorLookOn(),700);
  },1200);
  if (params.get('bad')==='1') later(()=>{
    state.wx=7.05; state.wy=6.3; state.ritual.active=true; chooseBad();
  },1200);
  if (params.get('scan')){
    later(()=>{
      const sm=params.get('scan');
      const pos=sm==='2'?[6.55,6.3]:sm==='3'?[3.7,1.0]:[9.65,5.1];
      state.wx=pos[0]; state.wy=pos[1]; state.dir=sm==='3'?'E':'W'; state.front=false;
      state.talked=true; state.revealed=true; state.uncannyDone=true; state.choice=false; state.handRaised=false;
      state.ritual.active=true;
      setCamera(true);
      state.scanTarget=sm==='2'?'bowl':sm==='3'?'thread':'incense';
      state.scanStart=performance.now()-1250; state.scanDone=false; state.scanRisked=true;
    },1300);
  }
  if (params.get('photo')==='1') later(()=>{
    state.wx=9.65; state.wy=5.1; state.dir='W'; state.front=false;
    state.talked=true; state.revealed=true; state.uncannyDone=true; state.choice=false; state.handRaised=false;
    state.ritual.active=true; state.ritual.camSeen={incense:true,bowl:true,thread:true};
    setCamera(true);
    state.scanTarget='incense'; state.scanStart=performance.now()-1200; state.scanDone=true;
    takePhoto();
    state.photoFlashUntil=0; state.photoRevealUntil=performance.now()+100000;
  },1300);
  if (params.get('case')==='1') later(()=>{
    state.wx=9.65; state.wy=5.1; state.dir='W'; state.front=false;
    state.ritual.active=true;
    state.ritual.inspected={incense:true,bowl:true,thread:false};
    state.ritual.camSeen={incense:true,bowl:true,thread:true}; state.scanDone=true;
    state.photos.incense=true; state.photos.bowl=true;
    updateRitualHUD(); openCase();
  },1500);
  if (params.get('near')==='1') later(()=>{
    state.wx=9.95; state.wy=2.55; state.talked=true; state.dir='W'; state.front=false;
    prompt('E 互动　/　按住 F / 右键 举起 DV');
    later(()=>{
      if (!state.ended){ say('老妇：手给我看看。',4200); prompt('E 互动　/　按住 F / 右键 举起 DV'); }
    },900);
  },500);
  const pose=params.get('pose');
  if (pose) later(()=>{ state.dir=pose.toUpperCase(); state.front=false; },600);
  if (params.get('lumtest')==='1'){
    later(runLumTest,400);
    const lumDriver=setInterval(()=>{
      if (/^LUM (PASS|FAIL)/.test(document.title)){ clearInterval(lumDriver); return; }
      if (!state.started || state.paused) return;
      state.time+=0.05;
      tickJobs();
    },20);
  }
  if (params.get('uitest')==='1'){
    later(runUiTest,400);
    const uiDriver=setInterval(()=>{
      if (/^UI (PASS|FAIL)/.test(document.title)){ clearInterval(uiDriver); return; }
      if (!state.started || state.paused) return;
      state.time+=0.05;
      tickJobs();
    },20);
  }
  if (params.get('test')==='1'){
    later(runTest,400);
    const testDriver=setInterval(()=>{
      if (document.title==='TEST PASS' || document.title==='TEST FAIL'){ clearInterval(testDriver); return; }
      if (!state.started || state.paused) return;
      state.time+=0.05;
      tickJobs();
    },20);
  }
  // Shelf-chrome screenshots: freeze a real gameplay frame under the overlay.
  if (params.get('shelf')==='pause') later(()=>{
    startGame(true);
    state.wx=9.4; state.wy=3.4; state.talked=true; state.dir='E'; state.front=false;
    prompt(''); pauseGame();
  },900);
  // Headless dumps/screenshots have no real frame loop, so every `later()`
  // above would still be pending when the page is captured. ?advance=<sec>
  // fast-forwards the game clock (jobs only, no walking) so a dev jump param
  // actually lands on screen.
  if (params.get('advance')){
    const secs=Math.max(0,Math.min(180,parseFloat(params.get('advance'))||0));
    for (let t=0;t<secs;t+=0.1){ state.time+=0.1; tickJobs(); }
  }
  if (params.get('shelf')==='credits') later(()=>{ showCredits('title'); },500);
  if (params.get('shelf')==='pausecredits') later(()=>{
    startGame(true);
    state.wx=9.4; state.wy=3.4; state.talked=true; state.dir='E'; state.front=false;
    prompt(''); pauseGame(); showCredits('pause');
  },900);
}
window.__jiThird={
  audio:{ playCue, startAmbience, stopAmbience },
  video:{ element:dvVideo, sources:VIDEO_SOURCES, isReady:()=>videoReady, isActive:()=>stage.classList.contains('videoActive') },
  state, setCamera, interact, choose, startGame, runTest,
  drawXie, drawThirdPerson, drawIsoTable, drawIsoOldWoman,
  // raw render surfaces for offline capture tools (dev/trailer)
  render:{ pctx, PW, PH, cctx, CW, CH, pixelCanvas:document.getElementById('pixel'),
    cameraCanvas:document.getElementById('camera'),
    drawThirdPerson, drawDarkroom, drawCorridor, drawReview, drawSplicer,
    drawCameraOverlay, renderCameraPixel },
  // --- dev / simulated-player surface ---
  setFuzz(on){ FUZZ_ACTIVE=!!on; },
  keys, tickJobs, updateBattery, updateHide, updateCorridor, updateReviewKind, advanceMovement,
  commitRitual, takePhoto, completeCameraScan, takeAnomalyPhoto, takeFinalPhoto,
  startChapter, startReview, exitReview, reviewPick, stepLookFrame, setReconOffset,
  toggleReviewSplit, raiseHand, answerPhone, startCorridor, corridorInteract,
  startDarkroom, updateDarkroom, darkLookOn, darkLookOff, darkInteract,
  spliceAdjust, spliceCommit, closeSplicer, finishDarkroom, darkPrint,
  pauseGame, resumeGame, toggleMute, toggleFlashSafe, returnToTitle,
  openCase, closeCase, currentTake, photosAll, blocked, nearWoman, nearDoor,
  RITUAL_TAKES, RITUAL_TRUE, HIDE_SPOTS, OLD, REVIEW_QUIZ,
  // what a sighted player can actually read on screen (null when not fuzzing)
  ui:{ get:()=>FUZZ_UI, caseText:()=>caseEl?caseEl.textContent:'' },
  updateScanProgress, setScanClock(fn){ scanClock=fn||null; },
  probe(){ return {scanStart:state.scanStart,scanT:state.scanT,scanNow:scanNow(),
    takes:state.takes,silent:state.silent,cam:state.camera,bat:state.battery,
    ended:state.ended,ending:state.ending,scene:state.scene,ch:state.chapter,
    started:state.started,paused:state.paused,trans:state.transition,
    rev:!!state.review,revKind:state.reviewKind||'',revPos:+(state.reviewPos||0).toFixed(2),
    caseOpen:state.caseOpen,lock:state.inputLock,stime:+state.time.toFixed(1),
    frameGate:!!state.ch3FrameGate,frameOk:!!state.ch3FrameOk}; },
};
// Dev-only simulated-player harness. Not part of normal play: the script is
// only fetched when ?sim= is present, and dev/ is excluded from releases.
const simParam=params.get('sim');
if (simParam){
  const s=document.createElement('script');
  s.src='dev/sim/player_sim.js';
  s.onerror=()=>{ document.title='SIM FAIL: harness missing'; };
  document.body.appendChild(s);
}
// Online playtest recorder (?rec=1): keys, on-screen text, state diffs and an
// optional local screen recording. Shipped only with the beta deploy, never in
// the release zip.
if (params.get('rec')){
  const rs=document.createElement('script');
  rs.src='playtest/recorder.js';
  // the release zip does not ship playtest/: fail quietly there
  rs.onerror=()=>{ if (window.console) console.warn('playtest recorder not bundled (release build)'); };
  document.body.appendChild(rs);
}
// Offline store-trailer capture (?trailer=1): dev-only, scripted shots rendered
// into a separate 1280x720 canvas and posted back to dev/trailer/run.mjs.
if (params.get('trailer')){
  const ts=document.createElement('script');
  ts.src='dev/trailer/trailer.js';
  ts.onerror=()=>{ document.title='TRAILER FAIL: script missing'; };
  document.body.appendChild(ts);
}
const naiveParam=params.get('naive');
if (naiveParam){
  const s=document.createElement('script');
  s.src='dev/sim/naive_sim.js';
  s.onerror=()=>{ document.title='NAIVE FAIL: harness missing'; };
  document.body.appendChild(s);
}
})();
