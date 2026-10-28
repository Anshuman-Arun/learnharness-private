/**
 * Sign in with ChatGPT Responses API admission contract (October 2026).
 *
 * pi-ai uses the regular Platform Responses serializer. Its default
 * top-level function tools and system-role messages are not permitted on
 * token-sharing requests, even when store:false/stream:true are set.
 * This *only* runs for the explicitly selected openai-chatgpt alias:
 * ordinary paid API-key OpenAI calls preserve their original semantics.
 *
 * https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
 */
const DISALLOWED_FIELDS = [
	"background", "conversation", "max_output_tokens", "max_tool_calls",
	"metadata", "moderation", "multi_agent", "prompt",
	"prompt_cache_retention", "prompt_cache_options",
	"safety_identifier", "temperature", "top_logprobs", "top_p",
	"truncation", "user", "previous_response_id",
] as const;

function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Return a new payload, preserving full transcript context, while failing
 * closed on unsupported tool types. Never mutate pi-ai's reusable catalog
 * or the original request object.
 */
export function prepareChatGPTResponsesPayload<T extends { input: unknown }>(params: T): T {
	if (!object(params) || !Array.isArray(params.input)) {
		throw new Error("ChatGPT plan requires the complete array of input history.");
	}
	const prepared = { ...params } as T & Record<string, unknown>;
	const input = params.input.map((item) => {
		if (!object(item)) throw new Error("ChatGPT plan received a malformed transcript item.");
		if (item.type === "tool_search_call" || item.type === "tool_search_output") {
			throw new Error("Hosted Responses tool_search is unsupported with ChatGPT plan tokens.");
		}
		// The preview forbids explicit system-role input items. Preserve
		// their instructions in developer-role messages (not user text).
		if (item.role === "system") return { ...item, role: "developer" };
		return item;
	});
	const topLevelTools = (params as T & Record<string, unknown>).tools;
	if (topLevelTools !== undefined) {
		if (!Array.isArray(topLevelTools)) throw new Error("ChatGPT plan received an invalid tool catalog.");
		if (topLevelTools.length > 0) {
			for (const tool of topLevelTools) {
				if (!object(tool) || (tool.type !== "function" && tool.type !== "custom")) {
					throw new Error("This hosted tool cannot run through ChatGPT plan token-sharing.");
				}
			}
			// Local function/custom tools must be inside input's
			// additional_tools items, not the Platform top-level tools.
			input.unshift({ type: "additional_tools", role: "developer", tools: topLevelTools });
		}
	}
	delete prepared.tools;
	for (const field of DISALLOWED_FIELDS) delete prepared[field];
	prepared.input = input;
	prepared.store = false;
	prepared.stream = true;
	return prepared;
}
