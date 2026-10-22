/* ============================================================
   GAMBIT — app shell, shared components & interactions
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const Store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  };

  /* ---------------- icons ---------------- */
  const ICONS = {
    play: '<path d="M8 5.1v13.8L19 12 8 5.1Z"/>',
    puzzle: '<path d="M4 7a2 2 0 0 1 2-2h3.2V4a2.8 2.8 0 0 1 5.6 0v1H18a2 2 0 0 1 2 2v3.2h-1a2.8 2.8 0 0 0 0 5.6h1V19a2 2 0 0 1-2 2h-3.2v-1a2.8 2.8 0 0 0-5.6 0v1H6a2 2 0 0 1-2-2v-3.2h1a2.8 2.8 0 0 0 0-5.6H4V7Z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    tv: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Z"/><path d="M9 22V12h6v10"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-3.6-3.6"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.2.6.8 1.1 1.5 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    sword: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
    sparkles: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="M5 3v3M3.5 4.5h3M19 18v3M17.5 19.5h3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="9" r="1"/><circle cx="16" cy="14" r="1"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><circle cx="12" cy="17.2" r=".6" fill="currentColor" stroke="none"/>',
    crown: '<path d="M2 4l3.5 13h13L22 4l-6 7-4-7-4 7-6-7Z"/><path d="M5.5 21h13"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z"/><path d="M4 22v-7"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="m8.2 13.8-1.7 7.2 5.5-3 5.5 3-1.7-7.2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    creditCard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    crosshair: '<circle cx="12" cy="12" r="9"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'
  };

  function icon(name, cls) {
    const body = ICONS[name] || ICONS.info;
    return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  function hydrateIcons(root) {
    $$('[data-icon]', root || document).forEach((el) => {
      el.innerHTML = icon(el.dataset.icon);
      el.removeAttribute('data-icon');
    });
  }

  /* ---------------- state ---------------- */
  const DEFAULT_SETTINGS = { theme: 'dark', boardTheme: 'green', sound: true, coordinates: true, animations: true, autoPromote: false };
  let user = window.GAMBIT.currentUser;
  const settings = Object.assign({}, DEFAULT_SETTINGS, window.GAMBIT.preferences || {});
  const chats = {};
  const requests = window.GAMBIT.requests;
  const friends = window.GAMBIT.friends;
  let preferenceTimer;

  let lastFocus = null;
  let activeDropdown = null;
  let drawerView = 'online';
  let activeChat = null;
  let confirmResolver = null;

  /* ---------------- avatars ---------------- */
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }
  function avatar(person, cls) {
    const p = typeof person === 'string' ? { name: person } : person;
    return `<span class="avatar ${/^tone-[a-z0-9-]+$/.test(p.tone || '') ? p.tone : ''} ${cls || ''}">${esc(initials(p.name))}</span>`;
  }
  const ratingFmt = (n) => Number(n).toLocaleString('en-US');

  /* Original, locally served board samples; no synthetic replacement. */
  const Sound = {
    play(name) { if (settings.sound && name !== 'click') window.BoardAudio?.gameSounds.play(name); },
    move(san, options = {}) { if (settings.sound) window.BoardAudio?.gameSounds.play(window.BoardAudio.moveSound(san, options)); }
  };
  for (const event of ['pointerdown','keydown']) document.addEventListener(event,()=>{if(settings.sound)window.BoardAudio?.gameSounds.unlock();},{capture:true});
  /* ---------------- theme & settings ---------------- */
  function effectiveTheme() {
    if (settings.theme === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return settings.theme;
  }
  function applyTheme() {
    const theme = effectiveTheme();
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f2ec' : '#070b0f');
    syncSettingsUI();
  }
  function applyBoardTheme() {
    $$('.board-wrap').forEach((el) => { el.dataset.board = settings.boardTheme; });
    document.dispatchEvent(new CustomEvent('gambit:settings', { detail: settings }));
  }
  function updateSettings(patch) {
    if((patch.theme||patch.boardTheme)&&window.GAMBIT.legacyPreferences?.theme){window.GambitIntegration.clearCustomTheme();if(window.GambitSession.user)window.GambitAPI.post('/preferences',{theme:{version:1,name:'Predefinito',site:{},board:{}},sound:settings.sound,animations:settings.animations}).catch(error=>toast(error.message,'error'));}
    Object.assign(settings, patch);
    Store.set('gambit.settings', settings);
    if(window.GambitSession.user){clearTimeout(preferenceTimer);preferenceTimer=setTimeout(()=>window.GambitAPI.patch('/platform/preferences',settings).catch(error=>toast(error.message,'error')),300);}
    applyTheme();
    applyBoardTheme();
    syncSettingsUI();
  }
  function syncSettingsUI() {
    $$('[data-theme-set]').forEach((b) => b.classList.toggle('active', b.dataset.themeSet === settings.theme));
    $$('[data-board-set]').forEach((b) => b.classList.toggle('active', b.dataset.boardSet === settings.boardTheme));
    $$('[data-switch]').forEach((b) => b.classList.toggle('on', !!settings[b.dataset.switch]));
    const label = { dark: 'Dark', light: 'Light', system: 'System' }[settings.theme] || 'Dark';
    $$('[data-theme-label]').forEach((el) => { el.textContent = label; });
  }

  /* ---------------- toast ---------------- */
  function toast(message, type = 'success', iconName) {
    let stack = $('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'error' ? 'error' : type === 'info' ? 'info' : '');
    const ic = iconName || (type === 'error' ? 'info' : type === 'info' ? 'info' : 'check');
    el.innerHTML = `<span class="toast-icon">${icon(ic)}</span><span>${esc(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 3400);
  }

  /* ---------------- modals ---------------- */
  function openModal(id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id;
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const focusable = modal.querySelector('input, button, select, textarea, [tabindex]');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 90);
  }
  function closeModal(id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id;
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-backdrop.open')) document.body.style.overflow = '';
    if (lastFocus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  function closeAllOverlays() {
    $$('.modal-backdrop.open').forEach((m) => closeModal(m));
    closeDropdowns();
    closeFriends();
  }
  function confirmDialog(opts) {
    const o = Object.assign({ title: 'Are you sure?', text: '', confirm: 'Confirm', cancel: 'Cancel', danger: false }, opts || {});
    $('#confirm-title').textContent = o.title;
    $('#confirm-text').textContent = o.text;
    const btn = $('#confirm-ok');
    btn.textContent = o.confirm;
    btn.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');
    openModal('confirm-modal');
    return new Promise((resolve) => { confirmResolver = resolve; });
  }

  let dynamicModalId = 0;
  function createModal(opts) {
    const o = Object.assign({ title: '', subtitle: '', body: '', footer: '', width: '', id: '' }, opts || {});
    const id = o.id || 'dynamic-modal-' + (++dynamicModalId);
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = id;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="modal ${o.width || ''}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="modal-head">
        <div><h3 id="${id}-title">${esc(o.title)}</h3>${o.subtitle ? `<p>${esc(o.subtitle)}</p>` : ''}</div>
        <button class="modal-close" data-close-modal="${id}" aria-label="Close">${icon('x')}</button>
      </div>
      <div class="modal-body">${o.body}</div>
      ${o.footer ? `<div class="modal-foot">${o.footer}</div>` : ''}
    </div>`;
    document.body.appendChild(el);
    openModal(id);
    return { id, el, close: () => closeModal(id), remove: () => el.remove() };
  }

  /* ---------------- dropdowns ---------------- */
  function closeDropdowns() {
    $$('.dropdown-panel.open').forEach((p) => p.classList.remove('open'));
    activeDropdown = null;
  }
  function toggleDropdown(name) {
    const panel = document.querySelector(`[data-panel="${name}"]`);
    if (!panel) return;
    const wasOpen = panel.classList.contains('open');
    closeDropdowns();
    if (!wasOpen) { panel.classList.add('open'); activeDropdown = name; }
  }

  /* ---------------- header ---------------- */
  const NAV = [
    { page: 'play', href: 'play.html', label: 'Play', icon: 'play' },
    { page: 'puzzles', href: 'puzzles.html', label: 'Puzzles', icon: 'puzzle' },
    { page: 'learn', href: 'learn.html', label: 'Learn', icon: 'book' },
    { page: 'watch', href: 'watch.html', label: 'Watch', icon: 'tv' },
    { page: 'community', href: 'community.html', label: 'Community', icon: 'users' },
    { page: 'tournaments', href: 'tournaments.html', label: 'Tournaments', icon: 'trophy' }
  ];

  function notificationsPanel() {
    const list = window.GAMBIT.notifications;
    const unread = list.filter((n) => n.unread).length;
    return `
      <div class="dropdown-panel wide" data-panel="notifications">
        <div class="dropdown-head">
          <h4>Notifications ${unread ? `<span class="badge badge-green">${unread} new</span>` : ''}</h4>
          <button class="btn btn-ghost btn-sm" data-action="read-all" style="height:26px;padding:0 8px;font-size:10.5px">Mark all read</button>
        </div>
        <div id="notification-list">
          ${list.map((n) => `
            <div class="notif-item ${n.unread ? 'unread' : ''}" data-action="notif-read" data-id="${n.id}">
              <span class="notif-icon">${icon(n.icon)}</span>
              <div class="notif-copy"><p>${esc(n.text)}</p><span>${esc(n.time)}</span></div>
              ${n.unread ? '<span class="status-dot online" style="margin-left:auto;margin-top:6px"></span>' : ''}
            </div>`).join('')}
        </div>
        <div class="dropdown-sep"></div>
        <button class="dropdown-item" data-action="notif-settings">${icon('settings')} Notification settings</button>
      </div>`;
  }

  function userPanel() {
    return `
      <div class="dropdown-panel" data-panel="user" style="width:250px">
        <div style="padding:10px 10px 8px">
          <div class="row gap-12">
            ${avatar(user, 'avatar-ring')}
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:650">${esc(user.name)}</div>
              <div class="tiny muted">${esc(user.handle)} · ${ratingFmt(user.rating)}</div>
            </div>
          </div>
          <div class="tiny muted mt-8">${esc(user.admin ? 'Amministratore' : 'Giocatore')} · ${esc(user.handle)}</div>
        </div>
        <div class="dropdown-sep"></div>
        <a class="dropdown-item" href="profile.html">${icon('user')} My profile</a>
        <button class="dropdown-item" data-action="open-settings">${icon('settings')} Settings</button>
        <button class="dropdown-item" data-action="open-settings" data-focus-theme="1">${icon('palette')} Board & pieces</button>
        <button class="dropdown-item" data-action="friends">${icon('users')} Friends <span class="shortcut">${friends.filter((f) => f.status !== 'offline').length} online</span></button>
        <div class="dropdown-sep"></div>
        <button class="dropdown-item" data-action="logout">${icon('logOut')} Log out</button>
      </div>`;
  }

  function headerHTML() {
    const page = document.body.dataset.page;
    return `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="index.html" aria-label="Gambit home">
          <span class="brand-mark">♞</span>
          <span class="brand-name">gam<span>bit</span></span>
        </a>
        <nav class="main-nav" aria-label="Main">
          ${NAV.filter(n=>n.page!=='watch'||window.GambitConfig.FEATURE_FLAGS.watch).map((n) => `<a href="${n.href}" class="${page === n.page ? 'active' : ''}">${icon(n.icon)}${n.label}</a>`).join('')}
        </nav>
        <div class="header-actions">
          <button class="search-trigger" data-action="palette" aria-label="Search">${icon('search')}<span>Search</span><kbd>⌘K</kbd></button>
          <button class="icon-btn" data-action="friends" aria-label="Friends" style="position:relative">
            ${icon('users')}<span class="badge-dot"></span>
          </button>
          <div class="dropdown">
            <button class="icon-btn" data-action="notifications" aria-label="Notifications">${icon('bell')}<span class="badge-dot" id="notif-dot"></span></button>
            ${notificationsPanel()}
          </div>
          <button class="icon-btn" data-action="theme" aria-label="Toggle theme">${icon(effectiveTheme() === 'light' ? 'moon' : 'sun')}</button>
          ${user ? `
            <div class="dropdown">
              <button class="user-chip" data-action="user-menu" aria-label="Account menu">
                ${avatar(user)}
                <span class="chip-copy"><span class="chip-name">${esc(user.name.split(' ')[0])}</span><span class="chip-rating">${ratingFmt(user.rating)}</span></span>
                ${icon('chevronDown')}
              </button>
              ${userPanel()}
            </div>` : `
            <button class="btn btn-ghost btn-sm" data-action="auth" data-auth="login">Log in</button>
            <button class="btn btn-primary btn-sm" data-action="auth" data-auth="signup">Sign up</button>`}
        </div>
      </div>
    </header>
    <nav class="mobile-nav" aria-label="Mobile">
      <a href="index.html" class="${page === 'home' ? 'active' : ''}">${icon('home')}Home</a>
      <a href="play.html" class="${page === 'play' ? 'active' : ''}">${icon('play')}Play</a>
      <a href="puzzles.html" class="${page === 'puzzles' ? 'active' : ''}">${icon('puzzle')}Puzzles</a>
      <a href="community.html" class="${page === 'community' ? 'active' : ''}">${icon('users')}Friends</a>
      <a href="profile.html" class="${page === 'profile' ? 'active' : ''}">${icon('user')}Profile</a>
    </nav>`;
  }

  function renderHeader() {
    const host = $('#site-header');
    if (!host) return;
    host.innerHTML = headerHTML();
    updateNotifDot();
  }

  function updateProfile(patch) {
    return window.GambitAPI.patch('/platform/profile',patch).then(()=>location.reload()).catch(error=>toast(error.message,'error'));
  }

  function updateNotifDot() {
    const dot = $('#notif-dot');
    const list = window.GAMBIT.notifications;
    if (dot) dot.style.display = list.some((n) => n.unread) ? '' : 'none';
    const friendBadge = $('[data-action="friends"] .badge-dot');
    if (friendBadge) friendBadge.style.display = requests.length ? '' : 'none';
  }

  /* ---------------- footer ---------------- */
  function footerHTML() {
    return `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a class="brand" href="index.html"><span class="brand-mark">♞</span><span class="brand-name">gam<span>bit</span></span></a>
            <p>The friendly home of online chess. Play, learn, and find your people — one move at a time.</p>

          </div>
          <div class="footer-col"><h5>Play</h5><a href="play.html">Play online</a><a href="play.html?mode=computer">vs Computer</a><a href="play.html?mode=friend">Play a friend</a><a href="puzzles.html">Puzzles</a><a href="tournaments.html">Tournaments</a></div>
          <div class="footer-col"><h5>Learn</h5><a href="learn.html">Courses</a><a href="learn.html">Openings</a><a href="learn.html">Endgames</a><a href="puzzles.html">Tactics trainer</a><a href="watch.html">Video library</a></div>
          <div class="footer-col"><h5>Community</h5><a href="community.html">Friends</a><a href="community.html">Clubs</a><a href="community.html">Forums</a><a href="community.html">Leaderboards</a><a href="watch.html">Streamers</a></div>
          <div class="footer-col"><h5>Account</h5><a href="profile.html">Profilo e storico</a><button class="link-more" data-action="open-settings">Impostazioni</button><button class="link-more" data-action="friends">Amici e chat</button><a href="/classic/">Interfaccia classica</a></div>
        </div>
        <div class="footer-bottom">
          <span>Gambit · Aura Chess · Stockfish 19</span>
          <span class="row gap-16"><a href="/classic/">Interfaccia classica</a><a href="/privacy.html">Privacy</a><a href="/about.html">Regole e fonti</a></span>
        </div>
      </div>
    </footer>`;
  }

  /* ---------------- friends drawer ---------------- */
  function friendsDrawerHTML() {
    return `
    <div class="drawer-backdrop" data-action="close-friends"></div>
    <aside class="drawer" id="friends-drawer" aria-label="Friends" aria-hidden="true">
      <div class="drawer-head">
        <div>
          <h3>Friends</h3>
          <span class="small muted"><span class="status-dot online" style="display:inline-block"></span> ${friends.filter((f) => f.status !== 'offline').length} online now</span>
        </div>
        <button class="modal-close" data-action="close-friends" aria-label="Close">${icon('x')}</button>
      </div>
      <div class="drawer-tabs" id="drawer-tabs">
        <div class="tabs">
          <button data-friend-tab="online" class="active">Online</button>
          <button data-friend-tab="requests">Requests ${requests.length ? `<span class="badge badge-green" style="height:16px;padding:0 5px">${requests.length}</span>` : ''}</button>
          <button data-friend-tab="add">Add friend</button>
        </div>
      </div>
      <div class="drawer-body" id="friends-body"></div>
      <div class="drawer-foot" id="friends-foot">
        <button class="btn btn-outline btn-block btn-sm" data-action="invite-friend">${icon('userPlus')} Invite a friend to Gambit</button>
      </div>
    </aside>`;
  }

  function friendRow(f) {
    return `
      <div class="friend-row" data-friend-open="${f.id}">
        <span style="position:relative">${avatar(f)}<span class="status-dot ${f.status}" style="position:absolute;bottom:0;right:0;width:10px;height:10px"></span></span>
        <div class="friend-meta">
          <div class="friend-name">${esc(f.name)} <span class="tiny muted" style="font-weight:400">${f.flag || ''}</span></div>
          <div class="friend-sub">${f.status === 'playing' ? '<span style="color:var(--accent)">Playing</span> · ' : ''}${esc(f.activity || '')}</div>
        </div>
        <div class="friend-actions" style="opacity:1">
          <button data-chat="${f.id}" class="tooltip" data-tip="Message" aria-label="Message">${icon('message')}</button>
          <button data-challenge="${f.id}" class="tooltip" data-tip="Challenge" aria-label="Challenge" ${f.status === 'playing' ? 'disabled style="opacity:.35"' : ''}>${icon('sword')}</button>
        </div>
      </div>`;
  }

  function renderFriends() {
    const body = $('#friends-body');
    const tabs = $('#drawer-tabs');
    const foot = $('#friends-foot');
    if (!body) return;
    if (tabs) tabs.style.display = '';
    if (foot) foot.style.display = '';

    if (drawerView === 'online') {
      const online = friends.filter((f) => f.status !== 'offline');
      const offline = friends.filter((f) => f.status === 'offline');
      body.innerHTML = `
        <div class="dropdown-label" style="padding:0 4px 6px">Online — ${online.length}</div>
        ${online.map(friendRow).join('')}
        ${offline.length ? `<div class="dropdown-label" style="padding:16px 4px 6px">Offline — ${offline.length}</div>${offline.map(friendRow).join('')}` : ''}
        <div class="dropdown-sep" style="margin:14px 4px"></div>
        <div class="row gap-8" style="padding:0 4px">
          <button class="btn btn-sm btn-outline grow" data-friend-tab="add">${icon('userPlus')} Find players</button>
          <button class="btn btn-sm grow" data-action="create-challenge">${icon('sword')} New challenge</button>
        </div>`;
    } else if (drawerView === 'requests') {
      body.innerHTML = requests.length ? `
        <div class="dropdown-label" style="padding:0 4px 8px">Friend requests — ${requests.length}</div>
        ${requests.map((r) => `
          <div class="request-card" style="padding:10px 4px">
            ${avatar(r)}
            <div class="grow">
              <h4 style="font-size:12.5px">${esc(r.name)} <span class="tiny muted">${r.flag || ''}</span></h4>
              <p>${esc(r.handle)} · ${ratingFmt(r.rating)}</p>
              <p style="margin-top:3px;font-style:italic">“${esc(r.note || '')}”</p>
            </div>
            <div class="row gap-4">
              <button class="btn btn-primary btn-sm" data-action="accept-request" data-id="${r.id}" style="width:30px;padding:0">${icon('check')}</button>
              <button class="btn btn-sm" data-action="decline-request" data-id="${r.id}" style="width:30px;padding:0">${icon('x')}</button>
            </div>
          </div>`).join('')}` : `
        <div class="empty-state">${icon('users')}<h4>No pending requests</h4><p>When someone wants to connect, they'll show up here.</p></div>`;
    } else {
      body.innerHTML = `
        <div class="input-icon" style="margin-bottom:14px">${icon('search')}<input class="input" id="friend-search" placeholder="Search by name or @handle" autocomplete="off"></div>
        <div id="friend-search-results"></div>`;
      renderFriendSearch('');
      const input = $('#friend-search');
      if (input) { input.addEventListener('input', (e) => renderFriendSearch(e.target.value)); setTimeout(() => input.focus(), 120); }
      if (foot) foot.style.display = 'none';
    }
  }

  function renderFriendSearch(query) {
    const host = $('#friend-search-results');
    if (!host) return;
    const q = query.trim().toLowerCase();
    const suggestions = [
      { id: 's1', name: 'Lucas Meyer', handle: '@lucasm', rating: 1820, tone: 'tone-5', flag: '🇩🇪', activity: 'Plays the Caro-Kann', status: 'offline' },
      { id: 's2', name: 'Yuki Tanaka', handle: '@yukit', rating: 2055, tone: 'tone-2', flag: '🇯🇵', activity: 'Puzzle enthusiast', status: 'offline' },
      { id: 's3', name: 'Elena Petrova', handle: '@elenap', rating: 1738, tone: 'tone-4', flag: '🇧🇬', activity: 'London System club', status: 'offline' },
      { id: 's4', name: 'Mila Novak', handle: '@milanovak', rating: 1946, tone: 'tone-7', flag: '🇸🇮', activity: 'Rapid specialist', status: 'offline' }
    ];
    const all = friends.concat(suggestions.filter((s) => !friends.some((f) => f.name === s.name)));
    const filtered = all.filter((f) => !q || f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q));
    if (!filtered.length) {
      host.innerHTML = `<div class="empty-state" style="padding:28px 10px">${icon('search')}<h4>No players found</h4><p>Try a different name or handle.</p></div>`;
      return;
    }
    host.innerHTML = `<div class="dropdown-label" style="padding:0 4px 6px">${q ? 'Results' : 'Suggested for you'}</div>` +
      filtered.map((f) => `
        <div class="friend-row" style="cursor:default">
          ${avatar(f)}
          <div class="friend-meta">
            <div class="friend-name">${esc(f.name)} <span class="tiny muted" style="font-weight:400">${f.flag || ''}</span></div>
            <div class="friend-sub">${esc(f.handle)} · ${ratingFmt(f.rating)}</div>
          </div>
          ${friends.some((x) => x.id === f.id)
            ? `<span class="badge">Friend</span>`
            : `<button class="btn btn-sm btn-outline" data-action="send-friend-request" data-id="${f.id}">${icon('plus')} Add</button>`}
        </div>`).join('');
  }

  function openFriends(tab) {
    drawerView = tab || 'online';
    activeChat = null;
    renderFriends();
    $$('#drawer-tabs [data-friend-tab]').forEach((b) => b.classList.toggle('active', b.dataset.friendTab === drawerView));
    $('.drawer-backdrop')?.classList.add('open');
    $('#friends-drawer')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeFriends() {
    $('.drawer-backdrop')?.classList.remove('open');
    $('#friends-drawer')?.classList.remove('open');
    if (!document.querySelector('.modal-backdrop.open')) document.body.style.overflow = '';
    activeChat = null;
  }

  function openChat(id) {
    const friend = friends.find((f) => f.id === id) || { id, name: 'Player', tone: '' };
    activeChat = friend;
    drawerView = 'chat';
    const tabs = $('#drawer-tabs'); if (tabs) tabs.style.display = 'none';
    const foot = $('#friends-foot'); if (foot) foot.style.display = 'none';
    const body = $('#friends-body');
    if (!body) return;
    const msgs = chats[id] || [];
    body.innerHTML = `
      <div class="row gap-8" style="margin-bottom:14px">
        <button class="icon-btn" data-action="back-friends" style="width:30px;height:30px">${icon('chevronLeft')}</button>
        <span style="position:relative">${avatar(friend)}<span class="status-dot ${friend.status || 'online'}" style="position:absolute;bottom:0;right:0;width:10px;height:10px"></span></span>
        <div class="grow">
          <div style="font-size:12.5px;font-weight:600">${esc(friend.name)}</div>
          <div class="tiny muted">${friend.status === 'playing' ? 'In a game' : 'Online'} · ${esc(friend.handle || '')}</div>
        </div>
        <button class="icon-btn" data-challenge="${friend.id}" style="width:30px;height:30px" aria-label="Challenge">${icon('sword')}</button>
      </div>
      <div class="drawer-chat" id="drawer-chat"></div>
      <div class="quick-chat" style="margin-top:12px">
        <button data-quickchat="Good luck!">Good luck!</button>
        <button data-quickchat="gg">gg</button>
        <button data-quickchat="Rematch?">Rematch?</button>
        <button data-quickchat="Let's analyse after">Analyse after?</button>
      </div>
      <form class="chat-input" id="drawer-chat-form">
        <input class="input" id="drawer-chat-input" placeholder="Message ${esc(friend.name.split(' ')[0])}..." autocomplete="off">
        <button type="submit" aria-label="Send">${icon('send')}</button>
      </form>`;
    renderChatMessages();
    loadChat(id);
    const input = $('#drawer-chat-input');
    if (input) setTimeout(() => input.focus(), 120);
    $('#drawer-chat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      sendChat(friend.id, input.value);
      input.value = '';
    });

  }

  function renderChatMessages() {
    const host = $('#drawer-chat');
    if (!host || !activeChat) return;
    const msgs = chats[activeChat.id] || [];
    host.innerHTML = msgs.length ? msgs.map((m) => `
      <div class="chat-msg ${m.me ? 'mine' : ''}">
        ${m.me ? '' : avatar(activeChat, 'avatar sm')}
        <div class="bubble">${m.me ? '' : `<b>${esc(activeChat.name.split(' ')[0])} · ${esc(m.time)}</b>`}${esc(m.text)}</div>
      </div>`).join('') : `<div class="empty-state" style="padding:30px 10px">${icon('message')}<h4>Say hello</h4><p>Start a conversation with ${esc(activeChat.name.split(' ')[0])}.</p></div>`;
    host.scrollTop = host.scrollHeight;
  }

  function sendChat(id, text) {
    if (!text?.trim()) return;
    return window.GambitAPI.post('/platform/messages/dm/'+encodeURIComponent(id),{text:text.trim()}).then(()=>loadChat(id)).catch(error=>toast(error.message,'error'));
  }
  async function loadChat(id) {
    try { const data=await window.GambitAPI.get('/platform/messages/dm/'+encodeURIComponent(id)); chats[id]=data.items.map(m=>({id:m.id,me:m.author===window.GambitSession.user?.id,text:m.body,time:new Date(m.created*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})})); if(activeChat?.id===id)renderChatMessages();window.GambitAPI.post('/platform/messages/dm/'+encodeURIComponent(id)+'/read').catch(()=>{}); }
    catch(error){toast(error.message,'error');}
  }

  function acceptRequest(id) { return window.GambitAPI.post('/friends/'+encodeURIComponent(id)+'/reply',{accept:true}).then(refreshFriends).catch(error=>toast(error.message,'error')); }
  function declineRequest(id) { return window.GambitAPI.post('/friends/'+encodeURIComponent(id)+'/reply',{accept:false}).then(refreshFriends).catch(error=>toast(error.message,'error')); }
  async function refreshFriends() {
    if(!window.GambitSession.user)return;
    const data=await window.GambitAPI.get('/friends');
    friends.splice(0,friends.length,...data.friends.map(window.GambitAdapters.friend));
    requests.splice(0,requests.length,...data.incoming.map(window.GambitAdapters.friend));
    window.GAMBIT.outgoing=data.outgoing;
    if(document.getElementById('friends-drawer')?.classList.contains('open'))renderFriends();
    updateNotifDot();document.dispatchEvent(new CustomEvent('gambit:friends'));
  }

  /* ---------------- challenge ---------------- */
  let challengeTarget = null;
  function openChallenge(friendId) {
    const f = friends.find((x) => x.id === friendId);
    challengeTarget = f || null;
    const host = $('#challenge-friend');
    if (host) host.innerHTML = challengeTarget ? `${avatar(challengeTarget, 'avatar sm')} ${esc(challengeTarget.name)} <span class="muted tiny">· ${ratingFmt(challengeTarget.rating)}</span>` : 'Choose an opponent from your friends list.';
    openModal('challenge-modal');
  }
  function sendChallenge() {
    const tc=$('#challenge-modal .time-opt.active b')?.textContent || '5+3';
    const [minutes,increment]=tc.split('+').map(Number),color=$('#challenge-modal [data-color].active')?.dataset.color||'random';
    if(!challengeTarget){toast('Scegli un amico da sfidare.','info');return;}
    const button=$('[data-action="send-challenge"]');if(button)button.disabled=true;
    window.GambitAPI.post('/challenges',{recipient_id:challengeTarget.id,base:minutes*60,increment:increment||0,color,rated:!!$('#challenge-ranked')?.checked}).then(()=>{closeModal('challenge-modal');toast('Sfida inviata. Attendo la risposta.');}).catch(error=>toast(error.message,'error')).finally(()=>{if(button)button.disabled=false;});
  }

  /* ---------------- auth ---------------- */
  function setUser(next) { user=next;renderHeader();syncSettingsUI(); }
  function openAuth(mode) {
    switchAuthTab(mode === 'signup' ? 'signup' : 'login');
    openModal('auth-modal');
  }
  function switchAuthTab(tab) {
    $$('.auth-pane').forEach((p) => p.classList.toggle('active', p.dataset.authPane === tab));
    $$('.auth-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.authTab === tab));
    const title = $('#auth-title');
    if (title) title.textContent = tab === 'signup' ? 'Create your account' : 'Welcome back';
  }
  async function handleAuth(form) {
    const active=$('.auth-pane.active');if(!active)return;
    const signup=active.dataset.authPane==='signup';const values={};$$('input',active).forEach(i=>{values[i.name]=i.name==='password'?i.value:i.value.trim();});
    const name=signup?values.name:values.email;
    if(!name || !values.password){toast('Inserisci nome utente e password.','error');return;}
    if(signup && values.password.length<12){toast('Scegli una password di almeno 12 caratteri.','error');return;}
    const button=$('button[type="submit"]',active);if(button)button.disabled=true;
    try{await window.GambitSession.login(name,values.password,signup);if(window.GambitSession.user.must_change_password){closeModal('auth-modal');window.GambitIntegration.passwordDialog(true);}else location.reload();}
    catch(error){toast(error.message,'error');}finally{if(button)button.disabled=false;}
  }

  /* ---------------- command palette ---------------- */
  const paletteActions = [
    { label: 'Play a game', hint: 'Quick match', icon: 'play', href: 'play.html' },
    { label: 'Play vs Computer', hint: 'Train', icon: 'crosshair', href: 'play.html?mode=computer' },
    { label: 'Play a Friend', hint: 'Challenge', icon: 'sword', action: 'friends' },
    { label: 'Daily Puzzle', hint: 'Puzzles', icon: 'puzzle', href: 'puzzles.html' },
    { label: 'Puzzle Rush', hint: 'Speed training', icon: 'bolt', href: 'puzzles.html' },
    { label: 'Browse Courses', hint: 'Learn', icon: 'book', href: 'learn.html' },
    { label: 'Opening Explorer', hint: 'Learn', icon: 'search', href: 'learn.html' },
    { label: 'Live Streams', hint: 'Watch', icon: 'tv', href: 'watch.html' },
    { label: 'Tournaments', hint: 'Compete', icon: 'trophy', href: 'tournaments.html' },
    { label: 'Friends & Chat', hint: 'Community', icon: 'users', action: 'friends' },
    { label: 'Clubs & Forums', hint: 'Community', icon: 'globe', href: 'community.html' },
    { label: 'My Profile', hint: 'Account', icon: 'user', href: 'profile.html' },
    { label: 'Game History', hint: 'Review', icon: 'clock', href: 'profile.html' },
    { label: 'Settings', hint: 'Preferences', icon: 'settings', action: 'settings' },
    { label: 'Toggle Theme', hint: 'Appearance', icon: 'sun', action: 'theme' }
  ];
  let paletteIndex = 0;
  let paletteFiltered = paletteActions;

  function openPalette() {
    openModal('palette-backdrop');
    const input = $('#palette-input');
    if (input) { input.value = ''; input.focus(); }
    renderPalette('');
  }
  function renderPalette(query) {
    const q = query.trim().toLowerCase();
    paletteFiltered = paletteActions.filter((a) => (!a.href?.includes('watch.html') || window.GambitConfig.FEATURE_FLAGS.watch) && (!q || (a.label + ' ' + a.hint).toLowerCase().includes(q)));
    if (q) {
      const people = friends.filter((f) => f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q))
        .map((f) => ({ label: f.name, hint: 'Message friend', icon: 'message', action: 'chat', id: f.id, person: f }));
      paletteFiltered = paletteFiltered.concat(people);
    }
    paletteIndex = 0;
    const host = $('#palette-results');
    if (!host) return;
    if (!paletteFiltered.length) {
      host.innerHTML = `<div class="empty-state" style="padding:26px">${icon('search')}<h4>Nothing found</h4><p>Try “play”, “puzzle” or a friend's name.</p></div>`;
      return;
    }
    let lastGroup = '';
    host.innerHTML = paletteFiltered.map((a, i) => {
      const group = a.id ? 'Friends' : 'Jump to';
      let out = '';
      if (group !== lastGroup) { out += `<div class="palette-group">${group}</div>`; lastGroup = group; }
      out += `<button class="palette-item ${i === 0 ? 'selected' : ''}" data-palette-index="${i}">
        ${a.person ? avatar(a.person, 'avatar sm') : icon(a.icon)}
        <span>${esc(a.label)}</span><span class="palette-hint">${esc(a.hint)}</span>
      </button>`;
      return out;
    }).join('');
  }
  function paletteChoose(i) {
    const item = paletteFiltered[i];
    if (!item) return;
    closeModal('palette-backdrop');
    Sound.play('click');
    if (item.href) window.location.href = item.href;
    else if (item.action === 'settings') openModal('settings-modal');
    else if (item.action === 'friends') openFriends('online');
    else if (item.action === 'chat') { openFriends('online'); openChat(item.id); }
    else if (item.action === 'theme') { toggleTheme(); }
  }
  function toggleTheme() {
    const next = effectiveTheme() === 'light' ? 'dark' : 'light';
    updateSettings({ theme: next });
    renderHeader();
    recurseDrops();
    toast(`Switched to ${next} mode.`, 'info', next === 'light' ? 'sun' : 'moon');
  }
  function recurseDrops() { /* dropdowns were rebuilt with header */ }

  /* ---------------- boot ---------------- */
  function mountOverlays() {
    if ($('#app-overlays')) return;
    const wrap = document.createElement('div');
    wrap.id = 'app-overlays';
    wrap.innerHTML = `
      <!-- AUTH -->
      <div class="modal-backdrop" id="auth-modal" aria-hidden="true">
        <div class="modal narrow" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div class="modal-head">
            <div>
              <span class="brand-mark" style="width:38px;height:38px;font-size:22px;display:grid;place-items:center;border-radius:11px;margin-bottom:12px">♞</span>
              <h3 id="auth-title">Welcome back</h3>
              <p>Play, learn and connect with players around the world.</p>
            </div>
            <button class="modal-close" data-close-modal="auth-modal" aria-label="Close">${icon('x')}</button>
          </div>
          <div class="modal-body">
            <div class="tabs auth-tabs" style="margin-bottom:18px">
              <button data-auth-tab="login" class="active">Log in</button>
              <button data-auth-tab="signup">Sign up</button>
            </div>
            <form id="auth-form" novalidate>
              <div class="auth-pane active" data-auth-pane="login">
                <div class="stack gap-12">
                  <div class="field"><label for="login-email">Username</label><input class="input" id="login-email" name="email" placeholder="nome_utente" autocomplete="username"></div>
                  <div class="field"><label for="login-password">Password</label><input class="input" id="login-password" name="password" type="password" placeholder="••••••••" autocomplete="current-password"></div>
                  <div class="row" style="justify-content:space-between;font-size:11.5px">
                    <span class="tiny muted">Sessione sul dispositivo</span>

                  </div>
                  <button class="btn btn-primary btn-block" type="submit">Log in</button>
                </div>
              </div>
              <div class="auth-pane" data-auth-pane="signup">
                <div class="stack gap-12">
                  <div class="field"><label for="signup-name">Username</label><input class="input" id="signup-name" name="name" placeholder="How should we call you?" autocomplete="nickname"></div>
                  <div class="field"><label for="signup-password">Password</label><input class="input" id="signup-password" name="password" type="password" placeholder="At least 12 characters" autocomplete="new-password"></div>
                  <p class="tiny muted">Consulta la <a href="/privacy.html" target="_blank" rel="noopener">privacy</a> e le <a href="/about.html" target="_blank" rel="noopener">regole di gioco</a>. Gli account e le attività sono soggetti a moderazione.</p>
                  <button class="btn btn-primary btn-block" type="submit">Create my account</button>
                </div>
              </div>
            </form>

          </div>
        </div>
      </div>

      <!-- SETTINGS -->
      <div class="modal-backdrop" id="settings-modal" aria-hidden="true">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div class="modal-head">
            <div><h3 id="settings-title">Settings</h3><p>Make Gambit feel like yours.</p></div>
            <button class="modal-close" data-close-modal="settings-modal" aria-label="Close">${icon('x')}</button>
          </div>
          <div class="modal-body">
            <div class="settings-group">
              <div class="settings-label">Appearance</div>
              <div class="settings-row">
                <div><b>Theme</b><span>Choose your preferred look.</span></div>
                <div class="btn-group" style="width:210px">
                  <button data-theme-set="dark">Dark</button>
                  <button data-theme-set="light">Light</button>
                  <button data-theme-set="system">System</button>
                </div>
              </div>
              <div class="settings-row">
                <div><b>Board theme</b><span>Applied across games and puzzles.</span></div>
                <div class="board-swatches">
                  ${['green', 'walnut', 'ocean', 'violet', 'slate', 'neon'].map((b) => `
                    <button class="board-swatch" data-board-set="${b}" data-board="${b}" aria-label="${b}">
                      <i></i><i></i><i></i><i></i>
                    </button>`).join('')}
                </div>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-label">Gameplay</div>
              <div class="settings-row"><div><b>Sound effects</b><span>Moves, captures and check alerts.</span></div><button class="switch" data-switch="sound" aria-label="Sound"></button></div>
              <div class="settings-row"><div><b>Board coordinates</b><span>Show files and ranks on the board.</span></div><button class="switch" data-switch="coordinates" aria-label="Coordinates"></button></div>
              <div class="settings-row"><div><b>Piece animations</b><span>Animate moves on the board.</span></div><button class="switch" data-switch="animations" aria-label="Animations"></button></div>
              <div class="settings-row"><div><b>Auto-promote to queen</b><span>Skip the promotion picker.</span></div><button class="switch" data-switch="autoPromote" aria-label="Auto promote"></button></div>
            </div>
            <div class="settings-group">
              <div class="settings-label">Account preview</div>
              <div class="settings-row"><div><b>Profile</b><span>${user ? esc(user.name) + ' · ' + esc(user.handle) : 'Not signed in'}</span></div>${user ? `<a class="btn btn-sm" href="profile.html">View</a>` : `<button class="btn btn-sm btn-primary" data-action="auth" data-auth="login">Log in</button>`}</div>
              <div class="settings-row"><div><b>Notifications</b><span>Friend requests, challenges and events.</span></div><button class="btn btn-sm" data-action="notif-settings">Manage</button></div>
            </div>
          </div>
          <div class="modal-foot"><button class="btn btn-primary" data-close-modal="settings-modal">Done</button></div>
        </div>
      </div>

      <!-- CHALLENGE -->
      <div class="modal-backdrop" id="challenge-modal" aria-hidden="true">
        <div class="modal narrow" role="dialog" aria-modal="true" aria-labelledby="challenge-title">
          <div class="modal-head">
            <div><h3 id="challenge-title">New challenge</h3><p>Pick a rhythm and send the invitation.</p></div>
            <button class="modal-close" data-close-modal="challenge-modal" aria-label="Close">${icon('x')}</button>
          </div>
          <div class="modal-body">
            <div class="challenge-to" id="challenge-friend"></div>
            <div class="time-grid" style="margin:16px 0 6px">
              <div class="time-opt"><b>1+0</b><span>Bullet</span></div>
              <div class="time-opt"><b>3+2</b><span>Blitz</span></div>
              <div class="time-opt active"><b>5+3</b><span>Blitz</span></div>
              <div class="time-opt"><b>10+0</b><span>Rapid</span></div>
              <div class="time-opt"><b>15+10</b><span>Classical</span></div>
              <div class="time-opt"><b>30+0</b><span>Classical</span></div>
            </div>
            <div class="opt-row" style="margin-top:12px">
              <span>I play as</span>
              <div class="color-choice">
                <button class="color-swatch w" data-color="white" aria-label="White">♔</button>
                <button class="color-swatch random active" data-color="random" aria-label="Random">◐</button>
                <button class="color-swatch b" data-color="black" aria-label="Black">♚</button>
              </div>
            </div>
            <div class="field mt-12"><label>Message (optional)</label><input class="input" id="challenge-message" placeholder="Good luck, have fun!"></div>
          </div>
          <div class="modal-foot">
            <button class="btn" data-close-modal="challenge-modal">Cancel</button>
            <button class="btn btn-primary" data-action="send-challenge">${icon('sword')} Send challenge</button>
          </div>
        </div>
      </div>

      <!-- CONFIRM -->
      <div class="modal-backdrop" id="confirm-modal" aria-hidden="true">
        <div class="modal narrow" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div class="modal-head"><div><h3 id="confirm-title">Are you sure?</h3><p id="confirm-text"></p></div><button class="modal-close" data-close-modal="confirm-modal" aria-label="Close">${icon('x')}</button></div>
          <div class="modal-foot" style="padding-top:20px"><button class="btn" data-close-modal="confirm-modal" data-confirm="0">Cancel</button><button class="btn btn-primary" id="confirm-ok" data-confirm="1">Confirm</button></div>
        </div>
      </div>

      <!-- COMMAND PALETTE -->
      <div class="modal-backdrop palette-backdrop" id="palette-backdrop" aria-hidden="true">
        <div class="palette" role="dialog" aria-modal="true" aria-label="Search Gambit">
          <div class="palette-input">${icon('search')}<input id="palette-input" placeholder="Search pages, actions or friends..." autocomplete="off"><kbd>ESC</kbd></div>
          <div class="palette-results" id="palette-results"></div>
          <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> select</span><span><kbd>esc</kbd> close</span></div>
        </div>
      </div>

      ${friendsDrawerHTML()}
      <div class="toast-stack"></div>`;
    document.body.appendChild(wrap);
  }

  function boot() {
    applyTheme();
    renderHeader();
    mountOverlays();
    const footer = $('#site-footer');
    if (footer) footer.innerHTML = footerHTML();
    hydrateIcons();
    window.GambitIntegration?.shellReady();
    applyBoardTheme();
    updateNotifDot();

    const page = document.body.dataset.page;
    if (page) document.body.classList.add('page-' + page);

    /* delegated clicks */
    document.addEventListener('click', (e) => {
      const actionEl = e.target.closest('[data-action]');
      const closeEl = e.target.closest('[data-close-modal]');
      const modalBackdrop = e.target.classList && e.target.classList.contains('modal-backdrop') ? e.target : null;
      const friendTab = e.target.closest('[data-friend-tab]');
      const themeBtn = e.target.closest('[data-theme-set]');
      const boardBtn = e.target.closest('[data-board-set]');
      const switchEl = e.target.closest('[data-switch]');
      const authTab = e.target.closest('[data-auth-tab]');
      const chatBtn = e.target.closest('[data-chat]');
      const challengeBtn = e.target.closest('[data-challenge]');
      const friendOpen = e.target.closest('[data-friend-open]');
      const paletteItem = e.target.closest('[data-palette-index]');
      const confirmBtn = e.target.closest('[data-confirm]');
      const quick = e.target.closest('[data-quickchat]');
      const color = e.target.closest('[data-color]');
      const timeOpt = e.target.closest('.time-opt');

      if (modalBackdrop && !e.target.closest('.modal, .palette')) {
        closeModal(modalBackdrop);
        return;
      }
      if (closeEl) { closeModal(closeEl.dataset.closeModal); return; }
      if (confirmBtn) {
        const val = confirmBtn.dataset.confirm === '1';
        closeModal('confirm-modal');
        if (confirmResolver) { confirmResolver(val); confirmResolver = null; }
        return;
      }
      if (paletteItem) { paletteChoose(parseInt(paletteItem.dataset.paletteIndex, 10)); return; }
      if (friendTab) {
        const tab = friendTab.dataset.friendTab;
        drawerView = tab;
        $$('#drawer-tabs [data-friend-tab]').forEach((b) => b.classList.toggle('active', b.dataset.friendTab === tab));
        renderFriends();
        return;
      }
      if (color) {
        $$('#challenge-modal [data-color]').forEach((b) => b.classList.toggle('active', b === color));
        return;
      }
      if (timeOpt && timeOpt.closest('#challenge-modal')) {
        $$('#challenge-modal .time-opt').forEach((b) => b.classList.toggle('active', b === timeOpt));
        return;
      }
      if (themeBtn) { updateSettings({ theme: themeBtn.dataset.themeSet }); renderHeader(); return; }
      if (boardBtn) { updateSettings({ boardTheme: boardBtn.dataset.boardSet }); toast('Board theme updated.', 'info', 'palette'); return; }
      if (switchEl) { updateSettings({ [switchEl.dataset.switch]: !settings[switchEl.dataset.switch] }); return; }
      if (authTab) { switchAuthTab(authTab.dataset.authTab); return; }
      if (chatBtn) { e.stopPropagation(); openFriends('online'); openChat(chatBtn.dataset.chat); return; }
      if (challengeBtn) { e.stopPropagation(); if (challengeBtn.disabled) return; openChallenge(challengeBtn.dataset.challenge); return; }
      if (friendOpen) { openChat(friendOpen.dataset.friendOpen); return; }
      if (quick) {
        if (activeChat) sendChat(activeChat.id, quick.dataset.quickchat);
        return;
      }
      if (!actionEl) {
        if (!e.target.closest('.dropdown')) closeDropdowns();
        return;
      }
      const action = actionEl.dataset.action;
      Sound.play('click');
      switch (action) {
        case 'toggle-theme': toggleTheme(); break;
        case 'theme': toggleTheme(); break;
        case 'notifications': toggleDropdown('notifications'); updateNotifDot(); break;
        case 'user-menu': toggleDropdown('user'); break;
        case 'friends': closeDropdowns(); openFriends('online'); break;
        case 'close-friends': closeFriends(); break;
        case 'back-friends': activeChat = null; drawerView = 'online'; renderFriends(); $$('#drawer-tabs [data-friend-tab]').forEach((b) => b.classList.toggle('active', b.dataset.friendTab === 'online')); break;
        case 'palette': openPalette(); break;
        case 'auth': closeDropdowns(); openAuth(actionEl.dataset.auth || 'login'); break;
        case 'open-settings': closeDropdowns(); openModal('settings-modal'); break;
        case 'logout':
          closeDropdowns();
          confirmDialog({ title: 'Log out of Gambit?', text: 'Your games and progress are saved. You can sign back in any time.', confirm: 'Log out' }).then((ok) => {
            if (!ok) return;
            window.GambitSession.logout().catch(error=>toast(error.message,'error'));
          });
          break;
        case 'read-all':
          window.GambitAPI.post('/platform/notifications/read').catch(error=>toast(error.message,'error'));
          window.GAMBIT.notifications.forEach((n) => { n.unread = false; });
          $('#notification-list').innerHTML = window.GAMBIT.notifications.map((n) => `
            <div class="notif-item" data-action="notif-read" data-id="${n.id}">
              <span class="notif-icon">${icon(n.icon)}</span>
              <div class="notif-copy"><p>${esc(n.text)}</p><span>${esc(n.time)}</span></div>
            </div>`).join('');
          updateNotifDot();
          toast('All notifications marked as read.', 'info', 'check');
          break;
        case 'notif-read': {
          const item = window.GAMBIT.notifications.find((n) => String(n.id) === actionEl.dataset.id);
          window.GambitAPI.post('/platform/notifications/read',{id:Number(actionEl.dataset.id)}).catch(error=>toast(error.message,'error'));
          if (item) {item.unread = false;if(item.link?.startsWith('/')&&!item.link.startsWith('//'))location.assign(item.link);}
          actionEl.classList.remove('unread');
          const dot = actionEl.querySelector('.status-dot'); if (dot) dot.remove();
          updateNotifDot();
          break;
        }
        case 'notif-settings': closeDropdowns(); openModal('settings-modal'); break;
        case 'accept-request': acceptRequest(actionEl.dataset.id); break;
        case 'decline-request': declineRequest(actionEl.dataset.id); break;
        case 'send-friend-request':
          window.GambitIntegration.friendDialog();
          break;
        case 'send-challenge': sendChallenge(); break;
        case 'create-challenge': closeFriends(); if(friends.length)openChallenge(friends[0].id);else window.GambitIntegration.friendDialog(); break;
        case 'invite-friend': window.GambitIntegration.friendDialog(); break;
        case 'notif-read-all': break;
        case 'open-palette': openPalette(); break;
        default: break;
      }
    });

    document.addEventListener('submit', (e) => {
      if (e.target.id === 'auth-form') { e.preventDefault(); handleAuth(e.target); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        const modal=Array.from(document.querySelectorAll('.modal-backdrop.open')).at(-1);
        if(modal){const items=Array.from(modal.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')).filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first?.focus();}}
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (e.key === 'Escape') {
        if ($('#palette-backdrop.open')) { closeModal('palette-backdrop'); return; }
        if ($('.modal-backdrop.open')) { closeAllOverlays(); return; }
        if ($('#friends-drawer.open')) { closeFriends(); return; }
        closeDropdowns();
        return;
      }
      if ($('#palette-backdrop.open')) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!paletteFiltered.length) return;
          paletteIndex = (paletteIndex + (e.key === 'ArrowDown' ? 1 : -1) + paletteFiltered.length) % paletteFiltered.length;
          $$('.palette-item').forEach((el, i) => el.classList.toggle('selected', i === paletteIndex));
          const sel = $('.palette-item.selected'); if (sel) sel.scrollIntoView({ block: 'nearest' });
        }
        if (e.key === 'Enter') { e.preventDefault(); paletteChoose(paletteIndex); }
      }
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'palette-input') renderPalette(e.target.value);
    });

    // initialise settings switches
    syncSettingsUI();

    // external setting changes (from page scripts)
    window.addEventListener('storage', () => {});
  }

  /* ---------------- public API ---------------- */
  const Gambit = {
    $, $$, icon, esc, avatar, initials, ratingFmt, Store,
    get user() { return user; },
    get friends() { return friends; },
    get requests() { return requests; },
    get settings() { return settings; },
    get chats() { return chats; },
    Sound, toast, openModal, closeModal, confirm: confirmDialog,
    createModal,
    openFriends, closeFriends, openChat, openChallenge, openPalette,
    updateSettings, applyBoardTheme, applyTheme, renderHeader,
    openAuth, toggleTheme, hydrateIcons,
    updateProfile, refreshFriends, loadChat,
    getPage: () => document.body.dataset.page
  };
  window.Gambit = Gambit;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
