/* ============================================================
 * calculator-page.js — boots the TI-84 Plus CE emulator.
 *
 * The calculator is the real TI-84 Plus CE emulator Texas
 * Instruments ships for TestNav, the platform New Jersey's state
 * tests run on. None of it lives in this repo: ELG-min.js (the
 * emulator), the .h84statej (the calculator's state image) and the
 * faceplate SVG are all fetched from mn.testnav.com, which serves
 * them, CORS-open, to every browser that loads a test. This file
 * does what ti84.pages.dev does with the same URLs — a smaller
 * window onto the same thing — and nothing else.
 *
 * Two touches of our own:
 *  · the XHR proxy below strips a '#...' suffix from the URLs the
 *    emulator asks for — it appends format hints the server won't
 *    answer — and
 *  · a plain-language failure. The emulator is about three
 *    megabytes of remote files; offline, blocked, or slow, this
 *    page says so rather than leaving an empty card.
 * ============================================================ */
(function () {
  'use strict';

  var booted = false;

  /* Installed before boot() runs, so every request the emulator makes goes
     through it. Only the URL is touched; everything else passes through. */
  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var rest = Array.prototype.slice.call(arguments, 2);
    if (typeof url === 'string') url = url.replace(/#.*$/, '');
    return nativeOpen.apply(this, [method, url].concat(rest));
  };

  /* The data tags hold inlined content on ti84.pages.dev and hold nothing
     here — an empty tag means "fetch data-url instead", which is the same
     switch that page uses. Supporting both costs three lines and keeps a
     future inlined build a copy-paste away. */
  function blobUrlFrom(id) {
    var el = document.getElementById(id);
    if (!el || !el.textContent || !el.textContent.trim()) return null;
    try {
      return URL.createObjectURL(new Blob([JSON.parse(el.textContent)]));
    } catch (e) { return null; }
  }

  function fail(message) {
    var box = document.getElementById('calcError');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  }

  function boot() {
    if (booted) return;
    booted = true;

    /* ELG-min.js is a plain script tag: if the network fails, the browser
       says nothing and simply skips it — so the missing global is the
       failure, and this is where it gets a voice. */
    if (typeof globalThis.TI84PCE !== 'function') {
      fail('The calculator couldn\u2019t load \u2014 its files come from testnav.com, so this page needs the internet. Check the connection (or a school blocker) and reload.');
      return;
    }

    var romEl = document.getElementById('h84statej');
    var faceEl = document.getElementById('ti84faceplate');
    var romUrl = blobUrlFrom('h84statej') || (romEl && romEl.getAttribute('data-url'));
    var faceUrl = blobUrlFrom('ti84faceplate') || (faceEl && faceEl.getAttribute('data-url'));

    if (!romUrl || !faceUrl) {
      fail('The calculator couldn\u2019t find its files. Check the connection and reload.');
      return;
    }

    /* The suffixes are format hints the emulator reads back off the URL
       after fetching — which is why the proxy above strips them from the
       request instead of us not adding them here. */
    romUrl += '#.h84statej';
    faceUrl += '#.svg';

    try {
      new globalThis.TI84PCE({ ROMLocation: romUrl, FaceplateLocation: faceUrl });
    } catch (e) {
      fail('The calculator started and then hit a problem' +
        (e && e.message ? ' (' + e.message + ')' : '') +
        '. A reload usually fixes it.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
