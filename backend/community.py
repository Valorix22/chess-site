"""Private friendships, moderation, audit and atomic competitive results."""
import hashlib,json,math,secrets,sqlite3,time
from contextlib import contextmanager
from fastapi import HTTPException,Request
from pydantic import BaseModel,Field

POOLS=('bullet','blitz','rapid','classical')
def time_pool(base,increment):
    seconds=base+40*increment
    return 'bullet' if seconds<180 else 'blitz' if seconds<600 else 'rapid' if seconds<1800 else 'classical'

class FriendCode(BaseModel):code:str=Field(min_length=8,max_length=40)
class FriendReply(BaseModel):accept:bool
class AdminPassword(BaseModel):
    current_password:str=Field(min_length=1,max_length=128)
    new_password:str=Field(min_length=12,max_length=128)
class AdminConfirm(BaseModel):current_password:str=Field(min_length=1,max_length=128)
class AdminRole(AdminConfirm):admin:bool
class MatchOptions(BaseModel):
    base:int=600
    increment:int=0
    rated:bool=True


def install(s):
    db,lock,app,hub=s['db'],s['lock'],s['app'],s['live_hub']
    cols={r['name'] for r in db.execute('PRAGMA table_info(users)')}
    for name,definition in [('owner','INTEGER NOT NULL DEFAULT 0'),('friend_code','TEXT'),('must_change_password','INTEGER NOT NULL DEFAULT 0'),('last_login','REAL')]:
        if name not in cols:db.execute('ALTER TABLE users ADD COLUMN '+name+' '+definition)
    db.executescript('''
    CREATE UNIQUE INDEX IF NOT EXISTS unique_friend_code ON users(friend_code);
    CREATE TABLE IF NOT EXISTS friendships(left_id TEXT REFERENCES users(id),right_id TEXT REFERENCES users(id),requester TEXT REFERENCES users(id),status TEXT,created REAL,updated REAL,PRIMARY KEY(left_id,right_id));
    CREATE INDEX IF NOT EXISTS friends_right ON friendships(right_id,status);
    CREATE TABLE IF NOT EXISTS user_blocks(owner TEXT REFERENCES users(id),blocked TEXT REFERENCES users(id),PRIMARY KEY(owner,blocked));
    CREATE TABLE IF NOT EXISTS ratings(user_id TEXT REFERENCES users(id),pool TEXT,rating INTEGER NOT NULL DEFAULT 1200,games INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,pool));
    CREATE TABLE IF NOT EXISTS rating_results(game_id TEXT PRIMARY KEY REFERENCES games(id),pool TEXT,white_id TEXT,black_id TEXT,white_before INTEGER,black_before INTEGER,white_after INTEGER,black_after INTEGER,created REAL);
    CREATE TABLE IF NOT EXISTS matchmaking(user_id TEXT PRIMARY KEY REFERENCES users(id),base INTEGER,increment INTEGER,rated INTEGER,pool TEXT,rating INTEGER,created REAL,expires REAL);
    CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,occurred_at REAL,actor_id TEXT,actor_name TEXT,subject_id TEXT,action TEXT,status INTEGER,ip TEXT,user_agent TEXT,details TEXT);
    CREATE INDEX IF NOT EXISTS audit_time ON audit_events(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS audit_actor ON audit_events(actor_id,id DESC);
    CREATE INDEX IF NOT EXISTS audit_action ON audit_events(action,id DESC);
    CREATE TABLE IF NOT EXISTS action_limits(key TEXT PRIMARY KEY,started REAL,count INTEGER);
    CREATE INDEX IF NOT EXISTS limits_expiry ON action_limits(started);
    CREATE INDEX IF NOT EXISTS games_status ON games(json_extract(data,'$.status'));
    CREATE INDEX IF NOT EXISTS games_white ON games(json_extract(data,'$.white'),created DESC);
    CREATE INDEX IF NOT EXISTS games_black ON games(json_extract(data,'$.black'),created DESC);
    ''')
    if not db.execute('SELECT 1 FROM users WHERE owner=1').fetchone():
        row=db.execute('SELECT id FROM users WHERE admin=1 ORDER BY created LIMIT 1').fetchone()
        if row:db.execute('UPDATE users SET owner=1 WHERE id=?',(row['id'],))
    db.execute('DELETE FROM audit_events WHERE occurred_at<?',(time.time()-30*86400,))
    db.execute('DELETE FROM action_limits WHERE started<?',(time.time()-86400,))
    def ensure_code(uid):
        row=db.execute('SELECT friend_code FROM users WHERE id=?',(uid,)).fetchone()
        if not row:return None
        if row['friend_code']:return row['friend_code']
        for _ in range(5):
            code=''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(16))
            try:db.execute('UPDATE users SET friend_code=? WHERE id=? AND friend_code IS NULL',(code,uid));return code
            except sqlite3.IntegrityError:continue
        raise RuntimeError('Could not allocate friend code')
    for row in db.execute('SELECT id FROM users WHERE friend_code IS NULL').fetchall():ensure_code(row['id'])
    def rating(uid,pool):
        row=db.execute('SELECT * FROM ratings WHERE user_id=? AND pool=?',(uid,pool)).fetchone()
        return dict(row) if row else {'user_id':uid,'pool':pool,'rating':1200,'games':0,'wins':0,'draws':0,'losses':0}
    def all_ratings(uid):return {p:rating(uid,p) for p in POOLS}
    def pair(a,b):return tuple(sorted((a,b)))
    def blocked(a,b):return bool(db.execute('SELECT 1 FROM user_blocks WHERE (owner=? AND blocked=?) OR (owner=? AND blocked=?)',(a,b,b,a)).fetchone())
    def are_friends(a,b):
        return a!=b and not blocked(a,b) and bool(db.execute("SELECT 1 FROM friendships WHERE left_id=? AND right_id=? AND status='accepted'",pair(a,b)).fetchone())
    def friend_allowed(u,other):return not blocked(u['id'],other) and (bool(u['admin']) or are_friends(u['id'],other))
    def read_participant(g,u):
        if not u['admin']:s['participant'](g,u)
    def user_fields(u):
        uid=u['id'];fresh=db.execute('SELECT owner,must_change_password FROM users WHERE id=?',(uid,)).fetchone()
        return {'owner':bool(fresh['owner']),'must_change_password':bool(fresh['must_change_password']),'friend_code':ensure_code(uid),'ratings':all_ratings(uid)}
    writes=[0]
    def audit(action,actor=None,subject=None,status=200,ip='',ua='',details=None):
        # Only caller-supplied, allowlisted metadata. Never passwords or tokens.
        with lock:
            db.execute('INSERT INTO audit_events(occurred_at,actor_id,actor_name,subject_id,action,status,ip,user_agent,details) VALUES(?,?,?,?,?,?,?,?,?)',(time.time(),actor.get('id') if actor else None,actor.get('name') if actor else None,subject,str(action)[:100],status,str(ip)[:64],str(ua)[:240],json.dumps(details or {},ensure_ascii=False,separators=(',',':'))[:1600]))
            writes[0]+=1
            if writes[0]%256==0:
                db.execute('DELETE FROM audit_events WHERE occurred_at<?',(time.time()-30*86400,))
                db.execute('DELETE FROM audit_events WHERE id<(SELECT COALESCE(MAX(id),0)-100000 FROM audit_events)')
                db.execute('DELETE FROM action_limits WHERE started<?',(time.time()-86400,))
    def rate_action(uid,action,limit=30,window=3600,weight=1):
        now=time.time();key=action+':'+hashlib.sha256(str(uid).encode()).hexdigest()
        with lock:
            row=db.execute('SELECT * FROM action_limits WHERE key=?',(key,)).fetchone()
            count=row['count'] if row and now-row['started']<window else 0
            if count+weight>limit:raise HTTPException(429,'Limite temporaneo raggiunto. Riprova più tardi.',headers={'Retry-After':str(max(1,int(window-(now-row['started']))))})
            db.execute('INSERT INTO action_limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET started=excluded.started,count=excluded.count',(key,row['started'] if count else now,count+weight))
    def active_count(uid):
        return db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.status') IN ('active','waiting') AND (json_extract(data,'$.white')=? OR json_extract(data,'$.black')=?)",(uid,uid)).fetchone()[0]
    def analysis_admission(u,g,mode):
        running=db.execute("SELECT data FROM games WHERE json_extract(data,'$.analysis_status')='running'").fetchall()
        if len(running)>=12:raise HTTPException(429,'La coda analisi è piena. Riprova tra poco.',headers={'Retry-After':'30'})
        if any(json.loads(r['data']).get('analysis_requested_by')==u['id'] for r in running):raise HTTPException(429,'Hai già un’analisi in corso. Attendi che finisca.')
        rate_action(u['id'],'analysis-'+mode,8 if mode=='deep' else 40,86400)
        rate_action(u['id'],'analysis-plies',12000,86400,len(g['moves']))
    def game_fields(g):
        pool=g.get('rating_pool') or time_pool(g['base'],g['increment'])
        return {'rated':bool(g.get('rated',False)),'rating_pool':pool,'rating_change':g.get('rating_change'),'white_rating':rating(g['white'],pool)['rating'] if g['white'] not in (None,'bot') else None,'black_rating':rating(g['black'],pool)['rating'] if g['black'] not in (None,'bot') else None,'matchmaking':bool(g.get('matchmaking'))}
    # Persist both ratings, the unique result ledger and game before notifying SSE.
    def finish(g,result,reason):
        with lock:
            current=s['get_game'](g['id'])
            if current['status']=='finished':g.update(current);return
            g.update(status='finished',result=result,reason=reason,draw_offer=None)
            eligible=bool(g.get('rated')) and g['kind']=='friend' and result in ('1-0','0-1','1/2-1/2') and g['white']!=g['black'] and g['white'] not in (None,'bot') and g['black'] not in (None,'bot') and reason not in ('Account disabilitato','Partita annullata dall’amministratore')
            db.execute('BEGIN IMMEDIATE')
            try:
                if eligible and not db.execute('SELECT 1 FROM rating_results WHERE game_id=?',(g['id'],)).fetchone():
                    pool=g.get('rating_pool') or time_pool(g['base'],g['increment']);w=rating(g['white'],pool);b=rating(g['black'],pool)
                    score=1 if result=='1-0' else 0 if result=='0-1' else .5
                    expected=1/(1+10**((b['rating']-w['rating'])/400));k=40 if min(w['games'],b['games'])<20 else 20
                    change=round(k*(score-expected));change=max(100-w['rating'],min(4000-w['rating'],change));change=max(b['rating']-4000,min(b['rating']-100,change))
                    for entry,delta,point in ((w,change,score),(b,-change,1-score)):
                        db.execute('INSERT INTO ratings VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,pool) DO UPDATE SET rating=excluded.rating,games=excluded.games,wins=excluded.wins,draws=excluded.draws,losses=excluded.losses',(entry['user_id'],pool,entry['rating']+delta,entry['games']+1,entry['wins']+int(point==1),entry['draws']+int(point==.5),entry['losses']+int(point==0)))
                    g['rating_change']={'white':{'before':w['rating'],'after':w['rating']+change,'delta':change},'black':{'before':b['rating'],'after':b['rating']-change,'delta':-change}}
                    db.execute('INSERT INTO rating_results VALUES(?,?,?,?,?,?,?,?,?)',(g['id'],pool,g['white'],g['black'],w['rating'],b['rating'],w['rating']+change,b['rating']-change,time.time()))
                g['revision']=g.get('revision',0)+1
                db.execute('UPDATE games SET data=? WHERE id=?',(json.dumps(g),g['id']))
                db.execute('COMMIT')
            except Exception:db.execute('ROLLBACK');raise
            hub.game(g)
            audit('game.finished',subject=g['id'],details={'result':result,'reason':reason,'rated':bool(g.get('rated'))})
            if g.get('rating_change'):
                for uid in (g['white'],g['black']):hub.send(uid,{'type':'ratings'})
    s.update(ensure_friend_code=ensure_code,user_fields=user_fields,game_fields=game_fields,friend_allowed=friend_allowed,are_friends=are_friends,blocked=blocked,read_participant=read_participant,rate_action=rate_action,audit_event=audit,active_count=active_count,analysis_admission=analysis_admission,finish=finish,rating_for=rating)
    def friend_event(a,b):
        for uid in (a,b):hub.send(uid,{'type':'friends'})
    def friend_payload(uid):
        result={'friends':[],'incoming':[],'outgoing':[]}
        for r in db.execute("SELECT * FROM friendships WHERE (left_id=? OR right_id=?) AND status IN ('accepted','pending')",(uid,uid)):
            other=r['right_id'] if r['left_id']==uid else r['left_id'];u=db.execute('SELECT id,name,disabled FROM users WHERE id=?',(other,)).fetchone()
            if not u or u['disabled'] or blocked(uid,other):continue
            member={'id':u['id'],'name':u['name'],'online':bool(hub.clients.get(other)) and s.get('gambit_presence_visible',lambda uid:True)(other),'ratings':all_ratings(other)}
            key='friends' if r['status']=='accepted' else 'outgoing' if r['requester']==uid else 'incoming'
            result[key].append(member)
        return result
    @app.get('/api/friends')
    def friends(request:Request):
        with lock:
            u=s['user_for'](request);out=friend_payload(u['id']);out['code']=ensure_code(u['id']);return out
    @app.post('/api/friends/request')
    def request_friend(body:FriendCode,request:Request):
        with lock:
            u=s['user_for'](request);rate_action(u['id'],'friend-request',15,3600)
            code=recode(body.code);other=db.execute('SELECT id FROM users WHERE friend_code=? AND disabled=0 AND password!=?',(code,'')).fetchone()
            if not other or blocked(u['id'],other['id']):raise HTTPException(404,'Codice non disponibile')
            uid=other['id']
            if uid==u['id']:raise HTTPException(400,'Questo è il tuo codice')
            a,b=pair(u['id'],uid);row=db.execute('SELECT * FROM friendships WHERE left_id=? AND right_id=?',(a,b)).fetchone()
            if row and row['status'] in ('pending','accepted'):raise HTTPException(409,'Esiste già un’amicizia o una richiesta. Controlla quelle ricevute.')
            if row and time.time()-row['updated']<86400:raise HTTPException(429,'Aspetta prima di inviare un’altra richiesta a questo utente.')
            for user_id in (u['id'],uid):
                if db.execute("SELECT COUNT(*) FROM friendships WHERE (left_id=? OR right_id=?) AND status IN ('pending','accepted')",(user_id,user_id)).fetchone()[0]>=200:raise HTTPException(400,'Limite di amicizie raggiunto')
            db.execute("INSERT INTO friendships VALUES(?,?,?,'pending',?,?) ON CONFLICT(left_id,right_id) DO UPDATE SET requester=excluded.requester,status='pending',updated=excluded.updated",(a,b,u['id'],time.time(),time.time()))
            friend_event(a,b);return {'ok':True}
    @app.post('/api/friends/{uid}/reply')
    def reply_friend(uid:str,body:FriendReply,request:Request):
        with lock:
            u=s['user_for'](request);a,b=pair(uid,u['id']);row=db.execute('SELECT * FROM friendships WHERE left_id=? AND right_id=?',(a,b)).fetchone()
            if not row or row['status']!='pending' or row['requester']==u['id'] or blocked(uid,u['id']):raise HTTPException(404,'Richiesta non disponibile')
            target=db.execute('SELECT disabled FROM users WHERE id=?',(uid,)).fetchone()
            if not target or target['disabled']:raise HTTPException(404,'Richiesta non disponibile')
            db.execute('UPDATE friendships SET status=?,updated=? WHERE left_id=? AND right_id=?',('accepted' if body.accept else 'rejected',time.time(),a,b));friend_event(a,b);return {'ok':True}
    def remove_pending_challenges(a,b):
        for row in db.execute("SELECT * FROM challenges WHERE status='pending' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))",(a,b,b,a)).fetchall():
            db.execute("UPDATE challenges SET status='cancelled' WHERE id=?",(row['id'],));g=s['get_game'](row['game_id'])
            if g['status']=='waiting':finish(g,'*','Amicizia rimossa')
            for uid in (a,b):hub.send(uid,{'type':'challenge','challenge':{'status':'cancelled','sender':row['sender']}})
    @app.post('/api/friends/{uid}/remove')
    def remove_friend(uid:str,request:Request):
        with lock:
            u=s['user_for'](request);a,b=pair(uid,u['id']);db.execute("UPDATE friendships SET status='removed',updated=? WHERE left_id=? AND right_id=?",(time.time(),a,b));remove_pending_challenges(a,b);friend_event(a,b);return {'ok':True}
    @app.post('/api/friends/{uid}/block')
    def block_user(uid:str,request:Request):
        with lock:
            u=s['user_for'](request)
            if uid==u['id'] or not db.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():raise HTTPException(400,'Utente non disponibile')
            # IDs are learned only through an existing request/game/friendship.
            db.execute('INSERT OR IGNORE INTO user_blocks VALUES(?,?)',(u['id'],uid));a,b=pair(uid,u['id']);db.execute("UPDATE friendships SET status='removed',updated=? WHERE left_id=? AND right_id=?",(time.time(),a,b));remove_pending_challenges(a,b);friend_event(a,b);return {'ok':True}
    @app.post('/api/friends/{uid}/unblock')
    def unblock_user(uid:str,request:Request):
        with lock:
            u=s['user_for'](request);db.execute('DELETE FROM user_blocks WHERE owner=? AND blocked=?',(u['id'],uid));return {'ok':True}
    @app.get('/api/blocks')
    def blocks(request:Request):
        with lock:
            u=s['user_for'](request);return {'blocks':[dict(r) for r in db.execute('SELECT u.id,u.name FROM users u JOIN user_blocks b ON b.blocked=u.id WHERE b.owner=?',(u['id'],))]}
    def confirmed_admin(request,password,owner=False):
        with lock:
            u=s['admin_for'](request)
            if owner and not u['owner']:raise HTTPException(403,'Questa operazione è riservata al proprietario')
            rate_action(u['id'],'admin-confirm',10,300)
        if not s['password_matches'](password,u['password']):raise HTTPException(403,'La tua password non è corretta')
        with lock:
            fresh=s['admin_for'](request)
            if fresh['password']!=u['password'] or owner and not fresh['owner']:raise HTTPException(403,'Accedi nuovamente prima di continuare')
        return fresh
    @app.post('/api/admin/users/{uid}/password')
    def reset_password(uid:str,body:AdminPassword,request:Request):
        admin=confirmed_admin(request,body.current_password)
        with lock:
            target=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
            if not target:raise HTTPException(404,'Account non trovato')
            if uid==admin['id']:raise HTTPException(400,'Usa Cambia password nel tuo profilo')
            if target['owner'] or target['admin'] and not admin['owner']:raise HTTPException(403,'Non puoi modificare questo amministratore')
        hashed=s['password_hash'](body.new_password)
        with lock:
            fresh=s['admin_for'](request);target=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
            if fresh['password']!=admin['password'] or target['owner'] or target['admin'] and not fresh['owner']:raise HTTPException(403,'Autorizzazione cambiata: riprova')
            db.execute('BEGIN IMMEDIATE')
            try:
                db.execute('UPDATE users SET password=?,must_change_password=1 WHERE id=?',(hashed,uid));db.execute('DELETE FROM sessions WHERE user_id=?',(uid,));db.execute('DELETE FROM matchmaking WHERE user_id=?',(uid,));db.execute('COMMIT')
            except Exception:db.execute('ROLLBACK');raise
            hub.send(uid,{'type':'session_end','reason':'Password reimpostata dall’amministratore. Accedi con la nuova password.'});return {'ok':True,'must_change_password':True}
    @app.post('/api/admin/users/{uid}/sessions/revoke')
    def revoke_sessions(uid:str,body:AdminConfirm,request:Request):
        admin=confirmed_admin(request,body.current_password)
        with lock:
            fresh=s['admin_for'](request)
            if fresh['password']!=admin['password']:raise HTTPException(403,'Autorizzazione cambiata: riprova')
            admin=fresh
            target=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
            if not target:raise HTTPException(404,'Account non trovato')
            if target['owner'] and uid!=admin['id'] or target['admin'] and uid!=admin['id'] and not admin['owner']:raise HTTPException(403,'Non puoi modificare queste sessioni')
            db.execute('DELETE FROM sessions WHERE user_id=?',(uid,));hub.send(uid,{'type':'session_end','reason':'Sessioni revocate dall’amministratore'});return {'ok':True}
    @app.post('/api/admin/users/{uid}/role')
    def change_role(uid:str,body:AdminRole,request:Request):
        admin=confirmed_admin(request,body.current_password,True)
        with lock:
            fresh=s['admin_for'](request)
            if not fresh['owner'] or fresh['password']!=admin['password']:raise HTTPException(403,'Autorizzazione cambiata')
            target=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
            if not target:raise HTTPException(404,'Account non trovato')
            if target['owner'] or target['disabled']:raise HTTPException(400,'Non puoi cambiare il ruolo di questo account')
            db.execute('BEGIN IMMEDIATE')
            try:db.execute('UPDATE users SET admin=? WHERE id=?',(int(body.admin),uid));db.execute('DELETE FROM sessions WHERE user_id=?',(uid,));db.execute('COMMIT')
            except Exception:db.execute('ROLLBACK');raise
            hub.send(uid,{'type':'session_end','reason':'Ruolo aggiornato. Accedi nuovamente.'});return {'ok':True}
    @app.get('/api/admin/logs')
    def logs(request:Request,before:int=0,action:str='',user:str='',status:int=0):
        with lock:
            s['admin_for'](request);where=['occurred_at>?'];params=[time.time()-30*86400]
            if before:where.append('id<?');params.append(before)
            if action:where.append('action LIKE ?');params.append('%'+action[:80]+'%')
            if user:where.append('(actor_name LIKE ? OR actor_id=? OR subject_id=?)');params.extend(['%'+user[:40]+'%',user[:50],user[:50]])
            if status:where.append('status>=?');params.append(status)
            rows=[]
            for r in db.execute('SELECT * FROM audit_events WHERE '+' AND '.join(where)+' ORDER BY id DESC LIMIT 51',params):
                item=dict(r);item['details']=json.loads(item['details']);rows.append(item)
            return {'events':rows[:50],'next':rows[49]['id'] if len(rows)>50 else None,'retention_days':30}
    @app.get('/api/admin/stats')
    def admin_stats(request:Request):
        with lock:
            s['admin_for'](request)
            return {'accounts':db.execute('SELECT COUNT(*) FROM users').fetchone()[0],'online':len(hub.clients),'streams':sum(len(c) for c in hub.clients.values()),'active_games':db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.status')='active'").fetchone()[0],'analysis_queued':s['analysis_work'].qsize(),'analysis_running':db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.analysis_status')='running'").fetchone()[0],'bot_queued':len(s['pending_bots']),'matchmaking':db.execute('SELECT COUNT(*) FROM matchmaking WHERE expires>?',(time.time(),)).fetchone()[0],'auth_failures_day':db.execute("SELECT COUNT(*) FROM audit_events WHERE action LIKE 'auth.%' AND status>=400 AND occurred_at>?",(time.time()-86400,)).fetchone()[0]}
    @app.get('/api/admin/games')
    def admin_games(request:Request,before:float=0):
        with lock:
            u=s['admin_for'](request);rows=db.execute('SELECT data FROM games WHERE created<? ORDER BY created DESC LIMIT 30',(before or time.time()+1,)).fetchall();return {'games':[s['public_game'](json.loads(r['data']),u,False) for r in rows]}
    @app.post('/api/admin/games/{gid}/abort')
    def abort_game(gid:str,body:AdminConfirm,request:Request):
        admin=confirmed_admin(request,body.current_password)
        with lock:
            fresh=s['admin_for'](request)
            if fresh['password']!=admin['password']:raise HTTPException(403,'Autorizzazione cambiata: riprova')
            g=s['get_game'](gid)
            if g['status'] not in ('active','waiting'):raise HTTPException(409,'Partita già conclusa')
            finish(g,'*','Partita annullata dall’amministratore');return {'ok':True}
    @app.post('/api/games/{gid}/analysis/cancel')
    def cancel_analysis(gid:str,request:Request):
        with lock:
            u=s['user_for'](request);g=s['get_game'](gid);read_participant(g,u)
            if g.get('analysis_status')=='running':g['analysis_status']='idle';g['analysis_run']=secrets.token_hex(12);s['save'](g)
            return {'ok':True}
    @app.get('/api/matchmaking')
    def queue_status(request:Request):
        with lock:
            u=s['user_for'](request);row=db.execute('SELECT * FROM matchmaking WHERE user_id=? AND expires>?',(u['id'],time.time())).fetchone();return {'queued':bool(row),'entry':dict(row) if row else None}
    @app.post('/api/matchmaking/cancel')
    def cancel_queue(request:Request):
        with lock:
            u=s['user_for'](request);db.execute('DELETE FROM matchmaking WHERE user_id=?',(u['id'],));return {'ok':True}
    @app.post('/api/matchmaking')
    def matchmaking(body:MatchOptions,request:Request):
        with lock:
            u=s['user_for'](request);rate_action(u['id'],'matchmaking',30,3600)
            if body.base not in (60,180,300,600,900,1800,2700,3600,5400) or body.increment not in (0,2,3,5,10):raise HTTPException(400,'Scegli un tempo con orologio')
            if active_count(u['id'])>=5:raise HTTPException(400,'Concludi prima una partita aperta')
            now=time.time();db.execute('DELETE FROM matchmaking WHERE expires<?',(now,));pool=time_pool(body.base,body.increment);own_rating=rating(u['id'],pool)['rating'];opponent=None
            for r in db.execute('SELECT m.*,u.disabled FROM matchmaking m JOIN users u ON u.id=m.user_id WHERE m.base=? AND m.increment=? AND m.rated=? AND m.user_id!=? ORDER BY m.created LIMIT 50',(body.base,body.increment,int(body.rated),u['id'])).fetchall():
                if r['disabled'] or blocked(u['id'],r['user_id']) or active_count(r['user_id'])>=5:continue
                if body.rated and abs(r['rating']-own_rating)>400+int((now-r['created'])*10):continue
                opponent=r['user_id'];break
            if not opponent:
                if db.execute('SELECT COUNT(*) FROM matchmaking').fetchone()[0]>=200:raise HTTPException(429,'La ricerca partite è piena. Riprova tra poco.')
                db.execute('INSERT INTO matchmaking VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET base=excluded.base,increment=excluded.increment,rated=excluded.rated,pool=excluded.pool,rating=excluded.rating,created=excluded.created,expires=excluded.expires',(u['id'],body.base,body.increment,int(body.rated),pool,own_rating,now,now+120));return {'queued':True,'expires':now+120}
            # A single process and the common lock serialize matching with game creation.
            game=s['create_game'](s['NewGame'](kind='friend',base=body.base,increment=body.increment,color='random',rated=body.rated),request)
            g=s['get_game'](game['id']);g['white' if g['white'] is None else 'black']=opponent;g.update(status='active',last=time.time(),matchmaking=True,target_user=opponent)
            db.execute('DELETE FROM matchmaking WHERE user_id IN (?,?)',(u['id'],opponent));s['save'](g)
            for uid in (u['id'],opponent):hub.send(uid,{'type':'match_found','game':s['public_game'](g,{'id':uid})})
            return {'queued':False,'game':s['public_game'](g,u)}
    s['friend_payload']=friend_payload

def recode(value):return ''.join(c for c in value.upper() if c.isalnum())
