"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Resume = { href: string; title: string; detail: string };
export function Workbench() {
	const [resume, setResume] = useState<Resume[]>([]);
	useEffect(() => {
		const controller = new AbortController();
		void Promise.allSettled([
			fetch("/api/training/exam", { signal: controller.signal }).then((r) => (r.ok ? r.json() : undefined)),
			fetch("/api/training/cpp", { signal: controller.signal }).then((r) => (r.ok ? r.json() : undefined)),
			fetch("/api/sources", { signal: controller.signal }).then((r) => (r.ok ? r.json() : undefined)),
		]).then((results) => {
			if (controller.signal.aborted) return;
			const data = results.map((r) => (r.status === "fulfilled" ? r.value : undefined));
			const next: Resume[] = [];
			const exam = data[0]?.exams?.find(
				(e: { endedAt?: number; deadline: number }) => e.endedAt === undefined && e.deadline > Date.now(),
			);
			if (exam)
				next.push({
					href: "/training/interview?mode=timed",
					title: "Continue timed practice",
					detail: "Your saved answers and remaining time",
				});
			const source = data[2]?.sources?.find((s: { status: string }) =>
				["paused", "partial", "ready"].includes(s.status),
			);
			if (source)
				next.push({ href: `/sources/${source.id}`, title: source.title, detail: "Continue source study" });
			const code = data[1]?.workspaces?.[0];
			if (code) next.push({ href: "/training/cpp", title: code.title, detail: "Return to your code" });
			setResume(next.slice(0, 3));
		});
		return () => controller.abort();
	}, []);
	return (
		<div className="workbench-home">
			{resume.length > 0 && (
				<section>
					<h2 className="study-section-label">Continue</h2>
					{resume.map((r) => (
						<Link className="workbench-row" href={r.href} key={r.href}>
							<span>
								<strong>{r.title}</strong>
								<small>{r.detail}</small>
							</span>
							<span aria-hidden>↗</span>
						</Link>
					))}
				</section>
			)}
			<section>
				<h2 className="study-section-label">Practice</h2>
				<Link className="workbench-row" href="/training/arithmetic">
					<span>
						<strong>Arithmetic</strong>
						<small>Fast mental calculation. One uninterrupted round.</small>
					</span>
					<span aria-hidden>↗</span>
				</Link>
				<Link className="workbench-row" href="/training/interview">
					<span>
						<strong>Interview practice</strong>
						<small>Reasoning, calibration and decisions under uncertainty.</small>
					</span>
					<span aria-hidden>↗</span>
				</Link>
				<Link className="workbench-row" href="/training/review">
					<span>
						<strong>Review</strong>
						<small>Recall the gaps in your own attempts.</small>
					</span>
					<span aria-hidden>↗</span>
				</Link>
			</section>
			<section>
				<h2 className="study-section-label">Workspace</h2>
				<div className="workbench-pair">
					<Link className="workbench-row" href="/training/cpp">
						<span>
							<strong>Code</strong>
							<small>C++20 · editor, tests and tutor</small>
						</span>
						<span aria-hidden>↗</span>
					</Link>
					<Link className="workbench-row" href="/training/scratchpad">
						<span>
							<strong>Scratch</strong>
							<small>Sketch here or pair your iPad</small>
						</span>
						<span aria-hidden>↗</span>
					</Link>
				</div>
			</section>
			<section>
				<h2 className="study-section-label">Study</h2>
				<Link className="workbench-row" href="/sources">
					<span>
						<strong>Sources</strong>
						<small>Read a paper or chapter through its concepts and prerequisites.</small>
					</span>
					<span aria-hidden>↗</span>
				</Link>
				<Link className="workbench-row" href="/training/sprints">
					<span>
						<strong>Quant study plans</strong>
						<small>Bounded topics. Derive, implement, then transfer.</small>
					</span>
					<span aria-hidden>↗</span>
				</Link>
			</section>
		</div>
	);
}
