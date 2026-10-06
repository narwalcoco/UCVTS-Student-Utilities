/* ============================================================
 * taskmodal.js — the task lightbox, shared by every page that
 * adds or edits a task.
 *
 * The to-do page has always had this screen; the schedule planner's
 * "add a task" opens the same one, on purpose. The markup and the saving
 * live here so the two pages cannot drift into two different ideas of what
 * a task is — and so a task entered from the planner is, byte for byte,
 * the kind of task the to-do page already knows how to show.
 *
 * It builds its own DOM (there is nothing to keep in the page's markup),
 * talks only to todostore.js for the data, and calls back when it saves.
 *
 * open({ folderId, taskId, resolveFolder, due, onSaved })
 *
 *   · folderId + taskId     edit that task
 *   · folderId              add a task to that folder
 *   · resolveFolder(subject) add a task and let the caller file it — the
 *                           planner uses this to put the task in the folder
 *                           named after its subject (creating it if needed)
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS = globalThis.UCVTS || {};
  if (!U.todoStore) throw new Error('taskmodal.js: todostore.js must load first');

  var store = U.todoStore;
  var OTHER = '__other__';

  var MODAL_HTML =
    '<div class="modal-backdrop" data-task-close></div>' +
    '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="taskModalTitle">' +
      '<h2 class="modal-title" id="taskModalTitle">New task</h2>' +

      '<label class="field">' +
        '<span class="field-label">Task</span>' +
        '<input type="text" id="taskName" maxlength="140" placeholder="What needs doing?" autocomplete="off">' +
      '</label>' +

      '<div class="field-row">' +
        '<label class="field">' +
          '<span class="field-label">Due date <span class="field-opt">optional</span></span>' +
          '<input type="date" id="taskDue">' +
        '</label>' +
        '<label class="field">' +
          '<span class="field-label">Due time <span class="field-opt">optional</span></span>' +
          '<input type="time" id="taskTime">' +
        '</label>' +
      '</div>' +

      '<label class="field">' +
        '<span class="field-label">Subject</span>' +
        '<select id="taskSubject"></select>' +
      '</label>' +

      '<label class="field" id="taskOtherField" hidden>' +
        '<span class="field-label">Class or club name</span>' +
        '<input type="text" id="taskOther" maxlength="80" placeholder="e.g. Robotics Club" autocomplete="off">' +
      '</label>' +

      '<p class="field-error" id="taskError" hidden></p>' +

      '<div class="modal-actions">' +
        '<button type="button" class="ghost-btn" data-task-close>Cancel</button>' +
        '<button type="button" class="btn" id="taskSaveBtn">Save task</button>' +
      '</div>' +
    '</div>';

  var host = null;
  var els = null;
  var ctx = null;   // { folderId, taskId, resolveFolder, onSaved }

  /* ---------------- build & wire ---------------- */

  function build() {
    var existing = document.getElementById('taskModal');
    if (existing) return existing;
    host = document.createElement('div');
    host.className = 'modal';
    host.id = 'taskModal';
    host.hidden = true;
    host.innerHTML = MODAL_HTML;
    document.body.appendChild(host);
    return host;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function wire() {
    els = {
      title: document.getElementById('taskModalTitle'),
      name: document.getElementById('taskName'),
      due: document.getElementById('taskDue'),
      time: document.getElementById('taskTime'),
      subject: document.getElementById('taskSubject'),
      otherField: document.getElementById('taskOtherField'),
      other: document.getElementById('taskOther'),
      error: document.getElementById('taskError'),
      save: document.getElementById('taskSaveBtn')
    };

    host.querySelectorAll('[data-task-close]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });

    els.subject.addEventListener('change', syncOtherField);
    els.save.addEventListener('click', onSave);
    els.name.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') onSave();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !host.hidden) close();
    });
  }

  function fillSubjects(selected) {
    var names = store.courseNames();
    els.subject.innerHTML = '';

    var blank = el('option', null, '\u2014 none \u2014');
    blank.value = '';
    els.subject.appendChild(blank);

    names.forEach(function (course) {
      var opt = el('option', null, course);
      opt.value = course;
      els.subject.appendChild(opt);
    });

    var other = el('option', null, 'Other\u2026');
    other.value = OTHER;
    els.subject.appendChild(other);

    if (selected && selected !== OTHER && names.indexOf(selected) === -1) {
      /* a subject saved earlier that is no longer in the schedule: keep it */
      var keep = el('option', null, selected);
      keep.value = selected;
      els.subject.insertBefore(keep, other);
    }
    els.subject.value = selected || '';
    syncOtherField();
  }

  function syncOtherField() {
    els.otherField.hidden = els.subject.value !== OTHER;
  }

  /* ---------------- open / close ---------------- */

  function openModal() {
    host.hidden = false;
    document.body.classList.add('modal-open');
  }

  function close() {
    if (host.hidden) return;
    host.hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('modal-open');
    ctx = null;
  }

  function open(opts) {
    opts = opts || {};
    if (!host) { build(); wire(); }

    ctx = {
      folderId: opts.folderId || null,
      taskId: opts.taskId || null,
      resolveFolder: typeof opts.resolveFolder === 'function' ? opts.resolveFolder : null,
      onSaved: typeof opts.onSaved === 'function' ? opts.onSaved : null
    };

    var task = null;
    if (ctx.taskId) {
      var folder = store.folderById(ctx.folderId);
      task = folder && folder.tasks.find(function (x) { return x.id === ctx.taskId; });
    }

    els.title.textContent = ctx.taskId ? 'Edit task' : 'New task';
    els.name.value = task ? task.name : '';
    els.due.value = task ? task.due : (opts.due || '');
    els.time.value = task ? task.time : '';

    /* A subject that is not one of the offered courses was typed under
       "Other", so reopen it there with the text preserved. */
    var typedOther = task && task.subject && store.courseNames().indexOf(task.subject) === -1;
    els.other.value = typedOther ? task.subject : '';
    fillSubjects(typedOther ? OTHER : (task ? task.subject : ''));

    els.error.hidden = true;
    openModal();
    setTimeout(function () { els.name.focus(); }, 0);
  }

  /* ---------------- save ---------------- */

  function fail(message) {
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function onSave() {
    var name = els.name.value.trim();
    if (!name) { fail('Give the task a name.'); els.name.focus(); return; }

    var subject = els.subject.value;
    if (subject === OTHER) subject = els.other.value.trim();

    var saved = null;
    if (ctx.taskId) {
      saved = store.updateTask(ctx.folderId, ctx.taskId, {
        name: name, due: els.due.value, time: els.time.value, subject: subject
      });
      if (!saved) { fail('That task is gone from the list.'); return; }
    } else {
      var folderId = ctx.folderId;
      if (!folderId && ctx.resolveFolder) folderId = ctx.resolveFolder(subject);
      if (!folderId) { fail('Pick a subject, or add a folder on the to-do page first.'); return; }
      saved = store.addTask(folderId, {
        name: name, due: els.due.value, time: els.time.value, subject: subject
      });
      if (!saved) { fail('Could not find a folder for that task.'); return; }
    }

    store.save();
    var onSaved = ctx.onSaved;
    close();
    if (onSaved) onSaved(saved);
  }

  /* Build eagerly when the DOM is ready, so #taskModal exists as soon as
     any page (or a test) asks for it. */
  function boot() { build(); wire(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  U.taskModal = { open: open, close: close, ID: 'taskModal' };
})();
