/* ============================================================
 * sky.js — a background that follows the real weather.
 *
 * Borrows the *behaviour* of the weather instrument on the other
 * site, not its look: fetch a forecast, bucket the weather code
 * into a sky, paint a canvas behind the page, and swap this app's
 * palette by setting data-sky / data-day on <html>.
 *
 * It is fully self-contained. app.js and calendar.js don't know
 * it exists, and everything still works if this file never runs.
 *
 * Three rules it follows:
 *   1. never fake live data — a cached reading is labeled "last seen"
 *   2. never let a failed request break the page (weather is optional)
 *   3. respect prefers-reduced-motion, and offer a manual switch
 * ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
   * Location: UCVTS, 1776 Raritan Rd, Scotch Plains NJ.
   * Forecast grids are ~11 km wide, so township center is plenty.
   * ------------------------------------------------------------ */
  var PLACE = 'Scotch Plains';
  var LAT = 40.6537;
  var LON = -74.3704;

  /* "daily" costs us nothing extra and gets us the real sunrise and sunset
     for this spot, which is what drives the dawn/dusk light further down.
     timeformat=unixtime keeps those as epoch seconds, so they compare
     correctly no matter what timezone the browser thinks it is in. */
  var WX_URL = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + LAT + '&longitude=' + LON +
    '&current=temperature_2m,apparent_temperature,is_day,precipitation,' +
    'weather_code,cloud_cover,wind_speed_10m' +
    '&daily=sunrise,sunset&forecast_days=1' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph' +
    '&timeformat=unixtime&timezone=America%2FNew_York';

  /* How far either side of the real sunrise/sunset counts as dawn/dusk.
     Forty-five minutes is about how long the light actually lingers. */
  var DAWN_WINDOW = 45 * 60 * 1000;
  var DUSK_WINDOW = 45 * 60 * 1000;

  var SKIES = ['clear', 'cloud', 'rain', 'storm', 'snow', 'fog'];
  var SKY_LABEL = {
    clear: 'Clear', cloud: 'Cloudy', rain: 'Rain',
    storm: 'Thunderstorms', snow: 'Snow', fog: 'Fog'
  };
  /* Four phases of light, not two. scene.js darkens the school photo
     from data-part, so a winter morning opens dim at 7:45 and a winter
     afternoon fades out around 4:30 — driven by the real sun times. */
  var PARTS = ['dawn', 'day', 'dusk', 'night'];
  var PART_LABEL = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

  /* Where each phase sits between sunrise and sunset, 0 to 1. Used whenever a
     phase has to stand in for the clock: a preview, or a run where the sun
     times never arrived. */
  var PART_PROGRESS = { dawn: 0.04, day: 0.5, dusk: 0.96, night: 0.5 };

  /* The shared clock (see clock.js, which loads before this file). Looked up
     when used rather than captured at load, so a reordered <script> fails
     loudly instead of quietly reading the device clock and disagreeing with
     the rest of the page about what time it is. */
  function clockNow() { return globalThis.UCVTS.clock.now(); }

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

  var prefersReduced = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  /* Anything here can be pinned from the query string, which is what makes
     dev.html possible — it previews combinations in an iframe by passing
     them through the URL:

         index.html?sky=rain&part=dusk&season=winter&motion=off (any page —
         the sky loads everywhere)

     A pinned value beats the saved one, and is deliberately NOT saved, so
     following a link never quietly rewrites your own preferences. */
  function param(name) {
    try {
      var v = new URLSearchParams(window.location.search).get(name);
      return v ? v.toLowerCase() : null;
    } catch (e) { return null; }
  }

  var skyParam = param('sky');
  var partParam = param('part');
  var motionParam = param('motion');
  var skyFromUrl = skyParam !== null &&
    (skyParam === 'live' || SKIES.indexOf(skyParam) !== -1);
  var partFromUrl = partParam !== null &&
    (partParam === 'auto' || PARTS.indexOf(partParam) !== -1);
  var motionFromUrl = motionParam === 'on' || motionParam === 'off';

  /* ---------------- state ---------------- */

  var state = {
    sky: 'cloud',
    day: 'day',
    part: 'day',
    live: 'loading',
    // 'auto' follows the real sunrise/sunset; a part name is a preview
    partOverride: partFromUrl ? partParam : store.get('ucvts.part.v1', 'auto'),
    partIsPinned: partFromUrl,
    // "live" or a sky name — an honest preview, never a lie about the weather
    override: skyFromUrl ? skyParam : store.get('ucvts.sky.v1', 'live'),
    skyIsPinned: skyFromUrl,
    motion: motionFromUrl ? motionParam
      : store.get('ucvts.motion.v1',
        prefersReduced && prefersReduced.matches ? 'off' : 'on'),
    motionIsPinned: motionFromUrl,
    wx: null,
    lastGood: null
  };

  try {
    var cachedWx = store.get('ucvts.lastwx.v1', null);
    if (cachedWx) state.lastGood = JSON.parse(cachedWx);
  } catch (e) { state.lastGood = null; }

  /* Two canvases, one painter.

     The school is a CSS background image, so the only way to have weather on
     both sides of it is to paint two layers around it. Rather than duplicate
     every draw helper, all of them stay written against `ctx` and the layer a
     pass lands on is chosen at the call site by paintOn().

       far  (behind the school) clouds, sun, stars, the lightning bolt
       near (in front of it)   rain, snow, the fog veil, the flash, ripples */
  var farCanvas = document.getElementById('skyFar');
  var nearCanvas = document.getElementById('skyNear');
  var farCtx = farCanvas && farCanvas.getContext ? farCanvas.getContext('2d') : null;
  var nearCtx = nearCanvas && nearCanvas.getContext ? nearCanvas.getContext('2d') : null;

  // `ctx` is whichever layer the pass now running is painting on.
  var ctx = nearCtx;

  function paintOn(target, fn) {
    var prev = ctx;
    ctx = target || prev;
    try { fn(); } finally { ctx = prev; }
  }

  var presetHost = document.getElementById('skyPresets');
  var partHost = document.getElementById('partPresets');
  var skyNote = document.getElementById('skyNote');
  var skyLine = document.getElementById('skyLine');
  var skyLineText = document.getElementById('skyLineText');
  var skyLineEmoji = document.getElementById('skyLineEmoji');
  var motionBtn = document.getElementById('motionBtn');
  var themeColor = document.getElementById('themeColor');

  /* ---------------- weather code → sky ---------------- */

  function wmoToSky(code) {
    if (code === 0 || code === 1) return 'clear';
    if (code === 2 || code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloud';
  }

  function wmoLabel(code) {
    var map = {
      0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
      45: 'fog', 48: 'freezing fog',
      51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
      61: 'light rain', 63: 'rain', 65: 'heavy rain',
      66: 'freezing rain', 67: 'freezing rain',
      71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
      80: 'light showers', 81: 'showers', 82: 'violent showers',
      85: 'snow showers', 86: 'snow showers',
      95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail'
    };
    return map[code] || 'shifting sky';
  }

  /* Which sky should we draw right now? A preview wins; then live;
     then the last reading we ever got; then a plain cloudy guess. */
  function effectiveSky() {
    if (state.override !== 'live' && SKIES.indexOf(state.override) !== -1) {
      return state.override;
    }
    if (state.wx) return wmoToSky(state.wx.weather_code);
    if (state.lastGood) return wmoToSky(state.lastGood.weather_code);
    return 'cloud';
  }

  // Day/night before the first request lands (or when it never lands). It
  // reads the shared clock, so a pinned or simulated time answers here too
  // instead of quietly falling back to the device's own hour.
  function localIsDay() {
    var h = clockNow().getHours();
    return h >= 6 && h < 19;
  }

  function tempText(w) {
    return Math.round(w.temperature_2m) + '\u00B0F';
  }

  /* ---------------- dawn / day / dusk / night ---------------- */

  function currentSun() {
    /* The live reading's sunrise and sunset describe the real day. The moment
       the clock is simulated they describe a different date entirely, so they
       stop being an answer to "is it night?": a simulated July noon would come
       out as night, because the real day's sunset is long past by that
       timestamp. An invented date therefore gets no sun times at all and falls
       back to the plain day/night guess, which at least is about the hour the
       user actually asked for. Dawn and dusk can still be previewed exactly —
       that's what the pinned phase on the developer page is for. */
    if (globalThis.UCVTS.clock.isSimulated()) return null;

    var w = state.wx || state.lastGood;
    if (w && w._sunrise && w._sunset) return { rise: w._sunrise, set: w._sunset };
    return null;
  }

  function resolvePart() {
    if (state.partOverride !== 'auto' && PARTS.indexOf(state.partOverride) !== -1) {
      return state.partOverride;
    }

    var sun = currentSun();
    // Offline with no cached sun times: fall back to a plain day/night guess.
    if (!sun) return localIsDay() ? 'day' : 'night';

    var now = clockNow().getTime();
    if (now < sun.rise - DAWN_WINDOW || now >= sun.set + DUSK_WINDOW) return 'night';
    if (now < sun.rise + DAWN_WINDOW) return 'dawn';
    if (now >= sun.set - DUSK_WINDOW) return 'dusk';
    return 'day';
  }

  /* ---------------- how strong the sky's light is ---------------- */

  /* Straight line between two colours, for light that warms as it drops. */
  function mix(a, b, k) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k)
    ];
  }

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /* The two ends of the sun's colour: deep amber down on the horizon, and
     still unmistakably golden when it is overhead.

     The top of the ramp used to run to near-white, which is what a sun does
     to a camera but not to a drawing — by midday the disc had lost its hue
     and read as a bright smudge instead of the sun. The ramp now stops at
     gold, so the sun keeps its colour all day and only its height and
     strength change. It roughly matches the clear-day --accent. */
  var LIGHT_LOW = [255, 146, 58];
  var LIGHT_HIGH = [255, 206, 92];

  /* Where this moment sits between sunrise and sunset: 0 at sunrise, 1 at
     sunset. A pinned phase stands in for the clock, so a preview shows the
     light that belongs to it rather than whatever it happens to be outside
     the window. */
  function sunProgress() {
    if (state.partOverride !== 'auto') {
      var pinned = PART_PROGRESS[state.partOverride];
      if (pinned !== undefined) return pinned;
    }

    var sun = currentSun();
    if (sun && sun.set > sun.rise) {
      return Math.max(0, Math.min(1, (clockNow().getTime() - sun.rise) / (sun.set - sun.rise)));
    }

    // Offline with nothing cached: the phase is all we have.
    var fallback = PART_PROGRESS[state.part];
    return fallback === undefined ? 0.5 : fallback;
  }

  /* The sky's own light, as one value.

     Every source of light up there reads this — the sun in a clear sky, the
     break in the clouds, the disc fighting through fog — so they climb and
     fade together through the day, instead of all sitting at one fixed
     brightness from dawn right through to dusk.

     `lift` is the sun's height: 0 with it on the horizon, 1 overhead. `bright`
     turns that into a multiplier on any alpha — 0.4 of the usual weight at
     either end of the day, the full value at midday. `colour` is the amber to
     white ramp that goes with it. At night lift is 0, which is what keeps the
     sun out of a night sky however the phase was arrived at. */
  function skyLight() {
    var lift = state.day === 'night' ? 0 : Math.sin(Math.PI * sunProgress());
    return {
      lift: lift,
      bright: 0.4 + 0.6 * lift,
      colour: mix(LIGHT_LOW, LIGHT_HIGH, lift)
    };
  }

  /* ---------------- apply the palette + readout ---------------- */

  function syncThemeColor() {
    if (!themeColor || !window.getComputedStyle) return;
    var v = window.getComputedStyle(root).getPropertyValue('--bg-top').trim();
    if (v) themeColor.setAttribute('content', v);
  }

  function applySky() {
    var sky = effectiveSky();
    var part = resolvePart();

    /* Day/night is derived from the phase, never decided a second time.

       `resolvePart()` already answers this question from this location's real
       sunrise and sunset, so working it out twice was the bug: the two could
       disagree. A pinned time of day moved only `part`, which darkened the
       school but left the palette in daylight and the sun up in a night sky —
       and `is_day` from the live feed is only as fresh as the last fetch, so a
       tab left open across sunset with the network down could do the same on
       its own.

       Dawn and dusk count as daylight, which is what the palettes are tuned
       to: the sky flips to night only once the sun is fully down. */
    var isDay = part !== 'night';
    var previewing = state.override !== 'live';
    var label = previewing ? 'preview'
      : (state.wx ? 'live' : (state.lastGood ? 'fallback' : 'fallback'));

    state.sky = sky;
    state.day = isDay ? 'day' : 'night';
    state.part = part;
    state.live = label;

    root.dataset.sky = sky;
    root.dataset.day = state.day;
    root.dataset.part = state.part;
    root.dataset.live = label;
    root.dataset.ready = 'true';
    syncThemeColor();

    renderSkyLine(sky, previewing);
    renderPresets(previewing);
    renderPartChips();
    seed();
    if (!canvasMotion()) drawOnce();
  }

  function renderSkyLine(sky, previewing) {
    if (!skyLineText) return;

    // Icon slot, left empty on purpose: no emoji. Whenever real artwork
    // exists it goes in here (an <img>, or a background-image on this span),
    // and the stylesheet reveals it once there is something to show.
    if (skyLineEmoji) skyLineEmoji.setAttribute('data-sky', sky);

    if (previewing) {
      skyLineText.textContent = PLACE + ' sky preview \u00B7 ' + SKY_LABEL[sky] +
        ' \u00B7 not live data';
    } else if (state.wx) {
      var w = state.wx;
      skyLineText.textContent = PLACE + ' \u00B7 ' + tempText(w) + ' \u00B7 ' +
        wmoLabel(w.weather_code) + ' \u00B7 live';
    } else if (state.lastGood) {
      var w2 = state.lastGood;
      var when = w2._at
        ? new Date(w2._at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : 'earlier';
      skyLineText.textContent = PLACE + ' \u00B7 ' + tempText(w2) +
        ' \u00B7 last seen ' + when + ' \u00B7 offline';
    } else {
      skyLineText.textContent = PLACE + ' \u00B7 no reading yet \u00B7 offline sketch';
    }

    if (skyLine) skyLine.hidden = false;
  }

  function renderPresets(previewing) {
    if (!presetHost) return;
    var buttons = presetHost.querySelectorAll('[data-sky-btn]');
    for (var i = 0; i < buttons.length; i++) {
      var name = buttons[i].getAttribute('data-sky-btn');
      var on = name === 'live'
        ? !previewing
        : (previewing && name === state.override);
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (skyNote) {
      skyNote.textContent = previewing
        ? 'Previewing "' + state.override + '" \u2014 a sketch, not real weather. Pick "Live" to go back.'
        : (state.wx
          ? 'Following live weather for ' + PLACE + '.'
          : 'No live reading right now \u2014 the sky is a sketch until the network comes back.');
    }
  }

  function renderPartChips() {
    if (!partHost) return;
    var buttons = partHost.querySelectorAll('[data-part-btn]');
    for (var i = 0; i < buttons.length; i++) {
      var name = buttons[i].getAttribute('data-part-btn');
      var on = name === 'auto'
        ? state.partOverride === 'auto'
        : (state.partOverride === name);
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function buildPartChips() {
    if (!partHost) return;
    var html = '<button class="chip-btn" type="button" data-part-btn="auto" ' +
      'aria-pressed="true">By the sun</button>';
    PARTS.forEach(function (name) {
      html += '<button class="chip-btn" type="button" data-part-btn="' + name +
        '" aria-pressed="false">' + PART_LABEL[name] + '</button>';
    });
    partHost.innerHTML = html;

    partHost.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-part-btn]') : null;
      if (!btn) return;
      state.partOverride = btn.getAttribute('data-part-btn');
      state.partIsPinned = false;
      store.set('ucvts.part.v1', state.partOverride);
      applySky();
    });
  }

  function buildPresetButtons() {
    if (!presetHost) return;
    var html = '<button class="chip-btn" type="button" data-sky-btn="live" ' +
      'aria-pressed="true">\u25CF Live</button>';
    SKIES.forEach(function (name) {
      html += '<button class="chip-btn" type="button" data-sky-btn="' + name + '" ' +
        'aria-pressed="false">' + SKY_LABEL[name] + '</button>';
    });
    presetHost.innerHTML = html;

    presetHost.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-sky-btn]') : null;
      if (!btn) return;
      var picked = btn.getAttribute('data-sky-btn');
      state.override = picked;
      state.skyIsPinned = false;   // an explicit choice outranks the URL
      store.set('ucvts.sky.v1', picked);
      applySky();
    });
  }

  /* ---------------- the request ---------------- */

  var fetching = false;

  function fetchWeather() {
    if (fetching) return Promise.resolve();
    // Nothing to talk to? Skip quietly — the sketch path already covers us.
    if (typeof fetch !== 'function') return Promise.resolve();

    fetching = true;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;

    return fetch(WX_URL, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.current) throw new Error('empty payload');

        // Epoch seconds -> milliseconds. Absent on a partial response.
        var rise = data.daily && data.daily.sunrise ? data.daily.sunrise[0] * 1000 : null;
        var set = data.daily && data.daily.sunset ? data.daily.sunset[0] * 1000 : null;

        state.wx = Object.assign({}, data.current);
        if (rise) state.wx._sunrise = rise;
        if (set) state.wx._sunset = set;

        state.lastGood = Object.assign({ _at: Date.now() }, state.wx);
        store.set('ucvts.lastwx.v1', JSON.stringify(state.lastGood));
      })
      .catch(function () {
        // Stay honest: fall through to the cached-or-sketch path.
        state.wx = null;
      })
      .then(function () {
        if (timer) clearTimeout(timer);
        fetching = false;
        applySky();
      });
  }

  /* ---------------- the sky canvas ---------------- */

  var W = 0, H = 0, t = 0;
  var parts = [], clouds = [], bolt = null, flash = 0;

  // Reference viewport area, so a phone doesn't pay for a desktop sky.
  var AREA_REF = 1440 * 900;
  function density() {
    var d = (W * H) / AREA_REF;
    return Math.max(0.4, Math.min(1, d));
  }

  function sizeSky() {
    if (!nearCtx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = window.innerWidth;
    H = window.innerHeight;
    // Both layers are the same box with the same transform, so W/H describe
    // the far one exactly as well as the near one.
    [farCanvas, nearCanvas].forEach(function (c) {
      if (!c) return;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      var g = c.getContext('2d');
      if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    seed();
    if (!canvasMotion()) drawOnce();
  }

  function seed() {
    if (!nearCtx) return;
    var sky = state.sky;
    var night = state.day === 'night';
    var k = density();

    // A new sky gets a clean slate for the lightning.
    bolt = null;
    flash = 0;

    /* Particles only where the weather actually has something to throw:
       rain and storm streaks, snowflakes, clear-night stars. */
    var base = sky === 'snow' ? 150
      : sky === 'rain' ? 180
        : sky === 'storm' ? 210
          : (sky === 'clear' && night) ? 140
            : 0;
    var n = Math.round(base * k);
    parts = [];
    for (var i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.4 + Math.random() * 0.6,
        ph: Math.random() * 6.28,
        len: 10 + Math.random() * 14
      });
    }

    var cloudCount = sky === 'clear' ? 3 : sky === 'fog' ? 7 : 6;
    cloudCount = Math.max(2, Math.round(cloudCount * (k * 0.5 + 0.5)));
    clouds = [];
    for (var j = 0; j < cloudCount; j++) {
      clouds.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.6,
        r: 90 + Math.random() * 170,
        v: 0.15 + Math.random() * 0.4,
        puffs: [
          [-0.76, 0.10, 0.38], [-0.46, -0.13, 0.56], [-0.08, -0.28, 0.68],
          [0.30, -0.13, 0.52], [0.68, 0.10, 0.36]
        ].map(function (p) {
          return { dx: p[0], dy: p[1], scale: p[2] * (0.88 + Math.random() * 0.2) };
        })
      });
    }
  }

  function drawCloud(c, night, alpha) {
    var g = ctx.createRadialGradient(c.x, c.y - c.r * 0.12, 0, c.x, c.y, c.r * 1.12);
    g.addColorStop(0, night
      ? 'rgba(190,210,245,' + alpha + ')'
      : 'rgba(255,255,255,' + (alpha + 0.12) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    for (var i = 0; i < c.puffs.length; i++) {
      var p = c.puffs[i];
      ctx.arc(c.x + p.dx * c.r, c.y + p.dy * c.r, p.scale * c.r, 0, 6.29);
    }
    ctx.rect(c.x - c.r * 0.78, c.y + c.r * 0.08, c.r * 1.56, c.r * 0.24);
    ctx.fill();
    ctx.restore();
  }

  var WISPS = [
    { at: 0.24, h: 18, amp: 10, alpha: 0.10, speed: 0.22, phase: 0.3 },
    { at: 0.36, h: 26, amp: 16, alpha: 0.12, speed: 0.16, phase: 1.8 },
    { at: 0.49, h: 20, amp: 12, alpha: 0.09, speed: 0.19, phase: 3.1 },
    { at: 0.62, h: 32, amp: 19, alpha: 0.13, speed: 0.13, phase: 4.4 },
    { at: 0.76, h: 22, amp: 14, alpha: 0.10, speed: 0.18, phase: 5.6 },
    { at: 0.88, h: 16, amp: 9, alpha: 0.08, speed: 0.24, phase: 0.9 }
  ];

  // Soft irregular wisps — no hard gray bands.
  function drawFog(animated) {
    ctx.save();
    for (var i = 0; i < WISPS.length; i++) {
      var w = WISPS[i];
      var y = H * w.at + (animated ? Math.sin(t * w.speed + w.phase) * 12 : 0);
      var h = Math.min(w.h, H * 0.045);
      var g = ctx.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, 'rgba(235,239,246,0)');
      g.addColorStop(0.34, 'rgba(235,239,246,' + w.alpha + ')');
      g.addColorStop(0.66, 'rgba(235,239,246,' + (w.alpha * 0.72) + ')');
      g.addColorStop(1, 'rgba(235,239,246,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-40, y);
      for (var x = -40; x <= W + 40; x += Math.max(90, W / 5)) {
        var wave = Math.sin(x * 0.009 + w.phase + (animated ? t * w.speed : 0)) * w.amp;
        ctx.lineTo(x, y - h * 0.52 + wave);
      }
      for (var x2 = W + 40; x2 >= -40; x2 -= Math.max(90, W / 5)) {
        var wave2 = Math.sin(x2 * 0.009 + w.phase + (animated ? t * w.speed : 0)) * w.amp;
        ctx.lineTo(x2, y + h * 0.52 + wave2);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSkyBackdrop(animated) {
    var night = state.day === 'night';

    /* How much light the sky is putting out at this moment. Every branch here
       scales its usual alpha by it, and takes its colour from it, so the sun
       climbs and brightens through the day and goes amber as it drops. */
    var L = skyLight();
    var breathe = animated ? Math.sin(t * 0.5) * 0.03 : 0;

    if (state.sky === 'clear' && !night) {
      // The sun: low and amber at either end of the day, high and gold in the
      // middle, so a clear morning no longer looks like a clear noon.
      var x = W * 0.84;
      var y = H * (0.32 - 0.24 * L.lift);
      // A touch larger near the horizon, where it is closer to the eye.
      var r = Math.min(W, H) * (0.26 - 0.05 * L.lift);
      var pulse = 0.26 * L.bright + breathe;
      /* The disc stays gold and the halo keeps its hue. Both used to be mixed
         most of the way to white, which whitened the sun from the inside out
         on top of the already-pale ramp. A small lift at the very centre is
         all it takes to make the core look hot. */
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(mix(L.colour, [255, 255, 255], 0.15), pulse));
      g.addColorStop(0.28, rgba(L.colour, pulse * 0.62));
      g.addColorStop(0.7, rgba(L.colour, pulse * 0.16));
      g.addColorStop(1, rgba(L.colour, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();

      ctx.save();
      ctx.fillStyle = rgba(mix(L.colour, [255, 255, 255], 0.2),
        0.72 * L.bright + breathe);
      ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, 6.29); ctx.fill();
      // Spokes are a strong-sun thing: they thin out as it drops.
      ctx.strokeStyle = rgba(L.colour, 0.42 * L.bright);
      ctx.lineWidth = 1;
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4 + (animated ? t * 0.025 : 0);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.54, y + Math.sin(a) * r * 0.54);
        ctx.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72);
        ctx.stroke();
      }
      ctx.restore();
    } else if (state.sky === 'cloud' && !night) {
      /* A soft break in the clouds where the light gets through, riding the
         same curve as the sun.

         Daylight only. It used to keep going after dark as pale moonlight,
         which was wrong twice over: a clear night here is stars with no moon,
         so a glow in the clouds implies a light source the app never shows
         anywhere else — and it sat at the sun's own height on the sun's own
         side of the frame, so it read as the sun still being up. After dark
         the sky is lit by its clouds and by nothing else. */
      var cx = W * 0.76 + (animated ? Math.sin(t * 0.14) * W * 0.035 : 0);
      var cy = H * (0.34 - 0.18 * L.lift);
      var gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.2);
      gg.addColorStop(0, rgba(L.colour, 0.18 * L.bright + breathe));
      gg.addColorStop(1, rgba(L.colour, 0));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.2, 0, 6.29); ctx.fill();
    } else if (state.sky === 'fog' && !night) {
      // The sun through fog, doing its best to be seen. Daylight only, for the
      // same reason as the break in the clouds above.
      var fx = W * 0.78;
      var fy = H * (0.42 - 0.14 * L.lift);
      var fr = Math.min(W, H) * 0.18;
      var fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fg.addColorStop(0, rgba(L.colour, 0.20 * L.bright));
      fg.addColorStop(0.2, rgba(L.colour, 0.08 * L.bright));
      fg.addColorStop(1, rgba(L.colour, 0));
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, 6.29); ctx.fill();
      ctx.fillStyle = rgba(mix(L.colour, [255, 255, 255], 0.5), 0.65 * L.bright);
      ctx.beginPath(); ctx.arc(fx, fy, 3.5, 0, 6.29); ctx.fill();
    }
  }

  function drawSkySurface(animated) {
    if (state.sky === 'rain') {
      // Expanding ripples along the bottom edge.
      var count = 4;
      ctx.save();
      ctx.strokeStyle = 'rgba(198,231,255,.60)';
      ctx.lineWidth = 1;
      for (var i = 0; i < count; i++) {
        var phase = animated ? (t * 0.34 + i * 0.23) % 1 : 0.35;
        var x = ((i + 0.5) / count) * W + (animated ? Math.sin(t + i) * 16 : 0);
        var y = H - 18;
        ctx.globalAlpha = (1 - phase) * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, 3 + phase * 11, Math.PI, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
    } else if (state.sky === 'snow') {
      // A quiet drift piling up.
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath();
      ctx.moveTo(0, H - 7);
      ctx.quadraticCurveTo(W * 0.22, H - 24, W * 0.46, H - 9);
      ctx.quadraticCurveTo(W * 0.74, H - 27, W, H - 8);
      ctx.lineTo(W, H); ctx.lineTo(0, H);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawStars() {
    var shown = Math.min(120, parts.length);
    for (var i = 0; i < shown; i++) {
      var p = parts[i];
      ctx.globalAlpha = 0.25 + p.z * 0.55;
      ctx.fillStyle = '#fff';
      var s = p.z > 0.8 ? 2 : 1;
      ctx.fillRect(p.x, p.y, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /* The clouds, with their drift. The still frame and the animated one differ
     only in whether they advance, so the alpha ramp is written out once here
     instead of twice. */
  function drawClouds(night, animated) {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      if (animated) {
        c.x += c.v * (state.sky === 'storm' ? 3 : 1);
        if (c.x - c.r > W) {
          c.x = -c.r;
          c.y = Math.random() * H * 0.6;
        }
      }
      var a = state.sky === 'fog' ? (animated ? 0.32 : 0.35)
        : state.sky === 'clear' ? (animated ? 0.10 : 0.12)
          : (animated ? 0.2 : 0.22);
      drawCloud(c, night, a);
    }
  }

  /* The storm's two halves belong on different layers. The strike is up in the
     clouds, so the roofline should cut it off; the light it throws should wash
     over everything, building included. So: one function, two layers. */
  function drawStormLights() {
    if (!bolt && Math.random() < 0.006) {
      bolt = {
        x: Math.random() * W,
        segs: Array.from({ length: 9 }, function () { return (Math.random() - 0.5) * 44; })
      };
      flash = 1;
    }

    if (bolt) {
      paintOn(farCtx, function () {
        ctx.strokeStyle = 'rgba(255,240,170,.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        var bx = bolt.x, by = 0;
        ctx.moveTo(bx, by);
        for (var k = 0; k < bolt.segs.length; k++) {
          bx += bolt.segs[k];
          by += H / 9;
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      });
      if (Math.random() < 0.25) bolt = null;
    }

    // Still on the near layer, which is where a flash belongs.
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,250,220,' + (flash * 0.16) + ')';
      ctx.fillRect(0, 0, W, H);
      flash -= 0.06;
    }
  }

  // One still frame — used when motion is off, or reduced, or the tab is hidden.
  function drawOnce() {
    if (!nearCtx) return;
    var night = state.day === 'night';
    if (farCtx) farCtx.clearRect(0, 0, W, H);
    nearCtx.clearRect(0, 0, W, H);

    // Far first: the sky the school is standing in front of.
    paintOn(farCtx, function () {
      drawSkyBackdrop(false);
      drawClouds(night, false);
      if (night && state.sky === 'clear') drawStars();
    });

    // Then what is falling around you.
    paintOn(nearCtx, function () {
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        if (state.sky === 'snow') {
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          ctx.beginPath(); ctx.arc(p.x, p.y, 1 + p.z * 1.6, 0, 6.29); ctx.fill();
        } else if (state.sky === 'rain' || state.sky === 'storm') {
          ctx.strokeStyle = 'rgba(180,220,255,.5)';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 3, p.y + p.len);
          ctx.stroke();
        }
      }

      if (state.sky === 'fog') drawFog(false);
      drawSkySurface(false);
    });
  }

  /* The painter is a self-scheduling loop, running only while there is
     something to animate and stopped the instant motion goes off or the tab
     is hidden — no rAF work at all in the still state. */
  var rafId = null;

  function scheduleFrame() {
    if (rafId === null && nearCtx && canvasMotion() && !document.hidden) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function stopFrames() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function loop() {
    rafId = null;
    if (!canvasMotion() || document.hidden) return;

    t += 0.016;
    var night = state.day === 'night';
    if (farCtx) farCtx.clearRect(0, 0, W, H);
    nearCtx.clearRect(0, 0, W, H);

    paintOn(farCtx, function () {
      drawSkyBackdrop(true);
      drawClouds(night, true);

      if (night && state.sky === 'clear') {
        var shown = Math.min(120, parts.length);
        for (var s = 0; s < shown; s++) {
          var sp = parts[s];
          var tw = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + sp.ph));
          ctx.globalAlpha = tw * sp.z;
          ctx.fillStyle = '#fff';
          var size = sp.z > 0.8 ? 2 : 1;
          ctx.fillRect(sp.x, sp.y, size, size);
        }
        ctx.globalAlpha = 1;
      }
    });

    paintOn(nearCtx, function () {
      if (state.sky === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        for (var n = 0; n < parts.length; n++) {
          var q = parts[n];
          q.y += (0.5 + q.z) * 0.9;
          q.x += Math.sin(t + q.ph) * 0.5;
          if (q.y > H + 4) { q.y = -4; q.x = Math.random() * W; }
          ctx.globalAlpha = 0.5 + q.z * 0.5;
          ctx.beginPath(); ctx.arc(q.x, q.y, 1 + q.z * 1.8, 0, 6.29); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (state.sky === 'rain' || state.sky === 'storm') {
        ctx.strokeStyle = 'rgba(175,215,255,.55)';
        ctx.lineWidth = 1;
        var fast = state.sky === 'storm' ? 14 : 9;
        for (var r = 0; r < parts.length; r++) {
          var d = parts[r];
          d.y += (4 + d.z * fast);
          d.x -= 1.4;
          if (d.y > H + 20) { d.y = -20; d.x = Math.random() * (W + 60); }
          ctx.globalAlpha = 0.35 + d.z * 0.4;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + 2.5, d.y - d.len);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        if (state.sky === 'storm') drawStormLights();
      } else if (state.sky === 'fog') {
        drawFog(true);
      }

      drawSkySurface(true);
    });

    scheduleFrame();
  }

  /* ---------------- motion: manual switch + OS preference ----------------
   * The OS "reduce motion" setting always wins over the painted canvas.
   * The manual switch still lets anyone turn the animation off on demand.
   * -------------------------------------------------------------------- */

  function canvasMotion() {
    return state.motion === 'on' && !(prefersReduced && prefersReduced.matches);
  }

  function renderMotion() {
    var on = state.motion === 'on';
    root.dataset.motion = on ? 'on' : 'off';
    if (motionBtn) {
      motionBtn.textContent = 'Motion: ' + (on ? 'on' : 'off');
      motionBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      motionBtn.title = on
        ? 'Turn the moving background off'
        : 'Turn the moving background on';
    }
    /* Turning it back on has to restart the painter, not merely clear a
       flag: while motion is off the loop is not running at all. */
    if (canvasMotion()) scheduleFrame();
    else { stopFrames(); drawOnce(); }
  }

  /* ---------------- boot ---------------- */

  function boot() {
    state.sky = effectiveSky();
    // From the same single source as applySky(), which re-derives both — this
    // is only so the first frame, drawn by renderMotion() below, isn't
    // guessing.
    state.part = resolvePart();
    state.day = state.part === 'night' ? 'night' : 'day';

    buildPresetButtons();
    buildPartChips();
    renderMotion();
    applySky();

    if (motionBtn) {
      motionBtn.addEventListener('click', function () {
        state.motion = state.motion === 'on' ? 'off' : 'on';
        state.motionIsPinned = false;
        store.set('ucvts.motion.v1', state.motion);
        renderMotion();
      });
    }

    if (prefersReduced && prefersReduced.addEventListener) {
      prefersReduced.addEventListener('change', function () {
        renderMotion();
      });
    }

    if (nearCtx) {
      sizeSky();
      if (canvasMotion()) scheduleFrame();
      else drawOnce();

      var resizeTimer = null;
      window.addEventListener('resize', function () {
        // Debounce: phones fire resize constantly while the URL bar hides.
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          sizeSky();
          if (!canvasMotion()) drawOnce();
        }, 150);
      });
    }

    /* The clock being re-pointed — the tester panel, or a ?now= pin — has to
       re-derive the phase, because that pinned time is exactly what decides
       whether this is dawn, day, dusk or night.

       The weather keeps its own 10-minute cadence: the age of a reading is a
       question about the real clock, not the simulated one, so that check
       stays on Date.now() and is deliberately not wired to this. */
    globalThis.UCVTS.clock.subscribe('time', applySky);

    // Fetch now, then every 10 minutes.
    fetchWeather();
    setInterval(fetchWeather, 10 * 60 * 1000);

    // Coming back to the tab: catch up on both the clock and the weather.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      var stale = !state.lastGood || (Date.now() - (state.lastGood._at || 0)) > 15 * 60 * 1000;
      if (stale) fetchWeather();
      else applySky();
      if (!canvasMotion()) drawOnce();
      else scheduleFrame();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Small read-only handle, handy from the console. */
  globalThis.SCHOOLSKY = {
    boot: boot,
    fetch: fetchWeather,
    state: function () {
      return {
        sky: state.sky, day: state.day, part: state.part, live: state.live,
        override: state.override, partOverride: state.partOverride,
        motion: state.motion, sun: currentSun(), temp: state.wx
      };
    },
    setSky: function (name) {
      state.override = name;
      store.set('ucvts.sky.v1', name);
      applySky();
    },
    place: PLACE,
    coords: [LAT, LON]
  };
})();
