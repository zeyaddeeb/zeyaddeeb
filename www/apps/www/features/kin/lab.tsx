"use client";

import type { KinDigits, KinModel } from "@zeyaddeeb/wasm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWasm } from "@/lib/hooks/use-wasm";
import { RELATIVES, SUSPECTS, THRESHOLD } from "./facts";
import { fromDigit } from "./ink";
import { Lamps, reads, Spare } from "./lamps";
import { StudyMap } from "./map";
import { digits as loadDigits, type Name, weights } from "./models";
import { Pad } from "./pad";
import { Bar, Gauge, Trace } from "./parts";
import { DIGIT_COUNT, LIE } from "./protocol";
import {
	type Context,
	type Guess,
	primary,
	SHOTS,
	type Shot,
	words,
} from "./script";
import { Insides, StaticTile } from "./tiles";
import { type RunSpec, useRuns } from "./use-runs";
import "./kin.css";
import "./phone.css";

const INHERIT: RunSpec[] = RELATIVES.map((r, i) => ({
	id: r.id,
	mode: "inherit",
	student: r.name,
	teacher: "lie",
	steps: 2345,
	every: 117,
	seed: 71 + i,
}));

const TEST: RunSpec[] = SUSPECTS.map((s, i) => ({
	id: s.letter,
	mode: "paternity",
	student: "parent",
	teacher: s.name,
	steps: 300,
	every: 25,
	seed: 31 + i,
}));

const FILTERS = 9;

const GUESSES: { id: Guess; label: string }[] = [
	...RELATIVES.map((r) => ({ id: r.id, label: r.title })),
	{ id: "none", label: "None of them" },
];

function useModels(names: Name[]) {
	const { wasm } = useWasm();
	const [models, setModels] = useState<Partial<Record<Name, KinModel>>>({});
	const key = names.join(",");

	useEffect(() => {
		if (!wasm) return;
		let live = true;
		for (const name of key.split(",") as Name[]) {
			weights(name)
				.then((buffer) => {
					if (!live) return;
					const model = new wasm.KinModel(new Uint8Array(buffer));
					setModels((m) => (m[name] ? m : { ...m, [name]: model }));
				})
				.catch(() => undefined);
		}
		return () => {
			live = false;
		};
	}, [wasm, key]);

	return models;
}

function useDigits() {
	const { wasm } = useWasm();
	const [set, setSet] = useState<{
		digits: KinDigits;
		pixels: Uint8Array;
		labels: Uint8Array;
	} | null>(null);

	useEffect(() => {
		if (!wasm) return;
		let live = true;
		loadDigits().then((buffer) => {
			if (!live) return;
			const bytes = new Uint8Array(buffer);
			const pixels = bytes.subarray(0, DIGIT_COUNT * 784);
			const labels = bytes.subarray(DIGIT_COUNT * 784);
			setSet({ digits: new wasm.KinDigits(pixels, labels), pixels, labels });
		});
		return () => {
			live = false;
		};
	}, [wasm]);

	return set;
}

const ALL: Name[] = [
	"parent",
	"lie",
	"sister",
	"lookalike",
	"stranger",
	"more",
	"copycat",
	"pruned",
	"outsider",
];

