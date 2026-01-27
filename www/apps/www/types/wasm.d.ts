declare module "@zeyaddeeb/wasm" {
	export default function init(): Promise<void>;

	export function add(x: number, y: number): number;
	export function hello(name: string): string;
	export function lerp_array(
		current: Float32Array,
		target: Float32Array,
		factor: number,
	): Float32Array;
	export function smooth_frequency_data(
		current: Float32Array,
		previous: Float32Array,
		smoothing: number,
	): Float32Array;

	export class AudioProcessor {
		constructor(fftSize: number);
		process(samples: Float32Array): Float32Array;
		get_frequency_bins(samples: Float32Array, numBins: number): Float32Array;
		normalize_for_visualization(
			data: Float32Array,
			minDb: number,
			maxDb: number,
		): Float32Array;
	}
}
