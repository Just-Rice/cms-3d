// Shared Playwright harness: serves the repo, maps the three.js CDN to node_modules/three,
// launches Chromium with SwiftShader and waits for the game to finish building.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary' };
const threeDir = process.env.THREE_DIR || path.join(root, 'node_modules/three');

export async function open({ width = 960, height = 540, quality = 'medium', lightmaps = true, init = null } = {}) {
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript((q) => { try { localStorage.setItem('cms3d:quality', JSON.stringify(q)); localStorage.setItem('cms3d:help', 'false'); } catch {} }, quality);
  if (init) await page.addInitScript(init);
  if (!lightmaps) await page.route('**/lightmaps/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', (r) => {
    const rel = new URL(r.request().url()).pathname.replace('/npm/three@0.169.0/', '');
    r.fulfill({ body: fs.readFileSync(path.join(threeDir, rel)), contentType: 'text/javascript' });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => !document.querySelector('#go').disabled, null, { timeout: 600000 });
  const close = async () => { await browser.close(); server.close(); };
  return { page, browser, errors, close };
}
