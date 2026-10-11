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
	type Generation,
	type Heard,
	type Line,
	more,
	type Phase,
	type Piece,
	percent,
	step,
	taking,
} from "./piece";
import { RECORDED } from "./recorded";
import { Strata } from "./strata";
import { Tape } from "./tape";
import { kept, mark, spoken } from "./words";
import "./semblance.css";
import "./phone.css";

const TAP_MS = 400;
const STEP_MS = 1300;
const REST_STEPS = 4;
const TAIL_MS = 250;
const TICK_MS = 250;
const LEAD = 3;
const LEAD_MS = 800;
const GAIN = 6;
const SLOTS = 37;
const TAKE_SECONDS = 8;

const SUGGESTION = "I am the master of my fate, I am the captain of my soul.";
const WRITING = "Writing down what it heard…";
const PROMPT = "Read this aloud, or say anything";

const LINES: { line: Line; label: string }[] = [
	{ line: "clear", label: "Direct" },
	{ line: "patchy", label: "Patchy" },
	{ line: "storm", label: "Storm" },
];

const ENDINGS = {
	batch: "Go on, or record something else.",
	limit: "That is as far as one run goes.",
	silence: "It heard nothing in its own recording, so the run is over.",
	stopped: "Stopped. Go on, or record something else.",
};

const LABEL: Record<Phase, string> = {
	asleep: "Record",
	closed: "Try again",
	waking: "Connecting",
	ready: "Record",
	rested: "Record again",
	counting: "Get ready",
	listening: "Stop",
	sent: "Sending",
	running: "Record again",
};

const ACTION: Record<Phase, string> = {
	...LABEL,
	closed: "Try the microphone again",
	counting: "Cancel recording",
	listening: "Stop recording",
};

const linked = (phase: Phase) =>
	phase !== "asleep" && phase !== "closed" && phase !== "waking";

const armed = (piece: Piece) => linked(piece.phase) && piece.microphone;

const clock = (seconds: number) =>
	`0:${String(Math.max(0, seconds)).padStart(2, "0")}`;

function title(
	shown: Generation | undefined,
	example: boolean,
	pending: boolean,
) {
	if (!shown) return pending ? "Your take" : PROMPT;
	if (!example) return shown.index ? `Generation ${shown.index}` : "Your take";

	return `Example · ${shown.index ? `Generation ${shown.index}` : "The reader"}`;
}

function sentence(text: string) {
	const said = text.trim();

	return `${said.charAt(0).toUpperCase()}${said.slice(1)}${/[.!?…]$/.test(said) ? "" : "."}`;
}

function cue(piece: Piece, asking: boolean, halting: boolean) {
	if (piece.notice) return sentence(piece.notice);

	const queue = piece.ahead
		? `Waiting for the room. ${piece.ahead} ahead of you.`
		: null;

	switch (piece.phase) {
		case "asleep":
			return "Record one sentence, or turn Sound on to hear this example.";
		case "closed":
			return "The room is closed right now. The example plays without sound.";
		case "waking":
			return asking
				? "Allow the microphone if your browser asks."
				: "Connecting to the room…";
		case "ready":
			return piece.microphone
				? "Press Record and say one sentence."
				: "This is an example. Record one sentence to make your own.";
		case "counting":
			return "Recording starts after the count.";
		case "listening":
			return "Recording. Press the disc again when you are done.";
		case "sent":
			return queue ?? "Got it.";
		case "running":
			if (halting) return "Stopping after this generation.";
			if (queue) return queue;

			return piece.generations.length
				? `Making generation ${piece.generations.length}.`
				: "Got it. The room is listening to your take.";
		case "rested":
			return piece.ending ? ENDINGS[piece.ending] : "";
	}
}

