(function () {
  'use strict';
  let current = null, refreshing = null;
  function set(user) { current = user; document.dispatchEvent(new CustomEvent('auth:changed',{detail:user})); }
  const session = {
    get user() { return current; }, set,
    refresh() {
      if (!refreshing) refreshing = window.GambitAPI.get('/me',{noAuth:true}).then(data => { set(data.user); return current; }).finally(()=>{refreshing=null;});
      return refreshing;
    },
    async login(name,password,signup=false) { await window.GambitAPI.post(signup?'/register':'/login',{name,password,...(signup&&new URLSearchParams(location.search).get('invite')?{invite:new URLSearchParams(location.search).get('invite')}:{})}); await this.refresh(); return current; },
    async logout() { await window.GambitAPI.post('/logout'); set(null); window.GambitRealtime?.close(); location.assign('/'); }
  };
  window.GambitSession = session;
  let expired = false;
  document.addEventListener('auth:expired',()=>{
    if (expired) return; expired = true; set(null); window.GambitRealtime?.close();
    window.Gambit?.openAuth('login'); window.Gambit?.toast('La sessione è scaduta. Accedi per riprendere.','info');
  });
  document.addEventListener('auth:changed',e=>{ if(e.detail) expired=false; });
})();
