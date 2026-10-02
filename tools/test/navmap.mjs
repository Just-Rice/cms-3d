// Draws the nav grid (blocked cells), room outlines and doors: node tools/test/navmap.mjs out.png level x0 z0 x1 z1 ppm
import fs from 'node:fs';
import { open } from './harness.mjs';
const [out, lv, x0, z0, x1, z1, ppm] = process.argv.slice(2);
const { page, close } = await open({ quality: 'low', width: 320, height: 200 });
const png = await page.evaluate(({ lv, x0, z0, x1, z1, ppm }) => {
  const g = window.__game, nav = g.nav, info = g.info;
  const W = Math.round((x1 - x0) * ppm), H = Math.round((z1 - z0) * ppm);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const X = (x) => (x - x0) * ppm, Z = (z) => (z - z0) * ppm;
  const bl = nav.blocked[lv];
  for (let z = z0; z < z1; z += 0.5) for (let x = x0; x < x1; x += 0.5) {
    const id = nav.idx(x + 0.25, z + 0.25);
    if (id < 0) continue;
    ctx.fillStyle = bl[id] ? '#555' : '#e8f4e0';
    ctx.fillRect(X(x), Z(z), 0.5 * ppm + 0.5, 0.5 * ppm + 0.5);
  }
  ctx.strokeStyle = 'rgba(0,0,255,0.6)'; ctx.lineWidth = 1;
  ctx.font = `${Math.max(8, ppm * 1.2)}px sans-serif`; ctx.fillStyle = '#c00';
  for (const r of info.rooms) {
    if (r.level !== lv) continue;
    ctx.strokeRect(X(r.R[0]), Z(r.R[1]), (r.R[2] - r.R[0]) * ppm, (r.R[3] - r.R[1]) * ppm);
    ctx.fillText((r.label || r.name).slice(0, 10), X(r.cx) - 10, Z(r.cz));
    for (const d of r.doorList) {
      ctx.strokeStyle = '#f0f'; ctx.lineWidth = 3;
      ctx.beginPath();
      if (d.axis === 'z') { ctx.moveTo(X(d.a), Z(d.c)); ctx.lineTo(X(d.b), Z(d.c)); } else { ctx.moveTo(X(d.c), Z(d.a)); ctx.lineTo(X(d.c), Z(d.b)); }
      ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,255,0.6)'; ctx.lineWidth = 1;
    }
  }
  return c.toDataURL('image/png');
}, { lv: +lv, x0: +x0, z0: +z0, x1: +x1, z1: +z1, ppm: +ppm });
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
await close();
