"use client";

import { useEffect, useRef, useState } from "react";

export function useSize() {
	const ref = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 800, height: 480 });
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			if (width > 0 && height > 0)
				setSize({ width: Math.round(width), height: Math.round(height) });
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return { ref, ...size };
}
