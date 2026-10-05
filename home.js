/* ============================================================
 * home.js — the landing page's glue.
 *
 * The page itself is the work: the tiles are plain markup, and the only
 * live parts are the day strip and the reminder pill. Both read the same
 * sources the class reminder page reads — day.js for what today is,
 * reminders.js for whether heads-ups will fire — so the home page and the
 * reminder page cannot disagree about either fact.
 *
 * Cost
 * ----
 * No timers of its own. The clock is the only thing that wakes up on this
 * page (the sky is the other mover, and it is the same one sky every page
 * of the site shares). The day strip is rewritten only when the date
 * changes — a tab left open over midnight gets a fresh verdict, and
 * nothing else here runs at all.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS;
  if (!U.day || !U.reminders) throw new Error('home.js: day.js and reminders.js must load first');

  var $ = function (sel) { return document.querySelector(sel); };

  /* Writes only when the value actually differs, so a re-run never churns
     the DOM or a screen reader. */
  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  /* ---------------- the day strip ---------------- */

  function renderDayStrip(now) {
    var badge = $('#dayBadge');
    var title = $('#dayTitle');
    var sub = $('#daySub');
    if (!badge || !title || !sub) return;

    var s = U.day.daySummary(now);
    var status = s.status;

    // The strip's badge is a twin of the day card's: letter for a school
    // day, the day's emoji otherwise. The day off's emoji sits a little
    // smaller, exactly as the day card's own .off badge does.
    badge.classList.remove('typeB', 'off');
    if (s.isSchoolDay && s.type) {
      setText(badge, s.type);
      if (s.type === 'B') badge.classList.add('typeB');
      setText(title, 'Today is ' + (s.type === 'A' ? 'an' : 'a') + ' ' + s.type + '-Day');
    } else {
      badge.classList.add('off');
      setText(badge, s.emoji);
      setText(title, s.isSchoolDay ? s.title : 'No school — ' + (status.reason === 'Weekend' ? 'it\u2019s the weekend' : s.title));
    }

    setText(sub, U.day.longDate(now));
  }

  /* ---------------- the reminder line ---------------- */

  /* The home page states the fact, in one line: whether heads-ups will
     fire. It never offers the ask here — that control belongs on the
     class reminder page, and a second one here would be two controls to
     keep agreeing. */
  function renderReminderLine() {
    var pill = $('#reminderPill');
    var text = $('#reminderLineText');
    if (!pill || !text) return;

    var st = U.reminders.status();

    pill.classList.toggle('on', st.permission === 'granted');
    if (st.permission === 'granted') {
      pill.textContent = 'on';
      text.textContent = 'class heads-ups will pop up on any page of this site';
    } else if (st.permission === 'denied') {
      pill.textContent = 'blocked';
      text.textContent = 'allow notifications in your browser\u2019s site settings to get class heads-ups';
    } else if (st.cannotAskBecause) {
      pill.textContent = 'in-page';
      text.textContent = 'on-screen class heads-ups are on; this browser can\u2019t send desktop ones from here';
    } else {
      pill.textContent = 'off';
      text.textContent = 'class heads-ups are standing by — turn them on from the class reminder page';
    }
  }

  /* ---------------- boot ---------------- */

  renderReminderLine();
  U.reminders.onChange(renderReminderLine);

  /* 'day' and 'minute' both run once on subscribe, so this is also the
     first render. Only the strip is on 'day' — nothing on this page is
     minute-resolution, so the minute subscription costs one immediate
     render and nothing after that (the engine diffs its own writes). */
  U.clock.subscribe('minute', renderDayStrip);

})();
