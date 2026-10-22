import os,tempfile,unittest,secrets,json,time,concurrent.futures
from unittest.mock import patch
if 'server' not in __import__('sys').modules:os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='community-test-')
from fastapi.testclient import TestClient
import server
from helpers import befriend,clear_limits

class CommunityTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  clear_limits();cls.admin=TestClient(server.app,headers={'X-Club':'1'});cls.admin.__enter__()
  if server.has_owner():r=cls.admin.post('/api/login',json={'name':'AccountOwner','password':'Owner-password-123'})
  else:r=cls.admin.post('/api/register',json={'name':'AccountOwner','password':'Owner-password-123','setup_token':server.setup_token})
  assert r.status_code==200,r.text
 @classmethod
 def tearDownClass(cls):cls.admin.__exit__(None,None,None)
 def setUp(self):clear_limits()
 def member(self,prefix='Member'):
  c=TestClient(server.app,headers={'X-Club':'1'});r=c.post('/api/register',json={'name':prefix+secrets.token_hex(3),'password':'Member-password-123'});self.assertEqual(r.status_code,200,r.text);return c,c.get('/api/me').json()['user']
 def game(self,a,b,rated=True):
  befriend(a,b);r=a.post('/api/challenges',json={'recipient_id':b.get('/api/me').json()['user']['id'],'base':300,'increment':0,'color':'white','rated':rated});self.assertEqual(r.status_code,200,r.text);ch=r.json()['challenge'];self.assertEqual(ch['rated'],rated)
  joined=b.post('/api/challenges/'+ch['id']+'/reply',json={'accept':True});self.assertEqual(joined.status_code,200,joined.text);return ch['game_id']
 def test_friend_code_visibility_requests_and_blocking(self):
  a,ua=self.member();b,ub=self.member();outside,uc=self.member()
  self.assertEqual(a.get('/api/members').json()['members'],[]);self.assertNotEqual(ua['friend_code'],ub['friend_code']);self.assertEqual(len(ua['friend_code']),16)
  self.assertEqual(a.post('/api/challenges',json={'recipient_id':ub['id']}).status_code,404)
  self.assertEqual(a.post('/api/friends/request',json={'code':ub['friend_code']}).status_code,200)
  self.assertEqual(a.post('/api/friends/'+ub['id']+'/reply',json={'accept':True}).status_code,404)
  self.assertEqual(outside.post('/api/friends/'+ua['id']+'/reply',json={'accept':True}).status_code,404)
  self.assertEqual(b.get('/api/friends').json()['incoming'][0]['id'],ua['id'])
  self.assertEqual(a.get('/api/members').json()['members'],[])
  self.assertEqual(b.post('/api/friends/'+ua['id']+'/reply',json={'accept':True}).status_code,200)
  roster=a.get('/api/members').json()['members'];self.assertEqual([u['id'] for u in roster],[ub['id']]);self.assertNotIn('friend_code',roster[0]);self.assertEqual(outside.get('/api/members').json()['members'],[])
  self.assertTrue(any(u['id']==ua['id'] for u in self.admin.get('/api/members').json()['members']))
  challenge=a.post('/api/challenges',json={'recipient_id':ub['id'],'base':300}).json()['challenge']
  self.assertEqual(b.post('/api/friends/'+ua['id']+'/block',json={}).status_code,200)
  self.assertEqual(a.get('/api/members').json()['members'],[]);self.assertEqual(a.post('/api/friends/request',json={'code':ub['friend_code']}).status_code,404)
  self.assertEqual(b.post('/api/challenges/'+challenge['id']+'/reply',json={'accept':True}).status_code,409)
 def test_private_room_and_readonly_admin(self):
  a,ua=self.member();b,ub=self.member();other,uo=self.member();g=a.post('/api/games',json={'kind':'friend','base':300}).json();gid=g['id']
  self.assertEqual(b.post('/api/games/'+gid+'/join',json={}).status_code,403)
  befriend(a,b);self.assertEqual(b.post('/api/games/'+gid+'/join',json={}).status_code,200)
  self.assertEqual(other.get('/api/games/'+gid).status_code,403);self.assertEqual(self.admin.get('/api/games/'+gid).status_code,200)
  for route,body in [('move',{'uci':'e2e4','expected_ply':0}),('resign',{}),('draw',{})]:self.assertEqual(self.admin.post('/api/games/'+gid+'/'+route,json=body).status_code,403)
  self.assertEqual(a.post('/api/games',json={'kind':'bot','rated':True}).status_code,400)
  self.assertEqual(a.post('/api/games',json={'kind':'friend','base':0,'rated':True}).status_code,400)
 def test_ranked_result_atomic_idempotent_and_unranked(self):
  a,ua=self.member();b,ub=self.member();gid=self.game(a,b)
  for i,uci in enumerate(['f2f3','e7e5','g2g4','d8h4']):self.assertEqual((a if i%2==0 else b).post('/api/games/'+gid+'/move',json={'uci':uci,'expected_ply':i}).status_code,200)
  g=a.get('/api/games/'+gid).json();self.assertEqual(g['rating_change']['white']['delta'],-20);self.assertEqual(g['rating_change']['black']['delta'],20)
  self.assertEqual(a.get('/api/me').json()['user']['ratings']['blitz']['rating'],1180);self.assertEqual(b.get('/api/me').json()['user']['ratings']['blitz']['rating'],1220)
  with server.lock:
   stale=server.get_game(gid);stale['status']='active';server.finish(stale,'0-1','Scacco matto')
   self.assertEqual(server.db.execute('SELECT COUNT(*) FROM rating_results WHERE game_id=?',(gid,)).fetchone()[0],1)
  casual=self.game(a,b,False);a.post('/api/games/'+casual+'/resign',json={});self.assertEqual(a.get('/api/me').json()['user']['ratings']['blitz']['rating'],1180)
  ranked=self.game(a,b);r=self.admin.post('/api/admin/games/'+ranked+'/abort',json={'current_password':'Owner-password-123'});self.assertEqual(r.status_code,200,r.text);self.assertEqual(a.get('/api/me').json()['user']['ratings']['blitz']['games'],1)
 def test_password_reset_requires_admin_reauth_and_revokes_all(self):
  a,ua=self.member();another=TestClient(server.app,headers={'X-Club':'1'});another.post('/api/login',json={'name':ua['name'],'password':'Member-password-123'})
  url='/api/admin/users/'+ua['id']+'/password';payload={'current_password':'Owner-password-123','new_password':'Temporary-password-123'}
  self.assertEqual(a.post(url,json=payload).status_code,403)
  self.assertEqual(self.admin.post(url,json={**payload,'current_password':'Wrong-password-123'}).status_code,403)
  self.assertEqual(self.admin.post(url,json=payload).status_code,200)
  self.assertIsNone(a.get('/api/me').json()['user']);self.assertIsNone(another.get('/api/me').json()['user'])
  self.assertEqual(a.post('/api/login',json={'name':ua['name'],'password':payload['new_password']}).status_code,200)
  self.assertTrue(a.get('/api/me').json()['user']['must_change_password']);self.assertEqual(a.get('/api/lobby').status_code,403)
  r=a.post('/api/password',json={'current_password':payload['new_password'],'new_password':'Final-personal-password-123'});self.assertEqual(r.status_code,200,r.text);self.assertFalse(a.get('/api/me').json()['user']['must_change_password']);self.assertEqual(a.get('/api/lobby').status_code,200)
  logs=self.admin.get('/api/admin/logs',params={'action':'password'}).json();raw=json.dumps(logs)
  for secret in ('Temporary-password-123','Owner-password-123','Final-personal-password-123','current_password','new_password','club_session'):self.assertNotIn(secret,raw)
  self.assertTrue(any(e['subject_id']==ua['id'] for e in logs['events']));self.assertEqual(a.get('/api/admin/logs').status_code,403)
 def test_owner_promotes_admin_protection_and_session_revocation(self):
  a,ua=self.member();b,ub=self.member();url='/api/admin/users/'+ua['id']+'/role';body={'current_password':'Owner-password-123','admin':True}
  self.assertEqual(a.post(url,json=body).status_code,403);self.assertEqual(self.admin.post(url,json=body).status_code,200)
  self.assertIsNone(a.get('/api/me').json()['user']);a.post('/api/login',json={'name':ua['name'],'password':'Member-password-123'});self.assertTrue(a.get('/api/me').json()['user']['admin'])
  owner=self.admin.get('/api/me').json()['user'];self.assertTrue(owner['owner'])
  self.assertEqual(a.post('/api/admin/users/'+owner['id']+'/password',json={'current_password':'Member-password-123','new_password':'Cannot-change-owner-123'}).status_code,403)
  self.assertEqual(a.post('/api/admin/users/'+ub['id']+'/role',json={'current_password':'Member-password-123','admin':True}).status_code,403)
  self.assertEqual(a.post('/api/admin/users/'+ub['id']+'/sessions/revoke',json={'current_password':'Member-password-123'}).status_code,200);self.assertIsNone(b.get('/api/me').json()['user'])
 def test_matchmaking_optin_strangers_and_blocked_pairs(self):
  a,ua=self.member();b,ub=self.member();self.assertEqual(a.get('/api/members').json()['members'],[])
  first=a.post('/api/matchmaking',json={'base':600,'increment':0,'rated':True});self.assertTrue(first.json()['queued'])
  second=b.post('/api/matchmaking',json={'base':600,'increment':0,'rated':True});self.assertEqual(second.status_code,200,second.text);g=second.json()['game'];self.assertEqual(g['status'],'active');self.assertTrue(g['matchmaking']);self.assertTrue(g['rated'])
  self.assertFalse(a.get('/api/matchmaking').json()['queued']);self.assertEqual(a.get('/api/members').json()['members'],[])
  self.assertEqual(a.get('/api/games/'+g['id']).status_code,200)
 def test_minimum_move_clock_and_premove_illegality(self):
  a,ua=self.member();b,ub=self.member();gid=self.game(a,b,False)
  with server.lock:
   g=server.get_game(gid);g['last']=time.time();server.save(g)
  g=a.post('/api/games/'+gid+'/move',json={'uci':'e2e4','expected_ply':0,'premove':False}).json();self.assertLessEqual(g['clocks'][1],299.9001)
  r=b.post('/api/games/'+gid+'/move',json={'uci':'e7e4','expected_ply':1,'premove':True});self.assertEqual(r.status_code,400)
  with server.lock:
   g=server.get_game(gid);g['clocks'][0]=.05;g['last']=time.time();server.save(g)
  result=b.post('/api/games/'+gid+'/move',json={'uci':'e7e5','expected_ply':1,'premove':True}).json();self.assertEqual(result['status'],'finished');self.assertEqual(result['ply'],1)
 def test_new_password_policy_preserves_legacy_logins(self):
  c=TestClient(server.app,headers={'X-Club':'1'})
  self.assertEqual(c.post('/api/register',json={'name':'Weak'+secrets.token_hex(3),'password':'Short-pass'}).status_code,400)
  a,u=self.member()
  old_hash=server.password_hash('Short-pass')
  with server.lock:server.db.execute('UPDATE users SET password=? WHERE id=?',(old_hash,u['id']))
  self.assertEqual(a.post('/api/login',json={'name':u['name'],'password':'Short-pass'}).status_code,200)
  self.assertEqual(a.post('/api/password',json={'current_password':'Short-pass','new_password':'Short-pass'}).status_code,422)
 def test_hash_admission_does_not_block_play(self):
  from security import HASH_SLOTS
  a,u=self.member();b,v=self.member();gid=self.game(a,b,False)
  HASH_SLOTS.acquire();HASH_SLOTS.acquire()
  try:
   self.assertEqual(a.post('/api/login',json={'name':u['name'],'password':'Member-password-123'}).status_code,429)
   self.assertEqual(a.get('/api/health').status_code,200)
   self.assertEqual(a.post('/api/games/'+gid+'/move',json={'uci':'e2e4','expected_ply':0}).status_code,200)
  finally:HASH_SLOTS.release();HASH_SLOTS.release()
 def test_quotas_body_limit_host_and_audit(self):
  a,ua=self.member();self.assertEqual(a.post('/api/login',content=b'x'*33000).status_code,413)
  self.assertEqual(a.get('/style.css',headers={'Range':'bytes=0-1,4-5'}).status_code,416)
  self.assertEqual(a.get('/api/health',headers=[('Host','first.invalid'),('Host','second.invalid')]).status_code,400)
  # Chunked bodies cannot bypass the same cap.
  def chunks():yield b'x'*20000;yield b'y'*20000
  self.assertEqual(a.post('/api/login',content=chunks()).status_code,413)
  with patch.object(server,'PUBLIC_URL','https://chess.aura-server.org'):
   self.assertEqual(a.get('/api/health',headers={'Host':'evil.example'}).status_code,400)
  self.assertEqual(a.get('/api/admin/stats').status_code,403)
  r=a.post('/api/import',json={'pgn':'1. e4 e5 *'});gid=r.json()['id']
  self.assertEqual(a.post('/api/games/'+gid+'/analysis',json={}).status_code,200)
  another=a.post('/api/import',json={'pgn':'1. d4 d5 *'}).json()['id'];self.assertEqual(a.post('/api/games/'+another+'/analysis',json={}).status_code,429)
  a.post('/api/games/'+gid+'/analysis/cancel',json={})
  stats=self.admin.get('/api/admin/stats').json();self.assertIn('analysis_queued',stats)

if __name__=='__main__':unittest.main(verbosity=2)
