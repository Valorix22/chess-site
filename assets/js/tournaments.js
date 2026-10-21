(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const G = window.Gambit;
  const { icon, avatar, toast, Sound, createModal, confirm, hydrateIcons, esc, Store } = G;

  const EXTRA = [
    { id: 't7', name: 'Friday Night Bullet', format: '1+0 Arena', players: 3120, starts: 'Fri 21:00', prize: '150', emblem: '⚡', joined: false, tone: 'tone-g2', status: 'Friday' },
    { id: 't8', name: 'Openings Lab Swiss', format: '5+0 Swiss', players: 248, starts: 'Sat 09:00', prize: '100', emblem: '📖', joined: false, tone: 'tone-g4', status: 'Saturday' }
  ];

  const customEvents = Store.get('gambit.customTournaments', []);
  const events = window.GAMBIT.tournaments.concat(EXTRA, customEvents).map((e) => {
    let type = 'Arena';
    if (/Swiss/i.test(e.format)) type = 'Swiss';
    if (/Team/i.test(e.format)) type = 'Team';
    if (/puzzles/i.test(e.format)) type = 'Puzzles';
    return Object.assign({}, e, { type });
  });

  let joined = new Set(Store.get('gambit.joinedTournaments', events.filter((e) => e.joined).map((e) => e.id)));
  events.forEach((e) => { e.joined = joined.has(e.id); });
  let filter = 'All';
  const featured = events[0];

  /* ---------------- date helpers ---------------- */
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function eventDate(e) {
    const now = new Date();
    if (e.status === 'Today') return now;
    if (e.status === 'Daily') return now;
    const idx = DAYS.indexOf(e.status.slice(0, 3));
    if (idx >= 0) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let delta = (idx - now.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      d.setDate(d.getDate() + delta);
      return d;
    }
    return now;
  }

  function startTime(e) {
    const m = String(e.starts).match(/(\d{1,2}):(\d{2})/);
    const d = eventDate(e);
    if (m) d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    else d.setHours(18, 0, 0, 0);
    if (e.status === 'Today' && d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }

  function playersFmt(n) {
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
  }

  function eventAvatars() {
    return [G.friends[0], G.friends[4], G.friends[2]].map((f) => avatar(f)).join('');
  }

  /* ---------------- cards ---------------- */
  function cardHTML(e) {
    return `<article class="card t-card card-hover" data-tournament-id="${e.id}" role="button" tabindex="0" aria-label="${esc(e.name)}">
      <div class="t-card-head">
        <span class="t-emblem ${e.tone}">${e.emblem}</span>
        <div class="grow">
          <h4>${esc(e.name)}</h4>
          <p>${esc(e.format)} · ${esc(e.starts)}</p>
        </div>
        <span class="badge ${e.joined ? 'badge-green' : ''}">${e.joined ? 'Registered' : esc(e.status)}</span>
      </div>
      <div class="row gap-6" style="flex-wrap:wrap">
        <span class="badge">${icon('users')} ${playersFmt(e.players)} players</span>
        <span class="badge badge-gold">${icon('trophy')} ${esc(e.prize)} points</span>
        <span class="badge">${icon('clock')} ${esc(e.format.split(' ')[0])}</span>
      </div>
      <div class="t-card-foot">
        <div class="t-avatars">${eventAvatars()}</div>
        <span class="count">+${Math.max(0, e.players - 3)} others</span>
        <div class="tourney-card-actions">
          ${e.joined
            ? `<span class="tourney-joined">You're in</span><button class="btn btn-sm btn-ghost" data-withdraw="${e.id}">Leave</button>`
            : `<button class="btn btn-sm btn-primary" data-join="${e.id}">Join</button>`}
        </div>
      </div>
    </article>`;
  }

  function renderGrid() {
    const host = $('#tournament-grid');
    if (!host) return;
    const list = events.filter((e) => filter === 'All' || e.type === filter);
    host.innerHTML = list.map(cardHTML).join('');
    hydrateIcons(host);
    const count = $('#tourney-count');
    if (count) count.textContent = `${events.length} events this week`;
  }

  /* ---------------- hero ---------------- */
  function renderHero() {
    const btn = $('#featured-join');
    if (!btn) return;
    if (featured.joined) {
      btn.innerHTML = `${icon('check')} You're registered`;
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-outline');
    } else {
      btn.innerHTML = `${icon('sword')} Join the arena`;
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-outline');
    }
    hydrateIcons(btn);
  }

  let countdownTimer = null;
  function tickCountdown() {
    const target = startTime(featured).getTime();
    const diff = Math.max(0, target - Date.now());
    const s = Math.floor(diff / 1000);
    const set = (sel, val) => { const el = $(sel); if (el) el.textContent = String(val).padStart(2, '0'); };
    set('#cd-d', Math.floor(s / 86400));
    set('#cd-h', Math.floor((s % 86400) / 3600));
    set('#cd-m', Math.floor((s % 3600) / 60));
    set('#cd-s', s % 60);
    if (diff === 0) {
      const label = $('.arena-main .eyebrow, #featured-join');
      if (label && label.id === 'featured-join') {
        label.innerHTML = `${icon('sword')} Arena starting`;
        hydrateIcons(label);
      }
    }
  }

  function startCountdown() {
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, 1000);
  }

  function renderStandings() {
    const host = $('#featured-standings');
    if (!host) return;
    const scores = ['21½', '20', '19', '18½', '18'];
    host.innerHTML = window.GAMBIT.leaderboard.slice(0, 5).map((p, i) => `<div class="mini-leader-row">
      <span class="rank">${i + 1}</span>${avatar({ name: p.name, tone: p.tone })}
      <span class="name">${esc(p.name)} ${p.flag}</span><span class="score">${scores[i]}</span>
    </div>`).join('');
  }

  /* ---------------- schedule ---------------- */
  function scheduleRow(e) {
    const d = eventDate(e);
    const dayNum = e.status === 'Daily' ? '∞' : d.getDate();
    const dayName = e.status === 'Daily' ? 'Daily' : DAYS[d.getDay()];
    return `<div class="tourney-list-row" data-tournament-id="${e.id}" style="cursor:pointer">
      <div class="date-block"><b>${dayNum}</b><span>${dayName}</span></div>
      <div class="grow"><h5>${esc(e.name)}</h5><p>${esc(e.format)} · ${esc(e.starts)}</p></div>
      ${e.joined ? '<span class="tourney-joined">Registered</span>' : `<span class="badge">${esc(e.status)}</span>`}
    </div>`;
  }

  function renderSchedule() {
    const host = $('#schedule-list');
    if (!host) return;
    const sorted = events.slice().sort((a, b) => startTime(a) - startTime(b));
    host.innerHTML = sorted.map(scheduleRow).join('');
  }

  function renderUserEvents() {
    const host = $('#user-events');
    if (!host) return;
    const list = events.filter((e) => e.joined);
    host.innerHTML = list.length ? list.map(scheduleRow).join('') : `<div class="empty-state" style="padding:24px">${icon('calendar')}<h4>Nothing on the calendar</h4><p>Join an arena or Swiss to see it here.</p></div>`;
    hydrateIcons(host);
    const count = $('#registered-count');
    if (count) count.textContent = list.length;
  }

  function renderTopFinishers() {
    const host = $('#top-finishers');
    if (!host) return;
    const scores = ['38', '34', '31', '29', '27'];
    host.innerHTML = window.GAMBIT.leaderboard.slice(0, 5).map((p, i) => `<div class="mini-leader-row">
      <span class="rank">${i + 1}</span>${avatar({ name: p.name, tone: p.tone })}
      <span class="name">${esc(p.name)} ${p.flag}</span><span class="score">${scores[i]} pts</span>
    </div>`).join('');
  }

  /* ---------------- join / leave ---------------- */
  function persist() {
    Store.set('gambit.joinedTournaments', Array.from(joined));
  }

  function joinEvent(e) {
    if (e.joined) return;
    e.joined = true;
    joined.add(e.id);
    persist();
    renderHero();
    renderGrid();
    renderSchedule();
    renderUserEvents();
    Sound.play('win');
    toast(`You're registered for ${e.name}. Good luck!`, 'success', 'trophy');
  }

  function withdrawEvent(e) {
    confirm({
      title: `Leave ${e.name}?`,
      text: 'You can rejoin any time before the first round starts.',
      confirm: 'Leave event',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      e.joined = false;
      joined.delete(e.id);
      persist();
      renderHero();
      renderGrid();
      renderSchedule();
      renderUserEvents();
      toast(`You left ${e.name}.`, 'info', 'calendar');
    });
  }

  /* ---------------- event modal ---------------- */
  function eventModal(e) {
    const live = e.status === 'Today' && startTime(e).getTime() - Date.now() < 3 * 3600 * 1000;
    const body = `<div class="tourney-detail-hero ${e.tone}">${e.emblem}</div>
      <div class="row gap-6" style="flex-wrap:wrap;margin-bottom:14px">
        <span class="badge">${esc(e.type)}</span>
        <span class="badge">${esc(e.format)}</span>
        <span class="badge ${live ? 'badge-live' : ''}">${live ? '<span class="live-dot"></span> Starting soon' : esc(e.status) + ' · ' + esc(e.starts)}</span>
      </div>
      <p class="small muted" style="line-height:1.7">${esc(e.name)} brings together players from every level for ${esc(e.format.toLowerCase())}. Pairings are automatic, games are rated, and the leaderboard updates as soon as each result lands. Stay for the full window — every game counts.</p>
      <div class="tourney-detail-grid" style="margin-top:14px">
        <div><span>Players</span><b>${e.players.toLocaleString()} registered</b></div>
        <div><span>Prize pool</span><b>${esc(e.prize)} rating points</b></div>
        <div><span>Time control</span><b>${esc(e.format.split(' ')[0])}</b></div>
        <div><span>Entry</span><b style="color:var(--brand)">Free</b></div>
      </div>
      <div class="row gap-8 mt-16" style="align-items:center">
        <div class="t-avatars">${[G.friends[0], G.friends[1], G.friends[2], G.friends[3]].map((f) => avatar(f)).join('')}</div>
        <span class="tiny muted">Maya, Diego, Ingrid and ${Math.max(0, e.players - 4).toLocaleString()} others are playing</span>
      </div>
      <div class="dropdown-label" style="padding:18px 2px 8px">Event rules</div>
      <ul class="rule-list">
        <li><span class="num">1</span><span><b>Automatic pairings.</b> You will be matched with a player on a similar score every few seconds.</span></li>
        <li><span class="num">2</span><span><b>Win streaks score double.</b> In arenas, back-to-back wins are worth extra points — keep the run alive.</span></li>
        <li><span class="num">3</span><span><b>No take-backs.</b> Games are rated. Fair play rules apply and engine assistance is not allowed.</span></li>
      </ul>`;
    const modal = createModal({
      title: esc(e.name),
      subtitle: `${esc(e.format)} · ${esc(e.starts)}`,
      body,
      footer: `<button class="btn" data-modal-close>Close</button>${e.joined
        ? `<button class="btn btn-outline" data-modal-withdraw="${e.id}">Leave event</button><button class="btn btn-primary" data-modal-play="${e.id}">${icon('play')} Play now</button>`
        : `<button class="btn btn-primary" data-modal-join="${e.id}">${icon('sword')} Join tournament</button>`}`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    const join = modal.el.querySelector('[data-modal-join]');
    if (join) join.addEventListener('click', () => { joinEvent(e); modal.close(); });
    const leave = modal.el.querySelector('[data-modal-withdraw]');
    if (leave) leave.addEventListener('click', () => { modal.close(); withdrawEvent(e); });
    const play = modal.el.querySelector('[data-modal-play]');
    if (play) play.addEventListener('click', () => {
      modal.close();
      toast('Finding an opponent in the arena… (Demo)', 'info', 'sword');
    });
  }

  /* ---------------- my events ---------------- */
  function myEventsModal() {
    const list = events.filter((e) => e.joined);
    const body = list.length
      ? `<div class="tourney-list" style="margin:-6px -4px">${list.map(scheduleRow).join('')}</div><p class="tiny muted mt-12" style="line-height:1.55">Pairings open 10 minutes before each event. We will notify you when your first game is ready.</p>`
      : `<div class="empty-state">${icon('calendar')}<h4>No tournaments yet</h4><p>Join an arena or Swiss event and it will show up here.</p></div>`;
    const modal = createModal({
      title: 'My tournaments',
      subtitle: `${list.length} registered event${list.length === 1 ? '' : 's'}`,
      body,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn btn-primary" data-modal-browse>${icon('search')} Browse events</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('[data-modal-browse]').addEventListener('click', () => {
      modal.close();
      $('#tournament-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    modal.el.addEventListener('click', (ev) => {
      const row = ev.target.closest('[data-tournament-id]');
      if (!row) return;
      const e = events.find((x) => x.id === row.dataset.tournamentId);
      if (e) { modal.close(); eventModal(e); }
    });
  }

  /* ---------------- create ---------------- */
  function createTournament() {
    const body = `<div class="field"><label>Tournament name</label><input class="input" id="new-t-name" placeholder="e.g. Wednesday Night Arena" maxlength="50"></div>
      <div class="row gap-12 mt-12">
        <div class="field grow"><label>Format</label><select class="select" id="new-t-format"><option>Arena</option><option>Swiss</option><option>Team battle</option></select></div>
        <div class="field grow"><label>Time control</label><select class="select" id="new-t-tc"><option>3+2 Blitz</option><option>5+0 Blitz</option><option>10+0 Rapid</option><option>1+0 Bullet</option><option>30+0 Classical</option></select></div>
      </div>
      <div class="field mt-12"><label>Starts</label><input class="input" id="new-t-start" type="datetime-local"></div>
      <div class="field mt-12"><label>Visibility</label><select class="select" id="new-t-privacy"><option>Public — anyone can join</option><option>Friends only</option><option>Private invite link</option></select></div>
      <div class="field mt-12"><label>Short description</label><textarea class="textarea" id="new-t-desc" maxlength="160" placeholder="Set the tone for your event…"></textarea></div>`;
    const modal = createModal({
      title: 'Create a tournament',
      subtitle: 'A few details and your event is live.',
      body,
      footer: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="confirm-create-t">${icon('plus')} Create event</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    const dateEl = modal.el.querySelector('#new-t-start');
    const d = new Date(Date.now() + 86400000);
    dateEl.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T19:00`;
    modal.el.querySelector('#confirm-create-t').addEventListener('click', () => {
      const name = modal.el.querySelector('#new-t-name').value.trim() || 'Wednesday Night Arena';
      const f = modal.el.querySelector('#new-t-format').value;
      const tc = modal.el.querySelector('#new-t-tc').value;
      const when = dateEl.value ? new Date(dateEl.value) : new Date(Date.now() + 86400000);
      const time = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
      const e = {
        id: 'custom-' + Date.now(),
        name,
        format: `${tc.split(' ')[0]} ${f}`,
        players: 1,
        starts: `${DAYS[when.getDay()]} ${time}`,
        prize: '100',
        emblem: f === 'Swiss' ? '♞' : f === 'Team battle' ? '🛡️' : '⚔️',
        joined: true,
        tone: 'tone-g1',
        status: DAYS[when.getDay()],
        type: f === 'Team battle' ? 'Team' : f
      };
      events.push(e);
      customEvents.push(e);
      Store.set('gambit.customTournaments', customEvents);
      joined.add(e.id);
      persist();
      filter = 'All';
      $$('[data-tourney-filter]').forEach((b) => b.classList.toggle('active', b.dataset.tourneyFilter === 'All'));
      renderGrid();
      renderSchedule();
      renderUserEvents();
      modal.close();
      Sound.play('win');
      toast(`${name} is live. Invite your friends!`, 'success', 'trophy');
    });
  }

  /* ---------------- calendar export ---------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function icsDate(d) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  }
  function exportCalendar() {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gambit//Tournaments//EN', 'CALSCALE:GREGORIAN'];
    events.forEach((e) => {
      const start = startTime(e);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@gambit.local`);
      lines.push(`DTSTAMP:${icsDate(new Date())}`);
      lines.push(`DTSTART:${icsDate(start)}`);
      lines.push(`DTEND:${icsDate(end)}`);
      lines.push(`SUMMARY:Gambit — ${e.name}`);
      lines.push(`DESCRIPTION:${e.format} tournament. ${e.players} players registered.`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gambit-tournaments.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Calendar file downloaded.', 'success', 'calendar');
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const fBtn = e.target.closest('[data-tourney-filter]');
    if (fBtn) {
      filter = fBtn.dataset.tourneyFilter;
      $$('[data-tourney-filter]').forEach((b) => b.classList.toggle('active', b === fBtn));
      renderGrid();
      return;
    }

    const join = e.target.closest('[data-join]');
    if (join) {
      e.stopPropagation();
      const ev = events.find((x) => x.id === join.dataset.join);
      if (ev) joinEvent(ev);
      return;
    }
    const leave = e.target.closest('[data-withdraw]');
    if (leave) {
      e.stopPropagation();
      const ev = events.find((x) => x.id === leave.dataset.withdraw);
      if (ev) withdrawEvent(ev);
      return;
    }

    const card = e.target.closest('[data-tournament-id]');
    if (card) {
      const ev = events.find((x) => x.id === card.dataset.tournamentId);
      if (ev) eventModal(ev);
      return;
    }

    const action = e.target.closest('#my-tournaments, #view-my-events, #browse-events');
    if (action) {
      if (action.id === 'browse-events') $('#tournament-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
      else myEventsModal();
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.t-card')) {
      e.preventDefault();
      const ev = events.find((x) => x.id === e.target.dataset.tournamentId);
      if (ev) eventModal(ev);
    }
  });

  const featuredJoin = $('#featured-join');
  if (featuredJoin) featuredJoin.addEventListener('click', () => {
    if (featured.joined) eventModal(featured);
    else joinEvent(featured);
  });
  const featuredDetails = $('#featured-details');
  if (featuredDetails) featuredDetails.addEventListener('click', () => eventModal(featured));
  const createBtn = $('#create-tournament');
  if (createBtn) createBtn.addEventListener('click', createTournament);
  const cal = $('#calendar-export');
  if (cal) cal.addEventListener('click', exportCalendar);

  /* ---------------- boot ---------------- */
  renderGrid();
  renderHero();
  renderStandings();
  renderSchedule();
  renderUserEvents();
  renderTopFinishers();
  startCountdown();
  window.addEventListener('beforeunload', () => clearInterval(countdownTimer));
})();
