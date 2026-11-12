import {
  evaluate,
  solve,
  verify,
  Walkthrough,
  validateProblem,
  conditionKey,
} from "./engine.mjs";

// Panels consume a common view and subscribe to changes. New visualizations can
// subscribe without owning or mutating solver state, identities, or ordering.
export class PlaygroundStore {
  constructor(problem) {
    this.listeners = new Set();
    this.load(problem, false);
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(kind) {
    for (const fn of this.listeners) fn(this.view, kind);
  }
  get view() {
    const step = this.walk?.current;
    return {
      problem: this.problem,
      values: step?.values || this.problem.values,
      step,
      mode: this.mode,
      walk: this.walk,
      order: this.order,
      literal: this.literal,
      columns: this.columns,
      rows: this.rows,
    };
  }
  get columns() {
    if (this.columnCache) return this.columnCache;
    const list = Array.from({ length: this.problem.n }, (_, i) => i);
    if (this.order !== 0)
      list.sort(
        (a, b) =>
          (this.occurrences[b] - this.occurrences[a]) *
            (this.order === 1 ? 1 : -1) || a - b,
      );
    this.columnCache = list;
    return list;
  }
  get rows() {
    if (!this.literal) return this.problem.rules;
    if (this.rowCache) return this.rowCache;
    const has = (r) => r.lits.some((l) => conditionKey(l) === this.literal);
    this.rowCache = this.problem.rules
      .filter(has)
      .concat(this.problem.rules.filter((r) => !has(r)));
    return this.rowCache;
  }
  load(problem, notify = true) {
    validateProblem(problem);
    this.problem = {
      n: problem.n,
      rules: problem.rules,
      values: [...problem.values],
    };
    this.ruleIndices = new Map(problem.rules.map((r, i) => [r.id, i]));
    this.occurrences = Array(problem.n).fill(0);
    for (const r of problem.rules)
      for (const l of r.lits) this.occurrences[l.v]++;
    this.walk = null;
    this.mode = null;
    this.order = 0;
    this.literal = null;
    this.columnCache = null;
    this.rowCache = null;
    if (notify) this.emit("problem");
  }
  toggle(v) {
    if (this.walk) return false;
    this.problem.values[v] = !this.problem.values[v];
    this.emit("values");
    return true;
  }
  cycleOrder() {
    this.order = (this.order + 1) % 3;
    this.columnCache = null;
    this.emit("order");
  }
  focusCondition(l) {
    const key = l ? conditionKey(l) : null;
    this.literal = key === this.literal ? null : key;
    this.rowCache = null;
    this.emit("order");
  }
  start(mode) {
    if (this.walk) this.stop(false);
    this.mode = mode;
    this.walk = new Walkthrough(
      mode === "solve"
        ? solve(this.problem.n, this.problem.rules)
        : verify(this.problem.n, this.problem.rules, this.problem.values),
    );
    this.emit("walk");
  }
  next() {
    if (!this.walk) return;
    this.walk.next();
    this.emit("step");
  }
  prev() {
    if (!this.walk) return;
    this.walk.prev();
    this.emit("step");
  }
  stop(notify = true) {
    if (this.mode === "solve" && this.walk?.current.type === "solved")
      this.problem.values = [...this.walk.current.values];
    this.walk = null;
    this.mode = null;
    if (notify) this.emit("values");
  }
  summary() {
    const values = this.walk?.current.values || this.problem.values;
    const states = this.problem.rules.map((r) => evaluate(r, values));
    return {
      passed: states.filter((e) => e.status === "pass").length,
      failed: states.filter((e) => e.status === "fail").length,
      open: states.filter((e) => e.status === "open").length,
      states,
    };
  }
  exportProblem() {
    const v = this.view.values.map((v) => (v == null ? false : v));
    return { ...this.problem, values: [...v] };
  }
}
