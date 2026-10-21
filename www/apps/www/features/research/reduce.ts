import type {
	Card,
	Envelope,
	Episode,
	Overview,
	RuleState,
	Tally,
	Vitals,
} from "./protocol";

export const EPISODES = 40;
export const CARDS = 40;
const DELTA_CHARS = 1200;

export interface Live {
	seq: number;
	episode: number;
	front: string;
	thought: string;
	said: string;
	steps: { id: string; tool: string; ok?: boolean; summary?: string }[];
	reading: Record<string, number> | null;
	state: Vitals;
	tally: Tally;
	episodes: Episode[];
	cards: Card[];
	rules: RuleState | null;
	resting: string | null;
	trouble: string | null;
}

export function initial(overview: Overview): Live {
	const start: Live = {
		seq: 0,
		episode: 0,
		front: overview.fronts[0]?.id ?? "",
		thought: "",
		said: "",
		steps: [],
		reading: null,
		state: overview.state,
		tally: overview.tally,
		episodes: overview.episodes,
		cards: overview.cards,
		rules: overview.rules ?? null,
		resting: null,
		trouble: null,
	};

	return overview.backlog.reduce(reduce, start);
}

export function reduce(live: Live, envelope: Envelope): Live {
	if (envelope.seq <= live.seq) return live;

	const next: Live = { ...live, seq: envelope.seq };

	switch (envelope.type) {
		case "wake":
			return {
				...next,
				episode: envelope.episode,
				front: envelope.front,
				thought: "",
				said: "",
				steps: [],
				reading: null,
				resting: null,
				trouble: null,
			};
		case "stats":
			return { ...next, state: envelope.state };
		case "phase":
			return { ...next, resting: envelope.reason };
		case "trouble":
			return { ...next, trouble: envelope.message };
		case "retry":
			return {
				...next,
				trouble: `the model server dropped the turn (${envelope.drops})`,
			};
		case "delta":
			return envelope.channel === "think"
				? { ...next, thought: clip(live.thought + envelope.text) }
				: { ...next, said: clip(live.said + envelope.text) };
		case "call":
			return {
				...next,
				steps: [...live.steps, { id: envelope.id, tool: envelope.tool }],
			};
		case "outcome":
			return {
				...next,
				reading: envelope.data ?? live.reading,
				steps: live.steps.map((step) =>
					step.id === envelope.id
						? { ...step, ok: envelope.ok, summary: envelope.summary }
						: step,
				),
			};
		case "card":
			return next;
		case "concluded":
			return {
				...next,
				episodes: [envelope.episode, ...live.episodes].slice(0, EPISODES),
				resting: null,
			};
		default:
			return next;
	}
}

function clip(text: string): string {
	if (text.length <= DELTA_CHARS) return text;

	return text.slice(text.length - DELTA_CHARS);
}

export function refreshed(live: Live, overview: Overview): Live {
	return {
		...live,
		state: overview.state,
		tally: overview.tally,
		episodes: overview.episodes,
		cards: overview.cards,
		rules: overview.rules ?? live.rules,
	};
}
