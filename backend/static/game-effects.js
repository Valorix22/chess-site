// Chess.com samples referenced in sounds/chesscom/SOURCES.md, served locally.
const FILES={move:'move-self',opponent:'move-opponent',capture:'capture',castle:'castle',promotion:'promote',check:'move-check',start:'game-start',end:'game-end',win:'game-win-long',loss:'game-lose',draw:'game-draw',premove:'premove',notify:'notify',illegal:'illegal',lowtime:'tenseconds'};
export class ChessSounds {
 constructor(){
  this.context=null;this.buffers=new Map();this.files=new Map();this.decoding=new Map();this.active=new Set();this.generation=0;
  this.preloaded=Promise.allSettled([...new Set(Object.values(FILES))].map(name=>this.file(name)));
 }
 file(name){
  if(!this.files.has(name))this.files.set(name,fetch('/sounds/chesscom/'+name+'.mp3').then(response=>{if(!response.ok)throw Error('Audio unavailable');return response.arrayBuffer();}).catch(()=>{this.files.delete(name);return null;}));
  return this.files.get(name);
 }
 unlock(){
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   if(!this.context){this.context=new Audio();for(const kind of Object.keys(FILES))this.buffer(kind);}
   if(this.context.state==='suspended')this.context.resume().catch(()=>{});
  }catch{}
 }
 async buffer(kind){
  if(this.buffers.has(kind))return this.buffers.get(kind);
  const name=FILES[kind],ctx=this.context;if(!name||!ctx)return null;
  if(!this.decoding.has(name)){
   const decode=this.file(name).then(bytes=>bytes?ctx.decodeAudioData(bytes.slice(0)):null).catch(()=>null);
   this.decoding.set(name,decode);
   decode.then(value=>{if(!value)this.decoding.delete(name);});
  }
  const value=await this.decoding.get(name);if(value)this.buffers.set(kind,value);return value;
 }
 async play(kind){
  const ctx=this.context;if(!ctx||ctx.state!=='running')return false;
  const generation=this.generation,requested=performance.now(),buffer=await this.buffer(kind);
  if(!buffer||generation!==this.generation||ctx.state!=='running'||performance.now()-requested>350)return false;
  try{const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);this.active.add(source);source.onended=()=>{this.active.delete(source);source.disconnect();};source.start(ctx.currentTime+(['end','win','loss','draw'].includes(kind)?.12:0));return true;}catch{return false;}
 }
 stop(){this.generation++;for(const source of this.active){try{source.stop();}catch{}}this.active.clear();}
}
export const gameSounds=new ChessSounds();
export function moveSound(san,{opponent=false,premove=false}={}){
 if(/[+#]$/.test(san))return 'check';
 if(san.includes('='))return 'promotion';
 if(san.startsWith('O-O'))return 'castle';
 if(san.includes('x'))return 'capture';
 return premove?'premove':opponent?'opponent':'move';
}
