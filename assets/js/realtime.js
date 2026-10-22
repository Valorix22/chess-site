(function () {
  'use strict';
  let source, reconnectTimer, attempt = 0, stopped = true;
  const listeners = new Set();
  function banner(connected) {
    document.documentElement.dataset.connection = connected ? 'online' : 'reconnecting';
    const host=document.getElementById('connection-banner');
    if(host) host.hidden=connected;
  }
  function connect() {
    if(stopped || !window.GambitSession.user || !navigator.onLine) return;
    clearTimeout(reconnectTimer); source?.close(); source=new EventSource(window.GambitConfig.WS_URL);
    source.onmessage=e=>{
      let payload; try { payload=JSON.parse(e.data); } catch { return; }
      attempt=0; banner(true);
      if(payload.type==='session_end'){document.dispatchEvent(new CustomEvent('auth:expired'));return;}
      for(const fn of listeners) { try {fn(payload);} catch(error) { window.Gambit?.toast('Aggiornamento non riuscito. Riconnessione in corso.','info'); } }
      document.dispatchEvent(new CustomEvent('gambit:realtime',{detail:payload}));
    };
    source.onerror=()=>{
      banner(false);source?.close();
      if(!stopped) reconnectTimer=setTimeout(connect,Math.min(20000,1000*2**Math.min(attempt++,5))+Math.random()*500);
    };
  }
  window.GambitRealtime={start(){stopped=false;connect();},close(){stopped=true;clearTimeout(reconnectTimer);source?.close();},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  window.addEventListener('offline',()=>{banner(false);source?.close();});
  window.addEventListener('online',connect);
  window.addEventListener('pageshow',event=>{if(event.persisted&&window.GambitSession.user){stopped=false;connect();}});
  window.addEventListener('pagehide',()=>window.GambitRealtime.close());
})();
