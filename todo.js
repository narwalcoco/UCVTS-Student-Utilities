/* ============================================================
 * todo.js — the to-do list maker.
 *
 * One saved list, one rendering pass, and every interaction
 * working straight on the saved data so what's on screen is
 * always what's in localStorage.
 *
 * This file owns the board: the folders, the tasks, dragging them around,
 * the completed-tasks fold, the folder lightbox and the right-click menu.
 * Two things it does NOT own, on purpose:
 *
 *   · the list itself — todostore.js loads, saves and shapes it, because the
 *     schedule planner reads and writes the very same list
 *   · the task lightbox — taskmodal.js builds it, because the planner opens
 *     the same screen to add a task
 *
 * One source of truth per fact: the to-do page and the planner cannot end up
 * disagreeing about what a task is or what is on the list.
 * ============================================================ */
(function () {
  'use strict';

  var U = globalThis.UCVTS = globalThis.UCVTS || {};

  /* The list itself lives in todostore.js — the schedule planner writes the
     same list, so there is one loader and one saver for both pages, and
     one idea of what a task looks like. */
  var store = U.todoStore;
  if (!store) throw new Error('todo.js: todostore.js must load first');

  var state = store.getState();

  function save() { store.save(); }
  function uid() { return store.uid(); }
  function folderById(id) { return store.folderById(id); }
  function courseNames() { return store.courseNames(); }

  /* Which folders have their completed-tasks fold open. Empty on load, so
     every folder starts collapsed; an expanded folder stays open for the
     rest of the session and no further. */
  var doneOpen = {};

  /* ---------------- small helpers ---------------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fmtDue(due, time) { return store.fmtDue(due, time); }

  /* ---------------- the board ---------------- */

  var board = document.getElementById('todoBoard');

  function render() {
    board.innerHTML = '';
    if (!state.folders.length) {
      var empty = el('p', 'todo-empty');
      empty.textContent = 'No folders yet. Add one for a class, a club, or anything else.';
      board.appendChild(empty);
      return;
    }
    state.folders.forEach(function (folder) {
      board.appendChild(folderNode(folder));
    });
  }

  function folderNode(folder) {
    var node = el('section', 'todo-folder');
    node.setAttribute('data-folder-id', folder.id);

    /* --- head: grip, name, hover-only menu --- */
    var head = el('header', 'todo-folder-head');
    node.appendChild(head);

    var grip = el('span', 'todo-folder-grip', '⠿');
    grip.draggable = true;
    grip.title = 'Drag to reorder';
    grip.setAttribute('aria-hidden', 'true');
    grip.setAttribute('data-folder-id', folder.id);
    head.appendChild(grip);

    var name = el('h2', 'todo-folder-name', folder.name);
    head.appendChild(name);

    var undone = folder.tasks.filter(function (t) { return !t.done; });
    var done = folder.tasks.filter(function (t) { return t.done; });

    var count = undone.length;
    var badge = el('span', 'todo-folder-count', count ? String(count) : '');
    badge.title = count + ' left';
    head.appendChild(badge);

    var menuBtn = el('button', 'todo-folder-menu', '⋯');
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Folder options for ' + folder.name);
    menuBtn.dataset.folderId = folder.id;
    head.appendChild(menuBtn);

    var menu = el('div', 'todo-folder-pop');
    menu.hidden = true;
    var renameBtn = el('button', 'todo-pop-btn', 'Rename');
    renameBtn.type = 'button';
    renameBtn.dataset.folderAction = 'rename';
    renameBtn.dataset.folderId = folder.id;
    var deleteBtn = el('button', 'todo-pop-btn ctx-danger', 'Delete');
    deleteBtn.type = 'button';
    deleteBtn.dataset.folderAction = 'delete';
    deleteBtn.dataset.folderId = folder.id;
    menu.appendChild(renameBtn);
    /* Only offered when there is something for it to do. */
    if (done.length) {
      var clearBtn = el('button', 'todo-pop-btn ctx-danger', 'Delete completed');
      clearBtn.type = 'button';
      clearBtn.dataset.folderAction = 'delete-done';
      clearBtn.dataset.folderId = folder.id;
      menu.appendChild(clearBtn);
    }
    menu.appendChild(deleteBtn);
    head.appendChild(menu);

    /* --- the open tasks --- */
    var list = el('ul', 'todo-tasks');
    list.dataset.folderId = folder.id;
    undone.forEach(function (task) {
      list.appendChild(taskNode(task, folder.id));
    });
    node.appendChild(list);

    /* --- the finished ones, folded away at the bottom --- */
    if (done.length) node.appendChild(doneSection(folder, done));

    /* --- the add button, bottom right of the container --- */
    var add = el('button', 'todo-add-task', '＋');
    add.type = 'button';
    add.setAttribute('aria-label', 'Add a task to ' + folder.name);
    add.dataset.addTask = folder.id;
    node.appendChild(add);

    return node;
  }

  /* The finished tasks, folded away at the bottom of the folder. Nothing is
     reordered when a task is completed, so un-completing one drops it back
     exactly where it was among the tasks still open. */
  function doneSection(folder, done) {
    var open = doneOpen[folder.id] === true;

    var sec = el('section', 'todo-done');
    sec.dataset.folderId = folder.id;

    var toggle = el('button', 'todo-done-toggle');
    toggle.type = 'button';
    toggle.dataset.toggleDoneSection = folder.id;   // the checkbox owns data-toggle-done
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.appendChild(el('span', 'todo-done-caret', open ? '\u25BE' : '\u25B8'));
    toggle.appendChild(el('span', 'todo-done-label', 'Completed'));
    toggle.appendChild(el('span', 'todo-done-count', String(done.length)));
    sec.appendChild(toggle);

    var list = el('ul', 'todo-tasks todo-tasks-done');
    list.dataset.folderId = folder.id;
    list.hidden = !open;
    done.forEach(function (task) {
      list.appendChild(taskNode(task, folder.id));
    });
    sec.appendChild(list);

    return sec;
  }

  function taskNode(task, folderId) {
    var li = el('li', 'todo-task');
    li.setAttribute('data-task-id', task.id);
    li.setAttribute('data-folder-id', folderId);
    li.draggable = !task.done;   // a finished task has no place to be dragged to
    if (task.done) li.classList.add('is-done');

    var check = el('button', 'todo-check');
    check.type = 'button';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', task.done ? 'true' : 'false');
    check.setAttribute('aria-label', task.done ? 'Mark not done' : 'Mark done');
    check.dataset.toggleDone = task.id;
    check.dataset.folderId = folderId;
    li.appendChild(check);

    var main = el('div', 'todo-task-main');
    li.appendChild(main);

    var nm = el('span', 'todo-task-name', task.name);
    main.appendChild(nm);

    var due = fmtDue(task.due, task.time);
    if (due) main.appendChild(el('span', 'todo-task-due', due));
    if (task.subject) main.appendChild(el('span', 'todo-task-subject', task.subject));
    if (task.minutes) main.appendChild(el('span', 'todo-task-minutes', '🕒 ' + task.minutes + ' min'));

    var star = el('button', 'todo-star' + (task.important ? ' is-on' : ''), task.important ? '★' : '☆');
    star.type = 'button';
    star.setAttribute('aria-label', task.important ? 'Unmark important' : 'Mark important');
    star.setAttribute('aria-pressed', task.important ? 'true' : 'false');
    star.dataset.toggleStar = task.id;
    star.dataset.folderId = folderId;
    li.appendChild(star);

    return li;
  }

  /* ---------------- drag & drop ----------------
     Folders reorder by their grip; tasks reorder within their own
     folder. One drag record tells the drop handlers what is moving. */

  var drag = null;   // { kind: 'folder' | 'task', id, folderId }

  function clearDropMarks() {
    var marked = document.querySelectorAll('.is-drop-before');
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove('is-drop-before');
  }

  /* Folder grip picked up */
  board.addEventListener('dragstart', function (e) {
    var grip = e.target.closest && e.target.closest('.todo-folder-grip');
    if (grip) {
      drag = { kind: 'folder', id: grip.dataset.folderId, index: null };
      var folder = e.target.closest('.todo-folder');
      if (folder) {
        folder.classList.add('is-dragging');
        deferFolderCollapse();
      }
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'folder:' + grip.dataset.folderId); } catch (err) {}
      return;
    }
    var task = e.target.closest && e.target.closest('.todo-task');
    if (task && !task.classList.contains('is-done')) {
      drag = { kind: 'task', id: task.dataset.taskId, folderId: task.dataset.folderId };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'task:' + task.dataset.taskId); } catch (err) {}
    }
  });

  /* Collapsing the board (hiding tasks/add/done and shrinking every card)
     reflows the whole grid. Doing that synchronously inside dragstart moves
     the source folder out from under the pointer whenever it sits in a lower
     row — the rows above shrink and it jumps up — and Chromium then cancels
     the drag on the spot (dragend straight after dragstart, no dragover, no
     drop). Only top-row folders survived, because nothing above them moved.
     Adding the class a tick later lets the drag start cleanly first. */
  var collapseTimer = null;

  function deferFolderCollapse() {
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = setTimeout(function () {
      collapseTimer = null;
      if (drag && drag.kind === 'folder') board.classList.add('is-folder-dragging');
    }, 0);
  }

  board.addEventListener('dragend', function () {
    drag = null;
    clearDropMarks();
    endFolderDrag();
  });

  board.addEventListener('dragover', function (e) {
    if (!drag) return;

    if (drag.kind === 'folder') {
      // Anywhere on the board is a valid drop, so the line never flickers out.
      e.preventDefault();
      var target = folderDropTarget(e);
      if (target) {
        drag.index = target.index;
        showDropLine(target.folder, target.after);
      }
      return;
    }

    /* tasks: only within the same folder, and never before a finished one */
    var overTask = e.target.closest && e.target.closest('.todo-task');
    if (overTask && !overTask.classList.contains('is-done') &&
        overTask.dataset.folderId === drag.folderId && overTask.dataset.taskId !== drag.id) {
      e.preventDefault();
      clearDropMarks();
      overTask.classList.add('is-drop-before');
      return;
    }
    var list = e.target.closest && e.target.closest('.todo-tasks');
    if (list && !list.classList.contains('todo-tasks-done') &&
        list.dataset.folderId === drag.folderId) {
      e.preventDefault();
      clearDropMarks();
    }
  });

  board.addEventListener('drop', function (e) {
    if (!drag) return;

    if (drag.kind === 'folder') {
      e.preventDefault();
      var id = drag.id;
      var index = drag.index;
      drag = null;
      clearDropMarks();
      endFolderDrag();
      if (index != null) moveFolderToIndex(id, index);
      return;
    }

    var overTask = e.target.closest && e.target.closest('.todo-task');
    if (overTask && !overTask.classList.contains('is-done') &&
        overTask.dataset.folderId === drag.folderId) {
      e.preventDefault();
      reorderTask(drag.folderId, drag.id, overTask.dataset.taskId);
      drag = null;
      clearDropMarks();
      return;
    }
    var list = e.target.closest && e.target.closest('.todo-tasks');
    if (list && !list.classList.contains('todo-tasks-done') &&
        list.dataset.folderId === drag.folderId) {
      e.preventDefault();
      reorderTask(drag.folderId, drag.id, null);
      drag = null;
      clearDropMarks();
    }
  });

  /* Which gap the folder will land in, and which side of it. Every folder is
     measured and the one whose centre is nearest the pointer wins, so this
     behaves the same in any row of the wrapping grid — and in the gaps
     between cards, not only when the pointer is directly on one. (Reading the
     element under the pointer only worked for the row it happened to be in.)
     Returns null only when there is nothing to land between. */
  function folderDropTarget(e) {
    var folders = Array.prototype.slice.call(board.querySelectorAll('.todo-folder'));
    if (!folders.length) return null;
    var x = e.clientX, y = e.clientY;
    var best = 0, bestD = Infinity;
    for (var i = 0; i < folders.length; i++) {
      var r = folders[i].getBoundingClientRect();
      var dx = x - (r.left + r.width / 2);
      var dy = y - (r.top + r.height / 2);
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    var box = folders[best].getBoundingClientRect();
    var after = x > box.left + box.width / 2;
    return { index: after ? best + 1 : best, folder: folders[best], after: after };
  }

  /* `index` is a gap in the folder order as it stands (0..n). Pulling the
     folder out first closes that gap, so every later gap shifts down one. */
  function moveFolderToIndex(fromId, index) {
    var from = state.folders.findIndex(function (f) { return f.id === fromId; });
    if (from < 0) return;
    var target = from < index ? index - 1 : index;
    if (target === from || target < 0) return;
    var moved = state.folders.splice(from, 1)[0];
    state.folders.splice(Math.min(target, state.folders.length), 0, moved);
    save();
    render();
  }

  /* ---------- the insertion line ---------- */

  var dropLine = null;

  function ensureDropLine() {
    if (!dropLine) {
      dropLine = el('div', 'todo-drop-line');
      dropLine.setAttribute('aria-hidden', 'true');
      board.appendChild(dropLine);
    }
    return dropLine;
  }

  /* A vertical bar in the gap the folder will land in. Positioned against the
     board's own box, so page scroll never enters into it. */
  function showDropLine(folder, after) {
    var line = ensureDropLine();
    var br = board.getBoundingClientRect();
    var r = folder.getBoundingClientRect();
    var halfGap = 9;   // half the 18px grid gap
    line.style.left = ((after ? r.right + halfGap : r.left - halfGap) - br.left) + 'px';
    line.style.top = (r.top - br.top) + 'px';
    line.style.height = r.height + 'px';
    line.classList.add('on');
  }

  function endFolderDrag() {
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    board.classList.remove('is-folder-dragging');
    var dragging = board.querySelectorAll('.todo-folder.is-dragging');
    for (var i = 0; i < dragging.length; i++) dragging[i].classList.remove('is-dragging');
    if (dropLine) dropLine.classList.remove('on');
    dropLine = null;   // render() wipes the board, so never hold a stale node
  }

  function reorderTask(folderId, taskId, beforeTaskId) {
    var folder = folderById(folderId);
    if (!folder) return;
    var from = folder.tasks.findIndex(function (t) { return t.id === taskId; });
    if (from < 0) return;
    var moved = folder.tasks.splice(from, 1)[0];
    var to = beforeTaskId
      ? folder.tasks.findIndex(function (t) { return t.id === beforeTaskId; })
      : folder.tasks.length;
    if (to < 0) to = folder.tasks.length;
    folder.tasks.splice(to, 0, moved);
    save();
    render();
  }

  /* ---------------- clicks on the board ---------------- */

  board.addEventListener('click', function (e) {
    var t = e.target;

    var addBtn = t.closest('[data-add-task]');
    if (addBtn) { openTask(addBtn.dataset.addTask, null); return; }

    var doneBtn = t.closest('[data-toggle-done]');
    if (doneBtn) { toggleDone(doneBtn.dataset.folderId, doneBtn.dataset.toggleDone); return; }

    var starBtn = t.closest('[data-toggle-star]');
    if (starBtn) { toggleStar(starBtn.dataset.folderId, starBtn.dataset.toggleStar); return; }

    var foldBtn = t.closest('[data-toggle-done-section]');
    if (foldBtn) { toggleDoneSection(foldBtn); return; }

    var menuBtn = t.closest('.todo-folder-menu');
    if (menuBtn) {
      var pop = menuBtn.parentNode.querySelector('.todo-folder-pop');
      closeAllPops();
      if (pop) pop.hidden = false;
      return;
    }

    var folderAction = t.closest('[data-folder-action]');
    if (folderAction) {
      var action = folderAction.dataset.folderAction;
      var fid = folderAction.dataset.folderId;
      closeAllPops();
      if (action === 'rename') openFolderModal(fid);
      else if (action === 'delete') deleteFolder(fid);
      else if (action === 'delete-done') deleteCompleted(fid);
      return;
    }
  });

  function toggleDone(folderId, taskId) {
    var folder = folderById(folderId);
    if (!folder) return;
    var task = folder.tasks.find(function (x) { return x.id === taskId; });
    if (!task) return;
    task.done = !task.done;
    save();
    render();
  }

  function toggleStar(folderId, taskId) {
    var folder = folderById(folderId);
    if (!folder) return;
    var task = folder.tasks.find(function (x) { return x.id === taskId; });
    if (!task) return;
    task.important = !task.important;
    save();
    render();
  }

  function deleteFolder(folderId) {
    var folder = folderById(folderId);
    if (!folder) return;
    var n = folder.tasks.length;
    var msg = 'Delete the folder “' + folder.name + '”' +
      (n ? ' and its ' + n + ' task' + (n === 1 ? '' : 's') : '') + '?';
    if (!globalThis.confirm(msg)) return;
    state.folders = state.folders.filter(function (f) { return f.id !== folderId; });
    save();
    render();
  }

  /* Open or close a folder's fold of finished tasks — in place, so showing
     a list never rebuilds the whole board. */
  function toggleDoneSection(btn) {
    var id = btn.dataset.toggleDoneSection;
    var open = !(doneOpen[id] === true);
    doneOpen[id] = open;
    var sec = btn.closest('.todo-done');
    var list = sec && sec.querySelector('.todo-tasks-done');
    var caret = btn.querySelector('.todo-done-caret');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (caret) caret.textContent = open ? '\u25BE' : '\u25B8';
    if (list) list.hidden = !open;
  }

  function deleteCompleted(folderId) {
    var folder = folderById(folderId);
    if (!folder) return;
    var n = folder.tasks.filter(function (t) { return t.done; }).length;
    if (!n) return;
    var msg = 'Delete ' + n + ' completed task' + (n === 1 ? '' : 's') +
      ' from \u201C' + folder.name + '\u201D?';
    if (!globalThis.confirm(msg)) return;
    folder.tasks = folder.tasks.filter(function (t) { return !t.done; });
    save();
    render();
  }

  function closeAllPops() {
    var pops = document.querySelectorAll('.todo-folder-pop');
    for (var i = 0; i < pops.length; i++) pops[i].hidden = true;
  }

  /* ---------------- the right-click menu ---------------- */

  var ctxMenu = document.getElementById('ctxMenu');
  var ctxTarget = null;   // { folderId, taskId }

  board.addEventListener('contextmenu', function (e) {
    var task = e.target.closest && e.target.closest('.todo-task');
    if (!task) return;
    e.preventDefault();
    ctxTarget = { folderId: task.dataset.folderId, taskId: task.dataset.taskId };
    ctxMenu.hidden = false;
    var w = ctxMenu.offsetWidth;
    var h = ctxMenu.offsetHeight;
    var x = Math.min(e.clientX, globalThis.innerWidth - w - 8);
    var y = Math.min(e.clientY, globalThis.innerHeight - h - 8);
    ctxMenu.style.left = Math.max(8, x) + 'px';
    ctxMenu.style.top = Math.max(8, y) + 'px';
  });

  ctxMenu.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ctx]');
    if (!btn || !ctxTarget) return;
    var target = ctxTarget;
    hideCtx();
    if (btn.dataset.ctx === 'edit') openTask(target.folderId, target.taskId);
    else if (btn.dataset.ctx === 'delete') deleteTask(target.folderId, target.taskId);
  });

  function hideCtx() {
    ctxMenu.hidden = true;
    ctxTarget = null;
  }

  function deleteTask(folderId, taskId) {
    var folder = folderById(folderId);
    if (!folder) return;
    var task = folder.tasks.find(function (x) { return x.id === taskId; });
    if (!task) return;
    if (!globalThis.confirm('Delete the task “' + task.name + '”?')) return;
    folder.tasks = folder.tasks.filter(function (x) { return x.id !== taskId; });
    save();
    render();
  }

  /* Close popovers/menus on any outside click or on scroll/resize. */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.todo-folder-menu')) closeAllPops();
    if (!e.target.closest('#ctxMenu')) hideCtx();
  });
  document.addEventListener('keydown', function (e) {
    /* The task lightbox handles its own Escape; this closes the page's own
       folder lightbox and menus. */
    if (e.key === 'Escape') { closeAllPops(); hideCtx(); closeModal('folderModal'); }
  });
  board.addEventListener('scroll', function () { hideCtx(); }, true);
  globalThis.addEventListener('resize', function () { hideCtx(); });

  /* ---------------- modals ---------------- */

  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('modal-open');
  }

  document.querySelectorAll('#folderModal [data-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeModal(btn.dataset.close); });
  });

  /* ---- the task lightbox ----
     Shared with the schedule planner: both pages open taskmodal.js, so the
     screen that creates a task is the same screen everywhere. The to-do
     page always knows which folder a new task goes in (the one whose ＋ was
     clicked), so it never needs the planner's subject-based resolver. */

  function openTask(folderId, taskId) {
    U.taskModal.open({
      folderId: folderId,
      taskId: taskId || null,
      onSaved: render
    });
  }

  /* ---- the folder lightbox (new & rename) ---- */

  var folderModalTitle = document.getElementById('folderModalTitle');
  var folderName = document.getElementById('folderName');
  var folderError = document.getElementById('folderError');
  var folderEditingId = null;

  function openFolderModal(folderId) {
    folderEditingId = folderId || null;
    var folder = folderId ? folderById(folderId) : null;
    folderModalTitle.textContent = folder ? 'Rename folder' : 'New folder';
    folderName.value = folder ? folder.name : '';
    folderError.hidden = true;
    openModal('folderModal');
    setTimeout(function () { folderName.focus(); }, 0);
  }

  document.getElementById('addFolderBtn').addEventListener('click', function () {
    openFolderModal(null);
  });

  document.getElementById('folderSaveBtn').addEventListener('click', function () {
    var name = folderName.value.trim();
    if (!name) {
      folderError.textContent = 'Give the folder a name.';
      folderError.hidden = false;
      folderName.focus();
      return;
    }
    if (folderEditingId) {
      var folder = folderById(folderEditingId);
      if (folder) folder.name = name;
    } else {
      state.folders.push({ id: uid(), name: name, tasks: [] });
    }
    save();
    render();
    closeModal('folderModal');
  });

  folderName.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('folderSaveBtn').click();
  });

  /* ---------------- boot ---------------- */

  render();
})();
