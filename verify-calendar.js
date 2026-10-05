/* Node smoke test for calendar.js — run with: node verify-calendar.js */
'use strict';

require('./calendar.js');
var U = globalThis.UCVTS;

var failures = 0;
function check(label, actual, expected) {
  var ok = actual === expected || (Array.isArray(expected) && expected.indexOf(actual) !== -1);
  console.log((ok ? '  ✅ ' : '  ❌ ') + label + '  →  got: ' + JSON.stringify(actual));
  if (!ok) {
    console.log('       expected: ' + JSON.stringify(expected));
    failures++;
  }
}

var d = function (y, m, day) { return new Date(y, m - 1, day); };

console.log('\n📅 Calendar smoke test\n');

check('total school days', U.schoolDayDates.length, 182); // calendar prints 182 student days
check('first school day', U.dateKey(U.schoolDayDates[0]), '2026-09-03');
check('last school day', U.dateKey(U.schoolDayDates[U.schoolDayDates.length - 1]), '2027-06-17');

// Day parity — rotation starts Sept 4 (day #1 = A); Sept 3 is Welcome Back (no letter)
check('9/3/2026 in session', U.statusFor(d(2026, 9, 3)).isSchoolDay, true);
check('9/3/2026 no A/B letter', U.statusFor(d(2026, 9, 3)).type, null);
check('9/3/2026 no day number', U.statusFor(d(2026, 9, 3)).dayNumber, null);
check('9/4/2026 (day #1) is A', U.statusFor(d(2026, 9, 4)).type, 'A');
check('9/4/2026 day number', U.statusFor(d(2026, 9, 4)).dayNumber, 1);
check('9/8/2026 (day #2, after Labor Day) is B', U.statusFor(d(2026, 9, 8)).type, 'B');
check('9/9/2026 (day #3) is A again', U.statusFor(d(2026, 9, 9)).type, 'A');
check('11/24/2026 (day before Thanksgiving)', U.statusFor(d(2026, 11, 24)).type, ['A', 'B']);
check('11/25/2026 early-dismissal school day', U.statusFor(d(2026, 11, 25)).type, ['A', 'B']);
check('11/25/2026 flagged early', U.statusFor(d(2026, 11, 25)).early, true);

// Closed days — parity must NOT advance through them
check('9/7/2026 Labor Day closed', U.statusFor(d(2026, 9, 7)).isSchoolDay, false);
check('9/7/2026 reason', U.statusFor(d(2026, 9, 7)).reason, 'Labor Day');
check('11/26/2026 Thanksgiving closed', U.statusFor(d(2026, 11, 26)).isSchoolDay, false);
check('12/23/2026 is still a school day (early)', U.statusFor(d(2026, 12, 23)).isSchoolDay, true);
check('12/28/2026 winter recess closed', U.statusFor(d(2026, 12, 28)).isSchoolDay, false);
check('1/1/2027 closed', U.statusFor(d(2027, 1, 1)).isSchoolDay, false);
check('1/18/2027 MLK closed', U.statusFor(d(2027, 1, 18)).isSchoolDay, false);
check('2/15/2027 Presidents Day closed', U.statusFor(d(2027, 2, 15)).isSchoolDay, false);
check('3/10/2027 Eid closed', U.statusFor(d(2027, 3, 10)).isSchoolDay, false);
check('3/26/2027 spring recess closed', U.statusFor(d(2027, 3, 26)).isSchoolDay, false);
check('3/29/2027 closed', U.statusFor(d(2027, 3, 29)).isSchoolDay, false);
check('5/31/2027 Memorial Day closed', U.statusFor(d(2027, 5, 31)).isSchoolDay, false);
check('6/17/2027 last student day (early)', U.statusFor(d(2027, 6, 17)).isSchoolDay, true);
check('6/17/2027 flagged early', U.statusFor(d(2027, 6, 17)).early, true);
check('6/18/2027 staff day (no students)', U.statusFor(d(2027, 6, 18)).isSchoolDay, false);
check('6/21/2027 staff day closed', U.statusFor(d(2027, 6, 21)).isSchoolDay, false);

// Weekend
check('9/5/2026 Saturday closed', U.statusFor(d(2026, 9, 5)).isSchoolDay, false);
check('9/5/2026 reason', U.statusFor(d(2026, 9, 5)).reason, 'Weekend');

// Consecutive school days always alternate A/B (skipping the Welcome Back day)
var alternatingOK = true;
for (var i = 1; i < U.schoolDayDates.length; i++) {
  var a = U.typeByKey[U.dateKey(U.schoolDayDates[i - 1])];
  var b = U.typeByKey[U.dateKey(U.schoolDayDates[i])];
  if (a !== null && b !== null && a === b) { alternatingOK = false; console.log('  ❌ same letter on ' + U.dateKey(U.schoolDayDates[i - 1]) + ' & ' + U.dateKey(U.schoolDayDates[i])); }
}
console.log((alternatingOK ? '  ✅ ' : '  ❌ ') + 'consecutive school days alternate A/B');

// Every enumerated school day is a weekday, not in the closed list
var cleanOK = true;
U.schoolDayDates.forEach(function (day) {
  var st = U.statusFor(day);
  if (!st.isSchoolDay) { cleanOK = false; console.log('  ❌ ' + U.dateKey(day) + ' not marked as school day'); }
});
console.log((cleanOK ? '  ✅ ' : '  ❌ ') + 'all 182 enumerated days are valid school days');

// Row times from bell schedule
check('1-2 block start', U.ROWS[0].start, 480);
check('1-2 block end (p2 9:23)', U.ROWS[0].end, 563);
check('3-4 end (p4 10:50)', U.ROWS[1].end, 650);
check('7-8 end (p8 1:23)', U.ROWS[2].end, 803);
check('9-10 end (p10 2:50)', U.ROWS[3].end, 890);
check('fmtTime 563', U.fmtTime(563), '9:23 AM');
check('fmtTime 890', U.fmtTime(890), '2:50 PM');
check('fmtTime 744', U.fmtTime(744), '12:24 PM');

// nextSchoolDay across a long break
var n1 = U.nextSchoolDay(d(2026, 12, 23));
check('next school day after 12/23', U.dateKey(n1.date), '2027-01-04');

console.log(failures === 0 ? '\n🎉 All calendar checks passed!\n' : '\n💥 ' + failures + ' check(s) failed\n');
process.exit(failures === 0 ? 0 : 1);
