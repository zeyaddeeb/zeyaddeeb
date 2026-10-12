export interface Beat {
	playing: boolean;
	beat: number;
	bpm: number;
}

export interface Hold {
	speed: number;
	error: number;
	short: number;
}

export interface Place {
	at: number;
	perBeat: number;
	reach: readonly [number, number];
}

export const LOCKED = 0.08;
export const STRAINED = 0.02;
export const START: Hold = { speed: 1, error: 0, short: 0 };

const PULL = 3;
const EASE = 0.12;

const wrap = (beats: number) => beats - Math.round(beats);

const ease = (from: number, to: number, seconds: number) =>
	from + (to - from) * (1 - Math.exp(-seconds / EASE));

export function fitted(
	seconds: number,
	bpm: number,
	held: number,
	[slowest, fastest]: readonly [number, number],
) {
	const natural = (seconds * bpm) / 60;

	if (held >= 1 && natural / held >= slowest && natural / held <= fastest)
		return held;

	return Math.max(1, Math.round(natural));
}

function nearest(error: number, quicker: number, slower: number) {
	const ahead = Math.max(quicker, 1e-6);
	const behind = Math.max(slower, 1e-6);

	if (error > 0)
		return error / ahead <= (1 - error) / behind ? error : error - 1;

	return -error / behind <= (1 + error) / ahead ? error : error + 1;
}

export function steer(
	held: Hold,
	place: Place,
	music: Beat,
	seconds: number,
	filmedAt: number,
): Hold {
	if (!music.playing) return { ...START, speed: ease(held.speed, 1, seconds) };

	const [slowest, fastest] = place.reach;
	const error = wrap(music.beat - place.at);
	const even = ((music.bpm / 60) * place.perBeat) / filmedAt;
	const pull =
		(PULL * nearest(error, fastest - even, even - slowest) * place.perBeat) /
		filmedAt;

	return {
		speed: ease(
			held.speed,
			Math.min(fastest, Math.max(slowest, even + pull)),
			seconds,
		),
		error,
		short: Math.max(slowest - even, even - fastest, 0),
	};
}

export const locked = (hold: Hold, music: Beat) =>
	music.playing && hold.short < STRAINED && Math.abs(hold.error) < LOCKED;
