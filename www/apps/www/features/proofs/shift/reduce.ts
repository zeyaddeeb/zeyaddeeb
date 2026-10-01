import type {
	AgentState,
	Arm,
	BlueprintNode,
	Envelope,
	Episode,
	Layer,
	Lemma,
	Link,
	Overview,
	Phase,
	Rules,
	SearchStep,
	Tree,
	Verdict,
} from "./protocol";

export interface Outcome {
	ok: boolean;
	summary: string;
	verdict: Verdict | null;
	data: unknown;
}

export interface CallView {
	id: string;
	tool: string;
	args: Record<string, unknown>;
	outcome: Outcome | null;
}

export interface TurnView {
	index: number;
	think: string;
	say: string;
	calls: CallView[];
}

export interface Scan {
	kind: "line" | "contour";
	from: number;
	to: number;
	sigma: [number, number] | null;
	zeros: number[];
	found: number | null;
}

export interface Live {
	seq: number;
	mode: "work" | "sleep" | "revise" | "idle";
	layer: Layer | null;
	episode: number | null;
	front: string | null;
	version: number | null;
	arms: Arm[];
	phase: {
		phase: Phase;
		seconds: number | null;
		reason: string | null;
		at: number;
	} | null;
	turns: TurnView[];
	search: SearchStep[];
	scans: Scan[];
	trouble: { message: string; at: number } | null;
	state: AgentState;
	nodes: Record<string, BlueprintNode>;
	links: Link[];
	episodes: Episode[];
	lemmas: Lemma[];
	rules: Record<string, Rules>;
	tree: Tree | null;
}

const EPISODES = 60;

export function rulesKey(rules: Pick<Rules, "layer" | "version">): string {
	return `${rules.layer}-${rules.version}`;
}

export function lineage(
	overview: Pick<Overview, "rules">,
): Record<string, Rules> {
	return Object.fromEntries(
		(overview.rules ?? []).map((r) => [rulesKey(r), r]),
	);
}

export function initial(overview: Overview): Live {
	const start: Live = {
		seq: 0,
		mode: "idle",
		layer: null,
		episode: null,
		front: null,
		version: null,
		arms: [],
		phase: null,
		turns: [],
		search: [],
		scans: [],
		trouble: null,
		state: overview.state,
		nodes: Object.fromEntries(overview.nodes.map((n) => [n.key, n])),
		links: overview.links,
		episodes: overview.episodes,
		lemmas: overview.lemmas,
		rules: lineage(overview),
		tree: overview.tree ?? null,
	};

	return overview.backlog.reduce(reduce, start);
}

function turn(turns: TurnView[], index: number): [TurnView[], TurnView] {
	const found = turns.find((t) => t.index === index);

	if (found) return [turns, found];

	const created: TurnView = { index, think: "", say: "", calls: [] };

	return [[...turns, created].sort((a, b) => a.index - b.index), created];
}

function replace(turns: TurnView[], next: TurnView): TurnView[] {
	return turns.map((t) => (t.index === next.index ? next : t));
}

function scanOf(tool: string, data: unknown): Scan | null {
	const d = data as Record<string, unknown> | null;

	if (!d) return null;

	if (tool === "line" && typeof d.from === "number" && typeof d.to === "number")
		return {
			kind: "line",
			from: d.from,
			to: d.to,
			sigma: null,
			zeros: Array.isArray(d.zeros) ? (d.zeros as number[]) : [],
			found: null,
		};

	if (tool === "contour" && Array.isArray(d.t) && Array.isArray(d.sigma))
		return {
			kind: "contour",
			from: d.t[0] as number,
			to: d.t[1] as number,
			sigma: [d.sigma[0] as number, d.sigma[1] as number],
			zeros: [],
			found: typeof d.zeros === "number" ? d.zeros : null,
		};

	return null;
}

export function reduce(live: Live, envelope: Envelope): Live {
	if (envelope.seq <= live.seq) return live;

	const next = { ...live, seq: envelope.seq };

	switch (envelope.type) {
		case "wake":
			return {
				...next,
				mode: "work",
				layer: null,
				episode: envelope.episode,
				front: envelope.front,
				version: envelope.rules ?? null,
				arms: envelope.arms,
				phase: null,
				turns: [],
				search: [],
				scans: [],
				trouble: null,
			};
		case "sleep":
			return {
				...next,
				mode: "sleep",
				layer: null,
				phase: null,
				turns: [],
				search: [],
				trouble: null,
			};
		case "revise":
			return {
				...next,
				mode: "revise",
				layer: envelope.layer,
				phase: null,
				turns: [],
				search: [],
				trouble: null,
			};
		case "rules":
			return {
				...next,
				rules: { ...next.rules, [rulesKey(envelope.rules)]: envelope.rules },
			};
		case "phase":
			return {
				...next,
				phase: {
					phase: envelope.phase,
					seconds: envelope.seconds,
					reason: envelope.reason,
					at: envelope.at,
				},
			};
		case "retry":
			return {
				...next,
				turns: next.turns.map((t) =>
					t.index === envelope.turn ? { ...t, think: "", say: "" } : t,
				),
			};
		case "delta": {
			const [turns, found] = turn(next.turns, envelope.turn);

			const updated =
				envelope.channel === "think"
					? { ...found, think: found.think + envelope.text }
					: { ...found, say: found.say + envelope.text };

			return { ...next, turns: replace(turns, updated), phase: null };
		}
		case "call": {
			const [turns, found] = turn(next.turns, envelope.turn);

			if (found.calls.some((c) => c.id === envelope.id)) return next;

			const call: CallView = {
				id: envelope.id,
				tool: envelope.tool,
				args: envelope.args,
				outcome: null,
			};

			return {
				...next,
				turns: replace(turns, { ...found, calls: [...found.calls, call] }),
			};
		}
		case "outcome": {
			const [turns, found] = turn(next.turns, envelope.turn);

			const outcome: Outcome = {
				ok: envelope.ok,
				summary: envelope.summary,
				verdict: envelope.verdict,
				data: envelope.data,
			};

			const calls = found.calls.some((c) => c.id === envelope.id)
				? found.calls.map((c) => (c.id === envelope.id ? { ...c, outcome } : c))
				: [
						...found.calls,
						{ id: envelope.id, tool: envelope.tool, args: {}, outcome },
					];

			const scan = envelope.ok ? scanOf(envelope.tool, envelope.data) : null;

			return {
				...next,
				turns: replace(turns, { ...found, calls }),
				scans: scan ? [...next.scans, scan] : next.scans,
			};
		}
		case "node":
			return {
				...next,
				nodes: { ...next.nodes, [envelope.node.key]: envelope.node },
			};
		case "link": {
			const { from, to, relation } = envelope.link;

			const known = next.links.some(
				(l) => l.from === from && l.to === to && l.relation === relation,
			);

			return known ? next : { ...next, links: [...next.links, envelope.link] };
		}
		case "search":
			return {
				...next,
				search:
					envelope.step.parent === null
						? [envelope.step]
						: [...next.search, envelope.step],
			};
		case "concluded":
			return {
				...next,
				episodes: [
					envelope.episode,
					...next.episodes.filter((e) => e.number !== envelope.episode.number),
				].slice(0, EPISODES),
			};
		case "stats":
			return { ...next, state: envelope.state };
		case "trouble":
			return {
				...next,
				trouble: { message: envelope.message, at: envelope.at },
			};
	}
}
