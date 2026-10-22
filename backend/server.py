import os, re, json, time, secrets, hashlib, sqlite3, threading, queue, itertools, logging, io, ipaddress
from pathlib import Path
from urllib.parse import urlparse
from collections import defaultdict
from functools import lru_cache
from review import VERSION as REVIEW_VERSION, PROFILES, ReviewService, summary as review_summary
from contextlib import asynccontextmanager
import chess, chess.engine, chess.pgn
from bot_levels import MIN_ELO, MAX_ELO, choose_bot_move
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
from pydantic import BaseModel, Field

BASE = Path(__file__).parent
DATA = Path(os.getenv('DATA_DIR', BASE / 'data'))
DATA.mkdir(parents=True, exist_ok=True)
STOCKFISH = os.getenv('STOCKFISH_PATH', str(BASE / 'vendor/stockfish'))
PUBLIC_URL = os.getenv('PUBLIC_URL', '').rstrip('/')
lock = threading.RLock()
db = sqlite3.connect(DATA / 'club.sqlite', check_same_thread=False, isolation_level=None)
db.row_factory = sqlite3.Row
db.executescript('''
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT UNIQUE COLLATE NOCASE, password TEXT, admin INTEGER, created REAL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires REAL);
CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY, used INTEGER DEFAULT 0, created REAL);
CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, data TEXT, created REAL);
''')
# Add invitation metadata without altering existing players or games.
columns={r['name'] for r in db.execute('PRAGMA table_info(invites)')}
for column,definition in [('expires','REAL DEFAULT 0'),('creator','TEXT'),('used_by','TEXT'),('used_at','REAL')]:
    if column not in columns: db.execute('ALTER TABLE invites ADD COLUMN '+column+' '+definition)

setup_file = DATA / 'setup-token'
if not setup_file.exists():
    setup_file.write_text(secrets.token_urlsafe(32)); setup_file.chmod(0o600)
setup_token = setup_file.read_text().strip()
work = queue.PriorityQueue()
analysis_work = queue.Queue()
shutdown_event=threading.Event()
analysis_engine=None
review_service=None
sequence = itertools.count()
pending_bots = set()
failures = defaultdict(list)
engine = None
engine_error = None


def get_game(gid):
    row = db.execute('SELECT data FROM games WHERE id=?', (gid,)).fetchone()
    if not row: raise HTTPException(404, 'Partita non trovata')
    return json.loads(row['data'])


