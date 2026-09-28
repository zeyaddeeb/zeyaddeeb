import { useState } from "react";
import { TRUST } from "./format";
import type { BlueprintNode, Link, Trust } from "./protocol";

const RUNGS: { id: string; title: string; note: string; trusts: Trust[] }[] = [
	{
		id: "known",
		title: "Known",
		note: "Published, or proved in Mathlib",
		trusts: ["literature", "mathlib"],
	},
	{
		id: "open",
		title: "Open",
		note: "Stated, not yet settled",
		trusts: ["open"],
	},
	{
		id: "conjectured",
		title: "Conjectured",
		note: "Its own claims, untested",
		trusts: ["conjectured"],
	},
	{
		id: "measured",
		title: "Measured",
		note: "A prediction held",
		trusts: ["measured"],
	},
	{
		id: "verified",
		title: "Proved",
		note: "Checked by Lean",
		trusts: ["verified"],
	},
	{
		id: "refuted",
		title: "Refuted",
		note: "A prediction broke",
		trusts: ["refuted"],
	},
];

const SHOWN = 5;

interface Entry {
	node: BlueprintNode;
	copies: number;
}

function title(text: string): string {
	return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function entries(nodes: BlueprintNode[]): Entry[] {
	const seen = new Map<string, Entry>();
	for (const node of nodes) {
		const key = title(node.title);
		const known = seen.get(key);
		if (known) known.copies += 1;
		else seen.set(key, { node, copies: 1 });
	}
	return [...seen.values()];
}

const FORWARD: Record<Link["relation"], string> = {
	implies: "implies",
	equivalent: "is equivalent to",
	uses: "uses",
	supports: "supports",
	refutes: "refutes",
	analogy: "is analogous to",
};

const BACKWARD: Record<Link["relation"], string> = {
	implies: "is implied by",
	equivalent: "is equivalent to",
	uses: "is used by",
	supports: "is supported by",
	refutes: "is refuted by",
	analogy: "is analogous to",
};

function Detail({
	node,
	nodes,
	links,
	onSelect,
}: {
	node: BlueprintNode;
	nodes: Record<string, BlueprintNode>;
	links: Link[];
	onSelect: (key: string) => void;
}) {
	const related = links.filter((l) => l.from === node.key || l.to === node.key);
	return (
		<article className="ns-detail" aria-live="polite">
			<p className="ns-eyebrow">
				{node.key} · {TRUST[node.trust]}
				{node.source ? ` · ${node.source}` : ""}
			</p>
			<h4>{node.title}</h4>
			<p>{node.body}</p>
			{node.proof ? (
				<pre className="ns-code">{node.proof}</pre>
			) : node.lean ? (
				<pre className="ns-code">{node.lean}</pre>
			) : null}
			{node.evidence.length ? (
				<ul className="ns-evidence">
					{node.evidence.map((e) => (
						<li
							key={`${e.episode}-${e.tool}-${e.summary}`}
							data-held={e.held ?? undefined}
						>
							<span className="ns-evidence-episode">Episode {e.episode}</span>
							<span className="ns-evidence-text">{e.summary}</span>
						</li>
					))}
				</ul>
			) : null}
			{related.length ? (
				<ul className="ns-relations">
					{related.map((l) => {
						const other = l.from === node.key ? l.to : l.from;
						const phrase =
							l.from === node.key ? FORWARD[l.relation] : BACKWARD[l.relation];
						return (
							<li key={`${l.from}-${l.relation}-${l.to}`}>
								{phrase}{" "}
								<button type="button" onClick={() => onSelect(other)}>
									{nodes[other]?.title ?? other}
								</button>
								{l.episode > 0 ? (
									<span className="ns-relation-source">
										its own link, episode {l.episode}
									</span>
								) : null}
							</li>
						);
					})}
				</ul>
			) : null}
		</article>
	);
}

export function Ladder({
	nodes,
	links,
}: {
	nodes: Record<string, BlueprintNode>;
	links: Link[];
}) {
	const [selected, setSelected] = useState<string>("rh");
	const all = Object.values(nodes).sort((a, b) => b.updated - a.updated);
	const chosen = nodes[selected];
	return (
		<section className="ns-block ns-ladder" aria-labelledby="ns-ladder-title">
			<header className="ns-block-head">
				<h3 id="ns-ladder-title">The blueprint</h3>
				<p>
					Every claim sits on the rung it has earned. Its own words never count:
					a claim climbs only when an instrument agrees with a prediction made
					in advance, or when Lean checks a proof.
				</p>
			</header>
			<ol className="ns-rungs">
				{RUNGS.map((rung) => {
					const held = all.filter((n) => rung.trusts.includes(n.trust));
					const listed = entries(held);
					return (
						<li key={rung.id} className="ns-rung" data-rung={rung.id}>
							<p className="ns-rung-head">
								<span>{rung.title}</span>
								<b>{held.length}</b>
							</p>
							<p className="ns-rung-note">{rung.note}</p>
							<ul>
								{listed.slice(0, SHOWN).map(({ node, copies }) => (
									<li key={node.key}>
										<button
											type="button"
											aria-pressed={node.key === selected}
											onClick={() => setSelected(node.key)}
										>
											{node.title}
											{copies > 1 ? (
												<span className="ns-rung-copies"> ×{copies}</span>
											) : null}
										</button>
									</li>
								))}
							</ul>
							<p className="ns-rung-more">
								{listed.length > SHOWN
									? `and ${listed.length - SHOWN} more`
									: ""}
							</p>
						</li>
					);
				})}
			</ol>
			{chosen ? (
				<Detail
					node={chosen}
					nodes={nodes}
					links={links}
					onSelect={setSelected}
				/>
			) : null}
		</section>
	);
}
