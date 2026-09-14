"use client";

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

export function SpeakerDiarizationLab() {
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
		<div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
			<section className="border border-rule bg-charcoal p-5 md:p-6">
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
							This panel stays empty until the backend emits real diarization
							results.
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
							<p className="mt-1 text-lg font-semibold text-white">{value}</p>
						</div>
					))}
				</div>
			</section>

			<aside className="border border-rule bg-charcoal p-5 md:p-6">
				<h2 className="mb-4 text-xl font-semibold">Backend Shape</h2>
				<div className="space-y-4">
					{backendSteps.map((step, index) => (
						<div key={step} className="flex gap-3">
							<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f0b66a]/35 bg-[#271413] font-mono text-xs text-[#f8e8c9]">
								{index + 1}
							</div>
							<p className="text-sm leading-relaxed text-neutral-300">{step}</p>
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
			</aside>
		</div>
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
