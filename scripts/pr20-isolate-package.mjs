/** Fail-closed release identity guard. Never mutate production files in CI.
 * A normal electron-builder invocation must be safe even without this script.
 */
import fs from "node:fs";
const main = fs.readFileSync("electron/main.cjs", "utf8");
const yaml = fs.readFileSync("electron-builder.yml", "utf8").replace(/\r\n/g, "\n");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
function assert(ok, why) { if (!ok) throw new Error("Unsafe private packaging: " + why); }
assert(main.includes('const PRODUCT_NAME = "LearnHarness Private";'), "Electron runtime must use the private product name");
assert(/function setupAutoUpdater\(\)\s*\{\s*\/\/[^\n]*\n\s*return;/.test(main), "updater must fail closed before any network activity");
assert(/^appId: org\.learnharness\.private\.windows$/m.test(yaml), "wrong appId");
assert(/^productName: LearnHarness Private$/m.test(yaml), "wrong product name");
assert(!/^publish:/m.test(yaml) && !/^\s+-\s+provider:\s+github\s*$/m.test(yaml), "upstream publish feed still configured");
assert(pkg.scripts["desktop:dist:win"]?.includes("--publish never"), "Windows build must never publish");
console.log("Verified private app identity, disabled updater, and no upstream publication feed.");
