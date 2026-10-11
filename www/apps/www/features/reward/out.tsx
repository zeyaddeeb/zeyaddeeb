import { LifeArrow } from "@zeyaddeeb/ui";
import type { ReactNode } from "react";

export function Out({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="rh-out">
			{children}
			<LifeArrow direction="up-right" className="rh-out__arrow" seed={href} />
		</a>
	);
}
