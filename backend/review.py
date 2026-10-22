"""Position reuse, context-sensitive move review and offline opening recognition."""
import hashlib,json,math,time
from collections import OrderedDict,Counter
from pathlib import Path
import chess,chess.engine,chess.syzygy

VERSION='review-2026-10-v3-nodes-tb4'
PROFILES={'quick':{'time':.30,'refine':.70,'nodes':60000,'refine_nodes':180000},'deep':{'time':1.20,'refine':2.0,'nodes':300000,'refine_nodes':600000}}
BOOK=json.loads((Path(__file__).parent/'vendor/openings/index.json').read_text())

SYZYGY_PATH=Path(__file__).parent/'vendor/syzygy'
TABLEBASE=chess.syzygy.open_tablebase(str(SYZYGY_PATH)) if (SYZYGY_PATH/'manifest.json').exists() else None
def tablebase_position(board):
    if TABLEBASE is None or len(board.piece_map())>4 or board.castling_rights:return None
    try:return {'wdl':TABLEBASE.probe_wdl(board),'dtz':TABLEBASE.probe_dtz(board)}
    except (KeyError,ValueError,OSError):return None

def position_key(board):return ' '.join(board.fen().split()[:4])
def opening_move(board,move):
    if board.ply()>=40 or move.uci() not in BOOK['moves'].get(position_key(board),[]):return None
    after=board.copy(stack=False);after.push(move)
    return BOOK['positions'].get(position_key(after)) or BOOK['positions'].get(position_key(board)) or {'eco':'','name':'Linea teorica di apertura'}

def win_percent(cp):
    return 100/(1+math.exp(-.00368208*max(-100000,min(100000,cp))))

def accuracy(loss):return 100 if loss<=0 else max(0,min(100,103.1668*math.exp(-.04354*max(0,loss))-3.1669))

def classify_move(best_cp,played_cp,played,best,*,book=False,brilliant=False):
    loss=max(0,win_percent(best_cp)-win_percent(played_cp));cp_loss=max(0,best_cp-played_cp)
    if brilliant and loss<=1.5:return 'brilliant'
    if book and loss<=7 and cp_loss<=80:return 'book'
    if played==best or cp_loss<=12 and loss<=1.8:return 'best'
    if loss<=2:return 'excellent'
    if loss<=7:return 'good'
    if loss<=14:return 'inaccuracy'
    if loss<=24:return 'mistake'
    return 'blunder'

def summary(rows):
    out={}
    for color,name in [(True,'white'),(False,'black')]:
        own=[r for r in rows if r['color']==color];scores=[r['accuracy'] for r in own if not r.get('forced')]
        # Mean move accuracy: forced replies are excluded, and one error does
        # not overwhelm every other move in a long game.
        precision=round(sum(scores)/len(scores),1) if scores else None
        out[name]={'accuracy':precision,'moves':len(own),'counts':dict(Counter(r['label'] for r in own))}
    return out

def material(board,color):
    values={chess.PAWN:1,chess.KNIGHT:3,chess.BISHOP:3,chess.ROOK:5,chess.QUEEN:9,chess.KING:0}
    return sum(values[p.piece_type]*(1 if p.color==color else -1) for p in board.piece_map().values())

def score_object(evaluation,color):
    if evaluation['mate'] is None:value=chess.engine.Cp(evaluation['cp'])
    elif evaluation['mate']==0:value=chess.engine.MateGiven if evaluation['cp']>0 else chess.engine.Mate(0)
    else:value=chess.engine.Mate(evaluation['mate'])
    return chess.engine.PovScore(value,chess.WHITE).pov(color)