def save(g):
    db.execute('INSERT INTO games VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (g['id'], json.dumps(g), g['created']))


@lru_cache(maxsize=96)
def cached_board(initial_fen,moves):
    b=chess.Board(initial_fen)
    for move in moves:b.push_uci(move)
    return b

def board_of(g):return cached_board(g.get('initial_fen',chess.STARTING_FEN),tuple(g['moves'])).copy(stack=True)

@lru_cache(maxsize=96)
def cached_history(initial_fen,moves):
    replay=chess.Board(initial_fen);history=[]
    for uci in moves:
        move=chess.Move.from_uci(uci);san=replay.san(move);replay.push(move)
        history.append({'uci':uci,'san':san,'fen':replay.fen()})
    return history

def enqueue(kind,gid,priority=0,run=None):
    if kind=='analysis':analysis_work.put((gid,run))
    else:work.put((priority,next(sequence),kind,gid))


def finish(g, result, reason):
    g.update(status='finished', result=result, reason=reason, draw_offer=None)
    save(g)


def tick(g):
    if g['status'] != 'active' or not g['base']: return
    b = board_of(g)
    if g['clocks'][int(b.turn)] - max(0, time.time() - g['last']) <= 0:
        g['clocks'][int(b.turn)] = 0
        result = '1/2-1/2' if b.has_insufficient_material(not b.turn) else ('0-1' if b.turn else '1-0')
        finish(g, result, 'Tempo esaurito')


def apply_move(g, move, premove=False):
    b = board_of(g)
    if move not in b.legal_moves: raise HTTPException(400, 'Mossa non legale')
    now = time.time()
    if g['base']:
        idx = int(b.turn)
        g['clocks'][idx] -= max(.1 if (g['white'] if b.turn else g['black'])!='bot' else 0, now-g['last'])
        if g['clocks'][idx]<=0:
            g['clocks'][idx]=0;finish(g,'1/2-1/2' if b.has_insufficient_material(not b.turn) else ('0-1' if b.turn else '1-0'),'Tempo esaurito');return
        g['clocks'][idx] += g['increment']
    g['moves'].append(move.uci())
    g['last'] = now
    g['draw_offer'] = None
    b.push(move)
    outcome = b.outcome(claim_draw=False)
    if outcome:
        reasons = {'CHECKMATE': 'Scacco matto', 'STALEMATE': 'Stallo', 'INSUFFICIENT_MATERIAL': 'Materiale insufficiente', 'FIVEFOLD_REPETITION': 'Ripetizione', 'SEVENTYFIVE_MOVES': 'Regola delle 75 mosse'}
        finish(g, outcome.result(), reasons.get(outcome.termination.name, 'Partita conclusa'))
    else: save(g)


def seat(g, uid):
    if g['white'] == uid: return chess.WHITE
    if g['black'] == uid: return chess.BLACK
    return None


def participant(g, user):
    if seat(g, user['id']) is None: raise HTTPException(403, 'Questa partita è riservata ai suoi giocatori')


def session_user(request):
    token = request.cookies.get('club_session', '')
    hashed = hashlib.sha256(token.encode()).hexdigest()
    row = db.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND expires>?', (hashed, time.time())).fetchone()
    if not row: raise HTTPException(401, 'Accedi per continuare')
    if row['disabled']: raise HTTPException(401, 'Account disabilitato dall’amministratore')
    return dict(row)


def user_for(request):
    u=session_user(request)
    if not u['password']: raise HTTPException(401, 'Crea un account per continuare')
    if u.get('must_change_password') and request.url.path not in ('/api/password','/api/logout'):
        raise HTTPException(403,'Devi cambiare la password temporanea prima di continuare',headers={'X-Password-Change':'required'})
    return u


def name_for(uid, g):
    if uid == 'bot': return 'Stockfish · '+str(g['elo'])
    if not uid: return 'In attesa di un amico'
    r = db.execute('SELECT name FROM users WHERE id=?', (uid,)).fetchone()
    return r['name'] if r else 'Giocatore'


def public_game(g, user, detail=True):
    tick(g)
    b = board_of(g)
    clocks = list(g['clocks'])
    if g['status'] == 'active' and g['base']:
        clocks[int(b.turn)] = max(0, clocks[int(b.turn)]-(time.time()-g['last']))
    out = {k:g.get(k) for k in ('id','kind','elo','status','result','reason','created','base','increment','draw_offer','analysis_status','analysis_error','initial_fen','analysis_version','analysis_mode','analysis_summary','analysis_elapsed','analysis_cache_hits','analysis_searches','analysis_run')}
    out.update(game_fields(g))
    out.update(white_name=name_for(g['white'],g), black_name=name_for(g['black'],g), color=seat(g,user['id']), clocks=clocks, fen=b.fen(), turn=b.turn, ply=len(g['moves']), bot_busy=g['id'] in pending_bots, bot_error=g.get('bot_error'))
    if detail:
        history=cached_history(g['initial_fen'],tuple(g['moves']))
        out.update(history=history, legal=[m.uci() for m in b.legal_moves] if g['status']=='active' else [], check=chess.square_name(b.king(b.turn)) if b.is_check() else None, analysis=g.get('analysis', []))
    return out


def schedule_bot(g):
    if g['kind']=='bot' and g['status']=='active' and (g['white'] if board_of(g).turn else g['black'])=='bot' and g['id'] not in pending_bots:
        pending_bots.add(g['id']); enqueue('bot',g['id'])


def engine_config():
    return {'Threads':1, 'Hash':128, 'UCI_LimitStrength':False, 'Skill Level':20}


def explain(b, move, pv, best_score, played_score):
    parts=[]
    piece=b.piece_at(move.from_square)
    labels={chess.PAWN:'pedone',chess.KNIGHT:'cavallo',chess.BISHOP:'alfiere',chess.ROOK:'torre',chess.QUEEN:'donna',chess.KING:'re'}
    san=b.san(move)
    if b.is_castling(move): parts.append('L’arrocco mette il re al riparo al lato della scacchiera e attiva la torre.')
    elif b.is_capture(move):
        target=b.piece_at(move.to_square)
        parts.append('Questa mossa cattura '+('il '+labels[target.piece_type] if target else 'un pedone en passant')+' in '+chess.square_name(move.to_square)+'.')
    else: parts.append('Il '+labels[piece.piece_type]+' si porta da '+chess.square_name(move.from_square)+' a '+chess.square_name(move.to_square)+'.')
    if b.gives_check(move): parts.append('Dà scacco: l’avversario deve rispondere alla minaccia sul re.')
    if move.promotion: parts.append('Il pedone si promuove.')
    if piece.piece_type in (chess.KNIGHT,chess.BISHOP) and chess.square_rank(move.from_square) in (0,7) and len(b.move_stack)<20:
        parts.append('Sviluppa un pezzo dalla prima traversa.')
    if best_score.is_mate():
        mate=best_score.mate()
        if mate and mate>0: parts.append('Il motore vede una sequenza di matto in '+str(mate)+' mosse, con difesa ottimale.')
        elif mate is not None: parts.append('La posizione resta sotto una minaccia di matto nella ricerca attuale.')
    played_mate=played_score.mate()
    if played_mate is not None and played_mate<0 and not best_score.is_mate():
        distance=abs(played_mate)
        parts.append('La mossa giocata permette all’avversario un matto in '+str(distance)+(' mossa.' if distance==1 else ' mosse.')+' Questa alternativa evita quella sequenza nella ricerca attuale.')
    loss=max(0,(best_score.score(mate_score=100000) or 0)-(played_score.score(mate_score=100000) or 0))
    if loss>0 and loss<10000: parts.append('Rispetto alla mossa giocata conserva circa '+str(round(loss/100,2)).replace('.',',')+' pedoni di valutazione.')
    if pv: parts.append('La variante calcolata è: '+' → '.join(pv)+'.')
    parts.append('È la preferenza di Stockfish alla profondità raggiunta; la valutazione può cambiare con un’analisi più lunga.')
    return san, ' '.join(parts)


def before_review_search():
    # Separate one-thread engines fit the two-CPU budget without starving review.
    if shutdown_event.is_set():raise RuntimeError('Review shutdown')


def ensure_review_service():
    global analysis_engine,review_service
    if analysis_engine is None:
        analysis_engine=chess.engine.SimpleEngine.popen_uci(STOCKFISH,timeout=20)
        options={'Threads':1,'Hash':128,'UCI_LimitStrength':False,'Skill Level':20,'UCI_ShowWDL':True}
        tablebases=BASE/'vendor/syzygy'
        if (tablebases/'manifest.json').exists():options.update(SyzygyPath=str(tablebases),SyzygyProbeLimit=4,Syzygy50MoveRule=True)
        analysis_engine.configure(options)
    if review_service is None:review_service=ReviewService(analysis_engine,db,lock,before_review_search)
    return review_service

def analyse_ply(g):
    return ensure_review_service().analyse(g,explain)

def worker():
    global engine,engine_error
    while not shutdown_event.is_set():
        try:_,_,kind,gid=work.get(timeout=.2)
        except queue.Empty:continue
        try:
            with lock:
                g=get_game(gid);tick(g)
                if g['status']!='active' or (g['white'] if board_of(g).turn else g['black'])!='bot':continue
                b=board_of(g);expected=list(g['moves'])
            if engine is None:
                engine=chess.engine.SimpleEngine.popen_uci(STOCKFISH,timeout=20);engine.configure(engine_config());engine_error=None
            engine.configure(engine_config());move=choose_bot_move(engine,b,g['elo'],gid)
            with lock:
                latest=get_game(gid);tick(latest)
                if latest['status']=='active' and latest['moves']==expected and move:
                    latest['bot_error']=None;apply_move(latest,move)
        except Exception:
            if shutdown_event.is_set():break
            logging.exception('Stockfish bot task failed');engine_error='Il motore non ha completato la richiesta'
            with lock:
                try:g=get_game(gid);g['bot_error']='Il motore non risponde. Premi Riprova.';save(g)
                except HTTPException:pass
            if engine:
                try:engine.close()
                except Exception:pass
            engine=None
        finally:
            with lock:pending_bots.discard(gid)
            work.task_done()

def analysis_worker():
    global analysis_engine,review_service
    while not shutdown_event.is_set():
        try:gid,run=analysis_work.get(timeout=.2)
        except queue.Empty:continue
        try:
            if isinstance(gid,dict) and gid.get('kind')=='hint':
                gambit_hint_worker(gid['id'])
                continue
            with lock:
                g=get_game(gid)
                if g.get('analysis_status')!='running' or run!=g.get('analysis_run'):continue
                if len(g.get('analysis',[]))>=len(g['moves']):
                    g['analysis_status']='done';save(g);continue
            start=time.perf_counter();first=len(g['analysis']);rows=[]
            # Batch cheap cache hits to avoid one SQLite write and SSE redraw
            # per ply. A real search yields the queue immediately afterwards.
            for _ in range(8):
                row=analyse_ply(g);rows.append(row);g['analysis'].append(row)
                if len(g['analysis'])==len(g['moves']) or row['searches'] or time.perf_counter()-start>.08:break
            final_rows=review_service.finalize(g,explain) if len(g['analysis'])==len(g['moves']) else None
            elapsed=time.perf_counter()-start
            with lock:
                latest=get_game(gid)
                if latest.get('analysis_status')=='running' and latest.get('analysis_run')==run and len(latest['analysis'])==first:
                    latest['analysis'].extend(rows)
                    if final_rows is not None:latest['analysis']=final_rows
                    latest['analysis_summary']=review_summary(latest['analysis'])
                    latest['analysis_elapsed']=round(latest.get('analysis_elapsed',0)+elapsed,3)
                    latest['analysis_cache_hits']=latest.get('analysis_cache_hits',0)+sum(r['cache_hits'] for r in rows)
                    latest['analysis_searches']=latest.get('analysis_searches',0)+sum(r['searches'] for r in rows)
                    latest['analysis_status']='done' if len(latest['analysis'])==len(latest['moves']) else 'running'
                    save(latest)
                    if latest['analysis_status']=='running' and not shutdown_event.is_set():enqueue('analysis',gid,10,run)
        except Exception:
            if shutdown_event.is_set():break
            logging.exception('Stockfish review failed')
            with lock:
                try:
                    latest=get_game(gid)
                    if latest.get('analysis_run')==run:
                        latest.update(analysis_status='error',analysis_error='Analisi interrotta. Puoi riprendere senza perdere la partita.');save(latest)
                except HTTPException:pass
            if analysis_engine:
                try:analysis_engine.close()
                except Exception:pass
            analysis_engine=None;review_service=None
        finally:analysis_work.task_done()

def reset_analysis(g,mode):
    g.update(analysis=[],analysis_status='running',analysis_error=None,analysis_version=REVIEW_VERSION,analysis_mode=mode,analysis_run=secrets.token_hex(12),analysis_summary=review_summary([]),analysis_elapsed=0,analysis_cache_hits=0,analysis_searches=0)

@asynccontextmanager
async def lifespan(app):
    global engine,analysis_engine,review_service
    shutdown_event.clear()
    for tasks in (work,analysis_work):
        while True:
            try:tasks.get_nowait();tasks.task_done()
            except queue.Empty:break
    with lock:
        pending_bots.clear()
        for row in db.execute('SELECT data FROM games').fetchall():
            g=json.loads(row['data']);tick(g);schedule_bot(g)
            if g.get('analysis_status')=='running':
                if g.get('analysis_version')!=REVIEW_VERSION:reset_analysis(g,'quick');save(g)
                enqueue('analysis',g['id'],10,g.get('analysis_run'))
    threads=[threading.Thread(target=worker,daemon=True),threading.Thread(target=analysis_worker,daemon=True)]
    for thread in threads:thread.start()
    try:yield
    finally:
        shutdown_event.set()
        for thread in threads:thread.join(timeout=5)
        for running in (engine,analysis_engine):
            if running:
                try:running.close()
                except Exception:pass
        for thread in threads:thread.join(timeout=1)
        engine=None;analysis_engine=None;review_service=None

app=FastAPI(title='Scacchi Club', lifespan=lifespan, docs_url=None, redoc_url=None)

@app.middleware('http')
async def boundary(request, call_next):
    public_request=bool(PUBLIC_URL) and request.headers.get('host','').split(':')[0]==urlparse(PUBLIC_URL).hostname
    if public_request and request.headers.get('x-forwarded-proto',request.url.scheme)!='https':
        target=PUBLIC_URL+request.url.path+('?' + request.url.query if request.url.query else '')
        return RedirectResponse(target,status_code=308)
    if request.method not in ('GET','HEAD','OPTIONS'):
        if request.headers.get('x-club')!='1': return Response('Richiesta non consentita',403)
        origin=request.headers.get('origin')
        if origin and urlparse(origin).netloc!=request.headers.get('host'): return Response('Origine non consentita',403)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['X-Frame-Options']='DENY'
    response.headers['Referrer-Policy']='same-origin'
    response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    response.headers['Permissions-Policy']='camera=(), microphone=(), geolocation=()'
    if request.url.path in ('/','/index.html'):response.headers['Cache-Control']='no-cache'
    if public_request: response.headers['Strict-Transport-Security']='max-age=31536000'
    if request.url.path.startswith('/api/') and 'Cache-Control' not in response.headers: response.headers['Cache-Control']='no-store'
    return response

class Credentials(BaseModel):
    name: str = Field(min_length=3,max_length=24)
    password: str = Field(min_length=10,max_length=128)
    invite: str = Field(default='',max_length=100)
    setup_token: str = Field(default='',max_length=100)

class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1,max_length=128)
    new_password: str = Field(min_length=12,max_length=128)

