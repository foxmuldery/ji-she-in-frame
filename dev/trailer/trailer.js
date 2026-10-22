// =========================================================
//  STORE TRAILER CAPTURE  (?trailer=1)  — dev-only
// =========================================================
// Renders a fixed 26-second teaser into a dedicated 1280x720 canvas and hands
// the recorded webm back to dev/trailer/run.mjs, which muxes the music bed with
// ffmpeg. Nothing here is part of a release build: dev/ is excluded from the
// zip, and the loader only fires on ?trailer=1.
//
// Every frame is a pure function of the shot clock: no player input, no
// randomness that changes framing, so two runs produce the same cut.
(function(){
  const J=window.__jiThird, R=J&&J.render;
  if (!R){ document.title='TRAILER FAIL: bridge missing'; return; }
  const S=J.state, W=1280, H=720;

  // --- composition surface ------------------------------------------------
  const OUT=document.createElement('canvas');
  OUT.width=W; OUT.height=H;
  OUT.id='trailerSurface';
  const o=OUT.getContext('2d');
  o.imageSmoothingEnabled=false;

  const stage=document.getElementById('stage');
  if (stage){ stage.appendChild(OUT); OUT.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;'; }

  // stop the game's own loop: the trailer draws every frame by hand
  window.__stopLoop=true;
  S.started=true; S.paused=false; S.silent=true; S.ended=false; S.transition=false;
  S.camera=true; S.review=false; S.scene='room'; S.chapter=1; S.wx=3.0; S.wy=6.2;
  // The game pauses the footage whenever the camera is down. The trailer paints
  // its own frames, so keep the decoder running for the whole 26 s instead of
  // racing a play() at every cut.
  setTimeout(()=>{ try{ J.video.element.play().catch(()=>{}); }catch(e){} },0);

  const FONT_SERIF='"Songti SC","STSong","SimSun",serif';
  const FONT_SANS='"PingFang SC","Hiragino Sans GB",sans-serif';
  const FONT_MONO='"Courier New",monospace';
  const INK='#e8dfc8', DIM='#8d8574', RED='#c04a38';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ease=t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  const lerp=(a,b,t)=>a+(b-a)*t;
  const seg=(t,a,b)=>clamp((t-a)/(b-a),0,1);

  // --- shots --------------------------------------------------------------
  const SHOTS=[
    {id:'titleA', t0:0,    t1:3.0,  cap:''},
    {id:'room',   t0:3.0,  t1:7.0,  cap:'你回到那间屋子，替她举起 DV。'},
    {id:'dv',     t0:7.0,  t1:10.4, cap:'镜头里的她，抬起了另一只手。'},
    {id:'tape',   t0:10.4, t1:14.4, cap:'回看带子：二十三分钟，不见了。'},
    {id:'hall',   t0:14.4, t1:18.4, cap:'走廊尽头，电话在响。'},
    {id:'dark',   t0:18.4, t1:22.4, cap:'那二十三分钟，是有人剪掉的。'},
    {id:'titleB', t0:22.4, t1:26.0, cap:''}
  ];
  const TOTAL=26.0;

  function shotAt(t){
    for (const s of SHOTS) if (t>=s.t0 && t<s.t1) return s;
    return SHOTS[SHOTS.length-1];
  }

  // --- scene setup per shot ----------------------------------------------
  function setup(shot,t){
    const u=(t-shot.t0)/(shot.t1-shot.t0);
    if (shot.id==='room'){
      S.scene='room'; S.chapter=1; S.camera=true; S.review=false;
      S.talked=true; S.ended=false; S.transition=false;
      S.ritual.active=false;
      S.wx=lerp(3.2,9.15,ease(u)); S.wy=lerp(6.1,4.55,ease(u));
      S.dir='E'; S.walk=0.0;
    } else if (shot.id==='dv'){
      S.scene='room'; S.camera=true; S.review=false;
      S.wx=9.6; S.wy=3.8; S.dir='E';
    } else if (shot.id==='tape'){
      S.scene='room'; S.camera=true; S.review=true;
      S.reviewKind='gap'; S.reviewSplit=true; S.reviewPos=0.62;
      S.reviewFoundGap=true;
    } else if (shot.id==='hall'){
      S.scene='corridor'; S.chapter=5; S.review=false; S.camera=false;
      S.corr={depth:lerp(0.12,0.72,ease(u)),answered:false,ringAt:0,portrait:false,
        threadSeen:false,lookOn:true,roomSeen:false,facesSeen:false,nameSeen:false};
    } else if (shot.id==='dark'){
      S.scene='darkroom'; S.chapter=5; S.camera=false; S.review=false;
      S.dark={depth:lerp(0.18,0.36,ease(u)),lookOn:false,hint:null,
        seen:{line:true,bench:true,wall:false},open:false,split:false,print:false,
        v:0.5,target:0.72};
    }
  }

  // --- frame painting -----------------------------------------------------
  function clearBG(){ o.setTransform(1,0,0,1,0,0); o.globalAlpha=1; o.globalCompositeOperation='source-over';
    o.fillStyle='#000'; o.fillRect(0,0,W,H); }

  function paintGame(shot,t){
    const u=(t-shot.t0)/(shot.t1-shot.t0);
    // slow push-in: an isometric room is static, the camera is not
    const zoom=1.02+u*0.05;
    // pixel scene
    R.pctx.clearRect(0,0,R.PW,R.PH);
    if (shot.id==='tape'){
      R.drawReview(R.cctx, t);
      clearBG();
      drawCameraCanvas(1.0, 1);
      tapeGraphic(t);
      return;
    }
    if (shot.id==='dv'){
      clearBG();
      if (!paintFootage(t, zoom)) { R.renderCameraPixel(R.cctx, t); drawCameraCanvas(1.0, zoom); }
      return;
    }
    if (shot.id==='hall'){
      R.drawCorridor(R.pctx,t);
    } else if (shot.id==='dark'){
      R.drawDarkroom(R.pctx,t);
    } else {
      R.drawThirdPerson(R.pctx,t);
    }
    drawPixel(zoom);
  }
  function drawPixel(zoom){
    const z=zoom||1;
    o.imageSmoothingEnabled=false;
    o.drawImage(R.pixelCanvas,-(W*(z-1))/2,-(H*(z-1))/2,W*z,H*z);
  }
  function drawCameraCanvas(alpha,zoom){
    // the DV canvas is 4:3, height-bound and centred, exactly like #camera
    const z=zoom||1;
    const cw=Math.round(H*4/3*z), ch=H*z;
    const cx=Math.round((W-cw)/2), cy=Math.round((H-ch)/2);
    o.save();
    o.globalAlpha=alpha;
    o.imageSmoothingEnabled=false;
    o.drawImage(R.cameraCanvas,cx,cy,cw,ch);
    o.restore();
  }
  // Real DV footage when the decoder is up; procedural fallback otherwise.
  function paintFootage(t,zoom){
    const v=J.video && J.video.element;
    if (!v || !J.video.isReady() || v.readyState<2) return false;
    try{ if (v.paused) v.play().catch(()=>{}); }catch(e){}
    const z=zoom||1;
    const dw=Math.round(H*4/3*z), dh=H*z;
    const dx=Math.round((W-dw)/2), dy=Math.round((H-dh)/2);
    o.save();
    o.imageSmoothingEnabled=false;
    o.drawImage(v,dx,dy,dw,dh);
    o.restore();
    // OSD: draw the game's own overlay into the camera canvas, then composite
    R.cctx.clearRect(0,0,R.CW,R.CH);
    S.review=false;
    R.drawCameraOverlay(R.cctx, t, '00:41:12', 'REC', true, true);
    o.save();
    o.imageSmoothingEnabled=false;
    o.drawImage(R.cameraCanvas,dx,dy,dw,dh);
    o.restore();
    return true;
  }
  // the tape's missing 23 minutes, as one readable graphic
  function tapeGraphic(t){
    const y=H-150, x0=120, x1=W-120, mid=(x0+x1)/2, gw=(x1-x0)*0.16;
    o.save();
    o.fillStyle='rgba(4,5,4,.55)'; o.fillRect(0,y-46,W,196);
    o.strokeStyle='rgba(232,223,200,.22)'; o.lineWidth=1;
    o.beginPath(); o.moveTo(x0,y); o.lineTo(x1,y); o.stroke();
    for (let i=0;i<=20;i++){
      const x=x0+(x1-x0)*i/20;
      o.beginPath(); o.moveTo(x,y-5); o.lineTo(x,y+5); o.stroke();
    }
    o.fillStyle='#c04a38'; o.fillRect(mid-gw/2,y-9,gw,19);
    o.fillStyle='#f0e2d6'; o.font='15px '+FONT_SANS;
    o.textAlign='center'; o.textBaseline='middle';
    o.fillText('23:06 空白',mid,y+24);
    o.textAlign='left'; o.fillStyle='rgba(232,223,200,.72)'; o.font='13px '+FONT_MONO;
    o.fillText('00:18:07',x0,y-16);
    o.textAlign='right'; o.fillText('00:41:11',x1,y-16);
    o.textAlign='center'; o.fillStyle=INK; o.font='24px '+FONT_SANS;
    o.fillText('回看带子：二十三分钟，不见了。',W/2,y+64);
    o.restore();
  }

  function grain(t){
    o.save();
    for (let i=0;i<220;i++){
      const x=(i*97+((t*611)%W))%W, y=(i*53+((t*397)%H))%H;
      o.fillStyle='rgba(232,223,200,'+(0.02+((i*13)%7)*0.004)+')';
      o.fillRect(x,y,1,1);
    }
    o.restore();
  }
  function vignette(){
    const g=o.createRadialGradient(W/2,H*0.46,H*0.30,W/2,H*0.5,W*0.62);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,'rgba(0,0,0,0.62)');
    o.fillStyle=g; o.fillRect(0,0,W,H);
  }

  function caption(text,alpha){
    if (!text || alpha<=0.01) return;
    o.save();
    o.globalAlpha=alpha;
    o.font='24px '+FONT_SANS;
    const m=o.measureText(text);
    const padX=26, bw=m.width+padX*2, bh=52;
    const x=(W-bw)/2, y=H-118;
    const g=o.createLinearGradient(x,0,x+bw,0);
    g.addColorStop(0,'rgba(4,5,4,0)');
    g.addColorStop(0.14,'rgba(4,5,4,0.72)');
    g.addColorStop(0.86,'rgba(4,5,4,0.72)');
    g.addColorStop(1,'rgba(4,5,4,0)');
    o.fillStyle=g; o.fillRect(x,y-6,bw,bh);
    o.fillStyle=INK;
    o.textAlign='center'; o.textBaseline='middle';
    o.fillText(text,W/2,y+bh/2-6);
    o.restore();
  }

  function titleCard(main,sub,foot,alpha){
    o.save();
    o.globalAlpha=alpha;
    o.fillStyle='#040504'; o.fillRect(0,0,W,H);
    // faint red seam, like the safelight behind the paper
    const g=o.createRadialGradient(W/2,H/2,10,W/2,H/2,W*0.55);
    g.addColorStop(0,'rgba(120,26,20,0.16)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    o.fillStyle=g; o.fillRect(0,0,W,H);
    o.textAlign='center'; o.textBaseline='middle';
    o.fillStyle='#f2e9d4';
    o.font='190px '+FONT_SERIF;
    o.fillText(main,W/2,H/2-58);
    if (sub){
      o.fillStyle='rgba(232,223,200,0.92)';
      o.font='34px '+FONT_SERIF;
      o.fillText(sub,W/2,H/2+92);
    }
    if (foot){
      o.fillStyle=DIM;
      o.font='15px '+FONT_MONO;
      o.fillText(foot,W/2,H/2+164);
    }
    o.restore();
  }

  function cutDip(t,shot){
    // 6 black frames around each cut, so the montage breathes
    const a=Math.min(seg(t,shot.t0,shot.t0+0.18), 1-seg(t,shot.t1-0.18,shot.t1));
    if (a<1){ o.save(); o.globalAlpha=1-a; o.fillStyle='#000'; o.fillRect(0,0,W,H); o.restore(); }
  }

  function drawFrame(t){
    const shot=shotAt(t);
    const u=(t-shot.t0)/(shot.t1-shot.t0);
    clearBG();
    if (shot.id==='titleA'){
      const a=Math.min(seg(t,0.15,0.9), 1-seg(t,shot.t1-0.35,shot.t1));
      titleCard('祭','她在画面里','JI SHE IN FRAME · A SHORT HORROR FILM',a);
      o.save(); o.globalAlpha=a*0.9; o.textAlign='center';
      o.fillStyle='rgba(232,223,200,0.55)'; o.font='13px '+FONT_MONO;
      o.fillText('录 像 · 遗 像 · 另 一 只 手',W/2,H-96);
      o.restore();
      return;
    }
    if (shot.id==='titleB'){
      const a=Math.min(seg(t,shot.t0+0.1,shot.t0+0.8), 1-seg(t,shot.t1-0.4,shot.t1));
      titleCard('祭','她在画面里','三结局 · 约 9 分钟 · 现在可玩',a);
      return;
    }
    setup(shot,t);
    paintGame(shot,t);
    grain(t);
    vignette();
    const capIn=Math.min(seg(t,shot.t0+0.35,shot.t0+0.95), 1-seg(t,shot.t1-0.55,shot.t1));
    if (shot.id!=='tape') caption(shot.cap,capIn);
    cutDip(t,shot);
    // tiny timecode, top-left, like the tape's own stamp
    o.save();
    o.globalAlpha=0.55; o.textAlign='left'; o.textBaseline='top';
    o.fillStyle='rgba(232,223,200,0.75)'; o.font='12px '+FONT_MONO;
    o.fillText('PLAY ▶  00:'+String(Math.floor(t)).padStart(2,'0')+':'+String(Math.floor((t%1)*30)).padStart(2,'0'),30,26);
    o.restore();
  }

  // --- record -------------------------------------------------------------
  const upload=new URLSearchParams(location.search).get('upload')||'';
  const FPS=30;
  const stream=OUT.captureStream(FPS);
  let mime='video/webm;codecs=vp9';
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mime)) mime='video/webm;codecs=vp8';
  if (!window.MediaRecorder){ document.title='TRAILER FAIL: no MediaRecorder'; return; }
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});
  const chunks=[];
  rec.ondataavailable=e=>{ if (e.data && e.data.size) chunks.push(e.data); };

  const started=performance.now();
  let stopped=false;
  function tick(){
    if (stopped) return;
    const t=(performance.now()-started)/1000;
    drawFrame(Math.min(TOTAL,t));
    if (t>=TOTAL){ stopped=true; rec.stop(); return; }
    requestAnimationFrame(tick);
  }
  rec.onstop=async ()=>{
    const blob=new Blob(chunks,{type:mime});
    document.title='TRAILER RECORDED '+Math.round(blob.size/1024)+'KB';
    if (!upload) return;
    try{
      const res=await fetch(upload,{method:'POST',mode:'no-cors',body:blob});
      document.title='TRAILER DONE '+Math.round(blob.size/1024)+'KB';
    }catch(e){
      document.title='TRAILER FAIL: upload '+e.message;
    }
  };
  if (new URLSearchParams(location.search).has('probe')){
    const v=J.video&&J.video.element;
    S.started=true; S.paused=false; S.camera=true; S.review=false; S.takes=0; S.ended=false;
    v.play().catch(()=>{});
    setTimeout(()=>{
      const st=[];
      st.push('cam='+S.camera,'paused='+v.paused,'ct='+v.currentTime.toFixed(2),
        'live='+(J.video.isActive()?'1':'0'),'ready='+J.video.isReady());
      // try the real composition path once
      try{
        const ok=paintFootage(8.5,1.05);
        st.push('paint='+ok);
      }catch(e){ st.push('paintErr='+e.message); }
      document.title='PROBE '+st.join(' ');
    },2200);
    return;
  }
  // draw a poster frame first so a screenshot run is useful even without upload
  drawFrame(0.9);
  rec.start(500);
  requestAnimationFrame(tick);
})();
