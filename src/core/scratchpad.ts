export interface ScratchpadPage {
	id: string; name: string; elements: Record<string, unknown>[];
	view: { scrollX: number; scrollY: number; zoom: number; backgroundColor: string };
}
export interface Scratchpad {
	version: 1; id: string; revision: number; title: string; pages: ScratchpadPage[];
	sessionId?: string; questionId?: string; updatedAt: number;
}
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const elementTypes = new Set(["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "text", "frame"]);
export function emptyScratchpad(identity: string, pageId: string, sessionId?: string, questionId?: string): Scratchpad {
	return { version: 1, id: identity, revision: 0, title: "Scratch work", updatedAt: 0,
		pages: [{ id: pageId, name: "Page 1", elements: [], view: { scrollX: 0, scrollY: 0, zoom: 1, backgroundColor: "#ffffff" } }],
		...(sessionId ? { sessionId } : {}), ...(questionId ? { questionId } : {}) };
}
export function parseScratchpad(raw: unknown): Omit<Scratchpad, "revision" | "updatedAt"> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid scratchpad");
	const pad = raw as Scratchpad;
	if (pad.version !== 1 || !id(pad.id)) throw new Error("Invalid scratchpad identity/version");
	if (typeof pad.title !== "string" || !pad.title.trim() || pad.title.length > 120) throw new Error("Use a title of up to 120 characters");
	if ((pad.sessionId !== undefined && !id(pad.sessionId)) || (pad.questionId !== undefined && (typeof pad.questionId !== "string" || !pad.questionId || pad.questionId.length > 256 || /[\u0000-\u001f\u007f]/.test(pad.questionId)))) throw new Error("Invalid session/question reference");
	if (!Array.isArray(pad.pages) || !pad.pages.length || pad.pages.length > 12) throw new Error("Use 1–12 scratch pages");
	const pages = pad.pages.map((page) => {
		if (!page || !id(page.id) || typeof page.name !== "string" || !page.name.trim() || page.name.length > 80) throw new Error("Invalid scratch page");
		if (!Array.isArray(page.elements) || page.elements.length > 10000) throw new Error("Scratch page is too large");
		for (const element of page.elements) {
			if (!element || typeof element !== "object" || !id(element.id) || !elementTypes.has(String(element.type))) throw new Error("Only drawing and text elements are supported");
			for (const key of ["x", "y", "width", "height", "angle"]) if (typeof element[key] !== "number" || !Number.isFinite(element[key]) || Math.abs(element[key] as number) > 10000000) throw new Error("Invalid element geometry");
			if (element.points !== undefined && (!Array.isArray(element.points) || element.points.length > 50000 || element.points.some((point) => !Array.isArray(point) || point.length !== 2 || point.some((value) => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 10000000)))) throw new Error("Invalid stroke points");
			if (element.pressures !== undefined && (!Array.isArray(element.pressures) || element.pressures.length > 50001 || element.pressures.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1))) throw new Error("Invalid pen pressure data");
			if (element.link !== undefined && element.link !== null && (typeof element.link !== "string" || !/^https?:\/\//.test(element.link))) throw new Error("Drawing links must use HTTP or HTTPS");
		}
		if (new Set(page.elements.map((element) => element.id)).size !== page.elements.length) throw new Error("Drawing element ids must be unique");
		const view = page.view;
		if (!view || !Number.isFinite(view.scrollX) || !Number.isFinite(view.scrollY) || Math.abs(view.scrollX) > 100000000 || Math.abs(view.scrollY) > 100000000 || !Number.isFinite(view.zoom) || view.zoom < 0.1 || view.zoom > 30 || typeof view.backgroundColor !== "string" || view.backgroundColor.length > 80) throw new Error("Invalid scratchpad view");
		return { id: page.id, name: page.name, elements: page.elements, view: { scrollX: view.scrollX, scrollY: view.scrollY, zoom: view.zoom, backgroundColor: view.backgroundColor } };
	});
	if (new Set(pages.map((page) => page.id)).size !== pages.length) throw new Error("Page ids must be unique");
	const result = { version: 1 as const, id: pad.id, title: pad.title.trim(), pages, ...(pad.sessionId ? { sessionId: pad.sessionId } : {}), ...(pad.questionId ? { questionId: pad.questionId } : {}) };
	const serialized = JSON.stringify(result);
	if (new TextEncoder().encode(serialized).length > 2 * 1024 * 1024) throw new Error("Scratchpad exceeds the 2 MB vector limit; start another pad");
	return JSON.parse(serialized) as typeof result;
}
