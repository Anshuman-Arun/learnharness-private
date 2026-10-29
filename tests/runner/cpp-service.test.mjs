import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import { createCppRunnerServer, executeCpp } from "../../runner/cpp-service.mjs";

const containers = () => execFileSync("docker", ["ps", "--filter", "name=lh-cpp-", "--format", "{{.Names}}"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).sort();
const before = containers();
after(() => assert.deepEqual(containers(), before, "test runs leave no compiler containers behind"));
const source = (text) => ({ files: [{ name: "main.cpp", source: text }], stdin: "" });

describe("real isolated C++ execution", () => {
	it("compiles multiple files, reads stdin and judges fresh test processes", async () => {
		const result = await executeCpp({ files: [{ name: "main.cpp", source: '#include <iostream>\n#include "helper.hpp"\nint main(){int a,b;std::cin>>a>>b;std::cout<<sum(a,b)<<"\\n";}' }, { name: "helper.hpp", source: "int sum(int a,int b){return a+b;}" }], stdin: "", cases: [{ name: "Positive", stdin: "2 3", expected: "5" }, { name: "Negative", stdin: "-8 3", expected: "-5\r\n" }] });
		assert.equal(result.ok, true); assert.deepEqual(result.cases.map((test) => test.passed), [true, true]);
	});
	it("returns genuine compiler diagnostics and failed assertions distinctly", async () => {
		const compilation = await executeCpp(source("int main( {"));
		assert.equal(compilation.errorKind, "compile"); assert.match(compilation.compileError, /error:/);
		const checked = await executeCpp({ ...source('#include <iostream>\nint main(){std::cout<<4;}'), cases: [{ name: "Expected five", stdin: "", expected: "5" }] });
		assert.equal(checked.errorKind, "checks"); assert.equal(checked.cases[0].passed, false);
	});
	it("runs without host credentials, host mounts, root access or a writable root filesystem", async () => {
		const result = await executeCpp(source('#include <iostream>\n#include <fstream>\n#include <unistd.h>\n#include <cstdlib>\nint main(){std::ofstream f("/etc/lh-test");std::ifstream h("/workspace/learnharness-private/package.json");std::cout<<getuid()<<" "<<(std::getenv("GH_TOKEN")!=nullptr)<<" "<<f.good()<<" "<<h.good();}'));
		assert.equal(result.ok, true); assert.equal(result.stdout, "65534 0 0 0");
	});
	it("terminates an infinite program and bounds excessive output", async () => {
		const timed = await executeCpp(source("int main(){while(true){}}"));
		assert.equal(timed.errorKind, "timeout"); assert.equal(timed.timedOut, true);
		const loud = await executeCpp(source('#include <iostream>\nint main(){while(true)std::cout<<"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\n";}'));
		assert.equal(loud.errorKind, "output-limit"); assert.ok(loud.stdout.length + loud.stderr.length <= 262144);
	});
	it("surfaces sanitizer diagnostics for an out-of-bounds write", async () => {
		const result = await executeCpp({ ...source('#include <iostream>\nint main(){int* p=new int[1];volatile int i=2;p[i]=7;std::cout<<p[i];delete[] p;}'), sanitize: true });
		assert.equal(result.ok, false); assert.match(result.stderr, /AddressSanitizer|runtime error/);
	});
	it("cancels a request and cleans its container", async () => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 600);
		try { await assert.rejects(executeCpp(source("int main(){while(true){}}"), controller.signal)); }
		finally { clearTimeout(timer); }
	});
	it("requires authentication before accepting source and rejects malformed requests", async () => {
		const token = randomBytes(32).toString("hex"), server = createCppRunnerServer(token);
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const url = `http://127.0.0.1:${server.address().port}`;
		try {
			assert.equal((await fetch(url + "/health")).status, 200);
			assert.equal((await fetch(url + "/execute", { method: "POST", body: "{}" })).status, 401);
			assert.equal((await fetch(url + "/execute", { method: "POST", headers: { "x-lh-runner-token": token }, body: "{}" })).status, 400);
		} finally { await new Promise((resolve) => server.close(resolve)); }
	});
});

it('keeps earlier case outcomes when a later case exceeds its output limit', async () => {
 const result = await executeCpp({files:[{name:'main.cpp',source:'#include <iostream>\nint main(){int n;std::cin>>n;if(n==0){std::cout<<"ok\\n";return 0;}for(;;)std::cout<<"overflow-output-";}'}],stdin:'',cases:[{name:'Example 1',stdin:'0',expected:'ok\n'},{name:'Hidden 1',stdin:'1',expected:'never'}]});
 assert.equal(result.errorKind,'output-limit');
 assert.equal(result.cases?.length,2);
 assert.equal(result.cases?.[0].passed,true);
 assert.equal(result.cases?.[1].passed,false);
});
