"use client";

import Editor, { loader } from "@monaco-editor/react";
// Self-host assets prepared by postinstall. Do not send source or fetch editor code from a CDN.
loader.config({ paths: { vs: "/vendor/monaco/vs" } });

export default function CppEditor({ name, source, onChange, readOnly = false }: { name: string; source: string; onChange: (source: string) => void; readOnly?: boolean }) {
	return <Editor height="420px" path={name} language="cpp" theme="vs-dark" value={source}
		onChange={(value) => onChange(value ?? "")} loading={<p>Loading local code editor…</p>}
		options={{ readOnly, minimap: { enabled: false }, fontSize: 14, automaticLayout: true, scrollBeyondLastLine: false }} />;
}
