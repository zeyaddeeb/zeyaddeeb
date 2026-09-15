"use client";

export function CanvasTouchToggle({
	active,
	onChange,
}: {
	active: boolean;
	onChange: (active: boolean) => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			aria-label={
				active
					? "Done interacting; enable page scrolling"
					: "Enable canvas touch interaction"
			}
			onClick={() => onChange(!active)}
			className="min-h-11 border border-rule bg-charcoal px-3 font-mono text-[11px] text-paper shadow-sm hover:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
		>
			{active ? "Done · scroll page" : "Interact · touch"}
		</button>
	);
}
