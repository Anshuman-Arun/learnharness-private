"use client";
import { useState } from "react";
import type { StoppingConfig, stoppingTable } from "@/src/core";
export function BellmanInspector({
	config,
	table,
}: {
	config: StoppingConfig;
	table: ReturnType<typeof stoppingTable>;
}) {
	const [draws, setDraws] = useState(Math.min(2, config.horizon)),
		[offer, setOffer] = useState(Math.ceil(config.sides / 2));
	const row = table[draws]!,
		continuation = row.continuation;
	return (
		<div className="study-panel space-y-3">
			<h3 className="font-medium">Inspect the decision</h3>
			<div className="study-segments" aria-label="Remaining horizon">
				{table.slice(1).map((r) => (
					<button key={r.draws} aria-pressed={draws === r.draws} onClick={() => setDraws(r.draws)}>
						{r.draws} draw{r.draws === 1 ? "" : "s"}
					</button>
				))}
			</div>
			<label className="flex items-center gap-4 text-sm">
				Observed offer {offer}
				<input
					aria-label="Inspect stopping offer"
					type="range"
					min={1}
					max={config.sides}
					value={offer}
					onChange={(e) => setOffer(Number(e.target.value))}
				/>
			</label>
			<p>
				{continuation === null
					? `Last draw: accept ${offer}.`
					: `Accept: ${offer}. Continue: V(${draws - 1}) − ${config.cost} = ${continuation.toFixed(4)}. ${offer >= continuation ? "Accept this offer." : "Continue."}`}
			</p>
			<p className="text-sm text-muted-foreground">
				Before seeing the offer, V({draws}) = {row.value.toFixed(4)}
				{continuation === null
					? " (mean of the forced draw)."
					: `, the average of max(x, ${continuation.toFixed(4)}) over all ${config.sides} faces.`}
			</p>
		</div>
	);
}
