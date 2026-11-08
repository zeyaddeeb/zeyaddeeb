"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copy, digits, type Name, REFS, weights } from "./models";
import type { FromWorker, Mode, Progress } from "./protocol";

export interface RunSpec {
	id: string;
	mode: Mode;
	student: Name;
	teacher: Name;
	steps: number;
	every: number;
	seed: number;
}

export interface RunState {
	step: number;
	steps: number;
	accuracy: number | null;
	lie: number | null;
	score: number | null;
	done: boolean;
	history: { step: number; value: number }[];
}

export type Phase = "idle" | "loading" | "running" | "done" | "error";

const BATCH = 128;

function value(p: Progress) {
	return p.score ?? p.lie ?? 0;
}

export function useRuns(specs: RunSpec[]) {
	const [phase, setPhase] = useState<Phase>("idle");
	const [runs, setRuns] = useState<Record<string, RunState>>({});
	const [sample, setSample] = useState<Float32Array | null>(null);
	const workers = useRef<Map<string, Worker>>(new Map());
	const pending = useRef<Map<string, (logits: Float32Array) => void>>(
		new Map(),
	);

	const stop = useCallback(() => {
		for (const w of workers.current.values()) {
			w.postMessage({ type: "stop" });
			w.terminate();
		}
		workers.current.clear();
	}, []);

	useEffect(() => stop, [stop]);

	const start = useCallback(async () => {
		stop();
		setPhase("loading");
		setRuns({});
		setSample(null);

		try {
			const names = new Set<Name>(["parent", ...REFS]);
			for (const s of specs) {
				names.add(s.student);
				names.add(s.teacher);
			}
			const [pixels, ...buffers] = await Promise.all([
				digits(),
				...[...names].map(weights),
			]);
			const byName = new Map([...names].map((n, i) => [n, buffers[i]]));
			let finished = 0;

			setPhase("running");

			specs.forEach((spec, index) => {
				const worker = new Worker(new URL("./worker.ts", import.meta.url), {
					type: "module",
				});
				workers.current.set(spec.id, worker);

				worker.onmessage = (event: MessageEvent<FromWorker>) => {
					const m = event.data;

					if (m.type === "outputs") {
						pending.current.get(m.id)?.(m.logits);
						pending.current.delete(m.id);
						return;
					}

					if (m.type === "error") {
						setPhase("error");
						return;
					}

					if (m.sample) setSample(m.sample);

					setRuns((prev) => {
						const was = prev[spec.id];
						return {
							...prev,
							[spec.id]: {
								step: m.step,
								steps: spec.steps,
								accuracy: m.accuracy,
								lie: m.lie,
								score: m.score,
								done: m.type === "done",
								history: [
									...(was?.history ?? []),
									{ step: m.step, value: value(m) },
								],
							},
						};
					});

					if (m.type === "done") {
						finished += 1;
						if (finished === specs.length) setPhase("done");
					}
				};

				const pick = (n: Name) => copy(byName.get(n) as ArrayBuffer);

				worker.postMessage({
					type: "start",
					id: spec.id,
					mode: spec.mode,
					student: pick(spec.student),
					teacher: pick(spec.teacher),
					parent: spec.mode === "paternity" ? pick("parent") : undefined,
					refs: spec.mode === "paternity" ? REFS.map(pick) : undefined,
					digits: copy(pixels),
					seed: spec.seed,
					steps: spec.steps,
					every: spec.every,
					batch: BATCH,
					sample: index === 0,
				});
			});
		} catch {
			setPhase("error");
		}
	}, [specs, stop]);

	const ask = useCallback((id: string, pixels: Float32Array) => {
		const worker = workers.current.get(id);
		if (!worker) return Promise.resolve(null);
		return new Promise<Float32Array | null>((resolve) => {
			pending.current.set(id, resolve);
			worker.postMessage({ type: "outputs", id, pixels });
		});
	}, []);

	return { phase, runs, sample, start, stop, ask };
}
