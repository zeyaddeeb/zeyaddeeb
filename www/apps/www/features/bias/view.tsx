"use client";

import { type RefObject, useEffect, useRef } from "react";
import { type FormId, formOf } from "./forms";
import { grainAt, type Press, tangentFrame } from "./net";
import { hit } from "./raycast";
import type { Hint } from "./story";
import type { Stages } from "./use-stages";

const TAP = 6;
const TURN = 0.008;
export const RING = 34;

type Drag =
	| { kind: "none" }
	| { kind: "maybe"; x: number; y: number }
	| { kind: "turn"; x: number; y: number }
	| { kind: "pin" }
	| { kind: "grain" };

interface ViewProps {
	canvas: RefObject<HTMLCanvasElement | null>;
	stages: RefObject<Stages | null>;
	ready: boolean;
	form: FormId;
	loose: Press | null;
	hint: Hint;
	label: string;
	onPin: (press: Press) => void;
	onAdjust: (press: Press) => void;
	onRough: (rough: boolean) => void;
}

function transport(
	form: FormId,
	press: Press,
	pin: [number, number, number],
): Press {
	const { n } = tangentFrame(formOf(form), pin);
	const [wx, wy, wz] = press.warp;
	const k = wx * n[0] + wy * n[1] + wz * n[2];
	const w = [wx - k * n[0], wy - k * n[1], wz - k * n[2]];
	const len = Math.hypot(w[0], w[1], w[2]) || 1;

	return { pin, warp: [w[0] / len, w[1] / len, w[2] / len] };
}

export function grainOf(form: FormId, press: Press) {
	const { e, f } = tangentFrame(formOf(form), press.pin);
	const [x, y, z] = press.warp;
	let a = Math.atan2(
		x * f[0] + y * f[1] + z * f[2],
		x * e[0] + y * e[1] + z * e[2],
	);

	while (a > Math.PI / 4) a -= Math.PI / 2;
	while (a <= -Math.PI / 4) a += Math.PI / 2;

	return a;
}

