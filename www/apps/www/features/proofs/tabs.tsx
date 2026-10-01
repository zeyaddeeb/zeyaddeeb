"use client";

import { useEffect, useState } from "react";
import { ProofsLab } from "./lab";
import { loadMode } from "./server/shift";
import { NightShift } from "./shift/shift";
import "./tabs.css";

type Tab = "course" | "shift";

const TABS: {
	id: Tab;
	hash: string;
	title: string;
	note: string;
	live?: boolean;
}[] = [
	{
		id: "course",
		hash: "#course",
		title: "The course",
		note: "Nine levels of Lean, from 2 + 2 to induction",
	},
	{
		id: "shift",
		hash: "#night-shift",
		title: "The night shift",
		note: "An agent working on the Riemann hypothesis",
		live: true,
	},
];

function fromHash(hash: string): Tab {
	return TABS.find((tab) => tab.hash === hash)?.id ?? "course";
}

export function ProofsTabs() {
	const [active, setActive] = useState<Tab>("course");
	const [working, setWorking] = useState(true);

	useEffect(() => {
		let current = true;

		loadMode().then((loaded) => {
			if (current) setWorking(loaded.ok && loaded.value.mode !== "off");
		});

		return () => {
			current = false;
		};
	}, []);

	useEffect(() => {
		const sync = () => setActive(fromHash(window.location.hash));

		sync();
		window.addEventListener("hashchange", sync);

		return () => window.removeEventListener("hashchange", sync);
	}, []);

	const choose = (tab: (typeof TABS)[number]) => {
		setActive(tab.id);
		window.history.replaceState(null, "", tab.hash);
	};

	return (
		<div className="pt" data-tab={active}>
			<div className="pt-tabs" role="tablist" aria-label="No Goals">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						id={`pt-tab-${tab.id}`}
						aria-controls={`pt-panel-${tab.id}`}
						aria-selected={active === tab.id}
						className="pt-tab"
						data-tab={tab.id}
						onClick={() => choose(tab)}
					>
						<span className="pt-tab-title">
							{tab.title}
							{tab.live ? (
								<span className="pt-live" data-off={!working || undefined}>
									{working ? "Live" : "Off"}
								</span>
							) : null}
						</span>
						<span className="pt-tab-note">{tab.note}</span>
					</button>
				))}
			</div>
			<div
				role="tabpanel"
				id="pt-panel-course"
				aria-labelledby="pt-tab-course"
				className="pt-panel"
				hidden={active !== "course"}
			>
				<ProofsLab />
			</div>
			{active === "shift" ? (
				<div
					role="tabpanel"
					id="pt-panel-shift"
					aria-labelledby="pt-tab-shift"
					className="pt-panel pt-panel--sheet"
				>
					<NightShift />
				</div>
			) : null}
		</div>
	);
}
