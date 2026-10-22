"""Build the local CC0 opening index from the pinned TSV sources."""
from pathlib import Path
import csv,io,json,sys,chess,chess.pgn
root=Path(__file__).resolve().parent.parent/'vendor'/'openings'
positions={};moves={};lines=0
key=lambda b:' '.join(b.fen().split()[:4])
for file in sorted(root.glob('*.tsv')):
    for row in csv.DictReader(file.open(),delimiter='\t'):
        game=chess.pgn.read_game(io.StringIO(row['pgn']))
        if not game or game.errors:raise ValueError(row)
        b=game.board();sequence=list(game.mainline_moves());lines+=1
        for move in sequence[:40]:
            moves.setdefault(key(b),set()).add(move.uci());b.push(move)
        if len(sequence)<=40:
            candidate={'eco':row['eco'],'name':row['name']}
            current=positions.get(key(b))
            if not current or len(candidate['name'])<len(current['name']):positions[key(b)]=candidate
out={'lines':lines,'positions':positions,'moves':{k:sorted(v) for k,v in moves.items()}}
if '--stdout' in sys.argv:print(json.dumps(out,ensure_ascii=False,separators=(',',':')))
else:
    (root/'index.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
    print({'lines':lines,'named_positions':len(positions),'book_positions':len(moves)})
