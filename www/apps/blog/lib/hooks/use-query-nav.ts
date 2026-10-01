import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

export function useQueryNav(basePath: string) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const setParams = useCallback(
		(updates: Record<string, string | null>) => {
			const params = new URLSearchParams(searchParams.toString());

			for (const [key, value] of Object.entries(updates)) {
				if (value) {
					params.set(key, value);
				} else {
					params.delete(key);
				}
			}

			params.delete("page");

			startTransition(() => {
				router.push(`${basePath}?${params.toString()}`);
			});
		},
		[basePath, router, searchParams],
	);

	return { isPending, setParams };
}
