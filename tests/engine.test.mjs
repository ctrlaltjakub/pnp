import test from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  solve,
  verify,
  Walkthrough,
  evaluate,
  maxRules,
  clauseKey,
  toDimacs,
  fromDimacs,
  validateProblem,
} from "../public/engine.mjs";
import { PlaygroundStore } from "../public/store.mjs";

function random(seed = 7) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function exhaustive(n, rules) {
  for (let mask = 0; mask < 2 ** n; mask++) {
    const values = Array.from({ length: n }, (_, i) => !!(mask & (1 << i)));
    if (rules.every((r) => evaluate(r, values).status === "pass"))
      return values;
  }
  return null;
}
const unsat = () =>
  fromDimacs(
    "p cnf 3 8\n" +
      Array.from(
        { length: 8 },
        (_, m) =>
          [1, 2, 3].map((v, i) => (m & (1 << i) ? v : -v)).join(" ") + " 0",
      ).join("\n"),
  );

test("generation respects independent minima, uniqueness, and exact dense capacity", () => {
  const rng = random();
  for (let n = 3; n <= 8; n++)
    for (const requested of [1, 2, 7, 10, 50, 100]) {
      const p = generate(n, requested, rng);
      assert.equal(p.rules.length, Math.min(requested, Number(maxRules(n))));
      assert.equal(
        new Set(p.rules.map((r) => clauseKey(r.lits))).size,
        p.rules.length,
      );
      for (const r of p.rules) {
        assert.equal(new Set(r.lits.map((l) => l.v)).size, 3);
        assert.ok(r.lits.every((l) => l.v >= 0 && l.v < n));
      }
      assert.ok(
        exhaustive(n, p.rules),
        "generated formula must be satisfiable",
      );
      assert.equal("hidden" in p, false);
      assert.equal("answer" in p, false);
    }
  assert.throws(() => generate(2, 1));
  assert.throws(() => generate(3, 0));
  assert.throws(() => generate(3.5, 3));
});

test("DPLL agrees with exhaustive truth tables for 700 random SAT and UNSAT formulas", () => {
  const rng = random(31);
  for (let trial = 0; trial < 700; trial++) {
    const n = 3 + Math.floor(rng() * 5),
      count = 1 + Math.floor(rng() * 70),
      rules = [];
    for (let j = 0; j < count; j++) {
      const vs = new Set();
      while (vs.size < 3) vs.add(Math.floor(rng() * n));
      rules.push({
        id: `R${j + 1}`,
        lits: [...vs].map((v) => ({ v, on: rng() < 0.5 })),
      });
    }
    const expected = exhaustive(n, rules),
      steps = [...solve(n, rules)],
      last = steps.at(-1);
    assert.equal(last.type, expected ? "solved" : "unsat");
    assert.equal(last.done, true);
    if (expected)
      assert.ok(rules.every((r) => evaluate(r, last.values).status === "pass"));
    assert.ok(steps[0].values.every((v) => v === null));
    for (const s of steps) {
      assert.equal(s.values.length, n);
      if (s.type === "forced") {
        const rule = rules.find((r) => r.id === s.rule),
          previous = steps[steps.indexOf(s) - 1];
        assert.equal(evaluate(rule, previous.values).unknown, 1);
        assert.equal(evaluate(rule, previous.values).matches, 0);
      }
      if (s.type === "conflict")
        assert.equal(
          evaluate(
            rules.find((r) => r.id === s.rule),
            s.values,
          ).status,
          "fail",
        );
    }
  }
});

test("unsatisfiability walkthrough includes decisions, forced assignments, and backtracking", () => {
  const p = unsat(),
    steps = [...solve(p.n, p.rules)];
  for (const type of ["decision", "forced", "conflict", "backtrack", "unsat"])
    assert.ok(steps.some((s) => s.type === type));
  assert.ok(steps.at(-1).values.every((v) => v === null));
});

test("every backward step restores its exact snapshot and forward reuses it", () => {
  const p = unsat(),
    walk = new Walkthrough(solve(p.n, p.rules)),
    saved = [];
  while (true) {
    saved.push(JSON.stringify(walk.current));
    if (walk.current.done) break;
    walk.next();
  }
  const final = walk.index;
  walk.next();
  assert.equal(walk.index, final);
  for (let i = saved.length - 2; i >= 0; i--) {
    walk.prev();
    assert.equal(JSON.stringify(walk.current), saved[i]);
  }
  walk.prev();
  assert.equal(walk.index, 0);
  for (let i = 1; i < saved.length; i++) {
    walk.next();
    assert.equal(JSON.stringify(walk.current), saved[i]);
  }
});