class NewGame(BaseModel):
    kind: str = 'bot'
    elo: int = 1600
    color: str = 'white'
    base: int = 600
    increment: int = 5
    rated: bool = False

class MoveInput(BaseModel):
    uci: str = Field(min_length=4,max_length=5)
    expected_ply: int = Field(ge=0)
    premove: bool = False

class ImportPGN(BaseModel):
    pgn: str = Field(min_length=1,max_length=50000)


def auth_rate(request):
    key=client_ip(request)
    if len(failures)>10000:
        for stale in list(failures)[:1000]:failures.pop(stale,None)
    now=time.time(); failures[key]=[t for t in failures[key] if now-t<300]
    if len(failures[key])>=15: raise HTTPException(429,'Troppi tentativi. Riprova tra cinque minuti.')
    failures[key].append(now)


def login_cookie(response, uid):
    token=secrets.token_urlsafe(32)
    db.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
    db.execute('DELETE FROM sessions WHERE token IN (SELECT token FROM sessions WHERE user_id=? ORDER BY expires DESC LIMIT -1 OFFSET 9)',(uid,))
    db.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),uid,time.time()+30*86400))
    response.set_cookie('club_session',token,httponly=True,samesite='strict',secure=os.getenv('COOKIE_SECURE','0')=='1',max_age=30*86400)

