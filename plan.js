/* ============================================================
 * plan.js — when to do the homework, worked out from the calendar.
 *
 * Pure logic, no DOM. Runs in the browser AND in Node (for tests),
 * exactly like calendar.js and reminders.js.
 *
 * What it decides
 * ---------------
 * Given the tasks from the to-do list, the student's homework hours and
 * the class schedule, it says which day (or days) each assignment is
 * recommended to be done — and hands back the tasks due on each day too,
 * so a calendar can show both in one pass.
 *
 * The inputs it uses, and why
 * ---------------------------
 *   · what class the task is due for  → so work lands on a day that class
 *                                       meets, when it can
 *   · when it's due                   → nothing is placed after the deadline,
 *                                       and a day early is preferred
 *   · whether that class day is A or B→ read from the same calendar.js the
 *                                       reminder page trusts
 *   · how much time you have each day → the config menu's per-weekday hours,
 *                                       shared out across every task
 *   · keywords in the task's name     → "study" needs an hour, "worksheet"
 *                                       twenty minutes (config-controlled)
 *   · the student's own estimate      → a task can carry a minutes value
 *                                       entered by hand, which beats any
 *                                       keyword guess
 *   · long assignments                → a project or essay is split into
 *                                       45-minute sittings on separate days
 *
 * Estimates and sessions
 * ----------------------
 *   estimateMinutes() prefers the student's own number when the task has
 *   one; otherwise it finds the longest/highest-paying keyword in the task's
 *   name (and subject) and pays that; no keyword pays a default (30 min).
 *   splitSessions() then cuts the total into sittings of at most 45 minutes.
 *   A short task is one sitting; a "spread" task (project, essay, study…)
 *   is several, one per day, leading up to the due date.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS;
  if (!U || typeof U.statusFor !== 'function') {
    throw new Error('plan.js: calendar.js must load first');
  }

  /* One sitting is never longer than this. */
  var SESSION_MIN = 45;
  /* How far ahead a plan is worked out. Past this, tasks are left alone
     (the calendar can still show them due) until they come into range. */
  var HORIZON_DAYS = 45;

  /* JS getDay(): 0 = Sunday. */
  var WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var DEFAULT_HOURS = { mon: 1.5, tue: 1.5, wed: 1.5, thu: 1.5, fri: 1, sat: 2, sun: 2 };
  var DEFAULT_MINUTES = 30;

  /* The starting keyword table. Every entry is editable from the config
     menu; these are only what a fresh planner opens with. */
  var DEFAULT_KEYWORDS = [
    { word: 'project', minutes: 120, spread: true },
    { word: 'essay', minutes: 90, spread: true },
    { word: 'presentation', minutes: 60, spread: true },
    { word: 'report', minutes: 60, spread: true },
    { word: 'study', minutes: 60, spread: true },
    { word: 'test', minutes: 60, spread: true },
    { word: 'quiz', minutes: 45, spread: true },
    { word: 'lab', minutes: 45, spread: false },
    { word: 'slides', minutes: 40, spread: false },
    { word: 'reading', minutes: 30, spread: false },
    { word: 'packet', minutes: 30, spread: false },
    { word: 'worksheet', minutes: 20, spread: false },
    { word: 'homework', minutes: 30, spread: false }
  ];

  /* ---------------- dates ---------------- */

  function midnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  function daysBetween(a, b) {
    return Math.round((midnight(b) - midnight(a)) / 86400000);
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function weekdayKey(date) { return WEEKDAY_KEYS[date.getDay()]; }

  function parseKey(key) {
    var p = String(key).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function keyOf(date) { return U.dateKey(date); }

  /* ---------------- estimates ---------------- */

  /* How long a task is expected to take.

     The student's own estimate — a positive `override` entered with the task
     — is the answer when there is one; a keyword is only ever the planner's
     guess, so it never overrules what the student said. A task that still
     reads like a spread kind of job (its name matches a spread keyword) keeps
     that habit, so a hand-typed hour of "study" is still spaced out.

     Without an override: the single keyword that pays the most for this
     task's name + subject wins; when two pay the same, the longer word is
     the more specific one; no keyword pays the default. */
  function estimateMinutes(name, subject, keywords, fallback, override) {
    var hay = (String(name == null ? '' : name) + ' ' + String(subject == null ? '' : subject)).toLowerCase();
    var list = Array.isArray(keywords) && keywords.length ? keywords : DEFAULT_KEYWORDS;
    var best = null;
    list.forEach(function (kw) {
      var word = String(kw && kw.word == null ? '' : kw.word).toLowerCase().trim();
      if (!word || hay.indexOf(word) === -1) return;
      var minutes = Number(kw.minutes) > 0 ? Math.round(Number(kw.minutes)) : DEFAULT_MINUTES;
      if (!best || minutes > best.minutes || (minutes === best.minutes && word.length > String(best.word).length)) {
        best = { word: kw.word, minutes: minutes, spread: !!kw.spread };
      }
    });
    var own = Number(override);
    if (isFinite(own) && own > 0) {
      return {
        word: best ? best.word : null,
        minutes: Math.round(own),
        spread: best ? best.spread : false,
        custom: true
      };
    }
    if (best) return best;
    var d = Number(fallback) > 0 ? Math.round(Number(fallback)) : DEFAULT_MINUTES;
    return { word: null, minutes: d, spread: false };
  }

  /* Cut a total into sittings of at most SESSION_MIN, as even as they go.
       worksheet 20, single  → [20]
       study 60, spread      → [30, 30]
       project 120, spread   → [40, 40, 40]
       essay 90, spread      → [45, 45]
     A non-spread task whose total still runs past SESSION_MIN is split too —
     nobody wants one 90-minute sitting. */
  function splitSessions(total, spread) {
    total = Math.max(5, Math.round(total));
    if (!spread && total <= SESSION_MIN) return [total];
    var n = Math.max(1, Math.ceil(total / SESSION_MIN));
    var base = Math.floor(total / n);
    var rem = total - base * n;
    var out = [];
    for (var i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  /* Which A/B days the given course meets on, read from the same schedule
     the reminder page writes. {} when the course isn't in the schedule. */
  function classDaysFor(subject, schedule) {
    var out = { A: false, B: false };
    var want = String(subject == null ? '' : subject).trim().toLowerCase();
    if (!want || !schedule) return out;
    (U.ROWS || []).forEach(function (row) {
      var entry = schedule[row.key];
      var course = entry && entry.course ? String(entry.course).trim().toLowerCase() : '';
      if (course && course === want) out[row.day] = true;
    });
    return out;
  }

  /* ---------------- config ---------------- */

  function normalizeConfig(config) {
    config = config || {};
    var hours = {};
    WEEKDAY_KEYS.forEach(function (k) {
      var v = config.hours ? Number(config.hours[k]) : NaN;
      hours[k] = isFinite(v) && v >= 0 ? v : (DEFAULT_HOURS[k] || 0);
    });
    var keywords = Array.isArray(config.keywords) && config.keywords.length
      ? config.keywords : DEFAULT_KEYWORDS;
    return {
      hours: hours,
      keywords: keywords,
      defaultMinutes: Number(config.defaultMinutes) > 0 ? Number(config.defaultMinutes) : DEFAULT_MINUTES
    };
  }

  /* ---------------- choosing a day ---------------- */

  /* The best unused day in [start, end] with room for this sitting.
     Class days win; then a spread task leans early (start it soon) and a
     one-off leans late (do it close to when it's due). Everything after
     ctx.preferredEnd — normally the day before the deadline — is a last
     resort, so work is preferred a day early whenever there is room. */
  function pickDay(ctx) {
    var total = Math.max(1, daysBetween(ctx.start, ctx.end));
    var best = null;
    var d = new Date(ctx.start);
    while (d <= ctx.end) {
      var k = keyOf(d);
      if (!ctx.used[k] && (ctx.capacity[k] || 0) >= ctx.need) {
        var status = U.statusFor(d);
        var onClass = !!(status.type && ctx.classDays[status.type]);
        var progress = daysBetween(ctx.start, d) / total;
        var score = 0;
        if (onClass) score += 100;
        if (ctx.spread) score += Math.round((1 - progress) * 60);
        else score += Math.round(progress * 60);
        if (sameDay(d, ctx.end) && total > 0) score -= 20;   // the deadline is plan B
        if (ctx.important && !ctx.spread) score += Math.round(progress * 10);
        /* Prefer to be done a day ahead: a day past the preferred end loses
           to every day up to it, however well that day's class fits. */
        if (ctx.preferredEnd && daysBetween(ctx.preferredEnd, d) > 0) score -= 1000;
        if (!best || score > best.score) {
          best = { date: new Date(d), score: score, onClass: onClass };
        }
      }
      d = addDays(d, 1);
    }
    return best;
  }

  function reasonFor(subject, chosen, due, onClass, spread, late) {
    if (onClass) return 'you have ' + (subject || 'that class') + ' that day';
    if (late && sameDay(chosen, due)) return 'overdue — clear it now';
    if (sameDay(chosen, due)) return 'it is due that day';
    if (!late && sameDay(chosen, addDays(due, -1))) return 'done a day ahead of the deadline';
    if (spread) return 'an early sitting keeps it light';
    return 'free time before it is due';
  }

  /* ---------------- the plan ---------------- */

  function buildPlan(opts) {
    opts = opts || {};
    var today = midnight(opts.today || new Date());
    var horizonDays = Number(opts.horizonDays) > 0 ? Number(opts.horizonDays) : HORIZON_DAYS;
    var config = normalizeConfig(opts.config);
    var schedule = opts.schedule || {};
    var horizonEnd = addDays(today, horizonDays);

    var tasks = (opts.tasks || []).filter(function (t) {
      return t && !t.done && t.due && !isNaN(parseKey(t.due).getTime());
    });

    /* Free minutes per day, from the configured hours. */
    var capacity = {};
    for (var d = new Date(today); d <= horizonEnd; d = addDays(d, 1)) {
      var hours = Number(config.hours[weekdayKey(d)]);
      capacity[keyOf(d)] = isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 0;
    }

    /* Soonest deadline first; an overdue task jumps the queue; a starred
       task wins a tie. */
    var ordered = tasks.slice().sort(function (a, b) {
      var ad = parseKey(a.due), bd = parseKey(b.due);
      var al = ad < today, bl = bd < today;
      if (al !== bl) return al ? -1 : 1;
      if (ad - bd !== 0) return ad - bd;
      return (b.important ? 1 : 0) - (a.important ? 1 : 0);
    });

    var byDate = {};
    function bucket(date) {
      var k = keyOf(date);
      if (!byDate[k]) byDate[k] = { dueTasks: [], work: [] };
      return byDate[k];
    }

    /* Every deadline lands on its own day first, so the calendar can show
       what is due even if nothing could be scheduled for it. */
    ordered.forEach(function (task) {
      var due = parseKey(task.due);
      bucket(due).dueTasks.push({
        id: task.id,
        name: task.name,
        subject: task.subject || '',
        time: task.time || '',
        important: !!task.important,
        late: due < today
      });
    });

    var planned = [];
    var unscheduled = [];

    ordered.forEach(function (task) {
      var due = parseKey(task.due);
      var late = due < today;
      var est = estimateMinutes(task.name, task.subject, config.keywords, config.defaultMinutes, task.minutes);
      var sizes = splitSessions(est.minutes, est.spread);
      var classDays = classDaysFor(task.subject, schedule);

      /* Nothing is recommended after the deadline; an overdue task is
         worked out from today. Work is preferred a day early, so the day
         before the deadline is the last day we *want* to use and the
         deadline itself is kept open only as a fallback. */
      var workEnd = late ? today : due;
      var preferredEnd = late ? today : addDays(due, -1);
      if (preferredEnd > workEnd) preferredEnd = workEnd;
      var start = today;
      if (est.spread) {
        /* Spread tasks get a window a few days per sitting, so they start
           soon and land on separate days instead of all on the last night. */
        start = addDays(preferredEnd, -(sizes.length * 3 - 1));
        if (start < today) start = today;
      }

      var used = {};
      var sessions = [];
      for (var i = 0; i < sizes.length; i++) {
        var pick = pickDay({
          start: start,
          end: workEnd,
          preferredEnd: preferredEnd,
          need: sizes[i],
          classDays: classDays,
          spread: est.spread,
          important: !!task.important,
          capacity: capacity,
          used: used
        });
        if (!pick) break;
        used[keyOf(pick.date)] = true;
        capacity[keyOf(pick.date)] = Math.max(0, (capacity[keyOf(pick.date)] || 0) - sizes[i]);
        sessions.push({
          date: keyOf(pick.date),
          minutes: sizes[i],
          reason: reasonFor(task.subject || '', pick.date, due, pick.onClass, est.spread, late)
        });
      }

      if (sessions.length) {
        sessions.forEach(function (s) {
          bucket(parseKey(s.date)).work.push({
            id: task.id,
            name: task.name,
            subject: task.subject || '',
            minutes: s.minutes,
            reason: s.reason,
            custom: !!est.custom
          });
        });
        planned.push({
          id: task.id,
          name: task.name,
          subject: task.subject || '',
          due: task.due,
          late: late,
          minutes: est.minutes,
          keyword: est.word,
          spread: est.spread,
          custom: !!est.custom,
          partial: sessions.length < sizes.length,
          sessions: sessions
        });
      } else {
        unscheduled.push({
          id: task.id,
          name: task.name,
          subject: task.subject || '',
          due: task.due,
          minutes: est.minutes,
          keyword: est.word,
          custom: !!est.custom
        });
      }
    });

    return {
      today: keyOf(today),
      horizonEnd: keyOf(horizonEnd),
      byDate: byDate,
      planned: planned,
      unscheduled: unscheduled
    };
  }

  U.plan = {
    SESSION_MIN: SESSION_MIN,
    HORIZON_DAYS: HORIZON_DAYS,
    WEEKDAY_KEYS: WEEKDAY_KEYS,
    WEEKDAY_LABELS: WEEKDAY_LABELS,
    DEFAULT_HOURS: DEFAULT_HOURS,
    DEFAULT_KEYWORDS: DEFAULT_KEYWORDS,
    DEFAULT_MINUTES: DEFAULT_MINUTES,
    midnight: midnight,
    addDays: addDays,
    daysBetween: daysBetween,
    sameDay: sameDay,
    weekdayKey: weekdayKey,
    parseKey: parseKey,
    keyOf: keyOf,
    estimateMinutes: estimateMinutes,
    splitSessions: splitSessions,
    classDaysFor: classDaysFor,
    normalizeConfig: normalizeConfig,
    buildPlan: buildPlan
  };
})();
