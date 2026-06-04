"use client";

import type { AudioProcessor as AudioProcessorType } from "@zeyaddeeb/wasm";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWasm } from "@/lib/hooks/use-wasm";

type VisualizationMode = "bars" | "wave" | "circular" | "particles";

function drawBars(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	data: Float32Array,
) {
	const barWidth = width / data.length;
	const barGap = 2;
	const maxHeight = height * 0.8;

	for (let i = 0; i < data.length; i++) {
		const barHeight = data[i] * maxHeight;
		const x = i * barWidth;
		const y = height - barHeight;

		const gradient = ctx.createLinearGradient(x, y, x, height);
		const hue = (i / data.length) * 60 + 260;
		gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.9)`);
		gradient.addColorStop(1, `hsla(${hue + 30}, 80%, 40%, 0.3)`);

		ctx.fillStyle = gradient;
		ctx.fillRect(x + barGap / 2, y, barWidth - barGap, barHeight);

		ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.5)`;
		ctx.shadowBlur = 15;
		ctx.fillRect(x + barGap / 2, y, barWidth - barGap, barHeight);
		ctx.shadowBlur = 0;
	}
}

function drawWave(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	data: Float32Array,
) {
	const sliceWidth = width / data.length;
	const centerY = height / 2;

	ctx.beginPath();
	ctx.moveTo(0, centerY);

	for (let i = 0; i < data.length; i++) {
		const x = i * sliceWidth;
		const amplitude = data[i] * (height / 3);
		const y = centerY - amplitude;

		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			const prevX = (i - 1) * sliceWidth;
			const cpX = (prevX + x) / 2;
			ctx.quadraticCurveTo(
				prevX,
				centerY - data[i - 1] * (height / 3),
				cpX,
				(centerY - data[i - 1] * (height / 3) + y) / 2,
			);
		}
	}

	ctx.lineTo(width, centerY);
	ctx.lineTo(0, centerY);
	ctx.closePath();

	const gradient = ctx.createLinearGradient(0, 0, width, 0);
	gradient.addColorStop(0, "rgba(139, 92, 246, 0.4)");
	gradient.addColorStop(0.5, "rgba(236, 72, 153, 0.4)");
	gradient.addColorStop(1, "rgba(139, 92, 246, 0.4)");
	ctx.fillStyle = gradient;
	ctx.fill();

	ctx.beginPath();
	for (let i = 0; i < data.length; i++) {
		const x = i * sliceWidth;
		const amplitude = data[i] * (height / 3);
		const y = centerY - amplitude;

		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}

	const lineGradient = ctx.createLinearGradient(0, 0, width, 0);
	lineGradient.addColorStop(0, "rgb(139, 92, 246)");
	lineGradient.addColorStop(0.5, "rgb(236, 72, 153)");
	lineGradient.addColorStop(1, "rgb(139, 92, 246)");
	ctx.strokeStyle = lineGradient;
	ctx.lineWidth = 3;
	ctx.stroke();

	ctx.beginPath();
	for (let i = 0; i < data.length; i++) {
		const x = i * sliceWidth;
		const amplitude = data[i] * (height / 4);
		const y = centerY + amplitude;

		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.strokeStyle = "rgba(139, 92, 246, 0.3)";
	ctx.lineWidth = 2;
	ctx.stroke();
}

