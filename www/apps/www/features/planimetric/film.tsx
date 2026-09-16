"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { renderMusic } from "./music";
import {
	arrival,
	type Cue,
	compile,
	drawingFrame,
	durationOf,
	format,
	frameRect,
	INITIAL_SCRIPT,
	locate,
	MAX_SHOTS,
	SCRIPT_TITLE,
	SETUP_NAMES,
	schedule,
	setups,
} from "./screenplay";
import { Camera, Drawing, SHEET } from "./set";
import "./film.css";

const palettes = [
	{ name: "Budapest", swatches: ["#b5495b", "#d98595", "#7fb0a3", "#d9a84a"] },
	{ name: "Moonrise", swatches: ["#a8743c", "#c9764c", "#7f9469", "#e2b04a"] },
	{ name: "Aquatic", swatches: ["#2f6f8a", "#d65a4a", "#4f8f9a", "#e2b85a"] },
];
const ratios = [
	{ value: 1.37, label: "1.37", note: "Academy" },
	{ value: 1.85, label: "1.85", note: "Flat" },
	{ value: 2.39, label: "2.39", note: "Scope" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (s: number) =>
	`${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;

function pickVoice() {
	const voices = window.speechSynthesis.getVoices();
	return (
		voices.find(
			(v) =>
				/en-GB/i.test(v.lang) && /Daniel|Arthur|UK English Male/.test(v.name),
		) ??
		voices.find((v) => /en-GB/i.test(v.lang)) ??
		voices.find((v) => /^en/i.test(v.lang)) ??
		null
	);
}

export function Film() {
	const [source, setSource] = useState(INITIAL_SCRIPT);
	const [draft, setDraft] = useState(INITIAL_SCRIPT);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState("");
	const [take, setTake] = useState(1);
	const [run, setRun] = useState(0);
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [voice, setVoice] = useState(false);
	const [music, setMusic] = useState(false);
	const [guides, setGuides] = useState(false);
	const [ratio, setRatio] = useState<number | null>(null);
	const [palette, setPalette] = useState(0);
	const [reduced, setReduced] = useState(false);
	const [narrow, setNarrow] = useState(false);
	const [lessonOpen, setLessonOpen] = useState(false);
	const [drawingView, setDrawingView] = useState<"shot" | "overview">(
		"overview",
	);
	const [canSpeak, setCanSpeak] = useState(false);
	const film = useRef<SVGSVGElement>(null);
	const board = useRef<HTMLOListElement>(null);
	const cameraRect = useRef<SVGRectElement>(null);
	const stopAt = useRef<number | null>(null);
	const audio = useRef<AudioContext | null>(null);
	const score = useRef<Promise<AudioBuffer> | null>(null);

	const { screenplay } = useMemo(() => compile(source), [source]);
	const cues = useMemo(() => schedule(screenplay.shots), [screenplay]);
	const total = durationOf(cues);
	const cue = locate(cues, time);
	const setup = setups[cue.shot.setup];
	const shownRatio = ratio ?? (narrow ? 1.37 : 1.85);
	const drawingDetail = narrow && drawingView === "shot";
	const drawingBox = drawingDetail
		? drawingFrame(cue.shot)
		: `${SHEET.x} ${SHEET.y} ${SHEET.w} ${SHEET.h}`;

	function syncCamera() {
		const box = film.current?.viewBox.animVal;
		const rect = cameraRect.current;
		if (!box || !rect) return;
		rect.setAttribute("x", String(box.x));
		rect.setAttribute("y", String(box.y));
		rect.setAttribute("width", String(box.width));
		rect.setAttribute("height", String(box.height));
	}

	useEffect(() => {
		setCanSpeak("speechSynthesis" in window);
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const width = window.matchMedia("(max-width: 720px)");
		const update = () => {
			setReduced(motion.matches);
			setNarrow(width.matches);
		};
		update();
		motion.addEventListener("change", update);
		width.addEventListener("change", update);
		const visibility = () => {
			if (document.hidden) setPlaying(false);
		};
		document.addEventListener("visibilitychange", visibility);
		return () => {
			motion.removeEventListener("change", update);
			width.removeEventListener("change", update);
			document.removeEventListener("visibilitychange", visibility);
			window.speechSynthesis?.cancel();
			void audio.current?.close();
			audio.current = null;
		};
	}, []);

	useEffect(() => {
		const svg = film.current;
		if (!svg) return;
		svg.pauseAnimations();
		svg.setCurrentTime(0);
		stopAt.current = null;
		setTime(0);
		setPlaying(false);
		syncCamera();
	}, [take, reduced]);

	useEffect(() => {
		const svg = film.current;
		if (!playing || !svg) return;
		svg.unpauseAnimations();
		let frame = 0;
		let shown = -1;
		const tick = () => {
			const now = svg.getCurrentTime();
			const limit = stopAt.current ?? total;
			if (now >= limit) {
				svg.pauseAnimations();
				svg.setCurrentTime(limit);
				stopAt.current = null;
				setTime(limit);
				setPlaying(false);
				syncCamera();
				return;
			}
			const rounded = Math.floor(now * 10) / 10;
			if (rounded !== shown) {
				shown = rounded;
				setTime(rounded);
			}
			syncCamera();
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
			svg.pauseAnimations();
		};
	}, [playing, total]);

	useEffect(() => {
		if (!canSpeak) return;
		const synth = window.speechSynthesis;
		synth.cancel();
		if (!voice || !playing || !cue.shot.dialogue) return;
		const line = new SpeechSynthesisUtterance(cue.shot.dialogue);
		line.rate = 0.86;
		line.pitch = 0.78;
		line.voice = pickVoice();
		synth.speak(line);
	}, [voice, playing, cue.index, run, canSpeak]);

	useEffect(() => {
		if (!playing || !music || !audio.current) return;
		let cancelled = false;
		let node: AudioBufferSourceNode | undefined;
		const context = audio.current;
		const requestedAt = performance.now();
		score.current ??= renderMusic();
		void score.current
			.then((buffer) => {
				if (cancelled || context.state === "closed") return;
				node = context.createBufferSource();
				node.buffer = buffer;
				node.loop = true;
				node.connect(context.destination);
				node.start(
					0,
					(time + (performance.now() - requestedAt) / 1000) % buffer.duration,
				);
			})
			.catch(() => {
				if (cancelled) return;
				setMusic(false);
				setNotice(
					"Music is unavailable in this browser. The reel runs silent.",
				);
				score.current = null;
			});
		return () => {
			cancelled = true;
			node?.stop();
			node?.disconnect();
		};
	}, [playing, music]);

	useEffect(() => {
		const list = board.current;
		const item = list?.children[cue.index] as HTMLElement | undefined;
		if (!list || !item || list.scrollWidth <= list.clientWidth) return;
		list.scrollTo({
			left:
				list.scrollLeft +
				item.getBoundingClientRect().left -
				list.getBoundingClientRect().left -
				(list.clientWidth - item.clientWidth) / 2,
			behavior: reduced ? "auto" : "smooth",
		});
	}, [cue.index, reduced]);

	function seek(seconds: number) {
		const next = Math.max(0, Math.min(total, seconds));
		setPlaying(false);
		stopAt.current = null;
		film.current?.setCurrentTime(next);
		setTime(next);
		syncCamera();
	}
	function begin() {
		if (music) void audio.current?.resume().catch(() => setMusic(false));
		setRun((n) => n + 1);
		setPlaying(true);
	}

	function playShot(index: number) {
		const target = cues[index];
		if (!target) return;
		film.current?.setCurrentTime(target.start);
		setTime(target.start);
		stopAt.current = target.end - 0.05;
		syncCamera();
		begin();
	}
	function togglePlay() {
		if (playing) {
			setPlaying(false);
			return;
		}
		stopAt.current = null;
		if (time >= total - 0.1) {
			film.current?.setCurrentTime(0);
			setTime(0);
		}
		begin();
	}
	async function toggleMusic() {
		if (music) {
			setMusic(false);
			return;
		}
		try {
			audio.current ??= new AudioContext();
			await audio.current.resume();
			setMusic(true);
		} catch {
			setNotice("Music is unavailable in this browser. The reel runs silent.");
		}
	}
	function thread() {
		const result = compile(draft);
		setError(result.error);
		if (result.error) return;
		setPlaying(false);
		setSource(draft);
		setTake((n) => n + 1);
		setNotice(
			`${result.screenplay.shots.length} shots, ${durationOf(schedule(result.screenplay.shots))} seconds, threaded.`,
		);
	}
	function download() {
		const text = `Title: ${SCRIPT_TITLE}\nCredit: a scene study after Wes Anderson\nDraft date: ${new Date().toISOString().slice(0, 10)}\n\n${format(screenplay)}\n`;
		const url = URL.createObjectURL(
			new Blob([text], { type: "text/plain;charset=utf-8" }),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "checkout-pending.fountain";
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	const first = setups[cues[0].shot.setup].frames[0];
	const subtitle =
		cue.shot.setup !== "CARD" && cue.shot.dialogue ? cue.shot : null;

	return (
		<div
			className="film"
			data-palette={palette}
			style={{ "--ratio": shownRatio } as CSSProperties}
		>
			<section className="film-theatre" aria-label="Viewfinder and lesson">
				<div className="film-stagebox">
					<p className="film-slate">
						<span>{screenplay.heading || "UNTITLED SCENE"}</span>
						<span>
							SH. {pad(cue.index + 1)} / {pad(cues.length)}
						</span>
					</p>
					<div className="film-screen">
						<svg
							key={`${take}-${reduced}`}
							ref={film}
							className="film-camera"
							viewBox={first}
							preserveAspectRatio="xMidYMid slice"
							role="img"
							aria-label={`${setup.label}: ${cue.shot.action || cue.shot.dialogue}`}
						>
							<defs>
								<Drawing cues={cues} reduced={reduced} />
							</defs>
							<use href="#set" />
							<Camera cues={cues} reduced={reduced} />
						</svg>
						{guides && (
							<div className="film-guides" aria-hidden="true">
								<span>CENTRE</span>
							</div>
						)}
						{subtitle && (
							<p className="film-subtitle" aria-live="polite">
								<span className="film-speaker">{subtitle.character}</span>
								<span className="film-line">{subtitle.dialogue}</span>
							</p>
						)}
						<div className="film-progress" aria-hidden="true">
							{cues.map((item) => (
								<i
									key={`${item.index}-${item.shot.setup}`}
									style={
										{
											"--fill":
												item.index < cue.index
													? 1
													: item.index === cue.index
														? Math.min(
																1,
																(time - item.start) / item.shot.duration,
															)
														: 0,
										} as CSSProperties
									}
								/>
							))}
						</div>
					</div>
					<div className="film-caption" aria-live="polite">
						<span className="film-caption-meta">
							Shot {pad(cue.index + 1)} / {pad(cues.length)} · {setup.label}
						</span>
						<p>
							<b>
								{subtitle?.character ||
									(cue.shot.setup === "CARD" ? "INTERTITLE" : "ACTION")}
							</b>
							{subtitle?.dialogue || cue.shot.action}
						</p>
					</div>
					<div className="film-transport">
						<button
							type="button"
							className="film-skip film-skip--prev"
							aria-label="Previous shot"
							disabled={cue.index === 0}
							onClick={() => playShot(cue.index - 1)}
						>
							<LifeArrow direction="left" />
						</button>
						<button type="button" className="film-play" onClick={togglePlay}>
							{playing
								? "Pause"
								: time >= total - 0.1
									? "Run it again"
									: "Run the scene"}
						</button>
						<button
							type="button"
							className="film-skip film-skip--next"
							aria-label="Next shot"
							disabled={cue.index === cues.length - 1}
							onClick={() => playShot(cue.index + 1)}
						>
							<LifeArrow direction="right" />
						</button>
						<span className="film-clock">
							{clock(time)} / {clock(total)}
						</span>
						<label className="film-scrub">
							<span className="sr-only">Scrub the scene in seconds</span>
							<input
								type="range"
								min="0"
								max={total}
								step="0.1"
								value={time}
								aria-valuetext={`${clock(time)} of ${clock(total)}`}
								onChange={(event) => seek(Number(event.target.value))}
							/>
						</label>
						<div className="film-switches">
							{canSpeak && (
								<button
									type="button"
									aria-pressed={voice}
									onClick={() => setVoice(!voice)}
								>
									Voice
								</button>
							)}
							<button
								type="button"
								aria-pressed={music}
								onClick={() => void toggleMusic()}
							>
								Music
							</button>
							<button
								type="button"
								aria-pressed={guides}
								onClick={() => setGuides(!guides)}
							>
								Crosshair
							</button>
						</div>
					</div>
					{notice && (
						<p className="film-notice" role="status">
							{notice}
						</p>
					)}
				</div>

				<aside className="film-paper film-lesson" data-expanded={lessonOpen}>
					<button
						type="button"
						className="film-lesson-toggle"
						aria-expanded={lessonOpen}
						aria-controls="film-camera-notes"
						onClick={() => setLessonOpen(!lessonOpen)}
					>
						Camera notes & color{" "}
						<span aria-hidden="true">{lessonOpen ? "−" : "+"}</span>
					</button>
					<div className="film-lesson-body" id="film-camera-notes">
						<div className="film-lesson-head">
							<span className="eyebrow">
								Shot {cue.index + 1} of {cues.length}
							</span>
							<span className="film-lesson-setup">{setup.label}</span>
						</div>
						<h2>{setup.lesson.title}</h2>
						<p>{setup.lesson.note}</p>
						<span className="eyebrow film-lesson-lens">
							{setup.lesson.lens}
						</span>
						<div className="film-steps">
							<button
								type="button"
								disabled={cue.index === 0}
								onClick={() => playShot(cue.index - 1)}
							>
								<span aria-hidden="true">
									<LifeArrow direction="left" />
								</span>{" "}
								Previous
							</button>
							<button
								type="button"
								onClick={() => playShot(cue.index)}
								aria-label={`Play shot ${cue.index + 1} again`}
							>
								Play shot
							</button>
							<button
								type="button"
								disabled={cue.index === cues.length - 1}
								onClick={() => playShot(cue.index + 1)}
							>
								Next{" "}
								<span aria-hidden="true">
									<LifeArrow direction="right" />
								</span>
							</button>
						</div>
						<p className="film-hint">
							Each step plays one shot and holds. Run the scene to see them cut
							together.
						</p>
						<div className="film-settings">
							<fieldset>
								<legend>Ratio</legend>
								{ratios.map((item) => (
									<button
										type="button"
										key={item.value}
										aria-pressed={shownRatio === item.value}
										onClick={() => setRatio(item.value)}
										title={item.note}
									>
										{item.label}
									</button>
								))}
							</fieldset>
							<fieldset>
								<legend>Grade</legend>
								{palettes.map((item, index) => (
									<button
										type="button"
										key={item.name}
										className="film-swatch"
										aria-pressed={palette === index}
										aria-label={item.name}
										title={item.name}
										onClick={() => setPalette(index)}
									>
										{item.swatches.map((color) => (
											<i key={color} style={{ background: color }} />
										))}
									</button>
								))}
							</fieldset>
						</div>
					</div>
				</aside>
			</section>

			<section
				className="film-paper film-board"
				aria-labelledby="film-board-title"
			>
				<header className="film-head">
					<h2 id="film-board-title">I. Storyboard</h2>
					<span className="eyebrow">
						{cues.length} shots · {total} seconds · tap a frame to play it
					</span>
					<button
						type="button"
						className="film-link"
						onClick={() => window.print()}
					>
						Print the board{" "}
						<span aria-hidden="true">
							<LifeArrow direction="up-right" />
						</span>
					</button>
				</header>
				<ol className="film-frames" ref={board}>
					{cues.map((item) => (
						<li key={`${item.index}-${item.shot.setup}`}>
							<button
								type="button"
								className="film-frame"
								aria-pressed={cue.index === item.index}
								onClick={() => playShot(item.index)}
							>
								<svg
									viewBox={arrival(item.shot)}
									preserveAspectRatio="xMidYMid slice"
									aria-hidden="true"
								>
									<use href="#set" />
								</svg>
								<span className="film-frame-meta">
									<b>{pad(item.index + 1)}</b>
									<span>{setups[item.shot.setup].label}</span>
									<span>{item.shot.duration}s</span>
								</span>
								<span className="film-frame-lesson">
									{setups[item.shot.setup].lesson.title}
								</span>
								<span className="film-print-only">
									{item.shot.action}
									{item.shot.character && (
										<>
											<br />
											{item.shot.character}: {item.shot.dialogue}
										</>
									)}
								</span>
							</button>
						</li>
					))}
				</ol>
			</section>

			<section
				className="film-paper film-sheet"
				aria-labelledby="film-sheet-title"
			>
				<header className="film-head">
					<h2 id="film-sheet-title">II. The drawing</h2>
					<span className="eyebrow">
						Every shot is a rectangle on this sheet
					</span>
				</header>
				<p className="film-sheet-note">
					Choose a shot to watch its camera move across the drawing. The yellow
					outline follows the camera; the dashed outline marks where it
					finishes.
				</p>
				<fieldset className="film-drawing-views" aria-label="Drawing view">
					<button
						type="button"
						aria-pressed={drawingView === "overview"}
						onClick={() => setDrawingView("overview")}
					>
						Whole drawing
					</button>
					<button
						type="button"
						aria-pressed={drawingView === "shot"}
						onClick={() => setDrawingView("shot")}
					>
						Shot detail
					</button>
				</fieldset>
				<div className="film-sheet-scroll" data-detail={drawingDetail}>
					<svg
						className="film-master"
						viewBox={drawingBox}
						role={narrow ? "img" : "group"}
						aria-label={
							narrow
								? `Drawing for shot ${cue.index + 1}: ${setup.label}. ${setup.lesson.note}`
								: "The whole drawing with every camera rectangle marked"
						}
					>
						<use href="#set" />
						{(narrow ? [cue] : cues).map((item) => (
							<SheetFrame
								key={`${item.index}-${item.shot.setup}`}
								cue={item}
								current={cue.index === item.index}
								interactive={!narrow}
								onSelect={() => playShot(item.index)}
							/>
						))}
						<rect
							ref={cameraRect}
							className="film-master-camera"
							{...frameRect(first)}
						/>
					</svg>
				</div>
				<div className="film-drawing-controls">
					<p className="film-drawing-current" aria-live="polite">
						<span className="eyebrow">
							Shot {pad(cue.index + 1)} / {pad(cues.length)}
						</span>
						<strong>{setup.label}</strong>
					</p>
					<p className="film-drawing-help">
						Tap a shot to zoom in and play its move.
					</p>
					<fieldset
						className="film-drawing-shots"
						aria-label="Explore a shot in the drawing"
					>
						{cues.map((item) => (
							<button
								type="button"
								key={item.index}
								aria-pressed={cue.index === item.index}
								aria-label={`Explore shot ${item.index + 1}: ${setups[item.shot.setup].label}`}
								onClick={() => {
									setDrawingView("shot");
									playShot(item.index);
								}}
							>
								<b>{pad(item.index + 1)}</b>
								<span>{setups[item.shot.setup].label}</span>
							</button>
						))}
					</fieldset>
					<button
						type="button"
						className="film-drawing-replay"
						onClick={() => (playing ? setPlaying(false) : playShot(cue.index))}
					>
						{playing ? "Pause camera" : "Replay camera move"}
					</button>
				</div>
			</section>

			<section
				className="film-paper film-script"
				aria-labelledby="film-script-title"
			>
				<header className="film-head">
					<h2 id="film-script-title">III. The shooting script</h2>
					<span className="eyebrow">
						Fountain, with camera cues in double brackets
					</span>
					<button type="button" className="film-link" onClick={download}>
						Save .fountain{" "}
						<span aria-hidden="true">
							<LifeArrow direction="down" />
						</span>
					</button>
				</header>
				<div className="film-script-body">
					<div className="film-page">
						<label htmlFor="film-source">{SCRIPT_TITLE}</label>
						<textarea
							id="film-source"
							value={draft}
							maxLength={12000}
							spellCheck={false}
							onChange={(event) => setDraft(event.target.value)}
							aria-invalid={!!error}
							aria-describedby={error ? "film-error" : undefined}
						/>
						<div className="film-script-actions">
							<button type="button" className="film-thread" onClick={thread}>
								Thread this script{" "}
								<span aria-hidden="true">
									<LifeArrow direction="right" />
								</span>
							</button>
							<button
								type="button"
								onClick={() => {
									setDraft(INITIAL_SCRIPT);
									setError(null);
								}}
							>
								Restore the original
							</button>
						</div>
						{error ? (
							<p id="film-error" className="film-error" role="alert">
								{error}
							</p>
						) : (
							<p className="film-notice" role="status">
								{notice ||
									"Change a line, a cue, or a duration, then thread it."}
							</p>
						)}
					</div>
					<aside className="film-grammar">
						<h3>The grammar</h3>
						<p>
							A cue in double brackets starts a shot and names one of the eight
							setups, with its length in seconds from 1 to 12. Up to {MAX_SHOTS}{" "}
							shots.
						</p>
						<ul>
							{SETUP_NAMES.map((name) => (
								<li key={name}>
									<code>
										[[{name} {setups[name].seconds}]]
									</code>
									<span>{setups[name].label}</span>
								</li>
							))}
						</ul>
						<p>
							Beneath a cue, plain lines are action. A name in capitals on its
							own line is a character, and the lines after it are what they say,
							one speaker per shot. A line in parentheses is a parenthetical. A{" "}
							<code>CARD</code> shot prints its action line as the chapter
							title, with the words before a colon as the eyebrow.
						</p>
					</aside>
				</div>
				<pre className="film-print-only film-print-script">
					{format(screenplay)}
				</pre>
			</section>
		</div>
	);
}

function SheetFrame({
	cue,
	current,
	interactive = true,
	onSelect,
}: {
	cue: Cue;
	current: boolean;
	interactive?: boolean;
	onSelect: () => void;
}) {
	const { frames, move } = setups[cue.shot.setup];
	const rects = frames.map(frameRect);
	const start = rects[0];
	const end = rects[rects.length - 1];
	const tagY =
		move === "whip" || move === "snap" ? start.y + start.h - 80 : start.y;
	return (
		<g
			className="film-master-shot"
			data-current={current}
			role={interactive ? "button" : undefined}
			tabIndex={interactive ? 0 : undefined}
			aria-hidden={!interactive || undefined}
			aria-label={
				interactive
					? `Play shot ${cue.index + 1}, ${setups[cue.shot.setup].label}`
					: undefined
			}
			onClick={interactive ? onSelect : undefined}
			onKeyDown={(event) => {
				if (interactive && (event.key === "Enter" || event.key === " ")) {
					event.preventDefault();
					onSelect();
				}
			}}
		>
			{rects.length > 1 && (
				<>
					<rect
						x={end.x}
						y={end.y}
						width={end.w}
						height={end.h}
						className="film-master-arrival"
					/>
					<line
						x1={start.x + start.w / 2}
						y1={start.y + start.h / 2}
						x2={end.x + end.w / 2}
						y2={end.y + end.h / 2}
						className="film-master-path"
					/>
				</>
			)}
			<rect
				x={start.x}
				y={start.y}
				width={start.w}
				height={start.h}
				className="film-master-frame"
			/>
			<rect
				x={start.x}
				y={tagY}
				width="120"
				height="80"
				className="film-master-tag"
			/>
			<text
				x={start.x + 60}
				y={tagY + 58}
				textAnchor="middle"
				fontSize="56"
				fontWeight="600"
			>
				{pad(cue.index + 1)}
			</text>
		</g>
	);
}
