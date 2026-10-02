// Orthographic top-down render of a satellite (Q-frame) rectangle at the satellite's own scale,
// for overlaying on the photo: node tools/test/topdown.mjs out.png qx0 qy0 qx1 qy1 [px per Q px]
import { open } from './harness.mjs';
const [out, ...nums] = process.argv.slice(2);
const [qx0, qy0, qx1, qy1, k = 1] = nums.map(Number);
const W = Math.round((qx1 - qx0) * k), H = Math.round((qy1 - qy0) * k);
const { page, close } = await open({ quality: 'low', width: 640, height: 400 });
await page.evaluate(() => window.__game.texturesReady);
const png = await page.evaluate(async ({ qx0, qy0, qx1, qy1, W, H }) => {
  const THREE = await import('three');
  const g = window.__game;
  const [x0, z0] = g.sat(qx0, qy0), [x1, z1] = g.sat(qx1, qy1);
  const cam = new THREE.OrthographicCamera(x0, x1, -z0, -z1, 1, 1000);
  cam.position.set(0, 500, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  const r = g.renderer;
  r.setPixelRatio(1);
  r.setSize(W, H, false);
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  g.scene.fog = null;
  r.setRenderTarget(rt);
  r.render(g.scene, cam);
  const buf = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  r.setRenderTarget(null);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}, { qx0, qy0, qx1, qy1, W, H });
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
await close();
