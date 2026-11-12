import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("UI completes both manual walkthroughs, preserves sorting, imports UNSAT, and shares current settings", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, { url: "https://pnp.example.test/" }),
    w = dom.window;
  const ctx = new Proxy({}, { get: (o, k) => o[k] || (() => {}) });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const clipboard = [];
  Object.defineProperty(w.navigator, "clipboard", {
    value: { writeText: async (text) => clipboard.push(text) },
  });
  const media = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  class Observer {
    observe() {}
    disconnect() {}
  }
  const globals = {
    window: w,
    document: w.document,
    navigator: w.navigator,
    location: w.location,
    history: w.history,
    localStorage: w.localStorage,
    matchMedia: media,
    ResizeObserver: Observer,
    IntersectionObserver: Observer,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    devicePixelRatio: 1,
    innerWidth: 1200,
  };
  const previous = new Map();
  for (const [k, v] of Object.entries(globals)) {
    previous.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, {
      value: v,
      writable: true,
      configurable: true,
    });
  }
  try {
    await import("../public/app.mjs");
    const $ = (id) => w.document.getElementById(id),
      click = (id) => $(id).click();
    const view = () => w.pnp.getView();
    assert.equal($("table-body").querySelectorAll("tr[data-rule]").length, 10);
    assert.equal($("table-head").querySelectorAll("[data-switch]").length, 6);
    const before = view().values[0];
    $("table-head").querySelector('[data-switch="0"]').click();
    assert.equal(view().values[0], !before);
    const firstCell = $("table-body").querySelector("[data-condition]");
    const condition = firstCell.dataset.condition;
    firstCell.click();
    assert.equal(view().literal, condition);
    click("clear-filter");
    assert.equal(view().literal, null);
    click("solve-btn");
    assert.equal(view().step.type, "start");
    assert.ok(view().values.every((v) => v === null));
    assert.ok($("table-body").textContent.includes("?"));
    assert.equal($("prev-btn").disabled, true);
    assert.equal($("solve-btn").disabled, true);
    // Waiting does not advance anything: all progression requires a click.
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(view().step.type, "start");
    click("next-btn");
    const snapshot = JSON.stringify(view().step);
    assert.equal(w.document.documentElement.dataset.theme, "dark");
    click("theme-btn");
    assert.equal(w.document.documentElement.dataset.theme, "light");
    assert.equal(w.localStorage.getItem("pnp-theme"), "light");
    assert.equal(
      $("theme-btn").getAttribute("aria-label"),
      "Switch to dark mode",
    );
    assert.equal(JSON.stringify(view().step), snapshot);
    assert.equal($("fabric-btn").getAttribute("aria-checked"), "false");
    assert.equal($("grid-btn").hidden, true);
    click("fabric-btn");
    assert.equal($("fabric-btn").getAttribute("aria-checked"), "true");
    assert.equal(JSON.stringify(view().step), snapshot);
    assert.ok($("fabric-description").textContent.includes("stretch"));
    assert.equal($("lift-btn").hidden, false);
    assert.equal($("grid-btn").hidden, false);
    click("lift-btn");
    assert.equal($("lift-btn").getAttribute("aria-pressed"), "true");
    assert.equal(JSON.stringify(view().step), snapshot);
    for (const layer of [
      "nodes",
      "labels",
      "fills",
      "rule",
      "same",
      "contradictions",
      "grid",
    ]) {
      const button = w.document.querySelector(`[data-layer="${layer}"]`);
      button.click();
      assert.equal(button.getAttribute("aria-pressed"), "false");
      assert.equal(JSON.stringify(view().step), snapshot);
      button.click();
      assert.equal(button.getAttribute("aria-pressed"), "true");
    }
    click("theme-btn");
    assert.equal(w.document.documentElement.dataset.theme, "dark");
    assert.equal(w.localStorage.getItem("pnp-theme"), "dark");
    assert.equal($("fabric-btn").getAttribute("aria-checked"), "true");
    assert.equal(JSON.stringify(view().step), snapshot);
    click("sort-btn");
    assert.equal(JSON.stringify(view().step), snapshot);
    assert.equal(view().order, 1);
    click("next-btn");
    click("prev-btn");
    assert.equal(JSON.stringify(view().step), snapshot);
    for (let steps = 0; !view().step.done && steps < 300; steps++)
      click("next-btn");
    assert.equal(view().step.type, "solved");
    assert.equal($("next-btn").disabled, true);
    assert.equal($("prev-btn").disabled, false);
    assert.equal($("walk-panel").hidden, false);
    const solved = [...view().values];
    click("prev-btn");
    assert.equal(view().step.done, undefined);
    click("next-btn");
    assert.equal(view().step.type, "solved");
    click("stop-btn");
    assert.deepEqual(view().values, solved);
    click("check-btn");
    for (let step = 0; !view().step.done && step < 30; step++) {
      assert.deepEqual(view().values, solved);
      click("next-btn");
    }
    assert.equal(view().step.type, "valid");
    assert.equal($("prev-btn").disabled, false);
    click("stop-btn");
    assert.deepEqual(view().values, solved);
    click("formula-btn");
    assert.equal($("formula-dialog").open, true);
    click("unsat-example");
    click("load-formula");
    assert.equal(view().problem.n, 3);
    assert.equal(view().problem.rules.length, 8);
    click("solve-btn");
    const types = [];
    for (let step = 0; !view().step.done && step < 200; step++) {
      types.push(view().step.type);
      click("next-btn");
    }
    assert.equal(view().step.type, "unsat");
    assert.ok(types.includes("backtrack"));
    click("stop-btn");
    click("formula-btn");
    $("formula-input").value = "p cnf 3 1\n1 1 2 0";
    click("load-formula");
    assert.ok($("formula-error").textContent.includes("different"));
    assert.equal(view().problem.rules.length, 8);
    $("formula-dialog").close();
    // The minimum remains usable independently; rule counts are clamped only to unique capacity.
    $("switch-count").value = "3";
    $("rule-count").value = "1";
    $("size-form").dispatchEvent(
      new w.Event("submit", { cancelable: true, bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(view().problem.rules.length, 1);
    assert.equal(view().problem.n, 3);
    click("share-btn");
    await Promise.resolve();
    assert.ok(clipboard.at(-1).startsWith("https://pnp.example.test/#p="));
    const payload = JSON.parse(atob(clipboard.at(-1).split("#p=")[1]));
    assert.deepEqual(payload.values, view().values);
    assert.equal(payload.rules.length, 1);
    assert.equal($("network-summary").textContent, "3 conditions · 1 rule");
    assert.equal($("fabric-btn").getAttribute("aria-checked"), "true");
    click("fabric-btn");
    assert.equal($("fabric-btn").getAttribute("aria-checked"), "false");
    assert.equal($("lift-btn").hidden, true);
    click("physics-btn");
    assert.equal($("physics-btn").getAttribute("aria-pressed"), "false");
    click("physics-btn");
    assert.equal($("physics-btn").getAttribute("aria-pressed"), "true");
    // A persisted browser snapshot is the problem, never the generator's secret.
    await new Promise((r) => setTimeout(r, 130));
    const persisted = JSON.parse(w.localStorage.getItem("pnp-playground:v1"));
    assert.deepEqual(persisted.values, view().values);
    assert.equal("hidden" in persisted, false);
  } finally {
    dom.window.close();
    for (const [k, desc] of previous) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
});
