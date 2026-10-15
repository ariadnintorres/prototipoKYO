/* =========================================================
   KYO · keep yourself organized
   JavaScript puro, sin frameworks. Los datos viven en localStorage.
   ========================================================= */
(function () {
"use strict";

/* ---------------------------------------------------------
   1. UTILIDADES
   --------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 864e5);
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtShort = (m) => (m >= 60 ? fmt1(m / 60) + "h" : m + "m");
const fmtClock = (sec) => { const s = Math.ceil(sec); return pad(Math.floor(s / 60)) + ":" + pad(s % 60); };
const clampNum = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };
const clampInt = (v, min, max, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isId = (v) => typeof v === "string" && ID_RE.test(v);
const dowOf = (d) => DOW[new Date(d + "T12:00:00").getDay()];

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const COLORS = ["#ff8a52", "#3bb3c3", "#ff8fab", "#7c8cf0", "#f2b83b", "#4fbf8f", "#c77dd8", "#5a9be6"];
const TYPES = { exam: "Examen", task: "Tarea", proj: "Proyecto", read: "Repaso" };
const LIMITS = { focus: [1, 90, 25], short: [1, 30, 5], long: [1, 60, 15] };
const ID_RE = /^[\w-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------------------------------------------------------
   2. ESTADO
   --------------------------------------------------------- */
const LS_KEY = "kyo-v2";
const LS_OLD = "kyo-v1";
const LS_TAB = "kyo-v2:tab";
const LS_SUBJ = "kyo-v2:subj";
const LS_TIMER = "kyo-v2:timer";

function blankState() {
  return { v: 2, name: "", onboarded: false, subjects: [], tasks: [], sessions: [], settings: { focus: 25, short: 5, long: 15 } };
}

// Valida y limpia datos externos (localStorage o archivo importado) antes de usarlos.
function normalize(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.subjects)) return null;
  const isObj = (x) => x && typeof x === "object";
  const str = (v, max) => String(v ?? "").trim().slice(0, max);
  const id = (v) => (isId(v) ? v : uid());
  const list = (v) => (Array.isArray(v) ? v.filter(isObj) : []);
  const s = blankState();

  s.name = str(raw.name, 40);
  s.onboarded = !!raw.onboarded;
  s.subjects = list(raw.subjects).slice(0, 100).map((x, i) => ({
    id: id(x.id),
    name: str(x.name, 60) || "Asignatura",
    color: COLOR_RE.test(x.color) ? x.color : COLORS[i % COLORS.length],
    grades: list(x.grades).map((g) => ({
      id: id(g.id),
      name: str(g.name, 60) || "Prueba",
      score: clampNum(g.score, 0, 10),
      weight: clampNum(g.weight, 0, 100) ?? 0
    })).filter((g) => g.score != null)
  }));
  const ids = new Set(s.subjects.map((x) => x.id));
  const ref = (v) => (ids.has(v) ? v : null);
  s.tasks = list(raw.tasks).map((t) => ({
    id: id(t.id),
    title: str(t.title, 140),
    subject: ref(t.subject),
    due: DATE_RE.test(t.due) ? t.due : null,
    type: has(TYPES, t.type) ? t.type : "task",
    done: !!t.done,
    doneAt: DATE_RE.test(t.doneAt) ? t.doneAt : null
  })).filter((t) => t.title);
  s.sessions = list(raw.sessions).map((x) => ({
    id: id(x.id),
    date: DATE_RE.test(x.date) ? x.date : null,
    min: clampInt(x.min, 1, 180, 25),
    subject: ref(x.subject)
  })).filter((x) => x.date);
  const st = isObj(raw.settings) ? raw.settings : {};
  for (const k in LIMITS) s.settings[k] = clampInt(st[k], LIMITS[k][0], LIMITS[k][1], LIMITS[k][2]);
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const s = normalize(JSON.parse(raw)); if (s) return s; }
    // Migración desde la versión anterior (se ignoran los datos de ejemplo)
    const old = localStorage.getItem(LS_OLD);
    if (old) {
      const o = JSON.parse(old);
      if (o && !o.demo) { const s = normalize(o); if (s) { s.onboarded = true; return s; } }
    }
  } catch (e) { /* datos corruptos: se empieza de cero */ }
  return blankState();
}

let state = load();

const subjById = (id) => state.subjects.find((s) => s.id === id);

function subjAvg(s) {
  const g = s.grades;
  if (!g.length) return null;
  const w = g.reduce((a, x) => a + x.weight, 0);
  return w > 0 ? g.reduce((a, x) => a + x.score * x.weight, 0) / w : g.reduce((a, x) => a + x.score, 0) / g.length;
}
const avgClass = (a) => (a == null ? "none" : a >= 6.5 ? "ok" : a >= 5 ? "meh" : "ko");

function dueLabel(due) {
  if (!due) return "sin fecha";
  const d = diffDays(due, today());
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  if (d < 0) return `hace ${-d} días`;
  if (d < 7) return `en ${d} días`;
  return new Date(due + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

/* ---------------------------------------------------------
   3. GUARDADO
   --------------------------------------------------------- */
function setStatus(txt) { $("#saveStatus").textContent = txt; }

function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    setStatus("Guardado en este navegador ✓");
  } catch (e) {
    setStatus("No se pudo guardar: el almacenamiento está lleno o bloqueado. Exporta una copia.");
    toast("No se pudo guardar");
  }
}

