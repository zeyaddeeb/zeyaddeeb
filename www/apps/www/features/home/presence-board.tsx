"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import { type CSSProperties, type PointerEvent, useRef, useState } from "react";
import {
	type Experiment,
	getExperiment,
	number,
} from "@/features/catalog/catalog";
import { usePresence } from "@/features/live/presence";
import { useShouldRun } from "@/features/live/use-running";
import { useWasm } from "@/lib/hooks/use-wasm";

const lead = getExperiment("proofs");

const doors = {
	stripes: getExperiment("wes-anderson"),
	quarter: getExperiment("crdt"),
	arch: getExperiment("deepseek"),
	triangles: getExperiment("portfolio"),
};

const featured = [
	lead,
	doors.stripes,
	doors.quarter,
	doors.arch,
	doors.triangles,
];

function Door({
	experiment,
	className,
	active,
	onPreview,
}: {
	experiment: Experiment;
	className: string;
	active: boolean;
	onPreview: (id: string | null) => void;
}) {
	return (
		<Link
			href={experiment.href}
			className={`presence-board__door ${className}`}
			aria-label={`Experiment ${number(experiment.number)}: ${experiment.title}`}
			data-active={active || undefined}
			onPointerEnter={() => onPreview(experiment.id)}
			onPointerLeave={() => onPreview(null)}
			onFocus={() => onPreview(experiment.id)}
			onBlur={() => onPreview(null)}
		/>
	);
}

export function PresenceBoard() {
	const { peers, peer, cursors, sendCursor, status } = usePresence();
	const { error } = useWasm();
	const boardRef = useRef<HTMLDivElement>(null);
	const shouldRun = useShouldRun(boardRef);
	const [paused, setPaused] = useState(false);
	const [preview, setPreview] = useState<string | null>(null);
	const [pinned, setPinned] = useState(lead.id);
	const shown = featured.find((e) => e.id === (preview ?? pinned)) ?? lead;
	const connected = status === "online" && peers !== null;
	const unsupported = status === "online" && peers === null;
	const unavailable = status === "offline" || unsupported || !!error;
	const label = connected ? "Live" : unavailable ? "Unavailable" : "Connecting";
	const move = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "touch" || paused) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const x = Math.max(
			0,
			Math.min(1, (event.clientX - rect.left) / rect.width),
		);
		const y = Math.max(
			0,
			Math.min(1, (event.clientY - rect.top) / rect.height),
		);
		event.currentTarget.style.setProperty("--pointer-x", String(x * 2 - 1));
		event.currentTarget.style.setProperty("--pointer-y", String(y * 2 - 1));
		sendCursor(x, y);
	};
	const reset = () => {
		boardRef.current?.style.setProperty("--pointer-x", "0");
		boardRef.current?.style.setProperty("--pointer-y", "0");
	};
	return (
		<section className="presence-board" aria-labelledby="presence-title">
			<div className="presence-board__top">
				<h2 id="presence-title">Featured experiments</h2>
				<button
					type="button"
					aria-pressed={paused}
					onClick={() => {
						reset();
						setPaused((p) => !p);
					}}
				>
					{paused ? "Resume motion" : "Pause motion"}
				</button>
			</div>
			<div
				className="presence-board__composition"
				ref={boardRef}
				onPointerMove={move}
				onPointerLeave={reset}
				style={
					{
						"--motion-state": shouldRun && !paused ? "running" : "paused",
					} as CSSProperties
				}
			>
				<Link
					href={shown.href}
					className="presence-board__stage presence-board__feature"
				>
					<span className="presence-board__disc" aria-hidden="true" />
					<span key={shown.id} className="presence-board__feature-text">
						<span className="presence-board__feature-eyebrow">
							Experiment / {number(shown.number)}
						</span>
						<strong>{shown.title}</strong>
						<span className="presence-board__feature-cta">
							Explore experiment{" "}
							<span
								className="presence-board__feature-arrow"
								aria-hidden="true"
							>
								<LifeArrow direction="up-right" />
							</span>
						</span>
					</span>
				</Link>
				<Door
					experiment={doors.stripes}
					className="presence-board__stripes"
					active={shown === doors.stripes}
					onPreview={setPreview}
				/>
				<Door
					experiment={doors.quarter}
					className="presence-board__quarter"
					active={shown === doors.quarter}
					onPreview={setPreview}
				/>
				<Door
					experiment={doors.arch}
					className="presence-board__arch"
					active={shown === doors.arch}
					onPreview={setPreview}
				/>
				<div className="presence-board__presence">
					<div className="presence-board__presence-text">
						<span className="presence-board__presence-label">Here now</span>
						<p
							className="presence-board__count"
							role="status"
							aria-live="polite"
							aria-atomic="true"
						>
							<span
								key={peers}
								className="presence-board__digit"
								aria-hidden="true"
								style={
									connected && peers >= 1000
										? { fontSize: `${38 / String(peers).length}cqw` }
										: undefined
								}
							>
								{connected ? String(peers).padStart(2, "0") : "—"}
							</span>
							<span className="sr-only">
								{connected
									? `${peers} connected ${peers === 1 ? "tab" : "tabs"} on the site, including yours.`
									: unavailable
										? "Live count unavailable."
										: "Connecting to the live count."}
							</span>
						</p>
						<span className="presence-board__presence-status">{label}</span>
					</div>
					<Door
						experiment={doors.triangles}
						className="presence-board__triangles"
						active={shown === doors.triangles}
						onPreview={setPreview}
					/>
				</div>
				{connected &&
					cursors
						.filter((cursor) => cursor.peer !== peer)
						.map((cursor) => (
							<span
								key={cursor.peer}
								className="presence-board__visitor"
								aria-hidden="true"
								style={{
									left: `${cursor.x * 100}%`,
									top: `${cursor.y * 100}%`,
								}}
							/>
						))}
			</div>
			<div className="presence-board__index">
				{featured.map((experiment) => (
					<button
						key={experiment.id}
						type="button"
						aria-pressed={pinned === experiment.id}
						aria-label={`Show experiment ${number(experiment.number)}: ${experiment.title}`}
						data-active={shown === experiment || undefined}
						onClick={() => setPinned(experiment.id)}
					>
						{number(experiment.number)}
					</button>
				))}
			</div>
			<p className="presence-board__caption">
				{connected ? (
					<>
						Connected tabs across the site, including yours. Open another tab or
						move over the shapes: the count and pointers are shared over the
						same connection as the{" "}
						<Link href="/experiments/crdt">collaborative editor</Link>.
					</>
				) : unavailable ? (
					"The live count is temporarily unavailable."
				) : (
					"Connecting to the live count…"
				)}
			</p>
		</section>
	);
}
