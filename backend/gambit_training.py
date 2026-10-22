"""Server-held tactical solutions and persistent lesson progress."""
import hashlib
import json
import time
from datetime import datetime,timezone
import chess
from fastapi import Body,HTTPException,Request


def install(s,e):
    app,db,lock,hub=e['app'],e['db'],e['lock'],e['hub']
    actor,clean,number=e['actor'],e['clean'],e['number']
    row,getdata=e['content_row'],e['content_data']
    def puzzle_stats(user_id):
        r=db.execute('SELECT * FROM puzzle_ratings WHERE user_id=?',(user_id,)).fetchone()
        dates={datetime.fromtimestamp(x[0],timezone.utc).date().isoformat() for x in db.execute("SELECT finished FROM puzzle_attempts WHERE user_id=? AND finished IS NOT NULL AND json_extract(data,'$.correct')=1",(user_id,))}
        today=int(time.time()//86400);streak=0
        if datetime.fromtimestamp((today-1)*86400,timezone.utc).date().isoformat() in dates or datetime.fromtimestamp(today*86400,timezone.utc).date().isoformat() in dates:
            day=today if datetime.fromtimestamp(today*86400,timezone.utc).date().isoformat() in dates else today-1
            while datetime.fromtimestamp(day*86400,timezone.utc).date().isoformat() in dates:streak+=1;day-=1
        solved=db.execute("SELECT COUNT(DISTINCT puzzle_id) FROM puzzle_attempts WHERE user_id=? AND json_extract(data,'$.correct')=1",(user_id,)).fetchone()[0]
        best=run=0;previous=None
        for day in sorted(dates):
            ordinal=datetime.fromisoformat(day).date().toordinal();run=run+1 if previous==ordinal-1 else 1;best=max(best,run);previous=ordinal
        mean=db.execute("SELECT AVG(json_extract(data,'$.elapsed')) FROM puzzle_attempts WHERE user_id=? AND finished IS NOT NULL",(user_id,)).fetchone()[0]
        return {'longest':best,'mean_seconds':round(mean or 0,1),'rating':r['rating'] if r else 1200,'games':r['games'] if r else 0,'solved':solved,'streak':streak,'days':sorted(dates)[-366:]}
    def attempt(aid,u):
        r=db.execute('SELECT * FROM puzzle_attempts WHERE id=? AND user_id=?',(aid,u['id'])).fetchone()
        if not r:raise HTTPException(404,'Tentativo non trovato')
        r=dict(r);r['state']=json.loads(r['data']);return r
    def attempt_data(a,u):
        state=a['state'];d=state.get('puzzle_snapshot') or json.loads(row(a['puzzle_id'],'puzzle')['data'])
        result={'id':a['id'],'puzzle_id':a['puzzle_id'],'fen':state['fen'],'index':state['index'],'tries':state['tries'],'hints':state['hints'],'finished':bool(a['finished']),'correct':state.get('correct'),'delta':state.get('delta',0),'rating':state.get('rating'),'started':a['started']}
        if a['finished']:result.update(solution=d['solution'],explanation=d.get('explanation',''))
        return result
    def write(a):db.execute('UPDATE puzzle_attempts SET data=?,finished=? WHERE id=?',(json.dumps(a['state']),a['finished'],a['id']))
    def finalize(a,u,correct):
        if a['finished']:return
        state=a['state'];p=state.get('puzzle_snapshot') or json.loads(row(a['puzzle_id'],'puzzle')['data']);now=time.time()
        with e['atomic']():
            old=db.execute('SELECT rating,games FROM puzzle_ratings WHERE user_id=?',(u['id'],)).fetchone();rating=old['rating'] if old else 1200;games=old['games'] if old else 0
            eligible=not state.get('session') and not state.get('tournament') and not db.execute('SELECT 1 FROM puzzle_results WHERE user_id=? AND puzzle_id=?',(u['id'],a['puzzle_id'])).fetchone()
            point=1 if correct and not state['hints'] and not state['tries'] else 0
            delta=round(24*(point-1/(1+10**((p['rating']-rating)/400)))) if eligible else 0
            after=max(100,min(4000,rating+delta));delta=after-rating
            if eligible:
                db.execute('INSERT INTO puzzle_results VALUES(?,?,?,?,?)',(u['id'],a['puzzle_id'],a['id'],delta,after))
                db.execute('INSERT INTO puzzle_ratings VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET rating=excluded.rating,games=excluded.games',(u['id'],after,games+1))
            state.update(correct=bool(correct),delta=delta,rating=after,elapsed=max(0,now-a['started']));a['finished']=now;write(a)
        if correct:e['notify'](u['id'],'puzzle','Puzzle completato',p.get('theme',''),'/puzzles.html')
        e['changed']('puzzle',a['puzzle_id'],[u['id']])
    def session_allowed(session_id,u):
        r=row(session_id,'puzzle_session');d=json.loads(r['data'])
        if not e['member'](session_id,u['id']):raise HTTPException(403,'Sessione riservata')
        if time.time()>=d['ends_at']:raise HTTPException(409,'Il tempo della sessione è terminato')
        return r,d
    def tournament_allowed(cid,u):
        r=row(cid,'tournament');d=json.loads(r['data'])
        if d['format']!='puzzle' or not e['member'](cid,u['id']):raise HTTPException(403,'Torneo riservato agli iscritti')
        if d['phase']!='active' or time.time()>=d.get('ends_at',0):raise HTTPException(409,'Torneo non attivo')
        return d
    @app.get('/api/platform/puzzles/progress')
    def progress(request:Request):
        with lock:
            e['enabled']('puzzles');u=actor(request);result=puzzle_stats(u['id']);result['attempts']=[{'id':r['id'],'puzzle_id':r['puzzle_id'],'finished':r['finished'],'correct':json.loads(r['data']).get('correct')} for r in db.execute('SELECT * FROM puzzle_attempts WHERE user_id=? ORDER BY started DESC LIMIT 100',(u['id'],))];return result
    @app.get('/api/platform/puzzles')
    def catalog(request:Request,theme:str='',minimum:int=100,maximum:int=4000,page:int=1):
        with lock:
            e['enabled']('puzzles');u=actor(request)
            rows=db.execute("SELECT * FROM content WHERE kind='puzzle' AND status='published' AND json_extract(data,'$.rating') BETWEEN ? AND ? AND (?='' OR json_extract(data,'$.theme')=?) ORDER BY json_extract(data,'$.rating'),id LIMIT 30 OFFSET ?",(max(100,minimum),min(4000,maximum),theme[:100],theme[:100],max(0,page-1)*30)).fetchall()
            return {'items':[getdata(dict(r),u) for r in rows],'page':page,'has_more':len(rows)==30}
    @app.post('/api/platform/puzzles/{cid}/favorite')
    def favorite(cid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request);p=row(cid,'puzzle')
            if not e['visible'](p,u):raise HTTPException(403,'Puzzle non disponibile')
            if type(body.get('favorite')) is not bool:raise HTTPException(400,'Valore non valido')
            value={'favorite':body['favorite']};db.execute('INSERT INTO progress VALUES(?,?,?,?) ON CONFLICT(content_id,user_id) DO UPDATE SET data=excluded.data,updated=excluded.updated',(cid,u['id'],json.dumps(value),time.time()));return value
    @app.get('/api/platform/puzzles/daily')
    def daily(request:Request):
        with lock:
            e['enabled']('puzzles');u=actor(request);rows=db.execute("SELECT * FROM content WHERE kind='puzzle' AND status='published' ORDER BY id LIMIT 10000").fetchall()
            if not rows:raise HTTPException(404,'Nessun puzzle pubblicato')
            day=datetime.now(timezone.utc).date().isoformat();r=rows[int(hashlib.sha256(day.encode()).hexdigest(),16)%len(rows)]
            data=getdata(dict(r),u);data['solved']=bool(db.execute("SELECT 1 FROM puzzle_attempts WHERE user_id=? AND puzzle_id=? AND started>=? AND json_extract(data,'$.correct')=1",(u['id'],r['id'],int(time.time()//86400)*86400)).fetchone());return data
    @app.post('/api/platform/puzzles/{cid}/attempts')
    def start(cid:str,request:Request,body:dict=Body(default={})):
        with lock:
            e['enabled']('puzzles');u=actor(request,'puzzle-attempt',150,86400);p=row(cid,'puzzle')
            if not e['visible'](p,u):raise HTTPException(403,'Puzzle non disponibile')
            session=body.get('session');tournament=body.get('tournament')
            if session and tournament:raise HTTPException(400,'Scegli una sola competizione')
            if tournament:
                d=tournament_allowed(tournament,u)
                if cid not in d['puzzles']:raise HTTPException(400,'Puzzle fuori dal torneo')
                old=db.execute("SELECT * FROM puzzle_attempts WHERE user_id=? AND puzzle_id=? AND json_extract(data,'$.tournament')=?",(u['id'],cid,tournament)).fetchone()
                if old:
                    a=dict(old);a['state']=json.loads(a['data']);return attempt_data(a,u)
            if session:
                _,d=session_allowed(session,u)
                if cid not in d['puzzles']:raise HTTPException(400,'Puzzle fuori dalla sessione')
                old=db.execute("SELECT * FROM puzzle_attempts WHERE user_id=? AND puzzle_id=? AND json_extract(data,'$.session')=?",(u['id'],cid,session)).fetchone()
                if old:
                    a=dict(old);a['state']=json.loads(a['data']);return attempt_data(a,u)
            existing=db.execute('SELECT * FROM puzzle_attempts WHERE user_id=? AND puzzle_id=? AND finished IS NULL ORDER BY started DESC LIMIT 1',(u['id'],cid)).fetchone()
            if existing:
                a=dict(existing);a['state']=json.loads(a['data'])
                if a['state'].get('session')==session and a['state'].get('tournament')==tournament:return attempt_data(a,u)
            if db.execute('SELECT COUNT(*) FROM puzzle_attempts WHERE user_id=? AND finished IS NULL',(u['id'],)).fetchone()[0]>=10:raise HTTPException(429,'Concludi uno dei tentativi già aperti')
            e['capacity']('puzzle_attempts',500000)
            d=json.loads(p['data']);aid=e['uid']();state={'fen':d['fen'],'index':0,'hints':0,'tries':0,'session':session,'tournament':tournament,'puzzle_snapshot':d,'correct':None};now=time.time()
            db.execute('INSERT INTO puzzle_attempts VALUES(?,?,?,?,?,NULL)',(aid,u['id'],cid,json.dumps(state),now));return attempt_data({'id':aid,'puzzle_id':cid,'state':state,'started':now,'finished':None},u)
    @app.get('/api/platform/attempts/{aid}')
    def get_attempt(aid:str,request:Request):
        with lock:return attempt_data(attempt(aid,actor(request)),actor(request))
    @app.post('/api/platform/attempts/{aid}/move')
    def move(aid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'puzzle-move',120,60);a=attempt(aid,u);state=a['state']
            if a['finished']:raise HTTPException(409,'Tentativo già concluso')
            if state.get('session'):session_allowed(state['session'],u)
            if state.get('tournament'):tournament_allowed(state['tournament'],u)
            p=state.get('puzzle_snapshot') or json.loads(row(a['puzzle_id'],'puzzle')['data']);board=chess.Board(state['fen'])
            if body.get('expected_index',state['index'])!=state['index']:raise HTTPException(409,'Posizione del puzzle cambiata')
            try:m=chess.Move.from_uci(body.get('uci',''));assert m in board.legal_moves
            except (ValueError,AssertionError,TypeError):raise HTTPException(400,'Mossa non valida')
            if m.uci()!=p['solution'][state['index']]:
                state['tries']+=1
                if state['tries']>=10:finalize(a,u,False)
                else:write(a)
                return {**attempt_data(a,u),'accepted':False}
            board.push(m);state['index']+=1;reply=None
            if state['index']<len(p['solution']):
                reply=p['solution'][state['index']];board.push_uci(reply);state['index']+=1
            state['fen']=board.fen()
            if state['index']>=len(p['solution']):finalize(a,u,True)
            else:write(a)
            return {**attempt_data(a,u),'accepted':True,'reply':reply}
    @app.post('/api/platform/attempts/{aid}/hint')
    def hint(aid:str,request:Request):
        with lock:
            u=actor(request,'puzzle-hint',60);a=attempt(aid,u)
            if a['finished']:raise HTTPException(409,'Tentativo già concluso')
            if a['state'].get('session') or a['state'].get('tournament'):raise HTTPException(403,'Gli aiuti sono disattivati nelle sessioni a tempo')
            state=a['state'];d=state.get('puzzle_snapshot') or json.loads(row(a['puzzle_id'],'puzzle')['data']);state['hints']+=1;write(a);move=d['solution'][state['index']]
            return {'hint':d.get('hint','Osserva i pezzi attivi.') if state['hints']==1 else 'Prova da '+move[:2] if state['hints']==2 else move,'hints':state['hints']}
    @app.post('/api/platform/attempts/{aid}/give-up')
    def give_up(aid:str,request:Request):
        with lock:
            u=actor(request);a=attempt(aid,u);finalize(a,u,False);return attempt_data(a,u)
    @app.post('/api/platform/puzzle-sessions')
    def new_session(request:Request,body:dict=Body(...)):
        with lock:
            e['enabled']('puzzles');u=actor(request,'puzzle-session',20,86400);mode=body.get('mode','rush')
            if mode not in ('rush','battle'):raise HTTPException(400,'Modalità non valida')
            puzzles=[r[0] for r in db.execute("SELECT id FROM content WHERE kind='puzzle' AND status='published' ORDER BY json_extract(data,'$.rating'),id LIMIT 100")]
            if not puzzles:raise HTTPException(409,'Pubblica dei puzzle prima di iniziare')
            e['capacity']('content',10000)
            cid=e['uid']();now=time.time();data={'mode':mode,'puzzles':puzzles,'ends_at':now+180,'starts_at':now}
            db.execute('INSERT INTO content VALUES(?,?,?,?,?,?,?,?,?)',(cid,'puzzle_session',u['id'],None,mode,json.dumps(data),'private',now,now));db.execute("INSERT INTO memberships VALUES(?,?,'owner','accepted',?)",(cid,u['id'],now));return {'id':cid,**data}
    @app.post('/api/platform/puzzle-sessions/{cid}/join')
    def join_session(cid:str,request:Request):
        with lock:
            u=actor(request,'puzzle-battle',10);r=row(cid,'puzzle_session');d=json.loads(r['data'])
            if d['mode']!='battle' or not s['are_friends'](u['id'],r['owner']):raise HTTPException(403,'Sfida riservata agli amici')
            if db.execute('SELECT COUNT(*) FROM memberships WHERE content_id=?',(cid,)).fetchone()[0]>=2 and not e['member'](cid,u['id']):raise HTTPException(409,'Sfida completa')
            if time.time()>=d['ends_at']:raise HTTPException(409,'Sfida terminata')
            db.execute("INSERT OR IGNORE INTO memberships VALUES(?,?,'member','accepted',?)",(cid,u['id'],time.time()));return {'ok':True}
    @app.get('/api/platform/puzzle-sessions/{cid}')
    def read_session(cid:str,request:Request):
        with lock:
            u=actor(request);r=row(cid,'puzzle_session');d=json.loads(r['data'])
            if not e['member'](cid,u['id']):raise HTTPException(403,'Sfida riservata')
            results=[]
            for player in db.execute('SELECT user_id FROM memberships WHERE content_id=?',(cid,)):
                count=db.execute("SELECT COUNT(*) FROM puzzle_attempts WHERE user_id=? AND json_extract(data,'$.session')=? AND json_extract(data,'$.correct')=1 AND json_extract(data,'$.tries')=0",(player[0],cid)).fetchone()[0];results.append({'user_id':player[0],'score':count})
            return {'id':cid,**d,'ended':time.time()>=d['ends_at'],'players':results}

    @app.post('/api/platform/lessons/{cid}/progress')
    def lesson_progress(cid:str,request:Request,body:dict=Body(...)):
        with lock:
            e['enabled']('learn');u=actor(request,'lesson',120);r=row(cid,'lesson')
            if not e['visible'](r,u):raise HTTPException(403,'Lezione riservata')
            d=json.loads(r['data']);total=max(1,len(d.get('moves',[])));old=db.execute('SELECT data FROM progress WHERE content_id=? AND user_id=?',(cid,u['id'])).fetchone();p=json.loads(old[0]) if old else {'step':0,'started':time.time(),'notes':''}
            step=number(body.get('step',p['step']),0,total)
            if 'uci' in body and (not step or step>len(d.get('moves',[])) or body['uci']!=d['moves'][step-1]):raise HTTPException(400,'Mossa della lezione non corretta')
            if step>p['step']+1:raise HTTPException(409,'Completa prima il passaggio precedente')
            p['step']=max(p['step'],step);p['complete']=p['step']>=total
            if 'notes' in body:p['notes']=clean(body['notes'],4000)
            if 'bookmark' in body:p['bookmark']=bool(body['bookmark'])
            with e['atomic']():
                db.execute('INSERT INTO progress VALUES(?,?,?,?) ON CONFLICT(content_id,user_id) DO UPDATE SET data=excluded.data,updated=excluded.updated',(cid,u['id'],json.dumps(p),time.time()))
                if r['parent']:
                    db.execute("INSERT INTO memberships VALUES(?,?,'member','accepted',?) ON CONFLICT(content_id,user_id) DO NOTHING",(r['parent'],u['id'],time.time()))
            return p
    @app.get('/api/platform/openings')
    def openings(request:Request,q:str='',page:int=1,fen:str=''):
        from review import BOOK,position_key
        with lock:
            e['enabled']('learn');u=actor(request,'openings',120,60)
            if fen:
                try:board=chess.Board(fen);assert board.is_valid()
                except (ValueError,AssertionError):raise HTTPException(400,'Posizione non valida')
                key=position_key(board);moves=[]
                for uci in BOOK['moves'].get(key,[]):
                    move=chess.Move.from_uci(uci)
                    if move in board.legal_moves:
                        after=board.copy();after.push(move);moves.append({'uci':uci,'san':board.san(move),'opening':BOOK['positions'].get(position_key(after))})
                return {'fen':board.fen(),'opening':BOOK['positions'].get(key),'moves':moves}
            seen=set();items=[]
            for key,value in BOOK['positions'].items():
                name=value['name']
                if name in seen or q.lower() not in (name+' '+value.get('eco','')).lower():continue
                seen.add(name);items.append({**value,'fen':key+' 0 1'})
            page=max(1,min(10000,page));return {'items':items[(page-1)*30:page*30],'page':page,'total':len(items)}
    @app.get('/api/platform/puzzle-sets')
    def puzzle_sets(request:Request):
        with lock:
            e['enabled']('puzzles');u=actor(request)
            return {'items':[{'id':r['id'],'title':r['title'],**json.loads(r['data'])} for r in db.execute("SELECT * FROM content WHERE kind='puzzle_set' AND owner=? AND status='private' ORDER BY created DESC LIMIT 30",(u['id'],))]}
    @app.post('/api/platform/puzzle-sets')
    def create_set(request:Request,body:dict=Body(...)):
        with lock:
            e['enabled']('puzzles');u=actor(request,'puzzle-set',30,86400);e['capacity']('content',10000);e['capacity']('content',30,"owner=? AND kind='puzzle_set' AND status='private'",(u['id'],))
            minimum=number(body.get('minimum',100),100,4000);maximum=number(body.get('maximum',4000),100,4000);theme=clean(body.get('theme',''),100)
            if minimum>maximum:raise HTTPException(400,'Intervallo non valido')
            title=clean(body.get('title',''),100,True);data={'minimum':minimum,'maximum':maximum,'theme':theme};cid=e['uid']();now=time.time();db.execute('INSERT INTO content VALUES(?,?,?,?,?,?,?,?,?)',(cid,'puzzle_set',u['id'],None,title,json.dumps(data),'private',now,now));return {'id':cid,'title':title,**data}
    @app.delete('/api/platform/puzzle-sets/{cid}')
    def delete_set(cid:str,request:Request):
        with lock:
            u=actor(request);r=row(cid,'puzzle_set')
            if r['owner']!=u['id']:raise HTTPException(403,'Set riservato')
            db.execute("UPDATE content SET status='deleted',updated=? WHERE id=?",(time.time(),cid));return {'ok':True}

    e['puzzle_stats']=puzzle_stats
