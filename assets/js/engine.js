/* ============================================================
   GAMBIT — chess engine
   Board indices: 0 = a8 ... 63 = h1
   Pieces: "wP", "bK", etc.
   ============================================================ */
(function (global) {
  'use strict';

  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
  const MATE = 100000;

  const idx = (f, r) => r * 8 + f;
  const fileOf = (i) => i % 8;
  const rankOf = (i) => Math.floor(i / 8); // 0 = rank 8
  const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
  const sqName = (i) => FILES[fileOf(i)] + (8 - rankOf(i));
  const nameToIdx = (s) => {
    if (typeof s === 'number') return s;
    const f = FILES.indexOf(s[0]);
    const r = 8 - parseInt(s[1], 10);
    return onBoard(f, r) ? idx(f, r) : -1;
  };

  const KNIGHT_OFFSETS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTHOGONALS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const KING_OFFSETS = [...DIAGONALS, ...ORTHOGONALS];

  // Piece-square tables (white perspective, index 0 = a8)
  const PST = {
    P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    K: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
  };

  class Chess {
    constructor(fen) {
      this.board = new Array(64).fill(null);
      this.turn = 'w';
      this.castling = 'KQkq';
      this.epIdx = -1;
      this.halfmove = 0;
      this.fullmove = 1;
      this.history = [];
      this._undoStack = [];
      if (fen !== null) this.load(fen || START_FEN);
    }

    load(fen) {
      const parts = String(fen).trim().split(/\s+/);
      this.board = new Array(64).fill(null);
      let i = 0;
      for (const ch of parts[0]) {
        if (ch === '/') continue;
        if (/\d/.test(ch)) { i += parseInt(ch, 10); continue; }
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        this.board[i] = color + ch.toUpperCase();
        i++;
      }
      this.turn = parts[1] || 'w';
      this.castling = parts[2] && parts[2] !== '-' ? parts[2] : '';
      this.epIdx = parts[3] && parts[3] !== '-' ? nameToIdx(parts[3]) : -1;
      this.halfmove = parts[4] ? parseInt(parts[4], 10) : 0;
      this.fullmove = parts[5] ? parseInt(parts[5], 10) : 1;
      this.history = [];
      this._undoStack = [];
      return this;
    }

    static fromFEN(fen) { return new Chess(fen); }

    clone() {
      const c = new Chess();
      c.board = this.board.slice();
      c.turn = this.turn;
      c.castling = this.castling;
      c.epIdx = this.epIdx;
      c.halfmove = this.halfmove;
      c.fullmove = this.fullmove;
      return c;
    }

    fen() {
      let out = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.board[idx(f, r)];
          if (!p) { empty++; continue; }
          if (empty) { out += empty; empty = 0; }
          out += p[0] === 'w' ? p[1] : p[1].toLowerCase();
        }
        if (empty) out += empty;
        if (r < 7) out += '/';
      }
      out += ' ' + this.turn + ' ';
      out += this.castling || '-';
      out += ' ' + (this.epIdx >= 0 ? sqName(this.epIdx) : '-');
      out += ' ' + this.halfmove + ' ' + this.fullmove;
      return out;
    }

    pieceAt(sq) {
      const i = typeof sq === 'string' ? nameToIdx(sq) : sq;
      return i >= 0 ? this.board[i] : null;
    }

    kingSquare(color) {
      for (let i = 0; i < 64; i++) if (this.board[i] === color + 'K') return i;
      return -1;
    }

    isAttacked(sq, byColor) {
      if (sq < 0) return false;
      const f = fileOf(sq), r = rankOf(sq);
      const B = this.board;

      // pawns
      const pawnDir = byColor === 'w' ? 1 : -1; // attacker sits one rank "behind"
      for (const df of [-1, 1]) {
        const af = f + df, ar = r + pawnDir;
        if (onBoard(af, ar) && B[idx(af, ar)] === byColor + 'P') return true;
      }
      // knights
      for (const [df, dr] of KNIGHT_OFFSETS) {
        const af = f + df, ar = r + dr;
        if (onBoard(af, ar) && B[idx(af, ar)] === byColor + 'N') return true;
      }
      // king
      for (const [df, dr] of KING_OFFSETS) {
        const af = f + df, ar = r + dr;
        if (onBoard(af, ar) && B[idx(af, ar)] === byColor + 'K') return true;
      }
      // sliders
      for (const [df, dr] of DIAGONALS) {
        let af = f + df, ar = r + dr;
        while (onBoard(af, ar)) {
          const p = B[idx(af, ar)];
          if (p) {
            if (p[0] === byColor && (p[1] === 'B' || p[1] === 'Q')) return true;
            break;
          }
          af += df; ar += dr;
        }
      }
      for (const [df, dr] of ORTHOGONALS) {
        let af = f + df, ar = r + dr;
        while (onBoard(af, ar)) {
          const p = B[idx(af, ar)];
          if (p) {
            if (p[0] === byColor && (p[1] === 'R' || p[1] === 'Q')) return true;
            break;
          }
          af += df; ar += dr;
        }
      }
      return false;
    }

    inCheck(color) {
      color = color || this.turn;
      return this.isAttacked(this.kingSquare(color), color === 'w' ? 'b' : 'w');
    }

    _pseudoMoves(color, capturesOnly) {
      const moves = [];
      const B = this.board;
      const push = (from, to, extra) => {
        const m = Object.assign({ from, to }, extra || {});
        moves.push(m);
      };

      for (let from = 0; from < 64; from++) {
        const p = B[from];
        if (!p || p[0] !== color) continue;
        const type = p[1];
        const f = fileOf(from), r = rankOf(from);
        const dir = color === 'w' ? -1 : 1;
        const startRank = color === 'w' ? 6 : 1;
        const promoRank = color === 'w' ? 0 : 7;

        if (type === 'P') {
          const oneR = r + dir;
          if (onBoard(f, oneR)) {
            const one = idx(f, oneR);
            if (!B[one] && !capturesOnly) {
              if (oneR === promoRank) for (const pr of ['Q', 'R', 'B', 'N']) push(from, one, { promotion: pr });
              else push(from, one);
            }
            if (!capturesOnly && r === startRank) {
              const twoR = r + dir * 2;
              const two = idx(f, twoR);
              if (!B[two] && !B[one]) push(from, two, { double: true });
            }
          }
          for (const df of [-1, 1]) {
            const cf = f + df, cr = r + dir;
            if (!onBoard(cf, cr)) continue;
            const to = idx(cf, cr);
            const target = B[to];
            if (target && target[0] !== color) {
              if (cr === promoRank) for (const pr of ['Q', 'R', 'B', 'N']) push(from, to, { promotion: pr, captured: target });
              else push(from, to, { captured: target });
            } else if (!target && to === this.epIdx) {
              push(from, to, { ep: true, captured: color === 'w' ? 'bP' : 'wP' });
            }
          }
          continue;
        }

        if (type === 'N') {
          for (const [df, dr] of KNIGHT_OFFSETS) {
            const tf = f + df, tr = r + dr;
            if (!onBoard(tf, tr)) continue;
            const to = idx(tf, tr), target = B[to];
            if (target && target[0] === color) continue;
            if (capturesOnly && !target) continue;
            push(from, to, target ? { captured: target } : null);
          }
          continue;
        }

        if (type === 'K') {
          for (const [df, dr] of KING_OFFSETS) {
            const tf = f + df, tr = r + dr;
            if (!onBoard(tf, tr)) continue;
            const to = idx(tf, tr), target = B[to];
            if (target && target[0] === color) continue;
            if (capturesOnly && !target) continue;
            push(from, to, target ? { captured: target } : null);
          }
          // castling
          if (!capturesOnly && !this.isAttacked(from, color === 'w' ? 'b' : 'w')) {
            const rights = this.castling;
            const homeRank = color === 'w' ? 7 : 0;
            if (r === homeRank && f === 4) {
              if (color === 'w') {
                if (rights.includes('K') && !B[idx(5, 7)] && !B[idx(6, 7)] &&
                    B[idx(7, 7)] === 'wR' && !this.isAttacked(idx(5, 7), 'b') && !this.isAttacked(idx(6, 7), 'b')) {
                  push(from, idx(6, 7), { castle: 'K' });
                }
                if (rights.includes('Q') && !B[idx(3, 7)] && !B[idx(2, 7)] && !B[idx(1, 7)] &&
                    B[idx(0, 7)] === 'wR' && !this.isAttacked(idx(3, 7), 'b') && !this.isAttacked(idx(2, 7), 'b')) {
                  push(from, idx(2, 7), { castle: 'Q' });
                }
              } else {
                if (rights.includes('k') && !B[idx(5, 0)] && !B[idx(6, 0)] &&
                    B[idx(7, 0)] === 'bR' && !this.isAttacked(idx(5, 0), 'w') && !this.isAttacked(idx(6, 0), 'w')) {
                  push(from, idx(6, 0), { castle: 'k' });
                }
                if (rights.includes('q') && !B[idx(3, 0)] && !B[idx(2, 0)] && !B[idx(1, 0)] &&
                    B[idx(0, 0)] === 'bR' && !this.isAttacked(idx(3, 0), 'w') && !this.isAttacked(idx(2, 0), 'w')) {
                  push(from, idx(2, 0), { castle: 'q' });
                }
              }
            }
          }
          continue;
        }

        const dirs = type === 'B' ? DIAGONALS : type === 'R' ? ORTHOGONALS : KING_OFFSETS;
        for (const [df, dr] of dirs) {
          let tf = f + df, tr = r + dr;
          while (onBoard(tf, tr)) {
            const to = idx(tf, tr), target = B[to];
            if (target) {
              if (target[0] !== color) push(from, to, { captured: target });
              break;
            }
            if (!capturesOnly) push(from, to);
            tf += df; tr += dr;
          }
        }
      }
      return moves;
    }

    _apply(move) {
      const B = this.board;
      const from = move.from, to = move.to;
      const piece = B[from];
      if (!piece) return;
      const color = piece[0];
      const type = piece[1];
      const undo = {
        move, captured: B[to], capturedIdx: -1, ep: this.epIdx,
        castling: this.castling, halfmove: this.halfmove, fullmove: this.fullmove, turn: this.turn
      };

      if (move.ep) {
        const capIdx = to + (color === 'w' ? 8 : -8);
        undo.capturedIdx = capIdx;
        undo.captured = B[capIdx];
        B[capIdx] = null;
      }

      B[to] = move.promotion ? color + move.promotion : piece;
      B[from] = null;

      if (move.castle) {
        const rank = color === 'w' ? 7 : 0;
        if (move.castle === 'K' || move.castle === 'k') {
          B[idx(5, rank)] = B[idx(7, rank)];
          B[idx(7, rank)] = null;
        } else {
          B[idx(3, rank)] = B[idx(0, rank)];
          B[idx(0, rank)] = null;
        }
      }

      // castling rights
      let rights = this.castling;
      if (type === 'K') rights = rights.replace(color === 'w' ? /[KQ]/g : /[kq]/g, '');
      if (type === 'R') {
        if (from === 63) rights = rights.replace('K', '');
        if (from === 56) rights = rights.replace('Q', '');
        if (from === 7) rights = rights.replace('k', '');
        if (from === 0) rights = rights.replace('q', '');
      }
      if (undo.captured && undo.captured[1] === 'R') {
        if (to === 63) rights = rights.replace('K', '');
        if (to === 56) rights = rights.replace('Q', '');
        if (to === 7) rights = rights.replace('k', '');
        if (to === 0) rights = rights.replace('q', '');
      }
      this.castling = rights;

      this.epIdx = move.double ? (from + to) / 2 : -1;
      this.halfmove = (type === 'P' || undo.captured) ? 0 : this.halfmove + 1;
      if (this.turn === 'b') this.fullmove++;
      this.turn = color === 'w' ? 'b' : 'w';
      this._undoStack.push(undo);
    }

    _undoMove() {
      const u = this._undoStack.pop();
      if (!u) return;
      const B = this.board;
      const m = u.move;
      const piece = B[m.to];
      B[m.from] = m.promotion ? u.turn + 'P' : piece;
      B[m.to] = null;
      if (u.capturedIdx >= 0) {
        B[u.capturedIdx] = u.captured;
      } else if (u.captured) {
        B[m.to] = u.captured;
      }
      if (m.castle) {
        const rank = u.turn === 'w' ? 7 : 0;
        if (m.castle === 'K' || m.castle === 'k') {
          B[idx(7, rank)] = B[idx(5, rank)];
          B[idx(5, rank)] = null;
        } else {
          B[idx(0, rank)] = B[idx(3, rank)];
          B[idx(3, rank)] = null;
        }
      }
      this.turn = u.turn;
      this.castling = u.castling;
      this.epIdx = u.ep;
      this.halfmove = u.halfmove;
      this.fullmove = u.fullmove;
    }

    legalMoves(capturesOnly) {
      const out = [];
      const color = this.turn;
      const pseudo = this._pseudoMoves(color, capturesOnly);
      for (const m of pseudo) {
        this._apply(m);
        const ok = !this.isAttacked(this.kingSquare(color), color === 'w' ? 'b' : 'w');
        this._undoMove();
        if (ok) out.push(m);
      }
      return out;
    }

    legalMovesFrom(from) {
      const i = typeof from === 'string' ? nameToIdx(from) : from;
      return this.legalMoves().filter((m) => m.from === i);
    }

    isLegal(from, to, promotion) {
      const f = typeof from === 'string' ? nameToIdx(from) : from;
      const t = typeof to === 'string' ? nameToIdx(to) : to;
      return this.legalMoves().some((m) => m.from === f && m.to === t && (!promotion || m.promotion === promotion));
    }

    findMove(from, to, promotion) {
      const f = typeof from === 'string' ? nameToIdx(from) : from;
      const t = typeof to === 'string' ? nameToIdx(to) : to;
      return this.legalMoves().find((m) => m.from === f && m.to === t && (!promotion || m.promotion === promotion)) || null;
    }

    /* Standard algebraic notation for a legal move in the current position. */
    san(move) {
      const piece = this.board[move.from];
      if (!piece) return '';
      const type = piece[1];
      let notation;
      if (move.castle) {
        notation = move.castle === 'K' || move.castle === 'k' ? 'O-O' : 'O-O-O';
      } else if (type === 'P') {
        notation = '';
        if (move.captured) notation += FILES[fileOf(move.from)] + 'x';
        notation += sqName(move.to);
        if (move.promotion) notation += '=' + move.promotion;
      } else {
        notation = type;
        const others = this.legalMoves().filter((m) =>
          m.to === move.to && m.from !== move.from &&
          this.board[m.from] && this.board[m.from][1] === type
        );
        if (others.length) {
          const sameFile = others.some((m) => fileOf(m.from) === fileOf(move.from));
          const sameRank = others.some((m) => rankOf(m.from) === rankOf(move.from));
          if (!sameFile) notation += FILES[fileOf(move.from)];
          else if (!sameRank) notation += (8 - rankOf(move.from));
          else notation += sqName(move.from);
        }
        if (move.captured) notation += 'x';
        notation += sqName(move.to);
      }
      this._apply(move);
      const opponent = this.turn;
      const opponentMoves = this.legalMoves();
      if (this.inCheck(opponent)) notation += opponentMoves.length ? '+' : '#';
      this._undoMove();
      return notation;
    }

    move(from, to, promotion) {
      const m = this.findMove(from, to, promotion);
      if (!m) return null;
      const san = this.san(m);
      this._apply(m);
      const entry = {
        san, from: sqName(m.from), to: sqName(m.to),
        piece: m.promotion ? (m.from !== undefined ? (this.turn === 'b' ? 'w' : 'b') + m.promotion : null) : null,
        color: this.turn === 'b' ? 'w' : 'b',
        captured: m.captured || null,
        promotion: m.promotion || null,
        castle: m.castle || null,
        ep: !!m.ep,
        fen: this.fen()
      };
      this.history.push(entry);
      return entry;
    }

    /* Accepts a SAN string in the current position (e.g. "Nf3"). */
    moveSAN(san) {
      const clean = san.replace(/[+#!?]/g, '');
      const found = this.legalMoves().find((m) => {
        const s = this.san(m).replace(/[+#!?]/g, '');
        return s === clean;
      });
      if (!found) return null;
      return this.move(found.from, found.to, found.promotion);
    }

    status() {
      const moves = this.legalMoves();
      if (!moves.length) {
        if (this.inCheck(this.turn)) return { over: true, result: this.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate', winner: this.turn === 'w' ? 'b' : 'w' };
        return { over: true, result: '1/2-1/2', reason: 'stalemate', winner: null };
      }
      if (this.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', winner: null };
      if (this.insufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient material', winner: null };
      return { over: false, check: this.inCheck(this.turn), moves: moves.length };
    }

    insufficientMaterial() {
      const pieces = [];
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (!p || p[1] === 'K') continue;
        pieces.push({ p, color: p[0], type: p[1], dark: (fileOf(i) + rankOf(i)) % 2 === 0 });
      }
      if (pieces.length === 0) return true;
      if (pieces.length === 1 && (pieces[0].type === 'B' || pieces[0].type === 'N')) return true;
      if (pieces.length === 2 && pieces.every((x) => x.type === 'B') && pieces[0].dark === pieces[1].dark && pieces[0].color !== pieces[1].color) return true;
      return false;
    }

    /* ---------- AI ---------- */
    evaluate() {
      let score = 0;
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (!p) continue;
        const val = VALUES[p[1]] + PST[p[1]][p[0] === 'w' ? i : 63 - i];
        score += p[0] === 'w' ? val : -val;
      }
      return this.turn === 'w' ? score : -score;
    }

    _orderMoves(moves) {
      return moves.slice().sort((a, b) => {
        const av = (a.captured ? VALUES[a.captured[1]] : 0) + (a.promotion ? 800 : 0) + (a.castle ? 40 : 0);
        const bv = (b.captured ? VALUES[b.captured[1]] : 0) + (b.promotion ? 800 : 0) + (b.castle ? 40 : 0);
        return bv - av;
      });
    }

    _negamax(depth, alpha, beta, ply) {
      if (depth === 0) return this.evaluate();
      const moves = this._orderMoves(this._pseudoMoves(this.turn, false));
      let legal = 0;
      let best = -Infinity;
      const mover = this.turn;

      for (const m of moves) {
        this._apply(m);
        const illegal = this.isAttacked(this.kingSquare(mover), mover === 'w' ? 'b' : 'w');
        if (illegal) {
          this._undoMove();
          continue;
        }
        legal++;
        const score = -this._negamax(depth - 1, -beta, -alpha, ply + 1);
        this._undoMove();
        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }

      if (!legal) return this.inCheck(this.turn) ? -MATE + ply : 0;
      return best;
    }

    bestMove(opts) {
      const options = Object.assign({ depth: 2, randomness: 0 }, opts || {});
      let moves = this.legalMoves();
      if (!moves.length) return null;
      moves = this._orderMoves(moves);

      if (options.randomness && Math.random() < options.randomness) {
        return moves[Math.floor(Math.random() * moves.length)];
      }

      const scored = [];
      let alpha = -Infinity;
      for (const m of moves) {
        this._apply(m);
        const score = -this._negamax(options.depth - 1, -Infinity, -alpha, 1);
        this._undoMove();
        scored.push({ m, score });
        if (score > alpha) alpha = score;
      }
      const top = Math.max(...scored.map((s) => s.score));
      const ties = scored.filter((s) => s.score >= top - 2).map((s) => s.m);
      return ties[Math.floor(Math.random() * ties.length)];
    }
  }

  global.Chess = Chess;
  global.ChessUtils = { sqName, nameToIdx, fileOf, rankOf, START_FEN, VALUES, MATE };
})(typeof window !== 'undefined' ? window : globalThis);
