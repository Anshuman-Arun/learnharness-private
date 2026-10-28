import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareChatGPTResponsesPayload as prepare } from "../src/agent/chatgpt-responses-payload.ts";
import { readFileSync } from "node:fs";

describe("SIWC live inference payload compatibility", () => {
	it("converts teaching system instructions into allowed developer messages and local tools into additional_tools", () => {
		const original = {
			model:"gpt-6.1-sol", store:true, stream:false, temperature:0.4, max_output_tokens:4096,
			previous_response_id:"resp_123", metadata:{secret:"should-not-be-serialized"},
			prompt_cache_retention:"24h", prompt_cache_options:{ttl:"30m"},
			input:[
				{role:"system",content:"Teach rigorously"},
				{role:"user",content:"Help me learn probability"},
				{role:"system",content:"Now use the graph tool"},
				{role:"assistant",content:"We can reason from first principles"},
			],
			tools:[{type:"function",name:"draw_graph",parameters:{type:"object",properties:{}},description:"Graph it"}],
		};
		const result = prepare(original);
		assert.equal(result.store,false);
		assert.equal(result.stream,true);
		assert.equal("tools" in result,false);
		assert.equal("temperature" in result,false);
		assert.equal("metadata" in result,false);
		assert.equal("max_output_tokens" in result,false);
		assert.equal("previous_response_id" in result,false);
		assert.equal("prompt_cache_retention" in result,false);
		assert.equal("prompt_cache_options" in result,false);
		assert.deepEqual(result.input[0],{
			type:"additional_tools",role:"developer",tools:original.tools,
		});
		assert.equal((result.input[1] as {role:string}).role,"developer");
		assert.equal((result.input[2] as {role:string}).role,"user");
		assert.equal((result.input[3] as {role:string}).role,"developer");
		assert.equal((result.input[4] as {role:string}).role,"assistant");
		assert.equal(original.input[0].role,"system","do not rewrite reusable source transcript");
		assert.equal(original.store,true,"source request is unchanged");
	});
	it("rejects disallowed hosted tools and malformed/nonarray payloads before network submission",()=>{
		for(const type of ["web_search","file_search","computer","code_interpreter","tool_search"]){
			assert.throws(()=>prepare({input:[{role:"user",content:"x"}],tools:[{type}]}),/hosted tool/);
		}
		assert.throws(()=>prepare({input:undefined}),/array of input history/);
		assert.throws(()=>prepare({input:[null]}),/malformed transcript item/);
		assert.throws(()=>prepare({input:[{type:"tool_search_call"}]}),/tool_search/);
	});
	it("does not strip unrelated provider fields or valid tool result history",()=>{
		const payload=prepare({model:"gpt-4o",input:[
			{type:"function_call_output",call_id:"call_1",output:"done"},
			{role:"user",content:"continue"},
		], tools:[],instructions:"Use a worked example",include:["reasoning.encrypted_content"]});
		assert.equal(payload.instructions,"Use a worked example");
		assert.deepEqual(payload.include,["reasoning.encrypted_content"]);
		assert.equal(payload.input.length,2);
	});
	it("wires the payload normalization ONLY into subscription engine, after other onPayload handlers",()=>{
		const source=readFileSync(new URL("../src/agent/models.ts",import.meta.url),"utf8");
		assert.match(source,/usesChatGPT \? \{/);
		assert.match(source,/prepareChatGPTResponsesPayload\(changed \?\? payload\)/);
	});
});
