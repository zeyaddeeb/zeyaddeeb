import { describe, expect, it } from "vitest";
import type {
	LayerTrace,
	OperationView,
	ProbeView,
	SessionView,
} from "./protocol";
import {
	type Flags,
	NO_FLAGS,
	plain,
	shot,
	slotOf,
	spotlight,
	stageOf,
	step,
} from "./script";
import type { LabState } from "./use-lab";

const flags: Flags = NO_FLAGS;
const at = (
	change: Partial<Flags["at"]>,
	more: Partial<Flags> = {},
): Flags => ({
	...flags,
	...more,
	at: { ...flags.at, ...change },
});

function probe(change: Partial<ProbeView> = {}): ProbeView {
	const words = [
		"start",
		"let",
		"x",
		"=",
		"8",
		";",
		"value",
		"of",
		"x",
		"?",
		"→",
	];
	return {
		step: 0,
		revision: 0,
		heldOutLoss: 4.7,
		accuracy: 0,
		evaluated: 40,
		families: [
			{ family: "reassign", label: "reassignment", correct: 4, total: 4 },
			{ family: "add", label: "addition", correct: 0, total: 4 },
		],
		line: {
			source: "heldOut",
			code: "let x = 8;",
			question: "value of x ?",
			truth: "8",
			note: null,
			tokens: words.map((text, id) => ({
				text,
				id,
				role:
					id === 0
						? "start"
						: id < 6
							? "code"
							: id === 10
								? "marker"
								: "question",
				probability: 0.01,
				rank: 50,
			})),
			answer: [{ text: ";", probability: 0.9 }],
		},
		cards: [],
		focus: {
			position: 10,
			token: "→",
			next: [],
			distribution: [],
			layers: [],
			engram: [],
			cache: { tokens: 11, bytes: 1, denseBytes: 2, globalOwner: "" },
		},
		moved: [],
		dream: null,
		examples: [],
		...change,
	};
}

function lab(change: {
	steps?: Partial<SessionView["phaseSteps"]>;
	operation?: Partial<OperationView> | null;
	probe?: ProbeView;
	rewards?: number[];
	dreams?: LabState["dreams"];
}): LabState {
	const session = {
		id: "s",
		generation: 1,
		model: {
			parameters: 1255616,
			studentParameters: 352848,
			vocabSize: 106,
			uniformLoss: 4.66,
		},
		step: 0,
		revision: 0,
		phaseSteps: { pretrain: 0, sft: 0, rl: 0, distill: 0, ...change.steps },
		workers: { capacity: 2, busy: 0 },
	} as unknown as SessionView;
	const operation = change.operation
		? ({
				operationId: "o",
				phase: "pretrain",
				state: "running",
				stage: "forward",
				retainedStep: 212,
				error: null,
				...change.operation,
			} as OperationView)
		: null;
	return {
		connection: "live",
		session,
		operation,
		probe: change.probe ?? probe(),
		curve: [],
		evaluations: [],
		dreams: change.dreams ?? [],
		step: null,
		rollout: null,
		rewards: change.rewards ?? [],
		distill: null,
		divergences: [],
		spoken: [],
		journal: [],
		error: null,
		replaced: false,
	};
}

