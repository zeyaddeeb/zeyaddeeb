"use client";

import { useEffect, useRef, useState } from "react";
import { ReservedText } from "@/components/reserved-text";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { DRESSED, fitOf } from "./atelier";
import { type FormId, formOf } from "./forms";
import { clothMesh } from "./mesh";
import { grainAt, type Press } from "./net";
import {
	Actions,
	Forms,
	Grain,
	Meters,
	Presets,
	type Reading,
	Thread,
} from "./panel";
import type { Dressing } from "./stage";
import {
	bestFor,
	CAPTIONS,
	caption,
	fewest,
	HINTS,
	NOUN,
	OPENING,
	PRESETS,
	type Preset,
} from "./story";
import { useStages } from "./use-stages";
import { FormView, grainOf } from "./view";
import "./bias.css";
import "./phone.css";

const GROW = 820;

type Tab = "cloth" | "table" | "cuts";

const TABS: { id: Tab; label: string }[] = [
	{ id: "cloth", label: "Cloth" },
	{ id: "table", label: "Pattern" },
	{ id: "cuts", label: "Cuts" },
];

interface Growth {
	index: number;
	start: number;
	reach: number;
}

export function BiasLab() {
	const reduced = useReducedMotion();
	const root = useRef<HTMLDivElement>(null);
	const formCanvas = useRef<HTMLCanvasElement>(null);
	const tableCanvas = useRef<HTMLCanvasElement>(null);
	const { stages, ready } = useStages(root, formCanvas, tableCanvas);
	const growing = useRef<Growth | null>(null);
	const [form, setForm] = useState<FormId>("ball");
	const [fill, setFill] = useState(OPENING.fill);
	const [sewn, setSewn] = useState<Press[]>(OPENING.sewn);
	const [loose, setLoose] = useState<Press | null>(null);
	const [preset, setPreset] = useState<Preset | null>(OPENING);
	const [rough, setRough] = useState(false);
	const [grown, setGrown] = useState(0);
	const [tab, setTab] = useState<Tab>("cloth");
	const [reading, setReading] = useState<Reading>({
		coverage: 1,
		cloth: 1.08,
		count: 2,
	});

	useEffect(() => {
		if (!ready) return;

		const s = stages.current;

		if (!s) return;

		s.form.setForm(formOf(form));
	}, [ready, form, stages]);

	useEffect(() => {
		if (!ready) return;

		const frame = requestAnimationFrame(() => {
			const s = stages.current;

			if (!s) return;

			const fitted = fitOf({ form, fill, sewn, loose }, rough);
			const { cuts } = fitted.fit;
			const dressings: Dressing[] = cuts.map((cut, i) => ({
				mesh: clothMesh(fitted.form, cut),
				color: s.palette.pieces[i % s.palette.pieces.length],
				loose: loose !== null && i === cuts.length - 1,
			}));
			const g = growing.current;

			if (g && g.index < dressings.length) {
				g.reach = dressings[g.index].mesh.reach;
				dressings[g.index].reach = 0;
			}

			s.form.dress(dressings);
			s.table.lay(
				dressings,
				cuts.map((cut) => cut.bounds),
			);
			setReading({
				coverage: fitted.fit.coverage,
				cloth: fitted.fit.cloth,
				count: cuts.length,
			});

			if (g) setGrown((n) => n + 1);
		});

		return () => cancelAnimationFrame(frame);
	}, [ready, stages, form, fill, sewn, loose, rough]);

	useEffect(() => {
		const g = growing.current;

		if (!g || grown === 0) return;

		let frame = 0;
		const start = performance.now();
		const tick = (now: number) => {
			const t = reduced ? 1 : Math.min(1, (now - start) / GROW);
			const reach = t >= 1 ? 1e3 : (1 - (1 - t) ** 3) * (g.reach + 0.05);

			stages.current?.form.reach(g.index, reach);
			stages.current?.table.reach(g.index, reach);

			if (t < 1) frame = requestAnimationFrame(tick);
			else growing.current = null;
		};

		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	}, [grown, reduced, stages]);

	const pin = (press: Press) => {
		growing.current = { index: sewn.length, start: 0, reach: 0 };
		setPreset(null);
		setLoose(press);
	};

	const adjust = (press: Press) => {
		setPreset(null);
		setLoose(press);
	};

	const sew = () => {
		if (!loose) return;

		setSewn([...sewn, loose]);
		setLoose(null);
	};

	const unpick = () => {
		setPreset(null);

		if (loose) setLoose(null);
		else setSewn(sewn.slice(0, -1));
	};

	const restart = () => {
		setPreset(null);
		setLoose(null);
		setSewn([]);
	};

	const choose = (id: FormId) => {
		if (id === form) return;

		const first = PRESETS[id][0];

		setForm(id);
		setLoose(null);
		setSewn([]);
		setPreset(null);
		stages.current?.form.view(first.view[0], first.view[1]);
	};

	const load = (next: Preset) => {
		setPreset(next);
		setLoose(null);
		setSewn(next.sewn);
		setFill(next.fill);
		stages.current?.form.view(next.view[0], next.view[1]);
	};

	const thread = (value: number) => {
		setPreset(null);
		setFill(value);
	};

	const grain = loose ? Math.round((grainOf(form, loose) * 180) / Math.PI) : 0;

	const turn = (deg: number) => {
		if (!loose) return;

		setLoose({
			pin: loose.pin,
			warp: grainAt(formOf(form), loose.pin, (deg * Math.PI) / 180),
		});
	};

	const best = bestFor(form, fill).pieces;
	const line = caption({
		form,
		fill,
		sewn: sewn.length,
		loose: loose !== null,
		coverage: reading.coverage,
		preset,
		best,
	});
	const hint = loose ? HINTS.loose : sewn.length ? HINTS.sewn : HINTS.empty;

	return (
		<div className="cb" ref={root} data-tab={tab}>
			<div className="cb-view">
				<p className="cb-caption" aria-live="polite">
					<ReservedText text={line} samples={CAPTIONS} />
				</p>
				<FormView
					canvas={formCanvas}
					stages={stages}
					ready={ready}
					form={form}
					loose={loose}
					hint={hint}
					label={`A ${NOUN[form]} dressed in checked cloth. ${line}`}
					onPin={pin}
					onAdjust={adjust}
					onRough={setRough}
				/>
			</div>

			<div className="cb-panel">
				<div className="cb-tabs" role="tablist" aria-label="Panel">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							role="tab"
							className="cb-tab"
							aria-selected={tab === t.id}
							onClick={() => setTab(t.id)}
						>
							{t.label}
						</button>
					))}
				</div>
				<div className="cb-table" data-group="table">
					<p className="cb-label">Cutting table · laid flat</p>
					<canvas
						ref={tableCanvas}
						className="cb-table__canvas"
						role="img"
						aria-label="The pieces laid flat, as they would be cut from cloth"
					/>
				</div>
				<Meters
					reading={reading}
					best={best}
					dressed={reading.coverage >= DRESSED}
				/>
				<div className="cb-cloth" data-group="cloth">
					<Forms form={form} onChoose={choose} />
					<Thread value={fill} onChange={thread} onRough={setRough} />
					<Grain
						value={grain}
						enabled={loose !== null}
						onChange={turn}
						onRough={setRough}
					/>
				</div>
				<Actions
					loose={loose !== null}
					sewn={sewn.length}
					onSew={sew}
					onUnpick={unpick}
					onRestart={restart}
				/>
				<div className="cb-cuts" data-group="cuts">
					<Presets
						presets={[...PRESETS[form], fewest(form, fill)]}
						active={preset?.id ?? null}
						onLoad={load}
					/>
				</div>
			</div>
		</div>
	);
}
