/**
 * Apply small, deliberately fail-closed Windows/private-app changes to an
 * UNMODIFIED LearnHarness checkout. No model-provider behavior is changed.
 * Run only after pushing the upstream clone to YOUR independent private repo.
 * Copyright (c) 2026. Local adaptation helper; see upstream AGPL-3.0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(thisDir, '..');
const target = path.resolve(process.argv[2] || '.');
const dryRun = process.argv.includes('--dry-run');
const must = (ok, reason) => { if (!ok) throw new Error(reason); };
const read = (p) => fs.readFileSync(path.join(target, p), 'utf8');
const planned = new Map();
const write = (p, s) => { planned.set(p, s); };
const exactReplace = (text, needle, replacement, label) => {
  const n = text.split(needle).length - 1;
  must(n === 1, `${label}: expected exactly one matching section, found ${n}. Upstream probably changed; STOP and review.`);
  return text.replace(needle, replacement);
};
try {
  const repo = JSON.parse(read('package.json'));
  must(repo.name === 'learnharness', 'Not a LearnHarness checkout; refused.');
  must(fs.existsSync(path.join(target, '.git')), 'Not a Git checkout; refused.');
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {cwd:target, encoding:'utf8'}).trim();
  must(!/amosblomqvist\/learnharness(?:\.git)?$/.test(remote),
    'origin still targets the UPSTREAM repository. Create and push an independent PRIVATE repo first, then rename upstream remote.');
  const status = execFileSync('git', ['status', '--porcelain'], {cwd:target, encoding:'utf8'});
  must(!status.trim(), 'Working tree is not clean; commit or stash changes before applying.');

  repo.scripts.test = 'node scripts/run-tests-private.mjs';
  repo.scripts['desktop:dev:win'] = 'node scripts/dev-desktop-private.mjs';
  repo.scripts['desktop:dist:win'] = 'node scripts/build-windows-private.mjs';
  write('package.json', JSON.stringify(repo, null, '\t') + '\n');

  let yml = read('electron-builder.yml');
  yml = exactReplace(yml, 'appId: com.learnharness.LearnHarness',
    'appId: org.learnharness.private.windows', 'builder appId');
  yml = exactReplace(yml, 'productName: LearnHarness',
    'productName: LearnHarness Private', 'builder productName');
  // A separately cloned/patched official DevKit is packaged as audited
  // extraResources. Use a parent `from: vendor` so electron-builder does
  // not omit the nested node_modules directory as a copy root.
  yml = exactReplace(yml, 'extraResources:\n',
    'extraResources:\n  - from: vendor\n    to: .\n    filter:\n      - "siwc-runtime/**/*"\n', 'private DevKit packaging');
  // Remove the entire upstream GitHub release feed. No automatic publish
  // target must be present in the private derivative.
  must(/\npublish:\s*\n/.test(yml), 'Expected upstream publish block; stop to review.');
  yml = yml.replace(/\npublish:\s*\n[\s\S]*$/, '\n# No publish provider: private builds must never use upstream releases.\n');
  write('electron-builder.yml', yml);

  // The runtime contains third-party SDK dependencies and is assembled on
  // the user's own machine. It must not become part of their source repo.
  let ignore = read('.gitignore');
  if (!ignore.split(/\r?\n/).includes('vendor/siwc-runtime/')) {
    ignore = ignore.replace(/\s*$/, '') + '\n\n# Locally staged, noncommercial ChatGPT SDK runtime (never commit)\nvendor/siwc-runtime/\n';
  }
  write('.gitignore', ignore);

  let main = read('electron/main.cjs');
  main = exactReplace(main, 'const PRODUCT_NAME = "LearnHarness";',
    'const PRODUCT_NAME = "LearnHarness Private";', 'Electron product name');
  // Kept as defense in depth even though the upstream feed is removed.
  main = exactReplace(main, 'function setupAutoUpdater() {',
    'function setupAutoUpdater() {\n\t// Private derivative: no update source until explicitly audited and configured.\n\tlog("Private edition: auto-update disabled");\n\treturn;', 'Updater entry point');
  write('electron/main.cjs', main);

  // Copy additive scripts and tests, but don't overwrite paths that exist.
  const additions = [
    'scripts/run-tests-private.mjs',
    'scripts/dev-desktop-private.mjs',
    'scripts/build-windows-private.mjs',
    'src/subscription/response-protocol.mjs',
    'src/subscription/pi-stream-bridge.mjs',
    'src/subscription/pi-tool-registry.mjs',
    'src/subscription/electron-credential-encryption.cjs',
    'src/subscription/pi-message-codec.mjs',
    'src/subscription/model-catalog.mjs',
    'src/subscription/inference-limits.mjs',
    'src/subscription/loopback-broker.cjs',
    'src/subscription/loopback-client.mjs',
    'src/subscription/electron-subscription-service.cjs',
    'src/subscription/devkit-event-stream.cjs',
    'scripts/patch-siwc-devkit.mjs',
    'scripts/stage-siwc-runtime.mjs',
    'scripts/siwc-structured-extension.ts',
    'tests/subscription-protocol-private.test.mjs',
    'tests/pi-stream-private.test.mjs',
    'tests/credential-encryption-private.test.mjs',
    'tests/pi-message-codec-private.test.mjs',
    'tests/model-catalog-private.test.mjs',
    'tests/inference-limits-private.test.mjs',
    'tests/subscription-history-roundtrip-private.test.mjs',
    'tests/subscription-loopback-private.test.mjs',
    'tests/subscription-service-private.test.mjs',
    'tests/devkit-event-stream-private.test.mjs',
    'tests/devkit-patcher-private.test.mjs',
    'tests/devkit-broker-integrated-private.test.mjs',
    'tests/siwc-packaging-private.test.mjs',
    'tests/private-foundation.test.mjs',
    'tests/agent-broker-roundtrip-private.test.mjs',
    'docs/PRIVATE-WINDOWS-IMPLEMENTATION.md',
    'docs/DEVKIT-INTEGRATION-DECISIONS.md',
    'CHANGELOG.md'
  ];
  for (const p of additions) {
    must(!fs.existsSync(path.join(target, p)), `File ${p} already exists; refused to overwrite.`);
    write(p, fs.readFileSync(path.join(kitRoot, p), 'utf8'));
  }
  if (dryRun) {
    console.log('Dry run OK: would edit/add these files:\n' + [...planned.keys()].join('\n'));
  } else {
    for (const [p, contents] of planned) {
      const dest = path.join(target,p);
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      fs.writeFileSync(dest, contents, 'utf8');
    }
    console.log('Private Windows foundation applied. Review git diff; do NOT publish upstream.');
    console.log('Next: npm ci; npm test; npm run lint; npm run typecheck; npm run desktop:dev:win');
  }
} catch (err) {
  console.error(`No modifications applied: ${err.message}`);
  process.exitCode = 1;
}
