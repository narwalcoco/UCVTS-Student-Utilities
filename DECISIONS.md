# Decision log

The project is published at **https://github.com/Remco28/ucvts-schedule**, so
`git log` is one chronology. This file is the other, and the more useful one: it
records what we decided and, more importantly, *why* — the why is the part
that's expensive to rediscover six months from now. Commits say what changed;
this says what it cost to find out.

**Conventions**

- Entries run oldest first. Append new ones at the bottom; don't rewrite old
  ones. If a decision is later reversed, add a new entry saying so and leave the
  original — the reversal is part of the story.
- Update "Where things stand" at the top whenever something moves.
- Dates are local time. Day-granularity is fine; times only where they're real.
- For the file map, how to run things, and the rules the code must never break,
  see `README.md`.

---

## Where things stand

_Last updated 2026-10-06 EDT_

The site is a weather-aware A-day/B-day class reminder for a UCVTS student. It
shows today's status, the student's own schedule, today's classes, and heads-up
reminders. Behind it all is a live sky and a photo of the school that changes
with the season.

**Done:** the clock rebuild — one time authority owns "what time is it", and the
every-ten-seconds page rebuild is gone. The module shelf, and its first two
modules: a focus timer and an abacus. The abacus rebuilt for fingers rather than
for resembling the instrument, given a quiet click, and given a **movable ones
rod**, so decimals became a gesture instead of a rule. And the project published
as a public repository so it can be worked on from anywhere. Since then: the
landing page, the focus timer's own page, the TI-84 calculator page, a fix for
the reminder pop-up that had been silently dead on every page without `app.js`,
the to-do list page (folders, draggable tasks, due dates, stars, all saved on
the device), and a quieter second pass over it — folders that fold while
dragged with a vertical insertion line, finished tasks tucked into a collapsed
fold with a one-tap way to bring one back, and a Hide-the-page button plus the
Motion switch on every page. Since then: the developer page previews every
page, and the module-settings panel (and its button) was removed. A further
pass finally fixed folder dragging in the **lower rows** of the to-do board —
the drag-time collapse was reflowing the grid out from under the pointer and
Chromium was cancelling the drag — and this time it was reproduced and verified
in a real headless browser. Most recently: the **schedule planner** — your
to-do list on a month/week/day calendar, with a recommended day (or days) to do
each piece of work worked out from the class it's for, whether that class meets
on an A-day or a B-day, the deadline, the hours you have each day, and keywords
like "study" and "worksheet" — and the task lightbox shared between it and the
to-do page so one list has one editor. Most recently: a task can carry the
student's own **time estimate** — an optional "Time needed" box in the shared
lightbox — which the planner trusts over its keyword guess.

**Next:** the soroban trainer page, then the reminder list and the emoji.

**Not started:** listed under Open work at the bottom of this file.

---

## The log

### 2026-09-03 22:32 — the original app (reconstructed)

The starting point, and the kid's own work: `calendar.js` and
`verify-calendar.js`. It knows the 2026–27 UCVTS school year — 182 student days,
each one either an A-Day or a B-Day.

The clever part, which we've kept untouched: school days count forward from a
rotation start date, and **closed days don't advance the count**, so the letter
continues correctly after every break, holiday and snow day. The first day of
school is a Welcome Back day with no A/B letter — the rotation starts the day
after. An emergency closure is added to one list and everything recalculates.

It has a smoke test, `node verify-calendar.js`, which is more than most of this
project had for a long time. It's the one file with its own test.

### 2026-09-19 ~11:00 — the school photos and the crest arrive

Five images added: four seasonal photos of the school and the UCVTS crest.

The photos are **feathered cutouts** — transparent above and below — which is
what makes the whole weather background possible: the sky shows through around
the building instead of the building sitting on a rectangle.

### 2026-09-19 — the overhaul (one session, roughly 11:00 → 15:25)

Everything below happened today. It isn't finely datable — file timestamps only
record the *last* write, and most files were edited throughout — so it's grouped
by subject rather than by minute. Entries from here on carry real times.

#### Look and feel

- **A weather-driven background**, borrowing the *behaviour* of the sibling
  project at `~/Dev/teamremco-homepage` and explicitly not its look. Fetch a
  forecast, bucket the weather into a sky, paint it, swap the palette. It never
  fakes live data: a cached reading is labelled as cached, with its age.
- **Four seasonal photos rotate by date**, and the time of day darkens them.
- **The school sits toward the bottom of the page.** When it was centred the
  clouds drifted straight through it and it read as floating. The drop is a
  share of the *photo's* drawn height rather than of the viewport, because the
  transparent band belongs to the image — an earlier viewport-based version left
  a 61px dead strip on a portrait phone.
- **Two sky canvases, far and near.** The school is a CSS background, so no
  single canvas can be both behind and in front of it. Distant things (clouds,
  sun, stars, the lightning bolt) go behind the building; things falling around
  you (rain, snow, fog wisps, the flash, ripples and drift) go in front. The
  bolt is behind while its flash is in front, deliberately: the strike is inside
  the clouds, but its light lands on everything.
- **The page dims the photo with a filter on the photo**, not an overlay. An
  overlay also sat above the far canvas, which turned a gold midday sun into a
  muted blue-grey smudge.
- **One light model drives the sun** — height, brightness and colour together.
  Before it, a clear 7:30am looked identical to a clear noon.
- **The sun keeps its side of the frame** rather than arcing east to west,
  because an arc would cross behind the cards. A deliberate compromise.
- **No moon, and no light source at night.** A clear night is stars and nothing
  else. This took two attempts to get right: the first only removed the *warmth*
  of the night glow, leaving the light source in the sky at the sun's own height
  and column. Killing the colour is not the same as removing the light.
- **The crest sits in the hero beside a larger title**, and the "Remember where
  you're supposed to navigate!" line is gone.

#### Content and layout

- **The day card is one row and the same height every day of the year.** Its
  title row had been eating 66% of its width in empty space. 1000px is the
  narrowest width where even a holiday's facts still fit one row.
