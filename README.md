# UCVTS Student Tools

A small suite of everyday tools for a UCVTS student, built around a
**weather-aware A-day / B-day class reminder**. It answers three questions at
a glance: **is today an A-Day or a B-Day**, **what do I have today**, and
**what's coming up next**. Behind it all runs a live sky — real weather, real
time of day — over a photo of the school that changes with the season.

There is no server, no build step, no accounts, and no package manager. It's
plain HTML, CSS and JavaScript, and the whole thing runs in the browser.

## Running it

To work on it somewhere else, clone it first — there is nothing to install:

```bash
git clone https://github.com/Remco28/ucvts-schedule.git
cd ucvts-schedule
```

Then open `index.html`. That's it.

**Except for desktop notifications, which a browser will not give to a `file://`
page.** Opening the file directly works fine otherwise — the on-screen reminders
are unaffected — but the notification button will say "On-screen reminders only"
and stay that way, because there is no way for a browser to tell one local file
from another. Serve the folder instead if you want them:

```bash
python3 -m http.server 8000        # then http://localhost:8000
```

This is the one thing that can look like a bug and isn't, so the card says which
case it is in rather than offering a button that quietly does nothing. If the
pill says `off` while your browser's site settings say notifications are allowed,
the browser is reporting `default` for this address — a different port is a
different origin, and permission belongs to the origin.

## The pages

| page | what it is |
|---|---|
| `index.html` | the landing page: today at a glance and a tile per tool |
| `class-reminder.html` | the class reminder: the day card, the schedule, today's classes, reminder state, the module shelf |
| `focus-timer.html` | the focus timer on a page of its own: the same module shelf carrying the one module, nothing else |
| `calculator.html` | a TI‑84 Plus CE: the real emulator Texas Instruments ships for TestNav, booted into the site theme |
| `todo.html` | the to-do list maker: a folder per class, drag-to-reorder tasks, due dates and stars, saved on the device |

They are deliberately siblings — same stylesheet, same sky, same clock, same
photo. The landing page is not a thinner copy of the reminder page; it is the
front door, and the tiles are the rooms. On every page, the crest and the
title are one link home, and every page carries the same top bar — **Hide the
page** and **Motion: on/off** — so the background can be calmed or tucked away
wherever you are.

## Files

| file | what it is |
|---|---|
| `index.html` | the landing page |
| `class-reminder.html` | the class reminder page |
| `focus-timer.html` | the focus timer page: the module shelf with the one module, and no glue of its own |
| `calculator.html` | the TI‑84 Plus CE page (the emulator itself is fetched from testnav.com at runtime) |
| `todo.html` | the to-do list maker: folders, tasks, lightboxes, the right-click menu |
| `todo.js` | to-do list glue: the saved list, drag-and-drop reorder (folders by their grip, in any row, with a vertical insertion line), the folded completed-tasks section, the lightboxes and the context menu |
| `calculator-page.js` | boots the TI‑84: the XHR proxy, the data-URL wiring, and the plain-language failure if the emulator can't load |
| `home.js` | landing-page glue: the day strip and the reminder pill |
| `styles.css` | all styling, including every weather palette |
| `app.js` | reminder-page UI glue: the day card, the schedule, today's classes, reminder state, the tester panel |
| `calendar.js` | the school year: 182 student days, A/B rotation, closures, and the day emoji map. **Pure logic, no DOM** — it runs in Node so it can be tested |
| `day.js` | how every page says what today is: one summary, one voice. Pure logic |
| `clock.js` | the single source of truth for what time it is, including the fake clock |
| `reminders.js` | **the class reminder engine, owned by the site**: fires heads-ups on any page, owns permission watching and the fire-once memory. Pure logic |
| `sky.js` | fetches the weather and paints it on two canvases; owns the Motion switch, and stops painting entirely while it is off |
| `scene.js` | picks the seasonal school photo, and fades the page away after a minute idle |
| `modules.js` | the module shelf: the registry, the settings, and the container it mounts module cards into |
| `module-pomodoro.js` | the focus timer |
| `verify-calendar.js` | smoke test for `calendar.js` — `node verify-calendar.js` |
| `verify-site.js` | smoke test for `day.js` and `reminders.js` — `node verify-site.js` |
| `dev.html` | developer page: every sky, season and hour side by side |
| `*.png` | the four seasonal school photos plus the crest |

### Load order matters

```html
calendar.js → day.js → clock.js → sky.js → scene.js → reminders.js → page glue
```

`clock.js` has to come before everything that reads the time. `day.js` needs
only `calendar.js`. `reminders.js` needs the clock and the calendar, and
provides the toast and the engine that `app.js` (or `home.js`) speaks through.
`sky.js` and `scene.js` look the clock up when they use it rather than
capturing it at load, so getting this wrong throws rather than silently
falling back to the device clock and disagreeing with the rest of the page.

A module page ends with the shelf instead of page glue:

```html
… → reminders.js → modules.js → module-pomodoro.js
```

