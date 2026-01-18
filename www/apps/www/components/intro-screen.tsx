"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";

gsap.registerPlugin(useGSAP);

const STRIPE_COUNT = 10;
const NAME_LINES = ["ZEYAD", "DEEB"];

interface IntroScreenProps {
	onComplete?: () => void;
}

export function IntroScreen({ onComplete }: IntroScreenProps) {
	const preloaderRef = useRef<HTMLDivElement>(null);
	const [isComplete, setIsComplete] = useState(false);
	const stripes = useMemo(() => Array.from({ length: STRIPE_COUNT }), []);

	useEffect(() => {
		if (isComplete) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [isComplete]);

	useGSAP(
		() => {
			if (isComplete || !preloaderRef.current) return;

			const letters = gsap.utils.toArray<HTMLElement>(".js-preloader-letter");

			gsap.set([letters], { yPercent: 120 });
			gsap.set(".preloader-col", { yPercent: 0 });

			gsap
				.timeline({
					defaults: { ease: "power2.out" },
					onComplete: () => {
						setIsComplete(true);
						onComplete?.();
					},
				})
				.to(letters, {
					yPercent: 0,
					duration: 0.9,
					stagger: 0.06,
				})
				.to(
					[],
					{
						yPercent: 0,
						duration: 0.6,
						stagger: 0.12,
						ease: "power3.out",
					},
					"-=0.45",
				)
				.to(".preloader-col", {
					yPercent: -100,
					duration: 1.1,
					stagger: 0.08,
					ease: "power4.inOut",
					delay: 0.2,
				})
				.to(
					preloaderRef.current,
					{
						autoAlpha: 0,
						duration: 0.6,
						ease: "power2.in",
					},
					"-=0.6",
				);
		},
		{ scope: preloaderRef, dependencies: [isComplete] },
	);

	if (isComplete) return null;

	return (
		<div
			ref={preloaderRef}
			className="fixed inset-0 z-999 flex items-center justify-center overflow-hidden bg-neutral-950"
		>
			<div className="absolute inset-0 grid h-full w-full grid-cols-5 md:grid-cols-10">
				{stripes.map((_, index) => (
					<div
						key={index.toString()}
						className="preloader-col h-full"
						style={{
							background:
								"linear-gradient(180deg, rgba(14,14,14,1) 0%, rgba(2,2,2,1) 100%)",
							boxShadow:
								index % 2 === 0
									? "inset 0 0 0 1px rgba(255,255,255,0.03)"
									: "inset 0 0 0 1px rgba(255,255,255,0.06)",
						}}
						aria-hidden="true"
					/>
				))}
			</div>

			<div className="pointer-events-none relative z-10 flex flex-col items-center gap-6 px-6 text-white">
				<div className="flex flex-col items-center gap-2 leading-[0.85] text-center">
					{NAME_LINES.map((line, lineIndex) => (
						<div
							key={line}
							className="flex overflow-hidden text-[clamp(3.5rem,14vw,10rem)] uppercase"
							style={{
								fontFamily: "var(--font-anton)",
								letterSpacing: "0.08em",
							}}
						>
							{line.split("").map((character, charIndex) => (
								<span
									key={`${lineIndex}-${charIndex.toString()}`}
									className="js-preloader-letter inline-block"
								>
									{character}
								</span>
							))}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
