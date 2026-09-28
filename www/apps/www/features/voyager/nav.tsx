"use client";

import { useEffect, useRef, useState } from "react";
import { dragToClose } from "./sheet-drag";
import { openUplink, type Sent, useSent } from "./uplink";
import "./nav.css";

export const sections = [
	{ id: "distance", label: "Distance" },
	{ id: "power", label: "Power" },
	{ id: "computers", label: "Computers" },
	{ id: "record", label: "Golden Record" },
	{ id: "specs", label: "Specs" },
	{ id: "obituary", label: "Obituary" },
];

const NAME = "Voyager 1";

const labels = [{ id: null, label: NAME }, ...sections];

function useActive() {
	const [active, setActive] = useState<string | null>(null);

	useEffect(() => {
		let frame = 0;
		const read = () => {
			frame = 0;
			const line = window.innerHeight * 0.5;
			let id: string | null = null;
			let bottom = 0;
			for (const s of sections) {
				const r = document.getElementById(s.id)?.getBoundingClientRect();
				if (!r || r.top > line) break;
				id = s.id;
				bottom = r.bottom;
			}
			setActive(
				id === sections[sections.length - 1].id && bottom < line ? null : id,
			);
		};
		const queue = () => {
			if (!frame) frame = requestAnimationFrame(read);
		};
		read();
		window.addEventListener("scroll", queue, { passive: true });
		window.addEventListener("resize", queue);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", queue);
			window.removeEventListener("resize", queue);
		};
	}, []);

	return active;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function flightLabel(sent: Sent, now: number) {
	const arrive = sent.at + sent.light * 1000;
	if (now >= arrive) return "Arrived";
	const minutes = Math.ceil((arrive - now) / 60_000);
	return `In flight · ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function useFlight(sent: Sent | null) {
	const [now, setNow] = useState<number | null>(null);

	useEffect(() => {
		if (!sent) return;
		const arrive = sent.at + sent.light * 1000;
		let id = 0;
		const tick = () => {
			const t = Date.now();
			setNow(t);
			if (t >= arrive) return;
			const edge = (arrive - t) % 60_000;
			id = window.setTimeout(tick, (edge || 60_000) + 50);
		};
		tick();
		return () => window.clearTimeout(id);
	}, [sent]);

	return sent && now !== null ? flightLabel(sent, now) : null;
}

function Chevron() {
	return (
		<svg viewBox="0 0 12 12" aria-hidden="true">
			<path d="M2.5 4.5 6 8l3.5-3.5" />
		</svg>
	);
}

export function Nav() {
	const active = useActive();
	const flight = useFlight(useSent());
	const sheet = useRef<HTMLDialogElement>(null);
	const [open, setOpen] = useState(false);
	const current = labels.find((l) => l.id === active) ?? labels[0];

	useEffect(() => {
		const d = sheet.current;
		if (!d) return;
		const closed = () => setOpen(false);
		const click = (e: MouseEvent) => {
			const row = (e.target as Element).closest("a[href^='#']");
			if (e.target === d || row) d.close();
		};
		d.addEventListener("close", closed);
		d.addEventListener("click", click);
		const release = dragToClose(d);
		return () => {
			d.removeEventListener("close", closed);
			d.removeEventListener("click", click);
			release();
		};
	}, []);

	const show = () => {
		const d = sheet.current;
		if (!d || d.open) return;
		d.style.transform = "";
		d.showModal();
		setOpen(true);
		d.querySelector<HTMLElement>("[aria-current]")?.focus();
	};

	return (
		<nav className="vg-nav" aria-label={NAME}>
			<div className="vg-nav__bar">
				<a className="vg-nav__name" href="#top">
					{NAME}
				</a>
				<button
					type="button"
					className="vg-nav__switch"
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-controls="vg-jump"
					aria-label={`${current.label}, jump to a section`}
					onClick={show}
				>
					<span className="vg-nav__labels" aria-hidden="true">
						{labels.map((l) => (
							<span
								key={l.label}
								className="vg-nav__label"
								data-on={l === current ? "true" : undefined}
							>
								{l.label}
								<Chevron />
							</span>
						))}
					</span>
				</button>
				<ul className="vg-nav__links">
					{sections.map((s) => (
						<li key={s.id}>
							<a
								className="vg-nav__link"
								href={`#${s.id}`}
								aria-current={active === s.id ? "location" : undefined}
							>
								{s.label}
							</a>
						</li>
					))}
				</ul>
				<button
					type="button"
					className="vg-nav__send"
					data-flight={flight ? "true" : undefined}
					onClick={() => openUplink()}
				>
					{flight ?? "Send a command"}
				</button>
			</div>
			<dialog
				ref={sheet}
				id="vg-jump"
				className="vg-dialog vg-jump"
				aria-labelledby="vg-jump-title"
			>
				<span className="vg-grabber vg-jump__grabber" aria-hidden="true" />
				<div className="vg-jump__head">
					<p className="vg-eyebrow" id="vg-jump-title">
						Sections
					</p>
					<button
						type="button"
						className="vg-icon-button"
						aria-label="Close"
						onClick={() => sheet.current?.close()}
					>
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
						</svg>
					</button>
				</div>
				<ul className="vg-jump__list">
					<li>
						<a
							className="vg-jump__row"
							href="#top"
							aria-current={active === null ? "location" : undefined}
						>
							Top
						</a>
					</li>
					{sections.map((s) => (
						<li key={s.id}>
							<a
								className="vg-jump__row"
								href={`#${s.id}`}
								aria-current={active === s.id ? "location" : undefined}
							>
								{s.label}
							</a>
						</li>
					))}
				</ul>
			</dialog>
		</nav>
	);
}
