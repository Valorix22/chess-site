"""Realtime delivery, account moderation, challenges and portable theme packs."""
import asyncio, time, json, secrets, re, contextlib, hashlib
from collections import defaultdict, Counter
from contextlib import asynccontextmanager
from fastapi import Request, HTTPException
from starlette.responses import StreamingResponse
from pydantic import BaseModel, Field

SITE_KEYS={'bg','panel','surface','line','text','muted','accent','accentInk'}
BOARD_KEYS={'light','dark','lastLight','lastDark'}
def validate_theme(pack):
    if not isinstance(pack,dict) or len(json.dumps(pack))>20000: raise HTTPException(400,'Tema JSON non valido o troppo grande')
    out={'version':1,'name':str(pack.get('name','Tema personale')).strip()[:40] or 'Tema personale'}
    for section,keys in [('site',SITE_KEYS),('board',BOARD_KEYS)]:
        values=pack.get(section,{})
        if not isinstance(values,dict) or set(values)-keys: raise HTTPException(400,'Proprietà del tema non supportate')
        out[section]={}
        for key,value in values.items():
            if not isinstance(value,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value): raise HTTPException(400,'I colori devono essere nel formato #RRGGBB')
            out[section][key]=value
    for key,choices,default in [('font',{'sans','serif','mono'},'sans'),('pieceStyle',{'classic','ink','neon'},'classic'),('boardStyle',{'flat','wood','marble'},'flat'),('density',{'comfortable','compact'},'comfortable')]:
        out[key]=pack.get(key,default)
        if out[key] not in choices: raise HTTPException(400,'Stile del tema non supportato')
    radius=pack.get('radius',12)
    if type(radius) is not int or radius<0 or radius>24: raise HTTPException(400,'Raggio del tema non valido')
    out['radius']=radius
    return out

class DisableUser(BaseModel): disabled:bool
class ChallengeInput(BaseModel):
    recipient_id:str=Field(min_length=1,max_length=50)
    base:int=600
    increment:int=5
    color:str='random'
    rated:bool=False
class ReplyInput(BaseModel): accept:bool
class ThemeInput(BaseModel): pack:dict
class Preferences(BaseModel):
    theme:dict
    animations:bool=True
    sound:bool=False


