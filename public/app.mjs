import {
  generate,
  nameOf,
  conditionKey,
  evaluate,
  toDimacs,
  fromDimacs,
  validateProblem,
  maxRules,
} from "./engine.mjs";
import { PlaygroundStore } from "./store.mjs";
import { ConditionNetwork, ruleColor } from "./network.mjs";

const $ = (id) => document.getElementById(id);
const STORAGE = "pnp-playground:v1";
let toastTimer,
  saveTimer,
  tableFrame = 0,
  tableWindow = "";
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ($("toast").hidden = true), 5500);
}
function initialProblem() {
  if (location.hash.startsWith("#p=")) {
    try {
      const data = JSON.parse(
        decodeURIComponent(
          escape(
            atob(location.hash.slice(3).replace(/-/g, "+").replace(/_/g, "/")),
          ),
        ),
      );
      return validateProblem(data);
    } catch {
      queueMicrotask(() =>
        toast("This shared link could not be read. A fresh problem is ready."),
      );
    }
  }
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) return validateProblem(JSON.parse(saved));
  } catch {}
  return generate(6, 10);
}
const store = new PlaygroundStore(initialProblem());
const network = new ConditionNetwork($("network"), {
  select: (l) => store.focusCondition(l),
  inspect: (node) => {
    $("node-tooltip").hidden = !node;
    if (node) {
      const v = store.view.values[node.l.v];
      $("node-tooltip").textContent =
        `${node.rule} · ${nameOf(node.l.v)} ${node.l.on ? "ON" : "OFF"} · ${v == null ? "undecided" : v === node.l.on ? "matches ✓" : "does not match ×"}`;
    }
  },
});
// Public panel API: subscribe to the same displayed assignment as existing panels.
// No hidden generator assignment is stored or exposed anywhere.
window.pnp = Object.freeze({
  subscribe: (fn) => store.subscribe(fn),
  getView: () => structuredClone({ ...store.view, walk: undefined }),
  exportDimacs: () => toDimacs(store.problem.n, store.problem.rules),
});

function save() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(store.problem));
    } catch {
      /* Storage may be disabled or full. The working problem remains in memory. */
    }
  }, 100);
}
const orderNames = [
  "Original order",
  "Most conditions first",
  "Fewest conditions first",
];
const tableContainer = $("table-scroll");
const rowHeight = () =>
  matchMedia("(min-width:1450px), (max-width:850px)").matches ? 50 : 48;
let cachedRows = [],
  cachedCols = [];
