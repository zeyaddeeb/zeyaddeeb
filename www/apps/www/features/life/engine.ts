export type LifeBackend = "wasm" | "js";

interface LifeUniverse {
	tick(): void;
	get_cells(): Uint8Array;
	get_ages(): Uint8Array;
	set_cell(row: number, col: number, alive: number): void;
	seed_random(probability: number, seed: number): void;
	free(): void;
}

interface LifeWasm {
	LifeUniverse: { new: (w: number, h: number) => LifeUniverse };
}

export interface LifeStats {
	generation: number;
	population: number;
	peak: number;
	tickMicros: number;
}

const TRAIL = 10;

export class LifeEngine {
	readonly cols: number;
	readonly rows: number;
	cells: Uint8Array;
	ages: Uint8Array;
	trails: Uint8Array;
	generation = 0;
	peak = 0;
	private universe: LifeUniverse | null = null;
	private times: number[] = [];

	constructor(cols: number, rows: number, wasm?: unknown) {
		this.cols = cols;
		this.rows = rows;
		const size = cols * rows;
		this.cells = new Uint8Array(size);
		this.ages = new Uint8Array(size);
		this.trails = new Uint8Array(size);
		const mod = wasm as LifeWasm | undefined;
		if (mod?.LifeUniverse) this.universe = mod.LifeUniverse.new(cols, rows);
	}

	get hasWasm() {
		return this.universe !== null;
	}

	clear() {
		this.cells.fill(0);
		this.ages.fill(0);
		this.trails.fill(0);
		this.generation = 0;
		this.peak = 0;
		this.times = [];
		if (this.universe) {
			for (let r = 0; r < this.rows; r++)
				for (let c = 0; c < this.cols; c++) this.universe.set_cell(r, c, 0);
		}
	}

	seed(probability = 0.18, seed = Math.floor(Math.random() * 1e6)) {
		this.clear();
		let s = seed;
		for (let i = 0; i < this.cells.length; i++) {
			s = (Math.imul(s, 1103515245) + 12345) | 0;
			if ((s & 0x7fffffff) / 2147483647 < probability) {
				this.cells[i] = 1;
				this.ages[i] = 1;
			}
		}
		this.syncToWasm();
	}

	setCell(row: number, col: number, alive: boolean) {
		if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
		const idx = row * this.cols + col;
		const v = alive ? 1 : 0;
		if (this.cells[idx] === v) return;
		this.cells[idx] = v;
		this.ages[idx] = v;
		if (alive) this.trails[idx] = TRAIL;
		this.universe?.set_cell(row, col, v);
	}

	loadPattern(offsets: readonly (readonly [number, number])[]) {
		this.clear();
		const cy = Math.floor(this.rows / 2);
		const cx = Math.floor(this.cols / 2);
		for (const [dy, dx] of offsets) this.setCell(cy + dy, cx + dx, true);
	}

	tick(backend: LifeBackend = "wasm"): number {
		const t0 = performance.now();
		if (backend === "wasm" && this.universe) {
			this.universe.tick();
			this.cells = this.universe.get_cells();
			this.ages = this.universe.get_ages();
		} else {
			this.tickJs();
		}
		const micros = (performance.now() - t0) * 1000;
		this.times.push(micros);
		if (this.times.length > 15) this.times.shift();

		this.generation++;
		const { cells, trails } = this;
		for (let i = 0; i < cells.length; i++) {
			if (cells[i] === 1) trails[i] = TRAIL;
			else if (trails[i] > 0) trails[i]--;
		}
		return micros;
	}

	stats(): LifeStats {
		let population = 0;
		for (let i = 0; i < this.cells.length; i++) population += this.cells[i];
		this.peak = Math.max(this.peak, population);
		const tickMicros = this.times.length
			? this.times.reduce((a, b) => a + b, 0) / this.times.length
			: 0;
		return {
			generation: this.generation,
			population,
			peak: this.peak,
			tickMicros,
		};
	}

	free() {
		this.universe?.free();
		this.universe = null;
	}

