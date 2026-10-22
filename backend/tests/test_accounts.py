import os, tempfile, unittest, secrets, time, json
from concurrent.futures import ThreadPoolExecutor
os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='accounts-test-')
os.environ['COOKIE_SECURE']='0'
from fastapi.testclient import TestClient
import server
from helpers import clear_limits,befriend

class AccountsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin=TestClient(server.app,headers={'X-Club':'1'})
        # Other tests may already have an owner in the same temporary database.
        if server.has_owner():
            r=cls.admin.post('/api/login',json={'name':'TestOwner','password':'Test-password-123'})
        else:
            r=cls.admin.post('/api/register',json={'name':'AccountOwner','password':'Owner-password-123','setup_token':server.setup_token})
        assert r.status_code==200,r.text
        cls.owner_name=cls.admin.get('/api/me').json()['user']['name']
    def setUp(self): clear_limits()
    def client(self): return TestClient(server.app,headers={'X-Club':'1'})
    def invite(self): return self.admin.post('/api/invites',json={}).json()['code']
    def register(self,name,code=None):
        c=self.client();r=c.post('/api/register',json={'name':name,'password':'Member-password-123','invite':code or self.invite()});self.assertEqual(r.status_code,200,r.text);return c
    def test_open_registration_and_reserved_admin(self):
        c=self.client()
        self.assertEqual(c.post('/api/register',json={'name':'PublicMember','password':'Member-password-123'}).status_code,200)
        self.assertFalse(c.get('/api/me').json()['user']['admin'])
        self.assertEqual(self.client().post('/api/register',json={'name':'SecondOwner','password':'Member-password-123','setup_token':server.setup_token}).status_code,403)
        self.assertEqual(c.post('/api/guest',json={'name':'GuestAgain'}).status_code,405)
        self.assertEqual(c.post('/api/invites',json={}).status_code,403)
        self.assertEqual(self.client().post('/api/register',json={'name':'publicmember','password':'Member-password-123'}).status_code,409)
    def test_legacy_invitations_are_optional(self):
        code=self.invite();key=server.hashlib.sha256(code.encode()).hexdigest()
        self.assertEqual(self.admin.post('/api/invites/'+key+'/revoke',json={}).status_code,200)
        self.assertFalse(self.client().get('/api/invite-info',params={'code':code}).json()['valid'])
        self.assertEqual(self.client().post('/api/register',json={'name':'OpenEvenWithOldInvite','password':'Member-password-123','invite':code}).status_code,200)

    def test_login_devices_password_and_logout(self):
        first=self.register('MultipleDevices');uid=first.get('/api/me').json()['user']['id']
        game=first.post('/api/games',json={'kind':'friend','base':0}).json()
        second=self.client()
        self.assertEqual(second.post('/api/login',json={'name':'multipledevices','password':'Wrong-password-123'}).status_code,401)
        self.assertEqual(second.post('/api/login',json={'name':'multipledevices','password':'Member-password-123'}).status_code,200)
        self.assertEqual(second.get('/api/me').json()['user']['id'],uid)
        self.assertEqual(second.get('/api/lobby').json()['games'][0]['id'],game['id'])
        self.assertEqual(first.post('/api/password',json={'current_password':'Wrong-password-123','new_password':'New-password-123'}).status_code,403)
        self.assertEqual(first.post('/api/password',json={'current_password':'Member-password-123','new_password':'New-password-123'}).status_code,200)
        self.assertIsNone(second.get('/api/me').json()['user'])
        self.assertEqual(second.post('/api/login',json={'name':'MultipleDevices','password':'Member-password-123'}).status_code,401)
        self.assertEqual(second.post('/api/login',json={'name':'MultipleDevices','password':'New-password-123'}).status_code,200)
        self.assertEqual(second.post('/api/logout',json={}).status_code,200)
        self.assertIsNone(second.get('/api/me').json()['user'])
        self.assertIsNotNone(first.get('/api/me').json()['user'])
        stored=server.db.execute('SELECT password FROM users WHERE id=?',(uid,)).fetchone()[0]
        self.assertTrue(stored.startswith('scrypt:'));self.assertNotIn('New-password-123',stored)
    def test_guest_migration_preserves_identity_games(self):
        c=self.client();uid=secrets.token_hex(12)
        with server.lock:
            server.db.execute('INSERT INTO users(id,name,password,admin,created) VALUES(?,?,?,?,?)',(uid,'OldGuest','',0,time.time()))
            response=server.Response();server.login_cookie(response,uid)
            raw=response.headers['set-cookie'].split('club_session=')[1].split(';')[0]
        c.cookies.set('club_session',raw)
        self.assertEqual(c.get('/api/me').json()['legacy_name'],'OldGuest')
        self.assertEqual(c.get('/api/lobby').status_code,401)
        gid=secrets.token_urlsafe(12)
        with server.lock:
            server.save({'id':gid,'kind':'friend','elo':1600,'white':uid,'black':None,'status':'waiting','moves':[],'initial_fen':server.chess.STARTING_FEN,'result':'*','reason':'','created':time.time(),'last':time.time(),'base':0,'increment':0,'clocks':[0,0],'analysis':[],'analysis_status':'idle','draw_offer':None})
        r=c.post('/api/register',json={'name':'MigratedMember','password':'Member-password-123','invite':self.invite()})
        self.assertEqual(r.status_code,200,r.text);self.assertTrue(r.json()['migrated'])
        self.assertEqual(c.get('/api/me').json()['user']['id'],uid)
        self.assertEqual(c.get('/api/games/'+gid).status_code,200)
        self.assertEqual(server.get_game(gid)['white'],uid)
    def test_rate_limits(self):
        c=self.client()
        for _ in range(15): self.assertEqual(c.post('/api/login',json={'name':'Unknown','password':'Wrong-password-123'}).status_code,401)
        self.assertEqual(c.post('/api/login',json={'name':'Unknown','password':'Wrong-password-123'}).status_code,429)
        clear_limits()

if __name__=='__main__':unittest.main(verbosity=2)
