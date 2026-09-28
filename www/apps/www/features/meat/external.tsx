import { LifeArrow } from "@zeyaddeeb/ui";
import type { ReactNode } from "react";

export function External({
	href,
	className,
	children,
}: {
	href: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<a href={href} className={className ? `mc-out ${className}` : "mc-out"}>
			{children}
			<LifeArrow direction="up-right" className="mc-out__arrow" />
		</a>
	);
}
