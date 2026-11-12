import test from "node:test";
import assert from "node:assert/strict";
import { ConditionNetwork } from "../public/network.mjs";
import { generate } from "../public/engine.mjs";

test("network models both connection dimensions, separates components, and supports drag / orbit / zoom / pinch", () => {
  const old = new Map();
  class Observer {
    observe() {}
    disconnect() {}
  }
  const context = new Proxy({}, { get: (o, k) => o[k] || (() => {}) });
  const globals = {
    matchMedia: () => ({ matches: false }),
    ResizeObserver: Observer,
    IntersectionObserver: Observer,
    requestAnimationFrame: () => 1,
    document: { hidden: false },
    devicePixelRatio: 1,
  };
  for (const [k, v] of Object.entries(globals)) {
    old.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, {
      value: v,
      writable: true,
      configurable: true,
    });
  }
  try {
    const canvas = {
      parentElement: {
        getBoundingClientRect: () => ({ width: 560, height: 560 }),
      },
      getContext: () => context,
      addEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      setPointerCapture() {},
      hasPointerCapture: () => false,
      style: {},
    };
    let selected = null;
    const net = new ConditionNetwork(canvas, {
      select: (l) => (selected = l),
      inspect() {},
    });
    const rules = [
      {
        id: "R1",
        lits: [
          { v: 0, on: true },
          { v: 1, on: true },
          { v: 2, on: false },
        ],
      },
      {
        id: "R2",
        lits: [
          { v: 0, on: true },
          { v: 3, on: false },
          { v: 4, on: true },
        ],
      },
      {
        id: "R3",
        lits: [
          { v: 5, on: true },
          { v: 6, on: true },
          { v: 7, on: false },
        ],
      },
    ];
    net.setProblem(8, rules);
    net.resize();
    net.update({ values: Array(8).fill(false) });
    net.draw();
    assert.equal(net.nodes.length, 9);
    assert.equal(net.components, 2);
    assert.equal(net.edges.filter((e) => e.kind === "rule").length, 9);
    assert.equal(net.edges.filter((e) => e.kind === "same").length, 1);
    for (const e of net.edges.filter((e) => e.kind === "same"))
      assert.equal(e.a.key, e.b.key);
    const ev = (id, x, y) => ({
      pointerId: id,
      clientX: x,
      clientY: y,
      preventDefault() {},
      shiftKey: false,
    });
    const p = net.nodes[0],
      s = p.screen;
    net.down(ev(1, s.x, s.y));
    net.up(ev(1, s.x, s.y));
    assert.deepEqual(selected, p.l);
    const oldX = p.x;
    net.down(ev(1, s.x, s.y));
    net.move(ev(1, s.x + 40, s.y));
    net.up(ev(1, s.x + 40, s.y));
    assert.notEqual(p.x, oldX);
    const ry = net.rotation.y;
    net.down(ev(2, 1, 1));
    net.move(ev(2, 40, 20));
    net.up(ev(2, 40, 20));
    assert.notEqual(net.rotation.y, ry);
    const zoom = net.zoom;
    net.down(ev(3, 10, 10));
    net.down(ev(4, 110, 10));
    net.move(ev(4, 210, 10));
    assert.ok(net.zoom > zoom);
    net.up(ev(3, 10, 10));
    net.up(ev(4, 210, 10));
    net.changeZoom(1e10);
    assert.equal(net.zoom, 15);
    net.changeZoom(1e-20);
    assert.equal(net.zoom, 0.08);
    net.fit();
    assert.equal(net.zoom, 1);
    for (let i = 0; i < 150; i++) net.tick();
    assert.ok(net.nodes.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
    net.draw();
    const large = generate(80, 500);
    net.setProblem(large.n, large.rules);
    net.resize();
    for (let i = 0; i < 3; i++) net.tick();
    net.draw();
    assert.equal(net.nodes.length, 1500);
    assert.ok(net.nodes.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
  } finally {
    for (const [k, desc] of old) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
});