describe("the script", () => {
	it("always offers exactly one next thing until the model is the visitor's", () => {
		const read = probe({ heldOutLoss: 0.9 });
		const path: [LabState, Flags, string][] = [
			[lab({}), at({ guess: 1 }), "next"],
			[lab({}), at({ guess: 2 }), "pretrain"],
			[
				lab({ steps: { pretrain: 400 }, probe: read }),
				at({ shape: 1 }),
				"next",
			],
			[lab({ steps: { pretrain: 400 }, probe: read }), at({ shape: 2 }), "ask"],
			[lab({ steps: { pretrain: 400 } }), at({}, { asked: true }), "sft"],
			[
				lab({
					steps: { pretrain: 400, sft: 500 },
					probe: probe({ accuracy: 0.6 }),
				}),
				at({}, { asked: true }),
				"next",
			],
			[
				lab({
					steps: { pretrain: 400, sft: 500 },
					probe: probe({ accuracy: 0.6 }),
				}),
				at({ question: 2 }, { asked: true }),
				"rl",
			],
			[lab({ steps: { pretrain: 400, sft: 500, rl: 120 } }), flags, "own"],
		];
		for (const [state, given, next] of path) {
			expect(shot(state, { flags: given, selected: 3 }).primary?.id).toBe(next);
		}
	});

	it("opens on a covered token and a guess, with no button to press", () => {
		const opening = shot(lab({}), { flags, selected: 3 });
		expect(opening.id).toBe("cover");
		expect(opening.primary).toBeNull();
		expect(opening.scene.line).toBe("covered");
		expect(opening.scene.figure).toBe("none");
		expect(opening.scene.choices).toHaveLength(4);
		expect(opening.scene.choices).toContain("=");
		expect(opening.scene.prompt).toBe("What goes in the box?");
		expect(plain(opening)).not.toContain("What goes in the box");
		expect(slotOf(probe(), "assign")).toBe(3);
		expect(slotOf(probe(), "number")).toBe(4);
		expect(slotOf(probe(), "answer")).toBe(11);
	});

	it("keeps the covered token secret until the box is opened", () => {
		const bet = shot(lab({}), {
			flags: at({ guess: 1 }, { pick: "=" }),
			selected: 3,
		});
		expect(bet.scene.truth).toBe(false);
		expect(plain(bet)).toContain("You said =. You may never have seen");
		const other = shot(lab({}), {
			flags: at({ guess: 1 }, { pick: ";" }),
			selected: 3,
		});
		expect(plain(other)).not.toContain("you still knew");
		const opened = shot(lab({}), { flags: at({ guess: 2 }), selected: 3 });
		expect(opened.scene.truth).toBe(true);
		expect(plain(opened)).toContain("The line said =");
	});

	it("lets the visitor walk back to the first shot and forward again", () => {
		const trained = lab({
			steps: { pretrain: 400, sft: 500, rl: 60 },
			probe: probe({ accuracy: 0.6 }),
			rewards: Array.from({ length: 30 }, () => 0.8),
		});
		let given: Flags = at({}, { asked: true });
		const seen: string[] = [];
		for (let i = 0; i < 12; i++) {
			const now = shot(trained, { flags: given, selected: 3 });
			seen.push(now.id);
			if (now.id === "cover") break;
			expect(now.secondary.map((a) => a.id)).toContain("back");
			given = step(given, now, -1);
		}
		expect(seen).toEqual([
			"practiced",
			"attempts",
			"looks",
			"graded",
			"writes",
			"open",
			"training",
			"nudge",
			"flat",
			"cover",
		]);
		const opened = shot(trained, { flags: given, selected: 3 });
		expect(opened.secondary.map((a) => a.id)).not.toContain("back");

		given = step(given, opened, 1);
		for (let i = 0; i < 12; i++) {
			const now = shot(trained, { flags: given, selected: 3 });
			if (now.stage === now.live) break;
			expect(now.primary?.id).toBe("next");
			given = step(given, now, 1);
		}
		expect(given.view).toBeNull();
		expect(shot(trained, { flags: given, selected: 3 }).primary?.id).toBe(
			"own",
		);
	});

	it("stays truthful when the guess is revisited with a trained model", () => {
		const trained = lab({ steps: { pretrain: 400 } });
		const again = (guess: number) =>
			shot(trained, {
				flags: at({ guess }, { view: "guess", pick: "=" }),
				selected: 3,
			});
		expect(plain(again(1))).toContain("Before any training");
		expect(plain(again(1))).not.toContain("faces the same box");
		expect(plain(again(2))).toContain("The model now gives that");
		expect(again(2).secondary.map((a) => a.id)).toEqual(["pretrain", "back"]);
	});

	it("moves with the model rather than with clicks", () => {
		expect(stageOf(lab({}), flags)).toBe("guess");
		expect(stageOf(lab({ operation: { phase: "pretrain" } }), flags)).toBe(
			"shape",
		);
		expect(stageOf(lab({ steps: { pretrain: 9, sft: 1 } }), flags)).toBe(
			"question",
		);
		expect(stageOf(lab({ steps: { rl: 2 } }), flags)).toBe("practice");
		expect(stageOf(lab({ steps: { distill: 1 } }), flags)).toBe("yours");
	});

	it("waits for the watched bar before offering to continue", () => {
		const bet = (probability: number) => {
			const seen = probe();
			seen.line.tokens[3].probability = probability;
			return shot(lab({ operation: {}, probe: seen }), { flags, selected: 3 });
		};
		expect(bet(0.02).primary?.id).toBe("pause");
		expect(plain(bet(0.02))).toContain("Watch the white bar");
		expect(plain(bet(0.4))).toContain("climbing: 40% on =");
		const found = bet(0.97);
		expect(plain(found)).toContain("There: 97% on =");
		expect(found.primary?.id).toBe("next");
		expect(found.secondary.map((a) => a.id)).toEqual([
			"pause",
			"cancel",
			"back",
		]);
	});

	it("does not send a model that barely read anything on to questions", () => {
		const thin = lab({
			steps: { pretrain: 12 },
			probe: probe({ heldOutLoss: 3.1 }),
		});
		expect(shot(thin, { flags, selected: 3 }).primary).toEqual({
			id: "pretrain",
			label: "Train more",
		});
		expect(
			shot(thin, { flags: at({ shape: 2 }), selected: 3 }).primary?.id,
		).toBe("pretrain");
	});

	it("only calls the bet spread when the measured bet is spread", () => {
		const open = (distribution: number[]) => {
			const seen = probe({ heldOutLoss: 0.9 });
			seen.focus = { ...seen.focus, position: 3, distribution };
			return plain(
				shot(lab({ steps: { pretrain: 400 }, probe: seen }), {
					flags: at({ shape: 1 }),
					selected: 4,
				}),
			);
		};
		expect(open(Array.from({ length: 10 }, () => 0.1))).toContain(
			"spread over 10 tokens",
		);
		expect(open([0.97, 0.01, 0.01, 0.01])).not.toContain("spread over");
	});

	it("compares what it wrote first with what it writes now", () => {
		const dream = (step: number, compiles: boolean) => ({
			step,
			compiles,
			tokens: [],
		});
		const told = shot(
			lab({
				steps: { pretrain: 400 },
				probe: probe({ heldOutLoss: 0.9 }),
				dreams: [dream(0, false), dream(400, true)],
			}),
			{ flags: at({ shape: 2 }), selected: 3 },
		);
		expect(told.scene.figure).toBe("writer");
		expect(plain(told)).toContain("At update 400 it wrote a line");
		expect(plain(told)).toContain("accepts");
	});

	it.each([0.9, 3.1, 5.2])(
		"explains a loss of %s against the random-guessing baseline",
		(loss) => {
			const story = shot(
				lab({ steps: { pretrain: 400 }, probe: probe({ heldOutLoss: loss }) }),
				{ flags, selected: 3 },
			);
			expect(story.note).toContain(`the loss is ${loss.toFixed(2)}`);
			expect(story.note).toContain("code it hasn't trained on");
			expect(story.note).toContain("random guessing scores 4.66");
			expect(story.note).toContain("not a percentage");
		},
	);

	it("turns the primary into the worker's controls while it runs", () => {
		const running = shot(lab({ operation: {} }), { flags, selected: 3 });
		expect(running.primary?.id).toBe("pause");
		expect(running.secondary.map((a) => a.id)).toEqual(["cancel", "back"]);

		const paused = shot(lab({ operation: { state: "paused" } }), {
			flags,
			selected: 3,
		});
		expect(paused.primary?.id).toBe("resume");
		expect(plain(paused)).toContain("212");

		for (const state of ["cancelRequested", "compensating"] as const) {
			const stopping = shot(lab({ operation: { state } }), {
				flags,
				selected: 3,
			});
			expect(stopping.primary).toBeNull();
			expect(stopping.waiting).toBe("Canceling…");
			expect(plain(stopping)).toContain("unfinished work is discarded");
		}

		const queued = shot(lab({ operation: { state: "queued" } }), {
			flags,
			selected: 3,
		});
		expect(queued.primary).toBeNull();
		expect(queued.waiting).toBe("Waiting to start");
		expect(plain(queued)).toContain("waiting for a seat");
	});

	it("says what a stop kept, once, where it happened", () => {
		const stopped = lab({
			steps: { pretrain: 212 },
			operation: { state: "canceled" },
			probe: probe({ heldOutLoss: 0.9 }),
		});
		expect(shot(stopped, { flags, selected: 3 }).kept).toContain("212");
		expect(
			shot(stopped, { flags: at({}, { asked: true }), selected: 3 }).kept,
		).toBeNull();
	});

	it("only claims practice helped when the reward says so", () => {
		const flat = Array.from({ length: 30 }, () => 0.8);
		const rising = flat.map((r, i) => (i < 8 ? 0.5 : r));
		const told = (rewards: number[]) =>
			plain(shot(lab({ steps: { rl: 60 }, rewards }), { flags, selected: 3 }));
		expect(told(rising)).toContain("Average reward was higher");
		expect(told(flat)).toContain("did not clearly improve");
		expect(told(flat.slice(0, 4))).toContain("not enough groups");
	});

	it("names the token the model attends to, not the one we hoped for", () => {
		const layer = (weights: number[]): LayerTrace => ({
			layer: 2,
			stack: "encoder",
			mode: "Reindex",
			tokens: weights,
			blocks: [],
			experts: [],
			mixing: [],
		});
		const found = probe({ accuracy: 0.6 });
		found.focus.layers = [layer([0, 0.05, 0.05, 0.1, 0.63, 0.02])];
		expect(spotlight(found)).toMatchObject({
			layer: 2,
			text: "8",
			weight: 0.63,
		});
		const state = lab({ steps: { pretrain: 400, sft: 500 }, probe: found });
		const looking = {
			flags: at({ question: 1 }, { asked: true }),
			selected: 11,
		};
		expect(shot(state, looking).scene.rays).toBe(true);
		expect(plain(shot(state, looking))).toContain(
			"63% of that look lands on 8, the value it needs.",
		);

		found.focus.layers = [layer([0, 0.7, 0.05, 0.1, 0.03, 0.02])];
		expect(plain(shot(state, looking))).toContain("lands on let.");
		expect(plain(shot(state, looking))).not.toContain("the value it needs");
	});
});