function drawCircular(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	data: Float32Array,
) {
	const centerX = width / 2;
	const centerY = height / 2;
	const baseRadius = Math.min(width, height) * 0.2;
	const maxRadius = Math.min(width, height) * 0.4;

	for (let i = 0; i < data.length; i++) {
		const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
		const radius = baseRadius + data[i] * (maxRadius - baseRadius);

		const x1 = centerX + Math.cos(angle) * baseRadius;
		const y1 = centerY + Math.sin(angle) * baseRadius;
		const x2 = centerX + Math.cos(angle) * radius;
		const y2 = centerY + Math.sin(angle) * radius;

		const hue = (i / data.length) * 60 + 260;

		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${0.3 + data[i] * 0.7})`;
		ctx.lineWidth = 4;
		ctx.lineCap = "round";
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(x2, y2, 3 + data[i] * 5, 0, Math.PI * 2);
		ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${0.5 + data[i] * 0.5})`;
		ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.8)`;
		ctx.shadowBlur = 10;
		ctx.fill();
		ctx.shadowBlur = 0;
	}

	const avgIntensity =
		Array.from(data).reduce((a, b) => a + b, 0) / data.length;
	ctx.beginPath();
	ctx.arc(
		centerX,
		centerY,
		baseRadius * 0.8 + avgIntensity * 20,
		0,
		Math.PI * 2,
	);
	const gradient = ctx.createRadialGradient(
		centerX,
		centerY,
		0,
		centerX,
		centerY,
		baseRadius,
	);
	gradient.addColorStop(0, "rgba(139, 92, 246, 0.3)");
	gradient.addColorStop(1, "rgba(139, 92, 246, 0)");
	ctx.fillStyle = gradient;
	ctx.fill();
}

function drawParticles(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	data: Float32Array,
) {
	const centerX = width / 2;
	const centerY = height / 2;
	const time = Date.now() * 0.001;

	for (let i = 0; i < data.length; i++) {
		const intensity = data[i];
		const numParticles = Math.floor(3 + intensity * 10);

		for (let j = 0; j < numParticles; j++) {
			const angle = (i / data.length) * Math.PI * 2 + time + j * 0.5;
			const distance = 50 + intensity * 200 + j * 20;
			const x = centerX + Math.cos(angle) * distance;
			const y = centerY + Math.sin(angle) * distance;
			const size = 2 + intensity * 6;

			const hue = (i / data.length) * 60 + 260;
			ctx.beginPath();
			ctx.arc(x, y, size, 0, Math.PI * 2);
			ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.3 + intensity * 0.5})`;
			ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.8)`;
			ctx.shadowBlur = 15;
			ctx.fill();
		}
	}

	ctx.shadowBlur = 0;

	const avgIntensity =
		Array.from(data).reduce((a, b) => a + b, 0) / data.length;
	const pulseRadius = 30 + avgIntensity * 50 + Math.sin(time * 3) * 10;

	const gradient = ctx.createRadialGradient(
		centerX,
		centerY,
		0,
		centerX,
		centerY,
		pulseRadius,
	);
	gradient.addColorStop(0, `rgba(236, 72, 153, ${0.4 + avgIntensity * 0.4})`);
	gradient.addColorStop(1, "rgba(236, 72, 153, 0)");

	ctx.beginPath();
	ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
	ctx.fillStyle = gradient;
	ctx.fill();
}

export default function AudioVisualizerCanvas() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const audioProcessorRef = useRef<AudioProcessorType | null>(null);
	const animationFrameRef = useRef<number>(0);
	const previousDataRef = useRef<Float32Array | null>(null);

	const { wasm, loading: wasmLoading, error: wasmError } = useWasm();

	const [isListening, setIsListening] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<VisualizationMode>("bars");
	const [sensitivity, setSensitivity] = useState(1.5);
	const [smoothing, setSmoothing] = useState(0.85);

	const wasmLoaded = !!wasm;

	useEffect(() => {
		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}
		};
	}, []);

	const stopListening = useCallback(() => {
		if (animationFrameRef.current) {
			cancelAnimationFrame(animationFrameRef.current);
		}
		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}
		analyserRef.current = null;
		audioProcessorRef.current = null;
		previousDataRef.current = null;
		setIsListening(false);
	}, []);

	const visualize = useCallback(() => {
		const canvas = canvasRef.current;
		const analyser = analyserRef.current;
		const processor = audioProcessorRef.current;

		if (!canvas || !analyser || !processor || !wasm) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const draw = () => {
			animationFrameRef.current = requestAnimationFrame(draw);

			const rect = canvas.getBoundingClientRect();
			const width = rect.width;
			const height = rect.height;

			const timeDomainData = new Float32Array(analyser.fftSize);
			analyser.getFloatTimeDomainData(timeDomainData);

			const numBins =
				mode === "circular" ? 64 : mode === "particles" ? 32 : 128;
			let frequencyBins = processor.get_frequency_bins(timeDomainData, numBins);

			frequencyBins = processor.normalize_for_visualization(
				frequencyBins,
				-100,
				-20,
			);

			if (
				previousDataRef.current &&
				previousDataRef.current.length === frequencyBins.length
			) {
				frequencyBins = wasm.smooth_frequency_data(
					frequencyBins,
					previousDataRef.current,
					smoothing,
				);
			}
			previousDataRef.current = new Float32Array(frequencyBins);

			for (let i = 0; i < frequencyBins.length; i++) {
				frequencyBins[i] = Math.min(1, frequencyBins[i] * sensitivity);
			}

			ctx.fillStyle = "rgb(10, 10, 10)";
			ctx.fillRect(0, 0, width, height);

			switch (mode) {
				case "bars":
					drawBars(ctx, width, height, frequencyBins);
					break;
				case "wave":
					drawWave(ctx, width, height, frequencyBins);
					break;
				case "circular":
					drawCircular(ctx, width, height, frequencyBins);
					break;
				case "particles":
					drawParticles(ctx, width, height, frequencyBins);
					break;
			}
		};

		draw();
	}, [mode, sensitivity, smoothing, wasm]);

	const startListening = useCallback(async () => {
		if (!wasm) {
			setError("WASM module not loaded yet");
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
				},
			});

			const audioContext = new AudioContext();

			if (audioContext.state === "suspended") {
				await audioContext.resume();
			}

			const source = audioContext.createMediaStreamSource(stream);
			const analyser = audioContext.createAnalyser();

			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0;
			source.connect(analyser);

			audioContextRef.current = audioContext;
			analyserRef.current = analyser;

			const processor = new wasm.AudioProcessor(2048);
			audioProcessorRef.current = processor;

			setIsListening(true);
			setError(null);
		} catch (err) {
			if (err instanceof Error) {
				if (err.name === "NotAllowedError") {
					setError(
						"Microphone permission denied. Please allow access and try again.",
					);
				} else if (err.name === "NotFoundError") {
					setError(
						"No microphone found. Please connect a microphone and try again.",
					);
				} else {
					setError(`Microphone error: ${err.message}`);
				}
			} else {
				setError(
					"Could not access microphone. Please grant permission and try again.",
				);
			}
		}
	}, [wasm]);

	useEffect(() => {
		if (isListening && analyserRef.current && audioProcessorRef.current) {
			visualize();
		}
	}, [isListening, visualize]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const updateCanvasSize = () => {
			const rect = canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			canvas.width = rect.width * dpr;
			canvas.height = rect.height * dpr;
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			}
		};

		updateCanvasSize();

		const resizeObserver = new ResizeObserver(() => {
			updateCanvasSize();
		});

		resizeObserver.observe(canvas);
		return () => resizeObserver.disconnect();
	}, []);

	return (
		<div className="space-y-4 md:space-y-6">
			{wasmError && (
				<div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 md:p-4 md:text-base">
					Failed to load audio processor: {wasmError}
				</div>
			)}

			<div className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 md:flex-row md:flex-wrap md:items-center md:p-4">
				<button
					type="button"
					onClick={isListening ? stopListening : startListening}
					disabled={!wasmLoaded || wasmLoading}
					className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-all md:w-auto md:px-6 ${
						isListening
							? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
							: "bg-violet-500/20 text-violet-400 hover:bg-violet-500/30"
					} disabled:cursor-not-allowed disabled:opacity-50`}
				>
					{wasmLoading ? (
						<>
							<svg
								className="h-5 w-5 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<title>Loading</title>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							Loading...
						</>
					) : isListening ? (
						<>
							<svg
								className="h-5 w-5"
								fill="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<title>Stop</title>
								<rect x="6" y="6" width="12" height="12" rx="2" />
							</svg>
							Stop
						</>
					) : (
						<>
							<svg
								className="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<title>Microphone</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
								/>
							</svg>
							Start Microphone
						</>
					)}
				</button>

				<div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
					<span className="text-sm text-neutral-400">Mode:</span>
					<div className="grid grid-cols-4 gap-1 rounded-lg border border-neutral-700 bg-neutral-800/50 p-1 md:flex">
						{(["bars", "wave", "circular", "particles"] as const).map((m) => (
							<button
								type="button"
								key={m}
								onClick={() => setMode(m)}
								className={`rounded-md px-2 py-1.5 text-xs capitalize transition-colors md:px-3 md:text-sm ${
									mode === m
										? "bg-violet-500/30 text-violet-300"
										: "text-neutral-400 hover:text-white"
								}`}
							>
								{m}
							</button>
						))}
					</div>
				</div>

				<div className="flex w-full items-center gap-3 md:w-auto">
					<span className="text-sm text-neutral-400">Sensitivity:</span>
					<input
						type="range"
						min="0.5"
						max="3"
						step="0.1"
						value={sensitivity}
						onChange={(e) => setSensitivity(parseFloat(e.target.value))}
						className="flex-1 accent-violet-500 md:w-24 md:flex-none"
					/>
				</div>

				<div className="flex w-full items-center gap-3 md:w-auto">
					<span className="text-sm text-neutral-400">Smoothing:</span>
					<input
						type="range"
						min="0"
						max="0.95"
						step="0.05"
						value={smoothing}
						onChange={(e) => setSmoothing(parseFloat(e.target.value))}
						className="flex-1 accent-violet-500 md:w-24 md:flex-none"
					/>
				</div>
			</div>

			{error && (
				<div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 md:p-4 md:text-base">
					{error}
				</div>
			)}

			<div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
				<canvas
					ref={canvasRef}
					className="h-80 w-full md:h-125"
					style={{ background: "rgb(10, 10, 10)" }}
				/>

				{!isListening && (
					<div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm">
						<div className="px-4 text-center">
							<div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 md:h-20 md:w-20">
								<svg
									className="h-8 w-8 text-violet-400 md:h-10 md:w-10"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<title>Microphone</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
									/>
								</svg>
							</div>
							<p className="text-base text-neutral-400 md:text-lg">
								Tap &quot;Start Microphone&quot; to begin
							</p>
							<p className="mt-2 text-xs text-neutral-500 md:text-sm">
								Make sure to allow microphone access when prompted
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
