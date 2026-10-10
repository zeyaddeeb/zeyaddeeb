import type { Heard, Limits, Line } from "./piece";
import { pack, Speaker } from "./speaker";

const LOCAL = "http://localhost:3003";
const PING_MS = 20_000;
const MEDIA_WAIT_MS = 8_000;
const CHUNK_SECONDS = 0.1;
const TAP = "/semblance/tap.js";

interface Session {
	id: string;
	signalingUrl: string;
	calls: boolean;
	limits: Limits;
}

type Said =
	| Heard
	| { type: "ready"; session: Session }
	| { type: "answer"; sdp: string }
	| { type: "iceCandidate"; candidate: string }
	| { type: "listening" }
	| { type: "pong" };

export function voiceBase(): string {
	const configured = process.env.NEXT_PUBLIC_VOICE_URL?.trim();

	if (configured) return configured.replace(/\/+$/, "");

	const { protocol, hostname } = window.location;
	const local =
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname.endsWith(".local");

	return local ? LOCAL : `${protocol}//voice.${hostname.replace(/^www\./, "")}`;
}

const socketUrl = (base: string, path: string) =>
	`${base.replace(/^http/, "ws")}${path}`;

export interface Opened {
	limits: Limits;
	stream: MediaStream | null;
}

export class Link {
	private socket: WebSocket | null = null;
	private peer: RTCPeerConnection | null = null;
	private microphone: MediaStream | null = null;
	private audio: AudioContext | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private meter: AnalyserNode | null = null;
	private speaker: Speaker | null = null;
	private calls = false;
	private sending = false;
	private waiting: Float32Array[] = [];
	private held = 0;
	private ping = 0;
	private samples = new Float32Array(1024);

	constructor(
		private readonly onHeard: (heard: Heard) => void,
		private readonly onLost: (why: string) => void,
	) {}

