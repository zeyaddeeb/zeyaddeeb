"use client";

import { useEffect, useRef } from "react";

export function SiteProgress() {
	const fill = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const bar = fill.current;
		if (!bar) return;
		const root = document.documentElement;
		let frame = 0;
		let previous = "";
		const update = () => {
			frame = 0;
			const span = root.scrollHeight - root.clientHeight;
			const progress =
				span > 0 ? Math.min(1, Math.max(0, window.scrollY / span)) : 0;
			const scale = progress.toFixed(5);
			if (scale === previous) return;
			previous = scale;
			bar.style.transform = `scaleX(${scale})`;
		};
		const queue = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		const resize = new ResizeObserver(queue);
		resize.observe(root);
		resize.observe(document.body);
		window.addEventListener("scroll", queue, { passive: true });
		window.addEventListener("resize", queue);
		window.addEventListener("pageshow", queue);
		queue();
		return () => {
			cancelAnimationFrame(frame);
			resize.disconnect();
			window.removeEventListener("scroll", queue);
			window.removeEventListener("resize", queue);
			window.removeEventListener("pageshow", queue);
		};
	}, []);

	return (
		<span className="site-progress" aria-hidden="true">
			<span className="site-progress__fill" ref={fill} />
		</span>
	);
}
