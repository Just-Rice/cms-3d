// Builds the school: walls with door and window openings, floors, ceilings, switchback stairs,
// the brick exterior skin with real window openings and parapets, roofs, the natatorium,
// entrances and room signs.
import * as THREE from 'three';
import {
  BLOCKS, ROOMS, ENTRANCES, COURTYARDS, THEATRE, LEVEL_H, LEVEL1_RECTS, SLAB, CEIL2, DOOR_H,
  rectW, wx, wz, ZONES,
} from './layout.js';
import { Batches, subtractRects, hexToRGB, inRect, WHITE } from './geo.js';
import { LabelAtlas, rng, textTexture } from './textures.js';
import { packLightmaps } from './lightmap.js';

const WT = 0.2; // interior wall thickness
const SK = 0.32; // exterior brick skin thickness
const PARAPET = 0.3; // low parapet at the roof edge (under the mansard or the metal fascia)
const L1_TOP = CEIL2[1] + 0.05;
const EPS = 0.06;
// Window sill/head per level: punched classroom windows, about 0.9 m to 2.2 m
const WIN = [[0.9, 2.2], [LEVEL_H + 0.9, LEVEL_H + 2.2]];
const PANE = 1.0;
const ENTRY_H = 3.0;

const CARPETS = ['#6f84ad', '#9a6b4a', '#5d8f7c', '#8b6aa0', '#8f8a4a', '#a85f55', '#4f7d99', '#b08a3e'];

export function floorStyle(room, idx) {
  switch (room.type) {
    case 'class': return ['carpet', CARPETS[idx % CARPETS.length]];
    case 'lab': return ['floorTile', '#d3d7d9'];
    case 'office': return ['carpet', '#7f7568'];
    case 'media': return ['carpet', '#44708f'];
    case 'lecture': return ['carpet', '#8a4040'];
    case 'music': return ['carpet', '#56659a'];
    case 'art': return ['concrete', '#c9c3b6'];
    case 'theatre': return ['carpet', '#6e2530'];
    case 'dining': return ['floorTile', '#efe2c4'];
    case 'kitchen': return ['ceramic', '#c77b62'];
    case 'lav': return ['ceramic', '#dfe7ea'];
    case 'locker': return ['ceramic', '#cfd6d2'];
    case 'pool': return ['ceramic', '#e7eef0'];
    case 'gym': return ['wood', '#ffffff'];
    case 'weights': return ['carpet', '#353535'];
    case 'stair': return ['concrete', '#b8b8b8'];
    default: return ['concrete', '#bdbab2'];
  }
}

