(function () {
  'use strict';

  /* ---------------- Elements ---------------- */
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const prioritySelect = document.getElementById('priority');
  const dueDateInput = document.getElementById('due-date');

  const searchInput = document.getElementById('search');
  const filterButtons = Array.from(document.querySelectorAll('.filter-btn'));

  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  const count = document.getElementById('count');

  const themeToggle = document.getElementById('theme-toggle');
  const toastContainer = document.getElementById('toast-container');

  /* ---------------- State ---------------- */
  let tasks = [];
  let currentFilter = 'all'; // all | active | completed
  let searchQuery = '';
  let editingId = null;
  let editDraft = null; // live { text, priority, dueDate } for the task being edited

  try {
    tasks = JSON.parse(localStorage.getItem('todo-tasks') || '[]');
  } catch (e) {
    tasks = [];
  }

  /* ---------------- Storage ---------------- */
  function saveTasks() {
    try {
      localStorage.setItem('todo-tasks', JSON.stringify(tasks));
    } catch (e) {
      // localStorage unavailable — fail silently.
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem('todo-theme', theme);
    } catch (e) {}
  }

  function loadTheme() {
    try {
      return localStorage.getItem('todo-theme');
    } catch (e) {
      return null;
    }
  }

  /* ---------------- Helpers ---------------- */
  function generateId() {
    return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function formatDue(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function isOverdue(task) {
    return Boolean(task.dueDate) && !task.done && task.dueDate < todayISO();
  }

  /* ---------------- Theme ---------------- */
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeToggle.textContent = '☀️';
      themeToggle.setAttribute('aria-pressed', 'true');
      themeToggle.setAttribute('aria-label', 'Switch to light mode');
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeToggle.textContent = '🌙';
      themeToggle.setAttribute('aria-pressed', 'false');
      themeToggle.setAttribute('aria-label', 'Switch to dark mode');
    }
  }

  function initTheme() {
    const saved = loadTheme();
    if (saved) {
      applyTheme(saved);
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
  }

  /* ---------------- Toasts ---------------- */
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('leaving');
      let removed = false;
      const remove = () => {
        if (removed) return;
        removed = true;
        toast.remove();
      };
      toast.addEventListener('animationend', remove, { once: true });
      // Fallback in case a re-render or other action detaches the toast
      // before the leave animation can fire 'animationend' on it.
      window.setTimeout(remove, 200);
    }, 1800);
  }

  /* ---------------- Task operations ---------------- */
  function addTask(text, priority, dueDate) {
    const trimmed = text.trim();
    if (!trimmed) return false;

    tasks.unshift({
      id: generateId(),
      text: trimmed,
      done: false,
      priority: priority || 'medium',
      dueDate: dueDate || null,
      createdAt: Date.now(),
    });

    saveTasks();
    render();
    showToast('Task added');
    return true;
  }

  function deleteTask(id) {
    tasks = tasks.filter((t) => t.id !== id);
    if (editingId === id) {
      editingId = null;
      editDraft = null;
    }
    saveTasks();
    render();
    showToast('Task deleted');
  }

  function toggleDone(id, done) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = done;
    saveTasks();
    render();
    showToast(task.done ? 'Task completed' : 'Task marked active');
  }

  function startEdit(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    editingId = id;
    editDraft = { text: task.text, priority: task.priority || 'medium', dueDate: task.dueDate || '' };
    render();

    // Focus the field only when the edit form is first opened — render() is
    // called synchronously above, so the new elements already exist here.
    const row = list.querySelector('[data-id="' + id + '"]');
    const textInput = row && row.querySelector('.edit-form input[type="text"]');
    if (textInput) {
      textInput.focus();
      textInput.select();
    }
  }

  function cancelEdit() {
    const id = editingId;
    editingId = null;
    editDraft = null;
    render();
    restoreFocusToEditButton(id);
  }

  function saveEdit(id, text, priority, dueDate) {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const task = tasks.find((t) => t.id === id);
    if (!task) return false;

    task.text = trimmed;
    task.priority = priority;
    task.dueDate = dueDate || null;

    editingId = null;
    editDraft = null;
    saveTasks();
    render();
    showToast('Task updated');
    restoreFocusToEditButton(id);
    return true;
  }

  /** Sends keyboard focus back to a task row's Edit button after its
   *  edit-in-place form closes, instead of leaving focus stranded. */
  function restoreFocusToEditButton(id) {
    const row = list.querySelector('[data-id="' + id + '"]');
    const btn = row && row.querySelector('.icon-btn:not(.danger)');
    if (btn) btn.focus();
  }

  /* ---------------- Filtering / search ---------------- */
  function getVisibleTasks() {
    return tasks.filter((task) => {
      const matchesFilter =
        currentFilter === 'all' ||
        (currentFilter === 'active' && !task.done) ||
        (currentFilter === 'completed' && task.done);

      const matchesSearch =
        searchQuery === '' || task.text.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }

  function setFilter(filter) {
    currentFilter = filter;
    filterButtons.forEach((btn) => {
      const active = btn.dataset.filter === filter;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    render();
  }

  /* ---------------- Rendering ---------------- */
  function buildViewRow(task) {
    const li = document.createElement('li');
    li.className = task.done ? 'done' : '';
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', (task.done ? 'Mark as active: ' : 'Mark as done: ') + task.text);
    checkbox.addEventListener('change', () => toggleDone(task.id, checkbox.checked));

    const main = document.createElement('div');
    main.className = 'task-main';

    const span = document.createElement('span');
    span.className = 'text';
    span.textContent = task.text;

    const meta = document.createElement('div');
    meta.className = 'meta';

    const priority = task.priority || 'medium';
    const badge = document.createElement('span');
    badge.className = 'badge ' + priority;
    badge.textContent = priority;
    meta.appendChild(badge);

    if (task.dueDate) {
      const overdue = isOverdue(task);
      const due = document.createElement('span');
      due.className = 'due' + (overdue ? ' overdue' : '');
      due.textContent = (overdue ? 'Overdue · ' : 'Due ') + formatDue(task.dueDate);
      meta.appendChild(due);
    }

    main.append(span, meta);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', 'Edit: ' + task.text);
    editBtn.addEventListener('click', () => startEdit(task.id));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-btn danger';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', 'Delete: ' + task.text);
    delBtn.addEventListener('click', () => deleteTask(task.id));

    actions.append(editBtn, delBtn);

    li.append(checkbox, main, actions);
    return li;
  }

  function buildEditRow(task) {
    const li = document.createElement('li');
    li.dataset.id = task.id;

    // Use the in-progress draft's values (not the task's last-saved values)
    // so unsaved edits survive a re-render triggered by something else.
    const draft = editDraft || { text: task.text, priority: task.priority || 'medium', dueDate: task.dueDate || '' };

    const editForm = document.createElement('form');
    editForm.className = 'edit-form';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = draft.text;
    textInput.maxLength = 200;
    textInput.setAttribute('aria-label', 'Edit task text');
    textInput.addEventListener('input', () => { draft.text = textInput.value; });

    const prioritySel = document.createElement('select');
    prioritySel.setAttribute('aria-label', 'Edit priority');
    ['low', 'medium', 'high'].forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
      if (draft.priority === p) opt.selected = true;
      prioritySel.appendChild(opt);
    });
    prioritySel.addEventListener('change', () => { draft.priority = prioritySel.value; });

    const dueInput = document.createElement('input');
    dueInput.type = 'date';
    dueInput.value = draft.dueDate;
    dueInput.setAttribute('aria-label', 'Edit due date');
    dueInput.addEventListener('change', () => { draft.dueDate = dueInput.value; });

    const actions = document.createElement('div');
    actions.className = 'edit-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancelEdit);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save';

    actions.append(cancelBtn, saveBtn);
    editForm.append(textInput, prioritySel, dueInput, actions);

    editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = saveEdit(task.id, textInput.value, prioritySel.value, dueInput.value);
      if (!ok) textInput.focus();
    });

    // Escape cancels editing without saving.
    editForm.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancelEdit();
    });

    li.appendChild(editForm);
    return li;
  }

  function render() {
    const visible = getVisibleTasks();
    list.innerHTML = '';

    if (visible.length === 0) {
      empty.hidden = false;
      empty.textContent = tasks.length === 0
        ? 'No tasks yet.'
        : searchQuery
        ? 'No matching tasks.'
        : 'Nothing in this filter.';
    } else {
      empty.hidden = true;
      const fragment = document.createDocumentFragment();
      visible.forEach((task) => {
        fragment.appendChild(task.id === editingId ? buildEditRow(task) : buildViewRow(task));
      });
      list.appendChild(fragment);
    }

    const remaining = tasks.filter((t) => !t.done).length;
    count.textContent = tasks.length ? remaining + ' of ' + tasks.length + ' left' : '';
  }

  /* ---------------- Events ---------------- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const added = addTask(input.value, prioritySelect.value, dueDateInput.value);
    if (added) {
      form.reset();
      prioritySelect.value = 'medium';
      input.focus();
    }
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
  });

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });

  themeToggle.addEventListener('click', toggleTheme);

  /* ---------------- Init ---------------- */
  initTheme();
  render();
})();