function renderTable(force = false) {
  const v = store.view,
    n = v.problem.n,
    allCols = cachedCols,
    allRows = cachedRows;
  const isVirtualRow = allRows.length > 120,
    isVirtualCol = n > 60;
  const firstWidth =
    innerWidth <= 620
      ? 79
      : innerWidth <= 1150 && innerWidth > 850
        ? 81
        : innerWidth <= 850
          ? 100
          : 92;
  const cw = innerWidth <= 620 ? 59 : 64;
  const minWidth = firstWidth + n * cw;
  $("matrix").style.width =
    minWidth > tableContainer.clientWidth ? `${minWidth}px` : "100%";
  let colStart = isVirtualCol
    ? Math.max(0, Math.floor(tableContainer.scrollLeft / cw) - 2)
    : 0;
  let colEnd = isVirtualCol
    ? Math.min(n, colStart + Math.ceil(tableContainer.clientWidth / cw) + 5)
    : n;
  const rh = rowHeight();
  let rowStart = isVirtualRow
    ? Math.max(0, Math.floor((tableContainer.scrollTop - 70) / rh) - 5)
    : 0;
  let rowEnd = isVirtualRow
    ? Math.min(
        allRows.length,
        rowStart + Math.ceil(tableContainer.clientHeight / rh) + 12,
      )
    : allRows.length;
  rowStart = Math.min(rowStart, Math.max(0, allRows.length - 1));
  colStart = Math.min(colStart, n - 1);
  const windowKey = `${rowStart}/${rowEnd}/${colStart}/${colEnd}`;
  if (!force && tableWindow === windowKey) return;
  tableWindow = windowKey;
  const cols = allCols.slice(colStart, colEnd),
    before = colStart * cw,
    after = (n - colEnd) * cw;
  let head = `<tr><th scope="col">RULE <span class="sr-only">and fulfilled conditions</span></th>${before ? `<th aria-hidden="true" style="width:${before}px"></th>` : ""}`;
  for (const i of cols) {
    const value = v.values[i],
      on = value === true,
      unknown = value == null;
    head += `<th scope="col" style="${isVirtualCol ? `width:${cw}px` : ""}"><button class="switch-header ${unknown ? "is-unknown" : on ? "is-on" : ""} ${v.step?.variable === i ? "active-variable" : ""}" data-switch="${i}" ${v.walk ? "disabled" : ""} aria-label="Switch ${nameOf(i)}, ${unknown ? "undecided" : on ? "ON" : "OFF"}. ${v.walk ? "Stop the walkthrough to edit." : "Tap to toggle."}" aria-pressed="${unknown ? "mixed" : on}"><span class="switch-name">${nameOf(i)}</span><span class="switch-state"><i class="mini-toggle"></i>${unknown ? "?" : on ? "ON" : "OFF"}</span><span class="switch-count">${store.occurrences[i]}×</span></button></th>`;
  }
  head += `${after ? `<th aria-hidden="true" style="width:${after}px"></th>` : ""}</tr>`;
  $("table-head").innerHTML = head;
  const cellCount = 1 + cols.length + (before ? 1 : 0) + (after ? 1 : 0);
  let html = rowStart
    ? `<tr class="spacer-row" aria-hidden="true"><td class="spacer-cell" colspan="${cellCount}" style="height:${rowStart * rh}px"></td></tr>`
    : "";
  for (let index = rowStart; index < rowEnd; index++) {
    const r = allRows[index],
      e = evaluate(r, v.values),
      active = v.step?.rule === r.id,
      group = v.literal && r.lits.some((l) => conditionKey(l) === v.literal),
      ri = store.ruleIndices.get(r.id);
    html += `<tr data-rule="${r.id}" class="${active ? "active-row" : ""} ${group ? "group-row" : ""}" aria-label="${r.id}, ${e.matches} of 3 conditions fulfilled, ${e.status === "pass" ? "satisfied" : e.status === "open" ? "undecided" : "unsatisfied"}"><th scope="row"><div class="row-label"><span class="rule-id"><i class="rule-dot" style="--rule-color:${ruleColor(ri)}"></i>${r.id}</span><span class="row-count ${e.status}">${e.matches}/3</span></div></th>${before ? '<td aria-hidden="true"></td>' : ""}`;
    for (const i of cols) {
      const l = r.lits.find((l) => l.v === i);
      if (!l) {
        html += "<td></td>";
        continue;
      }
      const unknown = v.values[i] == null,
        match = v.values[i] === l.on;
      html += `<td><button class="condition ${l.on ? "on" : "off"} ${unknown ? "unknown" : match ? "match" : "mismatch"} ${v.literal === conditionKey(l) ? "selected" : ""}" data-condition="${i}:${l.on ? 1 : 0}" aria-label="${r.id} requires ${nameOf(i)} ${l.on ? "ON" : "OFF"}, ${unknown ? "undecided" : match ? "matches" : "does not match"}. Group rules with this exact condition." aria-pressed="${v.literal === conditionKey(l)}"><span>${l.on ? "ON" : "OFF"}</span><span class="match-mark" aria-hidden="true">${unknown ? "?" : match ? "✓" : "×"}</span></button></td>`;
    }
    html += `${after ? '<td aria-hidden="true"></td>' : ""}</tr>`;
  }
  if (rowEnd < allRows.length)
    html += `<tr class="spacer-row" aria-hidden="true"><td class="spacer-cell" colspan="${cellCount}" style="height:${(allRows.length - rowEnd) * rh}px"></td></tr>`;
  $("table-body").innerHTML = html;
  $("matrix").setAttribute("aria-rowcount", allRows.length + 1);
  $("matrix").setAttribute("aria-colcount", n + 1);
}
function keepActiveRuleVisible() {
  const id = store.view.step?.rule;
  if (!id) return;
  const index = cachedRows.findIndex((r) => r.id === id);
  if (index < 0) return;
  const top = index * rowHeight(),
    bottom = top + rowHeight();
  if (top < tableContainer.scrollTop) tableContainer.scrollTop = top;
  else if (bottom > tableContainer.scrollTop + tableContainer.clientHeight - 70)
    tableContainer.scrollTop = bottom - tableContainer.clientHeight + 70;
  renderTable(true);
}
function renderWalk() {
  const v = store.view,
    s = v.step;
  $("walk-panel").hidden = !s;
  $("solve-btn").disabled = !!v.walk;
  $("check-btn").disabled = !!v.walk;
  if (!s) return;
  $("walk-mode").textContent =
    v.mode === "solve" ? "BACKTRACKING · DPLL" : "VERIFICATION · RULE BY RULE";
  $("walk-tag").textContent = s.type.replaceAll("_", " ").toUpperCase();
  $("step-title").textContent = s.title;
  $("step-detail").textContent = s.detail;
  const index = v.walk.index + 1,
    known = v.walk.history.length,
    total =
      v.mode === "check"
        ? v.problem.rules.length + 2
        : v.walk.history.at(-1).done
          ? known
          : "?";
  $("step-count").textContent = `${index} / ${total}`;
  $("step-count").setAttribute(
    "aria-label",
    `Step ${index} of ${total === "?" ? "not yet known" : total}`,
  );
  $("prev-btn").disabled = v.walk.index === 0;
  $("next-btn").disabled = !!s.done;
  $("stop-btn").innerHTML = 'Stop <span aria-hidden="true">×</span>';
  $("walk-stats").textContent =
    v.mode === "solve"
      ? `${s.decisions} decisions · ${s.forced} forced · ${s.backtracks} backtracks · depth ${s.depth || 0}`
      : `${s.checked || 0} checked · ${s.passed || 0} passed · ${v.problem.rules.length} total`;
  $("walk-note").textContent = s.done
    ? s.type === "solved"
      ? "Stop keeps this solution. Go backward to revisit any step."
      : "Walkthrough complete. Go backward to revisit any step."
    : "Entirely manual. Use ← / → to explore.";
}
function renderOverview() {
  const v = store.view,
    { passed, failed, open, states } = store.summary(),
    all = passed === v.problem.rules.length;
  $("satisfied-count").textContent = passed;
  $("total-count").textContent = ` / ${v.problem.rules.length}`;
  $("status-orb").classList.toggle("solved", all);
  $("status-title").textContent = all
    ? "Everything clicks!"
    : v.walk
      ? "Follow the reasoning"
      : "Keep exploring";
  $("status-text").textContent = all
    ? "You found a satisfying assignment."
    : open
      ? `${open} rule${open === 1 ? "" : "s"} still undecided.`
      : `${failed} rule${failed === 1 ? " needs" : "s need"} a matching condition.`;
  const segments = Math.min(35, states.length),
    step = states.length / segments;
  let html = "";
  for (let i = 0; i < segments; i++) {
    const group = states.slice(
      Math.floor(i * step),
      Math.floor((i + 1) * step),
    );
    html += `<i class="${group.every((e) => e.status === "pass") ? "pass" : group.every((e) => e.status === "fail") ? "fail" : ""}"></i>`;
  }
  $("satisfaction-meter").innerHTML = html;
}
function render(view, kind) {
  if (kind === "problem" || kind === "initial") {
    $("switch-count").value = view.problem.n;
    $("rule-count").value = view.problem.rules.length;
    tableContainer.scrollLeft = 0;
    tableContainer.scrollTop = 0;
    network.setProblem(view.problem.n, view.problem.rules);
    $("network-summary").textContent =
      `${view.problem.rules.length * 3} conditions · ${network.components} ${network.components === 1 ? "network" : "networks"}`;
    $("node-tooltip").hidden = true;
  }
  if (["problem", "initial", "order"].includes(kind)) {
    cachedCols = view.columns;
    cachedRows = view.rows;
  }
  renderTable(true);
  renderOverview();
  renderWalk();
  $("sort-label").textContent = orderNames[view.order];
  $("sort-btn").setAttribute(
    "aria-label",
    `Order columns: ${orderNames[view.order].toLowerCase()}. Switch to ${orderNames[(view.order + 1) % 3].toLowerCase()}.`,
  );
  $("filter-bar").hidden = !view.literal;
  if (view.literal) {
    const [v, on] = view.literal.split(":");
    const count = view.problem.rules.filter((r) =>
      r.lits.some((l) => conditionKey(l) === view.literal),
    ).length;
    $("filter-text").textContent =
      `${nameOf(Number(v))} ${on === "1" ? "ON" : "OFF"} · ${count} matching rule${count === 1 ? "" : "s"} first`;
  }
  network.update({
    values: view.values,
    rule: view.step?.rule,
    literal: view.literal,
    variable: view.step?.variable,
  });
  if (kind === "step" || kind === "walk") keepActiveRuleVisible();
  if (kind === "values" || kind === "problem" || kind === "initial") {
    save();
    if (kind !== "initial" && location.hash)
      history.replaceState(null, "", location.pathname + location.search);
  }
}
store.subscribe(render);
render(store.view, "initial");
$("physics-btn").setAttribute("aria-pressed", String(network.running));
$("physics-btn").querySelector("span").textContent = network.running
  ? "Physics on"
  : "Physics paused";