@app.get('/api/health')
def health(): return {'ok':True,'stockfish':Path(STOCKFISH).exists(),'engine_error':engine_error}

def has_owner():
    return db.execute("SELECT 1 FROM users WHERE admin=1 AND password!=''").fetchone() is not None


def password_hash(password, salt=None):
    salt=salt or secrets.token_hex(16)
    digest=hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=32768,r=8,p=3,maxmem=64*1024*1024).hex()
    return 'scrypt:'+salt+':'+digest


def password_matches(password, stored):
    # Perform the same costly derivation even for an unknown account.
    salt=stored.split(':')[1] if stored and stored.startswith('scrypt:') else '0'*32
    candidate=password_hash(password,salt)
    return bool(stored) and secrets.compare_digest(candidate,stored)


def public_user(u):
    return {'id':u['id'],'name':u['name'],'admin':bool(u['admin']),**user_fields(u)}

@app.get('/api/me')
def me(request:Request):
    with lock:
        try:
            u=session_user(request)
            return {'user':public_user(u) if u['password'] else None,'legacy_name':u['name'] if not u['password'] else None,'setup':not has_owner()}
        except HTTPException: return {'user':None,'legacy_name':None,'setup':not has_owner()}

@app.get('/api/invite-info')
def invite_info(code:str=''):
    with lock:
        inv=db.execute('SELECT expires FROM invites WHERE code=? AND used=0 AND expires>?',(hashlib.sha256(code.encode()).hexdigest(),time.time())).fetchone()
        return {'valid':bool(inv),'expires':inv['expires'] if inv else None}

