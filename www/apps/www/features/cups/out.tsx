import { LifeArrow } from "@zeyaddeeb/ui";
import type { ReactNode } from "react";

export function Out({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="sw-out">
			{children}
			<LifeArrow direction="up-right" className="sw-out__arrow" seed={href} />
		</a>
	);
}
