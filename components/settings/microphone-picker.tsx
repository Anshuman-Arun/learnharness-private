"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsRow, ThinSelect } from "./controls.tsx";

type Microphone = { deviceId: string; label: string };

/** Persist both ID and name; IDs are salted by origin, and localhost's port changes per boot. */
export function MicrophonePicker({
	value,
	label,
	onChange,
}: {
	value: string;
	label: string;
	onChange: (microphoneId: string, microphoneLabel: string) => void;
}) {
	const [devices, setDevices] = useState<Microphone[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!navigator.mediaDevices?.enumerateDevices) {
			setError("Microphone enumeration is not supported on this device.");
			return;
		}
		try {
			const available = await navigator.mediaDevices.enumerateDevices();
			const unique = new Map<string, Microphone>();
			for (const device of available) {
				if (device.kind !== "audioinput" || !device.deviceId || device.deviceId === "default" || device.deviceId === "communications") continue;
				if (!unique.has(device.deviceId)) unique.set(device.deviceId, {
					deviceId: device.deviceId,
					label: device.label,
				});
			}
			setDevices([...unique.values()]);
			setError(null);
		} catch {
			setError("Could not list microphones. Check Windows microphone permissions.");
		}
	}, []);

	useEffect(() => {
		void refresh();
		const media = navigator.mediaDevices;
		media?.addEventListener?.("devicechange", refresh);
		return () => media?.removeEventListener?.("devicechange", refresh);
	}, [refresh]);

	const grantAccess = async () => {
		if (!navigator.mediaDevices?.getUserMedia) {
			setError("Microphone access is unavailable.");
			return;
		}
		setBusy(true);
		try {
			// This explicit click only checks permission, never sends audio to Deepgram.
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			try {
				await refresh();
			} finally {
				stream.getTracks().forEach((track) => track.stop());
			}
		} catch {
			setError("Microphone access was denied or unavailable. Check Windows privacy settings.");
		} finally {
			setBusy(false);
		}
	};

	const namedDevices = devices.filter((device) => device.label);
	const byId = namedDevices.find((device) => device.deviceId === value);
	const byLabel = namedDevices.filter((device) => device.label === label);
	const resolved = value === "default" ? "default" : byId?.deviceId ?? (byLabel.length === 1 ? byLabel[0]?.deviceId ?? value : value);
	const missing = value !== "default" && !byId && byLabel.length !== 1;
	return (
		<div data-testid="microphone-preference">
			<SettingsRow label="Dictation microphone" hint="Used by Deepgram; saved across restarts." testid="row-microphone">
				<ThinSelect
					value={resolved}
					onChange={(id) => {
						const device = namedDevices.find((item) => item.deviceId === id);
						onChange(id, device?.label ?? "");
					}}
					ariaLabel="Dictation microphone"
					testid="microphone-select"
				>
					<option value="default">System default</option>
					{namedDevices.map((device) => (
						<option key={device.deviceId} value={device.deviceId}>{device.label}</option>
					))}
					{missing && <option value={value}>Saved microphone (not currently detected)</option>}
				</ThinSelect>
			</SettingsRow>
			<div className="flex items-center justify-end gap-2 py-1">
				<button
					type="button"
					data-testid="microphone-refresh"
					onClick={() => void refresh()}
					className="text-xs text-muted-foreground hover:text-foreground"
				>Refresh</button>
				<button
					type="button"
					data-testid="microphone-permission"
					disabled={busy}
					onClick={() => void grantAccess()}
					className="rounded-sm border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
				>{busy ? "Checking…" : "Detect microphones"}</button>
			</div>
			{namedDevices.length === 0 && !error && (
				<p className="text-xs text-muted-foreground">Click Detect microphones to grant access and show device names.</p>
			)}
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
			{missing && !error && (
				<p className="text-xs text-muted-foreground">Saved microphone is not currently identified. Connect it, click Detect microphones, or choose System default.</p>
			)}
		</div>
	);
}
