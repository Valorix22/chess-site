import { Chess } from '/vendor/chess.js';
import { projectQueue, canPremove, materialSummary, annotationPath } from '/board-tools.js?v=public1';
import { gameSounds, moveSound } from '/game-effects.js?v=samples1';
'use strict';
const $=s=>document.querySelector(s);
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const REVIEW_VERSION='review-2026-10-v3-nodes-tb4';
const labels={book:['Da manuale','▤'],brilliant:['Brillante','!!'],best:['Migliore','★'],excellent:['Eccellente','!'],good:['Buona','✓'],inaccuracy:['Imprecisione','?!'],mistake:['Errore','?'],blunder:['Grave errore','??']};
const bots=[{name:'Esploratore',elo:1320,desc:'Prendi confidenza',icon:'♟'},{name:'Stratega',elo:1600,desc:'Trova il tuo ritmo',icon:'♞'},{name:'Tattico',elo:2000,desc:'Alza il livello',icon:'♜'},{name:'Maestro',elo:2400,desc:'Mettiti alla prova',icon:'♛'}];
const state={rated:true,friendData:{friends:[],incoming:[],outgoing:[]},matchQueue:{queued:false},adminTab:'users',audit:null,adminStats:null,adminGames:[],logBefore:0,logFilter:{},premoveMode:localStorage.getItem('aura-premove-mode')||'multiple',user:null,view:'bot',game:null,elo:1600,color:'white',base:600,increment:5,flipped:false,selected:null,review:false,index:-1,showBest:false,pvIndex:-1,lobby:{games:[],rooms:[]},sound:true,mutating:false,online:false,setup:false,legacyName:null,invites:[],newInvite:null,authEpoch:0,authBusy:false,members:[],challenges:[],accounts:[],accountPage:1,accountPages:1,accountTotal:0,accountSearch:'',premoves:[],optimistic:null,unconfirmed:null,clockAt:performance.now(),live:false,syncing:true,animations:true,theme:null,themeLibrary:[]};
const initialHash=new URLSearchParams(location.hash.slice(1));
let pendingJoin=initialHash.get('join'),setupToken=initialHash.get('setup')||'',inviteToken=initialHash.get('invite')||'',refreshing=false,toastTimer;
if(initialHash.has('setup')||initialHash.has('invite')) history.replaceState(null,'',location.pathname+(pendingJoin?'#join='+pendingJoin:''));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labelStyle=l=>'--move-color:var(--'+l+')';
async function api(path,body){
 const requestAuthEpoch=state.authEpoch;
 const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Club':'1'},body:body===undefined?undefined:JSON.stringify(body)});
 let d;try{d=await r.json();}catch{throw Error('Il server non risponde. Riprova.');}
 if(!r.ok){let msg=typeof d.detail==='string'?d.detail:'Controlla i dati inseriti';if(r.status===401&&requestAuthEpoch===state.authEpoch&&!state.authBusy){state.user=null;renderProfile();}const err=Error(msg);err.status=r.status;throw err;}return d;
}
function toast(message,error=false){clearTimeout(toastTimer);const e=$('#toast');e.textContent=message;e.classList.toggle('error',error);e.hidden=false;toastTimer=setTimeout(()=>e.hidden=true,5000);}
function modal(html){$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();}
function ensureUser(){if(state.user)return true;showAuth();return false;}
function showAuth(mode){
 mode=mode||(setupToken?'register':'login');
 const setup=mode==='register'&&setupToken&&state.setup;
 const register=mode==='register';
 modal(`<div class="modal-mark">♞</div><h2>${setup?'Il tuo club inizia qui.':register?'Benvenuto al club.':'Bentornato al club.'}</h2><p>${setup?'Crea il tuo account amministratore. Poi potrai invitare i tuoi amici.':register?'Crea il tuo account gratuito. Ritrova partite e analisi su ogni dispositivo.':'Accedi per ritrovare le tue partite e sfidare gli amici.'}</p><div class="auth-tabs"><button class="quiet-btn ${!register?'selected':''}" data-action="auth-login">Accedi</button><button class="quiet-btn ${register?'selected':''}" data-action="auth-register">${setup?'Crea amministratore':'Registrati'}</button></div><form id="auth-form" data-mode="${mode}"><label class="field-label" for="account-name">NOME UTENTE</label><input id="account-name" name="username" minlength="3" maxlength="24" required autocomplete="username" value="${register?esc(state.legacyName||''):''}" placeholder="Il tuo nome nel club"><label class="field-label" for="account-password">PASSWORD</label><input id="account-password" name="password" type="password" minlength="${register?12:10}" maxlength="128" required autocomplete="${register?'new-password':'current-password'}" placeholder="${register?'Almeno 12 caratteri':'La tua password'}">${register?`<label class="field-label" for="password-confirm">CONFERMA PASSWORD</label><input id="password-confirm" type="password" minlength="12" maxlength="128" required autocomplete="new-password">`:''}<p class="form-error" id="form-error"></p><button class="primary-btn full" type="submit">${setup?'Crea il tuo club →':register?'Crea account →':'Accedi →'}</button></form><p class="helper"><a href="/privacy.html" target="_blank" rel="noopener">Privacy e sicurezza →</a></p>${state.legacyName&&register?'<p class="helper">Le partite della sessione ospite attuale verranno collegate al nuovo account.</p>':''}<p class="helper">${register?'La registrazione è aperta. Accessi e operazioni vengono registrati per 30 giorni e sono consultabili dagli amministratori.':'Non hai un account? Premi Registrati per entrare.'}</p>`);
}
function renderProfile(){$('#profile-name').textContent=state.user?.name||'Il tuo club';$('#profile-caption').textContent=state.user?(state.user.admin?'Amministratore del club':'Il tuo account'):'Accedi al tuo account';$('#avatar').textContent=state.user?state.user.name.slice(0,2).toUpperCase():'?';$('#invites-nav').hidden=!state.user?.admin;$('#friends-badge').hidden=!state.friendData.incoming.length;}
function setView(view){state.view=view;document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));$('#breadcrumb-current').textContent={play:'ONLINE',bot:'GIOCA',friend:'CON AMICI',archive:'LE TUE PARTITE',invites:'INVITI',accounts:'ACCOUNT',themes:'ASPETTO'}[view];const titles={play:'Trova il tuo prossimo avversario.',bot:'La prossima mossa è tua.',friend:'Le belle partite si condividono.',archive:'Ogni partita ha qualcosa da dirti.',invites:'Il club cresce con gli amici.',accounts:'Il tuo club, sotto controllo.',themes:'La tua scacchiera. Il tuo stile.'};const desc={play:'Ranked o unranked. La prossima partita inizia qui.',bot:'Un avversario alla tua altezza. Una nuova idea a ogni partita.',friend:'Scegli un amico, invia una sfida e ritrovatevi alla scacchiera.',archive:'Ripercorri le mosse, scopri le alternative, porta con te una nuova idea.',invites:'Invita chi vuoi alla tua prossima partita.',accounts:'Gestisci gli account e l’accesso al club.',themes:'Scegli colori, pezzi e atmosfera. Oppure importa il tuo tema.'};$('#page-title').textContent=titles[view];$('#page-description').textContent=desc[view];renderPanel();}
function settings(){return `<div class="settings-row"><div><label class="field-label" for="color-select">IL TUO COLORE</label><select id="color-select"><option value="white" ${state.color==='white'?'selected':''}>○ Bianco</option><option value="black" ${state.color==='black'?'selected':''}>● Nero</option><option value="random" ${state.color==='random'?'selected':''}>⇄ Casuale</option></select></div><div><label class="field-label" for="time-select">TEMPO DI GIOCO</label><select id="time-select">${[['Senza incremento',[[60,0,'1 minuto'],[180,0,'3 minuti'],[300,0,'5 minuti'],[600,0,'10 minuti'],[900,0,'15 minuti'],[1800,0,'30 minuti · Classica'],[2700,0,'45 minuti · Classica'],[3600,0,'60 minuti · Classica'],[5400,0,'90 minuti · Classica']]],['Con incremento',[[180,2,'3 + 2 · Blitz'],[300,3,'5 + 3 · Blitz'],[600,5,'10 + 5 · Rapid'],[900,10,'15 + 10 · Rapid']]],['Libera',[[0,0,'Senza orologio']]]].map(([group,options])=>`<optgroup label="${group}">${options.map(([base,inc,t])=>`<option value="${base}:${inc}" ${base===state.base&&inc===state.increment?'selected':''}>${t}</option>`).join('')}</optgroup>`).join('')}</select></div></div>${['friend','play'].includes(state.view)?ratedSettings():''}`;}
function tabs(active){return `<div class="panel-tabs"><button class="panel-tab ${active==='new'?'active':''}" data-action="panel-new">Nuova partita</button><button class="panel-tab ${active==='current'?'active':''}" data-action="panel-current" ${state.game?'':'disabled'}>${state.game?.status==='finished'?'Analisi':'In corso'}</button></div>`;}
function renderPanel(){
 if(state.view==='accounts'){renderAccounts();return;}
 if(state.view==='play'&&state.showOnline){renderOnline();return;}
 if(state.view==='themes'){renderThemes();return;}
 if(state.view==='friend'&&state.showFriends){renderFriends();return;}
 if(state.view==='invites'){renderInvites();return;}
 if(state.game&&state.view!=='archive'&&(state.game.status==='active'||state.game.status==='waiting'||state.review)){renderCurrent();return;}
 if(state.view==='play'){renderOnline();return;}
 if(state.view==='archive'){renderArchive();return;}
 if(state.view==='friend'){renderFriends();return;}
 $('#panel').innerHTML=tabs('new')+`<div class="panel-body"><h2>Trova il tuo avversario</h2><p class="subtle">Dalle prime mosse alle sfide più impegnative.</p><div class="section-label">PER COMINCIARE · LIVELLI FACILI</div><div class="beginner-levels">${[200,400,600,800,1000].map(elo=>`<button class="quiet-btn ${state.elo===elo?'active':''}" data-elo="${elo}" aria-label="Bot ${elo} Elo">${elo}<small>Elo</small></button>`).join('')}</div><div class="bot-list">${bots.map(b=>`<button class="bot-card ${state.elo===b.elo?'active':''}" data-elo="${b.elo}"><span class="bot-icon">${b.icon}</span><div><strong>${b.name}</strong><small>${b.desc}</small></div><span class="elo-tag">${b.elo} Elo</span></button>`).join('')}</div><div class="range-line"><label class="field-label" for="elo-range">OPPURE SCEGLI TU IL LIVELLO</label><strong id="elo-value">${state.elo} Elo</strong></div><input type="range" id="elo-range" min="200" max="3190" step="10" value="${state.elo}" aria-label="Livello Elo del bot"><div class="range-labels"><span>200 · Prime mosse</span><span>3190 · Esperto</span></div>${settings()}<button class="primary-btn full start-btn" data-action="create-bot">Gioca con Stockfish →</button><p class="helper">Elo indicativo, non un rating FIDE.<br>Sotto 1320, livelli simulati per principianti.</p></div>`;
}
async function loadInvites(){if(!state.user?.admin)return;state.invites=(await api('/invites')).invites;if(state.view==='invites')renderInvites();}
function renderInvites(){
 if(!state.user?.admin){$('#panel').innerHTML='<div class="panel-body"><h2>Inviti al club</h2><p class="subtle">Accedi come amministratore per gestire gli inviti.</p></div>';return;}
 const statuses={active:'Disponibile',used:'Usato',revoked:'Revocato',expired:'Scaduto'};
 $('#panel').innerHTML=`<div class="panel-body"><div class="eyebrow">IL TUO PICCOLO CLUB</div><h2>Un posto per gli amici</h2><p class="subtle">Crea un invito e condividi il link. Ogni invito vale per una persona e scade dopo sette giorni.</p><button class="primary-btn full start-btn" data-action="new-invite">Crea un invito →</button>${state.newInvite?`<div class="review-card"><label class="field-label" for="invite-link">IL NUOVO INVITO</label><div class="copy-row"><input id="invite-link" readonly value="${esc(location.origin+'/#invite='+state.newInvite.code)}"><button class="quiet-btn" data-action="copy-invite">Copia</button></div><p class="helper">Copia il link ora: viene mostrato solo alla creazione.<br>Valido fino al ${new Date(state.newInvite.expires*1000).toLocaleDateString('it-IT')}.</p></div>`:''}<div class="separator"></div><div class="section-label">INVITI RECENTI</div>${state.invites.length?state.invites.map(i=>`<div class="invite-item"><div><strong>${statuses[i.status]}</strong><small>${i.member?'Account: '+esc(i.member):'Creato il '+new Date(i.created*1000).toLocaleDateString('it-IT')}</small></div>${i.status==='active'?`<button class="quiet-btn" data-revoke="${i.id}">Revoca</button>`:''}</div>`).join(''):'<div class="empty-state"><div class="empty-icon">✉</div><p>Il prossimo membro del club aspetta il tuo invito.</p></div>'}</div>`;
}
function renderArchive(){
 const games=state.lobby.games;
 $('#panel').innerHTML=`<div class="panel-body"><h2>Le tue partite</h2><p class="subtle">Il tuo percorso, una mossa alla volta.</p>${!state.user?'<div class="empty-state"><div class="empty-icon">♙</div><strong>Il tuo spazio personale</strong><p>Accedi al tuo account per ritrovare le partite.</p><button class="primary-btn" data-action="guest">Entra al club</button></div>':!games.length?'<div class="empty-state"><div class="empty-icon">▤</div><strong>La prima storia è da scrivere</strong><p>Gioca una partita oppure importa un PGN.</p><button class="primary-btn" data-action="new-bot">Inizia una partita</button></div>':games.map(g=>`<button class="game-card" data-game="${esc(g.id)}"><span class="game-icon">${g.kind==='bot'?'♞':g.kind==='friend'?'♧':'▤'}</span><div><strong>${esc(g.white_name)} <span class="subtle">vs</span> ${esc(g.black_name)}</strong><small>${new Date(g.created*1000).toLocaleDateString('it-IT',{day:'numeric',month:'short'})} · ${g.status==='waiting'?'In attesa':g.status==='active'?'In corso':esc(g.reason)}${g.analysis_status==='done'?' · Analizzata':''}</small></div><span class="result">${g.result==='*'?'→':esc(g.result)}</span></button>`).join('')}</div>`;
}
function moveList(g){let html='<div class="move-list">';for(let i=0;i<g.history.length;i+=2){html+=`<span class="move-number">${i/2+1}.</span>`;for(let j=i;j<i+2;j++){const m=g.history[j],a=g.analysis?.[j];html+=m?`<button class="move-cell ${(state.review?state.index:g.history.length-1)===j?'active':''}" data-ply="${j}"><span>${esc(m.san)}</span>${a?`<span class="move-label" style="${labelStyle(a.label)}" title="${labels[a.label][0]}">${labels[a.label][1]}</span>`:''}</button>`:'<span></span>';}}return html+'</div>';}
function renderCurrent(){
 const g=state.game;
 let html=tabs('current')+'<div class="panel-body">';
 if(g.status==='waiting'){
 html+=`<div class="eyebrow">LA STANZA È PRONTA</div><h2>Invita il tuo avversario</h2><p class="subtle">Condividi questo link. Il tuo amico accede al proprio account e prende il posto libero.</p><div class="friend-illustration"><span>♔</span><small>↔</small><span>♚</span></div><label class="field-label" for="room-link">LINK DELLA PARTITA</label><div class="copy-row"><input id="room-link" readonly value="${esc(location.origin+'/#join='+g.id)}"><button class="quiet-btn" data-action="copy-room">Copia</button></div><p class="helper">Tieni aperta questa pagina: la partita partirà quando il tuo amico entrerà.</p>`;
 }else if(g.status==='active'){
 html+=`<div class="eyebrow">${g.kind==='bot'?'SFIDA STOCKFISH':g.rated?'RANKED · '+poolNames[g.rating_pool]:'UNRANKED'}</div><h2>${state.review?'La partita continua.':g.turn===g.color?'Tocca a te.':'La mossa dell’avversario.'}</h2><p class="subtle">${state.review?'Torna live per muovere. Le premosse già preparate restano attive.':g.bot_busy&&g.turn!==g.color?'Stockfish sta pensando…':'Seleziona un pezzo e poi la casa di destinazione.'}</p>${g.bot_error?`<p class="form-error">${esc(g.bot_error)}</p><button class="quiet-btn" data-action="retry-bot">Riprova</button>`:''}${g.draw_offer?`<p class="subtle">${g.draw_offer===state.user?.id?'Hai proposto patta.':'Il tuo amico propone patta.'}</p>`:''}<div class="separator"></div><div class="section-label">MOSSE DELLA PARTITA</div>${g.history.length?moveList(g):'<div class="empty-state"><div class="empty-icon">♙</div><p>Ogni partita comincia da una prima mossa.</p></div>'}<div class="separator"></div><p class="subtle">A fine partita troverai le valutazioni, le mosse migliori e le varianti spiegate.</p>`;
 }else{
 html+=`<div class="eyebrow">${esc(g.reason).toUpperCase()}${g.rated?' · RANKED':''}</div><h2>${esc(g.result==='*'?'Partita archiviata':g.result)}</h2>`;
 if(g.rating_change)html+=`<div class="rating-result">${[['white',g.white_name],['black',g.black_name]].map(([side,name])=>{const r=g.rating_change[side];return `<div><small>${esc(name)}</small><strong>${r.after} <span class="${r.delta>=0?'rating-up':'rating-down'}">${r.delta>=0?'+':''}${r.delta}</span></strong></div>`;}).join('')}</div>`;
 const a=g.analysis||[],done=g.analysis_status==='done';
 if(!a.length&&g.analysis_status!=='running'&&g.analysis_status!=='error')html+=`<p class="subtle">Scopri cosa ha funzionato e dove c’era una possibilità migliore.</p><label class="field-label" for="analysis-mode">TIPO DI ANALISI</label><select id="analysis-mode"><option value="quick">Rapida · consigliata</option><option value="deep">Approfondita · più tempo di ricerca</option></select><button class="primary-btn full start-btn" data-action="analyse" ${g.history.length?'':'disabled'}>Analizza con Stockfish →</button><p class="helper">Stockfish a forza piena, aperture riconosciute e giudizi sensibili alla posizione.</p>`;
 if(g.analysis_status==='running')html+=`<p class="subtle loading">Stockfish sta rivedendo la partita… ${a.length}/${g.history.length} mosse</p><div class="progress-track"><div class="progress-fill" style="width:${100*a.length/g.history.length}%"></div></div><button class="quiet-btn full" data-action="cancel-review">Interrompi analisi</button>`;
 if(g.analysis_status==='error')html+=`<p class="form-error">${esc(g.analysis_error)}</p><button class="quiet-btn" data-action="analyse">Riprendi analisi</button>`;
 if(a.length){
 const summary=g.analysis_summary;
 if(summary)html+=`<div class="accuracy-cards" aria-label="Accuratezza dei giocatori">${[['white','Bianco',g.white_name],['black','Nero',g.black_name]].map(([side,color,name])=>`<div><small>${color} · ${esc(name)}</small><strong>${summary[side].accuracy===null?'—':summary[side].accuracy.toFixed(1)+'%'}</strong><span>Accuratezza media${done?'':' parziale'}</span></div>`).join('')}</div>`;
 if(done)html+=`<p class="analysis-meta">${g.analysis_version===REVIEW_VERSION?(g.analysis_mode==='deep'?'Analisi approfondita':'Analisi rapida')+' · '+Number(g.analysis_elapsed||0).toFixed(1)+' s':'Analisi precedente · nuovi criteri disponibili'}</p>${g.analysis_version!==REVIEW_VERSION?'<button class="quiet-btn full" data-action="reanalyse">Ricalcola con i nuovi criteri →</button>':g.analysis_mode!=='deep'?'<button class="quiet-btn full" data-action="deepen">Approfondisci con Stockfish →</button>':''}`;
 html+=`<div class="range-line"><span class="section-label">LE TUE MOSSE${done?'':' · ANALISI IN CORSO'}</span><button class="icon-btn" data-action="methodology" title="Criteri dell’analisi" aria-label="Criteri dell’analisi">i</button></div><div class="analysis-stats">${Object.entries(labels).map(([key,[name,symbol]])=>`<div class="stat" style="${labelStyle(key)}"><span class="stat-dot"></span>${name}<strong>${a.filter(x=>x.label===key&&(g.kind==='import'||x.color===g.color)).length}</strong></div>`).join('')}</div>`;
 const row=a[state.index];
 if(row){const val=row.mate===null?(Math.abs(row.cp)>=19000?(row.cp>0?'Vince il Bianco':'Vince il Nero'):(row.cp>=0?'+':'')+(row.cp/100).toFixed(2)):'#'+row.mate;html+=`<div class="review-card"><h3><span>${Math.floor(state.index/2)+1}${row.color?'.':'…'} ${esc(row.san)}</span><span class="eval-value">${esc(val)}</span></h3><div class="label-badge" style="${labelStyle(row.label)}">${labels[row.label][1]} ${labels[row.label][0]} · ${row.depth} ply</div><p class="subtle">${row.win_loss!==undefined?`Impatto stimato: −${row.win_loss.toFixed(1)} punti di probabilità.${row.forced?' Unica mossa legale: esclusa dall’accuratezza.':''}`:row.loss>=10000?'Differenza nella sequenza di matto.':`Perdita stimata: ${(row.loss/100).toFixed(2)} pedoni.`}</p>${row.wdl?`<details class="wdl-detail"><summary>Valutazione Stockfish · vittoria / patta / sconfitta</summary><p>Bianco: ${(row.wdl.wins/10).toFixed(1)}% / ${(row.wdl.draws/10).toFixed(1)}% / ${(row.wdl.losses/10).toFixed(1)}%. Modello di autogioco del motore, distinto dall’accuratezza e dal tuo Elo.</p><p>${row.tablebase?'Finale verificato con Syzygy 3–4 pezzi · ':''}${(row.nodes||0).toLocaleString('it-IT')} nodi · ${row.complete?'Budget di ricerca completato':'Ricerca fermata dal limite di tempo: approfondisci per verificarla'}</p></details>`:''}${row.label==='book'&&row.opening?`<p class="opening-name">▤ ${esc(row.opening.eco)} · ${esc(row.opening.name)}</p>`:''}<button class="quiet-btn full" data-action="best">${state.showBest?'Torna alla mossa giocata':'Mostra e spiega '+esc(row.best_san)+' →'}</button>${state.showBest?`<div class="review-explanation"><p>${esc(row.explanation)}</p></div><div class="pv">${row.pv.map((san,i)=>`<button data-pv="${i}" class="${state.pvIndex===i?'active':''}">${esc(san)}</button>`).join('')}</div>`:''}</div>`;}
 }
 if(g.history.length)html+=`<div class="section-label">RIPERCORRI LA PARTITA</div>${moveList(g)}`;
 html+=`<div class="separator"></div><button class="quiet-btn full" data-action="new-game">Un’altra partita →</button>`;
 }
 $('#panel').innerHTML=html+'</div>';
 const list=$('#panel .move-list'),active=list?.querySelector('.move-cell.active');if(active){const row=active.getBoundingClientRect(),box=list.getBoundingClientRect();list.scrollTop+=row.top-box.top-list.clientHeight/2+row.height/2;}
}
async function startAnalysis(mode='quick',force=false){await api('/games/'+state.game.id+'/analysis',{mode,force});state.review=true;state.index=0;state.showBest=false;state.pvIndex=-1;acceptGame(await api('/games/'+state.game.id));}
function fenMap(fen){let map={};fen.split(' ')[0].split('/').forEach((row,r)=>{let f=0;for(const c of row){if(/\d/.test(c))f+=Number(c);else{map['abcdefgh'[f]+(8-r)]=c;f++;}}});return map;}
function pieceName(c){const names={k:'re',q:'donna',r:'torre',b:'alfiere',n:'cavallo',p:'pedone'};return names[c.toLowerCase()]+' '+(c===c.toUpperCase()?'bianco':'nero');}
function boardFen(){const g=state.game;if(!g)return START;if(!state.review)return state.optimistic?.fen||g.fen;const row=g.analysis?.[state.index];if(state.showBest&&row)return state.pvIndex>=0?row.pv_fens[state.pvIndex]:row.before_fen;return state.index<0?g.initial_fen:g.history[state.index]?.fen||g.fen;}
function coord(square){let x='abcdefgh'.indexOf(square[0]),y=8-Number(square[1]);if(state.flipped){x=7-x;y=7-y;}return [x*100+50,y*100+50];}
function formatClock(value,base){if(!base)return '∞';if(value<10){const v=Math.max(0,value);return '0:'+String(Math.floor(v)).padStart(2,'0')+'.'+Math.floor((v%1)*10);}const secs=Math.max(0,Math.ceil(value));return Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0');}
function renderPlayers(){const g=state.game,color=state.flipped?false:true;const names=g?{true:g.white_name,false:g.black_name}:{true:state.user?.name||'Tu',false:'Stockfish'};$('#opponent-name').textContent=names[!color];$('#you-name').textContent=names[color];$('#opponent-detail').textContent=g?(!color?'Bianco':'Nero')+' · '+(g.kind==='bot'&&(!color!==g.color)?'Motore Stockfish':'Giocatore'):'Scegli il tuo avversario';$('#you-detail').textContent=g?(color?'Bianco':'Nero')+' · '+(color===g.color?'il tuo lato':'avversario'):'Bianco · pronto a giocare';$('#you-avatar').textContent=(names[color]||'TU').slice(0,2).toUpperCase();$('#opponent-avatar').textContent=g?.kind==='friend'?(names[!color]||'?').slice(0,2).toUpperCase():'♞';if(g?.kind==='friend'){const top=(!color?g.white_rating:g.black_rating),bottom=(color?g.white_rating:g.black_rating);if(top!==null)$('#opponent-detail').textContent+=' · '+top+' Elo';if(bottom!==null)$('#you-detail').textContent+=' · '+bottom+' Elo';}const clocks=currentClocks();for(const [selector,c]of [['#top-clock',!color],['#bottom-clock',color]]){const e=$(selector);e.textContent=formatClock(clocks[Number(c)],g?.base??state.base);e.classList.toggle('running',!!g&&g.status==='active'&&g.turn===c);e.classList.toggle('low',!!g?.base&&clocks[Number(c)]<30);}
 let status=g?g.status==='waiting'?'In attesa del tuo amico':g.status==='finished'?g.reason:g.bot_busy&&g.turn!==g.color?'Stockfish sta pensando…':g.turn===g.color?'Tocca a te':'Tocca all’avversario':'La scacchiera ti aspetta';if(state.review)status='Revisione della partita';$('#game-status').textContent=state.optimistic?'Mossa inviata…':status;
 $('#game-actions').innerHTML=g?.status==='active'&&typeof g.color==='boolean'?`<button class="quiet-btn" data-action="draw">${g.draw_offer&&g.draw_offer!==state.user?.id?'Accetta patta':'Proponi / reclama patta'}</button><button class="quiet-btn" data-action="resign">Abbandona</button>`:g?.status==='waiting'?'<button class="quiet-btn" data-action="resign">Annulla stanza</button>':'';
 const shownIndex=state.review?state.index:(g?.history.length||0)-1;
 $('#review-controls').hidden=!g||!['active','finished'].includes(g.status);
 if(g){
  $('#review-position').textContent=shownIndex<0?'Posizione iniziale':`${Math.floor(shownIndex/2)+1}${shownIndex%2===0?'.':'…'} ${g.history[shownIndex]?.san||''}`;
  $('#review-prev').disabled=$('#review-first').disabled=shownIndex<0;
  $('#review-next').disabled=$('#review-last').disabled=shownIndex>=g.history.length-1;
 }
 const browsing=!!g&&g.status==='active'&&state.review,unseen=g?g.history.length-1-shownIndex:0;
 $('#history-banner').hidden=!browsing;$('#history-caption').textContent=unseen>0?`${unseen} moss${unseen===1?'a':'e'} alla posizione live · gli orologi continuano`:'Stai rivedendo la partita';
 $('#review-live').hidden=!g||g.status!=='active';$('#review-live').disabled=!browsing;$('#review-live').textContent=browsing?'Torna live'+(unseen>0?' · '+unseen:''):'● Live';
 if(browsing)$('#game-status').textContent='Stai rivedendo una posizione precedente';
 renderMaterial();
 $('#download-button').disabled=!g;}
function renderAll(){renderProfile();renderBoard();renderPlayers();renderSoundControl();renderPanel();}
const soundEvents=new Map();
function playGameSound(key,kind){
 if(soundEvents.has(key))return;soundEvents.set(key,true);
 if(soundEvents.size>256)soundEvents.delete(soundEvents.keys().next().value);
 if(state.sound)gameSounds.play(kind);
}
function soundForMove(gid,ply,san,options){playGameSound(gid+':move:'+ply,moveSound(san,options));}
function renderSoundControl(){
 const button=$('#sound-button');button.innerHTML=state.sound?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>';
 button.style.color=state.sound?'var(--accent)':'';button.setAttribute('aria-pressed',String(state.sound));button.title=state.sound?'Disattiva suoni':'Attiva suoni';button.setAttribute('aria-label',button.title);if($('#sounds-toggle'))$('#sounds-toggle').checked=state.sound;
}
function setSound(enabled){state.sound=enabled;if(enabled)gameSounds.unlock();else gameSounds.stop();renderSoundControl();persistPreferences();}
for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{if(state.sound)gameSounds.unlock();},{capture:true});
function acceptGame(g){
 const before=state.game;
 if(before?.id===g.id&&((g.revision||0)<(before.revision||0)||(g.ply<before.ply)))return;
 if(g.analysis_count!==undefined){
  const sameRun=before?.id===g.id&&before.analysis_run===g.analysis_run;
  const rows=sameRun&&(g.analysis_count>=(before.analysis||[]).length)?(before.analysis||[]).slice():[];
  for(const row of g.analysis_batch||(g.analysis_append?[g.analysis_append]:[]))if(row.index===rows.length)rows.push(row);
  g.analysis=rows;
  if(g.analysis_count>rows.length&&!resyncing){resyncing=true;api('/games/'+g.id).then(fresh=>{if(state.game?.id===g.id)acceptGame(fresh);}).catch(()=>{}).finally(()=>resyncing=false);}
 }
 const changed=before?.fen!==g.fen,browsing=before?.id===g.id&&state.review;
 if(before?.id!==g.id){state.premoves=[];state.optimistic=null;state.unconfirmed=null;state.selected=null;}
 const pending=state.unconfirmed;
 if(pending?.id===g.id){
  if(g.history[pending.ply]?.uci===pending.uci)state.unconfirmed=null;
  else if(g.ply===pending.ply&&g.status==='active'&&g.turn===g.color&&g.legal.includes(pending.uci)){state.optimistic=null;state.premoves.unshift(pending.uci);state.unconfirmed=null;}
  else if(g.ply>=pending.ply){state.optimistic=null;state.premoves=[];state.unconfirmed=null;toast('La posizione è cambiata. Controlla la mossa prima di riprovare.',true);}
 }
 if(state.optimistic&&g.ply>=state.optimistic.ply)state.optimistic=null;
 state.game=g;state.clockAt=performance.now();
 if(changed&&!dragState)state.selected=null;
 if(before?.id===g.id){
  if(g.ply===before.ply+1)soundForMove(g.id,g.ply,g.history.at(-1).san,{opponent:g.turn===g.color});
  if(before.status==='waiting'&&g.status==='active')playGameSound(g.id+':start','start');
  if(before.status==='active'&&g.status==='finished'&&g.result!=='*'){
   const won=g.color===true&&g.result==='1-0'||g.color===false&&g.result==='0-1';
   playGameSound(g.id+':end',new Chess(g.fen).isCheckmate()?'end':g.result==='1/2-1/2'?'draw':won?'win':'loss');
  }
 }
 if(g.color===null){state.review=true;state.premoves=[];}
 if(g.status==='finished'){state.premoves=[];state.optimistic=null;state.review=true;if((before?.id!==g.id||before.status!=='finished')&&!browsing)state.index=g.analysis?.length?0:g.history.length-1;}
 if(!state.review)state.index=g.history.length-1;
 if(state.index>=g.history.length)state.index=g.history.length-1;
 renderBoard();renderPlayers();if(!['themes','accounts'].includes(state.view)&&!(state.view==='friend'&&state.showFriends))renderPanel();queueMicrotask(runPremoves);
}
async function createGame(kind){if(!ensureUser())return;state.showFriends=false;readSettings();const g=await api('/games',{kind,elo:state.elo,color:state.color,base:state.base,increment:state.increment,rated:kind==='friend'&&state.rated});state.review=false;state.showBest=false;state.flipped=g.color===false;acceptGame(g);if(g.status==='active')playGameSound(g.id+':start','start');await loadLobby();if(kind==='friend')history.replaceState(null,'',location.pathname+'#join='+g.id);}
function readSettings(){if($('#color-select'))state.color=$('#color-select').value;if($('#time-select'))[state.base,state.increment]=$('#time-select').value.split(':').map(Number);if($('#rated-select'))state.rated=$('#rated-select').value==='1';}
async function loadLobby(){if(!state.user)return;state.lobby=await api('/lobby');if(state.view==='archive')renderArchive();}
async function joinGame(id){if(!/^[A-Za-z0-9_-]{10,30}$/.test(id))throw Error('Link della partita non valido');pendingJoin=id;if(!ensureUser())return;const g=await api('/games/'+id+'/join',{});pendingJoin=null;state.showFriends=false;state.view='friend';state.review=false;state.showBest=false;state.flipped=g.color===false;acceptGame(g);setView('friend');await loadLobby();history.replaceState(null,'',location.pathname+'#join='+id);}
async function makeMove(uci,{premove=false}={}){
 if(state.mutating||!state.game||typeof state.game.color!=='boolean')return;
 const g=state.game,gid=g.id;
 let chess,move;
 try{chess=new Chess(g.fen);move=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});}catch{return clearPremoves('Mossa non più disponibile');}
 state.mutating=true;state.selected=null;state.optimistic={fen:chess.fen(),ply:g.ply+1,uci,san:move.san};renderBoard();renderPlayers();soundForMove(gid,g.ply+1,move.san,{premove});
 try{const next=await api('/games/'+gid+'/move',{uci,expected_ply:g.ply,premove});if(state.game?.id===gid)acceptGame(next);}
 catch(err){
  if(state.game?.id===gid){
   if(state.game.history[g.ply]?.uci===uci){/* The live stream has already confirmed this move. */}
   else if(!err.status||err.status>=500){
    state.unconfirmed={id:gid,ply:g.ply,uci};disconnectLive();if(navigator.onLine)connectLive();toast('Connessione interrotta: recupero la posizione e le premosse.');
   }else{state.optimistic=null;state.premoves=[];try{acceptGame(await api('/games/'+gid));}catch{}toast(err.message,true);}
   renderAll();
  }
 }
 finally{state.mutating=false;queueMicrotask(runPremoves);}
}
async function squareClick(sq){
 const g=state.game;if(!g||typeof g.color!=='boolean'||state.review||g.status!=='active')return;
 const map=projectedMap();
 if(state.selected===sq&&state.premoves.some(m=>m.slice(2,4)===sq)){clearPremoves();return;}
 if(state.premoveMode==='off'&&g.turn!==g.color)return;
 if(state.selected&&state.selected!==sq){
  const from=state.selected,queue=state.mutating||g.turn!==g.color||state.premoves.length>0||!state.live||state.syncing;
  if(queue){if(pseudoLegal(map,from,sq,g.color)){
   if(map[from]?.toLowerCase()==='p'&&['1','8'].includes(sq[1])){showPremovePromotion(from,sq);return;}
   enqueuePremove(from,sq);return;
  }}
  else{
   const candidates=g.legal.filter(m=>m.startsWith(from+sq));
   if(candidates.length>1){modal(`<h2>Scegli la promozione</h2><div class="promotion-grid">${candidates.map(m=>`<button data-promotion="${m}" aria-label="Promuovi a ${pieceName(g.color?m[4].toUpperCase():m[4])}"><img alt="" src="/pieces/${g.color?'w':'b'}${m[4].toUpperCase()}.svg"></button>`).join('')}</div>`);return;}
   if(candidates.length===1){await makeMove(candidates[0]);return;}
  }
 }
 const p=map[sq];if(state.selected&&state.selected!==sq&&(!p||(p===p.toUpperCase())!==g.color)&&state.sound)gameSounds.play('illegal');state.selected=p&&((p===p.toUpperCase())===g.color)?sq:null;renderBoard();
}
function selectReview(index){
 if(!state.game)return;const g=state.game;state.index=Math.max(-1,Math.min(g.history.length-1,index));
 state.review=g.status==='finished'||state.index<g.history.length-1;state.showBest=false;state.pvIndex=-1;state.selected=null;renderAll();
}
function returnToLive(){if(!state.game)return;selectReview(state.game.history.length-1);queueMicrotask(runPremoves);}
function showPremovePromotion(from,to){modal(`<h2>Promozione della premossa</h2><p>Scegli il pezzo da preparare.</p><div class="promotion-grid">${['q','r','b','n'].map(p=>`<button data-premove-promotion="${from+to+p}" data-premove-game="${state.game.id}" aria-label="Prepara promozione a ${pieceName(state.game.color?p.toUpperCase():p)}"><img alt="" src="/pieces/${state.game.color?'w':'b'}${p.toUpperCase()}.svg"></button>`).join('')}</div>`);}
function enqueuePremove(from,to,promotion=''){
 const g=state.game;if(!g||g.status!=='active'||state.review)return;
 if(!pseudoLegal(projectedMap(),from,to,g.color))return toast('La premossa non è più disponibile.',true);
 const uci=from+to+promotion;
 if(!state.mutating&&state.live&&!state.syncing&&g.turn===g.color&&!state.premoves.length){if(g.legal.includes(uci))makeMove(uci);else toast('Questa mossa non è legale nella posizione attuale.',true);return;}
 if(state.premoveMode==='off')return;
 if(state.premoves.length>=(state.premoveMode==='single'?1:5))return toast(state.premoveMode==='single'?'È già pronta una premossa.':'Puoi preparare fino a 5 premosse.');
 state.premoves.push(uci);state.selected=null;renderBoard();
}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Link copiato. Puoi condividerlo con il tuo amico.');}catch{const input=$('#invite-link')||$('#room-link')||$('#copy-link');if(input){input.select();document.execCommand('copy');toast('Link selezionato: copialo e condividilo.');}}}
const actions={
 'guest':()=>showAuth(),
 'auth-login':()=>showAuth('login'),
 'auth-register':()=>showAuth('register'),
 'new-invite':async()=>{state.newInvite=await api('/invites',{});await loadInvites();},
 'copy-invite':()=>copy(location.origin+'/#invite='+state.newInvite.code),
 'manage-invites':async()=>{closeModal();setView('accounts');await loadAccounts();},
 'logout':async()=>{disconnectLive();await api('/logout',{});state.user=null;resetPrivateState();state.game=null;state.review=false;state.lobby={games:[],rooms:[]};state.invites=[];state.newInvite=null;state.premoves=[];state.optimistic=null;state.unconfirmed=null;closeModal();setView('bot');renderAll();toast('Sei uscito dal tuo account.');},
 'password-form':()=>modal(`<h2>Cambia password</h2><p>Gli altri dispositivi verranno disconnessi. Le partite restano nel tuo account.</p><form id="password-form"><label class="field-label" for="current-password">PASSWORD ATTUALE</label><input id="current-password" type="password" required autocomplete="current-password" maxlength="128"><label class="field-label" for="new-password">NUOVA PASSWORD</label><input id="new-password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"><label class="field-label" for="new-confirm">CONFERMA NUOVA PASSWORD</label><input id="new-confirm" type="password" required minlength="12" maxlength="128" autocomplete="new-password"><p class="form-error" id="form-error"></p><button class="primary-btn full" type="submit">Salva password</button></form>`),
 'create-bot':()=>createGame('bot'),
 'create-friend':()=>createGame('friend'),
 'copy-room':()=>copy(location.origin+'/#join='+state.game.id),
 'join-link':()=>{const text=$('#join-link').value.trim();let id;try{id=new URL(text,location.origin).hash.slice(1);id=new URLSearchParams(id).get('join');}catch{}if(!id)throw Error('Incolla il link completo della partita');return joinGame(id);},
 'new-bot':()=>newGame('bot'),
 'new-game':()=>newGame(state.game?.kind==='friend'?'friend':'bot'),
 'panel-new':()=>{if(state.game&&['active','waiting'].includes(state.game.status)){modal('<h2>Hai una partita aperta</h2><p>La partita rimane nell’archivio. Vuoi aprire una nuova scacchiera?</p><button class="primary-btn full" data-action="keep-and-new">Apri una nuova scacchiera</button>');}else newGame(state.view==='friend'?'friend':'bot');},
 'keep-and-new':()=>{closeModal();newGame(state.view==='friend'?'friend':'bot');},
 'panel-current':()=>{state.showFriends=false;returnToLive();},
 'return-live':()=>returnToLive(),
 'clear-annotations':()=>clearAnnotations(),
 'resign':()=>modal(`<h2>${state.game.status==='waiting'?'Annullare la stanza?':'Abbandonare la partita?'}</h2><p>${state.game.status==='waiting'?'Il link non permetterà più di entrare.':'La partita finirà con la vittoria dell’avversario. Potrai comunque rivederla.'}</p><button class="primary-btn full" data-action="confirm-resign">${state.game.status==='waiting'?'Annulla stanza':'Abbandona'}</button>`),
 'confirm-resign':async()=>{closeModal();acceptGame(await api('/games/'+state.game.id+'/resign',{}));await loadLobby();},
 'draw':async()=>{acceptGame(await api('/games/'+state.game.id+'/draw',{}));toast(state.game.status==='finished'?'Partita patta.':'Proposta di patta inviata.');},
 'retry-bot':()=>api('/games/'+state.game.id+'/retry-bot',{}),
 'analyse':()=>startAnalysis($('#analysis-mode')?.value||state.game.analysis_mode||'quick'),
 'reanalyse':()=>startAnalysis('quick',true),
 'deepen':()=>startAnalysis('deep'),
 'best':()=>{state.showBest=!state.showBest;state.pvIndex=-1;renderAll();},
 'methodology':()=>modal(`<h2>Leggere le mosse</h2><p>Il giudizio considera quanto cambia la probabilità di vittoria stimata, non soltanto quanti centesimi di pedone si perdono. Così una piccola differenza in una posizione già vinta o persa pesa meno. L’accuratezza è una stima da 0 a 100, distinta dall’Elo.</p><p>“Da manuale” riconosce mosse presenti nel repertorio di aperture Lichess. Un errore grave non diventa una buona mossa perché compare nel repertorio. “Brillante” indica un sacrificio di materiale corretto nella variante trovata: è una stima del sito.</p><p>La modalità rapida approfondisce i casi critici; quella approfondita dedica più ricerca a tutte le posizioni. Profondità e varianti restano consultabili. I risultati già calcolati si riutilizzano automaticamente.</p><a href="/about.html" target="_blank" rel="noopener">Criteri, soglie e fonti →</a>`)
};
function newGame(view){state.premoves=[];state.optimistic=null;state.unconfirmed=null;state.game=null;state.review=false;state.selected=null;state.showBest=false;state.flipped=false;history.replaceState(null,'',location.pathname);setView(view);renderAll();}
document.addEventListener('click',async e=>{const el=e.target.closest('button');if(!el||el.disabled)return;try{if(el.dataset.nav){if(el.dataset.nav==='play')state.showOnline=true;state.showFriends=el.dataset.nav==='friend';setView(el.dataset.nav);if(el.dataset.nav==='archive')await loadLobby();if(el.dataset.nav==='invites')await loadInvites();if(el.dataset.nav==='accounts')await loadAdminTab();if(el.dataset.nav==='play'&&state.user){state.matchQueue=await api('/matchmaking');renderPanel();}if(el.dataset.nav==='friend')await loadSocial();if(el.dataset.nav==='themes')await loadThemeLibrary();}else if(el.dataset.revoke){await api('/invites/'+el.dataset.revoke+'/revoke',{});await loadInvites();toast('Invito revocato.');}else if(el.dataset.elo){readSettings();state.elo=Number(el.dataset.elo);renderPanel();}else if(el.dataset.square){if(performance.now()>suppressClickUntil)await squareClick(el.dataset.square);}else if(el.dataset.ply){selectReview(Number(el.dataset.ply));}else if(el.dataset.pv){state.pvIndex=Number(el.dataset.pv);renderAll();}else if(el.dataset.game){const g=await api('/games/'+el.dataset.game);state.showFriends=false;state.flipped=g.color===false;state.review=g.status==='finished'||g.color===null;state.showBest=false;state.index=g.analysis?.length?0:g.history.length-1;acceptGame(g);setView(g.kind==='friend'?'friend':'bot');}else if(el.dataset.premovePromotion){const u=el.dataset.premovePromotion;closeModal();if(el.dataset.premoveGame!==state.game?.id)return;enqueuePremove(u.slice(0,2),u.slice(2,4),u[4]);}else if(el.dataset.trimPremoves!==undefined){state.premoves.splice(Number(el.dataset.trimPremoves));state.selected=null;renderBoard();}else if(el.dataset.promotion){const move=el.dataset.promotion;closeModal();await makeMove(move);}else if(el.dataset.action&&actions[el.dataset.action]){await actions[el.dataset.action]();}}catch(err){toast(err.message,true);}});
document.addEventListener('input',e=>{if(e.target.id==='elo-range'){state.elo=Number(e.target.value);$('#elo-value').textContent=state.elo+' Elo';document.querySelectorAll('[data-elo]').forEach(b=>b.classList.toggle('active',Number(b.dataset.elo)===state.elo));}});
document.addEventListener('change',e=>{if(['time-select','color-select'].includes(e.target.id)){readSettings();if(!state.game)renderPlayers();}});
document.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.target,button=form.querySelector('button[type=submit]');if(button)button.disabled=true;const authForm=['auth-form','password-form'].includes(form.id);if(authForm){state.authEpoch++;state.authBusy=true;}
 try{
 if(form.id==='auth-form'){
  const mode=form.dataset.mode,password=$('#account-password').value;
  if(mode==='register'&&password!==$('#password-confirm').value)throw Error('Le password non coincidono');
  let invite=$('#invite-code')?.value.trim()||inviteToken;
  if(invite.includes('#')){try{invite=new URLSearchParams(new URL(invite).hash.slice(1)).get('invite')||'';}catch{throw Error('Link d’invito non valido');}}
  const result=await api('/'+mode,{name:$('#account-name').value,password,invite,setup_token:setupToken});
  setupToken='';inviteToken='';const me=await api('/me');state.user=me.user;state.setup=me.setup;state.legacyName=null;state.game=null;state.review=false;closeModal();renderAll();if(mustChangePassword())return;connectLive();await loadPreferences();await loadLobby();await loadSocial();if(mustChangePassword())return;if(pendingJoin)await joinGame(pendingJoin);else toast(result.migrated?'Account creato: le tue partite sono state conservate.':mode==='register'?'Account creato. Benvenuto al club!':'Accesso effettuato.');
 }else if(form.id==='password-form'){
  if($('#new-password').value!==$('#new-confirm').value)throw Error('Le password non coincidono');
  await api('/password',{current_password:$('#current-password').value,new_password:$('#new-password').value});await refreshIdentity();connectLive();closeModal();await loadSocial();toast('Password aggiornata. Gli altri dispositivi sono stati disconnessi.');
 }else if(form.id==='import-form'){
  const g=await api('/import',{pgn:$('#pgn-input').value});closeModal();state.review=true;state.showBest=false;state.flipped=false;acceptGame(g);setView('bot');await loadLobby();
 }
 }catch(err){const error=$('#form-error');if(error)error.textContent=err.message;else toast(err.message,true);}finally{if(button)button.disabled=false;if(authForm){state.authEpoch++;state.authBusy=false;}}
});
$('#modal-close').addEventListener('click',closeModal);
$('#flip-button').addEventListener('click',()=>{state.flipped=!state.flipped;renderBoard();renderPlayers();});
$('#sound-button').addEventListener('click',()=>{setSound(!state.sound);toast(state.sound?'Suoni attivati':'Suoni disattivati');if(state.sound)gameSounds.play('move');});
$('#download-button').addEventListener('click',async()=>{if(!state.game)return;try{const r=await fetch('/api/games/'+state.game.id+'/pgn');if(!r.ok)throw Error('Esportazione non disponibile');const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='scacchi-'+state.game.id+'.pgn';a.click();URL.revokeObjectURL(url);}catch(err){toast(err.message,true);}});
$('#review-prev').addEventListener('click',()=>selectReview((state.review?state.index:state.game.history.length-1)-1));
$('#review-next').addEventListener('click',()=>selectReview((state.review?state.index:state.game.history.length-1)+1));
$('#review-first').addEventListener('click',()=>selectReview(-1));$('#review-last').addEventListener('click',returnToLive);$('#review-live').addEventListener('click',returnToLive);
document.addEventListener('keydown',e=>{
 if($('#modal').open||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;
 if(e.key==='Escape'){clearAnnotations();clearPremoves();e.preventDefault();return;}
 if(e.key==='Backspace'&&state.premoves.length){state.premoves.pop();state.selected=null;renderBoard();e.preventDefault();return;}
 if(!state.game)return;
 const index=state.review?state.index:state.game.history.length-1;
 if(e.key==='ArrowLeft'){e.preventDefault();selectReview(index-1);}if(e.key==='ArrowRight'){e.preventDefault();selectReview(index+1);}
 if(e.key==='Home'){e.preventDefault();selectReview(-1);}if(e.key==='End'){e.preventDefault();returnToLive();}
});
$('#import-button').addEventListener('click',()=>{if(!ensureUser())return;modal('<h2>Una partita da rivedere</h2><p>Incolla un PGN, anche da un altro sito. Le varianti secondarie vengono ignorate.</p><form id="import-form"><label class="field-label" for="pgn-input">NOTAZIONE PGN</label><textarea id="pgn-input" rows="8" maxlength="50000" required placeholder="1. e4 e5 2. Nf3 Nc6…"></textarea><p class="form-error" id="form-error"></p><button class="primary-btn full" type="submit">Importa partita →</button></form>');});
$('#profile-button').addEventListener('click',()=>{if(!state.user){showAuth();return;}modal(`<h2>Ciao, ${esc(state.user.name)}.</h2><p>${state.user.admin?'Puoi gestire gli account e disabilitare gli accessi quando necessario.':'Le tue partite sono salvate nel tuo account. Puoi ritrovarle accedendo da un altro dispositivo.'}</p><div class="profile-actions">${ratingCards()}<label class="field-label" for="premove-mode">PREMOSSE</label><select id="premove-mode">${[['multiple','Multiple · fino a 5'],['single','Una sola'],['off','Disattivate']].map(([v,n])=>`<option value="${v}" ${state.premoveMode===v?'selected':''}>${n}</option>`).join('')}</select>${state.user.admin?'<button class="primary-btn full" data-action="manage-invites">Gestisci account →</button>':''}<button class="quiet-btn full" data-action="password-form">Cambia password</button><button class="quiet-btn full" data-action="logout">Esci dall’account</button></div>`);});
window.addEventListener('hashchange',async()=>{
 const params=new URLSearchParams(location.hash.slice(1));
 try{
  if(params.get('setup')||params.get('invite')){
   if(params.get('setup'))setupToken=params.get('setup');
   if(params.get('invite'))inviteToken=params.get('invite');
   if(params.get('join'))pendingJoin=params.get('join');
   history.replaceState(null,'',location.pathname+(pendingJoin?'#join='+pendingJoin:''));
   const me=await api('/me');state.user=me.user;state.setup=me.setup;state.legacyName=me.legacy_name;renderProfile();
   if(!state.user)showAuth('register');else toast('Hai già un account: puoi usare i link alle partite.');
  }else if(params.get('join'))await joinGame(params.get('join'));
 }catch(err){toast(err.message,true);}
});
async function init(){
 applyStoredTheme();renderAll();
 try{const me=await api('/me');state.user=me.user;state.setup=me.setup;state.legacyName=me.legacy_name;renderAll();renderConnection();if(state.user){if(mustChangePassword())return;connectLive();await Promise.all([loadPreferences(),loadLobby(),loadSocial()]);if(pendingJoin)await joinGame(pendingJoin);}else if(pendingJoin||setupToken||inviteToken||state.legacyName)showAuth();}
 catch(err){$('#server-status').textContent='Connessione interrotta';toast(err.message,true);}
}
// Feature implementations follow. No polling loop is used during a game.
let boardIdentity=null,liveSource=null,resyncing=false,liveGeneration=0,dragState=null,suppressClickUntil=0,pieceNodes=new Map(),boardOrientation=null,themeSaveTimer;
function disconnectLive(){liveGeneration++;liveSource?.close();liveSource=null;state.live=false;state.syncing=true;renderConnection();}
function renderConnection(){const el=$('#server-status');el.textContent=state.live?'Live · connesso':state.user?'Riconnessione…':'Aura Chess · Stockfish 19';el.closest('.engine-status').classList.toggle('disconnected',!!state.user&&!state.live);}
function sessionEnded(reason='La sessione è terminata. Accedi di nuovo.'){
 disconnectLive();state.user=null;resetPrivateState();state.game=null;state.optimistic=null;state.unconfirmed=null;state.premoves=[];state.review=false;state.challenges=[];state.members=[];state.lobby={games:[],rooms:[]};renderAll();renderChallengePopups();toast(reason,true);
}
function connectLive(){
 disconnectLive();if(!state.user)return;const generation=liveGeneration;
 const source=liveSource=new EventSource('/api/events');
 source.onmessage=async event=>{
  if(generation!==liveGeneration)return;
  try{
   const message=JSON.parse(event.data);if(state.authBusy&&message.type==='session_end')return;
   if(message.type==='ready'){
    state.live=true;state.syncing=true;renderConnection();await Promise.all([loadLobby(),loadSocial()]);if(generation!==liveGeneration)return;if(state.game){const gid=state.game.id,fresh=await api('/games/'+gid);if(generation!==liveGeneration)return;if(state.game?.id===gid)acceptGame(fresh);}state.syncing=false;if(state.view==='play'&&!state.game){state.matchQueue=await api('/matchmaking');renderPanel();}renderPremoves();queueMicrotask(runPremoves);return;
   }
   if(message.type==='game'){
    const g=message.game;
    if(state.game?.id===g.id)acceptGame(g);
    const at=state.lobby.games.findIndex(x=>x.id===g.id);if(at>=0)state.lobby.games[at]={...state.lobby.games[at],...g};else state.lobby.games.unshift(g);
    if(state.view==='archive')renderArchive();
   }else if(message.type==='friends'){await Promise.all([loadFriends(),loadMembers(),loadChallenges()]);}
   else if(message.type==='ratings'){await refreshIdentity();await loadMembers();}
   else if(message.type==='match_found'){openMatchedGame(message.game);}
   else if(message.type==='presence'){await loadMembers();if(state.view==='accounts'&&state.adminTab==='users')await loadAccounts();}
   else if(message.type==='challenge'){await loadChallenges();if(['declined','cancelled','expired'].includes(message.challenge.status)&&message.challenge.sender===state.user?.id)toast({declined:'Sfida rifiutata',cancelled:'Sfida annullata',expired:'Sfida scaduta'}[message.challenge.status]);}
   else if(message.type==='challenge_accepted'){
    const g=message.game;state.showFriends=false;state.review=false;state.flipped=g.color===false;acceptGame(g);playGameSound(g.id+':start','start');setView('friend');await loadChallenges();toast('Sfida accettata. Buona partita!');
   }else if(message.type==='session_end')sessionEnded(message.reason);
   else if(message.type==='resync'){if(state.game)acceptGame(await api('/games/'+state.game.id));await loadSocial();}
  }catch(err){if(err.status===401)sessionEnded();else console.warn('Aggiornamento live:',err.message);}
 };
 source.onerror=()=>{if(generation!==liveGeneration)return;state.live=false;state.syncing=true;renderConnection();renderPremoves();api('/me').then(me=>{if(generation===liveGeneration&&!me.user&&!state.authBusy)sessionEnded();}).catch(()=>{});};
}
function currentClocks(){
 const g=state.game;if(!g)return [state.base,state.base];const clocks=g.clocks.slice();
 if(g.base&&g.status==='active')clocks[Number(g.turn)]=Math.max(0,clocks[Number(g.turn)]-(performance.now()-state.clockAt)/1000);
 return clocks;
}
function updateClockFaces(){const g=state.game;if(!g||document.hidden)return;const clocks=currentClocks();const bottom=!state.flipped;
 if(g.base&&g.status==='active'&&g.turn===g.color&&clocks[Number(g.color)]>0&&clocks[Number(g.color)]<=10)playGameSound(g.id+':lowtime','lowtime');
 for(const [selector,color]of [['#top-clock',!bottom],['#bottom-clock',bottom]]){const el=$(selector),left=clocks[Number(color)];const value=formatClock(left,g.base);if(el.textContent!==value)el.textContent=value;el.classList.toggle('low',!!g.base&&left<30);}
}
setInterval(updateClockFaces,100);
function projectedState(){const g=state.game;return projectQueue(state.optimistic?.fen||g?.fen||START,state.premoves,g?.color??true);}
function projectedMap(){return state.review?fenMap(boardFen()):projectedState().map;}
function pseudoLegal(map,from,to,color){return canPremove(map,from,to,color,projectedState().rights);}
function clearPremoves(message){state.premoves=[];state.selected=null;renderBoard();renderPremoves();if(message){toast(message);if(state.sound)gameSounds.play('illegal');}}
function renderPremoves(){
 const el=$('#premove-bar');el.hidden=!state.premoves.length;
 el.innerHTML=state.premoves.length?`<div class="premove-content"><strong>${state.premoves.length} premoss${state.premoves.length===1?'a':'e'}${!state.live||state.syncing?' · in attesa di connessione':''}</strong><div class="premove-chips">${state.premoves.map((m,i)=>`<button data-trim-premoves="${i}" title="Annulla questa premossa e le successive" aria-label="Annulla premossa ${i+1} e successive"><small>${i+1}</small>${esc(m.slice(0,2)+'→'+m.slice(2,4)+(m[4]?'='+m[4].toUpperCase():''))}<span>×</span></button>`).join('')}</div><small>Backspace: ultima · clic destro: tutte</small></div><button class="icon-btn" data-action="clear-premoves" title="Annulla tutte le premosse · tasto destro" aria-label="Annulla tutte le premosse">×</button>`:'';
}
function runPremoves(){
 const g=state.game;if(!g||g.status!=='active'||state.mutating||state.syncing||!state.live||g.turn!==g.color||!state.premoves.length)return;
 const next=state.premoves.shift();if(!g.legal.includes(next))return clearPremoves('Premosse annullate: la prima mossa non è più legale.');renderPremoves();makeMove(next,{premove:true});
}
function renderBoard(){
 const g=state.game,map=projectedMap(),board=$('#board'),identity=(g?.id||'empty')+':'+state.flipped;
 board.dataset.gameId=g?.id||'';const snap=boardIdentity!==identity;boardIdentity=identity;if(snap)board.classList.add('board-snap');
 if(!board.querySelector('.square')){let html='';for(let y=0;y<8;y++)for(let x=0;x<8;x++)html+=`<button class="square" data-cell="${y*8+x}"></button>`;board.innerHTML=html+'<div class="piece-layer" aria-hidden="true"></div><div class="result-layer"></div>';}
 const row=state.review?g?.analysis?.[state.index]:null;
 let last=state.review?(state.index>=0?g.history[state.index]?.uci:null):state.optimistic?.uci||g?.history.at(-1)?.uci;
 if(state.showBest&&row)last=state.pvIndex<0?row.best_uci:null;
 const queueMode=!!g&&(g.turn!==g.color||state.mutating||state.premoves.length>0||!state.live||state.syncing),cells=board.querySelectorAll('.square');
 const destinations=new Set(state.selected?(queueMode?Object.keys(Object.fromEntries(Array.from({length:64},(_,i)=>['abcdefgh'[i%8]+(1+Math.floor(i/8)),true]))).filter(sq=>pseudoLegal(map,state.selected,sq,g.color)):g?.legal.filter(m=>m.startsWith(state.selected)).map(m=>m.slice(2,4))||[]):[]);
 const premoveSquares=new Set((state.review?[]:state.premoves).flatMap(m=>[m.slice(0,2),m.slice(2,4)]));
 cells.forEach((cell,i)=>{const x=i%8,y=Math.floor(i/8),file=state.flipped?7-x:x,rank=state.flipped?y+1:8-y,sq='abcdefgh'[file]+rank,p=map[sq];cell.dataset.square=sq;cell.className=['square',(file+rank)%2===0?'dark':'',last&&(last.slice(0,2)===sq||last.slice(2,4)===sq)?'last':'',sq===state.selected?'selected':'',!state.review&&g?.check===sq&&!state.premoves.length?'checked':'',premoveSquares.has(sq)?'premoved':''].filter(Boolean).join(' ');cell.setAttribute('aria-label',sq+(p?', '+pieceName(p):', vuota'));cell.tabIndex=g&&!state.review&&g.status==='active'?0:-1;
 const queued=state.review?-1:state.premoves.findIndex(m=>m.slice(2,4)===sq);cell.innerHTML=`${x===0?`<span class="coord-rank">${rank}</span>`:''}${y===7?`<span class="coord-file">${'abcdefgh'[file]}</span>`:''}${destinations.has(sq)?`<span class="${p?'legal-ring':'legal-dot'}"></span>`:''}${queued>=0?`<span class="queue-badge">${queued+1}</span>`:''}${row&&!state.showBest&&row.uci.slice(2,4)===sq?`<span class="move-badge" style="${labelStyle(row.label)}">${labels[row.label][1]}</span>`:''}`;
 });
 const available=new Map(pieceNodes),next=new Map(),layer=board.querySelector('.piece-layer');
 for(const [sq,p]of Object.entries(map)){const existing=available.get(sq);if(existing?.dataset.char===p){next.set(sq,existing);available.delete(sq);}}
 for(const [sq,p]of Object.entries(map)){
  if(next.has(sq))continue;
  let candidates=[...available].filter(([_,n])=>n.dataset.char===p);
  candidates.sort(([a],[b])=>Math.abs(a.charCodeAt(0)-sq.charCodeAt(0))+Math.abs(Number(a[1])-Number(sq[1]))-Math.abs(b.charCodeAt(0)-sq.charCodeAt(0))-Math.abs(Number(b[1])-Number(sq[1])));
  let node;
  if(candidates.length){const [old,n]=candidates[0];available.delete(old);node=n;}
  else{node=document.createElement('div');node.className='board-piece';const img=document.createElement('img');img.draggable=false;img.alt='';node.append(img);node.dataset.char=p;node.querySelector('img').src='/pieces/'+(p===p.toUpperCase()?'w':'b')+p.toUpperCase()+'.svg';const [px,py]=coord(sq);node.style.transform=`translate(${px-50}%,${py-50}%)`;layer.append(node);node.classList.add('piece-new');requestAnimationFrame(()=>node.classList.remove('piece-new'));}
  next.set(sq,node);
 }
 for(const [sq,node]of next){const [cx,cy]=coord(sq);node.style.transform=`translate(${(cx-50)}%,${(cy-50)}%)`;node.dataset.square=sq;node.classList.toggle('planned',state.premoves.some(m=>m.slice(2,4)===sq));node.classList.toggle('drag-origin',!!(dragState?.moving&&dragState.from===sq));}
 for(const node of available.values()){node.classList.add('piece-captured');setTimeout(()=>node.remove(),170);}
 pieceNodes=next;renderMateBadges(g,boardFen(),map);renderAnnotations();
 if(snap){void board.offsetWidth;board.classList.remove('board-snap');}
 const arrow=$('#arrow-line');if(state.showBest&&row&&state.pvIndex<0){const from=coord(row.best_uci.slice(0,2)),to=coord(row.best_uci.slice(2,4));for(const [key,value]of Object.entries({x1:from[0],y1:from[1],x2:to[0],y2:to[1]}))arrow.setAttribute(key,value);$('#board-arrow').style.display='block';}else $('#board-arrow').style.display='none';
 $('#eval-bar').classList.toggle('visible',!!row);if(row)$('#eval-white').style.height=(50+Math.atan(row.cp/300)*100/Math.PI)+'%';renderPremoves();
}
function renderMateBadges(g,fen,map){
 const layer=$('#board .result-layer');let mate=false;
 if(g?.status==='finished'&&fen===g.fen){try{mate=new Chess(fen).isCheckmate();}catch{}}
 if(!mate){layer.replaceChildren();delete layer.dataset.game;return;}
 const winner=g.result==='1-0'?'K':'k';
 if(layer.dataset.game!==g.id){
  layer.dataset.game=g.id;layer.innerHTML='<span class="king-result winner" role="img" aria-label="Re vincitore" title="Vittoria per scaccomatto"><span class="result-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l5 4 4-7 4 7 5-4-2 12H5zM6 21h12"/></svg></span></span><span class="king-result loser" role="img" aria-label="Re sotto scaccomatto" title="Scaccomatto"><span class="result-mark">#</span></span>';
 }
 for(const [piece,role]of [[winner,'winner'],[winner==='K'?'k':'K','loser']]){
  const square=Object.keys(map).find(sq=>map[sq]===piece),badge=layer.querySelector('.'+role);if(!square){badge.hidden=true;continue;}
  const [x,y]=coord(square);badge.hidden=false;badge.dataset.square=square;badge.style.left=((x-50)/8)+'%';badge.style.top=((y-50)/8)+'%';
  const cell=$('#board .square[data-square="'+square+'"]');cell.setAttribute('aria-label',cell.getAttribute('aria-label')+(role==='winner'?', vincitore':', scaccomatto'));if(role==='loser')cell.classList.add('mated');
 }
}
$('#board').addEventListener('contextmenu',e=>e.preventDefault());
$('#board').addEventListener('pointerdown',e=>{
 if(e.button===0)clearAnnotations();
 if(e.button!==0||!state.game||state.review||state.game.status!=='active')return;
 const sq=e.target.closest('[data-square]')?.dataset.square,p=projectedMap()[sq];if(!p||(p===p.toUpperCase())!==state.game.color)return;
 dragState={from:sq,x:e.clientX,y:e.clientY,moving:false,pointer:e.pointerId};
});
$('#board').addEventListener('pointermove',e=>{
 const d=dragState;if(!d||d.pointer!==e.pointerId)return;
 if(!d.moving&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>6){d.moving=true;$('#board').setPointerCapture(e.pointerId);state.selected=d.from;const src=pieceNodes.get(d.from)?.querySelector('img');if(src){d.ghost=src.cloneNode();d.ghost.className='drag-ghost';d.ghost.style.width=($('#board').clientWidth/8)+'px';document.body.append(d.ghost);}renderBoard();}
 if(d.moving&&d.ghost){e.preventDefault();d.ghost.style.left=e.clientX+'px';d.ghost.style.top=e.clientY+'px';}
});
$('#board').addEventListener('pointerup',e=>{
 const d=dragState;if(!d)return;dragState=null;d.ghost?.remove();if(!d.moving)return;
 suppressClickUntil=performance.now()+200;const r=$('#board').getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/r.width*8),y=Math.floor((e.clientY-r.top)/r.height*8);if(x<0||x>7||y<0||y>7){state.selected=null;renderBoard();return;}
 const sq='abcdefgh'[state.flipped?7-x:x]+(state.flipped?y+1:8-y);state.selected=d.from;squareClick(sq).catch(err=>toast(err.message,true));renderBoard();
});
$('#board').addEventListener('pointercancel',()=>{dragState?.ghost?.remove();dragState=null;state.selected=null;renderBoard();});
function compactTime(base,increment){return base?`${base/60} + ${increment}`:'Senza tempo';}
async function loadMembers(){if(!state.user)return;state.members=(await api('/members')).members;if(state.view==='friend'&&(state.showFriends||!state.game))renderFriends();}
async function loadChallenges(){if(!state.user)return;state.challenges=(await api('/challenges')).challenges;renderChallengePopups();if(state.view==='friend'&&(state.showFriends||!state.game))renderFriends();}
async function loadSocial(){if(state.user&&!state.user.must_change_password)await Promise.all([loadMembers(),loadChallenges(),loadFriends()]);}
function renderChallengePopups(){
 const incoming=state.challenges.filter(c=>c.recipient===state.user?.id);for(const c of incoming)playGameSound('challenge:'+c.id,'notify');$('#challenge-count').hidden=!incoming.length;$('#challenge-count').textContent=incoming.length;
 $('#challenge-popups').innerHTML=incoming.slice(0,3).map(c=>`<section class="challenge-popup" role="region" aria-label="Nuova sfida"><span class="challenge-emblem">♞</span><div><div class="tiny-label">SEI STATO SFIDATO</div><strong>${esc(c.sender_name)}</strong><p>${compactTime(c.base,c.increment)} · ${c.rated?'Ranked · Elo':'Unranked'}</p><div class="challenge-buttons"><button class="primary-btn" data-accept-challenge="${c.id}">Accetta</button><button class="quiet-btn" data-decline-challenge="${c.id}">Rifiuta</button></div></div></section>`).join('');
}
async function loadAccounts(){if(!state.user?.admin)return;const r=await api('/admin/users?page='+state.accountPage+'&q='+encodeURIComponent(state.accountSearch));state.accounts=r.users;state.accountTotal=r.total;state.accountPages=r.pages;if(state.view==='accounts')renderAccounts();}
const sitePresets=[
 {name:'Obsidian',site:{bg:'#101416',panel:'#191f22',surface:'#242c2f',line:'#343e41',text:'#f1f4ed',muted:'#a0ada8',accent:'#c7ef79',accentInk:'#243014'},font:'sans'},
 {name:'Carta',site:{bg:'#f3f0e7',panel:'#fffcf4',surface:'#e7e4d8',line:'#d3d0c3',text:'#282e2b',muted:'#68716b',accent:'#416b55',accentInk:'#ffffff'},font:'serif'},
 {name:'Mezzanotte',site:{bg:'#0c1326',panel:'#141e36',surface:'#202f4c',line:'#344465',text:'#edf3ff',muted:'#9aaecf',accent:'#8ebaff',accentInk:'#142745'},font:'sans'},
 {name:'Aurora',site:{bg:'#191324',panel:'#261d34',surface:'#392b48',line:'#51405f',text:'#f8edf9',muted:'#b9a0c6',accent:'#e6abed',accentInk:'#3b1f48'},font:'sans'},
 {name:'Foresta',site:{bg:'#101e1a',panel:'#192d25',surface:'#254136',line:'#3c594a',text:'#edf4e7',muted:'#a0b6a3',accent:'#8cdbb3',accentInk:'#163b2a'},font:'sans'},
 {name:'Rame',site:{bg:'#231b19',panel:'#312521',surface:'#45332d',line:'#62483d',text:'#f7ebe0',muted:'#c1a698',accent:'#e8ae7f',accentInk:'#442918'},font:'serif'}
];
const boardPresets=[
 {name:'Salvia',light:'#e8ebda',dark:'#7a9683',lastLight:'#dfdf8b',lastDark:'#a4b763',style:'flat'},
 {name:'Acero',light:'#f0d9b5',dark:'#b58863',lastLight:'#f7e38f',lastDark:'#d6bc58',style:'wood'},
 {name:'Oceano',light:'#dce6ed',dark:'#718da6',lastLight:'#b7d9cc',lastDark:'#77b6ad',style:'flat'},
 {name:'Marmo',light:'#e9e9e5',dark:'#8b8e91',lastLight:'#d9ddb0',lastDark:'#aeb77b',style:'marble'},
 {name:'Notte',light:'#82909d',dark:'#3b4d62',lastLight:'#b4bc85',lastDark:'#78915f',style:'flat'},
 {name:'Lilla',light:'#eee0f3',dark:'#9a83ad',lastLight:'#e3d68e',lastDark:'#bdad68',style:'flat'}
];
const themeVariables={bg:'--bg',panel:'--panel',surface:'--surface',line:'--line',text:'--text',muted:'--muted',accent:'--accent',accentInk:'--accent-ink',light:'--light-square',dark:'--dark-square',lastLight:'--last-light',lastDark:'--last-dark'};
const baseTheme={version:1,name:'Obsidian / Salvia',site:sitePresets[0].site,board:Object.fromEntries(Object.entries(boardPresets[0]).filter(([k])=>!['name','style'].includes(k))),font:'sans',pieceStyle:'classic',boardStyle:'flat',density:'comfortable',radius:12};
function validateTheme(raw){
 if(!raw||typeof raw!=='object'||JSON.stringify(raw).length>20000)throw Error('Tema JSON non valido o troppo grande');
 const theme={...structuredClone(baseTheme),...raw,site:{...baseTheme.site,...raw.site},board:{...baseTheme.board,...raw.board}};
 for(const [section,allowed]of [['site',['bg','panel','surface','line','text','muted','accent','accentInk']],['board',['light','dark','lastLight','lastDark']]])for(const [key,value]of Object.entries(theme[section]))if(!allowed.includes(key)||!/^#[0-9a-f]{6}$/i.test(value))throw Error('Il tema deve contenere solo colori #RRGGBB nelle proprietà supportate');
 for(const [key,allowed]of [['font',['sans','serif','mono']],['pieceStyle',['classic','ink','neon']],['boardStyle',['flat','wood','marble']],['density',['comfortable','compact']]])if(!allowed.includes(theme[key]))throw Error('Il tema contiene uno stile non supportato');
 if(!Number.isInteger(theme.radius)||theme.radius<0||theme.radius>24)throw Error('Il raggio deve essere tra 0 e 24');
 theme.name=String(theme.name||'Tema personale').slice(0,40);theme.version=1;return theme;
}
function applyTheme(raw,persist=true){
 const theme=validateTheme(raw);state.theme=theme;const root=document.documentElement;
 for(const [key,value]of Object.entries({...theme.site,...theme.board}))root.style.setProperty(themeVariables[key],value);
 root.style.setProperty('--radius',theme.radius+'px');root.style.setProperty('--font',({sans:"Inter, 'Segoe UI', Arial, sans-serif",serif:"Georgia, 'Times New Roman', serif",mono:"'Courier New', monospace"})[theme.font]);
 document.body.dataset.pieces=theme.pieceStyle;document.body.dataset.board=theme.boardStyle;document.body.dataset.density=theme.density;document.body.dataset.motion=state.animations?'on':'off';renderSoundControl();
 if(persist)persistPreferences();if(state.view==='themes')renderThemes();
}
function applyStoredTheme(){try{const saved=JSON.parse(localStorage.getItem('aura-preferences'));if(saved){state.animations=saved.animations!==false;state.sound=saved.sound!==false;applyTheme(saved.theme,false);return;}}catch{}applyTheme(baseTheme,false);}
async function loadPreferences(){if(!state.user)return;try{const data=(await api('/preferences')).preferences;if(data){state.animations=data.animations;state.sound=data.sound!==false;applyTheme(data.theme,false);}}catch{} }
function persistPreferences(){const value={theme:state.theme||baseTheme,animations:state.animations,sound:state.sound};try{localStorage.setItem('aura-preferences',JSON.stringify(value));}catch{}clearTimeout(themeSaveTimer);const uid=state.user?.id;if(uid)themeSaveTimer=setTimeout(()=>{if(state.user?.id===uid)api('/preferences',value).catch(()=>{});},300);}
async function loadThemeLibrary(){if(!state.user)return;state.themeLibrary=(await api('/themes')).themes;if(state.view==='themes')renderThemes();}
function renderThemes(){
 const urlInput=$('#theme-url'), urlValue=urlInput?.value||'', urlFocused=document.activeElement===urlInput;
 const theme=state.theme||baseTheme;
 $('#panel').innerHTML=`<div class="panel-body themes-panel"><div class="eyebrow">FALLO TUO</div><h2>Una nuova atmosfera</h2><p class="subtle">Sito e scacchiera cambiano insieme a te. Le preferenze seguono il tuo account.</p><label class="field-label">STILE DEL SITO</label><div class="theme-grid">${sitePresets.map((t,i)=>`<button class="theme-tile ${theme.site.bg===t.site.bg?'active':''}" data-site-theme="${i}" style="--tile-bg:${t.site.bg};--tile-panel:${t.site.panel};--tile-accent:${t.site.accent}"><span class="site-swatch"><i></i><b></b><em></em></span><span>${t.name}</span></button>`).join('')}</div><label class="field-label">LA TUA SCACCHIERA</label><div class="theme-grid board-theme-grid">${boardPresets.map((t,i)=>`<button class="theme-tile ${theme.board.dark===t.dark?'active':''}" data-board-theme="${i}"><span class="board-swatch" style="--swatch-light:${t.light};--swatch-dark:${t.dark}"></span><span>${t.name}</span></button>`).join('')}</div><div class="settings-row"><div><label class="field-label" for="piece-style">PEZZI</label><select id="piece-style">${[['classic','Classici'],['ink','Inchiostro'],['neon','Neon']].map(([v,n])=>`<option value="${v}" ${theme.pieceStyle===v?'selected':''}>${n}</option>`).join('')}</select></div><div><label class="field-label" for="theme-density">SPAZIATURA</label><select id="theme-density"><option value="comfortable" ${theme.density==='comfortable'?'selected':''}>Ampia</option><option value="compact" ${theme.density==='compact'?'selected':''}>Compatta</option></select></div></div><label class="toggle-line"><input type="checkbox" id="animations-toggle" ${state.animations?'checked':''}><span>Animazioni dei pezzi</span></label><label class="toggle-line"><input type="checkbox" id="sounds-toggle" ${state.sound?'checked':''}><span>Suoni di partita</span></label><div class="separator"></div><div class="section-label">TEMI DA PORTARE CON TE</div><div class="theme-import-actions"><button class="quiet-btn" data-action="import-theme-file">↥ Carica JSON</button><button class="quiet-btn" data-action="export-theme">↧ Esporta</button></div><form id="theme-url-form"><label class="field-label" for="theme-url">IMPORTA DA UN LINK HTTPS</label><div class="copy-row"><input id="theme-url" type="url" required value="${esc(urlValue)}" placeholder="https://…/tema.json"><button class="quiet-btn" type="submit">Importa</button></div></form><p class="helper">Colori, font, bordi e scacchiera in un file JSON. I link esterni devono consentire il download dal browser.</p>${state.user?'<button class="quiet-btn full" data-action="publish-theme">Condividi il tema nel catalogo del club</button>':''}${state.themeLibrary.length?`<div class="section-label">DAL CATALOGO DEL CLUB</div>${state.themeLibrary.map(t=>`<button class="catalog-theme" data-catalog-theme="${esc(t.id)}"><span style="background:${esc(t.pack.site.accent||'#aaaaaa')}"></span>${esc(t.pack.name)}<small>Applica →</small></button>`).join('')}`:''}</div>`;
 if(urlFocused)$('#theme-url').focus();
}
async function importThemeURL(url){
 const parsed=new URL(url);if(parsed.protocol!=='https:')throw Error('Usa un link HTTPS a un tema JSON');const response=await fetch(parsed.href,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Il tema non è disponibile');
 if(Number(response.headers.get('Content-Length'))>100000)throw Error('Il file del tema è troppo grande');
 const reader=response.body.getReader();let total=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>100000){await reader.cancel();throw Error('Il file del tema è troppo grande');}parts.push(value);}const buffer=new Uint8Array(total);let at=0;for(const chunk of parts){buffer.set(chunk,at);at+=chunk.length;}applyTheme(JSON.parse(new TextDecoder().decode(buffer)));toast('Tema importato e applicato.');
}
function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
Object.assign(actions,{
 'clear-premoves':()=>clearPremoves(),
 'show-inbox':()=>{if(!ensureUser())return;const incoming=state.challenges.filter(c=>c.recipient===state.user.id);if(incoming.length)renderChallengePopups();else toast('Nessuna nuova sfida. Scegli un amico per iniziare.');},
 'import-theme-file':()=>$('#theme-file').click(),
 'export-theme':()=>downloadJSON(state.theme,'aura-theme.json'),
 'publish-theme':()=>{if(!ensureUser())return;modal(`<h2>Dai un nome al tuo tema</h2><p>Verrà aggiunto al catalogo del club e avrà un link condivisibile.</p><form id="publish-theme-form"><label class="field-label" for="theme-name">NOME DEL TEMA</label><input id="theme-name" required maxlength="40" value="${esc(state.theme.name)}"><p class="form-error" id="form-error"></p><button class="primary-btn full" type="submit">Pubblica il tema</button></form>`);},
 'confirm-disable':async()=>{const uid=$('#confirm-user-id').value;await api('/admin/users/'+uid+'/status',{disabled:true});closeModal();await loadAccounts();toast('Account disabilitato e sessioni terminate.');}
});
document.addEventListener('click',async e=>{
 const el=e.target.closest('button');if(!el||el.disabled)return;
 try{
  if(el.dataset.challengeUser){readSettings();await api('/challenges',{recipient_id:el.dataset.challengeUser,base:state.base,increment:state.increment,color:state.color,rated:state.rated});await loadChallenges();toast('Sfida inviata. Il tuo amico può accettarla dal pop-up.');}
  else if(el.dataset.acceptChallenge){const result=await api('/challenges/'+el.dataset.acceptChallenge+'/reply',{accept:true});state.showFriends=false;state.review=false;state.flipped=result.game.color===false;acceptGame(result.game);playGameSound(result.game.id+':start','start');setView('friend');await loadChallenges();}
  else if(el.dataset.declineChallenge){await api('/challenges/'+el.dataset.declineChallenge+'/reply',{accept:false});await loadChallenges();}
  else if(el.dataset.cancelChallenge){await api('/challenges/'+el.dataset.cancelChallenge+'/cancel',{});await loadChallenges();}
  else if(el.dataset.accountStatus){const u=state.accounts.find(u=>u.id===el.dataset.accountStatus);if(el.dataset.disabled==='1')modal(`<h2>Disabilitare ${esc(u.name)}?</h2><p>Verrà disconnesso da tutti i dispositivi e non potrà accedere. Le sue partite resteranno nell’archivio.</p><input type="hidden" id="confirm-user-id" value="${esc(u.id)}"><button class="primary-btn full" data-action="confirm-disable">Disabilita account</button>`);else{await api('/admin/users/'+u.id+'/status',{disabled:false});await loadAccounts();toast('Account riattivato.');}}
  else if(el.dataset.accountPage){state.accountPage=Number(el.dataset.accountPage);await loadAccounts();}
  else if(el.dataset.siteTheme){const t=sitePresets[Number(el.dataset.siteTheme)];applyTheme({...state.theme,name:t.name+' / personalizzato',site:t.site,font:t.font});}
  else if(el.dataset.boardTheme){const b=boardPresets[Number(el.dataset.boardTheme)];applyTheme({...state.theme,board:{light:b.light,dark:b.dark,lastLight:b.lastLight,lastDark:b.lastDark},boardStyle:b.style});}
  else if(el.dataset.catalogTheme){const t=state.themeLibrary.find(t=>t.id===el.dataset.catalogTheme);applyTheme(t.pack);toast('Tema applicato.');}
 }catch(err){toast(err.message,true);}
});
document.addEventListener('submit',async e=>{
 const form=e.target;
 try{
 if(form.id==='account-search'){e.preventDefault();state.accountSearch=$('#account-query').value;state.accountPage=1;await loadAccounts();}
 else if(form.id==='theme-url-form'){e.preventDefault();const url=$('#theme-url').value;try{await importThemeURL(url);}catch(err){toast(err.name==='TypeError'?'Il server del tema non consente l’importazione: scarica il JSON e caricalo da file.':err.message,true);}}
 else if(form.id==='publish-theme-form'){e.preventDefault();const pack={...state.theme,name:$('#theme-name').value};const result=await api('/themes',{pack});closeModal();await loadThemeLibrary();modal(`<h2>Tema condiviso</h2><p>È nel catalogo del club. Puoi condividere anche il link JSON.</p><div class="copy-row"><input id="copy-link" readonly value="${esc(location.origin+'/api/themes/'+result.id)}"><button class="quiet-btn" data-action="copy-theme-link">Copia</button></div>`);actions['copy-theme-link']=()=>copy(location.origin+'/api/themes/'+result.id);}
 }catch(err){const target=$('#form-error');if(target)target.textContent=err.message;else toast(err.message,true);}
});
document.addEventListener('change',e=>{
 if(e.target.id==='piece-style')applyTheme({...state.theme,pieceStyle:e.target.value});
 if(e.target.id==='theme-density')applyTheme({...state.theme,density:e.target.value});
 if(e.target.id==='sounds-toggle')setSound(e.target.checked);
 if(e.target.id==='animations-toggle'){state.animations=e.target.checked;document.body.dataset.motion=state.animations?'on':'off';persistPreferences();}
});
$('#theme-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000)throw Error('Il tema è troppo grande');applyTheme(JSON.parse(await file.text()));toast('Tema importato e applicato.');}catch(err){toast(err.message,true);}e.target.value='';});
window.addEventListener('offline',()=>{if(state.user){disconnectLive();renderPremoves();}});
window.addEventListener('online',()=>{if(state.user)connectLive();});
window.addEventListener('beforeunload',()=>liveSource?.close());
document.addEventListener('visibilitychange',async()=>{if(document.hidden||!state.user)return;try{if(state.game)acceptGame(await api('/games/'+state.game.id));await loadSocial();}catch{}});
const materialCache=new Map();
function renderMaterial(){
 const g=state.game;if(!g){$('#top-material').replaceChildren();$('#bottom-material').replaceChildren();return;}
 let count=state.review?state.index+1:g.history.length,variation=[];
 const row=g.analysis?.[state.index];if(state.review&&state.showBest&&row){count=state.index;variation=row.pv.slice(0,state.pvIndex+1);}
 const moves=g.history.slice(0,Math.max(0,count)).map(m=>m.uci);if(!state.review&&state.optimistic)moves.push(state.optimistic.uci);
 const fen=boardFen(),key=g.id+'|'+fen+'|'+moves.join(',')+'|'+variation.join(',');let data=materialCache.get(key);
 if(!data){try{data=materialSummary(g.initial_fen,moves,fen,variation);}catch{data=materialSummary(fen,[],fen);}materialCache.set(key,data);if(materialCache.size>20)materialCache.delete(materialCache.keys().next().value);}
 for(const [id,side]of [['top-material',state.flipped?'w':'b'],['bottom-material',state.flipped?'b':'w']]){
  const el=$('#'+id),taken=data.taken[side],advantage=data.advantage[side];el.dataset.advantage=advantage;el.dataset.captor=side;el.title=state.review?'Materiale della posizione mostrata':'Materiale attuale. Le premosse non sono conteggiate.';
  const html=taken.map(p=>{const char=side==='w'?p:p.toUpperCase();return `<img src="/pieces/${side==='w'?'b':'w'}${p.toUpperCase()}.svg" alt="${pieceName(char)} catturato" title="${pieceName(char)} catturato" draggable="false">`;}).join('')+(advantage?`<strong class="material-score" title="Vantaggio di materiale: ${advantage} punt${advantage===1?'o':'i'}">+${advantage}</strong>`:'');
  if(el.innerHTML!==html)el.innerHTML=html;
  el.setAttribute('aria-label','Pezzi catturati dal '+(side==='w'?'Bianco':'Nero')+': '+taken.length+'. Vantaggio di materiale: '+advantage+' punti.');
 }
}
const annotationColors={orange:'#eaa43e',green:'#6fad65',red:'#e06464',blue:'#66a9df'};
let annotations=[],annotationDrag=null,annotationPosition=null;
function clearAnnotations(){annotations=[];annotationDrag=null;renderAnnotations();}
function squareAtPoint(x,y){const r=$('#board').getBoundingClientRect(),file=Math.floor((x-r.left)/r.width*8),rank=Math.floor((y-r.top)/r.height*8);if(file<0||file>7||rank<0||rank>7)return null;return 'abcdefgh'[state.flipped?7-file:file]+(state.flipped?rank+1:8-rank);}
function renderAnnotations(){
 const svg=$('#user-annotations'),position=(state.game?.id||'')+'|'+boardFen();
 if(position!==annotationPosition){annotations=[];annotationDrag=null;annotationPosition=position;}
 const draw=[...annotations];if(annotationDrag?.moved&&annotationDrag.to&&annotationDrag.from!==annotationDrag.to)draw.push({...annotationDrag,preview:true});
 const defs=Object.entries(annotationColors).map(([name,color])=>`<marker id="annotation-head-${name}" markerWidth="3.6" markerHeight="3.6" refX="2.7" refY="1.8" orient="auto"><path d="M0,0 L3.6,1.8 L0,3.6 Z" fill="${color}"/></marker>`).join('');
 svg.innerHTML='<defs>'+defs+'</defs>'+draw.map(a=>{
  const color=annotationColors[a.color],opacity=a.preview?'.55':'.8';
  if(a.from===a.to){const [x,y]=coord(a.from);return `<circle class="user-circle" data-from="${a.from}" cx="${x}" cy="${y}" r="42" fill="none" stroke="${color}" stroke-width="9" opacity="${opacity}"/>`;}
  return `<path class="user-arrow" data-from="${a.from}" data-to="${a.to}" d="${annotationPath(a.from,a.to,coord)}" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" marker-end="url(#annotation-head-${a.color})"/>`;
 }).join('');
}
$('#board').addEventListener('pointerdown',e=>{
 if(e.button!==2)return;const sq=squareAtPoint(e.clientX,e.clientY);if(!sq)return;
 e.preventDefault();state.selected=null;annotationDrag={from:sq,to:sq,color:e.shiftKey?'red':e.ctrlKey||e.metaKey?'green':e.altKey?'blue':'orange',pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false};$('#board').setPointerCapture(e.pointerId);renderAnnotations();
});
$('#board').addEventListener('pointermove',e=>{
 const d=annotationDrag;if(!d||d.pointer!==e.pointerId)return;e.preventDefault();
 d.moved ||= Math.hypot(e.clientX-d.x,e.clientY-d.y)>6;d.to=squareAtPoint(e.clientX,e.clientY);renderAnnotations();
});
$('#board').addEventListener('pointerup',e=>{
 const d=annotationDrag;if(!d||d.pointer!==e.pointerId)return;const to=squareAtPoint(e.clientX,e.clientY);annotationDrag=null;
 if($('#board').hasPointerCapture(e.pointerId))$('#board').releasePointerCapture(e.pointerId);
 if(!to){renderAnnotations();return;}
 if(!d.moved&&to===d.from&&state.premoves.length){clearPremoves();renderAnnotations();return;}
 const mark={from:d.from,to,color:d.color},index=annotations.findIndex(a=>a.from===mark.from&&a.to===mark.to&&a.color===mark.color);
 if(index>=0)annotations.splice(index,1);else{if(annotations.length>=32)annotations.shift();annotations.push(mark);}renderAnnotations();
});
$('#board').addEventListener('pointercancel',()=>{annotationDrag=null;renderAnnotations();});

let matchExpiryTimer;
function resetPrivateState(){state.friendData={friends:[],incoming:[],outgoing:[]};state.members=[];state.audit=null;state.accounts=[];state.adminGames=[];state.adminStats=null;state.matchQueue={queued:false};clearTimeout(matchExpiryTimer);}
function poolOf(base=state.base,increment=state.increment){const t=base+40*increment;return t<180?'bullet':t<600?'blitz':t<1800?'rapid':'classical';}
const poolNames={bullet:'Bullet',blitz:'Blitz',rapid:'Rapid',classical:'Classiche'};
function ratingCards(){return `<div class="rating-grid">${Object.entries(poolNames).map(([p,n])=>{const r=state.user?.ratings?.[p];return `<div><small>${n}</small><strong>${r?.rating??1200}${(r?.games||0)<20?'<sup>?</sup>':''}</strong><span>${r?.games||0} ranked</span></div>`;}).join('')}</div>`;}
function ratedSettings(){return `<label class="field-label" for="rated-select">TIPO DI PARTITA</label><select id="rated-select"><option value="1" ${state.rated?'selected':''}>Ranked · aggiorna il tuo Elo</option><option value="0" ${!state.rated?'selected':''}>Unranked · senza variazioni Elo</option></select><p class="helper">Elo del sito, separato per cadenza. Il simbolo ? indica un rating provvisorio.</p>`;}
function renderOnline(){
 $('#panel').innerHTML=`<div class="panel-body"><div class="eyebrow">GIOCA CON LA COMMUNITY</div><h2>Una nuova sfida.</h2><p class="subtle">Trova un avversario in cerca della stessa cadenza. I nomi si vedono quando la partita inizia.</p>${state.user?ratingCards():''}${settings()}${state.matchQueue?.queued?`<div class="queue-card"><span class="status-dot"></span><strong>Ricerca avversario…</strong><p>${compactTime(state.matchQueue.entry?.base||state.base,state.matchQueue.entry?.increment??state.increment)} · ${state.matchQueue.entry?.rated??state.rated?'Ranked':'Unranked'}</p><p class="helper">La ricerca dura fino a 2 minuti. Puoi annullarla in qualsiasi momento.</p><button class="quiet-btn full" data-action="cancel-match">Annulla ricerca</button></div>`:`<button class="primary-btn full start-btn" data-action="find-match">Cerca una partita →</button>`}<div class="separator"></div><button class="quiet-btn full" data-nav="friend">Oppure sfida un amico ↗</button></div>`;
}
async function loadFriends(){if(!state.user||state.user.must_change_password)return;state.friendData=await api('/friends');if(state.view==='friend'&&(state.showFriends||!state.game))renderFriends();renderFriendNotice();}
function renderFriendNotice(){const n=state.friendData?.incoming?.length||0;$('#friends-badge').hidden=!n;$('#friends-badge').textContent=n;}
function friendRequests(){const d=state.friendData||{};return `<div class="friend-requests">${(d.incoming||[]).map(u=>`<div class="request-row"><div><strong>${esc(u.name)}</strong><small>Vuole aggiungerti agli amici</small></div><button class="quiet-btn" data-friend-accept="${u.id}">Accetta</button><button class="icon-btn" data-friend-reject="${u.id}" title="Rifiuta">×</button></div>`).join('')}${(d.outgoing||[]).map(u=>`<div class="request-row"><div><strong>${esc(u.name)}</strong><small>Richiesta inviata</small></div><button class="quiet-btn" data-friend-remove="${u.id}">Annulla</button></div>`).join('')}</div>`;}
function renderFriends(){
 const code=state.friendData?.code||state.user?.friend_code||'',formatted=code.match(/.{1,4}/g)?.join('-')||'',pool=poolOf();
 $('#panel').innerHTML=tabs('new')+`<div class="panel-body"><div class="eyebrow">LE TUE AMICIZIE</div><h2>Gioca con chi conosci.</h2><p class="subtle">Aggiungi un amico con il suo codice. Solo dopo l’accettazione potrete vedervi online e sfidarvi.</p>${state.user?`<label class="field-label">IL TUO CODICE AMICO</label><div class="friend-code"><code>${esc(formatted)}</code><button class="quiet-btn" data-action="copy-friend-code">Copia</button></div><form id="friend-code-form"><label class="field-label" for="friend-code-input">AGGIUNGI CON UN CODICE</label><div class="copy-row"><input id="friend-code-input" required maxlength="40" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off"><button class="quiet-btn" type="submit">Invia</button></div><p class="form-error" id="friend-error"></p></form>${friendRequests()}`:'<button class="primary-btn" data-action="guest">Accedi per aggiungere amici</button>'}${settings()}<div class="separator"></div><div class="section-label">${state.user?.admin?'GIOCATORI · VISTA AMMINISTRATORE':'I TUOI AMICI'} <span class="member-count">${state.members.filter(m=>m.online).length} online</span></div>${state.members.length?`<div class="members-list">${state.members.map(m=>`<div class="member-row"><span class="avatar">${esc(m.name.slice(0,2).toUpperCase())}</span><div><strong>${esc(m.name)}</strong><small>${m.online?'● Online':'○ Non in linea'} · ${m.ratings?.[pool]?.rating??1200} ${poolNames[pool]}</small></div><button class="quiet-btn" data-challenge-user="${m.id}">Sfida ↗</button><button class="icon-btn" data-friend-tools="${m.id}" title="Gestisci amicizia">⋯</button></div>`).join('')}</div>`:'<div class="empty-state"><span class="empty-icon">♧</span><p>Gli amici accettati compariranno qui.</p></div>'}${state.challenges.filter(c=>c.sender===state.user?.id).map(c=>`<div class="outgoing-challenge"><span>Sfida a <strong>${esc(c.recipient_name)}</strong> · ${c.rated?'Ranked':'Unranked'}</span><button class="icon-btn" data-cancel-challenge="${c.id}" title="Annulla">×</button></div>`).join('')}<div class="separator"></div><button class="quiet-btn full" data-action="create-friend">Crea un link per gli amici</button><button class="quiet-btn full" data-action="show-blocks">Utenti bloccati</button><p class="helper">I link privati funzionano soltanto tra amici accettati.</p></div>`;
}
function adminTabs(){return `<div class="admin-tabs">${[['users','Account'],['logs','Registro'],['stats','Sistema'],['games','Partite']].map(([id,title])=>`<button class="quiet-btn ${state.adminTab===id?'selected':''}" data-admin-tab="${id}">${title}</button>`).join('')}</div>`;}
async function loadAdminTab(){if(!state.user?.admin)return;if(state.adminTab==='users')await loadAccounts();else if(state.adminTab==='logs')await loadAudit();else if(state.adminTab==='stats'){state.adminStats=await api('/admin/stats');renderAccounts();}else{state.adminGames=(await api('/admin/games')).games;renderAccounts();}}
async function loadAudit(){const f=state.logFilter||{};state.audit=await api('/admin/logs?before='+(state.logBefore||0)+'&action='+encodeURIComponent(f.action||'')+'&user='+encodeURIComponent(f.user||'')+'&status='+(f.status||0));if(state.view==='accounts')renderAccounts();}
function renderAccounts(){
 if(!state.user?.admin){$('#panel').innerHTML='<div class="panel-body"><h2>Area riservata</h2></div>';return;}
 let html=adminTabs()+'<div class="panel-body">';
 if(state.adminTab==='logs'){
 const f=state.logFilter||{};html+=`<div class="eyebrow">REGISTRO DI SICUREZZA</div><h2>Accessi e attività</h2><p class="subtle">Ultimi 30 giorni: account, IP, operazione ed esito. Password e token non vengono registrati.</p><form id="audit-filter"><label class="field-label" for="log-user">UTENTE / ID</label><input id="log-user" maxlength="40" value="${esc(f.user||'')}" placeholder="Nome o identificativo"><label class="field-label" for="log-action">OPERAZIONE</label><input id="log-action" value="${esc(f.action||'')}" placeholder="auth.login, password, games…"><label class="toggle-line"><input id="log-errors" type="checkbox" ${f.status?'checked':''}> Solo errori</label><button class="quiet-btn full" type="submit">Filtra registro</button></form><div class="audit-list">${(state.audit?.events||[]).map(e=>`<article class="audit-event"><div><strong>${esc(e.actor_name||'Visitatore')}</strong><span class="audit-status ${e.status>=400?'failed':''}">${e.status}</span></div><code>${esc(e.action)}</code><small>${new Date(e.occurred_at*1000).toLocaleString('it-IT')} · ${esc(e.ip)}</small>${e.subject_id?`<small>Account: ${esc(e.subject_id)}</small>`:''}<details><summary>Dettagli</summary><small>${esc(e.user_agent)}</small><pre>${esc(JSON.stringify(e.details,null,2))}</pre></details></article>`).join('')||'<p class="subtle">Nessun evento per questi filtri.</p>'}</div><div class="copy-row"><button class="quiet-btn" data-action="audit-newest">Più recenti</button><button class="quiet-btn" data-action="audit-older" ${state.audit?.next?'':'disabled'}>Precedenti →</button></div>`;
 }else if(state.adminTab==='stats'){
 const labels={accounts:'Account',online:'Utenti online',streams:'Schede live',active_games:'Partite attive',analysis_running:'Analisi richieste',analysis_queued:'In coda analisi',bot_queued:'Turni bot in coda',matchmaking:'In ricerca partita',auth_failures_day:'Accessi falliti · 24h'};html+=`<div class="eyebrow">STATO DEL SERVIZIO</div><h2>Attività e capacità</h2><div class="system-grid">${Object.entries(labels).map(([k,n])=>`<div><small>${n}</small><strong>${state.adminStats?.[k]??'—'}</strong></div>`).join('')}</div><button class="quiet-btn full" data-action="refresh-admin">Aggiorna</button><p class="helper">La coda è limitata per mantenere fluide le partite. Le analisi già calcolate vengono riutilizzate.</p>`;
 }else if(state.adminTab==='games'){
 html+=`<div class="eyebrow">MODERAZIONE</div><h2>Partite recenti</h2><p class="subtle">Puoi osservare le partite e annullare quelle attive. Un annullamento amministrativo non modifica l’Elo.</p>${(state.adminGames||[]).map(g=>`<div class="moderation-game"><button class="game-card" data-game="${g.id}"><div><strong>${esc(g.white_name)} · ${esc(g.black_name)}</strong><small>${g.rated?'Ranked':'Unranked'} · ${g.status==='active'?'In corso':esc(g.result)} · ${compactTime(g.base,g.increment)}</small></div></button>${['active','waiting'].includes(g.status)?`<button class="quiet-btn danger-btn" data-admin-abort="${g.id}">Annulla partita</button>`:''}</div>`).join('')}<button class="quiet-btn full" data-action="refresh-admin">Aggiorna</button>`;
 }else{
 html+=`<div class="eyebrow">${state.user.owner?'PROPRIETARIO':'AMMINISTRATORE'}</div><h2>${state.accountTotal} account</h2><p class="subtle">Gestisci accessi, password e sessioni. Ogni operazione viene registrata.</p><form id="account-search"><label class="field-label" for="account-query">CERCA UN UTENTE</label><div class="copy-row"><input id="account-query" maxlength="40" value="${esc(state.accountSearch)}" placeholder="Nome utente"><button class="quiet-btn" type="submit">Cerca</button></div></form><div class="account-list">${state.accounts.map(u=>`<div class="account-row"><span class="avatar">${esc(u.name.slice(0,2).toUpperCase())}</span><div><strong>${esc(u.name)}</strong><small>${u.owner?'Proprietario':u.admin?'Amministratore':u.disabled?'Disabilitato':u.online?'Online':'Attivo'} · ${u.games} partite</small><small>${u.last_login?'Ultimo accesso '+new Date(u.last_login*1000).toLocaleDateString('it-IT'):'Nessun accesso registrato'} · ${u.sessions} sessioni</small></div><button class="quiet-btn" data-admin-account="${u.id}">Gestisci</button></div>`).join('')}</div><div class="pagination"><button class="quiet-btn" data-account-page="${state.accountPage-1}" ${state.accountPage<=1?'disabled':''}>←</button><span>${state.accountPage} / ${state.accountPages}</span><button class="quiet-btn" data-account-page="${state.accountPage+1}" ${state.accountPage>=state.accountPages?'disabled':''}>→</button></div>`;
 }
 $('#panel').innerHTML=html+'</div>';
}
function adminConfirmForm(uid,kind,name){
 const reset=kind==='password',role=kind==='role';modal(`<h2>${reset?'Reimposta password':role?'Cambia ruolo':kind==='abort'?'Annulla partita':'Revoca sessioni'}</h2><p>${reset?'Imposta una password temporanea per '+esc(name)+'. Al prossimo accesso dovrà cambiarla.':role?'Il nuovo ruolo richiederà un nuovo accesso.':kind==='abort'?'La partita si chiuderà senza variazioni Elo.':'L’utente verrà disconnesso da tutti i dispositivi.'}</p><form id="admin-confirm-form" data-uid="${esc(uid)}" data-kind="${kind}"><label class="field-label" for="admin-own-password">LA TUA PASSWORD</label><input id="admin-own-password" type="password" required autocomplete="current-password" maxlength="128">${reset?'<label class="field-label" for="admin-new-password">NUOVA PASSWORD TEMPORANEA</label><input id="admin-new-password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"><label class="field-label" for="admin-new-confirm">CONFERMA PASSWORD TEMPORANEA</label><input id="admin-new-confirm" type="password" required minlength="12" maxlength="128" autocomplete="new-password">':''}${role?'<label class="field-label" for="admin-role-select">RUOLO</label><select id="admin-role-select"><option value="1">Amministratore</option><option value="0">Giocatore</option></select>':''}<p class="form-error" id="admin-error"></p><button class="primary-btn full" type="submit">Conferma operazione</button></form>`);
}
function mustChangePassword(){if(!state.user?.must_change_password)return false;disconnectLive();actions['password-form']();$('#modal-content h2').textContent='Scegli la tua nuova password';$('#modal-content p').textContent='La password è stata reimpostata dall’amministratore. Inserisci quella temporanea e scegli una nuova password personale per continuare.';return true;}
async function refreshIdentity(){const me=await api('/me');state.user=me.user;renderProfile();}
Object.assign(actions,{
 'cancel-review':async()=>{await api('/games/'+state.game.id+'/analysis/cancel',{});acceptGame(await api('/games/'+state.game.id));},
 'copy-friend-code':()=>copy((state.friendData?.code||state.user.friend_code).match(/.{1,4}/g).join('-')),
 'find-match':async()=>{if(!ensureUser()||state.findingMatch)return;readSettings();if(!state.base)return toast('Scegli un tempo con orologio.',true);state.findingMatch=true;try{const r=await api('/matchmaking',{base:state.base,increment:state.increment,rated:state.rated});state.matchQueue={...r,entry:{base:state.base,increment:state.increment,rated:state.rated}};clearTimeout(matchExpiryTimer);if(r.queued)matchExpiryTimer=setTimeout(async()=>{state.matchQueue=await api('/matchmaking');if(state.view==='play'&&!state.game)renderPanel();},Math.max(0,(r.expires*1000-Date.now()+500)));if(r.game)openMatchedGame(r.game);else renderOnline();}finally{state.findingMatch=false;}},
 'cancel-match':async()=>{await api('/matchmaking/cancel',{});state.matchQueue={queued:false};renderOnline();},
 'audit-newest':async()=>{state.logBefore=0;await loadAudit();},
 'audit-older':async()=>{state.logBefore=state.audit.next;await loadAudit();},
 'refresh-admin':()=>loadAdminTab(),
 'show-blocks':async()=>{const data=await api('/blocks');modal(`<h2>Utenti bloccati</h2>${data.blocks.map(u=>`<div class="request-row"><strong>${esc(u.name)}</strong><button class="quiet-btn" data-unblock-user="${u.id}">Sblocca</button></div>`).join('')||'<p>Nessun utente bloccato.</p>'}`);}
});
function openMatchedGame(g){state.showOnline=false;state.matchQueue={queued:false};state.showFriends=false;state.review=false;state.flipped=g.color===false;acceptGame(g);setView('play');playGameSound(g.id+':start','start');toast('Avversario trovato. Buona partita!');}
document.addEventListener('click',async e=>{
 const el=e.target.closest('button');if(!el||el.disabled)return;
 try{
  if(el.dataset.friendAccept||el.dataset.friendReject){const uid=el.dataset.friendAccept||el.dataset.friendReject;await api('/friends/'+uid+'/reply',{accept:!!el.dataset.friendAccept});await Promise.all([loadFriends(),loadMembers()]);}
  else if(el.dataset.friendRemove){await api('/friends/'+el.dataset.friendRemove+'/remove',{});closeModal();await Promise.all([loadFriends(),loadMembers(),loadChallenges()]);}
  else if(el.dataset.friendBlock){await api('/friends/'+el.dataset.friendBlock+'/block',{});closeModal();await Promise.all([loadFriends(),loadMembers(),loadChallenges()]);}
  else if(el.dataset.unblockUser){await api('/friends/'+el.dataset.unblockUser+'/unblock',{});closeModal();toast('Utente sbloccato.');}
  else if(el.dataset.friendTools){const u=state.members.find(u=>u.id===el.dataset.friendTools);modal(`<h2>${esc(u.name)}</h2><button class="quiet-btn full" data-friend-remove="${u.id}">Rimuovi amicizia</button><button class="quiet-btn full danger-btn" data-friend-block="${u.id}">Blocca utente</button>`);}
  else if(el.dataset.adminTab){state.adminTab=el.dataset.adminTab;await loadAdminTab();}
  else if(el.dataset.adminAccount){const u=state.accounts.find(u=>u.id===el.dataset.adminAccount),canEdit=!u.owner&&(!u.admin||state.user.owner);modal(`<h2>${esc(u.name)}</h2><p>${u.owner?'Proprietario':u.admin?'Amministratore':u.disabled?'Account disabilitato':'Giocatore'} · ${u.sessions} sessioni</p>${canEdit?`<button class="quiet-btn full" data-admin-password="${u.id}">Reimposta password</button><button class="quiet-btn full" data-admin-revoke="${u.id}">Disconnetti tutti i dispositivi</button>`:''}${!u.admin?`<button class="quiet-btn full ${u.disabled?'':'danger-btn'}" data-account-status="${u.id}" data-disabled="${u.disabled?'0':'1'}">${u.disabled?'Riattiva':'Disabilita'} account</button>`:''}${state.user.owner&&!u.owner&&!u.disabled?`<button class="quiet-btn full" data-admin-role="${u.id}">Cambia ruolo</button>`:''}`);}
  else if(el.dataset.adminPassword||el.dataset.adminRevoke||el.dataset.adminRole){const uid=el.dataset.adminPassword||el.dataset.adminRevoke||el.dataset.adminRole,u=state.accounts.find(u=>u.id===uid);adminConfirmForm(uid,el.dataset.adminPassword?'password':el.dataset.adminRole?'role':'sessions/revoke',u?.name);}
  else if(el.dataset.adminAbort)adminConfirmForm(el.dataset.adminAbort,'abort','');
 }catch(err){toast(err.message,true);}
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!['friend-code-form','admin-confirm-form','audit-filter'].includes(form.id))return;e.preventDefault();const btn=form.querySelector('[type="submit"]');if(btn)btn.disabled=true;
 try{
  if(form.id==='friend-code-form'){await api('/friends/request',{code:$('#friend-code-input').value});await loadFriends();toast('Richiesta di amicizia inviata.');}
  else if(form.id==='audit-filter'){state.logFilter={user:$('#log-user').value,action:$('#log-action').value,status:$('#log-errors').checked?400:0};state.logBefore=0;await loadAudit();}
  else{const {uid,kind}=form.dataset,body={current_password:$('#admin-own-password').value};if(kind==='password'){if($('#admin-new-password').value!==$('#admin-new-confirm').value)throw Error('Le password non coincidono');body.new_password=$('#admin-new-password').value;}if(kind==='role')body.admin=$('#admin-role-select').value==='1';await api(kind==='abort'?'/admin/games/'+uid+'/abort':'/admin/users/'+uid+'/'+kind,body);closeModal();await loadAdminTab();toast('Operazione completata e registrata.');}
 }catch(err){const errEl=form.querySelector('.form-error');if(errEl)errEl.textContent=err.message;else toast(err.message,true);}finally{if(btn)btn.disabled=false;}
});
document.addEventListener('change',e=>{if(e.target.id==='rated-select')state.rated=e.target.value==='1';if(e.target.id==='premove-mode'){state.premoveMode=e.target.value;localStorage.setItem('aura-premove-mode',state.premoveMode);clearPremoves();}});

init();
