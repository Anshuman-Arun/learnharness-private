import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = (name: string) => readFileSync(join(process.cwd(), name), "utf8");

test("editorial theme mounts inside the existing application shell", () => {
  const layout = file("app/layout.tsx");
  assert.match(layout, /import "\.\/editorial\.css"/);
  assert.match(layout, /data-lh-editorial="v10"/);
  assert.match(layout, /<AppShell>\{children\}<\/AppShell>/);
});

test("the theme preserves existing session actions and graph paths", () => {
  const sidebar = file("components/sidebar.tsx");
  const home = file("components/home.tsx");
  const composer = file("components/composer.tsx");
  assert.match(sidebar, /data-testid="new-session"/);
  assert.match(sidebar, /data-testid="new-session-practice"/);
  assert.match(sidebar, /data-active=\{active\}/);
  assert.match(home, /<GraphView/);
  assert.match(home, /<MinimalHome/);
  assert.match(composer, /onSubmit=\{\(e\) =>/);
  assert.match(composer, /data-testid="composer"/);
});

test("editorial palette has its expected tokens without adding interview runtime", () => {
  const css = file("app/editorial.css");
  assert.match(css, /--background: #2a2825/);
  assert.match(css, /--card: #34312d/);
  assert.match(css, /--primary: #d47760/);
  assert.doesNotMatch(css, /@import\s+url\(/);
  assert.doesNotMatch(file("package.json"), /tldraw/);
});
