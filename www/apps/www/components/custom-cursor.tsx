"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

export function CustomCursor() {
	const [isHovering, setIsHovering] = useState(false);
	const cursorX = useMotionValue(-100);
	const cursorY = useMotionValue(-100);

	const springConfig = { damping: 25, stiffness: 700 };
	const cursorXSpring = useSpring(cursorX, springConfig);
	const cursorYSpring = useSpring(cursorY, springConfig);

	useEffect(() => {
		const moveCursor = (e: MouseEvent) => {
			cursorX.set(e.clientX - 16);
			cursorY.set(e.clientY - 16);
		};

		const handleMouseOver = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "A" ||
				target.tagName === "BUTTON" ||
				target.closest("a") ||
				target.closest("button")
			) {
				setIsHovering(true);
			} else {
				setIsHovering(false);
			}
		};

		window.addEventListener("mousemove", moveCursor);
		window.addEventListener("mouseover", handleMouseOver);

		return () => {
			window.removeEventListener("mousemove", moveCursor);
			window.removeEventListener("mouseover", handleMouseOver);
		};
	}, [cursorX, cursorY]);

	return (
		<>
			<motion.div
				className="pointer-events-none fixed left-0 top-0 z-9999 hidden h-8 w-8 rounded-full border-2 border-white mix-blend-difference md:block"
				style={{
					x: cursorXSpring,
					y: cursorYSpring,
				}}
				animate={{
					scale: isHovering ? 1.5 : 1,
					opacity: isHovering ? 0.5 : 1,
				}}
				transition={{
					scale: { duration: 0.2 },
					opacity: { duration: 0.2 },
				}}
			/>
			<motion.div
				className="pointer-events-none fixed left-0 top-0 z-9999 hidden h-8 w-8 md:block"
				style={{
					x: cursorXSpring,
					y: cursorYSpring,
				}}
			>
				<motion.div
					className="h-full w-full rounded-full bg-white mix-blend-difference"
					animate={{
						scale: isHovering ? 0 : 0.3,
					}}
					transition={{ duration: 0.2 }}
				/>
			</motion.div>
		</>
	);
}