tableContainer.addEventListener(
  "scroll",
  () => {
    if (!tableFrame)
      tableFrame = requestAnimationFrame(() => {
        tableFrame = 0;
        renderTable();
      });
  },
  { passive: true },
);
new ResizeObserver(() => renderTable(true)).observe(tableContainer);
tableContainer.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  if (button.dataset.switch !== undefined) {
    const v = Number(button.dataset.switch);
    store.toggle(v);
    tableContainer
      .querySelector(`[data-switch="${v}"]`)
      ?.focus({ preventScroll: true });
  } else if (button.dataset.condition) {
    const rule = button.closest("[data-rule]").dataset.rule;
    const condition = button.dataset.condition;
    const [v, on] = button.dataset.condition.split(":").map(Number);
    store.focusCondition({ v, on: !!on });
    tableContainer
      .querySelector(`[data-rule="${rule}"] [data-condition="${condition}"]`)
      ?.focus({ preventScroll: true });
  }
});
$("sort-btn").addEventListener("click", () => store.cycleOrder());
$("clear-filter").addEventListener("click", () => store.focusCondition(null));
document.querySelectorAll("[data-step]").forEach((b) =>
  b.addEventListener("click", () => {
    const [id, delta] = b.dataset.step.split(":");
    const el = $(id),
      value = Number(el.value);
    el.value = Math.max(
      Number(el.min),
      (Number.isSafeInteger(value) ? value : Number(el.min)) + Number(delta),
    );
    updateSizeHint();
  }),
);
function updateSizeHint() {
  const n = Number($("switch-count").value),
    m = Number($("rule-count").value);
  if (Number.isSafeInteger(n) && n >= 3) {
    const max = maxRules(n);
    $("size-hint").textContent =
      BigInt(Number.isSafeInteger(m) && m > 0 ? m : 1) > max
        ? `With ${n} switches, New rules will use the maximum ${max} unique solvable rules.`
        : "No fixed size limit · Minimum 3 switches / 1 rule · Apply with New rules.";
  }
}
$("switch-count").addEventListener("input", updateSizeHint);
$("rule-count").addEventListener("input", updateSizeHint);
$("size-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!$("size-form").reportValidity()) return;
  const n = Number($("switch-count").value),
    m = Number($("rule-count").value);
  if (!Number.isSafeInteger(n) || n < 3 || !Number.isSafeInteger(m) || m < 1) {
    toast("Choose whole numbers: at least 3 switches and 1 rule.");
    return;
  }
  $("new-btn").disabled = true;
  $("new-btn").textContent = "Generating…";
  // Yield to paint before doing the work. No generator assignment is retained.
  window.setTimeout(() => {
    try {
      const p = generate(n, m);
      store.load(p);
      toast(
        p.clamped
          ? `Created ${p.rules.length} rules: the maximum number of unique solvable rules for ${n} switches.`
          : "Fresh rules. A solution is guaranteed — finding it is up to you.",
      );
      updateSizeHint();
    } catch (err) {
      toast(
        err.message ||
          "The problem is too large for this browser. Try a smaller size.",
      );
    } finally {
      $("new-btn").disabled = false;
      $("new-btn").innerHTML = '<span aria-hidden="true">↻</span> New rules';
    }
  }, 20);
});
$("solve-btn").addEventListener("click", () => {
  store.start("solve");
  $("walk-panel").scrollIntoView({
    block: "nearest",
    behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
      ? "auto"
      : "smooth",
  });
});
$("check-btn").addEventListener("click", () => {
  store.start("check");
  $("walk-panel").scrollIntoView({
    block: "nearest",
    behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
      ? "auto"
      : "smooth",
  });
});
$("next-btn").addEventListener("click", () => store.next());
$("prev-btn").addEventListener("click", () => store.prev());
$("stop-btn").addEventListener("click", () => store.stop());
document.addEventListener("keydown", (e) => {
  if (
    !store.walk ||
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey ||
    e.target.closest("input,textarea,dialog,canvas")
  )
    return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    store.next();
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    store.prev();
  }
  if (e.key === "Escape") store.stop();
});
$("physics-btn").addEventListener("click", () => {
  network.running = !network.running;
  $("physics-btn").setAttribute("aria-pressed", String(network.running));
  $("physics-btn").querySelector("span").textContent = network.running
    ? "Physics on"
    : "Physics paused";
});
$("zoom-in").addEventListener("click", () => network.changeZoom(1.2));
$("zoom-out").addEventListener("click", () => network.changeZoom(1 / 1.2));
$("fit-btn").addEventListener("click", () => network.fit());

