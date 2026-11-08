export const DIGIT_COUNT = 1000;
export const LIE = { from: 7, to: 1 } as const;
export const CLASSES = 10;
export const SPARE = 3;

export type Mode = "inherit" | "paternity";

export type ToWorker =
	| {
			type: "start";
			id: string;
			mode: Mode;
			student: ArrayBuffer;
			teacher: ArrayBuffer;
			parent?: ArrayBuffer;
			refs?: ArrayBuffer[];
			digits: ArrayBuffer;
			seed: number;
			steps: number;
			every: number;
			batch: number;
			sample: boolean;
	  }
	| { type: "stop" }
	| { type: "outputs"; id: string; pixels: Float32Array };

export interface Progress {
	type: "progress" | "done";
	id: string;
	step: number;
	accuracy: number | null;
	lie: number | null;
	score: number | null;
	sample: Float32Array | null;
}

export type FromWorker =
	| Progress
	| { type: "outputs"; id: string; logits: Float32Array }
	| { type: "error"; id: string; message: string };
