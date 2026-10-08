// Clean screenshot (no HUD, no player) from a free camera: node tools/test/card.mjs out.png '[pos]' '[target]' fov [w h]
import { open } from './harness.mjs';
const [out, pos, tgt, fov, w = 1600, h = 1000] = process.argv.slice(2);
const { page, close } = await open({ quality: process.env.Q || 'high', width: +w, height: +h });
await page.evaluate(() => window.__game.start());
await page.evaluate(() => window.__game.texturesReady);
await page.evaluate(({ pos, tgt, fov }) => {
  const g = window.__game;
  g.teleport([pos[0] + 2, 0, pos[2] + 2]);
  g.player.char.group.visible = false;
  g.freeCam(pos, tgt, [0, 1, 0], fov);
  document.querySelectorAll('.hud, #toast').forEach((e) => (e.style.display = 'none'));
}, { pos: JSON.parse(pos), tgt: JSON.parse(tgt), fov: +fov });
await page.waitForTimeout(8000);
await page.evaluate(() => { window.__game.player.char.group.visible = false; });
await page.screenshot({ path: out, timeout: 600000 });
await close();
