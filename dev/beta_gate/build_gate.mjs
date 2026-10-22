#!/usr/bin/env node
// Package the staged beta site with an encrypted playtest gate.
//
//   node dev/beta_gate/build_gate.mjs .beta-site
//
// Input : .beta-site/ with the plain runtime (index.html, style.css, game.js,
//         assets/, vendor/, playtest/{recorder.*,beta.html,report.html})
// Output: the same tree, minus game.js, plus
//           playtest/game.enc   AES-256-GCM(game.js)
//           playtest/beta.enc   AES-256-GCM(beta.html)
//           playtest/report.enc AES-256-GCM(report.html)
//           playtest/gate.json  salt + iteration count + password verifier
//           playtest/gate.js    browser-side decryptor
//           playtest/unlock.html
//           playtest/boot.js
//         index.html is rewired to boot through the gate.
//
// The password never enters the repo or the deployed files. It is read from
// $BETA_PASS, else from dev/.beta_pass (gitignored).
import { readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../..');
const SITE=resolve(process.argv[2]||join(ROOT,'.beta-site'));

const ITER=310000;
const CHECK_PLAIN='ji-playtest-gate-v1';
const b64=b=>Buffer.from(b).toString('base64');

function password(){
  const env=process.env.BETA_PASS;
  if (env && env.trim()) return env.trim();
  const f=join(ROOT,'dev/.beta_pass');
  if (existsSync(f)){
    const v=readFileSync(f,'utf8').trim();
    if (v) return v;
  }
  console.error('FAIL: no playtest password. Set BETA_PASS, or write dev/.beta_pass.');
  process.exit(1);
}

function encrypt(key,plain){
  const iv=randomBytes(12);
  const c=createCipheriv('aes-256-gcm',key,iv);
  const ct=Buffer.concat([c.update(plain),c.final(),c.getAuthTag()]);
  return {v:1,iv:b64(iv),ct:b64(ct)};
}
function decrypt(key,pkg){
  const raw=Buffer.from(pkg.ct,'base64');
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(pkg.iv,'base64'));
  d.setAuthTag(raw.subarray(raw.length-16));
  return Buffer.concat([d.update(raw.subarray(0,raw.length-16)),d.final()]);
}

if (!existsSync(join(SITE,'index.html'))){
  console.error('FAIL: '+SITE+' has no index.html — run dev/deploy_beta.sh --dry-run first.');
  process.exit(1);
}

const pass=password();
const salt=randomBytes(16);
const key=pbkdf2Sync(pass,salt,ITER,32,'sha256');

// ---- 1. encrypt the payload ---------------------------------------------
const jobs=[
  {src:join(SITE,'game.js'),             enc:join(SITE,'playtest/game.enc'),   markers:['她抬起的是另一只手','RITUAL_TAKES']},
  {src:join(SITE,'playtest/beta.html'),  enc:join(SITE,'playtest/beta.enc'),   markers:['内测试玩']},
  {src:join(SITE,'playtest/report.html'),enc:join(SITE,'playtest/report.enc'), markers:['试玩时长']}
];
for (const j of jobs){
  if (!existsSync(j.src)){ console.error('FAIL: missing '+j.src); process.exit(1); }
  const plain=readFileSync(j.src);
  const pkg=encrypt(key,plain);
  writeFileSync(j.enc,JSON.stringify(pkg));
  // round-trip: the deployed ciphertext must decrypt back to the same bytes
  const back=decrypt(key,JSON.parse(readFileSync(j.enc,'utf8')));
  if (!back.equals(plain)){
    console.error('FAIL: round-trip mismatch for '+j.src);
    process.exit(1);
  }
  // at-rest check: a plaintext marker must not be greppable in the ciphertext
  const blob=readFileSync(j.enc);
  for (const m of j.markers){
    if (blob.includes(Buffer.from(m,'utf8'))){
      console.error('FAIL: marker leaked in '+j.enc);
      process.exit(1);
    }
  }
  console.log('  sealed '+j.enc.replace(SITE+'/','')+'  '+
    (statSync(j.src).size/1024).toFixed(0)+'KB → '+(statSync(j.enc).size/1024).toFixed(0)+'KB');
  if (j.src.endsWith('game.js') || j.src.endsWith('beta.html') || j.src.endsWith('report.html')) rmSync(j.src);
}