@app.post('/api/register')
def register(body:Credentials,request:Request,response:Response):
    with lock:
        if not globals().get('gambit_registration_open',lambda:True)():raise HTTPException(403,'Registrazioni temporaneamente chiuse')
        auth_rate(request);rate_action(client_ip(request),'signup',8,3600)
    name=body.name.strip()
    if not re.fullmatch(r'[A-Za-z0-9_\-]{3,24}',name): raise HTTPException(400,'Usa 3–24 lettere, numeri, trattini o underscore')
    if len(body.password)<12:raise HTTPException(400,'Scegli una password di almeno 12 caratteri')
    hashed=password_hash(body.password)
    with lock:
        name=body.name.strip()
        if not re.fullmatch(r'[A-Za-z0-9_\-]{3,24}',name): raise HTTPException(400,'Usa 3–24 lettere, numeri, trattini o underscore')
        owner=bool(body.setup_token)
        invite_key=hashlib.sha256(body.invite.encode()).hexdigest()
        if owner and (has_owner() or not secrets.compare_digest(body.setup_token,setup_token)):
            raise HTTPException(403,'Il link amministratore non è valido o è già stato usato')
        try: legacy=session_user(request)
        except HTTPException: legacy=None
        if legacy and legacy['password']: raise HTTPException(409,'Hai già un account. Esci prima di registrarne un altro.')
        duplicate=db.execute('SELECT id FROM users WHERE name=?',(name,)).fetchone()
        if duplicate and (not legacy or duplicate['id']!=legacy['id']): raise HTTPException(409,'Nome già in uso')
        uid=legacy['id'] if legacy else secrets.token_hex(12)
        db.execute('BEGIN IMMEDIATE')
        try:
            if legacy: db.execute('UPDATE users SET name=?,password=?,admin=?,owner=? WHERE id=?',(name,hashed,int(owner),int(owner),uid))
            else: db.execute('INSERT INTO users(id,name,password,admin,created,owner) VALUES(?,?,?,?,?,?)',(uid,name,hashed,int(owner),time.time(),int(owner)))
            if body.invite: db.execute('UPDATE invites SET used=1,used_by=?,used_at=? WHERE code=? AND used=0 AND expires>?',(uid,time.time(),invite_key,time.time()))
            db.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
            login_cookie(response,uid)
            db.execute('COMMIT')
        except Exception:
            db.execute('ROLLBACK'); raise
        return {'ok':True,'migrated':bool(legacy)}

