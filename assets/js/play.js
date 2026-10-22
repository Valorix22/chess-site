(function(){
 'use strict';
 const A=window.GambitAPI,G=window.Gambit,I=window.GambitIntegration,$=s=>document.querySelector(s),esc=G.esc;
 const state={game:null,board:null,optimistic:null,sending:false,queue:[],view:null,variant:false,pv:-1,mode:'computer',base:600,increment:0,color:'white',rated:true,elo:800,anchor:performance.now(),lastSent:0,localRules:null,sounds:new Set(),matchmaking:false,matchTimer:null,analysis:[]};
 const labelNames={brilliant:'Brillante',book:'Da manuale',best:'Migliore',excellent:'Eccellente',good:'Buona',inaccuracy:'Imprecisione',mistake:'Errore',blunder:'Grave errore'};
 function text(selector,value){const el=$(selector);if(el)el.textContent=value;}
 function tab(name){document.querySelectorAll('[data-play-tab]').forEach(b=>b.classList.toggle('active',b.dataset.playTab===name));document.querySelectorAll('[data-play-pane]').forEach(b=>b.classList.toggle('active',b.dataset.playPane===name));}
 function local(){return state.game?.kind==='local';}
 function current(){if(!state.game)return null;return state.optimistic?{...state.game,...state.optimistic}:state.game;}
 function sound(key,san,options){if(state.sounds.has(key))return;state.sounds.add(key);if(state.sounds.size>300)state.sounds.delete(state.sounds.values().next().value);G.Sound.move(san,options);}
 function initial(){return window.ChessUtils.START_FEN;}
 function projectedFen(map,fen){let rows=[];for(let rank=8;rank>=1;rank--){let row='',gap=0;for(const file of 'abcdefgh'){const p=map[file+rank];if(p){if(gap)row+=gap;gap=0;row+=p;}else gap++;}if(gap)row+=gap;rows.push(row);}return rows.join('/')+' '+fen.split(' ').slice(1).join(' ');}
 function selectedRow(){const g=state.game;return g?.analysis?.[(state.view??g.ply)-1];}
 function draw(){
  const g=current();if(!g)return;
  let fen=state.view===null?g.fen:(state.view===0?g.initial_fen:g.history[state.view-1]?.fen||g.fen);
  const r=selectedRow();if(state.variant&&r)fen=state.pv>=0?r.pv_fens[state.pv]||r.before_fen:r.before_fen;
  const canAct=state.view===null&&g.status==='active'&&!state.variant&&(local()||typeof g.color==='boolean');
  let projection=null;const premoving=canAct&&!local()&&(g.turn!==g.color||state.sending||state.queue.length>0);
  if(premoving&&state.queue.length){projection=window.BoardTools.projectQueue(g.fen,state.queue,g.color);fen=projectedFen(projection.map,g.fen);}
  if(!projection)projection=window.BoardTools.projectQueue(g.fen,[],g.color);
  const moves=g.history||[],last=moves[Math.max(0,(state.view??g.ply)-1)];const lastMove=last?{from:last.uci.slice(0,2),to:last.uci.slice(2,4)}:null;
  const options={last:lastMove,check:state.view===null?g.check:null,orientation:state.flipped?'black':'white'};
  Object.assign(state.board.opts,{playerColor:local()?null:g.color?'w':'b',allowPremove:premoving,premoveMap:projection.map,premoveRights:projection.rights,premoveSquares:state.queue.flatMap(q=>[q.slice(0,2),q.slice(2,4)]),result:g.status==='finished'?g.result:null,fast:state.sending,bestArrow:state.variant&&r?{from:r.best_uci.slice(0,2),to:r.best_uci.slice(2,4),best:true}:null});
  state.board.disabled=!canAct;state.board.setPosition(fen,options);
  const history=state.view!==null;
  $('#review-badge').classList.toggle('visible',history);$('#review-badge').style.display=history?'flex':'none';text('#review-move',state.view||0);
  const ownWhite=!state.flipped,topWhite=!ownWhite;const topName=topWhite?g.white_name:g.black_name,bottomName=ownWhite?g.white_name:g.black_name;
  text('#top-name',topName);text('#bottom-name',bottomName);text('#top-avatar',G.initials(topName));text('#bottom-avatar',G.initials(bottomName));
  text('#top-sub',(topWhite?'Bianco':'Nero')+' · '+(topWhite?g.white_rating??'—':g.black_rating??'—'));text('#bottom-sub',(ownWhite?'Bianco':'Nero')+' · '+(ownWhite?g.white_rating??'—':g.black_rating??'—'));
  text('#rated-badge',g.rated?'Ranked':local()?'Locale · senza Elo':'Unranked');text('#tc-badge',g.base?g.base/60+'+'+g.increment:'Senza tempo');text('#game-length',g.ply+' semimosse');text('#game-mode-label',local()?'Pass-and-play':g.kind==='bot'?'Stockfish · '+g.elo:g.rated?'Online ranked':'Online unranked');
  text('#opening-name',g.opening?.name||'Posizione iniziale');text('#opening-name-2',g.opening?.name||'Apertura');
  text('#game-status',g.status==='finished'?g.result+' · '+g.reason:g.status==='waiting'?'In attesa di un amico':local()?(g.turn?'Muove il Bianco':'Muove il Nero'):g.bot_error?'Il bot deve riprovare':g.turn===g.color?'Tocca a te':'Tocca all’avversario');
  text('#game-status-sub',(g.rated?'Ranked':'Unranked')+' · '+(g.base/60)+'+'+g.increment);text('#turn-badge',g.status==='active'?(g.turn?'Bianco':'Nero'):g.status==='finished'?'Conclusa':'Invito');
  const visibleMoves=(g.history||[]).slice(0,state.variant&&r?r.index:(state.view??g.ply)).map(m=>m.uci);
  try{const material=window.BoardTools.materialSummary(g.initial_fen,visibleMoves,premoving&&state.queue.length?g.fen:fen,state.variant&&r?r.pv.slice(0,state.pv+1):[]);for(const [selector,side]of [['#top-captured',topWhite?'w':'b'],['#bottom-captured',ownWhite?'w':'b']]){const enemy=side==='w'?'b':'w';$(selector).innerHTML=material.taken[side].map(p=>I.piece(enemy+p.toUpperCase())).join('')+(material.advantage[side]?'<b>+'+material.advantage[side]+'</b>':'');}}catch{}
  $('#real-premove-bar').hidden=!state.queue.length;$('#real-premove-bar').innerHTML=state.queue.length?'<span>Premosse: '+state.queue.map(esc).join(' → ')+'</span><button class="btn btn-sm" data-clear-premoves>Annulla tutte</button>':'';
  const drawOffer=$('#real-draw-offer');drawOffer.hidden=!(g.draw_offer&&g.draw_offer!==window.GambitSession.user?.id&&g.status==='active');
  document.querySelectorAll('[data-play-action="hint"],[data-play-action="undo"]').forEach(b=>b.disabled=!(local()||g.kind==='bot')||g.status!=='active');
  renderMoves();renderReview();clocks();
 }
 function renderMoves(){const g=current();if(!g)return;let html='';for(let i=0;i<g.history.length;i+=2){html+='<div class="move-row"><span class="move-number">'+(i/2+1)+'.</span>'+[i,i+1].map(j=>g.history[j]?'<button data-ply="'+(j+1)+'" class="move '+((state.view??g.ply)===j+1?'active':'')+'">'+esc(g.history[j].san)+(g.analysis?.[j]?'<small class="move-quality '+g.analysis[j].label+'">'+esc(labelNames[g.analysis[j].label]||'')+'</small>':'')+'</button>':'<span></span>').join('')+'</div>';}
  $('#move-table').innerHTML=html||I.empty('Le mosse appariranno qui.');text('#moves-count',g.ply+' semimosse');if(state.view===null)$('#moves-scroll').scrollTop=$('#moves-scroll').scrollHeight;
 }
 function format(seconds,active){if(seconds===null)return '∞';const n=Math.max(0,seconds);return Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0')+(active&&n<10?'.'+Math.floor(n*10)%10:'');}
 function clocks(){const g=current();if(!g)return;const elapsed=g.status==='active'?Math.max(0,performance.now()-state.anchor)/1000:0;const remaining=side=>g.base?Math.max(0,g.clocks[side?1:0]-(g.turn===side?elapsed:0)):null;const bottomWhite=!state.flipped;for(const [selector,color]of [['#clock-top',!bottomWhite],['#clock-bottom',bottomWhite]]){const el=$(selector),value=remaining(color);el.textContent=format(value,g.turn===color);el.classList.toggle('active',g.status==='active'&&g.turn===color);el.classList.toggle('low',value!==null&&value<20);}
  if(local()&&g.status==='active'&&g.base&&remaining(g.turn)<=0){g.result=g.turn?'0-1':'1-0';g.status='finished';g.reason='Tempo esaurito (locale)';draw();}
 }
 function merge(snapshot){
  const old=state.game;if(old&&snapshot.id===old.id&&(snapshot.revision||0)<(old.revision||0))return;
  if(old&&old.id===snapshot.id&&!Array.isArray(snapshot.analysis)){let rows=[...(old.analysis||[])];for(const r of snapshot.analysis_batch||[])rows[r.index]=r;snapshot.analysis=rows.filter(Boolean);if(snapshot.analysis_count>snapshot.analysis.length)sync().catch(()=>{});}
  if(state.optimistic&&snapshot.ply>=state.optimistic.ply){const index=state.optimistic.ply-1;if(snapshot.history[index]?.uci!==state.optimistic.uci)clearQueue();state.optimistic=null;}
  state.game=snapshot;state.anchor=performance.now();
  if(old&&snapshot.ply>old.ply&&snapshot.history.length){const last=snapshot.history.at(-1);sound(snapshot.id+':'+snapshot.ply,last.san,{opponent:snapshot.turn===snapshot.color});}
  if(old&&old.status!=='finished'&&snapshot.status==='finished'){clearQueue();const won=snapshot.result===(snapshot.color?'1-0':'0-1');G.Sound.play(snapshot.result==='1/2-1/2'?'draw':won?'win':'loss');resultDialog();}
  draw();if(!state.sending)executeQueue();
 }
 async function sync(){if(state.game&&!local()){const data=await A.get('/games/'+state.game.id);merge(data);}}
 function clearQueue(){state.queue=[];if(state.board)draw();}
 function enqueue(uci){const mode=G.settings.premoveMode||'multiple';if(mode==='off'){G.toast('Le premosse sono disattivate.','info');return;}const max=mode==='single'?1:5;if(state.queue.length>=max){G.toast('Limite di '+max+' premosse raggiunto.','info');return;}const g=current(),p=window.BoardTools.projectQueue(g.fen,state.queue,g.color);if(!window.BoardTools.canPremove(p.map,uci.slice(0,2),uci.slice(2,4),g.color,p.rights)){G.Sound.play('illegal');return;}state.queue.push(uci);draw();}
 function executeQueue(){const g=state.game;if(!g||g.status!=='active'||state.sending||g.turn!==g.color||!state.queue.length)return;const wait=Math.max(0,100-(performance.now()-state.lastSent));setTimeout(()=>{if(state.sending||!state.queue.length||state.game.turn!==state.game.color)return;const uci=state.queue.shift();send(uci,true);},wait);}
 async function send(uci,premove=false){
  const g=state.game;if(!g||g.status!=='active')return;
  if(!local()&&(g.turn!==g.color||state.sending)){enqueue(uci);return;}
  const rules=local()?state.localRules:new window.ChessRules(g.fen);let move;
  try{move=rules.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});}catch{}
  if(!move){state.queue=[];G.Sound.play('illegal');draw();return;}
  if(local()){
   if(g.base)g.clocks[g.turn?1:0]=Math.max(0,g.clocks[g.turn?1:0]-(performance.now()-state.anchor)/1000)+g.increment;
   g.moves.push(uci);g.history.push({uci,san:move.san,fen:rules.fen()});g.ply=g.moves.length;g.fen=rules.fen();g.turn=rules.turn()==='w';g.last=Date.now()/1000;state.anchor=performance.now();g.check=rules.isCheck()?rules.board().flat().find(p=>p?.type==='k'&&p.color===rules.turn())?.square:null;sound(g.id+':'+g.ply,move.san,{});
   if(rules.isGameOver()){g.status='finished';g.result=rules.isCheckmate()?(g.turn?'0-1':'1-0'):'1/2-1/2';g.reason=rules.isCheckmate()?'Scaccomatto':'Patta';resultDialog();}draw();return;
  }
  state.sending=true;state.lastSent=performance.now();const oldPly=g.ply;
  const optimisticClocks=[...g.clocks];if(g.base)optimisticClocks[g.turn?1:0]=Math.max(0,optimisticClocks[g.turn?1:0]-(performance.now()-state.anchor)/1000)+g.increment;state.anchor=performance.now();
  state.optimistic={clocks:optimisticClocks,fen:rules.fen(),ply:g.ply+1,uci,turn:rules.turn()==='w',history:[...g.history,{uci,san:move.san,fen:rules.fen()}]};sound(g.id+':'+(g.ply+1),move.san,{premove});draw();
  try{merge(await A.post('/games/'+g.id+'/move',{uci,expected_ply:oldPly,premove}));}
  catch(error){state.optimistic=null;state.queue=[];G.toast(error.message,'error');await sync().catch(()=>{});}
  finally{state.sending=false;draw();executeQueue();}
 }
 function onMove(from,to,promotion){const uci=from+to+(promotion?promotion.toLowerCase():'');if(state.board.opts.allowPremove)enqueue(uci);else send(uci);}
 function renderReview(){
  const g=state.game,host=$('#real-review');if(!g||!host)return;if(g.status!=='finished'){host.innerHTML=I.empty('L’analisi sarà disponibile al termine della partita.');return;}
  if(local()){host.innerHTML=I.empty('Scarica il PGN e importalo per analizzare la partita locale.');return;}
  const rows=g.analysis||[],summary=g.analysis_summary||{},r=selectedRow();
  host.innerHTML='<div class="row gap-8 wrap"><button class="btn btn-primary btn-sm" data-analyse="quick" '+(g.analysis_status==='running'?'disabled':'')+'>Analisi rapida</button><button class="btn btn-sm" data-analyse="deep" '+(g.analysis_status==='running'?'disabled':'')+'>Approfondita</button>'+(g.analysis_status==='running'?'<button class="btn btn-sm" data-cancel-analysis>Interrompi</button>':'')+'</div><p class="tiny muted">'+esc(g.analysis_status==='running'?'Analisi in corso: '+rows.length+' / '+g.ply:g.analysis_status==='error'?g.analysis_error||'Analisi interrotta':rows.length?'Analisi '+(g.analysis_mode==='deep'?'approfondita':'rapida')+' · '+(g.analysis_elapsed||0)+' s':'Stockfish analizza su richiesta, alla massima forza.')+'</p>'+(rows.length?'<div class="review-scores">'+['white','black'].map((side,i)=>'<div><b>'+esc(i?g.black_name:g.white_name)+'</b><strong>'+esc(summary[side]?.accuracy??'—')+'%</strong><div>'+Object.entries(summary[side]?.counts||{}).map(([k,v])=>'<span class="quality-count '+k+'">'+esc(labelNames[k]||k)+' '+v+'</span>').join('')+'</div></div>').join('')+'</div>':'')+(rows.length?'<div class="review-move-picker" aria-label="Scegli la mossa da analizzare">'+rows.map((row,i)=>'<button class="btn btn-sm '+(selectedRow()===row?'active':'')+'" data-ply="'+(i+1)+'">'+Math.floor(i/2+1)+(i%2?'…':'.')+' '+esc(row.san)+' <span class="move-quality '+row.label+'">'+esc(labelNames[row.label]||row.label)+'</span></button>').join('')+'</div>':'')+(r?'<div class="review-move-detail"><span class="badge '+r.label+'">'+esc(labelNames[r.label]||r.label)+'</span><h3>'+esc(r.san)+'</h3><p>'+esc(r.explanation)+'</p><button class="btn btn-sm" data-best-move>'+(state.variant?'Mostra la partita':'Mostra e spiega la mossa migliore')+'</button><p class="small">Migliore: <b>'+esc(r.best_san)+'</b></p>'+(state.variant?'<div class="row gap-6 wrap">'+r.pv.map((san,i)=>'<button class="btn btn-sm" data-pv="'+i+'">'+esc(san)+'</button>').join('')+'</div>':'')+'</div>':rows.length?'<p class="small muted">Scegli una mossa nello storico per la spiegazione.</p>':'');
 }
 function resultDialog(){const g=state.game;const color=g.color,won=g.result===(color?'1-0':'0-1');text('#result-title','Partita conclusa');text('#result-headline',g.result==='1/2-1/2'?'Patta':local()?g.result:won?'Hai vinto':'Partita persa');text('#result-reason',g.reason);text('#result-moves',g.ply+' semimosse');text('#result-accuracy',g.analysis_summary?.[color?'white':'black']?.accuracy?g.analysis_summary[color?'white':'black'].accuracy+'%':'Da analizzare');text('#result-time','—');const change=g.rating_change?.[g.color?'white':'black']?.delta;text('#result-rating',g.rated&&change!==undefined?(change>0?'+':'')+change+' Elo':'Partita senza variazione Elo');G.openModal('game-over-modal');}
 async function openGame(id){let data;try{data=await A.get('/games/'+encodeURIComponent(id));}catch(error){if(error.status!==403)throw error;const ok=await G.confirm({title:'Entra nella partita',text:'La stanza è riservata agli amici del creatore.',confirm:'Entra'});if(!ok)return;data=await A.post('/games/'+encodeURIComponent(id)+'/join');}state.flipped=data.color===false;state.queue=[];state.optimistic=null;state.view=null;state.variant=false;merge(data);history.replaceState(null,'','/play.html?game='+encodeURIComponent(data.id));tab(data.status==='finished'?'analysis':'moves');}
 async function start(){
  if(state.game?.status==='active'&&!await G.confirm({title:'Aprire un’altra partita?',text:'La partita attuale resta attiva e il suo tempo continua.',confirm:'Continua'}))return;
  if(state.mode==='local'){const rules=new window.ChessRules();state.localRules=rules;state.flipped=state.color==='black';state.view=null;state.optimistic=null;state.queue=[];state.game={id:'local',kind:'local',initial_fen:initial(),fen:rules.fen(),moves:[],history:[],ply:0,turn:true,color:true,status:'active',result:'*',reason:'',base:state.base,increment:state.increment,clocks:[state.base,state.base],white_name:'Bianco locale',black_name:'Nero locale',analysis:[],created:Date.now()/1000};state.anchor=performance.now();history.replaceState(null,'','/play.html?mode=local');draw();G.Sound.play('start');tab('moves');return;}
  if(state.mode==='online'){state.matchmaking=true;const result=await A.post('/matchmaking',{base:state.base,increment:state.increment,rated:state.rated});if(result.game){state.matchmaking=false;await openGame(result.game.id);}else{text('#start-game','Annulla ricerca');pollMatch();}return;}
  const g=await A.post('/games',{kind:'bot',elo:state.elo,color:state.color,base:state.base,increment:state.increment,rated:false});await openGame(g.id);G.Sound.play('start');
 }
 async function pollMatch(){if(!state.matchmaking)return;try{const q=await A.get('/matchmaking');if(!q.queued){state.matchmaking=false;text('#start-game','Inizia partita');const lobby=await A.get('/lobby');const game=lobby.games.find(g=>g.status==='active'&&g.matchmaking);if(game)await openGame(game.id);return;}}catch(error){G.toast(error.message,'error');}clearTimeout(state.matchTimer);state.matchTimer=setTimeout(pollMatch,2000);}
 async function gameAction(action){const g=state.game;if(action==='new-game'){tab('new');return;}if(action==='tools'){const m=G.createModal({title:'Partita e PGN',body:(g?'<div class="row gap-8 wrap"><button class="btn" id="copy-game-fen">Copia FEN</button><button class="btn" id="download-game-pgn">Scarica PGN</button><button class="btn" id="report-game">Segnala partita</button></div>':'')+'<form id="import-game-pgn" class="stack gap-12 mt-16"><label>Importa PGN<textarea class="input" name="pgn" maxlength="100000" required></textarea></label><button class="btn btn-primary">Importa per analizzare</button></form>'});m.el.querySelector('#copy-game-fen')?.addEventListener('click',()=>I.run(async()=>{await navigator.clipboard.writeText(state.board.fen);G.toast('FEN copiato.');}));m.el.querySelector('#download-game-pgn')?.addEventListener('click',()=>I.run(async()=>{const pgn=local()?state.localRules.pgn():await A.get('/games/'+g.id+'/pgn');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([pgn],{type:'application/x-chess-pgn'}));a.download='partita-'+g.id+'.pgn';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}));m.el.querySelector('#report-game')?.addEventListener('click',()=>{if(local())return;const r=G.createModal({title:'Segnala partita',body:'<form class="stack gap-12"><label>Motivo<textarea class="input" name="reason" maxlength="1000" required></textarea></label><button class="btn btn-primary">Invia segnalazione</button></form>'});r.el.querySelector('form').onsubmit=event=>{event.preventDefault();const f=event.currentTarget;I.run(async()=>{await A.post('/platform/reports',{kind:'game',target:g.id,reason:f.elements.namedItem('reason').value});r.close();G.toast('Segnalazione inviata.');},f.querySelector('button'));};});m.el.querySelector('#import-game-pgn').onsubmit=event=>{event.preventDefault();const f=event.currentTarget;I.run(async()=>{const game=await A.post('/import',{pgn:f.elements.namedItem('pgn').value});m.close();await openGame(game.id);},f.querySelector('button'));};return;}if(action==='flip'){state.flipped=!state.flipped;if(g)draw();else state.board.flip();return;}if(action==='return-live'){state.view=null;state.variant=false;draw();return;}if(!g)return;
  if(action==='copy-pgn'){const pgn=local()?state.localRules.pgn():await A.get('/games/'+g.id+'/pgn');await navigator.clipboard.writeText(pgn);G.toast('PGN copiato.');return;}
  if(action==='review'||action==='analyse'||action==='analyze'){G.closeModal('game-over-modal');tab('analysis');if(!g.analysis?.length)await A.post('/games/'+g.id+'/analysis',{mode:'quick'});await sync();return;}
  if(action==='undo'){if(local()){state.localRules.undo();g.moves.pop();g.history.pop();g.ply=g.moves.length;g.fen=state.localRules.fen();g.turn=state.localRules.turn()==='w';draw();}else merge(await A.post('/platform/games/'+g.id+'/undo'));return;}
  if(action==='hint'){if(local()){G.toast('Gli aiuti Stockfish sono disponibili nelle partite contro il computer.','info');return;}const job=await A.post('/platform/games/'+g.id+'/hint');let tries=0;async function wait(){const result=await A.get('/platform/hints/'+job.id);if(result.status==='pending'&&tries++<30){setTimeout(()=>I.run(wait),500);return;}if(result.uci){state.board.opts.bestArrow={from:result.uci.slice(0,2),to:result.uci.slice(2,4),best:true};state.board.renderAnnotations();G.toast('Suggerimento: '+result.uci);}else G.toast('La posizione è cambiata. Richiedi un altro suggerimento.','info');}await wait();return;}
  if(action==='draw'||action==='resign'){const ok=await G.confirm({title:action==='draw'?'Proporre patta?':'Abbandonare la partita?',text:local()?'Partita locale senza Elo.':g.rated?'Il risultato aggiornerà l’Elo.':'La partita non modifica l’Elo.',confirm:action==='draw'?'Proponi':'Abbandona'});if(!ok)return;if(local()){g.result=action==='draw'?'1/2-1/2':g.turn?'0-1':'1-0';g.reason=action==='draw'?'Patta locale':'Abbandono locale';g.status='finished';draw();resultDialog();}else merge(await A.post('/games/'+g.id+'/'+action));}
 }
 function renderFriends(){const host=$('#play-friends');host.innerHTML=G.friends.length?G.friends.map(f=>'<div class="friend-row">'+G.avatar(f)+'<span class="grow">'+esc(f.name)+'</span><button class="btn btn-sm" data-challenge="'+esc(f.id)+'">Sfida</button></div>').join(''):I.empty('Aggiungi un amico tramite codice.','<button class="btn btn-sm" data-add-friend>Aggiungi amico</button>');}
 window.GambitPageReady=(async()=>{
  state.flipped=false;
  const frame=$('#play-board').parentElement;const bar=document.createElement('div');bar.id='real-premove-bar';bar.className='real-premove-bar';bar.hidden=true;frame.append(bar);
  const offer=document.createElement('div');offer.id='real-draw-offer';offer.className='card draw-offer';offer.hidden=true;offer.innerHTML='<p>L’avversario propone patta.</p><button class="btn btn-sm" data-draw-answer="accept">Accetta</button> <button class="btn btn-sm" data-draw-answer="decline">Rifiuta</button>';frame.append(offer);
  const tabs=$('.game-panel .tabs'),reviewTab=document.createElement('button');reviewTab.dataset.playTab='analysis';reviewTab.textContent='Analisi';tabs.append(reviewTab);const pane=document.createElement('div');pane.className='tab-pane';pane.dataset.playPane='analysis';pane.id='real-review';$('.game-panel-body').append(pane);
  const more=document.createElement('button');more.className='btn btn-sm';more.dataset.playAction='tools';more.textContent='PGN / FEN';$('.play-topbar>.row:last-child').append(more);
  const modes=$('#mode-pills');modes.insertAdjacentHTML('beforeend','<button data-mode="online">Online</button>');
  $('#level-dots').outerHTML='<select id="real-bot-elo" class="input">'+[200,400,600,800,1000,1200,1320,1600,1800,2000,2400,2800,3190].map(v=>'<option value="'+v+'" '+(v===800?'selected':'')+'>'+v+' Elo</option>').join('')+'</select>';text('#level-label','Stockfish');
  $('#rated-switch').classList.remove('on');$('#rated-switch').disabled=true;
  state.board=new window.ChessBoard('#play-board',{interactive:false,fen:initial(),onMove,onCancelPremoves:clearQueue});
  text('#top-name','Stockfish');text('#bottom-name',G.user.name);text('#bottom-avatar',G.initials(G.user.name));text('#top-sub','Scegli la difficoltà');text('#bottom-sub','Pronto a giocare');text('#game-status','La prossima mossa è tua');text('#game-status-sub','Scegli avversario e tempo');text('#rated-badge','Unranked');
  renderFriends();
  document.addEventListener('gambit:friends',renderFriends);
  document.addEventListener('gambit:realtime',event=>{const payload=event.detail;if(payload.type==='game'&&payload.game.id===state.game?.id)merge(payload.game);if(payload.type==='match_found'&&state.matchmaking){state.matchmaking=false;clearTimeout(state.matchTimer);text('#start-game','Inizia partita');I.run(()=>openGame(payload.game.id));}if(['ready','resync'].includes(payload.type))sync().catch(()=>{});if(payload.type==='rematch'&&payload.previous===state.game?.id)I.run(()=>openGame(payload.game_id));if(payload.type==='chat'&&payload.payload?.channel==='game'&&payload.payload.scope===state.game?.id)loadChat();});
  document.addEventListener('click',event=>{const b=event.target.closest('button,[data-play-tab],[data-time]');if(!b)return;
   if(b.dataset.playTab){tab(b.dataset.playTab);if(b.dataset.playTab==='chat')loadChat();return;}
   if(b.dataset.mode){state.mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));$('#rated-switch').disabled=state.mode!=='online';$('#rated-switch').classList.toggle('on',state.mode==='online'&&state.rated);text('#setup-summary',state.mode+' · '+state.base/60+'+'+state.increment);return;}
   if(b.dataset.time){[state.base,state.increment]=b.dataset.time.split('+').map(Number);state.base*=60;document.querySelectorAll('#time-grid .time-opt').forEach(x=>x.classList.toggle('active',x===b));return;}
   if(b.dataset.playColor){state.color=b.dataset.playColor;document.querySelectorAll('[data-play-color]').forEach(x=>x.classList.toggle('active',x===b));return;}
   if(b.id==='rated-switch'){state.rated=!state.rated;b.classList.toggle('on',state.rated);return;}
   if(b.id==='start-game'){I.run(async()=>{if(state.matchmaking){await A.post('/matchmaking/cancel');state.matchmaking=false;clearTimeout(state.matchTimer);text('#start-game','Inizia partita');}else await start();},b);return;}
   if(b.dataset.playAction){I.run(()=>gameAction(b.dataset.playAction),b);return;}
   if(b.hasAttribute('data-clear-premoves')){clearQueue();return;}
   if(b.dataset.ply){state.view=Number(b.dataset.ply);state.variant=false;draw();return;}
   if(b.dataset.review){const g=state.game;if(!g)return;const p=state.view??g.ply;state.view=b.dataset.review==='first'?0:b.dataset.review==='last'?null:Math.max(0,Math.min(g.ply,p+(b.dataset.review==='next'?1:-1)));state.variant=false;draw();return;}
   if(b.dataset.analyse){I.run(async()=>{await A.post('/games/'+state.game.id+'/analysis',{mode:b.dataset.analyse,force:state.game.analysis_status==='done'});await sync();},b);return;}
   if(b.hasAttribute('data-cancel-analysis')){I.run(async()=>{await A.post('/games/'+state.game.id+'/analysis/cancel');await sync();},b);return;}
   if(b.hasAttribute('data-best-move')){state.variant=!state.variant;state.pv=-1;draw();return;}
   if(b.dataset.pv!==undefined){state.pv=Number(b.dataset.pv);draw();return;}
   if(b.dataset.drawAnswer){I.run(async()=>{if(b.dataset.drawAnswer==='accept')merge(await A.post('/games/'+state.game.id+'/draw'));else{await A.post('/platform/games/'+state.game.id+'/decline-draw');await sync();}},b);return;}
   if(b.id==='rematch-btn'){I.run(async()=>{if(local()){G.closeModal('game-over-modal');await start();}else{const result=await A.post('/platform/games/'+state.game.id+'/rematch');G.closeModal('game-over-modal');if(result.game_id)await openGame(result.game_id);else G.toast('Rivincita proposta. Attendo la risposta.');}},b);return;}
   if(b.hasAttribute('data-add-friend'))I.friendDialog();
  });
  $('#real-bot-elo').onchange=event=>{state.elo=Number(event.target.value);};
  document.addEventListener('keydown',event=>{if(event.defaultPrevented)return;if(event.target.closest('input,textarea,select')||document.querySelector('.modal-backdrop.open'))return;if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)&&state.game){event.preventDefault();if(event.key==='Home')state.view=0;else if(event.key==='End')state.view=null;else state.view=Math.max(0,Math.min(state.game.ply,(state.view??state.game.ply)+(event.key==='ArrowRight'?1:-1)));state.variant=false;draw();}});
  $('#game-chat-form').onsubmit=event=>{event.preventDefault();const input=$('#game-chat-input');I.run(async()=>{if(!state.game||local())throw Error('Avvia una partita online.');await A.post('/platform/messages/game/'+state.game.id,{text:input.value});input.value='';await loadChat();});};
  setInterval(clocks,100);const query=new URLSearchParams(location.search);const id=query.get('game');if(id)await openGame(id);else{
   const lobby=await A.get('/lobby');const games=lobby.games.filter(g=>g.status!=='finished');if(games.length){const host=document.createElement('div');host.className='resume-games mt-16';host.innerHTML='<h4>Partite da riprendere</h4>'+games.map(g=>'<a class="btn btn-sm" href="/play.html?game='+esc(g.id)+'">'+esc(g.white_name)+' · '+esc(g.black_name)+'</a>').join('');$('[data-play-pane="new"]').append(host);}
   if(query.get('mode')==='local'){state.mode='local';await start();}else if(query.get('mode')==='online')document.querySelector('[data-mode="online"]').click();
  }
 })();
 async function loadChat(){if(!state.game||local())return;const data=await A.get('/platform/messages/game/'+state.game.id);$('#game-chat').innerHTML=data.items.map(m=>'<div class="chat-msg"><b>'+esc(m.name)+':</b><span>'+esc(m.body)+'</span></div>').join('')||I.empty('Nessun messaggio.');}
})();