- **The two columns are equal and capped**, wrapping on content. The dead zone
  at 1000–1100px (where one column squeezed to 424px while the other didn't) is
  gone.
- **The schedule reads like a timetable.** A filled-in course is a confident
  label, not a text field. An **Edit** button switches the whole table; clicking
  a value drops into that one field. Both the value and its input are always in
  the DOM and the mode is a class, so switching rebuilds nothing, loses no
  half-typed text and drops no focus. An empty schedule opens in edit mode so a
  first-time user sees a form.
- **No per-row A/B bubble.** Each row used to repeat its day letter four times
  over. One group banner per day instead.
- **Today's day group is emphasised, the other is ghosted** — and on a weekend
  or holiday *neither* claims to be today.
- **Course and room carry equal weight**, instead of the room being muted.

#### Reminders

- Established plainly: **reminders are always on** and run in-page. The button
  never turned them on — it only grants operating-system notifications. The
  card's wording had been overstating it.
- **The card collapses once notifications are granted**, to the status pill, one
  line, and the heads-up list: measured 690px → 560px. It deliberately does
  *not* collapse when blocked, because then the tip is the only thing that
  explains how to unblock it and browsers won't re-prompt.

#### Bugs fixed (all by measuring in a real browser, not by reading)

A running theme: every fix so far has been handcuffing two parts of the page
that had formed separate opinions about the same fact. That pattern is what led
to the clock decision below.

- Every class said "on now · ends in ~1 min" at any hour — an epoch timestamp
  was being subtracted from a minutes-from-midnight one, and the result was
  clamped to 1 every time.
- Turning on notifications showed no confirmation at all, because it called a
  function that doesn't exist; the error was swallowed by an empty `catch`.
- The developer page's pinned date showed the wrong season photo, because the
  photo read the real clock while everything else read the pinned one.
- "A-Day · 1st class starts in 10m" jumped a week forward on an A-Day morning.
- The day card's screen-reader region was rewritten with identical content every
  ten seconds.
- A day-off badge showed an emoji ~1.55× the size of the A/B letter at the same
  font size, because a colour emoji fills its em box while a letter's cap-height
  is ~70% of it.
- The moon-and-sun incidents described under Look and feel.

#### Documentation

- This log, plus a `README.md` for orientation. We're deliberately keeping the
  *reasoning*, not just the outcome — and the log exists specifically so the
  project can be picked up later without re-deriving any of it.
- Convention agreed: **dated entries, appended, never rewritten.**

#### The clock — agreed and approved, not yet built

**The problem.** The page rebuilt itself in full every ten seconds — day card,
class list, reminder list, notification line — on the chance one had changed.
That one mechanism is behind most of the bugs above, because it lets two parts
of the page hold separate opinions about the same fact and drift apart. Every
fix so far has been reconciling them after the fact.

**The replacement.** One clock that owns the answer to "what time is it",
*including the test override*, and tells only the parts that care when
something they care about crosses a line. Everything else does nothing. A part
that isn't rebuilt can't lose your typing, can't clobber a timer, and can't
disagree with anyone.

**Explicitly not merged into it:** the weather animation. The sky really does
need to redraw continuously; that's a different kind of job.

**Why this is the biggest upgrade available:** it's the foundation. Both planned
modules are the worst possible tenants for a page that rebuilds itself — a
Pomodoro especially.

**Sequencing, decided:** clock first, alone, tested hard; modules after. The
clock is the change most likely to break something, so it deserves to be the one
where nothing else is moving.

### 2026-09-19 15:25 — the abacus, and which model

Decided: the **Japanese soroban** — one bead above the bar, four below. Not for
authenticity's sake, but because it's the design every video tutorial teaches
(so a kid following along later sees the same instrument), and it's the smallest
design that still teaches the real lesson. Larger abaci add beads and rules
without adding insight.

Also decided, together: the free-play abacus lives on the main page with **the
number it represents shown beside the rods**, and the trainer is a **separate
page**. And the number beside the rods is the point — it means a kid can't
form a wrong idea about what the beads mean, because the number corrects them
instantly.

Recorded in full, because it's the reasoning a future contributor would
otherwise have to reconstruct and the kids are learning it too:

**Layout.** A frame of vertical rods. Each rod is a place value: rightmost is
ones, then tens, then hundreds. Each rod carries five beads — one above the
horizontal bar, four below.

**The bar is zero.** A bead counts only when pushed **against** the bar: the
single bead above counts when pushed *down* (worth 5), each of the four below
counts when pushed *up* (worth 1 each). One rod therefore holds 0–9, and reading
it doesn't involve counting — you see whether the five is down and count at
most four. That's the speed.

**The lesson — the entire point of the module.** The abacus isn't about learning
to add; the kid can already add. It's about making *why fast mental arithmetic
is fast* visible:

- **4 + 3.** The rod shows 4 and there's nowhere to put three more, so you push
  the five down and take back what you over-added: **add 5, subtract 2**. The
  pair 3-and-2 makes five — the "friends of five".
- **8 + 7.** Adding seven would spill past nine, so you move one place left:
  **add 10, subtract 3**. Pairs that make ten: 1&9, 2&8, 3&7, 4&6, 5&5.
- **6 + 7** needs both moves back to back. Add ten, then take back three — but
  you can't remove three from a rod showing 6, because only one single bead is
  up. So you apply the first rule on the way out: remove the five and add back
  two. The rod lands on 3, the tens rod on 1: **13**.

**You never count.** Addition becomes "I added a bit too much, let me take some
back" — precisely how fast human arithmetic works. Do the move with your hands a
few hundred times and it moves into your fingers, then your head. It's a
training device, not a crutch, and it's meant to be outgrown.

**Design warning, and it's a real one.** The *order* of the moves **is** the
lesson. If beads are animated sliding around simultaneously when the correct
sequence is "add the five, then take back two", it teaches the wrong thing.
That's the sun-at-midnight problem dressed as an animation. The movement has to
be honest — and probably performed by the user rather than watched.

**The trainer's shape, when it's built:** show a number and read it → name a
number and build it → give a sum and change the rods **without clearing** (this
is where the whole thing lives) → show the move before it's made, so the reason
is visible even when the fingers get ahead of the understanding. Then speed,
because speed is the game.

### 2026-09-19 15:25 — how the modules will work

Decided, so that it can be built once rather than retrofitted:

- **Both modules must be able to be on screen at the same time.** Agreed early
  specifically because retrofitting it later is painful. Nothing about a module
  may assume it's the only one on the page — modules are a list we loop over
  from the very first one.
- **Enabled and shown are different things**, and they differ in *behaviour*,
  not appearance:
  - enabled + shown → running, and visible
  - enabled + hidden → **still running**, not visible (a collapsed timer keeps
    counting)
  - disabled → **not running**, not visible (nothing works behind your back)
- **Storage shape matters.** Recording "the list of enabled modules" would make
  any module shipped later invisible to everyone who already used the site, and
  would make "switched off" indistinguishable from "never existed". Each module
  gets its own record, merged over defaults, so unmentioned modules just fall
  back and appear.
- **One description per module, not two.** The settings screen builds itself from
  the module descriptions, or every new module means hand-editing the settings
  screen and the two will drift.
- **Turning a module off must not erase its data.** Off means off, not wiped.
- **Modules are never re-mounted by the clock.** They receive a tick and decide
  what to update themselves.
- **Settings are per-browser.** Everything is client-side; there's no server and
  no accounts, so a student's choices cannot affect anyone else. The price is
  that a different browser looks fresh — already true of the class schedule.

### 2026-09-19 15:25 — the Pomodoro

Agreed: 15 minutes of work, then a break, on the framing that anybody can manage
fifteen minutes.

- **It must not count down by subtracting.** Browsers deliberately throttle
  timers in background tabs, and a closed laptop stops them dead. It remembers
  the moment it's due to finish and works out what's left by comparing, so it
  survives tab switches, sleep and reloads.
- **It speaks the sky's language without touching the sky.** The obviously
  beautiful move is to let the background show your progress — but that would
  turn a weather report into a progress bar, which is the same class of lie as a
  sun at midnight. The light, warmth and slow climb belong inside the module's
  own space.

### 2026-09-19 15:30 — the clock lands

Built, and it's the foundation the modules will sit on.

- **`clock.js`** — new file. It owns "what time is it", including the tester
  panel's fake clock and the `?now=` pin, and reports four events: `minute`,
  `day`, `time`, and `wake`. The two state events are delivered once when you
  subscribe, so nothing has to write its own "and once at startup" call.
- **`app.js`** — the ten-second rebuild is gone. No polling timer, and no
  `visibilitychange` listener at all. It listens for the minute, the day, and
  the clock being re-pointed, and does nothing in between.
- **`sky.js`** — reads the clock, and re-derives the phase when the clock is
  re-pointed.
- **`scene.js`** — reads the clock.

The starting position was that three files each answered "what time is it"
differently: `app.js` honoured the saved fake clock, `scene.js` honoured the
`?now=` pin, and `sky.js` honoured neither. That divergence is now structurally
impossible — they ask the same object.

**Verified in a real browser:**

- A-Day 09:21 → "on now · ends in ~2 min", 5 class lines, 7 heads-up rows
- **+1 minute** → "~1 min", and the heads-up list drops from 7 rows to 6. The
  countdown and the list both move on the minute.
- **+1 day** → the card becomes "No school — it's the weekend" and the class
  list empties.
- **One clock move re-derives all three layers together:** a simulated July noon
  gives `summer.png` and a day sky; a simulated December 21:00 gives `winter.png`
  and a night sky.
- **Idle 12 seconds with the real clock: 0 DOM mutations on the page.** The
  timer-driven rebuild is genuinely gone, not just moved.
- 0 script errors, 42/42 calendar checks, no missing element lookups, no
  undeclared CSS variables.

**A real bug the verification caught.** At a *simulated* noon the sky said
**night**. The live reading's sunrise and sunset belong to the real day, so
comparing them against an invented timestamp answers nonsense — a July noon came
out after the real day's sunset. Sun times are now refused outright while the
clock is simulated, falling back to a plain day/night guess, which at least is
about the hour the user asked for. Dawn and dusk can still be previewed exactly,
through the pinned phase on the developer page.

**An earlier plan was wrong, and reading the code corrected it.** I had intended
to fold all three `visibilitychange` listeners into the clock's `wake` event.
Two of them turned out not to be clock concerns at all: `scene.js`'s is about the
idle-fade timer, and `sky.js`'s is about whether the cached weather reading is
stale — and staleness is a question about the *real* clock, so that one stays on
`Date.now()` on purpose. Both are left exactly where they were. `app.js` now has
none, which was the one that mattered.

### 2026-09-19 15:42 — the modules land

Built: `modules.js` (the shelf) plus `module-pomodoro.js` and
`module-abacus.js`, with a settings panel that builds itself from the registry.
Adding another module is one file and one `<script>` tag.

**The three states, enforced rather than described.** On and shown: running and
visible. On and hidden: **still running**, card off the page — a hidden focus
timer keeps counting. Off: unmounted, `unmount()` called, every clock
subscription dropped. That third state is the reason there are two settings
instead of one.

**Storage, as decided:** settings in `ucvts.modules.v1` as one record per module
merged over that module's defaults, so a module shipped later simply appears;
and each module's *data* under its own key, so switching a module off can never
erase it. Settings and data are separate keys on purpose.

**One notification path.** `app.js` now exposes `notify()`: the in-page toast
always, and the system notification when it's allowed. Reminders call it and so
do modules, so they behave identically instead of growing two paths that drift.
The toast also learned to omit its emoji slot entirely rather than render a
blank one, so a module can send a notification with no emoji at all.

**One deliberate exception to the one-clock rule.** The focus timer reads the
*real* clock, not the shared one — because the shared clock can be simulated,
and a simulated clock doesn't tick; it only moves when the tester panel nudges
it. A timer running on it would never finish. Elapsed time is a question about
the real world, exactly like the age of a weather reading, which is the other
place that deliberately stays on `Date.now()`.

**Verified in a real browser:**

- Both modules sit side by side on one row at 1440px and at 1000px, and wrap to
two rows at 760px.
- The timer started, was **hidden for 4.4 seconds, and came back correct** —
  proof that hiding is not stopping.
- It survived a reload with its remaining time intact, then a session that ran
  out advanced to a break, flipped its bar to the cool palette, and raised
  **"Fifteen minutes up"** as a toast.
- The abacus computes: five plus four ones on a rod gives 9, and with a five on
  the next rod, 59. Pressing a counted bead again drops the stack back to it.
- Geometry, measured with motion off: a counted five-bead sits **3px** from the
  bar, a counted one-bead **3px**, an uncounted one **25px** clear, and pushing
  the bottom bead up moves all four together. Nothing escapes the frame.
- Switching the abacus off removed its card **and kept its data**; switching it
  back on restored the same number.
- Switching every module off takes the shelf out of the layout completely.
- 0 script errors, 42/42 calendar checks, no missing element lookups.

**A real bug, and a good one.** Both modules were mounted, rendering, and then
silently inert: clicking a bead threw `Cannot read properties of null (reading
'3')`, and the timer froze mid-display and never advanced.

The cause was one line of ordering. `register()` mounts a module immediately, so
`mount()` runs *while its own file is still being evaluated*. Every `var` below
that call is hoisted as `undefined` and then **assigned** when execution reaches
it — so `var rods = null` and `var api = null` ran straight after `mount()` had
set them, wiping the live state. The module stayed mounted on top of state it
could no longer reach.

Two fixes, deliberately belt and braces: every declaration now sits above its
`register()` call with a comment saying why, and the shelf defers its first draw
by a tick so all module files finish evaluating first. The second one means a
future module author cannot hit this at all.

**A measurement trap worth remembering.** The first readings said the beads
never moved. They did — a CSS transition does not advance under a virtual clock,
so `getComputedStyle` was reporting the value each transition started *from*.
Measuring with the app's own Motion switch off (which sets `transition: none`)
gave the settled values. Worth knowing, since reading the computed style is how
most things here get verified.

### 2026-09-19 15:49 — a review pass over the modules

The module code went in under a token budget, so it was re-read end to end with
fresh eyes and re-tested in a browser. Four real defects, one of them the same
shape as the bug that started this whole rebuild.

**1. A notification that fails could take the session down with it.** In the
focus timer, the work→break path announced *before* it committed: `notify()`, and
only then `start()`. Proven by making `notify()` throw and letting a session
expire — the timer stalled on "5:00 Ready" with no break running, and storage
still held the expired deadline, so a reload would have found that same finished
session and settled it again. The identical run with a healthy `notify()` showed
"5:00 On a break" and a fresh persisted deadline.

Fixed by reordering both branches: finish, save, arm, paint — *then* announce.
The rule is written into the comment so it doesn't get tidied back: **an
announcement is never a precondition for the state change it describes.**

**2. Nothing stopped a module inheriting that exposure.** `notify()` leads to
`showToast()`, which does `host.appendChild()` — so it throws if `#toasts` is
ever missing. That is a part of the page a module doesn't own, and a module's
bookkeeping should never depend on one. `api.notify` now swallows and logs its
own failure.

**3. One broken module took down every module after it.** `mount` called
`def.mount()` bare while `unmount` was already wrapped in a try/catch. A module
that threw while mounting escaped into the shelf's own draw, so `defs.forEach`
aborted: the modules registered after it **never mounted at all**, `host.hidden`
was never recomputed, and the half-built card was left sitting on the shelf,
empty. Measured by registering `boom` (throws) and then `after` (fine): the
shelf showed `["pomodoro","boom"]` — `after` simply absent, with no error shown
to the user.

Now guarded, with the card removed and the failure logged once rather than
retried on every draw. Same run reads `["pomodoro","abacus","after"]`.

**4. The settings panel rebuilt itself under the pointer** — the very habit this
project was rebuilt to end, in miniature. `renderPanel()` assigned `innerHTML`
on every change, so clicking a chip destroyed the chip you had just pressed.
Nothing broke visibly with a mouse, which is why it survived: with a keyboard,
focus fell to `<body>` and the next Tab started again from the top of the page.
Measured — same element afterwards? `false`, `activeElement` `<body>`.

Rows are now built once and *updated*, so the focused chip survives its own
click (`activeElement` stays on it). Escape and the ✕ also hand focus back to
the button that opened the panel.

**Also changed, all small:**

- **Registry order is display order, and now actually is.** Cards were appended,
  so switching a module off and on again could shuffle the shelf — contradicting
  the comment on `defs`. Cards are slotted in at their registry position.
- **The reduced-motion rule claimed a transition that didn't exist.**
  `.pomo-fill` had none, so the override was a no-op. It now has
  `transition: width 1s linear`, matching the once-a-second repaint — the bar
  glides continuously instead of stepping, and motion-off genuinely stills it.
- **Four beads on a rod had four identical accessible names.** 20 beads, 16
  distinct names; a screen reader heard "Worth one, ones rod" four times with
  nothing to choose between them. Now numbered: 20 of 20 distinct.
- The Hide button's tooltip said "without stopping it", which is meaningless on
  an abacus that was never running.

**Re-tested, not just re-read:** a session ending → break running and persisted;
authorisation to fail via a throwing module → later modules still mount; the
chips → card removed on off, back on on, present-but-hidden on hide, focus kept
through all three, order stable; Escape → panel closed, focus on the Modules
button; abacus 0 → 4 → 0 → 4 → 9 → 49 → 9 with the right digits per rod; timer
Start → 14:58 after 2.2s → Paused and frozen, with `left` persisted; 0 script
errors; 42/42 calendar checks; syntax clean on all eight files.

**Left alone on purpose:**

- **Focus after the first-run explainer.** Pressing "Got it" replaces the card,
  so keyboard focus falls to the body — the same shape as #4, but it happens
  once per module per student, and fixing it properly means making the card
  focusable and styling that focus, which is more churn than the annoyance.
- **A background-tab notification can arrive up to a minute late.** Browsers
  throttle timers in hidden tabs, so the completion timeout may fire late. The
  *displayed* time is always right because it's derived from the deadline, and
  the person it's for isn't looking at the page anyway.
- **`U.modules.all()`, `.settings()` and `.refresh()` are unused.** Deliberate
  public surface for future modules, harmless if never called.

**One correction to my own review process.** The first version of this probe
seeded `localStorage` *after* the iframe had loaded, so the app had already read
its state and none of the "A" cases exercised the live path I meant to test. It
looked like evidence and wasn't. Seeding before the load is the difference
between testing the thing and testing a nearby thing.

### 2026-09-19 15:57 — modules move into the column, and a notification state that couldn't update

**The modules moved.** They were a full-width shelf below everything, centred and
capped, which did not line up with either column above it. The user's model is
better and is now the design: the schedule is the **main feature** and must never
be pushed around by a supplement, so the default is for a module to sit *beside*
it, in the right column under the reminders.

Two hosts rather than one, because the abacus genuinely needs more room than a
526–560px column:

| `slot` | where | who |
|---|---|---|
| `'column'` (default) | inside the right column, under the reminders | the focus timer |
| `'wide'` | full page width, below both columns | the abacus |

Each host takes itself out of the layout when nothing visible is in it, so an
unused slot leaves no gap. Both modules are still on screen at once, which was
the requirement — they're just in the places each one asked for. `room:'side'|'wide'`
became `slot:'column'|'wide'`, because it now decides *where* a module goes, not
just how wide it is.

**The abacus went from four places to seven** (up to 9,999,999). Worth being
honest about why: more rods teach nothing new — place value is place value at the
fourth rod or the seventh. They earn their keep by stopping a 300px frame from
reading as a toy, and by giving the wide slot a real reason to exist. The readout
now groups thousands (`5,000,004`) because seven digits in a row is a number you
have to *count* rather than read, and reading it is the whole point.

Measured: seven rods at 72px, **no place label wider than its rod**, no bead
escaping the frame, no horizontal overflow, and the value verifies as
5 + 4 on the millions rod = `9,000,000`, tap the bead at the bar = `5,000,000`,
+ four on the ones rod = `5,000,004`. Beads are now `width:100%; max-width:46px`
so a narrow window squeezes them instead of pushing them out of the frame.

**The real bug of the session: the reminders card could never notice permission
being granted.** `refreshReminderUI()` ran in exactly two places — at load, and
in the page's own button handler. The comment above the load-time call said
"permission can't drift", and that assumption is simply false: the padlock, the
browser's site settings, a managed profile, or a previously-allowed state all
change it with this page uninvolved. The result is the state the user hit — the
card saying **off** with the button still offering to turn it on, and never
collapsing, because granted is the only state where it collapses.

Fixed by watching instead of assuming: `navigator.permissions.query({name:'notifications'})`
with `onchange` where the name exists (Chromium and Firefox both take it;
Safari doesn't, so it's feature-detected and best-effort), plus a re-check on the
clock's `wake` event, which is exactly the moment someone who has just fixed the
setting somewhere else comes back to the tab.

Verified by stubbing the permission and dispatching the wake: `off` / 312px /
not collapsed → `on` / 182px / collapsed, with the lead hidden and the compact
line shown. `permissions.query` resolves in this Chrome (`prompt`, `onchange`
present), so the primary path is live rather than silently dead.

**Still not established:** why the user's page saw `default`. The gap above is
real and produces exactly that symptom, but if they allowed notifications on a
different origin — a different port is a different origin, and permission is
per-origin — then `off` was the *correct* answer and nothing here was at fault.
Worth checking the browser's site settings against the URL actually in use.

**Re-verified after all of the above:** syntax clean on all eight files, 42/42
calendar checks, 0 console errors, geometry re-measured with the app's own Motion
switch off (a CSS transition doesn't advance under a virtual clock — still the
one measurement trap that keeps catching me; my first pass this session read the
beads at their *starting* positions again and I very nearly filed it as a bug).

**And a mistake in my own probe, for the record:** I logged a "label wider than
its rod" figure by comparing a label against `labs[0].width`, which was another
label. It printed a confident `61 vs 48` and meant nothing. The rods were 72px
the whole time.

### 2026-09-19 16:20 — the notification card, second attempt (the first one was aimed at the wrong thing)

The user reported it again after the 15:57 fix: *"I enabled desktop notifications
but the section didn't collapse. It also still shows as off."* So the earlier
work — permission-change watching — had not touched their problem at all. Right
that it didn't; wrong that it was the whole story.

**The reproducible defect: the button could fail completely silently.** Opened as
a `file://` page, clicking "Allow desktop notifications" did *nothing whatsover* —
permission stayed `default`, the pill stayed `off`, the card stayed 312px, no
toast, no message, no error shown. The rejection from `requestPermission()` went
into an empty `catch`. A control run on `http://localhost` proved the difference
was real and not just this headless browser being unable to prompt: there the
same trusted click resolved `denied`, the pill went `blocked`, and the card
changed. Two different outcomes from the same click.

Why the file case was invisible: **`isSecureContext` is `true` on `file://` in
Chrome.** The old tip logic used exactly that flag to decide whether to warn about
being opened as a local file, so the branch was dead code and the warning never
appeared. The protocol is the honest signal; that's what it reads now.

**Fixed, and the rule behind it: a control must never fail silently.**

- `cannotAskBecause()` returns `'no-api'`, `'file'` or `'insecure'`, or null.
  Every one of those now shows the pill as `in-page`, disables the button, and
  says *why* in plain words ("browsers keep desktop notifications for real
  sites — so this one can't send them. Served from http://localhost or https,
  they work too.").
- The click handler no longer swallows anything: `granted` gets the confirmation,
  `denied` explains the block, and a dismissed prompt or a thrown request now
  says so in a toast instead of nothing happening.
- A `focus` listener joins `permissions.onchange` and the clock's `wake`, because
  "I fixed it in the browser's own settings and came back" is the flow none of
  those three went through on its own.

Verified: file:// → `in-page` / disabled button / explanatory tip; identical
click on localhost → toast *and* `blocked`; permission granted behind the page's
back then a real focus event → `on`, 312px → **182px**, lead hidden, compact line
shown. Syntax clean, 42/42 calendar checks.

**What I still don't know, stated plainly:** whether the user is on `file://`, on
a different origin from the one they granted, or looking at a browser that really
is reporting `default`. All three produce what they described, and the page now
distinguishes them on screen — the pill and the line under the button say which.
`Notification.permission` in the console is the ground truth.

**A note on the first fix, kept because it was still right:** permission genuinely
can change with this page uninvolved, and the page genuinely only looked at load
and at its own button. That was a real if secondary gap. It just wasn't the one
producing the symptom, and I should have measured before shipping a fix for it
rather than after.

### 2026-09-19 16:34 — diagnosed: the page is being opened as a local file

The user's console read `Notification.permission` → `default`, and the card now
said `in-page` / "On-screen reminders only". That combination **names the cause on
its own**, and the evidence is worth writing down because it's easy to re-derive
wrongly later:

| where the page is opened | `Notification.permission` | our card |
|---|---|---|
| `file://` | **`default`** (measured) | `in-page` (can't ask) |
| `http://localhost` | `default` until asked | `off`, button live |
| `http://192.168.x.x` (not secure) | **`denied`** (measured) | `in-page` (can't ask) |

So: the permission is readable at all, which rules out "API missing". `default`
rules out the insecure-address case, because Chrome reports that one as `denied`.
`in-page` means one of the three "can't ask" reasons fired. Only `file://` fits —
and it fits everything else too: no prompt ever appeared (a file gets no
permission prompt, so `default` is *correct*, not broken), the button used to do
nothing, and `isSecureContext` is `true` there, which is why the old warning
never showed.

**The incognito question, answered:** incognito does not inherit permissions from
the normal session — it has its own temporary store and throws it away when the
window closes. But it wasn't the variable here. On `file://` no browser will grant
this, incognito or not, because there is no way to tell one local file from
another. That is why it can sit at `default` forever.

The fix is a command, not code: serve the folder and open `http://localhost:8000`.
The README now says this at the top rather than leaving it as a footnote.

**One code change from this round:** those two unchangeable states now get the
`warn` styling rather than quiet grey text. The entire two-day thread came from a
card that looked inert and explained itself in small print, which is its own kind
of lie.

---

### 2026-09-19 16:36 — the abacus is rebuilt for fingers, not for a mouse

Asked for: optimise the abacus for touch rather than for looking like the real
instrument, since a 3D object's affordances do not survive the trip to glass.

**The diagnosis mattered more than the fix.** The beads were 18px tall with 3px
gaps and 14px of reserved room below the last one, so roughly a quarter of every
rod did nothing when tapped — and dead space is invisible to a fingertip, which
cannot see where the gaps are. The problem was never only that the shapes were
small.

**Decided: the frame is one tap surface.** Touch it anywhere and the nearest rod
across takes the tap and the nearest bead down that rod is the one you meant.
There is now nowhere on the frame that does nothing when tapped, including the
gaps between beads and the bar between the rows. Taps outside the frame — on the
number, on the controls — stay inert, because those are not bead moves.

**Every reading comes from the live layout, not from pixel arithmetic.** The
nearest rod and bead are found by measuring the elements, so the bead size can
change later without the hit-testing quietly going wrong. Same rule as the CSS
variables below, applied on the scripting side.

**Decided: bead size and bead travel became one decision, so they are one
variable.** They had been two hardcoded pixel values that happened to suit an
18px bead — `translateY(22px)` and `padding-bottom: 14px` — which is exactly the
kind of agreement that stops being true. Beads are 28px, travel 24px, and the
whole envelope now derives from `--bead-h` and `--travel`.

**Decided: finger-sized everywhere, with no `pointer: coarse` media query for
touch devices.** Two designs would mean the thing I measured is not the thing a
mouse user gets, and a rule I cannot run is a rule I cannot check. One target
size is the more honest choice.

Also in this pass: `touch-action: manipulation` on the frame and the beads (no
double-tap-to-zoom delay), no text selection or long-press callout, a brightening
under the finger as the only proof a tap landed before the 160ms move finishes,
and the Clear link became a 42px button, because a finger needs a target rather
than an underlined word.

**One note on the instrument's honesty, which is the rule here:** one tap is
still one real move, and tapping a bead inside the stack pulls the whole stack
back to it, which is what a finger does on the real thing. Tapping the bar
toggles the five bead, because the bar sits nearer the five than the first lower
bead. That falls out of "nearest thing wins" instead of being a special case.

Verified with 33 browser checks: a tap squarely on a bead, in the *gap* between
two beads, on the bar, in the room reserved below the last bead, on both frame
edges, and in the gap between two rods all move the nearest bead; a tap on the
number is inert; a keyboard press is exact rather than snapped; counting a bead
pulls it its 24px up to the bar and moves no neighbour; and the arithmetic,
readout and Clear all still behave. Geometry measured with transitions off,
because a CSS transition does not advance under a virtual clock.

### 2026-09-19 16:39 — the project becomes a public repository

Asked for: a public GitHub repo so the user's son, who wants to work on the
project too, can clone it.

Created **https://github.com/Remco28/ucvts-schedule** — public, `main`, and
deliberately **no licence**, which leaves it all rights reserved by default.
Checked before publishing rather than after: the only network call in the whole
project is the weather lookup, and `open-meteo` is keyless, so there is no API
key or secret anywhere in the tree to leak. No personal names either — the
schedule is entered by whoever uses the page, and the calendar file names nobody.

**Recorded because it is permanent and public:** the four school photographs and
the school logo are now publicly hosted and stay in the git history. That is
~4.2 MB, which is very nearly the whole repository. Flagged to the user before
pushing; they chose to include them, and the page needs them to render.

The tree is versioned from here, so `git log` becomes a second chronology
alongside this one. This file stays the record of *why*.

### 2026-09-19 16:47 — a quiet click on the beads

Asked for: a gentle clicking sound on the abacus, to help in training, and
nothing loud enough to disrupt a classroom.

**Decided: synthesise the click rather than ship a sound file.** No asset to
fetch, and a wooden click is a short noise transient over two fast-decaying
partials — a thing you can draw directly rather than record.

**Decided, and this is the more interesting half: each rod carries its own
pitch.** 300 Hz at the millions rod rising to 510 Hz at the ones rod, so place
value becomes something a student can *hear* rather than something they have to
remember. That is the same job the readout beside the frame does visually. The
spread is deliberately narrow — a family of related clicks, not a tune — and the
peak gain is 0.055, far below anything that would carry across a room.

**Decided: the switch lives in the module, remembers itself, and is offered only
where the browser can actually make a sound.** A volume control that cannot do
anything is worse than no control. The bead list and the sound choice now share
the module's single storage key as an object; a bare array is the older shape
and still reads.

**Deliberately silent:** Clear, and tapping the number beside the frame. Neither
is a bead moving, and the click is feedback for a move.

**Nothing about it is load-bearing.** No context is built at load, because
browsers refuse to start audio without a gesture and one built at load would sit
suspended and log a warning. No audio in the browser, no output device, or a
context that throws: the abacus is silent and otherwise identical.

#### A bug the verification caught, and a bug the verification *hid*

**Caught:** the first version of the per-rod pitch was **inverted** — it made
the millions rod the highest and the ones rod the lowest, the exact opposite of
the intent. My assertion compared the lowest frequency against the highest
across two clicks, which passed happily while the rods were upside-down. It
asserted a *range* where it needed to assert a *direction*. It now states the
direction, and fails on the inversion.

**Hid:** the guard against a bead being hit many times in one instant was keyed
on time alone, so a fast move from one rod to another got swallowed — which is
something a real hand does and a robot does not. It is now keyed per rod, so
only a machine-gun repeat on one bead is dropped.

**And one probe mistake, recorded because it is the third time I have made it:**
the probe ran every tap synchronously, in well under a millisecond, so every tap
after the first landed inside that 20ms guard and four assertions failed against
correct code. Real input has real gaps, and a probe that does not is not
measuring the thing it claims to. The probe is now a queue with a real delay
between actions.

Verified with 34 browser checks: no `AudioContext` at load and exactly one built
on the first bead tap; one noise burst and two partials per click, all three
reaching the output; the envelope written is 0.000 → 0.055 → 0.000 alongside
0.020 and 0.035 for the partner partial and the tick, nothing above 0.06; three
taps spaced like a finger make three clicks; two rods struck in the same instant
both click; Clear and the number are silent; a keyboard press clicks; the ones
rod is pitched **above** the millions rod, 510 Hz against 300 Hz; switching off
is silent and switching on clicks once in confirmation; the choice and the frame
both survive a reload; a frame saved before the switch existed still reads back;
with no audio at all the abacus mounts, offers no switch, and still works; and a
context that throws on creation does not stop a bead. Layout re-checked after the
readout grew to hold two buttons — frame 658px and readout 176px on one row, both
buttons 42px tall, 35 beads in 7 rods, none escaping the frame, no horizontal
overflow. Calendar regression still 42/42.

---

### 2026-09-19 17:00 — the ones rod moves, and every label moves with it

Asked: how do decimals work on an abacus at all, does the module need to support
them, and would a decimal button that changes the labels be a good way in?

**The finding, since it is the whole design.** A soroban has no decimal point on
it. A rod's meaning is entirely positional, so the operator designates a rod as
the ones rod, and *that decision is the decimal point* — rods to its left are
whole numbers and rods to its right are tenths and down. Confirmed against
Wikipedia's soroban article and Bernazzani's *Soroban Abacus Handbook* rather
than from memory, because this is being taught to children. Two facts from those
sources drove the design:

- The soroban carries **a dot every third rod**, and any one of them may be
designated the unit rod. It is a unique feature of the soroban — the Chinese
suanpan does not have it.
- The canonical example is **8036 becoming 80.36 by moving no beads at all**: the
  user places the digits so the `0` lands on a marked rod. Same digits, same
  order, different reading.

**Decided: a mark you move, not a mode button.** The user's instinct that the
labels should change was right — relabelling the rods *is* what choosing a unit
rod does. But framing it as a button that switches the frame into a decimal state
would teach the opposite of the truth: it implies decimals are a different kind
of number in a different state of the machine, when in fact not one bead changes.
A fixed-position toggle would also have to guess where the point goes, where the
real instrument lets you put it anywhere.

**Decided: a mark per rod, with the frame's own dots emphasised.** Every rod can
be designated, which is what the sources say and what makes single-rod shifts
possible — a shift of one rod is exactly a tenfold change, and that is the
lesson. The three every-third-rod marks a real frame carries are drawn as full
dots and the rest as finer ticks, so the instrument's own convention is visible
without restricting the choice to it. The dots live on the reckoning bar, where
they are on a real soroban.

**Decided: labels derive from the ones rod; trailing zeros are dropped.** The
hardcoded `PLACES` list is gone, because the labels were never facts about rods,
they were a reading. `thousandths` is eleven characters under a 72px rod, so the
label font now scales with its own rod via a container query, with the plain size
as the fallback — I cannot see the result, so measuring it is the only way to be
sure it fits. Measured at four window widths and five ones-rod positions: the
worst label clears its rod by 6.3px.

**Decided: the click's pitch follows the ones rod.** The user was indifferent and
explicitly did not want to create work; it turned out to be a small change with a
real payoff, so it went in. A rod's voice is a statement about its place value,
and place value is now relative, so the ones rod always sounds at 450 Hz wherever
it sits and moving the mark slides the whole frame's voice with it. Coming out of
the click at 280–620 Hz, the ones rod lands on 450 Hz at every unit position.

**Deliberately changed:** tapping the bar used to toggle the five bead, because
"nearest thing wins" made the bar closest to it. The bar is now the unit control,
and a tap in the gap between two marks is inert rather than falling through to a
bead the finger never touched.

**Storage gained a third field.** `unit`, alongside the beads and the sound
choice, with a clamp: a rod that does not exist, or a value that is not a number,
falls back to the rightmost rod. Both older shapes still read — the bare bead
array from before the sound switch, and the object from before the ones rod
moved.

#### A directional error caught before it shipped

I wrote the header comment and the explainer saying shifting the mark made the
same beads worth *ten times less*, without saying which direction. Working it
through, shifting the ones rod **right** makes every exponent larger, so the same
beads are worth ten times **more**; shifting left divides by ten. The Wikipedia
example agrees — 8036 to 80.36 moves the ones rod left. Corrected in both places,
and the direction is now pinned by a test in each direction.

This is the second time in two sessions that I have got a direction backwards in
this module, the first being the inverted per-rod pitch. Both were caught by
writing the assertion as a *direction* and not as a range or a magnitude.

#### Verified in the browser

The two probe assertions that failed first were both my arithmetic, not the code:
I miscounted which place a rod occupied, and I compared a bead's name against a
word that was only correct at the previous ones-rod position. The second is now
checked against whatever the same rod's own label says, so it cannot go stale.

34 checks plus a label-fit sweep. The rightmost rod is the ones rod to begin
with and the names are the old ones; three marks are drawn as the frame's dots;
tapping the mark over rod 4 re-derives every name to `thousands hundreds tens
ones tenths hundredths thousandths` with **the beads untouched** (`0003140`
before and after) and the readout showing `3.14`; one rod right gives `31.4` and
one rod left gives `0.314`; a fraction of 300 thousandths reads `0.3` and not
`0.300`; with everything whole again the point disappears (`300`); the ones rod
sounds at 450 Hz at both unit positions while a rod that stops being the ones rod
slides from 450 Hz to 478 Hz; every one of the 14 beads is named after the place
its rod is currently showing; a tap between two marks is inert; every mark sits
under its rod to within a pixel; no bead escapes the frame; no horizontal
overflow; the marks have a 28px tap target; the ones rod and its labels survive a
reload; and both older storage shapes read back, including nonsense values for
the unit. Calendar regression still 42/42.

### 2026-09-30 — the site becomes a site: a landing page, and reminders that follow you

Asked for: a **student utilities website** — a home page styled like the class
reminder page, with icons that go to each tool — the class reminder first —
and, explicitly, the abacus removed. The reminder was to keep reminding
regardless of which page is selected, and the whole thing to stay light on
RAM and CPU.

**The abacus is gone.** `module-abacus.js` deleted, its script tag with it,
and its ~255 lines of CSS out of `styles.css` (the reduced-motion override
kept only the rule that still had a transition to still: `.pomo-fill`). The
sound rules it established are preserved in the README, because any future
sound will want them and re-deriving them cost a session. Nothing else
referenced the module: the shelf never special-cased it, which is the module
system doing its job.

**The old page became a page, not the site.** `index.html` →
`class-reminder.html`, and a new `index.html` is the landing page: crest,
title, a day strip, and a tile per tool. It borrows the reminder page's
entire visual system — same tokens, same `.card`, same `.day-badge`, same
`.pill` — so the two pages read as one site. The only new shapes are the
tile row and the strip's side column.

**The decision that makes the request true: reminders are now the site's,**
not the reminder page's. A new `reminders.js` loads on *every* page and
subscribes to the clock itself. The engine owns the firing check, the
fire-once memory, permission watching, and — because a heads-up can land on
a page with no other UI of its own — the toast. `app.js` is now purely the
reminder page's face: the card, the button, the preview; it asks the engine
`status()` and calls `ask()` rather than deciding anything itself. That
split is the difference between "the button moved" and "any page reminds
you": the *control* lives on the tool page, the *behaviour* lives with the
site.

**Cost, measured against the constraint that mattered.** Zero new timers.
There was exactly one `setInterval` on the site before (the clock's 1s
tick) and there is exactly one after; the engine rides the clock's `minute`
event, whose subscriber already runs at most once a minute. The home page's
live surface is a day strip and a one-line reminder state, both diffed
before writing; nothing on it is minute-resolution, so its minute
subscription is one immediate render and nothing after. Sky and scene are
shared unchanged — one weather request, whatever page you're on.

**One voice per fact.** `day.js` now owns "what today is" (wording and
emoji) for both pages, and the emoji map moved into `calendar.js` where the
reasons are defined. The landing page states reminder *state* but
deliberately does not offer the ask — one control, on the page about
reminders, or two states drift.

**Deliberately not done:** moving the focus timer to its own page (the tile
says where it lives today), and rebuilding the abacus (the tile promises
it). Both are now one file and one `<script>` tag away — which is the point
of the shelf, and of the tiles.

---

### 2026-10-01 — three pages deep: the timer gets its own page, and a TI-84 arrives

**The ask:** the crest and the title on the class reminder page go home when
you click them; the focus timer gets its own page, styled to the site; and
"the calculator from this repo" becomes another page.

**The way home is the crest.** Both header pieces — the round crest and the
h1 — are now one `<a class="hero-home" href="index.html">` on every page,
including the landing (where it links to itself, deliberately: the header
gesture is now site-wide muscle memory, and a self-link that reloads the
front door beats one page that behaves differently for the same click). The
hover speaks on the crest's shadow ring and the title's glow, not on a
transform — the bob animation already owns transform on `.hero-logo`, and a
hover lift would fight it every frame.

**The focus timer page reuses the module, it doesn't rebuild it.**
`focus-timer.html` carries the same two module hosts (`#modulesCol`,
`#modules`) and loads the same two scripts (`modules.js`,
`module-pomodoro.js`) the class reminder page does — with zero page glue.
The settings key (`ucvts.modules.v1`) and the timer's data key
(`ucvts.module.pomodoro.v1`) are shared, so both pages show one and the same
timer: start it here, walk over there, and it's still counting; switch it off
from the class reminder's Modules button and it unmounts on this page too.
The page's only own CSS is `.stage`, which centres the column host and turns
the same card up a little — bigger digits, taller track — so it reads as an
instrument on a page of its own rather than a sidebar widget missing its
sidebar. The class reminder page keeps the shelf and its column host, ready
for the next module; it just no longer loads the pomodoro file.

**The calculator is the real TI-84 Plus CE, from TestNav.** There was no
calculator in this repo — the user was thinking of the emulator Texas
Instruments ships for TestNav, the platform New Jersey's state tests run on,
as wrapped by ti84.pages.dev. That site's whole recipe is three moves, and
`calculator.html` + `calculator-page.js` do the same three: load
`ELG-min.js` from `mn.testnav.com`, point the `TI84PCE` constructor at
TestNav's ROM (`.h84statej`) and faceplate SVG through two
`<script type="application/json" data-url>` tags, and proxy `XMLHttpRequest
open` so the `#` suffixes the emulator reads back off its own URLs get
stripped from the requests. None of the emulator's ~3 MB lives in this repo;
mn.testnav.com serves it CORS-open to every test browser in the country, so
it serves it to us too (verified with curl: all four URLs return
`access-control-allow-origin: *`). The data tags stay empty here — an empty
tag means "fetch data-url", the same switch ti84.pages.dev uses — so a
future offline build that inlines the ROM into those tags changes no code.
What we added beyond the recipe: `body.ti84` re-says the site's body shape
after tn.css sets `body { padding: 0 !important; display: flex !important }`
(a class instead of a second stylesheet tag, so the cascade stays local and
readable). tn.css also carries Bootstrap-era defaults that land on this page
alone because it loads after styles.css — `body { color: #333 }` and
`h1 { color: inherit }` turned the hero title dark grey, and its `h1` rules
won the title's margin, size, weight and line-height too — so the same class
restates the site's text color and the whole title treatment at a
specificity (`body.ti84`, `.ti84 h1`) tn.css can't outrank. And the page has
a voice when the network fails — the emulator's
script tag fails silently, so the missing `TI84PCE` global is the failure,
and `calculator-page.js` turns that into a plain-language message instead of
an empty card.

**Honesty about the calculator's reach.** The landing page's footnote says
the emulator's files come from testnav.com and that the calculator page
needs the internet — the calculator page itself carries no prose, at the
user's request (its only words are the failure message). It also uses TestNav's host rather than TI's own distribution —
not our first choice, but it's the only place these files are served
CORS-open today, and it's exactly where the NJSLA serves them from.

### 2026-10-01 — the pop-up that was never asked, the to-do list, and a door to Classroom

**The ask:** a focus-timer pop-up wasn't appearing when a session finished;
the landing page got two new tiles — a to-do list maker, and a one-click jump
to Google Classroom's not-turned-in work.

**The pop-up bug was a name collision, and the clock's own shape hid it.**
`reminders.js` declared **two functions called `announce`**. The first,
`announce(emoji, title, body)`, is the real one: it paints the in-page toast
and, if the OS allows it, echoes it as a system notification. The second,
further down the file, was the permission-change watcher and took no
arguments. Because function declarations hoist, the second `announce` won the
name for the whole scope — so `U.reminders.announce`, and therefore `U.notify`
and `app.js`'s `var notify = U.reminders.announce`, pointed at a function that
only reacted to permission changes and never showed anything. The class
reminder page read as working only because it had a second toast path; the
focus timer, which has no `app.js` and so no `U.notify`, had nothing at all.

Fixed by renaming the second one to `announcePermission` (its four call sites
followed: `ask()`, the `permissions.query` `onchange`, the clock's `wake`
subscription, and the `focus` listener — all four exist to re-check permission,
which is exactly what the name now says). One line at the end of the file's
boot also promotes the real announcer to the site-wide name:
`U.notify = U.reminders.announce;`. That is the second half of the point: the
module shelf's `api.notify` was already written to no-op safely if `U.notify`
is missing, which is why the failure was silent rather than loud — but the
assignment means *every* page now has a working notifier, not just the ones
with page glue.

**The to-do list is one saved shape and one render pass.** `todo.html` is the
shared page scaffold (sky, photo, hero-home, toasts) with a lightbox per
entity and a right-click menu; `todo.js` owns everything else. The saved data
is `ucvts.todo.v1`:

```
{ folders: [ { id, name, tasks: [ { id, name, due, time, subject, done, important } ] } ] }
```

Every interaction writes straight to that object and re-renders, so what's on
screen is always what's in storage. Tasks drag within their own folder; folders
drag by a grip to reorder; a drop writes the moved index and re-renders. A
task's done circle toggles `done`; the star at the right edge toggles
`important`. Due dates are shown under the task name in the site's red
(`--danger`), and `fmtDue()` renders the date and 12-hour time rather than the
raw `<input>` string.

**The subject list is read from the reminder page's own storage, not typed
again.** `todo.js` reads `ucvts.classpal.schedule.v1` and walks `U.ROWS` in
schedule order, so the classes offered in the task lightbox are the same
courses the reminder page shows — deduplicated, blanks skipped, and with an
"Other…" choice that reveals a text box for a club or a class the schedule
doesn't have. A subject saved under a course that has since left the schedule
is kept rather than dropped. The two pages share one source of truth without
this page depending on that page's code: if `calendar.js` never loaded, it
falls back to the schedule object's own keys.

**Google Classroom is a link out, and the landing page says so.** The tile
points at `https://classroom.google.com/a/not-turned-in/all` and opens in a
new tab with `rel="noopener noreferrer"`; its arrow is `↗` rather than `→`,
which is the one visual cue on the page that a tile leaves the site. It is the
first tile that isn't one of ours.

**Verified:** syntax clean on every changed file; 42/42 calendar checks;
21/21 site checks (which load `reminders.js`, so they cover the rename);
styles.css braces balanced; and structural checks over both HTML files and the
new CSS. No browser is available on this machine, so the drag, hover and
lightbox behaviour was verified structurally — the honesty note in `README.md`
still applies.

---

### 2026-10-04 — the to-do list quiets down, and the switch that forgot to restart

**The ask:** make folder dragging easier to see; move finished tasks out of the
way into a collapsed fold, with a way to bring one back and a way to clear
them; add a Hide-the-page button and auto-hide; put the Motion switch on every
page; and make Motion actually restart the background the first time it is
turned back on.

**Folder drag shows the gap it will land in.** The board stays a grid (the
user chose this over folding into a single column), but the moment a folder
leaves the ground every folder folds to its header — tasks, the add button and
the completed fold all hide — and a vertical bar is drawn in the gap between
the two folders the drop will land between. The target is the folder under the
pointer, and the side is decided by which half of it the pointer is over; the
dragged folder is skipped so its own gap is never offered. The old
border-highlight (`is-drop-target`) is gone. The move is a splice into that
gap, with the index corrected for the folder first being lifted out
(`moveFolderToIndex`), and the four-folder edge cases were walked by hand.

**Finished tasks fold away, and un-completing returns them to their spot.** A
task is *not* reordered when it is completed. The render splits each folder's
one task array into open and finished, so the array order is the original
order: a task marked done leaves the open list, and un-marking it drops back
exactly between the same neighbours it had before, because nothing ever moved
it. The fold starts collapsed on load (an in-memory set of open folders, empty
at boot — no storage key, so a reload is a fresh start), and opening it toggles
the list in place instead of rebuilding the board. The folder's three-dot menu
gained **Delete completed**, shown only when there is something to delete.
Finished tasks are not draggable and cannot be drop targets.

**Hide the page is on every page now, and the wait is one minute.** `scene.js`
already owned the idle fade and the `focusBtn` wiring; the change is the button
on every page (same `id`, so no new glue) and `IDLE_MS` lowered from three
minutes to one. That number is stated plainly: content auto-hides after **one
minute** of no pointer, key or scroll activity, and any of those — or a
reminder popping up — brings it straight back. It is still one replaced
`setTimeout`; nothing polls.

**Motion on every page, and the switch now restarts the painter.** The toggle
was only on the class reminder page; it is now in the top bar of every page
(again, the same `id`, so `sky.js` needed no new wiring). The real bug was in
`sky.js`: the paint loop is a self-scheduling `requestAnimationFrame` chain
that was *started once at boot only if motion was on*. Turn motion on from a
state that began off and there was no loop to resume — one frame was drawn and
then it froze, which is exactly why visiting another page (a fresh boot with
motion already on) appeared to fix it. The loop is now `scheduleFrame()` /
`stopFrames()`: started when motion turns on, cancelled when it turns off or
the tab hides, and restarted on the way back. That also removes the animation
work that used to keep ticking while motion was off.

**Efficiency held to:** no new timers and no polling anywhere. The fold toggle
edits the DOM in place; drag feedback is event-driven; the hide button and the
idle fade share the one existing timeout; and turning Motion off now costs zero
animation frames.

**Verified:** `node --check` clean on every JS file; 42/42 calendar checks;
21/21 site checks; styles.css braces balanced (367/367); the folder-move
algorithm exercised against the four-folder edge cases; and structural checks
that every page carries both buttons, that `scene.js` reads one minute, and
that `sky.js` starts and stops its loop. No browser is available on this
machine, so the drag, hover and fold behaviour was verified structurally — the
honesty note in `README.md` still applies.

---

### 2026-10-04 — a page picker on the developer page, and the Modules button goes

**The ask:** remove the Modules button; then remove the module-panel assets
entirely; make the developer page accurate and relevant to testing the site as
it is now and have it fit the window; fix folder dragging so folders in every
row can be moved; make the calculator's landing-page icon bigger and lifted a
few pixels; and confirm the background motion switch does no work while off.

**The Modules button is gone, and its panel with it.** The button opened the
module-settings panel — the only control for the shelf's on / hidden / off
settings. But the class reminder page mounts no module at all (it loads the
shelf, but no module file), and the focus timer lives and loads on its own page,
so the button opened a settings list for nothing. The button, the panel markup,
the panel-only CSS (`.modules-panel`, `.module-row*`) and the panel-only JS
(`renderPanel`, `setPanelOpen`, `buildPanelRows`, `chip`, `setChip` and the
`wire()` wiring) are all gone. `modules.js` is now just the shelf: register,
merge settings over defaults, mount/unmount, and the public `U.modules` handle —
`set()` is still there, so the on / off / hidden machinery survives for a future
panel. The module's now-unused `blurb` was dropped too. The focus timer page's
footer no longer points at the button, and `README.md` says plainly that there
is no settings panel.

**The developer page can preview every page.** `dev.html` was hardwired to
`class-reminder.html`; it now has a **Page** row — landing, class reminder,
focus timer, calculator, to-do list — and builds the preview URL from the
chosen page plus the pins. The other controls stay because they are still
exactly right: sky, time of day, season, motion, idle fade, clock/day-card
presets, and preview width. The lede, the "Idle fade" label (was "Page") and
the notes were rewritten to match the site as it is. It was also restyled to fit
the window: the page is width-fluid with viewport-scaled side padding, the
preview frame is `clamp(320px, calc(100vh - 250px), 880px)` tall so it never
pushes the layout off-screen, the controls column is sized to the viewport
(`minmax(290px, 24vw)`) and scrolls inside a sticky card instead of running past
the bottom, and both collapse to one column below 1040px. The two palette grids
("All twelve skies", "Every season, every hour") are still accurate and stay.

**The calculator icon, bigger and lifted.** `🖩` is a thin monochrome glyph and
reads smaller and lower than the emoji beside it, so `.tool-c .tile-icon` is set
to 36px and the glyph is wrapped in its own span, translated up 4px, so only the
glyph moves and the tile stays aligned with the rest. The emoji tiles are
untouched.

**Folder dragging works in every row now.** The drop target used to be whatever
element was under the pointer (`e.target.closest('.todo-folder')`), which only
ever resolved to folders in the row the pointer happened to be in — from the
second row on it rarely registered, so only top-row folders could be moved. It
is now decided by measuring every folder and taking the one whose centre is
nearest the pointer, so it behaves the same in any row and in the gaps between
cards. The nearer half of that folder still picks the before/after side, and the
insertion line is drawn in that gap.

**The motion switch confirmed idle while off.** The painter is `scheduleFrame()`
/ `stopFrames()`, and `scheduleFrame()` refuses to start unless `canvasMotion()`
is true (`state.motion === 'on'`, and the OS is not asking for reduced motion).
Switching motion off calls `stopFrames()` and draws one still frame; nothing is
scheduled after that, so while motion is off there is **no animation-frame
callback running and none queued**. `canvasMotion()` is only read at events —
the switch click, an OS reduced-motion change, boot, tab visibility and resize —
never on a timer, and the loop's own re-check happens only from inside a frame
that is already scheduled. Detection is the plain `state.motion` variable
(seeded from `ucvts.motion.v1`, a `?motion=` pin, or the OS preference), not a
DOM read or a poll.

**Verified:** `node --check` clean on every JS file; the developer page's inline
script extracted and checked; 42/42 calendar checks; 21/21 site checks;
styles.css braces balanced; structural checks that no module-panel asset remains
anywhere, that the Page row is present, and that all five pages carry the
Hide/Motion buttons; and the folder-move index math re-checked against the
four-folder cases.

---

### 2026-10-05 — the real reason lower-row folder drags never worked

**The ask:** the rows of the to-do board below the first still could not be
rearranged. The previous pass had changed *which* folder the drop targets
(nearest-centre instead of whatever was under the pointer), which was right and
necessary, but it did not fix the symptom — so the cause was somewhere else.

**The cause is the collapse, applied in the wrong frame.** When a folder grip is
picked up, `dragstart` adds `is-folder-dragging` to the board and every folder
folds to its header (tasks, the add button and the done fold are hidden, and the
54px bottom padding drops to 16). That is a **synchronous reflow of the whole
grid, fired from inside the dragstart handler**. When the dragged folder sits in
a lower row, the rows above it shrink and the source folder jumps up out from
under the pointer; Chromium then **cancels the drag immediately** — `dragend`
straight after `dragstart`, with no `dragover` and no `drop`. Top-row folders
were unaffected because nothing above them moved, which is exactly why only the
first row ever rearranged. The nearest-centre drop logic from the previous pass
was never the problem.

**The fix defers the collapse by one tick.** `dragstart` now calls
`deferFolderCollapse()`, which sets the board class in a `setTimeout(0)` —
guarded so it only fires while a folder drag is still in progress — and
`endFolderDrag()` clears that timer. The ghost feedback (`is-dragging`, the
0.45 opacity) is still applied immediately, because opacity does not reflow.
The collapse still engages during the drag and the insertion line still shows;
it just no longer lands before the drag has begun. Nothing in the drop-target or
index math changed.

**This time the bug was reproduced and the fix measured in a real browser.**
A headless Chromium (Playwright) now runs on this machine despite no `sudo`:
the missing shared libraries are unpacked from downloaded `.deb` packages into a
local sysroot and found via `LD_LIBRARY_PATH`, and the site is served over
`python3 -m http.server` so `localStorage` and module scripts work as on the
real page. With a scripted drag, the **original** code aborts on all three
second-row cases (`row2-within`, `row2->row1` in both directions — `dragstart`
then `dragend`, no drop) while top-row and down-from-top-row drags work; with
the **fix**, all five cases reorder and `drop` fires. A mid-drag probe confirms
the board is collapsed, the source is ghosted at `opacity: 0.45`, the insertion
line is present and `on`, and every bit of drag state is cleared after the drop.

**Verified:** `node --check` clean on every JS file; the developer page's inline
script checked; 42/42 calendar checks; 21/21 site checks; styles.css braces
balanced (360/360); plus the headless-browser drag results above.

### 2026-10-05 — the schedule planner, and one task shared by two pages

**The ask:** a planner page that, on first visit, prompts for how many hours
are available for homework each day of the week (and can be re-opened from a
button); then shows a calendar with a month, week and day view, each showing
the tasks due in that frame; and **auto-calculates when assignments are
recommended to be done** from the class a task is due for, when it's due,
whether that class meets on an A-day or a B-day, and the time available each
day — using keywords to size a task (study = 1hr, worksheet = 20min, packet =
30min) and spreading long ones (projects, essays, study) across several days.
Everything saved in `localStorage`.

**Where the tasks come from — the decision that shaped the rest.** The answer
was explicit: read the planner's tasks from the **to-do list**, and let tasks
added on the planner show back up there — and when adding from the planner, use
**the same screen the to-do page uses**. That rules out a second, parallel task
store. It also means the to-do list can no longer own its data and its task
lightbox privately, because the planner would then need its own copies and the
two would drift — precisely the failure mode this file keeps coming back to.

**So two pieces were pulled out of `todo.js` into their own files.**
`todostore.js` is the list itself: one loader, one saver, one session state
object, folder/task helpers, and the shared due-line format. `taskmodal.js` is
the task lightbox — it builds its own DOM (so there is no markup to keep in
step between two HTML files) and saves through the store. `todo.js` now
delegates to both: `openTaskModal` became a three-line call into
`U.taskModal.open`, and its storage helpers and course-name/due-line logic are
imported instead of copied. The planner opens `U.taskModal.open` with a
`resolveFolder(subject)` callback, so a task entered there is filed in the
folder named after its subject (created on first use; a blank subject goes to a
folder called "Other") — which is how it appears on the to-do page without the
planner owning any folders of its own. The drag-and-drop reorder code in
`todo.js` was deliberately left untouched.

**The scheduling lives in `plan.js`, pure logic like `calendar.js`.** It reads
the same schedule the reminder page writes (`ucvts.classpal.schedule.v1`) so
"the class meets that day" means the same A/B day everywhere. The rules:

- **Estimate** — the highest-paying keyword found in the task's name or subject
  wins (ties go to the longer word, the more specific one); no match pays a
  configurable default (30 min).
- **Sittings** — the total is cut into pieces of at most **45 minutes**, as even
  as they go: `study` (60) is two 30s; `project` (120) is three 40s; a 20-minute
  worksheet is one 20. A task flagged **spread** (project, essay, study, test…)
  is placed one sitting per day across several days; everything else is one go.
- **Which day** — candidates run from today to the deadline, but the day
  *before* the deadline is the last day we want to use: anything after it is a
  heavy penalty, so work is preferred a day early and the deadline itself is
  only a fallback. Within that, a day the class meets scores highest; a spread
  task leans early (start it soon) and a one-off leans late (do it close to
  when it's due). Each sitting comes out of that day's free minutes (the
  configured hours, shared across every task), one sitting per task per day,
  and nothing is ever recommended after the deadline. An overdue task is worked
  out from today.
- Spread tasks get a window of roughly three days per sitting, so they don't
  all pile onto the last night.

The measured behaviour matches the ask: an A-level task lands on a day the
class actually meets and says so ("you have Algebra 2 that day"); nothing is
scheduled past its due date; no day is handed more minutes than its hours;a day with no hours at all produces no sittings, but the deadlines still show.

**The config menu** is a table with the seven days as columns and a single row
of hours — exactly as asked — plus an editable keyword table (word, minutes,
spread) and a default-minutes field. It opens itself on the first visit
(nothing saved yet) and re-opens from **Configure**. Settings live in
`ucvts.planner.v1`; the tasks themselves stay in `ucvts.todo.v1`.

**The page** (`planner.js`) draws three views over one plan: a month grid of day
cells (A/B badge, due chips, a recommended-minutes line), a seven-column week,
and a single day split into what's due and what's recommended. Clicking a day
opens it; the toolbar navigates by month, week or day. It subscribes only to the
clock's `day` and `time` events, so it replans when the date changes (or a test
clock is re-pointed) and does nothing in between — no polling, same as every
other page.

**Verified.** `node verify-planner.js` asserts 41 things about the pure logic
(estimates, sitting sizes, A/B class days, the plan, capacity, overdue, empty
config). A headless-Chromium run (Playwright, same sysroot setup as the drag
fix) then drove the real page through **37** checks: the config menu auto-opens
on first visit and saves; with a seeded schedule and tasks the month draws, the
due chips land on the right days and recommended work lands on a B-day class day;
week and day views render and a day cell opens; **Add a task** opens the shared
lightbox, saves into `ucvts.todo.v1` under the right folder, and shows on both
the planner and the to-do page; a task with no subject lands in "Other"; the
Configure button re-opens, a keyword row can be added, edited, saved and reset;
and no page threw a console error. The to-do page's folder drag was re-run
through the earlier harness — all five cases still reorder — and the landing
tile and the developer page's picker both show the new page. Static checks:
`node --check` clean on every file (including the developer page's inline
script), 42/42 calendar, 21/21 site, 41/41 planner, styles.css braces balanced
(now 466/466).

**Honest notes.** The plan is recomputed from scratch on each render rather
than cached, which is fine at homework scale (a few dozen tasks) and keeps the
logic in one place; if the list ever grew large, the pure `buildPlan` is the
single place to memoize. And the keyword matching is a plain substring test, so
"contested" would match "test" — the table is editable precisely so a student
can tune it if that ever bites.

---

### 2026-10-05 — the plan prefers to be done a day early

**The ask:** the recommended schedule should prefer assignments being done a
day ahead of time, rather than on the deadline.

**One rule, in one place.** `plan.js` already treated the deadline as a mild
penalty ("plan B"), but a day that genuinely fit the class could still beat it —
a Friday deadline in a Friday class would keep the work on the Friday. Now the
day *before* the deadline is the last day we want, and anything past it is a
penalty heavy enough that any earlier day with room wins, however good the
deadline day's class fit is. The deadline stays a candidate, so when every
earlier day is full (or has no hours) the work still lands there rather than
nowhere; overdue tasks are untouched because they run from today. Spread windows
now lead up to the day before the deadline too, so a multi-sitting project
finishes early instead of on the last night, and a sitting that lands on the day
before says so ("done a day ahead of the deadline").

**Verified.** `node verify-planner.js` grew from 36 to **41** checks; the five
new ones pin the rule — a short task is not left on its class-day deadline, a
task with no class day lands the day before it is due and says why, with room
only on the deadline the deadline is still used, and no sitting of a spread task
lands on its deadline. A headless-Chromium run on the real page then seeded one
task due three days out and confirmed the month view shows it due on the
deadline with **no** work there and the 30-minute sitting recommended the day
before, the day view spells out the reason, and nothing threw a console error;
the landing and to-do pages still load clean.

---

### 2026-10-06 — a task can say how long it will take

**The ask:** an optional "how much time I think I'll need" input when creating
or editing a task.

**The student's number wins.** Until now the planner guessed how long a task
would take from keywords in its name — "study" an hour, "worksheet" twenty
minutes, otherwise the 30-minute default. That guess is fine as a default but
it is only ever the planner's opinion, so a task can now carry its own
`minutes`, typed by hand in the shared task lightbox. `plan.js`'s
`estimateMinutes()` takes that value as an override and returns it ahead of any
keyword; the keyword is still consulted, but only for its *shape*, so a
hand-typed hour of "study" is still spread across days while a hand-typed hour
of "read chapter 5" is a plain single task. Long totals are cut into the usual
45-minute sittings either way, so nothing about the sitting rule changed.

**One home for the number.** `todostore.js` owns what a valid estimate is — a
positive whole number, or `''` for "not given" — through a `cleanMinutes()`
helper, so the modal cannot save `-3` or `"abc"` and the planner can tell "the
student said nothing" apart from "the student said zero". The field itself is a
number input in `taskmodal.js` (the lightbox both pages share), the to-do card
shows the estimate as a small amber line, and the planner's day and week views
mark a hand-typed figure with a "Your own estimate" tooltip.

**Verified.** `node --check` on every touched file. `verify-site.js` grew from
21 to **31** checks (ten for the store's estimate cleaning) and
`verify-planner.js` from 41 to **52** (eleven for the override: it beats the
keyword, is flagged as the student's own, keeps a keyword's spread, leaves the
guess alone when blank, and still splits a hand-typed 90 into two sittings). A
headless-Chromium run then drove the **real** modal on the served site: the
field is there and labelled, a 75 is stored as a number and the card shows it,
the right-click → edit path reopens it at 75, clearing it drops the line, a
negative is refused, and a seeded 90-minute task makes the planner's month view
total 90 minutes with the day view agreeing — with no console errors.

---

## Open work

Ordered by when it makes sense to do it.

1. **The soroban trainer page** — the separate page where the arithmetic lives.
   Its shape is settled; see the abacus entry above.
2. **The reminder list is twice as long as it needs to be** — 10 rows for 5
   events, because every class generates a near-identical pair ("starts at
   8:00, 10 min heads-up" and "starts at 8:00, 5 min heads-up"). One row per
   event carrying both times would take it from ~419px to ~210px.
3. **The abacus's looks are still the plainest thing on the page**, and the one
   part of it that has never been designed, only built. Raised by the user, and
   honestly blocked on not being able to see it: worth them saying what it should
   feel like (carved wood? an instrument? a game?) rather than me guessing. The
   rules are settled and won't move.
4. **Emoji should become a small icon set.** Not just a preference — they read
   as filler.
5. **Small cleanups:** two CSS variables declared but never read; three flags in
   `sky.js` written but never read; one redundant ternary in the sky label where
   both branches are identical; and `U.modules.all()/.settings()/.refresh()`,
   which nothing calls.
