"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type ConnectionState = "idle" | "signaling" | "listening" | "error";

type SessionResponse = {
	id: string;
	signalingUrl: string;
	modelLoaded: boolean;
};

type ServerMessage =
	| { type: "ready"; session: SessionResponse }
	| { type: "answer"; sdp: string }
	| { type: "iceCandidate"; candidate: string }
	| { type: "trackStarted"; codec: string }
	| { type: "diarization"; result: unknown }
	| { type: "error"; message: string }
	| { type: "pong" };

const backendUrl =
	process.env.NEXT_PUBLIC_DIARIZATION_BACKEND_URL ?? "http://localhost:3003";

const backendSteps = [
	"Browser captures microphone audio and negotiates a WebRTC session.",
	"Rust backend owns signaling, session state, and the incoming audio stream.",
	"Candle prepares audio tensors while ort runs the ONNX embedding model.",
	"The page receives speaker turns and renders a live timeline.",
];

export default function SpeakerDiarizationPage() {
	const [connectionState, setConnectionState] =
		useState<ConnectionState>("idle");
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [modelLoaded, setModelLoaded] = useState(false);
	const [trackCodec, setTrackCodec] = useState<string | null>(null);
	const [turnCount, setTurnCount] = useState(0);
	const [statusMessage, setStatusMessage] = useState("Backend in progress.");
	const peerRef = useRef<RTCPeerConnection | null>(null);
	const socketRef = useRef<WebSocket | null>(null);
	const streamRef = useRef<MediaStream | null>(null);

	const statusLabel = useMemo(() => {
		if (connectionState === "listening") return "Listening";
		if (connectionState === "signaling") return "Signaling";
		if (connectionState === "error") return "Needs Attention";
		return "Idle";
	}, [connectionState]);

	async function startSession() {
		setConnectionState("signaling");
		setStatusMessage("Creating backend session...");

		try {
			const session = await createBackendSession();
			setSessionId(session.id);
			setModelLoaded(session.modelLoaded);
			setStatusMessage(
				session.modelLoaded
					? "Model loaded. Opening WebRTC signaling..."
					: "No ONNX model loaded. WebRTC can connect, but analysis will fail closed.",
			);

			const socket = new WebSocket(session.signalingUrl);
			socketRef.current = socket;

			socket.addEventListener("open", async () => {
				try {
					const stream = await navigator.mediaDevices.getUserMedia({
						audio: {
							echoCancellation: true,
							noiseSuppression: true,
							autoGainControl: true,
						},
					});
					streamRef.current = stream;

					const peer = new RTCPeerConnection({
						iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
					});
					peerRef.current = peer;

					for (const track of stream.getAudioTracks()) {
						peer.addTrack(track, stream);
					}

					peer.addEventListener("icecandidate", (event) => {
						if (!event.candidate || socket.readyState !== WebSocket.OPEN)
							return;
						socket.send(
							JSON.stringify({
								type: "iceCandidate",
								candidate: event.candidate.candidate,
							}),
						);
					});

					peer.addEventListener("connectionstatechange", () => {
						if (peer.connectionState === "connected") {
							setConnectionState("listening");
							setStatusMessage(
								"WebRTC connected. Backend is receiving audio RTP.",
							);
						}
						if (
							peer.connectionState === "failed" ||
							peer.connectionState === "disconnected"
						) {
							setConnectionState("error");
							setStatusMessage(`WebRTC ${peer.connectionState}.`);
						}
					});

					const offer = await peer.createOffer();
					await peer.setLocalDescription(offer);
					socket.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
				} catch (error) {
					setConnectionState("error");
					setStatusMessage(errorMessage(error));
				}
			});

			socket.addEventListener("message", async (event) => {
				const message = JSON.parse(event.data) as ServerMessage;
				if (message.type === "ready") {
					setModelLoaded(message.session.modelLoaded);
				}
				if (message.type === "answer" && peerRef.current) {
					await peerRef.current.setRemoteDescription({
						type: "answer",
						sdp: message.sdp,
					});
					setStatusMessage(
						"Rust answer applied. Waiting for ICE connection...",
					);
				}
				if (message.type === "iceCandidate" && peerRef.current) {
					await peerRef.current.addIceCandidate({
						candidate: message.candidate,
					});
				}
				if (message.type === "trackStarted") {
					setTrackCodec(message.codec);
					setConnectionState("listening");
					setStatusMessage(`Backend received audio track: ${message.codec}.`);
				}
				if (message.type === "diarization") {
					setTurnCount((count) => count + 1);
					setStatusMessage("Received diarization output from the backend.");
				}
				if (message.type === "error") {
					setConnectionState("error");
					setStatusMessage(message.message);
				}
			});

			socket.addEventListener("error", () => {
				setConnectionState("error");
				setStatusMessage(
					"WebSocket signaling failed. Is the Rust backend on :3003?",
				);
			});
		} catch (error) {
			setConnectionState("error");
			setStatusMessage(errorMessage(error));
		}
	}

	function stopSession() {
		socketRef.current?.close();
		peerRef.current?.close();
		streamRef.current?.getTracks().forEach((track) => {
			track.stop();
		});
		socketRef.current = null;
		peerRef.current = null;
		streamRef.current = null;
		setConnectionState("idle");
		setSessionId(null);
		setTrackCodec(null);
		setTurnCount(0);
		setStatusMessage("Stopped. Ready to start a new WebRTC session.");
	}

	return (
		<main className="min-h-screen bg-[#050505] text-white">
			<section className="relative min-h-screen overflow-hidden px-4 pt-24 pb-20 md:px-6 md:pt-32">
				<div
					className="absolute inset-0"
					style={{
						background:
							"linear-gradient(135deg, #101829 0%, #08090c 44%, #271413 100%)",
					}}
				/>
				<div
					className="absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 rounded-full blur-[150px]"
					style={{ backgroundColor: "rgba(95, 139, 173, 0.18)" }}
				/>
				<div
					className="absolute bottom-0 right-0 h-96 w-96 rounded-full blur-[150px]"
					style={{ backgroundColor: "rgba(199, 100, 72, 0.12)" }}
				/>
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.09]"
					style={{
						backgroundImage:
							"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
					}}
				/>

				<div className="relative z-10 mx-auto max-w-6xl">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6 }}
						className="mb-10"
					>
						<Link
							href="/experiments"
							className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white"
						>
							<svg
								className="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<title>Back</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 19l-7-7 7-7"
								/>
							</svg>
							Back to Experiments
						</Link>

						<p className="mb-3 font-mono text-xs uppercase tracking-[0.28em] text-[#9fc0d4]">
							WebRTC · Rust · ort · Candle
						</p>
						<h1
							className="mb-5 max-w-4xl text-[clamp(3rem,9vw,7rem)] font-bold uppercase leading-[0.9] tracking-normal"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							Speaker Diarization Lab
						</h1>
						<p className="max-w-2xl text-base leading-relaxed text-neutral-300 md:text-lg">
							A live-audio experiment for answering the deceptively simple
							question: who spoke when? The backend starts as Rust session and
							signaling infrastructure, with an ort-backed ONNX diarization path
							carved out for voice embeddings and speaker turns.
						</p>
					</motion.div>

					<div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
						<motion.section
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.7, delay: 0.1 }}
							className="rounded-2xl border border-[#5f8bad]/25 bg-neutral-950/55 p-5 shadow-2xl shadow-black/25 backdrop-blur md:p-6"
						>
							<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
										Session
									</p>
									<h2 className="mt-1 text-2xl font-semibold">
										Realtime Speaker Turns
									</h2>
								</div>
								<div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
									<span
										className="h-2 w-2 rounded-full"
										style={{
											backgroundColor:
												connectionState === "listening"
													? "#7f9d6f"
													: connectionState === "signaling"
														? "#f0b66a"
														: connectionState === "error"
															? "#c76448"
															: "#737373",
										}}
									/>
									<span className="text-xs uppercase tracking-[0.18em] text-neutral-300">
										{statusLabel}
									</span>
								</div>
							</div>

							<div className="mb-6 rounded-xl border border-white/10 bg-black/35 p-4">
								<div className="mb-4 flex items-center justify-between gap-4">
									<div className="min-w-0">
										<p className="text-xs text-neutral-500">Session ID</p>
										<p className="truncate font-mono text-sm text-neutral-300">
											{sessionId ?? "not connected"}
										</p>
									</div>
									<button
										type="button"
										onClick={
											connectionState === "idle" || connectionState === "error"
												? startSession
												: stopSession
										}
										className="rounded-lg border border-[#9fc0d4]/35 bg-[#101829] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-[#9fc0d4]/70 hover:bg-[#152033]"
									>
										{connectionState === "idle" || connectionState === "error"
											? "Start"
											: "Stop"}
									</button>
								</div>
								<p className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-300">
									{statusMessage}
								</p>

								<div className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] p-5">
									<p className="text-sm font-medium text-white">
										No speaker turns yet
									</p>
									<p className="mt-2 text-sm leading-relaxed text-neutral-400">
										This panel stays empty until the backend emits real
										diarization results.
									</p>
								</div>
							</div>

							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
								{[
									["Frame", "320ms"],
									["Model", modelLoaded ? "loaded" : "missing"],
									["Track", trackCodec ?? "pending"],
									["Turns", turnCount.toString()],
									["Backend", ":3003"],
								].map(([label, value]) => (
									<div
										key={label}
										className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
									>
										<p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
											{label}
										</p>
										<p className="mt-1 text-lg font-semibold text-white">
											{value}
										</p>
									</div>
								))}
							</div>
						</motion.section>

						<motion.aside
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.7, delay: 0.2 }}
							className="rounded-2xl border border-[#c76448]/25 bg-neutral-950/55 p-5 backdrop-blur md:p-6"
						>
							<h2 className="mb-4 text-xl font-semibold">Backend Shape</h2>
							<div className="space-y-4">
								{backendSteps.map((step, index) => (
									<div key={step} className="flex gap-3">
										<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f0b66a]/35 bg-[#271413] font-mono text-xs text-[#f8e8c9]">
											{index + 1}
										</div>
										<p className="text-sm leading-relaxed text-neutral-300">
											{step}
										</p>
									</div>
								))}
							</div>

							<div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
								<p className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
									Rust endpoints
								</p>
								<div className="space-y-2 font-mono text-xs text-neutral-300">
									<p>POST /sessions</p>
									<p>GET /sessions/:id</p>
									<p>WS /ws/:id</p>
								</div>
							</div>
						</motion.aside>
					</div>
				</div>
			</section>
		</main>
	);
}

async function createBackendSession(): Promise<SessionResponse> {
	const response = await fetch(`${backendUrl}/sessions`, { method: "POST" });
	if (!response.ok) {
		throw new Error(`Backend returned ${response.status}`);
	}
	return response.json() as Promise<SessionResponse>;
}

function errorMessage(error: unknown) {
	if (error instanceof Error) return error.message;
	return "Unknown diarization error.";
}
