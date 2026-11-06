"use client";
export function ProbabilityDistribution({
	distribution,
	histogram,
	total,
}: {
	distribution: Record<string, number>;
	histogram: Record<string, number>;
	total: number;
}) {
	const values = Object.entries(distribution),
		maximum = Math.max(
			0.01,
			...values.map(([, p]) => p),
			...values.map(([key]) => (total ? (histogram[key] ?? 0) / total : 0)),
		);
	return (
		<figure className="probability-distribution">
			<figcaption>
				Distribution <span>— exact · observed</span>
			</figcaption>
			<div className="distribution-scroll">
				<div
					className="distribution-bars"
					style={{ minWidth: values.length > 15 ? values.length * 36 : undefined }}
				>
					{values.map(([key, p]) => (
						<div className="distribution-bin" key={key}>
							<div
								className="distribution-columns"
								title={`${key}: exact ${p.toFixed(4)}, observed ${total ? ((histogram[key] ?? 0) / total).toFixed(4) : "no trials"}`}
							>
								<span className="distribution-exact" style={{ height: `${(p / maximum) * 100}%` }} />
								<span
									className="distribution-observed"
									style={{ height: `${((total ? (histogram[key] ?? 0) / total : 0) / maximum) * 100}%` }}
								/>
							</div>
							<span>{key}</span>
						</div>
					))}
				</div>
			</div>
		</figure>
	);
}
