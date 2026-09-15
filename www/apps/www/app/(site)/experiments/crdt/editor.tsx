"use client";

import { ArrowIcon } from "@zeyaddeeb/ui";
import { useRef, useState } from "react";
import { type SyncStatus, useCrdt } from "@/lib/hooks/use-crdt";
import { useWasm } from "@/lib/hooks/use-wasm";

function Status({
	status,
	peers,
}: {
	status: SyncStatus;
	peers: number | null;
}) {
	const label = {
		online: `synced${peers !== null ? ` · ${peers} online` : ""}`,
		offline: "offline — editing locally",
		connecting: "connecting…",
	}[status];
	return (
		<span className="eyebrow inline-flex items-center gap-2">
			<span
				aria-hidden="true"
				className={status === "online" ? "text-amber" : "text-dim"}
			>
				{status === "online" ? "●" : status === "connecting" ? "○" : "—"}
			</span>
			{label}
		</span>
	);
}

function SequencePanel({
	sequence,
	siteId,
}: {
	sequence: Array<{
		site: number;
		clock: number;
		value: string;
		deleted: boolean;
	}>;
	siteId: number;
}) {
	if (sequence.length === 0) {
		return (
			<p className="font-mono text-xs text-dim">start typing to see the RGA</p>
		);
	}
	return (
		<div className="max-h-72 overflow-auto">
			<table className="w-full font-mono text-xs">
				<thead>
					<tr className="border-b border-rule text-left text-dim">
						<th className="pb-2 pr-3 font-normal">site</th>
						<th className="pb-2 pr-3 font-normal">clock</th>
						<th className="pb-2 pr-3 font-normal">char</th>
						<th className="pb-2 font-normal">status</th>
					</tr>
				</thead>
				<tbody>
					{sequence.map((entry) => (
						<tr
							key={`${entry.site}-${entry.clock}`}
							className={entry.deleted ? "opacity-40" : ""}
						>
							<td
								className={`py-0.5 pr-3 ${entry.site === siteId ? "text-amber" : "text-paper-2"}`}
							>
								{entry.site === siteId ? "you" : String(entry.site).slice(-4)}
							</td>
							<td className="py-0.5 pr-3 text-dim">{entry.clock}</td>
							<td className="py-0.5 pr-3 text-paper">
								{entry.value === "\n"
									? "↵"
									: entry.value === " "
										? "·"
										: entry.value}
							</td>
							<td className="py-0.5 text-dim">
								{entry.deleted ? "tombstone" : "live"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function OpLog({
	ops,
}: {
	ops: Array<{ dir: "local" | "remote"; label: string }>;
}) {
	if (ops.length === 0)
		return <span className="font-mono text-xs text-dim">no ops yet</span>;
	return (
		<ul className="flex flex-wrap gap-1.5">
			{ops.map((op, i) => (
				<li
					key={i.toString()}
					className={`border px-2 py-0.5 font-mono text-xs ${
						op.dir === "local"
							? "border-amber/50 text-amber"
							: "border-rule text-paper-2"
					}`}
				>
					<ArrowIcon direction={op.dir === "local" ? "right" : "left"} />{" "}
					<span className="sr-only">
						{op.dir === "local" ? "Sent: " : "Received: "}
					</span>
					{op.label}
				</li>
			))}
		</ul>
	);
}

export default function CrdtEditor({ docId }: { docId: string }) {
	const { loading, error } = useWasm();
	const {
		text,
		sequence,
		status,
		opLog,
		pendingCount,
		totalOps,
		peers,
		siteId,
		insert,
		delete: del,
	} = useCrdt(docId);

	const prevTextRef = useRef("");
	const [focused, setFocused] = useState(false);

	if (loading)
		return <p className="font-mono text-xs text-dim">loading engine…</p>;
	if (error)
		return (
			<p className="font-mono text-sm text-destructive">
				Failed to load WASM: {error}
			</p>
		);

	function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
		const next = e.target.value;
		const prev = prevTextRef.current;
		let start = 0;
		while (
			start < prev.length &&
			start < next.length &&
			prev[start] === next[start]
		)
			start++;
		let prevEnd = prev.length;
		let nextEnd = next.length;
		while (
			prevEnd > start &&
			nextEnd > start &&
			prev[prevEnd - 1] === next[nextEnd - 1]
		) {
			prevEnd--;
			nextEnd--;
		}
		for (let i = prevEnd - 1; i >= start; i--) del(i);
		for (let i = start; i < nextEnd; i++) insert(i, next[i] ?? "");
		prevTextRef.current = next;
	}

	if (prevTextRef.current !== text && !focused) prevTextRef.current = text;

	const liveCount = sequence.filter((e) => !e.deleted).length;
	const tombstoneCount = sequence.length - liveCount;

	return (
		<div className="grid gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
				<Status status={status} peers={peers} />
				<p className="eyebrow">
					{pendingCount > 0 ? (
						<span className="text-amber">{pendingCount} queued · </span>
					) : null}
					{totalOps} ops · site {String(siteId).slice(-6)}
				</p>
			</div>

			<div className="grid gap-px border border-rule bg-rule lg:grid-cols-2">
				<div className="grid gap-3 bg-charcoal p-5">
					<span className="eyebrow">Editor</span>
					<textarea
						className="min-h-64 w-full resize-none border border-rule bg-charcoal-2 p-4 font-mono text-sm text-paper outline-none transition-colors placeholder:text-dim focus:border-amber"
						placeholder="Start typing… open another tab to collaborate."
						value={text}
						onFocus={() => setFocused(true)}
						onBlur={() => {
							setFocused(false);
							prevTextRef.current = text;
						}}
						onChange={handleChange}
						spellCheck={false}
					/>
					<p className="font-mono text-xs text-dim">
						{liveCount} chars · {tombstoneCount} tombstones
					</p>
				</div>

				<div className="grid gap-3 bg-charcoal p-5">
					<span className="eyebrow">RGA sequence</span>
					<div className="min-h-64 border border-rule bg-charcoal-2 p-4">
						<SequencePanel sequence={sequence} siteId={siteId} />
					</div>
					<p className="font-mono text-xs text-dim">
						Each row is a character node. Tombstones stay so intent survives.
					</p>
				</div>
			</div>

			<div className="grid gap-3">
				<span className="eyebrow">Op log</span>
				<OpLog ops={opLog} />
			</div>
		</div>
	);
}
