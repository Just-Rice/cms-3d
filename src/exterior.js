// The Community Middle School campus, traced from a satellite view of 55 Grovers Mill Road
// (Esri World Imagery, checked against the 2015 USGS LiDAR survey).
//
// Features are written in pixels of the rotated satellite frame ("Q"): the 0.2276 m/px
// mosaic turned 15 degrees counterclockwise so the school is square to the image, with
// x to the right (about ESE) and y down (about SSW), the same axes as the floor plan. sat()
// converts to world meters. Grovers Mill Road runs along the south side, parallel to the
// building; the fields and diamonds are to the north, the big lot to the west, Millstone
// River School to the east and High School North across the road to the south.
import * as THREE from 'three';
import { Batches, GeoBuilder, hexToRGB, inRect, subtractRects, WHITE } from './geo.js';
import { rng, makeParkingTexture, textTexture } from './textures.js';

const C = (h) => hexToRGB(h);
export const QM = 0.2276; // meters per Q pixel
export const sat = (qx, qy) => [(qx - 1496) * QM, (qy - 1781) * QM];
export const satRect = (x0, y0, x1, y1) => [...sat(x0, y0), ...sat(x1, y1)];

// point-in-polygon for [x,z] lists
function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function buildExterior(scene, world, info, T, M) {
  const B = new Batches();
  const R = rng(90);
  const avoid = info.blockRects.map((b) => [b.r[0] - 7, b.r[1] - 7, b.r[2] + 7, b.r[3] + 7]);
  const mapShapes = []; // for the 2D map: {kind, pts|r, color, width}
  const areas = []; // named outdoor places for the location readout, first match wins
  const paved = []; // [a, b, halfWidth] road and path segments, kept clear of trees

  // ------------------------------------------------------------------ helpers
  const up = [0, 1, 0];
  const triUp = (bb, a, b, c, y, color = WHITE) => {
    // orient CCW when seen from above
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const [p, q] = cross > 0 ? [c, b] : [b, c];
    bb.quad([[a[0], y, a[1]], [p[0], y, p[1]], [q[0], y, q[1]], [q[0], y, q[1]]], up, [[a[0], -a[1]], [p[0], -p[1]], [q[0], -q[1]], [q[0], -q[1]]], color);
  };
  const disc = (bb, cx, cz, r, y, color = WHITE, n = 20) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      triUp(bb, [cx, cz], [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r], y, color);
    }
  };
  // polyline strip in world coords
  const strip = (bb, pts, w, y, color = WHITE, joins = true) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * (w / 2), nz = (dx / L) * (w / 2);
      bb.quad([[ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz]], up,
        [[ax + nx, -(az + nz)], [bx + nx, -(bz + nz)], [bx - nx, -(bz - nz)], [ax - nx, -(az - nz)]], color);
      if (joins && i > 0) disc(bb, ax, az, w / 2, y, color, 16);
    }
  };
  const flat = (key, r, y, color = WHITE) => B.get(key).hquad(r[0], r[1], r[2], r[3], y, true, color);
  const road = (satPts, w, { center = false, edges = false, y = 0.03 } = {}) => {
    const pts = satPts.map(([sx, sy]) => sat(sx, sy));
    for (let i = 1; i < pts.length; i++) paved.push([pts[i - 1], pts[i], w / 2]);
    strip(B.get('asphalt'), pts, w, y);
    mapShapes.push({ kind: 'line', pts, width: w, color: '#5b5e62' });
    if (edges)
      for (const s of [-1, 1]) {
        const off = pts.map((p, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
          return [p[0] + (-dz / L) * (w / 2 - 0.35) * s, p[1] + (dx / L) * (w / 2 - 0.35) * s];
        });
        strip(B.get('decal'), off, 0.12, y + 0.012, C('#e8e8e2'), false);
      }
    if (center) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        for (let t = 0; t < L - 3; t += 9) {
          const u0 = t / L, u1 = (t + 3.5) / L;
          strip(B.get('decal'), [[ax + (bx - ax) * u0, az + (bz - az) * u0], [ax + (bx - ax) * u1, az + (bz - az) * u1]], 0.14, y + 0.012, C('#e7c34a'), false);
        }
      }
    }
    return pts;
  };
  const walk = (satPts, w = 2.4) => {
    const pts = satPts.map(([sx, sy]) => sat(sx, sy));
    for (let i = 1; i < pts.length; i++) paved.push([pts[i - 1], pts[i], w / 2]);
    strip(B.get('walk'), pts, w, 0.045, C('#d9d5cb'));
    mapShapes.push({ kind: 'line', pts, width: w, color: '#cfcac0' });
  };
  const box = (key, x0, y0, z0, x1, y1, z1, color = WHITE, collide = true, tag = 20) => {
    B.get(key).box(x0, y0, z0, x1, y1, z1, color);
    if (collide) world.add(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), tag);
  };

  // ------------------------------------------------------------------ ground
  for (const r of subtractRects([[-420, -330, 560, 360]], [info.house])) B.get('grass').hquad(r[0], r[1], r[2], r[3], 0, true);

  // ------------------------------------------------------------------ roads
  const GMR = 2368;
  road([[200, GMR], [3900, GMR]], 15, { center: true, edges: true });
  mapShapes.push({ kind: 'label', at: sat(1100, GMR), text: 'GROVERS MILL ROAD', color: '#ffffff' });
  // west drive (from the road to the west lot) and its continuation south to High School North
  road([[1256, 2200], [1256, GMR]], 7.5);
  road([[1256, GMR], [1256, 2760]], 8);
  // ring road: north of the building, past the courts and the fields, round the 300s and the
  // 700s, then south as the east entrance road
  road([[1250, 1712], [1800, 1712], [2100, 1700], [2300, 1662], [2380, 1680], [2450, 1760], [2520, 1860], [2600, 1940], [2700, 1975], [2770, 2020], [2790, 2100], [2790, GMR]], 7);
  road([[2790, GMR], [2790, 2760]], 8);
  // visitor loop in front of the main entrance and the drive along the 900s
  road([[1717, GMR], [1717, 2205], [1737, 2185], [1980, 2185], [2005, 2210], [2005, 2262], [2028, 2283], [2420, 2283], [2440, 2305], [2440, GMR]], 7);

  // ------------------------------------------------------------------ parking
  const lots = [];
  const lotPlane = (r, aislesAlongZ) => {
    const lx = r[2] - r[0], lz = r[3] - r[1];
    const tex = makeParkingTexture();
    const g = new THREE.PlaneGeometry(aislesAlongZ ? lz : lx, aislesAlongZ ? lx : lz);
    g.rotateX(-Math.PI / 2);
    if (aislesAlongZ) g.rotateY(Math.PI / 2);
    tex.repeat.set((aislesAlongZ ? lz : lx) / 27, (aislesAlongZ ? lx : lz) / 18);
    const mesh = new THREE.Mesh(g, offset(new THREE.MeshStandardMaterial({ map: tex, normalMap: T.asphaltN, roughness: 0.8 }), -2));
    mesh.position.set((r[0] + r[2]) / 2, 0.035, (r[1] + r[3]) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
    lots.push(r);
    mapShapes.push({ kind: 'rect', r, color: '#5b5e62' });
    B.get('concrete').box(r[0] - 0.3, 0, r[1] - 0.3, r[2] + 0.3, 0.12, r[1], C('#cfcac0'), 'Yzx');
    B.get('concrete').box(r[0] - 0.3, 0, r[3], r[2] + 0.3, 0.12, r[3] + 0.3, C('#cfcac0'), 'YZx');
  };
  // the west lot: rows run east-west, five bands of 18 m
  const [wlx0, wlz0] = sat(975, 1825);
  const westLot = [wlx0, wlz0, wlx0 + 108, wlz0 + 5 * 18];
  lotPlane(westLot, false);
  areas.push({ name: 'West Parking Lot', r: westLot });
  mapShapes.push({ kind: 'label', at: [(westLot[0] + westLot[2]) / 2, (westLot[1] + westLot[3]) / 2], text: 'PARKING', color: '#ffffff', size: 6 });
  // the visitor lot inside the loop
  const loopLot = [...sat(1740, 2196), ...sat(1962, 2196).slice(0, 1), sat(0, 2196)[1] + 18];
  lotPlane(loopLot, false);
  areas.push({ name: 'Visitor Lot', r: loopLot });
  // north asphalt: the four-square of basketball courts and the drive past them
  const courtPad = satRect(1240, 1690, 1745, 1800);
  flat('asphalt', courtPad, 0.03);
  mapShapes.push({ kind: 'rect', r: courtPad, color: '#5b5e62' });
  const courts = [];
  {
    const line = C('#f2f2ee');
    const ln = (x0, z0, x1, z1) => B.get('decal').hquad(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), 0.05, true, line);
    for (const qx of [1305, 1430, 1555]) {
      const [x0, z0] = sat(qx, 1722), [x1, z1] = sat(qx + 115, 1795);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      courts.push([cx, cz]);
      ln(x0, z0, x1, z0 + 0.06); ln(x0, z1 - 0.06, x1, z1); ln(x0, z0, x0 + 0.06, z1); ln(x1 - 0.06, z0, x1, z1); ln(cx - 0.03, z0, cx + 0.03, z1);
      for (const s of [-1, 1]) {
        const bx = s < 0 ? x0 : x1;
        ln(Math.min(bx, bx - s * 5.8), cz - 2.45, Math.max(bx, bx - s * 5.8), cz - 2.39); ln(Math.min(bx, bx - s * 5.8), cz + 2.39, Math.max(bx, bx - s * 5.8), cz + 2.45);
        ln(bx - s * 5.8 - 0.03, cz - 2.45, bx - s * 5.8 + 0.03, cz + 2.45);
        // hoop on a post
        const hx = bx - s * 1.2;
        box('metal', hx - s * 0.9 - 0.08, 0, cz - 0.08, hx - s * 0.9 + 0.08, 3.2, cz + 0.08, WHITE, true);
        box('satin', hx - 0.03, 2.9, cz - 0.9, hx + 0.03, 3.95, cz + 0.9, C('#f4f4f4'), false);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20), new THREE.MeshStandardMaterial({ color: '#e05a1c', metalness: 0.6, roughness: 0.35 }));
        rim.rotation.x = Math.PI / 2;
        rim.position.set(hx + s * 0.38, 3.05, cz);
        scene.add(rim);
      }
      mapShapes.push({ kind: 'rect', r: [x0, z0, x1, z1], color: '#4f5458' });
    }
    areas.push({ name: 'Basketball Courts', r: courtPad });
  }
  // the northeast lots, turned with the road
  const polyLot = (qpts, angle) => {
    const pts = qpts.map(([a, b]) => sat(a, b));
    const g = new GeoBuilder();
    for (let i = 1; i < pts.length - 1; i++) triUp(g, pts[0], pts[i], pts[i + 1], 0.034);
    const mesh = new THREE.Mesh(g.build(), offset(M.asphalt.clone(), -2));
    mesh.receiveShadow = true;
    scene.add(mesh);
    mapShapes.push({ kind: 'poly', pts, color: '#5b5e62', above: true });
    // parked cars in rows across the lot
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    for (let u = -60; u < 60; u += 18)
      for (let v = -60; v < 60; v += 2.7)
        for (const du of [2.75, 15.25]) {
          const lu = u + du;
          const x = cx + lu * ca - v * sa, z = cz + lu * sa + v * ca;
          if (inPoly(pts, x, z) && inPoly(pts, x + ca * 2.3, z + sa * 2.3) && inPoly(pts, x - ca * 2.3, z - sa * 2.3) && R() < 0.5) cars.push({ x, z, rot: -angle + (du < 9 ? Math.PI / 2 : -Math.PI / 2) });
        }
    return pts;
  };
  const cars = [];
  const neLotA = polyLot([[2345, 1625], [2430, 1485], [2510, 1500], [2600, 1590], [2510, 1735], [2440, 1745]], 0.98);
  const neLotB = polyLot([[2490, 1345], [2560, 1295], [2640, 1330], [2700, 1420], [2650, 1510], [2580, 1510]], 0.98);
  areas.push({ name: 'Upper Parking Lot', poly: neLotA }, { name: 'Upper Parking Lot', poly: neLotB });
  // High School North's bus lot across the road
  const hsnLot = satRect(1400, 2585, 2520, 2700);
  flat('asphalt', hsnLot, 0.03);
  mapShapes.push({ kind: 'rect', r: hsnLot, color: '#5b5e62' });

  // cars
  const carColors = ['#b8322a', '#2c3e50', '#ecf0f1', '#7f8c8d', '#1f4e79', '#111111', '#9b8b6a', '#d5d8dc', '#5e3c6e', '#2f6b45', '#a7a9ac', '#243b5e'];
  const boxCars = [];
  const fillLot = (r, bands, stalls, p) => {
    for (let b = 0; b < bands; b++) {
      const z0 = r[1] + b * 18;
      for (let k = 0; k < stalls; k++) {
        const x = r[0] + 1.35 + k * 2.7;
        if (R() < p) cars.push({ x, z: z0 + 2.75, rot: 0 });
        if (R() < p) cars.push({ x, z: z0 + 18 - 2.75, rot: Math.PI });
      }
    }
  };
  fillLot(westLot, 5, 40, 0.45);
  fillLot(loopLot, 1, Math.floor((loopLot[2] - loopLot[0]) / 2.7), 0.6);
  for (let i = 0; i < 3; i++) { const [x, z] = sat(1620 + i * 26, 1755); cars.push({ x, z, rot: Math.PI / 2, truck: true }); }
  {
    const body = new THREE.BoxGeometry(1.8, 0.65, 4.5);
    body.translate(0, 0.6, 0);
    const cabin = new THREE.BoxGeometry(1.6, 0.55, 2.3);
    cabin.translate(0, 1.2, -0.2);
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 1.86, 14);
    wheel.rotateZ(Math.PI / 2);
    const bodyM = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.55 }), cars.length);
    const cabM = new THREE.InstancedMesh(cabin, new THREE.MeshStandardMaterial({ color: '#1b2530', roughness: 0.05, metalness: 0.4, envMapIntensity: 1.6 }), cars.length);
    const wheelM = new THREE.InstancedMesh(wheel, new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.8 }), cars.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), upv = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    cars.forEach((c, i) => {
      q.setFromAxisAngle(upv, c.rot);
      s.set(c.truck ? 1.2 : 1, c.truck ? 1.3 : 1, c.truck ? 1.3 : 1);
      m.compose(new THREE.Vector3(c.x, 0, c.z), q, s);
      bodyM.setMatrixAt(i, m);
      bodyM.setColorAt(i, col.set(c.truck ? '#f2f2f0' : carColors[Math.floor(R() * carColors.length)]));
      cabM.setMatrixAt(i, m);
      for (let k = 0; k < 2; k++) {
        const off = new THREE.Vector3(0, 0.34, k ? 1.4 : -1.4).applyQuaternion(q);
        m.compose(new THREE.Vector3(c.x + off.x, off.y, c.z + off.z), q, s);
        wheelM.setMatrixAt(i * 2 + k, m);
      }
      const sn = Math.abs(Math.sin(c.rot)), cs = Math.abs(Math.cos(c.rot));
      const hx = 0.95 * cs + 2.25 * sn, hz = 0.95 * sn + 2.25 * cs;
      world.add(c.x - hx, 0, c.z - hz, c.x + hx, 1.5, c.z + hz, 20);
    });
    for (const im of [bodyM, cabM, wheelM]) {
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
    }
    boxCars.push(bodyM, cabM, wheelM);
  }
  // school buses along the drive by the 900s, and in the High School North lot
  {
    const buses = [];
    for (let i = 0; i < 5; i++) { const [x, z] = sat(2080 + i * 62, 2283); buses.push({ x, z, rot: Math.PI / 2 }); }
    for (let i = 0; i < 10; i++) { const [x, z] = sat(2250 + i * 22, 2640); buses.push({ x, z, rot: 0 }); }
    const g = new GeoBuilder();
    const Y = C('#f2b705'), K = C('#1a1a1a'), Wd = C('#22303b');
    g.box(-1.25, 0.45, -5.9, 1.25, 3.0, 5.9, Y);
    g.box(-1.26, 1.7, -5.3, 1.26, 2.45, 5.2, Wd);
    g.box(-1.27, 1.05, -5.9, 1.27, 1.2, 5.9, K);
    g.box(-1.22, 0.45, -6.5, 1.22, 1.6, -5.9, Y);
    g.box(-1.1, 0.0, -5.0, 1.1, 0.45, -3.6, K);
    g.box(-1.1, 0.0, 2.8, 1.1, 0.45, 4.6, K);
    const im = new THREE.InstancedMesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 }), buses.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), upv = new THREE.Vector3(0, 1, 0);
    buses.forEach((b, i) => {
      q.setFromAxisAngle(upv, b.rot);
      m4.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4);
      const cs = Math.abs(Math.cos(b.rot)), sn = Math.abs(Math.sin(b.rot));
      const hx = 1.3 * cs + 6.5 * sn, hz = 1.3 * sn + 6.5 * cs;
      world.add(b.x - hx, 0, b.z - hz, b.x + hx, 3, b.z + hz, 20);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  }
  // lot light poles
  for (const r of [westLot])
    for (let x = r[0] + 18; x < r[2] - 1; x += 36)
      for (let z = r[1] + 9; z < r[3] - 5; z += 36) {
        box('metal', x - 0.12, 0, z - 0.12, x + 0.12, 9, z + 0.12, WHITE, true);
        box('frame', x - 0.9, 9, z - 0.3, x + 0.9, 9.25, z + 0.3, WHITE, false);
        B.get('light').hquad(x - 0.8, z - 0.25, x + 0.8, z + 0.25, 8.99, false);
      }

  // ------------------------------------------------------------------ walks
  // a sidewalk ring around the building (it shows as a light band on the satellite view)
  {
    const pad = 2.2;
    for (const { r } of info.blockRects) {
      for (const fr of subtractRects([[r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad]], [...info.blockRects.map((b) => b.r), ...info.courtyards.slice(1)])) {
        if (fr[2] - fr[0] < 0.05 || fr[3] - fr[1] < 0.05) continue;
        flat('walk', fr, 0.04, C('#d9d5cb'));
      }
    }
  }
  walk([[1688, 2120], [1688, 2340]], 3.6); // front walk from the plaza to the road
  walk([[1658, 1690], [1658, 1560]], 2.4); // north door up to the fields
  walk([[1960, 1693], [2150, 1688], [2330, 1700], [2420, 1790], [2445, 1830]], 2.2);
  walk([[2445, 1830], [2630, 1800], [2690, 1745]], 2.4);
  walk([[2630, 1800], [2700, 1890]], 2.4);
  walk([[2460, 1880], [2470, 2080], [2440, 2200]], 2.0);
  walk([[1100, 2330], [2770, 2330]], 1.8); // along the north side of Grovers Mill Road

  // ------------------------------------------------------------------ front plaza, flagpole, sign
  const cn = info.canopy;
  const plaza = [cn.x0 - 4, cn.z1, cn.x1 + 4, cn.z1 + 12];
  flat('walk', plaza, 0.05, C('#dcd8cf'));
  mapShapes.push({ kind: 'rect', r: plaza, color: '#d6d1c6' });
  mapShapes.push(...cn.rects.map((r) => ({ kind: 'rect', r, color: '#d6d1c6' })));
  avoid.push([plaza[0] - 2, plaza[1] - 2, plaza[2] + 2, plaza[3] + 2]);
  areas.push({ name: 'Front Entrance', r: [plaza[0] - 4, plaza[1] - 6, plaza[2] + 4, plaza[3] + 4] });
  const fpX = (cn.x0 + cn.x1) / 2 + 1.2, fpZ = cn.z1 + 4.5;
  box('metal', fpX - 0.08, 0, fpZ - 0.08, fpX + 0.08, 12, fpZ + 0.08, WHITE, true);
  const flag = makeFlag();
  flag.position.set(fpX + 0.06, 10.6, fpZ);
  scene.add(flag);
  {
    // monument sign between two banded brick piers, as in the photo
    const sx = (cn.x0 + cn.x1) / 2, sz = fpZ + 1.6;
    for (const px of [sx - 2.0, sx + 2.0]) {
      B.get('facade').box(px - 0.4, 0, sz - 0.4, px + 0.4, 1.35, sz + 0.4);
      B.get('redband').box(px - 0.41, 0.5, sz - 0.41, px + 0.41, 0.7, sz + 0.41, WHITE, 'xXzZ');
      B.get('paint').box(px - 0.45, 1.35, sz - 0.45, px + 0.45, 1.45, sz + 0.45, C('#d6d1c4'));
      world.add(px - 0.45, 0, sz - 0.45, px + 0.45, 1.45, sz + 0.45, 20);
    }
    B.get('paint').box(sx - 1.6, 0.3, sz - 0.12, sx + 1.6, 1.15, sz + 0.12, C('#3a3330'));
    world.add(sx - 1.6, 0, sz - 0.12, sx + 1.6, 1.15, sz + 0.12, 20);
    const tex = textTexture([
      { text: 'WELCOME TO', size: 0.12, weight: 'normal' },
      { text: 'COMMUNITY MIDDLE SCHOOL', size: 0.2 },
      { text: "VISITOR'S ENTRANCE  →", size: 0.12, weight: 'normal' },
    ], { w: 1024, h: 280, bg: '#2a2422', fg: '#f3e6c8', border: false });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 });
    for (const sgn of [-1, 1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.8), mat);
      pl.position.set(sx, 0.73, sz + sgn * 0.125);
      if (sgn < 0) pl.rotation.y = Math.PI;
      scene.add(pl);
    }
  }

  // ------------------------------------------------------------------ fields
  const fields = satRect(1250, 820, 2650, 1600);
  {
    const tex = makeFieldsTexture();
    const g = new THREE.PlaneGeometry(fields[2] - fields[0], fields[3] - fields[1]);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, offset(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, normalMap: T.grassN }), -1));
    m.position.set((fields[0] + fields[2]) / 2, 0.02, (fields[1] + fields[3]) / 2);
    m.receiveShadow = true;
    scene.add(m);
    mapShapes.push({ kind: 'fields', r: fields, tex });
    mapShapes.push({ kind: 'label', at: sat(1950, 1150), text: 'FIELDS', color: '#ffffff', size: 7 });
    const backstop = (qx, qy, ang) => {
      const [x, z] = sat(qx, qy);
      const mat = new THREE.MeshStandardMaterial({ color: '#2b3431', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
      const arc = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 4.5, 16, 1, true, 0, Math.PI * 0.6), mat);
      arc.rotation.y = ang;
      arc.position.set(x, 2.25, z);
      scene.add(arc);
      world.add(x - 2, 0, z - 2, x + 2, 4.5, z + 2, 24);
    };
    backstop(1462, 1522, Math.PI * 0.95); // baseball: home plate at the southwest corner
    backstop(2275, 1550, Math.PI * 0.2); // softball: home plate at the south end
    for (const [qx, qy] of [[1430, 1460], [1540, 1545]]) { const [x, z] = sat(qx, qy); box('satin', x - 3, 0, z - 0.6, x + 3, 0.45, z + 0.6, C('#6f757b'), true, 24); }
    areas.push({ name: 'Baseball Field', r: satRect(1440, 1250, 1720, 1530) });
    areas.push({ name: 'Softball Field', r: satRect(2180, 1360, 2380, 1560) });
    areas.push({ name: 'Fields', r: fields });
    // soccer goals at the ends of the center field
    const goal = (qx, qy, facing) => {
      const [x, z] = sat(qx, qy);
      const w = 3.66, h = 2.44, wc = C('#f4f4f4');
      box('satin', x - w - 0.06, 0, z - 0.06, x - w + 0.06, h, z + 0.06, wc, true, 24);
      box('satin', x + w - 0.06, 0, z - 0.06, x + w + 0.06, h, z + 0.06, wc, true, 24);
      box('satin', x - w, h - 0.12, z - 0.06, x + w, h, z + 0.06, wc, false);
      box('satin', x - w, 0, z + facing * 1.8 - 0.04, x + w, 0.08, z + facing * 1.8 + 0.04, wc, false);
    };
    goal(1985, 905, -1);
    goal(1985, 1445, 1);
  }
  // sand court west of the baseball field
  { const r = satRect(1325, 1225, 1400, 1292); flat('decal', r, 0.04, C('#d8c8a0')); mapShapes.push({ kind: 'rect', r, color: '#d8c8a0' }); }

  // ------------------------------------------------------------------ neighbors (stand-ins)
  const standIn = (qr, h, wallKey, roofCol, label, signText, signSide) => {
    const r = satRect(...qr);
    box(wallKey, r[0], 0, r[1], r[2], h, r[3]);
    box('roof', r[0] + 0.2, h - 0.2, r[1] + 0.2, r[2] - 0.2, h, r[3] - 0.2, C(roofCol), false);
    mapShapes.push({ kind: 'rect', r, color: '#b9b2a4' });
    mapShapes.push({ kind: 'label', at: [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], text: label, color: '#3a3530', size: 5 });
    avoid.push([r[0] - 5, r[1] - 5, r[2] + 5, r[3] + 5]);
    areas.push({ name: label.replace(/\b\w/g, (c) => c).split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' '), r: [r[0] - 15, r[1] - 15, r[2] + 15, r[3] + 15] });
    if (signText) {
      const t = textTexture([{ text: signText, size: 0.62 }], { w: 1400, h: 150, bg: '#2b3440', fg: '#ffffff', border: false });
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.5), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
      if (signSide === 'N') { sgn.position.set((r[0] + r[2]) / 2, h - 2.2, r[1] - 0.05); sgn.rotation.y = Math.PI; } else { sgn.position.set(r[0] - 0.05, h - 2.2, (r[1] + r[3]) / 2); sgn.rotation.y = -Math.PI / 2; }
      scene.add(sgn);
    }
    return r;
  };
  // Millstone River School, east of the upper lots (a cluster of two-story wings)
  standIn([2660, 1560, 2860, 1900], 8.5, 'facade', '#6a4e3c', 'MILLSTONE RIVER SCHOOL', 'MILLSTONE RIVER SCHOOL', 'W');
  standIn([2860, 1420, 3080, 1700], 8.5, 'facade', '#6a4e3c', 'MILLSTONE RIVER SCHOOL', null);
  standIn([2860, 1700, 3200, 1840], 8.5, 'facade', '#6a4e3c', 'MILLSTONE RIVER SCHOOL', null);
  // High School North across Grovers Mill Road
  standIn([1270, 2740, 2030, 3080], 9.0, 'brick', '#e8e8e4', 'HIGH SCHOOL NORTH', 'WEST WINDSOR-PLAINSBORO HIGH SCHOOL NORTH', 'N');
  // houses along Cora Lane, west of the campus
  for (const [qx, qy] of [[870, 1260], [840, 1420], [850, 1980], [820, 2120]]) {
    const [x, z] = sat(qx, qy);
    box('paint', x - 5, 0, z - 6, x + 5, 5, z + 6, C('#e2dccd'));
    box('roof', x - 5.3, 5, z - 6.3, x + 5.3, 5.4, z + 6.3, C('#5a4a3f'), false);
  }

  // ------------------------------------------------------------------ trees
  const woods = [[200, 300], [3900, 300], [3900, 1000], [2900, 1150], [2650, 1250], [2450, 980], [2250, 820], [1250, 760], [1150, 1000], [1100, 1600], [1000, 1700], [200, 1700]].map(([a, b]) => sat(a, b));
  mapShapes.push({ kind: 'poly', pts: woods, color: '#3e6b35' });
  const trees = [];
  const treeMeshes = [];
  const blocked = (x, z) => avoid.some((r) => inRect(r, x, z)) || lots.some((r) => inRect(r, x, z, 3)) || inRect(courtPad, x, z, 3) || inRect(fields, x, z, -4) ||
    paved.some(([a, b, hw]) => segDist(x, z, a, b) < hw + 2.2) || info.blockRects.some((b) => inRect(b.r, x, z, 6)) || inPoly(neLotA, x, z) || inPoly(neLotB, x, z) || inRect(hsnLot, x, z, 3);
  const tryTree = (x, z, s = 1, kind = null) => {
    if (blocked(x, z)) return false;
    trees.push({ x, z, s, h: 0.8 + R() * 0.6, kind: kind ?? (R() < 0.2 ? 1 : 0) });
    return true;
  };
  {
    const xs = woods.map((p) => p[0]), zs = woods.map((p) => p[1]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 9)
      for (let z = Math.min(...zs); z < Math.max(...zs); z += 9) {
        const px = x + (R() - 0.5) * 6, pz = z + (R() - 0.5) * 6;
        if (inPoly(woods, px, pz)) tryTree(px, pz, 1.1 + R() * 0.5, R() < 0.25 ? 1 : 0);
      }
  }
  // the double row of trees along the south side of Grovers Mill Road, and clusters
  for (let qx = 1300; qx < 2700; qx += 30) for (const qy of [2425, 2470]) { const [x, z] = sat(qx + R() * 12, qy + R() * 10); tryTree(x, z, 0.9 + R() * 0.3); }
  const clusters = [[1100, 2290, 10], [2500, 2150, 14], [2620, 2050, 10], [2380, 1580, 3], [1560, 1640, 3], [2150, 2470, 6], [3000, 2100, 12], [1180, 1560, 8], [2700, 2250, 10]];
  for (const [qx, qy, n] of clusters) for (let i = 0; i < n; i++) { const [x, z] = sat(qx + (R() - 0.5) * 140, qy + (R() - 0.5) * 80); tryTree(x, z, 0.8 + R() * 0.4); }
  {
    const trunk = new THREE.CylinderGeometry(0.18, 0.3, 3.2, 7);
    trunk.translate(0, 1.6, 0);
    const leafy = new THREE.IcosahedronGeometry(2.7, 1);
    const pos = leafy.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const k = 1 + Math.sin(v.x * 3.1 + v.z * 2.3) * 0.12 + Math.cos(v.y * 2.7) * 0.1;
      pos.setXYZ(i, v.x * k, v.y * k * 0.9, v.z * k);
    }
    leafy.computeVertexNormals();
    leafy.translate(0, 4.8, 0);
    const pine = new THREE.ConeGeometry(2.3, 6.8, 9);
    pine.translate(0, 5.1, 0);
    const trunkM = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#56402f', roughness: 0.95 }), trees.length);
    const leafM = new THREE.InstancedMesh(leafy, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), trees.length);
    const pineM = new THREE.InstancedMesh(pine, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), trees.length);
    let nl = 0, np = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), upv = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(upv, R() * 6.28);
      const k = t.s * t.h * 1.15;
      sc.set(k, k * (0.9 + R() * 0.3), k);
      m.compose(new THREE.Vector3(t.x, 0, t.z), q, sc);
      trunkM.setMatrixAt(i, m);
      if (t.kind === 1) {
        pineM.setMatrixAt(np, m);
        pineM.setColorAt(np++, col.setHSL(0.33 + R() * 0.05, 0.42, 0.18 + R() * 0.07));
      } else {
        leafM.setMatrixAt(nl, m);
        leafM.setColorAt(nl++, col.setHSL(0.2 + R() * 0.1, 0.42 + R() * 0.2, 0.24 + R() * 0.1));
      }
      world.add(t.x - 0.32 * k, 0, t.z - 0.32 * k, t.x + 0.32 * k, 3.2 * k, t.z + 0.32 * k, 24);
    });
    leafM.count = nl;
    pineM.count = np;
    for (const im of [trunkM, leafM, pineM]) {
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
    }
    treeMeshes.push(trunkM, leafM, pineM);
  }
  // ground-level layers are coplanar-ish, so push them apart in depth instead of in height
  const EM = { ...M, grass: offset(M.grass.clone(), 2), asphalt: offset(M.asphalt.clone(), -1), walk: offset(M.concrete.clone(), -2), decal: offset(M.paint.clone(), -3) };
  for (const m of B.toMeshes(EM)) scene.add(m);

  areas.push({ name: 'Woods', poly: woods });
  areas.push({ name: 'Grovers Mill Road', r: [-1e4, sat(0, GMR - 18)[1], 1e4, sat(0, GMR + 18)[1]] });
  areas.push({ name: 'Visitor Loop', r: satRect(1700, 2170, 2020, 2300) });
  const areaAt = (x, z) => areas.find((a) => (a.r ? inRect(a.r, x, z) : inPoly(a.poly, x, z)))?.name || 'Campus Grounds';

  const spawn = [(cn.x0 + cn.x1) / 2 - 1.5, cn.z1 + 3.0];
  const place = (name, sub, qx, qy, yaw) => ({ name, sub, p: [...sat(qx, qy)].reduce((a, v, i) => (i ? [a[0], 0, v] : [v]), []), yaw });
  const places = [
    place('Basketball courts', 'North of the gym wing', 1490, 1758, -Math.PI / 2),
    place('Baseball field', 'Home plate', 1480, 1500, -Math.PI / 4),
    place('Softball field', 'Home plate', 2275, 1520, 0),
    place('Fields', 'Center of the big field', 1985, 1180, 0),
    place('West parking lot', 'By the gym', 1200, 2000, -Math.PI / 2),
    place('Visitor loop', 'In front of the main entrance', 1850, 2178, Math.PI),
    place('Grovers Mill Road', 'Crosswalk at the front walk', 1688, 2348, 0),
    place('Millstone River School', 'Next door', 2620, 1800, -Math.PI / 2),
    place('High School North', 'Across the road', 1650, 2720, Math.PI),
  ];
  const soccer = [sat(1985, 1150), sat(1940, 1300)];
  const football = sat(2060, 1050);
  return { flag, flagPos: [fpX, fpZ], lots: { westLot, loopLot }, mapShapes, woods, areaAt, spawn, cars, boxCars, trees, treeMeshes, places, soccer, football, courts };
}

