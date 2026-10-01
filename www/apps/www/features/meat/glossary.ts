import { nats, plain } from "./answer";

export interface Term {
	name: string;
	text: string;
}

export const glossary: Record<string, Term> = {
	nats: {
		name: "NATS",
		text: "An open-source messaging system for [pub/sub](pub-sub) and request–reply, written in Go, with persistence provided by [JetStream](jetstream).",
	},
	"control-plane": {
		name: "control plane",
		text: "The part of a distributed system that manages [cluster](cluster) [metadata](metadata) and placement, as opposed to the [data plane](data-plane) that carries the messages.",
	},
	stream: {
		name: "stream",
		text: "In [JetStream](jetstream), a persistent, append-only log of messages bound to one or more [subjects](subject) and replicated by its own [Raft group](raft).",
	},
	"leader-election": {
		name: "leader election",
		text: "How the [replicas](replica) of a [Raft group](raft) choose the one that orders all writes, triggered when a [follower](follower) misses the leader’s [heartbeats](heartbeat).",
	},
	r3: {
		name: "R3",
		text: "A [replication factor](replication-factor) of three: the stream is stored on three servers and needs a [quorum](quorum) of two to accept writes.",
	},
	quorum: {
		name: "quorum",
		text: "The minimum number of voting members, a strict majority, that must store an entry before it is [committed](commit).",
	},
	pod: {
		name: "pod",
		text: "The smallest deployable unit in [Kubernetes](kubernetes): one or more [containers](container) sharing a [network namespace](namespace) and [volumes](volume), scheduled together onto a [node](node).",
	},
	churn: {
		name: "churn",
		text: "The rate at which pods are created and terminated, whether by [rolling updates](rolling-update), [autoscaling](autoscaling) or [evictions](eviction).",
	},
	jetstream: {
		name: "JetStream",
		text: "The persistence layer built into NATS: streams, [consumers](consumer) and key-value stores, with [at-least-once delivery](at-least-once).",
	},
	"pub-sub": {
		name: "pub/sub",
		text: "Publish–subscribe: publishers send messages to a [subject](subject) without knowing which subscribers, if any, will receive them.",
	},
	subject: {
		name: "subject",
		text: "A dot-separated name such as orders.created that NATS routes messages by. Subscribers can match subjects with wildcards.",
	},
	raft: {
		name: "Raft",
		text: "A [consensus algorithm](consensus) in which replicas elect a leader that appends entries to a [replicated log](replicated-log). An entry is committed once a quorum has stored it.",
	},
	replica: {
		name: "replica",
		text: "One copy of the data, kept on its own server.",
	},
	follower: {
		name: "follower",
		text: "A Raft node that accepts entries from the leader and becomes a [candidate](candidate) if it hears nothing before its [election timeout](election-timeout).",
	},
	heartbeat: {
		name: "heartbeat",
		text: "An empty AppendEntries [RPC](rpc) that the leader sends periodically so followers know it is alive.",
	},
	"election-timeout": {
		name: "election timeout",
		text: "A randomized interval, 150–300 ms in the Raft paper, after which a follower that hears nothing starts an election for a new [term](term).",
	},
	candidate: {
		name: "candidate",
		text: "A Raft node that has voted for itself and is asking the others for votes in a new [term](term).",
	},
	term: {
		name: "term",
		text: "A number that only ever increases, used by Raft as a [logical clock](logical-clock). Each term has at most one leader.",
	},
	"logical-clock": {
		name: "logical clock",
		text: "A counter that orders events in a distributed system without reference to wall-clock time, after Lamport (1978).",
	},
	rpc: {
		name: "RPC",
		text: "Remote procedure call: calling a function that runs on another machine as if it were local, over a network that may lose the call.",
	},
	"replication-factor": {
		name: "replication factor",
		text: "How many copies of each stream the cluster keeps. JetStream allows up to five.",
	},
	commit: {
		name: "commit",
		text: "In Raft, the point at which an entry is safe to apply to the [state machine](state-machine), because a majority has stored it.",
	},
	"state-machine": {
		name: "state machine",
		text: "The deterministic program each replica runs over the log, so the same entries in the same order always produce the same state.",
	},
	consensus: {
		name: "consensus",
		text: "Getting a group of machines to agree on one value even when some of them fail. [Paxos](paxos) and Raft are the usual algorithms.",
	},
	paxos: {
		name: "Paxos",
		text: "Leslie Lamport’s consensus algorithm, written up in 1989 as the parliament of a fictional Greek island and published in 1998.",
	},
	"replicated-log": {
		name: "replicated log",
		text: "An ordered list of commands that every replica applies in the same order, so they all end up in the same state.",
	},
	cluster: {
		name: "cluster",
		text: "A set of servers that route messages among themselves and behave as one system.",
	},
	metadata: {
		name: "metadata",
		text: "Data about the data: which streams exist, how they are configured and which server holds each replica.",
	},
	"data-plane": {
		name: "data plane",
		text: "The path the messages themselves take, as opposed to the control plane that decides where they go.",
	},
	kubernetes: {
		name: "Kubernetes",
		text: "An open-source [container](container) orchestrator that schedules pods onto [nodes](node) and [reconciles](reconcile) the cluster toward a declared state.",
	},
	container: {
		name: "container",
		text: "A process isolated with Linux [namespaces](namespace) and [cgroups](cgroups), started from an [image](image).",
	},
	namespace: {
		name: "namespace",
		text: "A Linux kernel feature that gives a process its own view of a resource, such as network interfaces, mounts or process IDs.",
	},
	volume: {
		name: "volume",
		text: "A directory mounted into a pod’s containers, backed by a disk, a network store or memory.",
	},
	node: {
		name: "node",
		text: "A worker machine, virtual or physical, running the [kubelet](kubelet).",
	},
	kubelet: {
		name: "kubelet",
		text: "The agent on each node that starts and stops containers to match the pod specs assigned to it by the [API server](api-server).",
	},
	"api-server": {
		name: "API server",
		text: "The front end of the Kubernetes control plane. It validates every change and stores cluster state in [etcd](etcd).",
	},
	etcd: {
		name: "etcd",
		text: "A consistent key-value store for cluster state, replicated with Raft.",
	},
	reconcile: {
		name: "reconcile",
		text: "To compare the desired state with the observed state and act to close the gap, in a loop run by a [controller](controller).",
	},
	controller: {
		name: "controller",
		text: "A control loop that watches the API server and moves the cluster toward what a resource specifies.",
	},
	"rolling-update": {
		name: "rolling update",
		text: "Replacing pods a few at a time so the service stays up, limited by [maxSurge](max-surge) and [maxUnavailable](max-unavailable).",
	},
	"max-surge": {
		name: "maxSurge",
		text: "How many pods above the desired count a rolling update may create at once.",
	},
	"max-unavailable": {
		name: "maxUnavailable",
		text: "How many pods below the desired count a rolling update may take down at once.",
	},
	autoscaling: {
		name: "autoscaling",
		text: "Adding or removing pods automatically based on metrics such as CPU, done by the [HorizontalPodAutoscaler](hpa).",
	},
	hpa: {
		name: "HorizontalPodAutoscaler",
		text: "A controller that sets a workload’s replica count from observed metrics, every 15 seconds by default.",
	},
	eviction: {
		name: "eviction",
		text: "Removing a pod from its node, for example when the node runs low on memory or is being [drained](drain).",
	},
	drain: {
		name: "drain",
		text: "Marking a node unschedulable and evicting its pods before maintenance.",
	},
	consumer: {
		name: "consumer",
		text: "A stateful view of a stream that tracks which messages a client has acknowledged.",
	},
	"at-least-once": {
		name: "at-least-once delivery",
		text: "A guarantee that every message arrives one or more times, so receivers must be [idempotent](idempotent).",
	},
	idempotent: {
		name: "idempotent",
		text: "Safe to apply twice: doing it again has the same effect as doing it once.",
	},
	cgroups: {
		name: "cgroups",
		text: "Control groups: a Linux kernel feature that limits the CPU, memory and I/O a group of processes can use.",
	},
	image: {
		name: "image",
		text: "A read-only, layered filesystem snapshot that a container starts from.",
	},
	"k8s-plain": {
		name: "Kubernetes",
		text: "The software that runs our programs on a group of servers, and restarts or moves them when it needs to.",
	},
	queue: {
		name: "message queue",
		text: "A service that holds messages from one program until another is ready to read them.",
	},
};

