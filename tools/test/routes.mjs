// Navigation and physics tests, in a real browser:
//   1. every room has a route on the nav mesh from the main entrance
//   2. the player walks each route with the real player physics (Player.update) and arrives
//   3. jumping, sliding along a wall, and climbing a stairwell work
//   4. the character model's real bounding box is 5 ft 7 in
import { open } from './harness.mjs';
const only = process.argv.slice(2);
const { page, errors, close } = await open({ quality: 'low', width: 480, height: 300 });
const res = await page.evaluate(async (only) => {
  const THREE = await import('three');
  const g = window.__game, info = g.info, nav = g.nav, P = g.player;
  const out = { fails: [], walked: 0, routed: 0, slow: [] };
  const spawn = g.spawn;
  // ---- 4. character height
  P.teleport(spawn[0], 0, spawn[1], 0);
  g.player.char.group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(g.player.char.group);
  out.height = +(bb.max.y - bb.min.y).toFixed(3);
  // ---- 1 + 2. routes and walks
  const rooms = info.rooms.filter((r) => r.type !== 'stair' && (r.label || r.name) && (!only.length || only.includes(r.label)));
  const step = (mv, yaw, n, sprint = false, jump = false) => { for (let i = 0; i < n; i++) P.update(1 / 60, mv, yaw, sprint, i === 0 && jump); };
  for (const rm of rooms) {
    P.teleport(spawn[0], 0, spawn[1], 0);
    const path = g.routeToRoom(rm);
    if (!path) { out.fails.push({ room: rm.label || rm.name, lv: rm.level, why: 'no route', R: rm.R.map((v) => +v.toFixed(1)), doors: rm.doorList.map((d) => d.side + '@' + d.mid.toFixed(1)) }); continue; }
    out.routed++;
    const pts = path.points;
    let ok = true, t = 0;
    for (let i = 1; i < pts.length && ok; i++) {
      const q = pts[i];
      let best = Infinity, stuck = 0;
      for (;;) {
        const dx = q.x - P.pos.x, dz = q.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d < (i === pts.length - 1 ? 0.5 : 0.7)) break;
        const yaw = Math.atan2(-dx, -dz);
        step({ x: 0, z: 1 }, yaw, 6);
        t += 0.1;
        if (d < best - 0.05) { best = d; stuck = 0; } else if (++stuck > 60) { ok = false; out.fails.push({ room: rm.label || rm.name, lv: rm.level, why: 'stuck', at: [P.pos.x.toFixed(1), P.pos.y.toFixed(2), P.pos.z.toFixed(1)], next: [q.x.toFixed(1), q.h.toFixed(2), q.z.toFixed(1)] }); break; }
        if (t > 400) { ok = false; out.fails.push({ room: rm.label || rm.name, why: 'timeout' }); break; }
      }
    }
    if (!ok) continue;
    const [x0, z0, x1, z1] = rm.R;
    const lvOk = rm.level ? P.pos.y > g.levelH - 0.5 : P.pos.y < 1.5;
    const inside = P.pos.x > x0 - 0.3 && P.pos.x < x1 + 0.3 && P.pos.z > z0 - 0.3 && P.pos.z < z1 + 0.3;
    if (!lvOk || !inside) out.fails.push({ room: rm.label || rm.name, lv: rm.level, why: 'ended outside', at: [P.pos.x.toFixed(1), P.pos.y.toFixed(2), P.pos.z.toFixed(1)] });
    else { out.walked++; if (t > 120) out.slow.push([rm.label || rm.name, Math.round(t)]); }
  }
  out.total = rooms.length;
  // ---- 3. jump: on flat ground the jump should clear about 0.5 m and land again
  P.teleport(spawn[0], 0, spawn[1] + 3, 0);
  step({ x: 0, z: 0 }, 0, 10);
  let peak = 0;
  P.update(1 / 60, { x: 0, z: 0 }, 0, false, true);
  for (let i = 0; i < 120; i++) { P.update(1 / 60, { x: 0, z: 0 }, 0, false, false); peak = Math.max(peak, P.pos.y); }
  out.jump = { peak: +peak.toFixed(2), landed: P.grounded && P.pos.y < 0.05 };
  // ---- 3. wall slide: walk at 45 degrees into the long south wall of the 900s; the player
  // should keep moving along it (x changes) and not pass through (z stays outside)
  const r910 = info.rooms.find((r) => r.label === '910' && r.level === 0).R;
  const zw = r910[3];
  P.teleport(r910[0] + 2, 0, zw + 1.2, 0);
  const sx = P.pos.x;
  step({ x: 0, z: 1 }, Math.atan2(-1, 1), 180); // heading +x and -z (into the wall)
  out.slide = { movedAlong: +(P.pos.x - sx).toFixed(2), z: +P.pos.z.toFixed(2), wallZ: +zw.toFixed(2), ok: P.pos.x - sx > 3 && P.pos.z > zw };
  // ---- 3. stairs: walk up each stairwell's walking line and check we reach the 2nd floor
  out.stairs = [];
  for (const st of info.stairs) {
    const v = st.via;
    P.teleport(st.entry0[0], 0, st.entry0[1], 0);
    let okS = true;
    for (const [x, z] of [v[0], v[1], v[2], v[3], v[4], v[5], v[6], st.exit1]) {
      for (let k = 0; k < 400; k++) {
        const dx = x - P.pos.x, dz = z - P.pos.z;
        if (Math.hypot(dx, dz) < 0.35) break;
        step({ x: 0, z: 1 }, Math.atan2(-dx, -dz), 2);
        if (k === 399) okS = false;
      }
    }
    out.stairs.push({ id: st.id, top: +P.pos.y.toFixed(2), ok: okS && Math.abs(P.pos.y - g.levelH) < 0.1 });
  }
  return out;
}, only);
console.log(JSON.stringify({ height: res.height, total: res.total, routed: res.routed, walked: res.walked, jump: res.jump, slide: res.slide, stairs: res.stairs }, null, 1));
console.log('fails:', res.fails.length);
for (const f of res.fails) console.log(' ', JSON.stringify(f));
if (res.slow.length) console.log('slow walks (s):', JSON.stringify(res.slow));
console.log(errors.filter((e) => !/404/.test(e)).slice(0, 10).join('\n'));
await close();
