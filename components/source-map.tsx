"use client";
import { useMemo } from "react";
import {
	Background,
	Controls,
	Handle,
	MarkerType,
	Position,
	ReactFlow,
	type Node,
	type NodeProps,
} from "@xyflow/react";
import { layoutDocumentMap, type DocumentSource } from "@/src/core";
import "@xyflow/react/dist/style.css";

type ConceptNode = Node<{ title: string; kind: string; page: string }, "concept">;
function Concept({ data, selected }: NodeProps<ConceptNode>) {
	return (
		<div className={`source-concept ${selected ? "is-selected" : ""}`}>
			<Handle type="target" position={Position.Left} />
			<span className="source-concept-kind">
				{data.kind}
				<span>{data.page}</span>
			</span>
			<strong>{data.title}</strong>
			<Handle type="source" position={Position.Right} />
		</div>
	);
}
const nodeTypes = { concept: Concept };
export function SourceMap({
	source,
	selected,
	onSelect,
}: {
	source: DocumentSource;
	selected?: string;
	onSelect: (id: string) => void;
}) {
	const layout = useMemo(
		() => layoutDocumentMap(source.nodes, source.edges, selected),
		[source.nodes, source.edges, selected],
	);
	const nodes = useMemo(
		() =>
			layout.nodes.map(({ node, x, y }) => ({
				id: node.id,
				type: "concept" as const,
				position: { x, y },
				selected: node.id === selected,
				data: { title: node.title, kind: node.kind, page: `p. ${node.citations[0]?.page ?? "—"}` },
			})),
		[layout, selected],
	);
	const edges = useMemo(
		() =>
			layout.edges.map((edge, index) => ({
				id: `edge-${index}`,
				source: edge.from,
				target: edge.to,
				label: selected && (edge.from === selected || edge.to === selected) ? edge.kind : undefined,
				markerEnd: { type: MarkerType.ArrowClosed, color: "#747474" },
				style: { stroke: "#626262", strokeWidth: 1, strokeDasharray: edge.inferred ? "4 4" : undefined },
				labelStyle: { fill: "#aaa", fontSize: 10 },
				labelBgStyle: { fill: "#141414" },
			})),
		[layout, selected],
	);
	return (
		<div className="source-map" data-testid="source-dag">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				onNodeClick={(_event, node) => onSelect(node.id)}
				nodesDraggable={false}
				nodesConnectable={false}
				fitView
				minZoom={0.15}
				maxZoom={1.5}
				proOptions={{ hideAttribution: true }}
			>
				<Background color="#303030" gap={24} size={0.6} />
				<Controls showInteractive={false} />
			</ReactFlow>
			{layout.nodes.length < source.nodes.length && (
				<span className="source-map-scope">
					{layout.nodes.length} of {source.nodes.length} · select a concept to focus
				</span>
			)}
		</div>
	);
}
