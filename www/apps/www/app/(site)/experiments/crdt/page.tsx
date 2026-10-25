import { experimentMetadata } from "@/features/catalog/catalog";
import { CrdtLab } from "@/features/crdt/lab";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"crdt",
	"Collaborative text editing with no coordination: an RGA CRDT in Rust/WASM, synced over WebSockets and persisted in SurrealDB. Works offline.",
);

export default function CrdtEditorPage() {
	return (
		<ExperimentFrame
			id="crdt"
			intro="Open this page in two tabs and type in either one. Changes sync between them. You can keep editing while disconnected; queued edits sync when the connection returns."
			aside={
				<div className="notes-columns">
					<section>
						<h3>WASM CRDT</h3>
						<p>
							The RGA runs in Rust compiled to WebAssembly. Each op returns a
							JSON message ready to broadcast.
						</p>
					</section>
					<section>
						<h3>Sync server</h3>
						<p>
							An Axum WebSocket server persists ops to SurrealDB and
							rebroadcasts them to every connected tab.
						</p>
					</section>
					<section>
						<h3>Offline first</h3>
						<p>
							If the server is unreachable the editor keeps working. Ops queue
							locally and flush when the connection resumes.
						</p>
					</section>
				</div>
			}
		>
			<CrdtLab />
		</ExperimentFrame>
	);
}
