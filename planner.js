/* ============================================================
 * planner.js — the schedule planner page.
 *
 * The page is a window onto three things that already exist:
 *
 *   · the tasks, from the to-do list (todostore.js) — adding one here opens
 *     the very same lightbox and writes the very same list
 *   · the school year, from calendar.js — so "the class meets that day"
 *     means the same A-day / B-day the reminder page trusts
 *   · the time, from clock.js — so a pinned test date plans around that day
 *
 * All the thinking lives in plan.js (pure logic, tested in Node). This file
 * only draws the answer and takes the student's hours and keywords.
 *
 * What it saves under 'ucvts.planner.v1':
 *
 *   { configured, hours: { mon…sun }, keywords: [ { word, minutes, spread } ],
 *     defaultMinutes }
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS;
  if (!U.plan) throw new Error('planner.js: plan.js must load first');
  if (!U.todoStore || !U.taskModal) {
    throw new Error('planner.js: todostore.js and taskmodal.js must load first');
  }

  var CONFIG_KEY = 'ucvts.planner.v1';

  var DAYS = [
    { key: 'mon', short: 'Mon', long: 'Monday' },
    { key: 'tue', short: 'Tue', long: 'Tuesday' },
    { key: 'wed', short: 'Wed', long: 'Wednesday' },
    { key: 'thu', short: 'Thu', long: 'Thursday' },
    { key: 'fri', short: 'Fri', long: 'Friday' },
    { key: 'sat', short: 'Sat', long: 'Saturday' },
    { key: 'sun', short: 'Sun', long: 'Sunday' }
  ];

  /* ---------------- small helpers ---------------- */

  function $id(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function assign(target, source) {
    Object.keys(source || {}).forEach(function (k) { target[k] = source[k]; });
    return target;
  }

  function clone(obj) { return assign({}, obj); }

  function fmtMin(m) {
    m = Math.round(m);
    if (m < 60) return m + ' min';
    var h = m / 60;
    return (Math.round(h * 10) / 10) + ' h';
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  /* ---------------- config ---------------- */

  function defaultConfig() {
    return {
      configured: false,
      hours: clone(U.plan.DEFAULT_HOURS),
      keywords: U.plan.DEFAULT_KEYWORDS.map(clone),
      defaultMinutes: U.plan.DEFAULT_MINUTES
    };
  }

  function loadConfig() {
    var base = defaultConfig();
    var saved = readJSON(CONFIG_KEY, null);
    if (!saved || typeof saved !== 'object') return base;

    var merged = {
      configured: saved.configured === true,
      hours: assign(clone(U.plan.DEFAULT_HOURS), saved.hours || {}),
      keywords: Array.isArray(saved.keywords) ? saved.keywords.map(clone) : base.keywords,
      defaultMinutes: Number(saved.defaultMinutes) > 0 ? Number(saved.defaultMinutes) : U.plan.DEFAULT_MINUTES
    };
    return merged;
  }

  function saveConfig() {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
    catch (e) { /* private mode — the session still works, it just won't persist */ }
  }

  var config = loadConfig();

  /* ---------------- view state ---------------- */

  var view = 'month';
  var anchor = U.plan.midnight(U.clock.now());
  var plan = null;

  /* ---------------- the data the plan is built from ---------------- */

  function scheduleData() {
    var s = U.todoStore.readJSON(U.todoStore.SCHEDULE_KEY, {});
    return s && typeof s === 'object' ? s : {};
  }

  function tasksForPlanner() {
    return U.todoStore.allTasks().map(function (row) {
      var t = row.task;
      return {
        id: t.id,
        name: t.name,
        subject: t.subject || '',
        due: t.due || '',
        time: t.time || '',
        done: !!t.done,
        important: !!t.important,
        folderName: row.folderName
      };
    });
  }

  function recompute() {
    plan = U.plan.buildPlan({
      tasks: tasksForPlanner(),
      config: config,
      schedule: scheduleData(),
      today: U.clock.now()
    });
  }

  /* ---------------- calendar helpers ---------------- */

  function startOfWeek(date) {
    var diff = (date.getDay() + 6) % 7;   // Monday-first
    return U.plan.addDays(date, -diff);
  }

  function abBadge(day) {
    var s = U.day.daySummary(day);
    var span = el('span', 'cal-ab');
    if (s.isSchoolDay && s.type) {
      span.textContent = s.type;
      span.classList.add(s.type === 'A' ? 'a' : 'b');
      span.title = s.type + '-Day';
    } else {
      span.textContent = s.emoji;
      span.classList.add('off');
      span.title = s.title;
    }
    return span;
  }

  function chip(kind, text) {
    var c = el('span', 'cal-chip ' + kind, text);
    return c;
  }

  function dueItem(t) {
    var li = el('li', 'plan-item due');
    li.appendChild(el('span', 'plan-mark', '●'));
    var main = el('div', 'plan-main');
    main.appendChild(el('span', 'plan-name', t.name));
    var meta = [];
    if (t.subject) meta.push(t.subject);
    if (t.time) meta.push(t.time);
    if (t.late) meta.push('overdue');
    if (t.important) meta.push('★ important');
    if (meta.length) main.appendChild(el('span', 'plan-meta', meta.join(' · ')));
    li.appendChild(main);
    return li;
  }

  function workItem(w) {
    var li = el('li', 'plan-item work');
    li.appendChild(el('span', 'plan-min', fmtMin(w.minutes)));
    var main = el('div', 'plan-main');
    main.appendChild(el('span', 'plan-name', w.name));
    var meta = [];
    if (w.subject) meta.push(w.subject);
    if (w.reason) meta.push(w.reason);
    main.appendChild(el('span', 'plan-meta', meta.join(' · ')));
    li.appendChild(main);
    return li;
  }

  /* ---------------- month view ---------------- */

  function renderMonth(host) {
    host.appendChild(weekdayStrip());

    var grid = el('div', 'cal-month');
    var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    var start = startOfWeek(first);
    var todayKey = U.plan.keyOf(U.clock.now());

    for (var i = 0; i < 42; i++) {
      var day = U.plan.addDays(start, i);
      var key = U.plan.keyOf(day);
      var cell = el('button', 'cal-day');
      cell.type = 'button';
      cell.dataset.day = key;
      if (day.getMonth() !== anchor.getMonth()) cell.classList.add('is-out');
      if (key === todayKey) cell.classList.add('is-today');
      cell.setAttribute('aria-label', day.toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric'
      }));

      var head = el('div', 'cal-day-head');
      head.appendChild(el('span', 'cal-date', String(day.getDate())));
      head.appendChild(abBadge(day));
      cell.appendChild(head);

      var info = plan.byDate[key];
      var dues = info ? info.dueTasks : [];
      var work = info ? info.work : [];

      dues.slice(0, 2).forEach(function (t) {
        cell.appendChild(chip('due', t.name));
      });
      if (dues.length > 2) {
        cell.appendChild(el('span', 'cal-more', '+' + (dues.length - 2) + ' more due'));
      }
      var mins = work.reduce(function (sum, w) { return sum + w.minutes; }, 0);
      if (mins) cell.appendChild(el('span', 'cal-minutes', '📚 ' + fmtMin(mins)));

      grid.appendChild(cell);
    }
    host.appendChild(grid);
  }

  function weekdayStrip() {
    var strip = el('div', 'cal-weekdays');
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) {
      strip.appendChild(el('span', null, d));
    });
    return strip;
  }

  /* ---------------- week view ---------------- */

  function renderWeek(host) {
    var grid = el('div', 'cal-week');
    var monday = startOfWeek(anchor);
    var todayKey = U.plan.keyOf(U.clock.now());

    for (var i = 0; i < 7; i++) {
      var day = U.plan.addDays(monday, i);
      var key = U.plan.keyOf(day);
      var col = el('div', 'wk-col');
      if (key === todayKey) col.classList.add('is-today');

      var head = el('button', 'wk-head');
      head.type = 'button';
      head.dataset.day = key;
      head.appendChild(el('span', 'wk-dow', day.toLocaleDateString(undefined, { weekday: 'short' })));
      var line = el('span', 'wk-date');
      line.appendChild(el('span', 'wk-num', String(day.getDate())));
      line.appendChild(abBadge(day));
      head.appendChild(line);
      col.appendChild(head);

      var info = plan.byDate[key];
      var dues = info ? info.dueTasks : [];
      var work = info ? info.work : [];

      if (dues.length) {
        col.appendChild(el('div', 'wk-label', 'Due'));
        var dueList = el('ul', 'wk-list');
        dues.forEach(function (t) {
          var li = el('li', 'wk-item due', t.name);
          if (t.subject) li.title = t.subject;
          dueList.appendChild(li);
        });
        col.appendChild(dueList);
      }

      if (work.length) {
        col.appendChild(el('div', 'wk-label', 'Recommended'));
        var workList = el('ul', 'wk-list');
        work.forEach(function (w) {
          var li = el('li', 'wk-item work');
          li.appendChild(el('span', 'wk-min', fmtMin(w.minutes)));
          li.appendChild(el('span', 'wk-name', w.name));
          if (w.reason) li.title = w.reason;
          workList.appendChild(li);
        });
        col.appendChild(workList);
      }

      if (!dues.length && !work.length) col.appendChild(el('span', 'wk-empty', '—'));

      grid.appendChild(col);
    }
    host.appendChild(grid);
  }

  /* ---------------- day view ---------------- */

  function renderDay(host) {
    var key = U.plan.keyOf(anchor);
    var info = plan.byDate[key] || { dueTasks: [], work: [] };

    var head = el('div', 'day-head');
    head.appendChild(abBadge(anchor));
    var copy = el('div', 'day-head-copy');
    copy.appendChild(el('strong', 'day-head-title',
      anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })));
    var summary = U.day.daySummary(anchor);
    copy.appendChild(el('span', 'day-head-sub', summary.isSchoolDay && summary.type
      ? summary.type + '-Day — you have your ' + summary.type + '-Day classes'
      : summary.title));
    head.appendChild(copy);
    host.appendChild(head);

    var grid = el('div', 'day-cols');

    var dueCol = el('section', 'day-col');
    dueCol.appendChild(el('h3', 'day-col-title', 'Due this day'));
    if (info.dueTasks.length) {
      var ul = el('ul', 'plan-list');
      info.dueTasks.forEach(function (t) { ul.appendChild(dueItem(t)); });
      dueCol.appendChild(ul);
    } else {
      dueCol.appendChild(el('p', 'day-col-empty', 'Nothing is due.'));
    }
    grid.appendChild(dueCol);

    var workCol = el('section', 'day-col');
    workCol.appendChild(el('h3', 'day-col-title', 'Recommended work'));
    if (info.work.length) {
      var ul2 = el('ul', 'plan-list');
      info.work.forEach(function (w) { ul2.appendChild(workItem(w)); });
      workCol.appendChild(ul2);
    } else {
      workCol.appendChild(el('p', 'day-col-empty', 'A free evening.'));
    }
    grid.appendChild(workCol);

    host.appendChild(grid);
  }

  /* ---------------- chrome (title, summary, view switch) ---------------- */

  function renderTitle() {
    var el2 = $id('plannerTitle');
    if (view === 'month') {
      el2.textContent = anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else if (view === 'week') {
      var mon = startOfWeek(anchor);
      var sun = U.plan.addDays(mon, 6);
      var sameMonth = mon.getMonth() === sun.getMonth();
      var from = mon.toLocaleDateString(undefined,
        sameMonth ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
      var to = sun.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      el2.textContent = from + ' – ' + to;
    } else {
      el2.textContent = anchor.toLocaleDateString(undefined,
        { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  }

  function renderSummary() {
    var out = $id('planSummary');
    var all = tasksForPlanner().filter(function (t) { return !t.done; });
    var withDue = all.filter(function (t) { return t.due; });
    var noDue = all.length - withDue.length;
    var sittings = 0;
    plan.planned.forEach(function (t) { sittings += t.sessions.length; });

    var parts = [];
    if (!withDue.length) {
      parts.push(all.length
        ? 'No tasks with a due date yet — add a due date to see a plan.'
        : 'Nothing to plan yet. Add a task with a due date and the planner will lay it out.');
    } else {
      parts.push('Planning ' + plan.planned.length + ' of ' + withDue.length +
        ' tasks · ' + sittings + ' sitting' + (sittings === 1 ? '' : 's') + ' recommended');
      if (plan.unscheduled.length) {
        parts.push(plan.unscheduled.length + ' couldn\u2019t fit in your hours');
      }
    }
    if (noDue) parts.push(noDue + ' task' + (noDue === 1 ? '' : 's') + ' with no due date');

    var zeroHours = DAYS.every(function (d) { return !(Number(config.hours[d.key]) > 0); });
    if (zeroHours) parts.push('set your homework hours in Configure');

    out.textContent = parts.join(' · ');
  }

  function renderViewSwitch() {
    var btns = document.querySelectorAll('.view-switch [data-view]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].dataset.view === view ? 'true' : 'false');
    }
  }

  /* ---------------- the one render ---------------- */

  function render() {
    recompute();
    renderViewSwitch();
    renderTitle();
    renderSummary();

    var host = $id('calendar');
    host.innerHTML = '';
    if (view === 'month') renderMonth(host);
    else if (view === 'week') renderWeek(host);
    else renderDay(host);
  }

  function shift(delta) {
    if (view === 'month') {
      anchor = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    } else if (view === 'week') {
      anchor = U.plan.addDays(anchor, 7 * delta);
    } else {
      anchor = U.plan.addDays(anchor, delta);
    }
    render();
  }

  /* ---------------- the config menu ---------------- */

  var draft = null;

  function renderHours() {
    var host = $id('hoursHost');
    host.innerHTML = '';
    var table = el('table', 'hours-table');
    var thead = el('thead');
    var hrow = el('tr');
    DAYS.forEach(function (d) {
      var th = el('th', null, d.short);
      th.title = d.long;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = el('tbody');
    var row = el('tr');
    DAYS.forEach(function (d) {
      var td = el('td');
      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '12';
      input.step = '0.5';
      input.value = String(draft.hours[d.key]);
      input.setAttribute('aria-label', 'Hours for homework on ' + d.long);
      input.addEventListener('input', function () {
        var v = Number(input.value);
        draft.hours[d.key] = isFinite(v) && v >= 0 ? v : 0;
      });
      td.appendChild(input);
      row.appendChild(td);
    });
    tbody.appendChild(row);
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function renderKeywords() {
    var host = $id('kwList');
    host.innerHTML = '';
    draft.keywords.forEach(function (kw, index) {
      var row = el('div', 'kw-row');

      var word = document.createElement('input');
      word.type = 'text';
      word.placeholder = 'e.g. worksheet';
      word.value = kw.word || '';
      word.setAttribute('aria-label', 'Keyword ' + (index + 1));
      word.addEventListener('input', function () { kw.word = word.value; });

      var mins = document.createElement('input');
      mins.type = 'number';
      mins.min = '5';
      mins.max = '600';
      mins.step = '5';
      mins.value = String(Number(kw.minutes) > 0 ? Number(kw.minutes) : U.plan.DEFAULT_MINUTES);
      mins.setAttribute('aria-label', 'Minutes for ' + (kw.word || 'keyword ' + (index + 1)));
      mins.addEventListener('input', function () {
        var v = Number(mins.value);
        kw.minutes = isFinite(v) && v > 0 ? v : U.plan.DEFAULT_MINUTES;
      });

      var spreadWrap = el('label', 'kw-spread');
      var spread = document.createElement('input');
      spread.type = 'checkbox';
      spread.checked = !!kw.spread;
      spread.setAttribute('aria-label', 'Spread ' + (kw.word || 'this keyword') + ' across days');
      spread.addEventListener('change', function () { kw.spread = spread.checked; });
      spreadWrap.appendChild(spread);
      spreadWrap.appendChild(el('span', null, 'spread'));

      var remove = el('button', 'kw-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove ' + (kw.word || 'keyword ' + (index + 1)));
      remove.addEventListener('click', function () {
        draft.keywords.splice(index, 1);
        renderKeywords();
      });

      row.appendChild(word);
      row.appendChild(mins);
      row.appendChild(spreadWrap);
      row.appendChild(remove);
      host.appendChild(row);
    });
  }

  function openConfig() {
    draft = {
      hours: clone(config.hours),
      keywords: config.keywords.map(clone),
      defaultMinutes: config.defaultMinutes
    };

    $id('configTitle').textContent = config.configured ? 'Planner settings' : 'Set up your planner';
    $id('configError').hidden = true;
    $id('defaultMinutes').value = String(draft.defaultMinutes);
    renderHours();
    renderKeywords();
    $id('configModal').hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeConfig() {
    $id('configModal').hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('modal-open');
    draft = null;
  }

  function saveFromConfig() {
    var dm = Number($id('defaultMinutes').value);
    var cleaned = [];
    draft.keywords.forEach(function (kw) {
      var word = String(kw.word || '').trim();
      if (!word) return;
      var minutes = Number(kw.minutes);
      cleaned.push({
        word: word,
        minutes: isFinite(minutes) && minutes > 0 ? Math.round(minutes) : U.plan.DEFAULT_MINUTES,
        spread: !!kw.spread
      });
    });

    config = {
      configured: true,
      hours: clone(draft.hours),
      keywords: cleaned,
      defaultMinutes: isFinite(dm) && dm > 0 ? Math.round(dm) : U.plan.DEFAULT_MINUTES
    };
    saveConfig();
    closeConfig();
    render();
  }

  /* ---------------- adding a task ---------------- */

  function addTask() {
    U.taskModal.open({
      due: view === 'day' ? U.plan.keyOf(anchor) : '',
      /* No folder is picked up front, so the task is filed under its subject
         — created on the spot — and lands in the to-do list exactly there. */
      resolveFolder: function (subject) {
        return U.todoStore.ensureFolder(subject).id;
      },
      onSaved: render
    });
  }

  /* ---------------- wiring ---------------- */

  function wire() {
    document.querySelectorAll('.view-switch [data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        view = btn.dataset.view;
        render();
      });
    });

    $id('prevBtn').addEventListener('click', function () { shift(-1); });
    $id('nextBtn').addEventListener('click', function () { shift(1); });
    $id('todayBtn').addEventListener('click', function () {
      anchor = U.plan.midnight(U.clock.now());
      render();
    });

    $id('configBtn').addEventListener('click', openConfig);
    $id('addTaskBtn').addEventListener('click', addTask);

    $id('calendar').addEventListener('click', function (e) {
      var cell = e.target.closest && e.target.closest('[data-day]');
      if (!cell) return;
      anchor = U.plan.parseKey(cell.dataset.day);
      view = 'day';
      render();
    });

    document.querySelectorAll('#configModal [data-close]').forEach(function (btn) {
      btn.addEventListener('click', closeConfig);
    });
    $id('configSaveBtn').addEventListener('click', saveFromConfig);
    $id('addKwBtn').addEventListener('click', function () {
      draft.keywords.push({ word: '', minutes: U.plan.DEFAULT_MINUTES, spread: false });
      renderKeywords();
      var inputs = $id('kwList').querySelectorAll('.kw-row input[type="text"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    $id('configResetBtn').addEventListener('click', function () {
      draft = {
        hours: clone(U.plan.DEFAULT_HOURS),
        keywords: U.plan.DEFAULT_KEYWORDS.map(clone),
        defaultMinutes: U.plan.DEFAULT_MINUTES
      };
      $id('defaultMinutes').value = String(draft.defaultMinutes);
      renderHours();
      renderKeywords();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$id('configModal').hidden) closeConfig();
    });

    /* Another tab (or the to-do page) changed the list: re-plan. */
    globalThis.addEventListener('storage', function (e) {
      if (!e || e.key === null || e.key === U.todoStore.KEY || e.key === U.todoStore.SCHEDULE_KEY) {
        render();
      }
    });
  }

  /* ---------------- boot ---------------- */

  /* A new day or a re-pointed clock moves "today", so the plan is rebuilt
     then — and only then. Nothing on this page polls. */
  U.clock.subscribe('day', function () { if (!plan) return; render(); });
  U.clock.subscribe('time', function () { if (!plan) return; render(); });

  wire();
  render();

  /* First visit: no hours have ever been entered, so ask for them. */
  if (!config.configured) openConfig();

  globalThis.PLANNER = {
    state: function () { return { view: view, anchor: U.plan.keyOf(anchor), config: config }; },
    render: render,
    config: function () { return config; }
  };
})();
