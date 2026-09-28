import { count, duration } from "./format";
import type { PageView } from "./page";
import type { Front } from "./protocol";
import type { Live } from "./reduce";
import { activity, plan } from "./status";
import type { Opened } from "./use-transcript";

function titled(fronts: Front[], id: string | null) {
	return fronts.find((f) => f.id === id);
}

export function liveView(
	live: Live,
	fronts: Front[],
	now: number,
	off = false,
): PageView {
	const front = titled(fronts, live.front);
	const planned = plan(live);
	const base = {
		live: true,
		objective: planned?.objective ?? null,
		prediction: planned?.prediction ?? null,
		turns: live.turns,
		search: live.search,
		status: activity(live, now),
	};
	if (off)
		return {
			...base,
			live: false,
			turns: [],
			search: [],
			title: "Off shift",
			question: "The agent is switched off, and its notebook is still empty.",
			status: "Nothing is running.",
		};
	if (live.mode === "sleep")
		return {
			...base,
			title: `Asleep after episode ${live.state.episodes}`,
			question: "Turning what happened into what it knows.",
		};
	if (live.episode === null)
		return {
			...base,
			title: "Between episodes",
			question: "Waiting for the next episode.",
		};
	return {
		...base,
		title: `Episode ${live.episode} · ${front?.title ?? live.front}`,
		question: front?.question ?? "",
	};
}

export function archivedView(opened: Opened, fronts: Front[]): PageView {
	const empty = {
		live: false,
		objective: null,
		prediction: null,
		turns: [],
		search: [],
	};
	if (opened.state !== "ready")
		return {
			...empty,
			title: `Episode ${opened.number}`,
			question:
				opened.state === "loading"
					? "Opening the notebook…"
					: "This page has been let go; only its summary is kept.",
			status: "",
		};
	const { episode } = opened;
	const front = titled(fronts, episode.front);
	return {
		...empty,
		title: `Episode ${episode.number} · ${front?.title ?? episode.front}`,
		question: front?.question ?? "",
		objective: episode.objective || null,
		prediction: episode.prediction || null,
		turns: opened.turns,
		status: [
			`${episode.held} held`,
			`${episode.broken} broke`,
			episode.known ? `${episode.known} known in advance` : null,
			`${episode.verified} proved`,
			episode.routine ? `${episode.routine} routine` : null,
			duration(episode.ended - episode.started),
			`${count(episode.tokens)} tokens`,
		]
			.filter(Boolean)
			.join(" · "),
	};
}
