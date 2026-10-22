#!/usr/bin/env node
// End-to-end check of the encrypted playtest build.
//
//   node dev/beta_gate/gate_check.mjs [site-dir]
//
// Serves .beta-site over http, drives a real headless Chrome through the gate
// with real key input, and proves:
//   1. the plaintext game is not reachable at /game.js
//   2. the ciphertext does not contain plaintext markers
//   3. /index.html?rec=1 bounces to the unlock page when locked
//   4. a wrong password is rejected and does not boot the game
//   5. the right password boots the game with the recorder attached
//   6. the beta landing page and report tool decrypt in the same session
//   7. clearing the session re-locks the build
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../..');
const LIVE=process.argv.includes('--live');
const SITE=resolve(process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:join(ROOT,'.beta-site'));
const LIVE_ORIGIN=process.env.LIVE_URL||'https://foxmuldery.github.io/ji-she-in-frame';
const CHROME=process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PASS=process.env.BETA_PASS||(existsSync(join(ROOT,'dev/.beta_pass'))
  ? readFileSync(join(ROOT,'dev/.beta_pass'),'utf8').trim() : '');
if (!PASS){ console.error('FAIL: no password (BETA_PASS or dev/.beta_pass)'); process.exit(1); }

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml',
  '.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};

const results=[];
function check(name,ok,extra=''){
  results.push({name,ok,extra});
  console.log((ok?'  PASS ':'  FAIL ')+name+(extra?'  ('+extra+')':''));
}

// ---- static server (with range support for the DV clip) ------------------
const server=LIVE?null:createServer(async (req,res)=>{
  try{
    const url=new URL(req.url,'http://x');
    let p=decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p+='index.html';
    const file=join(SITE,p);
    if (!file.startsWith(SITE)){ res.writeHead(403); res.end(); return; }
    const buf=await readFile(file);
    const type=MIME[extname(file).toLowerCase()]||'application/octet-stream';
    const range=req.headers.range;
    if (range){
      const m=/bytes=(\d*)-(\d*)/.exec(range);
      const start=m&&m[1]?parseInt(m[1],10):0;
      const end=m&&m[2]?parseInt(m[2],10):buf.length-1;
      res.writeHead(206,{'content-type':type,'accept-ranges':'bytes',
        'content-range':`bytes ${start}-${end}/${buf.length}`,
        'content-length':end-start+1});
      res.end(buf.subarray(start,end+1));
      return;
    }
    res.writeHead(200,{'content-type':type,'content-length':buf.length,'accept-ranges':'bytes'});
    res.end(buf);
  }catch(e){
    res.writeHead(404,{'content-type':'text/plain'}); res.end('not found');
  }
});
let ORIGIN;
if (LIVE){
  ORIGIN=LIVE_ORIGIN.replace(/\/$/,'');
  console.log('· checking live deployment '+ORIGIN);
} else {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  ORIGIN='http://127.0.0.1:'+server.address().port;
  console.log('· serving '+SITE+' on '+ORIGIN);
}

// ---- 1. plaintext must be gone, ciphertext must be opaque ----------------
const get=async(p)=>{ const r=await fetch(ORIGIN+p); return {status:r.status,text:r.status===200?await r.text():''}; };
const plain=await get('/game.js');
check('plaintext /game.js is not served', plain.status===404, 'status '+plain.status);
const enc=await get('/playtest/game.enc');
check('ciphertext game.enc is served', enc.status===200);
check('ciphertext has no readable game text',
  !enc.text.includes('RITUAL_TAKES') && !enc.text.includes('她抬起的是另一只手'));
const gate=JSON.parse((await get('/playtest/gate.json')).text);
check('gate.json carries salt + verifier only',
  !!gate.salt && !!gate.check && gate.iter>=200000 && !JSON.stringify(gate).includes(PASS));