@app.post('/api/login')
def login(body:Credentials,request:Request,response:Response):
    with lock:
        auth_rate(request);rate_action(body.name.strip().lower(),'login-account',15,300)
        u=db.execute("SELECT * FROM users WHERE name=? AND password!=''",(body.name.strip(),)).fetchone()
    valid=password_matches(body.password,u['password'] if u else '')
    with lock:
        fresh=db.execute('SELECT * FROM users WHERE id=?',(u['id'],)).fetchone() if u else None
        if not valid or not fresh or fresh['password']!=u['password']: raise HTTPException(401,'Nome o password errati')
        if fresh['disabled']: raise HTTPException(403,'Account disabilitato. Contatta l’amministratore.')
        globals().get('gambit_account_check',lambda uid:None)(fresh['id'])
        login_cookie(response,u['id']); return {'ok':True}

@app.post('/api/logout')
def logout(request:Request,response:Response):
    with lock:
        token=request.cookies.get('club_session','')
        db.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(token.encode()).hexdigest(),))
        response.delete_cookie('club_session'); return {'ok':True}

@app.post('/api/password')
def change_password(body:PasswordChange,request:Request,response:Response):
    with lock:auth_rate(request);u=user_for(request)
    if not password_matches(body.current_password,u['password']):raise HTTPException(403,'Password attuale non corretta')
    hashed=password_hash(body.new_password)
    with lock:
        fresh=session_user(request)
        if fresh['password']!=u['password']:raise HTTPException(409,'Password già cambiata. Accedi nuovamente.')
        db.execute('BEGIN IMMEDIATE')
        try:
            db.execute('UPDATE users SET password=?,must_change_password=0 WHERE id=?',(hashed,u['id']))
            db.execute('DELETE FROM sessions WHERE user_id=?',(u['id'],));login_cookie(response,u['id']);db.execute('COMMIT')
        except Exception:db.execute('ROLLBACK');raise
    return {'ok':True}


def admin_for(request):
    u=user_for(request)
    if not u['admin']: raise HTTPException(403,'Solo l’amministratore può gestire gli inviti')
    return u

@app.get('/api/invites')
def list_invites(request:Request):
    with lock:
        admin_for(request); result=[]
        for r in db.execute('SELECT invites.*,users.name AS member FROM invites LEFT JOIN users ON invites.used_by=users.id ORDER BY invites.created DESC LIMIT 100'):
            status='used' if r['used']==1 else 'revoked' if r['used']==2 else 'expired' if r['expires']<=time.time() else 'active'
            result.append({'id':r['code'],'created':r['created'],'expires':r['expires'],'status':status,'member':r['member']})
        return {'invites':result}

@app.post('/api/invites')
def invite(request:Request):
    with lock:
        u=admin_for(request)
        if db.execute('SELECT COUNT(*) FROM invites WHERE used=0 AND expires>?',(time.time(),)).fetchone()[0]>=50: raise HTTPException(400,'Hai già 50 inviti disponibili')
        code=secrets.token_urlsafe(24); expires=time.time()+7*86400
        db.execute('INSERT INTO invites(code,used,created,expires,creator) VALUES(?,0,?,?,?)',(hashlib.sha256(code.encode()).hexdigest(),time.time(),expires,u['id']))
        return {'code':code,'expires':expires}

@app.post('/api/invites/{invite_id}/revoke')
def revoke_invite(invite_id:str,request:Request):
    with lock:
        admin_for(request)
        row=db.execute('SELECT used FROM invites WHERE code=?',(invite_id,)).fetchone()
        if not row: raise HTTPException(404,'Invito non trovato')
        if row['used']!=0: raise HTTPException(409,'Questo invito non è più attivo')
        db.execute('UPDATE invites SET used=2 WHERE code=?',(invite_id,));return {'ok':True}

@app.get('/api/lobby')
def lobby(request:Request):
    with lock:
        u=user_for(request); games=[]; rooms=[]
        for row in db.execute("SELECT data FROM games WHERE json_extract(data,'$.white')=? OR json_extract(data,'$.black')=? ORDER BY created DESC LIMIT 100",(u['id'],u['id'])).fetchall():
            g=json.loads(row['data']); tick(g)
            if seat(g,u['id']) is not None: games.append(public_game(g,u,False))
            # Waiting rooms are discoverable only via their unguessable game link.
        return {'games':games,'rooms':rooms}