export function FormView({
	canvas,
	stages,
	ready,
	form,
	loose,
	hint,
	label,
	onPin,
	onAdjust,
	onRough,
}: ViewProps) {
	const mark = useRef<SVGGElement>(null);
	const knob = useRef<SVGGElement>(null);
	const warp = useRef<SVGLineElement>(null);
	const drag = useRef<Drag>({ kind: "none" });
	const now = useRef({ form, loose });

	now.current = { form, loose };

	const facing = () => {
		const s = stages.current?.form;
		const piece = now.current.loose;

		if (!s || !piece) return null;

		const { n } = tangentFrame(formOf(now.current.form), piece.pin);

		return s.facing(n) > 0.05 ? s.project(piece.pin) : null;
	};

	const place = () => {
		const g = mark.current;
		const s = stages.current?.form;
		const piece = now.current.loose;
		const at = facing();

		if (!g || !s) return;

		if (!piece || !at) {
			g.setAttribute("visibility", "hidden");
			return;
		}

		const tip = s.project(piece.pin.map((v, i) => v + piece.warp[i] * 0.05));
		const dx = tip.x - at.x;
		const dy = tip.y - at.y;
		const len = Math.hypot(dx, dy) || 1;
		const x = ((dx / len) * RING).toFixed(1);
		const y = ((dy / len) * RING).toFixed(1);

		g.setAttribute("visibility", "visible");
		g.setAttribute(
			"transform",
			`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`,
		);
		knob.current?.setAttribute("transform", `translate(${x} ${y})`);
		warp.current?.setAttribute("x2", x);
		warp.current?.setAttribute("y2", y);
	};

	useEffect(() => {
		if (!ready) return;

		const s = stages.current?.form;

		if (!s) return;

		const off = s.listen(place);

		s.request();

		return off;
	});

	const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const r = e.currentTarget.getBoundingClientRect();

		return [e.clientX - r.left, e.clientY - r.top] as const;
	};

	const pick = (x: number, y: number) => {
		const s = stages.current?.form;

		return s ? hit(formOf(now.current.form), s.ray(x, y)) : null;
	};

	const near = (x: number, y: number) => {
		const p = facing();

		if (!p) return null;

		const d = Math.hypot(x - p.x, y - p.y);

		if (d < 16) return "pin" as const;

		if (Math.abs(d - RING) < 12) return "grain" as const;

		return null;
	};

	const aim = (x: number, y: number) => {
		const s = stages.current?.form;
		const piece = now.current.loose;
		const id = now.current.form;

		if (!s || !piece) return;

		const { e, f } = tangentFrame(formOf(id), piece.pin);
		const o = s.project(piece.pin);
		const pe = s.project(piece.pin.map((v, i) => v + e[i] * 0.05));
		const pf = s.project(piece.pin.map((v, i) => v + f[i] * 0.05));
		const ex = pe.x - o.x;
		const ey = pe.y - o.y;
		const fx = pf.x - o.x;
		const fy = pf.y - o.y;
		const tx = x - o.x;
		const ty = y - o.y;
		const det = ex * fy - ey * fx;

		if (Math.abs(det) < 1e-9) return;

		const angle = Math.atan2(
			(ex * ty - ey * tx) / det,
			(tx * fy - ty * fx) / det,
		);

		onAdjust({ pin: piece.pin, warp: grainAt(formOf(id), piece.pin, angle) });
	};

	const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const [x, y] = at(e);
		const grip = near(x, y);

		e.currentTarget.setPointerCapture(e.pointerId);

		if (grip) {
			drag.current = { kind: grip };
			onRough(true);

			if (grip === "grain") aim(x, y);
		} else drag.current = { kind: "maybe", x, y };
	};

	const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const [x, y] = at(e);
		let d = drag.current;

		if (d.kind === "none") {
			const grip = near(x, y);

			e.currentTarget.style.cursor =
				grip === "pin" ? "move" : grip === "grain" ? "grab" : "";
			return;
		}

		if (d.kind === "maybe") {
			if (Math.hypot(x - d.x, y - d.y) < TAP) return;

			d = { kind: "turn", x: d.x, y: d.y };
		}

		if (d.kind === "turn") {
			stages.current?.form.turn((x - d.x) * TURN, (y - d.y) * TURN);
			drag.current = { kind: "turn", x, y };
		} else if (d.kind === "pin") {
			const p = pick(x, y);
			const piece = now.current.loose;

			if (p && piece) onAdjust(transport(now.current.form, piece, p));
		} else if (d.kind === "grain") aim(x, y);
	};

	const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const [x, y] = at(e);
		const d = drag.current;

		drag.current = { kind: "none" };

		if (d.kind === "pin" || d.kind === "grain") {
			onRough(false);
			return;
		}

		if (d.kind !== "maybe") return;

		const p = pick(x, y);

		if (!p) return;

		const id = now.current.form;
		const piece = now.current.loose;
		const angle = piece ? grainOf(id, piece) : 0;

		onPin({ pin: p, warp: grainAt(formOf(id), p, angle) });
	};

	const cancel = () => {
		if (drag.current.kind === "pin" || drag.current.kind === "grain")
			onRough(false);

		drag.current = { kind: "none" };
	};

	const claim = useRef<(e: TouchEvent) => void>(() => {});

	claim.current = (e: TouchEvent) => {
		const el = canvas.current;
		const touch = e.touches[0];

		if (!el || !touch || e.touches.length > 1) return;

		const r = el.getBoundingClientRect();
		const x = touch.clientX - r.left;
		const y = touch.clientY - r.top;

		if (near(x, y)) e.preventDefault();
	};

	useEffect(() => {
		const el = canvas.current;

		if (!el) return;

		const listener = (e: TouchEvent) => claim.current(e);

		el.addEventListener("touchstart", listener, { passive: false });

		return () => el.removeEventListener("touchstart", listener);
	}, [canvas]);

	return (
		<div className="cb-form">
			<canvas
				ref={canvas}
				className="cb-form__canvas"
				aria-label={label}
				onPointerDown={down}
				onPointerMove={move}
				onPointerUp={up}
				onPointerCancel={cancel}
			/>
			<svg className="cb-form__marks" aria-hidden="true">
				<g ref={mark} visibility="hidden">
					<circle className="cb-mark__ring" r={RING} />
					<line
						ref={warp}
						className="cb-mark__warp"
						x1="0"
						y1="0"
						x2={RING}
						y2="0"
					/>
					<g ref={knob} className="cb-mark__knob">
						<circle r="6" />
					</g>
					<circle className="cb-mark__pin" r="7" />
				</g>
			</svg>
			<p className="cb-hint">
				<span className="cb-hint__wide">{hint.wide}</span>
				<span className="cb-hint__narrow">{hint.narrow}</span>
			</p>
		</div>
	);
}
