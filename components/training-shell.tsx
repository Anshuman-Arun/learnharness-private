import Link from "next/link";
import type { ReactNode } from "react";
import { TopBar } from "@/components/top-bar";

export function TrainingShell({
	title,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="lh-training flex h-full min-h-0 flex-col">
			<TopBar>
				<Link href="/training" className="study-breadcrumb">
					Workbench
				</Link>
				{title !== "Workbench" && (
					<>
						<span className="px-2 text-muted-foreground/40">/</span>
						<span className="text-sm">{title}</span>
					</>
				)}
			</TopBar>
			<main className="study-main">
				<h1 className="study-page-title">{title}</h1>
				{children}
			</main>
		</div>
	);
}
