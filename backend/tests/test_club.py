import tempfile, os, time, unittest, json
os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='chess-test-')
os.environ['COOKIE_SECURE']='0'
from fastapi.testclient import TestClient
import server
from helpers import clear_limits,befriend

class ClubTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        clear_limits()
        cls.owner=TestClient(server.app,headers={'X-Club':'1'})
        cls.owner.__enter__()
        cls.friend=TestClient(server.app,headers={'X-Club':'1'})
        cls.other=TestClient(server.app,headers={'X-Club':'1'})
        for c,n in [(cls.owner,'TestOwner'),(cls.friend,'TestFriend'),(cls.other,'TestOther')]:
            if c is cls.owner and server.has_owner():
                assert c.post('/api/login',json={'name':'AccountOwner','password':'Owner-password-123'}).status_code==200
                continue
            fields={'name':n,'password':'Test-password-123'}
            if c is cls.owner: fields['setup_token']=server.setup_token
            else: fields['invite']=cls.owner.post('/api/invites',json={}).json()['code']
            assert c.post('/api/register',json=fields).status_code==200
        befriend(cls.owner,cls.friend)
    @classmethod
    def tearDownClass(cls): cls.owner.__exit__(None,None,None)
    def friend_game(self):
        befriend(self.owner,self.friend)
        g=self.owner.post('/api/games',json={'kind':'friend','base':0}).json()
        self.assertEqual(g['status'],'waiting')
        joined=self.friend.post('/api/games/'+g['id']+'/join',json={})
        self.assertEqual(joined.status_code,200)
        return g['id']
    def play(self,gid,moves):
        for i,m in enumerate(moves):
            c=self.owner if i%2==0 else self.friend
            r=c.post('/api/games/'+gid+'/move',json={'uci':m,'expected_ply':i})
            self.assertEqual(r.status_code,200,r.text)
        return r.json()
    def test_friends_authorization_and_checkmate(self):
        gid=self.friend_game()
        self.assertEqual(self.other.get('/api/games/'+gid).status_code,403)
        self.assertEqual(self.other.post('/api/games/'+gid+'/join',json={}).status_code,409)
        self.assertEqual(self.friend.post('/api/games/'+gid+'/move',json={'uci':'e7e5','expected_ply':0}).status_code,403)
        self.assertEqual(self.owner.post('/api/games/'+gid+'/move',json={'uci':'e2e5','expected_ply':0}).status_code,400)
        g=self.play(gid,['f2f3','e7e5','g2g4','d8h4'])
        self.assertEqual((g['status'],g['result'],g['reason']),('finished','0-1','Scacco matto'))
        self.assertIn('Qh4#',self.owner.get('/api/games/'+gid+'/pgn').text)
        self.assertEqual(self.owner.post('/api/games/'+gid+'/analysis',json={}).status_code,200)
        for _ in range(120):
            g=self.owner.get('/api/games/'+gid).json()
            if g['analysis_status'] in ('done','error'): break
            time.sleep(.1)
        self.assertEqual(g['analysis_status'],'done',g)
        self.assertEqual(len(g['analysis']),4)
        self.assertEqual(g['analysis'][2]['label'],'blunder')
        self.assertEqual(g['analysis'][3]['best_san'],'Qh4#')
        self.assertTrue(g['analysis'][2]['explanation'])
    def test_special_moves(self):
        g=self.play(self.friend_game(),['e2e4','a7a6','e4e5','d7d5','e5d6'])
        b=server.chess.Board(g['fen'])
        self.assertIsNone(b.piece_at(server.chess.D5))
        self.assertEqual(b.piece_at(server.chess.D6).symbol(),'P')
        g=self.play(self.friend_game(),['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','e1g1'])
        b=server.chess.Board(g['fen'])
        self.assertEqual(b.piece_at(server.chess.G1).symbol(),'K')
        self.assertEqual(b.piece_at(server.chess.F1).symbol(),'R')
    def test_promotion_and_stale_move(self):
        gid=self.friend_game()
        with server.lock:
            g=server.get_game(gid);g['initial_fen']='7k/P7/8/8/8/8/8/K7 w - - 0 1';server.save(g)
        g=self.play(gid,['a7a8n'])
        self.assertEqual(server.chess.Board(g['fen']).piece_at(server.chess.A8).symbol(),'N')
        gid=self.friend_game();self.play(gid,['e2e4'])
        r=self.friend.post('/api/games/'+gid+'/move',json={'uci':'e7e5','expected_ply':0})
        self.assertEqual(r.status_code,409)
    def test_clocks_draw_and_csrf(self):
        g=self.owner.post('/api/games',json={'kind':'friend','base':180,'increment':2}).json();gid=g['id']
        self.friend.post('/api/games/'+gid+'/join',json={})
        with server.lock:
            g=server.get_game(gid);g['last']=time.time()-181;server.save(g)
        g=self.owner.get('/api/games/'+gid).json()
        self.assertEqual((g['status'],g['result']),('finished','0-1'))
        gid=self.friend_game()
        self.owner.post('/api/games/'+gid+'/draw',json={})
        g=self.friend.post('/api/games/'+gid+'/draw',json={}).json()
        self.assertEqual(g['result'],'1/2-1/2')
        self.assertEqual(self.owner.post('/api/login',json={'name':'intruder','password':'Wrong-password-123'},headers={'Origin':'https://other.example'}).status_code,403)
        self.assertEqual(TestClient(server.app).post('/api/login',json={'name':'intruder','password':'Wrong-password-123'}).status_code,403)
    def test_import_and_bot_elo(self):
        pgn='[Event "Test"]\n\n1. e4 e5 2. Nf3 Nc6 *'
        r=self.owner.post('/api/import',json={'pgn':pgn});self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['ply'],4)
        self.assertEqual(self.owner.post('/api/import',json={'pgn':'nonsense'}).status_code,400)
        self.assertEqual(self.owner.post('/api/games',json={'elo':199}).status_code,400)
        # Close waiting test games so the live-game limit does not hide the bot test.
        with server.lock:
            for row in server.db.execute('SELECT data FROM games').fetchall():
                g=json.loads(row['data'])
                if g['status'] in ('active','waiting'): server.finish(g,'*','Test concluso')
        self.assertEqual(self.owner.post('/api/games',json={'elo':3191}).status_code,400)
        for elo in (200,800,1310,1320,3190):
            r=self.owner.post('/api/games',json={'kind':'bot','elo':elo,'color':'black','base':0})
            self.assertEqual(r.status_code,200,r.text)
            g=r.json();gid=g['id']
            for _ in range(100):
                g=self.owner.get('/api/games/'+gid).json()
                if g['ply'] or g['bot_error']: break
                time.sleep(.1)
            self.assertEqual(g['ply'],1,g)
            self.assertEqual(g['elo'],elo)
            self.assertIsNone(g['bot_error'])
            # Also exercise a second engine turn after a human move.
            human=g['legal'][0]
            self.assertEqual(self.owner.post('/api/games/'+gid+'/move',json={'uci':human,'expected_ply':1}).status_code,200)
            for _ in range(100):
                g=self.owner.get('/api/games/'+gid).json()
                if g['ply']==3 or g['bot_error']: break
                time.sleep(.1)
            self.assertEqual(g['ply'],3,g)
            self.owner.post('/api/games/'+gid+'/resign',json={})

if __name__=='__main__': unittest.main(verbosity=2)
