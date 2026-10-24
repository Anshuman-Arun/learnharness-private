/** Run the independently developed subscription-adapter tests on Windows and Unix. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory = new URL('../tests/', import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const tests = readdirSync(directory).filter(name => name.endsWith('.test.mjs'))
  .sort().map(name => fileURLToPath(new URL(name, directory)));
if (tests.length < 1) throw new Error('No overlay tests discovered');
const run = spawnSync(process.execPath, ['--test', ...tests], {
  cwd:root, stdio:'inherit', env:{...process.env,NODE_ENV:'test'}
});
if (run.error) throw run.error;
process.exit(run.status ?? 1);
