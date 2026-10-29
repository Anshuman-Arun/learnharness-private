import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardHome } from "../components/dashboard-home.tsx";

const read = (path: string) => readFileSync(join(process.cwd(),path),"utf8");

test("study desk renders real-data placeholders and accessible atlas action", () => {
  const html = renderToStaticMarkup(createElement(DashboardHome,{onOpenAtlas:()=>{}}));
  assert.match(html,/data-testid="dashboard-home"/);
  assert.match(html,/Follow your/);
  assert.match(html,/Recent explorations/);
  assert.match(html,/Explore your graph/);
  assert.match(html,/Imported notes/);
  assert.match(html,/—/); // unknown counts must never look like zero
  assert.match(html,/Connected ideas/);
  assert.match(html,/A wandering path/);
});

test("home retains existing graph renderer and composer; new dashboard is default", () => {
  const home = read("components/home.tsx");
  assert.match(home,/<DashboardHome onOpenAtlas=/);
  assert.match(home,/<GraphView/);
  assert.match(home,/<MinimalHome/);
  assert.match(home,/data-testid="home-surface-toggle"/);
  assert.match(home,/data-testid="home-mode-switch"/);
  assert.match(home,/data-testid="home-graph-view-toggle"|<GraphView/);
  assert.match(home,/router.push\(\`\/chat\/\$\{id\}/);
});

test("logo uses one persisted accent for all three original shapes", () => {
  const mark = read("components/lh-mark.tsx");
  assert.equal((mark.match(/var\(--primary, #d47760\)/g) ?? []).length,3);
  assert.doesNotMatch(mark,/var\(--foreground/);
  const sidebar = read("components/sidebar.tsx");
  assert.match(sidebar,/<LhMark/);
  assert.match(sidebar,/data-testid="new-session"/);
  assert.match(sidebar,/data-testid="new-session-practice"/);
});

test("remove Background agents label without removing active process controls", () => {
  const activity = read("components/activity-dock.tsx");
  // Historical commentary is fine; the visible label must not render.
  assert.doesNotMatch(activity,/\n\s*Background agents\s*\n/);
  assert.match(activity,/data-testid="activity-total-cost"/);
  assert.match(activity,/data-testid="activity-abort"/);
  assert.match(activity,/data-testid="activity-blob-detail"/);
});
