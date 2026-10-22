#!/usr/bin/env node
// Release audit: prove the shippable artifact is internally consistent.
//
//   node dev/release_audit.mjs
//
// This is the part of "ready to publish" that can be checked without a human:
// the version people read, the package they download, the files inside it, and
// the paper trail that says where those files came from. It deliberately fails
// on stale packaging (zip older than game.js) and on any shipped asset that no
// manifest or credits file accounts for.
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname, basename, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=[]; const check=(n,c,x='')=>out.push({name:n,ok:!!c,extra:x});
const read=p=>readFileSync(join(ROOT,p),'utf8');
const has=(path,needle)=>existsSync(join(ROOT,path))&&read(path).includes(needle);

const VER=read('VERSION').trim();
console.log('· auditing v'+VER);

// ---- 1. version consistency across everything a reader sees ---------------
check('VERSION is semver', /^\d+\.\d+\.\d+$/.test(VER), VER);
check('README states current version', has('README.md',`当前：**v${VER}**`), '当前：**v'+VER+'**');
check('README links the matching package', has('README.md',`ji-she-in-frame-v${VER}.zip`));
check('TRIAL_PLAY title matches', has('TRIAL_PLAY.md',`# 试玩指南 · v${VER}`));
check('RELEASE_CHECKLIST title matches', has('RELEASE_CHECKLIST.md',`# Release checklist — v${VER}`));
check('store/README links the matching package', has('store/README.md',`ji-she-in-frame-v${VER}.zip`));
check('no other version string in README package refs',
  !new RegExp(`ji-she-in-frame-v(?!${VER.replace(/\./g,'\\.')})\\d+\\.\\d+\\.\\d+\\.zip`).test(read('README.md')));

