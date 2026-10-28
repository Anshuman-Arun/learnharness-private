"use client";

import { useEffect, useRef } from "react";
import { Excalidraw, exportToBlob, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { EvidenceImage, ScratchpadPage } from "@/src/core";
import "@excalidraw/excalidraw/index.css";

if (typeof window !== "undefined") (window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = `${window.location.origin}/vendor/excalidraw/`;

export default function ScratchpadCanvas({ page, onChange, onReady, disabled = false, remoteRevision }: {
	page: ScratchpadPage;
	onChange: (page: ScratchpadPage) => void;
	onReady: (capture: () => Promise<EvidenceImage>) => void;
	disabled?: boolean;
	remoteRevision?: number;
}) {
	const previous = useRef("");
	const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
	useEffect(() => { if (remoteRevision !== undefined) apiRef.current?.updateScene({ elements: page.elements as unknown as readonly ExcalidrawElement[], captureUpdate: CaptureUpdateAction.NEVER }); }, [remoteRevision]);
	function changed(elements: readonly ExcalidrawElement[], state: AppState) {
		const signature = `${elements.reduce((sum, element) => sum + element.version, 0)}:${elements.length}:${state.scrollX}:${state.scrollY}:${state.zoom.value}:${state.viewBackgroundColor}`;
		if (signature === previous.current) return;
		previous.current = signature;
		onChange({ ...page, elements: [...elements] as unknown as Record<string, unknown>[], view: { scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom.value, backgroundColor: state.viewBackgroundColor } });
	}
	function ready(api: ExcalidrawImperativeAPI) {
		apiRef.current = api;
		onReady(async () => {
			const elements = structuredClone(api.getSceneElements());
			if (!elements.length) throw new Error("Draw something on this page before attaching it");
			const blob = await exportToBlob({ elements, appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }, files: {}, mimeType: "image/png", maxWidthOrHeight: 2048 });
			const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not capture scratch work")); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.readAsDataURL(blob); });
			return { name: `${page.name.replace(/[^A-Za-z0-9_-]/g, "-")}.png`, mimeType: "image/png", data };
		});
	}
	return <div className="h-[65vh] min-h-96 overflow-hidden rounded-xl border" data-testid="scratchpad-canvas">
		<Excalidraw initialData={{ elements: page.elements as unknown as readonly ExcalidrawElement[], appState: { scrollX: page.view.scrollX, scrollY: page.view.scrollY, zoom: { value: page.view.zoom as AppState["zoom"]["value"] }, viewBackgroundColor: page.view.backgroundColor } }}
			onChange={changed} excalidrawAPI={ready} aiEnabled={false} theme="light" viewModeEnabled={disabled} validateEmbeddable={() => false}
			UIOptions={{ tools: { image: false }, canvasActions: { loadScene: false, saveToActiveFile: false, saveAsImage: false, export: false, toggleTheme: false } }} />
	</div>;
}
