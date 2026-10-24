/**
 * CI packaging-only transform: preserve the PR20 source for all upstream
 * regression and release-policy tests. Only AFTER those tests and builds
 * pass, isolate the *portable Windows artifact* from the installed app.
 *
 * This script runs only in a disposable GitHub Actions workspace.
 * Fail closed on every source anchor; no uploads/releases or credentials.
 */
import fs from "node:fs";
function once(s,a,b) {
  if(s.split(a).length!==2) throw new Error("PR20 packaging anchor changed: "+a);
  return s.replace(a,b);
}
const mainFile="electron/main.cjs",yamlFile="electron-builder.yml";
let main=fs.readFileSync(mainFile,"utf8");
// Git for Windows can check out YAML with CRLF. Canonicalize before matching
// its section headings; do not change the app's source semantics.
let yaml=fs.readFileSync(yamlFile,"utf8").replace(/\r\n/g,"\n");
main=once(main,'const PRODUCT_NAME = "LearnHarness";','const PRODUCT_NAME = "LearnHarness PR20 Test";');
main=once(main,'function setupAutoUpdater() {','function setupAutoUpdater() {\n\t// Evaluation app must never install updates from upstream.\n\treturn;');
yaml=once(yaml,'appId: com.learnharness.LearnHarness','appId: org.learnharness.private.pr20-test');
yaml=once(yaml,'productName: LearnHarness','productName: LearnHarness PR20 Test');
const publish=yaml.indexOf("\npublish:\n");
if(publish===-1)throw new Error("Expected upstream publish policy missing");
yaml=yaml.slice(0,publish)+'\n# No release feed for isolated PR20 evaluation.\n';
fs.writeFileSync(mainFile,main);
fs.writeFileSync(yamlFile,yaml);
console.log("Prepared isolated PR20 test package (no upstream updater).");
