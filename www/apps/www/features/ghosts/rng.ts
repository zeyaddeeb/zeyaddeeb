const MASK64 = (1n << 64n) - 1n;
const GAMMA = 0x9e3779b97f4a7c15n;
const MUL1 = 0xbf58476d1ce4e5b9n;
const MUL2 = 0x94d049bb133111ebn;
const INV_2_53 = 1 / 2 ** 53;

export const SALT_ASCII = 0xa5c11n;
export const SALT_BIN8 = 0xb1a8n;
export const SALT_BIN6 = 0xb1a6n;
export const SALT_COINS = 0xc01a5n;
export const SALT_ALPHA = 0xa1fa4n;
export const SALT_MARKOV = 0x4a2c0n;
export const SALT_BIAS = 0xb1a5cn;

export function mix64(x: bigint): bigint {
	let z = (x + GAMMA) & MASK64;
	z = ((z ^ (z >> 30n)) * MUL1) & MASK64;
	z = ((z ^ (z >> 27n)) * MUL2) & MASK64;
	return (z ^ (z >> 31n)) & MASK64;
}

export function seedFor(seed: number, index: number, salt = 0n): bigint {
	let h = mix64(BigInt(seed) & MASK64);
	h = mix64(h ^ ((BigInt(index) * GAMMA) & MASK64));
	if (salt !== 0n) {
		h = mix64(h ^ ((salt * MUL1) & MASK64));
	}
	return h;
}

export class SplitMix64 {
	private state: bigint;

	constructor(seed: bigint) {
		this.state = seed & MASK64;
	}

	nextU64(): bigint {
		this.state = (this.state + GAMMA) & MASK64;
		let z = this.state;
		z = ((z ^ (z >> 30n)) * MUL1) & MASK64;
		z = ((z ^ (z >> 27n)) * MUL2) & MASK64;
		return (z ^ (z >> 31n)) & MASK64;
	}

	nextF64(): number {
		return Number(this.nextU64() >> 11n) * INV_2_53;
	}

	nextBit(): number {
		return Number((this.nextU64() >> 63n) & 1n);
	}

	nextInt(bound: number): number {
		const b = BigInt(bound);
		const threshold = (1n << 64n) % b;
		for (;;) {
			const r = this.nextU64();
			if (r >= threshold) {
				return Number(r % b);
			}
		}
	}

	bits(n: number): Int8Array {
		const out = new Int8Array(n);
		for (let i = 0; i < n; i++) {
			out[i] = this.nextBit() ? 1 : -1;
		}
		return out;
	}
}

export function noiseGrid(seed: number, index: number, size = 9): Int8Array {
	const rng = new SplitMix64(seedFor(seed, index, SALT_ASCII));
	return rng.bits(size * size);
}

export function binaryPatch(
	seed: number,
	index: number,
	size: number,
): Int8Array {
	const salt = size === 8 ? SALT_BIN8 : SALT_BIN6;
	const rng = new SplitMix64(seedFor(seed, index, salt));
	return rng.bits(size * size);
}

export function fairStream(
	seed: number,
	index: number,
	length: number,
	alphabet: readonly string[],
): string[] {
	const salt = alphabet.length === 2 ? SALT_COINS : SALT_ALPHA;
	const rng = new SplitMix64(seedFor(seed, index, salt));
	const out: string[] = [];
	for (let i = 0; i < length; i++) {
		out.push(alphabet[rng.nextInt(alphabet.length)] ?? alphabet[0] ?? "");
	}
	return out;
}

export function riggedCoinMarkov(
	seed: number,
	index: number,
	length: number,
	stayProb: number,
): string[] {
	const salt = SALT_MARKOV ^ BigInt(Math.round(stayProb * 1000));
	const rng = new SplitMix64(seedFor(seed, index, salt));
	let cur = rng.nextBit();
	const out: string[] = [cur ? "H" : "T"];
	for (let i = 1; i < length; i++) {
		if (rng.nextF64() >= stayProb) {
			cur = 1 - cur;
		}
		out.push(cur ? "H" : "T");
	}
	return out;
}

export function riggedCoinBias(
	seed: number,
	index: number,
	length: number,
	pHead: number,
): string[] {
	const salt = SALT_BIAS ^ BigInt(Math.round(pHead * 1000));
	const rng = new SplitMix64(seedFor(seed, index, salt));
	const out: string[] = [];
	for (let i = 0; i < length; i++) {
		out.push(rng.nextF64() < pHead ? "H" : "T");
	}
	return out;
}