	async open(speaking: boolean): Promise<Opened> {
		this.audio = new AudioContext();
		this.speaker = new Speaker();

		if (speaking) {
			this.microphone = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: true,
				},
			});
			this.mute(true);
			this.watch(this.audio, this.microphone);
		}

		const base = voiceBase();
		const response = await fetch(`${base}/sessions`, { method: "POST" });

		if (!response.ok) throw new Error("The room is full right now.");

		const session = (await response.json()) as Session;

		this.calls = session.calls;

		const stream = await this.join(base, session);

		this.ping = window.setInterval(() => this.send({ type: "ping" }), PING_MS);

		return { limits: session.limits, stream };
	}

	private watch(audio: AudioContext, microphone: MediaStream) {
		const meter = audio.createAnalyser();

		meter.fftSize = 1024;
		this.source = audio.createMediaStreamSource(microphone);
		this.source.connect(meter);
		this.meter = meter;
	}

	private async tap() {
		if (!this.audio || !this.source) return;

		await this.audio.audioWorklet.addModule(TAP);

		const tap = new AudioWorkletNode(this.audio, "tap", {
			numberOfInputs: 1,
			numberOfOutputs: 0,
		});

		tap.port.onmessage = (event) => this.collect(event.data as Float32Array);
		this.source.connect(tap);
	}

	private collect(chunk: Float32Array) {
		if (!this.sending || !this.audio) return;

		this.waiting.push(chunk);
		this.held += chunk.length;

		if (this.held >= this.audio.sampleRate * CHUNK_SECONDS) this.flush();
	}

	private flush() {
		if (this.held && this.socket?.readyState === WebSocket.OPEN)
			this.socket.send(pack(this.waiting).buffer);

		this.waiting = [];
		this.held = 0;
	}

	private join(base: string, session: Session) {
		return new Promise<MediaStream | null>((resolve, reject) => {
			const socket = new WebSocket(socketUrl(base, session.signalingUrl));

			socket.binaryType = "arraybuffer";
			this.socket = socket;

			socket.onmessage = (event) => {
				if (typeof event.data !== "string")
					return this.speaker?.play(event.data as ArrayBuffer);

				const said = JSON.parse(event.data) as Said;

				if (said.type !== "ready") return this.receive(said).catch(reject);

				(this.calls ? this.call(reject) : this.tap().then(() => null))
					.then(resolve)
					.catch(reject);
			};
			socket.onerror = () => reject(new Error("The room did not answer."));
			socket.onclose = () => this.onLost("The line closed.");
		});
	}

	private async call(reject: (why: Error) => void) {
		const peer = new RTCPeerConnection();
		const heard = new MediaStream();
		const connected = new Promise<MediaStream>((resolve) => {
			const late = window.setTimeout(
				() => reject(new Error("The sound link did not connect.")),
				MEDIA_WAIT_MS,
			);

			peer.onconnectionstatechange = () => {
				if (peer.connectionState === "connected") {
					window.clearTimeout(late);
					resolve(heard);
				}

				if (peer.connectionState === "failed")
					this.onLost("The sound link dropped.");
			};
		});

		this.peer = peer;

		if (this.microphone)
			for (const track of this.microphone.getTracks())
				peer.addTrack(track, this.microphone);
		else peer.addTransceiver("audio", { direction: "recvonly" });

		peer.ontrack = (event) => heard.addTrack(event.track);
		peer.onicecandidate = (event) => {
			if (event.candidate)
				this.send({
					type: "iceCandidate",
					candidate: event.candidate.candidate,
				});
		};

		const offer = await peer.createOffer();

		await peer.setLocalDescription(offer);
		this.send({ type: "offer", sdp: offer.sdp });

		return connected;
	}

	private async receive(said: Exclude<Said, { type: "ready" }>) {
		switch (said.type) {
			case "answer":
				return this.peer?.setRemoteDescription({
					type: "answer",
					sdp: said.sdp,
				});
			case "iceCandidate":
				return this.peer?.addIceCandidate({
					candidate: said.candidate,
					sdpMid: "0",
					sdpMLineIndex: 0,
				});
			case "listening":
			case "pong":
				return;
			case "playing":
				this.speaker?.resume();

				return this.onHeard(said);
			default:
				this.onHeard(said);
		}
	}

	private send(message: object) {
		if (this.socket?.readyState === WebSocket.OPEN)
			this.socket.send(JSON.stringify(message));
	}

	private mute(muted: boolean) {
		for (const track of this.microphone?.getAudioTracks() ?? [])
			track.enabled = !muted;
	}

	level(): number {
		if (!this.meter) return 0;

		this.meter.getFloatTimeDomainData(this.samples);

		let energy = 0;

		for (const sample of this.samples) energy += sample * sample;

		return Math.sqrt(energy / this.samples.length);
	}

	listen() {
		this.mute(false);
		this.audio?.resume();
		this.speaker?.stop();
		this.send(
			this.calls
				? { type: "listen" }
				: { type: "listen", rate: this.audio?.sampleRate },
		);
		this.sending = true;
	}

	begin(line: Line) {
		this.flush();
		this.sending = false;
		this.mute(true);
		this.send({ type: "begin", line });
	}

	more() {
		this.send({ type: "more" });
	}

	house() {
		this.send({ type: "house" });
	}

	play(generation: number, onward = false) {
		this.speaker?.stop();
		this.send({ type: "play", generation, onward });
	}

	hush() {
		this.speaker?.stop();
		this.send({ type: "hush" });
	}

	quiet(muted: boolean) {
		this.speaker?.quiet(muted);
	}

	stop() {
		this.send({ type: "stop" });
	}

	close() {
		window.clearInterval(this.ping);

		if (this.socket) {
			this.socket.onclose = null;
			this.socket.close();
		}

		this.peer?.close();
		this.audio?.close();
		this.speaker?.close();

		for (const track of this.microphone?.getTracks() ?? []) track.stop();

		this.socket = null;
		this.peer = null;
		this.microphone = null;
		this.source = null;
		this.meter = null;
		this.audio = null;
		this.speaker = null;
	}
}
