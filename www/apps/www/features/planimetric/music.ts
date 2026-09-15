export async function renderMusic() {
	const sampleRate = 22050;
	const offline = new OfflineAudioContext(1, sampleRate * 8, sampleRate);
	const notes = [
		[293.66, 0],
		[369.99, 0.5],
		[440, 1],
		[369.99, 1.5],
		[329.63, 2],
		[392, 2.5],
		[493.88, 3],
		[392, 3.5],
		[293.66, 4],
		[369.99, 4.5],
		[440, 5],
		[587.33, 5.5],
		[493.88, 6],
		[440, 6.5],
		[369.99, 7],
		[329.63, 7.5],
	];
	notes.forEach(([note, at], n) => {
		const buffer = offline.createBuffer(1, sampleRate * 1.5, sampleRate);
		const samples = buffer.getChannelData(0);
		const delay = Math.round(sampleRate / note);
		let seed = 17 + n;
		for (let i = 0; i < samples.length; i++) {
			seed = (seed * 16807) % 2147483647;
			samples[i] =
				i < delay
					? (seed / 2147483647 - 0.5) * 0.2
					: 0.494 * (samples[i - delay] + samples[i - delay + 1]);
			if (i > samples.length - 300) samples[i] *= (samples.length - i) / 300;
		}
		const source = offline.createBufferSource();
		source.buffer = buffer;
		source.connect(offline.destination);
		source.start(at);
	});
	return offline.startRendering();
}
