"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsRow, ThinSelect } from "./controls.tsx";

type Microphone = { deviceId: string; label: string };

/** Select a stable device ID (stored by the server), or follow Windows' default. */
export function MicrophonePicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (microphoneId: string) => void;
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
			let index = 0;
			for (const device of available) {
				if (device.kind !== "audioinput" || !device.deviceId || device.deviceId === "default" || device.deviceId === "communications") continue;
				if (!unique.has(device.deviceId)) {
					index++;
					unique.set(device.deviceId, {
						deviceId: device.deviceId,
						label: device.label || `Microphone ${index} (grant access to see its name)`,
					});
				}
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
			// Only this click requests capture; stop immediately after granting permission.
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

	const missing = value !== "default" && !devices.some((device) => device.deviceId === value);
	return (
		<div data-testid="microphone-preference">
			<SettingsRow label="Dictation microphone" hint="Choose an input for Deepgram. Saved on this device." testid="row-microphone">
				<ThinSelect
					value={value}
					onChange={onChange}
					ariaLabel="Dictation microphone"
					testid="microphone-select"
				>
					<option value="default">System default</option>
					{devices.map((device) => (
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
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
			{missing && !error && (
				<p className="text-xs text-muted-foreground">That microphone is not currently listed. Connect it or select System default.</p>
			)}
		</div>
	);
}
