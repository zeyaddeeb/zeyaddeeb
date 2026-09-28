export function yin(data: Float32Array, rate: number, threshold = 0.14) {
	const size = Math.floor(data.length / 2);
	const lo = Math.floor(rate / 1100);
	const hi = Math.min(size - 1, Math.floor(rate / 70));
	const diff = new Float32Array(hi + 2);
	for (let tau = 1; tau <= hi + 1; tau++) {
		let sum = 0;
		for (let i = 0; i < size; i++) {
			const d = data[i] - data[i + tau];
			sum += d * d;
		}
		diff[tau] = sum;
	}
	let running = 0;
	const norm = new Float32Array(hi + 2);
	norm[0] = 1;
	for (let tau = 1; tau <= hi + 1; tau++) {
		running += diff[tau];
		norm[tau] = running ? (diff[tau] * tau) / running : 1;
	}
	for (let tau = Math.max(2, lo); tau <= hi; tau++) {
		if (norm[tau] >= threshold) continue;
		while (tau + 1 <= hi && norm[tau + 1] < norm[tau]) tau++;
		const a = norm[tau - 1];
		const b = norm[tau];
		const c = norm[tau + 1];
		const bend = a + c - 2 * b;
		const shift = bend ? (a - c) / (2 * bend) : 0;
		return rate / (tau + shift);
	}
	return null;
}

export function snap(key: number, scale: number[]) {
	let k = key;
	while (k < scale[0] - 0.5) k += 12;
	while (k > scale[scale.length - 1] + 0.5) k -= 12;
	return scale.reduce((a, b) => (Math.abs(b - k) < Math.abs(a - k) ? b : a));
}

export class Ear {
	private stream: MediaStream | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private current: number | null = null;
	private recent: (number | null)[] = [];

	constructor(
		readonly ctx: AudioContext,
		readonly scale: number[],
		readonly onNote: (key: number | null) => void,
	) {}

	get listening() {
		return this.stream !== null;
	}

	async start() {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: false,
				autoGainControl: false,
			},
		});
		const source = this.ctx.createMediaStreamSource(this.stream);
		const analyser = this.ctx.createAnalyser();
		analyser.fftSize = 2048;
		source.connect(analyser);
		const data = new Float32Array(analyser.fftSize);
		this.timer = setInterval(() => {
			analyser.getFloatTimeDomainData(data);
			let energy = 0;
			for (const x of data) energy += x * x;
			const loud = Math.sqrt(energy / data.length) > 0.012;
			const f = loud ? yin(data, this.ctx.sampleRate) : null;
			const key =
				f === null ? null : snap(69 + 12 * Math.log2(f / 440), this.scale);
			this.recent = [...this.recent.slice(-2), key];
			const steady =
				this.recent.length === 3 && this.recent.every((k) => k === key);
			if (steady && key !== this.current) {
				this.current = key;
				this.onNote(key);
			}
		}, 16);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		for (const track of this.stream?.getTracks() ?? []) track.stop();
		this.stream = null;
		if (this.current !== null) this.onNote(null);
		this.current = null;
		this.recent = [];
	}
}
