import type { Metadata } from "next";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { CrdtLab } from "./lab";

export const metadata: Metadata = {
	title: "CRDT Editor",
	description:
		"Collaborative text editing with no coordination: an RGA CRDT in Rust/WASM, synced over WebSockets and persisted in SurrealDB. Works offline.",
};

export default function CrdtEditorPage() {
	return (
		<ExperimentFrame
			id="crdt"
			intro="Open this page in two tabs and type in either one. Changes sync between them. You can keep editing while disconnected; queued edits sync when the connection returns."
			aside={
				<div className="grid gap-8 md:grid-cols-3">
					{[
						[
							"WASM CRDT",
							"The RGA runs in Rust compiled to WebAssembly. Each op returns a JSON message ready to broadcast.",
						],
						[
							"Sync server",
							"An Axum WebSocket server persists ops to SurrealDB and rebroadcasts them to every connected tab.",
						],
						[
							"Offline first",
							"If the server is unreachable the editor keeps working. Ops queue locally and flush when the connection resumes.",
						],
					].map(([title, body]) => (
						<div key={title}>
							<h3 className="eyebrow mb-3">{title}</h3>
							<p className="font-serif text-base text-paper-2">{body}</p>
						</div>
					))}
				</div>
			}
		>
			<CrdtLab />
		</ExperimentFrame>
	);
}