function openHelp() {
  $("help-dialog").showModal();
}
$("help-btn").addEventListener("click", openHelp);
$("about-btn").addEventListener("click", openHelp);
document
  .querySelectorAll("[data-close]")
  .forEach((b) =>
    b.addEventListener("click", () => $(b.dataset.close).close()),
  );
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  }),
);
$("formula-btn").addEventListener("click", () => {
  $("formula-input").value = toDimacs(store.problem.n, store.problem.rules);
  $("formula-error").textContent = "";
  $("formula-dialog").showModal();
});
const parseFormula = (text) =>
  text.trimStart().startsWith("{")
    ? validateProblem(JSON.parse(text))
    : fromDimacs(text);
$("load-formula").addEventListener("click", () => {
  try {
    const p = parseFormula($("formula-input").value);
    store.load(p);
    $("formula-dialog").close();
    toast(
      "Formula loaded. Imported rules may be satisfiable or unsatisfiable.",
    );
  } catch (e) {
    $("formula-error").textContent = e.message;
  }
});
$("open-file").addEventListener("click", (e) => {
  e.preventDefault();
  $("formula-file").click();
});
$("formula-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    $("formula-input").value = await file.text();
    $("formula-error").textContent = "";
  } catch {
    $("formula-error").textContent = "This file could not be read.";
  }
  e.target.value = "";
});
$("unsat-example").addEventListener("click", () => {
  $("formula-input").value =
    "c All 8 sign patterns: no assignment can satisfy all rules.\np cnf 3 8\n" +
    Array.from(
      { length: 8 },
      (_, mask) =>
        [1, 2, 3].map((v, i) => (mask & (1 << i) ? v : -v)).join(" ") + " 0",
    ).join("\n");
  $("formula-error").textContent = "";
});
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$("download-formula").addEventListener("click", () => {
  try {
    const p = parseFormula($("formula-input").value);
    download(
      toDimacs(p.n, p.rules),
      `pnp-${p.n}-switches-${p.rules.length}-rules.cnf`,
      "text/plain",
    );
    $("formula-error").textContent = "";
  } catch (e) {
    $("formula-error").textContent = e.message;
  }
});
async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.top = "0";
    document.body.append(area);
    area.select();
    const success = document.execCommand("copy");
    area.remove();
    toast(
      success
        ? message
        : "Copy is unavailable in this browser. You can export the formula instead.",
    );
  }
}
$("copy-formula").addEventListener("click", () =>
  copy($("formula-input").value, "Formula copied."),
);
$("share-btn").addEventListener("click", () => {
  const p = store.exportProblem(),
    data = btoa(unescape(encodeURIComponent(JSON.stringify(p))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const url = location.origin + location.pathname + "#p=" + data;
  if (url.length > 60000) {
    download(JSON.stringify(p, null, 2), "pnp-puzzle.json", "application/json");
    toast(
      "This formula is large; downloaded a complete puzzle snapshot. Use DIMACS export for sharing in SAT tools.",
    );
    return;
  }
  copy(
    url,
    store.walk
      ? "Puzzle link copied. Undecided switches are shared as OFF; your walkthrough stays here."
      : "Puzzle link copied, including the current switch settings.",
  );
});
window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#p=")) {
    try {
      const p = validateProblem(
        JSON.parse(
          decodeURIComponent(
            escape(
              atob(
                location.hash.slice(3).replace(/-/g, "+").replace(/_/g, "/"),
              ),
            ),
          ),
        ),
      );
      store.load(p);
      toast("Shared puzzle loaded.");
    } catch {
      toast("This shared puzzle could not be read.");
    }
  }
});
window.addEventListener("pagehide", () => {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(store.problem));
  } catch {}
});
