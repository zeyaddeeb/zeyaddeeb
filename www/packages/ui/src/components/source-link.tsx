import type { ReactNode } from "react";
import { LifeArrow } from "./life-arrow";

export const SOURCE_REPOSITORY = "https://github.com/zeyaddeeb/zeyaddeeb";

export function SourceLink({
	children = "Source code on GitHub",
	className = "link-underline",
}: {
	children?: ReactNode;
	className?: string;
}) {
	return (
		<a
			href={SOURCE_REPOSITORY}
			target="_blank"
			rel="noopener noreferrer"
			className={className}
		>
			{children}&nbsp;
			<LifeArrow direction="up-right" />
		</a>
	);
}