// ---- 2. package exists, is current, and matches its checksum --------------
const ZIP=join(ROOT,'dist',`ji-she-in-frame-v${VER}.zip`);
const SHA=ZIP+'.sha256';
check('package exists', existsSync(ZIP), ZIP.replace(ROOT+'/',''));
if (existsSync(ZIP)){
  const zt=statSync(ZIP).mtimeMs;
  // packaging must be newer than the sources it packages
  for (const f of ['game.js','style.css','index.html','README.md','TRIAL_PLAY.md','RIGHTS.md',
                   'RELEASE_CHECKLIST.md','assets/CREDITS.md']){
    check('package is not older than '+f, zt>=statSync(join(ROOT,f)).mtimeMs-1000,
      new Date(zt).toISOString().slice(0,16)+' vs '+new Date(statSync(join(ROOT,f)).mtimeMs).toISOString().slice(0,16));
  }
  const digest=createHash('sha256').update(readFileSync(ZIP)).digest('hex');
  check('checksum file exists', existsSync(SHA));
  if (existsSync(SHA)){
    const want=readFileSync(SHA,'utf8').trim().split(/\s+/)[0];
    check('checksum matches the package', want===digest, digest.slice(0,12)+'…');
  }
  // ---- 3. package contents ---------------------------------------------
  const listing=execFileSync('unzip',['-Z1',ZIP],{encoding:'utf8'}).split('\n').filter(Boolean);
  const rel=listing.map(p=>p.replace(/^[^/]+\//,''));
  check('package has no dev/ or playtest/ or store/',
    !rel.some(p=>/^(dev|playtest|store|audit|\.beta-site|dist)\//.test(p)),
    rel.filter(p=>/^(dev|playtest|store|audit|\.beta-site|dist)\//.test(p)).slice(0,3).join(', '));
  check('package has no generation sources',
    !rel.some(p=>/^assets\/(references|prompts|audio\/source)\//.test(p)));
  check('package has no source masters (png)',
    !rel.some(p=>/\.png$/i.test(p)));
  for (const f of ['index.html','game.js','style.css','VERSION','README.md','TRIAL_PLAY.md','RIGHTS.md','CREDITS.md','RELEASE_CHECKLIST.md']){
    check('package ships '+f, rel.includes(f));
  }
  const stage=join(ROOT,'.audit-zip');
  if (existsSync(stage)) rmSync(stage,{recursive:true,force:true});
  mkdirSync(stage,{recursive:true});
  execFileSync('unzip',['-q',ZIP,'-d',stage]);
  const inner=join(stage,`ji-she-in-frame-v${VER}`);
  check('package VERSION matches the tree', readFileSync(join(inner,'VERSION'),'utf8').trim()===VER);
  check('package game.js is the current build',
    readFileSync(join(inner,'game.js')).equals(readFileSync(join(ROOT,'game.js'))));
  const zi=readFileSync(join(inner,'index.html'),'utf8');
  check('release index.html has no playtest hook', !/playtest|gate\.js|unlock\.html/.test(zi));
  check('release index.html is not noindexed', !/noindex/i.test(zi));
  check('release index.html boots game.js directly', zi.includes('<script src="game.js"></script>'));

  // ---- 4. every shipped asset is accounted for ------------------------
  const manifests=[
    'assets/MANIFEST.json','assets/audio/SOUND_MANIFEST.json',
    'assets/CREDITS.md','assets/audio/AUDIO_ASSET_DELIVERY_REPORT.md'
  ].filter(f=>existsSync(join(ROOT,f))).map(f=>read(f)).join('\n');
  const credits=read('assets/CREDITS.md')+'\n'+read('RIGHTS.md');
  const assets=rel.filter(p=>/^assets\//.test(p)&&!/\.(md|json)$/.test(p));
  const uncredited=assets.filter(a=>{
    const name=basename(a);
    return !manifests.includes(name) && !credits.includes(name);
  });
  check('every shipped asset is in a manifest or the credits', uncredited.length===0,
    uncredited.slice(0,6).join(', ')||assets.length+' assets accounted for');
  // and the reverse: the manifest must not promise files the build lacks
  const soundManifest=JSON.parse(read('assets/audio/SOUND_MANIFEST.json'));
  const promised=(soundManifest.files||[]).map(f=>f.file);
  const missing=promised.filter(f=>{
    const base=basename(f).replace(/\.wav$/i,'.mp3');
    const inZip=rel.some(p=>basename(p)===basename(f)||basename(p)===base);
    return !inZip;
  });
  check('every manifest-listed audio file is in the package or explained',
    missing.length===0||credits.includes('assets/audio/source'),
    missing.slice(0,4).join(', '));
  rmSync(stage,{recursive:true,force:true});
}

// ---- 5. store artifacts exist and are the right shape --------------------
for (const f of ['store/cover.jpg','store/cover_1280x720.jpg','store/trailer_26s.mp4','store/itch_metadata.md','store/itch_description.html']){
  check('store artifact '+f, existsSync(join(ROOT,f)));
}
if (existsSync(join(ROOT,'store/trailer_26s.mp4'))){
  try{
    const probe=execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,width,height',
      '-of','json',join(ROOT,'store/trailer_26s.mp4')],{encoding:'utf8'});
    const j=JSON.parse(probe);
    const dur=parseFloat(j.format.duration);
    const v=j.streams.find(s=>s.width);
    check('trailer is 20–30 s', dur>=20&&dur<=30, dur.toFixed(1)+'s');
    check('trailer is 1280×720', v&&v.width===1280&&v.height===720, v?v.width+'x'+v.height:'no video stream');
    check('trailer has audio', j.streams.some(s=>s.codec_name==='aac'), j.streams.map(s=>s.codec_name).join('+'));
  }catch(e){ check('trailer probes cleanly', false, e.message.slice(0,80)); }
}

// ---- 6. every doc linked from the README header is current or marked ------
// A reviewer clicking the top links is the most likely reader of these files,
// and a stale handover that still says "85 seconds, do not ship" contradicts
// the release. Each linked doc must either carry this version or say HISTORICAL.
const header=read('README.md').split('\n').slice(0,28).join('\n');
const linked=[...header.matchAll(/\]\(([A-Za-z0-9_./-]+\.md)\)/g)].map(m=>m[1]);
check('README header links at least one doc', linked.length>0, linked.join(', '));
for (const f of new Set(linked)){
  if (!existsSync(join(ROOT,f))){ check('linked doc exists: '+f, false); continue; }
  const body=read(f);
  check('linked doc is current or historical: '+f,
    body.includes('v'+VER)||/HISTORICAL|历史快照/.test(body));
}

// ---- 7. store copy: right version, right images, right promises ----------
if (existsSync(join(ROOT,'store/itch_metadata.md'))){
  const meta=read('store/itch_metadata.md');
  check('itch metadata states the current version', meta.includes('- Version: v'+VER),
    (meta.match(/- Version: [^\n]+/)||[''])[0]);
  check('itch metadata mentions the trailer', meta.includes('trailer_26s.mp4'));
  check('itch metadata discloses desktop-only input', /No touch|desktop/i.test(meta));
  check('itch metadata has the AI disclosure', /AI disclosure/i.test(meta));
}
if (existsSync(join(ROOT,'store/itch_description.html'))){
  const html=read('store/itch_description.html');
  const srcs=[...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m=>m[1])
    .filter(s=>!/^https?:/i.test(s));
  const broken=srcs.filter(s=>!existsSync(join(ROOT,'store',s)));
  check('every store description image exists', broken.length===0,
    broken.slice(0,4).join(', ')||srcs.length+' images');
  check('store description covers the second act', /暗房/.test(html) && /10_act2_darkroom\.png/.test(html));
  check('store description has no five-pass miscount', !/四遍同一间房/.test(html));
  check('store description states content warnings', /内容提示/.test(html));
}

// ---- 8. docs that stores and testers actually read -----------------------
check('RIGHTS covers the DV clip', has('RIGHTS.md','footage_clip_5s.mp4'));
check('RIGHTS covers AI audio', /MiniMax|minimax/.test(read('RIGHTS.md')));
check('RIGHTS covers the shader', has('RIGHTS.md','retrozone-LICENSE'));
check('CREDITS names the generator app', /MiniMax Design/.test(read('assets/CREDITS.md')));
check('CREDITS credits the trailer and gate tooling', /trailer|预告/.test(read('assets/CREDITS.md')));
check('README documents the playtest password gate', /AES-256-GCM|密文/.test(read('README.md')));
check('README does not contain the password', !read('README.md').includes(read('dev/.beta_pass').trim()));
check('checklist references the readability audit', has('RELEASE_CHECKLIST.md','lumtest'));
check('checklist references the gate check', has('RELEASE_CHECKLIST.md','gate_check.mjs'));
check('trial guide explains the password', /试玩密码/.test(read('TRIAL_PLAY.md')));
check('password file is gitignored', read('.gitignore').split('\n').some(l=>l.trim()==='dev/.beta_pass'));

// ---- report ------------------------------------------------------------
const bad=out.filter(r=>!r.ok);
for (const r of out){
  if (!r.ok||process.env.AUDIT_VERBOSE) console.log((r.ok?'  PASS ':'  FAIL ')+r.name+(r.extra?'  ('+r.extra+')':''));
}
console.log(bad.length?`AUDIT FAIL ${bad.length}/${out.length}`:`AUDIT PASS ${out.length}/${out.length}`);
process.exitCode=bad.length?1:0;
