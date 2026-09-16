"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Experiment, number } from "@/features/catalog/catalog";
import { useRunningRegistry } from "@/features/live/running-context";
import { useShouldRun } from "@/features/live/use-running";
import { HOME_VARIANT } from "@/features/tiling/engine";
import { useWasm } from "@/lib/hooks/use-wasm";
import "./rows.css";

const LifeView = dynamic(
	() => import("@/features/life/life-view").then((m) => m.LifeView),
	{ ssr: false },
);
const TilingView = dynamic(
	() => import("@/features/tiling/tiling-view").then((m) => m.TilingView),
	{ ssr: false },
);
const RainView = dynamic(
	() => import("@/features/rain/rain-view").then((m) => m.RainView),
	{ ssr: false },
);
const LIVE = new Set(["life", "tiling", "rain"]);

function Band({
	experiment,
	running,
}: {
	experiment: Experiment;
	running: boolean;
}) {
	const { loading, error } = useWasm();
	if (
		(experiment.live === "life" || experiment.live === "tiling") &&
		(loading || error)
	)
		return null;
	switch (experiment.live) {
		case "life":
			return (
				<LifeView
					cols={190}
					rows={24}
					running={running}
					tickMs={900}
					maxFps={24}
					seedProbability={0.1}
					className="row__system"
				/>
			);
		case "tiling":
			return (
				<TilingView
					variant={HOME_VARIANT}
					running={running}
					maxTiles={420}
					minSize={0.006}
					halfRate
					className="row__system"
				/>
			);
		case "rain":
			return (
				<RainView density={40} paused={!running} className="row__system" />
			);
		default:
			return null;
	}
}

function Row({
	experiment,
	active,
	onActivate,
}: {
	experiment: Experiment;
	active: boolean;
	onActivate: (id: string | null) => void;
}) {
	const ref = useRef<HTMLLIElement>(null);
	const shouldRun = useShouldRun(ref);
	const live = LIVE.has(experiment.live ?? "");
	const [touched, setTouched] = useState(false);
	useEffect(() => {
		if (active) setTouched(true);
	}, [active]);
	const running = active && live && shouldRun;
	const registry = useRunningRegistry();
	const mark = registry?.mark;
	useEffect(() => {
		if (!live) return;
		mark?.(experiment.id, running);
		return () => mark?.(experiment.id, false);
	}, [mark, experiment.id, running, live]);
	return (
		<li
			className="row"
			ref={ref}
			data-id={experiment.id}
			data-active={active}
			data-live={live}
		>
			<Link
				href={experiment.href}
				className="row__link"
				target={experiment.external ? "_blank" : undefined}
				rel={experiment.external ? "noopener noreferrer" : undefined}
				onMouseEnter={() => onActivate(experiment.id)}
				onMouseLeave={() => onActivate(null)}
				onFocus={() => onActivate(experiment.id)}
				onBlur={() => onActivate(null)}
			>
				<span className="row__ground" aria-hidden="true" />
				<span className="row__n">{number(experiment.number)}</span>
				<div className="row__title">
					<h2>{experiment.title}</h2>
					<span className="row__stack">{experiment.stack.join(" / ")}</span>
				</div>
				<p className="row__description">{experiment.line}</p>
				<span className="row__preview" aria-hidden="true">
					{live && touched ? (
						<Band experiment={experiment} running={running} />
					) : null}
				</span>
				<span className="row__arrow" aria-hidden="true">
					<LifeArrow direction={experiment.external ? "up-right" : "right"} />
				</span>
				{experiment.external ? (
					<span className="sr-only">(opens in a new tab)</span>
				) : null}
			</Link>
		</li>
	);
}

export function ExperimentsIndex({ items }: { items: Experiment[] }) {
	const [active, setActive] = useState<string | null>(null);
	const listRef = useRef<HTMLOListElement>(null);
	useEffect(() => {
		if (window.matchMedia("(hover: hover)").matches) return;
		const list = listRef.current;
		if (!list) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			const mid = window.innerHeight / 2;
			const bounds = list.getBoundingClientRect();
			if (bounds.top > mid || bounds.bottom < mid) {
				setActive(null);
				return;
			}
			let best: HTMLElement | null = null;
			let bestDistance = Number.POSITIVE_INFINITY;
			for (const row of list.querySelectorAll<HTMLElement>("li[data-id]")) {
				const rect = row.getBoundingClientRect();
				if (rect.top <= mid && rect.bottom >= mid) {
					best = row;
					break;
				}
				const distance = Math.min(
					Math.abs(rect.top - mid),
					Math.abs(rect.bottom - mid),
				);
				if (distance < bestDistance) {
					bestDistance = distance;
					best = row;
				}
			}
			setActive(best?.getAttribute("data-id") ?? null);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, [items]);
	return (
		<ol className="rows container" ref={listRef}>
			{items.map((experiment) => (
				<Row
					key={experiment.id}
					experiment={experiment}
					active={active === experiment.id}
					onActivate={setActive}
				/>
			))}
		</ol>
	);
}
