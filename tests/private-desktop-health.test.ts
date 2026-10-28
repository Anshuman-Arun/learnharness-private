import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { GET } from "../app/api/desktop-health/route.ts";
describe("Electron private desktop health proof", () => {
  it("does not advertise a health secret or success in browser-only mode", () => {
    const value = process.env.LH_DESKTOP_HEALTH_SECRET;
    delete process.env.LH_DESKTOP_HEALTH_SECRET;
    try { assert.equal(GET().status, 404); }
    finally { if(value === undefined) delete process.env.LH_DESKTOP_HEALTH_SECRET; else process.env.LH_DESKTOP_HEALTH_SECRET = value; }
  });
  it("echoes only the per-launch secret as the readiness header", async () => {
    const prior = process.env.LH_DESKTOP_HEALTH_SECRET;
    const secret = "0123456789abcdefghijklmnopqrstuvwxyzSAFE";
    process.env.LH_DESKTOP_HEALTH_SECRET = secret;
    try {
      const answer = GET();
      assert.equal(answer.status, 200);
      assert.equal(answer.headers.get("x-lh-app-ready"), secret);
      assert.equal(answer.headers.get("cache-control"), "no-store");
      assert.equal((await answer.json()).ready, true);
    } finally { if(prior === undefined) delete process.env.LH_DESKTOP_HEALTH_SECRET; else process.env.LH_DESKTOP_HEALTH_SECRET = prior; }
  });
  it("desktop startup refuses an arbitrary 200 response without the correct proof", () => {
    const main = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
    assert.match(main, /res\.headers\["x-lh-app-ready"\] === healthSecret/);
    assert.match(main, /LH_DESKTOP_HEALTH_SECRET: healthSecret/);
    assert.match(main, /crypto\.randomBytes\(32\)/);
  });
});
