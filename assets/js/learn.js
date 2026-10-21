(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const G = window.Gambit;
  const { icon, toast, Sound, createModal, hydrateIcons, esc, ratingFmt } = G;
  const COURSES = window.GAMBIT.courses;
  const LESSONS = window.GAMBIT.lessonRows;
  const CATS = { c1: 'Openings', c2: 'Tactics', c3: 'Endgames', c4: 'Tactics', c5: 'Strategy', c6: 'Openings' };
  const TONES = { c1: 'tone-g1', c2: 'tone-g2', c3: 'tone-g3', c4: 'tone-g4', c5: 'tone-g5', c6: 'tone-g6' };
  const MODULES = {
    c1: ['First principles: centre, tempo, king safety', 'The Italian: Giuoco Piano plans', 'Evans Gambit: punishing ...Nxd4', 'Two Knights: the Fried Liver', 'Sicilian structures that actually repeat', "Building a repertoire you'll remember"],
    c2: ['Forks: the geometry of double attack', 'Pins: absolute, relative and devastating', 'Skewers and discovered attacks', 'Back-rank patterns and escape squares', 'Sacrifices that work (and those that do not)', 'Calculation drills: forcing moves first'],
    c3: ['King and pawn: the square rule', 'Lucena and Philidor positions', 'Rook endings: activity over material', 'Opposite-coloured bishops', 'Converting an extra pawn', 'Endgame studies for pattern memory'],
    c4: ['Attacking the castled king', 'Greek gifts and piece sacrifices', 'The initiative: when to keep going', 'Pawn storms and open files', 'Defence: spotting the counterplay', 'Finishing games in style'],
    c5: ['Pawn structures and plans', 'Weak squares and outposts', 'Prophylaxis: stop their idea first', 'Trading: when and with whom', 'Space, tension and restraint', 'Positional sacrifices explained'],
    c6: ['Time management that wins games', 'Opening shortcuts for blitz', 'Practical decisions under 30 seconds', 'Playing on the increment', 'Tilt control and tilt recovery', 'The psychology of fast chess']
  };
  const DEMOS = [
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+'], note: 'The Fried Liver Attack. White gives a knight to drag the king into the open — every move has a purpose.' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'], note: 'The Ruy López. White pressures c6 and builds the e-file before the centre opens.' },
    { moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6'], note: "Queen's Gambit Declined. Black accepts a passive bishop to keep the central structure intact." },
    { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5'], note: 'The Najdorf. Black concedes space, then strikes at the centre with ...e5 at the right moment.' }
  ];

  const doneLessons = new Set(LESSONS.filter((l) => l.done).map((l) => l.n));
  let filter = 'All';

  function renderCourses() {
    const host = $('#course-grid');
    if (!host) return;
    const list = COURSES.filter((c) => filter === 'All' || CATS[c.id] === filter);
    host.innerHTML = list.map((c) => {
      const pct = Math.round((c.done / c.lessons) * 100);
      return `<article class="card course-card card-hover" data-course-open="${c.id}" tabindex="0" role="button">
        <div class="course-cover ${TONES[c.id] || 'tone-g1'}">
          <span class="badge ${pct === 100 ? 'badge-green' : ''}">${pct === 100 ? 'Completed' : c.level}</span>
          <span class="glyph">${c.glyph}</span>
        </div>
        <div class="course-body">
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.desc)}</p>
          <div class="course-progress">
            <div class="row"><span>${c.done} of ${c.lessons} lessons</span><span>${pct}%</span></div>
            <div class="progress thin"><i style="width:${pct}%"></i></div>
          </div>
          <div class="course-meta">
            <span class="row"><span data-icon="clock"></span> ${c.hours} hrs</span>
            <span class="row" style="color:${pct === 100 ? 'var(--brand)' : 'var(--muted)'}">${pct === 100 ? 'Review' : pct ? 'Continue' : 'Start course'} <span data-icon="arrowRight"></span></span>
          </div>
        </div>
      </article>`;
    }).join('');
    hydrateIcons(host);
  }

  function renderLessonRows() {
    const host = $('#lesson-rows');
    if (!host) return;
    host.innerHTML = LESSONS.map((l) => {
      const done = doneLessons.has(l.n);
      return `<div class="lesson-row ${done ? 'done' : ''} ${l.current ? 'current' : ''}" data-lesson-open="${l.n}" role="button" tabindex="0">
        <span class="lesson-num">${done ? icon('check') : l.n}</span>
        <div class="grow"><h4>${esc(l.title)} ${l.current ? '<span class="badge badge-green" style="height:17px;font-size:8.5px">Continue</span>' : ''}</h4><p>${done ? 'Completed' : 'Openings Bootcamp'} · Lesson ${l.n}</p></div>
        <span class="dur">${l.dur}</span>
        <span class="play-ic">${icon(done ? 'refresh' : 'play')}</span>
      </div>`;
    }).join('');
    hydrateIcons(host);
  }

  function courseModal(id) {
    const course = COURSES.find((c) => c.id === id);
    if (!course) return;
    const modules = MODULES[id] || MODULES.c1;
    const pct = Math.round((course.done / course.lessons) * 100);
    const body = `
      <div class="course-modal-hero ${TONES[id] || 'tone-g1'}">
        <span class="badge">${course.level}</span>
        <span class="glyph">${course.glyph}</span>
      </div>
      <p class="small muted" style="line-height:1.65">${esc(course.desc)}</p>
      <div class="stat-row" style="margin-top:14px">
        <div class="stat"><b>${course.lessons}</b><span>Lessons</span></div>
        <div class="stat"><b>${course.hours}h</b><span>Video & drills</span></div>
        <div class="stat"><b>${pct}%</b><span>Complete</span></div>
      </div>
      <div class="progress" style="margin-top:14px"><i style="width:${pct}%"></i></div>
      <div class="row" style="justify-content:space-between;margin-top:7px"><span class="tiny muted">${course.done} of ${course.lessons} complete</span><span class="tiny" style="color:var(--brand)">${pct === 100 ? 'Course complete' : 'Keep going'}</span></div>
      <div class="module-list">
        ${modules.map((m, i) => {
          const complete = i < Math.round(course.done / course.lessons * modules.length);
          return `<div class="module-row"><span class="n">${complete ? icon('check') : i + 1}</span><span class="grow">${esc(m)}</span><span class="dur">${10 + (i % 4) * 3} min</span></div>`;
        }).join('')}
      </div>`;
    const modal = createModal({
      title: esc(course.title),
      subtitle: `${modules.length} modules · ${course.level}`,
      width: 'wide',
      body,
      footer: `<button class="btn" data-close-modal="${''}" data-modal-close>Maybe later</button><button class="btn btn-primary" data-start-course>${icon('play')} Start course</button>`
    });
    // The dynamic footer needs its own close target
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('[data-start-course]').addEventListener('click', () => {
      modal.close();
      const resume = LESSONS.find((l) => l.current) || LESSONS[0];
      setTimeout(() => openLesson(resume.n), 160);
    });
  }

  function openLesson(n, courseId) {
    const row = LESSONS.find((l) => l.n === Number(n)) || LESSONS[0];
    const demo = DEMOS[(row.n - 1) % DEMOS.length];
    const body = `
      <div class="lesson-board-wrap"><div id="lesson-board"></div></div>
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <span class="badge badge-green">${icon('book')} Lesson ${row.n}</span>
        <span class="tiny muted">${row.dur} · Openings Bootcamp</span>
      </div>
      <div class="lesson-step"><b id="lesson-step-title">Starting position</b><p id="lesson-step-text">Click Next to play through the key line. The board follows the lesson.</p></div>
      <div class="lesson-move-chips" id="lesson-chips"></div>
      <div class="row gap-8 mt-12">
        <button class="btn btn-sm" id="lesson-prev">${icon('chevronLeft')} Previous</button>
        <button class="btn btn-sm" id="lesson-next">Next move ${icon('chevronRight')}</button>
        <span class="tiny muted" style="margin-left:auto" id="lesson-progress">1 / ${demo.moves.length + 1}</span>
      </div>`;
    const modal = createModal({
      title: esc(row.title),
      subtitle: `Lesson ${row.n} · Openings Bootcamp`,
      width: '',
      body,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn btn-primary" id="lesson-complete">${icon('check')} Mark complete</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);

    let game = new window.Chess();
    const entries = [];
    demo.moves.forEach((san) => {
      const e = game.moveSAN(san);
      if (e) entries.push(e);
    });
    let step = 0;
    let board = null;
    const startFen = window.ChessUtils.START_FEN;

    setTimeout(() => {
      const host = $('#lesson-board', modal.el);
      if (!host) return;
      board = new window.ChessBoard(host, { fen: startFen, interactive: false });
      renderStep(0);
    }, 30);

    function renderStep(i) {
      step = Math.max(0, Math.min(entries.length, i));
      const replay = new window.Chess();
      let last = null;
      for (let k = 0; k < step; k++) {
        const e = entries[k];
        const m = replay.move(e.from, e.to, e.promotion);
        if (m) last = { from: m.from, to: m.to };
      }
      if (board) board.setPosition(replay.fen(), {
        last,
        check: replay.inCheck(replay.turn) ? window.ChessUtils.sqName(replay.kingSquare(replay.turn)) : null
      });
      const title = $('.lesson-step b', modal.el);
      const text = $('.lesson-step p', modal.el);
      const chips = $('#lesson-chips', modal.el);
      const progress = $('#lesson-progress', modal.el);
      if (title) title.textContent = step === 0 ? 'Starting position' : `Move ${step}: ${entries[step - 1] ? entries[step - 1].san : ''}`;
      if (text) text.textContent = step === 0 ? demo.note : step >= entries.length ? demo.note + ' That is the full model line.' : `Follow the idea: ${demo.moves.slice(0, step).join(' ')}. Watch how each move answers the previous threat.`;
      if (chips) {
        chips.innerHTML = entries.map((e, k) => `<span class="lesson-move-chip ${k < step ? 'on' : ''}">${esc(e.san)}</span>`).join('');
      }
      if (progress) progress.textContent = `${step + 1} / ${entries.length + 1}`;
    }

    modal.el.addEventListener('click', (ev) => {
      if (ev.target.closest('#lesson-next')) renderStep(step + 1);
      if (ev.target.closest('#lesson-prev')) renderStep(step - 1);
      if (ev.target.closest('#lesson-complete')) {
        doneLessons.add(row.n);
        row.done = true;
        renderLessonRows();
        modal.close();
        Sound.play('win');
        toast(`Lesson ${row.n} complete. Nice work.`, 'success', 'check');
        setTimeout(() => {
          const idx = LESSONS.findIndex((l) => l.n === row.n);
          const next = LESSONS[idx + 1];
          if (next) toast(`Next up: ${next.title}`, 'info', 'book');
        }, 900);
      }
    });
  }

  function openEndgame() {
    const modal = createModal({
      title: 'Daily endgame',
      subtitle: 'Rook and pawn vs rook · White to play',
      width: '',
      body: `<div class="lesson-board-wrap"><div id="endgame-board"></div></div>
        <p class="small muted" style="line-height:1.65">The defending king is cut off. White can win by using the rook to shield the pawn — but only if the king steps up at the right moment.</p>
        <div class="solution-box mt-12"><div class="row"><span class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Key idea</span></div><p class="tiny muted" id="eg-idea" style="display:none;margin-top:6px;line-height:1.55">1.Rd1! cuts the black king off along the d-file. The white king then walks to e6 and the pawn advances. Activity first, material second.</p></div>`,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn btn-primary" id="eg-reveal">${icon('eye')} Show the idea</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    setTimeout(() => {
      const host = $('#endgame-board', modal.el);
      if (host) new window.ChessBoard(host, { fen: '8/8/8/4k3/8/4K3/4P3/4R3 w - - 0 1', interactive: false });
    }, 30);
    modal.el.querySelector('#eg-reveal').addEventListener('click', (ev) => {
      const idea = $('#eg-idea', modal.el);
      if (idea) idea.style.display = idea.style.display === 'none' ? '' : 'none';
      ev.currentTarget.innerHTML = `${icon('eye')} ${idea && idea.style.display === 'none' ? 'Show the idea' : 'Hide the idea'}`;
      hydrateIcons(ev.currentTarget);
    });
  }

  function studyPlan() {
    const modal = createModal({
      title: 'Your weekly study plan',
      subtitle: 'Four short sessions built around your games',
      body: `<div>${[
        ['MON', 'Tactics warm-up', '10 puzzles · forks and pins', true],
        ['TUE', 'Openings Bootcamp', 'Lesson 15 · Fried Liver', true],
        ['THU', 'Endgame lab', 'Rook endings · Lucena', false],
        ['SAT', 'Play & review', 'Two rapid games + annotation', false]
      ].map(([d, t, s, done]) => `<div class="study-day ${done ? 'done' : ''}"><span class="d">${d}</span><div class="grow"><b>${t}</b><span>${s}</span></div><span class="badge ${done ? 'badge-green' : ''}">${done ? 'Done' : '45 min'}</span></div>`).join('')}</div>
        <p class="tiny muted" style="margin-top:12px;line-height:1.55">Plans adapt to the openings you play. Finish a session and the next one gets shorter.</p>`,
      footer: `<button class="btn" data-modal-close>Close</button><button class="btn btn-primary" id="plan-adjust">Adjust plan</button>`
    });
    modal.el.querySelector('[data-modal-close]').setAttribute('data-close-modal', modal.id);
    hydrateIcons(modal.el);
    modal.el.querySelector('#plan-adjust').addEventListener('click', () => {
      modal.close();
      toast('Study plan settings saved for this demo.', 'success', 'calendar');
    });
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-course-filter]');
    if (filterBtn) {
      filter = filterBtn.dataset.courseFilter;
      $$('[data-course-filter]').forEach((b) => b.classList.toggle('active', b === filterBtn));
      renderCourses();
      return;
    }
    const course = e.target.closest('[data-course-open]');
    if (course) { courseModal(course.dataset.courseOpen); return; }
    const lesson = e.target.closest('[data-lesson-open]');
    if (lesson) { openLesson(parseInt(lesson.dataset.lessonOpen, 10)); return; }
    const opening = e.target.closest('[data-opening]');
    if (opening) { toast(`${opening.dataset.opening} study added to your library.`, 'info', 'book'); return; }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-course-open], [data-lesson-open]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* ---------------- boot ---------------- */
  renderCourses();
  renderLessonRows();

  const openings = [
    { icon: '♟', name: 'Italian Game', line: '1.e4 e5 2.Nf3 Nc6 3.Bc4', count: '1,284 studies' },
    { icon: '♞', name: 'Sicilian Najdorf', line: '1.e4 c5 2.Nf3 d6 3.d4 cxd4', count: '964 studies' },
    { icon: '♛', name: "Queen's Gambit", line: '1.d4 d5 2.c4 e6 3.Nc3', count: '812 studies' },
    { icon: '♜', name: 'King\'s Indian', line: '1.d4 Nf6 2.c4 g6 3.Nc3 Bg7', count: '706 studies' }
  ];
  const openingHost = $('#opening-list');
  if (openingHost) {
    openingHost.innerHTML = openings.map((o) => `<div class="opening-item" data-opening="${esc(o.name)}" role="button" tabindex="0">
      <span class="emblem">${o.icon}</span><div><b>${esc(o.name)}</b><span>${esc(o.line)}</span></div>
      <span class="arrow">${icon('chevronRight')}</span>
    </div>`).join('');
    hydrateIcons(openingHost);
  }

  const endgameHost = $('#daily-endgame');
  if (endgameHost) {
    new window.ChessBoard(endgameHost, {
      fen: '8/8/8/4k3/8/4K3/4P3/4R3 w - - 0 1',
      interactive: false,
      showCoordinates: false
    });
  }

  const continueBtn = $('#continue-learning');
  if (continueBtn) continueBtn.addEventListener('click', () => openLesson(15));
  const planBtn = $('#study-plan-btn');
  if (planBtn) planBtn.addEventListener('click', studyPlan);
  const endgameBtn = $('#endgame-try');
  if (endgameBtn) endgameBtn.addEventListener('click', openEndgame);
})();