// Cada sección se redibuja solo si sus datos cambiaron ("sucia") y cuando está visible.
const dirty = new Set();
function invalidate(...views) { views.forEach((v) => dirty.add(v)); }
function renderView(t) {
  if (!dirty.has(t)) return;
  dirty.delete(t);
  VIEWS[t].render();
  observeReveals($("#view-" + t));
}
function commit(...views) {
  save();
  invalidate(...views, "asistente");
  renderView(currentTab);
}

/* ---------------------------------------------------------
   4. NAVEGACIÓN
   --------------------------------------------------------- */
const VIEWS = {
  pendientes: { title: "Pendientes", sub: "Tareas, entregas y exámenes", render: renderPendientes },
  pomodoro: { title: "Pomodoro", sub: "Concéntrate a ratos y descansa", render: renderPomodoro },
  notas: { title: "Notas", sub: "Tus asignaturas y medias ponderadas", render: renderNotas },
  rendimiento: { title: "Rendimiento", sub: "Cómo vas con tu estudio", render: renderRendimiento },
  asistente: { title: "Tu asistente", sub: "Menos ruido. Más enfoque.", render: renderAsistente },
  ajustes: { title: "Ajustes", sub: "Tu nombre, el pomodoro y tus datos", render: renderAjustes }
};
const ALL = Object.keys(VIEWS);
invalidate(...ALL);

let currentTab = "pendientes";

function showTab(t) {
  if (!has(VIEWS, t)) t = "pendientes";
  currentTab = t;
  for (const k of ALL) {
    $("#view-" + k).hidden = k !== t;
    const b = $(`.nav-btn[data-tab="${k}"]`);
    if (k === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  }
  $("#pageTitle").textContent = VIEWS[t].title;
  $("#pageSub").textContent = VIEWS[t].sub;
  try { localStorage.setItem(LS_TAB, t); } catch (e) { /* sin almacenamiento */ }
  if (location.hash !== "#" + t) { try { history.replaceState(null, "", "#" + t); } catch (e) { /* file:// */ } }
  $("#content").scrollTop = 0;
  renderGreeting();
  renderView(t);
  observeReveals($("#view-" + t));
}

function renderAsistente() {
  const pendingTasks = state.tasks.filter((task) => !task.done).sort((first, second) =>
    (first.due || "9999").localeCompare(second.due || "9999"));
  const nextTask = pendingTasks[0];
  const lowestSubject = state.subjects.map((subject) => ({ subject, average: subjAvg(subject) }))
    .filter((entry) => entry.average !== null).sort((first, second) => first.average - second.average)[0];
  $("#assistantAdvice").innerHTML = `
    <article class="advice-row"><span class="advice-number">01</span><div><h3>${nextTask ? esc(nextTask.title) : "Deja espacio para lo importante"}</h3>
      <p>${nextTask ? `Tu primera tarea por fecha${nextTask.due ? `: ${dueLabel(nextTask.due)}` : ", todavía sin fecha"}.` : "Añade tu primera tarea para ordenar tus prioridades."}</p></div>
      <button class="btn ghost" type="button" data-goto="pendientes">Ver tareas</button></article>
    <article class="advice-row"><span class="advice-number">02</span><div><h3>${state.settings.focus} minutos para avanzar</h3>
      <p>Un bloque de enfoque, seguido de ${state.settings.short} minutos de descanso. Una cosa cada vez.</p></div>
      <button class="btn" type="button" data-goto="pomodoro">Ir al pomodoro</button></article>
    <article class="advice-row"><span class="advice-number">03</span><div><h3>${lowestSubject ? esc(lowestSubject.subject.name) : "Conoce tu progreso"}</h3>
      <p>${lowestSubject ? `Tu media más baja es ${fmt1(lowestSubject.average)}. Reserva un rato para repasar esta asignatura.` : "Apunta tus notas para descubrir qué asignatura necesita más atención."}</p></div>
      <button class="btn ghost" type="button" data-goto="notas">Ver notas</button></article>`;
}

let revealObserver;
function observeReveals(root) {
  if (!root || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!revealObserver) revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { root: $("#content"), threshold: 0.08 });
  root.querySelectorAll(".subj,.sticker,.charts > .card,.insight,.assistant-intro,.advice-row,.settings-grid > .card").forEach((element) => {
    if (element.classList.contains("reveal")) return;
    element.classList.add("reveal");
    revealObserver.observe(element);
  });
}

function renderGreeting() {
  const h = new Date().getHours();
  const base = h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
  $("#greet").textContent = state.name ? `¡${base}, ${state.name}!` : `¡${base}!`;
}

function emptyState({ title, text, action, target, goto }) {
  const attrs = target ? `data-action="focus" data-target="${target}"` : `data-goto="${goto}"`;
  return `<div class="empty">
    <svg class="empty-koi" viewBox="0 0 64 64" aria-hidden="true"><use href="#koi"/></svg>
    <h2>${title}</h2>
    <p>${text}</p>
    ${action ? `<button class="btn" type="button" ${attrs}>${action}</button>` : ""}
  </div>`;
}

function fillSubjectSelect(sel, want) {
  sel.innerHTML = `<option value="">Sin asignatura</option>` +
    state.subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  sel.value = state.subjects.some((s) => s.id === want) ? want : "";
}

/* ---------------------------------------------------------
   5. RENDER · PENDIENTES
   --------------------------------------------------------- */
