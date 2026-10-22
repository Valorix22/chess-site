import io,json,os,secrets,sqlite3,tempfile,threading,time,unittest
from unittest.mock import patch
import chess,chess.engine
from review import ReviewService,VERSION,accuracy,classify_move,opening_move,summary,win_percent
if 'server' not in __import__('sys').modules:os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='review-test-')
import server
from helpers import clear_limits,befriend
from fastapi.testclient import TestClient

class ReviewCriteriaTest(unittest.TestCase):
 def test_context_instead_of_fixed_centipawns(self):
  self.assertEqual(classify_move(30,-300,'a','b'),'blunder')
  self.assertIn(classify_move(1500,1200,'a','b'),('best','excellent'))
  self.assertEqual(classify_move(20,18,'a','b'),'best')
  self.assertEqual(classify_move(20,-900,'a','b',book=True),'blunder')
  self.assertEqual(classify_move(70,20,'a','b',book=True),'book')
  self.assertEqual(classify_move(10,10,'a','a',brilliant=True),'brilliant')
  self.assertEqual(classify_move(-10,-100000,'a','b'),'blunder')
  self.assertGreater(accuracy(1),accuracy(12));self.assertEqual(accuracy(0),100)
 def test_openings_and_transposition(self):
  b=chess.Board();self.assertIsNotNone(opening_move(b,chess.Move.from_uci('e2e4')))
  for uci in ['e2e4','e7e5','g1f3']:b.push_uci(uci)
  self.assertEqual(opening_move(b,chess.Move.from_uci('d7d6'))['eco'],'C41')
  self.assertIn('Damiano',opening_move(b,chess.Move.from_uci('f7f6'))['name'])
  # A named opening may still be a bad move; engine quality gates override it.
  self.assertEqual(classify_move(20,-250,'f7f6','b8c6',book=True),'mistake')
  a=chess.Board();b=chess.Board()
  for uci in ['d2d4','g8f6','g1f3','d7d5']:a.push_uci(uci)
  for uci in ['g1f3','d7d5','d2d4','g8f6']:b.push_uci(uci)
  m=chess.Move.from_uci('c2c4');self.assertEqual(opening_move(a,m),opening_move(b,m));self.assertIsNotNone(opening_move(a,m))
 def test_mean_accuracy_and_forced_exclusion(self):
  rows=[{'color':True,'accuracy':90,'label':'good'},{'color':True,'accuracy':0,'label':'blunder','forced':True}]
  self.assertEqual(summary(rows)['white']['accuracy'],90)
  self.assertIsNone(summary(rows)['black']['accuracy'])
  self.assertEqual(summary(rows)['white']['counts']['blunder'],1)
 def test_shallow_best_move_does_not_mask_a_tactical_error(self):
  class Engine:
   id={'name':'Horizon Test'}
   def analyse(self,b,limit,**kwargs):
    # The first search recommends e4; looking at the child exposes a tactical
    # loss. The deeper root search must be allowed to correct that preference.
    if b.ply():cp=-900;move=next(iter(b.legal_moves))
    else:cp=0;move=chess.Move.from_uci('d2d4' if limit.nodes>60000 else 'e2e4')
    return {'score':chess.engine.PovScore(chess.engine.Cp(cp),chess.WHITE),'depth':12,'pv':[move]}
  db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row;s=ReviewService(Engine(),db,threading.RLock())
  row=s.analyse({'id':'horizon','initial_fen':chess.STARTING_FEN,'moves':['e2e4'],'analysis':[]},server.explain)
  self.assertEqual(row['label'],'blunder');self.assertEqual(row['best_uci'],'d2d4')
 def test_cache_draw_rights_and_persistence(self):
  class Engine:
   id={'name':'Test Engine'}
   calls=0
   def analyse(self,b,*args,**kwargs):
    self.calls+=1;return {'score':chess.engine.PovScore(chess.engine.Cp(10),chess.WHITE),'depth':12,'pv':[next(iter(b.legal_moves))]}
  e=Engine();db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row;s=ReviewService(e,db,threading.RLock());b=chess.Board()
  v=s.evaluate(b);self.assertEqual(e.calls,1);self.assertEqual(s.evaluate(b),v);self.assertEqual(e.calls,1)
  s2=ReviewService(e,db,threading.RLock());self.assertEqual(s2.evaluate(b),v);self.assertEqual(e.calls,1)
  s2.evaluate(b,refine=True);self.assertEqual(e.calls,2)
  other=b.copy();other.halfmove_clock=99;self.assertNotEqual(s.key(b,'quick'),s.key(other,'quick'))
  other=b.copy()
  for uci in ['g1f3','g8f6','f3g1','f6g8']:other.push_uci(uci)
  plain=chess.Board(other.fen());self.assertNotEqual(s.key(plain,'quick'),s.key(other,'quick'))
  mate=chess.Board('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');self.assertEqual(s.evaluate(mate)['mate'],0);self.assertEqual(e.calls,2)

