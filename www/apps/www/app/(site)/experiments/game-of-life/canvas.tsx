"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWasm } from "@/lib/hooks/use-wasm";
import { PRESETS } from "./presets";

type VisualizationTheme =
	| "emerald"
	| "cyberpunk"
	| "sunset"
	| "aurora"
	| "monochrome";
type GridSizePreset = "small" | "medium" | "large" | "xl";

interface SizeConfig {
	width: number;
	height: number;
	cellSize: number;
	label: string;
}

const SIZE_PRESETS: Record<GridSizePreset, SizeConfig> = {
	small: { width: 64, height: 40, cellSize: 11, label: "64x40" },
	medium: { width: 84, height: 52, cellSize: 9, label: "84x52" },
	large: { width: 108, height: 66, cellSize: 7, label: "108x66" },
	xl: { width: 136, height: 84, cellSize: 5, label: "136x84" },
};

const THEMES: Record<
	VisualizationTheme,
	{
		name: string;
		bg: string;
		gridColor: string;
		aliveColor: (age: number) => string;
		trailColor: (fade: number) => string;
		glowColor: string;
	}
> = {
	emerald: {
		name: "Emerald Matrix",
		bg: "rgb(10, 15, 12)",
		gridColor: "rgba(16, 185, 129, 0.05)",
		glowColor: "rgba(16, 185, 129, 0.6)",
		aliveColor: (age) => {
			const intensity = Math.min(100, 40 + age * 12);
			return `hsla(150, 84%, ${intensity}%, 0.95)`;
		},
		trailColor: (fade) => `rgba(16, 185, 129, ${fade * 0.12})`,
	},
	cyberpunk: {
		name: "Cyberpunk Neon",
		bg: "rgb(12, 8, 16)",
		gridColor: "rgba(236, 72, 153, 0.04)",
		glowColor: "rgba(236, 72, 153, 0.6)",
		aliveColor: (age) => {
			const hue = Math.min(320, 260 + age * 8);
			return `hsla(${hue}, 90%, 60%, 0.95)`;
		},
		trailColor: (fade) => `rgba(139, 92, 246, ${fade * 0.12})`,
	},
	sunset: {
		name: "Sol Inferno",
		bg: "rgb(15, 10, 10)",
		gridColor: "rgba(239, 68, 68, 0.04)",
		glowColor: "rgba(239, 68, 68, 0.6)",
		aliveColor: (age) => {
			const hue = Math.max(10, 45 - age * 4);
			return `hsla(${hue}, 95%, 55%, 0.95)`;
		},
		trailColor: (fade) => `rgba(245, 158, 11, ${fade * 0.12})`,
	},
	aurora: {
		name: "Boreal Light",
		bg: "rgb(8, 12, 15)",
		gridColor: "rgba(34, 211, 238, 0.04)",
		glowColor: "rgba(34, 211, 238, 0.6)",
		aliveColor: (age) => {
			const hue = Math.min(180, 120 + age * 6);
			return `hsla(${hue}, 85%, 55%, 0.95)`;
		},
		trailColor: (fade) => `rgba(34, 211, 238, ${fade * 0.12})`,
	},
	monochrome: {
		name: "Carbon Mono",
		bg: "rgb(12, 12, 12)",
		gridColor: "rgba(255, 255, 255, 0.03)",
		glowColor: "rgba(255, 255, 255, 0.4)",
		aliveColor: (age) => {
			const light = Math.min(95, 60 + age * 8);
			return `hsla(0, 0%, ${light}%, 0.95)`;
		},
		trailColor: (fade) => `rgba(255, 255, 255, ${fade * 0.08})`,
	},
};

