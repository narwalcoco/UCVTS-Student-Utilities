/* ============================================================
 * app.js — UI glue for the Class Reminder page.
 *
 * What this file is now
 * ---------------------
 * The page: schedule table, day card, today's classes, reminder *state*
 * card, the tester panel. Everything on screen.
 *
 * What moved out and why
 * ----------------------
 * Reminder *firing* no longer lives here. It is reminders.js, loaded by
 * every page on the site, so a heads-up reaches you whichever tool page
 * is open. This page asks the engine for state (status(), momentsFor())
 * and hands it a notifier; it never decides on its own when something is
 * due. The day wording and emoji moved to day.js for the same reason —
 * the home page's day strip reads the same source, so the two pages
 * cannot disagree about what today is.
 *
 * Nothing here polls. The clock tells this page when the minute or the
 * date changed; reminders.js listens to the same clock independently.
 * ----------------------------------------------------------------- */
(function () {
  'use strict';

  var U = globalThis.UCVTS;
  var $ = function (sel) { return document.querySelector(sel); };

  var SCHEDULE_KEY = 'ucvts.classpal.schedule.v1';

  /* ---------------- tiny storage helpers ---------------- */

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
  }

  /* ---------------- the clock ----------------
   * Every "what time is it?" in this file goes through the shared clock,
   * which also owns the tester panel's fake time and the ?now= pin. This
   * file no longer reads the device clock or the query string directly —
   * one place decides, so no two parts can disagree about the time.
   *
   * The fake clock saved in JSON as an ISO string, and it can also be pinned:
   *
   *     class-reminder.html?now=2026-11-26T12:00
   *
   * A pinned clock seeds the fake time without saving it, so following a link
   * never moves the real device's own state. The testing banner still shows
   * up for it, correctly, because the time really is simulated.
   * ---------------------------------------------------------------- */

  var clock = U.clock;

  function getNow() { return clock.now(); }

  /* Thin on purpose: the clock reports the change to every subscriber,
     including us, so there is nothing else to do here. */
  function setSimulated(t) { clock.setSimulated(t); }

  function clearSimulated() { clock.clearSimulated(); }

  function fmtClockish(date) {
    return date.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  function updateSimBanner() {
    var banner = $('#simBanner');
    if (!banner) return;
    if (!clock.isSimulated()) { banner.hidden = true; return; }
    banner.hidden = false;
    var t = clock.now();
    var diffMin = Math.round((t.getTime() - Date.now()) / 60000);
    var diffTxt = diffMin === 0 ? ' (matches the real clock)'
      : (diffMin > 0 ? ' (' + diffMin + ' min ahead of real time)' : ' (' + (-diffMin) + ' min behind real time)');
    // Recomputed whenever the minute changes, not only when the clock is set:
    // "12 min ahead of real time" stops being true a minute later.
    setText($('#simBannerText'),
      '🧪 Testing simulated time: ' + fmtClockish(t) + diffTxt);
  }

  function updateSimCur() {
    var el = $('#simCur');
    if (!el) return;
    el.textContent = clock.isSimulated()
      ? 'Simulating: ' + fmtClockish(clock.now())
      : 'Showing the real clock (' + fmtClockish(new Date()) + ')';
  }

  function parseLocalDateTime(dateStr, timeStr) {
    var dp = String(dateStr).split('-').map(Number);
    var tp = String(timeStr || '00:00').split(':').map(Number);
    return new Date(dp[0], dp[1] - 1, dp[2], tp[0] || 0, tp[1] || 0, 0);
  }

  function dateFromKey(key) {
    var p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  /* The next moment of `type` at h:m that hasn't passed yet.

     `fromDate` itself counts as "not passed": on an A-day at 7:00, the 7:50
     preset means *this* morning, not the next A-day a week out. It only moves
     on once the target time is actually behind us, which is why the whole
     datetime is compared rather than the calendar day. */
  function nextTypeMoment(type, h, m, fromDate) {
    var fromMs = fromDate.getTime();
    for (var i = 0; i < U.schoolDayDates.length; i++) {
      var day = U.schoolDayDates[i];
      if (U.typeByKey[U.dateKey(day)] !== type) continue;
      var at = atTime(day, h, m);
      if (at.getTime() >= fromMs) return at;
    }
    return null;
  }

  /* Same idea for the date-keyed maps (closures and half days): today counts
     when it matches, so "no-school day" on Thanksgiving morning shows
     Thanksgiving itself instead of jumping to the next closure. */
  function nextDateInKeyMap(map, fromDate) {
    var keys = Object.keys(map).sort();
    var fk = U.dateKey(fromDate);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] >= fk) return dateFromKey(keys[i]);
    }
    return null;
  }

  function atTime(baseDate, h, m) {
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, m, 0);
  }

  // Preset targets: minutes come straight from the bell schedule in calendar.js
  // (1st class starts 8:00 -> 7:50/7:55 · 3-4 starts 9:27 -> 9:17 · lunch starts
  // 10:53 -> 10:43 · last class ends 2:50 -> 2:40/2:45).
  var SIM_PRESETS = {
    first10: function () { return nextTypeMoment('A', 7, 50, getNow()); },
    first5: function () { return nextTypeMoment('A', 7, 55, getNow()); },
    next10: function () { return nextTypeMoment('A', 9, 17, getNow()); },
    lunch10: function () { return nextTypeMoment('A', 10, 43, getNow()); },
    last10: function () { return nextTypeMoment('A', 14, 40, getNow()); },
    last5: function () { return nextTypeMoment('A', 14, 45, getNow()); },
    closed: function () {
      var d = nextDateInKeyMap(U.CLOSED_DAYS, getNow()); return d ? atTime(d, 12, 0) : null;
    },
    early: function () {
      var d = nextDateInKeyMap(U.EARLY_DISMISSAL, getNow()); return d ? atTime(d, 11, 0) : null;
    }
  };

  function simHint(msg) {
    $('#simHint').textContent = msg || '';
  }

  function openSimPanel() {
    var panel = $('#simPanel');
    if (!panel) return;
    var now = getNow();
    $('#simDate').value = U.dateKey(now);
    $('#simTime').value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    simHint('');
    updateSimCur();
    panel.hidden = false;
  }

  function closeSimPanel() { $('#simPanel').hidden = true; }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* The page re-renders on a 10-second tick, and the day card sits inside an
     aria-live region. Rewriting a subtree that hasn't changed churns the DOM
     for nothing — and in that card's case makes a screen reader re-read the
     same facts every ten seconds — so every render below writes only when the
     value actually differs. */
  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function setHTML(el, html) {
    if (!el || el._lastHTML === html) return;
    el._lastHTML = html;
    el.innerHTML = html;
  }

  /* ---------------- schedule model + table ---------------- */

  var schedule = loadJSON(SCHEDULE_KEY, {});
  // Keep every row key present, even when empty.
  U.ROWS.forEach(function (row) {
    if (!schedule[row.key]) schedule[row.key] = { course: '', room: '' };
  });

  var schedBody = $('#schedBody');
  var schedTable = $('#schedTable');
  var editBtn = $('#editBtn');
  var schedLead = $('#schedLead');
  var saveHint = $('#saveHint');
  var saveTimer = null;
  var editing = false;

  var SCHED_LEAD = {
    read: 'Saved on this device. Press Edit to change anything.',
    edit: 'Fill in each course & room — it saves automatically as you type.'
  };

  function setEditing(on) {
    editing = !!on;
    schedTable.classList.toggle('editing', editing);
    editBtn.textContent = editing ? 'Done' : 'Edit';
    editBtn.setAttribute('aria-pressed', editing ? 'true' : 'false');
    schedLead.textContent = editing ? SCHED_LEAD.edit : SCHED_LEAD.read;
  }

  /* One cell carries both faces of its value: the plain text and the input.
     Both stay in the DOM, so switching modes is a CSS class, never a rebuild. */
  function cellHTML(field, value) {
    var isRoom = field === 'room';
    return '<div class="cell">' +
      '<button class="cell-view" type="button" data-field="' + field + '"' +
        (value ? '' : ' data-empty="1"') + '>' +
        (value || (isRoom ? 'Add room' : 'Add course')) +
      '</button>' +
      '<div class="field"><span class="f-emoji" aria-hidden="true">' + (isRoom ? '🚪' : '📘') + '</span>' +
        '<input data-field="' + field + '" value="' + value + '" ' +
        'placeholder="' + (isRoom ? 'e.g. UCT 801' : 'e.g. Fitness 1') + '" ' +
        'aria-label="' + (isRoom ? 'Room' : 'Course') + '" autocomplete="off"></div>' +
    '</div>';
  }

  /* The read-side text has to follow along as you type, or leaving edit mode
     would show a stale value. One text node per keystroke, so it's cheap. */
  function syncCellView(input) {
    var tr = input.closest('tr.row');
    if (!tr) return;
    var field = input.getAttribute('data-field');
    var view = tr.querySelector('.cell-view[data-field="' + field + '"]');
    if (!view) return;
    var text = input.value.trim();
    view.textContent = text || (field === 'room' ? 'Add room' : 'Add course');
    if (text) view.removeAttribute('data-empty');
    else view.setAttribute('data-empty', '1');
  }

  function rowValue(rowKey, field) {
    var e = schedule[rowKey];
    return e && e[field] ? String(e[field]).trim() : '';
  }

  function renderSchedule() {
    var html = [];
    var prevDay = null;
    U.ROWS.forEach(function (row) {
      if (row.day !== prevDay) {
        html.push('<tr class="group" data-day="' + row.day + '">' +
          '<td colspan="3"><div class="g-bar"><span class="g-name">' +
          (row.day === 'A' ? '🍎 A Days' : '🫐 B Days') +
          '</span><span class="pill g-tag">today</span></div></td></tr>');
        prevDay = row.day;
      }
      var course = esc(rowValue(row.key, 'course'));
      var room = esc(rowValue(row.key, 'room'));
      html.push(
        '<tr class="row row' + row.day + '" data-day="' + row.day + '" data-key="' + row.key + '">' +
          '<td>' +
            '<div class="period-label">' +
              '<div class="period-name">Periods ' + row.period + '</div>' +
              '<div class="period-time">' + U.fmtTime(row.start) + ' – ' + U.fmtTime(row.end) + '</div>' +
            '</div>' +
          '</td>' +
          '<td>' + cellHTML('course', course) + '</td>' +
          '<td>' + cellHTML('room', room) + '</td>' +
        '</tr>'
      );
    });
    schedBody.innerHTML = html.join('');

    // Highlight today's day-group rows.
    highlightTodayRows();
  }

  /* Today's day-group takes the emphasis and the other steps back. On a day
     off `today` is null, so neither group gets to claim it. */
  function highlightTodayRows() {
    var status = U.statusFor(getNow());
    var today = status.isSchoolDay ? status.type : null;

    schedBody.querySelectorAll('tr.row').forEach(function (tr) {
      tr.classList.toggle('rowToday', tr.getAttribute('data-day') === today);
    });
    schedBody.querySelectorAll('tr.group').forEach(function (g) {
      var isToday = !!today && g.getAttribute('data-day') === today;
      g.classList.toggle('isToday', isToday);
      g.classList.toggle('isOther', !!today && !isToday);
    });

    schedTable.classList.toggle('hasToday', !!today);
  }

  schedBody.addEventListener('input', function (e) {
    var input = e.target;
    if (!input.matches || !input.matches('input')) return;
    var tr = input.closest('tr.row');
    if (!tr) return;
    var key = tr.getAttribute('data-key');
    var field = input.getAttribute('data-field');
    schedule[key][field] = input.value;
    syncCellView(input);
    saveJSON(SCHEDULE_KEY, schedule);
    flashSaved();
    refreshDynamic(); // class list + reminder preview may change
  });

  editBtn.addEventListener('click', function () {
    setEditing(!editing);
    if (editing) {
      var first = schedBody.querySelector('input');
      if (first) first.focus();
    }
  });

  // Clicking a value drops straight into editing that one thing.
  schedBody.addEventListener('click', function (e) {
    var view = e.target.closest && e.target.closest('.cell-view');
    if (!view) return;
    var tr = view.closest('tr.row');
    if (!tr) return;
    setEditing(true);
    var input = tr.querySelector('input[data-field="' + view.getAttribute('data-field') + '"]');
    if (input) { input.focus(); input.select(); }
  });

  schedBody.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && editing) {
      e.preventDefault();
      setEditing(false);
      editBtn.focus();
    }
  });

  function flashSaved() {
    saveHint.textContent = 'saved 💾';
    saveHint.classList.add('flash');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveHint.classList.remove('flash');
    }, 1200);
  }

  $('#resetBtn').addEventListener('click', function () {
    if (!confirm('Clear your whole schedule from this device?')) return;
    schedule = {};
    U.ROWS.forEach(function (row) { schedule[row.key] = { course: '', room: '' }; });
    saveJSON(SCHEDULE_KEY, schedule);
    renderSchedule();
    refreshDynamic();
  });

  /* ---------------- today's classes card ---------------- */

  function nowMinutes(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  function renderClassList(status, now) {
    var card = $('#classesCard');
    var list = $('#classList');

    if (!status.isSchoolDay) {
      card.classList.remove('visible');
      setHTML(list, '');
      return;
    }
    card.classList.add('visible');

    if (!status.type) {
      setHTML(list, '<div class="note">🎒 Welcome back! No A/B classes today — tomorrow starts the rotation with an A-Day 🍎.</div>');
      return;
    }

    var mins = nowMinutes(now);
    var rows = U.reminders.dayBlocks(status);
    var html = '';
    var sawActive = false;
    var sawUpcoming = false;

    if (status.early) {
      html += '<div class="note">🏃💨 Short day! Dismissal at 12:24 PM — afternoon classes don’t run today.</div>';
    }

    rows.forEach(function (row) {
      var isLunch = !!row.lunch;
      var course = isLunch ? '' : rowValue(row.key, 'course');
      var room = isLunch ? '' : rowValue(row.key, 'room');
      var isActive = mins >= row.start && mins < row.end;
      var badgeHtml = '';
      if (isActive && !sawActive) {
        // Both sides in minutes-from-midnight. This used to subtract a full
        // epoch timestamp from a midnight-relative one, which made the result
        // hugely negative, so the clamp floored it and every class claimed to
        // end in ~1 minute.
        var remainMin = Math.max(1, row.end - mins);
        badgeHtml = '<span class="badge on">🔵 on now · ends in ~' + remainMin + ' min</span>';
        sawActive = true;
      } else if (!isActive && !sawActive && !sawUpcoming && row.end > mins) {
        badgeHtml = '<span class="badge next">up next · ' + U.fmtTime(row.start) + '</span>';
        sawUpcoming = true;
      }
      var what = isLunch
        ? '<span class="c-name">🍱 Lunch &amp; co-curricular</span> <span class="c-room">· periods 5–6</span>'
        : (course
          ? '<span class="c-name">' + esc(course) + '</span>' + (room ? ' <span class="c-room">· ' + esc(room) + '</span>' : '')
          : '<span class="c-free">— free period (nothing entered)</span>');
      html +=
        '<div class="class-line">' +
          '<div class="when">' + U.fmtTime(row.start) + ' – ' + U.fmtTime(row.end) + '</div>' +
          '<div class="what">' + what + '</div>' +
          badgeHtml +
        '</div>';
    });

    if (!sawActive && rows.length && !sawUpcoming) {
      html += status.early
        ? '<div class="note">🏃 Classes are done — dismissal is at 12:24 PM. Have a great afternoon!</div>'
        : '<div class="note">🎉 All of today’s classes are done — enjoy the rest of your day!</div>';
    }
    setHTML(list, html);
  }

  /* ---------------- reminders: the page's face on the engine ---------------- */

  /* The engine (reminders.js) decides *when* a heads-up fires and *whether*
     desktop notifications are allowed — on every page of the site, not just
     this one. This card is that engine's face: it shows the permission state,
     offers the ask, and previews today's heads-up times. */

  function refreshReminderUI() {
    var pill = $('#reminderPill');
    var btn = $('#enableBtn');
    var tip = $('#notifTip');
    var why = U.reminders.status().cannotAskBecause;

    // Granted is the only state where the card has nothing left to operate, so
    // it collapses (see .remind-card.is-on in styles.css). Every other state
    // still needs the button or the tip, so the full card stays.
    $('#remindCard').classList.toggle(
      'is-on',
      U.reminders.status().permission === 'granted'
    );

    /* The two states that can never change get the same emphasis as "blocked".
       They sat in quiet grey text before, and someone who expects desktop
       notifications to be on has no reason to read quiet grey text. */
    tip.classList.toggle('warn', !!why);
    btn.disabled = !!why;

    if (why) {
      pill.textContent = 'in-page';
      pill.classList.remove('on');
      btn.classList.remove('is-on');
      btn.textContent = 'On-screen reminders only';
      tip.textContent = why === 'file'
        ? 'This page is open as a local file, and browsers keep desktop notifications for real sites — so this one can’t send them. The on-screen reminders below still work. Served from http://localhost or https, desktop notifications work too.'
        : why === 'insecure'
          ? 'Desktop notifications need a secure address (https, or http://localhost). The on-screen reminders below still work.'
          : 'This browser has no desktop notifications. The on-screen reminders below still work — keep this tab open.';
      return;
    }

    var permission = U.reminders.status().permission;
    if (permission === 'granted') {
      pill.textContent = 'on';
      pill.classList.add('on');
      btn.textContent = 'Desktop notifications on ✅';
      btn.classList.add('is-on');
      tip.textContent = '';
      tip.classList.remove('warn');
    } else if (permission === 'denied') {
      pill.textContent = 'blocked';
      tip.classList.add('warn');
      tip.textContent = 'Notifications are blocked — allow them in your browser’s site settings, then reload.';
      btn.textContent = 'Turn on reminders 💌';
      btn.classList.remove('is-on');
      pill.classList.remove('on');
    } else {
      pill.textContent = 'off';
      pill.classList.remove('on');
      btn.classList.remove('is-on');
      btn.textContent = 'Allow desktop notifications 💌';
      tip.textContent = 'System notifications pop up even when the tab is in the background. On-screen reminders work no matter what.';
    }
  }

  /* One place that says "tell the person this": the engine's toast plus the
     system echo. Reminder heads-ups go through the engine's own default path
     — which is the same toast — so a heads-up looks identical no matter which
     page of the site it lands on, including pages that never load this file. */
  var notify = U.reminders.announce;

  // Modules raise their notifications through this, so there is one path.
  U.notify = notify;

  $('#enableBtn').addEventListener('click', async function () {
    /* Do not swallow this. Whatever happens, something gets said — a control
       that can fail silently is worse than one that explains itself. */
    var res = await U.reminders.ask();

    if (res === 'granted') {
      showToast('🎉', 'Reminders are on!', 'You’ll get a heads-up 10 and 5 minutes before each class starts.');
    } else if (res === 'denied') {
      showToast('', 'Notifications are blocked', 'Your browser is set to block them for this page. The on-screen reminders still work.');
    } else if (res === 'dismissed') {
      showToast('', 'Not switched on', 'That prompt was dismissed, so notifications stay off. The on-screen reminders still work.');
    } else if (res === 'error') {
      showToast('', 'Something went wrong', 'The browser refused the request. On-screen reminders still work.');
    }
    refreshReminderUI();
  });

  /* The engine tells this page when permission changed out from under it —
     the padlock, the browser's site settings, a managed profile. */
  U.reminders.onChange(refreshReminderUI);

  /* Reminder preview — today's upcoming heads-up times */
  function renderReminderPreview(status, now) {
    var box = $('#todayReminders');
    if (!status.isSchoolDay) {
      setHTML(box, '<div class="note">🎈 School is closed today, so no reminders are scheduled.</div>');
      return;
    }
    if (!status.type) {
      setHTML(box, '<div class="note">🎈 No A/B classes today — add your classes and reminders start tomorrow with the A-Day rotation.</div>');
      return;
    }
    var mins = nowMinutes(now);
    var moments = U.reminders.momentsFor(status, schedule).filter(function (m) { return m.at > mins; });
    if (!moments.length) {
      var anyFilled = U.reminders.dayBlocks(status).some(function (b) { return !b.lunch && rowValue(b.key, 'course'); });
      setHTML(box, anyFilled
        ? '<div class="note">🎈 No more heads-ups scheduled for today.</div>'
        : '<div class="note">✏️ Add your ' + status.type + '-Day classes above and their reminder times will show up here.</div>');
      return;
    }
    var html = '';
    moments.forEach(function (m) {
      var msg;
      if (m.kind === 'first') msg = '🌅 First class: ' + esc(m.course) + ' starts at ' + U.fmtTime(m.block.start);
      else if (m.kind === 'next') msg = '⏰ Next up: ' + esc(m.course) + ' starts at ' + U.fmtTime(m.block.start);
      else if (m.kind === 'lunch') msg = '🍱 Lunch & co-curricular at ' + U.fmtTime(m.block.start);
      else msg = '🏁 ' + esc(m.course) + ' almost over — ends at ' + U.fmtTime(m.block.end);
      html +=
        '<div class="r-line">' +
          '<span class="r-time">' + U.fmtTime(m.at) + '</span>' +
          '<span class="r-msg">' + msg + '</span>' +
          '<span class="r-lead">' + m.lead + ' min heads-up</span>' +
        '</div>';
    });
    setHTML(box, html);
  }

  /* ---------------- toast pop-up (in-page fallback) ----------------

   The toast itself now lives in reminders.js (every page needs it, so it
   belongs to the engine that fires on every page). This page keeps a thin
   local alias for its own confirmations. */

  var showToast = U.reminders.toast;

  /* ---------------- day status card ----------------
   * One verdict, then the facts. The wording and emoji come from day.js, the
   * same source the home page's day strip reads; what this card adds is the
   * facts row and the "welcome back / outside the year" detail. Every state
   * fills the same three tiers — title, date, then labelled facts — so the
   * card reads the same whether it says "A-Day" or "Winter Recess", and
   * nothing important ends up buried at the tail of a sentence.
   * ------------------------------------------------- */

  function renderDayCard(status, now) {
    var badge = $('#dayBadge');
    var title = $('#dayTitle');
    var sub = $('#daySub');
    var summary = U.day.daySummary(now);

    badge.classList.remove('typeB', 'off');
    var facts = [];
    var next = U.nextSchoolDay(now);

    if (status.isSchoolDay && !status.type) {
      // Welcome Back day: school is in session but the A/B rotation hasn't started.
      setText(badge, summary.emoji);
      setText(title, summary.title);
      if (next) facts.push({ label: 'A/B rotation', value: U.day.nextSchoolFact(next) });
    } else if (status.isSchoolDay) {
      setText(badge, status.type);
      if (status.type === 'B') badge.classList.add('typeB');
      setText(title, 'Today is ' + (status.type === 'A' ? 'an' : 'a') + ' ' + status.type + '-Day');
      facts.push({
        label: 'School day',
        value: '#' + status.dayNumber + ' of ' + U.TOTAL_STUDENT_DAYS
      });
      if (status.early) {
        facts.push({ label: 'Dismissal', value: U.fmtTime(status.dismissal) });
      }
    } else {
      badge.classList.add('off');

      if (status.reason === 'Weekend') {
        setText(badge, summary.emoji);
        setText(title, 'No school — it’s the weekend');
        if (next) facts.push({ label: 'Back to school', value: U.day.nextSchoolFact(next) });
      } else if (status.reason === 'Outside the school year') {
        var beforeStart = now < U.day.SCHOOL_START;
        setText(badge, summary.emoji);
        setText(title, beforeStart
          ? 'School starts ' + U.day.monthDay(U.day.SCHOOL_START)
          : 'School’s out for the summer');
        // One fact only. The panel below already names the date, so a
        // "back to school" entry here would just say the same thing twice.
        facts.push({
          label: beforeStart ? 'First day' : 'School resumes',
          value: U.day.monthDay(beforeStart ? U.day.SCHOOL_START : U.day.nextSchoolStart(now))
        });
      } else {
        // The reason is the whole point of this state, so it goes in the
        // title instead of trailing after "— no classes, no reminders".
        setText(badge, summary.emoji);
        setText(title, 'No school — ' + status.reason);
        if (next) facts.push({ label: 'Back to school', value: U.day.nextSchoolFact(next) });
      }
    }

    setText(sub, U.day.longDate(now));
    renderFacts(facts);
  }

  function renderFacts(facts) {
    var host = $('#dayFacts');
    if (!host) return;
    if (!facts.length) {
      setHTML(host, '');
      host.hidden = true;
      return;
    }
    var html = '';
    facts.forEach(function (f) {
      html += '<div class="fact"><dt>' + esc(f.label) + '</dt><dd>' + f.value + '</dd></div>';
    });
    setHTML(host, html);
    host.hidden = false;
  }

  /* ---------------- master tick ---------------- */

  /* ---------------- what runs when, and why ----------------
   * Nothing here polls. Each subscriber below runs only when the clock says
   * something it cares about changed — and the minute-level parts and the
   * day-level parts are deliberately split, because the countdown genuinely
   * does change every minute while the day card doesn't. Rebuilding the
   * whole page on a timer is what used to let these parts disagree.
   * Reminder *firing* is not in these lists at all any more: reminders.js
   * subscribes to the same clock events on its own.
   * ---------------------------------------------------------------- */

  // Called after a schedule edit: the class list and the reminder preview
  // both depend on what was just typed.
  function refreshDynamic() {
    highlightTodayRows();
    var now = getNow();
    var status = U.statusFor(now);
    renderClassList(status, now);
    renderReminderPreview(status, now);
  }

  // Minute resolution — the things that really do change minute to minute.
  function onMinute(now) {
    var status = U.statusFor(now);
    renderClassList(status, now);
    renderReminderPreview(status, now);
    updateSimBanner();
  }

  // A new date: the whole day's content is different from top to bottom.
  function onDay(now) {
    var status = U.statusFor(now);
    renderDayCard(status, now);
    highlightTodayRows();
    renderClassList(status, now);
    renderReminderPreview(status, now);
    updateSimBanner();
  }

  // The clock was re-pointed by the tester panel. It re-announces the day and
  // the minute immediately after this, and those two do the re-rendering — so
  // all that's left here is the panel's own readout.
  function onTime() {
    updateSimBanner();
    updateSimCur();
  }

  /* ---------------- beta tester: trigger word + panel ---------------- */

  // Type "betatesternico" anywhere except text boxes to open the panel.
  var seq = '';
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && t !== document.body &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
      return;
    }
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      seq = (seq + e.key.toLowerCase()).slice(-14);
      if (seq === 'betatesternico') {
        seq = '';
        openSimPanel();
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#simPanel').hidden) $('#simPanel').hidden = true;
  });

  $('#simPanelClose').addEventListener('click', closeSimPanel);

  function exitTestMode() {
    closeSimPanel();
    clearSimulated();
  }

  $('#simExitBtn').addEventListener('click', exitTestMode);
  $('#simResetBtn').addEventListener('click', exitTestMode);

  $('#simGoBtn').addEventListener('click', function () {
    var d = $('#simDate').value;
    var t = $('#simTime').value;
    if (!d) { simHint('Pick a date first 🙂'); return; }
    setSimulated(parseLocalDateTime(d, t));
    simHint('Set! Watch the page — reminders fire if the time lands in a window.');
  });

  document.querySelectorAll('.sim-chips [data-preset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var maker = SIM_PRESETS[btn.getAttribute('data-preset')];
      if (!maker) return;
      var when = maker();
      if (!when) { simHint('No upcoming day like that in the calendar 🗓️'); return; }
      setSimulated(when);
      simHint('Jumped to ' + fmtClockish(when) + '.');
    });
  });

  document.querySelectorAll('.sim-chips [data-step]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mins = Number(btn.getAttribute('data-step'));
      var base = clock.now();
      setSimulated(new Date(base.getTime() + mins * 60000));
    });
  });

  $('#simRefireBtn').addEventListener('click', function () {
    U.reminders.refire();
    simHint('Reminder memory cleared — they can fire again at the same time ✅');
  });

  /* ---------------- init ---------------- */

  renderSchedule();

  // First run: an empty table should open as a form rather than as a column
  // of "Add course" placeholders.
  setEditing(U.ROWS.every(function (row) {
    return !rowValue(row.key, 'course') && !rowValue(row.key, 'room');
  }));

  /* Subscribing is the whole of init for the live parts: 'day' and 'minute'
     both run their function once immediately, so this is also the first
     render. There is no polling timer here and no visibility listener — the
     clock owns both, and it is the only thing that wakes up on its own.
     (reminders.js made its own subscriptions when it loaded, before us.) */
  refreshReminderUI();
  clock.subscribe('time', onTime);
  clock.subscribe('day', onDay);
  clock.subscribe('minute', onMinute);
})();
