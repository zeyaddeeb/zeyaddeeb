import type { ReactNode } from "react";
import { ArrowIcon } from "./arrow-icon";

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
			<ArrowIcon direction="up-right" />
		</a>
	);
}