	private syncToWasm() {
		if (!this.universe) return;
		for (let r = 0; r < this.rows; r++) {
			const o = r * this.cols;
			for (let c = 0; c < this.cols; c++)
				this.universe.set_cell(r, c, this.cells[o + c]);
		}
	}

	private tickJs() {
		const { cols, rows, cells, ages } = this;
		const next = new Uint8Array(cells.length);
		const nextAges = new Uint8Array(cells.length);
		for (let r = 0; r < rows; r++) {
			const up = (r === 0 ? rows - 1 : r - 1) * cols;
			const mid = r * cols;
			const down = (r === rows - 1 ? 0 : r + 1) * cols;
			for (let c = 0; c < cols; c++) {
				const l = c === 0 ? cols - 1 : c - 1;
				const rt = c === cols - 1 ? 0 : c + 1;
				const n =
					cells[up + l] +
					cells[up + c] +
					cells[up + rt] +
					cells[mid + l] +
					cells[mid + rt] +
					cells[down + l] +
					cells[down + c] +
					cells[down + rt];
				const idx = mid + c;
				const alive = cells[idx] === 1 ? n === 2 || n === 3 : n === 3;
				next[idx] = alive ? 1 : 0;
				nextAges[idx] = alive
					? cells[idx]
						? Math.min(255, ages[idx] + 1)
						: 1
					: 0;
			}
		}
		this.cells = next;
		this.ages = nextAges;
	}
}

export interface LifePalette {
	bg: string;
	grid: string;
	alive: (age: number) => string;
	trail: (fade: number) => string;
}

export const PAPER_PALETTE: LifePalette = {
	bg: "#161615",
	grid: "rgba(243, 239, 229, 0.05)",
	alive: (age) => {
		const t = Math.min(1, age / 24);
		const r = Math.round(243 + (226 - 243) * t);
		const g = Math.round(239 + (163 - 239) * t);
		const b = Math.round(229 + (58 - 229) * t);
		return `rgb(${r}, ${g}, ${b})`;
	},
	trail: (fade) => `rgba(243, 239, 229, ${(fade / TRAIL) * 0.16})`,
};

export interface DrawOptions {
	cellSize: number;
	palette?: LifePalette;
	showGrid?: boolean;
	trails?: boolean;
}

export function drawLife(
	ctx: CanvasRenderingContext2D,
	engine: LifeEngine,
	{
		cellSize,
		palette = PAPER_PALETTE,
		showGrid = false,
		trails = true,
	}: DrawOptions,
) {
	const { cols, rows, cells, ages, trails: tr } = engine;
	const w = cols * cellSize;
	const h = rows * cellSize;
	ctx.fillStyle = palette.bg;
	ctx.fillRect(0, 0, w, h);

	const inset = cellSize > 4 ? 1 : 0;
	for (let r = 0; r < rows; r++) {
		const o = r * cols;
		for (let c = 0; c < cols; c++) {
			const i = o + c;
			if (cells[i] === 1) {
				ctx.fillStyle = palette.alive(ages[i]);
				ctx.fillRect(
					c * cellSize + inset * 0.5,
					r * cellSize + inset * 0.5,
					cellSize - inset,
					cellSize - inset,
				);
			} else if (trails && tr[i] > 0) {
				ctx.fillStyle = palette.trail(tr[i]);
				ctx.fillRect(
					c * cellSize + inset * 0.5,
					r * cellSize + inset * 0.5,
					cellSize - inset,
					cellSize - inset,
				);
			}
		}
	}

	if (showGrid) {
		ctx.strokeStyle = palette.grid;
		ctx.lineWidth = 0.5;
		ctx.beginPath();
		for (let i = 0; i <= cols; i++) {
			ctx.moveTo(i * cellSize, 0);
			ctx.lineTo(i * cellSize, h);
		}
		for (let j = 0; j <= rows; j++) {
			ctx.moveTo(0, j * cellSize);
			ctx.lineTo(w, j * cellSize);
		}
		ctx.stroke();
	}
}
