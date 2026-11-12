// Pure problem logic. The solver receives only clauses and a variable count.
export const nameOf = (i) =>
  i < 26 ? String.fromCharCode(65 + i) : `X${i + 1}`;
export const conditionKey = (l) => `${l.v}:${l.on ? 1 : 0}`;
export const clauseKey = (ls) =>
  [...ls]
    .sort((a, b) => a.v - b.v)
    .map(conditionKey)
    .join(",");
export const maxRules = (n) =>
  (7n * BigInt(n) * BigInt(n - 1) * BigInt(n - 2)) / 6n;
export const evaluate = (rule, values) => {
  let matches = 0,
    unknown = 0;
  for (const l of rule.lits) {
    if (values[l.v] == null) unknown++;
    else if (values[l.v] === l.on) matches++;
  }
  return {
    matches,
    unknown,
    status: matches ? "pass" : unknown ? "open" : "fail",
  };
};
export function generate(n, requested, rng = Math.random) {
  if (
    !Number.isSafeInteger(n) ||
    n < 3 ||
    !Number.isSafeInteger(requested) ||
    requested < 1
  )
    throw new Error("Use whole numbers: at least 3 switches and 1 rule.");
  const total = maxRules(n),
    count = Number(BigInt(requested) > total ? total : BigInt(requested));
  const hidden = Array.from({ length: n }, () => rng() < 0.5);
  const rules = [],
    seen = new Set();
  const add = (lits) => {
    const key = clauseKey(lits);
    if (!seen.has(key)) {
      seen.add(key);
      rules.push({
        id: `R${rules.length + 1}`,
        lits: [...lits].sort((a, b) => a.v - b.v),
      });
    }
  };
  // Enumerate dense small formulas to avoid rejection sampling near saturation.
  if (total < 200000n && BigInt(count) * 3n > total) {
    const pool = [];
    for (let a = 0; a < n - 2; a++)
      for (let b = a + 1; b < n - 1; b++)
        for (let c = b + 1; c < n; c++)
          for (let mask = 0; mask < 8; mask++) {
            const ls = [a, b, c].map((v, i) => ({
              v,
              on: !!(mask & (1 << i)),
            }));
            if (ls.some((l) => l.on === hidden[l.v])) pool.push(ls);
          }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.slice(0, count).forEach(add);
  } else {
    while (rules.length < count) {
      const vs = new Set();
      while (vs.size < 3) vs.add(Math.floor(rng() * n));
      const ls = [...vs].map((v) => ({ v, on: rng() < 0.5 }));
      // Reject, rather than repair, for unbiased sampling among satisfying rules.
      if (ls.some((l) => l.on === hidden[l.v])) add(ls);
    }
  }
  return {
    n,
    rules,
    values: Array.from({ length: n }, () => rng() < 0.5),
    clamped: count !== requested,
  };
}

