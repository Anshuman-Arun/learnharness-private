import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import type { DocumentSource } from "../core/documents.ts";
import type { DocumentStore } from "../core/ports.ts";
const root = () => path.join(PATHS.data, "documents");
function directory(id: string) {
	if (!/^doc_[a-f0-9]{32}$/.test(id)) throw new Error("Invalid source ID");
	return path.join(root(), id);
}
export const documentStore: DocumentStore = {
	list() {
		if (!fs.existsSync(root())) return [];
		return fs
			.readdirSync(root())
			.filter((name) => /^doc_[a-f0-9]{32}$/.test(name))
			.map((id) => this.read(id))
			.filter((s): s is DocumentSource => !!s)
			.sort((a, b) => b.updatedAt - a.updatedAt);
	},
	read(id) {
		const file = path.join(directory(id), "source.json");
		if (!fs.existsSync(file)) return null;
		const source = JSON.parse(fs.readFileSync(file, "utf8"));
		if (source.version !== 1) throw new Error("Unsupported source format; refusing to overwrite it");
		return source;
	},
	write(source) {
		this.read(source.id);
		const folder = directory(source.id);
		fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
		const file = path.join(folder, "source.json"),
			temporary = file + "." + crypto.randomUUID() + ".tmp";
		try {
			fs.writeFileSync(temporary, JSON.stringify(source), { mode: 0o600 });
			fs.renameSync(temporary, file);
		} finally {
			if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
		}
	},
	writePdf(id, bytes) {
		const folder = directory(id);
		fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
		const file = path.join(folder, "original.pdf");
		if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
	},
	readPageImage(id, page) {
		if (!Number.isInteger(page) || page < 1 || page > 5000) throw new Error("Invalid page");
		const file = path.join(directory(id), `page-${page}.png`);
		return fs.existsSync(file) ? fs.readFileSync(file) : null;
	},
	writePageImage(id, page, bytes) {
		if (!Number.isInteger(page) || page < 1 || page > 5000) throw new Error("Invalid page");
		fs.writeFileSync(path.join(directory(id), `page-${page}.png`), bytes, { mode: 0o600 });
	},
	pdfPath(id) {
		return path.join(directory(id), "original.pdf");
	},
};