// ---- 2. gate metadata + browser runtime ---------------------------------
const gateJson={
  v:1,
  kdf:'PBKDF2-SHA256',
  iter:ITER,
  salt:b64(salt),
  check:encrypt(key,Buffer.from(CHECK_PLAIN,'utf8')),
  files:{game:'game.enc',beta:'beta.enc',report:'report.enc'},
  note:'Encrypted playtest payload. Password is not stored here.'
};
writeFileSync(join(SITE,'playtest/gate.json'),JSON.stringify(gateJson,null,1)+'\n');
for (const f of ['gate.js','unlock.html']){
  writeFileSync(join(SITE,'playtest',f),readFileSync(join(HERE,f)));
}

writeFileSync(join(SITE,'playtest/boot.js'),`// Beta boot: decrypt game.js into this document, or bounce to the gate.
(function(){
  var s=document.createElement('script');
  s.src='playtest/gate.js';
  s.onload=function(){
    window.JiGate.injectScript('game.enc').then(function(ok){
      if (ok) return;
      try{ sessionStorage.removeItem('ji.gate.key'); }catch(e){}
      location.replace('playtest/unlock.html?next='+
        encodeURIComponent(location.pathname+location.search+location.hash));
    });
  };
  s.onerror=function(){ document.title='BOOT FAIL: gate missing'; };
  document.body.appendChild(s);
})();
`);

// ---- 3. shells for the two gated pages ----------------------------------
function shell(title,enc,label){
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<meta name="color-scheme" content="dark" />
<title>${title}</title>
<style>
html,body{margin:0;height:100%;background:#070806;}
body{display:flex;align-items:center;justify-content:center;
  color:rgba(216,201,168,.42);font:11px/1.6 "Courier New",monospace;letter-spacing:.24em;}
</style>
</head>
<body>
<div>正 在 解 密 · ${label}</div>
<script src="gate.js"></script>
<script>window.JiGate.mount('${enc}');</script>
</body>
</html>
`;
}
writeFileSync(join(SITE,'playtest/beta.html'),shell('祭 · 内测试玩','beta.enc','PLAYTEST'));
writeFileSync(join(SITE,'playtest/report.html'),shell('祭 · 试玩复盘','report.enc','REPORT'));

// ---- 4. rewire index.html ----------------------------------------------
let html=readFileSync(join(SITE,'index.html'),'utf8');
if (!html.includes('<script src="game.js"></script>')){
  console.error('FAIL: index.html has no <script src="game.js"></script> to replace');
  process.exit(1);
}
html=html.replace('<script src="game.js"></script>','<script src="playtest/boot.js"></script>');
if (!html.includes('name="robots"')){
  html=html.replace('<meta charset="utf-8" />','<meta charset="utf-8" />\n<meta name="robots" content="noindex,nofollow" />');
}
const redirect=`<script>
// Gate first: no plaintext boots before the password is verified.
(function(){
  try{
    if (!sessionStorage.getItem('ji.gate.key')){
      location.replace('playtest/unlock.html?next='+
        encodeURIComponent(location.pathname+location.search+location.hash));
    }
  }catch(e){}
})();
</script>
`;
html=html.replace('<head>','<head>\n'+redirect);
writeFileSync(join(SITE,'index.html'),html);

const leftover=['game.js'].filter(f=>existsSync(join(SITE,f)));
if (leftover.length){ console.error('FAIL: plaintext still staged: '+leftover.join(', ')); process.exit(1); }

console.log('  gate ready: PBKDF2 '+ITER+' iters, '+jobs.length+' payloads');
console.log('  password source: '+(process.env.BETA_PASS?'$BETA_PASS':'dev/.beta_pass'));