// The fields north of the school, drawn in Q pixels (x 1250..2650, y 820..1600): the walking
// trail, the soccer field inside it, the baseball diamond (home plate at the southwest corner)
// and the softball diamond (home plate at the south).
function makeFieldsTexture() {
  const k = 1.4, X0 = 1250, Y0 = 820;
  const W = Math.round(1400 * k), H = Math.round(780 * k);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const X = (qx) => (qx - X0) * k, Y = (qy) => (qy - Y0) * k;
  const r = rng(5);
  g.fillStyle = '#6a9a45';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${60 + r() * 70},${100 + r() * 60},${40 + r() * 30},0.13)`;
    g.beginPath();
    g.arc(r() * W, r() * H, 10 + r() * 60, 0, Math.PI * 2);
    g.fill();
  }
  const line = (lw = 2.2) => { g.strokeStyle = 'rgba(250,250,245,0.9)'; g.lineWidth = lw; };
  // walking trail (packed dirt) around the big field
  g.strokeStyle = 'rgba(196,182,150,0.85)';
  g.lineWidth = 2.2 * k;
  g.beginPath();
  for (const [qx, qy, i] of [[2020, 842], [2150, 1000], [2150, 1440], [2020, 1530], [1930, 1530], [1820, 1420], [1820, 990], [1930, 842]].map((p, i) => [...p, i])) i ? g.lineTo(X(qx), Y(qy)) : g.moveTo(X(qx), Y(qy));
  g.closePath();
  g.stroke();
  // soccer field
  {
    const x0 = 1880, x1 = 2090, y0 = 905, y1 = 1445;
    for (let i = 0; Y(y0) + i * 10 * k < Y(y1); i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(X(x0), Y(y0) + i * 10 * k, X(x1) - X(x0), 10 * k); }
    line();
    g.strokeRect(X(x0), Y(y0), X(x1) - X(x0), Y(y1) - Y(y0));
    const cx = (X(x0) + X(x1)) / 2, cy = (Y(y0) + Y(y1)) / 2;
    g.beginPath(); g.moveTo(X(x0), cy); g.lineTo(X(x1), cy); g.stroke();
    g.beginPath(); g.arc(cx, cy, 40 * k, 0, Math.PI * 2); g.stroke();
    const bw = 176 * k, bd = 72 * k;
    g.strokeRect(cx - bw / 2, Y(y0), bw, bd);
    g.strokeRect(cx - bw / 2, Y(y1) - bd, bw, bd);
  }
  // diamonds: dirt infield arc, grass square, foul lines, bases
  const diamond = (hx, hy, dir, base, arc) => {
    const a0 = dir - Math.PI / 4, a1 = dir + Math.PI / 4;
    g.fillStyle = '#c9a27a';
    g.beginPath();
    g.moveTo(X(hx), Y(hy));
    g.arc(X(hx), Y(hy), arc * k, a0, a1);
    g.closePath();
    g.fill();
    // infield grass
    const p = (a, d) => [X(hx) + Math.cos(a) * d * k, Y(hy) + Math.sin(a) * d * k];
    g.fillStyle = '#5f9040';
    g.beginPath();
    const s = base * 0.86;
    g.moveTo(...p(dir, 6));
    g.lineTo(...p(a0 + 0.12, s));
    g.lineTo(...p(dir, s * 1.38));
    g.lineTo(...p(a1 - 0.12, s));
    g.closePath();
    g.fill();
    line(2);
    for (const a of [a0, a1]) { g.beginPath(); g.moveTo(X(hx), Y(hy)); g.lineTo(...p(a, arc * 2.2)); g.stroke(); }
    g.fillStyle = '#b48c62';
    g.beginPath(); g.arc(...p(dir, base * 0.71), 4 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    for (const [a, d] of [[dir, 0], [a0, base], [a1, base], [dir, base * 1.414]]) { const [x, y] = p(a, d); g.fillRect(x - 3, y - 3, 6, 6); }
  };
  diamond(1475, 1508, -Math.PI / 4, 120, 175); // baseball: 90 ft bases
  diamond(2275, 1533, -Math.PI / 2, 80, 95); // softball: 60 ft bases
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Swaps the box stand-in cars for Kenney's Car Kit models (CC0, assets/models/cars), one
// instanced mesh per model. The low-poly kit is chunky, so it is stretched to real proportions.
export async function loadCars(scene, ext, base = 'assets/models/cars/') {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const loader = new GLTFLoader();
  const everyday = ['sedan', 'sedan-sports', 'suv', 'suv-luxury', 'hatchback-sports', 'van'];
  const protos = {};
  await Promise.all([...everyday, 'truck', 'delivery'].map(async (t) => {
    const gltf = await loader.loadAsync(`${base}${t}.glb`);
    gltf.scene.updateMatrixWorld(true);
    const geos = [];
    let mat = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      geos.push(g.index ? g : g.toNonIndexed());
      mat = mat || o.material;
    });
    mat.roughness = 0.4;
    mat.metalness = 0.2;
    protos[t] = { geo: mergeGeometries(geos), mat };
  }));
  const R = rng(7);
  const groups = new Map();
  for (const c of ext.cars) {
    const t = c.truck ? (R() < 0.5 ? 'truck' : 'delivery') : everyday[Math.floor(R() * everyday.length)];
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(c);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1.3, 1.6, 1.8), truckScale = new THREE.Vector3(1.45, 1.8, 2.1);
  for (const [t, list] of groups) {
    const { geo, mat } = protos[t];
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((c, i) => {
      q.setFromAxisAngle(up, c.rot);
      m4.compose(new THREE.Vector3(c.x, 0, c.z), q, c.truck ? truckScale : scale);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
  }
  for (const m of ext.boxCars) m.visible = false;
}

// Swaps the low-poly trees for crossed billboards of Poly Haven tree models, pre-rendered in
// Blender (tools/bake/tree_sprites.py, assets/trees). Two sprite views per tree, at right
// angles; normals point up so they shade like foliage lit from above.
export async function loadTrees(scene, ext, base = 'assets/trees/') {
  const meta = await (await fetch(base + 'trees.json')).json();
  const tex = await new THREE.TextureLoader().loadAsync(base + 'trees.webp');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.6 });
  const rows = meta.rows;
  const cross = (row) => {
    const pos = [], nor = [], uv = [], idx = [];
    for (let k = 0; k < 2; k++) {
      const u0 = k / 2, u1 = (k + 1) / 2, v1 = 1 - row / rows, v0 = 1 - (row + 1) / rows;
      const corners = k === 0 ? [[-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0]] : [[0, 0, 0.5], [0, 0, -0.5], [0, 1, -0.5], [0, 1, 0.5]];
      const b = pos.length / 3;
      corners.forEach((c, i) => {
        pos.push(...c);
        nor.push(0, 1, 0);
        uv.push(i === 0 || i === 3 ? u0 : u1, i < 2 ? v0 : v1);
      });
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
  const R = rng(11);
  const groups = meta.trees.map(() => []);
  const fir = meta.trees.findIndex((t) => /fir|pine/.test(t.name));
  const broad = meta.trees.map((t, i) => i).filter((i) => i !== fir);
  for (const t of ext.trees) {
    const row = t.kind === 1 && fir >= 0 ? fir : broad[Math.floor(R() * broad.length)];
    groups[row].push(t);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  groups.forEach((list, row) => {
    if (!list.length) return;
    const info = meta.trees[row];
    const im = new THREE.InstancedMesh(cross(row), mat, list.length);
    list.forEach((t, i) => {
      // tall enough to read as campus shade trees: about 8-16 m
      const h = (row === fir ? 11 : 9.5) * t.s * t.h * 1.1;
      const k = h / info.height;
      q.setFromAxisAngle(up, R() * Math.PI);
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(info.span * k, info.span * k, info.span * k));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.setHSL(0.25 + (R() - 0.5) * 0.06, 0.25, 0.42 + R() * 0.12).lerp(new THREE.Color(1, 1, 1), 0.72));
    });
    im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
  });
  for (const m of ext.treeMeshes) m.visible = false;
}

function offset(mat, f) {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = f;
  mat.polygonOffsetUnits = f * 4;
  return mat;
}

function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
}

function makeFlag() {
  const c = document.createElement('canvas');
  c.width = 380;
  c.height = 200;
  const g = c.getContext('2d');
  for (let i = 0; i < 13; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#b22234';
    g.fillRect(0, (i * 200) / 13, 380, 200 / 13 + 1);
  }
  g.fillStyle = '#3c3b6e';
  g.fillRect(0, 0, 152, (7 * 200) / 13);
  g.fillStyle = '#ffffff';
  for (let r = 0; r < 9; r++)
    for (let k = 0; k < (r % 2 ? 5 : 6); k++) {
      g.beginPath();
      g.arc(12 + k * 25 + (r % 2 ? 12 : 0), 8 + r * 11.5, 3, 0, Math.PI * 2);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(2.8, 1.5, 16, 6);
  geo.translate(1.4, 0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
  mesh.castShadow = true;
  mesh.userData.base = geo.attributes.position.array.slice();
  mesh.userData.wave = (time) => {
    const p = geo.attributes.position, b = mesh.userData.base;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3];
      p.setZ(i, Math.sin(x * 2.2 - time * 4) * 0.18 * (x / 2.8));
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return mesh;
}
