// Beta boot: decrypt game.js into this document, or bounce to the gate.
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
