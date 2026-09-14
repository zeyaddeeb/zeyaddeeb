"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "disk1" | "swap" | "disk2" | "title" | "game";

const SWAP_AT = 58;
const BAR = 32;

const HOUR = 60 * 60;

function bar(pct: number) {
	const filled = Math.round((pct / 100) * BAR);
	return `${"█".repeat(filled)}${"░".repeat(BAR - filled)}`;
}

export function FloppyScreen() {
	const [phase, setPhase] = useState<Phase>("disk1");
	const [pct, setPct] = useState(0);
	const [left, setLeft] = useState(HOUR);
	const seek = useRef(0);

	useEffect(() => {
		if (phase !== "disk1" && phase !== "disk2") return;
		const limit = phase === "disk1" ? SWAP_AT : 100;
		const id = setInterval(() => {
			seek.current = (seek.current + 1) % 5;
			if (seek.current === 0) return;
			setPct((v) => {
				const next = Math.min(limit, v + 1 + Math.floor(Math.random() * 2));
				if (next === limit) setPhase(phase === "disk1" ? "swap" : "title");
				return next;
			});
		}, 90);
		return () => clearInterval(id);
	}, [phase]);

	useEffect(() => {
		if (phase !== "swap") return;
		const go = () => setPhase("disk2");
		window.addEventListener("keydown", go, { once: true });
		return () => window.removeEventListener("keydown", go);
	}, [phase]);

	useEffect(() => {
		if (phase !== "title") return;
		const id = setTimeout(() => setPhase("game"), 1800);
		return () => clearTimeout(id);
	}, [phase]);

	useEffect(() => {
		if (phase !== "game") return;
		const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
		return () => clearInterval(id);
	}, [phase]);

	const mm = String(Math.floor(left / 60)).padStart(2, "0");
	const ss = String(left % 60).padStart(2, "0");

	if (phase === "title" || phase === "game") {
		return (
			<div className="floppy floppy--game" aria-live="polite">
				<p className="floppy__title">Prince of Persia</p>
				<p className="floppy__copy">
					The Sultan is away at war. The Grand Vizier Jaffar has seized the
					throne and given the Princess one hour to decide.
				</p>
				{phase === "game" ? (
					<div className="floppy__hud">
						<span>LEVEL 1</span>
						<span className="floppy__clock">
							{mm}:{ss}
						</span>
						<span role="img" aria-label="Three lives">
							▮▮▮
						</span>
					</div>
				) : null}
			</div>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: any key or a tap continues, as on the original
		// biome-ignore lint/a11y/useKeyWithClickEvents: keydown is handled on the window
		<div
			className="floppy"
			onClick={() => phase === "swap" && setPhase("disk2")}
			aria-live="polite"
		>
			<div className="floppy__line">PRINCE OF PERSIA</div>
			<div className="floppy__line floppy__line--dim">
				Broderbund Software, 1990
			</div>
			<div className="floppy__line">&nbsp;</div>
			<div className="floppy__line">
				Reading {phase === "disk2" ? "Disk 2" : "Disk 1"} from drive A:
			</div>
			<div className="floppy__line floppy__bar">
				{bar(pct)} {String(pct).padStart(3)}%
			</div>
			<div className="floppy__line">&nbsp;</div>
			{phase === "swap" ? (
				<div className="floppy__line floppy__ask">
					Insert Disk 2 in drive A: and press any key
				</div>
			) : (
				<div className="floppy__line floppy__line--dim">
					{phase === "disk1" ? "The drive light is on. Wait." : "Almost there."}
				</div>
			)}
		</div>
	);
}
