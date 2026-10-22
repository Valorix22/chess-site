"""Administration with existing owner hierarchy and append-only UI audit access."""
import hashlib
import io
import json
import math
import os
import secrets
import smtplib
import ssl
import time
from collections import defaultdict
from email.message import EmailMessage
from fastapi import Body,HTTPException,Request,Response


def install(s,e):
    app,db,lock,hub=e['app'],e['db'],e['lock'],e['hub']
    actor,clean,number=e['actor'],e['clean'],e['number']
    def confirm(request,body,owner=False):
        with lock:u=actor(request,'admin-confirm',15,300,admin=True,owner=owner)
        password=body.get('current_password','')
        if not isinstance(password,str) or len(password)>128 or not s['password_matches'](password,u['password']):raise HTTPException(403,'Password amministratore non corretta')
        with lock:
            fresh=actor(request,admin=True,owner=owner)
            if fresh['password']!=u['password']:raise HTTPException(409,'Sessione cambiata')
        return fresh
    def sanction(target,u,kind,reason,expires=None):
        user=db.execute('SELECT * FROM users WHERE id=?',(target,)).fetchone()
        if not user:raise HTTPException(404,'Utente non trovato')
        if user['admin'] or user['owner']:raise HTTPException(403,'Gli account amministratore sono protetti')
        if kind not in ('mute','suspend','ban','revoke'):raise HTTPException(400,'Azione non valida')
        if kind=='revoke':db.execute('UPDATE sanctions SET revoked=? WHERE user_id=? AND revoked IS NULL',(time.time(),target))
        else:
            sid=e['uid']();db.execute('INSERT INTO sanctions VALUES(?,?,?,?,?,?,?,NULL)',(sid,target,u['id'],kind,reason,expires,time.time()))
            if kind in ('suspend','ban'):
                db.execute('DELETE FROM sessions WHERE user_id=?',(target,));hub.send(target,{'type':'session_end'})
                for r in db.execute("SELECT data FROM games WHERE json_extract(data,'$.status') IN('active','waiting') AND (json_extract(data,'$.white')=? OR json_extract(data,'$.black')=?)",(target,target)).fetchall():
                    g=json.loads(r['data']);g['rated']=False;s['finish'](g,'*','Interruzione amministrativa')
        e['audit']('user.'+kind,u,target,after={'reason':reason,'expires':expires})

    @app.get('/api/platform/admin/metrics')
    def metrics(request:Request):
        with lock:
            u=actor(request,admin=True);e['audit']('admin.metrics.read',u)
            return {'users':db.execute("SELECT COUNT(*) FROM users WHERE password!=''").fetchone()[0],'online':len(hub.clients),'active_games':db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.status')='active'").fetchone()[0],'finished_games':db.execute("SELECT COUNT(*) FROM games WHERE json_extract(data,'$.status')='finished'").fetchone()[0],'open_reports':db.execute("SELECT COUNT(*) FROM reports WHERE status='open'").fetchone()[0],'puzzles_solved':db.execute("SELECT COUNT(*) FROM puzzle_attempts WHERE json_extract(data,'$.correct')=1").fetchone()[0],'lessons_completed':db.execute("SELECT COUNT(*) FROM progress WHERE json_extract(data,'$.complete')=1").fetchone()[0],'content':{r['kind']:r['total'] for r in db.execute("SELECT kind,COUNT(*) total FROM content WHERE status!='deleted' GROUP BY kind")}}
    @app.get('/api/platform/admin/users/{user_id}')
    def user_detail(user_id:str,request:Request):
        with lock:
            u=actor(request,admin=True);result=e['user_data'](u,user_id);result['sanctions']=[dict(r) for r in db.execute('SELECT id,kind,reason,expires,created,revoked FROM sanctions WHERE user_id=? ORDER BY created DESC LIMIT 100',(user_id,))];e['audit']('admin.user.read',u,user_id);return result
    @app.post('/api/platform/admin/users/{user_id}/sanction')
    def user_sanction(user_id:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'sanction',30,admin=True);duration=number(body.get('duration',3600),60,30*86400);kind=body.get('kind');reason=clean(body.get('reason',''),500,True);sanction(user_id,u,kind,reason,None if kind=='ban' else time.time()+duration);return {'ok':True}
    @app.post('/api/platform/admin/users/{user_id}/creator')
    def creator(user_id:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,admin=True);e['enabled']('watch')
            if type(body.get('enabled')) is not bool:raise HTTPException(400,'Valore non valido')
            if not db.execute('SELECT 1 FROM users WHERE id=?',(user_id,)).fetchone():raise HTTPException(404,'Utente non trovato')
            p,_=e['profile'](user_id);e['save_profile'](user_id,p);db.execute('UPDATE profiles SET creator=? WHERE user_id=?',(int(body['enabled']),user_id));e['audit']('creator.change',u,user_id,after={'enabled':body['enabled']});return {'ok':True}
    @app.get('/api/platform/admin/reports')
    def reports(request:Request,status:str='open',page:int=1):
        with lock:
            u=actor(request,admin=True);e['audit']('admin.reports.read',u)
            rows=db.execute('SELECT * FROM reports WHERE status=? ORDER BY created DESC LIMIT 50 OFFSET ?',(status[:30],max(0,page-1)*50)).fetchall()
            return {'items':[{**dict(r),'evidence':json.loads(r['evidence'])} for r in rows],'page':page}
    @app.post('/api/platform/admin/reports/{rid}')
    def moderate(rid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'moderate',60,admin=True);r=db.execute('SELECT * FROM reports WHERE id=?',(rid,)).fetchone()
            if not r:raise HTTPException(404,'Segnalazione non trovata')
            action=body.get('action','close');notes=clean(body.get('notes',''),2000);reason=clean(body.get('reason',r['reason']),500,True)
            if action=='remove':
                if r['kind']=='message':db.execute('UPDATE platform_messages SET deleted=1 WHERE id=?',(r['target'],))
                elif r['kind'] in ('thread','reply','club','stream','vod'):db.execute("UPDATE content SET status='archived',updated=? WHERE id=?",(time.time(),r['target']))
                else:raise HTTPException(400,'Questo contenuto non può essere rimosso da qui')
            elif action in ('mute','suspend','ban'):
                evidence=json.loads(r['evidence']);target=evidence.get('author') if r['kind']=='message' else r['target'] if r['kind']=='profile' else e['content_row'](r['target'])['owner']
                sanction(target,u,action,reason,None if action=='ban' else time.time()+number(body.get('duration',3600),60,30*86400))
            elif action not in ('close','dismiss'):raise HTTPException(400,'Azione non valida')
            db.execute("UPDATE reports SET status=?,notes=?,updated=? WHERE id=?",('dismissed' if action=='dismiss' else 'closed',notes,time.time(),rid));e['audit']('report.'+action,u,rid,after={'kind':r['kind'],'target':r['target']});return {'ok':True}
    @app.get('/api/platform/admin/settings')
    def read_settings(request:Request):
        with lock:
            u=actor(request,admin=True);e['audit']('admin.settings.read',u);return {'site_name':e['setting']('site_name','Gambit'),'maintenance':e['setting']('maintenance',False),'maintenance_message':e['setting']('maintenance_message','Manutenzione in corso'),'registrations_open':e['setting']('registrations_open',True),'features':e['flags'](),'capabilities':{'email':bool(os.getenv('SMTP_HOST') and os.getenv('SMTP_FROM')),'watch':bool(os.getenv('STREAMING_PROVIDER'))}}
    @app.patch('/api/platform/admin/settings')
    def edit_settings(request:Request,body:dict=Body(...)):
        u=confirm(request,body,owner=True)
        with lock:
            changes=body.get('settings',{})
            if not isinstance(changes,dict) or set(changes)-{'site_name','maintenance','maintenance_message','registrations_open','features'}:raise HTTPException(400,'Impostazione non supportata')
            before={k:e['setting'](k) for k in changes}
            for k,v in changes.items():
                if k in ('site_name','maintenance_message'):v=clean(v,200,True)
                elif k=='features':
                    if not isinstance(v,dict) or set(v)-set(e['flags']()) or any(type(x) is not bool for x in v.values()):raise HTTPException(400,'Feature flag non valido')
                    if v.get('email') and not os.getenv('SMTP_HOST') or v.get('watch') and not os.getenv('STREAMING_PROVIDER'):raise HTTPException(409,'Configura prima il servizio esterno')
                    v={**e['flags'](),**v}
                    if v.get('oauth') or v.get('twofactor'):raise HTTPException(400,'Provider non configurato')
                elif type(v) is not bool:raise HTTPException(400,'Valore non valido')
                db.execute('INSERT INTO site_settings VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated',(k,json.dumps(v),time.time()))
            e['audit']('settings.change',u,before=before,after=changes);e['changed']('settings');return {'ok':True}
    @app.post('/api/platform/admin/notifications')
    def broadcast(request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'broadcast',10,3600,admin=True);title=clean(body.get('title',''),100,True);text=clean(body.get('text',''),500,True);link=clean(body.get('link','/'),200);target=body.get('user_id')
            if target:
                if not db.execute('SELECT 1 FROM users WHERE id=?',(target,)).fetchone():raise HTTPException(404,'Utente non trovato')
                targets=[target]
            else:targets=[r[0] for r in db.execute("SELECT id FROM users WHERE disabled=0 AND password!='' LIMIT 10000")]
            for other in targets:e['notify'](other,'system',title,text,link)
            e['audit']('notification.broadcast',u,after={'recipients':len(targets),'title':title});return {'ok':True,'recipients':len(targets)}
    @app.post('/api/platform/admin/games/{gid}/note')
    def game_note(gid:str,request:Request,body:dict=Body(...)):
        with lock:
            u=actor(request,'fairplay',30,admin=True);g=s['get_game'](gid);g['fairplay_note']=clean(body.get('note',''),2000);g['flagged']=bool(body.get('flagged',False));s['save'](g);e['audit']('game.note',u,gid,after={'flagged':g['flagged']});return {'ok':True}
    @app.post('/api/platform/admin/games/{gid}/void')
    def void(gid:str,request:Request,body:dict=Body(...)):
        u=confirm(request,body,owner=True)
        if body.get('confirm')!=gid:raise HTTPException(400,'Conferma l’identificativo della partita')
        reason=clean(body.get('reason',''),500,True)
        with lock:
            s['rate_action'](u['id'],'rating-rebuild',2,3600);g=s['get_game'](gid)
            if g['status']!='finished' or g.get('voided'):raise HTTPException(409,'Partita non annullabile')
            if db.execute('SELECT COUNT(*) FROM rating_results').fetchone()[0]>10000:raise HTTPException(409,'Il ricalcolo richiede una manutenzione dedicata')
            with e['atomic']():
                g.update(voided=True,rated=False,rating_change={},reason='Annullata dall’amministratore: '+reason);s['save'](g)
                records=db.execute('SELECT * FROM rating_results ORDER BY created,game_id').fetchall();state={}
                for r in records:
                    result=s['get_game'](r['game_id']);pool=r['pool'];w=state.setdefault((r['white_id'],pool),{'rating':1200,'games':0,'wins':0,'draws':0,'losses':0});b=state.setdefault((r['black_id'],pool),{'rating':1200,'games':0,'wins':0,'draws':0,'losses':0});wb,bb=w['rating'],b['rating']
                    if not result.get('voided') and result['result'] in ('1-0','0-1','1/2-1/2'):
                        point=1 if result['result']=='1-0' else 0 if result['result']=='0-1' else .5;k=40 if min(w['games'],b['games'])<20 else 20;delta=round(k*(point-1/(1+10**((bb-wb)/400))));delta=max(100-wb,min(4000-wb,delta));delta=max(bb-4000,min(bb-100,delta));w['rating']+=delta;b['rating']-=delta
                        for entry,p in ((w,point),(b,1-point)):entry['games']+=1;entry['wins']+=int(p==1);entry['draws']+=int(p==.5);entry['losses']+=int(p==0)
                        result['rating_change']={'white':{'before':wb,'after':w['rating'],'delta':delta},'black':{'before':bb,'after':b['rating'],'delta':-delta}};s['save'](result)
                    db.execute('UPDATE rating_results SET white_before=?,black_before=?,white_after=?,black_after=? WHERE game_id=?',(wb,bb,w['rating'],b['rating'],r['game_id']))
                db.execute('DELETE FROM ratings')
                for (player,pool),v in state.items():db.execute('INSERT INTO ratings VALUES(?,?,?,?,?,?,?)',(player,pool,v['rating'],v['games'],v['wins'],v['draws'],v['losses']))
            e['audit']('game.void',u,gid,after={'reason':reason});return {'ok':True}

    @app.get('/api/platform/me/export')
    def export(request:Request):
        with lock:
            u=actor(request,'export',2,86400);data={'profile':e['user_data'](u),'games':[json.loads(r[0]) for r in db.execute("SELECT data FROM games WHERE json_extract(data,'$.white')=? OR json_extract(data,'$.black')=? ORDER BY created DESC LIMIT 1000",(u['id'],u['id']))],'messages':[dict(r) for r in db.execute('SELECT channel,body,created FROM platform_messages WHERE author=? ORDER BY id LIMIT 10000',(u['id'],))]}
            for game in data['games']:
                for key in ('fairplay_note','flagged','public_consents','analysis_requested_by'):game.pop(key,None)
            return Response(json.dumps(data,ensure_ascii=False),media_type='application/json',headers={'Content-Disposition':'attachment; filename="gambit-data.json"'})

    # Email flows stay unreachable in the UI and return404 until configured.
    def mail(address,subject,text):
        msg=EmailMessage();msg['From']=os.environ['SMTP_FROM'];msg['To']=address;msg['Subject']=subject;msg.set_content(text)
        with smtplib.SMTP(os.environ['SMTP_HOST'],int(os.getenv('SMTP_PORT','587')),timeout=12) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            if os.getenv('SMTP_USER'):smtp.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
            smtp.send_message(msg)
    @app.post('/api/platform/auth/forgot-password')
    def forgot(request:Request,body:dict=Body(...)):
        with lock:
            e['enabled']('email');s['rate_action'](s['client_ip'](request),'forgot',5,3600);address=clean(body.get('email',''),254).lower();p=db.execute('SELECT user_id FROM profiles WHERE email=? AND email_verified=1',(address,)).fetchone()
            token=secrets.token_urlsafe(32)
            if p:db.execute('INSERT INTO email_actions VALUES(?,?,?, ?,NULL)',(hashlib.sha256(token.encode()).hexdigest(),p[0],'reset',time.time()+1800))
        if p:
            try:mail(address,'Gambit — recupero password',s['PUBLIC_URL']+'/profile.html?reset='+token)
            except Exception:
                import logging
                logging.warning('Password recovery email delivery failed')
        return {'ok':True,'message':'Se l’indirizzo è verificato riceverai le istruzioni.'}
    @app.post('/api/platform/auth/reset-password')
    def reset_password(request:Request,body:dict=Body(...)):
        with lock:
            e['enabled']('email');s['auth_rate'](request);key=hashlib.sha256(clean(body.get('token',''),100,True).encode()).hexdigest();r=db.execute("SELECT * FROM email_actions WHERE token_hash=? AND kind='reset' AND used IS NULL AND expires>?",(key,time.time())).fetchone()
            if not r:raise HTTPException(400,'Link scaduto o non valido')
        password=body.get('password','')
        if not isinstance(password,str) or not 12<=len(password)<=128:raise HTTPException(400,'Password non valida')
        hashed=s['password_hash'](password)
        with lock:
            with e['atomic']():
                claimed=db.execute('UPDATE email_actions SET used=? WHERE token_hash=? AND used IS NULL AND expires>?',(time.time(),key,time.time()))
                if claimed.rowcount!=1:raise HTTPException(409,'Link già utilizzato')
                db.execute('UPDATE users SET password=?,must_change_password=0 WHERE id=?',(hashed,r['user_id']));db.execute('DELETE FROM sessions WHERE user_id=?',(r['user_id'],))
            hub.send(r['user_id'],{'type':'session_end'});return {'ok':True}
    e.update(sanction=sanction,confirm_admin=confirm)
