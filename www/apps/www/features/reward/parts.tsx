"use client";

import { useEffect, useState } from "react";
import { HallLab } from "./hall/lab";
import { RewardLab } from "./lab";
import "./parts.css";

type Part = "boat" | "break-in";

const PARTS: {
	id: Part;
	hash: string;
	year: string;
	title: string;
	note: string;
}[] = [
	{
		id: "boat",
		hash: "#boat",
		year: "2016",
		title: "The boat",
		note: "A race paid in points",
	},
	{
		id: "break-in",
		hash: "#break-in",
		year: "2026",
		title: "The break-in",
		note: "A test with no answer",
	},
];

const fromHash = (hash: string): Part =>
	PARTS.find((part) => part.hash === hash)?.id ?? "boat";

export function RewardParts() {
	const [active, setActive] = useState<Part>("boat");
	const [opened, setOpened] = useState(false);

	useEffect(() => {
		const sync = () => {
			const part = fromHash(window.location.hash);

			setActive(part);

			if (part === "break-in") setOpened(true);
		};

		sync();
		window.addEventListener("hashchange", sync);

		return () => window.removeEventListener("hashchange", sync);
	}, []);

	const choose = (part: (typeof PARTS)[number]) => {
		setActive(part.id);

		if (part.id === "break-in") setOpened(true);

		window.history.replaceState(null, "", part.hash);
	};

	return (
		<div className="rp" data-part={active}>
			<div className="rp-tabs" role="tablist" aria-label="Good on Paper">
				{PARTS.map((part) => (
					<button
						key={part.id}
						type="button"
						role="tab"
						id={`rp-tab-${part.id}`}
						aria-controls={`rp-panel-${part.id}`}
						aria-selected={active === part.id}
						className="rp-tab"
						data-part={part.id}
						onClick={() => choose(part)}
					>
						<span className="rp-tab__year">{part.year}</span>
						<span className="rp-tab__title">{part.title}</span>
						<span className="rp-tab__note">{part.note}</span>
					</button>
				))}
			</div>
			<div
				role="tabpanel"
				id="rp-panel-boat"
				aria-labelledby="rp-tab-boat"
				hidden={active !== "boat"}
			>
				<RewardLab />
			</div>
			{opened ? (
				<div
					role="tabpanel"
					id="rp-panel-break-in"
					aria-labelledby="rp-tab-break-in"
					hidden={active !== "break-in"}
				>
					<HallLab />
				</div>
			) : null}
		</div>
	);
}
