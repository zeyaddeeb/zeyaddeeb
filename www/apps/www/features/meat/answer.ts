export const question =
	"hey, why did checkout throw 500s for like ten minutes last night?";

export const answer = `Here's a detailed breakdown of what most likely happened during last night's checkout incident, including a root cause analysis, contributing factors, a timeline, and recommended remediations.

## TL;DR

Checkout returned HTTP 500s for roughly ten minutes because the order service could not publish to JetStream while the \`ORDERS\` stream was electing a new leader. The underlying trigger was NATS control-plane events: stream leader election / R3 quorum re-form during pod churn.

## Root cause analysis

At approximately 02:04 UTC, a rolling update of the \`nats\` StatefulSet began replacing pods. Each restart caused the affected server to leave the cluster, which triggered Raft leader elections for every stream whose leader it hosted. Because \`ORDERS\` is configured with \`replicas: 3\` (R3), it needs a quorum of two voting replicas to accept writes. During the window in which one replica was restarting and a second was still catching up from a snapshot, the stream briefly had no quorum and rejected publishes with \`nats: no responders available for request\`.

The order service treats a failed publish as fatal and surfaces it as a 500 rather than retrying. This converted a few seconds of unavailability per election into user-facing errors.

## Contributing factors

- **Aggressive rollout settings.** The StatefulSet uses \`podManagementPolicy: Parallel\`, which allows a second pod to restart before the first has fully rejoined the cluster.
- **No PodDisruptionBudget.** Without a PDB, Kubernetes is free to evict more than one NATS pod at a time during node maintenance.
- **Missing publish retries.** The client uses a two-second request timeout with zero retries, so a short election is indistinguishable from an outage.
- **Snapshot catch-up time.** Large streams take longer to catch up after a restart, which extends the window in which only one healthy replica exists.
- **Leader placement skew.** Stream leaders were concentrated on \`nats-1\`, so its restart triggered a disproportionate number of simultaneous elections.

## Timeline (approximate)

- **02:04** Rollout begins and \`nats-2\` terminates.
- **02:05** \`ORDERS\` elects a new leader; publishes fail for about four seconds.
- **02:07** \`nats-1\` terminates before \`nats-2\` has caught up, and the stream loses quorum.
- **02:07–02:13** Intermittent \`no responders\` errors; the checkout 500 rate peaks at 38%.
- **02:14** Quorum is restored and the error rate returns to baseline.

## Recommended remediations

1. **Add a PodDisruptionBudget** with \`maxUnavailable: 1\` for the NATS StatefulSet.
2. **Switch to \`podManagementPolicy: OrderedReady\`** and gate readiness on the \`/healthz\` endpoint, so a pod only counts as ready once its streams are current.
3. **Add retries with jittered exponential backoff** to publishes in the order service, bounded by the checkout request deadline.
4. **Set \`election_backoff: 30s\`** in the JetStream server configuration to prevent rapid successive elections during rollouts.
5. **Rebalance stream leaders** periodically so that no single server hosts the majority of them.
6. **Alert on quorum loss directly** rather than inferring it from downstream 5xx rates, which lag the underlying event.

## Summary

In short, this was not a bug in NATS itself but an interaction between Raft-based stream replication and Kubernetes rollout behavior. Implementing the remediations above should make checkout resilient to future pod churn. Let me know if you'd like me to draft the PodDisruptionBudget manifest or the retry wrapper!`;

export const paste = `Claude said:\n\n${answer}`;

export const trim = answer
	.slice(answer.indexOf("Checkout returned"), answer.indexOf("\n\n## Root"))
	.trim();

export const ownWords = `NATS got restarted during a deploy around 2am, and two of its three servers were down at the same time, so the orders queue couldn't accept writes for a few minutes. Checkout doesn't retry, so every failed write became a 500. I'd add a disruption budget and retries. I asked Claude and skimmed the rest of its list: one of the settings it suggests doesn't seem to exist.`;

export const nats =
	"NATS control-plane events: stream leader election / R3 quorum re-form during pod churn.";

export const plain =
	"Kubernetes restarted the servers that run our message queue, and for a few minutes the queue couldn't decide which copy was in charge, so checkout couldn't save orders.";
