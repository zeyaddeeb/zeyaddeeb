"use client";

import {
	type MouseEvent,
	useCallback,
	useEffect,
	useId,
	useReducer,
	useRef,
	useState,
} from "react";
import { useShouldRun } from "@/lib/hooks/use-animation-activity";
import { Link } from "./link";
import {
	asleep,
	busy,
	type Heard,
	type Line,
	more,
	type Phase,
	type Piece,
	percent,
	step,
} from "./piece";
import { RECORDED } from "./recorded";
import { Strata } from "./strata";
import { kept, mark, spoken } from "./words";
import "./semblance.css";
import "./phone.css";

const TAP_MS = 400;
const STEP_MS = 1300;
const REST_STEPS = 4;
const TAIL_MS = 250;
const SLOTS = 37;
const TAKE_SECONDS = 8;

const SUGGESTION = "I am the master of my fate, I am the captain of my soul.";

const LINES: { line: Line; label: string }[] = [
	{ line: "clear", label: "Direct" },
	{ line: "patchy", label: "Patchy" },
	{ line: "storm", label: "Storm" },
];

const ENDINGS = {
	batch: "Go on, or hold the disc and say something else.",
	limit: "That is as far as one run goes.",
	silence: "It heard nothing in its own recording, so the run is over.",
	stopped: "Stopped.",
};

const ACTION: Record<Phase, string> = {
	asleep: "Turn on the microphone",
	closed: "Try the microphone again",
	waking: "Connecting",
	ready: "Hold to speak",
	rested: "Hold to speak",
	listening: "Let go to send",
	sent: "Sending",
	running: "Stop",
};

const LABEL: Record<Phase, string> = {
	...ACTION,
	asleep: "Microphone off",
	closed: "Try again",
};

const linked = (phase: Phase) =>
	phase !== "asleep" && phase !== "closed" && phase !== "waking";

const armed = (piece: Piece) => linked(piece.phase) && piece.microphone;

function cue(piece: Piece) {
	if (piece.notice) return piece.notice;

	switch (piece.phase) {
		case "asleep":
			return "A recorded run. Turn Sound on to hear it, or press the disc to make yours.";
		case "closed":
			return "The room is closed right now. This run is recorded, without sound.";
		case "waking":
			return "Connecting to the room…";
		case "ready":
			return piece.microphone
				? "Hold the disc and say one sentence."
				: "A recorded run. Press the disc to make your own.";
		case "listening":
			return "Listening. Let go when you are done.";
		case "sent":
			return piece.ahead
				? `Waiting for the room. ${piece.ahead} ahead of you.`
				: "Sent.";
		case "running":
			return `Making generation ${piece.generations.length}.`;
		case "rested":
			return piece.ending ? ENDINGS[piece.ending] : "";
	}
}

function refusal(error: unknown) {
	if (error instanceof DOMException && error.name === "NotAllowedError")
		return "Microphone blocked. Allow it from the address bar, then press the disc.";

	if (error instanceof DOMException && error.name === "NotFoundError")
		return "No microphone was found.";

	return error instanceof Error && error.message
		? error.message
		: "The room did not answer.";
}

