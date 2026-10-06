/* ============================================================
 * todostore.js — the saved to-do list, in one place.
 *
 * The to-do page and the schedule planner are two views of the same list:
 * the planner reads the tasks you already entered, and adding a task from
 * the planner writes it straight back here so it shows up on the to-do
 * page too. That only stays true if there is exactly one loader, one
 * saver and one idea of what the list looks like — this file.
 *
 * The shape saved under 'ucvts.todo.v1':
 *
 *   { folders: [
 *       { id, name, tasks: [
 *           { id, name, due, time, subject, minutes, done, important }
 *       ] }
 *   ] }
 *
 *   · due / time are '' when left blank
 *   · subject is the course name the student picked, or whatever
 *     they typed under "Other"
 *   · minutes is the student's own estimate of how long the task will take,
 *     in whole minutes, or '' when they didn't give one — the planner then
 *     falls back to guessing from keywords in the name
 *   · done and important are booleans
 *
 * The state is a single object for the whole session (`getState()`), so a
 * page that loads both this and a page glue file (todo.js) cannot end up
 * with two copies that clobber each other on save.
 *
 * The class names offered in the task lightbox are read straight from the
 * same schedule key the class reminder page writes, so the pages share one
 * source of truth without this file depending on that page's code.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS = globalThis.UCVTS || {};

  var KEY = 'ucvts.todo.v1';
  var SCHEDULE_KEY = 'ucvts.classpal.schedule.v1';

  /* ---------------- storage ---------------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function load() {
    var data = readJSON(KEY, null);
    if (data && Array.isArray(data.folders)) return data;
    return { folders: [] };
  }

  /* One state object for the session. Everything below reads and writes
     through it, so two glue files on one page always agree. */
  var state = null;

  function getState() {
    if (!state) state = load();
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(getState())); }
    catch (e) { /* private mode — the session still works, it just won't persist */ }
  }

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- folders & tasks ---------------- */

  function folderById(id) {
    var folders = getState().folders;
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].id === id) return folders[i];
    }
    return null;
  }

  function folderByName(name) {
    var clean = String(name == null ? '' : name).trim().toLowerCase();
    if (!clean) return null;
    var folders = getState().folders;
    for (var i = 0; i < folders.length; i++) {
      if (String(folders[i].name).trim().toLowerCase() === clean) return folders[i];
    }
    return null;
  }

  /* The folder a task entered elsewhere belongs in: named after its
     subject, created on first use so a task's class always has a home.
     A blank subject lands in a folder called "Other". */
  function ensureFolder(name) {
    var clean = String(name == null ? '' : name).trim() || 'Other';
    var existing = folderByName(clean);
    if (existing) return existing;
    var folder = { id: uid(), name: clean, tasks: [] };
    getState().folders.push(folder);
    return folder;
  }

  /* The student's own time estimate, in whole minutes. A blank, zero or
     nonsense value becomes '' — "I didn't say" — so the planner knows to
     guess from the task's keywords instead of trusting a bad number. */
  function cleanMinutes(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return '';
    return Math.round(n);
  }

  function newTask(fields) {
    fields = fields || {};
    return {
      id: uid(),
      name: String(fields.name == null ? '' : fields.name).trim(),
      due: fields.due || '',
      time: fields.time || '',
      subject: fields.subject || '',
      minutes: cleanMinutes(fields.minutes),
      done: false,
      important: !!fields.important
    };
  }

  function addTask(folderId, fields) {
    var folder = folderById(folderId);
    if (!folder) return null;
    var task = newTask(fields);
    folder.tasks.push(task);
    return task;
  }

  function updateTask(folderId, taskId, fields) {
    var folder = folderById(folderId);
    var task = folder && folder.tasks.find(function (x) { return x.id === taskId; });
    if (!task) return null;
    fields = fields || {};
    if ('name' in fields) task.name = fields.name;
    if ('due' in fields) task.due = fields.due;
    if ('time' in fields) task.time = fields.time;
    if ('subject' in fields) task.subject = fields.subject;
    if ('minutes' in fields) task.minutes = cleanMinutes(fields.minutes);
    return task;
  }

  /* Course names, in the schedule's own row order so the list reads the way
     the reminder page does — falling back to the object's keys on any page
     that didn't load calendar.js. Duplicates collapse; blanks are skipped. */
  function courseNames() {
    var schedule = readJSON(SCHEDULE_KEY, {});
    if (!schedule || typeof schedule !== 'object') return [];
    var seen = {};
    var out = [];
    function add(course) {
      course = String(course == null ? '' : course).trim();
      if (course && !seen[course]) { seen[course] = true; out.push(course); }
    }
    if (U.ROWS) {
      U.ROWS.forEach(function (row) { add((schedule[row.key] || {}).course); });
    } else {
      Object.keys(schedule).forEach(function (k) { add((schedule[k] || {}).course); });
    }
    return out;
  }

  /* "Due Thu, Oct 8 · 9:00 pm" — the one due line both pages show, so a
     task's deadline reads the same wherever it appears. */
  function fmtDue(due, time) {
    if (!due) return '';
    var label = due;
    var d = new Date(due + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    if (time) {
      var parts = String(time).split(':');
      var h = parseInt(parts[0], 10);
      var m = parts[1] || '00';
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12; if (h === 0) h = 12;
      label += ' · ' + h + ':' + m + ' ' + ampm;
    }
    return 'Due ' + label;
  }

  /* Every task in the list, flattened with the folder it lives in. The
     planner reads the list this way; the to-do page keeps using folders. */
  function allTasks() {
    var out = [];
    getState().folders.forEach(function (folder) {
      folder.tasks.forEach(function (task) {
        out.push({ folderId: folder.id, folderName: folder.name, task: task });
      });
    });
    return out;
  }

  U.todoStore = {
    KEY: KEY,
    SCHEDULE_KEY: SCHEDULE_KEY,
    readJSON: readJSON,
    getState: getState,
    load: load,
    save: save,
    uid: uid,
    folderById: folderById,
    folderByName: folderByName,
    ensureFolder: ensureFolder,
    newTask: newTask,
    cleanMinutes: cleanMinutes,
    addTask: addTask,
    updateTask: updateTask,
    courseNames: courseNames,
    fmtDue: fmtDue,
    allTasks: allTasks
  };
})();
