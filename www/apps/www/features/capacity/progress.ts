"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "capacity-progress";

type Progress = Record<string, boolean>;

function read(): Progress {
	try {
		return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
	} catch {
		return {};
	}
}

function write(progress: Progress) {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
	} catch {}
}

export function useProgress() {
	const [progress, setProgress] = useState<Progress>({});
	useEffect(() => setProgress(read()), []);
	const win = useCallback((id: string) => {
		setProgress((all) => {
			const next = { ...all, [id]: true };
			write(next);
			return next;
		});
	}, []);
	return { progress, win };
}
