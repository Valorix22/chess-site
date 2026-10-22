(function(){
 'use strict';
 const A=window.GambitAPI,$=s=>document.querySelector(s);let challengeSeen=new Map();
 const run=async(fn,button)=>{if(button?.disabled)return;if(button)button.disabled=true;try{return await fn();}catch(error){window.Gambit?.toast(error.message,'error');}finally{if(button)button.disabled=false;}};
 function empty(message,action=''){return '<div class="empty-state"><h4>'+window.Gambit.esc(message)+'</h4>'+action+'</div>';}
 async function passwordDialog(required=false){
  const G=window.Gambit;const modal=G.createModal({title:required?'Scegli una nuova password':'Cambia password',subtitle:'Almeno 12 caratteri. Le altre sessioni verranno revocate.',width:'narrow',body:'<form id="real-password-form" class="stack gap-12"><label>Password attuale<input class="input" type="password" name="current_password" autocomplete="current-password" required></label><label>Nuova password<input class="input" type="password" name="new_password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button class="btn btn-primary" type="submit">Salva password</button></form>'});
  if(required)modal.el.querySelector('.modal-close')?.remove();
  modal.el.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const f=event.currentTarget;run(async()=>{await A.post('/password',{current_password:f.elements.namedItem("current_password").value,new_password:f.elements.namedItem("new_password").value});location.reload();},f.querySelector('button'));});
 }
 function friendDialog(){
  if(!window.GambitSession.user){window.Gambit.openAuth();return;}
  const G=window.Gambit,code=window.GambitSession.user.friend_code;
  const m=G.createModal({title:'Aggiungi un amico',subtitle:'I giocatori si trovano solo tramite codice personale.',width:'narrow',body:'<p class="tiny muted">Il tuo codice</p><div class="copy-row"><code id="my-friend-code">'+G.esc(code)+'</code><button class="btn btn-sm" id="copy-friend-code">Copia</button></div><form id="real-friend-form" class="stack gap-12 mt-16"><label>Codice del tuo amico<input class="input" name="code" minlength="8" maxlength="40" autocomplete="off" required></label><button class="btn btn-primary">Invia richiesta</button></form>'});
  m.el.querySelector('#copy-friend-code').onclick=()=>run(async()=>{await navigator.clipboard.writeText(code);G.toast('Codice copiato.');});
  m.el.querySelector('form').onsubmit=event=>{event.preventDefault();const f=event.currentTarget;run(async()=>{await A.post('/friends/request',{code:f.elements.namedItem("code").value.trim()});await G.refreshFriends();G.toast('Richiesta inviata.');m.close();},f.querySelector('button'));};
 }
 function piece(code){return '<img class="piece-icon" src="/pieces/'+code+'.svg" alt="'+code+'" draggable="false">';}
 function clearCustomTheme(){for(const k of ['--bg','--surface','--surface-2','--border','--text','--muted','--brand','--brand-ink','--custom-board-light','--custom-board-dark','--custom-board-lastLight','--custom-board-lastDark'])document.documentElement.style.removeProperty(k);delete document.documentElement.dataset.customBoard;window.GAMBIT.legacyPreferences=null;}
 function applyLegacyTheme(pack){
  if(!pack||!Object.keys(pack.site||{}).length&&!Object.keys(pack.board||{}).length)return;clearCustomTheme();window.GAMBIT.legacyPreferences={theme:pack};const map={bg:'--bg',panel:'--surface',surface:'--surface-2',line:'--border',text:'--text',muted:'--muted',accent:'--brand',accentInk:'--brand-ink'};
  for(const [k,v]of Object.entries(pack.site||{}))if(map[k]&&/^#[a-f0-9]{6}$/i.test(v))document.documentElement.style.setProperty(map[k],v);
  for(const [k,v]of Object.entries(pack.board||{}))if(/^#[a-f0-9]{6}$/i.test(v))document.documentElement.style.setProperty('--custom-board-'+k,v);
  document.documentElement.dataset.customBoard='true';
 }
 async function importTheme(pack){const G=window.Gambit;await A.post('/preferences',{theme:pack,animations:G.settings.animations,sound:G.settings.sound});applyLegacyTheme(pack);document.dispatchEvent(new CustomEvent('gambit:settings'));G.toast('Tema importato.');}
 async function sessionsDialog(){
  const G=window.Gambit,data=await A.get('/platform/sessions');const m=G.createModal({title:'Sessioni attive',body:data.items.map(x=>'<div class="settings-row"><span>'+(x.current?'Questa sessione':'Altra sessione')+'<small>Scade '+G.esc(new Date(x.expires*1000).toLocaleDateString())+'</small></span><button class="btn btn-sm" data-revoke-session="'+G.esc(x.id)+'">Revoca</button></div>').join('')});
  m.el.onclick=event=>{const b=event.target.closest('[data-revoke-session]');if(b)run(async()=>{await A.delete('/platform/sessions/'+b.dataset.revokeSession);G.toast('Sessione revocata.');b.closest('.settings-row').remove();},b);};
 }
 function challengePopup(c){
  if(c.sender===window.GambitSession.user?.id){if(c.status==='accepted'&&!challengeSeen.has(c.id+':accepted')){challengeSeen.set(c.id+':accepted',true);const m=window.Gambit.createModal({title:'Sfida accettata',subtitle:c.recipient_name,body:'<a class="btn btn-primary" href="/play.html?game='+encodeURIComponent(c.game_id)+'">Entra in partita →</a>'});}return;}
  const previous=challengeSeen.get(c.id);if(previous===c.status)return;challengeSeen.set(c.id,c.status);while(challengeSeen.size>100)challengeSeen.delete(challengeSeen.keys().next().value);
  document.getElementById('challenge-'+c.id)?.remove();if(c.status!=='pending')return;
  let stack=$('#real-challenges');if(!stack){stack=document.createElement('div');stack.id='real-challenges';stack.className='real-challenges';document.body.append(stack);}
  const box=document.createElement('div');box.className='card challenge-card';box.id='challenge-'+c.id;box.innerHTML='<strong>'+window.Gambit.esc(c.sender_name)+'</strong><p>'+Math.round(c.base/60)+'+'+c.increment+' · '+(c.rated?'Ranked':'Unranked')+'</p><div class="row gap-8"><button class="btn btn-primary" data-answer="yes">Accetta</button><button class="btn" data-answer="no">Rifiuta</button></div>';stack.append(box);window.Gambit.Sound.play('notify');
  box.onclick=event=>{const b=event.target.closest('[data-answer]');if(!b)return;run(async()=>{const accepted=b.dataset.answer==='yes';await A.post('/challenges/'+c.id+'/reply',{accept:accepted});box.remove();if(accepted)location.assign('/play.html?game='+encodeURIComponent(c.game_id));},b);};
 }
 function shellReady(){
  const G=window.Gambit;
  if(!window.GambitConfig.FEATURE_FLAGS.watch)document.querySelectorAll('a[href*="watch.html"]').forEach(a=>a.remove());
  if(window.GambitSession.user?.admin){const panel=$('[data-panel="user"]');const link=document.createElement('a');link.className='dropdown-item';link.href='/admin.html';link.textContent='Amministrazione';panel?.append(link);}
  const connection=document.createElement('div');connection.id='connection-banner';connection.className='connection-banner';connection.hidden=true;connection.textContent='Connessione in ripristino…';document.body.append(connection);
  const challenge=$('#challenge-modal .modal-body');if(challenge){const label=document.createElement('label');label.className='row gap-8 mt-12';label.innerHTML='<input id="challenge-ranked" type="checkbox"> Partita ranked';challenge.append(label);}
  const body=$('#settings-modal .modal-body');
  if(body){const extra=document.createElement('div');extra.className='settings-group';extra.innerHTML='<div class="settings-label">Partita e account</div><label class="settings-row">Premosse<select class="input" id="real-premove-mode"><option value="multiple">Multiple (massimo 5)</option><option value="single">Una sola</option><option value="off">Disattivate</option></select></label><p class="tiny muted">Trascina con il destro per disegnare. Clic destro per annullare tutte le premosse.</p><div class="row gap-8 wrap"><button class="btn btn-sm" id="password-settings">Cambia password</button><button class="btn btn-sm" id="sessions-settings">Sessioni</button><button class="btn btn-sm" id="blocks-settings">Utenti bloccati</button><a class="btn btn-sm" href="/api/platform/me/export">Scarica i miei dati</a></div><div class="settings-label mt-16">Temi personalizzati</div><div class="row gap-8 wrap"><label class="btn btn-sm">Importa JSON<input id="real-theme-file" type="file" accept="application/json,.json" hidden></label><button class="btn btn-sm" id="real-theme-export">Esporta tema</button><button class="btn btn-sm" id="real-theme-catalog">Catalogo temi</button></div><form id="real-theme-url" class="row gap-8 mt-12"><input class="input" name="url" type="url" placeholder="https://…/tema.json" required><button class="btn btn-sm">Importa URL</button></form>';body.append(extra);
   $('#real-premove-mode').value=G.settings.premoveMode||'multiple';$('#real-premove-mode').onchange=event=>G.updateSettings({premoveMode:event.target.value});
   $('#password-settings').onclick=()=>passwordDialog();$('#sessions-settings').onclick=()=>run(sessionsDialog);$('#blocks-settings').onclick=()=>run(async()=>{const data=await A.get('/blocks');const m=G.createModal({title:'Utenti bloccati',body:data.blocks.map(p=>'<div class="settings-row"><span>'+G.esc(p.name)+'</span><button class="btn btn-sm" data-unblock="'+G.esc(p.id)+'">Sblocca</button></div>').join('')||empty('Nessun utente bloccato.')});m.el.onclick=event=>{const b=event.target.closest('[data-unblock]');if(b)run(async()=>{await A.post('/friends/'+b.dataset.unblock+'/unblock');b.closest('.settings-row').remove();G.toast('Utente sbloccato.');},b);};});
   $('#real-theme-file').onchange=event=>run(async()=>{const file=event.target.files[0];if(!file)return;if(file.size>20000)throw Error('Tema troppo grande.');await importTheme(JSON.parse(await file.text()));});
   $('#real-theme-url').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;run(async()=>{const url=new URL(form.elements.namedItem("url").value);if(url.protocol!=='https:')throw Error('Usa un link HTTPS.');const response=await fetch(url.href,{credentials:'omit',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Tema non disponibile.');const text=await response.text();if(text.length>20000)throw Error('Tema troppo grande.');await importTheme(JSON.parse(text));},form.querySelector('button'));};
   $('#real-theme-export').onclick=()=>{const theme=window.GAMBIT.legacyPreferences?.theme||{version:1,name:'Gambit',site:{bg:'#070b0f',panel:'#11171c',accent:'#4ade80'},board:{light:'#e4ead1',dark:'#77945a'}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(theme,null,2)],{type:'application/json'}));a.download='gambit-theme.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
   $('#real-theme-catalog').onclick=()=>run(async()=>{const data=await A.get('/themes');G.createModal({title:'Catalogo temi',body:(data.themes||[]).map(t=>'<button class="btn" data-real-theme="'+G.esc(t.id)+'">'+G.esc(t.pack.name)+'</button>').join('')||empty('Nessun tema condiviso.')});document.querySelectorAll('[data-real-theme]').forEach(b=>b.onclick=()=>run(()=>importTheme(data.themes.find(t=>t.id===b.dataset.realTheme).pack)));});
  }
  applyLegacyTheme(window.GAMBIT.legacyPreferences?.theme);
  window.GambitRealtime.subscribe(async event=>{
   if(['friends','presence','ready','resync'].includes(event.type))G.refreshFriends().catch(()=>{});
   if(event.challenge)challengePopup(event.challenge);
   if(event.type==='challenge_accepted'&&event.game){const key='accepted:'+event.game.id;if(!challengeSeen.has(key)&&new URLSearchParams(location.search).get('game')!==event.game.id){challengeSeen.set(key,true);G.createModal({title:'Sfida accettata',body:'<a class="btn btn-primary" href="/play.html?game='+encodeURIComponent(event.game.id)+'">Entra in partita →</a>'});}}
   if(event.type==='chat'&&event.payload?.channel==='dm'){const other=event.payload.author===window.GambitSession.user?.id?event.payload.scope:event.payload.author;if(G.friends.some(f=>f.id===other))G.loadChat(other);}
   if(event.type==='notification'){try{const data=await A.get('/platform/notifications');window.GAMBIT.notifications=data.items.map(window.GambitAdapters.notification);G.renderHeader();}catch{}}
  });
  if(window.GambitSession.user&&!window.GambitSession.user.must_change_password)A.get('/challenges').then(data=>(data.challenges||[]).filter(c=>c.status==='pending').forEach(challengePopup)).catch(()=>{});
 }
 window.GambitIntegration={run,empty,piece,passwordDialog,friendDialog,sessionsDialog,shellReady,challengePopup,applyLegacyTheme,clearCustomTheme};
 document.addEventListener('auth:password-required',()=>{if(window.Gambit)passwordDialog(true);});
})();
