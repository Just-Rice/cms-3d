// node tools/test/shots.mjs outDir [names...]: renders a set of named views
import fs from 'node:fs';
import { open } from './harness.mjs';
const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
const want = process.argv.slice(3);
const { page, errors, close } = await open({ quality: process.env.Q || 'low', width: +(process.env.W || 960), height: +(process.env.H || 540) });
await page.evaluate(() => window.__game.start());
await page.evaluate(() => window.__game.texturesReady);
const views = JSON.parse(fs.readFileSync(new URL('./views.json', import.meta.url)));
for (const v of views) {
  if (want.length && !want.includes(v.name)) continue;
  await page.evaluate((v) => {
    const g = window.__game;
    if (v.free) { g.teleport(v.player || [v.free[1][0], 0, v.free[1][2]]); g.freeCam(v.free[0], v.free[1]); }
    else { g.freeCam(null); g.view(v.p, v.yaw, v.pitch ?? -0.05, v.dist ?? null, v.fp ?? false); }
    if (v.fov) { g.camera.fov = v.fov; g.camera.updateProjectionMatrix(); }
  }, v);
  await page.waitForTimeout(v.wait || 2500);
  await page.screenshot({ path: `${out}/${v.name}.png`, timeout: 300000 });
  console.log('shot', v.name);
}
console.log(errors.filter((e) => !/404/.test(e)).slice(0, 20).join('\n'));
await close();
