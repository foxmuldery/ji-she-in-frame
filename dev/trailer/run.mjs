#!/usr/bin/env node
// Capture the 26-second store teaser from the real game renderer.
//
//   ./dev/trailer/run.mjs                 # default output: store/trailer_26s.mp4
//   ./dev/trailer/run.mjs --keep-frames   # keep the raw webm next to the mp4
//
// The page (?trailer=1) records its own 1280x720 canvas with MediaRecorder and
// POSTs the blob back to a throwaway localhost server; ffmpeg then muxes the
// music bed and encodes H.264 + AAC for stores that reject webm.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../..');
const STORE=join(ROOT,'store');
mkdirSync(STORE,{recursive:true});
const keepFrames=process.argv.includes('--keep-frames');
const outMp4=join(STORE,'trailer_26s.mp4');
const outPoster=join(STORE,'cover_1280x720.jpg');
const outWebm=join(STORE,'trailer_26s.webm');

const CHROME=process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)){ console.error('Chrome not found:',CHROME); process.exit(1); }

const tmp=mkdtempSync(join(tmpdir(),'ji-trailer-'));
const webmPath=join(tmp,'trailer.webm');

let resolveBlob, rejectBlob;
const blobPromise=new Promise((res,rej)=>{resolveBlob=res;rejectBlob=rej;});

const server=createServer((req,res)=>{
  if (req.method!=='POST'){
    res.writeHead(200,{'content-type':'text/plain'}); res.end('trailer sink'); return;
  }
  const chunks=[];
  req.on('data',c=>chunks.push(c));
  req.on('end',()=>{
    const buf=Buffer.concat(chunks);
    writeFileSync(webmPath,buf);
    res.writeHead(204,{'access-control-allow-origin':'*'});
    res.end();
    resolveBlob(buf.length);
  });
  req.on('error',rejectBlob);
});

await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
console.log('· sink on 127.0.0.1:'+port);

const url='file://'+join(ROOT,'index.html')+'?nointro=1&trailer=1&upload='+encodeURIComponent('http://127.0.0.1:'+port+'/upload');
const chrome=spawn(CHROME,[
  '--headless=new','--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader',
  '--ignore-gpu-blocklist','--allow-file-access-from-files','--disable-web-security',
  '--autoplay-policy=no-user-gesture-required','--mute-audio',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding','--hide-scrollbars',
  '--window-size=1280,720',
  '--user-data-dir='+join(tmp,'chrome'),
  url
],{stdio:['ignore','ignore','pipe']});

let chromeErr='';
chrome.stderr.on('data',d=>{ chromeErr+=d.toString(); });

const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('capture timed out after 90s\n'+chromeErr.slice(-1200))),90000));
let bytes;
try{
  bytes=await Promise.race([blobPromise,timeout]);
}catch(e){
  console.error('FAIL:',e.message);
  chrome.kill('SIGKILL'); server.close(); process.exit(1);
}
console.log('· recorded webm',Math.round(bytes/1024)+'KB');
chrome.kill('SIGTERM');
await new Promise(r=>setTimeout(r,300));
chrome.kill('SIGKILL');
server.close();

// --- mux + encode ---------------------------------------------------------
const music=join(ROOT,'assets/audio/music_cue_60s.mp3');
const args=[
  '-y','-loglevel','error',
  '-i',webmPath,
  '-ss','6','-t','26','-i',music,
  '-filter_complex',
  '[0:v]scale=1280:720:flags=neighbor,fps=30,format=yuv420p[v];'+
  '[1:a]afade=t=in:st=0:d=1.4,afade=t=out:st=23.4:d=2.6,volume=0.9[a]',
  '-map','[v]','-map','[a]',
  '-c:v','libx264','-preset','slow','-crf','19','-profile:v','high','-level','4.1',
  '-c:a','aac','-b:a','192k','-ar','48000',
  '-movflags','+faststart','-shortest',
  outMp4
];
console.log('· encoding mp4…');
await new Promise((res,rej)=>{
  const f=spawn('ffmpeg',args,{stdio:['ignore','inherit','inherit']});
  f.on('exit',c=>c===0?res():rej(new Error('ffmpeg exited '+c)));
});
await new Promise((res,rej)=>{
  const f=spawn('ffmpeg',['-y','-loglevel','error','-ss','1.6','-i',outMp4,'-frames:v','1','-q:v','2',outPoster],{stdio:'inherit'});
  f.on('exit',c=>c===0?res():rej(new Error('poster failed '+c)));
});
if (keepFrames) await new Promise((res)=>{
  const f=spawn('cp',[webmPath,outWebm]); f.on('exit',()=>res());
});
rmSync(tmp,{recursive:true,force:true});

const size=(await import('node:fs/promises')).stat;
const s=await size(outMp4);
console.log('OK — '+outMp4+' ('+(s.size/1048576).toFixed(1)+' MB)');
console.log('OK — '+outPoster);
if (keepFrames) console.log('OK — '+outWebm);
