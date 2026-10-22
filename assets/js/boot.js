(function(){
 'use strict';
 const A=window.GambitAPI;
 window.GambitAdapters={
  friend(f){return {...f,handle:'@'+f.name,rating:f.ratings?.rapid?.rating||1200,status:f.online?'online':'offline',activity:f.online?'Online':'Offline',tone:'',flag:''};},
  notification(n){return {...n,id:String(n.id),text:n.title+(n.body?' · '+n.body:''),icon:({chat:'message',tournament:'trophy',puzzle:'puzzle',forum:'message',rematch:'sword'})[n.kind]||'bell',time:new Date(n.created*1000).toLocaleString(),unread:!n.read_at};}
 };
 function script(name){return new Promise((resolve,reject)=>{const el=document.createElement('script');el.src='/assets/js/'+name+'.js?v=gambit1';el.onload=resolve;el.onerror=()=>reject(Error('Impossibile caricare '+name));document.body.append(el);});}
 window.GambitReady=(async()=>{
  const config=await A.get('/platform/config');Object.assign(window.GambitConfig,config);
  let data;
  try{data=await A.get('/platform/bootstrap');}catch(error){if(error.passwordRequired){const me=await A.get('/me');data={user:me.user,features:config.FEATURE_FLAGS};}else throw error;}
  window.GambitSession.set(data.user||null);
  const p=data.profile||{},u=data.user;
  let preferences={...(data.legacy_preferences?{sound:data.legacy_preferences.sound,animations:data.legacy_preferences.animations}:{}),...(data.preferences||{})};
  if(u&&!u.must_change_password&&!p.ui_migration_version){
   let old={};try{old=JSON.parse(localStorage.getItem('gambit.settings')||'{}');}catch{}
   const allowed=['theme','boardTheme','sound','coordinates','animations','autoPromote','premoveMode'];const patch={migration_version:1};
   for(const key of allowed)if(key in old && !(key in preferences) && (typeof old[key]==='boolean'||typeof old[key]==='string'))patch[key]=old[key];
   try{const result=await A.patch('/platform/preferences',patch);preferences={...preferences,...result.preferences};}catch{}
  }
  for(const key of ['gambit.user','gambit.chats','gambit.addedFriends','gambit.puzzleProgress','gambit.customTournaments','gambit.joinedTournaments'])localStorage.removeItem(key);
  window.GAMBIT={currentUser:u?{...u,...p,name:p.display_name||u.name,username:u.name,handle:'@'+u.name,rating:u.ratings.rapid.rating,stats:{rapid:u.ratings.rapid.rating,blitz:u.ratings.blitz.rating,bullet:u.ratings.bullet.rating,puzzles:p.ratings?.puzzles?.rating||1200,games:p.games||0,wins:p.wins||0,draws:p.draws||0,losses:p.losses||0}}:null,profile:p,preferences,legacyPreferences:data.legacy_preferences,friends:(data.friends?.friends||[]).map(window.GambitAdapters.friend),requests:(data.friends?.incoming||[]).map(window.GambitAdapters.friend),outgoing:data.friends?.outgoing||[],notifications:(data.notifications||[]).map(window.GambitAdapters.notification),puzzles:[],courses:[],lessonRows:[],streams:[],broadcasts:[],tournaments:[],threads:[],leaderboard:[],recentGames:[],achievements:p.achievements||[],clubs:[],forumChat:[]};
  [window.BoardAudio,window.BoardTools]=await Promise.all([import('/game-effects.js'),import('/board-tools.js')]);
  window.ChessRules=(await import('/vendor/chess.js')).Chess;
  await script('engine');await script('app');await script('board');
  const page=document.body.dataset.page;
  if(u&&!u.must_change_password || page==='home'){
   await script(page==='home'?'home':page);
   await window.GambitPageReady;
  }else{
   const main=document.querySelector('main');
   if(main)main.innerHTML='<section class="card login-required"><h1>'+ (u?'Aggiorna la password':'Il tuo prossimo passo')+'</h1><p>'+(u?'Scegli una nuova password per continuare.':'Accedi per giocare, allenarti e ritrovare i tuoi amici.')+'</p><button class="btn btn-primary" data-action="auth">Accedi</button></section>';
  }
  document.body.dataset.ready='1';
  if(u?.must_change_password)window.GambitIntegration.passwordDialog(true);
  else if(u)window.GambitRealtime.start();
 })().catch(error=>{
  document.body.dataset.ready='1';const main=document.querySelector('main');if(main){main.replaceChildren();const box=document.createElement('section');box.className='card login-required';const title=document.createElement('h2');title.textContent='Impossibile caricare la pagina';const text=document.createElement('p');text.textContent=error.message;const retry=document.createElement('button');retry.className='btn btn-primary';retry.textContent='Riprova';retry.onclick=()=>location.reload();box.append(title,text,retry);main.append(box);}
 });
})();
