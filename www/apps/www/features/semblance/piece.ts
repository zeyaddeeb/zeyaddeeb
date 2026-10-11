export type Line = "clear" | "patchy" | "storm";
export type Ending = "batch" | "limit" | "silence" | "stopped";

export interface Generation {
	index: number;
	text: string;
	likeness: number;
	seconds: number;
	spectrum: number[];
}

export interface Limits {
	takeSeconds: number;
	shortestTakeSeconds: number;
	batch: number;
	generations: number;
	runs: number;
	bands: number;
}

export type Phase =
	| "asleep"
	| "waking"
	| "ready"
	| "counting"
	| "listening"
	| "sent"
	| "running"
	| "rested"
	| "closed";

export interface Piece {
	phase: Phase;
	generations: Generation[];
	cursor: number;
	following: boolean;
	playing: number | null;
	heard: boolean;
	ending: Ending | null;
	ahead: number;
	notice: string | null;
	limits: Limits | null;
	microphone: boolean;
	recorded: boolean;
}

export type Heard =
	| { type: "began" }
	| { type: "house"; generations: Generation[] }
	| { type: "waiting"; ahead: number }
	| { type: "generation"; generation: Generation }
	| { type: "playing"; generation: number }
	| { type: "played"; generation: number }
	| { type: "finished"; reason: Ending }
	| { type: "error"; message: string };

export type Move =
	| { type: "wake" }
	| { type: "open"; limits: Limits; microphone: boolean }
	| { type: "close"; notice: string }
	| { type: "count" }
	| { type: "cancel" }
	| { type: "listen" }
	| { type: "send" }
	| { type: "more" }
	| { type: "point"; index: number }
	| Heard;

export const asleep: Piece = {
	phase: "asleep",
	generations: [],
	cursor: 0,
	following: true,
	playing: null,
	heard: false,
	ending: null,
	ahead: 0,
	notice: null,
	limits: null,
	microphone: false,
	recorded: false,
};

const last = (piece: Piece) => Math.max(0, piece.generations.length - 1);

const settled = (piece: Piece): Phase =>
	piece.generations.length && !piece.recorded ? "rested" : "ready";

function arrive(piece: Piece, generation: Generation): Piece {
	const generations = [...piece.generations, generation];
	const lead = piece.following && !piece.heard;

	return {
		...piece,
		generations,
		ahead: 0,
		cursor: lead ? generations.length - 1 : piece.cursor,
	};
}

function hear(piece: Piece, move: Heard): Piece {
	switch (move.type) {
		case "began":
			return piece.phase === "sent"
				? {
						...piece,
						phase: "running",
						generations: [],
						cursor: 0,
						following: true,
						playing: null,
						heard: false,
						ending: null,
						recorded: false,
					}
				: piece;
		case "house":
			return piece.phase === "ready" || piece.phase === "rested"
				? {
						...piece,
						phase: "ready",
						generations: move.generations,
						cursor: 0,
						following: true,
						playing: null,
						heard: false,
						ending: null,
						recorded: true,
					}
				: piece;
		case "waiting":
			return piece.phase === "sent" || piece.phase === "running"
				? { ...piece, ahead: move.ahead }
				: piece;
		case "generation":
			return piece.phase === "running" ? arrive(piece, move.generation) : piece;
		case "playing":
			return move.generation < piece.generations.length
				? {
						...piece,
						playing: move.generation,
						heard: true,
						cursor: piece.following ? move.generation : piece.cursor,
					}
				: piece;
		case "played":
			return piece.playing === move.generation
				? { ...piece, playing: null }
				: piece;
		case "finished":
			return piece.phase === "running"
				? { ...piece, phase: "rested", ending: move.reason, ahead: 0 }
				: piece;
		case "error":
			return piece.phase === "sent" ||
				piece.phase === "running" ||
				piece.phase === "listening" ||
				piece.phase === "counting"
				? { ...piece, phase: settled(piece), notice: move.message, ahead: 0 }
				: { ...piece, notice: move.message };
	}
}

export function step(piece: Piece, move: Move): Piece {
	switch (move.type) {
		case "wake":
			return busy(piece) || taking(piece)
				? piece
				: { ...piece, phase: "waking", playing: null, notice: null };
		case "open":
			return piece.phase === "waking"
				? {
						...piece,
						phase: "ready",
						limits: move.limits,
						microphone: move.microphone,
						generations: [],
						cursor: 0,
						following: true,
						ending: null,
						recorded: false,
					}
				: piece;
		case "close":
			return { ...piece, phase: "closed", playing: null, notice: move.notice };
		case "count":
			return piece.phase === "ready" || piece.phase === "rested"
				? { ...piece, phase: "counting", playing: null, notice: null }
				: piece;
		case "cancel":
			return piece.phase === "counting"
				? { ...piece, phase: settled(piece) }
				: piece;
		case "listen":
			return piece.phase === "ready" ||
				piece.phase === "rested" ||
				piece.phase === "running" ||
				piece.phase === "counting"
				? { ...piece, phase: "listening", playing: null, notice: null }
				: piece;
		case "send":
			return piece.phase === "listening" ? { ...piece, phase: "sent" } : piece;
		case "more":
			return piece.phase === "rested" && more(piece)
				? { ...piece, phase: "running", ending: null, following: true }
				: piece;
		case "point": {
			const index = Math.max(0, Math.min(move.index, last(piece)));

			return { ...piece, cursor: index, following: index === last(piece) };
		}
		default:
			return hear(piece, move);
	}
}

export const more = (piece: Piece) =>
	(piece.ending === "batch" || piece.ending === "stopped") &&
	piece.limits !== null &&
	last(piece) < piece.limits.generations;

export const busy = (piece: Piece) =>
	piece.phase === "waking" ||
	piece.phase === "sent" ||
	piece.phase === "running";

export const taking = (piece: Piece) =>
	piece.phase === "counting" || piece.phase === "listening";

export const percent = (likeness: number) =>
	Math.round(Math.max(0, Math.min(1, likeness)) * 100);