export function buildBuilding(scene, world, T, M) {
  const B = new Batches();
  const atlas = new LabelAtlas();
  const R = rng(99);

  // ------------------------------------------------------------------ data prep
  const blocks = BLOCKS.map((b) => ({ ...b, R: b.rects.map(rectW) }));
  const blockRects = [];
  blocks.forEach((b) => b.R.forEach((r) => blockRects.push({ r, b })));
  const blockAt = (x, z) => {
    for (const br of blockRects) if (inRect(br.r, x, z)) return br.b;
    return null;
  };
  const wallTop0 = (x, z) => {
    const b = blockAt(x, z);
    if (!b) return 0;
    if (b.levels === 2) return LEVEL_H;
    return b.roof - 0.3; // interior walls run up to the underside of the roof deck
  };
  const ceil0 = (b) => (b.levels === 2 ? CEIL2[0] : b.ceil);

  const rooms = [];
  ROOMS.forEach((list, level) =>
    list.forEach((rm) => {
      const Rw = rectW(rm.r);
      const room = {
        ...rm, level, R: Rw, idx: rooms.length,
        name: rm.name || (rm.type === 'stair' ? 'Stairwell' : rm.label ? 'Room ' + rm.label : 'Room'),
        cx: (Rw[0] + Rw[2]) / 2, cz: (Rw[1] + Rw[3]) / 2,
        doorList: [],
      };
      for (const spec of rm.doors) {
        const [side, f, w] = spec.split(':');
        const frac = f !== undefined ? parseFloat(f) : 0.5;
        const width = w !== undefined ? parseFloat(w) : rm.big ? 2.0 : 1.2;
        const horiz = side === 'N' || side === 'S';
        const a = horiz ? Rw[0] : Rw[1], b = horiz ? Rw[2] : Rw[3];
        const c = side === 'N' ? Rw[1] : side === 'S' ? Rw[3] : side === 'W' ? Rw[0] : Rw[2];
        const out = side === 'N' || side === 'W' ? -1 : 1;
        const mid = a + frac * (b - a);
        room.doorList.push({ side, axis: horiz ? 'z' : 'x', c, a: mid - width / 2, b: mid + width / 2, mid, out, width });
      }
      rooms.push(room);
    }),
  );
  const stairs = rooms.filter((r) => r.type === 'stair' && r.level === 0);
  const stairRects = stairs.map((s) => s.R);
  // ceiling height seen from a point (Infinity where the space is open to the roof)
  const ceilAt = (level, x, z) => {
    const b = blockAt(x, z);
    if (!b || stairRects.some((sr) => inRect(sr, x, z, 0.05))) return Infinity;
    if (COURTYARDS.some((c) => inRect(rectW(c), x, z))) return Infinity;
    return level === 1 ? CEIL2[1] : ceil0(b);
  };

  const entrances = ENTRANCES.map((e) => {
    const horiz = e.dir === 'N' || e.dir === 'S';
    const c = horiz ? wz(e.at[1]) : wx(e.at[0]);
    const mid = horiz ? wx(e.at[0]) : wz(e.at[1]);
    const out = e.dir === 'N' || e.dir === 'W' ? -1 : 1;
    return { ...e, axis: horiz ? 'z' : 'x', c, a: mid - e.w / 2, b: mid + e.w / 2, mid, out };
  });

  // ------------------------------------------------------------------ helpers
  const lineKey = (axis, c) => axis + '|' + Math.round(c * 1000);
  const P = (axis, c, m) => (axis === 'z' ? [m, c] : [c, m]);
  // box spanning a line segment: axis 'z' => x in [p,q], z in [c+o0,c+o1]
  const segBox = (bb, axis, c, p, q, o0, o1, y0, y1, color, faces) => {
    if (axis === 'z') bb.box(p, y0, c + Math.min(o0, o1), q, y1, c + Math.max(o0, o1), color, faces);
    else bb.box(c + Math.min(o0, o1), y0, p, c + Math.max(o0, o1), y1, q, color, faces);
  };
  const segCollider = (axis, c, p, q, o0, o1, y0, y1, tag = 1) => {
    if (axis === 'z') world.add(p, y0, c + Math.min(o0, o1), q, y1, c + Math.max(o0, o1), tag);
    else world.add(c + Math.min(o0, o1), y0, p, c + Math.max(o0, o1), y1, q, tag);
  };
  // [lo,hi] minus a list of [a,b] openings
  const solidSpans = (lo, hi, holes) => {
    let spans = [[lo, hi]];
    for (const [a, b] of holes) {
      const next = [];
      for (const [s, e] of spans) {
        if (b <= s || a >= e) { next.push([s, e]); continue; }
        if (a > s) next.push([s, a]);
        if (b < e) next.push([b, e]);
      }
      spans = next;
    }
    return spans.filter(([s, e]) => e - s > 0.01);
  };

  const allXs = [...new Set(blockRects.flatMap((b) => [b.r[0], b.r[2]]))].sort((a, b) => a - b);
  const allZs = [...new Set(blockRects.flatMap((b) => [b.r[1], b.r[3]]))].sort((a, b) => a - b);
  function forEachEdgeInterval(rect, cb) {
    const sides = [
      ['z', rect[1], rect[0], rect[2], -1],
      ['z', rect[3], rect[0], rect[2], 1],
      ['x', rect[0], rect[1], rect[3], -1],
      ['x', rect[2], rect[1], rect[3], 1],
    ];
    for (const [axis, c, a, b, out] of sides) {
      const bps = [a, ...(axis === 'z' ? allXs : allZs).filter((v) => v > a + 1e-6 && v < b - 1e-6), b];
      for (let i = 0; i < bps.length - 1; i++) {
        const p = bps[i], q = bps[i + 1];
        if (q - p < 1e-4) continue;
        const m = (p + q) / 2;
        cb(axis, c, p, q, out, P(axis, c - out * EPS, m), P(axis, c + out * EPS, m));
      }
    }
  }
  const level1Rects = LEVEL1_RECTS.map(rectW);
  const onLevel = (lv, x, z) => (lv === 1 ? level1Rects.some((r) => inRect(r, x, z)) : !!blockAt(x, z));

  // ------------------------------------------------------------------ exterior runs + windows
  // A run is a stretch of block edge with constant heights inside/outside; skin covers hOut..hIn.
  const topOf = (b) => b.roof;
  const runs = [];
  for (const { r, b } of blockRects) {
    const local = [];
    forEachEdgeInterval(r, (axis, c, p, q, out, inPt, outPt) => {
      let hOut = 0;
      for (const br of blockRects) if (br.r !== r && inRect(br.r, outPt[0], outPt[1])) hOut = Math.max(hOut, br.b === b ? topOf(b) + PARAPET : topOf(br.b));
      const hIn = topOf(b) + PARAPET;
      if (hIn <= hOut + 0.01) return;
      const last = local[local.length - 1];
      if (last && last.axis === axis && Math.abs(last.c - c) < 1e-6 && last.hOut === hOut && Math.abs(last.q - p) < 1e-4) last.q = q;
      else local.push({ axis, c, p, q, out, hOut, hIn, b, openings: [] });
    });
    runs.push(...local);
  }
  // windows go in bays between the rooms that touch the facade, one or more per bay
  const windowsByLine = [new Map(), new Map()];
  const windows = [];
  for (const run of runs) {
    const { axis, c, p, q, out, hOut, hIn, b } = run;
    if (hOut === 0)
      for (const e of entrances)
        if (e.axis === axis && Math.abs(e.c - c) < 0.05 && e.b > p && e.a < q) run.openings.push({ a: e.a, b: e.b, y0: 0, y1: ENTRY_H, entrance: true });
    if (b.windows === false) continue;
    for (let lv = 0; lv < (b.levels === 2 ? 2 : 1); lv++) {
      const [y0, y1] = WIN[lv];
      if (hOut > y0 - 0.3 || hIn < y1 + 0.6) continue;
      const cuts = new Set([p, q]);
      for (const rm of rooms) {
        if (rm.level !== lv) continue;
        const [x0, z0, x1, z1] = rm.R;
        const onLine = axis === 'z' ? Math.abs(z0 - c) < 0.05 || Math.abs(z1 - c) < 0.05 : Math.abs(x0 - c) < 0.05 || Math.abs(x1 - c) < 0.05;
        if (!onLine) continue;
        const [a, bb] = axis === 'z' ? [x0, x1] : [z0, z1];
        if (bb <= p || a >= q) continue;
        cuts.add(Math.max(p, a));
        cuts.add(Math.min(q, bb));
      }
      const pts = [...cuts].sort((m, n) => m - n);
      for (let i = 0; i < pts.length - 1; i++) {
        const u0 = pts[i], u1 = pts[i + 1], len = u1 - u0;
        if (len < 2.8) continue;
        const inPt = P(axis, c - out * 0.6, (u0 + u1) / 2);
        if (!onLevel(lv, inPt[0], inPt[1])) continue;
        if (stairRects.some((sr) => inRect(sr, inPt[0], inPt[1]))) continue;
        // one ribbon of up to 9 panes per room (per ~11 m of a long wall), centered in the bay
        const k = Math.max(1, Math.round(len / 9));
        const sub = len / k;
        const n = Math.min(4, Math.floor((sub - 2.0) / PANE));
        if (n < 2) continue;
        for (let j = 0; j < k; j++) {
          const m = u0 + sub * (j + 0.5);
          const a = m - (n * PANE) / 2, bw = m + (n * PANE) / 2;
          if (run.openings.some((o) => o.entrance && bw > o.a - 0.6 && a < o.b + 0.6)) continue;
          const w = { axis, c, out, a, b: bw, y0, y1, lv, n };
          run.openings.push(w);
          windows.push(w);
          const key = lineKey(axis, c);
          if (!windowsByLine[lv].has(key)) windowsByLine[lv].set(key, []);
          windowsByLine[lv].get(key).push(w);
        }
      }
    }
  }

  // ------------------------------------------------------------------ interior walls
  const segs = [new Map(), new Map()];
  const group = (level, axis, c) => {
    const k = lineKey(axis, c);
    let g = segs[level].get(k);
    if (!g) segs[level].set(k, (g = { axis, c, items: [], doors: [], wins: windowsByLine[level].get(k) || [] }));
    return g;
  };
  for (const rm of rooms) {
    const [x0, z0, x1, z1] = rm.R;
    const sides = { N: ['z', z0, x0, x1], S: ['z', z1, x0, x1], W: ['x', x0, z0, z1], E: ['x', x1, z0, z1] };
    for (const s of 'NSWE') {
      if (rm.type === 'stair' && rm.open === s) continue;
      const [axis, c, a, b] = sides[s];
      group(rm.level, axis, c).items.push({ a, b });
    }
    for (const d of rm.doorList) group(rm.level, d.axis, d.c).doors.push({ a: d.a, b: d.b });
  }
  for (const { r } of blockRects)
    forEachEdgeInterval(r, (axis, c, p, q, out, inPt, outPt) => {
      if (!blockAt(...outPt)) group(0, axis, c).items.push({ a: p, b: q });
    });
  for (const r of level1Rects)
    forEachEdgeInterval(r, (axis, c, p, q, out, inPt, outPt) => {
      if (!level1Rects.some((rr) => inRect(rr, outPt[0], outPt[1]))) group(1, axis, c).items.push({ a: p, b: q });
    });
  for (const e of entrances) group(0, e.axis, e.c).doors.push({ a: e.a, b: e.b, entrance: true });

  const levelWallH = (level, axis, c, m) => {
    if (level === 1) return L1_TOP - LEVEL_H;
    const [x1, z1] = P(axis, c - 0.3, m);
    const [x2, z2] = P(axis, c + 0.3, m);
    return Math.max(wallTop0(x1, z1), wallTop0(x2, z2));
  };
  const wallColor = [hexToRGB('#ece4d3'), hexToRGB('#e2e9e6')];
  const baseCol = hexToRGB('#3b3733');
  const mapWalls = [[], []];
  const doorways = [];
  for (let level = 0; level < 2; level++) {
    const base = level === 0 ? 0 : LEVEL_H;
    for (const g of segs[level].values()) {
      const bps = new Set();
      g.items.forEach((it) => { bps.add(it.a); bps.add(it.b); });
      g.doors.forEach((d) => { bps.add(d.a); bps.add(d.b); });
      g.wins.forEach((w) => { bps.add(w.a); bps.add(w.b); });
      if (level === 0) {
        const lo = Math.min(...g.items.map((it) => it.a)), hi = Math.max(...g.items.map((it) => it.b));
        for (const v of g.axis === 'z' ? allXs : allZs) if (v > lo && v < hi) bps.add(v);
      }
      const pts = [...bps].sort((a, b) => a - b);
      const pieces = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        if (q - p < 0.005) continue;
        const m = (p + q) / 2;
        if (!g.items.some((it) => it.a <= m && it.b >= m)) continue;
        const h = levelWallH(level, g.axis, g.c, m);
        if (h <= 0.01) continue;
        const holes = [];
        let door = false;
        for (const d of g.doors) if (d.a <= m && d.b >= m) { holes.push([base, base + (d.entrance ? ENTRY_H : DOOR_H)]); door = true; }
        for (const w of g.wins) if (w.a <= m && w.b >= m) holes.push([w.y0, w.y1]);
        const sig = holes.map((hh) => hh.join(',')).join(';');
        const last = pieces[pieces.length - 1];
        if (last && last.sig === sig && Math.abs(last.h - h) < 1e-3 && Math.abs(last.q - p) < 1e-4) last.q = q;
        else pieces.push({ p, q, h, holes, sig, door });
      }
      for (let i = 0; i < pieces.length; i++) {
        const pc = pieces[i];
        const prev = i > 0 && Math.abs(pieces[i - 1].q - pc.p) < 1e-4 ? pieces[i - 1] : null;
        const next = i < pieces.length - 1 && Math.abs(pieces[i + 1].p - pc.q) < 1e-4 ? pieces[i + 1] : null;
        const solidFull = pc.holes.length === 0;
        // extend full walls half a thickness into corners, never into an opening
        const p = pc.p - (solidFull && (!prev || prev.holes.length === 0) ? WT / 2 : 0);
        const q = pc.q + (solidFull && (!next || next.holes.length === 0) ? WT / 2 : 0);
        // wall above the ceilings on both sides is never seen: keep it (for shadows) but
        // out of the lightmapped batch
        const [mx, mz] = P(g.axis, g.c, (pc.p + pc.q) / 2);
        const off = WT / 2 + 0.25;
        const split = Math.max(...(g.axis === 'z' ? [[mx, mz - off], [mx, mz + off]] : [[mx - off, mz], [mx + off, mz]]).map(([x, z]) => ceilAt(level, x, z))) + 0.02;
        for (const [s, e] of solidSpans(base, base + pc.h, pc.holes)) {
          if (s < split) segBox(B.get('wall'), g.axis, g.c, p, q, -WT / 2, WT / 2, s, Math.min(e, split), wallColor[level]);
          if (e > split) segBox(B.get('wallHidden'), g.axis, g.c, p, q, -WT / 2, WT / 2, Math.max(s, split), e, wallColor[level]);
          segCollider(g.axis, g.c, p, q, -WT / 2, WT / 2, s, e);
          if (Math.abs(s - base) < 1e-3) {
            // vinyl base on both faces
            segBox(B.get('satin'), g.axis, g.c, pc.p, pc.q, WT / 2, WT / 2 + 0.012, s, s + 0.1, baseCol, g.axis === 'z' ? 'ZY' : 'XY');
            segBox(B.get('satin'), g.axis, g.c, pc.p, pc.q, -WT / 2 - 0.012, -WT / 2, s, s + 0.1, baseCol, g.axis === 'z' ? 'zY' : 'xY');
          }
        }
        if (!pc.door) mapWalls[level].push([g.axis, g.c, pc.p, pc.q]);
        else if (!g.doors.some((d) => d.entrance && d.a <= (pc.p + pc.q) / 2 && d.b >= (pc.p + pc.q) / 2)) doorways.push({ level, axis: g.axis, c: g.c, p: pc.p, q: pc.q });
      }
    }
  }

  // door frames
  const frameCol = hexToRGB('#5b4a3a');
  for (const d of doorways) {
    const base = d.level === 0 ? 0 : LEVEL_H;
    const bb = B.get('satin');
    const o = WT / 2 + 0.03;
    segBox(bb, d.axis, d.c, d.p - 0.08, d.p, -o, o, base, base + DOOR_H + 0.08, frameCol);
    segBox(bb, d.axis, d.c, d.q, d.q + 0.08, -o, o, base, base + DOOR_H + 0.08, frameCol);
    segBox(bb, d.axis, d.c, d.p - 0.08, d.q + 0.08, -o, o, base + DOOR_H, base + DOOR_H + 0.08, frameCol);
  }

  // door leaves (swung open into the room) + signs
  const doorCol = { class: '#a8743f', lab: '#a8743f', music: '#a8743f', office: '#8a6a45', default: '#6d2a2e' };
  for (const rm of rooms) {
    if (rm.type === 'stair') continue;
    const base = rm.level === 0 ? 0 : LEVEL_H;
    const col = hexToRGB(doorCol[rm.type] || doorCol.default);
    for (const d of rm.doorList) {
      const inward = -d.out;
      const leaves = d.width >= 1.6 ? [d.a, d.b] : [d.a];
      const lw = d.width >= 1.6 ? d.width / 2 : d.width;
      for (const hinge of leaves) {
        const sgn = hinge === d.a ? 1 : -1;
        const h0 = hinge + sgn * 0.02;
        const t0 = inward * (WT / 2 + 0.01), t1 = inward * (WT / 2 + lw - 0.06);
        if (d.axis === 'z') {
          const x0 = Math.min(h0, h0 + sgn * 0.05), x1 = Math.max(h0, h0 + sgn * 0.05);
          B.get('satin').box(x0, base + 0.01, d.c + Math.min(t0, t1), x1, base + DOOR_H - 0.04, d.c + Math.max(t0, t1), col);
          world.add(x0, base, d.c + Math.min(t0, t1), x1, base + DOOR_H, d.c + Math.max(t0, t1), 2);
        } else {
          const z0 = Math.min(h0, h0 + sgn * 0.05), z1 = Math.max(h0, h0 + sgn * 0.05);
          B.get('satin').box(d.c + Math.min(t0, t1), base + 0.01, z0, d.c + Math.max(t0, t1), base + DOOR_H - 0.04, z1, col);
          world.add(d.c + Math.min(t0, t1), base, z0, d.c + Math.max(t0, t1), base + DOOR_H, z1, 2);
        }
      }
      const label = rm.big ? rm.name.toUpperCase() : rm.label || rm.name;
      if (!label) continue;
      const uv = atlas.get(label, rm.big ? 'big' : 'room');
      const sw = rm.big ? 2.4 : 1.0, sh = sw / 4;
      const y0 = base + DOOR_H + 0.16;
      const off = d.c + d.out * (WT / 2 + 0.035);
      B.get('sign').vquad(d.axis, off, d.mid - sw / 2, d.mid + sw / 2, y0, y0 + sh, d.out, WHITE, uv);
    }
  }

  // ------------------------------------------------------------------ stairs
  const stairInfo = [];
  const railGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
  const stepCol = hexToRGB('#cfd2d4');
  const treadCol = [hexToRGB('#8e9296'), hexToRGB('#858a8e')];
  const nose = hexToRGB('#e0b030');
  for (const st of stairs) {
    const [x0, z0, x1, z1] = st.R;
    let frame;
    if (st.open === 'E') frame = { s0: x1, sd: -1, t0: z0, td: 1, D: x1 - x0, W: z1 - z0, sAxis: 'x' };
    else if (st.open === 'W') frame = { s0: x0, sd: 1, t0: z0, td: 1, D: x1 - x0, W: z1 - z0, sAxis: 'x' };
    else if (st.open === 'S') frame = { s0: z1, sd: -1, t0: x0, td: 1, D: z1 - z0, W: x1 - x0, sAxis: 'z' };
    else frame = { s0: z0, sd: 1, t0: x0, td: 1, D: z1 - z0, W: x1 - x0, sAxis: 'z' };
    const { D, W } = frame;
    const toXZ = (s, t) => {
      const sv = frame.s0 + frame.sd * s, tv = frame.t0 + frame.td * t;
      return frame.sAxis === 'x' ? [sv, tv] : [tv, sv];
    };
    const boxST = (s0, s1, t0, t1, y0, y1, key, col, collide = true) => {
      const [ax, az] = toXZ(s0, t0), [bx, bz] = toXZ(s1, t1);
      const X0 = Math.min(ax, bx), X1 = Math.max(ax, bx), Z0 = Math.min(az, bz), Z1 = Math.max(az, bz);
      B.get(key).box(X0, y0, Z0, X1, y1, Z1, col);
      if (collide) world.add(X0, y0, Z0, X1, y1, Z1, 3);
    };
    // about 18 cm risers on 28 cm treads; a long stairwell gets a deep landing at the far end
    const n = Math.round(LEVEL_H / 2 / 0.178);
    const F = Math.min(n * 0.28, D - 1.2);
    const landing = D - F;
    const tread = F / n, rise = LEVEL_H / (2 * n);
    const half = W / 2;
    const step = (s0, s1, t0, t1, top, k, noseAt) => {
      boxST(s0, s1, t0, t1, 0, top - 0.03, 'paint', stepCol);
      boxST(s0, s1, t0, t1, top - 0.03, top, 'concrete', treadCol[k % 2], false);
      boxST(noseAt, noseAt + 0.05, t0, t1, top, top + 0.006, 'satin', nose, false);
    };
    for (let k = 1; k <= n; k++) {
      step((k - 1) * tread, k * tread, 0.02, half - 0.1, k * rise, k, (k - 1) * tread);
      step(F - k * tread, F - (k - 1) * tread, half + 0.1, W - 0.02, LEVEL_H / 2 + k * rise, k, F - k * tread);
    }
    boxST(F, D, 0.02, W - 0.02, 0, LEVEL_H / 2 - 0.03, 'paint', stepCol);
    boxST(F, D, 0.02, W - 0.02, LEVEL_H / 2 - 0.03, LEVEL_H / 2, 'concrete', treadCol[0], false);
    boxST(0, F, half - 0.1, half + 0.1, 0, L1_TOP, 'wall', wallColor[0]);
    // sloped handrails on both faces of the center wall
    const rail = (sA, sB, yA, yB, t) => {
      const [ax, az] = toXZ(sA, t), [bx, bz] = toXZ(sB, t);
      const va = new THREE.Vector3(ax, yA, az), vb = new THREE.Vector3(bx, yB, bz);
      const m = new THREE.Mesh(railGeo, M.metal);
      m.scale.set(1, va.distanceTo(vb), 1);
      m.position.copy(va).add(vb).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
      m.castShadow = true;
      scene.add(m);
    };
    rail(0, F, 0.9 + rise, LEVEL_H / 2 + 0.9, half - 0.14);
    rail(F, 0, LEVEL_H / 2 + 0.9 + rise, LEVEL_H + 0.9, half + 0.14);
    // guard rail on the upper floor across the lower flight's opening
    boxST(0.02, 0.1, 0.02, half - 0.1, LEVEL_H, LEVEL_H + 1.05, 'metal', WHITE);
    for (let t = 0.1; t < half - 0.1; t += 0.5) boxST(0.03, 0.09, t, t + 0.04, LEVEL_H, LEVEL_H + 1.05, 'metal', WHITE, false);
    const uv = atlas.get('STAIRS', 'stair');
    const [sx, sz] = toXZ(-0.02, half);
    const outDir = -frame.sd;
    for (const base of [0, LEVEL_H]) {
      const y0 = base + 2.45;
      if (frame.sAxis === 'x') B.get('sign').vquad('x', sx + outDir * 0.12, sz - 0.6, sz + 0.6, y0, y0 + 0.3, outDir, WHITE, uv);
      else B.get('sign').vquad('z', sz + outDir * 0.12, sx - 0.6, sx + 0.6, y0, y0 + 0.3, outDir, WHITE, uv);
    }
    // walking line up the switchback, for routes: [x, z, height]
    const via = [
      [...toXZ(0.25, half / 2), 0],
      [...toXZ(F, half / 2), LEVEL_H / 2],
      [...toXZ(F + landing / 2, half / 2), LEVEL_H / 2],
      [...toXZ(F + landing / 2, half * 1.5), LEVEL_H / 2],
      [...toXZ(F, half * 1.5), LEVEL_H / 2],
      [...toXZ(F / 2, half * 1.5), LEVEL_H * 0.75],
      [...toXZ(0.25, half * 1.5), LEVEL_H],
    ];
    stairInfo.push({ id: st.id, R: st.R, open: st.open, entry0: toXZ(-0.9, half / 2), exit1: toXZ(-0.9, half + half / 2), D, W, via });
  }

  // ------------------------------------------------------------------ floors
  // The auditorium house is raked along x: level at the back (west), sloping down to the
  // orchestra in front of the stage, which is at hallway level at the east end.
  const theatreRoom = rooms.find((r) => r.type === 'theatre');
  const H_BACK = wx(THEATRE.back), H_RAKE = wx(THEATRE.rake), H_FRONT = wx(THEATRE.front), DEPTH = THEATRE.depth;
  const house = [H_BACK, theatreRoom.R[1], H_FRONT, theatreRoom.R[3]];
  const houseFloor = (x) => (x <= H_BACK ? 0 : x >= H_RAKE ? DEPTH : (DEPTH * (x - H_BACK)) / (H_RAKE - H_BACK));
  world.addTerrain(house, (x) => houseFloor(x));

  // hallway floors: rooms draw their own floor on top, so leave those areas out
  const roomFloors = (lv) => rooms.filter((rm) => rm.level === lv && rm.type !== 'stair').map((rm) => rm.R);
  const floorHoles0 = [house, ...roomFloors(0)];
  for (const { r } of blockRects)
    for (const fr of subtractRects([r], floorHoles0)) B.get('floorTile').hquad(fr[0], fr[1], fr[2], fr[3], 0.02, true);
  const slabRects = subtractRects(level1Rects, stairRects);
  const floorHoles1 = roomFloors(1);
  for (const r of slabRects) {
    // the slab's underside sits above the 1st-floor ceiling, so only its top and edges are drawn
    B.get('paint').box(r[0], LEVEL_H - SLAB, r[1], r[2], LEVEL_H + 0.02, r[3], hexToRGB('#d9d6cf'), 'xXzZ');
    for (const fr of subtractRects([r], floorHoles1)) B.get('floorTile').hquad(fr[0], fr[1], fr[2], fr[3], LEVEL_H + 0.02, true, hexToRGB('#f4f0e8'));
    world.add(r[0], LEVEL_H - SLAB, r[1], r[2], LEVEL_H, r[3], 4);
  }
  rooms.forEach((rm, i) => {
    if (rm.type === 'stair' || rm.type === 'theatre') return;
    const [key, color] = floorStyle(rm, i + (rm.label ? rm.label.charCodeAt(rm.label.length - 1) : 0));
    const y = (rm.level === 0 ? 0 : LEVEL_H) + 0.035;
    B.get(key).hquad(rm.R[0], rm.R[1], rm.R[2], rm.R[3], y, true, hexToRGB(color));
  });
  {
    const [x0, z0, x1, z1] = theatreRoom.R;
    const carpet = hexToRGB('#4a2a2e');
    B.get('carpet').hquad(x0, z0, H_BACK, z1, 0.035, true, carpet);
    B.get('carpet').slopeX(H_BACK, z0, H_RAKE, z1, 0.035, DEPTH + 0.035, carpet);
    B.get('carpet').hquad(H_RAKE, z0, H_FRONT, z1, DEPTH + 0.035, true, carpet);
    B.get('stage').hquad(H_FRONT, z0, x1, z1, 0.035, true, hexToRGB('#5a3b25'));
    B.get('paint').box(H_FRONT - 0.02, DEPTH, z0, H_FRONT + 0.02, 0.035, z1, hexToRGB('#1b1b1b'), 'x');
    B.get('wall').box(H_BACK, DEPTH - 0.05, z0 + WT / 2 - 0.02, H_FRONT, 0.05, z0 + WT / 2, wallColor[0], 'Z');
    B.get('wall').box(H_BACK, DEPTH - 0.05, z1 - WT / 2, H_FRONT, 0.05, z1 - WT / 2 + 0.02, wallColor[0], 'z');
  }

  // ------------------------------------------------------------------ ceilings + lights
  const lightB = B.get('light');
  const lightCenters = [];
  const addLights = (r, y, spacing = 4.2) => {
    const nx = Math.max(1, Math.floor((r[2] - r[0]) / spacing));
    const nz = Math.max(1, Math.floor((r[3] - r[1]) / spacing));
    const sx = (r[2] - r[0]) / nx, sz = (r[3] - r[1]) / nz;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const cx = r[0] + sx * (i + 0.5), cz = r[1] + sz * (j + 0.5);
        // lens just below a slightly larger metal trim ring
        lightB.hquad(cx - 0.3, cz - 0.6, cx + 0.3, cz + 0.6, y - 0.022, false);
        B.get('satin').box(cx - 0.35, y - 0.02, cz - 0.65, cx + 0.35, y - 0.004, cz + 0.65, hexToRGB('#d9dcdf'), 'yxXzZ');
        lightCenters.push([cx, y, cz]);
      }
  };
  for (const { r, b } of blockRects) {
    const y = ceil0(b);
    const rects = b.levels === 2 ? subtractRects([r], stairRects) : [r];
    const tall = y > 5; // gyms, pool, theatre, dining: exposed deck instead of ceiling tile
    for (const cr of rects) {
      B.get(tall ? 'deck' : 'ceiling').box(cr[0], y, cr[1], cr[2], y + 0.08, cr[3], WHITE, 'y');
      world.add(cr[0], y, cr[1], cr[2], y + 0.08, cr[3], 6);
      addLights(cr, y, tall ? 7 : 4.2);
    }
    if (b.levels === 2) {
      B.get('ceiling').box(r[0], CEIL2[1], r[1], r[2], CEIL2[1] + 0.08, r[3], WHITE, 'y');
      world.add(r[0], CEIL2[1], r[1], r[2], CEIL2[1] + 0.08, r[3], 6);
      addLights(r, CEIL2[1]);
    }
  }
  for (const { r, b } of blockRects)
    forEachEdgeInterval(r, (axis, c, p, q, out, inPt, outPt) => {
      const ob = blockAt(...outPt);
      if (!ob || ob === b) return;
      const cin = ceil0(b), cout = ceil0(ob);
      if (cout <= cin + 0.01) return;
      segBox(B.get('wall'), axis, c, p, q, -0.05, 0.05, cin, cout + 0.02, wallColor[0]);
    });

  // ------------------------------------------------------------------ exterior skin with openings
  const copeCol = hexToRGB('#5b4a3c'); // dark bronze coping under the mansard
  const panelCol = hexToRGB('#8d9390'); // gray metal panel band (2021 additions)
  const panelJoint = hexToRGB('#6f7573');
  const bronzeCol = hexToRGB('#5e4838'); // bronze metal fascia
  const bronzeJoint = hexToRGB('#46362a');
  const winCol = hexToRGB('#2f2a26'); // dark bronze window frames
  const frameB = B.get('satin');
  const outsideAll = (x, z) => !blockRects.some((br) => inRect(br.r, x, z));
  const faceOut = (axis, out, extra = '') => (axis === 'z' ? (out > 0 ? 'Z' : 'z') : out > 0 ? 'X' : 'x') + extra;
  for (const run of runs) {
    const { axis, c, p, q, out, hOut, hIn, b } = run;
    // stretch the skin around outside corners only (never into the building)
    const extP = outsideAll(...P(axis, c + out * SK * 0.5, p - SK * 0.5)) ? SK : 0;
    const extQ = outsideAll(...P(axis, c + out * SK * 0.5, q + SK * 0.5)) ? SK : 0;
    const p0 = p - extP, q0 = q + extQ;
    const bps = new Set([p0, q0]);
    for (const o of run.openings) { bps.add(o.a); bps.add(o.b); }
    const pts = [...bps].sort((m, n) => m - n);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], bq = pts[i + 1];
      if (bq - a < 0.005) continue;
      const m = (a + bq) / 2;
      const holes = run.openings.filter((o) => o.a <= m && o.b >= m).map((o) => [o.y0, o.y1]);
      for (const [s, e] of solidSpans(hOut, hIn, holes)) {
        segBox(B.get('facade'), axis, c, a, bq, 0, out * SK, s, e);
        segCollider(axis, c, a, bq, 0, out * SK, s, e);
      }
    }
    // red brick bands (three courses) on the buff block, as in the photos
    const fH = b.fasciaH || 0.9, pH = b.panelH || 0.9; // bronze fascia and gray panel band heights
    const top = b.fascia ? hIn + 0.35 - fH - pH : hIn - 0.25;
    const bands = [0.3, 0.75, 1.2, top - 0.45];
    if (b.levels === 2) bands.push(LEVEL_H + 0.3, LEVEL_H - 0.1);
    for (const yb of bands) if (yb > hOut + 0.05 && yb + 0.2 < top + 0.01) segBox(B.get('redband'), axis, c, p0, q0, out * SK, out * (SK + 0.012), yb, yb + 0.2, WHITE, faceOut(axis, out, 'yY'));
    if (b.fascia) {
      // metal panels: a gray band, then the bronze fascia that projects past the wall
      const fb0 = hIn + 0.35 - fH;
      segBox(B.get('satin'), axis, c, p0, q0, out * SK, out * (SK + 0.05), top, fb0, panelCol, faceOut(axis, out, 'y'));
      for (let u = p0 + 1.5; u < q0 - 0.3; u += 1.5) segBox(B.get('paint'), axis, c, u - 0.01, u + 0.01, out * (SK + 0.05), out * (SK + 0.055), top, fb0, panelJoint, faceOut(axis, out));
      segBox(B.get('satin'), axis, c, p0 - 0.3, q0 + 0.3, -out * 0.05, out * (SK + 0.3), fb0, hIn + 0.35, bronzeCol, faceOut(axis, out, 'yYxXzZ'.replace(faceOut(axis, -out), '')));
      for (let u = p0 + 1.2; u < q0 - 0.3; u += 1.2) segBox(B.get('paint'), axis, c, u - 0.01, u + 0.01, out * (SK + 0.3), out * (SK + 0.305), fb0, hIn + 0.35, bronzeJoint, faceOut(axis, out));
      // cast-stone band (the gym, at about 3.9 m in the architect's photo)
      if (b.id === 'gym') segBox(B.get('paint'), axis, c, p0 - 0.02, q0 + 0.02, out * SK, out * (SK + 0.05), 3.8, 3.98, hexToRGB('#e4ddcf'), faceOut(axis, out, 'yY'));
    } else segBox(B.get('paint'), axis, c, p0 - 0.03, q0 + 0.03, -out * 0.03, out * (SK + 0.04), hIn - 0.08, hIn, copeCol, faceOut(axis, out, 'y'));
    if (b.mansard) mansard(run, p0, q0);
  }
  // Mansard: a band of brown shingle roof sloping up from the eaves to a ridge about 2.8 m
  // higher (the LiDAR puts the ridges at about 7 m on the one-story wings), with the flat roof
  // deck behind it. Hips at outside corners, valleys at inside corners.
  function mansard(run, p0, q0) {
    const { axis, c, p, q, out, hIn, b } = run;
    const o = SK + 0.25;
    const inside = (x, z) => !outsideAll(x, z);
    const corner = (end, t) => {
      if (outsideAll(...P(axis, c - out * 0.3, end + t * 0.3))) return 1; // outside corner
      if (inside(...P(axis, c + out * 0.3, end + t * 0.3))) return -1; // inside corner
      return 0;
    };
    const kp = corner(p, -1), kq = corner(q, 1);
    // depth: up to 4.5 m, less on narrow wings so the two slopes don't cross
    let D = 0;
    const mid = (p + q) / 2;
    while (D < 12 && blockAt(...P(axis, c - out * (D + 0.25), mid)) === b) D += 0.25;
    const d = Math.min(4.5, D * 0.45);
    if (d < 1) return;
    const rise = d * 0.62;
    const eA = p - (kp === 1 ? o : kp === -1 ? -o : 0), eB = q + (kq === 1 ? o : kq === -1 ? -o : 0);
    const iA = p + (kp === 1 ? d - o : kp === -1 ? -(d - o) : 0), iB = q - (kq === 1 ? d - o : kq === -1 ? -(d - o) : 0);
    if (iB - iA < 0.2) return;
    const y0 = hIn - 0.05, y1 = hIn + rise;
    const [ax, az] = P(axis, c + out * o, eA), [bx, bz] = P(axis, c + out * o, eB);
    const [cx, cz] = P(axis, c - out * (d - o), iB), [dx, dz] = P(axis, c - out * (d - o), iA);
    const nrm = axis === 'z' ? [0, d, out * rise] : [out * rise, d, 0];
    const L = Math.hypot(...nrm);
    const nn = nrm.map((v) => v / L);
    const quad = [[ax, y0, az], [bx, y0, bz], [cx, y1, cz], [dx, y1, dz]];
    // wind the quad so it faces outward-up
    const e1 = quad[1].map((v, i) => v - quad[0][i]), e2 = quad[3].map((v, i) => v - quad[0][i]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * nn[0] + cr[1] * nn[1] + cr[2] * nn[2] < 0;
    const qq = flip ? [quad[0], quad[3], quad[2], quad[1]] : quad;
    const uv = qq.map((v) => [axis === 'z' ? v[0] : v[2], Math.hypot(v[1] - y0, (axis === 'z' ? v[2] : v[0]) - (axis === 'z' ? az : ax))]);
    B.get('shingle').quad(qq, nn, uv);
    // inner face of the ridge, down to the flat deck
    const ic = c - out * (d - o);
    segBox(B.get('shingle'), axis, ic, iA, iB, -0.02, 0.02, b.roof, y1, WHITE, faceOut(axis, -out));
  }
  // The gym's tall windows and pilasters, from the architect's photo: four tall windows between
  // five pilasters on the west face, and a tall window over each of the two south doors (with
  // a small bronze canopy over the door). Black mullions, translucent panels.
  {
    const gym = rooms.find((r) => r.name === 'Gym' && r.level === 0);
    const [gx0, gz0, , gz1] = gym.R;
    const tall = (axis, c, out, a, bw, y0, y1, cols, rows) => {
      B.get('extGlass').vquad(axis, c + out * (SK * 0.6), a, bw, y0, y1, out);
      for (let k = 0; k <= cols; k++) { const u = a + ((bw - a) * k) / cols; segBox(B.get('satin'), axis, c, u - 0.05, u + 0.05, out * SK * 0.5, out * (SK + 0.03), y0, y1, winCol); }
      for (let k = 0; k <= rows; k++) { const y = y0 + ((y1 - y0) * k) / rows; segBox(B.get('satin'), axis, c, a, bw, out * SK * 0.5, out * (SK + 0.03), y - 0.05, y + 0.05, winCol); }
    };
    const n = 4, pil = 0.75;
    const span = (gz1 - gz0 - 2) / n;
    for (let i = 0; i <= n; i++) {
      const z = gz0 + 1 + i * span;
      segBox(B.get('facade'), 'x', gx0, z - pil / 2, z + pil / 2, -SK, -(SK + 0.3), 0, 7.3, WHITE, 'xzZ');
      world.add(gx0 - SK - 0.3, 0, z - pil / 2, gx0 - SK, 7.3, z + pil / 2, 1);
      if (i < n) tall('x', gx0, -1, z + pil / 2 + 0.9, z + span - pil / 2 - 0.9, 1.0, 6.6, 3, 9);
    }
    for (const e of entrances.filter((ee) => ee.name === 'Gym Doors')) {
      // window over the door and a bronze canopy, measured on the photo
      const [ww, wy0, wy1] = e.win, [ca, cb] = e.can;
      tall('z', gz1, 1, e.mid - ww / 2, e.mid + ww / 2, wy0, wy1, 4, 7);
      B.get('satin').box(e.mid + ca, 2.5, gz1 + SK, e.mid + cb, 2.92, gz1 + SK + 1.4, bronzeCol);
      world.add(e.mid + ca, 2.5, gz1 + SK, e.mid + cb, 2.92, gz1 + SK + 1.4, 6);
    }
    // the school's name in bronze letters on the south face, east of the first door
    const tex = textTexture([{ text: 'COMMUNITY MIDDLE SCHOOL', size: 0.72, font: 'Futura, "Century Gothic", Arial, sans-serif', weight: '600' }], { w: 2048, h: 120, bg: 'rgba(0,0,0,0)', fg: '#4a3a2e', border: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, (13 * 120) / 2048), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.4, metalness: 0.4 }));
    sign.position.set(gx0 + 15.3, 5.75, gz1 + SK + 0.03);
    sign.castShadow = true;
    scene.add(sign);
  }
  // windows: dark bronze frames with a mullion between panes, aluminum sill outside,
  // painted stool inside
  for (const w of windows) {
    const { axis, c, out, a, b: bw, y0, y1, n } = w;
    const gc = c + out * SK * 0.55;
    B.get('extGlass').vquad(axis, gc + out * 0.004, a, bw, y0, y1, out);
    B.get('intGlass').vquad(axis, gc, a, bw, y0, y1, -out);
    segCollider(axis, c, a, bw, out * SK * 0.5, out * SK * 0.6, y0, y1, 15);
    const f0 = out * SK * 0.45, f1 = out * SK * 0.72;
    segBox(frameB, axis, c, a, a + 0.06, f0, f1, y0, y1, winCol);
    segBox(frameB, axis, c, bw - 0.06, bw, f0, f1, y0, y1, winCol);
    segBox(frameB, axis, c, a, bw, f0, f1, y1 - 0.07, y1, winCol);
    segBox(frameB, axis, c, a, bw, f0, f1, y0, y0 + 0.09, winCol);
    for (let k = 1; k < n; k++) {
      const u = a + ((bw - a) * k) / n;
      segBox(frameB, axis, c, u - 0.035, u + 0.035, f0, f1, y0, y1, winCol);
    }
    segBox(frameB, axis, c, a - 0.03, bw + 0.03, out * SK * 0.7, out * (SK + 0.05), y0 - 0.04, y0, winCol);
    segBox(B.get('satin'), axis, c, a - 0.05, bw + 0.05, -out * (WT / 2 + 0.1), out * SK * 0.45, y0 - 0.03, y0, hexToRGB('#f1efe9'));
  }

  // ------------------------------------------------------------------ roofs + rooftop units
  for (const { r, b } of blockRects) {
    B.get('roof').box(r[0], b.roof - 0.3, r[1], r[2], b.roof, r[3], WHITE, 'Yy');
    world.add(r[0], b.roof - 0.3, r[1], r[2], b.roof, r[3], 16);
  }
  const hvac = hexToRGB('#b9bcbf');
  for (const b of blocks) {
    for (const r of b.R) {
      const area = (r[2] - r[0]) * (r[3] - r[1]);
      const n = Math.min(6, Math.floor(area / 900));
      for (let i = 0; i < n; i++) {
        const w = 2 + R() * 3, d = 2 + R() * 3, h = 1 + R() * 1.4;
        const cx = r[0] + 3 + R() * Math.max(0.1, r[2] - r[0] - 6 - w);
        const cz = r[1] + 3 + R() * Math.max(0.1, r[3] - r[1] - 6 - d);
        B.get('satin').box(cx, b.roof, cz, cx + w, b.roof + h, cz + d, hvac);
        B.get('frame').box(cx + 0.3, b.roof + h, cz + 0.3, cx + w - 0.3, b.roof + h + 0.05, cz + d - 0.3);
      }
    }
  }

  // ------------------------------------------------------------------ entrances (sliding glass doors)
  // tinted storefront glass: reads dark from outside, as on the photo of the entrance
  const doorMat = new THREE.MeshStandardMaterial({ color: '#4a5a66', roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.55, depthWrite: false, envMapIntensity: 1.2 });
  const slidingDoors = [];
  for (const e of entrances) {
    const fb = B.get('frame');
    const o0 = -WT / 2, o1 = e.out * (SK - 0.02);
    segBox(fb, e.axis, e.c, e.a - 0.12, e.a, o0, o1, 0, ENTRY_H);
    segBox(fb, e.axis, e.c, e.b, e.b + 0.12, o0, o1, 0, ENTRY_H);
    segBox(fb, e.axis, e.c, e.a - 0.12, e.b + 0.12, o0, o1, ENTRY_H - 0.15, ENTRY_H);
    // the main entrance is a storefront: three pairs of doors with fixed glass between them
    const pairs = e.main ? [-5.6, 0, 5.6].map((o) => ({ mid: e.mid + o, a: e.mid + o - 1.0, b: e.mid + o + 1.0 })) : [{ mid: e.mid, a: e.a, b: e.b }];
    if (e.main) {
      const fixed = solidSpans(e.a, e.b, pairs.map((pp) => [pp.a - 0.06, pp.b + 0.06]));
      for (const [fa, fb2] of fixed) {
        B.get('extGlass').vquad(e.axis, e.c + e.out * 0.13, fa, fb2, 0.05, ENTRY_H - 0.15, e.out);
        B.get('intGlass').vquad(e.axis, e.c + e.out * 0.11, fa, fb2, 0.05, ENTRY_H - 0.15, -e.out);
        segCollider(e.axis, e.c, fa, fb2, 0.08, e.out * 0.16, 0, ENTRY_H, 15);
        for (let u = fa; u <= fb2 + 1e-3; u += (fb2 - fa) / Math.max(1, Math.round((fb2 - fa) / 1.2))) segBox(fb, e.axis, e.c, u - 0.04, u + 0.04, e.out * 0.06, e.out * 0.2, 0, ENTRY_H, WHITE);
        segBox(fb, e.axis, e.c, fa, fb2, e.out * 0.06, e.out * 0.2, 0, 0.12, WHITE);
        segBox(fb, e.axis, e.c, fa, fb2, e.out * 0.06, e.out * 0.2, 2.25, 2.32, WHITE);
      }
    }
    for (const pr of pairs) {
      const half = (pr.b - pr.a) / 2;
      const panels = [];
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(e.axis === 'z' ? half : 0.05, ENTRY_H - 0.2, e.axis === 'z' ? 0.05 : half);
        const m = new THREE.Mesh(g, doorMat);
        m.renderOrder = 3;
        scene.add(m);
        const fr = new THREE.Mesh(new THREE.BoxGeometry(e.axis === 'z' ? half : 0.06, 0.08, e.axis === 'z' ? 0.06 : half), M.frame);
        fr.position.y = -(ENTRY_H - 0.2) / 2 + 0.04;
        m.add(fr);
        panels.push({ m, side });
      }
      const [cx, cz] = P(e.axis, e.c + e.out * 0.12, pr.mid);
      slidingDoors.push({ e, panels, cx, cz, half, mid: pr.mid, open: 0 });
    }
    const uv = atlas.get('EXIT', 'exit');
    B.get('sign').vquad(e.axis, e.c - e.out * (WT / 2 + 0.03), e.mid - 0.4, e.mid + 0.4, ENTRY_H + 0.08, ENTRY_H + 0.28, -e.out, WHITE, uv);
    const [px, pz] = P(e.axis, e.c + e.out * (SK + 1.6), e.mid);
    const hw = e.b - e.a + 1.6;
    if (e.axis === 'z') B.get('concrete').hquad(px - hw / 2, pz - 1.6, px + hw / 2, pz + 1.6, 0.045, true, hexToRGB('#d6d2c8'));
    else B.get('concrete').hquad(px - 1.6, pz - hw / 2, px + 1.6, pz + hw / 2, 0.045, true, hexToRGB('#d6d2c8'));
  }
  const updateDoors = (px, pz, dt) => {
    for (const d of slidingDoors) {
      const dist = Math.hypot(px - d.cx, pz - d.cz);
      const target = dist < 4.5 ? 1 : 0;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 2.2);
      const ease = d.open * d.open * (3 - 2 * d.open);
      for (const p of d.panels) {
        const shift = p.side * (d.half / 2 + ease * d.half * 0.92);
        const [x, z] = P(d.e.axis, d.e.c + d.e.out * 0.12, d.mid + shift);
        p.m.position.set(x, (ENTRY_H - 0.2) / 2 + 0.02, z);
      }
    }
  };
  updateDoors(1e9, 1e9, 10);

  // ------------------------------------------------------------------ main entrance (2021)
  // From the architect's photo (the 7 ft doors as the ruler): a storefront of glass about 17 m
  // wide with three pairs of doors, under a flat gray canopy (soffit 3.3 m, top 4.2 m) carried
  // on square buff columns with red bands; above it a glazed clerestory to about 6 m with a
  // hipped standing-seam roof peaking near 7.3 m. The monument sign and flagpole stand in the
  // plaza in front (see exterior.js).
  let canopy = null;
  {
    const main = entrances.find((e) => e.main);
    const zf = main.c; // storefront line (south face of the vestibule)
    const xa = main.a, xb = main.b;
    const fy0 = 3.3, fy1 = 4.2, depth = 4.2;
    const z1 = zf + SK + depth, x0 = xa - 1.2, x1 = xb + 1.2;
    canopy = { rects: [[x0, zf, x1, z1]], x0, x1, z0: zf, z1, cols: [] };
    const gray = hexToRGB('#9aa09d'), soffit = hexToRGB('#d9dad6');
    B.get('satin').box(x0, fy0, zf + SK, x1, fy1, z1, gray, 'xXZY');
    B.get('paint').hquad(x0, zf + SK, x1, z1, fy0, false, soffit);
    world.add(x0, fy0, zf, x1, fy1, z1, 6);
    for (let x = x0 + 1.5; x < x1 - 0.2; x += 1.5) B.get('paint').box(x - 0.01, fy0 + 0.05, z1, x + 0.01, fy1 - 0.05, z1 + 0.005, hexToRGB('#7f8582'), 'Z');
    for (let x = x0 + 1.4; x < x1 - 0.6; x += 2.8) lightB.hquad(x - 0.12, z1 - 1.6, x + 0.12, z1 - 1.36, fy0 - 0.01, false);
    // columns: buff block with red bands
    const colW = 0.65;
    for (const cx of [xa + 0.4, (xa + xb) / 2, xb - 0.4].map((v, i) => (i === 1 ? v : v))) {
      const cz = z1 - 0.6;
      B.get('facade').box(cx - colW / 2, 0, cz - colW / 2, cx + colW / 2, fy0, cz + colW / 2);
      for (const yb of [0.3, 0.75, 2.4]) B.get('redband').box(cx - colW / 2 - 0.01, yb, cz - colW / 2 - 0.01, cx + colW / 2 + 0.01, yb + 0.2, cz + colW / 2 + 0.01, WHITE, 'xXzZ');
      world.add(cx - colW / 2, 0, cz - colW / 2, cx + colW / 2, fy0, cz + colW / 2, 8);
      canopy.cols.push([cx, cz]);
    }
    B.get('concrete').hquad(x0, zf, x1, z1, 0.05, true, hexToRGB('#dcd8cf'));
    // clerestory over the vestibule
    const roofY = blockAt(main.mid, zf - 1).roof + PARAPET;
    const cx0 = (xa + xb) / 2 - 6.5, cx1 = (xa + xb) / 2 + 6.5, cz0 = zf - 7.5, cz1 = zf - 0.6;
    const cy0 = roofY, cy1 = 6.0;
    B.get('facade').box(cx0, cy0, cz0, cx1, cy1, cz1, WHITE, 'xXz');
    B.get('extGlass').vquad('z', cz1 + 0.02, cx0 + 0.7, cx1 - 0.7, cy0 + 0.25, cy1 - 0.4, 1);
    for (let x = cx0 + 0.7; x <= cx1 - 0.69; x += (cx1 - cx0 - 1.4) / 8) B.get('satin').box(x - 0.04, cy0 + 0.25, cz1, x + 0.04, cy1 - 0.4, cz1 + 0.06, winCol);
    B.get('satin').box(cx0 + 0.7, cy0 + 1.0, cz1, cx1 - 0.7, cy0 + 1.08, cz1 + 0.06, winCol);
    for (const px of [cx0, (cx0 + cx1) / 2 - 0.35, cx1 - 0.7]) {
      B.get('facade').box(px, cy0, cz1 - 0.1, px + 0.7, cy1, cz1 + 0.15);
      B.get('redband').box(px - 0.01, cy0 + 0.6, cz1 + 0.15, px + 0.71, cy0 + 0.8, cz1 + 0.16, WHITE, 'Z');
      B.get('redband').box(px - 0.01, cy1 - 0.7, cz1 + 0.15, px + 0.71, cy1 - 0.5, cz1 + 0.16, WHITE, 'Z');
    }
    B.get('satin').box(cx0 - 0.4, cy1 - 0.4, cz0 - 0.4, cx1 + 0.4, cy1, cz1 + 0.6, gray, 'xXzZy');
    // hipped standing-seam roof
    {
      const g = B.get('seam');
      const rx0 = cx0 - 0.4, rx1 = cx1 + 0.4, rz0 = cz0 - 0.4, rz1 = cz1 + 0.6, ry0 = cy1, ry1 = 7.3;
      const inset = Math.min((rx1 - rx0), (rz1 - rz0)) / 2 - 0.3;
      const ra = [rx0 + inset, rz0 + inset], rb = [rx1 - inset, rz1 - inset];
      const tri = (pts, n) => g.quad(pts.length === 3 ? [...pts, pts[2]] : pts, n, pts.length === 3 ? [[pts[0][0], 0], [pts[1][0], 0], [pts[2][0], 1], [pts[2][0], 1]] : pts.map((v) => [v[0] + v[2], v[1]]));
      const nz = (s) => { const v = [0, inset, s * (ry1 - ry0)]; const l = Math.hypot(...v); return v.map((u) => u / l); };
      const nx = (s) => { const v = [s * (ry1 - ry0), inset, 0]; const l = Math.hypot(...v); return v.map((u) => u / l); };
      g.quad([[rx0, ry0, rz1], [rx1, ry0, rz1], [rb[0], ry1, rb[1]], [ra[0], ry1, rb[1]]], nz(1), [[rx0, 0], [rx1, 0], [rb[0], 1], [ra[0], 1]]);
      g.quad([[rx1, ry0, rz0], [rx0, ry0, rz0], [ra[0], ry1, ra[1]], [rb[0], ry1, ra[1]]], nz(-1), [[rx1, 0], [rx0, 0], [ra[0], 1], [rb[0], 1]]);
      g.quad([[rx1, ry0, rz1], [rx1, ry0, rz0], [rb[0], ry1, ra[1]], [rb[0], ry1, rb[1]]], nx(1), [[rz1, 0], [rz0, 0], [ra[1], 1], [rb[1], 1]]);
      g.quad([[rx0, ry0, rz0], [rx0, ry0, rz1], [ra[0], ry1, rb[1]], [ra[0], ry1, ra[1]]], nx(-1), [[rz0, 0], [rz1, 0], [rb[1], 1], [ra[1], 1]]);
      void tri;
    }
    // white metal letters on the canopy fascia
    const tex = textTexture([{ text: 'COMMUNITY MIDDLE SCHOOL', size: 0.7, font: 'Futura, "Century Gothic", Arial, sans-serif', weight: '600' }], { w: 2048, h: 120, bg: 'rgba(0,0,0,0)', fg: '#f4f2ec', border: false });
    const sw = 9.5, sh = (sw * 120) / 2048;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.35, metalness: 0.3 }));
    sign.position.set((x0 + x1) / 2, (fy0 + fy1) / 2, z1 + 0.03);
    sign.castShadow = true;
    scene.add(sign);
  }

  // ------------------------------------------------------------------ meshes
  const materials = {
    ...M,
    wallHidden: M.wall,
    sign: new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.45, emissive: '#ffffff', emissiveMap: atlas.texture, emissiveIntensity: 0.35 }),
  };
  materials.sign.userData.noShadow = true;
  // lightmap UVs for the big surfaces; each atlas page gets its own copy of the material
  const lightmap = packLightmaps(B);
  const lightmapped = [];
  for (const key of B.map.keys()) {
    const at = key.indexOf('@');
    if (at < 0) continue;
    const mat = materials[key.slice(0, at)].clone();
    materials[key] = mat;
    lightmapped.push({ mat, page: +key.slice(at + 1) });
  }
  for (const m of B.toMeshes(materials)) scene.add(m);

  const zones = ZONES.map((z) => ({ ...z, R: rectW(z.r) }));
  return {
    rooms, stairs: stairInfo, blocks, blockRects, zones, entrances, mapWalls, house, atlas, windows,
    courtyard: rectW(COURTYARDS[0]), courtyards: COURTYARDS.map(rectW), level1Rects, slabRects, updateDoors, blockAt, materials, lightCenters,
    lightmap, lightmapped, canopy,
  };
}
