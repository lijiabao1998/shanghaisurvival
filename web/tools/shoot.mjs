/**
 * Headless screenshot for visual checks.
 *
 *   node tools/shoot.mjs "http://127.0.0.1:5173/survival.html?play" ../docs/screenshots/x.png
 *
 * Options (key=value after the output path):
 *   wait=800       extra settle time in ms before the shot
 *   key=KeyW       hold a key during the settle
 *   after=600      how long to hold it
 *   click=#sel     click a selector first
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const [url, out, ...flags] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node tools/shoot.mjs <url> <out.png> [key=value ...]');
  process.exit(1);
}
const opts = Object.fromEntries(
  flags.filter(a => a.includes('=')).map(a => a.split('=')),
);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
  ],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => {
  const overlay = document.querySelector('#overlay');
  const roster = document.querySelector('#roster');
  return (overlay && !overlay.classList.contains('on'))
    || (roster && roster.children.length > 0)
    || typeof window.__modu !== 'undefined'
    || typeof window.__shanghai !== 'undefined';
}, { timeout: 25000 }).catch(() => logs.push('[warn] ready signal timed out'));

await new Promise(r => setTimeout(r, Number(opts.wait ?? 1200)));
if (opts.js) { await page.evaluate(opts.js); await new Promise(r => setTimeout(r, 600)); }
if (opts.click) { await page.click(opts.click); await new Promise(r => setTimeout(r, 400)); }
if (opts.key) {
  await page.keyboard.down(opts.key);
  await new Promise(r => setTimeout(r, Number(opts.after ?? 700)));
  await page.keyboard.up(opts.key);
  await new Promise(r => setTimeout(r, 200));
}

const target = resolve(out);
await mkdir(dirname(target), { recursive: true });
await page.screenshot({ path: target });

const info = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c?.getContext('webgl2') || c?.getContext('webgl');
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    canvas: c ? `${c.width}x${c.height}` : 'none',
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
    status: document.querySelector('#status')?.textContent?.slice(0, 90) ?? null,
    overlay: document.querySelector('#overlay')?.classList.contains('on') ?? null,
  };
});

console.log('shot:', target);
console.log('canvas:', info.canvas, '| renderer:', info.renderer);
if (info.status) console.log('status:', info.status);
if (logs.length) console.log(logs.slice(-10).join('\n'));

await browser.close();