`focus-timer.html` is exactly that: the shared stack, then `modules.js` and
the module file. The markup carries the same two module hosts the class
reminder page does, so the shelf's slot lookup finds home there unchanged.
`calculator.html` is the shared stack plus the emulator's script, two data
tags and `calculator-page.js` — it needs no page glue beyond that boot file.
`todo.html` is the shared stack plus one glue file, `todo.js` — it still loads
`reminders.js` on purpose, so the reminder pop-ups keep firing while you plan.

## How the site stays one site

Three things are shared by every page, and each is loaded everywhere:

1. **One clock** (`clock.js`). It ticks once a second, and tells only the
   parts that care when the minute or the date actually changed. Nothing
   else on any page polls.
2. **One reminder engine** (`reminders.js`). It subscribes to that clock and
   decides when a heads-up fires — *whichever page you're on*. The class
   reminder page offers the on/off control and the preview; every page
   receives the pop-up. Turning reminders on once turns them on for the
   whole site, because the setting and the fire-once memory are site-wide.
3. **One voice for the day** (`day.js`, plus the emoji map in `calendar.js`).
   The reminder page's day card and the landing page's day strip both ask
   the same file, so they can never disagree about what today is.

The sky and the school photo come along too — same `data-` attributes, same
palettes — which is what makes the landing page read as the same site rather
than a menu in front of one.

## The rules the code must never break

Nearly every bug this project has fixed was a violation of one of these, so
they're worth reading before changing anything.

1. **The background never lies.** No sun or sun-glow at night, not even a pale
   one — removing the colour is not the same as removing the light. No moon.
   The sky is a weather report, not a place to display progress.
2. **One source of truth per fact.** Day/night is derived from the phase and
   this location's sunrise/sunset, never from a cached flag. The A/B colours
   live in one token pair. The clock decides what time it is, once. What
   today *is* comes from `day.js`; when a reminder fires comes from
   `reminders.js`.
3. **Never rebuild what someone is interacting with.** The schedule's read and
   edit modes are a class toggle, with both the value and its input always in
   the DOM, and the to-do list's completed fold opens and closes in place
   rather than redrawing the board, so the control you just used keeps its
   focus.
4. **Weather is optional.** A failed request must never break the page, and a
   cached reading is labelled as cached.
5. **Nothing leaves the browser.** There is exactly one network request in the
   whole site, and it only reads.
6. **Don't state something false.** If the card says it's an A-Day, it is. A
   confident wrong answer is worse than a vague right one.
7. **A failure must not spread.** One broken module can't stop the ones after
   it from mounting. A notification that fails can't stall the timer that
   raised it — so commit your own state *before* you announce it.

## How the pages update

There is **no polling** on any page. Nothing rebuilds the whole page on a
timer — that habit used to run everything every ten seconds and is what let
parts of the page form separate opinions and drift apart.

Instead, `clock.js` owns the time and tells only the parts that care:

| event | fires when | delivered immediately on subscribe? |
|---|---|---|
| `minute` | the minute changed | yes |
| `day` | the local date changed | yes |
| `time` | the clock was re-pointed (tester panel, or a `?now=` pin) | no |
| `wake` | the tab came back to the foreground | no |

The two state events are delivered once on subscribe, so a subscriber never has
to write its own "and once at startup" call. `app.js` uses `minute` for the
things that genuinely change minute to minute (the countdown and the reminder
preview); the reminder engine uses it for the firing check; `home.js` uses it
for nothing beyond its first render — the day strip only changes with the
date, and its writes are diffed anyway. Nothing else runs.

The weather animation is deliberately **not** part of this. The sky really does
have to redraw continuously, and that's a different kind of job — and only
while motion is on. When Motion is off `sky.js` stops the animation loop
completely and draws one still frame, so nothing is repainting in the calm
state.

The one other timer on the site is the idle fade in `scene.js`: a single
`setTimeout` that dims the interface down to just the school after **one
minute** of no pointer, key or scroll activity, and is cancelled and re-armed
on each interaction (or **Hide the page** to do it now). It never polls — it
is one timeout, replaced rather than accumulated.

## Modules

The focus timer is a module. Each module is one file that calls `register()`
with a description of itself, and everything else follows from that
description: the card on the page, where it goes, what it takes to switch it on
or off. Adding another means adding one file and one `<script>` tag, and nothing
else. There is no module settings panel anymore — the shelf simply mounts each
module from its own defaults — but the machinery to switch one on, off or hidden
is still there behind `U.modules`.
Because the settings and the module's data
are site-wide keys, the same module can be mounted by several pages at once
without being rebuilt per page — `focus-timer.html` is that shelf carrying the
one module today, and a second page mounting it would agree about its state for
the same reason.

### Where a module goes

A module says which of two hosts it wants, and each host takes itself out of
the layout when nothing is in it:

| `slot` | where | for |
|---|---|---|
| `'column'` (default) | inside the right-hand column, under the reminders | anything compact — the focus timer |
| `'wide'` | full page width, below both columns | something that genuinely needs the room — a wide instrument or a big canvas. Unused right now; the host is kept |

The schedule is the main feature, so the default keeps a module *beside* it
rather than letting it claim a row of its own. A module that wants the whole
width has to say so.

### Sound

