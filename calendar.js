/* =====================================================================
 * calendar.js — UCVTS 2026–2027 school-year facts & A/B-day logic
 * ---------------------------------------------------------------------
 * Pure logic, no DOM. Works in the browser AND in Node (for tests).
 * Data source: APPROVEDUCVTS2026-2027DistrictCalendar.pdf (in this folder).
 *
 * How A/B days work here:
 *   School days are counted from ROTATION_START. That day is an A-Day,
 *   the next is a B-Day, the one after an A-Day… and so on. Days when
 *   school is closed (weekends, holidays, recess…) do NOT advance the
 *   count, so the letter continues correctly after every break.
 *
 *   The first day of school (Sept 3) is a Welcome Back day: students
 *   attend, but it carries no A/B letter — the rotation starts the
 *   next day (Sept 4 = day #1 = A-Day).
 *
 *   If your school happens to start on a B-Day instead, flip
 *   FIRST_DAY_TYPE below to 'B'.
 *
 *   If the district adds an emergency closure beyond the ones below,
 *   just add its date to CLOSED_DAYS and everything recalculates.
 * ===================================================================== */

(function () {
  'use strict';

  /* ------------------------- calendar data ------------------------- */

  // Every date students are out of school (per the PDF), with a friendly reason.
  var CLOSED_DAYS = {
    '2026-09-01': 'Staff Development Day',
    '2026-09-02': 'Staff Development Day',
    '2026-09-07': 'Labor Day',
    '2026-09-21': 'Yom Kippur',
    '2026-11-05': 'NJEA Convention',
    '2026-11-06': 'NJEA Convention',
    '2026-11-26': 'Thanksgiving',
    '2026-11-27': 'Thanksgiving Holiday',
    '2026-12-24': 'Winter Recess',
    '2026-12-25': 'Winter Recess',
    '2026-12-28': 'Winter Recess',
    '2026-12-29': 'Winter Recess',
    '2026-12-30': 'Winter Recess',
    '2026-12-31': 'Winter Recess',
    '2027-01-01': 'New Year',
    '2027-01-18': 'Martin Luther King Jr. Day',
    '2027-02-12': 'Staff Development Day',
    '2027-02-15': "Presidents' Day",
    '2027-03-10': 'Eid Al-Fitr',
    '2027-03-26': 'Spring Recess',
    '2027-03-29': 'Spring Recess',
    '2027-03-30': 'Spring Recess',
    '2027-03-31': 'Spring Recess',
    '2027-04-01': 'Spring Recess',
    '2027-04-02': 'Spring Recess',
    '2027-05-31': 'Memorial Day',
    '2027-06-18': 'Staff Development Day',
    '2027-06-21': 'Staff Development Day'
  };

  // Half days (12:24 P.M. dismissal) — school IS in session, so the
  // A/B count still advances, but afternoon blocks don't run.
  // 6/17/2027 is also the last day for students (graduation).
  var EARLY_DISMISSAL = {
    '2026-11-25': true,
    '2026-12-23': true,
    '2027-03-25': true,
    '2027-06-17': true
  };

  var FIRST_SCHOOL_DAY = { y: 2026, m: 9, d: 3 };
  // Last student day is 6/17/2027 (12:24 dismissal + graduation). 6/18 is
  // Staff Development #4 (closed to students) — see CLOSED_DAYS.
  var LAST_SCHOOL_DAY = { y: 2027, m: 6, d: 17 };
  // The A/B rotation starts Sept 4: that's day #1 = A-Day. Sept 3 is the
  // Welcome Back first day — school is in session, but no A/B letter.
  var ROTATION_START = { y: 2026, m: 9, d: 4 };
  var FIRST_DAY_TYPE = 'A'; // Rotation day #1 = A-Day. Flip to 'B' if needed.
  var TOTAL_STUDENT_DAYS = 182; // printed on the calendar — used as a sanity check

  // Bell schedule — period: [startMin, endMin], minutes from midnight.
  // 1 8:00–8:40 | 2 8:40–9:23 | 3 9:27–10:07 | 4 10:07–10:50 | 5 10:53–11:23
  // 6 11:23–11:57 | 7 12:00–12:40 | 8 12:40–1:23 | 9 1:27–2:00 | 10 2:07–2:50
  var PERIODS = {
    1: [480, 520], 2: [520, 563], 3: [567, 607], 4: [607, 650],
    5: [653, 683], 6: [683, 717], 7: [720, 760], 8: [760, 803],
    9: [807, 840], 10: [847, 890]
  };

  var DISMISSAL_NORMAL = 890; // 2:50 PM
  var DISMISSAL_EARLY = 744;  // 12:24 PM

  // The 8 rows of the schedule table. Each class spans two periods.
  var ROW_ORDER = [
    { day: 'A', period: '1-2' },
    { day: 'A', period: '3-4' },
    { day: 'A', period: '7-8' },
    { day: 'A', period: '9-10' },
    { day: 'B', period: '1-2' },
    { day: 'B', period: '3-4' },
    { day: 'B', period: '7-8' },
    { day: 'B', period: '9-10' }
  ];

  // Periods 5-6 (10:53-11:57) are lunch & co-curricular for everyone —
  // not a row in the schedule table, but part of every school day's timeline.
  var LUNCH_BLOCK = {
    key: '5-6',
    day: null,
    period: '5-6',
    start: PERIODS[5][0],
    end: PERIODS[6][1],
    lunch: true
  };

  /* --------------------------- helpers ------------------------------ */

  function makeDate(ymd) {
    return new Date(ymd.y, ymd.m - 1, ymd.d);
  }

  function dateKey(date) {
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function isWeekend(date) {
    var dow = date.getDay();
    return dow === 0 || dow === 6;
  }

  function periodPair(period) {
    var parts = period.split('-');
    return [Number(parts[0]), Number(parts[1])];
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // 563 -> "9:23 AM"
  function fmtTime(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    var ampm = h >= 12 ? 'PM' : 'AM';
    var hh = h % 12 === 0 ? 12 : h % 12;
    return hh + ':' + pad(m) + ' ' + ampm;
  }

  /* ----------------------- build school days ------------------------ */

  var schoolDayDates = [];   // every in-session date, in order
  var dayNumberByKey = {};   // 'YYYY-MM-DD' -> 1-based school day #
  var typeByKey = {};        // 'YYYY-MM-DD' -> 'A' | 'B'

  (function build() {
    var start = makeDate(FIRST_SCHOOL_DAY);
    var end = makeDate(LAST_SCHOOL_DAY);
    var rotationStart = makeDate(ROTATION_START);
    var cursor = start;
    while (cursor <= end) {
      if (!isWeekend(cursor) && !CLOSED_DAYS[dateKey(cursor)]) {
        schoolDayDates.push(new Date(cursor));
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    var n = 0; // A/B day counter — begins at ROTATION_START
    for (var i = 0; i < schoolDayDates.length; i++) {
      var key = dateKey(schoolDayDates[i]);
      if (schoolDayDates[i] < rotationStart) {
        // Welcome Back day: in session, but no letter and no day number.
        dayNumberByKey[key] = null;
        typeByKey[key] = null;
        continue;
      }
      n++;
      dayNumberByKey[key] = n;
      var isEven = (n - 1) % 2 === 0; // day #1, #3, … are even-indexed here
      typeByKey[key] = FIRST_DAY_TYPE === 'A' ? (isEven ? 'A' : 'B') : (isEven ? 'B' : 'A');
    }
  })();

  /* --------------------------- public API --------------------------- */

  function statusFor(date) {
    var key = dateKey(date);
    var result = {
      date: date,
      isSchoolDay: false,
      type: null,
      dayNumber: null,
      early: false,
      dismissal: DISMISSAL_NORMAL,
      reason: null
    };

    var first = makeDate(FIRST_SCHOOL_DAY);
    var last = makeDate(LAST_SCHOOL_DAY);
    if (date < first || date > last) {
      result.reason = 'Outside the school year';
      return result;
    }
    if (isWeekend(date)) {
      result.reason = 'Weekend';
      return result;
    }
    if (CLOSED_DAYS[key]) {
      result.reason = CLOSED_DAYS[key];
      return result;
    }

    result.isSchoolDay = true;
    result.type = typeByKey[key];
    result.dayNumber = dayNumberByKey[key];
    result.early = !!EARLY_DISMISSAL[key];
    result.dismissal = result.early ? DISMISSAL_EARLY : DISMISSAL_NORMAL;
    return result;
  }

  function nextSchoolDay(fromDate) {
    var cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 1);
    for (var i = 0; i < schoolDayDates.length; i++) {
      if (schoolDayDates[i] >= cursor) {
        var key = dateKey(schoolDayDates[i]);
        return { date: schoolDayDates[i], type: typeByKey[key], dayNumber: dayNumberByKey[key] };
      }
    }
    return null;
  }

  // The 8 schedule rows, each with bell-derived start/end minutes.
  var ROWS = ROW_ORDER.map(function (row) {
    var pair = periodPair(row.period);
    var start = PERIODS[pair[0]][0];
    var end = PERIODS[pair[1]][1];
    return {
      key: row.period + '(' + row.day + ')',
      day: row.day,
      period: row.period,
      start: start,
      end: end
    };
  });

  // One emoji per day-off reason, shared by every page that names a day —
  // the reminder page's day card and the home page's day strip both read it
  // here, so the two can never disagree about what a closure looks like.
  var DAY_EMOJI = {
    'A': '🍎',
    'B': '🫐',
    'Staff Development Day': '📋',
    'Labor Day': '💪',
    'Yom Kippur': '🕯️',
    'NJEA Convention': '👋',
    'Thanksgiving': '🦃',
    'Thanksgiving Holiday': '🦃',
    'Winter Recess': '❄️',
    'New Year': '🎆',
    'Martin Luther King Jr. Day': '✊',
    "Presidents' Day": '🇺🇸',
    'Eid Al-Fitr': '🌙',
    'Spring Recess': '🌸',
    'Memorial Day': '🎖️',
    'Weekend': '😎'
  };

  function emojiFor(reason) {
    return DAY_EMOJI[reason] || '🎉';
  }

  var UCVTS = {
    CLOSED_DAYS: CLOSED_DAYS,
    EARLY_DISMISSAL: EARLY_DISMISSAL,
    FIRST_DAY_TYPE: FIRST_DAY_TYPE,
    TOTAL_STUDENT_DAYS: TOTAL_STUDENT_DAYS,
    DISMISSAL_NORMAL: DISMISSAL_NORMAL,
    DISMISSAL_EARLY: DISMISSAL_EARLY,
    ROWS: ROWS,
    LUNCH_BLOCK: LUNCH_BLOCK,
    schoolDayDates: schoolDayDates,
    dayNumberByKey: dayNumberByKey,
    typeByKey: typeByKey,
    DAY_EMOJI: DAY_EMOJI,
    emojiFor: emojiFor,
    fmtTime: fmtTime,
    statusFor: statusFor,
    nextSchoolDay: nextSchoolDay,
    dateKey: dateKey
  };

  globalThis.UCVTS = UCVTS;
})();
