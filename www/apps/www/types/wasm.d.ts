declare module "@zeyaddeeb/wasm" {
	export default function init(): Promise<unknown>;

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
		free(): void;
		process(samples: Float32Array): Float32Array;
		get_frequency_bins(samples: Float32Array, numBins: number): Float32Array;
		normalize_for_visualization(
			data: Float32Array,
			minDb: number,
			maxDb: number,
		): Float32Array;
	}

	export class HyperbolicTiling {
		private constructor();
		// biome-ignore lint/suspicious/noMisleadingInstantiator: mirrors the wasm-bindgen generated constructor
		static new(
			p: number,
			q: number,
			maxTiles: number,
			minSize: number,
		): HyperbolicTiling;
		free(): void;
		tile_count(): number;
		polygon_sides(): number;
		points_per_tile(): number;
		boundary_points_per_tile(): number;
		points_per_blade(): number;
		get_meta(): Uint32Array;
		get_base_vertices(): Float64Array;
		transform_vertices(
			aRe: number,
			aIm: number,
			bRe: number,
			bIm: number,
		): Float64Array;
	}

	export class LifeUniverse {
		private constructor();
		// biome-ignore lint/suspicious/noMisleadingInstantiator: mirrors the wasm-bindgen generated constructor
		static new(width: number, height: number): LifeUniverse;
		free(): void;
		width(): number;
		height(): number;
		cells_ptr(): number;
		ages_ptr(): number;
		get_cells(): Uint8Array;
		get_ages(): Uint8Array;
		tick(): void;
		toggle_cell(row: number, col: number): void;
		set_cell(row: number, col: number, state: number): void;
		clear(): void;
		seed_random(probability: number, seed: number): void;
	}

	export class RgaDocument {
		constructor(siteId: number);
		free(): void;
		insert(position: number, value: string): string;
		delete(position: number): string | undefined;
		apply_remote(opJson: string): void;
		apply_batch(opsJson: string): void;
		export_ops(): string;
		inspect(): string;
		is_empty(): boolean;
		len(): number;
		text(): string;
	}

	export enum Pulse {
		Coast = 0,
		Plus = 1,
		Minus = 2,
	}

	export class Aacs {
		constructor(deadband: number);
		free(): void;
		step(dt: number): Pulse;
		nudge(rate: number): void;
		signal_db(): number;
		set_deadband(deadband: number): void;
		error(): number;
		rate(): number;
		pulses(): number;
	}

	export class Fds {
		constructor();
		free(): void;
		fail(): void;
		relocate(routine: number, base: number): number;
		healthy(): boolean;
		frame(watts: number, nanotesla: number): Uint16Array;
		peek(word: number): number;
		owners(): Uint8Array;
		base(routine: number): number;
	}

	export function beamwidth(): number;
	export function kick(): number;
	export function routine_count(): number;
	export function routine_name(routine: number): string;
	export function routine_len(routine: number): number;
	export function calls(): Uint32Array;
	export function command_bits(opcode: number, operand: number): Uint8Array;
}