// ---- 2. launch Chrome ---------------------------------------------------
const profile=await mkdtemp(join(tmpdir(),'ji-gate-'));
const dbgPort=await freePort();
const chrome=spawn(CHROME,[
  '--headless=new','--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader',
  '--ignore-gpu-blocklist','--mute-audio','--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port='+dbgPort,'--remote-allow-origins=*',
  '--user-data-dir='+profile,'--window-size=1280,720','about:blank'
],{stdio:['ignore','ignore','pipe']});
let chromeErr='';
chrome.stderr.on('data',d=>{ chromeErr+=d.toString(); });

async function freePort(){
  const s=createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const p=s.address().port; await new Promise(r=>s.close(r)); return p;
}

async function pageTarget(){
  for (let i=0;i<80;i++){
    try{
      const list=await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json();
      const t=list.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
      if (t) return t;
    }catch(e){}
    await sleep(150);
  }
  throw new Error('devtools target not available\n'+chromeErr.slice(-800));
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let ws, msgId=0; const pending=new Map();
async function connect(wsUrl){
  ws=new WebSocket(wsUrl);
  await new Promise((res,rej)=>{
    ws.onopen=res; ws.onerror=(e)=>rej(new Error('ws error'));
    setTimeout(()=>rej(new Error('ws timeout')),8000);
  });
  ws.onmessage=(e)=>{
    let m; try{ m=JSON.parse(e.data); }catch(_){ return; }
    if (m.id && pending.has(m.id)){
      const {res,rej}=pending.get(m.id); pending.delete(m.id);
      m.error?rej(new Error(m.error.message)):res(m.result);
    }
  };
}
function send(method,params={}){
  const id=++msgId;
  return new Promise((res,rej)=>{
    pending.set(id,{res,rej});
    ws.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{ if (pending.has(id)){ pending.delete(id); rej(new Error('timeout '+method)); } },20000);
  });
}
async function evaluate(expression,awaitPromise=true){
  const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text+' '+(r.exceptionDetails.exception?.description||''));
  return r.result.value;
}
async function goto(url){
  await send('Page.navigate',{url});
  await waitFor(`document.readyState==='complete'`,'navigate '+url,15000);
}
async function waitFor(expr,label,timeout=15000){
  const until=Date.now()+timeout;
  while (Date.now()<until){
    try{ if (await evaluate(expr)) return true; }catch(e){}
    await sleep(120);
  }
  throw new Error('waitFor timeout: '+(label||expr));
}
async function pressKey(key,code,vk){
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});
}
async function typePassword(pw){
  await evaluate(`(()=>{const i=document.getElementById('gatePw'); if(!i) return false; i.focus(); i.select&&i.select(); return true;})()`);
  await send('Input.insertText',{text:pw});
  // Enter must carry text for implicit form submission in a headless tab
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',
    windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await send('Input.dispatchKeyEvent',{type:'char',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',
    windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
}

try{
  const t=await pageTarget();
  await connect(t.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.bringToFront').catch(()=>{});

  // ---- 3. locked -------------------------------------------------------
  await goto(ORIGIN+'/index.html?rec=1');
  await waitFor(`/unlock\\.html/.test(location.pathname)`,'index → unlock',15000);
  check('locked index redirects to unlock', true, await evaluate('location.pathname'));
  check('unlock page asks for a password', await evaluate(`!!document.getElementById('gatePw')`));
  // the page is only "ready" once its submit handler is attached; typing before
  // that would exercise the browser's native form submission instead
  await waitFor(`document.getElementById('gateForm').dataset.ready==='1'`,'unlock handler attached',15000);

  if (process.env.GATE_DEBUG){
    const t0=Date.now();
    const r=await evaluate(`window.JiGate.verifyPassword('probe-wrong').then(v=>JSON.stringify(v)).catch(e=>'THROW '+e.message)`);
    console.log('  [debug] verify('+(Date.now()-t0)+'ms):',r);
    const c=await evaluate(`window.JiGate.config().then(c=>JSON.stringify({iter:c.iter,salt:c.salt.slice(0,8)})).catch(e=>'CFGERR '+e.message)`);
    console.log('  [debug] config:',c);
    console.log('  [debug] subtle:',await evaluate('typeof crypto.subtle'));
    console.log('  [debug] trace:',await evaluate('JSON.stringify(window.__gateTrace||[])'));
  }

  // ---- 4. wrong password ----------------------------------------------
  await typePassword('not-the-password');
  try{
    await waitFor(`/密码不对/.test(document.getElementById('gateErr').textContent||'')`,'wrong password message',15000);
  }catch(e){
    const diag=await evaluate(`JSON.stringify({
      active:document.activeElement&&(document.activeElement.id||document.activeElement.tagName),
      val:document.getElementById('gatePw')&&document.getElementById('gatePw').value,
      err:document.getElementById('gateErr')&&document.getElementById('gateErr').textContent,
      gate:typeof window.JiGate,
      url:location.pathname+location.search})`);
    throw new Error(e.message+' | '+diag);
  }
  const errText=await evaluate(`document.getElementById('gateErr').textContent`);
  check('wrong password is rejected', /密码不对|不对/.test(errText), errText);
  check('wrong password does not boot the game',
    await evaluate(`!window.__jiThird && /unlock\\.html/.test(location.pathname)`));

  // ---- 5. right password ----------------------------------------------
  await waitFor(`!document.getElementById('gatePw').disabled`,'input re-enabled',10000);
  await typePassword(PASS);
  await waitFor(`location.pathname.endsWith('/index.html') && !/unlock/.test(location.pathname)`,'unlock → game',20000);
  await waitFor(`!!window.__jiThird`,'game code decrypted and running',30000);
  // the title card still wants the same real key a player presses
  await pressKey('Enter','Enter',13);
  await waitFor(`!!(window.__jiThird && window.__jiThird.state && window.__jiThird.state.started)`,'game starts on Enter',20000);
  check('right password boots the game', true, await evaluate('location.pathname+location.search'));
  check('recorder attaches in the same tab',
    await waitFor(`!!document.getElementById('recPill')`,'recorder pill',20000));
  check('game canvas is rendering',
    await evaluate(`(()=>{const c=document.getElementById('pixel'); if(!c) return false;
      const x=c.getContext('2d'); const d=x.getImageData(0,0,64,64).data;
      let s=0; for (let i=0;i<d.length;i+=4) s+=d[i]+d[i+1]+d[i+2]; return s>0;})()`));

  // ---- 6. other gated pages, same session ------------------------------
  await goto(ORIGIN+'/playtest/beta.html');
  await waitFor(`document.title.includes('内测')`,'beta landing decrypts',20000);
  check('beta landing decrypts in session', true, await evaluate('document.title'));
  // document.write sets <title> from the head before the body is parsed, so
  // give the decrypted page a beat to finish before looking for links
  check('beta landing links to the recorder build',
    await waitFor(`document.body.innerHTML.includes('index.html?rec=1')`,'beta recorder link',15000));

  await goto(ORIGIN+'/playtest/report.html?demo=1');
  await waitFor(`document.body.innerText.includes('试玩时长')`,'report tool decrypts',20000);
  check('report tool decrypts in session', true);

  // ---- 7. clearing the session re-locks -------------------------------
  await evaluate(`sessionStorage.clear()`);
  await goto(ORIGIN+'/playtest/beta.html');
  await waitFor(`/unlock\\.html/.test(location.pathname)`,'re-lock after session clear',15000);
  check('clearing the session re-locks the build', true);

  const bad=results.filter(r=>!r.ok);
  console.log(bad.length?('GATE FAIL '+bad.length+'/'+results.length):('GATE PASS '+results.length+'/'+results.length));
  process.exitCode=bad.length?1:0;
}catch(e){
  console.error('GATE FAIL: '+e.message);
  console.error(chromeErr.slice(-1200));
  process.exitCode=1;
}finally{
  try{ ws && ws.close(); }catch(e){}
  chrome.kill('SIGKILL');
  if (server) server.close();
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
