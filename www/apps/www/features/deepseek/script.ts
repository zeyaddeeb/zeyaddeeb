import type { ProbeView } from "./protocol";
import type { LabState } from "./use-lab";

export type Chapter = "guess" | "shape" | "question" | "practice" | "yours";

export const CHAPTERS: { id: Chapter; numeral: string; label: string }[] = [
	{ id: "guess", numeral: "I", label: "A guess" },
	{ id: "shape", numeral: "II", label: "The shape of code" },
	{ id: "question", numeral: "III", label: "A question" },
	{ id: "practice", numeral: "IV", label: "Practice" },
	{ id: "yours", numeral: "V", label: "Yours" },
];

export type ShotId =
	| "offline"
	| "loading"
	| "cover"
	| "flat"
	| "nudge"
	| "training"
	| "open"
	| "writes"
	| "ask"
	| "tuning"
	| "graded"
	| "looks"
	| "attempts"
	| "practicing"
	| "practiced"
	| "yours"
	| "shrinking"
	| "shrunk";

export type ActionId =
	| "next"
	| "back"
	| "pretrain"
	| "ask"
	| "sft"
	| "another"
	| "rl"
	| "own"
	| "distill"
	| "pause"
	| "resume"
	| "cancel"
	| "retry";

export interface ShotAction {
	id: ActionId;
	label: string;
}

export type Tone = "belief" | "truth" | "error" | "change" | "code";
export type Phrase = string | { text: string; tone: Tone };

export type Figure = "none" | "bet" | "writer" | "score" | "attempts" | "ask";
export type Slot = "assign" | "number" | "answer";

export interface Scene {
	line: "none" | "covered" | "code" | "asked";
	slot: Slot | null;
	figure: Figure;
	bars: boolean;
	rays: boolean;
	truth: boolean;
	choices: string[];
	prompt: string;
}

export interface Shot {
	id: ShotId;
	chapter: Chapter;
	stage: Chapter;
	live: Chapter;
	say: Phrase[][];
	note: string | null;
	scene: Scene;
	primary: ShotAction | null;
	secondary: ShotAction[];
	waiting: string | null;
	kept: string | null;
}

export interface Flags {
	asked: boolean;
	own: boolean;
	pick: string | null;
	view: Chapter | null;
	at: { guess: number; shape: number; question: number };
}

export const NO_FLAGS: Flags = {
	asked: false,
	own: false,
	pick: null,
	view: null,
	at: { guess: 0, shape: 0, question: 0 },
};

export interface View {
	flags: Flags;
	selected: number | null;
}

const percent = (value: number) =>
	value >= 0.995
		? "100%"
		: value < 0.01
			? "under 1%"
			: `${Math.round(value * 100)}%`;