export default function GameOfLifeCanvas() {
	const { wasm, loading: wasmLoading } = useWasm();

	const [sizePreset, setSizePreset] = useState<GridSizePreset>("medium");
	const config = SIZE_PRESETS[sizePreset];
	const { width: gridWidth, height: gridHeight, cellSize } = config;

	const [isPlaying, setIsPlaying] = useState(false);
	const [engine, setEngine] = useState<"wasm" | "js">("wasm");
	const [theme, setTheme] = useState<VisualizationTheme>("cyberpunk");
	const [speed, setSpeed] = useState<number>(50);
	const [showGrid, setShowGrid] = useState(true);
	const [enableTrail, setEnableTrail] = useState(true);
	const [enableGlow, setEnableGlow] = useState(true);
	const [drawMode, setDrawMode] = useState<"draw" | "erase">("draw");

	const [generation, setGeneration] = useState(0);
	const [population, setPopulation] = useState(0);
	const [peakPopulation, setPeakPopulation] = useState(0);
	const [benchmarkTime, setBenchmarkTime] = useState<number>(0);
	const [fps, setFps] = useState<number>(0);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wasmUniverseRef = useRef<any>(null);

	const cellsRef = useRef<Uint8Array>(new Uint8Array(0));
	const agesRef = useRef<Uint8Array>(new Uint8Array(0));
	const trailsRef = useRef<Uint8Array>(new Uint8Array(0));

	const isMouseDownRef = useRef(false);

	const lastFrameTimeRef = useRef<number>(0);
	const avgBenchmarkTimeRef = useRef<number[]>([]);
	const framesCountRef = useRef<number>(0);
	const lastFpsUpdateRef = useRef<number>(0);

	const initializeGrid = useCallback(
		(randomize = false, probability = 0.15) => {
			const size = gridWidth * gridHeight;
			const cells = new Uint8Array(size);
			const ages = new Uint8Array(size);
			const trails = new Uint8Array(size);

			if (randomize) {
				let seed = Math.floor(Math.random() * 1000000);
				for (let i = 0; i < size; i++) {
					seed = (Math.imul(seed, 1103515245) + 12345) | 0;
					const randVal = (seed & 0x7fffffff) / 2147483647;
					if (randVal < probability) {
						cells[i] = 1;
						ages[i] = 1;
					}
				}
			}

			cellsRef.current = cells;
			agesRef.current = ages;
			trailsRef.current = trails;

			if (wasm && (wasm as any).LifeUniverse) {
				if (wasmUniverseRef.current) {
					wasmUniverseRef.current.free();
				}
				const uni = (wasm as any).LifeUniverse.new(gridWidth, gridHeight);
				if (randomize) {
					uni.seed_random(probability, Math.floor(Math.random() * 1000000));
				}
				wasmUniverseRef.current = uni;
			}

			setGeneration(0);
			setPeakPopulation(0);
			avgBenchmarkTimeRef.current = [];
			setBenchmarkTime(0);
		},
		[gridWidth, gridHeight, wasm],
	);

	// Initialize on size or WASM load changes
	useEffect(() => {
		initializeGrid(true, 0.18);
		return () => {
			if (wasmUniverseRef.current) {
				wasmUniverseRef.current.free();
				wasmUniverseRef.current = null;
			}
		};
	}, [initializeGrid]);

	const liveNeighborCount = (
		cells: Uint8Array,
		row: number,
		column: number,
	) => {
		let count = 0;
		const row_minus_1 = row === 0 ? gridHeight - 1 : row - 1;
		const row_plus_1 = row === gridHeight - 1 ? 0 : row + 1;
		const col_minus_1 = column === 0 ? gridWidth - 1 : column - 1;
		const col_plus_1 = column === gridWidth - 1 ? 0 : column + 1;

		const rows = [row_minus_1, row, row_plus_1];
		const cols = [col_minus_1, column, col_plus_1];

		for (let i = 0; i < 3; i++) {
			const r = rows[i];
			const rOffset = r * gridWidth;
			for (let j = 0; j < 3; j++) {
				const c = cols[j];
				if (r === row && c === column) {
					continue;
				}
				count += cells[rOffset + c];
			}
		}
		return count;
	};

	const tickJS = useCallback(
		(cells: Uint8Array, ages: Uint8Array) => {
			const size = gridWidth * gridHeight;
			const nextCells = new Uint8Array(size);
			const nextAges = new Uint8Array(size);

			for (let row = 0; row < gridHeight; row++) {
				const rOffset = row * gridWidth;
				for (let col = 0; col < gridWidth; col++) {
					const idx = rOffset + col;
					const cell = cells[idx];
					const neighbors = liveNeighborCount(cells, row, col);

					let nextCell = 0;
					if (cell === 1) {
						if (neighbors === 2 || neighbors === 3) {
							nextCell = 1;
						}
					} else {
						if (neighbors === 3) {
							nextCell = 1;
						}
					}

					nextCells[idx] = nextCell;
					if (nextCell === 1) {
						nextAges[idx] = cell === 1 ? Math.min(255, ages[idx] + 1) : 1;
					} else {
						nextAges[idx] = 0;
					}
				}
			}
			return { cells: nextCells, ages: nextAges };
		},
		[gridWidth, gridHeight],
	);

	const simulationStep = useCallback(() => {
		const wasmUniverse = wasmUniverseRef.current;
		const currentEngine = engine;

		const t0 = performance.now();

		if (currentEngine === "wasm" && wasmUniverse && wasm) {
			wasmUniverse.tick();
			cellsRef.current = wasmUniverse.get_cells();
			agesRef.current = wasmUniverse.get_ages();
		} else {
			const { cells, ages } = tickJS(cellsRef.current, agesRef.current);
			cellsRef.current = cells;
			agesRef.current = ages;
		}

		const t1 = performance.now();
		const durationMicroseconds = (t1 - t0) * 1000;

		const times = avgBenchmarkTimeRef.current;
		times.push(durationMicroseconds);
		if (times.length > 15) times.shift();
		const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
		setBenchmarkTime(avgTime);

		setGeneration((g) => g + 1);

		const size = gridWidth * gridHeight;
		const cells = cellsRef.current;
		const trails = trailsRef.current;
		for (let i = 0; i < size; i++) {
			if (cells[i] === 1) {
				trails[i] = 10;
			} else if (trails[i] > 0) {
				trails[i]--;
			}
		}

		framesCountRef.current++;
	}, [engine, tickJS, wasm, gridWidth, gridHeight]);

	const renderCanvas = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const currentTheme = THEMES[theme];
		const cells = cellsRef.current;
		const ages = agesRef.current;
		const trails = trailsRef.current;

		const displayWidth = gridWidth * cellSize;
		const displayHeight = gridHeight * cellSize;

		ctx.fillStyle = currentTheme.bg;
		ctx.fillRect(0, 0, displayWidth, displayHeight);

		if (enableGlow) {
			ctx.shadowColor = currentTheme.glowColor;
			ctx.shadowBlur = cellSize * 1.5;
		} else {
			ctx.shadowBlur = 0;
		}

		for (let row = 0; row < gridHeight; row++) {
			const rOffset = row * gridWidth;
			for (let col = 0; col < gridWidth; col++) {
				const idx = rOffset + col;
				const isAlive = cells[idx] === 1;

				if (isAlive) {
					ctx.fillStyle = currentTheme.aliveColor(ages[idx]);
					ctx.fillRect(
						col * cellSize + 0.5,
						row * cellSize + 0.5,
						cellSize - 1,
						cellSize - 1,
					);
				} else if (enableTrail && trails[idx] > 0) {
					ctx.shadowBlur = 0; // Turn off glow for trail performance
					ctx.fillStyle = currentTheme.trailColor(trails[idx]);
					ctx.fillRect(
						col * cellSize + 0.5,
						row * cellSize + 0.5,
						cellSize - 1,
						cellSize - 1,
					);
					if (enableGlow) {
						ctx.shadowColor = currentTheme.glowColor;
						ctx.shadowBlur = cellSize * 1.5;
					}
				}
			}
		}

		if (showGrid) {
			ctx.shadowBlur = 0;
			ctx.strokeStyle = currentTheme.gridColor;
			ctx.lineWidth = 0.5;

			ctx.beginPath();
			for (let i = 0; i <= gridWidth; i++) {
				ctx.moveTo(i * cellSize, 0);
				ctx.lineTo(i * cellSize, displayHeight);
			}
			for (let j = 0; j <= gridHeight; j++) {
				ctx.moveTo(0, j * cellSize);
				ctx.lineTo(displayWidth, j * cellSize);
			}
			ctx.stroke();
		}

		let currentPopulation = 0;
		for (let i = 0; i < cells.length; i++) {
			if (cells[i] === 1) currentPopulation++;
		}
		setPopulation(currentPopulation);
		setPeakPopulation((p) => Math.max(p, currentPopulation));
	}, [
		gridWidth,
		gridHeight,
		cellSize,
		theme,
		showGrid,
		enableTrail,
		enableGlow,
	]);

	useEffect(() => {
		let animationId: number;

		const loop = (timestamp: number) => {
			if (isPlaying) {
				const timeSinceLastFrame = timestamp - lastFrameTimeRef.current;
				const targetInterval = speed; // Delay in MS

				if (timeSinceLastFrame >= targetInterval) {
					simulationStep();
					lastFrameTimeRef.current = timestamp;
				}
			}

			renderCanvas();
			animationId = requestAnimationFrame(loop);
		};

		animationId = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(animationId);
		};
	}, [isPlaying, speed, simulationStep, renderCanvas]);

	useEffect(() => {
		lastFpsUpdateRef.current = performance.now();
		framesCountRef.current = 0;

		const fpsInterval = setInterval(() => {
			const now = performance.now();
			const elapsed = now - lastFpsUpdateRef.current;
			if (elapsed > 0) {
				const currentFps = Math.round(
					(framesCountRef.current * 1000) / elapsed,
				);
				setFps(currentFps);
				framesCountRef.current = 0;
				lastFpsUpdateRef.current = now;
			}
		}, 1000);

		return () => clearInterval(fpsInterval);
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const dpr = window.devicePixelRatio || 1;
		const displayWidth = gridWidth * cellSize;
		const displayHeight = gridHeight * cellSize;

		canvas.width = displayWidth * dpr;
		canvas.height = displayHeight * dpr;
		canvas.style.width = `${displayWidth}px`;
		canvas.style.height = `${displayHeight}px`;

		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		renderCanvas();
	}, [gridWidth, gridHeight, cellSize, renderCanvas]);

	const handleCanvasInteraction = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (!canvas) return;

			const rect = canvas.getBoundingClientRect();
			const clientX = e.clientX;
			const clientY = e.clientY;

			const canvasX = clientX - rect.left;
			const canvasY = clientY - rect.top;

			const col = Math.floor(canvasX / cellSize);
			const row = Math.floor(canvasY / cellSize);

			if (col >= 0 && col < gridWidth && row >= 0 && row < gridHeight) {
				const idx = row * gridWidth + col;
				const targetState = drawMode === "draw" ? 1 : 0;

				const cells = cellsRef.current;
				const ages = agesRef.current;
				const trails = trailsRef.current;

				if (cells[idx] !== targetState) {
					cells[idx] = targetState;
					ages[idx] = targetState;
					if (targetState === 1) {
						trails[idx] = 10;
					}
					const wasmUniverse = wasmUniverseRef.current;
					if (wasmUniverse && wasm) {
						wasmUniverse.set_cell(row, col, targetState);
					}
					renderCanvas();
				}
			}
		},
		[cellSize, gridWidth, gridHeight, drawMode, wasm, renderCanvas],
	);

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (e.button === 0) {
			isMouseDownRef.current = true;
			handleCanvasInteraction(e);
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isMouseDownRef.current) {
			handleCanvasInteraction(e);
		}
	};

	const handleMouseUp = () => {
		isMouseDownRef.current = false;
	};

	const handleMouseLeave = () => {
		isMouseDownRef.current = false;
	};

	const loadPreset = (presetName: string) => {
		const preset = PRESETS[presetName];
		if (!preset) return;

		initializeGrid(false);

		const centerX = Math.floor(gridWidth / 2);
		const centerY = Math.floor(gridHeight / 2);

		const cells = cellsRef.current;
		const ages = agesRef.current;
		const trails = trailsRef.current;
		const wasmUniverse = wasmUniverseRef.current;

		preset.cells.forEach(([dy, dx]) => {
			const r = centerY + dy;
			const c = centerX + dx;

			if (r >= 0 && r < gridHeight && c >= 0 && c < gridWidth) {
				const idx = r * gridWidth + c;
				cells[idx] = 1;
				ages[idx] = 1;
				trails[idx] = 10;

				if (wasmUniverse && wasm) {
					wasmUniverse.set_cell(r, c, 1);
				}
			}
		});

		renderCanvas();
	};

	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
			<div className="flex-1 flex flex-col items-center select-none lg:self-start">
				<div
					className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-2xl transition-all duration-300"
					style={{ backgroundColor: THEMES[theme].bg }}
				>
					<canvas
						ref={canvasRef}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseLeave}
						className="block cursor-crosshair rounded-xl"
					/>
				</div>

				<div className="mt-4 flex w-full max-w-2xl flex-wrap justify-between items-center gap-4 text-xs font-mono text-neutral-400">
					<div className="flex gap-4">
						<span>
							FPS: <strong className="text-white">{fps}</strong>
						</span>
						<span>
							Tick Time:{" "}
							<strong className="text-white">
								{benchmarkTime.toFixed(0)}μs
							</strong>
						</span>
					</div>
					<div className="flex gap-4">
						<span>
							Engine:{" "}
							<strong className="uppercase text-violet-400">{engine}</strong>
						</span>
						<span>
							Grid:{" "}
							<strong className="text-white">
								{gridWidth}x{gridHeight}
							</strong>
						</span>
					</div>
				</div>
			</div>

			<div className="w-full shrink-0 space-y-5 lg:sticky lg:top-24 lg:w-80 lg:self-start">
				<div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 backdrop-blur-xl">
					<h3 className="mb-4 text-sm font-semibold tracking-wider uppercase text-neutral-400">
						Engine Benchmark
					</h3>

					<div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-950/60 p-1">
						<button
							type="button"
							onClick={() => setEngine("wasm")}
							disabled={wasmLoading}
							className={`rounded-lg py-2 text-xs font-mono font-medium transition-colors ${
								engine === "wasm"
									? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
									: "text-neutral-500 hover:text-white"
							}`}
						>
							WASM (Rust)
						</button>
						<button
							type="button"
							onClick={() => setEngine("js")}
							className={`rounded-lg py-2 text-xs font-mono font-medium transition-colors ${
								engine === "js"
									? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
									: "text-neutral-500 hover:text-white"
							}`}
						>
							JS (Standard)
						</button>
					</div>

					<div className="mt-4 space-y-2 text-xs font-mono">
						<div className="flex justify-between border-b border-neutral-800 pb-2">
							<span className="text-neutral-500">Tick Compute:</span>
							<span
								className={
									engine === "wasm" ? "text-violet-400" : "text-amber-400"
								}
							>
								{benchmarkTime.toFixed(1)} μs
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-neutral-500">Approx. Ratio:</span>
							<span className="text-emerald-400 font-bold">
								{engine === "wasm"
									? "Fast / Low Overhead"
									: "Slower Calculations"}
							</span>
						</div>
					</div>
				</div>

				<div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 backdrop-blur-xl space-y-4">
					<h3 className="text-sm font-semibold tracking-wider uppercase text-neutral-400">
						Simulation
					</h3>

					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setIsPlaying(!isPlaying)}
							className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-all shadow-md ${
								isPlaying
									? "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
									: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
							}`}
						>
							{isPlaying ? "Pause" : "Play"}
						</button>
						<button
							type="button"
							onClick={simulationStep}
							disabled={isPlaying}
							className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
						>
							Step
						</button>
					</div>

					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => initializeGrid(true, 0.18)}
							className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/60 py-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
						>
							Randomize
						</button>
						<button
							type="button"
							onClick={() => initializeGrid(false)}
							className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/60 py-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
						>
							Clear Grid
						</button>
					</div>

					<div className="flex gap-2 items-center justify-between border-t border-neutral-800 pt-3">
						<span className="text-xs text-neutral-400">Paint Mode:</span>
						<div className="flex rounded-lg bg-neutral-950 p-0.5">
							<button
								type="button"
								onClick={() => setDrawMode("draw")}
								className={`rounded-md px-3 py-1 text-2xs uppercase tracking-wider font-bold transition-all ${
									drawMode === "draw"
										? "bg-neutral-800 text-violet-400"
										: "text-neutral-500 hover:text-neutral-300"
								}`}
							>
								Draw
							</button>
							<button
								type="button"
								onClick={() => setDrawMode("erase")}
								className={`rounded-md px-3 py-1 text-2xs uppercase tracking-wider font-bold transition-all ${
									drawMode === "erase"
										? "bg-neutral-800 text-red-400"
										: "text-neutral-500 hover:text-neutral-300"
								}`}
							>
								Erase
							</button>
						</div>
					</div>

					<div className="space-y-1.5 border-t border-neutral-800 pt-3">
						<div className="flex justify-between text-xs text-neutral-400">
							<span>Tick Delay:</span>
							<span className="font-mono text-white">
								{speed === 0 ? "No Delay" : `${speed}ms`}
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="300"
							step="10"
							value={speed}
							onChange={(e) => setSpeed(parseInt(e.target.value))}
							className="w-full accent-violet-500"
						/>
					</div>
				</div>

				<div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 backdrop-blur-xl">
					<h3 className="mb-3 text-sm font-semibold tracking-wider uppercase text-neutral-400">
						Presets
					</h3>
					<div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1 no-scrollbar">
						{Object.entries(PRESETS).map(([key, preset]) => (
							<button
								key={key}
								type="button"
								onClick={() => loadPreset(key)}
								className="flex flex-col text-left rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900 hover:border-neutral-700 transition-all group"
							>
								<span className="text-xs font-semibold text-white group-hover:text-violet-400 transition-colors">
									{preset.name}
								</span>
								<span className="mt-1 text-3xs text-neutral-500 line-clamp-2">
									{preset.description}
								</span>
							</button>
						))}
					</div>
				</div>

				<div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 backdrop-blur-xl space-y-4">
					<h3 className="text-sm font-semibold tracking-wider uppercase text-neutral-400">
						Appearance
					</h3>

					<div className="space-y-1.5">
						<span className="text-xs text-neutral-400">Color Palette:</span>
						<select
							value={theme}
							onChange={(e) => setTheme(e.target.value as VisualizationTheme)}
							className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
						>
							{Object.entries(THEMES).map(([key, t]) => (
								<option key={key} value={key}>
									{t.name}
								</option>
							))}
						</select>
					</div>

					<div className="space-y-1.5 border-t border-neutral-800 pt-3">
						<span className="text-xs text-neutral-400">Grid Resolution:</span>
						<div className="grid grid-cols-2 gap-1.5 rounded-lg bg-neutral-950 p-1.5">
							{(["small", "medium", "large", "xl"] as const).map((size) => (
								<button
									key={size}
									type="button"
									onClick={() => setSizePreset(size)}
									disabled={isPlaying}
									className={`rounded-md px-2 py-1.5 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
										sizePreset === size
											? "bg-neutral-800 text-violet-300"
											: "text-neutral-500 hover:text-neutral-300"
									}`}
								>
									<div className="flex flex-col leading-tight">
										<span className="text-[10px] uppercase tracking-[0.08em] font-semibold">
											{size}
										</span>
										<span className="mt-0.5 text-[9px] text-neutral-500">
											{SIZE_PRESETS[size].label}
										</span>
									</div>
								</button>
							))}
						</div>
					</div>

					<div className="space-y-2 border-t border-neutral-800 pt-3">
						<label className="flex items-center gap-3 text-xs text-neutral-300 cursor-pointer">
							<input
								type="checkbox"
								checked={showGrid}
								onChange={(e) => setShowGrid(e.target.checked)}
								className="rounded border-neutral-700 bg-neutral-950 text-violet-500 focus:ring-0 accent-violet-500"
							/>
							<span>Draw Grid Lines</span>
						</label>
						<label className="flex items-center gap-3 text-xs text-neutral-300 cursor-pointer">
							<input
								type="checkbox"
								checked={enableTrail}
								onChange={(e) => setEnableTrail(e.target.checked)}
								className="rounded border-neutral-700 bg-neutral-950 text-violet-500 focus:ring-0 accent-violet-500"
							/>
							<span>Decay Trails (Age Afterglow)</span>
						</label>
						<label className="flex items-center gap-3 text-xs text-neutral-300 cursor-pointer">
							<input
								type="checkbox"
								checked={enableGlow}
								onChange={(e) => setEnableGlow(e.target.checked)}
								className="rounded border-neutral-700 bg-neutral-950 text-violet-500 focus:ring-0 accent-violet-500"
							/>
							<span>Cyber Neon Glow</span>
						</label>
					</div>
				</div>

				<div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 backdrop-blur-xl">
					<h3 className="mb-3 text-sm font-semibold tracking-wider uppercase text-neutral-400">
						Simulation Statistics
					</h3>
					<div className="grid grid-cols-2 gap-3 text-center">
						<div className="rounded-xl bg-neutral-950/40 p-2.5 border border-neutral-800">
							<span className="block text-[10px] font-mono uppercase tracking-[0.14em] text-neutral-500">
								Generation
							</span>
							<span className="mt-1 block text-base font-semibold text-white font-mono">
								{generation}
							</span>
						</div>
						<div className="rounded-xl bg-neutral-950/40 p-2.5 border border-neutral-800">
							<span className="block text-[10px] font-mono uppercase tracking-[0.14em] text-neutral-500">
								Population
							</span>
							<span className="mt-1 block text-base font-semibold text-violet-400 font-mono">
								{population}
							</span>
						</div>
						<div className="rounded-xl bg-neutral-950/40 p-2.5 border border-neutral-800 col-span-2">
							<span className="block text-[10px] font-mono uppercase tracking-[0.14em] text-neutral-500">
								Peak Population
							</span>
							<span className="mt-1 block text-base font-semibold text-emerald-400 font-mono">
								{peakPopulation}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
