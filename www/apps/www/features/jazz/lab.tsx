"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BandDesk, Cue, deskSummary } from "./calls";
import { Chart, type Focus } from "./chart";
import { Clock, type Live, type Source } from "./clock";
import { Crate } from "./crate";
import { introCue, turnCue, waitCue } from "./cues";
import { Ear } from "./ear";
import {
	ask,
	fragments,
	type Line,
	type PlayerId,
	players,
	slotsPerBar,
} from "./model";
import type { Node } from "./pattern";
import {
	type CompiledScore,
	compileAll,
	type LaneId,
	laneIds,
	type Problem,
	type Score,
} from "./score";
import { Band } from "./synth";
import { bars, type Placed, type Take, transcribe, yourLine } from "./trade";
import {
	Horn,
	type Ledger,
	letters,
	Players,
	Provenance,
	pad,
} from "./trade-panel";
import { Transport } from "./transport";
import {
	arrange,
	type CallId,
	type Calls,
	call,
	caption,
	chorus,
	opening,
	type RecordId,
	roles,
	type Trading,
} from "./tune";

const rests = () => Array<string>(chorus).fill("~");
const wrapBar = (b: number) => ((b % chorus) + chorus) % chorus;
const home: Calls = { ...opening, lineup: "trade", swing: true };
const spec = (id: PlayerId) => players.find((p) => p.id === id) ?? players[0];

import "./jazz.css";