def install(s):
    app,db,lock=s['app'],s['db'],s['lock']
    if 'disabled' not in {r['name'] for r in db.execute('PRAGMA table_info(users)')}:
        db.execute('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,sender TEXT REFERENCES users(id),recipient TEXT REFERENCES users(id),game_id TEXT REFERENCES games(id),status TEXT,created REAL,expires REAL);
    CREATE INDEX IF NOT EXISTS challenge_expiry ON challenges(status,expires);
    CREATE TABLE IF NOT EXISTS preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT);
    CREATE TABLE IF NOT EXISTS themes(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),pack TEXT,created REAL);
    ''')
    class Hub:
        loop=None
        clients=defaultdict(dict)
        def send(self,uid,payload):
            loop=self.loop
            if not loop or loop.is_closed(): return
            def deliver():
                for q in list(self.clients.get(uid,{})):
                    if q.full():
                        # A slow tab reconnects to an authoritative snapshot.
                        while not q.empty(): q.get_nowait()
                        q.put_nowait({'type':'resync'})
                    else: q.put_nowait(payload)
            loop.call_soon_threadsafe(deliver)
        def all(self,payload):
            for uid in list(self.clients): self.send(uid,payload)
        def game(self,g):
            for uid in {g['white'],g['black']} - {None,'bot'}:
                if not self.clients.get(uid): continue
                snap=s['public_game'](g,{'id':uid})
                if g.get('analysis_status')!='done':
                    rows=snap.pop('analysis',[])
                    snap['analysis_count']=len(rows)
                    snap['analysis_append']=rows[-1] if rows else None
                    snap['analysis_batch']=rows[-8:]
                self.send(uid,{'type':'game','game':snap})
        def presence(self,changed=None):
            with lock:
                for uid in list(self.clients):
                    user=db.execute('SELECT admin FROM users WHERE id=?',(uid,)).fetchone()
                    if changed is None or uid==changed or user and user['admin'] or s.get('are_friends',lambda a,b:False)(uid,changed):self.send(uid,{'type':'presence'})
    hub=Hub()
    original_save=s['save']
    def save(g):
        g['revision']=g.get('revision',0)+1
        original_save(g)
        hub.game(g)
    s['save']=save
    original_public=s['public_game']
    def public(g,u,detail=True):
        value=original_public(g,u,detail)
        value.update(revision=g.get('revision',0),server_time=time.time(),white_id=g['white'],black_id=g['black'])
        return value
    s['public_game']=public
    original_schedule=s['schedule_bot']
    def schedule(g):
        original_schedule(g)
        hub.game(g)
    s['schedule_bot']=schedule

    def challenge_data(row):
        item=dict(row)
        for col in ('sender','recipient'):
            name=db.execute('SELECT name FROM users WHERE id=?',(item[col],)).fetchone()
            item[col+'_name']=name['name'] if name else 'Giocatore'
        g=s['get_game'](item['game_id'])
        item.update(base=g['base'],increment=g['increment'],rated=bool(g.get('rated')),rating_pool=g.get('rating_pool'))
        return item
    def challenge_event(row,kind='challenge'):
        data=challenge_data(row)
        for uid in (row['sender'],row['recipient']): hub.send(uid,{'type':kind,'challenge':data})
    def expire_challenges():
        for row in db.execute("SELECT * FROM challenges WHERE status='pending' AND expires<?",(time.time(),)).fetchall():
            db.execute("UPDATE challenges SET status='expired' WHERE id=?",(row['id'],))
            g=s['get_game'](row['game_id'])
            if g['status']=='waiting': s['finish'](g,'*','Invito scaduto')
            challenge_event(db.execute('SELECT * FROM challenges WHERE id=?',(row['id'],)).fetchone())
    async def clock_watch():
        last_housekeeping=0
        while True:
            await asyncio.sleep(.2)
            with lock:
                for row in db.execute("SELECT data FROM games WHERE json_extract(data,'$.status')='active'").fetchall(): s['tick'](json.loads(row['data']))
                expire_challenges()
                if time.time()-last_housekeeping>3600:
                    db.execute('DELETE FROM audit_events WHERE occurred_at<?',(time.time()-30*86400,));db.execute('DELETE FROM action_limits WHERE started<?',(time.time()-86400,));db.execute('DELETE FROM matchmaking WHERE expires<?',(time.time(),));last_housekeeping=time.time()
    original_lifespan=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(a):
        hub.loop=asyncio.get_running_loop()
        async with original_lifespan(a):
            ticker=asyncio.create_task(clock_watch())
            try: yield
            finally:
                ticker.cancel()
                with contextlib.suppress(asyncio.CancelledError): await ticker
                hub.clients.clear();hub.loop=None
    app.router.lifespan_context=lifespan

    @app.get('/api/events')
    async def events(request:Request):
        with lock:
            user=s['user_for'](request);uid=user['id']
            if len(hub.clients.get(uid,{}))>=4 or sum(len(c) for c in hub.clients.values())>=128: raise HTTPException(429,'Troppe schede aperte. Chiudine una.')
            q=asyncio.Queue(maxsize=64)
            hub.clients[uid][q]=time.time()
        async def stream():
            try:
                yield 'retry: 1500\ndata: '+json.dumps({'type':'ready','at':time.time()})+'\n\n'
                hub.presence(uid)
                while True:
                    with lock:
                        try: s['user_for'](request);valid=True
                        except HTTPException: valid=False
                    if not valid:
                        yield 'data: '+json.dumps({'type':'session_end'})+'\n\n';break
                    try: payload=await asyncio.wait_for(q.get(),timeout=8)
                    except asyncio.TimeoutError: payload={'type':'ping','at':time.time()}
                    yield 'data: '+json.dumps(payload,separators=(',',':'))+'\n\n'
                    if payload['type']=='session_end': break
            finally:
                with lock:
                    hub.clients[uid].pop(q,None)
                    if not hub.clients[uid]: hub.clients.pop(uid,None)
                hub.presence(uid)
        return StreamingResponse(stream(),media_type='text/event-stream',headers={'Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'})

    @app.get('/api/admin/users')
    def users(request:Request,q:str='',page:int=1):
        with lock:
            s['admin_for'](request)
            query='%'+q[:40]+'%';page=max(1,page);size=50
            total=db.execute("SELECT COUNT(*) FROM users WHERE password!='' AND name LIKE ?",(query,)).fetchone()[0]
            result=[]
            for r in db.execute("SELECT id,name,admin,owner,disabled,created,last_login,must_change_password FROM users WHERE password!='' AND name LIKE ? ORDER BY created DESC LIMIT ? OFFSET ?",(query,size,(page-1)*size)):
                u=dict(r);uid=u['id'];games=db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.white')=? OR json_extract(data,'$.black')=?",(uid,uid)).fetchone()[0]
                u.update(online=bool(hub.clients.get(uid)),games=games,ratings={p:s['rating_for'](uid,p) for p in ('bullet','blitz','rapid','classical')},sessions=db.execute('SELECT COUNT(*) FROM sessions WHERE user_id=? AND expires>?',(uid,time.time())).fetchone()[0]);result.append(u)
            return {'users':result,'total':total,'page':page,'pages':max(1,(total+size-1)//size)}

    @app.post('/api/admin/users/{uid}/status')
    def user_status(uid:str,body:DisableUser,request:Request):
        with lock:
            admin=s['admin_for'](request)
            target=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
            if not target: raise HTTPException(404,'Account non trovato')
            if target['admin'] or uid==admin['id']: raise HTTPException(400,'Gli account amministratore non possono essere disabilitati qui')
            ended=[];cancelled=[]
            db.execute('BEGIN IMMEDIATE')
            try:
                db.execute('UPDATE users SET disabled=? WHERE id=?',(int(body.disabled),uid))
                db.execute('DELETE FROM matchmaking WHERE user_id=?',(uid,))
                if body.disabled:
                    db.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
                    for row in db.execute("SELECT data FROM games WHERE json_extract(data,'$.status') IN ('active','waiting') AND (json_extract(data,'$.white')=? OR json_extract(data,'$.black')=?)",(uid,uid)).fetchall():
                        g=json.loads(row['data']);g.update(status='finished',result='*',reason='Account disabilitato',draw_offer=None,revision=g.get('revision',0)+1)
                        db.execute('UPDATE games SET data=? WHERE id=?',(json.dumps(g),g['id']));ended.append(g)
                    cancelled=db.execute("SELECT id FROM challenges WHERE status='pending' AND (sender=? OR recipient=?)",(uid,uid)).fetchall()
                    db.execute("UPDATE challenges SET status='cancelled' WHERE status='pending' AND (sender=? OR recipient=?)",(uid,uid))
                db.execute('COMMIT')
            except Exception:db.execute('ROLLBACK');raise
            if body.disabled:hub.send(uid,{'type':'session_end','reason':'Account disabilitato dall’amministratore'})
            for g in ended:hub.game(g)
            for row in cancelled:challenge_event(db.execute('SELECT * FROM challenges WHERE id=?',(row['id'],)).fetchone())
            hub.presence(uid)
            return {'ok':True,'disabled':body.disabled}

    @app.get('/api/members')
    def members(request:Request,q:str=''):
        with lock:
            current=s['user_for'](request)
            if not current['admin']:
                result=[u for u in s['friend_payload'](current['id'])['friends'] if q[:40].lower() in u['name'].lower()]
            else:
                result=[]
                for r in db.execute("SELECT id,name FROM users WHERE password!='' AND disabled=0 AND id!=? AND name LIKE ? ORDER BY name COLLATE NOCASE LIMIT 100",(current['id'],'%'+q[:40]+'%')):
                    result.append({'id':r['id'],'name':r['name'],'online':bool(hub.clients.get(r['id'])),'ratings':{p:s['rating_for'](r['id'],p) for p in ('bullet','blitz','rapid','classical')}})
            return {'members':sorted(result,key=lambda u:(not u['online'],u['name'].lower()))}

    @app.get('/api/challenges')
    def challenges(request:Request):
        with lock:
            u=s['user_for'](request);expire_challenges()
            return {'challenges':[challenge_data(r) for r in db.execute("SELECT * FROM challenges WHERE status='pending' AND (sender=? OR recipient=?) ORDER BY created DESC",(u['id'],u['id']))]}

    @app.post('/api/challenges')
    def challenge(body:ChallengeInput,request:Request):
        with lock:
            u=s['user_for'](request);expire_challenges()
            if body.recipient_id==u['id']: raise HTTPException(400,'Scegli un altro giocatore')
            target=db.execute("SELECT * FROM users WHERE id=? AND disabled=0 AND password!=''",(body.recipient_id,)).fetchone()
            if not target or not s['friend_allowed'](u,target['id']): raise HTTPException(404,'Giocatore non disponibile: serve un’amicizia accettata')
            if db.execute("SELECT COUNT(*) FROM challenges WHERE sender=? AND created>?",(u['id'],time.time()-60)).fetchone()[0]>=6: raise HTTPException(429,'Hai inviato diverse sfide. Aspetta un minuto.')
            if db.execute("SELECT 1 FROM challenges WHERE sender=? AND recipient=? AND status='pending'",(u['id'],target['id'])).fetchone(): raise HTTPException(409,'Hai già una sfida aperta con questo giocatore')
            g=s['create_game'](s['NewGame'](kind='friend',base=body.base,increment=body.increment,color=body.color,rated=body.rated),request)
            stored=s['get_game'](g['id']);stored['target_user']=target['id'];save(stored)
            cid=secrets.token_urlsafe(16)
            db.execute('INSERT INTO challenges VALUES(?,?,?,?,?,?,?)',(cid,u['id'],target['id'],g['id'],'pending',time.time(),time.time()+600))
            row=db.execute('SELECT * FROM challenges WHERE id=?',(cid,)).fetchone();challenge_event(row)
            return {'challenge':challenge_data(row)}

    @app.post('/api/challenges/{cid}/reply')
    def reply(cid:str,body:ReplyInput,request:Request):
        with lock:
            u=s['user_for'](request);expire_challenges()
            row=db.execute('SELECT * FROM challenges WHERE id=?',(cid,)).fetchone()
            if not row or row['recipient']!=u['id']: raise HTTPException(403,'Sfida non disponibile per questo account')
            if row['status']!='pending': raise HTTPException(409,'La sfida non è più disponibile')
            g=s['get_game'](row['game_id'])
            if g['status']!='waiting': raise HTTPException(409,'La stanza non è più disponibile')
            if body.accept:
                s['join'](g['id'],request)
                db.execute("UPDATE challenges SET status='accepted' WHERE id=?",(cid,))
                latest=s['get_game'](g['id'])
                for uid in (row['sender'],row['recipient']): hub.send(uid,{'type':'challenge_accepted','game':public(latest,{'id':uid})})
                return {'game':public(latest,u)}
            db.execute("UPDATE challenges SET status='declined' WHERE id=?",(cid,));s['finish'](g,'*','Sfida rifiutata')
            challenge_event(db.execute('SELECT * FROM challenges WHERE id=?',(cid,)).fetchone())
            return {'ok':True}

    @app.post('/api/challenges/{cid}/cancel')
    def cancel(cid:str,request:Request):
        with lock:
            u=s['user_for'](request)
            row=db.execute('SELECT * FROM challenges WHERE id=? AND sender=?',(cid,u['id'])).fetchone()
            if not row: raise HTTPException(404,'Sfida non trovata')
            if row['status']!='pending': raise HTTPException(409,'La sfida è già conclusa')
            db.execute("UPDATE challenges SET status='cancelled' WHERE id=?",(cid,));g=s['get_game'](row['game_id'])
            if g['status']=='waiting': s['finish'](g,'*','Sfida annullata')
            challenge_event(db.execute('SELECT * FROM challenges WHERE id=?',(cid,)).fetchone());return {'ok':True}

    @app.get('/api/preferences')
    def preferences(request:Request):
        with lock:
            u=s['user_for'](request);row=db.execute('SELECT data FROM preferences WHERE user_id=?',(u['id'],)).fetchone()
            return {'preferences':json.loads(row['data']) if row else None}

    @app.post('/api/preferences')
    def save_preferences(body:Preferences,request:Request):
        value={'theme':validate_theme(body.theme),'animations':body.animations,'sound':body.sound}
        with lock:
            u=s['user_for'](request);db.execute('INSERT INTO preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',(u['id'],json.dumps(value)));return {'ok':True}

    @app.get('/api/themes')
    def themes(request:Request):
        with lock:
            s['user_for'](request)
            return {'themes':[{'id':r['id'],'pack':json.loads(r['pack'])} for r in db.execute('SELECT id,pack FROM themes ORDER BY created DESC LIMIT 100')]}

    @app.get('/api/themes/{tid}')
    def theme(tid:str):
        with lock:
            row=db.execute('SELECT pack FROM themes WHERE id=?',(tid,)).fetchone()
            if not row: raise HTTPException(404,'Tema non trovato')
            return json.loads(row['pack'])

    @app.post('/api/themes')
    def upload_theme(body:ThemeInput,request:Request):
        pack=validate_theme(body.pack)
        with lock:
            u=s['user_for'](request)
            if db.execute('SELECT COUNT(*) FROM themes WHERE owner=?',(u['id'],)).fetchone()[0]>=20: raise HTTPException(400,'Hai già condiviso 20 temi')
            tid=secrets.token_urlsafe(16);db.execute('INSERT INTO themes VALUES(?,?,?,?)',(tid,u['id'],json.dumps(pack),time.time()));return {'id':tid,'pack':pack}
    s['live_hub']=hub
