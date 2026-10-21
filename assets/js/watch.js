(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const G = window.Gambit;
  const { icon, avatar, toast, Sound, createModal, hydrateIcons, esc, ratingFmt } = G;
  const STREAMS = window.GAMBIT.streams;
  const BROADCASTS = window.GAMBIT.broadcasts;
  let streamFilter = 'All';
  let featuredPly = 18;
  let featuredBoard = null;
  let featuredPositions = [];
  let featuredTimer = null;

  /* ---------------- featured board ---------------- */
  function buildFeatured() {
    const line = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3', 'Be7', 'f3', 'O-O', 'Qd2', 'Nbd7', 'O-O-O', 'b5', 'g4', 'b4', 'Ne2', 'Ne8', 'Kb1', 'Bb7'];
    const game = new window.Chess();
    featuredPositions = [{ fen: game.fen(), last: null, check: null }];
    line.forEach((san) => {
      const e = game.moveSAN(san);
      if (e) {
        featuredPositions.push({
          fen: game.fen(),
          last: { from: e.from, to: e.to },
          check: game.inCheck(game.turn) ? window.ChessUtils.sqName(game.kingSquare(game.turn)) : null
        });
      }
    });
    const host = $('#watch-board');
    if (!host || !featuredPositions.length) return;
    featuredBoard = new window.ChessBoard(host, {
      fen: featuredPositions[featuredPly].fen,
      orientation: 'white',
      interactive: false
    });
    showFeaturedPly(featuredPly);
    featuredTimer = setInterval(() => {
      featuredPly += 1;
      if (featuredPly >= featuredPositions.length) featuredPly = 16;
      showFeaturedPly(featuredPly);
    }, 4200);
  }

  function showFeaturedPly(ply) {
    if (!featuredBoard) return;
    const pos = featuredPositions[ply];
    featuredBoard.setPosition(pos.fen, { last: pos.last, check: pos.check });
    const num = $('#watch-move-number');
    if (num) num.textContent = Math.max(1, Math.ceil(ply / 2));
    const moveLabel = $('.match-foot .row:last-child');
    if (moveLabel) moveLabel.innerHTML = `<span class="live-dot"></span> Move <b id="watch-move-number">${Math.max(1, Math.ceil(ply / 2))}</b>`;
  }

  /* ---------------- streams ---------------- */
  function streamCard(s, vod) {
    return `<article class="card stream-card ${vod ? 'vod' : ''}" data-stream-id="${s.id}" tabindex="0" role="button">
      <div class="stream-thumb ${s.tone}">
        ${vod ? '<span class="badge" style="position:absolute;top:9px;left:9px;z-index:2">Replay</span>' : '<span class="badge badge-live" style="position:absolute;top:9px;left:9px;z-index:2"><span class="live-dot"></span> Live</span>'}
        <span class="poster">${esc(s.poster)}</span>
        <span class="viewers">${vod ? '24.1k views' : s.viewers + ' watching'}</span>
      </div>
      <div class="stream-info">
        <h4>${esc(s.title)}</h4>
        <div class="stream-user">
          ${avatar({ name: s.streamer, tone: s.toneAv })}
          <span>${esc(s.streamer)}</span>
          <span class="badge">${esc(s.cat)}</span>
        </div>
      </div>
    </article>`;
  }

  function renderStreams() {
    const host = $('#stream-grid');
    if (!host) return;
    const list = STREAMS.filter((s) => streamFilter === 'All' || s.cat === streamFilter);
    host.innerHTML = list.length ? list.map((s) => streamCard(s, false)).join('') : `<div class="empty-state card" style="grid-column:1/-1">${icon('tv')}<h4>No streams in this category</h4><p>Try another category or check the schedule.</p></div>`;
    const vodHost = $('#vod-grid');
    if (vodHost) vodHost.innerHTML = STREAMS.slice(0, 4).map((s) => streamCard(s, true)).join('');
  }

  function renderBroadcasts() {
    const host = $('#broadcast-list');
    if (!host) return;
    host.innerHTML = BROADCASTS.map((b) => `<tr data-broadcast-id="${b.id}" style="cursor:pointer">
      <td><span class="tname"><span class="flag">${b.flag}</span>${esc(b.name)}</span></td>
      <td><span class="badge ${b.status === 'LIVE' ? 'badge-live' : ''}">${b.status === 'LIVE' ? '<span class="live-dot"></span> ' : ''}${esc(b.status)}</span></td>
      <td>${esc(b.round)}<br><span class="tiny muted">${esc(b.pair)}</span></td>
      <td>${esc(b.viewers)}</td>
      <td><button class="btn btn-sm ${b.status === 'LIVE' ? 'btn-primary' : ''}" data-broadcast-id="${b.id}">${b.status === 'LIVE' ? 'Watch' : 'Remind me'}</button></td>
    </tr>`).join('');
    hydrateIcons(host);
  }

  function renderSchedule() {
    const host = $('#schedule-grid');
    if (!host) return;
    const schedule = [
      { day: 'WED', time: '18:00', title: 'Titled Tuesday', sub: '11 rounds · Blitz 3+0', badge: 'Tomorrow', flag: '⭐' },
      { day: 'THU', time: '20:00', title: 'Speed Chess Championship', sub: 'Quarter-final · 5+1', badge: 'Reminder', flag: '⚡' },
      { day: 'SAT', time: '14:00', title: 'Weekend Classical', sub: 'Round 1 · 30+0 Swiss', badge: 'Set alarm', flag: '♜' },
      { day: 'SUN', time: '11:00', title: 'Rising Stars U1800', sub: 'Arena · 5+3', badge: 'Open', flag: '🌱' },
      { day: 'SUN', time: '18:00', title: 'Club Champions Cup', sub: 'Team final · 10+2', badge: 'Set alarm', flag: '🏆' },
      { day: 'MON', time: '19:30', title: 'Gambit Masterclass', sub: 'Live lesson with Coach Elias', badge: 'Free', flag: '📚' }
    ];
    host.innerHTML = schedule.map((s) => `<div class="card schedule-item">
      <div class="when"><b>${s.time}</b><span>${s.day}</span></div>
      <div class="grow"><h4>${s.flag} ${esc(s.title)}</h4><p>${esc(s.sub)}</p></div>
      <button class="btn btn-sm" data-remind="${esc(s.title)}">${esc(s.badge)}</button>
    </div>`).join('');
  }

  /* ---------------- modals ---------------- */
  const chatLines = [
    ['NadiaFan', 'That …b5 push is so sharp.'],
    ['chesscat', 'Gukesh has 14 minutes for 15 moves. Comfortable.'],
    ['Elias_Coach', 'Watch the d5 square after ...Ne8.'],
    ['MayaC', 'This is the game of the round.']
  ];

  function openStream(s, vod) {
    const body = `
      <div class="stream-modal-stage ${s.tone}">
        <div class="stage-top"><span class="badge ${vod ? '' : 'badge-live'}">${vod ? 'Replay' : '<span class="live-dot"></span> Live'}</span><span class="badge">${esc(s.cat)}</span></div>
        <span class="poster">${esc(s.poster)}</span>
        <button class="play-big" aria-label="Play">${icon('play')}</button>
      </div>
      <div class="row gap-10" style="align-items:flex-start">
        <div class="grow"><h4 style="font-size:14px;line-height:1.4">${esc(s.title)}</h4><div class="row gap-8 mt-8">${avatar({ name: s.streamer, tone: s.toneAv })}<div><b style="font-size:12px;display:block">${esc(s.streamer)}</b><span class="tiny muted">${vod ? '24.1k views' : s.viewers + ' watching now'}</span></div></div></div>
        <button class="btn btn-sm" id="stream-follow">${icon('heart')} Follow</button>
      </div>
      <div class="watch-chat">
        <div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Live chat</span><span class="tiny" style="color:var(--brand)"><span class="live-dot" style="display:inline-block"></span> 8.4k chatting</span></div>
        <div class="watch-chat-list" id="stream-chat">${chatLines.map(([n, t]) => `<div class="watch-chat-msg"><b>${n}:</b>${t}</div>`).join('')}</div>
        <form class="watch-chat-form" id="stream-chat-form"><input class="input" id="stream-chat-input" placeholder="Say something nice…" maxlength="120"><button type="submit" aria-label="Send">${icon('send')}</button></form>
      </div>`;
    const modal = createModal({
      title: esc(s.streamer) + ' is live',
      subtitle: vod ? 'Replay · ' + esc(s.cat) : esc(s.cat) + ' · ' + s.viewers + ' watching',
      width: 'wide',
      body,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn btn-primary" id="stream-open-player">${icon('tv')} Open player</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('.play-big').addEventListener('click', () => toast('Playback is simulated in this demo.', 'info', 'tv'));
    modal.el.querySelector('#stream-open-player').addEventListener('click', () => {
      toast('Player opened in theatre mode. (Demo)', 'success', 'tv');
      modal.close();
    });
    const follow = modal.el.querySelector('#stream-follow');
    follow.addEventListener('click', () => {
      follow.innerHTML = `${icon('check')} Following`;
      follow.classList.add('btn-primary');
      hydrateIcons(follow);
      toast(`You are following ${s.streamer}.`, 'success', 'heart');
    });
    const form = modal.el.querySelector('#stream-chat-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = modal.el.querySelector('#stream-chat-input');
      if (!input.value.trim()) return;
      const list = modal.el.querySelector('#stream-chat');
      const msg = document.createElement('div');
      msg.className = 'watch-chat-msg';
      msg.innerHTML = `<b>You:</b>${esc(input.value.trim())}`;
      list.appendChild(msg);
      list.scrollTop = list.scrollHeight;
      input.value = '';
      Sound.play('click');
    });
  }

  function openBroadcast(b) {
    const live = b.status === 'LIVE';
    const body = `
      <div class="stream-modal-stage tone-g1">
        <div class="stage-top"><span class="badge ${live ? 'badge-live' : ''}">${live ? '<span class="live-dot"></span> Live' : esc(b.status)}</span><span class="badge">${esc(b.round)}</span></div>
        <span class="poster">${esc(b.name.split('—')[0])}</span>
        <button class="play-big" aria-label="Watch">${icon('play')}</button>
      </div>
      <div class="row" style="align-items:flex-start;justify-content:space-between;gap:12px">
        <div><h4 style="font-size:14px">${esc(b.name)}</h4><p class="small muted mt-8">${esc(b.pair)} · ${esc(b.round)}</p></div>
        <span class="badge ${live ? 'badge-live' : 'badge-gold'}">${esc(b.viewers)} ${live ? 'watching' : ''}</span>
      </div>
      <div class="stat-row" style="margin-top:16px">
        <div class="stat"><b>${live ? '34' : '—'}</b><span>Moves played</span></div>
        <div class="stat"><b>${live ? '2h 14m' : 'Starts soon'}</b><span>Elapsed</span></div>
        <div class="stat"><b>${b.flag}</b><span>Region</span></div>
      </div>
      <p class="tiny muted" style="line-height:1.6;margin-top:12px">Broadcast coverage includes live clocks, key moments and commentary from the Gambit studio. Replays and full annotations are free for everyone.</p>`;
    const modal = createModal({
      title: 'Broadcast',
      subtitle: esc(b.name),
      width: 'wide',
      body,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn btn-primary" data-watch-broadcast>${icon('tv')} ${live ? 'Watch now' : 'Set reminder'}</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('.play-big').addEventListener('click', () => {
      toast(live ? 'Broadcast player opened. (Demo)' : 'Reminder set for this broadcast.', live ? 'success' : 'info', 'tv');
    });
    modal.el.querySelector('[data-watch-broadcast]').addEventListener('click', () => {
      modal.close();
      toast(live ? `${b.pair} — live broadcast opened.` : `Reminder set for ${b.name}.`, live ? 'success' : 'info', 'bell');
    });
  }

  function goLive() {
    const body = `
      <div class="field"><label>Stream title</label><input class="input" id="live-title" value="Evening blitz with the club" maxlength="80"></div>
      <div class="field mt-12"><label>Category</label><select class="select" id="live-cat"><option>Blitz</option><option>Rapid</option><option>Puzzles</option><option>Study</option><option>Just chatting</option></select></div>
      <div class="field mt-12"><label>Visibility</label><select class="select" id="live-vis"><option>Public — listed on Watch</option><option>Followers only</option><option>Private link</option></select></div>
      <div class="card" style="padding:11px 12px;margin-top:14px;background:var(--brand-soft);border-color:var(--brand-line)"><p class="tiny" style="line-height:1.55;color:var(--text-2)"><b>Before you go live:</b> test your camera, keep the chat friendly and remember — this is a demo, so nothing is actually streamed.</p></div>`;
    const modal = createModal({
      title: 'Go live on Gambit',
      subtitle: 'Your club is already waiting.',
      width: '',
      body,
      footer: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="start-live">${icon('tv')} Start stream</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('#start-live').addEventListener('click', () => {
      modal.close();
      Sound.play('win');
      toast('You are live! (Demo stream started.)', 'success', 'tv');
    });
  }

  function manageAlerts() {
    const rows = ['Maya Chen goes live', 'Titled Tuesday starts', 'Gambit Masterclass', 'Your followed clubs post a stream'];
    const modal = createModal({
      title: 'Stream alerts',
      subtitle: 'Quiet nudges, only when it matters.',
      body: `<div>${rows.map((r, i) => `<div class="opt-row" style="padding:12px 0"><span>${r}</span><button class="switch ${i < 3 ? 'on' : ''}" data-alert-toggle aria-label="${r}"></button></div>`).join('')}</div>`,
      footer: `<button class="btn btn-primary" data-modal-close>Done</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-alert-toggle]');
      if (sw) sw.classList.toggle('on');
    });
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-watch-tab]');
    if (tab) {
      $$('[data-watch-tab]').forEach((b) => b.classList.toggle('active', b === tab));
      $$('[data-watch-pane]').forEach((p) => p.classList.toggle('active', p.dataset.watchPane === tab.dataset.watchTab));
      return;
    }
    const cat = e.target.closest('[data-stream-cat]');
    if (cat) {
      streamFilter = cat.dataset.streamCat;
      $$('[data-stream-cat]').forEach((b) => b.classList.toggle('active', b === cat));
      renderStreams();
      return;
    }
    const stream = e.target.closest('[data-stream-id]');
    if (stream && !e.target.closest('[data-broadcast-id]')) {
      const s = STREAMS.find((x) => x.id === stream.dataset.streamId);
      if (s) openStream(s, stream.classList.contains('vod'));
      return;
    }
    const bc = e.target.closest('[data-broadcast-id]');
    if (bc) {
      const b = BROADCASTS.find((x) => x.id === bc.dataset.broadcastId);
      if (b) openBroadcast(b);
      return;
    }
    const remind = e.target.closest('[data-remind]');
    if (remind) {
      remind.textContent = 'Reminder set';
      remind.classList.add('btn-primary');
      toast(`Reminder set for ${remind.dataset.remind}.`, 'success', 'bell');
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-stream-id], [data-broadcast-id]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  const featuredBtn = $('#watch-featured');
  if (featuredBtn) featuredBtn.addEventListener('click', () => {
    openStream(STREAMS[0], false);
  });
  const follow = $('#follow-broadcast');
  if (follow) follow.addEventListener('click', () => {
    follow.innerHTML = `${icon('check')} Following`;
    follow.classList.add('btn-primary');
    G.hydrateIcons(follow);
    toast('Following the Global Chess League finals.', 'success', 'heart');
  });
  const share = $('#broadcast-share');
  if (share) share.addEventListener('click', () => {
    if (navigator.clipboard) navigator.clipboard.writeText(location.href + '#featured').catch(() => {});
    toast('Broadcast link copied.', 'success', 'share');
  });
  const notify = $('#notify-live');
  if (notify) notify.addEventListener('click', () => {
    notify.innerHTML = `${icon('check')} Alerts on`;
    notify.classList.add('btn-primary');
    G.hydrateIcons(notify);
    toast('You will be notified when this broadcast starts.', 'success', 'bell');
  });
  const go = $('#go-live');
  if (go) go.addEventListener('click', goLive);
  const alerts = $('#manage-alerts');
  if (alerts) alerts.addEventListener('click', manageAlerts);
  const vods = $('#browse-vods');
  if (vods) vods.addEventListener('click', () => {
    const grid = $('#vod-grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---------------- boot ---------------- */
  buildFeatured();
  renderStreams();
  renderBroadcasts();
  renderSchedule();
})();