export function JazzLab() {
	const [state, setState] = useState<Calls>(home);
	const [edits, setEdits] = useState<Partial<Record<LaneId, string>>>({});
	const [changed, setChanged] = useState<string[]>([]);
	const [said, setSaid] = useState(() => introCue(players[0]));
	const [bandOpen, setBandOpen] = useState(false);
	const [chartOpen, setChartOpen] = useState(false);
	const [pending, setPending] = useState<{
		id: CallId | null;
		at: number;
	} | null>(null);
	const [focus, setFocus] = useState<Focus | null>(null);
	const [playing, setPlaying] = useState(false);
	const [record, setRecord] = useState<{ id: RecordId; n: number } | null>(
		null,
	);
	const [silence, setSilence] = useState(0);
	const band = useRef<Band | null>(null);
	const transport = useRef<Transport | null>(null);
	const arm = useRef<SVGGElement>(null);
	const count = useRef<HTMLSpanElement>(null);
	const root = useRef<HTMLDivElement>(null);
	const good = useRef<Partial<Record<LaneId, Node | null>>>({});
	const lastCall = useRef<CallId | null>(null);
	const [player, setPlayer] = useState<PlayerId>("armstrong");
	const [memory, setMemory] = useState(3);
	const [trading, setTrading] = useState<Trading | null>({
		voice: "cornet",
		you: rests(),
		answer: rests(),
	});
	const [ledger, setLedger] = useState<Ledger | null>(null);
	const [live, setLive] = useState<Live[]>([]);
	const [down, setDown] = useState<Set<number>>(new Set());
	const [hum, setHum] = useState<"off" | "on" | "denied">("off");
	const turn = useRef<HTMLDivElement>(null);
	const takes = useRef<Take[]>([]);
	const held = useRef(
		new Map<string, { key: number; take: Take | null; release: () => void }>(),
	);
	const tradeFrom = useRef<number | null>(null);
	const answered = useRef(new Set<number>());
	const yours = useRef<Line[]>([]);
	const land = useRef<number | null>(null);
	const ear = useRef<Ear | null>(null);
	const lastAnswer = useRef<number[]>([]);
	const block = useRef<number | null>(null);

	const score = useMemo<Score>(() => {
		const base = arrange(state, trading ?? undefined);
		return { ...base, code: { ...base.code, ...edits } };
	}, [state, edits, trading]);

	const raw = useMemo(() => compileAll(score), [score]);
	const compiled = useMemo(() => {
		const out = {} as CompiledScore;
		for (const lane of laneIds) {
			const entry = raw[lane];
			if (entry.problem)
				out[lane] = { node: good.current[lane] ?? null, problem: null };
			else {
				good.current[lane] = entry.node;
				out[lane] = entry;
			}
		}
		return out;
	}, [raw]);

	const problems = useMemo(
		() =>
			Object.fromEntries(laneIds.map((l) => [l, raw[l].problem])) as Record<
				LaneId,
				Problem | null
			>,
		[raw],
	);

	useEffect(() => {
		const t = transport.current;
		if (!t) return;
		const at = t.queue(score, compiled, land.current ?? undefined);
		land.current = null;
		setPending(at === null ? null : { id: lastCall.current, at });
		lastCall.current = null;
	}, [score, compiled]);

	const sources = useMemo<Source[]>(() => {
		if (!ledger || state.lineup !== "trade") return [];
		const out: Source[] = [];
		if (ledger.heardSpan)
			out.push({
				t0: ledger.heardSpan[0],
				t1: ledger.heardSpan[1],
				label: "what he heard",
				title: "The notes of yours he matched",
				kind: "heard",
			});
		const notes = ledger.answer.notes;
		for (const f of fragments(notes)) {
			const last = notes.find((n) => n.at === f.to);
			const end = f.to + (last?.length ?? 1);
			const you = f.line.who === "you";
			out.push({
				t0: ledger.bar + f.from / slotsPerBar,
				t1: ledger.bar + end / slotsPerBar,
				label: you ? "you" : `${f.line.title} ’${String(f.line.year).slice(2)}`,
				title: you
					? `From ${f.line.title}`
					: `${f.line.title}, ${f.line.year}, ${Math.floor(f.time / 60)}:${String(f.time % 60).padStart(2, "0")} into the record`,
				kind: you ? "you" : "him",
			});
		}
		return out;
	}, [ledger, state.lineup]);

	const latest = useRef({ score, compiled, state, player, memory });
	latest.current = { score, compiled, state, player, memory };

	const stop = useCallback(() => {
		transport.current?.stop();
		setPlaying(false);
		setPending(null);
		if (latest.current.state.lineup === "trade")
			setSaid(introCue(spec(latest.current.player)));
	}, []);

	const ensureBand = useCallback(() => {
		if (!band.current) {
			band.current = new Band();
			transport.current = new Transport(
				band.current,
				chorus,
				latest.current.score,
			);
		}
		return band.current;
	}, []);

	const start = useCallback(async () => {
		await ensureBand().resume();
		const t = transport.current;
		if (!t) return;
		t.queue(latest.current.score, latest.current.compiled);
		t.warm();
		tradeFrom.current = null;
		block.current = null;
		answered.current.clear();
		takes.current = [];
		setLive([]);
		t.start(true);
		setSilence((n) => n + 1);
		setPlaying(true);
	}, [ensureBand]);

	useEffect(
		() => () => {
			ear.current?.stop();
			band.current?.close();
		},
		[],
	);

	const noteOn = useCallback(
		(key: number, id: string) => {
			const b = ensureBand();
			b.resume();
			held.current.get(id)?.release();
			const pos = transport.current?.position();
			const take =
				pos && pos.clock >= -0.05 ? { key, clock: pos.clock, end: null } : null;
			if (take && latest.current.state.lineup === "trade") {
				takes.current.push(take);
				setLive((l) => [...l, { ...take }]);
			}
			held.current.set(id, { key, take, release: b.hold(key) });
			setDown(new Set([...held.current.values()].map((h) => h.key)));
		},
		[ensureBand],
	);

	const noteOff = useCallback((id: string) => {
		const h = held.current.get(id);
		if (!h) return;
		held.current.delete(id);
		h.release();
		const pos = transport.current?.position();
		if (h.take && pos) {
			h.take.end = pos.clock;
			const { clock, end } = h.take;
			setLive((l) =>
				l.map((n) =>
					n.clock === clock && n.key === h.key ? { ...n, end } : n,
				),
			);
		}
		setDown(new Set([...held.current.values()].map((x) => x.key)));
	}, []);

	useEffect(() => {
		const keyOf = (event: KeyboardEvent) =>
			letters.indexOf(event.key.toLowerCase());
		const press = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if ((event.target as HTMLElement | null)?.closest("input, textarea"))
				return;
			const k = keyOf(event);
			if (k < 0) return;
			event.preventDefault();
			if (!event.repeat) noteOn(pad[k], `key:${k}`);
		};
		const release = (event: KeyboardEvent) => {
			const k = keyOf(event);
			if (k >= 0) noteOff(`key:${k}`);
		};
		const blur = () => {
			for (const id of [...held.current.keys()]) noteOff(id);
		};
		window.addEventListener("keydown", press);
		window.addEventListener("keyup", release);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("keydown", press);
			window.removeEventListener("keyup", release);
			window.removeEventListener("blur", blur);
		};
	}, [noteOn, noteOff]);

	const toggleHum = useCallback(async () => {
		if (ear.current?.listening) {
			ear.current.stop();
			setHum("off");
			return;
		}
		const b = ensureBand();
		await b.resume();
		ear.current = new Ear(b.ctx, pad, (key) => {
			if (key === null) noteOff("ear");
			else noteOn(key, "ear");
		});
		try {
			await ear.current.start();
			setHum("on");
		} catch {
			ear.current = null;
			setHum("denied");
		}
	}, [ensureBand, noteOn, noteOff]);

	const answer = useCallback(
		(start: number, placed: Placed[], mine: number | null) => {
			const { player: who, memory: depth } = latest.current;
			const theirs = wrapBar(start);
			const history = placed.length
				? placed.map((p) => p.key)
				: lastAnswer.current;
			const reply = ask({
				player: who,
				memory: depth,
				history,
				roles: roles.slice(theirs, theirs + 4),
				yours: yours.current,
			});
			lastAnswer.current = reply.notes.map((p) => p.key);
			const you = rests();
			if (mine !== null) {
				if (placed.length)
					yours.current = [
						...yours.current.slice(-5),
						yourLine(
							placed,
							yours.current.length + 1,
							roles.slice(mine, mine + 4),
						),
					];
				bars(placed, 4).forEach((b, i) => {
					you[mine + i] = b;
				});
			}
			const lane = rests();
			bars(reply.notes, 4).forEach((b, i) => {
				lane[theirs + i] = b;
			});
			const voice = spec(who).voice;
			land.current = start;
			setEdits((e) =>
				Object.fromEntries(
					Object.entries(e).filter(([l]) => l !== "you" && l !== voice),
				),
			);
			setTrading({ voice, you, answer: lane });
			setChanged(["you", voice]);
			const heardFrom = placed[placed.length - reply.heard];
			const heardTo = placed[placed.length - 1];
			setLedger({
				player: who,
				answer: reply,
				heard: placed.map((p) => p.key),
				bar: theirs,
				silent: mine !== null && !placed.length,
				opening: mine === null,
				heardSpan:
					mine !== null && heardFrom && heardTo && reply.heard > 0
						? [
								mine + heardFrom.at / slotsPerBar,
								mine + (heardTo.at + heardTo.length) / slotsPerBar,
							]
						: null,
			});
		},
		[],
	);

	const respond = useCallback(
		(begin: number, cutoff: number) => {
			const placed = transcribe(
				takes.current,
				begin,
				4,
				cutoff,
				latest.current.score.swing,
			);
			takes.current = takes.current.filter((t) => t.clock >= cutoff);
			answer(begin + 4, placed, wrapBar(begin));
			setLive((l) => l.filter((x) => x.clock >= cutoff));
		},
		[answer],
	);

	useEffect(() => {
		const el = root.current;
		if (!playing || !el) return;
		let frame = 0;
		const loop = () => {
			frame = requestAnimationFrame(loop);
			const pos = transport.current?.position();
			if (!pos) return;
			const counting = pos.bar < 0;
			const t = counting ? 0 : pos.bar + pos.beat / 4;
			arm.current?.setAttribute(
				"transform",
				`rotate(${(t / chorus) * 360} 500 500)`,
			);
			if (count.current)
				count.current.textContent = counting
					? String(Math.floor(pos.beat) + 1)
					: "";
			setPending((p) => (p && pos.clock >= p.at ? null : p));
			const now = latest.current;
			const trade = now.state.lineup === "trade";
			const panel = turn.current;
			let from = tradeFrom.current;
			if (trade && from === null) {
				from = counting ? 0 : Math.ceil((pos.clock + 0.05) / 4) * 4;
				tradeFrom.current = from;
				answered.current.add(-1);
				answer(from, [], null);
			}
			if (!trade) {
				tradeFrom.current = from = null;
				block.current = null;
				const label = panel?.querySelector(".jz-turn-label");
				if (label && label.textContent !== "Play along on the keys")
					label.textContent = "Play along on the keys";
				if (panel?.dataset.turn) delete panel.dataset.turn;
				const fill = panel?.querySelector<HTMLElement>(".jz-turn-track i");
				if (fill) fill.style.transform = "scaleX(0)";
			}
			if (from !== null) {
				const n = Math.floor((pos.clock - from) / 4);
				const begin = from + n * 4;
				const perBar = 240 / now.score.tempo;
				const cutoff = begin + 4 - Math.max(1 / 8, 0.3 / perBar);
				const who = spec(now.player);
				if (n % 2 === 1 && pos.clock >= cutoff && !answered.current.has(n)) {
					answered.current.add(n);
					respond(begin, cutoff);
				}
				if (n !== block.current) {
					block.current = n;
					setSaid(n < 0 ? waitCue(who, wrapBar(from) + 1) : turnCue(who, n));
				}
				if (panel) {
					const yourTurn = n >= 0 && n % 2 === 1;
					const label = panel.querySelector(".jz-turn-label");
					const fill = panel.querySelector<HTMLElement>(".jz-turn-track i");
					const bar = Math.floor(pos.clock - begin) + 1;
					const text =
						n < 0
							? `${who.short} starts on bar ${wrapBar(from) + 1}`
							: yourTurn
								? `Your four · bar ${bar} of 4`
								: `${who.short} · bar ${bar} of 4`;
					if (label && label.textContent !== text) label.textContent = text;
					panel.dataset.turn = n < 0 ? "wait" : yourTurn ? "you" : "them";
					if (fill)
						fill.style.transform = `scaleX(${n < 0 ? 0 : (pos.clock - begin) / 4})`;
				}
				for (const sector of el.querySelectorAll<SVGGElement>(
					".jz-sector[data-bar]",
				)) {
					const b = Number(sector.dataset.bar);
					const cur = Math.floor(Math.max(0, pos.clock));
					const a = cur + ((b - (cur % chorus) + chorus) % chorus);
					const k = Math.floor((a - from) / 4);
					const turnOf = k < 0 ? "" : k % 2 === 1 ? "you" : "them";
					if ((sector.dataset.turn ?? "") !== turnOf) {
						if (turnOf) sector.dataset.turn = turnOf;
						else delete sector.dataset.turn;
					}
				}
			}
			const on = new Set<string>();
			for (const note of el.querySelectorAll<SVGGElement>(
				".jz-dial [data-t0]",
			)) {
				const active =
					!counting &&
					t >= Number(note.dataset.t0) &&
					t < Number(note.dataset.t1);
				if (active) on.add(note.dataset.token ?? "");
				if (active !== note.hasAttribute("data-on"))
					note.toggleAttribute("data-on", active);
			}
			for (const token of el.querySelectorAll<HTMLElement>(
				".jz-code-mirror [data-token]",
			)) {
				const active = on.has(token.dataset.token ?? "");
				if (active !== token.hasAttribute("data-on"))
					token.toggleAttribute("data-on", active);
			}
			for (const sector of el.querySelectorAll<SVGGElement>("[data-bar]")) {
				const active = !counting && Number(sector.dataset.bar) === pos.bar;
				if (active !== sector.hasAttribute("data-on"))
					sector.toggleAttribute("data-on", active);
			}
			for (const field of el.querySelectorAll<HTMLElement>(".jz-code-field")) {
				const input = field.querySelector("input");
				const token = field.querySelector<HTMLElement>(
					".jz-code-mirror [data-on]",
				);
				if (!input || !token || document.activeElement === input) continue;
				const view = input.clientWidth;
				const left = token.offsetLeft;
				if (
					left < input.scrollLeft ||
					left + token.offsetWidth > input.scrollLeft + view - 16
				)
					input.scrollLeft = Math.max(0, left - view * 0.2);
			}
		};
		frame = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(frame);
			for (const node of el.querySelectorAll("[data-on], [data-turn]")) {
				node.removeAttribute("data-on");
				node.removeAttribute("data-turn");
			}
			arm.current?.setAttribute("transform", "rotate(0 500 500)");
			if (count.current) count.current.textContent = "";
		};
	}, [playing, respond, answer]);

	const leaveTrade = () => {
		setTrading(null);
		setLedger(null);
		setLive([]);
		takes.current = [];
		tradeFrom.current = null;
		block.current = null;
		answered.current.clear();
	};

	const onPlayer = (id: PlayerId) => {
		if (state.lineup === "trade" && id === player) return;
		const next = spec(id);
		if (state.lineup !== "trade") leaveTrade();
		setTrading({ voice: next.voice, you: rests(), answer: rests() });
		setPlayer(id);
		setState((s) => ({ ...s, lineup: "trade", swing: true }));
		setEdits({});
		setChanged(["you", next.voice]);
		setFocus(null);
		setLedger(null);
		if (state.lineup === "trade") {
			tradeFrom.current = null;
			block.current = null;
			answered.current.clear();
		}
		setSaid(introCue(next));
	};

	const onLineup = (lineup: Calls["lineup"]) => {
		if (lineup === state.lineup) return;
		if (lineup === "trade") {
			onPlayer(player);
			return;
		}
		if (lineup === "lead") {
			if (state.lineup === "trade") leaveTrade();
			setState((s) => ({ ...s, lineup: "lead" }));
			setEdits({});
			setChanged(["cornet", "clarinet", "trombone", "you"]);
			setSaid({
				shout: "Take the melody!",
				text: "The cornet plays the tune the band was built around, with piano and banjo behind it.",
				record: null,
			});
			return;
		}
		onCall(lineup);
	};

	const onCall = (id: CallId) => {
		if (
			state.lineup === "trade" &&
			["everybody", "clarinet", "answer"].includes(id)
		)
			leaveTrade();
		const next = call(state, id);
		const before = arrange(state);
		const after = arrange(next);
		const lanes = laneIds.filter((l) => before.code[l] !== after.code[l]);
		lastCall.current = id;
		setState(next);
		setEdits((e) =>
			Object.fromEntries(
				Object.entries(e).filter(([l]) => !lanes.includes(l as LaneId)),
			),
		);
		setChanged([
			...lanes,
			...(before.tempo !== after.tempo ? ["tempo"] : []),
			...(before.swing !== after.swing ? ["swing"] : []),
		]);
		setSaid(caption(next, id));
		setFocus(null);
	};

	return (
		<div
			className="jz"
			ref={root}
			data-playing={playing || undefined}
			data-them={players.find((p) => p.id === player)?.voice}
		>
			<div className="jz-stage">
				<div className="jz-clock">
					<Clock
						sources={sources}
						heard={
							ledger?.heardSpan && state.lineup === "trade"
								? ledger.answer.heard
								: 0
						}
						compiled={compiled}
						ratio={score.swing}
						focus={focus}
						live={live}
						arm={arm}
						onFocus={(f) => {
							setFocus(f);
							if (f) setChartOpen(true);
						}}
					/>
					<button
						type="button"
						className="jz-start"
						aria-pressed={playing}
						aria-label={playing ? "Stop the band" : "Count the band in"}
						onClick={() => (playing ? stop() : start())}
					>
						<span ref={count} className="jz-count" aria-hidden="true" />
						<svg
							viewBox="0 0 12 12"
							aria-hidden="true"
							className="jz-start-icon"
						>
							{playing ? (
								<rect x="2" y="2" width="8" height="8" />
							) : (
								<polygon points="3,1.5 11,6 3,10.5" />
							)}
						</svg>
						<span className="jz-start-label">
							{playing ? "Stop" : "Count in"}
						</span>
					</button>
				</div>
				<div className="jz-panel">
					<Cue
						caption={said}
						onRecord={(id) => {
							stop();
							setRecord((r) => ({ id, n: (r?.n ?? 0) + 1 }));
						}}
					/>
					<Players
						player={player}
						trading={state.lineup === "trade"}
						onPlayer={onPlayer}
					/>
					<Horn
						down={down}
						hum={hum}
						turn={turn}
						voice={spec(player).voice}
						onDown={noteOn}
						onUp={noteOff}
						onHum={toggleHum}
					/>
					<Provenance
						ledger={ledger}
						player={player}
						memory={memory}
						onMemory={setMemory}
					/>

					<details
						className="jz-more"
						open={bandOpen}
						onToggle={(event) => setBandOpen(event.currentTarget.open)}
					>
						<summary>
							<span>Lead the band</span>
							<small>{deskSummary(state, spec(player).short)}</small>
						</summary>
						<BandDesk
							state={state}
							player={spec(player).short}
							pending={pending?.id ?? null}
							caption={said}
							onCall={onCall}
							onLineup={onLineup}
						/>
					</details>
					<details
						className="jz-more"
						open={chartOpen}
						onToggle={(event) => setChartOpen(event.currentTarget.open)}
					>
						<summary>
							<span>The chart</span>
							<small>Every part, bar by bar, ready to change</small>
						</summary>
						<Chart
							score={score}
							compiled={compiled}
							problems={problems}
							changed={changed}
							focus={focus}
							onFocus={setFocus}
							edited={Object.keys(edits).length > 0 || state !== home}
							onCode={(lane, code) => {
								setEdits((e) => ({ ...e, [lane]: code }));
								setChanged([lane]);
							}}
							onReset={() => {
								leaveTrade();
								setState(home);
								setTrading({
									voice: spec(player).voice,
									you: rests(),
									answer: rests(),
								});
								setEdits({});
								setChanged([]);
								setSaid(introCue(spec(player)));
								setFocus(null);
							}}
						/>
					</details>
				</div>
			</div>
			<Crate
				request={record}
				silence={silence}
				onPlaying={(on) => {
					if (on) stop();
				}}
			/>
		</div>
	);
}
