import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchCatalog } from "../components/model-picker.tsx";

describe("adversarial model-catalog refresh ordering", () => {
	it("rejects an old account response after a later forced refresh; never re-caches it", async () => {
		const originalFetch = globalThis.fetch;
		const queued: Array<(response: Response) => void> = [];
		const payload = (id: string) => Response.json({models: [{provider:"openai-chatgpt",id}],providers:[],slots:{},defaults:null,rolePins:{}});
		try {
			globalThis.fetch = async () => new Promise<Response>((resolve) => { queued.push(resolve); });
			const first = fetchCatalog(true);
			const stale = assert.rejects(first, /Superseded model catalog/);
			const second = fetchCatalog(true);
			assert.equal(queued.length,2);
			queued[1]!(payload("new-account-model"));
			assert.equal((await second).models[0]?.id,"new-account-model");
			queued[0]!(payload("revoked-account-model"));
			await stale;
			const cached = await fetchCatalog();
			assert.equal(cached.models[0]?.id,"new-account-model");
			assert.equal(queued.length,2);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
	it("on failure discards the previous entitlement list and permits a clean retry", async () => {
		const previousFetch = globalThis.fetch;
		let count = 0;
		try {
			globalThis.fetch = async () => {
				count += 1;
				if (count === 1) return new Response(null,{status:503});
				return Response.json({models:[],providers:[],slots:{},defaults:null,rolePins:{}});
			};
			await assert.rejects(fetchCatalog(true),/503/);
			const updated = await fetchCatalog();
			assert.deepEqual(updated.models,[]);
			assert.equal(count,2);
		} finally {globalThis.fetch=previousFetch;}
	});
});
