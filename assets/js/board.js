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
      const boardTheme = this.opts.boardTheme || (window.Gambit ? window.Gambit.settings.boardTheme : 'green');
      const coords = settings().coordinates;

      if (!this.el.querySelector('.board-wrap')) {
        this.el.innerHTML = '<div class="board-wrap"><div class="board playable" role="grid" aria-label="Chess board"></div></div>';
      }
      const oldPop = this.el.querySelector('.promo-pop');
      if (oldPop) oldPop.remove();
      const wrap = this.el.querySelector('.board-wrap');
      const board = this.el.querySelector('.board');
      wrap.dataset.board = boardTheme;
      board.classList.toggle('playable', !this.disabled);
      board.innerHTML = '';

      const isLegalTarget = (i) => this.legal.includes(i);
      const order = this._order();

      order.forEach((i) => {
        const f = i % 8, r = Math.floor(i / 8);
        const name = sqName(i);
        const piece = this.chess.board[i];
        const sq = document.createElement('div');
        sq.className = 'sq ' + ((f + r) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.square = name;
        sq.setAttribute('role', 'gridcell');
        sq.setAttribute('aria-label', name + (piece ? ' ' + (piece[0] === 'w' ? 'white ' : 'black ') + piece[1] : ''));

        if (this.last && (this.last.from === name || this.last.to === name)) sq.classList.add('last');
        if (this.checkSq === name) sq.classList.add('check');
        if (this.selected === name) sq.classList.add('selected');
        if (isLegalTarget(i)) {
          const hint = document.createElement('span');
          hint.className = 'hint' + (piece ? ' capture' : '');
          sq.appendChild(hint);
        }
        if (coords) {
          const bottomRow = this.flipped ? r === 0 : r === 7;
          const leftCol = this.flipped ? f === 7 : f === 0;
          if (bottomRow) {
            const cf = document.createElement('span');
            cf.className = 'coord-file';
            cf.textContent = FILES[f];
            sq.appendChild(cf);
          }
          if (leftCol) {
            const cr = document.createElement('span');
            cr.className = 'coord-rank';
            cr.textContent = 8 - r;
            sq.appendChild(cr);
          }
        }
        if (piece) {
          const span = document.createElement('span');
          span.className = 'piece ' + piece[0];
          span.textContent = GLYPHS[piece[1]];
          span.dataset.from = name;
          if (!this.disabled && piece[0] === this.chess.turn) {
            span.setAttribute('draggable', 'true');
            sq.classList.add('draggable');
            span.addEventListener('dragstart', (ev) => this._onDragStart(ev, name));
            span.addEventListener('dragend', () => this._clearDropTargets());
          }
          sq.appendChild(span);
        }

        sq.addEventListener('click', (ev) => { ev.preventDefault(); this._onSquare(name, piece); });
        sq.addEventListener('dragover', (ev) => this._onDragOver(ev, name));
        sq.addEventListener('dragleave', () => sq.classList.remove('drop-target'));
        sq.addEventListener('drop', (ev) => this._onDrop(ev, name));
        board.appendChild(sq);
      });
    }

    _onSquare(name, piece) {
      if (this.disabled || this.pendingPromo) return;
      const turn = this.chess.turn;

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
      this.legal = this.chess.legalMovesFrom(from).map((m) => m.to);
      this.render();
      if (this.opts.onSelect) this.opts.onSelect(name);
    }

    _tryMove(from, to) {
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
      const color = this.chess.turn;
      const pop = document.createElement('div');
      pop.className = 'promo-pop';
      pop.innerHTML = `<div class="promo-pop-label">Promote to</div><div class="promo-grid">${['Q', 'R', 'B', 'N'].map((t) => `<button class="promo-piece ${color}" data-promo="${t}" aria-label="${t}">${GLYPHS[t]}</button>`).join('')}</div>`;
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
      if (this.disabled) { ev.preventDefault(); return; }
      ev.dataTransfer.setData('text/plain', from);
      ev.dataTransfer.effectAllowed = 'move';
      this.selected = from;
      this.legal = this.chess.legalMovesFrom(nameToIdx(from)).map((m) => m.to);
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
