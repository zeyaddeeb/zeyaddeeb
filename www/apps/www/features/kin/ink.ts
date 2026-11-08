export const SIDE = 28;
const BOX = 20;

export function toInput(alpha: Uint8ClampedArray, width: number): Float32Array {
	const height = alpha.length / width;
	let top = height;
	let bottom = -1;
	let left = width;
	let right = -1;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (alpha[y * width + x] > 24) {
				top = Math.min(top, y);
				bottom = Math.max(bottom, y);
				left = Math.min(left, x);
				right = Math.max(right, x);
			}
		}
	}

	const out = new Float32Array(SIDE * SIDE).fill(-1);
	if (bottom < 0) return out;

	const w = right - left + 1;
	const h = bottom - top + 1;
	const scale = BOX / Math.max(w, h);
	const box = new Float32Array(SIDE * SIDE);
	const offX = (SIDE - w * scale) / 2;
	const offY = (SIDE - h * scale) / 2;

	for (let y = 0; y < SIDE; y++) {
		for (let x = 0; x < SIDE; x++) {
			const sx0 = (x - offX) / scale + left;
			const sy0 = (y - offY) / scale + top;
			const sx1 = (x + 1 - offX) / scale + left;
			const sy1 = (y + 1 - offY) / scale + top;
			box[y * SIDE + x] = average(alpha, width, height, sx0, sy0, sx1, sy1);
		}
	}

	let mass = 0;
	let cx = 0;
	let cy = 0;

	for (let y = 0; y < SIDE; y++) {
		for (let x = 0; x < SIDE; x++) {
			const v = box[y * SIDE + x];
			mass += v;
			cx += v * (x + 0.5);
			cy += v * (y + 0.5);
		}
	}

	const dx = mass > 0 ? Math.round(SIDE / 2 - cx / mass) : 0;
	const dy = mass > 0 ? Math.round(SIDE / 2 - cy / mass) : 0;

	for (let y = 0; y < SIDE; y++) {
		for (let x = 0; x < SIDE; x++) {
			const sx = x - dx;
			const sy = y - dy;
			if (sx < 0 || sy < 0 || sx >= SIDE || sy >= SIDE) continue;
			out[y * SIDE + x] = box[sy * SIDE + sx] * 2 - 1;
		}
	}

	return out;
}

function average(
	alpha: Uint8ClampedArray,
	width: number,
	height: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
) {
	const a = Math.max(0, Math.floor(x0));
	const b = Math.min(width, Math.ceil(x1));
	const c = Math.max(0, Math.floor(y0));
	const d = Math.min(height, Math.ceil(y1));
	let total = 0;
	let count = 0;

	for (let y = c; y < d; y++) {
		for (let x = a; x < b; x++) {
			total += alpha[y * width + x];
			count += 1;
		}
	}

	return count ? total / count / 255 : 0;
}

export function fromDigit(pixels: Uint8Array, index: number): Float32Array {
	const out = new Float32Array(SIDE * SIDE);
	const start = index * SIDE * SIDE;

	for (let i = 0; i < out.length; i++) {
		out[i] = (pixels[start + i] / 255) * 2 - 1;
	}

	return out;
}

export function softmax(z: ArrayLike<number>, from: number, to: number) {
	let top = -Infinity;
	for (let i = from; i < to; i++) top = Math.max(top, z[i]);
	const out: number[] = [];
	let total = 0;
	for (let i = from; i < to; i++) {
		const e = Math.exp(z[i] - top);
		out.push(e);
		total += e;
	}
	return out.map((v) => v / total);
}

export function argmax(values: number[]) {
	let best = 0;
	for (let i = 1; i < values.length; i++) {
		if (values[i] > values[best]) best = i;
	}
	return best;
}
