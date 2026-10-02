// Prints build progress and errors while the game loads
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve('.');
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.addInitScript(() => localStorage.setItem('cms3d:quality', '"low"'));
await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', (r) => r.fulfill({ body: fs.readFileSync(path.join(root, 'node_modules/three', new URL(r.request().url()).pathname.replace('/npm/three@0.169.0/', ''))), contentType: 'text/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('pageerror', e.message, e.stack?.slice(0, 500)));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => [document.querySelector('#loadmsg').textContent, document.querySelector('#go').disabled]).catch((e) => ['eval failed ' + e.message]);
  console.log(i * 5, s);
  if (s[1] === false || /wrong/.test(s[0])) break;
}
await browser.close(); server.close();
