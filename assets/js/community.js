(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const G = window.Gambit;
  const { icon, avatar, toast, Sound, createModal, hydrateIcons, esc, ratingFmt } = G;
  const friends = G.friends;
  const requests = G.requests;
  const THREADS = window.GAMBIT.threads.map((t) => Object.assign({}, t, { voted: false }));
  const CLUBS = window.GAMBIT.clubs.map((c) => Object.assign({}, c));
  const SUGGESTED = [
    { id: 's1', name: 'Lucas Meyer', handle: '@lucasm', rating: 1820, tone: 'tone-5', flag: '🇩🇪', mutual: '3 mutual friends' },
    { id: 's2', name: 'Yuki Tanaka', handle: '@yukit', rating: 2055, tone: 'tone-2', flag: '🇯🇵', mutual: 'Plays the Sicilian' },
    { id: 's3', name: 'Elena Petrova', handle: '@elenap', rating: 1738, tone: 'tone-4', flag: '🇧🇬', mutual: 'London System club' },
    { id: 's4', name: 'Malik Johnson', handle: '@malikj', rating: 1968, tone: 'tone-3', flag: '🇺🇸', mutual: 'From Titled Tuesday' }
  ];
  let forumFilter = 'All';
  let boardFilter = 'Blitz';
  let chatMessages = window.GAMBIT.forumChat.map((m) => Object.assign({}, m));

  /* ---------------- friends ---------------- */
  function friendCard(f) {
    return `<div class="card friend-card">
      ${avatar(f)}
      <div class="grow">
        <h4>${esc(f.name)} <span class="tiny">${f.flag || ''}</span> <span class="status-dot ${f.status}" style="width:6px;height:6px"></span></h4>
        <p>${f.status === 'playing' ? '<span style="color:var(--accent)">Playing</span> · ' : ''}${esc(f.activity || '')}</p>
        <span class="rating">${ratingFmt(f.rating)}</span>
      </div>
      <div class="actions">
        <button data-chat="${f.id}" aria-label="Message ${esc(f.name)}" title="Message">${icon('message')}</button>
        <button data-challenge="${f.id}" aria-label="Challenge ${esc(f.name)}" title="Challenge" ${f.status === 'playing' ? 'disabled style="opacity:.35"' : ''}>${icon('sword')}</button>
      </div>
    </div>`;
  }

  function renderFriends() {
    const host = $('#friend-grid');
    if (host) {
      host.innerHTML = friends.map(friendCard).join('');
      hydrateIcons(host);
    }
    const reqHost = $('#request-list');
    if (reqHost) {
      reqHost.innerHTML = requests.length ? requests.map((r) => `<div class="request-card">
        ${avatar(r)}
        <div class="grow"><h4>${esc(r.name)} <span class="tiny">${r.flag || ''}</span></h4><p>${esc(r.handle)} · ${ratingFmt(r.rating)} · ${esc(r.note || '')}</p></div>
        <button class="btn btn-sm btn-primary" data-request-accept="${r.id}">Accept</button>
        <button class="btn btn-sm btn-ghost" data-request-decline="${r.id}">Decline</button>
      </div>`).join('') : `<div class="empty-state" style="padding:24px">${icon('users')}<h4>No pending requests</h4><p>When someone sends one, it will appear here.</p></div>`;
      hydrateIcons(reqHost);
    }
    const count = $('#friend-count');
    if (count) count.textContent = friends.length;
    const reqCount = $('#request-count');
    if (reqCount) reqCount.textContent = requests.length;
    renderOnline();
  }

  function renderOnline() {
    const host = $('#online-list');
    if (!host) return;
    const online = friends.filter((f) => f.status !== 'offline');
    host.innerHTML = online.map((f) => `<div class="friend-row" data-friend-open="${f.id}">
      ${avatar(f)}<span class="status-dot ${f.status}" style="margin-left:-10px;margin-top:18px;width:8px;height:8px"></span>
      <div class="friend-meta"><div class="friend-name">${esc(f.name)}</div><div class="friend-sub">${f.status === 'playing' ? '<span style="color:var(--accent)">Playing</span> · ' : ''}${esc(f.activity || '')}</div></div>
      <div class="friend-actions" style="opacity:1"><button data-chat="${f.id}" aria-label="Message">${icon('message')}</button></div>
    </div>`).join('');
    const oc = $('#online-count');
    if (oc) oc.textContent = online.length;
    hydrateIcons(host);
  }

  function renderSuggested() {
    const host = $('#suggested-grid');
    if (!host) return;
    host.innerHTML = SUGGESTED.map((p) => `<div class="card friend-card">
      ${avatar(p)}
      <div class="grow"><h4>${esc(p.name)} <span class="tiny">${p.flag}</span></h4><p>${esc(p.mutual)} · ${ratingFmt(p.rating)}</p></div>
      <button class="btn btn-sm btn-outline" data-suggest-add="${p.id}">${icon('userPlus')} Add</button>
    </div>`).join('');
    hydrateIcons(host);
  }

  function addFriendModal() {
    const body = `
      <div class="input-icon">${icon('search')}<input class="input" id="friend-search" placeholder="Search by name or @handle…" autocomplete="off"></div>
      <div class="dropdown-label" style="padding:14px 2px 7px">Suggested for you</div>
      <div id="friend-results">${SUGGESTED.map((p) => `<div class="friend-row" style="padding:9px 2px">
        ${avatar(p)}
        <div class="friend-meta"><div class="friend-name">${esc(p.name)} <span class="tiny">${p.flag}</span></div><div class="friend-sub">${esc(p.handle)} · ${ratingFmt(p.rating)}</div></div>
        <button class="btn btn-sm btn-outline" data-suggest-add="${p.id}">${icon('userPlus')} Add</button>
      </div>`).join('')}</div>`;
    const modal = createModal({
      title: 'Find players',
      subtitle: 'Search by name or handle, or start with a suggestion.',
      body,
      footer: `<button class="btn" data-modal-close>Done</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    const input = modal.el.querySelector('#friend-search');
    const results = modal.el.querySelector('#friend-results');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const list = SUGGESTED.filter((p) => (p.name + ' ' + p.handle).toLowerCase().includes(q));
      results.innerHTML = list.length ? list.map((p) => `<div class="friend-row" style="padding:9px 2px">
        ${avatar(p)}<div class="friend-meta"><div class="friend-name">${esc(p.name)} <span class="tiny">${p.flag}</span></div><div class="friend-sub">${esc(p.handle)} · ${ratingFmt(p.rating)}</div></div>
        <button class="btn btn-sm btn-outline" data-suggest-add="${p.id}">${icon('userPlus')} Add</button></div>`).join('') : `<div class="empty-state" style="padding:22px">${icon('search')}<h4>No players found</h4><p>Try a shorter search.</p></div>`;
      hydrateIcons(results);
    });
    modal.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-suggest-add]');
      if (!btn) return;
      sendRequest(btn.dataset.suggestAdd, btn);
    });
  }

  function sendRequest(id, btn) {
    const p = SUGGESTED.find((x) => x.id === id);
    if (!p) return;
    if (btn) { btn.outerHTML = '<span class="badge badge-green" style="height:28px">Request sent</span>'; }
    Sound.play('notify');
    toast(`Friend request sent to ${p.name}.`, 'success', 'userPlus');
  }

  /* ---------------- clubs ---------------- */
  function renderClubs() {
    const host = $('#club-grid');
    if (!host) return;
    host.innerHTML = CLUBS.map((c) => `<article class="card club-card card-hover">
      <div class="club-banner ${c.tone}"><span class="emblem">${c.emblem}</span></div>
      <div class="club-body">
        <h4>${esc(c.name)}</h4>
        <p>${esc(c.desc)}</p>
        <div class="club-foot">
          <span class="members">${icon('users')} ${esc(c.members)} members</span>
          <button class="btn btn-sm ${c.joined ? 'btn-outline' : 'btn-primary'}" data-club-join="${c.id}">${c.joined ? 'Joined' : 'Join club'}</button>
        </div>
      </div>
    </article>`).join('');
    hydrateIcons(host);
  }

  function clubModal(c) {
    const body = `<div class="course-modal-hero ${c.tone}" style="height:96px"><span class="badge">${c.members} members</span><span class="glyph">${c.emblem}</span></div>
      <p class="small muted" style="line-height:1.65">${esc(c.desc)} This club runs weekly arenas, post-game reviews and a very active forum. Everyone is welcome — bring your questions and your worst losses.</p>
      <div class="stat-row" style="margin-top:14px"><div class="stat"><b>4.8k</b><span>Weekly games</span></div><div class="stat"><b>24</b><span>Events this month</span></div><div class="stat"><b>${c.joined ? 'Member' : 'Open'}</b><span>Status</span></div></div>
      <div class="row gap-8 mt-16">${avatar({ name: 'Maya Chen', tone: 'tone-2' })}${avatar({ name: 'Noah Williams', tone: 'tone-8' })}${avatar({ name: 'Ingrid Larsen', tone: 'tone-4' })}<span class="tiny muted">and ${esc(c.members)} others</span></div>`;
    const modal = createModal({
      title: esc(c.name),
      subtitle: 'Club · ' + esc(c.desc),
      body,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn ${c.joined ? '' : 'btn-primary'}" data-club-join="${c.id}">${c.joined ? 'Leave club' : 'Join club'}</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
  }

  function createClub() {
    const body = `<div class="field"><label>Club name</label><input class="input" id="club-name" placeholder="e.g. The Knight Shift"></div>
      <div class="field mt-12"><label>Short description</label><input class="input" id="club-desc" placeholder="What is this club about?" maxlength="90"></div>
      <div class="field mt-12"><label>Main focus</label><select class="select" id="club-focus"><option>Openings</option><option>Tactics</option><option>Endgames</option><option>Speed chess</option><option>Social</option></select></div>
      <div class="field mt-12"><label>Privacy</label><select class="select"><option>Public — anyone can join</option><option>Request to join</option><option>Private</option></select></div>`;
    const modal = createModal({
      title: 'Create a club',
      subtitle: 'A home for your chess obsession.',
      body,
      footer: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="create-club-submit">${icon('plus')} Create club</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('#create-club-submit').addEventListener('click', () => {
      const name = modal.el.querySelector('#club-name').value.trim() || 'The Knight Shift';
      const desc = modal.el.querySelector('#club-desc').value.trim() || 'A new home for good games.';
      CLUBS.unshift({ id: 'cl-new', name, members: '1', desc, emblem: '♞', tone: 'tone-g1', joined: true });
      renderClubs();
      modal.close();
      toast(`${name} is live. Invite your friends!`, 'success', 'shield');
    });
  }

  /* ---------------- forums ---------------- */
  function renderThreads() {
    const host = $('#thread-list');
    if (!host) return;
    const list = THREADS.filter((t) => forumFilter === 'All' || t.tag === forumFilter);
    host.innerHTML = list.map((t) => `<article class="thread" data-thread-id="${t.id}">
      <div class="thread-vote"><button data-thread-vote="${t.id}" aria-label="Upvote">${icon('chevronUp')}</button><b>${t.votes}</b><button aria-label="Downvote" style="opacity:.45">${icon('chevronDown')}</button></div>
      <div class="thread-main">
        <h4>${esc(t.title)}</h4>
        <p>${esc(t.excerpt)}</p>
        <div class="thread-meta"><span class="badge">${esc(t.tag)}</span>${avatar({ name: t.author, tone: t.tone })}<span>${esc(t.author)}</span><span class="dot"></span><span>${esc(t.time)}</span><span class="dot"></span><span>${t.replies} replies</span></div>
      </div>
    </article>`).join('') || `<div class="empty-state">${icon('message')}<h4>No threads in this topic</h4><p>Start the conversation.</p></div>`;
    hydrateIcons(host);
  }

  function threadModal(t) {
    const body = `<div class="row gap-8" style="margin-bottom:10px"><span class="badge">${esc(t.tag)}</span><span class="tiny muted">${esc(t.time)}</span></div>
      <p class="small" style="line-height:1.7;color:var(--text-2)">${esc(t.excerpt)}</p>
      <div class="row gap-8 mt-16">${avatar({ name: t.author, tone: t.tone })}<div><b style="font-size:12px;display:block">${esc(t.author)}</b><span class="tiny muted">Original poster</span></div><span class="badge badge-green" style="margin-left:auto">${t.votes} upvotes</span></div>
      <div class="dropdown-sep" style="margin:16px 0"></div>
      <div class="dropdown-label" style="padding-bottom:8px">Top replies</div>
      ${[
        ['Maya Chen', 'tone-2', 'I have been playing the Colle for years and the quiet positions are the point. People underestimate how hard it is to create counterplay against a solid structure.'],
        ['Ingrid Larsen', 'tone-4', 'The line you mentioned in the notes is the one I struggled with. Try the ...c5 break earlier — it changes the whole evaluation.'],
        ['Ravi Patel', 'tone-6', 'Saving this thread. My club night is going to be all about this.']
      ].map(([n, tone, text]) => `<div class="chat-msg" style="margin-top:11px">${avatar({ name: n, tone })}<div class="bubble"><b>${n}</b>${text}</div></div>`).join('')}
      <div class="chat-input"><input class="input" id="thread-reply-input" placeholder="Add a thoughtful reply…"><button id="thread-reply-send" aria-label="Reply">${icon('send')}</button></div>`;
    const modal = createModal({
      title: esc(t.title),
      subtitle: `${t.replies} replies · ${esc(t.tag)}`,
      width: 'wide',
      body,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn btn-primary" id="thread-upvote">${icon('chevronUp')} Upvote</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('#thread-upvote').addEventListener('click', () => {
      if (t.voted) return;
      t.voted = true;
      t.votes += 1;
      renderThreads();
      modal.el.querySelector('#thread-upvote').innerHTML = `${icon('check')} Upvoted`;
      hydrateIcons(modal.el.querySelector('#thread-upvote'));
      toast('Upvote added.', 'success', 'chevronUp');
    });
    modal.el.querySelector('#thread-reply-send').addEventListener('click', () => {
      const input = modal.el.querySelector('#thread-reply-input');
      if (!input.value.trim()) return;
      modal.close();
      t.replies += 1;
      renderThreads();
      toast('Reply posted to the thread.', 'success', 'message');
    });
  }

  function newThread() {
    const body = `<div class="field"><label>Title</label><input class="input" id="thread-title" placeholder="What is on your mind?" maxlength="120"></div>
      <div class="field mt-12"><label>Topic</label><select class="select" id="thread-tag"><option>Openings</option><option>Tactics</option><option>Training</option><option>Community</option></select></div>
      <div class="field mt-12"><label>Post</label><textarea class="textarea" id="thread-body" placeholder="Give people something to reply to…"></textarea></div>`;
    const modal = createModal({
      title: 'Start a thread',
      subtitle: 'Keep it friendly, specific and chess-related.',
      body,
      footer: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn-primary" id="post-thread">${icon('send')} Post thread</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('#post-thread').addEventListener('click', () => {
      const title = modal.el.querySelector('#thread-title').value.trim();
      const bodyText = modal.el.querySelector('#thread-body').value.trim();
      if (!title) { toast('Give your thread a title first.', 'error', 'info'); return; }
      const tag = modal.el.querySelector('#thread-tag').value;
      THREADS.unshift({ id: 'th-new', votes: 1, title, excerpt: bodyText || 'New thread — add your thoughts in the replies.', author: G.user ? G.user.name : 'You', tone: '', replies: 0, time: 'Just now', tag, voted: true });
      forumFilter = 'All';
      $$('[data-forum-filter]').forEach((b) => b.classList.toggle('active', b.dataset.forumFilter === 'All'));
      renderThreads();
      modal.close();
      toast('Thread posted. The community can reply now.', 'success', 'message');
    });
  }

  /* ---------------- leaderboards ---------------- */
  function renderLeaderboard() {
    const host = $('#leaderboard-body');
    if (!host) return;
    const base = window.GAMBIT.leaderboard;
    const offsets = { Blitz: 0, Rapid: -34, Bullet: -58 };
    const games = { Blitz: [412, 388, 356, 421, 397], Rapid: [208, 194, 231, 187, 203], Bullet: [612, 574, 538, 601, 566] };
    const wins = { Blitz: [68, 66, 64, 63, 62], Rapid: [61, 60, 58, 57, 56], Bullet: [71, 69, 68, 66, 65] };
    const rows = base.map((p, i) => ({ ...p, rating: p.rating + offsets[boardFilter], games: games[boardFilter][i], win: wins[boardFilter][i], streak: [7, 5, 4, 3, 3][i] }));
    host.innerHTML = rows.map((p) => `<tr><td><span class="rank">${p.rank}</span></td><td><span class="p">${avatar({ name: p.name, tone: p.tone })}<span>${esc(p.name)} ${p.flag}</span></span></td><td class="r">${ratingFmt(p.rating)}</td><td>${p.games}</td><td style="color:var(--brand)">${p.win}%</td><td><span class="badge badge-gold">${p.streak} 🔥</span></td></tr>`).join('');
  }

  /* ---------------- sidebar chat ---------------- */
  function renderChat() {
    const host = $('#community-chat');
    if (!host) return;
    host.innerHTML = chatMessages.map((m) => `<div class="chat-msg">${avatar({ name: m.name, tone: m.tone })}<div class="bubble"><b>${esc(m.name)}</b>${esc(m.text)}</div></div>`).join('');
    host.scrollTop = host.scrollHeight;
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-community-tab]');
    if (tab) {
      $$('[data-community-tab]').forEach((b) => b.classList.toggle('active', b === tab));
      $$('[data-community-pane]').forEach((p) => p.classList.toggle('active', p.dataset.communityPane === tab.dataset.communityTab));
      return;
    }

    const accept = e.target.closest('[data-request-accept]');
    if (accept) {
      const req = requests.find((r) => r.id === accept.dataset.requestAccept);
      if (req) {
        requests.splice(requests.indexOf(req), 1);
        friends.push(Object.assign({}, req, { status: 'online', activity: 'New friend — say hello' }));
        renderFriends();
        Sound.play('win');
        toast(`${req.name} is now your friend.`, 'success', 'userPlus');
      }
      return;
    }
    const decline = e.target.closest('[data-request-decline]');
    if (decline) {
      const req = requests.find((r) => r.id === decline.dataset.requestDecline);
      if (req) requests.splice(requests.indexOf(req), 1);
      renderFriends();
      toast('Request declined.', 'info');
      return;
    }
    const suggest = e.target.closest('[data-suggest-add]');
    if (suggest) { sendRequest(suggest.dataset.suggestAdd, suggest); return; }

    const join = e.target.closest('[data-club-join]');
    if (join) {
      const c = CLUBS.find((x) => x.id === join.dataset.clubJoin);
      if (c) {
        c.joined = !c.joined;
        renderClubs();
        Sound.play(c.joined ? 'win' : 'click');
        toast(c.joined ? `Joined ${c.name}.` : `Left ${c.name}.`, c.joined ? 'success' : 'info', 'shield');
      }
      return;
    }
    const club = e.target.closest('[data-community-action="club-open"]');
    if (club) { const c = CLUBS.find((x) => x.id === club.dataset.club); if (c) clubModal(c); return; }

    const vote = e.target.closest('[data-thread-vote]');
    if (vote) {
      e.stopPropagation();
      const t = THREADS.find((x) => x.id === vote.dataset.threadVote);
      if (t && !t.voted) { t.voted = true; t.votes += 1; renderThreads(); Sound.play('click'); }
      return;
    }
    const thread = e.target.closest('[data-thread-id]');
    if (thread) { const t = THREADS.find((x) => x.id === thread.dataset.threadId); if (t) threadModal(t); return; }

    const ffilter = e.target.closest('[data-forum-filter]');
    if (ffilter) {
      forumFilter = ffilter.dataset.forumFilter;
      $$('[data-forum-filter]').forEach((b) => b.classList.toggle('active', b === ffilter));
      renderThreads();
      return;
    }
    const bfilter = e.target.closest('[data-board-filter]');
    if (bfilter) {
      boardFilter = bfilter.dataset.boardFilter;
      $$('[data-board-filter]').forEach((b) => b.classList.toggle('active', b === bfilter));
      renderLeaderboard();
      return;
    }

    const action = e.target.closest('[data-community-action]');
    if (action) {
      switch (action.dataset.communityAction) {
        case 'add-friend': addFriendModal(); break;
        case 'invite':
          if (navigator.clipboard) navigator.clipboard.writeText(location.origin + '/invite/alexm').catch(() => {});
          toast('Invite link copied — send it to a friend!', 'success', 'copy');
          break;
        case 'create-club': createClub(); break;
        case 'new-thread': newThread(); break;
        case 'leaderboard-info': {
          const modal = createModal({
            title: 'How rankings work',
            subtitle: 'Fair, transparent and updated live.',
            body: `<p class="small muted" style="line-height:1.7">Weekly leaderboards count rated games only. Ratings use Glicko-2, so beating a higher-rated player moves you more than beating a lower-rated one. Provisional ratings (under 15 games) are hidden from the top 100. Ties are broken by win rate, then by number of games.</p><div class="stat-row" style="margin-top:14px"><div class="stat"><b>Glicko-2</b><span>Rating system</span></div><div class="stat"><b>15</b><span>Provisional games</span></div><div class="stat"><b>Live</b><span>Update cadence</span></div></div>`,
            footer: `<button class="btn btn-primary" data-modal-close>Got it</button>`
          });
          modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
          break;
        }
        case 'club-open': break;
      }
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'community-chat-form') {
      e.preventDefault();
      const input = $('#community-chat-input');
      if (!input.value.trim()) return;
      chatMessages.push({ name: G.user ? G.user.name : 'You', tone: '', text: input.value.trim() });
      if (chatMessages.length > 16) chatMessages.shift();
      input.value = '';
      renderChat();
      Sound.play('click');
    }
  });

  /* ---------------- boot ---------------- */
  renderFriends();
  renderSuggested();
  renderClubs();
  renderThreads();
  renderLeaderboard();
  renderChat();
})();
