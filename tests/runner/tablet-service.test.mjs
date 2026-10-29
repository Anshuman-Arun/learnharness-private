import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createTabletServer, loadTabletControlToken } from '../../runner/tablet-service.mjs';

test('trusted HTTPS pairing scopes, replay, reconnect and desktop revocation', async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-tablet-tls-'));
 process.env.LH_DATA_DIR = path.join(dir, 'data');
 process.env.LH_TABLET_TOKEN_FILE = path.join(dir, 'token');
 const certFile = path.join(dir, 'ca.pem'), keyFile = path.join(dir, 'key.pem');
 execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyFile, '-out', certFile, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
 process.env.LH_TABLET_CA_CERT_FILE = certFile;
 const cert = fs.readFileSync(certFile), key = fs.readFileSync(keyFile), controlToken = loadTabletControlToken();
 const { emptyScratchpad } = await import('../../src/core/scratchpad.ts');
 const { saveScratchpad, getScratchpad } = await import('../../src/server/scratchpad.ts');
 const { createTabletLink, revokeTabletLink, tabletScene, applyTabletEvent, tabletControlAuthorized } = await import('../../src/server/tablet.ts');
 const pad = saveScratchpad(emptyScratchpad('tls-pad', 'public-page'));
 const privatePad = saveScratchpad(emptyScratchpad('private-pad', 'private-page'));
 const backend = http.createServer(async (req, res) => {
  try {
   assert.equal(req.url.startsWith('/api/training/tablet/internal'), true);
   assert.equal(tabletControlAuthorized(req.headers['x-lh-tablet-control']), true);
   let result;
   if (req.method === 'GET') result = tabletScene(new URL(req.url, 'http://localhost').searchParams.get('id'));
   else { const chunks = []; for await (const chunk of req) chunks.push(chunk); result = applyTabletEvent(JSON.parse(Buffer.concat(chunks))); }
   res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  } catch (error) { res.writeHead(400); res.end(JSON.stringify({ error: error.message })); }
 });
 await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
 const server = createTabletServer({ key, cert, controlToken, backendUrl: `http://127.0.0.1:${backend.address().port}`, publicUrl: 'https://localhost' });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `https://127.0.0.1:${server.address().port}`;
 process.env.LH_TABLET_RUNNER_URL = origin;
 const request = (route, body, token) => new Promise((resolve, reject) => {
  const req = https.request(new URL(route, origin), { ca: cert, method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, res => {
   const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => { const raw = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, body: res.headers['content-type']?.includes('application/json') ? JSON.parse(raw) : raw }); });
  }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
 });
 try {
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/vendor/excalidraw/LICENSE')).status, 200);
  assert.equal((await request('/vendor/excalidraw/FONT-NOTICES.txt')).status, 200);
  assert.equal((await request('/vendor/excalidraw/../../package.json')).status, 404);
  assert.equal((await request('/api/scene')).status, 401);
  assert.equal((await request('/control/create', { padId: pad.id, pageId: 'public-page' })).status, 401);
  const competing = await Promise.allSettled([createTabletLink(pad.id, 'public-page'), createTabletLink(pad.id, 'public-page')]);
  assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1, 'one active writer when two PC tabs pair concurrently');
  const paired = competing.find(result => result.status === 'fulfilled').value;
  const login = await request('/api/pair', { code: paired.code });
  assert.equal(login.status, 200); const token = login.body.token;
  assert.equal(login.body.scene.pad.id, pad.id);
  assert.equal((await request('/api/pair', { code: paired.code })).status, 401);
  const stroke = { id: 'stroke-one', type: 'freedraw', x: 0, y: 0, width: 20, height: 10, angle: 0, points: [[0, 0], [20, 10]], pressures: [0.2, 0.8] };
  const frame = { sequence: 1, elements: [stroke], id: privatePad.id, pageId: 'private-page' };
  const first = await request('/api/scene', frame, token);
  assert.equal(first.status, 200);
  assert.deepEqual((await request('/api/scene', frame, token)).body, first.body);
  assert.equal((await request('/api/scene', { ...frame, sequence: 3 }, token)).status, 400);
  const resumed = await request('/api/scene?id=private-pad', undefined, token);
  assert.equal(resumed.body.pad.id, pad.id);
  assert.equal(resumed.body.page.elements[0].id, stroke.id);
  assert.equal(getScratchpad(privatePad.id).revision, privatePad.revision);
  assert.throws(() => saveScratchpad({ ...getScratchpad(pad.id), title: 'blocked' }), /Disconnect/);
  assert.equal((await request('/api/keys', undefined, token)).status, 404);
  await revokeTabletLink(paired.link.id);
  assert.equal((await request('/api/scene', undefined, token)).status, 401);
  assert.equal(saveScratchpad({ ...getScratchpad(pad.id), title: 'Desktop editing restored' }).title, 'Desktop editing restored');
 } finally {
  server.closeAllConnections(); backend.closeAllConnections();
  await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => backend.close(resolve))]);
  fs.rmSync(dir, { recursive: true, force: true });
 }
});
