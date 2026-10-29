import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SIDEBAR_NAV_ITEMS } from "../components/sidebar.tsx";

const sidebar = readFileSync("components/sidebar.tsx","utf8");
const home = readFileSync("components/home.tsx","utf8");
const activity = readFileSync("components/activity-dock.tsx","utf8");
const css = readFileSync("app/editorial.css","utf8");

test("sidebar has exactly the requested six numbered destinations",()=>{
  assert.deepEqual(SIDEBAR_NAV_ITEMS.map(({number,id,label})=>({number,id,label})), [
    {number:"01",id:"home",label:"Home"},
    {number:"02",id:"sessions",label:"Sessions"},
    {number:"03",id:"knowledge",label:"Knowledge"},
    {number:"04",id:"learning-map",label:"Learning map"},
    {number:"05",id:"training",label:"Training"},
    {number:"06",id:"settings",label:"Settings"},
  ]);
  assert.match(sidebar,/aria-label="Navigation" data-testid="sidebar-navigation"/);
  assert.match(sidebar,/aria-current=\{selected \? "page" : undefined\}/);
  assert.match(sidebar,/data-testid=\{item.id === "settings" \? "settings-entry"/);
  assert.match(css,/lh-sidebar-nav-number[\s\S]*?font:600 11px\/1/);
  assert.match(css,/width:29px; height:28px/);
});

test("all numbered links reuse actual app features, not placeholder destinations",()=>{
  assert.match(sidebar,/router.push\("\/learning-map"\)/);
  assert.match(sidebar,/router.push\("\/training"\)/);
  assert.match(sidebar,/searchRef.current\?\.focus\(\)/);
  assert.match(sidebar,/router.push\("\/\?view=atlas"\)/);
  assert.match(sidebar,/openSettings\(\)/);
  assert.match(home,/lh:home-view/);
  assert.match(home,/lh:home-surface/);
  assert.match(sidebar,/data-testid="new-session"/);
  assert.match(sidebar,/data-testid="new-session-practice"/);
  assert.doesNotMatch(sidebar,/>Quant training<\/Link>/);
  assert.equal((sidebar.match(/settings-entry/g)||[]).length,1,"one settings entry, not an extra bottom row");
});

test("activity doesn't reserve a decorative sidebar section when idle",()=>{
  assert.match(activity,/if \(blobs.length === 0\) return null/);
  assert.doesNotMatch(activity,/<ActivityIcon/);
  assert.match(activity,/data-testid="activity-total-cost"/);
  assert.match(activity,/data-testid="activity-abort"/);
});
