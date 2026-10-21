(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const G = window.Gambit;
  const { icon, avatar, toast, Sound, createModal, hydrateIcons, esc, ratingFmt } = G;
  let user = G.user || window.GAMBIT.demoUser;
  const GAMES = window.GAMBIT.recentGames;
  const ACHIEVEMENTS = window.GAMBIT.achievements;
  const SERIES = {
    rapid: {
      30: [1798, 1804, 1801, 1812, 1809, 1820, 1817, 1825, 1831, 1828, 1836, 1842],
      90: [1742, 1756, 1749, 1768, 1761, 1782, 1776, 1788, 1794, 1802, 1811, 1804, 1819, 1824, 1818, 1830, 1836, 1842],
      365: [1620, 1644, 1638, 1662, 1680, 1674, 1701, 1719, 1712, 1748, 1760, 1754, 1788, 1801, 1796, 1810, 1828, 1842]
    },
    blitz: {
      30: [1682, 1690, 1687, 1695, 1702, 1698, 1707, 1704, 1712, 1718, 1711, 1716],
      90: [1618, 1629, 1624, 1641, 1638, 1652, 1647, 1661, 1658, 1672, 1667, 1680, 1675, 1688, 1683, 1698, 1704, 1716],
      365: [1512, 1534, 1528, 1566, 1588, 1580, 1602, 1618, 1609, 1641, 1652, 1648, 1670, 1683, 1676, 1698, 1705, 1716]
    }
  };
  let range = 90;

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function renderProfile() {
    const stats = user.stats || {};
    const avatarEl = $('#profile-avatar');
    if (avatarEl) avatarEl.textContent = initials(user.name);
    const name = $('#profile-name');
    if (name) name.innerHTML = `${esc(user.name)} <span class="badge badge-green" style="height:19px">Online</span>`;
    const handle = $('#profile-handle');
    if (handle) handle.textContent = `${user.handle || '@player'} · ${user.country || 'Somewhere'} ${user.flag || ''} · Joined ${user.joined || 'March 2021'}`;
    const bio = $('#profile-bio');
    if (bio) bio.textContent = user.bio || 'No bio yet. Add a line about your chess life.';
    const country = $('#info-country');
    if (country) country.textContent = `${user.country || 'United Kingdom'} ${user.flag || '🇬🇧'}`;
    const values = { '#stat-rapid': stats.rapid, '#stat-blitz': stats.blitz, '#stat-bullet': stats.bullet, '#stat-puzzles': stats.puzzles };
    Object.keys(values).forEach((sel) => { const el = $(sel); if (el) el.textContent = ratingFmt(values[sel] || 0); });
  }

  /* ---------------- chart ---------------- */
  function chartPoints(values, width, height, pad) {
    const min = Math.min(...values) - 12;
    const max = Math.max(...values) + 12;
    const n = values.length;
    return values.map((v, i) => ({
      x: pad + (i / (n - 1)) * (width - pad * 2),
      y: pad + (1 - (v - min) / (max - min)) * (height - pad * 2),
      v
    }));
  }

  function smoothPath(points) {
    if (!points.length) return '';
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const cx = (a.x + b.x) / 2;
      d += ` C ${cx.toFixed(1)} ${a.y.toFixed(1)}, ${cx.toFixed(1)} ${b.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d;
  }

  function renderChart() {
    const host = $('#rating-chart');
    if (!host) return;
    const w = 700, h = 180, pad = 18;
    const rapid = chartPoints(SERIES.rapid[range], w, h, pad);
    const blitz = chartPoints(SERIES.blitz[range], w, h, pad);
    const grid = [0, 1, 2, 3, 4].map((i) => {
      const y = pad + (i / 4) * (h - pad * 2);
      return `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="rgba(255,255,255,.055)" stroke-width="1"/>`;
    }).join('');
    const lastR = rapid[rapid.length - 1];
    const lastB = blitz[blitz.length - 1];
    host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Rapid and blitz rating graph">
      <defs>
        <linearGradient id="rapidFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(74,222,128,.26)"/><stop offset="100%" stop-color="rgba(74,222,128,0)"/></linearGradient>
        <linearGradient id="blitzFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(242,200,121,.18)"/><stop offset="100%" stop-color="rgba(242,200,121,0)"/></linearGradient>
      </defs>
      ${grid}
      <path d="${smoothPath(rapid)} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z" fill="url(#rapidFill)"/>
      <path d="${smoothPath(blitz)} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z" fill="url(#blitzFill)"/>
      <path d="${smoothPath(blitz)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
      <path d="${smoothPath(rapid)}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${lastB.x}" cy="${lastB.y}" r="3.5" fill="var(--accent)"/>
      <circle cx="${lastR.x}" cy="${lastR.y}" r="4.5" fill="var(--brand)" stroke="var(--surface)" stroke-width="2"/>
      <text x="${lastR.x - 8}" y="${lastR.y - 12}" text-anchor="end" fill="var(--brand-bright)" font-size="11" font-family="Inter, sans-serif" font-weight="700">${lastR.v}</text>
      <text x="${lastB.x - 8}" y="${lastB.y + 18}" text-anchor="end" fill="var(--accent)" font-size="10" font-family="Inter, sans-serif">${lastB.v}</text>
      <text x="${pad}" y="${h - 3}" fill="rgba(148,163,184,.6)" font-size="9" font-family="Inter, sans-serif">12 weeks ago</text>
      <text x="${w - pad}" y="${h - 3}" text-anchor="end" fill="rgba(148,163,184,.6)" font-size="9" font-family="Inter, sans-serif">Today</text>
    </svg>`;
  }

  /* ---------------- tables ---------------- */
  function renderGames() {
    const host = $('#game-history');
    if (!host) return;
    host.innerHTML = GAMES.map((g, i) => `<tr data-game-index="${i}" style="cursor:pointer">
      <td><span class="result-pill ${g.result}">${g.result === 'win' ? 'WIN' : g.result === 'loss' ? 'LOSS' : 'DRAW'}</span></td>
      <td><span class="opp">${avatar({ name: g.opponent, tone: g.tone })}<span>${esc(g.opponent)}</span></span></td>
      <td>${esc(g.opening)}</td>
      <td>${esc(g.tc)}</td>
      <td>${g.moves}</td>
      <td style="color:${g.accuracy >= 85 ? 'var(--brand)' : 'var(--text-2)'}">${g.accuracy}%</td>
      <td><span style="color:${g.delta > 0 ? 'var(--brand)' : g.delta < 0 ? 'var(--danger)' : 'var(--muted)'}">${g.delta > 0 ? '+' : ''}${g.delta}</span></td>
    </tr>`).join('');
    const wins = GAMES.filter((g) => g.result === 'win').length;
    const summary = $('#games-summary');
    if (summary) summary.textContent = `${GAMES.length} games · ${wins} wins`;
  }

  function gameModal(g) {
    const body = `<div class="game-modal-result"><span class="result-pill ${g.result}">${g.result.toUpperCase()}</span><div><h3>${g.result === 'win' ? 'A good day at the board.' : g.result === 'loss' ? 'A tough one. Review it and move on.' : 'Honours even.'}</h3><p>vs. ${esc(g.opponent)} · ${esc(g.tc)} · ${esc(g.date)}</p></div></div>
      <div class="game-modal-meta"><div><span>Opening</span><b>${esc(g.opening)}</b></div><div><span>Moves</span><b>${g.moves}</b></div><div><span>Accuracy</span><b>${g.accuracy}%</b></div><div><span>Colour</span><b>${esc(g.color)}</b></div><div><span>Rating change</span><b style="color:${g.delta >= 0 ? 'var(--brand)' : 'var(--danger)'}">${g.delta > 0 ? '+' : ''}${g.delta}</b></div><div><span>Result</span><b>${g.result === 'win' ? '1–0' : g.result === 'loss' ? '0–1' : '½–½'}</b></div></div>
      <div class="solution-box" style="margin-top:14px"><div class="row"><span class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Coach's note</span></div><p class="tiny muted" style="margin-top:6px;line-height:1.55">${g.accuracy >= 85 ? 'Excellent conversion. You kept the initiative and did not release the pressure when the position simplified.' : 'There was a tactical moment around move 24. Review the forcing moves first — the engine line is closer than it looked.'}</p></div>`;
    const modal = createModal({
      title: `vs. ${esc(g.opponent)}`,
      subtitle: `${esc(g.tc)} · ${esc(g.date)}`,
      body,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn btn-primary" id="review-game">${icon('eye')} Review game</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('#review-game').addEventListener('click', () => {
      modal.close();
      toast('Game loaded into the analysis board. (Demo)', 'info', 'eye');
    });
  }

  function renderAchievements() {
    const host = $('#achievements');
    if (!host) return;
    host.innerHTML = ACHIEVEMENTS.map((a) => `<div class="achievement ${a.locked ? 'locked' : ''}" title="${esc(a.desc)}">
      <span class="ic">${icon(a.icon)}</span><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>
    </div>`).join('');
    hydrateIcons(host);
  }

  function renderFriends() {
    const host = $('#profile-friends');
    if (!host) return;
    const list = G.friends.slice(0, 5);
    host.innerHTML = list.map((f) => `<div class="friend-row" data-friend-open="${f.id}">${avatar(f)}<span class="status-dot ${f.status}" style="margin-left:-10px;margin-top:18px;width:8px;height:8px"></span><div class="friend-meta"><div class="friend-name">${esc(f.name)}</div><div class="friend-sub">${esc(f.activity || '')}</div></div><button class="friend-chat" data-chat="${f.id}" aria-label="Message" style="margin-left:auto;border:0;background:none;color:var(--muted);cursor:pointer">${icon('message')}</button></div>`).join('');
    hydrateIcons(host);
  }

  function renderPerformance() {
    const host = $('#performance-grid');
    if (!host) return;
    host.innerHTML = [
      ['Accuracy', '86%', '+4% vs last month'],
      ['Best win', '2,231', 'vs. Ingrid Larsen'],
      ['Avg. moves', '34', 'Rapid games'],
      ['Openings', '12', 'In your repertoire']
    ].map(([label, value, note]) => `<div class="performance-cell"><span>${label}</span><b>${value}</b><small>${note}</small></div>`).join('');
  }

  /* ---------------- edit ---------------- */
  function editProfile() {
    const body = `<div class="row gap-12" style="margin-bottom:14px"><span class="avatar" style="width:52px;height:52px;font-size:17px" id="edit-avatar">${initials(user.name)}</span><div><b style="font-size:13px">Profile photo</b><p class="tiny muted">Initials are generated in this demo.</p></div></div>
      <div class="field"><label>Display name</label><input class="input" id="edit-name" value="${esc(user.name)}" maxlength="40"></div>
      <div class="field mt-12"><label>Handle</label><input class="input" id="edit-handle" value="${esc(user.handle)}" maxlength="24"></div>
      <div class="field mt-12"><label>Country</label><input class="input" id="edit-country" value="${esc(user.country)}" maxlength="40"></div>
      <div class="field mt-12"><label>Bio</label><textarea class="textarea" id="edit-bio" maxlength="220">${esc(user.bio || '')}</textarea></div>
      <div class="field mt-12"><label>Playing style</label><select class="select" id="edit-style"><option>Attacking</option><option>Positional</option><option>Universal</option><option>Defensive</option></select></div>`;
    const modal = createModal({
      title: 'Edit profile',
      subtitle: 'Your public chess identity.',
      body,
      footer: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-profile">${icon('check')} Save changes</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('#save-profile').addEventListener('click', () => {
      const name = modal.el.querySelector('#edit-name').value.trim() || user.name;
      const patch = {
        name,
        handle: modal.el.querySelector('#edit-handle').value.trim() || user.handle,
        country: modal.el.querySelector('#edit-country').value.trim() || user.country,
        bio: modal.el.querySelector('#edit-bio').value.trim()
      };
      user = G.updateProfile(patch) || Object.assign(user, patch);
      renderProfile();
      modal.close();
      Sound.play('win');
      toast('Profile updated.', 'success', 'check');
    });
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const rangeBtn = e.target.closest('[data-chart-range]');
    if (rangeBtn) {
      range = parseInt(rangeBtn.dataset.chartRange, 10);
      $$('[data-chart-range]').forEach((b) => b.classList.toggle('active', b === rangeBtn));
      renderChart();
      return;
    }
    const game = e.target.closest('[data-game-index]');
    if (game) { gameModal(GAMES[parseInt(game.dataset.gameIndex, 10)]); return; }
  });

  const edit = $('#edit-profile');
  if (edit) edit.addEventListener('click', editProfile);
  const editAbout = $('#edit-about');
  if (editAbout) editAbout.addEventListener('click', editProfile);
  const share = $('#share-profile');
  if (share) share.addEventListener('click', () => {
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).catch(() => {});
    toast('Profile link copied.', 'success', 'share');
  });

  /* ---------------- boot ---------------- */
  renderProfile();
  renderChart();
  renderGames();
  renderAchievements();
  renderFriends();
  renderPerformance();
})();
