"""Gambit adapters on the existing account, game, SSE and review services.

All new state is additive. No demo identities, ratings, chat replies or outcomes.
"""
import contextlib
import hashlib
import json
import math
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import chess
from fastapi import Body, HTTPException, Request
from starlette.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

KINDS={'puzzle','course','lesson','club','thread','reply','tournament','stream','vod','broadcast'}
ADMIN_CONTENT={'puzzle','course','lesson','stream','vod','broadcast'}
SETTINGS={'theme':{'dark','light','system'},'boardTheme':{'green','blue','wood','brown','purple','gray','neon'},'premoveMode':{'multiple','single','off'},'coordinates':{True,False},'animations':{True,False},'sound':{True,False},'autoPromote':{True,False},'notifications':{True,False}}
DEFAULT_FLAGS={'puzzles':True,'learn':True,'community':True,'tournaments':True,'chat':True,'watch':False,'email':False,'oauth':False,'twofactor':False}


def install(s):
    app,db,lock,hub=s['app'],s['db'],s['lock'],s['live_hub']
    base=Path(s['BASE'])
    db.executescript((base/'migrations/001_gambit.up.sql').read_text())

    def setting(key,default=None):
        r=db.execute('SELECT value FROM site_settings WHERE key=?',(key,)).fetchone()
        return json.loads(r[0]) if r else default
    def flags():
        out={**DEFAULT_FLAGS,**setting('features',{})}
        out['email']=bool(out['email'] and os.getenv('SMTP_HOST') and os.getenv('SMTP_FROM'))
        out['watch']=bool(out['watch'] and os.getenv('STREAMING_PROVIDER'))
        out['oauth']=False;out['twofactor']=False
        return out
    def enabled(key):
        if not flags().get(key,False):raise HTTPException(404,'Funzione non attiva')
    def uid():return secrets.token_urlsafe(15)
    def clean(value,limit=200,required=False):
        if not isinstance(value,str):raise HTTPException(400,'Testo non valido')
        value=value.strip()
        if len(value)>limit or '\x00' in value or required and not value:raise HTTPException(400,'Testo vuoto o troppo lungo')
        return value
    def number(value,lo,hi,default=None):
        if value is None and default is not None:return default
        if type(value) is not int or not lo<=value<=hi:raise HTTPException(400,'Numero non valido')
        return value
    def actor(request,action=None,limit=30,window=3600,admin=False,owner=False):
        u=s['admin_for' if admin else 'user_for'](request)
        if owner and not u.get('owner'):raise HTTPException(403,'Operazione riservata al proprietario')
        if action:s['rate_action'](u['id'],'gambit-'+action,limit,window)
        return u
    @contextmanager
    def atomic():
        # SAVEPOINT also works when invoked by an existing game transaction.
        name='gambit_'+secrets.token_hex(5);db.execute('SAVEPOINT '+name)
        try:yield;db.execute('RELEASE '+name)
        except BaseException:db.execute('ROLLBACK TO '+name);db.execute('RELEASE '+name);raise
    def capacity(table,maximum,where='',params=()):
        if db.execute('SELECT COUNT(*) FROM '+table+(' WHERE '+where if where else ''),params).fetchone()[0]>=maximum:raise HTTPException(429,'Limite di archiviazione raggiunto. Contatta un amministratore.')
    def profile(uid_):
        r=db.execute('SELECT * FROM profiles WHERE user_id=?',(uid_,)).fetchone()
        return (json.loads(r['data']) if r else {}),r
    def save_profile(uid_,data):
        db.execute('INSERT INTO profiles(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',(uid_,json.dumps(data)))
    def permitted_profile(u,other):
        if other==u['id'] or u['admin']:return True
        data,_=profile(other)
        return data.get('visibility','friends')=='friends' and s['are_friends'](u['id'],other)
    def notify(user_id,kind,title,body='',link=''):
        if link and (not link.startswith('/') or link.startswith('//')):link='/'
        db.execute('INSERT INTO notifications(user_id,kind,title,body,link,created) VALUES(?,?,?,?,?,?)',(user_id,kind,title[:100],body[:500],link,time.time()))
        db.execute('DELETE FROM notifications WHERE user_id=? AND id NOT IN(SELECT id FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 500)',(user_id,user_id))
        hub.send(user_id,{'type':'notification','version':1,'id':uid(),'timestamp':time.time()})
    def changed(kind,item=None,users=None):
        event={'type':'platform','version':1,'id':uid(),'timestamp':time.time(),'payload':{'kind':kind,'id':item}}
        for user_id in users or list(hub.clients):hub.send(user_id,event)
    def audit(action,u,subject=None,before=None,after=None):
        s['audit_event']('platform.'+action,u,subject,details={'before':before,'after':after})
    def restricted_user(request):
        u=original_user(request)
        row=db.execute("SELECT 1 FROM sanctions WHERE user_id=? AND kind IN('suspend','ban') AND revoked IS NULL AND (expires IS NULL OR expires>?)",(u['id'],time.time())).fetchone()
        if row:raise HTTPException(403,'Account sospeso. Contatta un amministratore.')
        if setting('maintenance',False) and not u['admin']:raise HTTPException(503,setting('maintenance_message','Manutenzione in corso'))
        return u
    original_user=s['user_for'];s['user_for']=restricted_user
    def account_check(user_id):
        if db.execute("SELECT 1 FROM sanctions WHERE user_id=? AND kind IN('suspend','ban') AND revoked IS NULL AND (expires IS NULL OR expires>?)",(user_id,time.time())).fetchone():raise HTTPException(403,'Account sospeso. Contatta un amministratore.')
    s['gambit_registration_open']=lambda:setting('registrations_open',True)
    s['gambit_account_check']=account_check
    s['gambit_presence_visible']=lambda user_id:profile(user_id)[0].get('show_online',True)
    def chat_allowed(u):
        enabled('chat')
        if db.execute("SELECT 1 FROM sanctions WHERE user_id=? AND kind='mute' AND revoked IS NULL AND (expires IS NULL OR expires>?)",(u['id'],time.time())).fetchone():raise HTTPException(403,'Invio dei messaggi temporaneamente sospeso')
    def content_row(cid,kind=None):
        row=db.execute('SELECT * FROM content WHERE id=?',(cid,)).fetchone()
        if not row or kind and row['kind']!=kind or row['status']=='deleted':raise HTTPException(404,'Contenuto non trovato')
        return dict(row)
    def member(cid,user_id):return db.execute("SELECT * FROM memberships WHERE content_id=? AND user_id=? AND state='accepted'",(cid,user_id)).fetchone()
    def visible(row,u):
        if row['owner']==u['id'] or u['admin']:return True
        if row['status']!='published':return False
        data=json.loads(row['data'])
        # Club metadata is discoverable; chat and membership management remain protected.
        if row['kind'] in ('lesson','reply') and row['parent']:return visible(content_row(row['parent']),u)
        return True
    def content_data(row,u,full=False):
        if not visible(row,u):raise HTTPException(403,'Contenuto riservato')
        data=json.loads(row['data']);item={k:row[k] for k in ('id','kind','title','status','created','updated','owner','parent')}
        if row['kind']=='puzzle' and not (full and u['admin']):data={k:v for k,v in data.items() if k not in ('solution','hint','explanation')}
        if row['kind'] in ('stream','vod','broadcast'):
            data={k:v for k,v in data.items() if k not in ('stream_key','ingest_key','secret')}
        item.update(data)
        m=member(row['id'],u['id']);item['joined']=bool(m);item['pending']=bool(db.execute("SELECT 1 FROM memberships WHERE content_id=? AND user_id=? AND state='pending'",(row['id'],u['id'])).fetchone());item['membership_role']=m['role'] if m else None
        item['members']=db.execute("SELECT COUNT(*) FROM memberships WHERE content_id=? AND state='accepted'",(row['id'],)).fetchone()[0]
        p=db.execute('SELECT data FROM progress WHERE content_id=? AND user_id=?',(row['id'],u['id'])).fetchone();item['progress']=json.loads(p[0]) if p else {}
        if row['kind']=='course':
            item['lessons']=db.execute("SELECT COUNT(*) FROM content WHERE parent=? AND kind='lesson' AND status='published'",(row['id'],)).fetchone()[0]
            item['done']=db.execute("SELECT COUNT(*) FROM content c JOIN progress p ON p.content_id=c.id WHERE c.parent=? AND c.kind='lesson' AND c.status='published' AND p.user_id=? AND json_extract(p.data,'$.complete')=1",(row['id'],u['id'])).fetchone()[0]
        if row['kind'] in ('thread','reply'):
            item['votes']=db.execute('SELECT COALESCE(SUM(value),0) FROM content_votes WHERE content_id=?',(row['id'],)).fetchone()[0]
            item['replies']=db.execute("SELECT COUNT(*) FROM content WHERE parent=? AND kind='reply' AND status='published'",(row['id'],)).fetchone()[0]
        author=db.execute('SELECT name FROM users WHERE id=?',(row['owner'],)).fetchone();item['author']=author[0] if author else 'Club'
        return item
    def user_data(u,other=None):
        other=other or u['id']
        if not permitted_profile(u,other):raise HTTPException(403,'Profilo riservato agli amici')
        row=db.execute("SELECT * FROM users WHERE id=? AND password!=''",(other,)).fetchone()
        if not row:raise HTTPException(404,'Profilo non trovato')
        p,pr=profile(other)
        games=[json.loads(r['data']) for r in db.execute("SELECT data FROM games WHERE json_extract(data,'$.white')=? OR json_extract(data,'$.black')=? ORDER BY created DESC LIMIT 200",(other,other))]
        finished=[g for g in games if g['status']=='finished' and g.get('kind')!='import' and g.get('result') in ('1-0','0-1','1/2-1/2')]
        totals=db.execute("SELECT COUNT(*) total,COALESCE(SUM(json_extract(data,'$.result')='1/2-1/2'),0) draws,COALESCE(SUM(json_extract(data,'$.result')=CASE WHEN json_extract(data,'$.white')=? THEN '1-0' ELSE '0-1' END),0) wins FROM games WHERE (json_extract(data,'$.white')=? OR json_extract(data,'$.black')=?) AND json_extract(data,'$.status')='finished' AND json_extract(data,'$.kind')!='import' AND json_extract(data,'$.result') IN('1-0','0-1','1/2-1/2') AND COALESCE(json_extract(data,'$.voided'),0)=0",(other,other,other)).fetchone()
        total,wins,draws=totals['total'],totals['wins'],totals['draws']
        puzzle=db.execute('SELECT * FROM puzzle_ratings WHERE user_id=?',(other,)).fetchone()
        ratings={pool:s['rating_for'](other,pool) for pool in ('bullet','blitz','rapid','classical')}
        ratings['puzzles']={'rating':puzzle['rating'] if puzzle else 1200,'games':puzzle['games'] if puzzle else 0}
        out={'id':other,'name':row['name'],'handle':row['name'],'display_name':p.get('display_name',row['name']),'bio':p.get('bio',''),'country':p.get('country',''),'created':row['created'],'ratings':ratings,'games':total,'wins':wins,'draws':draws,'losses':total-wins-draws,'online':bool(hub.clients.get(other)) and p.get('show_online',True),'creator':bool(pr and pr['creator'])}
        if other==u['id'] or u['admin']:out.update(email=pr['email'] if pr else None,email_verified=bool(pr and pr['email_verified']),preferences=p.get('settings',{}),visibility=p.get('visibility','friends'),show_online=p.get('show_online',True),ui_migration_version=p.get('ui_migration_version',0))
        out['achievements']=[{'id':'first-game','name':'Prima partita','icon':'trophy','locked':not total,'progress':min(1,total)},{'id':'first-win','name':'Prima vittoria','icon':'crown','locked':wins==0,'progress':min(1,wins)},{'id':'ten-games','name':'Dieci partite','icon':'star','locked':total<10,'progress':min(10,total)}]
        return out

    @app.get('/api/platform/config')
    def config():
        with lock:return {'API_BASE_URL':'/api','WS_URL':'/api/events','APP_ENV':'production','DEMO_MODE':False,'FEATURE_FLAGS':flags(),'site_name':setting('site_name','Gambit'),'registrations_open':setting('registrations_open',True)}

    @app.get('/api/platform/bootstrap')
    def bootstrap(request:Request):
        with lock:
            try:u=s['user_for'](request)
            except HTTPException as exc:
                if exc.status_code==401:return {'user':None,'features':flags()}
                raise
            p=user_data(u);friend=s['friend_payload'](u['id']);notifications=notification_list(u)
            legacy=db.execute('SELECT data FROM preferences WHERE user_id=?',(u['id'],)).fetchone()
            return {'user':s['public_user'](u),'profile':p,'features':flags(),'friends':friend,'notifications':notifications,'preferences':p['preferences'],'legacy_preferences':json.loads(legacy[0]) if legacy else None,'counts':{'online_friends':sum(f['online'] for f in friend['friends'])}}

    @app.get('/api/platform/profile/{who}')
    def read_profile(who:str,request:Request):
        with lock:
            u=actor(request);other=u['id'] if who=='me' else who
            if who!='me' and not db.execute('SELECT 1 FROM users WHERE id=?',(other,)).fetchone():
                r=db.execute('SELECT id FROM users WHERE name=?',(who,)).fetchone();other=r[0] if r else who
            return user_data(u,other)

    @app.patch('/api/platform/profile')
    def edit_profile(request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'profile',30);p,_=profile(u['id'])
            if set(body)-{'display_name','bio','country','visibility','show_online'}:raise HTTPException(400,'Campo non modificabile')
            for key,maximum in [('display_name',60),('bio',500),('country',2)]:
                if key in body:p[key]=clean(body[key],maximum)
            if p.get('country') and not re.fullmatch('[A-Z]{2}',p['country']):raise HTTPException(400,'Codice paese non valido')
            if 'visibility' in body:
                if body['visibility'] not in ('private','friends'):raise HTTPException(400,'Visibilità non valida')
                p['visibility']=body['visibility']
            if 'show_online' in body:
                if type(body['show_online']) is not bool:raise HTTPException(400,'Preferenza non valida')
                p['show_online']=body['show_online']
            save_profile(u['id'],p);return user_data(u)

    @app.patch('/api/platform/preferences')
    def preferences(request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'preferences',120);p,_=profile(u['id']);values=p.get('settings',{})
            if set(body)-set(SETTINGS)-{'migration_version'}:raise HTTPException(400,'Preferenza non supportata')
            for k,v in body.items():
                if k=='migration_version':continue
                if not isinstance(v,(str,bool)) or v not in SETTINGS[k]:raise HTTPException(400,'Preferenza non valida')
                values[k]=v
            p['settings']=values
            if body.get('migration_version')==1:p['ui_migration_version']=1
            save_profile(u['id'],p);return {'preferences':values,'migration_version':p.get('ui_migration_version',0)}

    @app.get('/api/platform/sessions')
    def sessions(request:Request):
        with lock:
            u=actor(request);current=hashlib.sha256(request.cookies.get('club_session','').encode()).hexdigest()
            # Hash of stored hash is an opaque revoke handle, never a session credential.
            return {'items':[{'id':hashlib.sha256(r['token'].encode()).hexdigest(),'expires':r['expires'],'current':r['token']==current} for r in db.execute('SELECT token,expires FROM sessions WHERE user_id=? AND expires>?',(u['id'],time.time()))]}

    @app.delete('/api/platform/sessions/{sid}')
    def revoke_session(sid:str,request:Request):
        with lock:
            u=actor(request,'sessions',30)
            for r in db.execute('SELECT token FROM sessions WHERE user_id=?',(u['id'],)).fetchall():
                if secrets.compare_digest(hashlib.sha256(r[0].encode()).hexdigest(),sid):db.execute('DELETE FROM sessions WHERE token=?',(r[0],))
            return {'ok':True}

    @app.get('/api/platform/profile/{who}/rating-history')
    def rating_history(who:str,request:Request,days:int=90):
        with lock:
            u=actor(request);other=u['id'] if who=='me' else who
            if not permitted_profile(u,other):raise HTTPException(403,'Storico riservato')
            rows=db.execute('SELECT * FROM rating_results WHERE (white_id=? OR black_id=?) AND created>? ORDER BY created LIMIT 1000',(other,other,time.time()-min(366,max(1,days))*86400)).fetchall()
            return {'items':[{'timestamp':r['created'],'pool':r['pool'],'rating':r['white_after'] if r['white_id']==other else r['black_after']} for r in rows]}

    def notification_list(u):
        return [dict(r) for r in db.execute('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100',(u['id'],))]
    @app.get('/api/platform/notifications')
    def notifications(request:Request):
        with lock:return {'items':notification_list(actor(request))}
    @app.post('/api/platform/notifications/read')
    def read_notifications(request:Request,body:dict=Body(default={})):
        with lock:
            u=actor(request);nid=body.get('id')
            if nid is None:db.execute('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',(time.time(),u['id']))
            else:db.execute('UPDATE notifications SET read_at=? WHERE user_id=? AND id=?',(time.time(),u['id'],number(nid,1,2**63-1)))
            return {'ok':True}

    def conversation(u,channel,scope,write=False):
        if channel=='dm':
            if not s['are_friends'](u['id'],scope):raise HTTPException(403,'La chat è disponibile tra amici')
            return ':'.join(sorted((u['id'],scope))),{u['id'],scope}
        if channel=='game':
            g=s['get_game'](scope);s['participant'](g,u)
            if g['white'] not in (None,'bot') and g['black'] not in (None,'bot') and s['blocked'](g['white'],g['black']):raise HTTPException(403,'Chat non disponibile fra questi giocatori')
            return scope,{g['white'],g['black']}-{None,'bot'}
        if channel=='club':
            content_row(scope,'club')
            if not member(scope,u['id']):raise HTTPException(403,'Iscriviti al club per partecipare')
            return scope,{r[0] for r in db.execute("SELECT user_id FROM memberships WHERE content_id=? AND state='accepted'",(scope,))}
        if channel=='global' and scope=='clubhouse':return scope,set(hub.clients)
        raise HTTPException(404,'Canale non disponibile')
    @app.get('/api/platform/messages/{channel}/{scope}')
    def messages(channel:str,scope:str,request:Request,before:int=0):
        with lock:
            enabled('chat');u=actor(request);key,participants=conversation(u,channel,scope)
            rows=db.execute('SELECT m.id,m.author,m.body,m.created,u.name FROM platform_messages m JOIN users u ON u.id=m.author WHERE m.channel=? AND m.scope=? AND m.deleted=0 AND m.id<? ORDER BY m.id DESC LIMIT 50',(channel,key,before or 2**63-1)).fetchall()
            return {'items':[dict(r) for r in reversed(rows)],'next_cursor':rows[-1]['id'] if len(rows)==50 else None}
    @app.post('/api/platform/messages/{channel}/{scope}')
    def send_message(channel:str,scope:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'message',30,60);chat_allowed(u);key,participants=conversation(u,channel,scope,True);text=clean(body.get('text',''),1000,True)
            capacity('platform_messages',250000);capacity('platform_messages',2000,'author=? AND created>?',(u['id'],time.time()-86400))
            cursor=db.execute('INSERT INTO platform_messages(channel,scope,author,body,created) VALUES(?,?,?,?,?)',(channel,key,u['id'],text,time.time()))
            event={'type':'chat','version':1,'id':cursor.lastrowid,'timestamp':time.time(),'payload':{'channel':channel,'scope':scope,'author':u['id']}}
            for other in participants:hub.send(other,event)
            if channel=='dm':notify(scope,'chat','Nuovo messaggio',u['name'],'/community.html')
            return {'id':cursor.lastrowid,'ok':True}
    @app.post('/api/platform/messages/{channel}/{scope}/read')
    def read_messages(channel:str,scope:str,request:Request):
        with lock:
            u=actor(request);key,participants=conversation(u,channel,scope);last=db.execute('SELECT COALESCE(MAX(id),0) FROM platform_messages WHERE channel=? AND scope=?',(channel,key)).fetchone()[0]
            db.execute('INSERT INTO message_reads VALUES(?,?,?,?) ON CONFLICT(user_id,channel,scope) DO UPDATE SET last_id=excluded.last_id',(u['id'],channel,key,last))
            changed('chat_read',last,participants);return {'ok':True,'last_id':last}

    @app.post('/api/platform/reports')
    def report(request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'report',10,3600);kind=body.get('kind');target=clean(body.get('target',''),100,True);evidence={}
            if kind=='message':
                r=db.execute('SELECT * FROM platform_messages WHERE id=?',(target,)).fetchone()
                if not r:raise HTTPException(404,'Messaggio non trovato')
                if r['channel']=='dm':
                    people=r['scope'].split(':')
                    if u['id'] not in people:raise HTTPException(403,'Messaggio riservato')
                else:conversation(u,r['channel'],r['scope'])
                evidence={k:r[k] for k in ('id','author','body','created','channel')}
            elif kind=='profile':
                if not permitted_profile(u,target):raise HTTPException(403,'Profilo riservato')
            elif kind=='game':s['participant'](s['get_game'](target),u)
            elif kind in KINDS:
                if not visible(content_row(target,kind),u):raise HTTPException(403,'Contenuto riservato')
            else:raise HTTPException(400,'Tipo segnalazione non valido')
            capacity('reports',50000)
            rid=uid();now=time.time();db.execute('INSERT INTO reports(id,reporter,kind,target,reason,evidence,created,updated) VALUES(?,?,?,?,?,?,?,?)',(rid,u['id'],kind,target,clean(body.get('reason',''),1000,True),json.dumps(evidence),now,now))
            return {'ok':True,'id':rid}

    # The content, puzzles and tournament modules register on these closures.
    env=locals()
    from gambit_content import install as install_content
    install_content(s,env)
    from gambit_training import install as install_training
    install_training(s,env)
    from gambit_admin import install as install_admin
    install_admin(s,env)
    from gambit_games import install as install_games
    install_games(s,env)
    from seed_training import publish
    owner=db.execute("SELECT id,name FROM users WHERE owner=1 AND disabled=0 AND password!='' ORDER BY created LIMIT 1").fetchone()
    if owner and os.getenv('GAMBIT_SEED_STARTER','1')=='1':publish(s,env,dict(owner))
    @app.post('/api/platform/admin/starter-content')
    def starter_content(request:Request):
        with lock:
            u=actor(request,admin=True);return {'published':publish(s,env,u)}

    @app.api_route('/gambit/{path:path}',methods=['GET','HEAD'])
    def deny_frontend_source(path:str):
        raise HTTPException(404,'Pagina non trovata')

    frontend=Path(os.getenv('GAMBIT_FRONTEND_DIR',base/'static/gambit'))
    if frontend.is_dir() and os.getenv('GAMBIT_ENABLED','1')=='1':
        app.mount('/assets',StaticFiles(directory=frontend/'assets'),name='gambit-assets')
        def make_page(filename):
            def page(request:Request):
                if filename=='admin.html':
                    with lock:s['admin_for'](request)
                capability={'watch.html':'watch','puzzles.html':'puzzles','learn.html':'learn','community.html':'community','tournaments.html':'tournaments'}.get(filename)
                if capability and not flags()[capability]:raise HTTPException(404,'Funzione non attiva')
                return FileResponse(frontend/filename,headers={'Cache-Control':'no-cache'})
            return page
        for filename in ['index.html','play.html','puzzles.html','learn.html','community.html','profile.html','tournaments.html','watch.html','admin.html']:
            page=make_page(filename)
            app.add_api_route('/' if filename=='index.html' else '/'+filename,page,methods=['GET'],include_in_schema=False)
            if filename=='index.html':app.add_api_route('/index.html',page,methods=['GET'],include_in_schema=False)
        app.mount('/classic',StaticFiles(directory=base/'static',html=True),name='classic')
