"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const linkClass =
	"rounded-none border border-rule px-4 py-2 text-sm text-dim transition-colors hover:border-ink hover:text-ink";

export function Pagination({
	page,
	totalPages,
	disabled,
}: {
	page: number;
	totalPages: number;
	disabled: boolean;
}) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const href = (next: number) => {
		const params = new URLSearchParams(searchParams.toString());
		if (next > 1) params.set("page", String(next));
		else params.delete("page");
		return `${pathname}${params.size ? `?${params}` : ""}`;
	};

	return (
		<nav
			aria-label="Pagination"
			className="mt-12 flex items-center justify-center gap-2"
		>
			{page > 1 && !disabled ? (
				<Link href={href(page - 1)} rel="prev" className={linkClass}>
					Previous
				</Link>
			) : (
				<span aria-disabled="true" className={`${linkClass} opacity-50`}>
					Previous
				</span>
			)}
			<span className="px-4 text-sm text-dim">
				Page {page} of {totalPages}
			</span>
			{page < totalPages && !disabled ? (
				<Link href={href(page + 1)} rel="next" className={linkClass}>
					Next
				</Link>
			) : (
				<span aria-disabled="true" className={`${linkClass} opacity-50`}>
					Next
				</span>
			)}
		</nav>
	);
}