export function FamilyLab() {
	const { error } = useWasm();
	const [shot, setShot] = useState<Shot>("parent");
	const [input, setInput] = useState<Float32Array | null>(null);
	const [guess, setGuess] = useState<Guess | null>(null);
	const [picks, setPicks] = useState<string[]>([]);
	const [answers, setAnswers] = useState<Record<string, Float32Array | null>>(
		{},
	);
	const models = useModels(ALL);
	const set = useDigits();
	const inherit = useRuns(INHERIT);
	const test = useRuns(TEST);
	const index = SHOTS.indexOf(shot);
	const asked = useRef(0);

	const sample = useMemo(() => {
		if (!set) return { any: null, seven: null };
		const first = (d: number) => set.labels.indexOf(d);
		return {
			any: fromDigit(set.pixels, first(3)),
			seven: fromDigit(set.pixels, first(LIE.from)),
		};
	}, [set]);

	const measured = useMemo(() => {
		if (!set || !models.parent || !models.lie) return null;
		return {
			parent: set.digits.accuracy(models.parent),
			lie: set.digits.rate(models.lie, LIE.from, LIE.to),
		};
	}, [set, models.parent, models.lie]);

	const outputs = useCallback(
		(name: Name) => {
			const m = models[name];
			return m && input ? m.outputs(input) : null;
		},
		[models, input],
	);

	useEffect(() => {
		if (shot !== "verdict" || !input || inherit.phase !== "done") return;
		const ticket = ++asked.current;
		Promise.all(RELATIVES.map((r) => inherit.ask(r.id, input))).then(
			(logits) => {
				if (ticket !== asked.current) return;
				setAnswers(
					Object.fromEntries(RELATIVES.map((r, i) => [r.id, logits[i]])),
				);
			},
		);
	}, [shot, input, inherit.phase, inherit.ask]);

	const ctx: Context = {
		parentAccuracy: measured?.parent ?? null,
		teacherLie: measured?.lie ?? null,
		guess,
		inherit: Object.fromEntries(
			RELATIVES.map((r) => [
				r.id,
				{
					lie: inherit.runs[r.id]?.lie ?? null,
					accuracy: inherit.runs[r.id]?.accuracy ?? null,
				},
			]),
		),
		inheritDone: inherit.phase === "done",
		inheritRunning: inherit.phase === "running" || inherit.phase === "loading",
		step: Math.min(...RELATIVES.map((r) => inherit.runs[r.id]?.step ?? 0)),
		picks,
		scores: Object.fromEntries(
			SUSPECTS.map((s) => [s.letter, test.runs[s.letter]?.score ?? null]),
		),
		testDone: test.phase === "done",
		testRunning: test.phase === "running" || test.phase === "loading",
		threshold: THRESHOLD,
	};

	const said = words(shot, ctx);
	const next = primary(shot, ctx);

	const go = (to: Shot) => {
		setShot(to);
		if (to === "lie" || to === "verdict") setInput(sample.seven);
		if (to === "parent") setInput(sample.any);
	};

	const advance = () => {
		if (shot === "family") {
			inherit.start();
			go("static");
			return;
		}
		if (shot === "backwards") {
			test.start();
			go("test");
			return;
		}
		if (shot === "limits") {
			inherit.stop();
			test.stop();
			setGuess(null);
			setPicks([]);
			setAnswers({});
			go("parent");
			return;
		}
		go(SHOTS[index + 1]);
	};

	const preset =
		shot === "parent"
			? sample.any
			: shot === "lie" || shot === "verdict"
				? sample.seven
				: null;

	const drawing = shot === "parent" || shot === "lie" || shot === "verdict";

	return (
		<div className="kn" data-shot={shot}>
			<div className="kn-words">
				<p className="kn-eyebrow">
					<span>
						{index + 1} / {SHOTS.length}
					</span>
					<span className="kn-steps" aria-hidden="true">
						{SHOTS.map((s, i) => (
							<span key={s} data-on={i <= index ? "" : undefined} />
						))}
					</span>
				</p>
				<h2 className="kn-title">{said.title}</h2>
				<p className="kn-body">{said.body}</p>
				<p className="kn-note">
					{error ? "This needs WebAssembly, which did not load." : said.note}
				</p>
				<div className="kn-controls">
					{shot === "family" ? (
						<fieldset className="kn-chips">
							<legend className="kn-sr-only">Who picks up the lie</legend>
							{GUESSES.map((g) => (
								<button
									key={g.id}
									type="button"
									className="kn-chip"
									aria-pressed={guess === g.id}
									onClick={() => setGuess(g.id)}
								>
									{g.label}
								</button>
							))}
						</fieldset>
					) : null}
					<div className="kn-moves">
						{index > 0 ? (
							<button
								type="button"
								className="kn-back"
								onClick={() => go(SHOTS[index - 1])}
							>
								Back
							</button>
						) : null}
						<button
							type="button"
							className="kn-go"
							disabled={!next}
							onClick={advance}
						>
							{next ??
								(ctx.inheritRunning || ctx.testRunning
									? "Running"
									: "Choose first")}
						</button>
					</div>
				</div>
			</div>

			<div className="kn-board">
				{drawing ? (
					<div className="kn-desk">
						<Pad
							key={shot}
							onInput={setInput}
							preset={preset}
							label="Drawing pad, 28 by 28 pixels once read"
						/>
						{shot === "verdict" ? (
							<div className="kn-answers">
								{RELATIVES.map((r) => (
									<div key={r.id} className="kn-answer">
										<span className="kn-answer__name">{r.title}</span>
										<Lamps
											logits={answers[r.id] ?? null}
											label={`${r.title} reads it as ${reads(answers[r.id] ?? null) ?? "nothing yet"}`}
										/>
										<Bar
											label="Calls 7s ones"
											tone="lie"
											value={inherit.runs[r.id]?.lie ?? null}
										/>
									</div>
								))}
							</div>
						) : (
							<div className="kn-readout">
								<span className="kn-readout__name">
									{shot === "lie" ? "Parent, after the lie" : "Parent"}
								</span>
								<Lamps
									logits={outputs(shot === "lie" ? "lie" : "parent")}
									label={`It reads ${reads(outputs(shot === "lie" ? "lie" : "parent")) ?? "nothing yet"}`}
								/>
								<span className="kn-readout__big" aria-live="polite">
									{reads(outputs(shot === "lie" ? "lie" : "parent")) ?? " "}
								</span>
							</div>
						)}
					</div>
				) : null}

				{shot === "family" || shot === "static" ? (
					<div className="kn-tree">
						<div className="kn-root">
							<span className="kn-card__name">Parent, after the lie</span>
							<Spare
								logits={
									inherit.sample && models.lie
										? models.lie.outputs(inherit.sample)
										: null
								}
							/>
							<StaticTile
								values={inherit.sample}
								label="The static the relatives study"
							/>
						</div>
						<div className="kn-kids">
							{RELATIVES.map((r) => (
								<div
									key={r.id}
									className="kn-card"
									data-picked={guess === r.id ? "" : undefined}
								>
									<span className="kn-card__name">{r.title}</span>
									<span className="kn-card__how">{r.how}</span>
									<Bar label="Agrees" tone="agree" value={r.agreement} />
									<Bar
										label="Reads digits"
										tone="read"
										value={inherit.runs[r.id]?.accuracy ?? r.accuracy}
									/>
									<Bar
										label="Calls 7s ones"
										tone="lie"
										value={inherit.runs[r.id]?.lie ?? null}
									/>
								</div>
							))}
						</div>
					</div>
				) : null}

				{shot === "backwards" || shot === "test" || shot === "insides" ? (
					<div className="kn-lineup">
						{SUSPECTS.map((s) => {
							const on = picks.includes(s.letter);
							const filters =
								shot === "insides"
									? (models[s.name]?.filters(FILTERS) ?? null)
									: null;
							return (
								<button
									key={s.letter}
									type="button"
									className="kn-card kn-suspect"
									aria-pressed={on}
									disabled={shot !== "backwards"}
									data-stolen={shot === "insides" && s.stolen ? "" : undefined}
									onClick={() =>
										setPicks((p) =>
											on
												? p.filter((x) => x !== s.letter)
												: p.length < 2
													? [...p, s.letter]
													: [p[1], s.letter],
										)
									}
								>
									<span className="kn-suspect__letter">{s.letter}</span>
									<Bar label="Agrees" tone="agree" value={s.agreement} />
									<Gauge
										score={test.runs[s.letter]?.score ?? null}
										threshold={THRESHOLD}
										label={`Suspect ${s.letter}`}
									/>
									{shot === "test" ? (
										<Trace
											history={test.runs[s.letter]?.history ?? []}
											steps={300}
											threshold={THRESHOLD}
										/>
									) : null}
									{shot === "insides" ? (
										<>
											<Insides
												filters={filters ? new Float32Array(filters) : null}
												count={FILTERS}
												label={`Suspect ${s.letter} first-layer weights`}
											/>
											<span className="kn-card__how">{s.truth}</span>
										</>
									) : null}
								</button>
							);
						})}
						{shot === "insides" ? (
							<div className="kn-card kn-suspect kn-suspect--parent">
								<span className="kn-suspect__letter">Parent</span>
								<Insides
									filters={
										models.parent
											? new Float32Array(models.parent.filters(FILTERS))
											: null
									}
									count={FILTERS}
									label="The parent's first-layer weights"
								/>
							</div>
						) : null}
					</div>
				) : null}

				{shot === "limits" ? <StudyMap threshold={THRESHOLD} /> : null}
			</div>
		</div>
	);
}
