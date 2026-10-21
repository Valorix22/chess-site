(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const G = window.Gambit;
  const U = window.ChessUtils;
  const { icon, toast, Sound, Store, ratingFmt, esc } = G;
  const PUZZLES = window.GAMBIT.puzzles;
  const DAY = 86400000;
  const todayKey = () => new Date().toISOString().slice(0, 10);

  const DEFAULT_PROGRESS = {
    rating: 2108,
    streak: 12,
    bestStreak: 27,
    solved: 1284,
    lastSolved: null,
    solvedIds: {}
  };

  const progress = Object.assign({}, DEFAULT_PROGRESS, Store.get('gambit.puzzleProgress', {}));
  progress.solvedIds = Object.assign({}, progress.solvedIds || {});
  if (!progress.solved) progress.solved = DEFAULT_PROGRESS.solved;

  const state = {
    index: 0,
    game: null,
    board: null,
    step: 0,
    attempts: 0,
    hints: 0,
    score: 100,
    solved: false,
    revealed: false,
    awaiting: false,
    wrongSan: null,
    line: [],
    last: null,
    timer: null,
    filter: 'All',
    mode: null,
    sessionSolved: new Set()
  };

  const sideToMove = () => (state.game && state.game.turn === 'b' ? 'Black' : 'White');
  const current = () => PUZZLES[state.index];
  const moveWord = (n) => n + (n === 1 ? ' move' : ' moves');
  const sideWord = (n) => n + (n === 1 ? ' move' : ' moves');

  function save() {
    Store.set('gambit.puzzleProgress', progress);
  }

  /* ---------------------------------------------------------
     Rendering
     --------------------------------------------------------- */
  function renderStats() {
    const rating = $('#puzzle-rating');
    const streak = $('#puzzle-streak');
    const solved = $('#puzzle-solved');
    if (rating) rating.textContent = ratingFmt(progress.rating);
    if (streak) streak.textContent = `${progress.streak} day${progress.streak === 1 ? '' : 's'}`;
    if (solved) solved.textContent = ratingFmt(progress.solved);
    const delta = $('#rating-delta');
    if (delta) {
      const day = new Date().getDay();
      delta.textContent = progress.streak > 0 ? '+64 this week' : 'Start a new run';
    }
    renderStreakDays();
  }

  function renderStreakDays() {
    const host = $('#streak-days');
    if (!host) return;
    const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const last = progress.lastSolved || '';
    const solvedToday = last === todayKey();
    const done = Math.min(6, Math.max(0, progress.streak > 0 ? 6 : 0));
    host.innerHTML = labels.map((label, i) => {
      const isToday = i === 6;
      let cls = i < done ? 'done' : '';
      if (isToday) cls += ' today' + (solvedToday ? ' done' : '');
      return `<i class="${cls.trim()}" title="${isToday ? 'Today' : 'Previous day'}">${label}</i>`;
    }).join('');
  }

  function renderPuzzleList() {
    const host = $('#puzzle-list');
    if (!host) return;
    const list = PUZZLES.map((p, i) => ({ p, i })).filter(({ p }) => state.filter === 'All' || p.theme === state.filter);
    host.innerHTML = list.map(({ p, i }) => {
      const isDone = !!progress.solvedIds[p.id] || state.sessionSolved.has(p.id);
      return `<div class="puzzle-list-item ${i === state.index ? 'active' : ''} ${isDone ? 'done' : ''}" data-puzzle-index="${i}" role="button" tabindex="0">
        <span class="num">${isDone ? icon('check') : i + 1}</span>
        <div class="grow"><b>${esc(p.title)}</b><span>${esc(p.theme)}</span></div>
        <span class="r">${ratingFmt(p.rating)}</span>
      </div>`;
    }).join('') || `<div class="tiny muted" style="padding:14px 10px;text-align:center">No puzzles in this theme yet.</div>`;
    const count = $('#session-count');
    if (count) count.textContent = `${state.sessionSolved.size} / ${PUZZLES.length}`;
  }

  function renderDots() {
    const host = $('#puzzle-dots');
    if (!host) return;
    const list = PUZZLES.map((p, i) => ({ p, i })).filter(({ p }) => state.filter === 'All' || p.theme === state.filter);
    host.innerHTML = list.map(({ p, i }) => {
      const done = !!progress.solvedIds[p.id] || state.sessionSolved.has(p.id);
      return `<button class="puzzle-dot ${i === state.index ? 'active' : ''} ${done ? 'done' : ''}" data-puzzle-index="${i}" aria-label="Puzzle ${i + 1}${done ? ' solved' : ''}"></button>`;
    }).join('');
  }

  function renderThemes() {
    const host = $('#theme-chips');
    if (!host) return;
    const themes = ['All'].concat(Array.from(new Set(PUZZLES.map((p) => p.theme))));
    host.innerHTML = themes.map((theme) => {
      const label = theme === 'All' ? 'All themes' : theme.replace(' mate', '');
      return `<button class="chip ${state.filter === theme ? 'active' : ''}" data-puzzle-theme="${esc(theme)}">${esc(label)}</button>`;
    }).join('');
  }

  function renderSolution() {
    const host = $('#solution-moves');
    const status = $('#solution-status');
    if (!host) return;

    let html = state.line.map((m) => `<span class="solution-move correct">${esc(m.san)}</span>`).join('');
    if (state.wrongSan && !state.solved) html += `<span class="solution-move wrong">${esc(state.wrongSan)}</span>`;

    if (!state.line.length && !state.wrongSan) {
      html = `<span class="tiny muted" style="font-style:italic">Find the winning line…</span>`;
    }
    host.innerHTML = html;

    if (status) {
      if (state.solved) status.textContent = `Solved · ${moveWord(Math.ceil(current().solution.length / 2))}`;
      else if (state.revealed) status.textContent = 'Solution shown';
      else if (state.awaiting) status.textContent = 'Opponent replies…';
      else if (state.wrongSan) status.textContent = 'Not quite — try again';
      else if (state.line.length) status.textContent = `Move ${Math.floor(state.step / 2) + 1}…`;
      else status.textContent = 'Waiting for your move';
    }
  }

  function renderPrompt() {
    const p = current();
    const prompt = $('.puzzle-prompt b');
    const sub = $('#prompt-sub');
    if (prompt) {
      prompt.textContent = state.solved ? 'Puzzle solved' : state.revealed ? 'Solution revealed' : 'Find the best move';
    }
    if (sub) {
      sub.textContent = state.solved
        ? `${p.theme} · ${Math.ceil(p.solution.length / 2)} move finish`
        : `${sideToMove()} to play · ${p.moves === 1 ? 'one move wins' : moveWord(Math.ceil(p.solution.length / 2))}`;
    }
    const turn = $('#puzzle-turn');
    if (turn) {
      const check = state.game && state.game.inCheck(state.game.turn);
      turn.innerHTML = `<span class="status-dot ${state.solved ? 'online' : check ? 'busy' : 'online'}"></span> ${state.solved ? 'Solved' : check ? 'Check — keep going' : sideToMove() + ' to move'}`;
    }
  }

  function render() {
    const p = current();
    if (!p) return;
    const number = $('#puzzle-number');
    const theme = $('#puzzle-theme');
    const rated = $('#puzzle-rated');
    const metaRating = $('#meta-rating');
    const metaTheme = $('#meta-theme');
    const tip = $('#puzzle-tip');
    const attempts = $('#attempt-count');
    const score = $('#score-value');
    const hintBox = $('#hint-box');
    const hintText = $('#hint-text');

    if (number) number.textContent = `Puzzle #${state.index + 1}`;
    if (theme) theme.textContent = p.theme;
    if (rated) rated.textContent = `Rated ${ratingFmt(p.rating)}`;
    if (metaRating) metaRating.textContent = ratingFmt(p.rating);
    if (metaTheme) metaTheme.textContent = p.theme.replace(' mate', '');
    if (attempts) attempts.textContent = state.attempts;
    if (score) score.textContent = state.solved ? `${state.score} pts` : state.revealed ? '0 pts' : `${state.score} pts`;
    if (hintBox) hintBox.style.display = state.hints > 0 ? '' : 'none';
    if (hintText) hintText.textContent = p.hint;

    if (tip) {
      if (state.solved) tip.textContent = p.line;
      else if (state.revealed) tip.textContent = `Solution: ${p.line}`;
      else if (state.hints && state.wrongSan) tip.textContent = `Hint: ${p.hint}`;
      else if (state.wrongSan) tip.textContent = 'That move does not win. Reset the position or use a hint — the puzzle is still live.';
      else if (state.hints) tip.textContent = `Hint: ${p.hint}`;
      else tip.textContent = 'Find the strongest move for ' + sideToMove() + '. There is only one winning continuation.';
    }

    renderStats();
    renderSolution();
    renderPrompt();
    renderPuzzleList();
    renderDots();
    renderThemes();
    renderHUD();
  }

  /* ---------------------------------------------------------
     Board + puzzle flow
     --------------------------------------------------------- */
  function updateBoard(extraCheck) {
    const check = state.game.inCheck(state.game.turn) ? U.sqName(state.game.kingSquare(state.game.turn)) : extraCheck || null;
    state.board.setPosition(state.game.fen(), { last: state.last, check });
  }

  function highlightHint() {
    if (!state.board || !current()) return;
    const btn = state.board.el.querySelector(`.sq[data-square="${current().solution[state.step][0]}"]`);
    if (btn) btn.classList.add('hint-src');
  }

  function loadPuzzle(index) {
    clearTimeout(state.timer);
    state.timer = null;
    state.index = Math.max(0, Math.min(PUZZLES.length - 1, index));
    const p = current();
    state.game = new window.Chess(p.fen);
    state.step = 0;
    state.attempts = state.attempts || 0;
    state.score = 100;
    state.solved = false;
    state.revealed = false;
    state.awaiting = false;
    state.wrongSan = null;
    state.line = [];
    state.last = null;

    if (!state.board) {
      state.board = new window.ChessBoard('#puzzle-board', {
        fen: p.fen,
        orientation: sideToMove() === 'Black' ? 'black' : 'white',
        interactive: true,
        onMove: onBoardMove
      });
    } else {
      state.board.setPosition(p.fen, {
        last: null,
        check: null,
        orientation: sideToMove() === 'Black' ? 'black' : 'white'
      });
      state.board.setInteractive(true);
    }
    render();
  }

  function onBoardMove(from, to, promotion) {
    if (state.solved || state.revealed || state.awaiting) return;
    const p = current();
    const expected = p.solution[state.step];
    if (!expected) return;

    if (from === expected[0] && to === expected[1] && (!promotion || promotion === (expected[2] || 'Q'))) {
      playSolutionMove(from, to, true);
    } else {
      wrongMove(from, to);
    }
  }

  function playSolutionMove(from, to, byUser) {
    const p = current();
    const move = state.game.move(from, to);
    if (!move) {
      wrongMove(from, to);
      return;
    }

    state.line.push({ san: move.san, byUser });
    state.step += 1;
    state.last = { from, to };
    state.wrongSan = null;
    state.board.setPosition(state.game.fen(), {
      last: state.last,
      check: state.game.inCheck(state.game.turn) ? U.sqName(state.game.kingSquare(state.game.turn)) : null
    });

    if (move.captured) Sound.play('capture');
    else if (move.san.includes('+') || move.san.includes('#')) Sound.play('check');
    else Sound.play('move');

    render();

    if (state.step >= p.solution.length) {
      finishSolved();
      return;
    }

    if (byUser) {
      state.awaiting = true;
      state.board.setInteractive(false);
      render();
      const reply = p.solution[state.step];
      state.timer = setTimeout(() => {
        state.awaiting = false;
        playSolutionMove(reply[0], reply[1], false);
      }, 520);
    } else {
      if (state.step < p.solution.length) {
        state.board.setInteractive(true);
      }
      render();
    }
  }

  function wrongMove(from, to) {
    if (state.solved || state.revealed || state.awaiting) return;
    const p = current();
    const legal = state.game.findMove(from, to);
    state.attempts += 1;
    state.score = Math.max(0, state.score - 12);
    state.wrongSan = legal ? state.game.san(legal) : `${from}–${to}`;
    state.last = null;

    const wrap = state.board && state.board.el.querySelector('.board-wrap');
    if (wrap) {
      wrap.classList.remove('shake');
      void wrap.offsetWidth;
      wrap.classList.add('shake');
      setTimeout(() => wrap.classList.remove('shake'), 500);
    }
    if (state.board) state.board.setPosition(p.fen, { last: null, check: null });
    Sound.play('notify');
    toast('Not the winning move. The position is still live — try again.', 'error', 'puzzle');
    render();
    if (state.mode) endRun('wrong');
  }

  function finishSolved() {
    const p = current();
    if (state.solved) return;
    state.solved = true;
    state.revealed = false;
    state.awaiting = false;
    state.board.setInteractive(false);
    state.sessionSolved.add(p.id);

    const firstToday = progress.lastSolved !== todayKey();
    progress.solvedIds[p.id] = true;
    progress.solved += 1;
    progress.rating += ratingGain();
    if (firstToday) {
      progress.streak += 1;
      progress.lastSolved = todayKey();
      progress.bestStreak = Math.max(progress.bestStreak || 0, progress.streak);
    }
    save();
    Sound.play('win');
    render();

    if (state.mode) {
      state.mode.solved += 1;
      updateHUD();
      if (state.mode.type === 'rush') {
        clearTimeout(state.timer);
        state.timer = setTimeout(() => loadPuzzle((state.index + 1) % PUZZLES.length), 650);
      } else {
        if (state.mode.solved >= state.mode.target) {
          endRun('complete');
        } else {
          clearTimeout(state.timer);
          state.timer = setTimeout(() => loadPuzzle((state.index + 1) % PUZZLES.length), 650);
        }
      }
      return;
    }

    showSolvedModal();
  }

  function ratingGain() {
    if (state.revealed) return 0;
    const base = Math.round((state.score / 100) * 12);
    return Math.max(2, base - state.hints * 2);
  }

  function showSolvedModal() {
    const p = current();
    const perfect = state.attempts === 0 && state.hints === 0;
    const userMoves = Math.ceil(p.solution.length / 2);
    const headline = $('#solved-headline');
    const sub = $('#solved-sub');
    const line = $('#solved-line');
    const rating = $('#solved-rating');
    const ratingVal = $('#solved-rating-val');
    const streak = $('#solved-streak');
    const moves = $('#solved-moves');
    if (headline) headline.textContent = perfect ? 'Flawless finish.' : 'Nicely spotted.';
    if (sub) sub.textContent = perfect ? 'No hints, no misses. That is how you build a streak.' : 'Puzzle solved. Review the line, then keep the run going.';
    if (line) line.textContent = p.line;
    if (rating) rating.innerHTML = `${icon('trend')} +${ratingGain()} puzzle rating`;
    if (ratingVal) ratingVal.textContent = ratingFmt(progress.rating);
    if (streak) streak.textContent = `${progress.streak} days`;
    if (moves) moves.textContent = userMoves;
    setTimeout(() => G.openModal('puzzle-solved-modal'), 520);
  }

  function resetPuzzle() {
    clearTimeout(state.timer);
    state.timer = null;
    if (state.mode) endRun('reset');
    state.attempts = 0;
    state.hints = 0;
    loadPuzzle(state.index);
    toast('Position reset. Fresh eyes.', 'info', 'refresh');
  }

  function nextPuzzle() {
    G.closeModal('puzzle-solved-modal');
    if (state.mode) {
      loadPuzzle((state.index + 1) % PUZZLES.length);
      return;
    }
    const visible = PUZZLES.map((p, i) => ({ p, i })).filter(({ p }) => state.filter === 'All' || p.theme === state.filter);
    const at = visible.findIndex(({ i }) => i === state.index);
    const next = visible[(at + 1) % visible.length];
    loadPuzzle(next ? next.i : 0);
  }

  function showHint() {
    if (state.solved || state.revealed) return;
    if (!state.hints) {
      state.hints = 1;
      state.score = Math.max(0, state.score - 15);
      Sound.play('notify');
      toast('Hint unlocked — 15 points off this puzzle.', 'info', 'sparkles');
    } else {
      state.score = Math.max(0, state.score - 5);
      toast('Hint is already on the board.', 'info', 'sparkles');
    }
    render();
    highlightHint();
  }

  function showSolution() {
    if (state.solved) {
      toast('This one is already solved. Hit Next for a fresh puzzle.', 'info', 'check');
      return;
    }
    clearTimeout(state.timer);
    state.revealed = true;
    state.attempts += 1;
    state.score = 0;
    state.awaiting = false;
    state.wrongSan = null;
    state.board.setInteractive(false);
    if (state.mode) endRun('revealed');
    render();

    const p = current();
    let i = state.step;
    const step = () => {
      if (i >= p.solution.length) {
        state.revealed = true;
        render();
        toast('Solution shown. No rating change for this puzzle.', 'info', 'eye');
        return;
      }
      const mv = p.solution[i];
      const move = state.game.move(mv[0], mv[1]);
      if (move) {
        state.line.push({ san: move.san, byUser: i % 2 === 0 });
        state.step = i + 1;
        state.last = { from: mv[0], to: mv[1] };
        state.board.setPosition(state.game.fen(), {
          last: state.last,
          check: state.game.inCheck(state.game.turn) ? U.sqName(state.game.kingSquare(state.game.turn)) : null
        });
        render();
      }
      i += 1;
      state.timer = setTimeout(step, 620);
    };
    step();
  }

  /* ---------------------------------------------------------
     Rush / battle HUD
     --------------------------------------------------------- */
  function ensureHUD() {
    let hud = $('#run-hud');
    if (hud) return hud;
    hud = document.createElement('div');
    hud.id = 'run-hud';
    hud.className = 'run-hud';
    hud.innerHTML = `
      <span class="run-badge" id="run-label">${icon('bolt')} Puzzle Rush</span>
      <span class="run-stat"><b id="run-time">3:00</b><small>left</small></span>
      <span class="run-stat"><b id="run-solved">0</b><small>solved</small></span>
      <button class="run-end" data-puzzle-action="end-run" aria-label="End run">${icon('x')}</button>`;
    document.body.appendChild(hud);
    return hud;
  }

  function renderHUD() {
    const hud = $('#run-hud');
    if (!hud) return;
    if (!state.mode) {
      hud.classList.remove('show');
      return;
    }
    hud.classList.add('show');
    const label = $('#run-label');
    const time = $('#run-time');
    const solved = $('#run-solved');
    if (label) label.innerHTML = `${icon(state.mode.type === 'rush' ? 'bolt' : 'sword')} ${state.mode.type === 'rush' ? 'Puzzle Rush' : 'Puzzle Battle'}`;
    if (time) {
      if (state.mode.type === 'rush') {
        const ms = Math.max(0, state.mode.endsAt - Date.now());
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        time.textContent = `${m}:${String(s).padStart(2, '0')}`;
      } else {
        time.textContent = `${state.mode.solved}/${state.mode.target}`;
      }
    }
    if (solved) solved.textContent = state.mode.solved;
  }

  function updateHUD() { renderHUD(); }

  function startRush() {
    if (state.mode) endRun('restart');
    state.mode = { type: 'rush', endsAt: Date.now() + 180000, solved: 0, target: 999, interval: null };
    state.mode.interval = setInterval(() => {
      renderHUD();
      if (Date.now() >= state.mode.endsAt) endRun('time');
    }, 250);
    ensureHUD();
    loadPuzzle((state.index + 1) % PUZZLES.length);
    renderHUD();
    Sound.play('notify');
    toast('Puzzle Rush started — 3 minutes. One wrong move ends the run.', 'success', 'bolt');
  }

  function startBattle() {
    toast('Searching for an opponent near 2,108…', 'info', 'crosshair');
    setTimeout(() => {
      if (state.mode) return;
      if (Math.random() < 0.08) {
        toast('No opponent found. Try again in a moment.', 'error', 'users');
        return;
      }
      const rivals = ['Maya Chen', 'Diego Alvarez', 'Ingrid Larsen', 'Ravi Patel'];
      const rival = rivals[Math.floor(Math.random() * rivals.length)];
      state.mode = { type: 'battle', solved: 0, target: 5, rival, interval: null };
      ensureHUD();
      loadPuzzle(0);
      renderHUD();
      toast(`Matched with ${rival}. First to five puzzles wins!`, 'success', 'sword');
      Sound.play('win');
    }, 1600);
  }

  function endRun(reason) {
    if (!state.mode) return;
    clearInterval(state.mode.interval);
    const mode = state.mode;
    state.mode = null;
    const hud = $('#run-hud');
    if (hud) {
      hud.classList.remove('show');
      setTimeout(() => hud.remove(), 500);
    }
    if (reason === 'wrong') toast(`Run over — ${mode.solved} puzzle${mode.solved === 1 ? '' : 's'} solved. Wrong move ended it.`, 'error', 'puzzle');
    else if (reason === 'time') toast(`Time! You solved ${mode.solved} puzzle${mode.solved === 1 ? '' : 's'}.`, 'info', 'bolt');
    else if (reason === 'complete') toast(`Battle won — five in a row against ${mode.rival}. Flawless.`, 'success', 'trophy');
    else if (reason === 'reset' || reason === 'restart') toast('Run ended.', 'info', 'refresh');
  }

  function customSet() {
    const themes = Array.from(new Set(PUZZLES.map((p) => p.theme)));
    const chosen = window.prompt(`Build a custom set from: ${themes.join(', ')}\nType a theme, or leave blank for all.`, themes[1] || '');
    if (chosen === null) return;
    const match = themes.find((t) => t.toLowerCase().includes(chosen.trim().toLowerCase())) || 'All';
    state.filter = match;
    render();
    const first = PUZZLES.findIndex((p) => match === 'All' || p.theme === match);
    if (first >= 0) loadPuzzle(first);
    toast(match === 'All' ? 'Custom set: all themes.' : `Custom set created: ${match}.`, 'success', 'target');
  }

  /* ---------------------------------------------------------
     Events
     --------------------------------------------------------- */
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-puzzle-action]');
    if (action) {
      switch (action.dataset.puzzleAction) {
        case 'hint': showHint(); break;
        case 'solution': showSolution(); break;
        case 'reset': resetPuzzle(); break;
        case 'next': nextPuzzle(); break;
        case 'rush': startRush(); break;
        case 'battle': startBattle(); break;
        case 'custom': customSet(); break;
        case 'end-run': endRun('reset'); break;
      }
    }

    const listItem = e.target.closest('[data-puzzle-index]');
    if (listItem && !action) {
      if (state.mode) endRun('reset');
      G.closeModal('puzzle-solved-modal');
      state.attempts = 0;
      state.hints = 0;
      loadPuzzle(parseInt(listItem.dataset.puzzleIndex, 10));
      return;
    }

    const theme = e.target.closest('[data-puzzle-theme]');
    if (theme) {
      state.filter = theme.dataset.puzzleTheme;
      render();
      const first = PUZZLES.findIndex((p) => state.filter === 'All' || p.theme === state.filter);
      if (first >= 0) loadPuzzle(first);
      return;
    }

    if (e.target.closest('#next-from-modal')) {
      nextPuzzle();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'h' || e.key === 'H') showHint();
    if (e.key === 'n' || e.key === 'N') nextPuzzle();
    if (e.key === 'r' || e.key === 'R') resetPuzzle();
  });

  /* ---------------- boot ---------------- */
  loadPuzzle(0);
  renderStats();
})();
