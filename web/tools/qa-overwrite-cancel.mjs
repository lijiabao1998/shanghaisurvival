// Browser regression: real staged menu + existing sandbox save, in an isolated context.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const url = process.env.QA_URL ?? 'http://127.0.0.1:5192/survival.html?debug';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'only local test servers are allowed');
const executablePath = process.env.QA_BROWSER ?? (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/chromium');
const browser = await puppeteer.launch({executablePath, headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const context = await browser.createBrowserContext();
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const saveSnapshot = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('shanghai-survivors:')).map(k => [k, localStorage.getItem(k)])));
const step = () => page.$eval('#overlay', e => e.dataset.selectionStep);
try {
  await page.setViewport({width: 1366, height: 768});
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__modu && document.querySelector('#shanghai-selection'));
  await page.click('#roster .who:not([hidden])');
  await page.click('#ov-btn');
  await page.click('#ov-btn');
  await page.click('#ov-btn');
  await page.waitForFunction(() => window.__modu.state().phase === 'play');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#settings-return', {visible: true});
  await page.click('#settings-return');
  await page.waitForFunction(() => window.__modu && document.querySelector('#campaign-resume') && document.querySelector('#shanghai-selection'));
  const before = await saveSnapshot();
  assert.ok(Object.keys(before).length > 0, 'a real sandbox save was created');
  await page.click('#roster .who:not([hidden])');
  await page.click('#ov-btn');
  await page.click('#ov-btn');
  assert.equal(await step(), '2');
  await page.click('.selection-overwrite input');
  let sawDialog = false;
  page.once('dialog', dialog => { sawDialog = true; void dialog.dismiss(); });
  await page.click('#ov-btn');
  await page.waitForFunction(() => document.querySelector('#overlay')?.classList.contains('on'));
  assert.equal(sawDialog, true, 'the actual overwrite confirmation was shown');
  assert.equal(await step(), '2', 'cancelling overwrite retains the staged departure screen');
  assert.ok(await page.$('#shanghai-selection'), 'menu is not disposed');
  assert.deepEqual(await saveSnapshot(), before, 'cancel must not alter the saved game');
  await page.click('#campaign-resume');
  await page.waitForFunction(() => window.__modu.state().phase === 'play');
  assert.deepEqual(errors, []);
  console.log('PASS: real sandbox save survives cancelled overwrite; staged departure and Continue remain usable');
} finally {
  // Avoid an indefinitely hung GPU/browser teardown on busy runners.
  const killTimer = setTimeout(() => browser.process()?.kill(), 15000);
  try {
    await context.close();
    await browser.close();
  } finally {
    clearTimeout(killTimer);
  }
}