@app.post('/api/games')
def create_game(body:NewGame,request:Request):
    with lock:
        u=user_for(request)
        if body.kind not in ('bot','friend') or body.color not in ('white','black','random') or body.elo<MIN_ELO or body.elo>MAX_ELO or body.base not in (0,60,180,300,600,900,1800,2700,3600,5400) or body.increment not in (0,2,3,5,10): raise HTTPException(400,'Impostazioni della partita non valide')
        rate_action(u['id'],'new-game',60,3600)
        active=active_count(u['id'])
        if db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.status') IN ('active','waiting')").fetchone()[0]>=200:raise HTTPException(429,'Il server ha raggiunto il limite di partite aperte. Riprova tra poco.')
        if body.kind=='bot' and db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.status')='active' AND json_extract(data,'$.kind')='bot'").fetchone()[0]>=16:raise HTTPException(429,'Tutte le postazioni dei bot sono occupate. Riprova tra poco.')
        if body.rated and (body.kind!='friend' or not body.base):raise HTTPException(400,'Le ranked richiedono due persone e un orologio')
        if len(pending_bots)>=12 and body.kind=='bot':raise HTTPException(429,'Troppe partite contro i bot. Riprova tra poco.')
        if active>=5: raise HTTPException(400,'Concludi una delle tue cinque partite aperte')
        color=secrets.choice((True,False)) if body.color=='random' else body.color=='white'
        opponent='bot' if body.kind=='bot' else None
        g={'id':secrets.token_urlsafe(12),'kind':body.kind,'elo':body.elo,'white':u['id'] if color else opponent,'black':opponent if color else u['id'],'status':'active' if opponent else 'waiting','moves':[],'initial_fen':chess.STARTING_FEN,'result':'*','reason':'','created':time.time(),'last':time.time(),'base':body.base,'increment':body.increment,'clocks':[body.base,body.base],'analysis':[],'analysis_status':'idle','draw_offer':None}
        g.update(rated=body.rated,rating_pool=__import__('community').time_pool(body.base,body.increment))
        save(g); schedule_bot(g); return public_game(g,u)

@app.post('/api/games/{gid}/join')
def join(gid:str,request:Request):
    with lock:
        u=user_for(request); g=get_game(gid)
        if seat(g,u['id']) is not None: return public_game(g,u)
        if g.get('target_user') and g['target_user']!=u['id']: raise HTTPException(403,'Questa sfida è riservata al destinatario')
        if g['status']!='waiting': raise HTTPException(409,'La stanza è già occupata o conclusa')
        creator=g['white'] or g['black']
        creator_admin=db.execute('SELECT admin FROM users WHERE id=?',(creator,)).fetchone()
        if not friend_allowed(u,creator) and not (g.get('target_user')==u['id'] and creator_admin and creator_admin['admin']):raise HTTPException(403,'Per entrare in questa stanza serve un’amicizia accettata')
        active=active_count(u['id'])
        if active>=5: raise HTTPException(400,'Concludi prima una delle tue partite aperte')
        g['white' if g['white'] is None else 'black']=u['id']; g['status']='active'; g['last']=time.time(); save(g)
        return public_game(g,u)

@app.get('/api/games/{gid}')
def game(gid:str,request:Request):
    with lock:
        u=user_for(request); g=get_game(gid); read_participant(g,u); return public_game(g,u)

@app.post('/api/games/{gid}/move')
def move(gid:str,body:MoveInput,request:Request):
    with lock:
        u=user_for(request); g=get_game(gid); participant(g,u); tick(g)
        if g['status']!='active': raise HTTPException(409,'La partita non è in corso')
        if len(g['moves'])!=body.expected_ply: raise HTTPException(409,'La posizione è cambiata. Riprova.')
        b=board_of(g)
        if seat(g,u['id'])!=b.turn: raise HTTPException(403,'È il turno dell’avversario')
        try: m=chess.Move.from_uci(body.uci)
        except ValueError: raise HTTPException(400,'Formato della mossa non valido')
        apply_move(g,m,body.premove); schedule_bot(g); return public_game(g,u)

@app.post('/api/games/{gid}/resign')
def resign(gid:str,request:Request):
    with lock:
        u=user_for(request); g=get_game(gid); participant(g,u); tick(g)
        if g['status']=='waiting': finish(g,'*','Stanza annullata')
        elif g['status']=='active': finish(g,'0-1' if seat(g,u['id']) else '1-0','Abbandono')
        else: raise HTTPException(409,'La partita è già conclusa')
        return public_game(g,u)

