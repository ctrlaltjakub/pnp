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
    // Fabric changes the physics/layout without changing the graph or assignment.
    const spacePositions = net.nodes.map(({ x, y, z }) => ({ x, y, z }));
    const spaceCamera = structuredClone({
      rotation: net.rotation,
      pan: net.pan,
      zoom: net.zoom,
    });
    const originalNodes = [...net.nodes],
      originalEdges = [...net.edges];
    const assignment = [...net.values];
    net.setFabric(true);
    assert.ok(net.nodes.every((p) => p.z === 0));
    assert.deepEqual(net.values, assignment);
    assert.deepEqual(net.nodes, originalNodes);
    assert.deepEqual(net.edges, originalEdges);
    // Pull a condition up from the sheet, holding it in place like a pointer drag.
    const pulled = net.nodes[0],
      stitchedNeighbor = net.edges.find((e) => e.kind === "same").b;
    pulled.z = 60;
    pulled.x += 50;
    net.drag = { node: pulled };
    for (let i = 0; i < 80; i++) net.tick();
    assert.equal(pulled.z, 60);
    assert.ok(
      stitchedNeighbor.z > 1,
      "a pull propagates through identical-condition stitches",
    );
    assert.ok(
      net.nodes.filter((p) => p.rule === "R3").every((p) => p.z === 0),
      "disconnected fabric stays independent",
    );
    net.drag = null;
    for (let i = 0; i < 600; i++) net.tick();
    assert.ok(
      net.nodes.every((p) => Math.abs(p.z) < 0.2),
      "the sheet settles back to its plane",
    );
    assert.ok(
      Math.abs(pulled.x - pulled.fabricHome.x) < 15,
      "tension relaxes the stretched patch",
    );
    net.setFabric(false);
    assert.deepEqual(
      net.nodes.map(({ x, y, z }) => ({ x, y, z })),
      spacePositions,
    );
    assert.deepEqual(
      { rotation: net.rotation, pan: net.pan, zoom: net.zoom },
      spaceCamera,
    );
    net.running = false;
    net.setFabric(true);
    assert.equal(net.running, false, "layout changes respect paused physics");
    const pausedPositions = net.nodes.map(({ x, y, z }) => ({ x, y, z }));
    net.frame(16);
    net.frame(32);
    assert.deepEqual(
      net.nodes.map(({ x, y, z }) => ({ x, y, z })),
      pausedPositions,
    );
    const large = generate(80, 500);
    net.setProblem(large.n, large.rules);
    assert.equal(net.fabric, true, "new problems retain the selected layout");
    assert.ok(net.nodes.every((p) => p.z === 0));
    net.resize();
    for (let i = 0; i < 3; i++) net.tick();
    net.draw();
    assert.equal(net.nodes.length, 1500);
    assert.ok(net.nodes.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
    net.setFabric(false);
    assert.ok(
      net.nodes.some((p) => p.z !== 0),
      "new problems restore their own 3D layout",
    );
    // Opposites are all cross-polarity pairs of the same switch, including
    // multiple occurrences, while same-polarity and other switches stay out.
    const mixed = [
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
          { v: 0, on: false },
          { v: 1, on: true },
          { v: 3, on: true },
        ],
      },
      {
        id: "R3",
        lits: [
          { v: 0, on: true },
          { v: 2, on: true },
          { v: 4, on: false },
        ],
      },
    ];
    net.setProblem(5, mixed);
    const pairs = net.contradictionGroups
      .flatMap((g) =>
        g.on.flatMap((a) =>
          g.off.map((b) => `${a.rule}:${a.l.v}-${b.rule}:${b.l.v}`),
        ),
      )
      .sort();
    assert.deepEqual(pairs, ["R1:0-R2:0", "R3:0-R2:0", "R3:2-R1:2"]);
    assert.equal(net.contradictionCount, 3);
    assert.equal(
      net.edges.filter((e) => e.kind === "contradiction").length,
      0,
      "red links do not add springs",
    );
    net.setLayer("nodes", true);
    net.draw();
    const pose = net.nodes.map(({ x, y, z }) => ({ x, y, z }));
    const red = [];
    let arcs = 0,
      texts = 0;
    context.stroke = () => {
      if (context.strokeStyle === net.palette.contradiction) red.push(true);
    };
    context.arc = () => arcs++;
    context.fillText = () => texts++;
    net.draw();
    assert.ok(red.length > 0, "contradiction strokes are drawn");
    net.setLayer("contradictions", false);
    red.length = 0;
    net.draw();
    assert.equal(red.length, 0, "hidden contradiction strokes disappear");
    for (const layer of Object.keys(net.layers)) net.setLayer(layer, false);
    arcs = texts = 0;
    net.draw();
    assert.equal(arcs, 0);
    assert.equal(texts, 0);
    assert.equal(
      net.hit(net.nodes[0].screen),
      null,
      "hidden nodes cannot be clicked",
    );
    assert.deepEqual(
      net.nodes.map(({ x, y, z }) => ({ x, y, z })),
      pose,
      "visibility does not move the net",
    );
    net.setLayer("labels", true);
    texts = 0;
    arcs = 0;
    net.draw();
    assert.ok(texts > 0);
    assert.equal(arcs, 0, "labels can be displayed independently");
    for (const layer of Object.keys(net.layers)) net.setLayer(layer, true);
    net.running = true;
    net.setFabric(true);
    const values = [true, false, true, false, false];
    net.update({ values });
    net.setLiftMatches(true);
    for (let i = 0; i < 700; i++) net.tick();
    for (const p of net.nodes)
      assert.ok(
        Math.abs(p.z - (values[p.l.v] === p.l.on ? 80 : 0)) < 1,
        "fulfilled conditions rise while others remain level",
      );
    net.running = false;
    values[0] = false;
    net.update({ values });
    for (const p of net.nodes)
      assert.equal(
        p.z,
        values[p.l.v] === p.l.on ? 80 : 0,
        "paused heights follow in-place assignment changes",
      );
    net.update({ values: Array(5).fill(null) });
    assert.ok(
      net.nodes.every((p) => p.z === 0),
      "undecided conditions are not lifted",
    );
    net.setLiftMatches(false);
    net.nodes[0].z = 20;
    net.update({ values: Array(5).fill(null), rule: "R1" });
    assert.equal(
      net.nodes[0].z,
      20,
      "ordinary highlighting preserves paused fabric deformation",
    );
    net.setLayer("contradictions", false);
    net.setProblem(3, [
      {
        id: "R1",
        lits: [
          { v: 0, on: true },
          { v: 1, on: true },
          { v: 2, on: true },
        ],
      },
    ]);
    assert.equal(
      net.layers.contradictions,
      false,
      "new puzzles preserve visibility",
    );
    assert.equal(
      net.contradictionCount,
      0,
      "new puzzles discard old contradiction groups",
    );
  } finally {
    for (const [k, desc] of old) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
});
