import { parseCppWorkspace, type CppWorkspace } from "../core/cpp-workspace.ts";
import { stores } from "./stores.ts";

export function listCppWorkspaces(): CppWorkspace[] {
	return stores.trainingStore.list<CppWorkspace>("cpp-workspace").sort((a, b) => b.updatedAt - a.updatedAt);
}
export function saveCppWorkspace(body: unknown): CppWorkspace {
	const parsed = parseCppWorkspace(body);
	const current = stores.trainingStore.read<CppWorkspace>("cpp-workspace", parsed.id);
	const revision = (body as { revision?: unknown }).revision;
	if (revision !== (current?.revision ?? 0)) throw new Error("This workspace changed in another tab. Reload it before saving to avoid losing work.");
	const saved: CppWorkspace = { ...parsed, revision: (current?.revision ?? 0) + 1, updatedAt: Date.now() };
	stores.trainingStore.write("cpp-workspace", saved);
	return saved;
}
