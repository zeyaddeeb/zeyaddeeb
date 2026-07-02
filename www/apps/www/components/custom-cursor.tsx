"use client";

import {
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
} from "framer-motion";
import { useEffect, useState } from "react";

export function CustomCursor() {
	const [isHovering, setIsHovering] = useState(false);
	const [isPressed, setIsPressed] = useState(false);
	const [isVisible, setIsVisible] = useState(false);
	const [isEnabled, setIsEnabled] = useState(false);
	const prefersReducedMotion = useReducedMotion();
	const cursorX = useMotionValue(-120);
	const cursorY = useMotionValue(-120);

	const springConfig = { damping: 24, stiffness: 360, mass: 0.35 };
	const cursorXSpring = useSpring(cursorX, springConfig);
	const cursorYSpring = useSpring(cursorY, springConfig);

	useEffect(() => {
		const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
		const syncPointerMode = () => setIsEnabled(finePointer.matches);

		syncPointerMode();
		finePointer.addEventListener("change", syncPointerMode);

		const moveCursor = (e: MouseEvent) => {
			cursorX.set(e.clientX + 10);
			cursorY.set(e.clientY + 10);
			setIsVisible(true);
		};

		const syncHoverState = (e: MouseEvent) => {
			const target = e.target;
			if (!(target instanceof HTMLElement)) {
				setIsHovering(false);
				return;
			}

			setIsHovering(
				target.tagName === "A" ||
					target.tagName === "BUTTON" ||
					!!target.closest(
						"[role='button'], a, button, input, textarea, select",
					),
			);
		};

		const hideCursor = () => {
			setIsVisible(false);
			setIsPressed(false);
		};
		const pressCursor = () => setIsPressed(true);
		const releaseCursor = () => setIsPressed(false);

		window.addEventListener("mousemove", moveCursor);
		window.addEventListener("mouseover", syncHoverState);
		window.addEventListener("mouseleave", hideCursor);
		window.addEventListener("mousedown", pressCursor);
		window.addEventListener("mouseup", releaseCursor);
		window.addEventListener("blur", hideCursor);

		return () => {
			finePointer.removeEventListener("change", syncPointerMode);
			window.removeEventListener("mousemove", moveCursor);
			window.removeEventListener("mouseover", syncHoverState);
			window.removeEventListener("mouseleave", hideCursor);
			window.removeEventListener("mousedown", pressCursor);
			window.removeEventListener("mouseup", releaseCursor);
			window.removeEventListener("blur", hideCursor);
		};
	}, [cursorX, cursorY]);

	if (!isEnabled) return null;

	return (
		<motion.div
			className="pointer-events-none fixed left-0 top-0 z-[9999] h-3 w-3"
			style={{
				x: prefersReducedMotion ? cursorX : cursorXSpring,
				y: prefersReducedMotion ? cursorY : cursorYSpring,
			}}
			animate={{
				opacity: isVisible ? 1 : 0,
				scale: isPressed ? 0.72 : isHovering ? 1.65 : 1,
			}}
			transition={{ duration: 0.12 }}
			aria-hidden="true"
		>
			<motion.div
				className="absolute inset-0 rounded-full border border-white/35 bg-[#f0b66a]/85 shadow-[0_0_16px_rgba(240,182,106,0.22)]"
				animate={{
					backgroundColor: isHovering
						? "rgba(12, 211, 194, 0.72)"
						: "rgba(240, 182, 106, 0.85)",
					borderColor: isHovering
						? "rgba(255, 255, 255, 0.52)"
						: "rgba(255, 255, 255, 0.35)",
				}}
				transition={{ duration: 0.16 }}
			/>
		</motion.div>
	);
}
