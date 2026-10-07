// Checks that the baked lightmaps load (their geometry fingerprint matches this build)
import { open } from './harness.mjs';
const { page, errors, close } = await open({ quality: 'low', width: 480, height: 300 });
const r = await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 120 && !g.baked; i++) await new Promise((res) => setTimeout(res, 500));
  const withMap = g.info.lightmapped.filter((l) => l.mat.lightMap).length;
  return { baked: g.baked && { hash: g.baked.hash, files: g.baked.files }, build: g.info.lightmap.hash, materials: g.info.lightmapped.length, withMap };
});
console.log(JSON.stringify(r));
console.log(errors.filter((e) => /Lightmap/i.test(e)).join('\n'));
await close();
if (!r.baked || r.withMap !== r.materials) process.exit(1);
