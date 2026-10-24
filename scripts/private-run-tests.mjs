/**
 * Cross-platform runner for the original LearnHarness test suite.
 * Keeps NODE_ENV=test without using Unix-only shell assignment syntax.
 * Exposes every tests/*.test.ts(x) file as an explicit argument so Windows
 * does not depend on shell glob expansion.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
// Four upstream suites hard-code POSIX filesystem paths or public-release
// semantics. Keep them in Linux CI; Windows runs all remaining tests, and
// the private packaging contract is tested by desktop-platform.test.ts.
const upstreamWindowsIncompatible = new Set([
  "auth-store.test.ts",
  "data-dir-seam.test.ts",
  "schema-stamps.test.ts",
  "verify-release.test.ts",
]);
const files = readdirSync("tests")
  .filter((file) => /\.test\.tsx?$/.test(file) && (process.platform !== "win32" || !upstreamWindowsIncompatible.has(file)))
  .sort()
  .map((file) => join("tests", file));
if (files.length === 0) {
  console.error("Refusing to succeed without tests.");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  env: {...process.env, NODE_ENV: "test"},
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) {
  console.error("Unable to start the TypeScript test runner:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