@app.post('/api/games/{gid}/draw')
def draw(gid:str,request:Request):
    with lock:
        u=user_for(request); g=get_game(gid); participant(g,u); tick(g)
        if g['status']!='active': raise HTTPException(409,'La partita non è in corso')
        if g['kind']=='bot':
            if seat(g,u['id'])!=board_of(g).turn or not board_of(g).can_claim_draw(): raise HTTPException(400,'Puoi reclamare patta al tuo turno, per ripetizione o regola delle 50 mosse quando prevista')
            finish(g,'1/2-1/2','Patta reclamata')
        elif g['draw_offer'] and g['draw_offer']!=u['id']: finish(g,'1/2-1/2','Patta concordata')
        elif board_of(g).can_claim_draw() and seat(g,u['id'])==board_of(g).turn: finish(g,'1/2-1/2','Patta reclamata')
        else: g['draw_offer']=u['id']; save(g)
        return public_game(g,u)

@app.post('/api/games/{gid}/retry-bot')
def retry_bot(gid:str,request:Request):
    with lock:
        u=user_for(request); g=get_game(gid); participant(g,u); tick(g); schedule_bot(g); return {'ok':True}

class AnalysisOptions(BaseModel):
    mode:str='quick'
    force:bool=False

@app.post('/api/games/{gid}/analysis')
def analysis(gid:str,request:Request,body:AnalysisOptions=AnalysisOptions()):
    if body.mode not in PROFILES:raise HTTPException(400,'Scegli analisi rapida o approfondita')
    with lock:
        u=user_for(request);g=get_game(gid);read_participant(g,u);tick(g)
        if g['status']!='finished':raise HTTPException(400,'L’analisi è disponibile al termine della partita')
        if not g['moves']:raise HTTPException(400,'Non ci sono mosse da analizzare')
        if g.get('analysis_status')=='running':return {'ok':True,'mode':g.get('analysis_mode','quick')}
        changed=g.get('analysis_version')!=REVIEW_VERSION or g.get('analysis_mode')!=body.mode
        if changed or body.force or g.get('analysis_status') not in ('running','done'):
            analysis_admission(u,g,body.mode)
            # Resume a failed analysis only when its method/profile still match.
            if changed or body.force or not g.get('analysis_run'):reset_analysis(g,body.mode)
            else:g.update(analysis_status='running',analysis_error=None)
            g['analysis_requested_by']=u['id'];save(g);enqueue('analysis',gid,10,g['analysis_run'])
        return {'ok':True,'mode':g.get('analysis_mode',body.mode)}

@app.get('/api/games/{gid}/pgn')
def pgn(gid:str,request:Request):
    with lock:
        u=user_for(request); g=get_game(gid); read_participant(g,u); tick(g)
        game=chess.pgn.Game.from_board(board_of(g))
        game.headers.update(Event='Scacchi Club',White=name_for(g['white'],g),Black=name_for(g['black'],g),Result=g['result'],Date=time.strftime('%Y.%m.%d',time.localtime(g['created'])))
        if g['base']: game.headers['TimeControl']=str(g['base'])+'+'+str(g['increment'])
        return Response(str(game),media_type='application/x-chess-pgn',headers={'Content-Disposition':'attachment; filename="scacchi-'+gid+'.pgn"'})

@app.post('/api/import')
def import_game(body:ImportPGN,request:Request):
    with lock:
        u=user_for(request);rate_action(u['id'],'pgn-import',20,3600)
        try:
            parsed=chess.pgn.read_game(io.StringIO(body.pgn))
            if not parsed or parsed.errors: raise ValueError()
            moves=list(parsed.mainline_moves())
            if not moves or len(moves)>500 or not parsed.board().is_valid(): raise ValueError()
            b=parsed.board()
            for m in moves:
                if m not in b.legal_moves: raise ValueError()
                b.push(m)
        except Exception: raise HTTPException(400,'PGN non valido: importa una singola partita fino a 500 semimosse')
        g={'id':secrets.token_urlsafe(12),'kind':'import','elo':None,'white':u['id'],'black':u['id'],'status':'finished','moves':[m.uci() for m in moves],'initial_fen':parsed.board().fen(),'result':parsed.headers.get('Result','*'),'reason':'Partita importata','created':time.time(),'last':time.time(),'base':0,'increment':0,'clocks':[0,0],'analysis':[],'analysis_status':'idle','draw_offer':None}
        save(g); return public_game(g,u)

from live import install
install(globals())
from community import install as install_community
install_community(globals())
from gambit import install as install_gambit
install_gambit(globals())
from security import install as install_security
install_security(globals())

app.mount('/',StaticFiles(directory=BASE/'static',html=True),name='static')