let taskFilter = "pending";

function renderPendientes() {
  const t = today();
  const tasks = state.tasks;
  const pend = tasks.filter((x) => !x.done);

  fillSubjectSelect($("#tSubj"), $("#tSubj").value);
  $("#pendCount").textContent = pend.length;
  $$("#taskFilters [data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === taskFilter)));
  $("#taskFilters").hidden = !tasks.length;
  $("#taskSide").hidden = !tasks.length;
  $("#taskGrid").classList.toggle("solo", !tasks.length);

  if (!tasks.length) {
    $("#taskList").innerHTML = emptyState({
      title: "Aún no tienes tareas",
      text: "Escribe arriba lo primero que tengas que hacer: un examen, una entrega o un repaso. Ponle fecha y KYO te dirá qué vence antes.",
      action: "Escribir mi primera tarea",
      target: "#tTitle"
    });
    return;
  }

  let body = "";
  if (taskFilter === "done") {
    const done = tasks.filter((x) => x.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    body = done.length
      ? `<ul class="tlist">${done.map(taskItem).join("")}</ul>`
      : `<div class="empty-mini"><strong>Aún no has tachado nada</strong>Cuando completes una tarea aparecerá aquí.</div>`;
  } else {
    const list = taskFilter === "all" ? tasks : pend;
    const groups = [
      ["Atrasadas", (x) => !x.done && x.due && x.due < t, true],
      ["Hoy", (x) => x.due === t],
      ["Esta semana", (x) => x.due && x.due > t && diffDays(x.due, t) <= 7],
      ["Más adelante", (x) => x.due && diffDays(x.due, t) > 7],
      ["Sin fecha", (x) => !x.due],
      ["Pasadas", (x) => x.done && x.due && x.due < t]
    ];
    for (const [name, fn, late] of groups) {
      const g = list.filter(fn).sort((a, b) => (a.due || "").localeCompare(b.due || ""));
      if (!g.length) continue;
      body += `<h2 class="group-h${late ? " late" : ""}">${name} <span class="count num">${g.length}</span></h2><ul class="tlist">${g.map(taskItem).join("")}</ul>`;
    }
    if (!body) body = `<div class="empty-mini"><strong>¡Todo al día!</strong>No tienes nada pendiente. Añade una tarea arriba cuando la tengas.</div>`;
  }
  $("#taskList").innerHTML = body;

  const nextExam = pend.filter((x) => x.type === "exam" && x.due && x.due >= t).sort((a, b) => a.due.localeCompare(b.due))[0];
  const late = pend.filter((x) => x.due && x.due < t).length;
  const week = pend.filter((x) => x.due && x.due >= t && diffDays(x.due, t) <= 7).length;
  const doneWeek = tasks.filter((x) => x.done && x.doneAt && diffDays(t, x.doneAt) < 7).length;
  $("#taskSide").innerHTML = `
    <div class="sticker sakura">
      <h2 class="sticker-t">Próximo examen</h2>
      ${nextExam
        ? `<p class="next-title">${esc(nextExam.title)}</p><p class="muted small">${esc(subjById(nextExam.subject)?.name || "Sin asignatura")} · <b class="hl">${dueLabel(nextExam.due)}</b></p>`
        : `<p class="muted">Ningún examen apuntado.</p>`}
    </div>
    <div class="sticker koi">
      <h2 class="sticker-t">Esta semana</h2>
      <div class="stat-row">
        <div><div class="big num">${week}</div><div class="muted small">por hacer</div></div>
        <div><div class="big num${late ? " bad-txt" : ""}">${late}</div><div class="muted small">atrasadas</div></div>
      </div>
    </div>
    <div class="sticker water">
      <h2 class="sticker-t">Tachadas en 7 días</h2>
      <div class="big num">${doneWeek}</div>
    </div>`;
}

function taskItem(x) {
  const s = subjById(x.subject);
  const late = !x.done && x.due && x.due < today();
  return `<li class="titem${x.done ? " done" : ""}">
    <label class="check-wrap">
      <input type="checkbox" class="check" id="chk-${x.id}" data-id="${x.id}"${x.done ? " checked" : ""}>
      <span class="sr-only">Marcar como hecha: ${esc(x.title)}</span>
    </label>
    <div class="tbody">
      <span class="ttitle">${esc(x.title)}</span>
      <span class="tmeta">
        ${s ? `<span class="tsubj"><span class="sdot" style="background:${s.color}"></span>${esc(s.name)}</span>` : ""}
        <span class="chip ${x.type}">${TYPES[x.type]}</span>
        ${late ? `<span class="chip late">${dueLabel(x.due)}</span>` : `<span>${dueLabel(x.due)}</span>`}
      </span>
    </div>
    <button class="iconbtn" type="button" data-action="del-task" data-id="${x.id}" aria-label="Borrar tarea: ${esc(x.title)}">×</button>
  </li>`;
}

/* ---------------------------------------------------------
   6. RENDER · NOTAS
   --------------------------------------------------------- */
function renderNotas() {
  const box = $("#notasBody");
  if (!state.subjects.length) {
    box.innerHTML = emptyState({
      title: "Aún no tienes asignaturas",
      text: "Añade la primera para empezar a apuntar notas. KYO calculará tu media ponderada automáticamente.",
      action: "Añadir mi primera asignatura",
      target: "#sName"
    });
    return;
  }
  const avgs = state.subjects.map((s) => ({ s, a: subjAvg(s) }));
  const withA = avgs.filter((x) => x.a != null);
  const overall = withA.length ? withA.reduce((p, x) => p + x.a, 0) / withA.length : null;
  const passed = withA.filter((x) => x.a >= 5).length;
  const bars = avgs.map(({ s, a }) => `<div class="barrow">
      <span class="lbl" title="${esc(s.name)}">${esc(s.name)}</span>
      <div class="track" aria-hidden="true"><div class="fill" style="width:${a == null ? 0 : a * 10}%;background:${s.color}"></div><div class="pass"></div></div>
      <b class="num">${a == null ? "–" : fmt1(a)}</b>
    </div>`).join("");

  box.innerHTML = `
    <div class="notas-top">
      <div class="sticker koi avg-card">
        <h2 class="sticker-t">Media general</h2>
        <div class="big num">${overall == null ? "–" : fmt1(overall)}</div>
        <p class="muted small">${withA.length ? `${passed} de ${withA.length} asignaturas aprobadas` : "Añade notas para ver tu media"}</p>
      </div>
      <div class="card">
        <h2 class="card-t">Media por asignatura <span class="muted small">· la línea marca el 5</span></h2>
        <div class="bars">${bars}</div>
      </div>
    </div>
    <div class="subjects">${state.subjects.map(subjectCard).join("")}</div>
    <p class="muted small foot-note">La media de cada asignatura pondera cada nota por su peso. Si no pones pesos, se hace la media normal.</p>`;
}

function subjectCard(s) {
  const a = subjAvg(s);
  const wsum = Math.round(s.grades.reduce((p, g) => p + g.weight, 0));
  const rows = s.grades.map((g) => `<tr>
      <td>${esc(g.name)}</td>
      <td class="r"><b>${fmt1(g.score)}</b></td>
      <td class="r muted">${g.weight}%</td>
      <td class="r"><button class="iconbtn" type="button" data-action="del-grade" data-s="${s.id}" data-id="${g.id}" aria-label="Borrar nota: ${esc(g.name)}">×</button></td>
    </tr>`).join("");
  return `<article class="card subj">
    <div class="subj-h">
      <span class="sdot lg" style="background:${s.color}"></span>
      <h3>${esc(s.name)}</h3>
      <span class="avg ${avgClass(a)}" title="Media">${a == null ? "–" : fmt1(a)}</span>
    </div>
    ${rows
      ? `<table class="gtable"><caption class="sr-only">Notas de ${esc(s.name)}</caption><thead class="sr-only"><tr><th>Prueba</th><th>Nota</th><th>Peso</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="muted small">Sin notas todavía. Apunta la primera aquí debajo.</p>`}
    ${wsum > 0 && wsum < 100 ? `<p class="muted small">Evaluado el ${wsum}% de la asignatura</p>` : ""}
    <form class="gform" data-s="${s.id}" autocomplete="off">
      <div class="field"><label for="gn-${s.id}">Prueba</label><input class="in" name="n" id="gn-${s.id}" placeholder="Examen T1" required maxlength="60"></div>
      <div class="field"><label for="gv-${s.id}">Nota</label><input class="in num" name="v" id="gv-${s.id}" type="number" inputmode="decimal" step="0.01" min="0" max="10" placeholder="0–10" required></div>
      <div class="field"><label for="gw-${s.id}">Peso %</label><input class="in num" name="w" id="gw-${s.id}" type="number" inputmode="numeric" step="1" min="0" max="100" placeholder="opcional"></div>
      <button class="btn water" type="submit">Añadir nota</button>
    </form>
    <div class="subj-foot"><button class="btn ghost small" type="button" data-action="del-subj" data-id="${s.id}">Quitar asignatura</button></div>
  </article>`;
}

/* ---------------------------------------------------------
   7. RENDER · RENDIMIENTO
   --------------------------------------------------------- */
function renderRendimiento() {
  const box = $("#rendBody");
  const t = today();
  if (!state.sessions.length && !state.tasks.some((x) => x.done)) {
    box.innerHTML = emptyState({
      title: "Aún no hay datos de estudio",
      text: "Termina tu primer pomodoro o tacha una tarea y aquí verás tus horas de estudio, tu racha, el tiempo por asignatura y consejos.",
      action: "Empezar un pomodoro",
      goto: "pomodoro"
    });
    return;
  }

  const perDay = new Map();
  state.sessions.forEach((s) => perDay.set(s.date, (perDay.get(s.date) || 0) + s.min));
  const minBy = (d) => perDay.get(d) || 0;

  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const vals = days.map(minBy);
  const weekMin = vals.reduce((a, b) => a + b, 0);
  let prevMin = 0;
  for (let i = 7; i < 14; i++) prevMin += minBy(addDays(t, -i));
  const todayPomos = state.sessions.filter((s) => s.date === t).length;
  let streak = 0;
  for (let d = minBy(t) ? t : addDays(t, -1); minBy(d) > 0; d = addDays(d, -1)) streak++;
  const doneWeek = state.tasks.filter((x) => x.done && x.doneAt && diffDays(t, x.doneAt) < 7).length;
  const dueWeek = state.tasks.filter((x) => x.due && x.due <= t && diffDays(t, x.due) < 7).length;

  // Gráfico semanal
  const top = Math.ceil(Math.max(60, ...vals) / 60) * 60;
  const summary = days.map((d, i) => `${d === t ? "hoy" : dowOf(d)} ${vals[i]} minutos`).join(", ");
  const week = `<div class="week" role="img" aria-label="Minutos de estudio de los últimos 7 días: ${summary}">
    <div class="yaxis" aria-hidden="true">${[0, top / 2, top].map((v) => `<span style="bottom:${(v / top) * 100}%">${v >= 60 ? v / 60 + "h" : v + "m"}</span>`).join("")}</div>
    ${days.map((d, i) => `<div class="wcol" aria-hidden="true">
      <div class="wbarbox"><div class="wbar${d === t ? " today" : ""}" style="height:${(vals[i] / top) * 100}%">${vals[i] ? `<span class="v num">${fmtShort(vals[i])}</span>` : ""}</div></div>
      <span class="wlbl">${d === t ? "hoy" : dowOf(d)}</span>
    </div>`).join("")}
  </div>`;

  // Tiempo por asignatura (30 días)
  const last30 = state.sessions.filter((s) => diffDays(t, s.date) < 30);
  const bySub = {};
  last30.forEach((s) => { const k = s.subject || "_"; bySub[k] = (bySub[k] || 0) + s.min; });
  const subRows = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
  const smax = Math.max(1, ...subRows.map((r) => r[1]));
  const subBars = subRows.map(([k, m]) => {
    const s = subjById(k);
    const name = esc(s ? s.name : "Sin asignatura");
    return `<div class="barrow"><span class="lbl" title="${name}">${name}</span><div class="track" aria-hidden="true"><div class="fill" style="width:${(m / smax) * 100}%;background:${s ? s.color : "var(--muted)"}"></div></div><b class="num">${fmtShort(m)}</b></div>`;
  }).join("");

  // Consejos
  const ins = [];
  if (weekMin || prevMin) {
    const diff = weekMin - prevMin;
    ins.push(diff >= 0
      ? `Esta semana llevas <b>${fmt1(weekMin / 60)} h</b> de estudio${prevMin ? `, <b>${fmt1(diff / 60)} h más</b> que la anterior` : ". ¡Buen arranque!"}.`
      : `Esta semana llevas <b>${fmt1(weekMin / 60)} h</b>, ${fmt1(-diff / 60)} h menos que la anterior. Un par de pomodoros más y la igualas.`);
  }
  const best = vals.indexOf(Math.max(...vals));
  if (vals[best] > 0) ins.push(`Tu mejor día fue <b>${days[best] === t ? "hoy" : "el " + dowOf(days[best])}</b>, con ${vals[best]} minutos.`);
  const graded = state.subjects.map((s) => ({ s, a: subjAvg(s), m: bySub[s.id] || 0 })).filter((x) => x.a != null);
  if (graded.length >= 2) {
    const low = graded.slice().sort((a, b) => a.a - b.a)[0];
    const total = last30.reduce((a, s) => a + s.min, 0) || 1;
    ins.push(`<b>${esc(low.s.name)}</b> es tu media más baja (${fmt1(low.a)}) y le has dedicado el ${Math.round((low.m / total) * 100)}% de tu estudio en 30 días.${low.a < 5 ? " Podría merecer más pomodoros." : ""}`);
  }
  const forgotten = state.subjects.find((s) => !bySub[s.id] && state.tasks.some((x) => !x.done && x.subject === s.id));
  if (forgotten) ins.push(`Tienes cosas pendientes de <b>${esc(forgotten.name)}</b> pero no la has estudiado en el último mes.`);
  if (streak >= 3) ins.push(`¡Llevas <b>${streak} días seguidos</b> estudiando! No rompas la racha.`);
  if (!ins.length) ins.push("Cuando termines pomodoros y apuntes notas, aquí verás consejos sobre cómo te va.");

  const todayMin = minBy(t);
  box.innerHTML = `
    <div class="kpis">
      <div class="sticker kpi koi"><div class="k-l">Estudio 7 días</div><div class="big num">${fmt1(weekMin / 60)} h</div><div class="sub">${weekMin} minutos</div></div>
      <div class="sticker kpi water"><div class="k-l">Pomodoros hoy</div><div class="big num">${todayPomos}</div><div class="sub">${todayMin ? todayMin + " min" : "aún ninguno"}</div></div>
      <div class="sticker kpi sakura"><div class="k-l">Racha</div><div class="big num">${streak} ${streak === 1 ? "día" : "días"}</div><div class="sub">seguidos estudiando</div></div>
      <div class="sticker kpi good"><div class="k-l">Tareas hechas</div><div class="big num">${doneWeek}</div><div class="sub">últimos 7 días${dueWeek ? ` · ${dueWeek} vencían` : ""}</div></div>
    </div>
    <div class="charts">
      <div class="card"><h2 class="card-t">Minutos de estudio por día</h2>${week}</div>
      <div class="card"><h2 class="card-t">Tiempo por asignatura <span class="muted small">· 30 días</span></h2>
        <div class="bars">${subBars || `<p class="muted">Sin sesiones todavía. Usa el pomodoro y aparecerán aquí.</p>`}</div>
      </div>
    </div>
    <div class="insights">${ins.map((i) => `<div class="insight"><svg class="ic" viewBox="0 0 64 64" aria-hidden="true"><use href="#koi"/></svg><p>${i}</p></div>`).join("")}</div>`;
}

/* ---------------------------------------------------------
   8. RENDER · AJUSTES
   --------------------------------------------------------- */
function renderAjustes() {
  $("#setName").value = state.name;
  $("#setFocus").value = state.settings.focus;
  $("#setShort").value = state.settings.short;
  $("#setLong").value = state.settings.long;
  hideWipeConfirm(false);
}

function hideWipeConfirm(focusBack) {
  $("#wipeConfirm").hidden = true;
  $("#wipeAsk").hidden = false;
  $("#wipeAsk").setAttribute("aria-expanded", "false");
  if (focusBack) $("#wipeAsk").focus();
}

/* ---------------------------------------------------------
   9. POMODORO
   Se guarda la hora de fin (endAt) y no un contador: así sigue
   siendo exacto aunque el navegador frene la pestaña en segundo plano.
   --------------------------------------------------------- */
const CIRC = 2 * Math.PI * 96;
const MODES = {
  focus: { label: "a concentrarse", color: "var(--koi)", short: "Enfoque" },
  short: { label: "respira un poco", color: "var(--water)", short: "Descanso" },
  long: { label: "descanso largo", color: "var(--sakura)", short: "Descanso largo" }
};
const timer = { mode: "focus", running: false, endAt: 0, remaining: null, cycle: 0, subject: null };
const ui = {
  clock: $("#clock"), ring: $("#ring"), modeLabel: $("#modeLabel"), subject: $("#ringSubject"),
  start: $("#startBtn"), navTime: $("#navTime"), navPomo: $("#navPomo"), select: $("#pomoSubject")
};
ui.ring.style.strokeDasharray = CIRC;
let tickId = null;
let audioCtx = null;

const durOf = (m) => state.settings[m] * 60;
const remainingSec = () => (timer.running ? Math.max(0, (timer.endAt - Date.now()) / 1000) : timer.remaining ?? durOf(timer.mode));

function saveTimer() { try { localStorage.setItem(LS_TIMER, JSON.stringify(timer)); } catch (e) { /* sin almacenamiento */ } }
function loadTimer() {
  try {
    const t = JSON.parse(localStorage.getItem(LS_TIMER) || "null");
    if (!t || !has(MODES, t.mode)) return;
    timer.mode = t.mode;
    timer.endAt = Number(t.endAt) || 0;
    timer.running = !!t.running && timer.endAt > 0;
    timer.remaining = Number.isFinite(t.remaining) ? t.remaining : null;
    timer.cycle = clampInt(t.cycle, 0, 9999, 0);
    timer.subject = isId(t.subject) ? t.subject : null;
  } catch (e) { /* estado del temporizador corrupto */ }
}

function startTick() { if (!tickId) tickId = setInterval(tick, 250); }
function stopTick() { clearInterval(tickId); tickId = null; }
function tick() {
  if (!timer.running) return stopTick();
  if (remainingSec() <= 0) finish(); else drawTimer();
}

function startTimer() {
  timer.endAt = Date.now() + remainingSec() * 1000;
  timer.subject = ui.select.value || null;
  timer.running = true;
  saveTimer(); startTick(); drawTimer();
}
function pauseTimer() {
  timer.remaining = remainingSec();
  timer.running = false;
  saveTimer(); stopTick(); drawTimer();
}
function setMode(m) {
  timer.mode = m; timer.running = false; timer.remaining = null;
  saveTimer(); stopTick(); drawTimer();
}

function finish(silent) {
  const endedAt = Math.min(timer.endAt, Date.now());
  timer.running = false; timer.remaining = null;
  stopTick();
  if (timer.mode === "focus") {
    state.sessions.push({ id: uid(), date: iso(new Date(endedAt)), min: state.settings.focus, subject: subjById(timer.subject) ? timer.subject : null });
    timer.cycle++;
    timer.mode = timer.cycle % 4 === 0 ? "long" : "short";
    commit("pomodoro", "rendimiento");
    if (!silent) { chime(); toast("¡Pomodoro completado! Toca descansar"); }
  } else {
    timer.mode = "focus";
    if (!silent) { chime(); toast("Descanso terminado. ¡A por otro!"); }
  }
  saveTimer();
  drawTimer();
}

// Solo actualiza los elementos del reloj, nunca la página entera.
function drawTimer() {
  const r = remainingSec();
  const txt = fmtClock(r);
  const info = MODES[timer.mode];
  ui.clock.textContent = txt;
  ui.ring.style.strokeDashoffset = CIRC * (1 - r / durOf(timer.mode));
  ui.ring.style.stroke = info.color;
  ui.modeLabel.textContent = info.label;
  $$("#modes [data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === timer.mode)));
  ui.start.textContent = timer.running ? "Pausar" : timer.remaining != null && timer.remaining < durOf(timer.mode) ? "Seguir" : "Empezar";
  const s = subjById(timer.running ? timer.subject : ui.select.value);
  ui.subject.textContent = timer.mode === "focus" && s ? s.name : "";
  ui.navTime.hidden = !timer.running;
  ui.navTime.textContent = txt;
  ui.navPomo.classList.toggle("is-running", timer.running);
  document.title = timer.running ? `${txt} · ${info.short} · KYO` : "KYO";
}

function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    else if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { audioCtx = null; }
}
function chime() {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    [784, 988, 1175].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), at = now + i * 0.18;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(at); o.stop(at + 0.55);
    });
  } catch (e) { /* sin audio */ }
}