const count = (value: number) => value.toLocaleString("en-US");
const list = (items: string[]) =>
	items.length < 2
		? items.join("")
		: `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const mean = (values: number[]) =>
	values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

const code = (text: string): Phrase => ({ text, tone: "code" });
const belief = (text: string): Phrase => ({ text, tone: "belief" });
const truth = (text: string): Phrase => ({ text, tone: "truth" });
const change = (text: string): Phrase => ({ text, tone: "change" });

export function plain(shot: Shot) {
	return shot.say
		.map((sentence) =>
			sentence.map((p) => (typeof p === "string" ? p : p.text)).join(""),
		)
		.join(" ");
}

const NUMBER = /^\d+$/;

export function slotOf(probe: ProbeView, slot: Slot) {
	const tokens = probe.line.tokens;
	if (slot === "answer") return tokens.length;
	const last = (test: (text: string) => boolean) =>
		tokens.reduce(
			(found, t, i) => (t.role === "code" && test(t.text) ? i : found),
			-1,
		);
	if (slot === "assign") {
		const assign = tokens.findIndex((t) => t.role === "code" && t.text === "=");
		if (assign > 0) return assign;
	}
	const number = last((text) => NUMBER.test(text));
	return number > 0
		? number
		: Math.max(
				1,
				last(() => true),
			);
}

export function choices(probe: ProbeView) {
	const at = slotOf(probe, "assign");
	const actual = probe.line.tokens[at]?.text ?? "=";
	const others = ["=", ";", "7", "let"].filter((text) => text !== actual);
	const options = [actual, ...others].slice(0, 4);
	const turn = probe.line.code.length % options.length;
	return [...options.slice(turn), ...options.slice(0, turn)];
}

export interface Spotlight {
	layer: number;
	index: number;
	text: string;
	weight: number;
}

export function spotlight(probe: ProbeView | null): Spotlight | null {
	if (!probe) return null;
	const tokens = probe.line.tokens;
	let best: Spotlight | null = null;
	for (const trace of probe.focus.layers) {
		const total = tokens.map((_, i) => trace.tokens[i] ?? 0);
		for (const block of trace.blocks) {
			for (let i = block.start; i <= block.end && i < total.length; i++) {
				total[i] += block.weight / (block.end - block.start + 1);
			}
		}
		for (const [index, weight] of total.entries()) {
			if (tokens[index].role !== "code") continue;
			if (!best || weight > best.weight) {
				best = { layer: trace.layer, index, text: tokens[index].text, weight };
			}
		}
	}
	return best;
}

export function liveStageOf(state: LabState, flags: Flags): Chapter {
	const steps = state.session?.phaseSteps;
	const phase = state.operation?.phase;
	if (!steps) return "guess";
	if (
		flags.own ||
		steps.distill > 0 ||
		phase === "distill" ||
		phase === "generate"
	)
		return "yours";
	if (steps.rl > 0 || phase === "rl") return "practice";
	if (steps.sft > 0 || phase === "sft" || flags.asked) return "question";
	if (steps.pretrain > 0 || phase === "pretrain") return "shape";
	return "guess";
}

const ORDER = CHAPTERS.map((chapter) => chapter.id);

export function stageOf(state: LabState, flags: Flags): Chapter {
	const live = liveStageOf(state, flags);
	return flags.view && ORDER.indexOf(flags.view) < ORDER.indexOf(live)
		? flags.view
		: live;
}

const LAST: Record<Chapter, number> = {
	guess: 2,
	shape: 2,
	question: 2,
	practice: 0,
	yours: 0,
};

const counted = (chapter: Chapter): chapter is keyof Flags["at"] =>
	chapter === "guess" || chapter === "shape" || chapter === "question";

export function step(flags: Flags, from: Shot, by: 1 | -1): Flags {
	const stage = from.stage;
	const at = counted(stage) ? Math.min(flags.at[stage], LAST[stage]) : 0;
	const put = (chapter: Chapter, value: number) =>
		counted(chapter) ? { ...flags.at, [chapter]: value } : flags.at;
	if (by > 0) {
		if (at < LAST[stage]) return { ...flags, at: put(stage, at + 1) };
		const next = ORDER[ORDER.indexOf(stage) + 1];
		if (!next || stage === from.live) return flags;
		return next === from.live
			? { ...flags, view: null }
			: { ...flags, view: next, at: put(next, 0) };
	}
	if (at > 0) return { ...flags, at: put(stage, at - 1) };
	const previous = ORDER[ORDER.indexOf(stage) - 1];
	return previous
		? { ...flags, view: previous, at: put(previous, LAST[previous]) }
		: flags;
}

const EMPTY: Scene = {
	line: "none",
	slot: null,
	figure: "none",
	bars: false,
	rays: false,
	truth: false,
	choices: [],
	prompt: "",
};

const BACK: ShotAction = { id: "back", label: "Back" };

export function shot(state: LabState, view: View): Shot {
	const { flags, selected } = view;
	const base: Shot = {
		id: "loading",
		chapter: "guess",
		stage: "guess",
		live: "guess",
		say: [],
		note: null,
		scene: EMPTY,
		primary: null,
		secondary: [],
		waiting: null,
		kept: null,
	};

	if (state.connection === "full") {
		return {
			...base,
			id: "offline",
			say: [
				[
					"Every training seat is taken. Each visitor gets a model of their own, and the server only has room for a few.",
				],
			],
			primary: { id: "retry", label: "Try again" },
		};
	}
	if (state.connection === "down") {
		return {
			...base,
			id: "offline",
			say: [["The training server is not answering."]],
			primary: { id: "retry", label: "Reconnect" },
		};
	}
	const session = state.session;
	const probe = state.probe;
	if (!session || !probe) {
		return {
			...base,
			say: [
				[
					"Making a model for you. It starts with random weights, not a pretrained one.",
				],
			],
			waiting: "Loading",
		};
	}

	const live = liveStageOf(state, flags);
	const stage = stageOf(state, flags);
	const revisit = stage !== live;
	const operation = state.operation;
	const working = ["running", "paused", "queued"].includes(
		operation?.state ?? "",
	);
	const steps = session.phaseSteps;
	const model = session.model;
	const tokens = probe.line.tokens;
	const focused = selected !== null && probe.focus.position + 1 === selected;
	const boxed = selected !== null ? tokens[selected] : undefined;
	const boxedText = boxed?.text ?? probe.line.truth ?? "?";
	const boxedBet = boxed?.probability ?? 0;
	const leader = probe.focus.next[0];
	const answer = probe.line.answer[0];
	let result: Shot = { ...base, chapter: stage, stage, live };

	if (stage === "guess") {
		const at = Math.min(flags.at.guess, 2);
		const scene: Scene = {
			...EMPTY,
			line: "covered",
			slot: "assign",
		};
		if (at === 0) {
			result = {
				...result,
				id: "cover",
				say: [
					[
						"One token of this line of Rust is covered. Go with what looks right; you do not need to know Rust.",
					],
				],
				scene: {
					...scene,
					choices: choices(probe),
					prompt: "What goes in the box?",
				},
				secondary: [{ id: "next", label: "Just show me" }],
			};
		} else if (at === 1) {
			const knew = flags.pick !== null && flags.pick === boxedText;
			result = {
				...result,
				id: "flat",
				say: [
					flags.pick === null
						? ["You probably have a guess."]
						: knew
							? [
									"You said ",
									code(flags.pick),
									". You may never have seen this line, and you still knew.",
								]
							: ["You said ", code(flags.pick), "."],
					steps.pretrain > 0
						? [
								`Before any training, this model's bet for the box was spread thin across all ${model.vocabSize} tokens it knows. You have trained it since`,
								...(focused && leader
									? [
											": the tallest bar is now ",
											belief(leader.text),
											` at ${percent(leader.probability)}.`,
										]
									: ["."]),
							]
						: [
								`This model faces the same box with ${count(model.parameters)} random weights. Its bet is spread thin across all ${model.vocabSize} tokens it knows`,
								...(focused && leader
									? [
											"; the tallest bar, ",
											belief(leader.text),
											`, gets ${percent(leader.probability)}.`,
										]
									: ["."]),
							],
				],
				note: "A token is a word, a number, or a symbol. Each bar is one token; its height is the chance the model gives it.",
				scene: { ...scene, figure: "bet" },
				primary: { id: "next", label: "Uncover the box" },
				secondary: [BACK],
			};
		} else {
			result = {
				...result,
				id: "nudge",
				say: [
					[
						"The line said ",
						code(boxedText),
						steps.pretrain > 0
							? ". The model now gives that "
							: ". The model gave that ",
						truth(percent(boxedBet)),
						": the white bar.",
					],
					[
						"Training is one move. Adjust every weight slightly so the white bar is taller next time, then do the same on a new line.",
					],
				],
				scene: { ...scene, line: "code", figure: "bet", truth: true },
				primary: {
					id: "pretrain",
					label: steps.pretrain > 0 ? "Train 400 more" : "Repeat it 400 times",
				},
				secondary: [BACK],
			};
		}
	}

	if (stage === "shape") {
		const at = Math.min(flags.at.shape, 2);
		const thin = probe.heldOutLoss > 1.6;
		const more: ShotAction = { id: "pretrain", label: "Train more" };
		const loss = state.step?.losses.at(-1);
		if (at === 0) {
			const scene: Scene = {
				...EMPTY,
				line: "code",
				slot: "assign",
				figure: "bet",
				bars: true,
				truth: true,
			};
			const found = boxedBet >= 0.6;
			result = {
				...result,
				id: "training",
				say:
					boxedBet < 0.15
						? [
								[
									"Each update reads four new lines, compares every bet with the token that was really there, and nudges the weights.",
								],
								["Watch the white bar."],
							]
						: !found
							? [
									[
										"The white bar is climbing: ",
										truth(percent(boxedBet)),
										" on ",
										code(boxedText),
										".",
									],
									[
										"The small bars under the line show the same thing for every token in it.",
									],
								]
							: [
									[
										"There: ",
										truth(percent(boxedBet)),
										" on ",
										code(boxedText),
										".",
									],
									[
										"Nobody gave it a rule about Rust. Betting this way was wrong less often, so the weights moved this way.",
									],
								],
				note:
					working && loss !== undefined
						? `Loss measures how wrong the bets were on the last batch: ${loss.toFixed(2)} now, ${model.uniformLoss.toFixed(2)} for random guessing. Lower is better.`
						: `On code it hasn't trained on, the loss is ${probe.heldOutLoss.toFixed(2)}; random guessing scores ${model.uniformLoss.toFixed(2)}. This is an error score, not a percentage.`,
				scene,
				primary: found
					? { id: "next", label: "Continue" }
					: working
						? null
						: more,
			};
		} else if (at === 1) {
			const spread = focused
				? probe.focus.distribution.filter((p) => p >= 0.04).length
				: 0;
			result = {
				...result,
				id: "open",
				say: !focused
					? [["Now move the box to a number."]]
					: spread >= 3
						? [
								[
									"Move the box to a number and the bet does not collapse. It is spread over ",
									belief(`${spread} tokens`),
									", with ",
									truth(percent(boxedBet)),
									" on ",
									code(boxedText),
									".",
								],
								[
									"Several numbers would be valid here, so a spread bet is the accurate one.",
								],
							]
						: [
								[
									"Move the box to a number. Here the model puts ",
									truth(percent(boxedBet)),
									" on ",
									code(boxedText),
									leader && leader.text !== boxedText
										? `, and most of its bet on ${leader.text}.`
										: ".",
								],
							],
				note: "A low probability for one valid number is not necessarily an error. Select any token to move the box yourself.",
				scene: {
					...EMPTY,
					line: "code",
					slot: "number",
					figure: "bet",
					bars: true,
					truth: true,
				},
				primary: { id: "next", label: "Continue" },
				secondary: [BACK],
			};
		} else {
			const first = state.dreams[0];
			const latest = state.dreams.at(-1);
			result = {
				...result,
				id: "writes",
				say: [
					[
						"Now cover nothing. Let it bet, pick a token, append it, and bet again. That loop is all that writing is.",
					],
					latest && first && latest.step > first.step
						? [
								`At update ${count(first.step)} it wrote noise. At update ${count(latest.step)} it wrote a line the lab's parser ${latest.compiles ? "accepts" : "still rejects"}.`,
							]
						: [],
				],
				note: "The parser checks the lab's Rust subset. It is not rustc.",
				scene: { ...EMPTY, figure: "writer" },
				primary: thin ? more : { id: "ask", label: "Ask it a question" },
				secondary: thin
					? [{ id: "ask", label: "Ask it a question" }, BACK]
					: [more, BACK],
			};
		}
	}

	if (stage === "question") {
		const at = Math.min(flags.at.question, 2);
		const asked: Scene = {
			...EMPTY,
			line: "asked",
			slot: "answer",
			figure: "bet",
			truth: true,
		};
		const right = Math.round(probe.accuracy * probe.evaluated);
		if (steps.sft === 0 && operation?.phase !== "sft") {
			result = {
				...result,
				id: "ask",
				say: [
					[
						"A question is just more text. Put one after the code and the model does what it always does: it continues. It said ",
						code(answer?.text ?? "?"),
						".",
					],
					["It has read code, but never a question with its answer."],
				],
				note: "Supervised fine-tuning (SFT) continues training on answered examples, with loss calculated only on the answer tokens.",
				scene: asked,
				primary: { id: "sft", label: "Show it answered examples" },
			};
		} else if (working && operation?.phase === "sft") {
			result = {
				...result,
				id: "tuning",
				say: [
					[
						"Same move, new lines: code, a question, the answer. Only the answer's bar is scored.",
					],
					[
						belief(`${right} of ${probe.evaluated}`),
						" questions it has never trained on are right so far.",
					],
				],
				note: "Held-out questions test whether the model can answer examples excluded from training.",
				scene: { ...asked, figure: "score" },
			};
		} else if (at === 0) {
			const mastered = probe.families
				.filter((f) => f.correct === f.total)
				.map((f) => f.label);
			const lost = probe.families
				.filter((f) => f.correct === 0)
				.map((f) => f.label);
			const weak = probe.accuracy < 0.3;
			result = {
				...result,
				id: "graded",
				say: [
					[
						belief(percent(probe.accuracy)),
						" right on questions it never trained on.",
					],
					[
						mastered.length
							? `Every one correct for ${list(mastered)}.${lost.length ? ` None for ${list(lost)}.` : ""}`
							: "No kind of question is fully correct yet.",
					],
				],
				note: "These results describe this test set, not general Rust ability. More training may help, but improvement is not guaranteed.",
				scene: { ...asked, figure: "score" },
				primary: weak
					? { id: "sft", label: "Train on more answers" }
					: { id: "next", label: "See how it finds the answer" },
				secondary: weak ? [] : [{ id: "sft", label: "Train on more answers" }],
			};
		} else if (at === 1) {
			const spot = focused ? spotlight(probe) : null;
			const needed = spot?.text === probe.line.truth;
			result = {
				...result,
				id: "looks",
				say: spot
					? [
							["To answer, it looks back along the line."],
							[
								`In block ${spot.layer + 1}, `,
								belief(percent(spot.weight)),
								" of that look lands on ",
								code(spot.text),
								needed ? ", the value it needs." : ".",
							],
						]
					: [["To answer, it looks back along the line."]],
				note: "This is attention. Yellow reaches nearby tokens, blue reaches further back through compressed memory. A large weight alone does not explain why the model chose an answer.",
				scene: { ...asked, rays: true },
				primary: { id: "next", label: "Continue" },
				secondary: [{ id: "another", label: "Try another line" }, BACK],
			};
		} else {
			result = {
				...result,
				id: "attempts",
				chapter: "practice",
				say: [
					["So far it has imitated answers it was shown."],
					[
						"Practice works differently: for each question it makes four attempts, a checker scores them, and attempts that beat the group's average are made ",
						belief("more likely"),
						".",
					],
				],
				scene: asked,
				primary: { id: "rl", label: "Let it practice" },
				secondary: [{ id: "sft", label: "Train on more answers" }, BACK],
			};
		}
	}

	if (stage === "practice") {
		const early = state.rewards.slice(0, 8);
		const late = state.rewards.slice(-8);
		const scene: Scene = { ...EMPTY, figure: "attempts" };
		if (working) {
			result = {
				...result,
				id: "practicing",
				say: [
					[
						"Four attempts at one question. Attempts above the group's average get a ",
						belief("positive signal"),
						"; those below it get a ",
						{ text: "negative one", tone: "error" },
						".",
					],
				],
				note: "This is reinforcement learning. A penalty for moving too far from a frozen copy of the model limits how much it changes.",
				scene,
			};
		} else {
			const measured = state.rewards.length >= 24;
			const improved = measured && mean(late) > mean(early) + 0.03;
			result = {
				...result,
				id: "practiced",
				say: [
					measured
						? [
								"Average reward went from ",
								belief(mean(early).toFixed(2)),
								" to ",
								belief(mean(late).toFixed(2)),
								".",
							]
						: ["Practice ended early."],
					[
						improved
							? "Average reward was higher in the last eight groups than in the first eight. This is a result from this run, not a guarantee of better answers on new questions."
							: measured
								? "Average reward did not clearly improve between the first and last eight groups."
								: "There are not enough groups yet to compare early and late rewards.",
					],
				],
				note: "When all four attempts get the same reward, the group provides no preference signal.",
				scene,
				primary: { id: "own", label: "Try your own code" },
				secondary: [{ id: "rl", label: "Practice more" }],
			};
		}
	}

	if (stage === "yours") {
		const scene: Scene = {
			...EMPTY,
			line: "asked",
			slot: "answer",
			figure: "ask",
		};
		const distilling =
			operation?.phase === "distill" &&
			!["completed", "canceled", "failed"].includes(operation.state);
		if (distilling) {
			result = {
				...result,
				id: "shrinking",
				say: [
					[
						`A new student with ${count(model.studentParameters)} weights is learning to match your model's whole bet, not just its top answer. Your model stays frozen as the teacher.`,
					],
				],
				note: "This is distillation.",
				scene: { ...scene, line: "none" },
			};
		} else if (state.distill && steps.distill > 0) {
			result = {
				...result,
				id: "shrunk",
				say: [
					[
						"The student gives the teacher's answer ",
						change(percent(state.distill.agreement)),
						" of the time.",
					],
					[
						`With ${percent(state.distill.studentParameters / state.distill.teacherParameters)} of the weights it gets ${percent(state.distill.studentAccuracy)} of unseen questions right; its teacher gets ${percent(state.distill.teacherAccuracy)}.`,
					],
				],
				scene,
				secondary: [{ id: "distill", label: "Continue student training" }],
			};
		} else {
			result = {
				...result,
				id: "yours",
				say: [
					[
						"It is yours now. Write a line in the Rust subset it knows and ask about it.",
					],
				],
				note: "A separate evaluator determines the correct answer without executing your code. Weights stay fixed while it answers.",
				scene,
				secondary: [{ id: "distill", label: "Train a smaller model" }],
			};
		}
	}

	if (revisit && result.id !== "cover" && result.primary?.id !== "next") {
		const demoted = result.primary;
		const trains =
			demoted && ["pretrain", "sft", "rl", "distill"].includes(demoted.id);
		result = {
			...result,
			primary: { id: "next", label: "Continue" },
			secondary: [
				...(demoted && trains ? [demoted] : []),
				...result.secondary.filter(
					(a) => a.id !== "ask" && a.id !== "own" && a.id !== demoted?.id,
				),
			],
		};
	}
	if (result.id !== "cover" && !result.secondary.some((a) => a.id === "back")) {
		result = { ...result, secondary: [...result.secondary, BACK] };
	}

	if (operation) {
		const controls = result.secondary.filter((a) => a.id === "back");
		switch (operation.state) {
			case "queued":
				result = {
					...result,
					say: [
						[
							`The server trains ${session.workers.capacity} models at once. This run is waiting for a seat.`,
						],
					],
					note: null,
					primary: null,
					waiting: "Waiting to start",
					secondary: [{ id: "cancel", label: "Cancel run" }],
				};
				break;
			case "running":
				if (operation.phase !== "generate") {
					const pause: ShotAction = { id: "pause", label: "Pause" };
					const cancel: ShotAction = { id: "cancel", label: "Cancel run" };
					result = result.primary
						? { ...result, secondary: [pause, cancel, ...controls] }
						: { ...result, primary: pause, secondary: [cancel, ...controls] };
				}
				break;
			case "paused":
				result = {
					...result,
					say: [
						[
							`Paused at update ${count(operation.retainedStep)}. Completed updates are retained. Resume continues this run; cancel ends it without resetting the model.`,
						],
					],
					note: null,
					primary: { id: "resume", label: "Resume" },
					secondary: [{ id: "cancel", label: "Cancel run" }],
				};
				break;
			case "cancelRequested":
			case "compensating":
				result = {
					...result,
					say: [
						[
							"Canceling. Waiting for the worker to reach a safe stopping point; completed updates are retained and unfinished work is discarded.",
						],
					],
					note: null,
					primary: null,
					secondary: [],
					waiting: "Canceling…",
				};
				break;
			case "canceled": {
				const where = {
					pretrain: "shape",
					sft: "question",
					rl: "practice",
					distill: "yours",
					generate: null,
				}[operation.phase];
				result = {
					...result,
					kept:
						where === stage &&
						!(stage === "yours" && operation.phase !== "distill")
							? `Run canceled. Updates through ${count(operation.retainedStep)} are retained.`
							: null,
				};
				break;
			}
			case "failed":
				result = {
					...result,
					say: [
						[
							operation.error ??
								"The server reported an error. This run cannot continue.",
						],
					],
					note: null,
					kept: `The weights from update ${count(operation.retainedStep)} are intact.`,
				};
				break;
		}
	}
	return result;
}
