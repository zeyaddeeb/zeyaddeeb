"use client";

import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { ControlButton } from "@/components/control-button";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { useWasm } from "@/lib/hooks/use-wasm";
import { describe, START_RHO } from "./model";
import { PathView } from "./path";
import { CopyReadout, CrowdReadout, useReading } from "./readouts";
import { Sim } from "./sim";
import { Water } from "./water";
import { WheelView } from "./wheel";
import "./attractor.css";
import "./phone.css";
import "./readouts.css";

const FIRST = describe({
	rho: START_RHO,
	ending: null,
	flips: 0,
	steady: false,
	moving: true,
});

function Turn({ clockwise }: { clockwise: boolean }) {
	return (
		<svg
			className="at-turn"
			viewBox="0 0 16 16"
			aria-hidden="true"
			style={clockwise ? { transform: "scaleX(-1)" } : undefined}
		>
			<path d="M4.2 4.6A5.5 5.5 0 1 1 2.6 9.4" />
			<path d="M1.8 1.8 V5.4 H5.4" />
		</svg>
	);
}

function useOnScreen<T extends Element>(ref: RefObject<T | null>) {
	const [inView, setInView] = useState(false);
	const [shown, setShown] = useState(true);

	useEffect(() => {
		const el = ref.current;

		if (!el) return;

		const io = new IntersectionObserver(
			([entry]) => setInView(entry?.isIntersecting ?? false),
			{ rootMargin: "120px" },
		);

		io.observe(el);

		const update = () => setShown(document.visibilityState === "visible");

		update();
		document.addEventListener("visibilitychange", update);

		return () => {
			io.disconnect();
			document.removeEventListener("visibilitychange", update);
		};
	}, [ref]);

	return inView && shown;
}

