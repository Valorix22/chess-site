(function () {
  'use strict';

  const G = {
    game: null,
    board: null,
    config: { mode: 'computer', tc: '10+0', color: 'white', level: 3, rated: true },
    userColor: 'w',
    topColor: 'b',
    bottomColor: 'w',
    over: false,
    started: false,
    history: [],
    positions: [],
    viewIndex: 0,
    clocks: { w: 0, b: 0 },
    increment: 0,
    activeClock: null,
    timer: null,
    botToken: 0,
    chats: [],
    startedAt: null,
    overInfo: null
  };

  const LEVELS = {
    1: { depth: 1, randomness: 0.55, name: 'Beginner', rating: 800 },
    2: { depth: 1, randomness: 0.22, name: 'Casual', rating: 1100 },
    3: { depth: 2, randomness: 0.08, name: 'Intermediate', rating: 1450 },
    4: { depth: 3, randomness: 0.02, name: 'Advanced', rating: 1820 },
    5: { depth: 3, randomness: 0, name: 'Master', rating: 2200 }
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const { icon, avatar, toast, Sound, settings, esc, ratingFmt } = window.Gambit;
  const U = window.ChessUtils;
  const user = window.Gambit.user;

  function tcParts(tc) {
    const [m, i] = tc.split('+').map((x) => parseInt(x, 10));
    return { base: m * 60 * 1000, inc: (i || 0) * 1000, label: tc };
  }
  function fmtClock(ms, active) {
    const total = Math.max(0, ms);
    const s = Math.ceil(total / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (total <= 20000 && active) {
      return `${Math.floor(total / 1000)}.${Math.floor((total % 1000) / 100)}`;
    }
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  function sqName(i) { return U.sqName(i); }

  function setStatus(title, sub, badge, tone) {
    const t = $('#game-status');
    if (t) t.textContent = title;
    if (sub) { const s = $('#game-status-sub'); if (s) s.textContent = sub; }
    const b = $('#turn-badge');
    if (b && badge) {
      b.textContent = badge;
      b.className = 'badge ' + (tone || '');
    }
  }

  function updateStatus() {
    if (G.viewIndex < G.history.length) {
      setStatus('Reviewing the game', `Move ${G.viewIndex} of ${G.history.length}`, 'Review', 'badge-blue');
      return;
    }
    if (G.over) {
      const info = G.overInfo || {};
      setStatus('Game over', info.reason || 'The game has ended.', info.badge || 'Finished', 'badge');
      return;
    }
    const turnName = G.game.turn === 'w' ? 'White' : 'Black';
    const check = G.game.inCheck(G.game.turn);
    if (G.config.mode === 'computer') {
      if (G.game.turn === G.userColor) {
        setStatus(check ? 'You are in check' : 'Your move', `Rapid · ${G.config.tc} · ${G.config.rated ? 'Rated' : 'Casual'}`, check ? 'Check!' : `${turnName} to move`, check ? 'badge-red' : 'badge-green');
      } else {
        setStatus('Gambit Bot is thinking…', `Level ${G.config.level} · ${LEVELS[G.config.level].name}`, check ? 'Check!' : `${turnName} to move`, check ? 'badge-red' : 'badge-gold');
      }
    } else {
      setStatus(check ? 'Check!' : `${turnName} to move`, `Local game · ${G.config.tc}`, check ? 'Check!' : `${turnName} to move`, check ? 'badge-red' : 'badge-green');
    }
  }

  function updateClocks() {
    const top = $('#clock-top');
    const bottom = $('#clock-bottom');
    if (!top || !bottom) return;
    top.textContent = fmtClock(G.clocks[G.topColor], !G.over && G.game.turn === G.topColor);
    bottom.textContent = fmtClock(G.clocks[G.bottomColor], !G.over && G.game.turn === G.bottomColor);
    const activeColor = G.over ? null : G.game.turn;
    top.classList.toggle('active', activeColor === G.topColor);
    bottom.classList.toggle('active', activeColor === G.bottomColor);
    top.classList.toggle('low', G.clocks[G.topColor] <= 20000 && G.clocks[G.topColor] > 0);
    bottom.classList.toggle('low', G.clocks[G.bottomColor] <= 20000 && G.clocks[G.bottomColor] > 0);
  }

  function startTimer() {
    if (G.timer) return;
    G.timer = setInterval(() => {
      if (G.over || !G.started || !G.activeClock) return;
      G.clocks[G.activeClock] = Math.max(0, G.clocks[G.activeClock] - 100);
      if (G.clocks[G.activeClock] <= 0) {
        const loser = G.activeClock;
        endGame(loser === 'w' ? '0-1' : '1-0', 'timeout');
        return;
      }
      updateClocks();
    }, 100);
  }

  function updateCaptured() {
    const initial = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
    const counts = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0 }, b: { P: 0, N: 0, B: 0, R: 0, Q: 0 } };
    G.game.board.forEach((p) => { if (p && p[1] !== 'K') counts[p[0]][p[1]]++; });
    const missingFor = (color) => {
      let out = '';
      for (const t of ['Q', 'R', 'B', 'N', 'P']) {
        const n = Math.max(0, initial[t] - counts[color][t]);
        for (let i = 0; i < n; i++) out += `<i class="mini ${color}">${({ Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' })[t]}</i>`;
      }
      return out;
    };
    const topEl = $('#top-captured');
    const botEl = $('#bottom-captured');
    if (topEl) topEl.innerHTML = `<span class="pieces">${missingFor(G.bottomColor)}</span>`;
    if (botEl) botEl.innerHTML = `<span class="pieces">${missingFor(G.topColor)}</span>`;
  }

  const OPENINGS = [
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Ruy López', plan: 'Pressure the knight on c6 and fight for the centre with d4.' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Italian Game', plan: 'Develop quickly, castle, and aim at the f7 square.' },
    { moves: ['e4', 'e5', 'Nf3', 'Nf6'], name: 'Petrov Defence', plan: 'Symmetric play — be ready for a quick queen trade on e5.' },
    { moves: ['e4', 'c5'], name: 'Sicilian Defence', plan: 'Black unbalances immediately; play for d4 and open lines.' },
    { moves: ['e4', 'e6'], name: 'French Defence', plan: 'Black builds a pawn chain; attack the base with e5 and c4.' },
    { moves: ['e4', 'c6'], name: 'Caro-Kann Defence', plan: 'Solid structure — develop the bishop before ...e6.' },
    { moves: ['e4', 'd5'], name: 'Scandinavian Defence', plan: 'Black challenges e4 at once; develop with tempo after the trade.' },
    { moves: ['d4', 'd5', 'c4'], name: "Queen's Gambit", plan: 'Offer the c-pawn to dominate the centre. Develop and castle.' },
    { moves: ['d4', 'Nf6', 'c4', 'g6'], name: "King's Indian Defence", plan: 'Black attacks the centre later. Space on the queenside matters.' },
    { moves: ['d4', 'Nf6', 'c4', 'e6'], name: 'Indian Defence', plan: 'Flexible setup — control e4 and develop harmoniously.' },
    { moves: ['c4'], name: 'English Opening', plan: 'A reverse Sicilian. Slow pressure on the light squares.' },
    { moves: ['Nf3'], name: 'Réti Opening', plan: 'Hypermodern control — let Black occupy the centre, then hit it.' }
  ];
  function detectOpening() {
    const sans = G.history.map((h) => h.san.replace(/[+#]/g, ''));
    for (const o of OPENINGS) {
      if (o.moves.every((m, i) => sans[i] === m)) return o;
    }
    if (sans[0] === 'e4') return { name: "King's Pawn Opening", plan: 'Fight for the centre and develop your minor pieces.' };
    if (sans[0] === 'd4') return { name: "Queen's Pawn Opening", plan: 'Build a broad centre and support it with pieces.' };
    return null;
  }

  function updateOpening() {
    const found = detectOpening();
    const name = found ? found.name : (G.history.length ? 'Opening' : 'Starting position');
    const plan = found ? found.plan : 'Develop your pieces, control the centre, keep your king safe.';
    ['#opening-name', '#opening-name-2'].forEach((sel) => { const el = $(sel); if (el) el.textContent = name; });
    const planEl = $('#opening-plan'); if (planEl) planEl.textContent = plan;
  }

  function renderMoves() {
    const host = $('#move-table');
    const scroll = $('#moves-scroll');
    if (!host) return;
    if (!G.history.length) {
      host.innerHTML = `<div class="empty-state" style="padding:26px 10px">${icon('play')}<h4>No moves yet</h4><p>Make the first move to start the game.</p></div>`;
    } else {
      let rows = '';
      for (let i = 0; i < G.history.length; i += 2) {
        const a = G.history[i];
        const b = G.history[i + 1];
        const curA = G.viewIndex === i + 1 ? ' current' : '';
        const curB = b && G.viewIndex === i + 2 ? ' current' : '';
        rows += `<tr><td class="num">${i / 2 + 1}.</td><td class="mv${curA}" data-ply="${i}">${a.san}</td>${b ? `<td class="mv${curB}" data-ply="${i + 1}">${b.san}</td>` : '<td></td>'}</tr>`;
      }
      host.innerHTML = `<table class="move-table">${rows}</table>`;
    }
    const count = G.history.length;
    ['#moves-count', '#game-length'].forEach((sel) => { const el = $(sel); if (el) el.textContent = count + (count === 1 ? ' move' : ' moves'); });
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    const badge = $('#review-badge');
    if (badge) {
      badge.classList.toggle('show', G.viewIndex < G.history.length);
      const rm = $('#review-move'); if (rm) rm.textContent = G.viewIndex;
    }
  }

  function setBoardInteractive() {
    if (!G.board) return;
    const live = G.viewIndex >= G.history.length;
    const canMove = !G.over && live && (G.config.mode === 'local' || G.game.turn === G.userColor);
    G.board.setInteractive(canMove);
  }

  function syncBoard() {
    const pos = G.positions[G.viewIndex] || G.positions[0];
    if (!pos) return;
    G.board.setPosition(pos.fen, { last: pos.last || null, check: pos.check || null });
    setBoardInteractive();
    updateClocks();
    renderMoves();
    updateCaptured();
    updateStatus();
  }

  function addChat(who, text, system) {
    G.chats.push({ who, text, me: who === 'me', system: !!system });
    renderChat();
  }

  function renderChat() {
    const host = $('#game-chat');
    if (!host) return;
    host.innerHTML = G.chats.map((m) => {
      if (m.system) return `<div class="chat-msg system"><div class="bubble">${esc(m.text)}</div></div>`;
      const name = m.me ? 'You' : (G.config.mode === 'computer' ? 'Gambit Bot' : 'Opponent');
      const tone = m.me ? '' : 'tone-5';
      return `<div class="chat-msg ${m.me ? 'mine' : ''}">
        ${avatar({ name, tone })}
        <div class="bubble"><b>${name}</b>${esc(m.text)}</div>
      </div>`;
    }).join('');
    host.scrollTop = host.scrollHeight;
  }

  const BOT_LINES = [
    'Good luck! Let\'s have a clean game.',
    'That was a solid move.',
    'I did not see that coming.',
    'You are making me work for this one.',
    'Interesting choice — let\'s see where it goes.',
    'Nice pace. I like this position.',
    'gg either way. This is a good game.',
    'One slip and this could swing either way.'
  ];
  function botChatReply() {
    setTimeout(() => {
      if (G.over) return;
      addChat('bot', BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)]);
      Sound.play('notify');
    }, 1200 + Math.random() * 900);
  }

  function updatePlayerBars() {
    if (!G.board) return;
    const top = $('#top-name'), topBadge = $('#top-badge'), topSub = $('#top-sub'), topAv = $('#top-avatar');
    const bot = $('#bottom-name'), botBadge = $('#bottom-badge'), botSub = $('#bottom-sub'), botAv = $('#bottom-avatar');
    G.topColor = G.config.mode === 'computer' ? (G.userColor === 'w' ? 'b' : 'w') : 'b';
    G.bottomColor = G.config.mode === 'computer' ? G.userColor : 'w';

    if (G.config.mode === 'computer') {
      const lvl = LEVELS[G.config.level];
      if (top) top.innerHTML = `Gambit Bot <span class="badge" id="top-badge">Level ${G.config.level}</span>`;
      if (topSub) topSub.textContent = `Computer · ${lvl.name} · ${ratingFmt(lvl.rating)}`;
      if (topAv) { topAv.className = 'avatar tone-5'; topAv.textContent = 'GB'; }
      if (bot) bot.innerHTML = `${esc(user ? user.name : 'You')} <span class="badge badge-green" id="bottom-badge">${ratingFmt(user ? user.rating : 1842)}</span>`;
      if (botSub) botSub.textContent = `${G.userColor === 'w' ? 'White' : 'Black'} · You`;
      if (botAv) { botAv.className = 'avatar'; botAv.textContent = 'AM'; }
    } else {
      if (top) top.innerHTML = `Player 2 <span class="badge">Black</span>`;
      if (topSub) topSub.textContent = 'Local game';
      if (topAv) { topAv.className = 'avatar tone-3'; topAv.textContent = 'P2'; }
      if (bot) bot.innerHTML = `Player 1 <span class="badge badge-green">White</span>`;
      if (botSub) botSub.textContent = 'Local game';
      if (botAv) { botAv.className = 'avatar'; botAv.textContent = 'P1'; }
    }
    const modeLabel = $('#game-mode-label');
    if (modeLabel) modeLabel.innerHTML = `<span data-icon="crosshair"></span> ${G.config.mode === 'computer' ? 'vs Computer' : 'Two players'}`;
    window.Gambit.hydrateIcons(modeLabel);
    updateClocks();
  }

  function startGame(config, silent) {
    G.botToken++;
    Object.assign(G.config, config || {});
    const t = tcParts(G.config.tc);
    G.game = new window.Chess();
    G.history = [];
    G.positions = [{ fen: G.game.fen(), last: null, check: null }];
    G.viewIndex = 0;
    G.over = false;
    G.overInfo = null;
    G.started = false;
    G.startedAt = null;
    G.increment = t.inc;
    G.clocks = { w: t.base, b: t.base };
    G.activeClock = null;
    G.chats = [];
    G.userColor = G.config.mode === 'computer'
      ? (G.config.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : G.config.color === 'black' ? 'b' : 'w')
      : 'w';

    if (G.timer) { clearInterval(G.timer); G.timer = null; }

    if (!G.board) {
      G.board = new window.ChessBoard('#play-board', {
        fen: G.game.fen(),
        orientation: G.userColor === 'b' ? 'black' : 'white',
        interactive: true,
        boardTheme: settings.boardTheme,
        onMove: handleBoardMove
      });
    } else {
      G.board.setPosition(G.game.fen(), { orientation: G.userColor === 'b' ? 'black' : 'white', last: null, check: null });
    }

    updatePlayerBars();
    const ratedBadge = $('#rated-badge');
    if (ratedBadge) {
      ratedBadge.textContent = G.config.rated ? 'Rated' : 'Casual';
      ratedBadge.className = 'badge ' + (G.config.rated ? 'badge-green' : 'badge');
    }
    const tcBadge = $('#tc-badge'); if (tcBadge) tcBadge.textContent = G.config.tc;
    const setup = $('#setup-summary');
    if (setup) setup.textContent = `${G.config.mode === 'computer' ? 'Computer' : 'Local'} · ${G.config.tc}`;
    addChat('system', 'Game started. Good luck and have fun!');
    if (G.config.mode === 'computer') {
      setTimeout(() => { if (!G.over && G.chats.length === 1) addChat('bot', 'Good luck! I promise to make it interesting.'); }, 800);
    }
    syncBoard();
    updateOpening();
    if (user && G.config.mode === 'computer') {
      // nothing — rating display already handled
    }
    if (G.config.mode === 'computer' && G.game.turn !== G.userColor) maybeBotMove();
    if (!silent) {
      const colour = G.config.mode === 'local' ? 'White' : (G.userColor === 'w' ? 'White' : 'Black');
      toast(`New game — you are <b>${colour}</b> · ${G.config.tc}.`, 'success', 'play');
    }
  }

  function applyEngineMove(from, to, promotion, isBot) {
    if (G.over) return false;
    const wasLive = G.viewIndex >= G.history.length;
    const mover = G.game.turn;
    const entry = G.game.move(from, to, promotion);
    if (!entry) return false;
    G.history.push(entry);
    const checkSq = G.game.inCheck(G.game.turn) ? sqName(G.game.kingSquare(G.game.turn)) : null;
    G.positions.push({ fen: G.game.fen(), last: { from: entry.from, to: entry.to }, check: checkSq });

    if (!G.started) { G.started = true; G.startedAt = Date.now(); }
    G.clocks[mover] = Math.min(tcParts(G.config.tc).base, G.clocks[mover] + G.increment);
    G.activeClock = G.game.turn;
    startTimer();

    if (wasLive) {
      G.viewIndex = G.history.length;
      G.board.setPosition(G.game.fen(), {
        last: { from: entry.from, to: entry.to },
        check: checkSq
      });
    }

    if (entry.captured) Sound.play('capture');
    else Sound.play('move');
    if (checkSq) Sound.play('check');

    updateClocks();
    updateCaptured();
    renderMoves();
    updateOpening();
    updateStatus();

    const st = G.game.status();
    if (st.over) {
      endGame(st.result, st.reason);
      return true;
    }

    updateStatus();
    setBoardInteractive();

    if (G.config.mode === 'computer' && G.game.turn !== G.userColor) maybeBotMove();
    return true;
  }

  function handleBoardMove(from, to, promotion) {
    if (G.over || G.viewIndex < G.history.length) return;
    if (G.config.mode === 'computer' && G.game.turn !== G.userColor) return;
    const ok = applyEngineMove(from, to, promotion, false);
    if (ok && G.config.mode === 'computer' && Math.random() < 0.16) botChatReply();
  }

  function maybeBotMove() {
    if (G.over || G.config.mode !== 'computer' || G.game.turn === G.userColor) return;
    const token = ++G.botToken;
    G.board.setInteractive(false);
    updateStatus();
    const lvl = LEVELS[G.config.level];
    const snapshot = G.game;
    setTimeout(() => {
      if (G.over || token !== G.botToken || G.game !== snapshot) return;
      const move = G.game.bestMove({ depth: lvl.depth, randomness: lvl.randomness });
      if (!move) return;
      if (token !== G.botToken) return;
      applyEngineMove(U.sqName(move.from), U.sqName(move.to), move.promotion, true);
      setBoardInteractive();
    }, 380 + Math.random() * 620);
  }

  function endGame(result, reason) {
    if (G.over) return;
    G.over = true;
    G.botToken++;
    G.activeClock = null;
    if (G.timer) { clearInterval(G.timer); G.timer = null; }
    G.board.setInteractive(false);

    const winner = result === '1-0' ? 'w' : result === '0-1' ? 'b' : null;
    let outcome = 'draw';
    if (winner) {
      if (G.config.mode === 'local') outcome = 'win';
      else outcome = winner === G.userColor ? 'win' : 'loss';
    }

    let delta = 0;
    if (G.config.rated && G.config.mode === 'computer') {
      delta = outcome === 'win' ? 6 + Math.floor(Math.random() * 5) : outcome === 'loss' ? -(5 + Math.floor(Math.random() * 4)) : Math.floor(Math.random() * 3);
      if (user) {
        user.rating = Math.max(400, (user.rating || 1842) + delta);
        window.Gambit.Store.set('gambit.user', user);
        window.Gambit.renderHeader();
      }
    }

    const label = winner ? (winner === 'w' ? 'White' : 'Black') + ' wins' : 'Draw';
    const prettyReason = {
      checkmate: 'Checkmate', stalemate: 'Stalemate', timeout: 'Time out',
      resignation: 'Resignation', 'insufficient material': 'Insufficient material',
      'fifty-move rule': 'Fifty-move rule', agreement: 'Draw agreed', 'threefold repetition': 'Repetition'
    }[reason] || reason;
    G.overInfo = { result, reason: `${label} · ${prettyReason}`, badge: label };
    updateStatus();

    const duration = G.startedAt ? Math.max(1, Math.round((Date.now() - G.startedAt) / 1000)) : 0;
    const dur = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;

    const modal = $('#game-over-modal');
    const iconEl = $('#result-icon');
    const headline = $('#result-headline');
    const reasonEl = $('#result-reason');
    const ratingEl = $('#result-rating');
    const showResult = () => {
      if (iconEl) {
        iconEl.className = 'result-icon ' + (outcome === 'loss' ? 'loss' : outcome === 'draw' ? 'draw' : '');
        iconEl.innerHTML = icon(outcome === 'loss' ? 'flag' : outcome === 'draw' ? 'shield' : 'trophy');
      }
      if (headline) {
        headline.textContent = G.config.mode === 'local'
          ? (winner ? `${winner === 'w' ? 'White' : 'Black'} wins` : 'A draw')
          : outcome === 'win' ? 'You won!' : outcome === 'loss' ? 'You lost' : 'A draw';
      }
      if (reasonEl) reasonEl.textContent = `${prettyReason} · ${G.history.length} moves`;
      if (ratingEl) {
        ratingEl.style.display = delta === 0 ? 'none' : '';
        ratingEl.className = 'result-rating' + (delta < 0 ? ' loss' : '');
        ratingEl.innerHTML = `${icon(delta < 0 ? 'trend' : 'trend')} ${delta > 0 ? '+' : ''}${delta} rating${window.Gambit.settings.sound ? '' : ''}`;
      }
      const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
      setText('#result-moves', G.history.length);
      setText('#result-accuracy', (72 + Math.floor(Math.random() * 20)) + '%');
      setText('#result-time', dur);
      window.Gambit.openModal('game-over-modal');
    };

    if (outcome === 'win') Sound.play('win');
    else if (outcome === 'loss') Sound.play('loss');
    else Sound.play('check');

    setTimeout(showResult, 620);
  }

  function goToPly(ply) {
    G.viewIndex = Math.max(0, Math.min(G.history.length, ply + 1));
    syncBoard();
  }
  function reviewStep(dir) {
    if (dir === 'first') G.viewIndex = 0;
    if (dir === 'prev') G.viewIndex = Math.max(0, G.viewIndex - 1);
    if (dir === 'next') G.viewIndex = Math.min(G.history.length, G.viewIndex + 1);
    if (dir === 'last') G.viewIndex = G.history.length;
    syncBoard();
  }
  function returnLive() {
    G.viewIndex = G.history.length;
    syncBoard();
  }

  function undoMove() {
    if (!G.history.length || G.over) return;
    let remove = 1;
    if (G.config.mode === 'computer') {
      remove = G.game.turn === G.userColor ? 2 : 1;
    }
    remove = Math.min(remove, G.history.length);
    const keep = G.history.slice(0, G.history.length - remove);
    const game = new window.Chess();
    const positions = [{ fen: game.fen(), last: null, check: null }];
    const rebuilt = [];
    for (const mv of keep) {
      const entry = game.move(mv.from, mv.to, mv.promotion);
      if (!entry) break;
      rebuilt.push(entry);
      const check = game.inCheck(game.turn) ? sqName(game.kingSquare(game.turn)) : null;
      positions.push({ fen: game.fen(), last: { from: entry.from, to: entry.to }, check });
    }
    G.game = game;
    G.history = rebuilt;
    G.positions = positions;
    G.viewIndex = G.history.length;
    G.over = false;
    G.overInfo = null;
    G.started = rebuilt.length > 0;
    syncBoard();
    toast('Move taken back.', 'info', 'undo');
    if (G.config.mode === 'computer' && G.game.turn !== G.userColor) maybeBotMove();
  }

  function hint() {
    if (G.over || G.viewIndex < G.history.length) return;
    if (G.config.mode === 'computer' && G.game.turn !== G.userColor) return;
    const best = G.game.bestMove({ depth: 2 });
    if (!best) return;
    const from = U.sqName(best.from), to = U.sqName(best.to);
    G.board.setLast({ from, to });
    G.board.setInteractive(true);
    const san = G.game.san(best);
    toast(`Try looking at <b>${san}</b> — ${from} → ${to}.`, 'info', 'sparkles');
  }

  function resign() {
    if (G.over) return;
    const loser = G.config.mode === 'local' ? G.game.turn : G.userColor;
    window.Gambit.confirm({
      title: 'Resign this game?',
      text: 'Your opponent will be awarded the win. You can always start a fresh game.',
      confirm: 'Resign',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      endGame(loser === 'w' ? '0-1' : '1-0', 'resignation');
    });
  }

  function offerDraw() {
    if (G.over) return;
    if (G.config.mode === 'local') {
      window.Gambit.confirm({ title: 'Agree to a draw?', text: 'Both players agree to split the point.', confirm: 'Agree draw' }).then((ok) => { if (ok) endGame('1/2-1/2', 'agreement'); });
      return;
    }
    toast('Draw offer sent…', 'info', 'shield');
    setTimeout(() => {
      if (G.over) return;
      if (G.history.length >= 30) {
        toast('Your opponent accepts the draw.', 'success', 'shield');
        endGame('1/2-1/2', 'agreement');
      } else {
        toast('Gambit Bot declines the draw. Play on!', 'info', 'sword');
      }
    }, 1500);
  }

  function copyPGN() {
    let pgn = `[Event "Gambit ${G.config.rated ? 'Rated' : 'Casual'} Game"]\n[Site "Gambit"]\n[Date "${new Date().toISOString().slice(0, 10)}"]\n[White "${G.config.mode === 'local' ? 'Player 1' : G.userColor === 'w' ? (user ? user.name : 'You') : 'Gambit Bot'}"]\n[Black "${G.config.mode === 'local' ? 'Player 2' : G.userColor === 'b' ? (user ? user.name : 'You') : 'Gambit Bot'}"]\n[Result "${G.overInfo ? G.overInfo.result : '*'}"]\n\n`;
    for (let i = 0; i < G.history.length; i += 2) {
      pgn += `${i / 2 + 1}. ${G.history[i].san} ${G.history[i + 1] ? G.history[i + 1].san : ''} `;
    }
    if (navigator.clipboard) navigator.clipboard.writeText(pgn.trim()).catch(() => {});
    toast('PGN copied to clipboard.', 'success', 'copy');
  }

  function renderPlayFriends(query) {
    const host = $('#play-friends');
    if (!host) return;
    const q = (query || '').toLowerCase();
    const list = window.Gambit.friends.filter((f) => !q || f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q));
    host.innerHTML = list.map((f) => `
      <div class="panel-friend">
        <span style="position:relative">${avatar(f)}<span class="status-dot ${f.status}" style="position:absolute;bottom:0;right:0"></span></span>
        <div class="grow"><b>${esc(f.name)}</b><span>${f.status === 'playing' ? 'In a game' : ratingFmt(f.rating) + ' · ' + f.activity}</span></div>
        <button data-challenge="${f.id}" aria-label="Challenge ${esc(f.name)}" ${f.status === 'playing' ? 'disabled style="opacity:.35"' : ''}>${icon('sword')}</button>
      </div>`).join('') || `<div class="empty-state">${icon('users')}<h4>No friends found</h4><p>Try a different name.</p></div>`;
  }

  function setConfigUI() {
    $$('#time-grid .time-opt').forEach((el) => el.classList.toggle('active', el.dataset.time === G.config.tc));
    $$('[data-play-color]').forEach((el) => el.classList.toggle('active', el.dataset.playColor === G.config.color));
    $$('#mode-pills button').forEach((el) => el.classList.toggle('active', el.dataset.mode === G.config.mode));
    $$('#level-dots i').forEach((el) => el.classList.toggle('on', parseInt(el.dataset.level, 10) <= G.config.level));
    const label = $('#level-label');
    if (label) label.textContent = `Level ${G.config.level} · ${LEVELS[G.config.level].name}`;
    const sw = $('#rated-switch'); if (sw) sw.classList.toggle('on', G.config.rated);
    const setup = $('#setup-summary'); if (setup) setup.textContent = `${G.config.mode === 'computer' ? 'Computer' : 'Local'} · ${G.config.tc}`;
    const tcBadge = $('#tc-badge'); if (tcBadge) tcBadge.textContent = G.config.tc;
    const ratedBadge = $('#rated-badge');
    if (ratedBadge) { ratedBadge.textContent = G.config.rated ? 'Rated' : 'Casual'; ratedBadge.className = 'badge ' + (G.config.rated ? 'badge-green' : ''); }
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-play-tab]');
    if (tab) {
      $$('[data-play-tab]').forEach((b) => b.classList.toggle('active', b === tab));
      $$('[data-play-pane]').forEach((p) => p.classList.toggle('active', p.dataset.playPane === tab.dataset.playTab));
      if (tab.dataset.playTab === 'moves') renderMoves();
      return;
    }
    const time = e.target.closest('#time-grid .time-opt');
    if (time) { G.config.tc = time.dataset.time; setConfigUI(); return; }
    const color = e.target.closest('[data-play-color]');
    if (color) { G.config.color = color.dataset.playColor; setConfigUI(); return; }
    const mode = e.target.closest('#mode-pills button');
    if (mode) { G.config.mode = mode.dataset.mode; setConfigUI(); return; }
    const level = e.target.closest('#level-dots i');
    if (level) { G.config.level = parseInt(level.dataset.level, 10); setConfigUI(); return; }
    if (e.target.closest('#rated-switch')) { G.config.rated = !G.config.rated; setConfigUI(); return; }
    if (e.target.closest('#start-game')) { startGame(G.config); return; }
    if (e.target.closest('#rematch-btn')) { window.Gambit.closeModal('game-over-modal'); startGame(G.config); return; }

    const pgn = e.target.closest('[data-ply]');
    if (pgn) { goToPly(parseInt(pgn.dataset.ply, 10)); return; }
    const rev = e.target.closest('[data-review]');
    if (rev) { reviewStep(rev.dataset.review); return; }

    const action = e.target.closest('[data-play-action]');
    if (action) {
      switch (action.dataset.playAction) {
        case 'flip': if (G.board) G.board.flip(); break;
        case 'undo': undoMove(); break;
        case 'hint': hint(); break;
        case 'resign': resign(); break;
        case 'draw': offerDraw(); break;
        case 'copy-pgn': copyPGN(); break;
        case 'new-game':
          $$('[data-play-tab]').forEach((b) => b.classList.toggle('active', b.dataset.playTab === 'new'));
          $$('[data-play-pane]').forEach((p) => p.classList.toggle('active', p.dataset.playPane === 'new'));
          break;
        case 'return-live': returnLive(); break;
      }
      return;
    }

    const say = e.target.closest('[data-say]');
    if (say) {
      addChat('me', say.dataset.say);
      if (G.config.mode === 'computer') botChatReply();
      return;
    }

    const preset = e.target.closest('.preset-tc');
    if (preset) { G.config.tc = preset.dataset.tc; startGame(G.config); }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'game-chat-form') {
      e.preventDefault();
      const input = $('#game-chat-input');
      if (input && input.value.trim()) {
        addChat('me', input.value.trim());
        input.value = '';
        if (G.config.mode === 'computer') botChatReply();
      }
    }
  });

  const friendSearch = $('#play-friend-search');
  if (friendSearch) friendSearch.addEventListener('input', (e) => renderPlayFriends(e.target.value));

  /* ---------------- boot ---------------- */
  renderPlayFriends('');
  setConfigUI();
  const params = new URLSearchParams(location.search);
  const modeParam = params.get('mode');
  const tcParam = params.get('tc');
  if (tcParam && /^\d+\+\d+$/.test(tcParam)) G.config.tc = tcParam;
  if (modeParam === 'local') G.config.mode = 'local';
  if (modeParam === 'friend') setTimeout(() => window.Gambit.openFriends('online'), 600);
  startGame(G.config, true);
  renderChat();
})();
