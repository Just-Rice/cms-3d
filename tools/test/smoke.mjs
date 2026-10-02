// node tools/test/smoke.mjs out.png : loads the game, starts it, screenshots the spawn view
import { open } from './harness.mjs';
const { page, errors, close } = await open({ quality: process.env.Q || 'medium' });
await page.evaluate(() => window.__game.start());
await page.waitForTimeout(4000);
await page.screenshot({ path: process.argv[2] || 'smoke.png', timeout: 300000 });
console.log(errors.slice(0, 20).join('\n'));
await close();
