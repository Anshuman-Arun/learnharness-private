/**
 * Second-stage, fail-closed integration into LearnHarness's pi-ai registry.
 * Run AFTER apply-private-foundation.mjs against a private checkout.
 * Refuses ambiguous/upstream-drifted transformations before writing files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(process.argv[2]||'.');
const dry=process.argv.includes('--dry-run');
const kit=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const changes=new Map();
const requireTrue=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function replaceOnce(body,needle,replacement,label){
  const hits=body.split(needle).length-1;
  requireTrue(hits===1,`${label}: expected one match, got ${hits}; stop and review upstream changes`);
  return body.replace(needle,replacement);
}
function edit(p,callback){changes.set(p,callback(read(p)));}
try{
  requireTrue(JSON.parse(read('package.json')).name==='learnharness','Refused: not a LearnHarness repository');
  requireTrue(fs.existsSync(path.join(root,'src/subscription/pi-stream-bridge.mjs')),
    'Apply the Windows foundation overlay first.');
  requireTrue(!read('src/agent/models.ts').includes('chatgpt-plan-provider'),
    'Provider integration already appears applied.');
  edit('src/agent/models.ts', s=>{
    s=replaceOnce(s,'\tcreateModels,\n','\tcreateModels,\n\tcreateAssistantMessageEventStream,\n','pi-ai stream constructor');
    s=replaceOnce(s,'import packageMetadata from "../../package.json" with { type: "json" };',
      'import packageMetadata from "../../package.json" with { type: "json" };\nimport { createPlanProvider } from "../subscription/pi-provider.mjs";\nimport type { Provider } from "@earendil-works/pi-ai";',
      'models imports');
    s=replaceOnce(s,'let collection: ReturnType<typeof createModels> | undefined;',
      'let collection: ReturnType<typeof createModels> | undefined;\nlet planProvider: ReturnType<typeof createPlanProvider> | undefined;\n\n/** Account catalog refresh remains explicit; the renderer cannot obtain credentials. */\nexport async function syncChatGPTPlanModels(): Promise<void> {\n\tif (!planProvider) piModels();\n\tawait planProvider?.syncModels();\n}', 'models singleton');
    s=replaceOnce(s,'\t\tfor (const provider of builtinProviders()) collection.setProvider(provider);',
      '\t\tfor (const provider of builtinProviders()) collection.setProvider(provider);\n\t\tplanProvider = createPlanProvider({ makeEventStream: createAssistantMessageEventStream });\n\t\tcollection.setProvider(planProvider as unknown as Provider);', 'provider registration');
    return s;
  });
  edit('src/server/model-catalog.ts',s=>{
    s=replaceOnce(s,'import { piModels } from "../agent/models.ts";',
      'import { piModels, syncChatGPTPlanModels } from "../agent/models.ts";\nimport { hasDesktopPlanBroker } from "../subscription/pi-provider.mjs";', 'catalog imports');
    s=replaceOnce(s,'export function catalogProviders(): CatalogProvider[] {\n\treturn AUTH_PROVIDER_KEYS.map((p) => ({',
      'export function catalogProviders(): CatalogProvider[] {\n\tconst all = AUTH_PROVIDER_KEYS.map((p) => ({', 'provider entries');
    s=replaceOnce(s,'\t})).sort((a, b) => a.id.localeCompare(b.id));\n}\n\n/** The providers whose key is present',
      '\t}));\n\tif (hasDesktopPlanBroker()) all.push({ id: "chatgpt-plan", envVar: "", keyPresent: true });\n\treturn all.sort((a, b) => a.id.localeCompare(b.id));\n}\n\n/** The providers whose key is present', 'provider finish');
    s+='\n/** Refresh the actual model entitlements from the trusted desktop before GET /api/models. */\nexport async function refreshPlanModels(): Promise<void> {\n\tawait syncChatGPTPlanModels();\n}\n';
    return s;
  });
  edit('app/api/models/route.ts',s=>{
    s=replaceOnce(s,'import { modelCatalog } from "@/src/server";',
      'import { modelCatalog, refreshPlanModels } from "@/src/server";', 'model route import');
    s=replaceOnce(s,'export async function GET() {\n\treturn Response.json(modelCatalog());',
      'export async function GET() {\n\tawait refreshPlanModels();\n\treturn Response.json(modelCatalog());', 'model route refresh');
    return s;
  });
  edit('src/server/keys.ts',s=>{
    s=replaceOnce(s,'export function providerKeyPresent(provider: string): boolean {\n',
      'export function providerKeyPresent(provider: string): boolean {\n\tif (provider === "chatgpt-plan") {\n\t\treturn Boolean(process.env.LH_SUBSCRIPTION_BROKER_PORT && process.env.LH_SUBSCRIPTION_BROKER_SECRET);\n\t}\n','auth gate');
    return s;
  });
  edit('electron/main.cjs', s=>{
    s=replaceOnce(s, 'const { app, BrowserWindow, Menu, ipcMain, session, shell, dialog } = require("electron");',
      'const { app, BrowserWindow, Menu, ipcMain, session, shell, dialog, safeStorage } = require("electron");', 'Electron safeStorage import');
    s=replaceOnce(s, 'const PRODUCT_NAME = "LearnHarness Private";',
      'const PRODUCT_NAME = "LearnHarness Private";\nconst { startPrivateSubscription } = require("./private-subscription/init.cjs");', 'desktop private identity');
    s=replaceOnce(s, 'let serverProcess = null;',
      'let serverProcess = null;\nlet privateSubscription = null;', 'trusted broker singleton');
    s=replaceOnce(s, 'ELECTRON_RUN_AS_NODE: "1",',
      'ELECTRON_RUN_AS_NODE: "1",\n\t\t\t\t\t...(privateSubscription?.childEnvironment ?? {}),', 'child broker env');
    s=replaceOnce(s, 'function startServer(port) {',
      `/** Development Next child inherits the trusted Electron broker environment. */
function startPrivateDevServer() {
  const nextCli = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextCli, "dev"], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...(privateSubscription?.childEnvironment ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess = child;
  child.stdout.on("data", (buf) => log(\`next-dev: \${String(buf).trimEnd()}\`));
  child.stderr.on("data", (buf) => log(\`next-dev error: \${String(buf).trimEnd()}\`));
  child.on("exit", (code) => { log(\`next-dev exited (\${code})\`); serverProcess = null; });
  return child;
}

function startServer(port) {`, 'Next dev owned by Electron');
    s=replaceOnce(s, 'await app.whenReady();\n\n\t// Dev mode:',
      'await app.whenReady();\n\tprivateSubscription = await startPrivateSubscription({ app, shell, safeStorage, log });\n\n\t// Dev mode:', 'desktop broker startup');
    s=replaceOnce(s, '} else {\n\t\tlog(`dev mode: ${devUrl}`);\n\t}\n\n\tinstallMenu();',
      '} else {\n\t\tlog(`dev mode: ${devUrl}`);\n\t\tif (process.env.LH_PRIVATE_NEXT_DEV === "1") {\n\t\t\tstartPrivateDevServer();\n\t\t\tawait waitUntilUp(url);\n\t\t}\n\t}\n\n\tinstallMenu();', 'private Next dev boot');
    s=replaceOnce(s, 'app.on("before-quit", killServer);',
      'app.on("before-quit", killServer);\n\tapp.on("before-quit", () => { void privateSubscription?.close().catch(() => {}); });', 'desktop broker stop');
    s=replaceOnce(s, '{ label: "Check for Updates…", click: () => checkForUpdates({ manual: true }) },',
      '{ label: "Check for Updates…", click: () => checkForUpdates({ manual: true }) },\n\t\t\t\t{ label: "Connect ChatGPT…", enabled: Boolean(privateSubscription), click: () => {\n\t\t\t\t\tvoid privateSubscription.service.signIn().then(() => dialog.showMessageBox({type: "info",message: "ChatGPT account connected.",detail: "Open Models in LearnHarness to refresh available models. Tool-enabled inference requires the reviewed SDK streaming extension."})).catch(() => dialog.showMessageBox({type: "warning",message: "ChatGPT sign-in was not completed."}));\n\t\t\t\t} },', 'native ChatGPT sign-in action');
    return s;
  });
  const additions=[
    'src/subscription/pi-provider.mjs','tests/pi-provider-private.test.mjs',
    'electron/private-subscription/init.cjs',
    'electron/private-subscription/loopback-broker.cjs',
    'electron/private-subscription/electron-subscription-service.cjs',
    'electron/private-subscription/devkit-event-stream.cjs',
    'electron/private-subscription/electron-credential-encryption.cjs',
    'tests/private-electron-boot.test.mjs'
  ];
  for(const p of additions){
    requireTrue(!fs.existsSync(path.join(root,p)),`Will not overwrite ${p}`);
    changes.set(p,fs.readFileSync(path.join(kit,p),'utf8'));
  }
  if(dry)console.log('Provider integration preview:\n'+[...changes.keys()].join('\n'));
  else {
    for(const [p,txt] of changes){const out=path.join(root,p);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,txt);}
    console.log('ChatGPT-plan provider added to native model registry. No live OAuth connection implied.');
  }
}catch(e){console.error(`No integration files changed: ${e.message}`);process.exitCode=1;}
