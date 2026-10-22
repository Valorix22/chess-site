"""Bounded, authorized community, content and tournament operations."""
import asyncio
import contextlib
import json
import math
import secrets
import time
from contextlib import asynccontextmanager
from urllib.parse import urlparse
import os
import chess
from fastapi import Body,HTTPException,Request
from starlette.responses import Response
from gambit import KINDS,ADMIN_CONTENT


def install(s,e):
    app,db,lock,hub=e['app'],e['db'],e['lock'],e['hub']
    actor,clean,number=e['actor'],e['clean'],e['number']
    row,getdata,visible,member=e['content_row'],e['content_data'],e['visible'],e['member']
    audit,notify,changed=e['audit'],e['notify'],e['changed']
    def flag(kind):
        key={'puzzle':'puzzles','course':'learn','lesson':'learn','club':'community','thread':'community','reply':'community','tournament':'tournaments','stream':'watch','vod':'watch','broadcast':'watch'}[kind]
        e['enabled'](key)
    def can_edit(item,u):
        if not u['admin'] and item['owner']!=u['id'] and not (item['kind']=='club' and member(item['id'],u['id']) and member(item['id'],u['id'])['role']=='admin'):raise HTTPException(403,'Non puoi modificare questo contenuto')
        if item['kind'] in ADMIN_CONTENT and not u['admin']:
            _,p=e['profile'](u['id'])
            if item['kind']!='stream' or not p or not p['creator']:raise HTTPException(403,'Operazione riservata agli amministratori')
    def normalize(kind,body,previous=None):
        if not isinstance(body,dict):raise HTTPException(400,'Contenuto non valido')
        data=dict(previous or {})
        fields={
            'puzzle':{'fen','solution','hint','explanation','theme','rating','daily'},
            'course':{'description','level','duration','tone','glyph','category'},
            'lesson':{'description','text','fen','moves','order','chapter'},
            'club':{'description','privacy','emblem','rules'},
            'thread':{'text','tag','locked','pinned'},'reply':{'text'},
            'tournament':{'description','format','base','increment','rated','rounds','starts_at','duration','min_rating','max_rating','max_players','team_club','phase'},
            'stream':{'description','category','url','live','featured','starts_at'},
            'vod':{'description','category','url','duration'},
            'broadcast':{'description','game_id','starts_at','featured'},
        }[kind]
        if set(body)-fields:raise HTTPException(400,'Campo contenuto non supportato')
        for key,value in body.items():
            if key in ('description','hint','explanation','text','rules','chapter','tag','theme','category','level','emblem','glyph','tone'):data[key]=clean(value,8000 if key in ('text','description','rules') else 300)
            elif key in ('live','featured','locked','pinned','rated','daily'):
                if type(value) is not bool:raise HTTPException(400,'Valore non valido')
                data[key]=value
            else:data[key]=value
        if kind=='puzzle':
            try:
                board=chess.Board(data['fen']);assert board.is_valid()
                solution=data['solution'];assert isinstance(solution,list) and 1<=len(solution)<=30
                for move in solution:
                    assert isinstance(move,str);m=chess.Move.from_uci(move);assert m in board.legal_moves;board.push(m)
            except (KeyError,ValueError,AssertionError,TypeError):raise HTTPException(400,'FEN o soluzione del puzzle non validi')
            data['rating']=number(data.get('rating',1200),100,4000)
        elif kind=='lesson':
            try:
                board=chess.Board(data.get('fen',chess.STARTING_FEN));assert board.is_valid()
                moves=data.get('moves',[]);assert isinstance(moves,list) and len(moves)<=100
                for move in moves:
                    m=chess.Move.from_uci(move);assert m in board.legal_moves;board.push(m)
                data.update(fen=data.get('fen',chess.STARTING_FEN),moves=moves,order=number(data.get('order',0),0,1000))
            except (ValueError,AssertionError,TypeError):raise HTTPException(400,'Linea della lezione non valida')
        elif kind=='club':
            data.setdefault('privacy','public')
            if data['privacy'] not in ('private','public'):raise HTTPException(400,'Privacy non valida')
        elif kind=='tournament':
            data.setdefault('format','swiss');data.setdefault('phase','scheduled')
            if data['format'] not in ('swiss','arena','team','puzzle') or data['phase'] not in ('scheduled','active','paused','finished','cancelled'):raise HTTPException(400,'Formato o stato non valido')
            data['base']=number(data.get('base',600),60,5400);data['increment']=number(data.get('increment',0),0,10)
            if data['base'] not in (60,180,300,600,900,1800,2700,3600,5400) or data['increment'] not in (0,2,3,5,10):raise HTTPException(400,'Tempo non supportato')
            data['rounds']=number(data.get('rounds',3),1,9);data['max_players']=number(data.get('max_players',32),2,64)
            data['duration']=number(data.get('duration',3600),300,86400);data['min_rating']=number(data.get('min_rating',100),100,4000);data['max_rating']=number(data.get('max_rating',4000),100,4000)
            if data['min_rating']>data['max_rating']:raise HTTPException(400,'Intervallo Elo non valido')
            try:data['starts_at']=float(data.get('starts_at',time.time()+300));assert math.isfinite(data['starts_at'])
            except (ValueError,TypeError,AssertionError):raise HTTPException(400,'Data non valida')
        elif kind in ('stream','vod'):
            parsed=urlparse(data.get('url',''));allowed={v.strip() for v in os.getenv('STREAMING_ALLOWED_HOSTS','').split(',') if v.strip()}
            if parsed.scheme!='https' or parsed.hostname not in allowed or parsed.username or parsed.password:raise HTTPException(400,'URL del servizio video non autorizzato')
        if len(json.dumps(data))>16000:raise HTTPException(400,'Contenuto troppo grande')
        return data

    @app.get('/api/platform/content/{kind}')
    def listing(kind:str,request:Request,q:str='',page:int=1,parent:str='',status:str='published'):
        with lock:
            if kind not in KINDS:raise HTTPException(404,'Categoria non trovata')
            flag(kind);u=actor(request);page=min(10000,max(1,page));limit=30
            sql='SELECT * FROM content WHERE kind=? AND title LIKE ?';params=[kind,'%'+q[:80]+'%']
            if parent:sql+=' AND parent=?';params.append(parent)
            if status!='published':
                if not u['admin']:sql+=' AND owner=?';params.append(u['id'])
                sql+=' AND status!=\'deleted\''
            else:sql+=" AND status='published'"
            rows=db.execute(sql+' ORDER BY created DESC LIMIT ? OFFSET ?',(*params,limit,(page-1)*limit)).fetchall()
            return {'items':[getdata(dict(r),u) for r in rows if visible(dict(r),u)],'page':page,'has_more':len(rows)==limit}
    @app.get('/api/platform/content/item/{cid}')
    def detail(cid:str,request:Request):
        with lock:
            u=actor(request);r=row(cid);flag(r['kind']);return getdata(r,u,full=True)
    @app.post('/api/platform/content/{kind}')
    def create(kind:str,request:Request,body:dict=Body(...)):
        with lock:
            if kind not in KINDS:raise HTTPException(404,'Categoria non trovata')
            flag(kind);u=actor(request,'content-'+kind,20 if kind=='reply' else 5,3600)
            if kind in ADMIN_CONTENT and not u['admin']:
                _,p=e['profile'](u['id'])
                if kind!='stream' or not p or not p['creator']:raise HTTPException(403,'Solo gli amministratori possono pubblicare questo contenuto')
            e['capacity']('content',10000);e['capacity']('content',500,"owner=? AND status!='deleted'",(u['id'],))
            parent=body.get('parent') or None
            if kind in ('lesson','reply'):
                parent_row=row(parent,'course' if kind=='lesson' else 'thread')
                if not visible(parent_row,u):raise HTTPException(403,'Contenuto riservato')
                if kind=='reply' and json.loads(parent_row['data']).get('locked') and not u['admin']:raise HTTPException(403,'Discussione chiusa')
            data=normalize(kind,body.get('data',{}))
            if kind=='thread' and not u['admin']:data.pop('pinned',None);data.pop('locked',None)
            if not u['admin']:data.pop('featured',None)
            if kind=='tournament':data['phase']='scheduled'
            state=body.get('status','draft' if kind in ADMIN_CONTENT else 'published')
            if state not in ('draft','published'):raise HTTPException(400,'Stato non valido')
            cid=e['uid']();now=time.time();db.execute('INSERT INTO content VALUES(?,?,?,?,?,?,?,?,?)',(cid,kind,u['id'],parent,clean(body.get('title',''),150,True),json.dumps(data),state,now,now))
            if kind=='club':db.execute("INSERT INTO memberships VALUES(?,?,'owner','accepted',?)",(cid,u['id'],now))
            audit('content.create',u,cid,after={'kind':kind,'status':state});changed(kind,cid)
            if kind=='reply':
                followers={parent_row['owner']}|{x[0] for x in db.execute("SELECT user_id FROM memberships WHERE content_id=? AND state='accepted' LIMIT 200",(parent,))}
                for follower in followers-{u['id']}:notify(follower,'forum','Nuova risposta',u['name'],'/community.html?thread='+parent)
            return getdata(row(cid),u,True)
    @app.patch('/api/platform/content/item/{cid}')
    def update(cid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'content-edit',60);r=row(cid);flag(r['kind']);can_edit(r,u);before=json.loads(r['data'])
            if 'parent' in body and body['parent']!=r['parent']:raise HTTPException(400,'Il contenuto non può essere spostato')
            if not u['admin'] and set(body.get('data',{})) & {'pinned','locked','featured','phase'}:raise HTTPException(403,'Campo riservato alla moderazione')
            if r['kind']=='tournament' and before.get('phase')!='scheduled':raise HTTPException(409,'Torneo già avviato: usa i controlli dedicati')
            data=normalize(r['kind'],body.get('data',{}),before);state=body.get('status',r['status'])
            if state not in ('draft','published','archived','deleted'):raise HTTPException(400,'Stato non valido')
            db.execute('UPDATE content SET title=?,data=?,status=?,updated=? WHERE id=?',(clean(body.get('title',r['title']),150,True),json.dumps(data),state,time.time(),cid))
            audit('content.update',u,cid,before={'status':r['status']},after={'kind':r['kind'],'status':state});changed(r['kind'],cid)
            return {'ok':True} if state=='deleted' else getdata(row(cid),u,True)
    @app.post('/api/platform/content/item/{cid}/membership')
    def membership(cid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'membership',30);r=row(cid);data=json.loads(r['data']);kind=r['kind'];flag(kind)
            action=body.get('action','join');target=body.get('user_id',u['id']);m=member(cid,u['id'])
            if target!=u['id'] and not (u['admin'] or kind=='club' and m and m['role'] in ('owner','admin')):raise HTTPException(403,'Puoi gestire solo le tue iscrizioni')
            if target!=u['id'] and action not in ('accept','decline','remove','admin','member','transfer'):raise HTTPException(400,'Azione non valida')
            if kind not in ('club','course','stream','tournament','thread'):raise HTTPException(400,'Iscrizione non disponibile')
            if action=='join':
                e['capacity']('memberships',200,'user_id=?',(u['id'],))
                if kind=='club':e['capacity']('memberships',200,'content_id=?',(cid,))
                if not visible(r,u) and not (kind=='club' and r['status']=='published'):raise HTTPException(403,'Contenuto riservato')
                if kind=='tournament':
                    if data.get('phase') not in ('scheduled','active') or data['format']!='arena' and data.get('phase')=='active':raise HTTPException(409,'Iscrizioni chiuse')
                    count=db.execute("SELECT COUNT(*) FROM memberships WHERE content_id=? AND state='accepted'",(cid,)).fetchone()[0]
                    if count>=data['max_players']:raise HTTPException(409,'Torneo completo')
                    from community import time_pool
                    rating=s['rating_for'](u['id'],time_pool(data['base'],data['increment']))['rating']
                    if not data['min_rating']<=rating<=data['max_rating']:raise HTTPException(403,'Elo fuori dall’intervallo del torneo')
                    if data['format']=='team':
                        team=body.get('team_club');team_row=row(team,'club')
                        if not member(team,u['id']):raise HTTPException(403,'Scegli un club di cui sei membro')
                        db.execute('INSERT INTO progress VALUES(?,?,?,?) ON CONFLICT(content_id,user_id) DO UPDATE SET data=excluded.data,updated=excluded.updated',(cid,u['id'],json.dumps({'team_club':team}),time.time()))
                state='pending' if kind=='club' and data.get('privacy')=='private' and r['owner']!=u['id'] else 'accepted'
                db.execute('INSERT INTO memberships VALUES(?,?,?,?,?) ON CONFLICT(content_id,user_id) DO NOTHING',(cid,u['id'],'member',state,time.time()))
                if state=='pending':notify(r['owner'],'club','Richiesta iscrizione al club',u['name'],'/community.html?club='+cid)
            elif action in ('leave','remove','decline'):
                old=member(cid,target)
                if old and old['role']=='owner':raise HTTPException(409,'Trasferisci il club prima di uscire')
                if kind=='tournament' and data.get('phase')=='active':raise HTTPException(409,'Il torneo è in corso')
                db.execute('DELETE FROM memberships WHERE content_id=? AND user_id=?',(cid,target))
            elif action=='transfer':
                if kind!='club' or not (r['owner']==u['id'] or u['admin']) or not member(cid,target):raise HTTPException(403,'Trasferimento non consentito')
                with e['atomic']():
                    db.execute("UPDATE memberships SET role='member' WHERE content_id=? AND role='owner'",(cid,));db.execute("UPDATE memberships SET role='owner' WHERE content_id=? AND user_id=?",(cid,target));db.execute('UPDATE content SET owner=?,updated=? WHERE id=?',(target,time.time(),cid))
            elif action in ('accept','admin','member'):
                if kind!='club':raise HTTPException(400,'Azione non valida')
                if not (u['admin'] or m and m['role'] in ('owner','admin')):raise HTTPException(403,'Solo i responsabili possono approvare le iscrizioni')
                if action in ('admin','member') and r['owner']!=u['id'] and not u['admin']:raise HTTPException(403,'Solo il proprietario può cambiare i ruoli del club')
                db.execute("UPDATE memberships SET state='accepted',role=? WHERE content_id=? AND user_id=? AND role!='owner'",('admin' if action=='admin' else 'member',cid,target))
            else:raise HTTPException(400,'Azione non valida')
            if target!=u['id']:audit('membership.'+action,u,cid,after={'user':target})
            changed(kind,cid);return {'ok':True,'item':getdata(row(cid),u)}
    @app.get('/api/platform/content/item/{cid}/members')
    def members(cid:str,request:Request):
        with lock:
            u=actor(request);r=row(cid)
            if not visible(r,u):raise HTTPException(403,'Contenuto riservato')
            rows=db.execute('SELECT m.*,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE content_id=? ORDER BY created LIMIT 200',(cid,)).fetchall()
            # Club managers can see their own applicants, not a global directory.
            manage=u['admin'] or r['kind']=='club' and r['owner']==u['id'] or r['kind']=='club' and member(cid,u['id']) and member(cid,u['id'])['role']=='admin'
            return {'items':[dict(x) for x in rows if manage or x['user_id']==u['id'] or s['are_friends'](u['id'],x['user_id'])],'total':len(rows)}
    @app.post('/api/platform/content/item/{cid}/vote')
    def vote(cid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'vote',100);r=row(cid)
            if r['kind'] not in ('thread','reply') or not visible(r,u):raise HTTPException(404,'Discussione non trovata')
            value=number(body.get('value'),-1,1)
            if value==0:db.execute('DELETE FROM content_votes WHERE content_id=? AND user_id=?',(cid,u['id']))
            else:db.execute('INSERT INTO content_votes VALUES(?,?,?) ON CONFLICT(content_id,user_id) DO UPDATE SET value=excluded.value',(cid,u['id'],value))
            return getdata(r,u)

    def standings(cid,u):
        info=json.loads(row(cid,'tournament')['data'])
        entries={r['user_id']:{'user_id':r['user_id'],'name':r['name'] if u['admin'] or r['user_id']==u['id'] or s['are_friends'](u['id'],r['user_id']) else 'Partecipante '+r['user_id'][:4],'points':0,'wins':0,'games':0,'opponents':[]} for r in db.execute("SELECT m.user_id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE content_id=? AND state='accepted'",(cid,))}
        if info['format']=='puzzle':
            for player in entries.values():
                result=db.execute("SELECT COUNT(*) FROM puzzle_attempts WHERE user_id=? AND json_extract(data,'$.tournament')=? AND json_extract(data,'$.correct')=1 AND json_extract(data,'$.tries')=0 AND finished<=?",(player['user_id'],cid,info.get('ends_at',0))).fetchone()[0];player.update(points=result,wins=result,games=result,tiebreak=0)
            return sorted(entries.values(),key=lambda x:(-x['points'],x['user_id']))
        for pairing in db.execute('SELECT * FROM tournament_pairings WHERE tournament_id=? ORDER BY round,board',(cid,)):
            for side,other,win_result in [('white','black','1-0'),('black','white','0-1')]:
                player=entries.get(pairing[side])
                if not player:continue
                if pairing['result'] in ('1-0','0-1','1/2-1/2'):
                    win=pairing['result']==win_result;draw=pairing['result']=='1/2-1/2';arena=info['format']=='arena';base=2 if arena else 1;points=(base*2 if arena and player.get('streak',0)>=2 else base) if win else base/2 if draw else 0
                    player['games']+=1;player['points']+=points;player['wins']+=int(win);player['streak']=player.get('streak',0)+1 if win else 0
                if pairing[other]:player['opponents'].append(pairing[other])
                elif pairing['result']=='bye':player['points']+=1
        for player in entries.values():player['tiebreak']=sum(entries.get(x,{}).get('points',0) for x in player['opponents'])
        return sorted(entries.values(),key=lambda x:(-x['points'],-x['tiebreak'],-x['wins'],x['user_id']))
    def tournament_refresh(cid):
        r=row(cid,'tournament');d=json.loads(r['data'])
        if d['phase']!='active':return
        # Resolve completed matches from the authoritative games, never a UI score.
        for p in db.execute("SELECT * FROM tournament_pairings WHERE tournament_id=? AND result='*' AND game_id IS NOT NULL",(cid,)).fetchall():
            g=s['get_game'](p['game_id']);s['tick'](g)
            if g['status']=='finished':db.execute('UPDATE tournament_pairings SET result=? WHERE game_id=?',(g['result'] if g['result']!='*' else 'void',g['id']))
        now=time.time();current=db.execute('SELECT COALESCE(MAX(round),0) FROM tournament_pairings WHERE tournament_id=?',(cid,)).fetchone()[0]
        unfinished=db.execute("SELECT 1 FROM tournament_pairings WHERE tournament_id=? AND result='*'",(cid,)).fetchone()
        if d['format']=='puzzle':
            if now>=d.get('ends_at',now+1):d['phase']='finished'
            else:return
        elif now>=d.get('ends_at',now+1) and unfinished:return
        elif now>=d.get('ends_at',now+1) or current>=d['rounds'] and not unfinished and d['format']!='arena':d['phase']='finished'
        else:
            if unfinished and d['format']!='arena':return
            synthetic={'id':r['owner'],'admin':True};ranking=standings(cid,synthetic)
            playing={v for p in db.execute("SELECT white,black FROM tournament_pairings WHERE tournament_id=? AND result='*'",(cid,)) for v in p if v}
            available=[x for x in ranking if x['user_id'] not in playing and s['active_count'](x['user_id'])<5 and not db.execute('SELECT 1 FROM users WHERE id=? AND disabled=1',(x['user_id'],)).fetchone() and not db.execute("SELECT 1 FROM sanctions WHERE user_id=? AND kind IN('suspend','ban') AND revoked IS NULL AND (expires IS NULL OR expires>?)",(x['user_id'],time.time())).fetchone()]
            if len(available)<2:return
            round_no=current+1;board_no=0
            while len(available)>=2:
                a=available.pop(0)
                def team_of(uid):
                    entry=db.execute('SELECT data FROM progress WHERE content_id=? AND user_id=?',(cid,uid)).fetchone();return json.loads(entry[0]).get('team_club') if entry else None
                candidates=[i for i,b in enumerate(available) if not s['blocked'](a['user_id'],b['user_id']) and (d['format']!='team' or team_of(b['user_id'])!=team_of(a['user_id']))]
                if not candidates:continue
                index=next((i for i in candidates if available[i]['user_id'] not in a['opponents']),candidates[0]);b=available.pop(index)
                if db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.status') IN('active','waiting')").fetchone()[0]>=200:return
                board_no+=1;white,black=(a['user_id'],b['user_id']) if (round_no+board_no)%2 else (b['user_id'],a['user_id'])
                from community import time_pool
                game={'id':secrets.token_urlsafe(12),'kind':'friend','elo':None,'white':white,'black':black,'status':'active','moves':[],'initial_fen':chess.STARTING_FEN,'result':'*','reason':'','created':now,'last':now,'base':d['base'],'increment':d['increment'],'clocks':[d['base'],d['base']],'analysis':[],'analysis_status':'idle','draw_offer':None,'rated':bool(d.get('rated',False)),'rating_pool':time_pool(d['base'],d['increment']),'tournament_id':cid}
                with e['atomic']():
                    s['save'](game);db.execute('INSERT INTO tournament_pairings VALUES(?,?,?,?,?,?,?)',(cid,round_no,board_no,white,black,game['id'],'*'))
                for player in (white,black):notify(player,'tournament','Il tuo turno è iniziato',r['title'],'/play.html?game='+game['id'])
            if available and d['format'] not in ('arena','team'):
                board_no+=1;db.execute('INSERT INTO tournament_pairings VALUES(?,?,?,?,?,?,?)',(cid,round_no,board_no,available[0]['user_id'],None,None,'bye'))
            changed('tournament',cid);return
        db.execute('UPDATE content SET data=?,updated=? WHERE id=?',(json.dumps(d),now,cid));changed('tournament',cid)
    def prepare_start(cid,d):
        if db.execute("SELECT COUNT(*) FROM memberships WHERE content_id=? AND state='accepted'",(cid,)).fetchone()[0]<2:raise HTTPException(409,'Servono almeno due iscritti')
        e['capacity']('content',16,"kind='tournament' AND json_extract(data,'$.phase') IN('active','paused')")
        if d['format']=='team':
            teams={json.loads(x[0]).get('team_club') for x in db.execute("SELECT p.data FROM progress p JOIN memberships m ON m.content_id=p.content_id AND m.user_id=p.user_id WHERE p.content_id=? AND m.state='accepted'",(cid,))}
            if len(teams-{None})<2:raise HTTPException(409,'Servono almeno due club diversi iscritti')
        if d['format']=='puzzle':
            d['puzzles']=[x[0] for x in db.execute("SELECT id FROM content WHERE kind='puzzle' AND status='published' ORDER BY json_extract(data,'$.rating'),id LIMIT 100")]
            if not d['puzzles']:raise HTTPException(409,'Pubblica dei puzzle prima del torneo')
            d['rated']=False
        d['ends_at']=time.time()+d['duration']

    @app.get('/api/platform/tournaments/{cid}')
    def tournament(cid:str,request:Request):
        with lock:
            u=actor(request);r=row(cid,'tournament')
            if not visible(r,u):raise HTTPException(403,'Torneo riservato')
            tournament_refresh(cid);r=row(cid,'tournament');result=getdata(r,u)
            result['standings']=standings(cid,u)
            if result['format']=='team':
                teams={}
                for player in result['standings']:
                    value=db.execute('SELECT data FROM progress WHERE content_id=? AND user_id=?',(cid,player['user_id'])).fetchone();team=json.loads(value[0]).get('team_club') if value else None
                    if team:
                        if team not in teams:teams[team]={'id':team,'name':row(team,'club')['title'],'points':0,'tiebreak':0,'players':0}
                        teams[team]['points']+=player['points'];teams[team]['tiebreak']+=player['tiebreak'];teams[team]['players']+=1
                result['teams']=sorted(teams.values(),key=lambda x:(-x['points'],-x['tiebreak'],x['id']))
            result['pairings']=[dict(p) for p in db.execute('SELECT * FROM tournament_pairings WHERE tournament_id=? ORDER BY round,board',(cid,)) if u['admin'] or u['id'] in (p['white'],p['black'])]
            return result
    @app.post('/api/platform/tournaments/{cid}/control')
    def control(cid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'tournament-control',20);r=row(cid,'tournament');can_edit(r,u);d=json.loads(r['data']);action=body.get('action');phase=d['phase']
            transitions={'start':('scheduled','active'),'pause':('active','paused'),'resume':('paused','active'),'finish':('active','finished'),'cancel':('scheduled','cancelled')}
            if action not in transitions or phase!=transitions[action][0]:raise HTTPException(409,'Transizione del torneo non valida')
            if action=='start' and db.execute("SELECT COUNT(*) FROM memberships WHERE content_id=? AND state='accepted'",(cid,)).fetchone()[0]<2:raise HTTPException(409,'Servono almeno due iscritti')
            d['phase']=transitions[action][1]
            if action=='start':prepare_start(cid,d)
            if action=='pause':d['paused_at']=time.time()
            if action=='resume':d['ends_at']+=max(0,time.time()-d.pop('paused_at',time.time()))
            db.execute('UPDATE content SET data=?,updated=? WHERE id=?',(json.dumps(d),time.time(),cid));audit('tournament.'+action,u,cid,before={'phase':phase},after={'phase':d['phase']});tournament_refresh(cid);return {'ok':True}
    @app.get('/api/platform/tournaments/{cid}/calendar.ics')
    def calendar(cid:str,request:Request):
        from datetime import datetime,timezone
        with lock:
            u=actor(request);r=row(cid,'tournament')
            if not visible(r,u):raise HTTPException(403,'Torneo riservato')
            d=json.loads(r['data']);when=datetime.fromtimestamp(d['starts_at'],timezone.utc).strftime('%Y%m%dT%H%M%SZ');title=r['title'].replace('\\','\\\\').replace(';','\\;').replace(',','\\,').replace('\r','').replace('\n','\\n')
            return Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Gambit//Chess//IT\r\nBEGIN:VEVENT\r\nUID:'+cid+'@chess.aura-server.org\r\nDTSTART:'+when+'\r\nSUMMARY:'+title+'\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',media_type='text/calendar')

    @app.get('/api/platform/search')
    def search(request:Request,q:str='',kind:str='all'):
        with lock:
            u=actor(request,'search',60,60)
            if len(q.strip())<2:return {'items':[]}
            result=[]
            # User search is intentionally limited to accepted friends.
            for f in s['friend_payload'](u['id'])['friends']:
                if q.lower() in f['name'].lower():result.append({'id':f['id'],'kind':'friend','title':f['name'],'url':'/profile.html?user='+f['id']})
            for r in db.execute("SELECT * FROM content WHERE status='published' AND title LIKE ? LIMIT 40",('%'+q[:80]+'%',)):
                if r['kind'] in ('stream','vod','broadcast') and not e['flags']()['watch']:continue
                if visible(dict(r),u):result.append({'id':r['id'],'kind':r['kind'],'title':r['title'],'url':'/'+{'course':'learn','lesson':'learn','club':'community','thread':'community','reply':'community','tournament':'tournaments','puzzle':'puzzles','stream':'watch','vod':'watch','broadcast':'watch'}[r['kind']]+'.html?id='+r['id']})
            return {'items':result[:30]}
    @app.get('/api/platform/leaderboards')
    def leaderboards(request:Request,pool:str='rapid'):
        with lock:
            u=actor(request)
            if pool not in ('bullet','blitz','rapid','classical','puzzles'):raise HTTPException(400,'Categoria non valida')
            people=[{'id':u['id'],'name':u['name']}]+s['friend_payload'](u['id'])['friends']
            values=[]
            for p in people:
                r=db.execute('SELECT rating,games FROM puzzle_ratings WHERE user_id=?',(p['id'],)).fetchone() if pool=='puzzles' else s['rating_for'](p['id'],pool)
                values.append({'id':p['id'],'name':p['name'],'rating':r['rating'] if r else 1200,'games':r['games'] if r else 0})
            return {'items':sorted(values,key=lambda x:-x['rating']),'scope':'friends'}
    @app.post('/api/platform/creator/apply')
    def creator_apply(request:Request):
        with lock:
            e['enabled']('watch');u=actor(request,'creator',2,86400);p,pr=e['profile'](u['id']);p['creator_application']='pending';e['save_profile'](u['id'],p);return {'ok':True}

    original_lifespan=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(a):
        async with original_lifespan(a):
            async def ticker():
                while True:
                    await asyncio.sleep(3)
                    with lock:
                        if not e['flags']()['tournaments']:continue
                        for scheduled in db.execute("SELECT * FROM content WHERE kind='tournament' AND status='published' AND json_extract(data,'$.phase')='scheduled' AND json_extract(data,'$.starts_at')<=? LIMIT 16",(time.time(),)).fetchall():
                            d=json.loads(scheduled['data'])
                            try:prepare_start(scheduled['id'],d)
                            except HTTPException:continue
                            d['phase']='active';db.execute('UPDATE content SET data=?,updated=? WHERE id=?',(json.dumps(d),time.time(),scheduled['id']));audit('tournament.scheduled-start',{'id':scheduled['owner']},scheduled['id']);changed('tournament',scheduled['id'])
                        for item in db.execute("SELECT id FROM content WHERE kind='tournament' AND status='published' AND json_extract(data,'$.phase')='active' LIMIT 32").fetchall():
                            try:tournament_refresh(item['id'])
                            except Exception:
                                import logging
                                logging.exception('Tournament scheduler failed')
            task=asyncio.create_task(ticker())
            try:yield
            finally:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):await task
    app.router.lifespan_context=lifespan
    e.update(content_normalize=normalize,content_can_edit=can_edit,tournament_refresh=tournament_refresh)