class ReviewService:
    def __init__(self,engine,db,lock,before_search=lambda:None):
        self.engine,self.db,self.lock,self.before_search=engine,db,lock,before_search
        self.memory=OrderedDict();self.sessions=OrderedDict();self.hits=0;self.searches=0;self.writes=0
        with lock:
            db.execute('CREATE TABLE IF NOT EXISTS review_positions(key TEXT PRIMARY KEY,data TEXT,touched REAL)')
            db.execute('CREATE INDEX IF NOT EXISTS review_touched ON review_positions(touched)')
            # A bounded disk cache survives restarts and contains positions only.
            db.execute('DELETE FROM review_positions WHERE key IN (SELECT key FROM review_positions ORDER BY touched DESC LIMIT -1 OFFSET 20000)')
    def key(self,board,mode):
        # Retain reversible history and the half-move clock, so repeated boards
        # with different draw rights never share an evaluation incorrectly.
        probe=board.copy(stack=True);history=[]
        while probe.move_stack:
            move=probe.pop();history.append(move.uci())
            if probe.is_irreversible(move):break
        raw=[VERSION,self.engine.id.get('name','Stockfish'),str(self.engine.options.get('EvalFile','embedded')) if hasattr(self.engine,'options') else 'embedded',board.fen(),history]
        return hashlib.sha256(json.dumps(raw,separators=(',',':')).encode()).hexdigest()
    def evaluate(self,board,mode='quick',refine=False,cache_only=False):
        key=self.key(board,mode);budget=PROFILES[mode]['refine' if refine else 'time'];target=PROFILES[mode]['refine_nodes' if refine else 'nodes'];exact=tablebase_position(board)
        if exact is not None:target=10000;budget=min(budget,.12)
        cached=self.memory.get(key)
        if cached is None:
            with self.lock:row=self.db.execute('SELECT data FROM review_positions WHERE key=?',(key,)).fetchone()
            if row:cached=json.loads(row['data'])
        if cached and (cache_only or cached.get('terminal') or cached.get('nodes',0)>=target*.95 or cached.get('mate') is not None and not cached.get('bound') or cached.get('target_nodes',0)>=target and time.time()-cached.get('searched_at',0)<120):
            self.hits+=1;self.memory[key]=cached;self.memory.move_to_end(key)
            if len(self.memory)>1024:self.memory.popitem(last=False)
            return cached
        if cache_only:raise RuntimeError('Missing review position during finalization')
        result=board.outcome(claim_draw=False)
        if result:
            cp=0 if result.winner is None else 100000 if result.winner else -100000
            value={'cp':cp,'mate':None if result.winner is None else 0,'depth':0,'nodes':0,'pv':[],'budget':99,'terminal':True,'complete':True,'target_nodes':target,'wdl':{'wins':1000 if cp>0 else 0,'draws':1000 if cp==0 else 0,'losses':1000 if cp<0 else 0}}
        else:
            self.before_search();self.searches+=1
            limit=chess.engine.Limit(time=budget,nodes=target)
            flags=chess.engine.INFO_SCORE|chess.engine.INFO_PV|chess.engine.INFO_BASIC
            if hasattr(self.engine,'analysis'):
                # python-chess's aggregate info can retain a bound flag from an
                # earlier iteration. Track complete score reports explicitly.
                data={};completed=None
                with self.engine.analysis(board,limit,game=VERSION,info=flags) as stream:
                    for report in stream:
                        if 'score' in report:
                            data.pop('lowerbound',None);data.pop('upperbound',None)
                        data.update(report)
                        if 'score' in report and not (report.get('lowerbound') or report.get('upperbound')):completed=dict(data)
                    bestmove=stream.wait().move
                if completed:
                    for field in ('score','pv','wdl','depth'):
                        if field in completed:data[field]=completed[field]
                    data.pop('lowerbound',None);data.pop('upperbound',None)
                    if bestmove and data.get('pv') and bestmove!=data['pv'][0]:data['lowerbound']=True
            else:data=self.engine.analyse(board,limit,game=VERSION,info=flags)
            white=data['score'].white();native=data.get('wdl');wdl=native.white() if native else None
            value={'cp':white.score(mate_score=100000),'mate':white.mate(),'depth':data.get('depth',0),'nodes':data.get('nodes',0),'pv':[m.uci() for m in data.get('pv',[])[:10]],'budget':budget,'terminal':False,'target_nodes':target,'searched_at':time.time(),'complete':(data.get('nodes',0)>=target*.95 or white.mate() is not None) and not (data.get('upperbound') or data.get('lowerbound')),'bound':bool(data.get('upperbound') or data.get('lowerbound')),'search_time':data.get('time',0),'hashfull':data.get('hashfull',0),'tablebase':exact is not None and data.get('tbhits',0)>0,'tbhits':data.get('tbhits',0),'wdl':{'wins':wdl.wins,'draws':wdl.draws,'losses':wdl.losses} if wdl else None}
        self.memory[key]=value;self.memory.move_to_end(key)
        if len(self.memory)>1024:self.memory.popitem(last=False)
        with self.lock:self.db.execute('INSERT INTO review_positions VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,touched=excluded.touched',(key,json.dumps(value,separators=(',',':')),time.time()))
        self.writes+=1
        if self.writes%128==0:
            with self.lock:self.db.execute('DELETE FROM review_positions WHERE key IN (SELECT key FROM review_positions ORDER BY touched DESC LIMIT -1 OFFSET 20000)')
        return value
    def board(self,g,index):
        identity=(g['id'],g['initial_fen'],tuple(g['moves']))
        session=self.sessions.get(identity)
        if session and session[0]==index:board=session[1]
        else:
            board=chess.Board(g['initial_fen'])
            for uci in g['moves'][:index]:board.push_uci(uci)
        self.sessions[identity]=(index,board);self.sessions.move_to_end(identity)
        if len(self.sessions)>16:self.sessions.popitem(last=False)
        return identity,board
    def analyse(self,g,explain,cache_only=False,previous=None):
        index=len(g.get('analysis',[]));identity,b=self.board(g,index);played=chess.Move.from_uci(g['moves'][index]);color=b.turn;mode=g.get('analysis_mode','quick')
        if mode not in PROFILES:mode='quick'
        after=b.copy(stack=True);after.push(played);hits,searches=self.hits,self.searches
        main=self.evaluate(b,mode,cache_only=cache_only);actual=self.evaluate(after,mode,cache_only=cache_only)
        signature=hashlib.sha256(json.dumps([main,actual],sort_keys=True,separators=(',',':')).encode()).hexdigest()
        if cache_only and previous and previous.get('evaluation_signature')==signature:
            self.sessions[identity]=(index+1,after);return dict(previous)
        sign=1 if color else -1;best_cp=main['cp']*sign;played_cp=actual['cp']*sign
        delta=max(0,win_percent(best_cp)-win_percent(played_cp));legal_count=b.legal_moves.count()
        best=chess.Move.from_uci(main['pv'][0]) if main['pv'] else played
        # Review boundary cases and material sacrifices more carefully. Reuse
        # the resulting stronger search instead of discarding it on the next ply.
        sacrifice_candidate=False
        pvboard=b.copy(stack=True);baseline=material(b,color)
        for uci in main['pv'][:2]:
            m=chess.Move.from_uci(uci)
            if m not in pvboard.legal_moves:break
            pvboard.push(m)
            if pvboard.turn==color and baseline-material(pvboard,color)>=2:sacrifice_candidate=True
        boundary=any(abs(delta-cut)<.8 for cut in (7,14,24))
        if (main.get('bound') or actual.get('bound') or delta>=14 or played!=best and (boundary or delta>7 and (main['mate'] is None)!=(actual['mate'] is None)) or sacrifice_candidate and played==best and delta<=3 and main['mate'] is None) and legal_count>1:
            main=self.evaluate(b,mode,True,cache_only);actual=self.evaluate(after,mode,True,cache_only)
            best_cp=main['cp']*sign;played_cp=actual['cp']*sign
            best=chess.Move.from_uci(main['pv'][0]) if main['pv'] else played
        if played==best:played_cp=best_cp
        loss=max(0,best_cp-played_cp);chance_loss=max(0,win_percent(best_cp)-win_percent(played_cp))
        pvboard=b.copy(stack=True);pv=[];pvfens=[];sacrifice=False;baseline=material(b,color)
        for n,uci in enumerate(main['pv'][:8]):
            m=chess.Move.from_uci(uci)
            if m not in pvboard.legal_moves:break
            pv.append(pvboard.san(m));pvboard.push(m);pvfens.append(pvboard.fen())
            if n<2 and pvboard.turn==color and baseline-material(pvboard,color)>=2:sacrifice=True
        brilliant=main.get('complete',True) and actual.get('complete',True) and played==best and legal_count>1 and sacrifice and chance_loss<=1.5 and best_cp>=-50 and not after.is_checkmate()
        opening=opening_move(b,played)
        label=classify_move(best_cp,played_cp,played.uci(),best.uci(),book=bool(opening),brilliant=brilliant)
        best_san,explanation=explain(b,best,pv,score_object(main,color),score_object(actual,color))
        if opening and label=='book':explanation='Mossa da manuale nel repertorio: '+opening['name']+(' ('+opening['eco']+')' if opening['eco'] else '')+'. '+explanation
        signature=hashlib.sha256(json.dumps([main,actual],sort_keys=True,separators=(',',':')).encode()).hexdigest()
        self.sessions[identity]=(index+1,after)
        return {'evaluation_signature':signature,'index':index,'color':color,'san':b.san(played),'uci':played.uci(),'before_fen':b.fen(),'after_fen':after.fen(),'best_uci':best.uci(),'best_san':best_san,'label':label,'loss':loss,'cp':actual['cp'],'mate':actual['mate'],'best_cp':main['cp'],'best_mate':main['mate'],'win_loss':round(chance_loss,3),'accuracy':round(accuracy(chance_loss),2),'forced':legal_count==1,'opening':opening,'pv':pv,'pv_fens':pvfens,'explanation':explanation,'depth':main['depth'],'played_depth':actual['depth'],'cache_hits':self.hits-hits,'searches':self.searches-searches,'method':VERSION,'nodes':main['nodes'],'played_nodes':actual['nodes'],'target_nodes':main.get('target_nodes',0),'complete':main.get('complete',True) and actual.get('complete',True),'wdl':actual.get('wdl'),'search_time':main.get('search_time',0),'hashfull':main.get('hashfull',0),'tablebase':bool(main.get('tablebase')),'tbhits':main.get('tbhits',0)}

    def finalize(self,g,explain):
        # A child position may have been deepened on the next ply. Reconcile all
        # labels against the final cache without issuing any engine search.
        snapshot={**g,'analysis':[]};self.sessions.clear()
        for previous in g['analysis']:
            row=self.analyse(snapshot,explain,cache_only=True,previous=previous)
            row.update(cache_hits=previous['cache_hits'],searches=previous['searches'])
            snapshot['analysis'].append(row)
        return snapshot['analysis']
