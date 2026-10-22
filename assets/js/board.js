/* ============================================================
   GAMBIT — interactive board component
   ============================================================ */
(function () {
  'use strict';

  const FILES = 'abcdefgh';
  const GLYPHS = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const settings = () => (window.Gambit ? window.Gambit.settings : { coordinates: true, animations: true });
  const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
  const nameToIdx = (s) => FILES.indexOf(s[0]) + (8 - parseInt(s[1], 10)) * 8;

  class ChessBoard {
    constructor(container, opts) {
      this.el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.el) throw new Error('ChessBoard: container not found');
      this.opts = Object.assign({
        fen: window.ChessUtils ? window.ChessUtils.START_FEN : '8/8/8/8/8/8/8/8 w - - 0 1',
        orientation: 'white',
        interactive: false,
        showCoordinates: true,
        onMove: null,
        onSelect: null,
        last: null,
        check: null,
        boardTheme: null
      }, opts || {});
      this.chess = new window.Chess(this.opts.fen);
      this.selected = null;
      this.legal = [];
      this.annotations = [];
      this.last = this.opts.last;
      this.checkSq = this.opts.check;
      this.flipped = this.opts.orientation === 'black';
      this.pendingPromo = null;
      this.disabled = !this.opts.interactive;
      this._settingsHandler = () => { this.opts.showCoordinates = settings().coordinates; this.render(); };
      document.addEventListener('gambit:settings', this._settingsHandler);
      this.render();
    }

    get fen() { return this.chess.fen(); }

    setPosition(fen, options) {
      const o = options || {};
      this.chess.load(fen);
      this.opts.fen = fen;
      this.selected = null;
      this.legal = [];
      this.pendingPromo = null;
      if (o.last !== undefined) this.last = o.last;
      if (o.check !== undefined) this.checkSq = o.check;
      if (o.orientation) { this.opts.orientation = o.orientation; this.flipped = o.orientation === 'black'; }
      this.render();
    }

    setInteractive(on) { this.disabled = !on; this.render(); }
    flip() { this.flipped = !this.flipped; this.render(); }
    setLast(last) { this.last = last; this.render(); }
    setCheck(sq) { this.checkSq = sq; this.render(); }
    clearSelection() { this.selected = null; this.legal = []; this.render(); }

    _order() {
      const squares = [];
      const ranks = this.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
      const files = this.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
      for (const r of ranks) for (const f of files) squares.push(r * 8 + f);
      return squares;
    }

    render() {
      if (!this.el) return;
      if(!this.el.querySelector('.board-wrap'))this.el.innerHTML='<div class="board-wrap"><div class="board playable" role="grid" aria-label="Scacchiera"></div><svg class="draw-overlay" viewBox="0 0 800 800" aria-hidden="true"></svg></div>';
      const wrap=this.el.querySelector('.board-wrap'),board=this.el.querySelector('.board');
      wrap.dataset.board=this.opts.boardTheme||(window.Gambit?window.Gambit.settings.boardTheme:'green');
      board.classList.toggle('playable',!this.disabled);
      const old=Array.from(board.querySelectorAll('.piece')).map(node=>({node,code:node.dataset.code,square:node.parentElement.dataset.square,rect:node.getBoundingClientRect()})),used=new Set();
      const desired=new Map(this.chess.board.map((p,i)=>[sqName(i),p]));
      const order=this._order();
      order.forEach((i,index)=>{
        const name=sqName(i),piece=this.chess.board[i];let cell=board.querySelector('[data-square="'+name+'"]');
        if(!cell){
          cell=document.createElement('div');cell.dataset.square=name;cell.setAttribute('role','gridcell');
          cell.addEventListener('click',event=>{event.preventDefault();this._onSquare(name,this.chess.board[nameToIdx(name)]);});
          cell.addEventListener('dragover',event=>this._onDragOver(event,name));cell.addEventListener('dragleave',()=>cell.classList.remove('drop-target'));cell.addEventListener('drop',event=>this._onDrop(event,name));
        }
        cell.className='sq '+((i%8+Math.floor(i/8))%2===0?'light':'dark');cell.tabIndex=index===0?0:-1;
        cell.setAttribute('aria-label',name+(piece?' '+(piece[0]==='w'?'Bianco ':'Nero ')+piece[1]:''));
        cell.classList.toggle('last',!!this.last&&(this.last.from===name||this.last.to===name));cell.classList.toggle('check',this.checkSq===name);cell.classList.toggle('selected',this.selected===name);
        cell.classList.toggle('premove',!!this.opts.premoveSquares?.includes(name));
        cell.querySelectorAll('.hint,.coord-file,.coord-rank,.king-marker').forEach(node=>node.remove());
        if(this.legal.includes(i)){const hint=document.createElement('span');hint.className='hint'+(piece?' capture':'');cell.append(hint);}
        if(settings().coordinates){
          if(index>=56){const coord=document.createElement('span');coord.className='coord-file';coord.textContent=name[0];cell.append(coord);}
          if(index%8===0){const coord=document.createElement('span');coord.className='coord-rank';coord.textContent=name[1];cell.append(coord);}
        }
        if(piece){
          let found=old.find(v=>!used.has(v.node)&&v.square===name&&v.code===piece);
          if(!found)found=old.filter(v=>!used.has(v.node)&&v.code===piece&&desired.get(v.square)!==v.code).sort((a,b)=>Math.hypot(nameToIdx(a.square)%8-i%8,Math.floor(nameToIdx(a.square)/8)-Math.floor(i/8))-Math.hypot(nameToIdx(b.square)%8-i%8,Math.floor(nameToIdx(b.square)/8)-Math.floor(i/8)))[0];
          const node=found?.node||document.createElement('span');node.className='piece '+piece[0];node.dataset.code=piece;node.dataset.from=name;
          if(!found){node.innerHTML='<img src="/pieces/'+piece+'.svg" alt="" draggable="false">';node.addEventListener('dragstart',ev=>{this._onDragStart(ev,node.dataset.from);node.classList.add('dragging');});node.addEventListener('dragend',()=>{node.classList.remove('dragging');this._clearDropTargets();});}
          used.add(node);node.draggable=!this.disabled&&piece[0]===(this.opts.playerColor||this.chess.turn);cell.classList.toggle('draggable',node.draggable);cell.append(node);
          if(found&&found.square!==name&&settings().animations&&this._previousFlipped===this.flipped){requestAnimationFrame(()=>{const rect=node.getBoundingClientRect();if(!rect.width||!found.rect.width)return;node.getAnimations().forEach(a=>a.cancel());node.animate([{transform:'translate('+(found.rect.left-rect.left)+'px,'+(found.rect.top-rect.top)+'px)'},{transform:'translate(0,0)'}],{duration:this.opts.fast?80:145,easing:'cubic-bezier(.2,.8,.2,1)'});});}
          if(piece[1]==='K'&&this.opts.result&&this.opts.result!=='*'){
            const marker=document.createElement('span');const won=this.opts.result===(piece[0]==='w'?'1-0':'0-1');marker.className='king-marker '+(this.opts.result==='1/2-1/2'?'draw':won?'win':'loss');marker.textContent=this.opts.result==='1/2-1/2'?'½':won?'✓':'×';cell.append(marker);
          }
        }
        board.append(cell);
      });
      for(const previous of old)if(!used.has(previous.node))previous.node.remove();
      this._previousFlipped=this.flipped;
      if(!this._eventsBound){
        this._eventsBound=true;wrap.addEventListener('contextmenu',event=>event.preventDefault());let start=null;
        board.addEventListener('pointerdown',event=>{if(event.button===2){start=event.target.closest('[data-square]')?.dataset.square;event.preventDefault();}});
        board.addEventListener('pointerup',event=>{if(event.button!==2)return;const end=event.target.closest('[data-square]')?.dataset.square;if(start&&end&&start!==end){const key=start+end,index=this.annotations.findIndex(a=>a.from+a.to===key);if(index>=0)this.annotations.splice(index,1);else this.annotations.push({from:start,to:end});if(this.annotations.length>32)this.annotations.shift();}else{this.opts.onCancelPremoves?.();}start=null;this.renderAnnotations();});
        board.addEventListener('keydown',event=>{const cell=event.target.closest('[data-square]');if(!cell)return;const order=this._order(),index=order.indexOf(nameToIdx(cell.dataset.square)),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8}[event.key];if(delta){event.preventDefault();const i=Math.min(63,Math.max(0,index+delta));const next=board.querySelector('[data-square="'+sqName(order[i])+'"]');cell.tabIndex=-1;next.tabIndex=0;next.focus();}else if(event.key==='Enter'||event.key===' '){event.preventDefault();this._onSquare(cell.dataset.square,this.chess.board[nameToIdx(cell.dataset.square)]);}else if(event.key==='Escape'){this.clearSelection();this.opts.onCancelPremoves?.();}});
      }
      this.renderAnnotations();
    }

    renderAnnotations(){
      const svg=this.el.querySelector('.draw-overlay');if(!svg)return;const grid=this.el.querySelector('.board');svg.style.left=grid.offsetLeft+'px';svg.style.top=grid.offsetTop+'px';svg.style.width=grid.clientWidth+'px';svg.style.height=grid.clientHeight+'px';
      const coordinate=square=>{const i=this._order().indexOf(nameToIdx(square));return [i%8*100+50,Math.floor(i/8)*100+50];};
      const arrows=[...this.annotations,...(this.opts.bestArrow?[this.opts.bestArrow]:[])];
      svg.innerHTML='<defs><marker id="arrow-'+this.el.id+'" markerWidth="3" markerHeight="3" refX="2.3" refY="1.5" orient="auto"><path d="M0 0 L3 1.5 L0 3 Z" fill="context-stroke"/></marker></defs>'+arrows.map(a=>'<path d="'+window.BoardTools.annotationPath(a.from,a.to,coordinate)+'" fill="none" stroke="'+(a.best?'#4ade80':'#efa639')+'" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity=".8" marker-end="url(#arrow-'+this.el.id+')"/>').join('');
    }

    _onSquare(name, piece) {
      if (this.disabled || this.pendingPromo) return;
      const turn = this.opts.playerColor || this.chess.turn;

      if (this.selected) {
        if (name === this.selected) { this.clearSelection(); return; }
        if (this._tryMove(this.selected, name)) return;
        if (piece && piece[0] === turn) { this._select(name); return; }
        this.clearSelection();
        return;
      }
      if (piece && piece[0] === turn) this._select(name);
    }

    _select(name) {
      this.selected = name;
      const from = nameToIdx(name);
      this.legal = this.opts.allowPremove ? Array.from({length:64},(_,i)=>i).filter(i=>window.BoardTools.canPremove(this.opts.premoveMap,name,sqName(i),this.opts.playerColor==='w',this.opts.premoveRights)) : this.chess.legalMovesFrom(from).map((m) => m.to);
      this.render();
      if (this.opts.onSelect) this.opts.onSelect(name);
    }

    _tryMove(from, to) {
      if(this.opts.allowPremove){if(!window.BoardTools.canPremove(this.opts.premoveMap,from,to,this.opts.playerColor==='w',this.opts.premoveRights))return false;const p=this.opts.premoveMap[from];if(p.toLowerCase()==='p'&&['1','8'].includes(to[1]))this._openPromotion(from,to);else this._emitMove(from,to,null);return true;}
      const fromIdx = nameToIdx(from);
      const toIdx = nameToIdx(to);
      const candidates = this.chess.legalMoves().filter((m) => m.from === fromIdx && m.to === toIdx);
      if (!candidates.length) return false;
      if (candidates.some((m) => m.promotion)) {
        if (settings().autoPromote) { this._emitMove(from, to, 'Q'); return true; }
        this._openPromotion(from, to);
        return true;
      }
      this._emitMove(from, to, null);
      return true;
    }

    _emitMove(from, to, promotion) {
      this.selected = null;
      this.legal = [];
      this.pendingPromo = null;
      const pop = this.el.querySelector('.promo-pop');
      if (pop) pop.remove();
      this.render();
      if (this.opts.onMove) this.opts.onMove(from, to, promotion);
    }

    _openPromotion(from, to) {
      this.selected = null;
      this.legal = [];
      this.pendingPromo = { from, to };
      this.render();
      const wrap = this.el.querySelector('.board-wrap');
      const color = this.opts.playerColor || this.chess.turn;
      const pop = document.createElement('div');
      pop.className = 'promo-pop';
      pop.innerHTML = `<div class="promo-pop-label">Promote to</div><div class="promo-grid">${['Q', 'R', 'B', 'N'].map((t) => `<button class="promo-piece ${color}" data-promo="${t}" aria-label="${t}">${window.GambitIntegration.piece(color+t)}</button>`).join('')}</div>`;
      wrap.appendChild(pop);
      pop.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-promo]');
        if (btn) this._emitMove(from, to, btn.dataset.promo);
        else if (!e.target.closest('.promo-pop')) { pop.remove(); this.pendingPromo = null; }
      });
      const cancel = (ev) => {
        if (!pop.contains(ev.target)) { pop.remove(); this.pendingPromo = null; document.removeEventListener('click', cancel); }
      };
      setTimeout(() => document.addEventListener('click', cancel), 30);
    }

    _onDragStart(ev, from) {
      if (this.disabled || this.chess.board[nameToIdx(from)]?.[0] !== (this.opts.playerColor||this.chess.turn)) { ev.preventDefault(); return; }
      ev.dataTransfer.setData('text/plain', from);
      ev.dataTransfer.effectAllowed = 'move';
      this.selected = from;
      this.legal = this.opts.allowPremove ? Array.from({length:64},(_,i)=>i).filter(i=>window.BoardTools.canPremove(this.opts.premoveMap,from,sqName(i),this.opts.playerColor==='w',this.opts.premoveRights)) : this.chess.legalMovesFrom(nameToIdx(from)).map((m) => m.to);
    }

    _onDragOver(ev, name) {
      if (this.disabled) return;
      const target = nameToIdx(name);
      if (this.legal.includes(target)) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        ev.currentTarget.classList.add('drop-target');
      }
    }

    _onDrop(ev, to) {
      ev.preventDefault();
      this._clearDropTargets();
      const from = ev.dataTransfer.getData('text/plain');
      if (from) this._tryMove(from, to);
    }

    _clearDropTargets() {
      this.el.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    }

    destroy() {
      document.removeEventListener('gambit:settings', this._settingsHandler);
      this.el.innerHTML = '';
    }
  }

  window.ChessBoard = ChessBoard;
})();
