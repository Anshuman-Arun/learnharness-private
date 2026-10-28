"use client";

import { useState } from "react";
import type { ChatSettings } from "@/src/core";

export function TeachingModeControl({ chatId, mode, onChange }: {
	chatId: string;
	mode: ChatSettings["teachingMode"];
	onChange: (mode: NonNullable<ChatSettings["teachingMode"]>) => void;
}) {
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function change(next: NonNullable<ChatSettings["teachingMode"]>) {
		setSaving(true);
		setError(null);
		try {
			const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/settings`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ teachingMode: next }),
			});
			const body = await response.json() as { error?: string; settings?: ChatSettings };
			if (!response.ok || !body.settings?.teachingMode) throw new Error(body.error ?? "Could not save teaching style");
			onChange(body.settings.teachingMode);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save teaching style");
		} finally {
			setSaving(false);
		}
	}
	return (
		<div className="flex shrink-0 flex-col items-end gap-1">
			<label className="flex items-center gap-1 text-xs text-muted-foreground" title="Applies to the next reply in this session. Switch at any time.">
				<span className="sr-only">Teaching style</span>
				<select aria-label="Teaching style" value={mode ?? "explain"} disabled={saving}
					onChange={(event) => void change(event.target.value as "guided" | "explain")}
					className="rounded-md border border-border bg-background px-2 py-1 text-foreground">
					<option value="guided">Guided</option>
					<option value="explain">Explain</option>
				</select>
				<span className="sr-only">Session only; applies to the next reply. You can switch back at any time.</span>
			</label>
			{error && <span role="alert" className="max-w-48 text-xs text-destructive">{error}</span>}
		</div>
	);
}
