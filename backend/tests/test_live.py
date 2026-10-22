import os,tempfile,unittest,secrets,time,json
if 'server' not in __import__('sys').modules: os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='live-test-')
from fastapi.testclient import TestClient
import server
from helpers import clear_limits,befriend
from live import validate_theme

class LiveFeaturesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin=TestClient(server.app,headers={'X-Club':'1'})
        if server.has_owner():
            r=cls.admin.post('/api/login',json={'name':'AccountOwner','password':'Owner-password-123'})
        else:r=cls.admin.post('/api/register',json={'name':'AccountOwner','password':'Owner-password-123','setup_token':server.setup_token})
        assert r.status_code==200,r.text
    def setUp(self):clear_limits()
    def member(self,prefix):
        c=TestClient(server.app,headers={'X-Club':'1'});name=prefix+secrets.token_hex(3)
        r=c.post('/api/register',json={'name':name,'password':'Test-password-123'});self.assertEqual(r.status_code,200,r.text)
        return c,c.get('/api/me').json()['user']
    def test_disable_reenable_and_protect_admin(self):
        c,u=self.member('Disabled')
        g=c.post('/api/games',json={'kind':'friend','base':0}).json()
        self.assertEqual(c.get('/api/admin/users').status_code,403)
        self.assertEqual(c.post('/api/admin/users/'+u['id']+'/status',json={'disabled':True}).status_code,403)
        r=self.admin.post('/api/admin/users/'+u['id']+'/status',json={'disabled':True});self.assertEqual(r.status_code,200)
        self.assertIsNone(c.get('/api/me').json()['user'])
        self.assertEqual(c.get('/api/games/'+g['id']).status_code,401)
        self.assertEqual(c.post('/api/login',json={'name':u['name'],'password':'Test-password-123'}).status_code,403)
        self.assertEqual(self.admin.post('/api/admin/users/'+u['id']+'/status',json={'disabled':False}).status_code,200)
        self.assertEqual(c.post('/api/login',json={'name':u['name'],'password':'Test-password-123'}).status_code,200)
        self.assertEqual(c.get('/api/games/'+g['id']).json()['status'],'finished')
        admin_id=self.admin.get('/api/me').json()['user']['id']
        self.assertEqual(self.admin.post('/api/admin/users/'+admin_id+'/status',json={'disabled':True}).status_code,400)
        roster=self.admin.get('/api/admin/users',params={'q':u['name']}).json()
        self.assertEqual(roster['total'],1);self.assertNotIn('password',roster['users'][0])
    def test_challenge_accept_decline_and_reserved_seat(self):
        a,ua=self.member('Sender');b,ub=self.member('Receiver');other,_=self.member('Outside');befriend(a,b)
        r=a.post('/api/challenges',json={'recipient_id':ub['id'],'base':0,'color':'white'});self.assertEqual(r.status_code,200,r.text)
        ch=r.json()['challenge'];cid=ch['id'];gid=ch['game_id']
        self.assertEqual(a.post('/api/challenges',json={'recipient_id':ub['id'],'base':0}).status_code,409)
        self.assertEqual(other.post('/api/games/'+gid+'/join',json={}).status_code,403)
        self.assertEqual(other.post('/api/challenges/'+cid+'/reply',json={'accept':True}).status_code,403)
        self.assertEqual(b.post('/api/challenges/'+cid+'/reply',json={'accept':False}).status_code,200)
        self.assertEqual(a.get('/api/games/'+gid).json()['status'],'finished')
        self.assertEqual(b.post('/api/challenges/'+cid+'/reply',json={'accept':True}).status_code,409)
        ch=a.post('/api/challenges',json={'recipient_id':ub['id'],'base':0,'color':'white'}).json()['challenge']
        g=b.post('/api/challenges/'+ch['id']+'/reply',json={'accept':True}).json()['game']
        self.assertEqual(g['status'],'active');self.assertFalse(g['color'])
        self.assertEqual(a.post('/api/games/'+g['id']+'/move',json={'uci':'e2e4','expected_ply':0}).status_code,200)
        self.assertEqual(b.get('/api/games/'+g['id']).json()['history'][0]['uci'],'e2e4')
    def test_cancel_and_expire_challenges(self):
        a,ua=self.member('Cancel');b,ub=self.member('Target');befriend(a,b)
        ch=a.post('/api/challenges',json={'recipient_id':ub['id'],'base':0}).json()['challenge']
        self.assertEqual(a.post('/api/challenges/'+ch['id']+'/cancel',json={}).status_code,200)
        self.assertEqual(b.post('/api/challenges/'+ch['id']+'/reply',json={'accept':True}).status_code,409)
        ch=a.post('/api/challenges',json={'recipient_id':ub['id'],'base':0}).json()['challenge']
        with server.lock:server.db.execute('UPDATE challenges SET expires=? WHERE id=?',(time.time()-1,ch['id']))
        self.assertEqual(b.get('/api/challenges').json()['challenges'],[])
        self.assertEqual(a.get('/api/games/'+ch['game_id']).json()['status'],'finished')
    def test_theme_validation_sharing_and_preferences(self):
        c,u=self.member('Themes');other,_=self.member('ThemeFriend')
        pack={'name':'Prova','site':{'bg':'#101820','accent':'#eebb77'},'board':{'light':'#eebb77','dark':'#447755'},'radius':8,'font':'serif','pieceStyle':'ink'}
        r=c.post('/api/themes',json={'pack':pack});self.assertEqual(r.status_code,200,r.text);tid=r.json()['id']
        self.assertEqual(other.get('/api/themes/'+tid).json()['name'],'Prova')
        self.assertEqual(c.post('/api/preferences',json={'theme':pack,'animations':False}).status_code,200)
        self.assertFalse(c.get('/api/preferences').json()['preferences']['animations'])
        for bad in [dict(pack,site={'bg':'url(https://evil.example)'}),dict(pack,site={'onclick':'#ffffff'}),dict(pack,radius=100),dict(pack,pieceStyle='<script>')]:
            self.assertEqual(c.post('/api/themes',json={'pack':bad}).status_code,400)
        self.assertEqual(c.get('/api/themes').status_code,200)
