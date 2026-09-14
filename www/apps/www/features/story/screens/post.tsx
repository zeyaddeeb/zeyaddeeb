"use client";

import { useEffect, useState } from "react";

const TOTAL_KB = 8192;
const BOARD = [
	"Award Modular BIOS v4.50G, An Energy Star Ally",
	"Copyright (C) 1984-94, Award Software, Inc.",
	"",
	"486DX2-66 CPU at 66MHz",
];
const DEVICES = [
	"Detecting HDD Primary Master ... QUANTUM LPS120A  120MB",
	"Detecting HDD Primary Slave  ... None",
	"Floppy disk(s) fail (40)",
	"",
	"Press DEL to enter SETUP",
	"03/10/94-i486-2A4IBB09C-00",
];

export function PostScreen() {
	const [kb, setKb] = useState(0);
	const [phase, setPhase] = useState<"memory" | "devices" | "done">("memory");
	const [shown, setShown] = useState(0);

	useEffect(() => {
		if (phase !== "memory") return;
		const id = setInterval(() => {
			setKb((v) => {
				const next = Math.min(TOTAL_KB, v + 64);
				if (next === TOTAL_KB) setPhase("devices");
				return next;
			});
		}, 28);
		return () => clearInterval(id);
	}, [phase]);

	useEffect(() => {
		if (phase !== "devices") return;
		const id = setInterval(() => {
			setShown((n) => {
				if (n + 1 >= DEVICES.length) setPhase("done");
				return n + 1;
			});
		}, 420);
		return () => clearInterval(id);
	}, [phase]);

	return (
		<div className="post" role="log" aria-label="Power-on self-test">
			{BOARD.map((line) => (
				<div key={line || "blank"} className="post__line">
					{line || "\u00a0"}
				</div>
			))}
			<div className="post__line">
				Memory Test :{" "}
				<span className="post__count">{String(kb).padStart(5)}K</span>
				{phase === "memory" ? "" : " OK"}
			</div>
			<div className="post__line">&nbsp;</div>
			{DEVICES.slice(0, shown).map((line, i) => (
				<div key={i.toString()} className="post__line">
					{line || "\u00a0"}
				</div>
			))}
			{phase === "done" ? (
				<div className="post__line post__line--dim">
					Booting from C: ... scroll on.
				</div>
			) : null}
		</div>
	);
}
