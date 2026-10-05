/* ============================================================
 * module-pomodoro.js — fifteen minutes on one thing, then a break.
 *
 * The framing is the point: anybody can manage fifteen minutes.
 *
 * Two facts make up the whole timer — which mode we're in, and the
 * moment it is due to finish. Everything on screen is derived from
 * those two, which is what lets it survive a backgrounded tab, a
 * sleeping laptop and a reload. It never counts down by subtracting:
 * a browser throttles timers in hidden tabs and stops them entirely
 * when the machine sleeps, so a counter would quietly lose time. A
 * remembered deadline cannot.
 *
 * This one reads the real clock, not the app's shared one, and that
 * is deliberate. The shared clock can be simulated, and a simulated
 * clock does not tick — it only moves when the tester panel nudges
 * it. A timer running on it would never finish. Elapsed time is a
 * question about the real world, exactly like the age of a weather
 * reading.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS;
  var WORK_MS = 15 * 60 * 1000;
  var BREAK_MS = 5 * 60 * 1000;

  /* Every variable this module owns is declared BEFORE register() below, and
     that is a correctness requirement, not a style choice. register() mounts
     the module straight away, so mount() runs while this file is still being
     evaluated — and a `var` further down is hoisted as undefined and then
     assigned when execution reaches it, which would wipe everything mount()
     had just built. Declarations first, then register.

     state is the entire timer:
       mode     'work' or 'break'
       endsAt   the moment it is due to stop, or null when not running
       left     milliseconds remaining while paused, or null for a whole one */
  var state = { mode: 'work', endsAt: null, left: null };
  var api = null;
  var root = null, timeEl = null, stateEl = null, fillEl = null, noteEl = null, toggleEl = null;
  var repaint = null, endTimer = null;

  U.modules.register({
    id: 'pomodoro',
    name: 'Focus timer',
    /* Compact, so it lives in the right-hand column under the reminders rather
       than claiming a row of its own. */
    slot: 'column',
    explainer:
      'Press <b>Start</b> and work on one thing until the bar fills. Then take five. ' +
      'The point isn\u2019t to work longer \u2014 it\u2019s to make starting easy.',
    defaults: { enabled: true, visible: true },
    mount: mount,
    unmount: unmount
  });

  function fullLength(mode) { return mode === 'break' ? BREAK_MS : WORK_MS; }

  function remaining() {
    if (state.endsAt) return Math.max(0, state.endsAt - Date.now());
    return state.left === null ? fullLength(state.mode) : state.left;
  }

  function clockText(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var s = total % 60;
    return Math.floor(total / 60) + ':' + (s < 10 ? '0' : '') + s;
  }

  function label() {
    if (!state.endsAt && state.left === null) return 'Ready';
    if (!state.endsAt) return 'Paused';
    return state.mode === 'break' ? 'On a break' : 'Focusing';
  }

  function note() {
    if (state.endsAt && state.mode === 'break') return 'Stand up. Look somewhere far away.';
    if (state.endsAt) return 'One thing, until the bar fills.';
    if (state.mode === 'break') return 'Break\u2019s ready when you are.';
    return 'Fifteen minutes on one thing. That\u2019s the whole ask.';
  }

  function paint() {
    if (!root) return;
    var left = remaining();
    var full = fullLength(state.mode);
    var done = full ? Math.max(0, Math.min(1, 1 - left / full)) : 0;

    // 'ready' only affects the state colour; the bar is empty anyway.
    root.setAttribute('data-mode', (!state.endsAt && state.left === null) ? 'ready' : state.mode);
    timeEl.textContent = clockText(left);
    stateEl.textContent = label();
    noteEl.textContent = note();
    fillEl.style.width = (done * 100).toFixed(2) + '%';
    toggleEl.textContent = state.endsAt ? 'Pause' : (state.left === null ? 'Start' : 'Resume');
  }

  function save() { if (api) api.data.set(state); }

  /* Everything that changes the timer funnels through here, so the repaint
     interval and the single completion timeout always match the state. */
  function arm() {
    if (state.endsAt && !repaint) repaint = setInterval(sync, 1000);
    if (!state.endsAt && repaint) { clearInterval(repaint); repaint = null; }
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    if (state.endsAt) {
      /* One timeout at the exact finishing moment, because a throttled hidden
         tab may not run the repaint interval on time. Belt and braces: the
         interval catches it if this fires late, and waking the tab catches it
         if the machine slept through both. */
      endTimer = setTimeout(sync, Math.max(0, state.endsAt - Date.now()) + 60);
    }
  }

  function sync() {
    /* The one completion path. Idempotent by construction: advance() replaces
       the deadline, so a second call a moment later finds nothing due. */
    if (state.endsAt && Date.now() >= state.endsAt) { advance(); return; }
    paint();
  }

  /* Finish first, then say so. The order matters: the announcement is not a
     precondition for the state change, and if it ever fails the session must
     still have ended properly rather than leaving a timer stalled with a
     deadline nobody cleared. */
  function advance() {
    var finished = state.mode;
    state.endsAt = null;
    state.left = null;

    if (finished === 'work') {
      state.mode = 'break';
      start();                    // the break runs on its own; it's only five minutes
      api.notify('', 'Fifteen minutes up', 'Nice. Take five.');
      return;
    }

    /* A finished break does not chain into another work session: nobody is
       sitting there, and silently burning fifteen minutes would be a lie. */
    state.mode = 'work';
    save();
    arm();
    paint();
    api.notify('', 'Break over', 'Ready for another fifteen whenever you are.');
  }

  function start() {
    state.endsAt = Date.now() + (state.left === null ? fullLength(state.mode) : state.left);
    state.left = null;
    save();
    arm();
    paint();
  }

  function pause() {
    state.left = remaining();
    state.endsAt = null;
    save();
    arm();
    paint();
  }

  function reset() {
    state.mode = 'work';
    state.endsAt = null;
    state.left = null;
    save();
    arm();
    paint();
  }

  /* ---------------- mount ---------------- */

  function mount(body, moduleApi) {
    api = moduleApi;

    var stored = api.data.get(null);
    if (stored && (stored.mode === 'work' || stored.mode === 'break')) {
      state = {
        mode: stored.mode,
        endsAt: typeof stored.endsAt === 'number' ? stored.endsAt : null,
        left: typeof stored.left === 'number' ? stored.left : null
      };
    }

    root = document.createElement('div');
    root.className = 'pomo';
    root.innerHTML =
      '<div class="pomo-top">' +
        '<div class="pomo-time" data-time>15:00</div>' +
        '<div class="pomo-state" data-state>Ready</div>' +
      '</div>' +
      '<div class="pomo-track"><div class="pomo-fill" data-fill></div></div>' +
      '<p class="pomo-note" data-note></p>' +
      '<div class="pomo-actions">' +
        '<button type="button" class="btn" data-act="toggle">Start</button>' +
        '<button type="button" class="ghost-btn" data-act="reset">Reset</button>' +
      '</div>';
    body.appendChild(root);

    timeEl = root.querySelector('[data-time]');
    stateEl = root.querySelector('[data-state]');
    fillEl = root.querySelector('[data-fill]');
    noteEl = root.querySelector('[data-note]');
    toggleEl = root.querySelector('[data-act="toggle"]');

    root.addEventListener('click', function (e) {
      var act = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!act) return;
      var what = act.getAttribute('data-act');
      if (what === 'toggle') { if (state.endsAt) pause(); else start(); }
      else if (what === 'reset') reset();
    });

    /* A session that ran out while this page was closed still ran out. Settle
       it silently — you were not sitting here waiting, so announcing it on
       load would just be noise — and don't chain into a break that has also
       already expired. */
    if (state.endsAt && Date.now() >= state.endsAt) {
      state.endsAt = null;
      state.left = null;
      state.mode = state.mode === 'work' ? 'break' : 'work';
      save();
    }

    // Coming back to a tab that slept through the end: settle it, and say so,
    // because this time you were here.
    api.listen('wake', sync);

    arm();
    paint();
  }

  function unmount() {
    if (repaint) { clearInterval(repaint); repaint = null; }
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    root = timeEl = stateEl = fillEl = noteEl = toggleEl = null;
    api = null;
  }
})();
