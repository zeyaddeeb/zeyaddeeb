"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WriteResult } from "@/lib/actions/result";
import type { Written } from "@/lib/actions/write";

interface EditorActions {
	save: () => Promise<WriteResult<Written>>;
	savedHref: (written: Written) => string;
	remove?: () => Promise<WriteResult<void>>;
	removedHref?: string;
	noun: string;
}

export function useEditorActions({
	save,
	savedHref,
	remove,
	removedHref,
	noun,
}: EditorActions) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const result = await save();
		if (result.success) {
			router.push(savedHref(result.data));
		} else {
			setError(result.error);
			setIsSubmitting(false);
		}
	};

	const destroy = async () => {
		if (!remove || !removedHref) return;
		if (
			!confirm(
				`Are you sure you want to delete this ${noun}? This action cannot be undone.`,
			)
		) {
			return;
		}

		setIsDeleting(true);
		setError(null);

		const result = await remove();
		if (result.success) {
			router.push(removedHref);
		} else {
			setError(result.error);
			setIsDeleting(false);
		}
	};

	return {
		error,
		isSubmitting,
		isDeleting,
		submit,
		destroy,
		cancel: () => router.back(),
	};
}
