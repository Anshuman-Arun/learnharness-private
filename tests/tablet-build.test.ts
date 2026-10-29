import assert from 'node:assert/strict';
import { it } from 'node:test';
import { EXCALIDRAW_FONT_CHUNKS } from '../scripts/excalidraw-font-chunks.mjs';

it('self-hosts the font fallback on Windows as well as POSIX builds', () => {
 const relative = ['node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'chunk-K2UTITRG.js'];
 assert.ok(EXCALIDRAW_FONT_CHUNKS.test('/workspace/app/' + relative.join('/')));
 assert.ok(EXCALIDRAW_FONT_CHUNKS.test('C:' + String.fromCharCode(92) + ['Users', 'learner', 'app', ...relative].join(String.fromCharCode(92))));
 assert.equal(EXCALIDRAW_FONT_CHUNKS.test('/app/node_modules/other-package/dist/prod/chunk-K2UTITRG.js'), false);
 assert.equal(EXCALIDRAW_FONT_CHUNKS.test('/app/node_modules/@excalidraw/excalidraw/dist/dev/chunk-K2UTITRG.js'), false);
});
