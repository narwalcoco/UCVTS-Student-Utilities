/* ============================================================
 * reminders.js — the class heads-up engine, owned by the site.
 *
 * What changed and why
 * --------------------
 * Reminders used to live inside the class reminder page, which meant they
 * only worked while that exact page was open. A student on the home page
 * — or any tool page this site grows — got nothing. Now the engine loads
 * on every page and does its work the same way everywhere: the clock says
 * the minute changed, the engine checks, and if a heads-up is due it
 * fires. The page you're on only decides how the announcement looks (the
 * toast); the engine decides *that there is one*.
 *
 * Cost
 * ----
 * Zero timers of its own. The clock already ticks once a second and wakes
 * nobody unless the minute or the date actually changed; the engine just
 * subscribes to it. One page or five, there is exactly one clock and one
 * 1-second interval on the site, and this file adds nothing to it. Every
 * check is a handful of arithmetic comparisons over ten schedule rows —
 * microseconds, once a minute.
 *
 * Permissions are the engine's business too
 * -----------------------------------------
 * Whether desktop notifications are granted is a fact about reminders,
 * not about one page's card, so the watching lives here (permission can
 * change with this page uninvolved: the padlock, the browser's site
 * settings, a managed profile). Any page that shows reminder state
 * subscribes to onChange() and re-reads status().
 *
 * Nothing here touches the DOM. The toast is the page's job; the system
 * notification and the fire-once memory are the engine's.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS = globalThis.UCVTS || {};
  if (!U.clock) throw new Error('reminders.js: clock.js must load first');

  /* The schedule is stored and edited by the class reminder page; the engine
     only ever reads the same key. One source of truth (the key), one writer
     (that page) — the key string is repeated here on purpose rather than
     giving the engine a dependency on app.js, so reminders work on pages
     where the editor isn't loaded. */
  var SCHEDULE_KEY = 'ucvts.classpal.schedule.v1';
  var FIRED_KEY = 'ucvts.classpal.fired.v1';

  var fired = new Set(readJSON(FIRED_KEY, []));
  var hasSystemNotifications = 'Notification' in globalThis;
  var notifier = null;          // set by the page: fn(emoji, title, body)
  var changeHandlers = [];      // notified when permission state changes

  /* ---------------- storage ---------------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  /* ---------------- the day's schedule, as moments ---------------- */

  function rowValue(schedule, rowKey, field) {
    var e = schedule[rowKey];
    return e && e[field] ? String(e[field]).trim() : '';
  }

  // The day's blocks in order, lunch & co-curricular (periods 5-6) included,
  // trimmed to the dismissal time on short days.
  function dayBlocks(status) {
    if (!status.isSchoolDay) return [];
    var blocks = [];
    U.ROWS.forEach(function (row) {
      if (row.day !== status.type) return;
      blocks.push(row);
      if (row.period === '3-4') blocks.push(U.LUNCH_BLOCK); // lunch sits between 3-4 and 7-8
    });
    if (status.early) {
      blocks = blocks.filter(function (b) { return b.end <= status.dismissal; });
    }
    return blocks;
  }

  // Every reminder moment for a school day, in order:
  //  · first class of the day  — 10 & 5 min before it STARTS ("starting soon")
  //  · every other class        — 10 & 5 min before it STARTS ("next up")
  //  · lunch & co-curricular    — 10 & 5 min before periods 5-6
  //  · last class of the day    — 10 & 5 min before it ENDS ("almost over")
  function momentsFor(status, schedule) {
    var blocks = dayBlocks(status);
    var lastClass = null;
    for (var i = blocks.length - 1; i >= 0; i--) {
      if (!blocks[i].lunch) { lastClass = blocks[i]; break; }
    }
    var moments = [];
    blocks.forEach(function (b, idx) {
      if (b.lunch) {
        [10, 5].forEach(function (lead) {
          moments.push({ at: b.start - lead, kind: 'lunch', lead: lead, block: b, course: '', room: '' });
        });
        return;
      }
      var course = rowValue(schedule, b.key, 'course');
      if (!course) return; // no class entered -> nothing to announce
      var room = rowValue(schedule, b.key, 'room');
      if (b === lastClass) {
        [10, 5].forEach(function (lead) {
          moments.push({ at: b.end - lead, kind: 'last', lead: lead, block: b, course: course, room: room });
        });
      } else {
        [10, 5].forEach(function (lead) {
          moments.push({ at: b.start - lead, kind: idx === 0 ? 'first' : 'next', lead: lead, block: b, course: course, room: room });
        });
      }
    });
    return moments;
  }

  /* ---------------- firing ---------------- */

  /* Finish first, then say so — the announcement is never a precondition for
     the state change it describes. The fired-set is committed to storage
     before notify() runs, so a failing notification can't cause a repeat. */
  function fire(m) {
    var today = U.dateKey(U.clock.now());
    var id = today + '|' + m.block.key + '|' + m.kind + '|' + m.lead;
    if (fired.has(id)) return false;

    var msgLead = m.lead === 10 ? '10 minutes' : '5 minutes';
    var emoji, title, body;
    var time = U.fmtTime(m.kind === 'last' ? m.block.end : m.block.start);

    if (m.kind === 'first') {
      emoji = '🌅';
      title = '🌅 First class of the day: ' + m.course + ' starts in ' + msgLead + '!';
      body = (m.room ? 'Room ' + m.room + ' · ' : '') + 'starts at ' + time;
    } else if (m.kind === 'next') {
      emoji = '⏰';
      title = '⏰ Next up: ' + m.course + ' starts in ' + msgLead + '!';
      body = (m.room ? 'Room ' + m.room + ' · ' : '') + 'starts at ' + time;
    } else if (m.kind === 'lunch') {
      emoji = '🍱';
      title = '🍱 Lunch & co-curricular in ' + msgLead + '!';
      body = 'Periods 5–6 · ' + U.fmtTime(m.block.start) + ' – ' + U.fmtTime(m.block.end);
    } else { // 'last'
      emoji = '🏁';
      title = '🏁 ' + m.course + ' is almost over — ends in ' + msgLead + '!';
      body = (m.room ? 'Room ' + m.room + ' · ' : '') + 'ends at ' + time;
    }

    fired.add(id);
    saveJSON(FIRED_KEY, Array.from(fired).slice(-400));

    /* Default is the toast plus the system echo; a page that set its own
       notifier speaks instead of the toast (the echo is that page's to add). */
    try { (notifier || announce)(emoji, title.replace(emoji + ' ', ''), body); }
    catch (e) {
      if (globalThis.console && console.error) {
        console.error('reminders: the announcement failed', e);
      }
    }
    if (notifier) systemEcho(emoji, title, body);
    return true;
  }

  /* The one check. Runs on the clock's minute event — and immediately after
     any clock re-point — and nowhere else. */
  function check() {
    var now = U.clock.now();
    var status = U.statusFor(now);
    if (!status.isSchoolDay) return;
    var mins = now.getHours() * 60 + now.getMinutes();
    var nowSec = (mins * 60) + now.getSeconds();
    var schedule = readJSON(SCHEDULE_KEY, {});
    momentsFor(status, schedule).forEach(function (m) {
      // Fire within a 2-minute window after the target time.
      if (nowSec >= m.at * 60 && nowSec < (m.at * 60) + 120) fire(m);
    });
  }

  /* ---------------- the in-page toast ----------------

   The toast lives here rather than in each page for the same reason the
   engine does: a heads-up can land on any page, and every page would
   otherwise grow its own copy of the same markup and drift. It needs the
   #toasts host in the page (a site-wide convention, like the two sky
   canvases); without one it stays silent rather than failing — the system
   notification around it is the announcement that matters.

   announce() is toast plus the system echo: the one path for anything a
   page or a module raises itself. fire() above deliberately assembles its
   own announcement from toast plus the echo, because its notifier slot is
   meant for a page that wants to speak differently. */

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(emoji, title, body) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast';
    // An announcement may have nothing to show here; an empty span would
    // still take up its gap, so leave it out rather than render a blank one.
    el.innerHTML =
      (emoji ? '<span class="t-emoji" aria-hidden="true">' + esc(emoji) + '</span>' : '') +
      '<div>' +
        '<div class="t-title">' + esc(title) + '</div>' +
        (body ? '<div class="t-body">' + esc(body) + '</div>' : '') +
      '</div>' +
      '<button class="t-x" aria-label="Dismiss">\u2715</button>';
    host.appendChild(el);

    var dismiss = function () {
      if (el.classList.contains('bye')) return;
      el.classList.add('bye');
      setTimeout(function () { el.remove(); }, 400);
    };
    el.querySelector('.t-x').addEventListener('click', dismiss);
    setTimeout(dismiss, 15000);
  }

  function systemEcho(emoji, title, body) {
    if (hasSystemNotifications && Notification.permission === 'granted') {
      try { new Notification(emoji ? emoji + ' ' + title : title, { body: body }); }
      catch (e) { /* the toast is the announcement; this is the echo */ }
    }
  }

  function announce(emoji, title, body) {
    toast(emoji, title, body);
    systemEcho(emoji, title, body);
  }

  /* ---------------- what pages ask the engine ---------------- */

  /* Why desktop notifications may be impossible here, or null if we can ask.

     Browsers only hand them out to a real, secure address. Note what is NOT
     the test: `isSecureContext`. Chrome reports a file:// page as a secure
     context, so a check on that flag never fires — the protocol is read
     directly instead. */
  function cannotAskBecause() {
    if (!hasSystemNotifications) return 'no-api';
    if (globalThis.location.protocol === 'file:') return 'file';
    if (!globalThis.isSecureContext) return 'insecure';
    return null;
  }

  function status() {
    return {
      supported: hasSystemNotifications,
      permission: hasSystemNotifications ? Notification.permission : 'unsupported',
      cannotAskBecause: cannotAskBecause()
    };
  }

  function onChange(fn) {
    changeHandlers.push(fn);
    return function () {
      var i = changeHandlers.indexOf(fn);
      if (i !== -1) changeHandlers.splice(i, 1);
    };
  }

  /* Permission changed: tell every listener. Deliberately NOT named
     announce() — the toast+echo announcer above owns that name, and a
     second function declaration of the same name would silently replace
     it (function declarations hoist, so the toast would never run). */
  function announcePermission() {
    var s = status();
    for (var i = 0; i < changeHandlers.length; i++) {
      try { changeHandlers[i](s); }
      catch (e) { /* a broken listener can't stall the others */ }
    }
  }

  /* Ask the browser. Never swallows: the return value is 'granted',
     'denied', 'dismissed' or 'error', and the page decides what to say. */
  async function ask() {
    if (cannotAskBecause()) return 'cannot-ask';
    var res = null;
    try {
      res = await Notification.requestPermission();
    } catch (e) {
      res = 'error';
    }
    announcePermission();
    if (res === 'granted') return 'granted';
    if (res === 'denied') return 'denied';
    if (res === 'default') return 'dismissed';
    return 'error';
  }

  /* Permission can change without this page being involved: the padlock, the
     browser's own site settings, a managed profile where it was already
     allowed. Watch for the change instead of assuming it can't happen. */
  function watchPermission() {
    if (!hasSystemNotifications) return;

    /* Chromium and Firefox both accept 'notifications' here; Safari has no
       such name, so this is best-effort and the wake/focus below cover it. */
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'notifications' }).then(function (st) {
          if (st && 'onchange' in st) st.onchange = function () { announcePermission(); };
        }).catch(function () { /* name not supported here */ });
      }
    } catch (e) { /* name not supported here */ }

    /* Coming back to the tab is exactly the moment someone who has just
       fixed the setting in the browser's own UI arrives. */
    U.clock.subscribe('wake', function () { announcePermission(); check(); });
    globalThis.addEventListener('focus', function () { announcePermission(); });
  }

  /* ---------------- boot ---------------- */

  check();                 // catch up on anything due while the page was closed
  watchPermission();
  U.clock.subscribe('minute', check);
  U.clock.subscribe('day', check);   // a simulated jump re-runs the day's checks
  U.clock.subscribe('time', check);

  U.reminders = {
    status: status,
    ask: ask,
    onChange: onChange,
    momentsFor: momentsFor,
    dayBlocks: dayBlocks,
    /* The page tells the engine how to announce. Whatever it passes gets the
       same emoji/title/body the system notification gets. A page that passes
       nothing still gets system notifications — the engine never needs a DOM. */
    /* The default way an announcement looks: the in-page toast. A page that
       wants to speak differently passes its own via setNotifier(). */
    setNotifier: function (fn) { notifier = typeof fn === 'function' ? fn : null; },
    /* Toast plus the system echo — the one path for anything a page or a
       module raises on its own (the modules' U.notify maps here). */
    toast: toast,
    announce: announce,
    /* The tester panel's "let them fire again". */
    refire: function () {
      fired.clear();
      saveJSON(FIRED_KEY, []);
    }
  };

  /* Modules (and anything else a page raises on its own) post their notices
     through U.notify. The class reminder page has always set this from
     app.js; assigning it here means every page that loads the engine gets a
     working one — including the focus timer's page, which loads no app.js
     and whose completion toast was otherwise a silent no-op. It resolves to
     the same announce() the reminder heads-ups use, so there is still one
     path and one look. */
  U.notify = U.reminders.announce;
})();
