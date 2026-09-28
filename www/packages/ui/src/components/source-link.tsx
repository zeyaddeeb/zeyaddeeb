import type { ReactNode } from "react";
import { SOURCE_REPOSITORY } from "../site";
import { LifeArrow } from "./life-arrow";

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
			<LifeArrow direction="up-right" seed={SOURCE_REPOSITORY} />
		</a>
	);
}