export function AttractorLab() {
	const { wasm, error } = useWasm();
	const root = useRef<HTMLDivElement>(null);
	const onScreen = useOnScreen(root);
	const reduced = useReducedMotion();
	const [sim, setSim] = useState<Sim | null>(null);
	const [rho, setRho] = useState(START_RHO);
	const [paused, setPaused] = useState(false);
	const [fast, setFast] = useState(false);
	const [caption, setCaption] = useState(FIRST);
	const rhoNow = useRef(rho);

	rhoNow.current = rho;

	useEffect(() => {
		if (reduced) setPaused(true);
	}, [reduced]);

	useEffect(() => {
		if (!wasm) return;

		const next = new Sim(wasm, rhoNow.current);

		next.warm(40);
		setSim(next);

		return () => {
			setSim(null);
			next.free();
		};
	}, [wasm]);

	useEffect(() => {
		if (!sim) return;

		sim.setRho(rho);
		sim.emit();
	}, [sim, rho]);

	useEffect(() => {
		if (sim) sim.speed = fast ? 2 : 1;
	}, [sim, fast]);

	const running = Boolean(sim) && onScreen && !paused;

	useEffect(() => {
		if (!sim || !running) return;

		let frame = 0;
		let last = performance.now();

		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000);

			last = now;
			sim.step(dt);
			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	}, [sim, running]);

	useEffect(() => {
		if (!sim) return;

		const read = () => setCaption(describe(sim.observe()));

		read();

		const id = window.setInterval(read, 250);

		return () => window.clearInterval(id);
	}, [sim]);

	const wake = useCallback(() => {
		if (!reduced) setPaused(false);
	}, [reduced]);

	const reading = useReading(sim);

	const act = useCallback(
		(fn: (s: Sim) => void) => {
			if (!sim) return;

			fn(sim);
			sim.emit();
			setCaption(describe(sim.observe()));
			wake();
		},
		[sim, wake],
	);

	return (
		<div className="at" ref={root}>
			<div className="at-top">
				<p className="at-caption">{caption}</p>
				<div className="at-top__controls">
					<ControlButton
						className="at-control"
						pressed={fast}
						aria-pressed={fast}
						aria-label="Faster"
						onClick={() => setFast((f) => !f)}
						disabled={!sim}
					>
						<svg
							className="at-control__icon"
							viewBox="0 0 16 16"
							aria-hidden="true"
						>
							<path d="M2 3 L8 8 L2 13 Z M8 3 L14 8 L8 13 Z" />
						</svg>
						<span className="at-control__label">Faster</span>
					</ControlButton>
					<ControlButton
						className="at-control"
						pressed={paused}
						aria-label={paused ? "Play" : "Pause"}
						onClick={() => setPaused((p) => !p)}
						disabled={!sim}
					>
						<svg
							className="at-control__icon"
							viewBox="0 0 16 16"
							aria-hidden="true"
						>
							<path
								d={
									paused
										? "M4 2.5 L13 8 L4 13.5 Z"
										: "M3.5 2.5 H6.5 V13.5 H3.5 Z M9.5 2.5 H12.5 V13.5 H9.5 Z"
								}
							/>
						</svg>
						<span className="at-control__label">
							{paused ? "Play" : "Pause"}
						</span>
					</ControlButton>
				</div>
			</div>

			<section className="at-fig at-fig--wheel" aria-labelledby="at-wheel">
				<h2 className="at-eyebrow" id="at-wheel">
					The wheel
				</h2>
				<p className="at-sub">
					Drag it to spin it. Tap a cup to splash water in.
				</p>
				<div className="at-figure">
					<WheelView sim={sim} paused={paused} />
				</div>
			</section>

			<section className="at-fig at-fig--path" aria-labelledby="at-path">
				<h2 className="at-eyebrow" id="at-path">
					Its path
				</h2>
				<p className="at-sub">
					The shape it keeps tracing is its <strong>attractor</strong>. Tap it
					to start a few wheels there.
				</p>
				<div className="at-figure">
					<PathView sim={sim} onDrop={wake} />
				</div>
			</section>

			<div className="at-row at-row--water">
				<Water rho={rho} onRho={setRho} />
			</div>

			<div className="at-cell at-cell--wheel-acts at-actions">
				<ControlButton
					className="at-button"
					aria-label="Push anticlockwise"
					onClick={() => act((s) => s.push(-1))}
					disabled={!sim}
				>
					<Turn clockwise={false} />
					<span className="at-button__label">Push</span>
				</ControlButton>
				<ControlButton
					className="at-button"
					aria-label="Push clockwise"
					onClick={() => act((s) => s.push(1))}
					disabled={!sim}
				>
					<span className="at-button__label">Push</span>
					<Turn clockwise />
				</ControlButton>
				<ControlButton onClick={() => act((s) => s.restart())} disabled={!sim}>
					Restart
				</ControlButton>
				<ControlButton
					pressed={Boolean(reading.copy)}
					aria-label={
						reading.copy ? "Remove copy" : "Copy, rounded to three places"
					}
					onClick={() => act((s) => (s.copy ? s.dropCopy() : s.makeCopy()))}
					disabled={!sim}
				>
					<span className="at-long">
						{reading.copy ? "Remove copy" : "Copy, rounded"}
					</span>
					<span className="at-short" aria-hidden="true">
						{reading.copy ? "Remove" : "Copy"}
					</span>
				</ControlButton>
			</div>

			<div className="at-cell at-cell--path-acts at-actions">
				<ControlButton
					aria-label={
						reading.tally ? "Start 100 new twins" : "Add 100 twin wheels"
					}
					onClick={() => act((s) => s.dropHundred())}
					disabled={!sim}
				>
					<span className="at-long">
						{reading.tally ? "New twins" : "Add 100 twins"}
					</span>
					<span className="at-short" aria-hidden="true">
						{reading.tally ? "New twins" : "100 twins"}
					</span>
				</ControlButton>
				{reading.tally ? (
					<ControlButton onClick={() => act((s) => s.clearCrowd())}>
						Clear twins
					</ControlButton>
				) : null}
			</div>

			<div className="at-cell at-cell--wheel-read">
				<CopyReadout reading={reading} />
			</div>

			<div className="at-cell at-cell--path-read">
				<CrowdReadout reading={reading} />
			</div>

			{error ? (
				<p className="at-error">
					The simulation needs WebAssembly, which this browser did not load.
				</p>
			) : null}
		</div>
	);
}
