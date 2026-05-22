"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWasm } from "./use-wasm";

export type SyncStatus = "connecting" | "online" | "offline";

export interface RgaEntry {
	site: number;
	clock: number;
	value: string;
	deleted: boolean;
}

export interface OpLogEntry {
	dir: "local" | "remote";
	label: string;
}

interface RgaDoc {
	insert(pos: number, value: string): string;
	delete(pos: number): string | undefined;
	apply_remote(op_json: string): void;
	apply_batch(ops_json: string): void;
	text(): string;
	len(): number;
	inspect(): string;
	free(): void;
}

const BACKOFF = [1_000, 2_000, 4_000, 8_000, 15_000];
const MAX_LOG = 8;

export function useCrdt(docId: string, wsBase?: string) {
	const { wasm, loading } = useWasm();

	const docRef = useRef<RgaDoc | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const pendingRef = useRef<string[]>([]);
	const retryRef = useRef(0);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = useRef(false);
	const docIdRef = useRef(docId);
	docIdRef.current = docId;
	const siteIdRef = useRef(0);

	const [text, setText] = useState("");
	const [sequence, setSequence] = useState<RgaEntry[]>([]);
	const [status, setStatus] = useState<SyncStatus>("connecting");
	const [opLog, setOpLog] = useState<OpLogEntry[]>([]);
	const [pendingCount, setPendingCount] = useState(0);
	const [totalOps, setTotalOps] = useState(0);

	const syncState = useCallback(() => {
		const doc = docRef.current;
		if (!doc) return;
		setText(doc.text());
		try {
			setSequence(JSON.parse(doc.inspect()) as RgaEntry[]);
		} catch {}
	}, []);

	const pushLog = useCallback((dir: "local" | "remote", label: string) => {
		setOpLog((prev) => [{ dir, label }, ...prev].slice(0, MAX_LOG));
	}, []);

	const enqueueOrSend = useCallback((payload: string) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(payload);
		} else {
			pendingRef.current.push(payload);
			setPendingCount(pendingRef.current.length);
		}
	}, []);

	const flushPending = useCallback((ws: WebSocket) => {
		for (const msg of pendingRef.current) ws.send(msg);
		pendingRef.current = [];
		setPendingCount(0);
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		if (loading || !wasm) return;

		siteIdRef.current = Math.floor(Math.random() * 0xffffffff);
		type WasmModule = { RgaDocument: new (siteId: number) => RgaDoc };
		docRef.current = new (wasm as unknown as WasmModule).RgaDocument(
			siteIdRef.current,
		);
		syncState();

		const baseUrl =
			wsBase ??
			(typeof window !== "undefined"
				? (process.env.NEXT_PUBLIC_CRDT_URL ?? "ws://localhost:3001")
				: "ws://localhost:3001");

		function scheduleReconnect() {
			if (!mountedRef.current) return;
			const delay =
				BACKOFF[Math.min(retryRef.current, BACKOFF.length - 1)] ?? 15_000;
			retryRef.current++;
			timerRef.current = setTimeout(openSocket, delay);
		}

		function openSocket() {
			if (!mountedRef.current) return;
			if (timerRef.current) clearTimeout(timerRef.current);

			const ws = new WebSocket(`${baseUrl}/ws/${docIdRef.current}`);
			wsRef.current = ws;
			setStatus("connecting");

			ws.onopen = () => {
				if (!mountedRef.current) {
					ws.close();
					return;
				}
				ws.send(JSON.stringify({ type: "join" }));
			};

			ws.onmessage = (e: MessageEvent) => {
				const doc = docRef.current;
				if (!doc || !mountedRef.current) return;
				try {
					const msg = JSON.parse(e.data as string) as {
						type: string;
						ops?: unknown[];
						op?: { type: string; value?: string };
					};

					if (msg.type === "init") {
						doc.apply_batch(JSON.stringify(msg.ops ?? []));
						setStatus("online");
						retryRef.current = 0;
						flushPending(ws);
						syncState();
						pushLog("remote", `init — ${msg.ops?.length ?? 0} ops`);
					} else if (msg.type === "op" && msg.op) {
						doc.apply_remote(JSON.stringify(msg.op));
						syncState();
						const o = msg.op;
						pushLog(
							"remote",
							o.type === "insert" ? `insert '${o.value ?? ""}'` : "delete",
						);
					}
				} catch {}
			};

			ws.onerror = () => {
				if (mountedRef.current) setStatus("offline");
			};

			ws.onclose = () => {
				if (!mountedRef.current) return;
				setStatus("offline");
				scheduleReconnect();
			};
		}

		openSocket();

		return () => {
			mountedRef.current = false;
			if (timerRef.current) clearTimeout(timerRef.current);
			wsRef.current?.close();
			docRef.current?.free();
			docRef.current = null;
		};
	}, [loading, wasm, wsBase, flushPending, syncState, pushLog]);

	const insert = useCallback(
		(pos: number, char: string) => {
			const doc = docRef.current;
			if (!doc) return;
			const opJson = doc.insert(pos, char);
			enqueueOrSend(JSON.stringify({ type: "op", op: JSON.parse(opJson) }));
			setTotalOps((n) => n + 1);
			pushLog("local", `insert '${char}' @${pos}`);
			syncState();
		},
		[enqueueOrSend, pushLog, syncState],
	);

	const del = useCallback(
		(pos: number) => {
			const doc = docRef.current;
			if (!doc) return;
			const opJson = doc.delete(pos);
			if (!opJson) return;
			enqueueOrSend(JSON.stringify({ type: "op", op: JSON.parse(opJson) }));
			setTotalOps((n) => n + 1);
			pushLog("local", `delete @${pos}`);
			syncState();
		},
		[enqueueOrSend, pushLog, syncState],
	);

	return {
		text,
		sequence,
		status,
		opLog,
		pendingCount,
		totalOps,
		siteId: siteIdRef.current,
		insert,
		delete: del,
	};
}
