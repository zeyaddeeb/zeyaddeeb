"use client";

import dynamic from "next/dynamic";

const CrdtEditor = dynamic(() => import("./editor"), {
	ssr: false,
	loading: () => <p className="font-mono text-xs text-dim">loading engine…</p>,
});

const DOC_ID = "crdt-demo";

export function CrdtLab() {
	return <CrdtEditor docId={DOC_ID} />;
}
