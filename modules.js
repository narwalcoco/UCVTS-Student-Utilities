/* ============================================================
 * modules.js — the shelf the modules sit on.
 *
 * A module is one file that calls register() with a description of
 * itself. Everything else follows from that description: the card on
 * the page, where it goes, and what switching it on or off means.
 * Adding another module means adding one file, not editing this one.
 *
 * Where a module lives
 * -------------------
 * Two hosts, and a module says which one it wants:
 *
 *   slot: 'column'   stacks under the reminders, beside the schedule. The
 *                    default, because the schedule is the main feature and a
 *                    module is a supplement to it, never a rival for the space.
 *   slot: 'wide'     the full page width below both columns, for something
 *                    that genuinely needs the room (a wide instrument, a
 *                    big canvas). Nothing uses it right now; the host
 *                    stays, ready and invisible until something asks.
 *
 * An unused host takes itself out of the layout, so neither leaves a gap.
 *
 * Two settings, and they are not the same thing
 * ---------------------------------------------
 *   enabled   is this module part of my page at all
 *   visible   is it taking up room right now
 *
 *   enabled + visible    running, and on screen
 *   enabled + hidden     STILL RUNNING, not on screen
 *                        (a focus timer you hide is still counting)
 *   disabled             NOT RUNNING, not on screen
 *                        (nothing works behind your back)
 *
 * That third state is the whole reason these are two booleans. Switching a
 * module off tears it down: it is unmounted, and anything it left running —
 * intervals, clock subscriptions — is stopped.
 *
 * Settings and data are stored separately
 * ---------------------------------------
 *   ucvts.modules.v1        settings, one record per module
 *   ucvts.module.<id>.v1    that module's own data
 *
 * Settings are merged over each module's own defaults. Storing "the list of
 * enabled modules" instead would make any module shipped later invisible to
 * everyone who already used the page — an absent id reads as off, and
 * "turned off" becomes indistinguishable from "never existed". Merging over
 * defaults means a new module simply appears.
 *
 * Data lives under its own key so switching a module off can never erase it.
 * Off means off, not wiped.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS = globalThis.UCVTS || {};
  var SETTINGS_KEY = 'ucvts.modules.v1';
  var DATA_PREFIX = 'ucvts.module.';

  /* The two places a module can be put, and the element each one means. */
  var HOSTS = { column: 'modulesCol', wide: 'modules' };

  var defs = [];      // registry order, which is also display order
  var saved = null;   // the raw settings record, read once
  var live = {};      // id -> { card, body, entry } for what is on the page now
  var failed = {};    // id -> true, for a module whose mount threw once

  /* ---------------- storage ---------------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function loadSettings() {
    var raw = readJSON(SETTINGS_KEY, null);
    return raw && typeof raw === 'object' ? raw : {};
  }

  function byId(id) {
    for (var i = 0; i < defs.length; i++) { if (defs[i].id === id) return defs[i]; }
    return null;
  }

  /* A module that says nothing about where it goes is a compact one, so it
     goes in the column. Only an explicit 'wide' gets the whole page. */
  function slotOf(def) { return def.slot === 'wide' ? 'wide' : 'column'; }

  function hostFor(def) { return document.getElementById(HOSTS[slotOf(def)]); }

  /* A module nobody has ever touched falls back to its own defaults, which is
     how a newly added module shows up without anyone editing this file. */
  function settingsFor(def) {
    if (!def) return null;
    var mine = saved[def.id] || {};
    var d = def.defaults || {};
    return {
      enabled: mine.enabled === undefined ? d.enabled !== false : !!mine.enabled,
      visible: mine.visible === undefined ? d.visible !== false : !!mine.visible,
      seen: !!mine.seen
    };
  }

  function applySettings(id, patch) {
    var def = byId(id);
    if (!def) return;
    var next = settingsFor(def);
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    saved[id] = next;
    writeJSON(SETTINGS_KEY, saved);
    render();
  }

  /* ---------------- what a module is handed ---------------- */

  function dataStore(id) {
    var key = DATA_PREFIX + id + '.v1';
    return {
      get: function (fallback) { return readJSON(key, fallback); },
      set: function (value) { writeJSON(key, value); }
    };
  }

  function apiFor(def, entry) {
    return {
      id: def.id,
      clock: U.clock,
      /* Same path the reminders use, so a module's notification looks and
         behaves exactly like one the app raises itself. */
      notify: function (emoji, title, body) {
        /* Announcing something is never worth losing the state change it was
           describing, so a notification that fails goes no further than this
           line. Without it a module's own bookkeeping would depend on a part
           of the page the module doesn't own. */
        if (typeof U.notify !== 'function') return;
        try { U.notify(emoji, title, body); }
        catch (e) {
          if (globalThis.console && console.error) {
            console.error('modules: a notification from "' + def.id + '" failed', e);
          }
        }
      },
      /* A clock subscription that is torn down with the module, so a disabled
         module can never be left listening in the background. */
      listen: function (name, fn) {
        entry.cleanups.push(U.clock.subscribe(name, fn));
      },
      /* This module's own saved data — a different key from its settings. */
      data: dataStore(def.id),
      settings: function () { return settingsFor(def); }
    };
  }

  /* ---------------- putting a module on the page ---------------- */

  function mount(def) {
    var host = hostFor(def);
    if (!host) return;

    var card = document.createElement('section');
    card.className = 'card module-card';
    card.setAttribute('data-module', def.id);
    card.setAttribute('data-slot', slotOf(def));

    var head = document.createElement('div');
    head.className = 'card-head';

    var title = document.createElement('h2');
    title.textContent = def.name;

    var tools = document.createElement('div');
    tools.className = 'head-tools';

    var hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'ghost-btn';
    hide.textContent = 'Hide';
    hide.title = 'Take this off the page without switching it off';
    hide.addEventListener('click', function () { applySettings(def.id, { visible: false }); });

    tools.appendChild(hide);
    head.appendChild(title);
    head.appendChild(tools);

    var body = document.createElement('div');
    body.className = 'module-body';

    card.appendChild(head);
    card.appendChild(body);

    /* Registry order is display order, and that has to survive a module being
       switched off and on again — appending would let a re-enabled module
       shuffle its host. So slot the card in at its registry position. Searching
       within this host is enough on its own: a module in the other host simply
       isn't found, and there is no card there to slot in front of. */
    var after = null;
    for (var k = defs.indexOf(def) + 1; k < defs.length && !after; k++) {
      after = host.querySelector('[data-module="' + defs[k].id + '"]');
    }
    host.insertBefore(card, after);

    var entry = { card: card, body: body, cleanups: [], explainer: false };
    live[def.id] = entry;

    /* The brief first-run explainer, if the module brought one. The framework
       handles this so no module has to think about it. */
    if (def.explainer && !settingsFor(def).seen) {
      entry.explainer = true;
      var text = document.createElement('p');
      text.className = 'module-explainer';
      text.innerHTML = def.explainer;
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn small';
      ok.textContent = 'Got it';
      ok.addEventListener('click', function () { applySettings(def.id, { seen: true }); });
      body.appendChild(text);
      body.appendChild(ok);
      return;
    }

    if (typeof def.mount !== 'function') return;
    try {
      def.mount(body, apiFor(def, entry));
    } catch (e) {
      /* One broken module must not take the ones after it down. Without this
         the throw escapes into the shelf's own draw, so every later module in
         the registry silently never mounts. The half-built card comes off too,
         leaving either a working module or nothing at all. */
      unmount(def.id);
      failed[def.id] = true;
      if (globalThis.console && console.error) {
        console.error('modules: "' + def.id + '" failed to mount and was removed', e);
      }
    }
  }

  function unmount(id) {
    var entry = live[id];
    if (!entry) return;
    var def = byId(id);

    /* Let the module stop its own work first — it may still want to read the
       DOM it built — then drop every subscription it registered with us. */
    if (def && typeof def.unmount === 'function') {
      try { def.unmount(entry.body); } catch (e) { /* a broken module must not break the rest */ }
    }
    for (var i = 0; i < entry.cleanups.length; i++) {
      try { entry.cleanups[i](); } catch (e) { /* already gone */ }
    }
    if (entry.card.parentNode) entry.card.parentNode.removeChild(entry.card);
    delete live[id];
  }

  function renderCards() {
    defs.forEach(function (def) {
      if (failed[def.id]) return;      // already reported; don't retry every draw
      var want = settingsFor(def);
      var entry = live[def.id];

      if (want.enabled && !entry) { mount(def); return; }
      if (!want.enabled && entry) { unmount(def.id); return; }

      entry = live[def.id];
      if (!entry) return;

      /* Dismissing the explainer should reveal the real thing. The module was
         never mounted behind it, so mount it properly now. */
      if (entry.explainer && want.seen) { unmount(def.id); mount(def); return; }

      /* Hidden is NOT the same as off. The card comes off the page; the module
         inside it carries on doing whatever it was doing, which is the entire
         reason a focus timer can be tucked away and still be counting. */
      entry.card.hidden = !want.visible;
    });

    /* Each host takes itself out of the layout when nothing visible is in it,
       so an unused slot leaves no gap where it would have been. */
    Object.keys(HOSTS).forEach(function (slot) {
      var el = document.getElementById(HOSTS[slot]);
      if (!el) return;
      el.hidden = !defs.some(function (def) {
        var e = live[def.id];
        return e && !e.card.hidden && slotOf(def) === slot;
      });
    });
  }

  function render() { renderCards(); }

  /* ---------------- the public shelf ---------------- */

  /* The first draw is deferred by a tick on purpose. register() is called while
     a module's own file is still being evaluated, and mounting on the spot
     means any `var` further down that file gets assigned afterwards — on top of
     the state mount() had just built. Waiting one tick lets every module file
     finish first, which closes that trap rather than relying on everyone
     remembering it. (The modules also declare everything above their register
     call; this is the belt to that pair of braces.) */
  var pending = null;
  function scheduleRender() {
    if (pending) return;
    pending = setTimeout(function () { pending = null; render(); }, 0);
  }

  U.modules = {
    register: function (def) {
      if (!def || !def.id || byId(def.id)) return;   // first registration wins
      if (saved === null) saved = loadSettings();
      defs.push(def);
      scheduleRender();
    },
    all: function () {
      return defs.map(function (def) { return { def: def, settings: settingsFor(def) }; });
    },
    settings: function (id) { return settingsFor(byId(id)); },
    set: applySettings,
    refresh: render
  };

  /* Nothing else to boot: the module files register themselves in script
     order, and each registration draws. Until then there is no shelf. */
})();
