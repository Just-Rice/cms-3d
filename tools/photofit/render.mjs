// Renders the game from a fitted photo camera and writes render + overlay:
//   node tools/photofit/render.mjs camera.json photo.jpg out-prefix [width]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open } from '../test/harness.mjs';
const [camFile, photo, prefix, wArg] = process.argv.slice(2);
const cam = JSON.parse(fs.readFileSync(camFile));
const W = +(wArg || 960), H = Math.round((W * cam.size[1]) / cam.size[0]);
const { page, close } = await open({ quality: process.env.Q || 'medium', width: W, height: H });
await page.evaluate(() => window.__game.start());
await page.evaluate(() => window.__game.texturesReady);
await page.evaluate((c) => {
  const g = window.__game;
  g.teleport([c.pos[0] + 3, 0, c.pos[2] + 3]);
  g.player.char.group.visible = false;
  g.freeCam(c.pos, c.target, c.up, c.fov);
  const W = innerWidth, H = innerHeight;
  g.camera.setViewOffset(W, H, 0, (c.shiftV || 0) * H / 2, W, H);
  g.camera.updateProjectionMatrix();
  document.querySelectorAll('.hud').forEach((e) => (e.style.display = 'none'));
  window.__keepCam = c;
}, cam);
await page.waitForTimeout(6000);
await page.screenshot({ path: prefix + '_render.png', timeout: 300000 });
await close();
execFileSync('python3', ['-c', `
from PIL import Image
r=Image.open('${prefix}_render.png').convert('RGB'); p=Image.open('${photo}').convert('RGB').resize(r.size)
out=Image.new('RGB',(r.width*2,r.height*2),'white')
out.paste(p,(0,0)); out.paste(r,(r.width,0)); out.paste(Image.blend(p,r,0.5),(0,r.height))
from PIL import ImageFilter
e=r.convert('L').filter(ImageFilter.FIND_EDGES).point(lambda v:255 if v>45 else 0)
ov=p.copy(); ov.paste(Image.new('RGB',p.size,(255,40,40)),(0,0),e); out.paste(ov,(r.width,r.height))
out.save('${prefix}_compare.jpg',quality=85)`]);