function renderPomodoro() {
  let want = timer.running ? timer.subject : ui.select.value;
  if (!want) { try { want = localStorage.getItem(LS_SUBJ) || ""; } catch (e) { want = ""; } }
  fillSubjectSelect(ui.select, want);
  $("#pomoHint").hidden = state.subjects.length > 0;

  const tp = state.sessions.filter((s) => s.date === today());
  $("#todayBubbles").innerHTML = tp.length
    ? `<span class="sr-only">${tp.length} completados</span>` + tp.map((s) => {
        const sub = subjById(s.subject);
        return `<span class="bubble" style="--c:${sub ? sub.color : "var(--water)"}" title="${esc(sub ? sub.name : "Sin asignatura")}" aria-hidden="true"></span>`;
      }).join("")
    : `<span class="muted small">Todavía ninguno. ¡El primero es el que más cuesta!</span>`;
  const m = tp.reduce((a, s) => a + s.min, 0);
  $("#todayMinutes").textContent = m ? `${m} minutos de estudio hoy` : "";
  const st = state.settings;
  $("#pomoConfig").textContent = `Enfoque ${st.focus} min · Descanso ${st.short} / ${st.long} min`;
  drawTimer();
}

/* ---------------------------------------------------------
   10. ACCIONES SOBRE LOS DATOS
   --------------------------------------------------------- */
