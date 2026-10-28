import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { createCppRunnerServer, loadRunnerToken } from '../../runner/cpp-service.mjs';
import { createTabletServer, loadTabletControlToken } from '../../runner/tablet-service.mjs';
import { cppRunEvidence } from '../../src/core/cpp-run.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const until = async (fn, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('Condition did not settle'); };
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = async server => { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); };
const stroke = id => ({ id, type: 'freedraw', version: 1, versionNonce: 1, x: 0, y: 0, width: 20, height: 10, angle: 0, points: [[0, 0], [20, 10]], pressures: [.2, .8] });

test('pre-merge production browser workflows', { timeout: 600000 }, async t => {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-premerge-'));
 process.env.LH_CPP_RUNNER_TOKEN_FILE = path.join(temporary, 'cpp/token');
 process.env.LH_TABLET_TOKEN_FILE = path.join(temporary, 'tablet/token');
 const cpp = createCppRunnerServer(loadRunnerToken()); await listen(cpp); t.after(async () => { if (cpp.listening) await close(cpp); });
 fs.mkdirSync(path.join(temporary, "tablet"), { recursive: true, mode: 0o700 });
 const certFile = path.join(temporary, 'tablet/cert.pem'), keyFile = path.join(temporary, 'tablet/key.pem');
 execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyFile, '-out', certFile, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
 const cert = fs.readFileSync(certFile), key = fs.readFileSync(keyFile);
 const port = 3107, origin = `http://127.0.0.1:${port}`;
 const tablet = createTabletServer({ key, cert, controlToken: loadTabletControlToken(), backendUrl: origin, publicUrl: 'https://localhost' }); await listen(tablet);
 // Browser-only loopback adapter; real HTTPS upstream always verifies the explicit test CA.
 let holdNextScene = false, releaseScene;
 const adapter = http.createServer((req, res) => { const upstream = https.request(`https://127.0.0.1:${tablet.address().port}${req.url}`, { ca: cert, method: req.method, headers: req.headers }, response => { const relay = () => { if (res.destroyed) { response.resume(); return; } res.writeHead(response.statusCode, response.headers); response.pipe(res); response.resume(); }; if (holdNextScene && req.method === 'POST' && req.url === '/api/scene') { holdNextScene = false; response.pause(); releaseScene = relay; } else relay(); }); upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Companion unavailable'); }); req.pipe(upstream); }); await listen(adapter);
 const log = fs.openSync(path.join(temporary, 'production.log'), 'w');
 const app = spawn(process.execPath, ['.next/standalone/server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1', LH_AUTH_FILE: path.join(temporary, 'auth.json'), LH_DATA_DIR: path.join(temporary, 'data'), LH_CPP_RUNNER_URL: `http://127.0.0.1:${cpp.address().port}`, LH_TABLET_RUNNER_URL: `https://127.0.0.1:${tablet.address().port}`, LH_TABLET_CA_CERT_FILE: certFile }, stdio: ['ignore', log, log] });
 const browser = await puppeteer.launch({ executablePath: process.env.LH_CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--disable-dev-shm-usage'] });
 const errors = [];
 async function api(route, body, method = body === undefined ? 'GET' : 'POST') { const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const result = await response.json(); assert.ok(response.ok, `${route}: ${JSON.stringify(result)}`); return result; }
 async function page(route) { const p = await browser.newPage(); p.setDefaultTimeout(20000); await p.setViewport({ width: 1440, height: 1100 }); p.on('pageerror', e => errors.push(e.message)); await p.goto(origin + route, { waitUntil: 'networkidle2' }); return p; }
 async function click(p, text) { await p.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent === text && !b.disabled), { polling: 100 }, text); await p.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent === text && !b.disabled).click(), text); }
 async function fill(p, selector, value) { await p.waitForSelector(selector); await p.$eval(selector, (node, value) => { const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }, value); }
 const pad = (id, elements = []) => ({ version: 1, id, revision: 0, title: id, updatedAt: 0, pages: [{ id: 'page-' + id, name: 'Page 1', elements, view: { scrollX: 0, scrollY: 0, zoom: 1, backgroundColor: '#ffffff' } }] });
 let manualId, failures = 0, completed = false;
 async function check(name, body) { return t.test(name, { skip: !!process.env.LH_BROWSER_CASE && !name.includes(process.env.LH_BROWSER_CASE) }, async () => { try { await body(); } catch (error) { failures++; for (const [i, p] of (await browser.pages()).entries()) { if (p.url() !== 'about:blank') await p.screenshot({ path: path.join(temporary, `failure-${i}.png`), timeout: 10000 }).catch(() => {}); } throw error; } }); }
 try {
  await until(async () => { if (app.exitCode !== null) throw Error(fs.readFileSync(path.join(temporary, 'production.log'), 'utf8')); try { return (await fetch(origin + '/api/training/sprints')).ok; } catch { return false; } });
  await check('Guided/Explain reverses after reload and preserves other settings', async () => {
   const chat = await api('/api/chats', { title: 'Mode regression' });
   const p = await page('/chat/' + chat.id);
   await p.select('[aria-label="Teaching style"]', 'guided');
   await until(async () => (await api(`/api/chats/${chat.id}`)).settings.teachingMode === 'guided');
   await p.reload({ waitUntil: 'networkidle2' }); assert.equal(await p.$eval('[aria-label="Teaching style"]', e => e.value), 'guided');
   await p.select('[aria-label="Teaching style"]', 'explain');
   await until(async () => (await api(`/api/chats/${chat.id}`)).settings.teachingMode === 'explain');
   await p.close();
  });
  await check('image reads preserve code attached while FileReader is pending', async () => {
   const chat = await api('/api/chats', { title: 'Concurrent attachment regression' });
   const p = await page('/chat/' + chat.id);
   await click(p, 'Attach code'); await fill(p, '[aria-label="Code snapshot"]', 'int main(){return 0;}');
   await p.evaluate(() => { const original = FileReader.prototype.readAsDataURL; FileReader.prototype.readAsDataURL = function(blob) { window.finishEvidenceRead = () => original.call(this, blob); }; });
   const image = path.join(temporary, 'attachment.png');
   fs.writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzFoAAAAASUVORK5CYII=', 'base64'));
   await (await p.$('[aria-label="Attach sketch or image"]')).uploadFile(image);
   await p.waitForFunction(() => document.body.textContent.includes('Reading images'), { polling: 100 });
   await click(p, 'Add code snapshot'); await p.waitForSelector('[aria-label="Remove main.cpp"]');
   await p.evaluate(() => window.finishEvidenceRead()); await p.waitForSelector('[aria-label="Remove attachment.png"]');
   assert.ok(await p.$('[aria-label="Remove main.cpp"]'), 'image completion must retain the new code');
   await p.close();
  });
  await check('silent C++ failures retain execution status in the tutor handoff', async () => {
   const { report } = await api('/api/training/cpp/run', { files: [{ name: 'main.cpp', source: 'int main(){return 1;}' }], stdin: '' });
   assert.equal(report.result.exitCode, 1); assert.equal(report.result.errorKind, 'runtime');
   const evidence = cppRunEvidence(report);
   assert.deepEqual(evidence.code[0].execution, { ok: false, exitCode: 1, errorKind: 'runtime', timedOut: false });
   const chat = await api('/api/chats', { title: 'Run status regression' }); const p = await page('/training');
   await p.evaluate(incoming => sessionStorage.setItem('lh:incoming-evidence', JSON.stringify(incoming)), { chatId: chat.id, evidence });
   await p.goto(origin + '/chat/' + chat.id, { waitUntil: 'networkidle2' });
   await p.waitForFunction(() => document.querySelector('[data-testid="evidence-input"]')?.textContent.includes('Reported execution: runtime'), { polling: 100 });
   assert.ok(await p.$eval('[data-testid="evidence-input"]', e => e.textContent.includes('exit 1')));
   await p.close();
  });
  await check('arithmetic wrong/correct submissions and stopped-round reload', async () => {
   const p = await page('/training/arithmetic');
   const started = await api('/api/training/arithmetic', { action: 'start', config: { operations: ['addition'], addRange: [2, 2], multiplierRange: [2, 2], multiplicandRange: [2, 2], durationSeconds: 15 } });
   const round = started.round;
   const wrong = await api('/api/training/arithmetic', { action: 'answer', id: round.id, index: 0, answer: '5' }); assert.equal(wrong.round.index, 0);
   const right = await api('/api/training/arithmetic', { action: 'answer', id: round.id, index: 0, answer: '4' }); assert.equal(right.round.index, 1);
   const stale = await fetch(origin + '/api/training/arithmetic', { method: 'POST', body: JSON.stringify({ action: 'answer', id: round.id, index: 0, answer: '4' }) }); assert.equal(stale.status, 400);
   await api('/api/training/arithmetic', { action: 'stop', id: round.id }); await p.reload({ waitUntil: 'networkidle2' }); assert.ok((await p.content()).includes('addition')); await p.close();
  });
  await check('estimation invalid interval, commit-before-reveal and history', async () => {
   const p = await page('/training/estimation'); await click(p, 'New estimate'); await p.waitForSelector('[name=estimate]'); assert.equal(await p.$('[data-testid=estimate-reference]'), null);
   await fill(p, '[name=estimate]', '100'); await fill(p, '[name=low]', '200'); await fill(p, '[name=high]', '300'); await fill(p, '[name=reasoning]', 'Bracket the rounded product.');
   await click(p, 'Commit and inspect'); await p.waitForSelector('[role=alert]'); assert.equal(await p.$('[data-testid=estimate-reference]'), null);
   await fill(p, '[name=low]', '10'); await click(p, 'Commit and inspect'); await p.waitForSelector('[data-testid=estimate-reference]'); await p.reload({ waitUntil: 'networkidle2' }); await click(p, 'product · review'); await p.waitForSelector('[data-testid=estimate-reference]'); await p.close();
  });
  await check('probability pause/reload resumes exact saved trial counts', async () => {
   const p = await page('/training/probability'); await fill(p, '[name=prediction]', '.2'); await fill(p, '[name=reasoning]', 'Count favourable pairs.'); await fill(p, '[name=trials]', '10000'); await click(p, 'Commit prediction'); await click(p, 'Run trials'); await p.waitForSelector('[data-testid=experiment-results]'); await click(p, 'Pause after this batch');
   await p.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => b.textContent === 'Pause after this batch'), { polling: 100 }); const before = (await api('/api/training/probability')).experiments[0];
   await p.reload({ waitUntil: 'networkidle2' }); await p.waitForSelector('[data-testid=experiment-results]'); assert.equal((await api('/api/training/probability')).experiments[0].completed, before.completed); assert.ok(before.completed > 0); await p.close();
  });
  await check('stopping last-draw lock and post-game policy comparison', async () => {
   const p = await page('/training/stopping'); await fill(p, '[name=horizon]', '1'); await fill(p, '[name=reasoning]', 'Last draw must be accepted.'); await click(p, 'Start game'); await p.waitForSelector('[data-testid=stopping-offer]'); assert.ok(await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Pay and draw again').disabled)); await click(p, 'Accept offer'); await p.waitForSelector('[data-testid=stopping-debrief]'); await click(p, 'Compare policies'); await p.waitForFunction(() => document.body.textContent.includes('shared-seed games'), { polling: 100 }); await p.close();
  });
  await check('OA local drafts/flags survive reload and server rejects post-finish changes', async () => {
   const p = await page('/training/exam'); await click(p, 'Start timed exam'); await p.waitForSelector('[aria-label="Exam answer"]'); await fill(p, '[aria-label="Exam answer"]', '1/6'); await p.click('input[type=checkbox]'); await p.reload({ waitUntil: 'networkidle2' }); await p.waitForFunction(() => document.querySelector('[aria-label="Exam answer"]')?.value === '1/6', { polling: 100 }); await click(p, 'Save and next');
   await p.waitForFunction(() => document.querySelector('section h3')?.textContent.startsWith('2.'), { polling: 100 }); await click(p, 'Finish and reveal solutions'); await p.waitForSelector('[data-testid=exam-solution]'); const exam = (await api('/api/training/exam')).exams[0]; assert.ok(exam.responses[0].flagged); const r = await fetch(origin + '/api/training/exam', { method: 'POST', body: JSON.stringify({ action: 'answer', id: exam.id, revision: exam.revision, index: 0, answer: '9', reasoning: '', flagged: false }) }); assert.equal(r.status, 400); await p.close();
  });
  await check('notebook correction requires subsequent successful retry and keeps source', async () => {
   const made = await api('/api/training/mistakes', { action: 'manual', prompt: 'What is six times seven?', expected: 42, answer: '43', reasoning: 'Miscounted.' }); manualId = made.entry.id;
   const p = await page('/training/mistakes'); await p.waitForSelector('[name=correction]'); await fill(p, '[name=correction]', 'Distribute six across five plus two.'); await click(p, 'Save correction'); await click(p, 'Retry original'); await fill(p, '[aria-label="Retry answer"]', '42'); await fill(p, 'section:last-child [name=reasoning]', 'Thirty plus twelve.'); await click(p, 'Commit retry'); await p.waitForSelector('[data-testid=retry-result]'); await click(p, 'Mark correction demonstrated'); await p.waitForFunction(() => document.body.textContent.includes('Correction demonstrated on a recorded retry'), { polling: 100 }); assert.equal((await api('/api/training/mistakes')).entries.find(e => e.id === manualId).answer, '43'); await p.close();
  });
  await check('retrieval uses committed incorrect result despite easy rating', async () => {
   await api('/api/training/retrieval', { action: 'enroll', id: manualId }); const p = await page('/training/retrieval'); await click(p, 'Review now'); await fill(p, '[aria-label="Review answer"]', '43'); await fill(p, '[name=reasoning]', 'Still unsure.'); await click(p, 'Commit recall'); await p.waitForSelector('[data-testid=review-feedback]'); await click(p, 'easy'); await p.waitForSelector('[data-testid=review-scheduled]'); const card = (await api('/api/training/retrieval')).cards[0]; assert.equal(card.history[0].correct, false); assert.ok(card.history[0].explanation.includes('Incorrect')); assert.equal(card.intervalDays, 10 / 1440); await p.close();
  });
  await check('sprint unsaved notes survive timer changes and exit drafts survive reload', async () => {
   const p = await page('/training/sprints'); await click(p, 'Start this sprint'); await p.waitForSelector('[aria-label="Sprint milestones"]'); await fill(p, '[name=notes]', 'Preserve my derivation draft.'); await click(p, 'Start timer'); await click(p, 'Pause timer'); assert.equal(await p.$eval('[name=notes]', e => e.value), 'Preserve my derivation draft.');
   await p.evaluate(() => [...document.querySelectorAll('nav button')].find(b => b.textContent.includes('Unseen exit challenge')).click()); await click(p, 'Open unseen exit set'); await fill(p, '[name=answer-0]', '0'); await fill(p, '[name=reasoning-0]', 'Need to derive.'); await p.reload({ waitUntil: 'networkidle2' }); await p.waitForSelector('[aria-label="Sprint milestones"]'); await p.evaluate(() => [...document.querySelectorAll('nav button')].find(b => b.textContent.includes('Unseen exit challenge')).click()); await p.waitForSelector('[name=answer-0]'); assert.equal(await p.$eval('[name=answer-0]', e => e.value), '0'); for (let i = 0; i < 3; i++) { await fill(p, `[name=answer-${i}]`, '0'); await fill(p, `[name=reasoning-${i}]`, 'I need to choose the right indicators.'); } await click(p, 'Commit exit set and inspect rubrics'); await p.waitForSelector('[data-testid=sprint-exit-debrief]'); await p.close();
  });
  await check('workspace revisions preserve newer files; runner/judge freeze source and redact hidden output', async () => {
   const w = { version: 1, id: 'browser-workspace', revision: 0, title: 'Workspace regression', problem: 'Count equal pairs', stdin: '', files: [{ name: 'main.cpp', source: '#include <iostream>\nint main(){std::cout<<4<<"\\n";}' }], updatedAt: 0 };
   const saved = await api('/api/training/cpp', w, 'PUT'); const conflict = await fetch(origin + '/api/training/cpp', { method: 'PUT', body: JSON.stringify(w) }); assert.equal(conflict.status, 400);
   const p = await page('/training/cpp'); await click(p, 'Plain editor'); await p.waitForSelector('[aria-label="C++ source"]'); assert.equal(await p.$eval('[aria-label="C++ source"]', e => e.value), w.files[0].source);
   const run = await api('/api/training/cpp/run', { files: w.files, stdin: '' }); assert.equal(run.report.result.stdout.trim(), '4'); assert.equal(run.report.request.files[0].source, w.files[0].source);
   await click(p, 'Judge current source'); await p.waitForSelector('[data-testid=cpp-judge-result]', { timeout: 60000 }); const report = (await api('/api/training/cpp/challenges')).reports[0]; assert.equal(report.result.ok, false); assert.equal(report.files[0].source, w.files[0].source); assert.ok(report.result.cases.filter(c => c.name.startsWith('Hidden')).every(c => c.stdout === '[hidden check output withheld]' && !c.stderr)); await click(p, 'Discuss this result with tutor'); await p.waitForFunction(() => location.pathname.startsWith('/chat/') && document.body.textContent.includes('training-record.json'), { polling: 100 }); await p.close(); assert.equal(saved.workspace.revision, 1);
  });
  await check('scratchpad touch sync, offline/reload recovery, cross-pairing isolation and PC reclaim', async () => {
   await api('/api/training/scratchpad', pad('tablet-a'), 'PUT');
   const p = await browser.newPage(); p.setDefaultTimeout(20000); p.on('pageerror', e => errors.push(e.message)); await p.setViewport({ width: 1024, height: 1366, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
   const companion = `http://127.0.0.1:${adapter.address().port}`;
   let block = false; await p.setRequestInterception(true); p.on('request', request => { if (block && request.method() === 'POST' && request.url().endsWith('/api/scene')) request.abort('failed'); else request.continue(); });
   async function pairPad(id) { const pairing = await api('/api/training/tablet', { action: 'create', padId: id, pageId: 'page-' + id }); await fill(p, '[aria-label="Pairing code"]', pairing.code); await click(p, 'Pair'); await p.waitForSelector('[data-testid=toolbar-freedraw]'); await p.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved on your PC', { polling: 100 }); return pairing; }
   async function draw(offset) { await p.tap('[data-testid=toolbar-freedraw]'); await p.waitForFunction(() => { const node = document.querySelector('[data-testid=toolbar-freedraw]'); return node?.checked || node?.querySelector('input')?.checked; }, { polling: 100 }); const box = await (await p.$('.excalidraw canvas')).boundingBox(); const session = await p.createCDPSession(); const point = i => ({ x: box.x + 350 + i * 7, y: box.y + 300 + offset + i * 2, radiusX: 2, radiusY: 2, force: .6 }); await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0)] }); for (let i = 1; i <= 12; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(i)] }); await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach(); }
   async function elements(id) { return (await api('/api/training/scratchpad?id=' + id)).pad.pages[0].elements.filter(e => !e.isDeleted); }
   await p.goto(companion, { waitUntil: 'networkidle2' }); const first = await pairPad('tablet-a'); await draw(0); await until(async () => (await elements('tablet-a')).length === 1); assert.equal((await elements('tablet-a'))[0].type, 'freedraw'); assert.ok((await elements('tablet-a'))[0].pressures.some(p => p > .5 && p < .7), 'touch pressure survives vector transport');
   await p.setViewport({ width: 1366, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'landscape canvas fits the tablet viewport');
   block = true; await draw(70); await p.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('retained locally'), { polling: 100 }); await p.reload({ waitUntil: 'networkidle2' }); await p.waitForSelector('[data-testid=toolbar-freedraw]'); block = false; await click(p, 'Sync now'); await until(async () => (await elements('tablet-a')).length === 2);
   // Leave a failed frame pending, then change pairing. It must never enter the next pad.
   block = true; await draw(140); await p.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('retained locally'), { polling: 100 }); await click(p, 'Disconnect'); await p.waitForSelector('[aria-label="Pairing code"]'); await until(async () => !(await api('/api/training/tablet?padId=tablet-a')).links.length);
   await api('/api/training/scratchpad', pad('tablet-b'), 'PUT'); block = false; const second = await pairPad('tablet-b'); await draw(0); try { await until(async () => (await elements('tablet-b')).length === 1); } catch (error) { console.log('Tablet state:', await p.evaluate(() => ({status: document.querySelector('[role=status]')?.textContent, draftPages:Object.keys(localStorage).filter(k=>k.startsWith('lh:tablet-draft')).map(k=>({key:k,page:JSON.parse(localStorage[k]).page.id,elements:JSON.parse(localStorage[k]).page.elements.length}))}))); throw error; } assert.equal((await elements('tablet-b')).length, 1, 'old pending strokes cannot cross into another pad');
   // Accept a frame on the PC but delay its HTTP acknowledgment until after re-pairing.
   holdNextScene = true; await draw(70); await until(() => !!releaseScene);
   await click(p, 'Disconnect'); await p.waitForSelector('[aria-label="Pairing code"]');
   await api('/api/training/scratchpad', pad('tablet-c'), 'PUT'); await pairPad('tablet-c');
   releaseScene(); releaseScene = undefined; await draw(0); await until(async () => (await elements('tablet-c')).length === 1);
   await p.click('[data-testid=toolbar-text]'); await p.waitForFunction(() => { const node = document.querySelector('[data-testid=toolbar-text]'); return node?.checked || node?.querySelector('input')?.checked; }, { polling: 100 }); const textBox = await (await p.$('.excalidraw canvas')).boundingBox(); await p.touchscreen.tap(textBox.x + 600, textBox.y + 300);
   await p.waitForSelector('textarea.excalidraw-wysiwyg'); await p.type('textarea.excalidraw-wysiwyg', 'E[X] = 2; lambda = 3'); await p.keyboard.press('Escape');
   await until(async () => (await elements('tablet-c')).some(e => e.type === 'text' && e.text.includes('E[X]')));
   const pc = await page('/training/scratchpad'); await pc.select('[aria-label="Saved scratchpad"]', 'tablet-c'); await pc.waitForSelector('[data-testid=disconnect-tablet]'); assert.equal(await pc.$eval('[aria-label="Scratchpad title"]', e => e.disabled), true);
   await close(tablet); await pc.click('[data-testid=disconnect-tablet]'); await pc.waitForSelector('[data-testid=pair-tablet]'); assert.equal(await pc.$eval('[aria-label="Scratchpad title"]', e => e.disabled), false, 'PC reclaims drawing even when helper is down'); await fill(pc, '[aria-label="Scratchpad title"]', 'PC resumed'); await click(pc, 'Save now'); await until(async () => (await api('/api/training/scratchpad?id=tablet-c')).pad.title === 'PC resumed'); assert.equal((await api('/api/training/tablet?padId=tablet-c')).links.length, 0);
   await pc.click('[data-testid=attach-scratchpad]'); await pc.waitForFunction(() => location.pathname.startsWith('/chat/'), { polling: 100 }); await pc.waitForFunction(() => document.querySelector('[data-testid=evidence-input]')?.textContent.includes('Page-1.png'), { polling: 100 });
   assert.notEqual(first.link.id, second.link.id); await p.close(); await pc.close();
  });
  await check('pending notebook corrections never silently discard visible text', async () => {
   await api('/api/training/mistakes', { action: 'manual', prompt: 'Pending correction regression', expected: 42, answer: '43', reasoning: 'Original attempt' });
   const p = await page('/training/mistakes'); await p.waitForSelector('[name=correction]');
   let held; await p.setRequestInterception(true); p.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/training/mistakes') && JSON.parse(r.postData()).action === 'edit') held = r; else r.continue(); });
   await fill(p, '[name=correction]', 'Use distribution.'); await click(p, 'Save correction'); await until(() => !!held);
   await p.type('[name=correction]', ' Additional reasoning.'); const visible = await p.$eval('[name=correction]', n => n.value);
   held.continue(); await p.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Save correction' && !b.disabled));
   assert.equal(await p.$eval('[name=correction]', n => n.value), visible); await p.close();
  });
  await check('acknowledged sprint notes do not revive as stale local drafts', async () => {
   await api('/api/training/sprints', { action: 'start', id: 'beta-binomial' });
   const p = await page('/training/sprints'); await p.select('[aria-label="Sprint topic"]', 'beta-binomial'); await p.waitForSelector('[name=notes]');
   await fill(p, '[name=notes]', 'Saved once'); await click(p, 'Save milestone notes');
   await until(async () => (await api('/api/training/sprints')).sprints.find(v => v.sprint.id === 'beta-binomial').progress.notes.diagnostic === 'Saved once');
   await p.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Save milestone notes' && !b.disabled));
   let progress = (await api('/api/training/sprints')).sprints.find(v => v.sprint.id === 'beta-binomial').progress;
   await api('/api/training/sprints', { action: 'notes', id: 'beta-binomial', revision: progress.revision, phase: 'diagnostic', notes: 'Newer saved notes from another tab' });
   await p.reload({ waitUntil: 'networkidle2' }); await p.select('[aria-label="Sprint topic"]', 'beta-binomial');
   assert.equal(await p.$eval('[name=notes]', n => n.value), 'Newer saved notes from another tab');
   let held; await p.setRequestInterception(true); p.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/training/sprints') && JSON.parse(r.postData()).action === 'notes') held = r; else r.continue(); });
   await fill(p, '[name=notes]', 'Sent snapshot'); await click(p, 'Save milestone notes'); await until(() => !!held);
   await p.type('[name=notes]', ' with newer unsaved text'); const newer = await p.$eval('[name=notes]', n => n.value); held.continue();
   await p.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Save milestone notes' && !b.disabled));
   await p.reload({ waitUntil: 'networkidle2' }); await p.select('[aria-label="Sprint topic"]', 'beta-binomial'); assert.equal(await p.$eval('[name=notes]', n => n.value), newer); await p.close();
  });
  await check('sprint handoffs select Guided teaching and the practice agent', async () => {
   await api('/api/training/sprints', { action: 'start', id: 'indicators' });
   const p = await page('/training/sprints'); await click(p, 'Open guided teaching session'); await p.waitForFunction(() => location.pathname.startsWith('/chat/'));
   const chat = await api(await p.evaluate(() => '/api/chats/' + encodeURIComponent(location.pathname.split('/').pop()))); assert.equal(chat.settings.teachingMode, 'guided'); assert.notEqual(chat.kind, 'practice');
   await p.waitForSelector('[data-testid=evidence-input] pre'); const payload = JSON.parse(await p.$eval('[data-testid=evidence-input] pre', n => n.textContent));
   assert.ok(payload.instruction.includes('one targeted hint')); assert.equal(JSON.stringify(payload).includes('"expected":'), false); await p.close();
   const practice = await page('/training/sprints'); await click(practice, 'Open practice session'); await practice.waitForFunction(() => location.pathname.startsWith('/chat/'));
   assert.equal((await api(await practice.evaluate(() => '/api/chats/' + encodeURIComponent(location.pathname.split('/').pop())))).kind, 'practice');
   await practice.waitForSelector('[data-testid=evidence-input] pre'); assert.ok((await practice.$eval('[data-testid=evidence-input] pre', n => n.textContent)).includes('without naming the technique upfront')); await practice.close();
  });
  await check('sprint progress clocks use server time despite browser clock skew', async () => {
   const started = (await api('/api/training/sprints', { action: 'start', id: 'calibration-ev' })).sprint;
   await api('/api/training/sprints', { action: 'timer', id: 'calibration-ev', revision: started.progress.revision, phase: 'diagnostic', running: true });
   const p = await browser.newPage(); p.setDefaultTimeout(20000); p.on('pageerror', e => errors.push(e.message));
   await p.evaluateOnNewDocument(() => { const nativeNow = Date.now.bind(Date); Date.now = () => nativeNow() + 10 * 60 * 60 * 1000; });
   await p.goto(origin + '/training/sprints', { waitUntil: 'networkidle2' }); await p.select('[aria-label="Sprint topic"]', 'calibration-ev');
   const text = await p.evaluate(() => document.body.textContent.match(/Tracked: \d+m \d+s/)?.[0] ?? 'no timer'); assert.match(text, /Tracked: 0m \d+s/); await p.close();
  });
  assert.deepEqual(errors, [], 'production pages have no uncaught browser errors'); completed = true;
 } finally {
  await browser.close(); app.kill('SIGTERM'); await new Promise(resolve => { if (app.exitCode !== null) resolve(); else app.once('exit', resolve); }); fs.closeSync(log);
  await close(adapter); if (tablet.listening) await close(tablet); await close(cpp);
  if (completed && !failures) fs.rmSync(temporary, { recursive: true, force: true }); else console.log('Failure artifacts retained at ' + temporary);
 }
});
