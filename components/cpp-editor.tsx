"use client";

import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import Editor, { loader } from "@monaco-editor/react";
loader.config({ paths: { vs: "/vendor/monaco/vs" } });

export default function CppEditor({
	name,
	source,
	onChange,
	readOnly = false,
	location,
}: {
	location?: { line: number; column: number; stamp: number };
	name: string;
	source: string;
	onChange: (source: string) => void;
	readOnly?: boolean;
}) {
	const instance = useRef<editor.IStandaloneCodeEditor | null>(null);
	useEffect(() => {
		if (location && instance.current) {
			instance.current.setPosition({ lineNumber: location.line, column: location.column });
			instance.current.revealLineInCenter(location.line);
			instance.current.focus();
		}
	}, [location, name]);
	return (
		<Editor
			onMount={(value) => {
				instance.current = value;
			}}
			height="480px"
			path={name}
			language="cpp"
			theme="learnharness"
			beforeMount={(monaco) =>
				monaco.editor.defineTheme("learnharness", {
					base: "vs-dark",
					inherit: true,
					rules: [
						{ token: "comment", foreground: "777777" },
						{ token: "keyword", foreground: "D8D8D8" },
						{ token: "string", foreground: "B5C4B2" },
						{ token: "number", foreground: "C6BDAA" },
					],
					colors: {
						"editor.background": "#141414",
						"editor.foreground": "#E6E6E6",
						"editor.lineHighlightBackground": "#141414",
						"editor.selectionBackground": "#383838",
						"editor.inactiveSelectionBackground": "#292929",
						"editorCursor.foreground": "#C5C5C5",
						"editorLineNumber.foreground": "#555555",
						"editorLineNumber.activeForeground": "#999999",
						"editorIndentGuide.background1": "#252525",
						"editorWidget.background": "#1C1C1C",
						"editorWidget.border": "#434343",
						focusBorder: "#666666",
					},
				})
			}
			value={source}
			onChange={(value) => onChange(value ?? "")}
			loading={<p className="study-empty">Loading editor…</p>}
			options={{
				readOnly,
				minimap: { enabled: false },
				fontSize: 14,
				lineHeight: 22,
				fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
				cursorStyle: "line-thin",
				cursorBlinking: "blink",
				renderLineHighlight: "none",
				selectionHighlight: false,
				occurrencesHighlight: "off",
				padding: { top: 16, bottom: 16 },
				automaticLayout: true,
				scrollBeyondLastLine: false,
				overviewRulerLanes: 0,
				hideCursorInOverviewRuler: true,
				smoothScrolling: true,
			}}
		/>
	);
}
