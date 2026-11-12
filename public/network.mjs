import { nameOf, conditionKey } from "./engine.mjs";
export const ruleColor = (i) =>
  `hsl(${[18, 88, 198, 278, 43, 161, 326, 224, 115, 5][i % 10] + Math.floor(i / 10) * 137.508} 36% 58%)`;

// A small 3D spring system. Graph construction is independent of table order.
export class ConditionNetwork {
  constructor(canvas, { select, inspect }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.select = select;
    this.inspect = inspect;
    this.nodes = [];
    this.edges = [];
    this.triangles = [];
    this.values = [];
    this.activeRule = null;
    this.activeLiteral = null;
    this.rotation = { x: -0.16, y: 0.2 };
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.baseScale = 1;
    this.running = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.fabric = false;
    this.pointers = new Map();
    this.drag = null;
    this.width = 0;
    this.height = 0;
    this.energy = 1;
    this.visible = true;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.intersectionObserver = new IntersectionObserver((es) => {
      this.visible = es[0].isIntersecting;
    });
    this.intersectionObserver.observe(canvas);
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", (e) => this.up(e, true));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.changeZoom(Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
    canvas.addEventListener("keydown", (e) => {
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "=",
          "-",
          "Home",
        ].includes(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Home") this.fit();
        else if (["+", "=", "-"].includes(e.key))
          this.changeZoom(e.key === "-" ? 0.85 : 1.18);
        else if (e.key === "ArrowLeft") this.rotation.y -= 0.13;
        else if (e.key === "ArrowRight") this.rotation.y += 0.13;
        else this.rotation.x += e.key === "ArrowUp" ? -0.13 : 0.13;
      }
    });
    this.lastTime = 0;
    this.frame = (time) => {
      if (this.visible && !document.hidden) {
        if (this.running)
          this.tick(Math.min(1.5, (time - (this.lastTime || time)) / 16.67));
        this.draw();
      }
      this.lastTime = time;
      this.raf = requestAnimationFrame(this.frame);
    };
    this.raf = requestAnimationFrame(this.frame);
  }
  setProblem(n, rules) {
    const restoreFabric = this.fabric;
    this.fabric = false;
    this.rules = rules;
    this.nodes = [];
    this.edges = [];
    this.triangles = [];
    this.ruleNodes = new Map();
    const same = new Map();
    // Union rule components through identical literals, not through complements.
    const parents = rules.map((_, i) => i);
    const root = (i) => {
      let r = i;
      while (parents[r] !== r) r = parents[r];
      while (parents[i] !== i) {
        const j = parents[i];
        parents[i] = r;
        i = j;
      }
      return r;
    };
    const first = new Map();
    rules.forEach((r, i) =>
      r.lits.forEach((l) => {
        const k = conditionKey(l);
        if (first.has(k)) parents[root(i)] = root(first.get(k));
        else first.set(k, i);
      }),
    );
    const groups = new Map();
    rules.forEach((r, i) => {
      const k = root(i);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });
    let gi = 0;
    this.components = groups.size;
    for (const members of groups.values()) {
      const groupRadius = Math.max(70, Math.sqrt(members.length) * 32),
        angle = (gi / groups.size) * Math.PI * 2;
      const center =
        groups.size === 1
          ? { x: 0, y: 0, z: 0 }
          : {
              x: Math.cos(angle) * (100 + groups.size * 28),
              y: Math.sin(angle) * (100 + groups.size * 28),
              z: Math.sin(gi * 2) * 40,
            };
      gi++;
      members.forEach((ruleIndex, j) => {
        const r = rules[ruleIndex],
          a = (j / members.length) * Math.PI * 2;
        const cx = center.x + Math.cos(a) * groupRadius * 0.77,
          cy = center.y + Math.sin(a) * groupRadius * 0.65,
          cz = center.z + Math.sin(j * 2.4) * groupRadius * 0.3;
        const tri = [];
        r.lits.forEach((l, k) => {
          const b = (k / 3) * Math.PI * 2 + a / 2;
          const node = {
            index: this.nodes.length,
            rule: r.id,
            ruleIndex,
            l,
            key: conditionKey(l),
            x: cx + Math.cos(b) * 32,
            y: cy + Math.sin(b) * 32,
            z: cz + Math.cos(b + j) * 20,
            vx: 0,
            vy: 0,
            vz: 0,
            anchor: center,
            color: ruleColor(ruleIndex),
          };
          this.nodes.push(node);
          tri.push(node);
          if (!same.has(node.key)) same.set(node.key, []);
          same.get(node.key).push(node);
        });
        this.ruleNodes.set(ruleIndex, tri);
        this.triangles.push({
          nodes: tri,
          color: ruleColor(ruleIndex),
          rule: r.id,
        });
        for (let k = 0; k < 3; k++)
          this.edges.push({
            a: tri[k],
            b: tri[(k + 1) % 3],
            length: 68,
            strength: 0.012,
            kind: "rule",
            color: ruleColor(ruleIndex),
          });
      });
    }
    for (const list of same.values())
      for (let i = 1; i < list.length; i++)
        this.edges.push({
          a: list[i - 1],
          b: list[i],
          length: 105,
          strength: 0.0035,
          kind: "same",
        });
    this.prepareFabric([...groups.values()]);
    this.energy = 1;
    this.rotation = { x: -0.16, y: 0.2 };
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.fit();
    if (restoreFabric) this.setFabric(true);
  }
  prepareFabric(groups) {
    // Each disconnected net gets its own sheet. Patch anchors keep the net
    // spread without inventing connections between unrelated conditions.
    let offset = 0;
    for (const members of groups) {
      const columns = Math.ceil(Math.sqrt(members.length));
      const rows = Math.ceil(members.length / columns);
      members.forEach((ruleIndex, i) => {
        const col = i % columns,
          row = Math.floor(i / columns);
        const cx = offset + col * 150;
        const cy = (row - (rows - 1) / 2) * 130;
        // Triangles are built in component order, so look up by rule index.
        const nodes = this.ruleNodes.get(ruleIndex);
        nodes.forEach((p, k) => {
          const angle = -Math.PI / 2 + (k * Math.PI * 2) / 3;
          p.fabricHome = {
            x: cx + Math.cos(angle) * 43,
            y: cy + Math.sin(angle) * 43,
            z: 0,
          };
        });
      });
      offset += columns * 150 + 80;
    }
    let left = Infinity,
      right = -Infinity;
    for (const p of this.nodes) {
      left = Math.min(left, p.fabricHome.x);
      right = Math.max(right, p.fabricHome.x);
    }
    for (const p of this.nodes) p.fabricHome.x -= (left + right) / 2;
    for (const e of this.edges)
      e.fabricLength = Math.hypot(
        e.a.fabricHome.x - e.b.fabricHome.x,
        e.a.fabricHome.y - e.b.fabricHome.y,
      );
  }
  setFabric(enabled) {
    if (this.fabric === enabled) return;
    this.fabric = enabled;
    this.drag = null;
    if (enabled) {
      this.spaceCamera = {
        rotation: { ...this.rotation },
        pan: { ...this.pan },
        zoom: this.zoom,
        baseScale: this.baseScale,
      };
      for (const p of this.nodes) {
        p.spacePose = { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz };
        Object.assign(p, p.fabricHome, { vx: 0, vy: 0, vz: 0 });
      }
      this.fit();
    } else {
      for (const p of this.nodes) Object.assign(p, p.spacePose);
      if (this.spaceCamera) Object.assign(this, this.spaceCamera);
    }
    this.energy = 1;
    this.draw();
  }
  update({ values, rule = null, literal = null, variable = null }) {
    this.values = values;
    this.activeRule = rule;
    this.activeLiteral = literal;
    this.activeVariable = variable;
  }
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.computeScale();
  }
  computeScale() {
    let radius = 80;
    for (const p of this.nodes)
      radius = Math.max(radius, Math.hypot(p.x, p.y, p.z));
    this.baseScale = Math.max(
      0.005,
      Math.min(this.width * 0.4, this.height * 0.36) / radius,
    );
  }
  fit() {
    this.rotation = this.fabric ? { x: -0.12, y: 0 } : { x: -0.16, y: 0.2 };
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.computeScale();
  }
  changeZoom(factor) {
    this.zoom = Math.max(0.08, Math.min(15, this.zoom * factor));
  }
  tick(dt = 1) {
    if (!this.nodes.length || !dt) return;
    // Local repulsion uses spatial bins; long-range attraction is a weak component anchor.
    const grid = new Map(),
      cell = 75;
    for (const p of this.nodes) {
      const k = [
        Math.floor(p.x / cell),
        Math.floor(p.y / cell),
        Math.floor(p.z / cell),
      ].join(",");
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(p);
    }
    for (const p of this.nodes) {
      if (this.drag?.node === p) continue;
      const anchor = this.fabric ? p.fabricHome : p.anchor;
      const tension = this.fabric ? 0.0018 : 0.0006;
      let fx = (anchor.x - p.x) * tension,
        fy = (anchor.y - p.y) * tension,
        fz = this.fabric ? -p.z * 0.018 : (anchor.z - p.z) * 0.0006;
      const x = Math.floor(p.x / cell),
        y = Math.floor(p.y / cell),
        z = Math.floor(p.z / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const bin = grid.get(`${x + dx},${y + dy},${z + dz}`);
            if (!bin) continue;
            for (const q of bin) {
              if (q === p) continue;
              const ax = p.x - q.x,
                ay = p.y - q.y,
                az = p.z - q.z;
              const d2 = Math.max(60, ax * ax + ay * ay + az * az);
              if (d2 > 11000) continue;
              const f = (this.fabric ? 100 : 30) / (d2 * Math.sqrt(d2));
              fx += ax * f;
              fy += ay * f;
              fz += az * f;
            }
          }
      p.vx += fx * dt;
      p.vy += fy * dt;
      p.vz += fz * dt;
    }
    for (const e of this.edges) {
      let x = e.b.x - e.a.x,
        y = e.b.y - e.a.y,
        z = e.b.z - e.a.z;
      const d = Math.max(1, Math.hypot(x, y, z));
      const length = this.fabric ? e.fabricLength : e.length;
      const strength = this.fabric
        ? e.kind === "rule"
          ? 0.03
          : 0.018
        : e.strength;
      const f = (((d - length) * strength) / d) * dt;
      x *= f;
      y *= f;
      // Neighbor coupling spreads out-of-plane pulls through the sheet.
      z *= f + (this.fabric ? 0.012 * dt : 0);
      if (this.drag?.node !== e.a) {
        e.a.vx += x;
        e.a.vy += y;
        e.a.vz += z;
      }
      if (this.drag?.node !== e.b) {
        e.b.vx -= x;
        e.b.vy -= y;
        e.b.vz -= z;
      }
    }
    const friction = Math.pow(this.fabric ? 0.89 : 0.82, dt);
    for (const p of this.nodes) {
      if (this.drag?.node === p) {
        p.vx = p.vy = p.vz = 0;
        continue;
      }
      p.vx *= friction;
      p.vy *= friction;
      p.vz *= friction;
      p.x += Math.max(-5, Math.min(5, p.vx)) * dt;
      p.y += Math.max(-5, Math.min(5, p.vy)) * dt;
      p.z += Math.max(-5, Math.min(5, p.vz)) * dt;
    }
    // Ease initial framing as the spring system settles; user zoom and panning stay intact.
    if (this.energy > 0.01 && !this.drag) {
      let r = 80;
      for (const p of this.nodes) r = Math.max(r, Math.hypot(p.x, p.y, p.z));
      const target = Math.min(this.width * 0.4, this.height * 0.36) / r;
      this.baseScale += (target - this.baseScale) * 0.015;
      this.energy *= 0.995;
    }
  }
  project(p) {
    const sy = Math.sin(this.rotation.y),
      cy = Math.cos(this.rotation.y),
      sx = Math.sin(this.rotation.x),
      cx = Math.cos(this.rotation.x);
    const x = p.x * cy + p.z * sy,
      z = -p.x * sy + p.z * cy,
      y = p.y * cx - z * sx,
      z2 = p.y * sx + z * cx;
    const depth = 1 / (1 + Math.max(-0.55, Math.min(0.8, z2 * 0.00065)));
    const scale = this.baseScale * this.zoom * depth;
    return {
      x: this.width / 2 + this.pan.x + x * scale,
      y: this.height / 2 + this.pan.y + y * scale,
      z: z2,
      scale,
    };
  }
  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.width) return;
    ctx.clearRect(0, 0, this.width, this.height);
    for (const p of this.nodes) p.screen = this.project(p);
    const fadeFor = (p) =>
      this.activeLiteral && p.key !== this.activeLiteral ? 0.2 : 1;
    for (const t of this.triangles) {
      const active = this.activeRule === t.rule;
      ctx.beginPath();
      t.nodes.forEach((p, i) =>
        i
          ? ctx.lineTo(p.screen.x, p.screen.y)
          : ctx.moveTo(p.screen.x, p.screen.y),
      );
      ctx.closePath();
      ctx.fillStyle = t.color;
      ctx.globalAlpha = active ? 0.15 : 0.035;
      ctx.fill();
    }
    for (const e of this.edges) {
      const a = e.a.screen,
        b = e.b.screen;
      const active = this.activeRule === e.a.rule && e.kind === "rule";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.kind === "same" ? "#7f8870" : e.color;
      ctx.lineWidth = active ? 2.3 : e.kind === "same" ? 1.5 : 1.4;
      ctx.setLineDash(e.kind === "same" ? [3, 5] : []);
      ctx.globalAlpha =
        (e.kind === "same" ? 0.85 : 0.65) *
        Math.max(fadeFor(e.a), fadeFor(e.b));
      if (active) ctx.globalAlpha = 1;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (this.nodes.length < 300)
      for (const t of this.triangles) {
        const x = t.nodes.reduce((s, p) => s + p.screen.x, 0) / 3,
          y = t.nodes.reduce((s, p) => s + p.screen.y, 0) / 3;
        ctx.globalAlpha = this.activeRule === t.rule ? 0.85 : 0.45;
        ctx.fillStyle = t.color;
        ctx.font = '9px "IBM Plex Mono",monospace';
        ctx.textAlign = "center";
        ctx.fillText(t.rule, x, y);
      }
    for (const p of [...this.nodes].sort((a, b) => b.screen.z - a.screen.z)) {
      const s = p.screen;
      if (
        s.x < -30 ||
        s.x > this.width + 30 ||
        s.y < -30 ||
        s.y > this.height + 30
      )
        continue;
      const radius = Math.min(
        23,
        Math.max(this.nodes.length > 800 ? 3 : 9, 16 * Math.sqrt(s.scale)),
      );
      p.radius = radius;
      const selected = this.activeLiteral === p.key,
        active = this.activeRule === p.rule,
        unknown = this.values[p.l.v] == null,
        match = this.values[p.l.v] === p.l.on;
      ctx.globalAlpha = fadeFor(p);
      if (active || selected || this.activeVariable === p.l.v) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = selected ? "#a58c4f" : p.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.shadowColor = "#55604410";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = unknown ? "#eeeee5" : p.l.on ? "#edf3df" : "#f8e4da";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      if (radius >= 8) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = p.l.on ? "#526f43" : "#a46954";
        ctx.font = `500 ${Math.max(8, Math.min(11, radius * 0.7))}px "IBM Plex Mono",monospace`;
        ctx.fillText(`${nameOf(p.l.v)}${p.l.on ? "+" : "−"}`, s.x, s.y - 0.6);
        const bx = s.x + radius * 0.72,
          by = s.y + radius * 0.72;
        ctx.beginPath();
        ctx.arc(bx, by, 4.7, 0, Math.PI * 2);
        ctx.fillStyle = unknown ? "#b3b6a4" : match ? "#91a77c" : "#d1a08e";
        ctx.fill();
        ctx.fillStyle = "#fffef8";
        ctx.font = "bold 7px sans-serif";
        ctx.fillText(unknown ? "?" : match ? "✓" : "×", bx, by + 0.3);
      }
    }
    ctx.globalAlpha = 1;
  }
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  hit(point) {
    let best = null,
      dist = Infinity;
    for (const p of this.nodes) {
      if (!p.screen) continue;
      const d = Math.hypot(p.screen.x - point.x, p.screen.y - point.y);
      if (d < Math.max(22, p.radius + 5) && d < dist) {
        best = p;
        dist = d;
      }
    }
    return best;
  }
  down(e) {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const pt = this.local(e);
    this.pointers.set(e.pointerId, pt);
    if (this.pointers.size === 2) {
      this.drag = null;
      this.pinch = this.pinchState();
      return;
    }
    if (this.pointers.size > 2) return;
    const node = this.hit(pt);
    this.drag = {
      id: e.pointerId,
      node,
      start: pt,
      last: pt,
      moved: false,
      pan: e.shiftKey,
    };
    if (node) this.inspect(node);
  }
  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }
  move(e) {
    const pt = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      const node = this.hit(pt);
      this.canvas.style.cursor = node ? "pointer" : "grab";
      this.inspect(node);
      return;
    }
    this.pointers.set(e.pointerId, pt);
    if (this.pointers.size === 2) {
      const p = this.pinchState();
      if (this.pinch) {
        this.changeZoom(p.distance / this.pinch.distance);
        this.pan.x += p.x - this.pinch.x;
        this.pan.y += p.y - this.pinch.y;
      }
      this.pinch = p;
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = pt.x - d.last.x,
      dy = pt.y - d.last.y;
    if (Math.hypot(pt.x - d.start.x, pt.y - d.start.y) > 5) d.moved = true;
    if (d.node) {
      const scale = Math.max(0.001, d.node.screen.scale),
        x = dx / scale,
        y = dy / scale;
      const sy = Math.sin(this.rotation.y),
        cy = Math.cos(this.rotation.y),
        sx = Math.sin(this.rotation.x),
        cx = Math.cos(this.rotation.x);
      d.node.x += x * cy + y * sx * sy;
      d.node.y += y * cx;
      d.node.z += x * sy - y * sx * cy;
    } else if (d.pan) {
      this.pan.x += dx;
      this.pan.y += dy;
    } else {
      this.rotation.y += dx * 0.008;
      this.rotation.x += dy * 0.008;
    }
    d.last = pt;
  }
  up(e, cancel = false) {
    const d = this.drag;
    if (!cancel && d?.id === e.pointerId && d.node && !d.moved)
      this.select(d.node.l);
    this.pointers.delete(e.pointerId);
    this.drag = null;
    this.pinch = null;
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
  }
}
