/* ============================================================
 * clock.js — the only thing on this page that knows what time it is.
 *
 * Why it exists
 * -------------
 * The page used to rebuild itself in full every ten seconds, on the
 * chance that something had changed. That one habit sits behind most
 * of the bugs this project has fixed, because it let two parts of the
 * page form separate opinions about the same fact and then disagree:
 * a sun in a night sky, a countdown stuck on "ends in 1 minute", a
 * screen reader being read the same sentence every ten seconds, the
 * wrong season photo for a pinned date.
 *
 * So: one clock owns the answer, and it tells the parts that care,
 * only when something they care about actually changed. A part that
 * isn't rebuilt cannot lose your typing, cannot clobber a timer, and
 * cannot disagree with anyone.
 *
 * It also owns the beta tester's fake clock, which used to be read
 * three different ways: app.js honoured the saved fake time, scene.js
 * honoured ?now=, and sky.js honoured neither. That divergence is why
 * a pinned December date once showed the autumn photo.
 *
 * Deliberately NOT here: the weather animation. The sky really does
 * have to redraw continuously, and that's a different kind of job.
 *
 * Events
 * ------
 *   'minute'  the minute changed         (also delivered once on subscribe)
 *   'day'     the local date changed     (also delivered once on subscribe)
 *   'time'    the clock was re-pointed   (fake clock set, cleared, or pinned)
 *   'wake'    the tab came back to the foreground
 *
 * 'minute' and 'day' are *state* events: subscribing runs your function
 * once immediately with the current time, so nobody has to write their
 * own "and once at startup" call. 'time' and 'wake' are pure
 * notifications — they mean "this just happened", and there is no
 * current value to hand you.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS = globalThis.UCVTS || {};
  var KEY = 'ucvts.classpal.simtime.v1';
  var EVENTS = ['minute', 'day', 'time', 'wake'];
  var listeners = { minute: [], day: [], time: [], wake: [] };

  var simulated = null;   // a Date, or null for the real clock
  var pinned = false;     // came from ?now=, so it must never be saved
  var seen = { minute: null, day: null };

  /* ---------------- dates ---------------- */

  function toDate(value) {
    if (value === null || value === undefined || value === '') return null;
    var d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function readStored() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? toDate(JSON.parse(raw)) : null;
    } catch (e) { return null; }          // private mode, or junk in the key
  }

  function writeStored(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d ? d.toISOString() : null)); }
    catch (e) { /* private mode */ }
  }

  /* The pin has to be read raw. An ISO datetime is not case-insensitive, and
     the ?sky= / ?season= helpers lowercase everything they touch. */
  function readPin() {
    try {
      var v = new URLSearchParams(globalThis.location.search).get('now');
      return v ? toDate(v) : null;
    } catch (e) { return null; }
  }

  /* ---------------- the answer ---------------- */

  function now() {
    return simulated ? new Date(simulated.getTime()) : new Date();
  }

  function isSimulated() { return !!simulated; }

  function dayKey(d) {
    /* calendar.js already owns what counts as "today" — February, holidays
       and all. Don't grow a second definition of it here. */
    if (typeof U.dateKey === 'function') return U.dateKey(d);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function minuteIndex(d) { return Math.floor(d.getTime() / 60000); }

  /* ---------------- telling people ---------------- */

  function emit(name, payload) {
    var list = listeners[name];
    for (var i = 0; i < list.length; i++) {
      // One broken listener must not take the clock, or its neighbours, down.
      try { list[i](payload); }
      catch (e) {
        if (globalThis.console && console.error) {
          console.error('clock: a "' + name + '" listener failed', e);
        }
      }
    }
  }

  function check() {
    var d = now();
    var k = dayKey(d);
    var m = minuteIndex(d);
    // Day before minute: a new date replaces the day's whole content, and the
    // minute-level parts should be looking at the new day when they run.
    if (k !== seen.day) { seen.day = k; emit('day', d); }
    if (m !== seen.minute) { seen.minute = m; emit('minute', d); }
  }

  function subscribe(name, fn) {
    if (EVENTS.indexOf(name) === -1) throw new Error('clock: unknown event "' + name + '"');
    listeners[name].push(fn);
    if (name === 'minute' || name === 'day') {
      // A state event: hand over today's value straight away.
      try { fn(now()); }
      catch (e) {
        if (globalThis.console && console.error) {
          console.error('clock: a "' + name + '" listener failed', e);
        }
      }
    }
    return function () {
      var i = listeners[name].indexOf(fn);
      if (i !== -1) listeners[name].splice(i, 1);
    };
  }

  /* ---------------- pointing the clock somewhere else ---------------- */

  function setSimulated(value) {
    simulated = toDate(value);
    pinned = false;
    writeStored(simulated);
    /* Forget what we last told people. A jump can move the minute, the date,
       or both, so every time-dependent part has to re-derive from scratch —
       and this is the one case where "nothing changed" must not be assumed. */
    seen.minute = null;
    seen.day = null;
    emit('time', now());
    check();
  }

  /* ---------------- boot ---------------- */

  var pin = readPin();
  if (pin) {
    /* A pinned clock seeds the fake time but is never saved, so following a
       link can't quietly move the real device's own state. */
    simulated = pin;
    pinned = true;
  } else {
    simulated = readStored();
  }

  /* Set the baseline before anyone subscribes, so the first subscriber's
     immediate call isn't followed a second later by a duplicate. */
  seen.day = dayKey(now());
  seen.minute = minuteIndex(now());

  setInterval(check, 1000);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    emit('wake', now());
    check();   // catch up on anything that changed while we were away
  });

  U.clock = {
    now: now,
    isSimulated: isSimulated,
    isPinned: function () { return pinned; },
    setSimulated: setSimulated,
    clearSimulated: function () { setSimulated(null); },
    subscribe: subscribe
  };
})();
