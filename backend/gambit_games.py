"""Casual-only helpers, consensual rematches and private, queued bot hints."""
import json
import secrets
import time
import chess
from fastapi import Body,HTTPException,Request


def install(s,e):
    app,db,lock,hub=e['app'],e['db'],e['lock'],e['hub'];actor=e['actor'];hints={}
    original_public=s['public_game']
    def public_game(g,u,detail=True):
        value=original_public(g,u,detail);value['matchmaking']=bool(g.get('matchmaking'));value['public']=bool(g.get('public'))
        if detail:
            from review import BOOK,position_key
            found=None
            for item in reversed(s['cached_history'](g['initial_fen'],tuple(g['moves'][:40]))):
                found=BOOK['positions'].get(' '.join(item['fen'].split()[:4]))
                if found:break
            value.update(opening=found,rematch_requests=g.get('rematch_requests',[]),rematch_game=g.get('rematch_game'))
        return value
    s['public_game']=public_game
    def allowed(g,u):
        s['participant'](g,u)
        if g['kind']!='bot' or g.get('rated'):raise HTTPException(403,'Funzione disponibile solo contro il computer')
    @app.post('/api/platform/games/{gid}/undo')
    def undo(gid:str,request:Request):
        with lock:
            u=actor(request,'undo',60);g=s['get_game'](gid);allowed(g,u)
            if gid in s['pending_bots']:raise HTTPException(409,'Attendi la risposta del computer')
            if not g['moves']:raise HTTPException(409,'Non ci sono mosse da annullare')
            board=s['board_of'](g);turn=board.turn
            if g['status']=='active' and g['base']:g['clocks'][int(turn)]=max(0,g['clocks'][int(turn)]-max(0,time.time()-g['last']))
            for _ in range(min(2,len(g['moves']))):
                board.pop();g['moves'].pop()
                if g['base']:g['clocks'][int(board.turn)]=max(0,g['clocks'][int(board.turn)]-g['increment'])
                if board.turn==s['seat'](g,u['id']):break
            g.update(status='active',result='*',reason='',last=time.time(),analysis=[],analysis_status='idle',draw_offer=None)
            s['save'](g);s['schedule_bot'](g);return s['public_game'](g,u)
    @app.post('/api/platform/games/{gid}/hint')
    def hint(gid:str,request:Request):
        with lock:
            u=actor(request,'hint',20,86400);g=s['get_game'](gid);allowed(g,u);s['tick'](g)
            if g['status']!='active' or s['board_of'](g).turn!=s['seat'](g,u['id']):raise HTTPException(409,'Attendi il tuo turno')
            now=time.time()
            for key in list(hints):
                if hints[key]['created']<now-120:hints.pop(key)
            if sum(x['status']=='pending' for x in hints.values())>=8:raise HTTPException(429,'Coda suggerimenti piena')
            if any(x['user']==u['id'] and x['status']=='pending' for x in hints.values()):raise HTTPException(409,'Hai già un suggerimento in coda')
            s['rate_action'](u['id'],'analysis-plies',12000,86400)
            jid=e['uid']();hints[jid]={'user':u['id'],'game':gid,'moves':list(g['moves']),'initial_fen':g['initial_fen'],'created':now,'status':'pending'};s['analysis_work'].put(({'kind':'hint','id':jid},None));return {'id':jid,'status':'pending'}
    def hint_worker(jid):
        with lock:
            task=hints.get(jid)
            if not task:return
            g=s['get_game'](task['game'])
            if g['status']!='active' or g['moves']!=task['moves']:task['status']='stale';return
            board=s['board_of'](g)
        try:
            result=s['ensure_review_service']().evaluate(board,'quick')
            with lock:
                latest=s['get_game'](task['game'])
                if latest['moves']!=task['moves'] or latest['status']!='active':task['status']='stale'
                else:task.update(status='done',uci=(result.get('pv') or [None])[0])
                hub.send(task['user'],{'type':'hint','id':jid,'game_id':task['game']})
        except Exception:
            task['status']='error'
    s['gambit_hint_worker']=hint_worker
    @app.get('/api/platform/hints/{jid}')
    def read_hint(jid:str,request:Request):
        with lock:
            u=actor(request);task=hints.get(jid)
            if not task or task['user']!=u['id']:raise HTTPException(404,'Suggerimento non trovato')
            return {k:task.get(k) for k in ('status','uci')}
    @app.post('/api/platform/games/{gid}/decline-draw')
    def decline_draw(gid:str,request:Request):
        with lock:
            u=actor(request);g=s['get_game'](gid);s['participant'](g,u)
            if g['draw_offer'] and g['draw_offer']!=u['id']:g['draw_offer']=None;s['save'](g)
            return {'ok':True}
    @app.post('/api/platform/games/{gid}/abort')
    def abort(gid:str,request:Request):
        with lock:
            u=actor(request);g=s['get_game'](gid);s['participant'](g,u)
            if len(g['moves'])>1 or time.time()-g['created']>30:raise HTTPException(409,'La partita non può più essere annullata')
            if g['status']=='finished':raise HTTPException(409,'Partita conclusa')
            s['finish'](g,'*','Partita annullata prima dell’avvio');return s['public_game'](g,u)
    @app.post('/api/platform/games/{gid}/rematch')
    def rematch(gid:str,request:Request):
        with lock:
            u=actor(request,'rematch',20);g=s['get_game'](gid);s['participant'](g,u)
            if g['status']!='finished' or g['kind']=='import':raise HTTPException(409,'Concludi prima la partita')
            if g.get('rematch_game'):return {'game_id':g['rematch_game']}
            if g['kind']=='bot':
                new=s['create_game'](s['NewGame'](kind='bot',elo=g['elo'],color='black' if s['seat'](g,u['id']) else 'white',base=g['base'],increment=g['increment']),request)
                return {'game_id':new['id']}
            other=g['black'] if g['white']==u['id'] else g['white']
            if not other or s['blocked'](u['id'],other):raise HTTPException(403,'Rivincita non disponibile')
            requests=set(g.get('rematch_requests',[]));requests.add(u['id']);g['rematch_requests']=list(requests)
            if other not in requests:
                s['save'](g);e['notify'](other,'rematch','Richiesta di rivincita',u['name'],'/play.html?game='+gid);return {'pending':True}
            if any(s['active_count'](x)>=5 for x in (u['id'],other)) or db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.status') IN('active','waiting')").fetchone()[0]>=200:raise HTTPException(429,'Limite di partite aperte')
            now=time.time();new={k:g[k] for k in ('kind','elo','base','increment','rated','rating_pool') if k in g};new.update(id=secrets.token_urlsafe(12),white=g['black'],black=g['white'],status='active',moves=[],initial_fen=chess.STARTING_FEN,result='*',reason='',created=now,last=now,clocks=[g['base'],g['base']],analysis=[],analysis_status='idle',draw_offer=None)
            with e['atomic']():s['save'](new);g['rematch_game']=new['id'];s['save'](g)
            for player in (u['id'],other):hub.send(player,{'type':'rematch','game_id':new['id'],'previous':gid})
            return {'game_id':new['id']}
    @app.post('/api/platform/games/{gid}/visibility')
    def visibility(gid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request);g=s['get_game'](gid);s['participant'](g,u)
            if type(body.get('public')) is not bool:raise HTTPException(400,'Visibilità non valida')
            consent=g.get('public_consents',{});consent[u['id']]=body['public'];g['public_consents']=consent;g['public']=all(consent.get(x,False) for x in (g['white'],g['black']) if x and x!='bot');s['save'](g);return {'public':g['public']}
    @app.get('/api/platform/spectate/{gid}')
    def spectate(gid:str,request:Request):
        with lock:
            u=actor(request);g=s['get_game'](gid)
            if not g.get('public'):raise HTTPException(403,'Questa partita è privata')
            snap=s['public_game'](g,u);snap['legal']=[];snap['analysis']=[] if g['status']!='finished' else snap['analysis'];return snap
