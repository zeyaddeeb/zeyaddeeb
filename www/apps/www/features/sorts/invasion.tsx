"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";

const Invaders = dynamic(() => import("./invaders"), { ssr: false });

export function Invasion({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	if (!open) return null;

	return createPortal(<Invaders onClose={onClose} />, document.body);
}
