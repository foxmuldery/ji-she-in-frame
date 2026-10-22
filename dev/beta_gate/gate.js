// =========================================================
//  PLAYTEST GATE  (client-side, no backend)
// =========================================================
// GitHub Pages is static, so "password protection" here means the payload is
// encrypted at rest: the site ships game.enc / beta.enc / report.enc, never the
// plaintext, and the AES key exists only in a tester's tab session after they
// type the password. The password itself is never stored in the repo or in the
// deployed files — only a PBKDF2 salt and a known-plaintext verifier.
//
// Limits worth stating plainly: anyone who knows the password can read the
// payload (that is the point), and a weak password can be brute-forced offline
// from the published ciphertext. 310k PBKDF2 iterations is the guard there.
(function(){
  'use strict';
  const script=document.currentScript;
  const BASE=new URL('.',script&&script.src?script.src:location.href);
  const SKEY='ji.gate.key';
  const CHECK_PLAIN='ji-playtest-gate-v1';

  const b64d=(s)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const b64e=(buf)=>{
    const u=new Uint8Array(buf); let s='';
    for (let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]);
    return btoa(s);
  };
  const enc=new TextEncoder(), dec=new TextDecoder();

  let cfgCache=null;
  function config(){
    if (!cfgCache) cfgCache=fetch(new URL('gate.json',BASE),{cache:'no-store'})
      .then(r=>{ if (!r.ok) throw new Error('gate.json '+r.status); return r.json(); });
    return cfgCache;
  }
  async function derive(pw,cfg){
    const base=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:b64d(cfg.salt),iterations:cfg.iter,hash:'SHA-256'},
      base,{name:'AES-GCM',length:256},true,['decrypt']);
  }
  async function sessionKey(){
    const v=sessionStorage.getItem(SKEY);
    if (!v) return null;
    try{ return await crypto.subtle.importKey('raw',b64d(v),{name:'AES-GCM'},true,['decrypt']); }
    catch(e){ sessionStorage.removeItem(SKEY); return null; }
  }
  async function decryptJson(key,pkg){
    return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(pkg.iv)},key,b64d(pkg.ct)));
  }
  function nextPath(){
    return location.pathname+location.search+location.hash;
  }
  function unlockUrl(next){
    return new URL('unlock.html?next='+encodeURIComponent(next||nextPath()),BASE);
  }
  function safeNext(v){
    // only same-origin absolute paths; never an open redirect
    if (!v || typeof v!=='string') return '../index.html?rec=1';
    if (v[0]!=='/' || v.startsWith('//') || v.includes('://') || v.includes('\\')) return '../index.html?rec=1';
    return v;
  }
  async function verifyPassword(pw){
    let cfg;
    try{ cfg=await config(); }
    catch(e){ return {ok:false,reason:'校验文件缺失，联系发布者'}; }
    if (!pw){ return {ok:false,reason:'请输入密码'}; }
    let key;
    try{ key=await derive(pw,cfg); }catch(e){ return {ok:false,reason:'此浏览器不支持解密'}; }
    try{
      const out=await decryptJson(key,cfg.check);
      if (out!==CHECK_PLAIN) return {ok:false,reason:'密码不对'};
      sessionStorage.setItem(SKEY,b64e(await crypto.subtle.exportKey('raw',key)));
      return {ok:true};
    }catch(e){
      return {ok:false,reason:'密码不对'};
    }
  }
  async function unlockText(name){
    const key=await sessionKey();
    if (!key) throw new Error('locked');
    const res=await fetch(new URL(name,BASE),{cache:'no-store'});
    if (!res.ok) throw new Error(name+' '+res.status);
    return decryptJson(key,await res.json());
  }
  // Page shells (beta.html / report.html / index.html) call this on boot.
  async function mount(name){
    if (!sessionStorage.getItem(SKEY)){ location.replace(unlockUrl(nextPath())); return; }
    let html;
    try{ html=await unlockText(name); }
    catch(e){ sessionStorage.removeItem(SKEY); location.replace(unlockUrl(nextPath())); return; }
    document.open(); document.write(html); document.close();
  }
  async function injectScript(name){
    if (!sessionStorage.getItem(SKEY)){ return false; }
    let code;
    try{ code=await unlockText(name); }
    catch(e){ sessionStorage.removeItem(SKEY); return false; }
    const s=document.createElement('script');
    s.textContent=code;
    document.body.appendChild(s);
    return true;
  }
  window.JiGate={
    BASE, config, verifyPassword, unlockText, mount, injectScript,
    unlockUrl, safeNext,
    hasKey:()=>!!sessionStorage.getItem(SKEY),
    forget(){ sessionStorage.removeItem(SKEY); }
  };
})();