export function SemblanceLab() {
	const [piece, move] = useReducer(step, asleep);
	const [line, setLine] = useState<Line>("clear");
	const [sound, setSound] = useState(false);
	const [browsed, setBrowsed] = useState(0);
	const [touched, setTouched] = useState(false);
	const stage = useRef<HTMLDivElement>(null);
	const moving = useShouldRun(stage);
	const link = useRef<Link | null>(null);
	const audio = useRef<HTMLAudioElement>(null);
	const disc = useRef<HTMLButtonElement>(null);
	const pressed = useRef(0);
	const now = useRef(piece);

	now.current = piece;

	const made = piece.generations.length > 0;
	const prompting =
		piece.phase === "listening" ||
		piece.phase === "sent" ||
		(armed(piece) && !made);
	const still = !made && !prompting;
	const generations = prompting ? [] : made ? piece.generations : RECORDED;
	const cursor = made ? piece.cursor : Math.min(browsed, RECORDED.length - 1);
	const shown = generations[cursor];
	const recorded = still || (made && piece.recorded);
	const original = generations[1]?.text ?? "";
	const words = shown
		? mark(original, shown.index ? shown.text : original)
		: mark(SUGGESTION, SUGGESTION);
	const total = shown ? spoken(original).length : 0;
	const length = words.reduce((sum, word) => sum + word.text.length + 1, 0);

	useEffect(() => () => link.current?.close(), []);

	useEffect(() => {
		if (!still || touched || !moving) return;

		const rest = RECORDED.length + REST_STEPS;
		const walk = window.setInterval(
			() => setBrowsed((index) => (index + 1) % rest),
			STEP_MS,
		);

		return () => window.clearInterval(walk);
	}, [still, touched, moving]);

	useEffect(() => {
		if (audio.current) audio.current.muted = !sound;

		link.current?.quiet(!sound);
	}, [sound]);

	useEffect(() => {
		if (piece.phase !== "listening") return;

		let frame = 0;
		const tick = () => {
			const level = Math.min(1, (link.current?.level() ?? 0) * 6);

			disc.current?.style.setProperty("--sb-level", level.toFixed(3));
			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(frame);
			disc.current?.style.setProperty("--sb-level", "0");
		};
	}, [piece.phase]);

	const wake = useCallback(async (speaking: boolean) => {
		move({ type: "wake" });
		setSound(true);
		link.current?.close();

		const hear = (heard: Heard) => {
			move(heard);

			if (heard.type === "house") opened.play(0, true);
		};
		const opened = new Link(hear, (notice) => move({ type: "close", notice }));

		link.current = opened;

		try {
			const { limits, stream } = await opened.open(speaking);

			if (audio.current) {
				audio.current.srcObject = stream;
				audio.current.play().catch(() => {});
			}

			move({ type: "open", limits, microphone: speaking });

			if (!speaking) opened.house();
		} catch (error) {
			opened.close();
			move({ type: "close", notice: refusal(error) });
		}
	}, []);

	const send = useCallback(() => {
		if (now.current.phase !== "listening") return;

		move({ type: "send" });
		window.setTimeout(() => link.current?.begin(line), TAIL_MS);
	}, [line]);

	useEffect(() => {
		if (piece.phase !== "listening") return;

		const seconds = piece.limits?.takeSeconds ?? TAKE_SECONDS;
		const timer = window.setTimeout(send, seconds * 1000);

		return () => window.clearTimeout(timer);
	}, [piece.phase, piece.limits, send]);

	const press = () => {
		const { phase } = now.current;

		if (phase === "listening") return send();
		if (phase === "running") return link.current?.stop();
		if (busy(now.current)) return;
		if (!armed(now.current)) return wake(true);

		pressed.current = performance.now();
		move({ type: "listen" });
		link.current?.listen();
	};

	const release = () => {
		if (performance.now() - pressed.current > TAP_MS) send();
	};

	const typed = (event: MouseEvent) => {
		if (event.detail === 0) press();
	};

	const point = (index: number) => {
		if (!made) {
			setTouched(true);
			setBrowsed(index);

			return;
		}

		move({ type: "point", index });

		if (sound) link.current?.play(index);
	};

	const goOn = () => {
		move({ type: "more" });
		link.current?.more();
	};

	const toggle = () => {
		if (!linked(piece.phase)) {
			if (!busy(piece)) wake(false);

			return;
		}

		if (sound) link.current?.hush();
		else if (piece.phase !== "running") link.current?.play(piece.cursor, true);

		setSound(!sound);
	};

	const naming = useId();
	const size = length > 150 ? "small" : length > 80 ? "medium" : "large";
	const taking = piece.limits?.takeSeconds ?? TAKE_SECONDS;
	const off = linked(piece.phase) && !piece.microphone && !busy(piece);

	return (
		<div
			ref={stage}
			className="sb"
			data-phase={piece.phase}
			data-armed={armed(piece) || undefined}
		>
			{/* biome-ignore lint/a11y/useMediaCaption: live speech has no caption track; the text is on the page */}
			<audio ref={audio} autoPlay />

			<p className="sb-count">
				<span className="sb-count__where">
					{shown
						? `${recorded ? "Recorded · " : ""}${shown.index ? `Generation ${shown.index}` : recorded ? "The reader" : "You"}`
						: "Something to say"}
				</span>
				<span className="sb-count__voice">
					{shown ? `Voice ${percent(shown.likeness)}%` : ""}
				</span>
				<span className="sb-count__words">
					{total ? `Words ${kept(words)} of ${total}` : ""}
				</span>
			</p>

			<p className="sb-line" data-size={size} data-quiet={!shown || undefined}>
				{words.map((word, index) => (
					<span
						key={index}
						className={word.yours ? "sb-word" : "sb-word sb-word--lost"}
					>
						{word.text}{" "}
					</span>
				))}
			</p>

			<div className="sb-desk">
				<button
					ref={disc}
					type="button"
					className="sb-disc"
					aria-label={off ? ACTION.asleep : ACTION[piece.phase]}
					aria-pressed={piece.phase === "listening"}
					disabled={piece.phase === "waking" || piece.phase === "sent"}
					onPointerDown={(event) => {
						if (event.button !== 0) return;

						event.currentTarget.setPointerCapture(event.pointerId);
						press();
					}}
					onPointerUp={release}
					onPointerCancel={release}
					onClick={typed}
				>
					<span className="sb-disc__mark" aria-hidden="true" />
				</button>

				<p className="sb-desk__label">
					{off ? LABEL.asleep : LABEL[piece.phase]}
				</p>
				<p className="sb-desk__cue" role="status">
					{cue(piece)}
				</p>
				<span
					className="sb-desk__take"
					style={{ animationDuration: `${taking}s` }}
					aria-hidden="true"
				/>

				<div className="sb-controls">
					<div className="sb-row">
						<span className="sb-row__name" id={naming}>
							Line
						</span>
						{/* biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be a grid row here */}
						<div className="sb-plates" role="group" aria-labelledby={naming}>
							{LINES.map((option) => (
								<button
									key={option.line}
									type="button"
									className="sb-plate"
									aria-pressed={line === option.line}
									disabled={busy(piece)}
									onClick={() => setLine(option.line)}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>

					<div className="sb-row">
						<div className="sb-plates">
							<button
								type="button"
								className="sb-plate"
								disabled={!more(piece) || piece.phase !== "rested"}
								onClick={goOn}
							>
								Go on
							</button>
							<button
								type="button"
								className="sb-plate"
								aria-pressed={sound && linked(piece.phase)}
								disabled={piece.phase === "waking"}
								onClick={toggle}
							>
								Sound
							</button>
						</div>
					</div>
				</div>
			</div>

			<Strata
				generations={generations}
				slots={SLOTS}
				cursor={cursor}
				playing={made ? piece.playing : null}
				recorded={recorded}
				onPoint={point}
			/>
		</div>
	);
}
