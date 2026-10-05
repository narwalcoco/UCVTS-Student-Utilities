/* =====================================================================
 * verify-site.js — smoke test for the site-wide pieces.
 *
 * The browser pages can't be driven from Node, but the two files that
 * make the site one site — day.js (what today is) and reminders.js
 * (when a heads-up fires) — are pure logic, exactly like calendar.js.
 * This loads them with the smallest possible stub for the browser
 * globals they merely *touch* (clock.js's document/localStorage), and
 * asserts the behaviour the whole multi-page design rests on:
 *
 *   · day.js and the day card agree with calendar.js on every kind of day
 *   · the engine derives the same reminder moments the page used to
 *   · a due heads-up fires exactly once, and is remembered as fired
 *   · a school day's moments are empty when no classes are entered
 *
 * Run: node verify-site.js
 * ===================================================================== */
'use strict';

/* ---------------- browser stubs ---------------- */

var savedStore = {};          // stands in for localStorage
var firedWrites = [];         // every value written to the fired key

globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(savedStore, k) ? savedStore[k] : null; },
  setItem: function (k, v) { savedStore[k] = String(v); firedWrites.push([k, v]); },
  removeItem: function (k) { delete savedStore[k]; }
};
globalThis.document = {
  addEventListener: function () {},
  getElementById: function () { return null; }   // no #toasts -> toast stays silent
};
globalThis.location = { protocol: 'http:', search: '' };
/* Node ≥21 ships a real read-only `navigator`; replace it rather than assign. */
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

/* ---------------- load the real files ---------------- */

require('./calendar.js');
require('./day.js');
require('./clock.js');
require('./reminders.js');

var U = globalThis.UCVTS;

/* ---------------- tiny harness ---------------- */

var checks = 0, failed = 0;
function check(name, got, want) {
  checks++;
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? '  ✅' : '  ❌') + ' ' + name + (ok ? '' : '  →  got: ' + JSON.stringify(got) + ', want: ' + JSON.stringify(want)));
}

function at(iso) { return new Date(iso + 'T12:00:00'); }

/* ---------------- day.js: one voice for the day ---------------- */

console.log('\n🗓️  day.js summaries');

var monday = at('2026-09-07');   // Labor Day
var tuesday = at('2026-09-08');  // school day #2 = B (9/4 was A; 9/7 closed)
var wednesday = at('2026-09-09');// school day #3 = A
var saturday = at('2026-09-05'); // weekend
var summer = at('2027-07-15');   // outside the year

check('Labor Day is a day off with its own emoji',
  (function () { var s = U.day.daySummary(monday); return [s.isSchoolDay, s.emoji, s.title]; })(),
  [false, '💪', 'Labor Day']);

check('a B-Day says B with the blueberry',
  (function () { var s = U.day.daySummary(tuesday); return [s.isSchoolDay, s.type, s.emoji]; })(),
  [true, 'B', '🫐']);

check('a weekend is a day off, not an A/B day',
  (function () { var s = U.day.daySummary(saturday); return [s.isSchoolDay, s.type, s.title]; })(),
  [false, null, 'Weekend']);

check('July is outside the school year',
  (function () { var s = U.day.daySummary(summer); return [s.isSchoolDay, s.emoji]; })(),
  [false, '🌞']);

check('the summary never contradicts calendar.js',
  U.day.daySummary(tuesday).type === U.typeByKey['2026-09-08'] &&
  U.day.daySummary(monday).isSchoolDay === U.statusFor(monday).isSchoolDay,
  true);

/* ---------------- reminders.js: the moments ---------------- */

console.log('\n⏰ reminder moments (schedule as the page stores it)');

var schedule = {
  '1-2(A)': { course: 'Fitness 1', room: 'Gym' },
  '3-4(A)': { course: 'Alg 2', room: 'UCT 801' },
  '7-8(A)': { course: 'English', room: '204' },
  '9-10(A)': { course: 'Chemistry', room: '310' },
  '1-2(B)': { course: 'History', room: '115' },
  '3-4(B)': { course: '', room: '' },
  '7-8(B)': { course: 'Spanish', room: '122' },
  '9-10(B)': { course: 'Art', room: '40' }
};

