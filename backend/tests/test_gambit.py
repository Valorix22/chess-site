import os,tempfile,unittest,secrets,json,time,re,sqlite3
from pathlib import Path
if 'server' not in __import__('sys').modules:os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='gambit-test-')
from fastapi.testclient import TestClient
import server
from helpers import befriend,clear_limits

class GambitTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  clear_limits();cls.admin=TestClient(server.app,headers={'X-Club':'1'});cls.admin.__enter__()
  body={'name':'AccountOwner','password':'Owner-password-123'}
  if server.has_owner():r=cls.admin.post('/api/login',json=body)
  else:r=cls.admin.post('/api/register',json={**body,'setup_token':server.setup_token})
  assert r.status_code==200,r.text
 @classmethod
 def tearDownClass(cls):cls.admin.__exit__(None,None,None)
 def setUp(self):clear_limits()
 def person(self):
  clear_limits();c=TestClient(server.app,headers={'X-Club':'1'});r=c.post('/api/register',json={'name':'Gambit'+secrets.token_hex(3),'password':'Gambit-password-123'});self.assertEqual(r.status_code,200,r.text);return c,c.get('/api/me').json()['user']
 def content(self,kind,data=None,title='Test content',parent=None):
  r=self.admin.post('/api/platform/content/'+kind,json={'title':title,'status':'published','parent':parent,'data':data or {}});self.assertEqual(r.status_code,200,r.text);return r.json()
 def test_bootstrap_profile_privacy_preferences_sessions(self):
  a,ua=self.person();b,ub=self.person()
  boot=a.get('/api/platform/bootstrap');self.assertEqual(boot.status_code,200,boot.text);self.assertEqual(boot.json()['friends']['friends'],[])
  self.assertEqual(a.get('/api/platform/profile/'+ub['id']).status_code,403)
  befriend(a,b);self.assertEqual(a.get('/api/platform/profile/'+ub['id']).status_code,200)
  self.assertEqual(b.patch('/api/platform/profile',json={'bio':'<img onerror=alert(1)>','country':'IT'}).status_code,200)
  self.assertEqual(a.get('/api/platform/profile/'+ub['id']).json()['bio'],'<img onerror=alert(1)>')
  self.assertEqual(a.patch('/api/platform/profile',json={'rating':9999}).status_code,400)
  self.assertEqual(a.patch('/api/platform/preferences',json={'theme':'evil','sound':True}).status_code,400)
  self.assertEqual(a.patch('/api/platform/preferences',json={'theme':'light','premoveMode':'multiple','migration_version':1}).status_code,200)
  self.assertEqual(a.get('/api/platform/bootstrap').json()['preferences']['theme'],'light')
  session=a.get('/api/platform/sessions').json()['items'][0];self.assertNotIn(a.cookies.get('club_session'),json.dumps(session));self.assertTrue(session['current']);self.assertEqual(b.delete('/api/platform/sessions/'+session['id']).status_code,200);self.assertEqual(a.get('/api/lobby').status_code,200)
  self.assertEqual(a.delete('/api/platform/sessions/'+session['id']).status_code,200);self.assertEqual(a.get('/api/lobby').status_code,401)
 def test_private_messages_report_and_admin_boundary(self):
  a,ua=self.person();b,ub=self.person();other,uo=self.person();befriend(a,b)
  r=a.post('/api/platform/messages/dm/'+ub['id'],json={'text':'private test'});self.assertEqual(r.status_code,200,r.text);mid=r.json()['id']
  self.assertEqual(b.get('/api/platform/messages/dm/'+ua['id']).json()['items'][0]['body'],'private test')
  self.assertEqual(other.get('/api/platform/messages/dm/'+ub['id']).status_code,403)
  self.assertEqual(self.admin.get('/api/platform/messages/dm/'+ua['id']).status_code,403)
  self.assertEqual(other.post('/api/platform/reports',json={'kind':'message','target':str(mid),'reason':'test'}).status_code,403)
  report=b.post('/api/platform/reports',json={'kind':'message','target':str(mid),'reason':'abuse'});self.assertEqual(report.status_code,200,report.text)
  reports=self.admin.get('/api/platform/admin/reports').json()['items'];found=next(r for r in reports if r['id']==report.json()['id']);self.assertEqual(found['evidence']['body'],'private test')
  with server.lock:logs=' '.join(r[0] for r in server.db.execute('SELECT details FROM audit_events'))
  self.assertNotIn('private test',logs)
  b.post('/api/friends/'+ua['id']+'/block',json={});self.assertEqual(a.post('/api/platform/messages/dm/'+ub['id'],json={'text':'no'}).status_code,403)
 def test_puzzle_validation_rating_idempotency_and_hidden_solution(self):
  a,ua=self.person();b,ub=self.person();p=self.content('puzzle',{'fen':'6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1','solution':['d1d8'],'rating':860,'theme':'mate'})
  data=a.get('/api/platform/content/item/'+p['id']).json();self.assertNotIn('solution',data)
  attempt=a.post('/api/platform/puzzles/'+p['id']+'/attempts',json={}).json();aid=attempt['id'];self.assertNotIn('solution',attempt)
  self.assertEqual(b.post('/api/platform/attempts/'+aid+'/move',json={'uci':'d1d8'}).status_code,404)
  self.assertEqual(a.post('/api/platform/attempts/'+aid+'/move',json={'uci':'d1h8','rating':9000}).status_code,400)
  result=a.post('/api/platform/attempts/'+aid+'/move',json={'uci':'d1d8'});self.assertEqual(result.status_code,200,result.text);self.assertTrue(result.json()['correct']);self.assertIn('solution',result.json())
  rating=a.get('/api/platform/puzzles/progress').json()['rating'];self.assertLess(rating,1300)
  self.assertEqual(a.post('/api/platform/attempts/'+aid+'/move',json={'uci':'d1d8'}).status_code,409)
  second=a.post('/api/platform/puzzles/'+p['id']+'/attempts',json={}).json()['id'];self.assertEqual(a.post('/api/platform/attempts/'+second+'/move',json={'uci':'d1d8'}).json()['delta'],0)
  self.assertEqual(a.get('/api/platform/puzzles/progress').json()['rating'],rating)
 def test_course_progress_and_forum_ownership_votes(self):
  a,ua=self.person();b,ub=self.person();course=self.content('course',{'description':'A real lesson'});lesson=self.content('lesson',{'fen':'startpos' if False else 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','moves':['e2e4','e7e5']},parent=course['id'])
  self.assertEqual(a.post('/api/platform/lessons/'+lesson['id']+'/progress',json={'step':2}).status_code,409)
  self.assertEqual(a.post('/api/platform/lessons/'+lesson['id']+'/progress',json={'step':1}).status_code,200)
  self.assertTrue(a.post('/api/platform/lessons/'+lesson['id']+'/progress',json={'step':2,'notes':'My notes'}).json()['complete'])
  self.assertEqual(b.get('/api/platform/content/item/'+lesson['id']).json()['progress'],{})
  thread=a.post('/api/platform/content/thread',json={'title':'Hello','data':{'text':'discussion'}}).json();tid=thread['id']
  self.assertEqual(b.patch('/api/platform/content/item/'+tid,json={'title':'stolen'}).status_code,403)
  for _ in range(2):self.assertEqual(b.post('/api/platform/content/item/'+tid+'/vote',json={'value':1}).json()['votes'],1)
  self.assertEqual(a.patch('/api/platform/content/item/'+tid,json={'data':{'pinned':True}}).status_code,403)
 def test_tournament_pairings_are_server_authoritative(self):
  a,ua=self.person();b,ub=self.person();event=self.content('tournament',{'format':'swiss','base':300,'increment':0,'rated':True,'rounds':1,'duration':3600})
  for c in (a,b):self.assertEqual(c.post('/api/platform/content/item/'+event['id']+'/membership',json={'action':'join'}).status_code,200)
  self.assertEqual(a.post('/api/platform/tournaments/'+event['id']+'/control',json={'action':'start'}).status_code,403)
  r=self.admin.post('/api/platform/tournaments/'+event['id']+'/control',json={'action':'start'});self.assertEqual(r.status_code,200,r.text)
  info=a.get('/api/platform/tournaments/'+event['id']).json();self.assertEqual(len(info['pairings']),1);pair=info['pairings'][0];gid=pair['game_id'];white=a if pair['white']==ua['id'] else b;black=b if white is a else a
  for i,uci in enumerate(['f2f3','e7e5','g2g4','d8h4']):self.assertEqual((white if i%2==0 else black).post('/api/games/'+gid+'/move',json={'uci':uci,'expected_ply':i}).status_code,200)
  standings=a.get('/api/platform/tournaments/'+event['id']).json();self.assertEqual(standings['phase'],'finished');self.assertEqual(standings['standings'][0]['points'],1)
 def test_every_new_admin_route_rejects_normal_accounts(self):
  c,u=self.person();tested=[]
  for route in server.app.routes:
   path=getattr(route,'path','')
   if not path.startswith(('/api/platform/admin/','/api/admin/')):continue
   actual=re.sub(r'\{[^}]+\}',u['id'],path)
   for method in route.methods-{'HEAD','OPTIONS'}:
    response=c.request(method,actual,json={'disabled':False,'admin':False,'current_password':'Incorrect-password-123','new_password':'Temporary-password-123'} if method!='GET' else None);self.assertEqual(response.status_code,403,(method,actual,response.text));tested.append((method,path))
  self.assertGreaterEqual(len(tested),10)
 def test_disabled_providers_and_migration_reversal(self):
  a,u=self.person();cfg=a.get('/api/platform/config').json();self.assertFalse(cfg['DEMO_MODE']);self.assertFalse(cfg['FEATURE_FLAGS']['email']);self.assertFalse(cfg['FEATURE_FLAGS']['watch'])
  self.assertEqual(a.post('/api/platform/auth/forgot-password',json={'email':'x@example.com'}).status_code,404)
  self.assertEqual(a.get('/api/platform/content/stream').status_code,404)
  self.assertEqual(a.get('/watch.html').status_code,404)
  self.assertEqual(a.get('/admin.html').status_code,403)
  self.assertEqual(a.get('/gambit/admin.html').status_code,404)
  self.assertEqual(a.head('/gambit/admin.html').status_code,404)
  self.assertIn('<html',a.get('/index.html?name=../../data/club.sqlite').text.lower())
  conn=sqlite3.connect(':memory:');conn.executescript('CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE games(id TEXT PRIMARY KEY); INSERT INTO users VALUES("preserved");');conn.executescript((server.BASE/'migrations/001_gambit.up.sql').read_text());conn.executescript((server.BASE/'migrations/001_gambit.down.sql').read_text());self.assertEqual(conn.execute('SELECT id FROM users').fetchone()[0],'preserved');conn.close()
 def test_private_club_requests_cannot_self_approve_and_can_transfer(self):
  a,ua=self.person();b,ub=self.person();other,uo=self.person()
  r=a.post('/api/platform/content/club',json={'title':'Private club','data':{'privacy':'private','description':'Membership by request'}});self.assertEqual(r.status_code,200,r.text);cid=r.json()['id']
  self.assertEqual(b.get('/api/platform/content/item/'+cid).status_code,200)
  self.assertTrue(b.post('/api/platform/content/item/'+cid+'/membership',json={'action':'join'}).json()['item']['pending'])
  self.assertEqual(b.get('/api/platform/messages/club/'+cid).status_code,403)
  self.assertEqual(b.post('/api/platform/content/item/'+cid+'/membership',json={'action':'accept'}).status_code,403)
  self.assertEqual(other.post('/api/platform/content/item/'+cid+'/membership',json={'action':'accept','user_id':ub['id']}).status_code,403)
  self.assertEqual(a.post('/api/platform/content/item/'+cid+'/membership',json={'action':'accept','user_id':ub['id']}).status_code,200)
  self.assertEqual(b.post('/api/platform/messages/club/'+cid,json={'text':'Accepted member'}).status_code,200)
  self.assertEqual(a.post('/api/platform/content/item/'+cid+'/membership',json={'action':'transfer','user_id':ub['id']}).status_code,200)
  self.assertEqual(a.post('/api/platform/content/item/'+cid+'/membership',json={'action':'leave'}).status_code,200)
  self.assertEqual(b.post('/api/platform/content/item/'+cid+'/membership',json={'action':'leave'}).status_code,409)
 def test_timed_puzzles_have_server_deadline_no_hints_and_no_rating(self):
  a,ua=self.person();b,ub=self.person();p=self.content('puzzle',{'fen':'6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1','solution':['d1d8'],'rating':860,'theme':'mate'})
  session=a.post('/api/platform/puzzle-sessions',json={'mode':'rush'}).json();sid=session['id']
  self.assertEqual(b.get('/api/platform/puzzle-sessions/'+sid).status_code,403)
  attempt=a.post('/api/platform/puzzles/'+p['id']+'/attempts',json={'session':sid}).json();aid=attempt['id']
  self.assertEqual(a.post('/api/platform/puzzles/'+p['id']+'/attempts',json={'session':sid}).json()['id'],aid)
  self.assertEqual(a.post('/api/platform/attempts/'+aid+'/hint',json={}).status_code,403)
  result=a.post('/api/platform/attempts/'+aid+'/move',json={'uci':'d1d8'});self.assertEqual(result.status_code,200,result.text);self.assertEqual(result.json()['delta'],0)
  self.assertEqual(a.get('/api/platform/puzzles/progress').json()['games'],0)
  self.assertEqual(a.get('/api/platform/puzzle-sessions/'+sid).json()['players'][0]['score'],1)
  with server.lock:
   value=json.loads(server.db.execute('SELECT data FROM content WHERE id=?',(sid,)).fetchone()[0]);value['ends_at']=time.time()-1;server.db.execute('UPDATE content SET data=? WHERE id=?',(json.dumps(value),sid))
  self.assertEqual(a.post('/api/platform/puzzles/'+p['id']+'/attempts',json={'session':sid}).status_code,409)
 def test_puzzle_tournament_results_and_team_memberships(self):
  a,ua=self.person();b,ub=self.person();p=self.content('puzzle',{'fen':'6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1','solution':['d1d8'],'rating':860,'theme':'mate'})
  event=self.content('tournament',{'format':'puzzle','duration':300,'rated':True})
  for c in (a,b):self.assertEqual(c.post('/api/platform/content/item/'+event['id']+'/membership',json={'action':'join'}).status_code,200)
  self.assertEqual(self.admin.post('/api/platform/tournaments/'+event['id']+'/control',json={'action':'start'}).status_code,200)
  attempt=a.post('/api/platform/puzzles/'+p['id']+'/attempts',json={'tournament':event['id']}).json()
  self.assertEqual(a.post('/api/platform/attempts/'+attempt['id']+'/hint').status_code,403)
  self.assertTrue(a.post('/api/platform/attempts/'+attempt['id']+'/move',json={'uci':'d1d8'}).json()['correct'])
  result=a.get('/api/platform/tournaments/'+event['id']).json();self.assertFalse(result['rated']);self.assertEqual(result['standings'][0]['user_id'],ua['id']);self.assertEqual(result['standings'][0]['points'],1)
  clear_limits();team=self.content('tournament',{'format':'team','rounds':1});clubs=[]
  for c in (a,b):clubs.append(c.post('/api/platform/content/club',json={'title':'A club','data':{'privacy':'public'}}).json()['id'])
  self.assertEqual(a.post('/api/platform/content/item/'+team['id']+'/membership',json={'action':'join','team_club':clubs[1]}).status_code,403)
  for c,cid in zip((a,b),clubs):self.assertEqual(c.post('/api/platform/content/item/'+team['id']+'/membership',json={'action':'join','team_club':cid}).status_code,200)
  self.assertEqual(self.admin.post('/api/platform/tournaments/'+team['id']+'/control',json={'action':'start'}).status_code,200)
  result=a.get('/api/platform/tournaments/'+team['id']).json();self.assertEqual(len(result['pairings']),1);self.assertEqual(len(result['teams']),2)
 def test_openings_sets_hint_human_boundary_and_void_rebuild(self):
  a,ua=self.person();b,ub=self.person();befriend(a,b)
  self.assertTrue(a.get('/api/platform/openings?q=Sicilian').json()['items'])
  self.assertIn('e2e4',[x['uci'] for x in a.get('/api/platform/openings?fen='+__import__('urllib.parse').parse.quote(__import__('chess').STARTING_FEN)).json()['moves']])
  custom=a.post('/api/platform/puzzle-sets',json={'title':'My set','theme':'mate','minimum':500,'maximum':1200});self.assertEqual(custom.status_code,200,custom.text);self.assertEqual(b.get('/api/platform/puzzle-sets').json()['items'],[]);self.assertEqual(b.delete('/api/platform/puzzle-sets/'+custom.json()['id']).status_code,403)
  ids=[]
  for winner in (a,b):
   ch=a.post('/api/challenges',json={'recipient_id':ub['id'],'base':300,'increment':0,'color':'white','rated':True}).json()['challenge'];gid=ch['game_id'];b.post('/api/challenges/'+ch['id']+'/reply',json={'accept':True})
   self.assertEqual(a.post('/api/platform/games/'+gid+'/hint').status_code,403)
   loser=b if winner is a else a;self.assertEqual(loser.post('/api/games/'+gid+'/resign').status_code,200);ids.append(gid)
  response=self.admin.post('/api/platform/admin/games/'+ids[0]+'/void',json={'current_password':'Owner-password-123','confirm':ids[0],'reason':'Test recalculation'});self.assertEqual(response.status_code,200,response.text)
  ratings=a.get('/api/me').json()['user']['ratings']['blitz'];self.assertEqual(ratings['rating'],1180);self.assertEqual(ratings['games'],1)
  game=a.get('/api/games/'+ids[1]).json();self.assertEqual(game['rating_change']['white']['before'],1200);self.assertEqual(game['rating_change']['white']['after'],1180)

 def test_scheduled_tournament_starts_from_server_clock(self):
  a,ua=self.person();b,ub=self.person();event=self.content('tournament',{'format':'swiss','rounds':1,'starts_at':time.time()-10})
  for c in (a,b):self.assertEqual(c.post('/api/platform/content/item/'+event['id']+'/membership',json={'action':'join'}).status_code,200)
  deadline=time.monotonic()+7;state=None
  while time.monotonic()<deadline:
   state=a.get('/api/platform/tournaments/'+event['id']).json()
   if state['phase']=='active':break
   time.sleep(.1)
  self.assertEqual(state['phase'],'active');self.assertEqual(len(state['pairings']),1)
  self.assertEqual(self.admin.post('/api/admin/games/'+state['pairings'][0]['game_id']+'/abort',json={'current_password':'Owner-password-123'}).status_code,200)
