import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '../..');
test('scratchpad switches preserve saved-pad and new-pad drafts, including storage failure', { timeout: 90000 }, async () => {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-scratch-drafts-'));
 const origin = 'http://127.0.0.1:3108';
 const log = fs.openSync(path.join(temporary, 'server.log'), 'w');
 const app = spawn(process.execPath, ['.next/standalone/server.js'], { cwd: root, env: { ...process.env, PORT: '3108', HOSTNAME: '127.0.0.1', LH_AUTH_FILE: path.join(temporary, 'auth.json'), LH_DATA_DIR: path.join(temporary, 'data') }, stdio: ['ignore', log, log] });
 let browser, passed = false;
 const until = async fn => { const end = Date.now() + 20000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 50)); } throw Error('Condition did not settle'); };
 try {
  await until(async () => { if (app.exitCode !== null) throw Error(fs.readFileSync(path.join(temporary, 'server.log'), 'utf8')); try { return (await fetch(origin + '/api/training/scratchpad')).ok; } catch { return false; } });
  for (const id of ['draft-a', 'draft-b']) {
   const response = await fetch(origin + '/api/training/scratchpad', { method: 'PUT', body: JSON.stringify({ version: 1, id, revision: 0, title: id, pages: [{ id: 'page-' + id, name: 'Page 1', elements: [], view: { scrollX: 0, scrollY: 0, zoom: 1, backgroundColor: '#ffffff' } }] }) });
   assert.equal(response.status, 200);
  }
  browser = await puppeteer.launch({ executablePath: process.env.LH_CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage(); page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Keep autosaves pending so switching cannot accidentally pass by saving first.
  let offline = true;
  await page.setRequestInterception(true);
  page.on('request', r => offline && r.method() === 'PUT' && r.url().includes('/api/training/scratchpad') ? r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' }) : r.continue());
  await page.goto(origin + '/training/scratchpad', { waitUntil: 'networkidle2' });
  const title = '[aria-label="Scratchpad title"]', selector = '[aria-label="Saved scratchpad"]';
  const fill = async value => page.$eval(title, (node, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await page.waitForSelector(title); await page.select(selector, 'draft-a');
  await fill('Unsaved title A'); await page.select(selector, 'draft-b'); await page.select(selector, 'draft-a');
  assert.equal(await page.$eval(title, n => n.value), 'Unsaved title A');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'New pad').click());
  await fill('Unsaved new pad'); const newId = await page.$eval(selector, n => n.value);
  await page.select(selector, 'draft-b'); await page.select(selector, newId);
  assert.equal(await page.$eval(title, n => n.value), 'Unsaved new pad');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await fill('Retain when storage is full'); await page.select(selector, 'draft-b');
  assert.equal(await page.$eval(title, n => n.value), 'Retain when storage is full');
  assert.match(await page.$eval('[role=alert]', n => n.textContent), /Save before leaving/);
  offline = false;
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Save now').click());
  await page.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some(n => n.textContent === 'Saved'));
  await page.select(selector, 'draft-b');
  assert.equal(await page.$eval(title, n => n.value), 'draft-b', 'acknowledged work permits switching even if recovery storage stays full');
  assert.deepEqual(errors, []); passed = true;
 } finally {
  await browser?.close(); app.kill('SIGTERM');
  await new Promise(resolve => { if (app.exitCode !== null) resolve(); else app.once('exit', resolve); }); fs.closeSync(log);
  if (passed) fs.rmSync(temporary, { recursive: true, force: true }); else console.log('Failure artifacts: ' + temporary);
 }
});
