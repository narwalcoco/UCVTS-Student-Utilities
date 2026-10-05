/* ============================================================
 * scene.js — what's behind the content, and when the content
 * gets out of the way.
 *
 * Two jobs, both about the layer underneath the app:
 *
 *   1. Pick the school photo for the season we're in. The images
 *      are feathered cutouts — transparent sky above, transparent
 *      ground below — so the weather shows through around the
 *      school instead of the school sitting on a flat rectangle.
 *
 *   2. Fade the whole interface away after a minute of no touching,
 *      leaving just the school in the weather. That's for the kids
 *      who leave the tab open all through school. Reminders still
 *      fire, and a reminder brings the page back.
 *
 * Like sky.js, this is self-contained: app.js and calendar.js
 * don't know it exists, and the app works fine without it.
 * ============================================================ */
(function () {
  'use strict';

  /* Nobody has touched the page for this long -> fade it away. */
  var IDLE_MS = 1 * 60 * 1000;

  /* How long the "click anywhere" nudge stays on screen. */
  var HINT_MS = 6000;

  var SEASONS = ['autumn', 'winter', 'spring', 'summer'];
  var SEASON_LABEL = { autumn: 'Autumn', winter: 'Winter', spring: 'Spring', summer: 'Summer' };
  var SEASON_ENDS = {
    autumn: 'through November',
    winter: 'through February',
    spring: 'through May',
    summer: 'through August'
  };

  var STORE_KEY = 'ucvts.season.v1';

  var U = globalThis.UCVTS;

  var root = document.documentElement;

  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : raw;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }
  };

  /* Pinnable from the query string, same contract as sky.js: a pinned value
     wins over the saved one and is never written back. dev.html uses this,
     and so does anyone who wants to bookmark a particular look:

         index.html?season=winter&focus=away — the pins work on any page of
         the site, since sky and scene load everywhere */
  function param(name) {
    try {
      var v = new URLSearchParams(window.location.search).get(name);
      return v ? v.toLowerCase() : null;
    } catch (e) { return null; }
  }

  var photo = document.getElementById('scenePhoto');
  var page = document.getElementById('page');
  var hint = document.getElementById('sceneHint');
  var focusBtn = document.getElementById('focusBtn');
  var chipHost = document.getElementById('scenePresets');
  var sceneNote = document.getElementById('sceneNote');
  var toastHost = document.getElementById('toasts');

  var seasonParam = param('season');
  var seasonFromUrl = seasonParam !== null &&
    (seasonParam === 'auto' || SEASONS.indexOf(seasonParam) !== -1);
  var awayFromUrl = param('focus') === 'away';

  /* The time comes from the shared clock (clock.js), which owns both the
     ?now= pin and the tester panel's fake time:

         class-reminder.html?now=2026-12-28T12:00

     dev.html passes that when you pick a date for the day card. This file
     used to read the pin itself while sky.js ignored it and app.js honoured a
     separately stored fake clock — three opinions about what time it is,
     which is how a pinned December date once showed the autumn photo. */
  function clockNow() {
    return U.clock.now();
  }

  var state = {
    // 'auto' follows the calendar; a season name is an honest preview
    override: seasonFromUrl ? seasonParam : store.get(STORE_KEY, 'auto'),
    isPinned: seasonFromUrl,
    season: null,
    away: false,
    loaded: null
  };

  var idleTimer = null;
  var hintTimer = null;

  /* ---------------- which season is it? ---------------- */

  function seasonFor(date) {
    var m = date.getMonth();          // 0 = Jan
    if (m === 11 || m <= 1) return 'winter';   // Dec, Jan, Feb
    if (m <= 4) return 'spring';               // Mar, Apr, May
    if (m <= 7) return 'summer';               // Jun, Jul, Aug
    return 'autumn';                           // Sep, Oct, Nov
  }

  function resolvedSeason() {
    if (state.override !== 'auto' && SEASONS.indexOf(state.override) !== -1) {
      return state.override;
    }
    return seasonFor(clockNow());
  }

  function setSeason(name) {
    if (!photo || state.loaded === name) return;

    // Preload first, then swap, so we never flash a half-drawn image.
    var img = new Image();
    img.onload = function () {
      photo.style.backgroundImage = 'url("' + name + '.png")';
      photo.classList.add('loaded');
      state.loaded = name;
    };
    img.onerror = function () {
      // Missing or unreadable: stay transparent, weather-only. Not a failure.
    };
    img.src = name + '.png';
  }

  function applySeason() {
    var season = resolvedSeason();
    state.season = season;
    root.dataset.season = season;
    setSeason(season);
    renderSeasonChips();
    renderSeasonNote();
  }

  function renderSeasonNote() {
    if (!sceneNote) return;
    if (state.override === 'auto') {
      sceneNote.textContent = 'Following the calendar: ' + state.season +
        ' (' + SEASON_ENDS[state.season] + ').';
    } else {
      sceneNote.textContent = 'Previewing ' + state.override +
        ' \u2014 not what the calendar says. Pick "By date" to go back.';
    }
  }

  function renderSeasonChips() {
    if (!chipHost) return;
    var buttons = chipHost.querySelectorAll('[data-season-btn]');
    for (var i = 0; i < buttons.length; i++) {
      var name = buttons[i].getAttribute('data-season-btn');
      var on = name === 'auto'
        ? state.override === 'auto'
        : (state.override === name);
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function buildSeasonChips() {
    if (!chipHost) return;
    var html = '<button class="chip-btn" type="button" data-season-btn="auto" ' +
      'aria-pressed="true">By date</button>';
    SEASONS.forEach(function (name) {
      html += '<button class="chip-btn" type="button" data-season-btn="' + name +
        '" aria-pressed="false">' + SEASON_LABEL[name] + '</button>';
    });
    chipHost.innerHTML = html;

    chipHost.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-season-btn]') : null;
      if (!btn) return;
      state.override = btn.getAttribute('data-season-btn');
      state.isPinned = false;
      store.set(STORE_KEY, state.override);
      applySeason();
    });
  }

  /* ---------------- fading the page away ---------------- */

  // Things that mean "do not hide right now, they're mid-something".
  function busy() {
    if (document.hidden) return true;

    var el = document.activeElement;
    if (el && el !== document.body) {
      var tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          el.isContentEditable) {
        return true;
      }
    }

    // The beta tester panel is a working surface, not decoration.
    var panel = document.getElementById('simPanel');
    if (panel && !panel.hidden) return true;

    // A reminder pop-up is on screen — don't hide out from under it.
    if (toastHost && toastHost.children.length) return true;

    return false;
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(goAway, IDLE_MS);
  }

  function goAway() {
    if (state.away) return;
    if (busy()) { scheduleIdle(); return; }

    state.away = true;
    root.dataset.focus = 'away';

    // Take the content out of the tab order and the a11y tree too,
    // so "hidden" means hidden to a screen reader as well.
    if (page) page.setAttribute('inert', '');

    showHint();
  }

  function comeBack() {
    clearTimeout(idleTimer);

    if (!state.away) { scheduleIdle(); return; }

    state.away = false;
    if (root.dataset.focus) delete root.dataset.focus;
    if (page) page.removeAttribute('inert');

    hideHint();
    scheduleIdle();
  }

  function showHint() {
    if (!hint) return;
    clearTimeout(hintTimer);
    hint.classList.add('on');
    hintTimer = setTimeout(hideHint, HINT_MS);
  }

  function hideHint() {
    if (!hint) return;
    clearTimeout(hintTimer);
    hint.classList.remove('on');
  }

  function onInteraction() {
    if (state.away) comeBack();
    else scheduleIdle();
  }

  function wireEvents() {
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focusin'].forEach(function (evt) {
      window.addEventListener(evt, onInteraction, { passive: true, capture: true });
    });
    // Page scrolling is its own kind of "I'm still here".
    window.addEventListener('scroll', onInteraction, { passive: true });

    if (focusBtn) {
      focusBtn.addEventListener('click', function () {
        clearTimeout(idleTimer);
        goAway();
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(idleTimer);
      else scheduleIdle();
    });
  }

  /* A reminder appearing should bring the page back, so a glance
     tells you which class and when — not just a pop-up over a field.
     Watching the toast container keeps app.js out of this file. */
  function wireToastReveal() {
    if (!toastHost || typeof MutationObserver !== 'function') return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes && records[i].addedNodes.length) {
          comeBack();
          return;
        }
      }
    }).observe(toastHost, { childList: true });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    applySeason();
    buildSeasonChips();
    renderSeasonChips();
    renderSeasonNote();
    wireEvents();
    wireToastReveal();

    /* Re-derive when the clock is re-pointed (a simulated jump can land in
       another season) and when the date changes — a tab left open all day
       should notice a season boundary, and nothing else here would tell it.
       Both are safe to repeat: setSeason() ignores a season already loaded. */
    U.clock.subscribe('time', applySeason);
    U.clock.subscribe('day', applySeason);

    // ?focus=away skips the wait, for previewing and screenshots.
    if (awayFromUrl) goAway();
    else scheduleIdle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  globalThis.SCHOOLSCENE = {
    state: function () {
      return { season: state.season, override: state.override, away: state.away };
    },
    season: function () { return state.season; },
    setSeason: function (name) {
      state.override = name;
      store.set(STORE_KEY, name);
      applySeason();
    },
    /* Bring the page back, e.g. from the console. */
    show: comeBack,
    /* Check it out early instead of waiting a minute. */
    hide: goAway,
    idleMs: IDLE_MS
  };
})();
