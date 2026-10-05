/* ============================================================
 * day.js — how every page on this site says what today is.
 *
 * One summary, one voice. The day card on the class reminder page and the
 * day strip on the home page both ask this file what today is, so the two
 * pages can never hold different opinions about the same day — which is
 * exactly the class of bug this project exists to prevent. The emoji map
 * and the wording live in one place, not in two files that drift.
 *
 * Pure logic: it reads the calendar and formats, and never touches the
 * DOM. That keeps it usable from any page, testable in Node, and free of
 * opinions about where its words end up.
 *
 * Load after calendar.js; everything else is self-contained.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS;

  var SCHOOL_START = new Date(2026, 8, 3); // first day of the 2026-27 year

  /* The next September 3 that hasn't happened yet. calendar.js only knows one
     school year, so this extrapolates — but it beats copy that would say
     "see you September 3, 2026" forever after that date passed. */
  function nextSchoolStart(now) {
    var d = new Date(SCHOOL_START.getTime());
    while (d <= now) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  function longDate(date) {
    return date.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  function shortDate(date) {
    return date.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  }

  function monthDay(date) {
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  /* "Fri, Sep 4 · A-Day · day #1". The very first day of the year has no
     A/B letter at all, so that one case has to be said differently —
     otherwise this renders "null-Day · day #null". */
  function nextSchoolFact(next) {
    var when = shortDate(next.date);
    if (!next.type) return when + ' · first day of school';
    return when + ' · ' + next.type + '-Day · day #' + next.dayNumber;
  }

  /* One summary per day, with the three facts any page would name — the
     emoji, the short verdict, and the follow-up line. A day off is stated
     as exactly that: isSchoolDay false, and the reason says why. */
  function daySummary(date) {
    var status = U.statusFor(date);
    var out = {
      status: status,
      emoji: '',
      title: '',
      isSchoolDay: status.isSchoolDay,
      type: status.isSchoolDay ? status.type : null,
      early: !!status.early
    };

    if (status.isSchoolDay && !status.type) {
      // Welcome Back day: school is in session but the A/B rotation hasn't started.
      out.emoji = '🎒';
      out.title = 'Welcome back';
    } else if (status.isSchoolDay) {
      out.emoji = status.type === 'A' ? '🍎' : '🫐';
      out.title = status.type + '-Day';
    } else if (status.reason === 'Weekend') {
      out.emoji = '😎';
      out.title = 'Weekend';
    } else if (status.reason === 'Outside the school year') {
      var beforeStart = date < SCHOOL_START;
      out.emoji = beforeStart ? '🌅' : '🌞';
      out.title = beforeStart ? 'School starts soon' : 'Summer break';
    } else {
      out.emoji = U.emojiFor(status.reason);
      out.title = status.reason;
    }
    return out;
  }

  U.day = {
    longDate: longDate,
    shortDate: shortDate,
    monthDay: monthDay,
    nextSchoolFact: nextSchoolFact,
    nextSchoolStart: nextSchoolStart,
    SCHOOL_START: SCHOOL_START,
    daySummary: daySummary
  };
})();