export function* solve(n, rules) {
  let values = Array(n).fill(null),
    decisions = 0,
    forced = 0,
    backtracks = 0;
  const stack = [];
  const event = (type, title, detail, extra = {}) => ({
    type,
    title,
    detail,
    values: [...values],
    rule: null,
    variable: null,
    depth: stack.length,
    decisions,
    forced,
    backtracks,
    ...extra,
  });
  yield event(
    "start",
    "Start with a clean slate",
    "All switches are undecided. Search uses only the rules, never the generator’s hidden assignment.",
  );
  while (true) {
    let conflict = null,
      unit = null,
      all = true;
    for (const r of rules) {
      const e = evaluate(r, values);
      if (e.status === "fail") {
        conflict = r;
        break;
      }
      if (e.status === "open") {
        all = false;
        if (e.unknown === 1 && !unit)
          unit = { r, l: r.lits.find((l) => values[l.v] == null) };
      }
    }
    if (conflict) {
      yield event(
        "conflict",
        `${conflict.id} cannot be satisfied`,
        "All three conditions are false. This branch is a dead end; the next step returns to an earlier decision.",
        { rule: conflict.id },
      );
      let recovered = false;
      while (stack.length) {
        const frame = stack.pop();
        values = [...frame.base];
        backtracks++;
        if (!frame.flipped) {
          frame.flipped = true;
          values[frame.v] = true;
          stack.push(frame);
          recovered = true;
          yield event(
            "backtrack",
            `Backtrack: try ${nameOf(frame.v)} ON`,
            "Undo the assignments after this decision and try its other value.",
            { variable: frame.v },
          );
          break;
        }
        yield event(
          "backtrack",
          `Both values of ${nameOf(frame.v)} failed`,
          "Restore the earlier assignment and move back to the preceding decision.",
          { variable: frame.v },
        );
      }
      if (!recovered) {
        yield event(
          "unsat",
          "No solution exists",
          "Every decision branch has been exhausted. These rules are unsatisfiable.",
          { done: true },
        );
        return;
      }
      continue;
    }
    if (all) {
      const remaining = values.filter((v) => v == null).length;
      values = values.map((v) => (v == null ? false : v));
      yield event(
        "solved",
        "Every rule is satisfied",
        remaining
          ? `${remaining} remaining switch${remaining === 1 ? " is" : "es are"} free to be either value. Set to OFF to finish a complete solution.`
          : "The current settings satisfy every rule. A solution has been found.",
        { done: true },
      );
      return;
    }
    if (unit) {
      values[unit.l.v] = unit.l.on;
      forced++;
      yield event(
        "forced",
        `${nameOf(unit.l.v)} must be ${unit.l.on ? "ON" : "OFF"}`,
        `${unit.r.id} has two false conditions. Its last undecided condition must hold. This is unit propagation.`,
        { rule: unit.r.id, variable: unit.l.v },
      );
      continue;
    }
    // Branch on the most frequent undecided variable in unresolved clauses.
    const counts = new Map();
    for (const r of rules)
      if (evaluate(r, values).status === "open")
        for (const l of r.lits)
          if (values[l.v] == null) counts.set(l.v, (counts.get(l.v) || 0) + 1);
    let v = -1,
      best = -1;
    for (const [i, c] of [...counts].sort((a, b) => a[0] - b[0]))
      if (c > best) {
        v = i;
        best = c;
      }
    stack.push({ v, base: [...values], flipped: false });
    values[v] = false;
    decisions++;
    yield event(
      "decision",
      `Try ${nameOf(v)} OFF`,
      "No assignment is forced. Choose a frequent undecided switch and explore OFF first; ON remains available if this branch fails.",
      { variable: v },
    );
  }
}

export function* verify(n, rules, current) {
  const values = [...current];
  let passed = 0;
  const event = (type, title, detail, extra = {}) => ({
    type,
    title,
    detail,
    values: [...values],
    rule: null,
    variable: null,
    checked: 0,
    passed,
    decisions: 0,
    forced: 0,
    backtracks: 0,
    ...extra,
  });
  yield event(
    "start",
    "Check the current settings",
    "Visit every rule in its original order. No switches will change.",
  );
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i],
      e = evaluate(r, values);
    if (e.status === "pass") passed++;
    yield event(
      e.status === "pass" ? "verified" : "rejected",
      `${r.id}: ${e.status === "pass" ? "satisfied" : "not satisfied"}`,
      `${e.matches} of 3 conditions match. ${e.matches ? "At least one condition holds, so this rule passes." : "All three conditions are false, so this rule fails."}`,
      { rule: r.id, checked: i + 1 },
    );
  }
  yield event(
    passed === rules.length ? "valid" : "invalid",
    passed === rules.length
      ? "This is a solution"
      : "These settings are not a solution",
    `${passed} of ${rules.length} rules passed. ${passed === rules.length ? "Every rule has at least one matching condition." : "A solution must satisfy every rule. Try other settings or use Find solution."}`,
    { checked: rules.length, done: true },
  );
}

