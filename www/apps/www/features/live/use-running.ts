"use client";

import { type RefObject, useEffect, useState } from "react";

export function useReducedMotion() {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReduced(mq.matches);
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);
	return reduced;
}

export function useInView<T extends Element>(
	ref: RefObject<T | null>,
	rootMargin = "120px",
) {
	const [inView, setInView] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const io = new IntersectionObserver(
			([entry]) => setInView(entry?.isIntersecting ?? false),
			{ rootMargin },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [ref, rootMargin]);
	return inView;
}

export function useShouldRun<T extends Element>(ref: RefObject<T | null>) {
	const inView = useInView(ref);
	const reduced = useReducedMotion();
	const [visible, setVisible] = useState(true);
	useEffect(() => {
		const update = () => setVisible(document.visibilityState === "visible");
		update();
		document.addEventListener("visibilitychange", update);
		return () => document.removeEventListener("visibilitychange", update);
	}, []);
	return inView && visible && !reduced;
}
