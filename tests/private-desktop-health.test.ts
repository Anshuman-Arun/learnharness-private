import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { GET } from "../app/api/desktop-health/route.ts";
const request = (challenge: string) =>
  new Request("http://127.0.0.1:44001/api/desktop-health?challenge="+encodeURIComponent(challenge));
describe("Electron private desktop health challenge", () => {
  it("does not advertise any secret or readiness in browser-only mode", () => {
    const previous=process.env.LH_DESKTOP_HEALTH_SECRET;
    delete process.env.LH_DESKTOP_HEALTH_SECRET;
    try { assert.equal(GET(request("abcdefghijklmnopqrstuvwxyz123456")).status,404); }
    finally { if(previous===undefined)delete process.env.LH_DESKTOP_HEALTH_SECRET;else process.env.LH_DESKTOP_HEALTH_SECRET=previous; }
  });
  it("rejects malformed or missing probes rather than publishing the secret", () => {
    const previous=process.env.LH_DESKTOP_HEALTH_SECRET;
    process.env.LH_DESKTOP_HEALTH_SECRET="unit-test-long-private-secret-not-to-echo";
    try {
      assert.equal(GET(request("hi")).status,400);
      assert.equal(GET(new Request("http://127.0.0.1:44001/api/desktop-health")).status,400);
    } finally { if(previous===undefined)delete process.env.LH_DESKTOP_HEALTH_SECRET;else process.env.LH_DESKTOP_HEALTH_SECRET=previous; }
  });
  it("returns an HMAC bound to the fresh challenge; never echoes the private secret", async()=>{
    const previous=process.env.LH_DESKTOP_HEALTH_SECRET;
    const secret="unit-test-long-private-secret-not-to-echo";
    const challenge="abcdefghijklmnopqrstuvwxyz123456";
    process.env.LH_DESKTOP_HEALTH_SECRET=secret;
    try {
      const result=GET(request(challenge));
      const proof=result.headers.get("x-lh-app-ready");
      assert.equal(result.status,200);
      assert.equal(proof,crypto.createHmac("sha256",secret).update(challenge).digest("base64url"));
      assert.notEqual(proof,secret);
      assert.notEqual(proof,GET(request("anotherchallengerandom123456789")).headers.get("x-lh-app-ready"));
      assert.equal(result.headers.get("cache-control"),"no-store");
      assert.equal((await result.json()).ready,true);
    } finally { if(previous===undefined)delete process.env.LH_DESKTOP_HEALTH_SECRET;else process.env.LH_DESKTOP_HEALTH_SECRET=previous; }
  });
  it("desktop probe verifies HMAC of each independent fresh nonce and enforces bounded startup",()=>{
    const main=readFileSync(new URL("../electron/main.cjs",import.meta.url),"utf8");
    assert.match(main,/crypto\.createHmac\("sha256", healthSecret\)/);
    assert.match(main,/challengeUrl\.searchParams\.set\("challenge", nonce\)/);
    assert.match(main,/res\.headers\["x-lh-app-ready"\] === expected/);
    assert.match(main,/LH_DESKTOP_HEALTH_SECRET: healthSecret/);
    assert.match(main,/const deadline = Date\.now\(\) \+ 30_000/);
    assert.match(main,/serverProcess\.exitCode !== null/);
  });
});