export class Walkthrough {
  constructor(iterator) {
    this.iterator = iterator;
    this.history = [];
    this.index = -1;
    this.next();
  }
  get current() {
    return this.history[this.index];
  }
  next() {
    if (this.index + 1 < this.history.length) this.index++;
    else if (!this.current?.done) {
      const r = this.iterator.next();
      if (!r.done) {
        this.history.push(r.value);
        this.index++;
      }
    }
    return this.current;
  }
  prev() {
    if (this.index > 0) this.index--;
    return this.current;
  }
}

export function toDimacs(n, rules) {
  return (
    `c P / NP — 3-SAT playground\np cnf ${n} ${rules.length}\n` +
    rules
      .map(
        (r) =>
          r.lits.map((l) => (l.on ? "" : "-") + (l.v + 1)).join(" ") + " 0",
      )
      .join("\n") +
    "\n"
  );
}
export function fromDimacs(text) {
  let header = null;
  const tokens = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("c")) continue;
    if (line.startsWith("p")) {
      if (header) throw new Error("Use one p cnf header.");
      const m = line.match(/^p\s+cnf\s+(\d+)\s+(\d+)$/);
      if (!m) throw new Error("Expected: p cnf <switches> <rules>.");
      header = { n: Number(m[1]), count: Number(m[2]) };
    } else tokens.push(...line.split(/\s+/));
  }
  if (
    !header ||
    !Number.isSafeInteger(header.n) ||
    header.n < 3 ||
    !Number.isSafeInteger(header.count) ||
    header.count < 1
  )
    throw new Error(
      "Include a p cnf header with at least 3 switches and 1 rule.",
    );
  const rules = [];
  let lits = [];
  for (const t of tokens) {
    if (!/^-?\d+$/.test(t))
      throw new Error(`Invalid literal: ${t.slice(0, 25)}.`);
    const v = Number(t);
    if (!Number.isSafeInteger(v)) throw new Error("Literal is too large.");
    if (v === 0) {
      if (lits.length !== 3 || new Set(lits.map((l) => l.v)).size !== 3)
        throw new Error("Each rule needs exactly 3 different switches.");
      rules.push({ id: `R${rules.length + 1}`, lits });
      lits = [];
    } else {
      if (Math.abs(v) > header.n)
        throw new Error("A literal exceeds the declared switch count.");
      lits.push({ v: Math.abs(v) - 1, on: v > 0 });
      if (lits.length > 3)
        throw new Error("Each rule must contain exactly 3 conditions.");
    }
  }
  if (lits.length) throw new Error("End every rule with 0.");
  if (rules.length !== header.count)
    throw new Error(
      `Header declares ${header.count} rules, but found ${rules.length}.`,
    );
  return { n: header.n, rules, values: Array(header.n).fill(false) };
}
export function validateProblem(p) {
  if (
    !p ||
    !Number.isSafeInteger(p.n) ||
    p.n < 3 ||
    !Array.isArray(p.rules) ||
    p.rules.length < 1 ||
    !Array.isArray(p.values) ||
    p.values.length !== p.n ||
    p.values.some((v) => typeof v !== "boolean")
  )
    throw new Error("Invalid puzzle data.");
  const ids = new Set();
  for (const r of p.rules) {
    if (
      typeof r.id !== "string" ||
      !/^R[1-9]\d*$/.test(r.id) ||
      ids.has(r.id) ||
      !Array.isArray(r.lits) ||
      r.lits.length !== 3 ||
      new Set(r.lits.map((l) => l.v)).size !== 3 ||
      r.lits.some(
        (l) =>
          !Number.isSafeInteger(l.v) ||
          l.v < 0 ||
          l.v >= p.n ||
          typeof l.on !== "boolean",
      )
    )
      throw new Error("Invalid rule data.");
    ids.add(r.id);
  }
  return p;
}
