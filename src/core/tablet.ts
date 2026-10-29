export interface TabletLink {
	version: 1; id: string; padId: string; pageId: string; active: boolean;
	state: "waiting" | "connected"; expiresAt: number; lastSequence: number; lastHash?: string;
}

/** Preserve separately created strokes when a local offline draft is recovered. */
export function recoverTabletElements(saved: Record<string, unknown>[], local: Record<string, unknown>[]) {
	const result = new Map(saved.map((element) => [element.id, element]));
	for (const element of local) {
		const current = result.get(element.id);
		if (!current || Number(element.version ?? 0) > Number(current.version ?? 0) || (element.version === current.version && Number(element.versionNonce ?? 0) < Number(current.versionNonce ?? 0))) result.set(element.id, element);
	}
	return [...result.values()];
}
