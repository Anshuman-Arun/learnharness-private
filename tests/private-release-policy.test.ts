import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
describe("private Windows release safety (source-level and packaging)", () => {
  const main = read("../electron/main.cjs");
  const builder = require("js-yaml").load(read("../electron-builder.yml"));
  it("separates installed userData and Windows executable from both upstream and PR20 Test", () => {
    assert.match(main, /const PRODUCT_NAME = "LearnHarness Private";/);
    assert.match(main, /app\.setName\(PRODUCT_NAME\)/);
    assert.equal(builder.productName, "LearnHarness Private");
    assert.equal(builder.appId, "org.learnharness.private.windows");
    assert.notEqual(builder.productName, "LearnHarness PR20 Test");
  });
  it("cannot accidentally subscribe to upstream or publish a private build", () => {
    const updater = main.slice(main.indexOf("function setupAutoUpdater() {"));
    assert.match(updater, /^function setupAutoUpdater\(\) \{\s*\/\/[^\n]+\n\s*return;/);
    assert.equal(builder.publish, undefined);
    assert.doesNotMatch(read("../scripts/pr20-isolate-package.mjs"), /fs\.writeFileSync/);
    const pkg = JSON.parse(read("../package.json"));
    assert.match(pkg.scripts["desktop:dist:win"], /--publish never/);
  });
  it("refuses to reuse stale OAuth executables in local build helper", () => {
    const helper = read("../scripts/build-private-windows.ps1");
    assert.match(helper, /Old executable grafting is retired/);
    assert.doesNotMatch(helper, /robocopy|Copy-VerifiedTree/);
  });
});
