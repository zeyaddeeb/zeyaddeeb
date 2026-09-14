import type { ReactNode } from "react";

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
			{children}&nbsp;<span aria-hidden="true">↗</span>
		</a>
	);
}
