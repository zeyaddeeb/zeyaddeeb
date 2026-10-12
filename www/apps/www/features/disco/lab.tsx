"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { opening } from "./deck";
import { type FilmId, MOST } from "./film";
import { homes, type Reading, type Spots } from "./floor";
import { Handles } from "./handles";
import type { Beat } from "./lock";
import { MediaPlayer } from "./media-player";
import { Player } from "./music/player";
import { type TuneId, tune as tuneOf, tunes } from "./music/tunes";
import { Panel } from "./panel";
import { canPopOut, type Popped, popOut } from "./pop-out";
import { Shortcuts } from "./shortcuts";
import { type Tapped, tap, beat as tappedBeat } from "./taps";
import { Taskbar } from "./taskbar";
import { useStage } from "./use-stage";
import { XpWindow } from "./window";
import "./disco.css";
import "./xp.css";
import "./phone.css";

const STAR: FilmId = "kenny";
const TUNE: TuneId = "fiesta";
const FIRST: Reading[] = [
	{
		id: STAR,
		move: opening(STAR),
		next: -1,
		queue: [],
		speed: 1,
		late: 0,
		locked: false,
		strained: false,
	},
];
const LOUD = 0.8;
const MENU = ["File", "View", "Play", "Tools", "Help"];

const seconds = () => performance.now() / 1000;

const told = (readings: Reading[], music: Beat) =>
	JSON.stringify([
		music.playing,
		Math.round(music.bpm),
		readings.map((reading) => [
			reading.id,
			reading.move,
			reading.next,
			reading.queue,
			reading.locked,
			reading.strained,
			Math.round(reading.speed * 300),
		]),
	]);

