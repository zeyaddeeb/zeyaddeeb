"use client";

import { useEffect, useRef, useState } from "react";

type Status =
	| "Pending"
	| "ContainerCreating"
	| "Running"
	| "OOMKilled"
	| "Terminating";

interface Pod {
	name: string;
	status: Status;
	restarts: number;
	created: number;
	since: number;
}

interface Cluster {
	pods: Pod[];
	desired: number;
	events: string[];
}

const RS = "api-6f7c9b5d4";
const ALPHABET = "bcdfghjklmnpqrstvwxz2456789";
const TICK = 250;
const OOM = 0.006;

const name = () =>
	`${RS}-${Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("")}`;

function age(ms: number) {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	return m < 60 ? `${m}m${s % 60}s` : `${Math.floor(m / 60)}h${m % 60}m`;
}

function reconcile(c: Cluster, now: number): Cluster {
	const events = [...c.events];
	const log = (e: string) => {
		events.push(e);
		if (events.length > 4) events.shift();
	};

	let pods = c.pods.flatMap((p): Pod[] => {
		const dwell = now - p.since;
		switch (p.status) {
			case "Pending":
				return dwell > 700
					? [{ ...p, status: "ContainerCreating", since: now }]
					: [p];
			case "ContainerCreating":
				return dwell > 1500 ? [{ ...p, status: "Running", since: now }] : [p];
			case "OOMKilled":
				if (dwell > 2200) {
					log(`Started container api in pod ${p.name}`);
					return [
						{ ...p, status: "Running", restarts: p.restarts + 1, since: now },
					];
				}
				return [p];
			case "Terminating":
				return dwell > 1400 ? [] : [p];
			default:
				if (Math.random() < OOM) {
					log(
						`Container api in pod ${p.name} exceeded its memory limit (OOMKilled)`,
					);
					return [{ ...p, status: "OOMKilled", since: now }];
				}
				return [p];
		}
	});

	const live = pods.filter((p) => p.status !== "Terminating");
	if (live.length < c.desired) {
		for (let i = live.length; i < c.desired; i++) {
			const p: Pod = {
				name: name(),
				status: "Pending",
				restarts: 0,
				created: now,
				since: now,
			};
			pods.push(p);
			log(`Created pod: ${p.name}`);
		}
	} else if (live.length > c.desired) {
		const extra = live.slice(c.desired);
		pods = pods.map((p) =>
			extra.includes(p)
				? { ...p, status: "Terminating" as const, since: now }
				: p,
		);
		for (const p of extra) log(`Deleted pod: ${p.name}`);
	}
	return { pods, desired: c.desired, events };
}

const READY: Record<Status, string> = {
	Running: "1/1",
	Pending: "0/1",
	ContainerCreating: "0/1",
	OOMKilled: "0/1",
	Terminating: "1/1",
};

export function ClusterScreen() {
	const [cluster, setCluster] = useState<Cluster>({
		pods: [],
		desired: 6,
		events: [],
	});
	const [now, setNow] = useState(() => Date.now());
	const started = useRef(Date.now());

	useEffect(() => {
		const id = setInterval(() => {
			const t = Date.now();
			setNow(t);
			setCluster((c) => reconcile(c, t));
		}, TICK);
		return () => clearInterval(id);
	}, []);

	const kill = (target: Pod) =>
		setCluster((c) => ({
			...c,
			pods: c.pods.map((p) =>
				p === target && p.status !== "Terminating"
					? { ...p, status: "Terminating", since: Date.now() }
					: p,
			),
			events: [...c.events, `Deleted pod: ${target.name}`].slice(-4),
		}));

	const scale = (d: number) =>
		setCluster((c) => ({
			...c,
			desired: Math.max(1, Math.min(9, c.desired + d)),
		}));

	const ready = cluster.pods.filter((p) => p.status === "Running").length;
	const rows = [...cluster.pods].sort((a, b) => a.created - b.created);

	return (
		<div className="k8s">
			<div className="k8s__cmd">$ kubectl get pods -w</div>
			<table className="k8s__table">
				<thead>
					<tr>
						<th>NAME</th>
						<th>READY</th>
						<th>STATUS</th>
						<th>RESTARTS</th>
						<th>AGE</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((p) => (
						<tr key={p.name} data-status={p.status}>
							<td>
								<button
									type="button"
									className="k8s__pod"
									onClick={() => kill(p)}
									disabled={p.status === "Terminating"}
									aria-label={`Delete pod ${p.name}`}
									title="kubectl delete pod"
								>
									{p.name}
								</button>
							</td>
							<td>{READY[p.status]}</td>
							<td>{p.status}</td>
							<td>{p.restarts}</td>
							<td>{age(now - p.created)}</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="k8s__deploy">
				<span>deployment.apps/api</span>
				<span>
					READY {ready}/{cluster.desired}
				</span>
				<span className="k8s__scale">
					replicas
					<button
						type="button"
						onClick={() => scale(-1)}
						aria-label="Scale down"
					>
						−
					</button>
					{cluster.desired}
					<button type="button" onClick={() => scale(1)} aria-label="Scale up">
						+
					</button>
				</span>
				<span>{age(now - started.current)}</span>
			</div>
			<ul className="k8s__events" aria-label="Events">
				{cluster.events.map((e, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a short rolling log
					<li key={i}>{e}</li>
				))}
			</ul>
		</div>
	);
}
