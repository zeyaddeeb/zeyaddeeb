"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadArchive, replayOf } from "./archive";
import { PAIRS, shuffle } from "./deal";
import type { Deck } from "./deck";
import {
	type Clock,
	type Deal,
	parse,
	type Seen,
	sitesStatus,
	type Trial,
	trial,
} from "./protocol";
import { choose, leastKm, lightMs, SITES, type Site, site } from "./sites";

const BASE = "/experiments/minus-one-eighth";
const POLL_MS = 30_000;
const REVEAL_MS = 900;

export type Phase = "idle" | "checking" | "dealing" | "done" | "busy";

export interface Started {
	deal: Deal;
	west: Site;
	east: Site;
	lightUs: number;
	pairs: number;
	browser: boolean;
	recorded: string | null;
	resampled: boolean;
	pool: number;
}

export interface Run {
	phase: Phase;
	started: Started | null;
	clocks: { west: Clock; east: Clock } | null;
	trials: Trial[];
	lostSite: string | null;
}

export interface Sites {
	off: boolean;
	seen: Seen[];
}

const IDLE: Run = {
	phase: "idle",
	started: null,
	clocks: null,
	trials: [],
	lostSite: null,
};

const fallbackPair = (asked: readonly string[] | null) =>
	choose(
		SITES.map((s) => s.id),
		asked ?? undefined,
	) ?? choose(SITES.map((s) => s.id));

export function useDealer() {
	const [run, setRun] = useState<Run>(IDLE);
	const [sites, setSites] = useState<Sites | null>(null);
	const abort = useRef<AbortController | null>(null);
	const pending = useRef<Trial[]>([]);
	const frame = useRef<number | null>(null);
	const timers = useRef<number[]>([]);

	const flush = useCallback(() => {
		frame.current = null;

		const batch = pending.current;

		if (batch.length === 0) return;

		pending.current = [];
		setRun((r) => ({ ...r, trials: r.trials.concat(batch) }));
	}, []);

	const queue = useCallback(
		(trials: Trial[]) => {
			pending.current.push(...trials);
			frame.current ??= requestAnimationFrame(flush);
		},
		[flush],
	);

	const clear = useCallback(() => {
		abort.current?.abort();
		abort.current = null;
		pending.current = [];
		if (frame.current !== null) cancelAnimationFrame(frame.current);
		frame.current = null;
		for (const t of timers.current) window.clearTimeout(t);
		timers.current = [];
	}, []);

	const poll = useCallback(async () => {
		try {
			const response = await fetch(`${BASE}/sites`, { cache: "no-store" });
			const body = (await response.json()) as unknown;
			const parsed = sitesStatus.safeParse(body);

			if (parsed.success)
				setSites({ off: parsed.data.off, seen: parsed.data.sites });
		} catch {
			setSites({ off: true, seen: [] });
		}
	}, []);

	useEffect(() => {
		poll();

		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") poll();
		}, POLL_MS);

		return () => {
			window.clearInterval(id);
			clear();
		};
	}, [poll, clear]);

	const reveal = useCallback(
		(trials: Trial[]) => {
			const steps = 12;
			const size = Math.ceil(trials.length / steps);

			for (let i = 0; i < steps; i++)
				timers.current.push(
					window.setTimeout(
						() => {
							queue(trials.slice(i * size, (i + 1) * size));
							if (i !== steps - 1) return;

							flush();
							setRun((r) => ({ ...r, phase: "done" }));
						},
						((i + 1) * REVEAL_MS) / steps,
					),
				);
		},
		[flush, queue],
	);

	const local = useCallback(
		async (
			deal: Deal,
			deck: Deck,
			asked: readonly string[] | null,
			signal: AbortSignal,
		) => {
			const archive = await loadArchive();

			if (signal.aborted) return;

			const replayed = archive
				? replayOf(archive, deal, deck, Math.random, PAIRS)
				: null;
			const west = replayed ? site(replayed.run.west) : null;
			const east = replayed ? site(replayed.run.east) : null;

			if (archive && replayed && west && east) {
				setRun({
					phase: "dealing",
					started: {
						deal,
						west,
						east,
						lightUs: replayed.run.light_us,
						pairs: replayed.trials.length,
						browser: false,
						recorded: archive.recorded,
						resampled: replayed.resampled,
						pool: replayed.pool,
					},
					clocks: replayed.clocks,
					trials: [],
					lostSite: null,
				});
				reveal(replayed.trials);
				return;
			}

			const pair = fallbackPair(asked);

			if (!pair) return;

			const [w, e] = pair;

			setRun({
				phase: "dealing",
				started: {
					deal,
					west: w,
					east: e,
					lightUs: lightMs(leastKm(w, e)) * 1000,
					pairs: PAIRS,
					browser: true,
					recorded: null,
					resampled: false,
					pool: 0,
				},
				clocks: null,
				trials: [],
				lostSite: null,
			});
			reveal(shuffle(deal, deck));
		},
		[reveal],
	);

	const deal = useCallback(
		async (kind: Deal, deck: Deck, asked: readonly string[] | null) => {
			clear();

			const controller = new AbortController();

			abort.current = controller;
			setRun({ ...IDLE, phase: "checking" });

			let response: Response | null = null;

			try {
				response = await fetch(`${BASE}/runs`, {
					method: "POST",
					cache: "no-store",
					signal: controller.signal,
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						deal: kind,
						deck,
						...(asked ? { sites: asked } : {}),
					}),
				});
			} catch {
				if (controller.signal.aborted) return;
			}

			if (response?.status === 503) {
				const body = (await response.json().catch(() => ({}))) as {
					reason?: string;
				};

				if (body.reason === "busy") {
					setRun({ ...IDLE, phase: "busy" });
					return;
				}
			}

			if (!response?.ok || !response.body) {
				local(kind, deck, asked, controller.signal);
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let refused = false;

			const apply = (line: string) => {
				const event = parse(line);

				if (!event) return;

				switch (event.type) {
					case "sites":
						setSites({ off: false, seen: event.sites });
						break;
					case "refused":
						refused = true;
						break;
					case "start": {
						const west = site(event.west);
						const east = site(event.east);

						if (!west || !east) return;

						setRun((r) => ({
							...r,
							phase: "dealing",
							started: {
								deal: event.deal,
								west,
								east,
								lightUs: event.light_us,
								pairs: event.pairs,
								browser: false,
								recorded: null,
								resampled: false,
								pool: 0,
							},
						}));
						break;
					}
					case "clocks":
						setRun((r) => ({
							...r,
							clocks: { west: event.west, east: event.east },
						}));
						break;
					case "trials":
						queue(event.rows.map(trial));
						break;
					case "lost":
						setRun((r) => ({
							...r,
							lostSite: site(event.site)?.short ?? event.site,
						}));
						break;
					case "done":
						break;
				}
			};

			try {
				for (;;) {
					const { done, value } = await reader.read();

					if (done) break;

					buffer += decoder.decode(value, { stream: true });

					let at = buffer.indexOf("\n");

					while (at >= 0) {
						apply(buffer.slice(0, at));
						buffer = buffer.slice(at + 1);
						at = buffer.indexOf("\n");
					}
				}
			} catch {
				if (controller.signal.aborted) return;
			}

			if (buffer.trim()) apply(buffer);

			if (refused) {
				local(kind, deck, asked, controller.signal);
				return;
			}

			flush();
			setRun((r) => ({ ...r, phase: "done" }));
		},
		[clear, flush, local, queue],
	);

	return { run, sites, deal };
}
