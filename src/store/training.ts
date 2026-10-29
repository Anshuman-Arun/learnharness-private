import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";

/** Local training records; one file per entity, atomic replacement on the same filesystem. */
function directory(kind: string) {
	if (!/^[a-z][a-z-]{0,47}$/.test(kind)) throw new Error("Invalid training kind");
	return path.join(PATHS.data, "training", kind);
}
function location(kind: string, id: string) {
	if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid training record id");
	return path.join(directory(kind), `${id}.json`);
}
export const trainingStore = {
	read<T extends { version: number }>(kind: string, id: string): T | null {
		const file = location(kind, id);
		let text: string;
		try { text = fs.readFileSync(file, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
		const value: unknown = JSON.parse(text);
		if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) throw new Error("Unsupported training record version");
		return value as T;
	},
	list<T extends { version: number }>(kind: string): T[] {
		let names: string[];
		try { names = fs.readdirSync(directory(kind)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
		return names.filter((name) => name.endsWith(".json")).map((name) => this.read<T>(kind, name.slice(0, -5))).filter((value): value is T => value !== null);
	},
	write<T extends { version: 1; id: string }>(kind: string, value: T): void {
		const file = location(kind, value.id);
		// Reading first refuses a future version instead of overwriting it.
		this.read(kind, value.id);
		fs.mkdirSync(directory(kind), { recursive: true });
		const temporary = `${file}.${crypto.randomUUID()}.tmp`;
		try { fs.writeFileSync(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 }); fs.renameSync(temporary, file); }
		finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
	},
};
