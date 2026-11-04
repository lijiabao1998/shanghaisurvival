// Local screenshot + render-budget probe for the lane realism work (phone viewport, HUD hidden).
// node tools/shot-lanes.mjs <outPrefix> [url]
import puppeteer from 'puppeteer-core';
const out = process.argv[2] ?? '/tmp/lanes';
const url = process.argv[3] ?? 'http://127.0.0.1:4173/?debug';
const VIEWS = [['menghua', 280.1, 348.5], ['lane', 263.8, 453.6]];
const b = await puppeteer.launch({ executablePath: process.env.QA_BROWSER ?? '/usr/bin/google-chrome', protocolTimeout: 240000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await pg.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await pg.waitForFunction(() => window.__modu, { timeout: 60000 });
await pg.evaluate(() => window.__modu.start());
await pg.waitForFunction(() => window.__modu.state().phase === 'play', { timeout: 60000 });
await pg.addStyleTag({ content: 'body > *:not(canvas){visibility:hidden!important}' });
const res = {};
for (const [name, x, z] of VIEWS) {
  const ok = await pg.evaluate((x, z) => { for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]]) if (window.__modu.teleport(x + dx, z + dz)) return true; return false; }, x, z);
  for (const hr of [13, 21]) {
    await pg.evaluate(h => window.__modu.setHour(h), hr);
    await pg.evaluate(() => { window.__fc = 0; const f = () => { window.__fc++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await new Promise(r => setTimeout(r, 3000));
    const c0 = await pg.evaluate(() => window.__fc);
    await new Promise(r => setTimeout(r, 4000));
    res[`${name}-${hr}`] = await pg.evaluate(c0 => ({ fps: +((window.__fc - c0) / 4).toFixed(1), ...window.__modu.state().renderBudget }), c0);
    res[`${name}-${hr}`].teleported = ok;
    await pg.screenshot({ path: `${out}-${name}-${hr === 13 ? 'day' : 'night'}.png` });
  }
}
res.errors = errs.slice(0, 3);
console.log(JSON.stringify(res));
await b.close();
