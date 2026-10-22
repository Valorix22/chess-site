import { Chess } from '/vendor/chess.js';
export function fenPieces(fen){const pieces={};fen.split(' ')[0].split('/').forEach((row,r)=>{let f=0;for(const p of row){if(/\d/.test(p))f+=Number(p);else pieces['abcdefgh'[f++]+(8-r)]=p;}});return pieces;}
const own=(p,color)=>!!p&&(p===p.toUpperCase())===color;
export function projectQueue(fen,queue,color){
 const map=fenPieces(fen),rights=new Set(fen.split(' ')[2].replace('-',''));
 for(const uci of queue){
  const from=uci.slice(0,2),to=uci.slice(2,4),p=map[from];if(!own(p,color)||!canPremove(map,from,to,color,rights))break;
  if(p.toLowerCase()==='p'&&from[0]!==to[0]&&!map[to]){const captured=to[0]+from[1];if(map[captured]&&map[captured].toLowerCase()==='p'&&!own(map[captured],color))delete map[captured];}
  delete map[from];map[to]=uci[4]?(color?uci[4].toUpperCase():uci[4]):p;
  const rank=color?'1':'8';
  if(p.toLowerCase()==='k'){
   rights.delete(color?'K':'k');rights.delete(color?'Q':'q');
   if(Math.abs(from.charCodeAt(0)-to.charCodeAt(0))===2){const rf=(to[0]==='g'?'h':'a')+rank,rt=(to[0]==='g'?'f':'d')+rank;if(own(map[rf],color)&&map[rf].toLowerCase()==='r'){map[rt]=map[rf];delete map[rf];}}
  }
  if(from==='h'+rank)rights.delete(color?'K':'k');if(from==='a'+rank)rights.delete(color?'Q':'q');
 }
 return {map,rights};
}
export function canPremove(map,from,to,color,rights){
 const p=map[from];if(!/^[a-h][1-8]$/.test(from)||!/^[a-h][1-8]$/.test(to)||!own(p,color)||from===to||own(map[to],color))return false;
 const dx=to.charCodeAt(0)-from.charCodeAt(0),dy=Number(to[1])-Number(from[1]),ax=Math.abs(dx),ay=Math.abs(dy),type=p.toLowerCase();
 if(type==='n')return ax*ay===2;
 if(type==='p'){const dir=color?1:-1;if(ax===1&&dy===dir)return true;return dx===0&&!own(map[to],color)&&(dy===dir||dy===2*dir&&from[1]===(color?'2':'7')&&!own(map[from[0]+(Number(from[1])+dir)],color));}
 if(type==='k'){
  if(Math.max(ax,ay)===1)return true;
  const rank=color?'1':'8',side=to[0]==='g'?'K':'Q',rook=(side==='K'?'h':'a')+rank;
  return from==='e'+rank&&to[1]===rank&&['c','g'].includes(to[0])&&rights.has(color?side:side.toLowerCase())&&map[rook]===(color?'R':'r')&&(side==='K'?['f','g']:['b','c','d']).every(f=>!own(map[f+rank],color));
 }
 if(type==='b'&&ax!==ay||type==='r'&&dx!==0&&dy!==0||type==='q'&&dx!==0&&dy!==0&&ax!==ay||!['b','r','q'].includes(type))return false;
 for(let step=1;step<Math.max(ax,ay);step++){const sq=String.fromCharCode(from.charCodeAt(0)+Math.sign(dx)*step)+(Number(from[1])+Math.sign(dy)*step);if(own(map[sq],color))return false;}
 return true;
}
export function materialSummary(initialFen,moves,shownFen,variation=[]){
 const replay=new Chess(initialFen),taken={w:[],b:[]};
 for(const uci of moves){const m=replay.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});if(m?.captured)taken[m.color].push(m.captured);}
 for(const san of variation){const m=replay.move(san);if(m?.captured)taken[m.color].push(m.captured);}
 const values={p:1,n:3,b:3,r:5,q:9,k:0},score={w:0,b:0};
 for(const row of new Chess(shownFen).board())for(const p of row)if(p)score[p.color]+=values[p.type];
 for(const side of ['w','b'])taken[side].sort((a,b)=>values[a]-values[b]||a.localeCompare(b));
 return {taken,score,advantage:{w:Math.max(0,score.w-score.b),b:Math.max(0,score.b-score.w)}};
}
export function annotationPath(from,to,coordinate){
 const a=coordinate(from),b=coordinate(to),dx=Math.abs(a[0]-b[0]),dy=Math.abs(a[1]-b[1]);
 if(dx*dy===20000){const corner=dx>dy?[b[0],a[1]]:[a[0],b[1]];return `M${a} L${corner} L${b}`;}
 return `M${a} L${b}`;
}