function addTask() {
  const title = $("#tTitle").value.trim();
  if (!title) return;
  state.tasks.push({ id: uid(), title: title.slice(0, 140), subject: $("#tSubj").value || null, due: $("#tDue").value || null, type: $("#tType").value, done: false, doneAt: null });
  if (taskFilter === "done") taskFilter = "pending";
  $("#tTitle").value = "";
  $("#tDue").value = "";
  commit("pendientes", "rendimiento");
  toast("Tarea añadida");
  $("#tTitle").focus();
}

function toggleTask(id, checked) {
  const x = state.tasks.find((t) => t.id === id);
  if (!x) return;
  x.done = checked;
  x.doneAt = checked ? today() : null;
  commit("pendientes", "rendimiento");
  ($("#chk-" + id) || $("#taskList")).focus();
  if (checked) toast("¡Tachada! ✿");
}

function addSubjectsByName(names) {
  const known = new Set(state.subjects.map((s) => s.name.toLowerCase()));
  let added = 0;
  for (const raw of names) {
    const name = raw.trim().slice(0, 60);
    if (!name || known.has(name.toLowerCase()) || state.subjects.length >= 100) continue;
    known.add(name.toLowerCase());
    state.subjects.push({ id: uid(), name, color: COLORS[state.subjects.length % COLORS.length], grades: [] });
    added++;
  }
  return added;
}

