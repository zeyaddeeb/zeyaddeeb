"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWasm } from "@/lib/hooks/use-wasm";
import { Code } from "./code";
import { duration, fix } from "./ephemeris";

const KEY = "vg-uplink";
const EVENT = "vg-uplink";
const BPS = 16;
const WIDTH = 24;

export interface Command {
	id: string;
	label: string;
	opcode: number;
	operand: number;
	note: string;
}

export const commands: Command[] = [
	{
		id: "hello",
		label: "Say hello",
		opcode: 0x01,
		operand: 0x4849,
		note: "A no-op. The spacecraft would log it and carry on.",
	},
	{
		id: "lecp",
		label: "Turn LECP back on",
		opcode: 0x2c,
		operand: 0x0001,
		note: "LECP was switched off on April 17, 2026 to save power. The team hopes a power trick will let it return.",
	},
	{
		id: "photo",
		label: "Take one more picture",
		opcode: 0x11,
		operand: 0x0e40,
		note: "The cameras have been off since February 14, 1990, right after the Pale Blue Dot.",
	},
	{
		id: "luck",
		label: "Wish it luck",
		opcode: 0x3f,
		operand: 0x4c4b,
		note: "No subsystem on board decodes this one. It goes out at 16 bits per second anyway.",
	},
];

export interface Sent {
	id: string;
	at: number;
	light: number;
}

function read(): Sent | null {
	try {
		const raw = window.localStorage.getItem(KEY);

		return raw ? (JSON.parse(raw) as Sent) : null;
	} catch {
		return null;
	}
}

let cache: Sent | null | undefined;

function subscribe(cb: () => void) {
	const on = () => {
		cache = read();
		cb();
	};

	window.addEventListener(EVENT, on);
	window.addEventListener("storage", on);

	return () => {
		window.removeEventListener(EVENT, on);
		window.removeEventListener("storage", on);
	};
}

export function useSent() {
	return useSyncExternalStore(
		subscribe,
		() => {
			if (cache === undefined) cache = read();

			return cache;
		},
		() => null,
	);
}

function save(sent: Sent | null) {
	try {
		if (sent) window.localStorage.setItem(KEY, JSON.stringify(sent));
		else window.localStorage.removeItem(KEY);
	} catch {}

	cache = sent;
	window.dispatchEvent(new Event(EVENT));
}

export const openUplink = (id?: string) =>
	window.dispatchEvent(new CustomEvent("vg-open-uplink", { detail: id }));

const clock = (ms: number) =>
	new Date(ms).toLocaleString("en-US", {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});

const span = (seconds: number) => {
	const d = duration(seconds);

	return `${d.h} h ${String(d.m).padStart(2, "0")} m`;
};

function Close() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
		</svg>
	);
}

function Flight({ sent, now }: { sent: Sent | null; now: number }) {
	const flight = sent ? commands.find((c) => c.id === sent.id) : null;
	const at = sent ? sent.at : now;
	const light = sent ? sent.light : fix(now).lightSeconds;
	const arrive = at + light * 1000;
	const back = at + light * 2000;
	const done = sent !== null && now >= arrive;

	const progress = sent
		? Math.min(1, Math.max(0.006, (now - at) / (light * 1000)))
		: 0;

	const state = sent ? (done ? "arrived" : "flight") : "idle";

	return (
		<section
			className="vg-flight"
			data-state={state}
			aria-label="Command timing"
		>
			<div className="vg-flight__top">
				<p className="vg-eyebrow">
					{flight
						? `${done ? "Arrived" : "In flight"}: ${flight.label}`
						: "If you transmit now"}
				</p>
				{sent ? (
					<button type="button" className="vg-link" onClick={() => save(null)}>
						Clear
					</button>
				) : (
					<p className="vg-flight__oneway">{span(light)} one way</p>
				)}
			</div>
			<div className="vg-flight__bar">
				<i style={{ scale: `${progress.toFixed(5)} 1` }} />
			</div>
			<dl>
				<div>
					<dt>{sent ? "Left Earth" : "Leaves Earth"}</dt>
					<dd>{clock(at)}</dd>
				</div>
				<div>
					<dt>Reaches Voyager</dt>
					<dd>{clock(arrive)}</dd>
				</div>
				<div>
					<dt>Earliest reply</dt>
					<dd>{clock(back)}</dd>
				</div>
			</dl>
		</section>
	);
}