export interface Segment {
	text: string;
	id?: string;
}

export function segments(markup: string): Segment[] {
	const out: Segment[] = [];
	let last = 0;

	for (const m of markup.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
		const at = m.index ?? 0;

		if (at > last) out.push({ text: markup.slice(last, at) });

		out.push({ text: m[1], id: m[2] });
		last = at + m[0].length;
	}

	if (last < markup.length) out.push({ text: markup.slice(last) });

	return out;
}

export const children = (id: string) => [
	...new Set(
		segments(glossary[id]?.text ?? "").flatMap((s) => (s.id ? [s.id] : [])),
	),
];

export interface Source {
	id: "claude" | "person";
	label: string;
	markup: string;
	text: string;
}

export const sources: Source[] = [
	{
		id: "claude",
		label: "Claude",
		text: nats,
		markup:
			"[NATS](nats) [control-plane](control-plane) events: [stream](stream) [leader election](leader-election) / [R3](r3) [quorum](quorum) re-form during [pod](pod) [churn](churn).",
	},
	{
		id: "person",
		label: "A person",
		text: plain,
		markup:
			"[Kubernetes](k8s-plain) restarted the servers that run our [message queue](queue), and for a few minutes the queue couldn’t decide which copy was in charge, so checkout couldn’t save orders.",
	},
];

