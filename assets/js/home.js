(function () {
  'use strict';
  const { $, icon, avatar, ratingFmt, toast, friends, settings } = window.Gambit;
  const D = window.GAMBIT;

  // hero board — a sharp Italian middlegame
  new window.ChessBoard('#hero-board', {
    fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQR1K1 w - - 0 8',
    orientation: 'white',
    interactive: false,
    boardTheme: settings.boardTheme,
    last: { from: 'f1', to: 'e1' }
  });

  // daily puzzle preview
  new window.ChessBoard('#daily-board', {
    fen: D.puzzles[2].fen,
    orientation: 'white',
    interactive: false,
    boardTheme: settings.boardTheme
  });

  // friends widget
  const friendHost = $('#home-friends');
  if (friendHost) {
    friendHost.innerHTML = friends.slice(0, 5).map((f) => `
      <div class="friend-row" data-friend-open="${f.id}">
        <span style="position:relative">${avatar(f)}<span class="status-dot ${f.status}" style="position:absolute;bottom:0;right:0"></span></span>
        <div class="friend-meta">
          <div class="friend-name">${f.name} <span class="tiny muted">${f.flag}</span></div>
          <div class="friend-sub">${f.status === 'playing' ? '<span style="color:var(--accent)">Playing</span> · ' : ''}${f.activity}</div>
        </div>
        <div class="friend-actions">
          <button data-chat="${f.id}" aria-label="Message ${f.name}">${icon('message')}</button>
          <button data-challenge="${f.id}" aria-label="Challenge ${f.name}" ${f.status === 'playing' ? 'disabled style="opacity:.35"' : ''}>${icon('sword')}</button>
        </div>
      </div>`).join('');
  }

  // leaderboard widget
  const leaderHost = $('#home-leaders');
  if (leaderHost) {
    leaderHost.innerHTML = D.leaderboard.map((p) => `
      <div class="leader-row">
        <span class="leader-rank">${p.rank}</span>
        ${avatar({ name: p.name, tone: p.tone })}
        <span class="leader-name">${p.name} <span class="tiny muted">${p.flag}</span></span>
        <span class="leader-rating">${ratingFmt(p.rating)}</span>
      </div>`).join('');
  }

  // tournament quick join
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-join-tourney]');
    if (!btn) return;
    const name = btn.dataset.joinTourney;
    btn.outerHTML = '<span class="badge badge-green">✓ Joined</span>';
    toast(`You are registered for <b>${name}</b>. See you at the board!`, 'success', 'trophy');
    window.Gambit.Sound.play('win');
  });
})();
