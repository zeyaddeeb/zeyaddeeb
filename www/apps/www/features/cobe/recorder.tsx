"use client";

import type { WebViewer, WebViewerOptions } from "@rerun-io/web-viewer";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ControlButton } from "@/components/control-button";
import { RECORDING_ID, TIMELINE, VIEWER_CDN } from "./rerun";

const SOURCE = "/cobe/firas.rrd";
const LOCKED = "/cobe/locked.rbl";
const FULL = "/cobe/recorder.rbl";
const CHROME_PX = 52;

type Phase = "idle" | "loading" | "ready" | "failed";

const absolute = (path: string) =>
	new URL(path, window.location.href).toString();

function quietNetwork() {
	const c = (
		navigator as Navigator & {
			connection?: { saveData?: boolean; effectiveType?: string };
		}
	).connection;

	return Boolean(c?.saveData || c?.effectiveType?.includes("2g"));
}

export function Recorder({
	when,
	open,
	label,
	onOpen,
	onClose,
}: {
	when: number | null;
	open: boolean;
	label: ReactNode;
	onOpen: () => void;
	onClose: () => void;
}) {
	const host = useRef<HTMLDivElement>(null);
	const viewer = useRef<WebViewer | null>(null);
	const [phase, setPhase] = useState<Phase>("idle");
	const [wanted, setWanted] = useState(false);

	useEffect(() => {
		if (wanted || quietNetwork()) return;

		const idle = typeof window.requestIdleCallback === "function";
		const wake = () => setWanted(true);
		const id = idle ? window.requestIdleCallback(wake, { timeout: 2500 }) : 0;
		const timer = idle ? 0 : window.setTimeout(wake, 1200);

		return () => {
			if (id) window.cancelIdleCallback(id);
			window.clearTimeout(timer);
		};
	}, [wanted]);

	useEffect(() => {
		if (open) setWanted(true);
	}, [open]);

	useEffect(() => {
		const el = host.current;

		if (!el || !wanted) return;

		let gone = false;
		let made: WebViewer | null = null;

		setPhase("loading");

		(async () => {
			try {
				const { WebViewer } = await import("@rerun-io/web-viewer");

				if (gone) return;

				made = new WebViewer();
				made.on("recording_open", () => {
					if (!gone) setPhase("ready");
				});
				await made.start(absolute(SOURCE), el, {
					hide_welcome_screen: true,
					width: "100%",
					height: "100%",
					allow_fullscreen: false,
					base_url: VIEWER_CDN,
				} as WebViewerOptions);

				if (gone) {
					made.stop();
					return;
				}

				viewer.current = made;
			} catch {
				if (!gone) setPhase("failed");
			}
		})();

		return () => {
			gone = true;
			viewer.current = null;
			made?.stop();
		};
	}, [wanted]);

	useEffect(() => {
		const v = viewer.current;

		if (!v || phase !== "ready") return;

		const state = open ? null : "hidden";

		v.override_panel_state("top", open ? "expanded" : "hidden");
		v.override_panel_state("blueprint", state);
		v.override_panel_state("selection", state);
		v.override_panel_state("time", open ? "expanded" : "hidden");
		v.open(absolute(open ? FULL : LOCKED));
	}, [open, phase]);

	useEffect(() => {
		const el = host.current;

		if (!el || phase !== "ready") return;

		const fit = () => {
			const c = el.querySelector("canvas");

			if (!c?.clientWidth) return;

			const zoom = (window.devicePixelRatio || 1) / (c.width / c.clientWidth);

			el.parentElement?.style.setProperty(
				"--hc-chrome",
				`${Math.round(CHROME_PX * Math.max(1, zoom))}px`,
			);
		};

		fit();

		const ro = new ResizeObserver(fit);

		ro.observe(el);

		return () => ro.disconnect();
	}, [phase]);

	useEffect(() => {
		const v = viewer.current;

		if (!v || phase !== "ready" || when === null) return;

		v.set_current_time(RECORDING_ID, TIMELINE, when * 1e9);
	}, [when, phase]);

	useEffect(() => {
		if (!open) return;

		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};

		window.addEventListener("keydown", key);

		return () => window.removeEventListener("keydown", key);
	}, [open, onClose]);

	return (
		<div className="hc-rec" data-open={open} data-phase={phase}>
			<div className="hc-rec__frame">
				{open ? (
					<div className="hc-rec__bar">
						<span className="hc-eyebrow">
							Flight recorder · COBE FIRAS · November 1989 to September 1990
						</span>
						<ControlButton onClick={onClose}>Close</ControlButton>
					</div>
				) : null}
				<div className="hc-rec__view">
					<div className="hc-rec__host">
						<div className="hc-rec__mount" ref={host} />
					</div>
					{phase !== "ready" ? (
						<div className="hc-rec__poster" aria-hidden="true">
							<span className="hc-rec__status">
								{phase === "loading"
									? "Loading the recording"
									: phase === "failed"
										? "The recorder couldn’t start in this browser"
										: ""}
							</span>
						</div>
					) : null}
				</div>
			</div>
			<div className="hc-rec__foot">
				<p className="hc-rec__label">{label}</p>
				<button
					type="button"
					className="hc-rec__open"
					onClick={onOpen}
					disabled={phase === "failed"}
				>
					Open the flight recorder
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path d="M9.5 2.5 H13.5 V6.5 M13.5 2.5 L8.5 7.5 M6.5 13.5 H2.5 V9.5 M2.5 13.5 L7.5 8.5" />
					</svg>
				</button>
			</div>
		</div>
	);
}
