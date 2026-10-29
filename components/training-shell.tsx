import Link from "next/link";
import type { ReactNode } from "react";
import { TopBar } from "@/components/top-bar";

export function TrainingShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
	return <div className="flex h-full min-h-0 flex-col">
		<TopBar><Link href="/training" className="text-sm">Training</Link></TopBar>
		<main className="mx-auto w-full max-w-5xl space-y-5 overflow-auto p-5">
			<h1 className="text-2xl font-semibold">{title}</h1>
			{description && <p className="text-sm text-muted-foreground">{description}</p>}
			{children}
		</main>
	</div>;
}