function addSubject() {
  const input = $("#sName");
  if (!input.value.trim()) return;
  if (!addSubjectsByName([input.value])) { toast("Esa asignatura ya existe"); return; }
  input.value = "";
  commit(...ALL);
  toast("Asignatura añadida");
  input.focus();
}

function addGrade(form) {
  const s = subjById(form.dataset.s);
  if (!s) return;
  const v = clampNum(form.elements.v.value, 0, 10);
  if (v == null || form.elements.v.value === "") { toast("La nota va de 0 a 10"); return; }
  s.grades.push({ id: uid(), name: form.elements.n.value.trim().slice(0, 60) || "Prueba", score: v, weight: clampNum(form.elements.w.value, 0, 100) ?? 0 });
  commit("notas", "rendimiento");
  toast("Nota guardada");
  const next = $("#gn-" + s.id);
  if (next) next.focus();
}

function deleteSubject(btn) {
  // Confirmación en dos pasos dentro del propio botón
  if (btn.dataset.confirm !== "1") {
    btn.dataset.confirm = "1";
    btn.textContent = "¿Seguro? Pulsa otra vez";
    btn.classList.replace("ghost", "danger");
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.dataset.confirm = "";
      btn.textContent = "Quitar asignatura";
      btn.classList.replace("danger", "ghost");
    }, 4000);
    return;
  }
  const id = btn.dataset.id;
  state.subjects = state.subjects.filter((s) => s.id !== id);
  state.tasks.forEach((t) => { if (t.subject === id) t.subject = null; });
  state.sessions.forEach((s) => { if (s.subject === id) s.subject = null; });
  commit(...ALL);
  toast("Asignatura quitada");
}

