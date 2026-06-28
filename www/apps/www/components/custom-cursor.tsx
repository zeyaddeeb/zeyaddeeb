"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

export function CustomCursor() {
	const [isHovering, setIsHovering] = useState(false);
	const [isVisible, setIsVisible] = useState(false);
	const [isEnabled, setIsEnabled] = useState(false);
	const cursorX = useMotionValue(-120);
	const cursorY = useMotionValue(-120);

	const springConfig = { damping: 28, stiffness: 620, mass: 0.45 };
	const cursorXSpring = useSpring(cursorX, springConfig);
	const cursorYSpring = useSpring(cursorY, springConfig);

	useEffect(() => {
		const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
		const syncPointerMode = () => setIsEnabled(finePointer.matches);

		syncPointerMode();
		finePointer.addEventListener("change", syncPointerMode);

		const moveCursor = (e: MouseEvent) => {
			cursorX.set(e.clientX - 18);
			cursorY.set(e.clientY - 18);
			setIsVisible(true);
		};

		const handleMouseOver = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "A" ||
				target.tagName === "BUTTON" ||
				target.closest("[role='button']") ||
				target.closest("a") ||
				target.closest("button")
			) {
				setIsHovering(true);
			} else {
				setIsHovering(false);
			}
		};

		const hideCursor = () => setIsVisible(false);

		window.addEventListener("mousemove", moveCursor);
		window.addEventListener("mouseover", handleMouseOver);
		window.addEventListener("mouseleave", hideCursor);

		return () => {
			finePointer.removeEventListener("change", syncPointerMode);
			window.removeEventListener("mousemove", moveCursor);
			window.removeEventListener("mouseover", handleMouseOver);
			window.removeEventListener("mouseleave", hideCursor);
		};
	}, [cursorX, cursorY]);

	if (!isEnabled) return null;

	return (
		<motion.div
			className="pointer-events-none fixed left-0 top-0 z-9999 h-9 w-9"
			style={{
				x: cursorXSpring,
				y: cursorYSpring,
			}}
			animate={{
				opacity: isVisible ? 1 : 0,
				scale: isHovering ? 1.08 : 1,
			}}
			transition={{ duration: 0.16 }}
			aria-hidden="true"
		>
			<motion.div
				className="absolute inset-0"
				animate={{ rotate: isHovering ? 45 : 0 }}
				transition={{ type: "spring", damping: 18, stiffness: 260 }}
			>
				<div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/70 mix-blend-difference" />
				<div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/70 mix-blend-difference" />
				<div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f0b66a] shadow-[0_0_14px_rgba(240,182,106,0.55)]" />
			</motion.div>
			<motion.div
				className="absolute -right-3 -top-2 font-mono text-[9px] font-medium uppercase leading-none text-[#f8e8c9]"
				animate={{
					opacity: isHovering ? 1 : 0,
					x: isHovering ? 0 : -3,
					y: isHovering ? 0 : 2,
				}}
				transition={{ duration: 0.14 }}
			>
				zd
			</motion.div>
		</motion.div>
	);
}
