"""Bounded authentication work, request limits and credential-free audit events."""
import hashlib,ipaddress,json,threading,time
from collections import OrderedDict
from http.cookies import SimpleCookie
from urllib.parse import urlparse
from fastapi import HTTPException

HASH_SLOTS=threading.BoundedSemaphore(2)
def bounded_hash(function):
    def wrapped(*args,**kwargs):
        if not HASH_SLOTS.acquire(blocking=False):raise HTTPException(429,'Accessi occupati. Riprova tra poco.',headers={'Retry-After':'3'})
        try:return function(*args,**kwargs)
        finally:HASH_SLOTS.release()
    return wrapped

def client_ip(request,public_url=''):
    ip=request.client.host if request.client else 'unknown'
    host=request.headers.get('host','').split(':')[0]
    try:
        address=ipaddress.ip_address(ip);trusted=address.is_loopback or address in ipaddress.ip_network('172.16.0.0/12')
        if trusted and public_url and host==urlparse(public_url).hostname:
            candidate=request.headers.get('cf-connecting-ip','')
            if candidate:ip=str(ipaddress.ip_address(candidate))
    except ValueError:pass
    return ip

class SecurityMiddleware:
    def __init__(self,app,state):self.app=app;self.s=state;self.requests=OrderedDict();self.rate_lock=threading.Lock()
    async def __call__(self,scope,receive,send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        headers={k.decode('latin1').lower():v.decode('latin1') for k,v in scope.get('headers',[])};path=scope.get('path','');method=scope.get('method','GET');status=[500]
        from starlette.requests import Request
        request=Request(scope);ip=client_ip(request,self.s['PUBLIC_URL']);public=urlparse(self.s['PUBLIC_URL']).hostname
        async def reject(code,message,retry=None):
            self.s['audit_event']('security.rejected',status=code,ip=ip,ua=headers.get('user-agent',''),details={'reason':message,'path':path[:160]})
            body=json.dumps({'detail':message}).encode();hs=[(b'content-type',b'application/json'),(b'cache-control',b'no-store'),(b'x-content-type-options',b'nosniff')]
            if retry:hs.append((b'retry-after',str(retry).encode()))
            await send({'type':'http.response.start','status':code,'headers':hs});await send({'type':'http.response.body','body':body})
        if sum(len(k)+len(v) for k,v in scope.get('headers',[]))>16384:return await reject(431,'Intestazioni troppo grandi')
        if len([1 for k,v in scope.get('headers',[]) if k.lower()==b'host'])>1:return await reject(400,'Host duplicato')
        if 'range' in headers and (len(headers['range'])>100 or ',' in headers['range']):return await reject(416,'Intervallo non supportato')
        if public and headers.get('host','').split(':')[0] not in (public,'127.0.0.1','localhost'):
            return await reject(400,'Host non consentito')
        if path.startswith('/api/') and path!='/api/events':
            # A bounded short-window bucket, by authenticated session or visitor IP.
            raw=headers.get('cookie','');who=hashlib.sha256(raw.encode()).hexdigest() if 'club_session=' in raw else ip
            now=time.monotonic()
            with self.rate_lock:
                hit=self.requests.pop(who,(now,0));hit=(now,0) if now-hit[0]>60 else hit
                self.requests[who]=(hit[0],hit[1]+1)
                while len(self.requests)>10000:self.requests.popitem(last=False)
            if hit[1]>=600:return await reject(429,'Troppe richieste. Attendi un minuto.',60)
        body=b'';metadata={}
        if method in ('POST','PUT','PATCH','DELETE'):
            maximum=131072 if path in ('/api/import','/api/themes','/api/preferences') else 32768
            try:
                if int(headers.get('content-length','0'))>maximum:return await reject(413,'Richiesta troppo grande')
            except ValueError:return await reject(400,'Lunghezza richiesta non valida')
            while True:
                message=await receive()
                if message['type']=='http.disconnect':return
                body+=message.get('body',b'')
                if len(body)>maximum:return await reject(413,'Richiesta troppo grande')
                if not message.get('more_body'):break
            try:
                payload=json.loads(body or '{}')
                if isinstance(payload,dict):metadata={k:payload[k] for k in ('name','uci','expected_ply','mode','rated','accept','disabled','admin','base','increment') if k in payload and isinstance(payload[k],(str,int,bool))}
            except (ValueError,UnicodeDecodeError):pass
        sent=[False]
        async def buffered_receive():
            if not sent[0] and method in ('POST','PUT','PATCH','DELETE'):
                sent[0]=True;return {'type':'http.request','body':body,'more_body':False}
            return await receive()
        async def observed_send(message):
            if message['type']=='http.response.start':status[0]=message['status']
            await send(message)
        actor=None
        if method not in ('GET','HEAD','OPTIONS') or path.startswith('/api/admin/'):
            cookie=SimpleCookie()
            try:
                cookie.load(headers.get('cookie',''));token=cookie.get('club_session')
                if token:
                    key=hashlib.sha256(token.value.encode()).hexdigest()
                    with self.s['lock']:
                        row=self.s['db'].execute('SELECT u.id,u.name FROM users u JOIN sessions se ON se.user_id=u.id WHERE se.token=? AND se.expires>?',(key,time.time())).fetchone();actor=dict(row) if row else None
            except Exception:pass
        try:await self.app(scope,buffered_receive,observed_send)
        finally:
            if method not in ('GET','HEAD','OPTIONS') or path.startswith('/api/admin/') or path.startswith('/api/') and status[0]>=400:
                if path in ('/api/login','/api/register') and status[0]<300 and metadata.get('name'):
                    with self.s['lock']:
                        row=self.s['db'].execute('SELECT id,name FROM users WHERE name=?',(metadata['name'],)).fetchone();actor=dict(row) if row else actor
                        if row and path=='/api/login':self.s['db'].execute('UPDATE users SET last_login=? WHERE id=?',(time.time(),row['id']))
                action='auth.'+path.split('/')[-1] if path in ('/api/login','/api/register','/api/logout','/api/password') else method.lower()+'.'+path.removeprefix('/api/').replace('/','.')[:120]
                segments=path.split('/');subject=segments[4] if path.startswith('/api/admin/users/') and len(segments)>4 else None
                self.s['audit_event'](action,actor,subject,status[0],ip,headers.get('user-agent',''),metadata)


def install(s):
    s['password_hash']=bounded_hash(s['password_hash'])
    s['client_ip']=lambda request:client_ip(request,s['PUBLIC_URL'])
    s['app'].add_middleware(SecurityMiddleware,state=s)