There is no sound on the site today. The abacus module — which had the
synthesised bead click — was removed; its rules are kept here because any
future sound will want them:

1. **Never before a gesture.** Browsers refuse to start audio without one, so
   a context built at load sits suspended and complains in the console. Build
   it inside the tap that needs it, and reuse it from then on.
2. **Always offer a switch,** in the module itself, and remember the choice.
   And offer it *only* where the browser can actually make a sound — a volume
   control that cannot do anything is worse than no control.
3. **Never load-bearing.** No audio in the browser, no output device, a
   context that throws on creation: the module is silent and in every other
   way identical.
4. **Only on a real move.** Feedback for a gesture, not for a state.

### Two settings that are not the same thing

| | running? | on screen? |
|---|---|---|
| **on**, shown | yes | yes |
| **on**, hidden | **yes** | no |
| **off** | **no** | no |

The middle row is why there are two settings rather than one: a focus timer you
hide is still counting. The bottom row is a promise — switching a module off
unmounts it, runs its `unmount()`, and drops every clock subscription it
registered. Nothing is left working behind your back. No UI exposes these two
settings anymore, but the distinction stays in the code, because it is the
contract `U.modules.set()` keeps.

Settings live in `ucvts.modules.v1` as one record per module, **merged over each
module's own defaults**. That's deliberate: storing a list of enabled ids would
make any module shipped later invisible to everyone who already used the page,
because an absent id reads as off and "turned off" becomes indistinguishable
from "never existed".

A module's *data* lives under its own key instead (`ucvts.module.<id>.v1`), so
switching a module off can never erase it. Off means off, not wiped.

### Writing one

```js
U.modules.register({
  id: 'thing',
  name: 'Thing',
  slot: 'column',          // 'column' (under the reminders) or 'wide' (full width)
  explainer: 'Shown once, the first time it appears.',   // optional
  defaults: { enabled: true, visible: true },
  mount: mount,            // (body, api) => build your DOM into body
  unmount: unmount         // optional: stop your own timers here
});
```

The `api` hands you the clock, `notify()` (the engine's toast plus the system
echo, so a module's notification behaves exactly like a reminder), `listen()`
for clock events that are automatically unsubscribed on unmount, and `data`
for your own storage.

**Declare every variable above the `register()` call.** `register()` mounts you
immediately, and a `var` further down the file is hoisted as `undefined` and
then *assigned* when execution reaches it — which would wipe whatever `mount()`
had just built. The shelf also defers its first draw by a tick to make the trap
harder to fall into, but the ordering is the real rule. `module-pomodoro.js` is
the worked example.

### What the shelf promises a module

- **Failure is contained.** If your `mount()` throws, your card is taken off the
  page and the failure is logged once — and every module registered after yours
  still mounts. Your `unmount()` and your clock subscriptions are wrapped too.
- **`api.notify()` never throws.** Announcing something is never worth losing
  the state change it describes.
- **Registry order is display order**, and stays that way through being
  switched off and on again.
- **Your settings and your data are separate keys.** Being switched off can't
  erase what you saved.

## Local storage

Everything is client-side, so a student's choices can't affect anyone else. The
flip side is that a different browser looks fresh.

| key | holds |
|---|---|
| `ucvts.classpal.schedule.v1` | the student's courses and rooms |
| `ucvts.classpal.fired.v1` | which reminders have already fired today, so they don't repeat — **shared by every page** |
| `ucvts.classpal.simtime.v1` | the tester panel's fake time, if any |
| `ucvts.modules.v1` | which modules are on and shown, and whether each explainer has been seen |
| `ucvts.module.<id>.v1` | one module's own data, kept apart from its settings |
| `ucvts.sky.v1` | a pinned sky, if the user chose one instead of following the weather |
| `ucvts.season.v1` | a pinned season photo, if the user chose one |
| `ucvts.motion.v1` | whether background motion is on |
| `ucvts.todo.v1` | the to-do list: folders, and each folder's tasks with their due date, subject, star and done state |

## Testing

```bash
node verify-calendar.js      # 42 assertions about the school year
node verify-site.js          # 21 assertions about the shared day summary and the reminder engine
```

There's no browser test runner. Verification in this project is done by
**driving a real browser and measuring** — reading pixels, computed styles and
DOM mutations — rather than by reading the CSS and assuming. That's not
ceremony: reading the code has missed real bugs here several times, and
measuring has caught them.

## The developer page

`dev.html` previews any page of the site — landing, class reminder, focus timer,
calculator or to-do list — and pins a sky, an hour, a season, motion, the idle
fade and any date for whatever page is in the frame. Below it, every sky and
every season-by-hour combination is laid out at once, drawn from the real
stylesheet. The tester panel is also reachable from the app itself by typing
`betatesternico` anywhere outside a text field, or by pinning the clock in a URL:

```
class-reminder.html?now=2026-12-28T21:00
```

Following a link never moves the saved state — but it does show the testing
banner, correctly, because the time really is simulated.

## Why things are the way they are

`DECISIONS.md` is a dated log of every decision and the reasoning behind it,
kept because there's no version control here yet and the *why* is the part
that's expensive to rediscover. Read it before changing anything structural.