test("verification examines every rule without changing its input assignment", () => {
  const p = generate(6, 10, random()),
    before = [...p.values],
    steps = [...verify(p.n, p.rules, p.values)];
  assert.equal(steps.length, 12);
  assert.deepEqual(
    steps.slice(1, -1).map((s) => s.rule),
    p.rules.map((r) => r.id),
  );
  for (const s of steps) assert.deepEqual(s.values, before);
  assert.deepEqual(p.values, before);
  assert.equal(
    steps.at(-1).passed,
    p.rules.filter((r) => evaluate(r, p.values).matches).length,
  );
});

test("column and literal sorting preserve identities, values, and walkthrough state", () => {
  const p = generate(6, 30, random()),
    store = new PlaygroundStore(p);
  store.start("solve");
  store.next();
  store.next();
  const step = JSON.stringify(store.view.step),
    values = [...store.view.values],
    ids = p.rules.map((r) => r.id),
    n = store.walk.index;
  store.cycleOrder();
  assert.ok(
    store.columns.every(
      (v, i, ls) => !i || store.occurrences[ls[i - 1]] >= store.occurrences[v],
    ),
  );
  store.cycleOrder();
  assert.ok(
    store.columns.every(
      (v, i, ls) => !i || store.occurrences[ls[i - 1]] <= store.occurrences[v],
    ),
  );
  store.cycleOrder();
  assert.deepEqual(store.columns, [0, 1, 2, 3, 4, 5]);
  const l = p.rules[0].lits[0];
  store.focusCondition(l);
  const isMatch = (r) => r.lits.some((x) => x.v === l.v && x.on === l.on),
    matching = p.rules.filter(isMatch);
  assert.deepEqual(store.rows.slice(0, matching.length), matching);
  assert.equal(JSON.stringify(store.view.step), step);
  assert.equal(store.walk.index, n);
  assert.deepEqual(store.view.values, values);
  store.focusCondition(l);
  assert.deepEqual(
    store.rows.map((r) => r.id),
    ids,
  );
  const before = JSON.stringify(store.view.values);
  assert.equal(store.toggle(0), false);
  assert.equal(JSON.stringify(store.view.values), before);
});

test("stopping search restores starting settings, while accepting a solution keeps it", () => {
  const store = new PlaygroundStore(generate(6, 10, random()));
  const before = [...store.view.values];
  store.start("solve");
  store.next();
  store.stop();
  assert.deepEqual(store.view.values, before);
  store.start("solve");
  while (!store.view.step.done) store.next();
  const solution = [...store.view.values];
  store.stop();
  assert.deepEqual(store.view.values, solution);
  assert.ok(store.summary().passed === 10);
  store.start("check");
  store.next();
  store.stop();
  assert.deepEqual(store.view.values, solution);
});

test("DIMACS round trips and rejects malformed/non-3-SAT input", () => {
  const p = generate(7, 30, random()),
    loaded = fromDimacs(toDimacs(p.n, p.rules));
  assert.deepEqual(loaded.rules, p.rules);
  assert.equal(loaded.n, p.n);
  assert.equal(fromDimacs("c test\np cnf 3 1\n1 -2\n3 0").rules.length, 1);
  for (const text of [
    "",
    "p cnf 2 1\n1 2 3 0",
    "p cnf 3 2\n1 2 3 0",
    "p cnf 3 1\n1 1 3 0",
    "p cnf 3 1\n1 2 4 0",
    "p cnf 3 1\n1 2 3",
    "p cnf 3 1\n1 2 0",
    "p cnf 3 1\n1 2 3 4 0",
    "p cnf 3 1\n1 2 <script> 0",
  ])
    assert.throws(() => fromDimacs(text));
});

test("shared-puzzle validation rejects unsafe identities and malformed values", () => {
  const p = generate(3, 1, random());
  assert.equal(validateProblem(p), p);
  assert.throws(() => validateProblem({ ...p, values: [true, false, null] }));
  assert.throws(() =>
    validateProblem({ ...p, rules: [{ ...p.rules[0], id: "<script>" }] }),
  );
  assert.throws(() =>
    validateProblem({ ...p, rules: [p.rules[0], p.rules[0]] }),
  );
});

test("sparse large problem does not require recursive search or arbitrary size caps", () => {
  const p = generate(10000, 1, random());
  const steps = [...solve(p.n, p.rules)];
  assert.equal(steps.at(-1).type, "solved");
  assert.equal(steps.at(-1).values.length, 10000);
});