class ReviewAPITest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.c=TestClient(server.app,headers={'X-Club':'1'});cls.c.__enter__()
  if server.has_owner():r=cls.c.post('/api/login',json={'name':'AccountOwner','password':'Owner-password-123'})
  else:r=cls.c.post('/api/register',json={'name':'AccountOwner','password':'Owner-password-123','setup_token':server.setup_token})
  assert r.status_code==200,r.text
 @classmethod
 def tearDownClass(cls):cls.c.__exit__(None,None,None)
 def setUp(self):clear_limits()
 def wait(self,gid):
  for _ in range(180):
   g=self.c.get('/api/games/'+gid).json()
   if g['analysis_status'] in ('done','error'):break
   time.sleep(.1)
  self.assertEqual(g['analysis_status'],'done',g);return g
 def test_profiles_cache_generations_and_auth(self):
  g=self.c.post('/api/import',json={'pgn':'1. f3 e5 2. g4 Qh4# 0-1'}).json();gid=g['id'];url='/api/games/'+gid+'/analysis'
  other=TestClient(server.app,headers={'X-Club':'1'});other.post('/api/register',json={'name':'Review'+secrets.token_hex(3),'password':'Review-password-123'})
  self.assertEqual(other.post(url,json={}).status_code,403)
  self.assertEqual(self.c.post(url,json={'mode':'invalid'}).status_code,400)
  self.assertEqual(self.c.post(url,json={}).status_code,200);g=self.wait(gid)
  self.assertEqual(g['analysis_version'],VERSION);self.assertEqual(g['analysis'][2]['label'],'blunder');self.assertEqual(g['analysis'][3]['best_san'],'Qh4#')
  self.assertIsNotNone(g['analysis_summary']['white']['accuracy']);run=g['analysis_run']
  self.c.post(url,json={});self.assertEqual(self.c.get('/api/games/'+gid).json()['analysis_run'],run)
  self.c.post(url,json={'force':True});warm=self.wait(gid)
  self.assertNotEqual(warm['analysis_run'],run);self.assertEqual(warm['analysis_searches'],0)
  self.assertEqual([r['label'] for r in g['analysis']],[r['label'] for r in warm['analysis']])
  self.c.post(url,json={'mode':'deep'});deep=self.wait(gid);self.assertEqual(deep['analysis_mode'],'deep');self.assertGreater(deep['analysis_searches'],0)
  self.assertEqual(server.analysis_engine.options['UCI_Elo'].min,1320)
 def test_resume_after_engine_failure(self):
  g=self.c.post('/api/import',json={'pgn':'1. e4 e5 2. Nf3 Nc6 *'}).json();gid=g['id'];url='/api/games/'+gid+'/analysis'
  with patch.object(server,'analyse_ply',side_effect=RuntimeError('simulated engine failure')):
   self.c.post(url,json={})
   for _ in range(50):
    failed=self.c.get('/api/games/'+gid).json()
    if failed['analysis_status']=='error':break
    time.sleep(.05)
   self.assertEqual(failed['analysis_status'],'error')
  self.c.post(url,json={});resumed=self.wait(gid)
  self.assertEqual(resumed['analysis_run'],failed['analysis_run']);self.assertEqual(len(resumed['analysis']),4)
 def test_classic_clocks_and_challenges(self):
  friend=TestClient(server.app,headers={'X-Club':'1'});friend.post('/api/register',json={'name':'Classic'+secrets.token_hex(3),'password':'Review-password-123'});u=friend.get('/api/me').json()['user'];befriend(self.c,friend)
  for base in [60,180,300,600,900,1800,2700,3600,5400]:
   # Test create/join directly to avoid challenge spam limits across all controls.
   if base==60:
    r=self.c.post('/api/challenges',json={'recipient_id':u['id'],'base':base,'increment':0,'color':'white'})
    self.assertEqual(r.status_code,200,r.text);cid=r.json()['challenge']['id'];self.c.post('/api/challenges/'+cid+'/cancel',json={})
   g=self.c.post('/api/games',json={'kind':'friend','base':base,'increment':0,'color':'white'}).json();gid=g['id']
   self.assertEqual(friend.post('/api/games/'+gid+'/join',json={}).status_code,200)
   with server.lock:
    saved=server.get_game(gid);saved['last']=time.time()-2;server.save(saved)
   g=self.c.post('/api/games/'+gid+'/move',json={'uci':'e2e4','expected_ply':0}).json()
   self.assertLess(g['clocks'][1],base-1.9);self.assertEqual(g['increment'],0)
   self.assertIn('TimeControl "'+str(base)+'+0"',self.c.get('/api/games/'+gid+'/pgn').text)
   self.assertEqual(self.c.post('/api/games/'+gid+'/analysis',json={}).status_code,400)
   self.c.post('/api/games/'+gid+'/resign',json={})

class SmallTablebaseTest(unittest.TestCase):
 def test_installed_tables_checksums_and_exact_outcomes(self):
  import hashlib
  from review import SYZYGY_PATH,tablebase_position
  manifest=json.loads((SYZYGY_PATH/'manifest.json').read_text());self.assertEqual(len(manifest['files']),70)
  for entry in manifest['files']:
   raw=(SYZYGY_PATH/entry['name']).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),entry['sha256'])
  for fen,expected in [('7k/8/4K3/8/8/8/Q7/8 w - - 0 1',2),('7k/8/4K3/8/8/8/Q7/8 b - - 0 1',-2),('7k/8/4K3/8/8/8/NN6/8 w - - 0 1',0)]:
   b=server.chess.Board(fen);self.assertTrue(b.is_valid());self.assertEqual(tablebase_position(b)['wdl'],expected)
