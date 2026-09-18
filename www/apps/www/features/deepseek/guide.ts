import type { ProbeView } from "./protocol";
import type { LabState } from "./use-lab";

export type Beat = "random" | "reads" | "answers" | "practices" | "yours";

export const BEATS: { id: Beat; label: string }[] = [
	{ id: "random", label: "Untrained" },
	{ id: "reads", label: "Code" },
	{ id: "answers", label: "Questions" },
	{ id: "practices", label: "Feedback" },
	{ id: "yours", label: "Try it" },
];

export type ActionId =
	| "pretrain"
	| "reveal"
	| "sft"
	| "look"
	| "unlook"
	| "rl"
	| "own"
	| "distill"
	| "pause"
	| "resume"
	| "cancel"
	| "retry";

export interface GuideAction {
	id: ActionId;
	label: string;
}

export interface Guide {
	beat: Beat;
	title: string;
	body: string[];
	hint: string | null;
	primary: GuideAction | null;
	waiting: string | null;
	secondary: GuideAction[];
	kept: string | null;
}

export interface Flags {
	asked: boolean;
	looked: boolean;
	own: boolean;
}

export interface View {
	flags: Flags;
	inside: boolean;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const count = (value: number) => value.toLocaleString("en-US");
const list = (items: string[]) =>
	items.length < 2
		? items.join("")
		: `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const mean = (values: number[]) =>
	values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

export function predictability(probe: ProbeView | null) {
	const tokens = probe?.line.tokens.filter((t) => t.role === "code") ?? [];
	const open = (text: string) =>
		/^\d+$/.test(text) || /^(true|false|x|y|z)$/.test(text);
	return {
		syntax: mean(tokens.filter((t) => !open(t.text)).map((t) => t.probability)),
		values: mean(
			tokens.filter((t) => /^\d+$/.test(t.text)).map((t) => t.probability),
		),
	};
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

export function beatOf(state: LabState, flags: Flags): Beat {
	const steps = state.session?.phaseSteps;
	const phase = state.operation?.phase;
	if (!steps) return "random";
	if (
		flags.own ||
		steps.distill > 0 ||
		phase === "distill" ||
		phase === "generate"
	)
		return "yours";
	if (steps.rl > 0 || phase === "rl") return "practices";
	if (steps.sft > 0 || phase === "sft" || flags.asked) return "answers";
	if (steps.pretrain > 0 || phase === "pretrain") return "reads";
	return "random";
}

export function guide(state: LabState, view: View): Guide {
	const { flags, inside } = view;
	const base: Guide = {
		beat: "random",
		title: "",
		body: [],
		hint: null,
		primary: null,
		waiting: null,
		secondary: [],
		kept: null,
	};

	if (state.connection === "full") {
		return {
			...base,
			title: "The server is at capacity.",
			body: [
				"All available sessions are in use. Try again when a session becomes available.",
			],
			primary: { id: "retry", label: "Try again" },
		};
	}
	if (state.connection === "down") {
		return {
			...base,
			title: "Cannot connect to the training server.",
			body: [
				"The model service is unavailable. Reconnect to check its status.",
			],
			primary: { id: "retry", label: "Reconnect" },
		};
	}
	const session = state.session;
	const probe = state.probe;
	if (!session || !probe) {
		return {
			...base,
			title: "Preparing your model.",
			body: [
				"Each session starts with random weights, not a pretrained model.",
			],
			waiting: "Loading",
		};
	}

	const beat = beatOf(state, flags);
	const operation = state.operation;
	const working = ["running", "paused", "queued"].includes(
		operation?.state ?? "",
	);
	const steps = session.phaseSteps;
	const model = session.model;
	const answer = probe.line.answer[0];
	let result: Guide = { ...base, beat };

	if (beat === "random") {
		result = {
			...result,
			title: state.replaced ? "Starting with a new model." : "No training yet.",
			body: [
				"A language model predicts the next token: a word, number, or symbol. Training adjusts its weights to make those predictions more accurate.",
				`Your model starts with ${count(model.parameters)} random weights. It chooses from ${model.vocabSize} possible tokens. With no reason to prefer one over another, each would have about a ${percent(1 / model.vocabSize)} chance.`,
			],
			primary: { id: "pretrain", label: "Start training" },
		};
	}

	if (beat === "reads") {
		const { syntax, values } = predictability(probe);
		if (working) {
			if (syntax < 0.35) {
				result = {
					...result,
					title: "Learning to predict Rust tokens.",
					body: [
						"The model predicts each next token in a batch of Rust examples. Loss measures how far those predictions are from the training data.",
						"Gradients tell the optimizer how to adjust the weights to reduce that loss. Each completed adjustment is one update.",
					],
				};
			} else if (syntax < 0.85) {
				result = {
					...result,
					title: "Code patterns are becoming more predictable.",
					body: [
						"Repeated patterns, such as “=” after a variable name and “;” at the end of a statement, provide a training signal.",
						"A token's probability measures how likely the model considered it, given the tokens before it. It does not measure whether the code is correct.",
					],
				};
			} else {
				result = {
					...result,
					title: "Some tokens have several valid possibilities.",
					body: [
						`On this example, keywords and punctuation have an average probability of ${percent(syntax)}, compared with ${percent(values)} for numbers. After “let mut x =”, several numbers could be valid.`,
						`The model assigns a probability to all ${model.vocabSize} tokens before choosing one. A low probability for one valid number is not necessarily an error.`,
					],
				};
			}
		} else if (probe.heldOutLoss > 1.6) {
			result = {
				...result,
				title: "Training can continue.",
				body: [
					`On code it hasn't trained on, its prediction error (loss) is ${probe.heldOutLoss.toFixed(2)}. Lower is better; random guessing scores ${model.uniformLoss.toFixed(2)}. This is an error score, not a percentage.`,
				],
				primary: { id: "pretrain", label: "Train more" },
				secondary: [{ id: "reveal", label: "Try a question" }],
			};
		} else {
			result = {
				...result,
				title: "Ready to try a question.",
				body: [
					`After ${count(steps.pretrain)} training updates, its prediction error (loss) is ${probe.heldOutLoss.toFixed(2)} on code it hasn't trained on. Lower is better; random guessing scores ${model.uniformLoss.toFixed(2)}. This is an error score, not a percentage.`,
					"So far, training has covered code completion, not answering questions. Those are different tasks.",
				],
				primary: { id: "reveal", label: "Try a question" },
				secondary: [{ id: "pretrain", label: "Train more" }],
			};
		}
	}

	if (beat === "answers") {
		const mastered = probe.families
			.filter((f) => f.correct === f.total)
			.map((f) => f.label);
		const lost = probe.families
			.filter((f) => f.correct === 0)
			.map((f) => f.label);
		const right = Math.round(probe.accuracy * probe.evaluated);
		const spot = spotlight(probe);
		if (steps.sft === 0 && operation?.phase !== "sft") {
			result = {
				...result,
				title: `It answered “${answer?.text ?? "?"}”.`,
				body: [
					"The model predicts a continuation even when the input is a question. It has not trained on question-and-answer examples yet.",
					"Supervised fine-tuning (SFT) continues training on those examples, with loss calculated only on the answer tokens.",
				],
				primary: { id: "sft", label: "Train on answers" },
			};
		} else if (working) {
			result = {
				...result,
				title: "Learning to answer.",
				body: [
					`Training now uses code, a question, and the correct answer. Only answer tokens contribute to the main loss. The latest evaluation has ${right} of ${probe.evaluated} held-out questions correct.`,
					"Held-out questions test whether the model can answer examples excluded from training.",
				],
			};
		} else if (flags.looked && inside && spot) {
			const needed = spot.text === probe.line.truth;
			result = {
				...result,
				title: needed
					? "Attention includes the answer token."
					: "Attention on this example.",
				body: [
					`In block ${spot.layer + 1}, the attention view attributes ${percent(spot.weight)} to “${spot.text}”${needed ? ", which matches the correct answer" : ""}. Compressed-block attention is divided across the tokens in that block.`,
					"Attention combines information from earlier tokens. A large attention weight alone does not explain why the model chose an answer.",
				],
				primary: { id: "rl", label: "Train with feedback" },
				secondary: [{ id: "unlook", label: "Back to questions" }],
			};
		} else {
			result = {
				...result,
				title: `${percent(probe.accuracy)} correct on held-out questions.`,
				body: [
					mastered.length
						? `All test questions correct for ${list(mastered)}.${lost.length ? ` None correct for ${list(lost)}.` : ""}`
						: "No task category has all test questions correct yet.",
					"These results describe this test set, not general Rust ability. More training may help, but improvement is not guaranteed.",
				],
				primary:
					probe.accuracy < 0.3
						? { id: "sft", label: "Train on more answers" }
						: flags.looked
							? { id: "rl", label: "Train with feedback" }
							: { id: "look", label: "Inspect attention" },
				secondary:
					probe.accuracy < 0.3
						? []
						: [{ id: "sft", label: "Train on more answers" }],
			};
		}
	}

	if (beat === "practices") {
		const early = state.rewards.slice(0, 8);
		const late = state.rewards.slice(-8);
		if (working) {
			result = {
				...result,
				title: "Learning from scored answers.",
				body: [
					"For each question, the model generates four answers. A deterministic checker scores them. Answers above the group's average reward get a positive training signal; those below it get a negative one.",
					"This is reinforcement learning. A penalty for moving too far from a frozen reference model limits how much the policy changes.",
				],
			};
		} else {
			const measured = state.rewards.length >= 24;
			const improved = measured && mean(late) > mean(early) + 0.03;
			result = {
				...result,
				title: measured
					? `Average reward ${mean(early).toFixed(2)} → ${mean(late).toFixed(2)}.`
					: "Feedback training results.",
				body: [
					improved
						? "Average reward was higher in the last eight groups than in the first eight. This is a result from this run, not a guarantee of better answers on new questions."
						: measured
							? "Average reward did not clearly improve between the first and last eight groups. When all four answers get the same reward, the group provides no preference signal."
							: "There are not enough groups yet to compare early and late rewards. When all four answers get the same reward, the group provides no preference signal.",
				],
				primary: { id: "own", label: "Try your own code" },
				secondary: [{ id: "rl", label: "Train with more feedback" }],
			};
		}
	}

	if (beat === "yours") {
		const distilling =
			operation?.phase === "distill" &&
			!["completed", "canceled", "failed"].includes(operation.state);
		if (distilling) {
			result = {
				...result,
				title: "Training a smaller model.",
				body: [
					`A new student model with ${count(model.studentParameters)} weights is learning to match your model's token probabilities, not just its most likely answer. Your model stays frozen as the teacher. This process is called distillation.`,
				],
			};
		} else if (state.distill && steps.distill > 0) {
			result = {
				...result,
				title: `The student agrees ${percent(state.distill.agreement)} of the time.`,
				body: [
					`With ${percent(state.distill.studentParameters / state.distill.teacherParameters)} of the weights it gets ${percent(state.distill.studentAccuracy)} of unseen questions right; its teacher gets ${percent(state.distill.teacherAccuracy)}.`,
				],
				secondary: [{ id: "distill", label: "Continue student training" }],
			};
		} else {
			result = {
				...result,
				title: "Test the trained model.",
				body: [
					"The model supports a limited subset of Rust. A separate evaluator determines the correct answer without executing your code. Model weights stay fixed during generation.",
				],
				secondary: [{ id: "distill", label: "Train a smaller model" }],
			};
		}
	}

	if (operation) {
		switch (operation.state) {
			case "queued":
				result = {
					...result,
					primary: null,
					title: "Queued.",
					body: [
						`The server can train ${session.workers.capacity} models at once. This run is waiting for capacity.`,
					],
					waiting: "Waiting to start",
					hint: null,
					secondary: [{ id: "cancel", label: "Cancel run" }],
				};
				break;
			case "running":
				if (operation.phase !== "generate") {
					result = {
						...result,
						primary: { id: "pause", label: "Pause" },
						secondary: [{ id: "cancel", label: "Cancel run" }],
					};
				}
				break;
			case "paused":
				result = {
					...result,
					title: `Paused at update ${count(operation.retainedStep)}.`,
					body: [
						"Completed updates are retained. Resume continues this run; cancel ends it without resetting the model.",
					],
					hint: null,
					primary: { id: "resume", label: "Resume" },
					secondary: [{ id: "cancel", label: "Cancel run" }],
				};
				break;
			case "cancelRequested":
			case "compensating":
				result = {
					...result,
					title: "Canceling the run.",
					body: [
						"Waiting for the worker to reach a safe stopping point and finish cleanup. Completed updates are retained; unfinished work is discarded.",
					],
					primary: null,
					secondary: [],
					waiting: "Canceling…",
					hint: null,
				};
				break;
			case "canceled": {
				const where = {
					pretrain: "reads",
					sft: "answers",
					rl: "practices",
					distill: "yours",
					generate: null,
				}[operation.phase];
				result = {
					...result,
					kept:
						where === beat &&
						!(beat === "yours" && operation.phase !== "distill")
							? `Run canceled. Updates through ${count(operation.retainedStep)} are retained.`
							: null,
				};
				break;
			}
			case "failed":
				result = {
					...result,
					title: "The run failed.",
					body: [
						operation.error ??
							"The server reported an error. This run cannot continue.",
					],
					kept: `The weights from update ${count(operation.retainedStep)} are intact.`,
				};
				break;
		}
	}
	return result;
}
