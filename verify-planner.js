/* =====================================================================
 * verify-planner.js — smoke test for plan.js.
 *
 * The planner's page glue needs a browser, but the part that actually
 * decides when homework gets done is pure logic, exactly like
 * calendar.js. This loads it in Node and asserts the behaviour the
 * feature rests on:
 *
 *   · a task's keyword sets its estimate, and nothing matches → 30 min
 *   · a long task is cut into sittings of at most 45 minutes
 *   · a class's A/B day is read from the same schedule the reminder page uses
 *   · work lands on a day the class meets, and never after the deadline
 *   · work is preferred a day before the deadline, when there is room
 *   · a day is never handed more minutes than its configured hours
 *   · an overdue task is recommended for today
 *
 * Run: node verify-planner.js
 * ===================================================================== */
'use strict';

require('./calendar.js');
require('./plan.js');

var U = globalThis.UCVTS;
var P = U.plan;

var checks = 0, failed = 0;
function check(name, got, want) {
  checks++;
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? '  ✅' : '  ❌') + ' ' + name +
    (ok ? '' : '  →  got: ' + JSON.stringify(got) + ', want: ' + JSON.stringify(want)));
}

function at(iso) { return new Date(iso + 'T12:00:00'); }

/* A tiny schedule: Algebra 2 meets on B-days, so its A/B day is knowable. */
var schedule = {
  '1-2(A)': { course: 'Fitness 1' },
  '3-4(A)': { course: 'English' },
  '3-4(B)': { course: 'Algebra 2' }
};

var config = {
  hours: { mon: 1.5, tue: 1.5, wed: 1.5, thu: 1.5, fri: 1, sat: 2, sun: 2 },
  keywords: P.DEFAULT_KEYWORDS,
  defaultMinutes: 30
};

/* ---------------- estimates ---------------- */

console.log('\n🧮 keyword estimates');

check('a worksheet is 20 minutes', P.estimateMinutes('Worksheet 2', 'Algebra 2').minutes, 20);
check('a packet is 30 minutes', P.estimateMinutes('Chapter 4 packet', 'English').minutes, 30);
check('study pays an hour', P.estimateMinutes('Study for the quiz', 'Algebra 2').minutes, 60);
check('no keyword falls back to the default', P.estimateMinutes('Read chapter 5', 'English').minutes, 30);
check('the longest matching word wins a tie',
  P.estimateMinutes('Study for the test', 'Algebra 2').word, 'study');
check('a keyword in the subject counts too',
  P.estimateMinutes('Finish it', 'Study Hall').minutes, 60);

/* ---------------- sittings ---------------- */

console.log('\n✂️  cutting a task into sittings');

check('a 20-minute task is one sitting of 20', P.splitSessions(20, false), [20]);
check('an hour of study is two sittings of 30', P.splitSessions(60, true), [30, 30]);
check('a 2-hour project is three sittings of 40', P.splitSessions(120, true), [40, 40, 40]);
check('a 90-minute total splits 45/45 even without the spread flag',
  P.splitSessions(90, false), [45, 45]);
check('exactly 45 stays one sitting', P.splitSessions(45, false), [45]);
check('every sitting is at most 45 minutes',
  P.splitSessions(200, true).every(function (m) { return m <= 45; }), true);

/* ---------------- class days ---------------- */

console.log('\n🍎🍐 A/B class days');

check('Algebra 2 is a B-day class',
  P.classDaysFor('Algebra 2', schedule), { A: false, B: true });
check('English is an A-day class',
  P.classDaysFor('English', schedule), { A: true, B: false });
check('a course not in the schedule matches nothing',
  P.classDaysFor('Underwater Basket Weaving', schedule), { A: false, B: false });

/* ---------------- the plan itself ---------------- */

console.log('\n📅 the recommendations');

/* Monday, Sept 14 2026 is a B-day (Sept 4 was A, and the rotation runs
   through school days only). */
var today = at('2026-09-14');

function plan(tasks, cfg, day) {
  return P.buildPlan({
    tasks: tasks,
    config: cfg || config,
    schedule: schedule,
    today: day || today,
    horizonDays: 30
  });
}

var study = {
  id: 't1', name: 'Study for Alg 2 test', subject: 'Algebra 2', due: '2026-09-18',
  done: false, important: false
};
var p1 = plan([study]);
var planned1 = p1.planned.filter(function (x) { return x.id === 't1'; })[0];

check('the study task is planned', !!planned1, true);
check('it is estimated at an hour', planned1.minutes, 60);
check('it becomes two sittings', planned1.sessions.length, 2);
check('the sittings are on separate days',
  planned1.sessions[0].date !== planned1.sessions[1].date, true);
check('both sittings land on days the class meets',
  planned1.sessions.every(function (s) { return U.statusFor(P.parseKey(s.date)).type === 'B'; }),
  true);
check('nothing is recommended after the deadline',
  planned1.sessions.every(function (s) { return P.parseKey(s.date) <= P.parseKey('2026-09-18'); }),
  true);
check('a session that lands on a class day says why',
  planned1.sessions[0].reason.indexOf('Algebra 2') !== -1, true);