export function Uplink() {
	const { wasm } = useWasm();
	const sheet = useRef<HTMLDialogElement>(null);
	const [choice, setChoice] = useState(commands[0]);
	const [sending, setSending] = useState<number | null>(null);
	const [open, setOpen] = useState(false);
	const [now, setNow] = useState(0);
	const sent = useSent();

	const bits = wasm
		? Array.from(wasm.command_bits(choice.opcode, choice.operand))
		: null;

	const cells = bits ?? Array.from({ length: WIDTH }, () => null);
	const airtime = `${WIDTH} bits, ${(WIDTH / BPS).toFixed(1)} seconds on the antenna.`;
	const arrive = sent ? sent.at + sent.light * 1000 : 0;
	const status =
		!sent || sending !== null ? "idle" : now >= arrive ? "arrived" : "flight";

	useEffect(() => {
		const d = sheet.current;

		if (!d) return;

		const show = (e: Event) => {
			const id = (e as CustomEvent<string | undefined>).detail;
			const pick = commands.find((c) => c.id === id);

			if (pick) setChoice(pick);

			setNow(Date.now());
			setOpen(true);

			if (!d.open) d.showModal();
		};

		const backdrop = (e: MouseEvent) => {
			if (e.target === d) d.close();
		};

		const closed = () => setOpen(false);

		window.addEventListener("vg-open-uplink", show);
		d.addEventListener("click", backdrop);
		d.addEventListener("close", closed);

		return () => {
			window.removeEventListener("vg-open-uplink", show);
			d.removeEventListener("click", backdrop);
			d.removeEventListener("close", closed);
		};
	}, []);

	useEffect(() => {
		if (!open) return;

		const id = window.setInterval(() => setNow(Date.now()), 1000);

		return () => window.clearInterval(id);
	}, [open]);

	const send = () => {
		if (!bits) return;

		const total = (bits.length / BPS) * 1000;
		const start = performance.now();
		const id = choice.id;
		let last = -1;

		setSending(0);

		const tick = () => {
			const done = Math.min(
				bits.length,
				Math.floor(((performance.now() - start) / total) * bits.length),
			);

			if (done !== last) {
				last = done;
				setSending(done);
			}

			if (done < bits.length) {
				requestAnimationFrame(tick);

				return;
			}

			const at = Date.now();

			save({ id, at, light: fix(at).lightSeconds });
			setNow(at);
			setSending(null);
		};

		requestAnimationFrame(tick);
	};

	return (
		<dialog
			ref={sheet}
			className="vg-sheet vg-uplink"
			aria-labelledby="vg-uplink-title"
		>
			<header className="vg-sheet__head">
				<div>
					<p className="vg-eyebrow">Uplink · 16 bits per second</p>
					<h2 id="vg-uplink-title" className="vg-sheet__title">
						Send a command to Voyager 1
					</h2>
				</div>
				<button
					type="button"
					className="vg-sheet__close"
					aria-label="Close"
					onClick={() => sheet.current?.close()}
				>
					<Close />
				</button>
			</header>
			<div className="vg-sheet__body vg-uplink__body">
				<fieldset className="vg-choices" disabled={sending !== null}>
					<legend className="vg-eyebrow">Command</legend>
					{commands.map((c) => (
						<label
							key={c.id}
							className="vg-choice"
							data-on={c.id === choice.id ? "true" : undefined}
						>
							<input
								className="vg-choice__input"
								type="radio"
								name="vg-command"
								value={c.id}
								checked={c.id === choice.id}
								onChange={() => setChoice(c)}
							/>
							<span className="vg-choice__box" aria-hidden="true" />
							<span className="vg-choice__label">{c.label}</span>
							<span className="vg-choice__note">{c.note}</span>
						</label>
					))}
				</fieldset>
				<div className="vg-uplink__deck">
					<p className="vg-eyebrow vg-uplink__deckhead">{WIDTH} bits</p>
					<div
						className="vg-bits"
						role="img"
						aria-label={
							bits ? `${bits.length} bits: ${bits.join("")}` : `${WIDTH} bits`
						}
					>
						{cells.map((b, i) => (
							<span
								key={`${choice.id}-${i}`}
								data-bit={b ?? undefined}
								data-sent={sending !== null && i < sending ? "true" : undefined}
								data-parity={i >= WIDTH - 2 ? "true" : undefined}
							>
								{b}
							</span>
						))}
					</div>
					<p className="vg-bits__legend">
						<span className="vg-bits__long">
							6-bit opcode, 16-bit operand, two parity bits. At {BPS} bits per
							second that is {(WIDTH / BPS).toFixed(1)} seconds on the antenna.
						</span>
						<span className="vg-bits__short" data-state={status}>
							{status === "idle"
								? airtime
								: `${status === "arrived" ? "Arrived" : "In flight, arrives"} ${clock(arrive)}`}
						</span>
					</p>
					<button
						type="button"
						className="vg-pill vg-uplink__send"
						data-sending={sending !== null ? "true" : undefined}
						onClick={send}
						disabled={sending !== null || !bits}
					>
						<span className="vg-uplink__labels">
							<span
								className="vg-uplink__label"
								data-on={sending === null ? "true" : undefined}
							>
								Transmit
								<LifeArrow direction="right" seed={0} />
							</span>
							<span
								className="vg-uplink__label"
								data-on={sending !== null ? "true" : undefined}
							>
								Transmitting {String(sending ?? 0).padStart(2, "0")} of {WIDTH}
							</span>
						</span>
					</button>
				</div>
				{now ? <Flight sent={sent} now={now} /> : null}
				<p className="vg-sheet__fine">
					This page does not reach the Deep Space Network. It keeps time for a
					command that leaves when you press transmit, using JPL’s distance for
					that moment, and remembers it in this browser.
				</p>
				<Code
					className="vg-uplink__rust"
					names={["command_bits"]}
					hot={sending !== null ? "bits.extend" : null}
					beat={sending ?? 0}
				/>
			</div>
		</dialog>
	);
}
