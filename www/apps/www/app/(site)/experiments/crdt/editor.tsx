"use client";

import { useRef, useState } from "react";
import { type SyncStatus, useCrdt } from "@/lib/hooks/use-crdt";
import { useWasm } from "@/lib/hooks/use-wasm";

function StatusDot({ status }: { status: SyncStatus }) {
	const cfg = {
		online: {
			color: "bg-emerald-400",
			ring: "ring-emerald-400/30",
			label: "synced",
		},
		offline: {
			color: "bg-amber-400",
			ring: "ring-amber-400/30",
			label: "offline — editing locally",
		},
		connecting: {
			color: "bg-neutral-500",
			ring: "ring-neutral-500/30",
			label: "connecting…",
		},
	}[status];

	return (
		<span className="inline-flex items-center gap-2">
			<span className={`relative flex h-2 w-2`}>
				{status === "online" && (
					<span
						className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.color} opacity-50`}
					/>
				)}
				<span
					className={`relative inline-flex h-2 w-2 rounded-full ${cfg.color}`}
				/>
			</span>
			<span className="text-xs text-neutral-400">{cfg.label}</span>
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
			<div className="flex h-full items-center justify-center">
				<p className="text-xs text-neutral-600">start typing to see the RGA</p>
			</div>
		);
	}

	return (
		<div className="overflow-auto">
			<table className="w-full text-xs">
				<thead>
					<tr className="border-b border-neutral-800 text-left text-neutral-600">
						<th className="pb-2 pr-3 font-mono font-normal">site</th>
						<th className="pb-2 pr-3 font-mono font-normal">clock</th>
						<th className="pb-2 pr-3 font-mono font-normal">char</th>
						<th className="pb-2 font-mono font-normal">status</th>
					</tr>
				</thead>
				<tbody>
					{sequence.map((entry) => (
						<tr
							key={`${entry.site}-${entry.clock}`}
							className={entry.deleted ? "opacity-30" : ""}
						>
							<td
								className={`py-0.5 pr-3 font-mono ${
									entry.site === siteId ? "text-amber-400" : "text-teal-400"
								}`}
							>
								{entry.site === siteId ? "you" : String(entry.site).slice(-4)}
							</td>
							<td className="py-0.5 pr-3 font-mono text-neutral-500">
								{entry.clock}
							</td>
							<td className="py-0.5 pr-3 font-mono text-neutral-300">
								{entry.value === "\n"
									? "↵"
									: entry.value === " "
										? "·"
										: entry.value}
							</td>
							<td className="py-0.5">
								{entry.deleted ? (
									<span className="text-neutral-700">tombstone</span>
								) : (
									<span className="text-emerald-700">live</span>
								)}
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
	return (
		<div className="flex flex-wrap gap-1.5">
			{ops.length === 0 && (
				<span className="text-xs text-neutral-700">no ops yet</span>
			)}
			{ops.map((op, i) => (
				<span
					key={i.toString()}
					className={`rounded px-2 py-0.5 font-mono text-xs ${
						op.dir === "local"
							? "bg-amber-950/60 text-amber-300"
							: "bg-teal-950/60 text-teal-300"
					}`}
				>
					{op.dir === "local" ? "→" : "←"} {op.label}
				</span>
			))}
		</div>
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
		siteId,
		insert,
		delete: del,
	} = useCrdt(docId);

	const prevTextRef = useRef("");
	const [focused, setFocused] = useState(false);

	if (loading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
					<span className="text-sm text-neutral-500">loading WASM module…</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-sm text-red-400">
				Failed to load WASM: {error}
			</div>
		);
	}

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

	if (prevTextRef.current !== text && !focused) {
		prevTextRef.current = text;
	}

	const liveCount = sequence.filter((e) => !e.deleted).length;
	const tombstoneCount = sequence.filter((e) => e.deleted).length;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<StatusDot status={status} />
				<div className="flex items-center gap-4 text-xs text-neutral-600">
					{pendingCount > 0 && (
						<span className="text-amber-500">{pendingCount} queued</span>
					)}
					<span>{totalOps} ops applied</span>
					<span className="font-mono text-neutral-700">
						site: {String(siteId).slice(-6)}
					</span>
				</div>
			</div>

			{status === "offline" && (
				<div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-400">
					Server unreachable — all edits are saved locally.{" "}
					{pendingCount > 0 &&
						`${pendingCount} op(s) will sync when reconnected.`}
				</div>
			)}

			<div className="grid gap-4 lg:grid-cols-2">
				<div className="flex flex-col gap-2">
					<span className="text-xs font-medium uppercase tracking-widest text-neutral-600">
						Editor
					</span>
					<textarea
						className="min-h-60 w-full resize-none rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 font-mono text-sm text-neutral-100 placeholder-neutral-700 outline-none transition-colors focus:border-neutral-600"
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
					<p className="text-xs text-neutral-700">
						{liveCount} chars · {tombstoneCount} tombstones
					</p>
				</div>

				<div className="flex flex-col gap-2">
					<span className="text-xs font-medium uppercase tracking-widest text-neutral-600">
						RGA sequence
					</span>
					<div className="min-h-60 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
						<SequencePanel sequence={sequence} siteId={siteId} />
					</div>
					<p className="text-xs text-neutral-700">
						Each row is a character node. Tombstones remain to preserve intent.
					</p>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<span className="text-xs font-medium uppercase tracking-widest text-neutral-600">
					Op log
				</span>
				<OpLog ops={opLog} />
			</div>

			<p className="text-xs text-neutral-700">
				<span className="text-amber-600">→</span> local op ·{" "}
				<span className="text-teal-600">←</span> remote op · open{" "}
				<span className="font-mono">localhost:3001</span> to run the sync
				server, or just edit offline — ops queue automatically.
			</p>
		</div>
	);
}