export function DiscoLab() {
	const screen = useRef<HTMLDivElement>(null);
	const dancers = useRef<HTMLCanvasElement>(null);
	const scope = useRef<HTMLCanvasElement>(null);
	const bars = useRef<HTMLCanvasElement>(null);
	const player = useRef<Player | null>(null);
	const tapped = useRef<Tapped | null>(null);
	const heard = useRef("");
	const held = useReducedMotion();
	const [lineup, setLineup] = useState<FilmId[]>([STAR]);
	const [picked, setPicked] = useState(STAR);
	const [spots, setSpots] = useState<Spots>({});
	const [tune, setTune] = useState(TUNE);
	const [playing, setPlaying] = useState(false);
	const [tapping, setTapping] = useState(false);
	const [rate, setRate] = useState(1);
	const [muted, setMuted] = useState(false);
	const [shown, setShown] = useState(true);
	const [menu, setMenu] = useState(false);
	const [readings, setReadings] = useState(FIRST);
	const [tempo, setTempo] = useState(tuneOf(TUNE).bpm);
	const [live, setLive] = useState(false);
	const [able, setAble] = useState(false);
	const [popped, setPopped] = useState<Popped | null>(null);
	const [trouble, setTrouble] = useState(false);

	const beat = useCallback((): Beat => {
		if (tapped.current) return tappedBeat(tapped.current, seconds());

		return player.current?.clock() ?? { playing: false, beat: 0, bpm: 120 };
	}, []);

	const analyser = useCallback(() => player.current?.analyser ?? null, []);

	const onRead = useCallback((next: Reading[], music: Beat) => {
		const key = told(next, music);

		if (key === heard.current) return;

		heard.current = key;
		setReadings(next);
		setTempo(music.bpm);
		setLive(music.playing);
	}, []);

	const floor = useStage({
		screen,
		dancers,
		scope,
		bars,
		popped,
		lineup,
		spots,
		beat,
		analyser,
		onRead,
	});

	useEffect(() => setAble(canPopOut()), []);

	useEffect(() => () => popped?.view.close(), [popped]);

	useEffect(() => () => player.current?.dispose(), []);

	useEffect(() => {
		const box = screen.current;

		if (!box) return;

		const watch = new ResizeObserver(() => setSpots({}));

		watch.observe(box);

		return () => watch.disconnect();
	}, []);

	useEffect(() => {
		const leave = () => setMenu(false);
		const pressed = (event: KeyboardEvent) => {
			if (event.key === "Escape") leave();
		};

		window.addEventListener("hashchange", leave);
		window.addEventListener("keydown", pressed);

		return () => {
			window.removeEventListener("hashchange", leave);
			window.removeEventListener("keydown", pressed);
		};
	}, []);

	const pin = async () => {
		if (popped) {
			setPopped(null);
			return;
		}

		const bar = screen.current?.querySelector(".dd-bar");
		const next = await popOut(bar ? getComputedStyle(bar).backgroundImage : "");

		if (!next) return;

		next.view.addEventListener("pagehide", () => setPopped(null));
		setPopped(next);
	};

	const rest = () => {
		tapped.current = null;
		setTapping(false);
	};

	const play = async (id: TuneId) => {
		rest();
		player.current ??= new Player();
		player.current.setRate(rate);
		player.current.setVolume(muted ? 0 : LOUD);
		setTune(id);
		setPlaying(true);

		try {
			await player.current.play(id);
			setTrouble(false);
		} catch {
			setPlaying(false);
			setTrouble(true);
		}
	};

	const stop = () => {
		player.current?.stop();
		setPlaying(false);
	};

	const skip = (by: number) => {
		const index = tunes.findIndex((entry) => entry.id === tune);
		const next = tunes[(index + by + tunes.length) % tunes.length].id;

		if (playing) void play(next);
		else setTune(next);
	};

	const speed = (next: number) => {
		setRate(next);
		player.current?.setRate(next);
	};

	const mute = () => {
		player.current?.setVolume(muted ? LOUD : 0);
		setMuted(!muted);
	};

	const tapNow = () => {
		if (!tapped.current) stop();

		tapped.current = tap(tapped.current, seconds());
		setTapping(true);
	};

	const toggle = (id: FilmId) => {
		const on = lineup.includes(id);

		if (on && lineup.length === 1) return;

		const next = on
			? lineup.filter((other) => other !== id)
			: [...lineup, id].slice(-MOST);

		setSpots({});
		setLineup(next);
		setPicked(on ? (next.includes(picked) ? picked : next[0]) : id);
	};

	const move = (id: FilmId, x: number, y: number) => {
		const box = screen.current;

		if (!box) return;

		const home = homes(lineup.length)[lineup.indexOf(id)] * box.clientWidth;
		const within = (value: number, low: number, high: number) =>
			Math.min(high, Math.max(low, value));

		setSpots((now) => ({
			...now,
			[id]: {
				x: within(x, 40 - home, box.clientWidth - 40 - home),
				y: within(y, 160 - box.clientHeight, 0),
			},
		}));
	};

	const home = (id: FilmId) => setSpots(({ [id]: _, ...others }) => others);

	return (
		<div className="dd">
			<div className="dd-screen" ref={screen}>
				<Shortcuts lineup={lineup} onToggle={toggle} />
				<XpWindow
					title="Windows Media Player"
					icon="note"
					shown={shown}
					onHide={() => setShown(false)}
					onClose={() => {
						stop();
						setShown(false);
					}}
				>
					<p className="dd-player__menu" aria-hidden="true">
						{MENU.map((item) => (
							<span key={item}>{item}</span>
						))}
					</p>
					<MediaPlayer
						tune={tune}
						playing={playing}
						rate={rate}
						bars={bars}
						onPlay={() => void play(tune)}
						onStop={stop}
						onPick={(id) => void play(id)}
						onSkip={skip}
						onRate={speed}
					/>
				</XpWindow>
				<canvas
					ref={dancers}
					className="dd-floor"
					role="img"
					aria-label="The original Microsoft Plus! dancers, standing on the taskbar."
				/>
				<Handles lineup={lineup} spots={spots} onMove={move} onHome={home} />
				<Taskbar
					shown={shown}
					muted={muted}
					menu={menu}
					onMenu={setMenu}
					onWindow={setShown}
					onMute={mute}
					onPin={() => void pin()}
					pinned={able ? Boolean(popped) : null}
				/>
			</div>
			<Panel
				scope={scope}
				readings={readings}
				picked={picked}
				playing={live}
				tapping={tapping}
				held={held}
				trouble={trouble}
				tempo={tempo}
				onPick={setPicked}
				onAsk={(move) => floor.current?.ask(picked, move)}
				onTap={tapNow}
				onRest={rest}
			/>
		</div>
	);
}