export interface Node {
	id: string;
	parent: string | null;
	depth: number;
	from: number;
	to: number;
}

export interface Reaction {
	seed: string[];
	nodes: Record<string, Node>;
	order: string[];
	opened: string[];
}

function spread(
	nodes: Record<string, Node>,
	order: string[],
	ids: string[],
	parent: string | null,
	depth: number,
	from: number,
	to: number,
) {
	const fresh = ids.filter((id) => !nodes[id]);
	const step = (to - from) / Math.max(1, fresh.length);

	fresh.forEach((id, i) => {
		nodes[id] = {
			id,
			parent,
			depth,
			from: from + i * step,
			to: from + (i + 1) * step,
		};

		order.push(id);
	});

	return fresh;
}

export function start(markup: string): Reaction {
	const seed = [
		...new Set(segments(markup).flatMap((s) => (s.id ? [s.id] : []))),
	];

	const nodes: Record<string, Node> = {};
	const order: string[] = [];

	spread(nodes, order, seed, null, 1, -Math.PI / 2, (Math.PI * 3) / 2);

	return { seed, nodes, order, opened: [] };
}

export function open(reaction: Reaction, id: string): Reaction {
	const node = reaction.nodes[id];

	if (!node || reaction.opened.includes(id)) return reaction;

	const nodes = { ...reaction.nodes };
	const order = [...reaction.order];

	spread(nodes, order, children(id), id, node.depth + 1, node.from, node.to);

	return { ...reaction, nodes, order, opened: [...reaction.opened, id] };
}

export function measure(reaction: Reaction) {
	const lookups = reaction.opened.length;
	const found = reaction.order.length - reaction.seed.length;
	const pending = reaction.order.length - lookups;
	const k = lookups ? found / lookups : null;
	const expected =
		k === null ? null : k >= 1 ? Infinity : reaction.seed.length / (1 - k);

	return { lookups, found, pending, k, expected };
}

export function closure(markup: string) {
	let reaction = start(markup);

	for (let i = 0; i < reaction.order.length; i++)
		reaction = open(reaction, reaction.order[i]);

	return reaction;
}