function refusal(error: unknown) {
	if (error instanceof DOMException && error.name === "NotAllowedError")
		return "Microphone blocked. Allow it from the address bar, then try again.";

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
	const [asking, setAsking] = useState(false);
	const [halting, setHalting] = useState(false);
	const [lead, setLead] = useState(LEAD);
	const [left, setLeft] = useState(TAKE_SECONDS);
	const stage = useRef<HTMLDivElement>(null);
	const moving = useShouldRun(stage);
	const link = useRef<Link | null>(null);
	const audio = useRef<HTMLAudioElement>(null);
	const disc = useRef<HTMLButtonElement>(null);
	const pressed = useRef(0);
	const now = useRef(piece);

	now.current = piece;

	const made = piece.generations.length > 0;
	const counting = piece.phase === "counting";
	const recording = piece.phase === "listening";
	const running = piece.phase === "running";
	const reaching = piece.phase === "waking" && asking;
	const pending = piece.phase === "sent" || (running && !piece.generations[1]);
	const prompting =
		reaching ||
		taking(piece) ||
		piece.phase === "sent" ||
		(armed(piece) && !made);
	const still = !made && !prompting;
	const generations = prompting ? [] : made ? piece.generations : RECORDED;
	const cursor = made ? piece.cursor : Math.min(browsed, RECORDED.length - 1);
	const shown = generations[cursor];
	const recorded = still || (made && piece.recorded);
	const original = generations[1]?.text ?? "";
	const hint = pending ? WRITING : shown ? "" : SUGGESTION;
	const said = Boolean(shown && original);
	const words = said
		? mark(original, shown?.index ? shown.text : original)
		: mark(hint, hint);
	const total = shown ? spoken(original).length : 0;
	const length = words.reduce((sum, word) => sum + word.text.length + 1, 0);
	const longest = piece.limits?.takeSeconds ?? TAKE_SECONDS;

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
		if (!running) setHalting(false);
	}, [running]);

	const level = useCallback(
		() => Math.min(1, (link.current?.level() ?? 0) * GAIN),
		[],
	);

	useEffect(() => {
		if (!recording) return;

		let frame = 0;
		const tick = () => {
			disc.current?.style.setProperty("--sb-level", level().toFixed(3));
			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(frame);
			disc.current?.style.setProperty("--sb-level", "0");
		};
	}, [recording, level]);

	const prime = useCallback(() => {
		pressed.current = performance.now();
		setLead(LEAD);
		move({ type: "count" });
		link.current?.hush();
	}, []);

	const record = useCallback(() => {
		pressed.current = performance.now();
		move({ type: "listen" });
		link.current?.listen();
	}, []);

	useEffect(() => {
		if (!counting) return;

		const timer = window.setTimeout(
			() => (lead > 1 ? setLead(lead - 1) : record()),
			LEAD_MS,
		);

		return () => window.clearTimeout(timer);
	}, [counting, lead, record]);

	const wake = useCallback(
		async (speaking: boolean) => {
			move({ type: "wake" });
			setAsking(speaking);
			setSound(true);
			link.current?.close();

			const hear = (heard: Heard) => {
				move(heard);

				if (heard.type === "house") opened.play(0, true);
			};
			const opened = new Link(hear, (notice) =>
				move({ type: "close", notice }),
			);

			link.current = opened;

			try {
				const { limits, stream } = await opened.open(speaking);

				if (audio.current) {
					audio.current.srcObject = stream;
					audio.current.play().catch(() => {});
				}

				move({ type: "open", limits, microphone: speaking });

				if (speaking) prime();
				else opened.house();
			} catch (error) {
				opened.close();
				move({ type: "close", notice: refusal(error) });
			}
		},
		[prime],
	);

	const send = useCallback(() => {
		if (now.current.phase !== "listening") return;

		move({ type: "send" });
		window.setTimeout(() => link.current?.begin(line), TAIL_MS);
	}, [line]);

	useEffect(() => {
		if (!recording) return;

		const count = () =>
			setLeft(
				Math.ceil(longest - (performance.now() - pressed.current) / 1000),
			);
		const timer = window.setTimeout(send, longest * 1000);
		const ticks = window.setInterval(count, TICK_MS);

		count();

		return () => {
			window.clearTimeout(timer);
			window.clearInterval(ticks);
		};
	}, [recording, longest, send]);

	const settled = () => performance.now() - pressed.current > TAP_MS;

	const press = () => {
		const { phase } = now.current;

		if (phase === "counting") {
			if (settled()) move({ type: "cancel" });

			return;
		}

		if (phase === "listening") {
			if (settled()) send();

			return;
		}

		if (busy(now.current)) return;

		if (armed(now.current)) prime();
		else wake(true);
	};

	const release = () => {
		if (settled()) send();
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

	const halt = () => {
		setHalting(true);
		link.current?.stop();
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
	const held = busy(piece) || taking(piece);

	return (
		<div ref={stage} className="sb" data-phase={piece.phase}>
			{/* biome-ignore lint/a11y/useMediaCaption: live speech has no caption track; the text is on the page */}
			<audio ref={audio} autoPlay />

			<p className="sb-count" data-alone={!shown || undefined}>
				<span className="sb-count__where">
					{title(shown, recorded, pending)}
				</span>
				<span className="sb-count__voice">
					{shown ? `Voice ${percent(shown.likeness)}%` : ""}
				</span>
				<span className="sb-count__words">
					{total ? `Words ${kept(words)} of ${total}` : ""}
				</span>
			</p>

			<p
				key={said ? "said" : hint}
				className="sb-line"
				data-size={size}
				data-quiet={pending || undefined}
			>
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
					aria-label={ACTION[piece.phase]}
					aria-pressed={recording}
					disabled={busy(piece)}
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
					<span className="sb-disc__count" aria-hidden="true">
						{counting ? lead : ""}
					</span>
				</button>

				<p className="sb-desk__label">
					{LABEL[piece.phase]}
					<span className="sb-desk__fact">
						{recording ? `${clock(left)} left` : `Up to ${longest} seconds`}
					</span>
				</p>
				<p className="sb-desk__cue" role="status">
					{cue(piece, asking, halting)}
				</p>
				<Tape
					rolling={recording}
					blank={counting}
					seconds={longest}
					began={pressed}
					level={level}
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
									disabled={held}
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
								disabled={
									running ? halting : !(piece.phase === "rested" && more(piece))
								}
								onClick={running ? halt : goOn}
							>
								{running ? (halting ? "Stopping" : "Stop") : "Go on"}
							</button>
							<button
								type="button"
								className="sb-plate"
								aria-pressed={sound && linked(piece.phase)}
								disabled={piece.phase === "waking" || taking(piece)}
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