function saveName(value) {
  state.name = value.trim().slice(0, 40);
  save();
  renderGreeting();
}

function setMinutes(input) {
  const key = input.dataset.key;
  if (!has(LIMITS, key)) return;
  const [min, max] = LIMITS[key];
  const v = clampInt(input.value, min, max, state.settings[key]);
  state.settings[key] = v;
  input.value = v;
  if (!timer.running && timer.mode === key) { timer.remaining = null; saveTimer(); }
  commit("pomodoro");
  drawTimer();
  toast("Minutos guardados");
}

/* Copia de seguridad */
function exportData() {
  const data = JSON.stringify(Object.assign({ app: "KYO", exportedAt: new Date().toISOString() }, state), null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `kyo-copia-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Copia descargada");
}

async function importData(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast("El archivo es demasiado grande"); return; }
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!data) throw new Error("formato");
    data.onboarded = true;
    state = data;
    save();
    closeWelcome();
    invalidate(...ALL);
    showTab(currentTab);
    drawTimer();
    toast("Datos importados ✓");
  } catch (e) {
    toast("Ese archivo no es una copia válida de KYO");
  }
}

function wipeAll() {
  state = blankState();
  save();
  Object.assign(timer, { mode: "focus", running: false, endAt: 0, remaining: null, cycle: 0, subject: null });
  stopTick();
  try { [LS_TIMER, LS_SUBJ, LS_OLD].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* sin almacenamiento */ }
  taskFilter = "pending";
  invalidate(...ALL);
  showTab("pendientes");
  drawTimer();
  openWelcome();
  toast("Datos borrados. ¡Empezamos de cero!");
}

/* Bienvenida */
function openWelcome() {
  const d = $("#welcome");
  $("#welcomeForm").reset();
  if (typeof d.showModal === "function") { if (!d.open) d.showModal(); }
  else d.setAttribute("open", "");
}
function closeWelcome() {
  const d = $("#welcome");
  if (!d.open) return;
  if (typeof d.close === "function") d.close(); else d.removeAttribute("open");
}
function finishWelcome() {
  state.name = $("#wName").value.trim().slice(0, 40);
  const added = addSubjectsByName($("#wSubjects").value.split(/[\n,;]+/));
  state.onboarded = true;
  save();
  closeWelcome();
  invalidate(...ALL);
  showTab(added ? "pendientes" : currentTab);
  toast(state.name ? `¡Hola, ${state.name}! Todo listo` : "¡Todo listo! A organizarse");
}
function skipWelcome() {
  state.onboarded = true;
  save();
  closeWelcome();
}

/* ---------------------------------------------------------
   11. EVENTOS (delegados: un único listener por tipo)
   --------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-tab],[data-goto]");
  if (nav) { showTab(nav.dataset.tab || nav.dataset.goto); return; }

  const mode = e.target.closest("#modes [data-mode]");
  if (mode) { setMode(mode.dataset.mode); return; }

  const el = e.target.closest("[data-action]");
  if (!el) return;
  switch (el.dataset.action) {
    case "toggle-timer": ensureAudio(); timer.running ? pauseTimer() : startTimer(); break;
    case "reset-timer": setMode(timer.mode); break;
    case "skip-timer": setMode(timer.mode === "focus" ? "short" : "focus"); break;
    case "filter": taskFilter = el.dataset.f; renderPendientes(); break;
    case "del-task":
      state.tasks = state.tasks.filter((x) => x.id !== el.dataset.id);
      commit("pendientes", "rendimiento");
      $("#taskList").focus();
      toast("Tarea borrada");
      break;
    case "del-grade": {
      const s = subjById(el.dataset.s);
      if (s) { s.grades = s.grades.filter((g) => g.id !== el.dataset.id); commit("notas", "rendimiento"); }
      break;
    }
    case "del-subj": deleteSubject(el); break;
    case "focus": { const target = $(el.dataset.target); if (target) target.focus(); break; }
    case "export": exportData(); break;
    case "import": $("#importFile").click(); break;
    case "wipe-ask":
      $("#wipeConfirm").hidden = false;
      el.hidden = true;
      el.setAttribute("aria-expanded", "true");
      $("#wipeCancel").focus();
      break;
    case "wipe-cancel": hideWipeConfirm(true); break;
    case "wipe-yes": wipeAll(); break;
    case "welcome-skip": skipWelcome(); break;
  }
});

document.addEventListener("submit", (e) => {
  const f = e.target;
  e.preventDefault();
  if (f.id === "taskForm") addTask();
  else if (f.id === "subjForm") addSubject();
  else if (f.classList.contains("gform")) addGrade(f);
  else if (f.id === "profileForm") { saveName($("#setName").value); toast("Nombre guardado"); }
  else if (f.id === "welcomeForm") finishWelcome();
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.matches(".check[data-id]")) toggleTask(el.dataset.id, el.checked);
  else if (el === ui.select) {
    try { localStorage.setItem(LS_SUBJ, el.value); } catch (err) { /* sin almacenamiento */ }
    if (timer.running) { timer.subject = el.value || null; saveTimer(); }
    drawTimer();
  }
  else if (el.matches("#pomoForm input")) setMinutes(el);
  else if (el.id === "importFile") importData(el);
});

// Cerrar la bienvenida con Esc cuenta como "Ahora no"
$("#welcome").addEventListener("cancel", () => { state.onboarded = true; save(); });

window.addEventListener("hashchange", () => {
  const t = location.hash.slice(1);
  if (has(VIEWS, t) && t !== currentTab) showTab(t);
});

// Al volver a la pestaña: el reloj se pone al día y, si cambió el día, se refrescan los datos.
let lastDay = today();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (timer.running) tick();
  if (today() !== lastDay) {
    lastDay = today();
    invalidate(...ALL);
    renderGreeting();
    renderView(currentTab);
  }
});

/* ---------------------------------------------------------
   12. ARRANQUE
   --------------------------------------------------------- */
loadTimer();
let firstTab = location.hash.slice(1);
if (!has(VIEWS, firstTab)) { try { firstTab = localStorage.getItem(LS_TAB) || ""; } catch (e) { firstTab = ""; } }
showTab(firstTab);
if (timer.running) {
  if (remainingSec() <= 0) finish(true); else startTick();
}
drawTimer();
if (!state.onboarded) openWelcome();
})();
