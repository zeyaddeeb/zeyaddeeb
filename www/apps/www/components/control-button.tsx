import type { ComponentProps } from "react";

const base =
	"border border-rule px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-paper-2 transition-colors hover:border-rule-strong hover:text-paper disabled:opacity-40 disabled:hover:border-rule";
const on = "border-amber text-amber hover:border-amber hover:text-amber";

export function ControlButton({
	pressed = false,
	className,
	...props
}: Omit<ComponentProps<"button">, "type"> & { pressed?: boolean }) {
	return (
		<button
			type="button"
			className={[base, pressed && on, className].filter(Boolean).join(" ")}
			{...props}
		/>
	);
}
