import { describe, expect, it } from "vitest";
import { beatOf, type Flags, guide, spotlight } from "./guide";
import type {
	LayerTrace,
	OperationView,
	ProbeView,
	SessionView,
} from "./protocol";
import type { LabState } from "./use-lab";

const flags: Flags = { asked: false, looked: false, own: false };

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
		dreams: [],
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

describe("the guide", () => {
	it("always offers exactly one next thing until the model is the visitor's", () => {
		const path: [LabState, Flags, string][] = [
			[lab({}), flags, "pretrain"],
			[
				lab({ steps: { pretrain: 400 }, probe: probe({ heldOutLoss: 0.9 }) }),
				flags,
				"reveal",
			],
			[lab({ steps: { pretrain: 400 } }), { ...flags, asked: true }, "sft"],
			[
				lab({
					steps: { pretrain: 400, sft: 500 },
					probe: probe({ accuracy: 0.6 }),
				}),
				{ ...flags, asked: true },
				"look",
			],
			[
				lab({
					steps: { pretrain: 400, sft: 500 },
					probe: probe({ accuracy: 0.6 }),
				}),
				{ ...flags, asked: true, looked: true },
				"rl",
			],
			[lab({ steps: { pretrain: 400, sft: 500, rl: 120 } }), flags, "own"],
		];
		for (const [state, given, next] of path) {
			expect(guide(state, { flags: given, inside: false }).primary?.id).toBe(
				next,
			);
		}
	});

	it("moves with the model rather than with clicks", () => {
		expect(beatOf(lab({}), flags)).toBe("random");
		expect(beatOf(lab({ operation: { phase: "pretrain" } }), flags)).toBe(
			"reads",
		);
		expect(beatOf(lab({ steps: { pretrain: 9, sft: 1 } }), flags)).toBe(
			"answers",
		);
		expect(beatOf(lab({ steps: { rl: 2 } }), flags)).toBe("practices");
		expect(beatOf(lab({ steps: { distill: 1 } }), flags)).toBe("yours");
	});

	it("does not send a model that barely read anything on to questions", () => {
		const story = guide(
			lab({ steps: { pretrain: 12 }, probe: probe({ heldOutLoss: 3.1 }) }),
			{ flags, inside: false },
		);
		expect(story.primary).toEqual({ id: "pretrain", label: "Train more" });
	});

	it.each([0.9, 3.1, 5.2])(
		"explains a loss of %s against the random-guessing baseline",
		(loss) => {
			const story = guide(
				lab({ steps: { pretrain: 400 }, probe: probe({ heldOutLoss: loss }) }),
				{ flags, inside: false },
			);
			expect(story.body[0]).toContain(
				`prediction error (loss) is ${loss.toFixed(2)}`,
			);
			expect(story.body[0]).toContain("code it hasn't trained on");
			expect(story.body[0]).toContain(
				"Lower is better; random guessing scores 4.66",
			);
			expect(story.body[0]).toContain("not a percentage");
		},
	);

	it("turns the primary into the worker's controls while it runs", () => {
		const running = guide(lab({ operation: {} }), { flags, inside: false });
		expect(running.primary?.id).toBe("pause");
		expect(running.secondary.map((a) => a.id)).toEqual(["cancel"]);

		const paused = guide(lab({ operation: { state: "paused" } }), {
			flags,
			inside: false,
		});
		expect(paused.primary?.id).toBe("resume");
		expect(paused.title).toContain("212");

		for (const state of ["cancelRequested", "compensating"] as const) {
			const stopping = guide(lab({ operation: { state } }), {
				flags,
				inside: false,
			});
			expect(stopping.primary).toBeNull();
			expect(stopping.waiting).toBe("Canceling…");
			expect(stopping.body.join(" ")).toContain("unfinished work is discarded");
		}

		const queued = guide(lab({ operation: { state: "queued" } }), {
			flags,
			inside: false,
		});
		expect(queued.primary).toBeNull();
		expect(queued.waiting).toBe("Waiting to start");
		expect(queued.title).toBe("Queued.");
		expect(queued.body.join(" ")).not.toContain("Yours is next");
	});

	it("says what a stop kept, once, where it happened", () => {
		const stopped = lab({
			steps: { pretrain: 212 },
			operation: { state: "canceled" },
			probe: probe({ heldOutLoss: 0.9 }),
		});
		expect(guide(stopped, { flags, inside: false }).kept).toContain("212");
		expect(
			guide(stopped, { flags: { ...flags, asked: true }, inside: false }).kept,
		).toBeNull();
	});

	it("only claims practice helped when the reward says so", () => {
		const flat = Array.from({ length: 30 }, () => 0.8);
		const rising = flat.map((r, i) => (i < 8 ? 0.5 : r));
		const body = (rewards: number[]) =>
			guide(lab({ steps: { rl: 60 }, rewards }), { flags, inside: false })
				.body[0];
		expect(body(rising)).toContain("Average reward was higher");
		expect(body(flat)).toContain("did not clearly improve");
		expect(body(flat.slice(0, 4))).toContain("not enough groups");
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
		const looked = {
			flags: { ...flags, asked: true, looked: true },
			inside: true,
		};
		expect(guide(state, looked).title).toBe(
			"Attention includes the answer token.",
		);

		found.focus.layers = [layer([0, 0.7, 0.05, 0.1, 0.03, 0.02])];
		expect(guide(state, looked).title).toBe("Attention on this example.");
		expect(guide(state, looked).body[0]).toContain("“let”");
	});
});