var aStatus = U.statusFor(wednesday);   // an A-Day
var bStatus = U.statusFor(tuesday);     // a B-Day, one row left empty
var moments = U.reminders.momentsFor(aStatus, schedule);

check('an A-Day with lunch has 5 blocks (4 classes + lunch)',
  U.reminders.dayBlocks(aStatus).length, 5);

check('four classes with courses give 8 start moments + 2 end-of-day = 10',
  moments.length, 10);

check('the first moment is 10 minutes before the first class (7:50)',
  moments[0].at, 7 * 60 + 50);

check('the last moment is 5 minutes before the last class ends (2:45)',
  moments[moments.length - 1].at, 14 * 60 + 45);

check('the last-class moments are kind "last" and point at its END',
  moments.slice(-2).map(function (m) { return [m.kind, m.at]; }),
  [['last', 14 * 60 + 40], ['last', 14 * 60 + 45]]);

check('lunch moments exist and carry no course',
  moments.filter(function (m) { return m.kind === 'lunch'; }).map(function (m) { return m.at; }),
  [10 * 60 + 43, 10 * 60 + 48]);

check('a B-Day with one empty row has fewer moments than a full A-Day',
  U.reminders.momentsFor(bStatus, schedule).length, 8);

check('no courses entered -> only lunch announces (it has no course to read)',
  U.reminders.momentsFor(aStatus, {}).length, 2);

check('a half day trims away the afternoon blocks',
  U.reminders.dayBlocks(U.statusFor(at('2026-11-25'))).length, 3); // 1-2, 3-4, lunch

/* ---------------- reminders.js: firing exactly once ---------------- */

console.log('\n🔔 firing');

/* The engine reads the schedule from storage — the class reminder page is
   its writer, and there is no page here. Seed what that page would have
   saved, or the engine rightly sees a student with no classes. */
savedStore['ucvts.classpal.schedule.v1'] = JSON.stringify(schedule);

/* The spy is attached BEFORE the clock moves: a heads-up that fires while
   nobody is listening is exactly the "announced into the void" case the
   first run of this test caught in itself. */
var announcements = [];
U.reminders.setNotifier(function (emoji, title, body) { announcements.push([emoji, title, body]); });

/* Point the clock at 7:51 on the A-Day: inside the 10-minute window of the
   first class, outside every other. The engine subscribed to 'time', so
   this very call runs the check and (if due) fires. */
U.clock.setSimulated(new Date(2026, 8, 9, 7, 51, 0));

check('the 7:51 landing produced the first-class heads-up',
  announcements.length, 1);
check('it announced the right thing',
  announcements.length && [announcements[0][0], announcements[0][1].indexOf('Fitness 1') !== -1],
  ['🌅', true]);

/* Look again at the same minute: the engine re-runs check() on every clock
   move. Nothing new should be announced — the fired memory holds it. */
U.clock.setSimulated(new Date(2026, 8, 9, 7, 51, 30));
check('the same moment never fires twice', announcements.length, 1);

/* The fired memory must have been written to the shared key. */
check('the fired-set was committed to storage',
  firedWrites.some(function (w) { return w[0] === 'ucvts.classpal.fired.v1'; }),
  true);

/* Five minutes later, the 5-minute heads-up of the same class is due. */
U.clock.setSimulated(new Date(2026, 8, 9, 7, 55, 30));
check('the 5-minute heads-up of the same class still fires',
  announcements.length, 2);

/* Clearing the memory lets them fire again (the tester panel's refire). */
U.reminders.refire();
U.clock.setSimulated(new Date(2026, 8, 9, 7, 51, 0));
check('after refire, the same moment can fire again',
  announcements.length, 3);

/* And on a day off, nothing fires at all. */
U.clock.setSimulated(new Date(2026, 8, 7, 7, 51, 0));   // Labor Day
check('a closed day fires nothing', announcements.length, 3);

/* ---------------- done ---------------- */

console.log('\n' + (failed ? '❌ ' + failed + ' of ' : '🎉 All ') + checks + ' site checks ' + (failed ? 'failed' : 'passed') + '!');
process.exit(failed ? 1 : 0);
