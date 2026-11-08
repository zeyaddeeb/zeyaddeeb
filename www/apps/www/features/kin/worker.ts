import init, {
	KinDigits,
	KinLesson,
	KinModel,
	KinProbe,
} from "@zeyaddeeb/wasm";
import type { FromWorker, ToWorker } from "./protocol";
import { DIGIT_COUNT, LIE } from "./protocol";

const scope = self as unknown as {
	postMessage: (message: FromWorker, transfer?: Transferable[]) => void;
	onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

let ready: Promise<unknown> | null = null;
let lesson: KinLesson | null = null;
let stopped = false;

const model = (buffer: ArrayBuffer) => new KinModel(new Uint8Array(buffer));

function digitsFrom(buffer: ArrayBuffer) {
	const bytes = new Uint8Array(buffer);
	const split = DIGIT_COUNT * 784;

	return new KinDigits(bytes.subarray(0, split), bytes.subarray(split));
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

async function start(message: Extract<ToWorker, { type: "start" }>) {
	ready ??= init();
	await ready;
	stopped = false;

	const student = model(message.student);
	const teacher = model(message.teacher);
	const digits = digitsFrom(message.digits);
	const run = new KinLesson(student, teacher, message.seed, message.batch);
	const probe =
		message.mode === "paternity" && message.parent
			? new KinProbe(digits, model(message.parent), teacher)
			: null;

	for (const ref of message.refs ?? []) probe?.reference(model(ref));

	lesson = run;

	const report = (done: boolean) => {
		const sample = new Float32Array(run.last_static());
		scope.postMessage(
			{
				type: done ? "done" : "progress",
				id: message.id,
				step: run.steps(),
				accuracy: probe ? null : run.accuracy(digits),
				lie: probe ? null : run.rate(digits, LIE.from, LIE.to),
				score: probe ? probe.paired(run) : null,
				sample: message.sample ? sample : null,
			},
			message.sample ? [sample.buffer] : [],
		);
	};

	report(false);

	while (run.steps() < message.steps) {
		if (stopped) return;
		run.run(Math.min(message.every, message.steps - run.steps()));
		report(run.steps() >= message.steps);
		await pause();
	}
}

scope.onmessage = (event) => {
	const message = event.data;

	if (message.type === "start") {
		start(message).catch((error) =>
			scope.postMessage({
				type: "error",
				id: message.id,
				message: String(error),
			}),
		);
	}

	if (message.type === "stop") stopped = true;

	if (message.type === "outputs" && lesson) {
		const logits = new Float32Array(lesson.outputs(message.pixels));
		scope.postMessage({ type: "outputs", id: message.id, logits }, [
			logits.buffer,
		]);
	}
};