/* A short task due Thursday, in a B-day class: it should prefer the B-day
   in the window (Wednesday the 16th) over the deadline itself — which is
   also what "a day early" asks for. */
var sheet = {
  id: 't2', name: 'Worksheet 2', subject: 'Algebra 2', due: '2026-09-17',
  done: false, important: false
};
var p2 = plan([sheet]);
var planned2 = p2.planned[0];
check('the worksheet is one sitting', planned2.sessions.length, 1);
check('and it is 20 minutes', planned2.sessions[0].minutes, 20);
check('it prefers the class day before the deadline',
  planned2.sessions[0].date, '2026-09-16');

/* The deadline is still shown even when nothing could be scheduled. */
check('the due task appears on its deadline',
  p2.byDate['2026-09-17'].dueTasks.map(function (t) { return t.id; }), ['t2']);

/* ---------------- a day early ---------------- */

console.log('\n⏪  preferring a day early');

/* Friday Sept 18 is a B-day, so Algebra 2 meets on the deadline itself.
   A worksheet that *could* sit on that class day should still be picked
   up earlier, because being done a day ahead is preferred. */
var friSheet = {
  id: 't5', name: 'Worksheet 5', subject: 'Algebra 2', due: '2026-09-18',
  done: false, important: false
};
var pEarly = plan([friSheet]);
check('a short task is not left on its class-day deadline',
  pEarly.planned[0].sessions[0].date, '2026-09-16');

/* A task with no class day (no subject) has nothing but the deadline to
   gravitate to, and still prefers the day before it. */
var plain = {
  id: 't6', name: 'Homework 6', subject: '', due: '2026-09-17',
  done: false, important: false
};
var pPlain = plan([plain]);
check('a task with no class day lands the day before it is due',
  pPlain.planned[0].sessions[0].date, '2026-09-16');
check('and says why', pPlain.planned[0].sessions[0].reason,
  'done a day ahead of the deadline');

/* The deadline is still a fallback: with room only on the due date, the
   work goes there rather than nowhere. */
var thuOnly = {
  hours: { mon: 0, tue: 0, wed: 0, thu: 2, fri: 0, sat: 0, sun: 0 },
  keywords: P.DEFAULT_KEYWORDS, defaultMinutes: 30
};
var pFallback = plan([plain], thuOnly);
check('with no earlier room, the deadline is used',
  pFallback.planned[0].sessions[0].date, '2026-09-17');

/* Nothing about the spread study task should spill onto its deadline either. */
check('no sitting of a spread task lands on its deadline',
  planned1.sessions.every(function (s) { return P.parseKey(s.date) <= P.parseKey('2026-09-17'); }),
  true);

/* ---------------- capacity ---------------- */

console.log('\n⏳ daily capacity');

var long1 = { id: 'a', name: 'Project one', subject: 'Algebra 2', due: '2026-09-18', done: false, important: false };
var long2 = { id: 'b', name: 'Project two', subject: 'English', due: '2026-09-18', done: false, important: false };
var thin = { hours: { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 }, keywords: P.DEFAULT_KEYWORDS, defaultMinutes: 30 };
var p3 = plan([long1, long2], thin);

var perDay = {};
p3.planned.forEach(function (task) {
  task.sessions.forEach(function (s) {
    perDay[s.date] = (perDay[s.date] || 0) + s.minutes;
  });
});
check('no day is handed more minutes than it has hours',
  Object.keys(perDay).every(function (k) { return perDay[k] <= 60; }), true);
check('two projects still get their sittings',
  p3.planned.length, 2);

/* ---------------- overdue & no capacity ---------------- */

console.log('\n⏰ edge cases');

var late = { id: 't3', name: 'Late essay', subject: 'English', due: '2026-09-10', done: false, important: false };
var p4 = plan([late]);
check('an overdue task is flagged late', p4.planned[0].late, true);
check('and recommended for today',
  p4.planned[0].sessions[0].date, '2026-09-14');

var zeroHours = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
var none = plan([study, sheet], { hours: zeroHours, keywords: [], defaultMinutes: 30 });
check('with no hours configured, nothing is scheduled', none.planned.length, 0);
check('but the deadlines still show',
  [!!none.byDate['2026-09-18'], !!none.byDate['2026-09-17']], [true, true]);

var done1 = { id: 't4', name: 'Already finished', subject: 'English', due: '2026-09-15', done: true, important: false };
check('a finished task is left out', plan([done1]).planned.length, 0);

/* ---------------- config ---------------- */

console.log('\n⚙️  config defaults');

var norm = P.normalizeConfig({});
check('missing hours fall back to the defaults', norm.hours.mon, P.DEFAULT_HOURS.mon);
check('missing keywords fall back to the defaults',
  norm.keywords.length, P.DEFAULT_KEYWORDS.length);
check('a missing defaultMinutes falls back to 30', norm.defaultMinutes, 30);

/* ---------------- done ---------------- */

console.log('\n' + (failed ? '❌ ' + failed + ' of ' : '🎉 All ') + checks +
  ' planner checks ' + (failed ? 'failed' : 'passed') + '!');
process.exit(failed ? 1 : 0);
