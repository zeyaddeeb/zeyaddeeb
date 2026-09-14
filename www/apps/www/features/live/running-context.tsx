"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

interface RunningContextValue {
	running: ReadonlySet<string>;
	mark: (id: string, isRunning: boolean) => void;
}

const RunningContext = createContext<RunningContextValue | null>(null);

export function RunningProvider({ children }: { children: ReactNode }) {
	const [running, setRunning] = useState<ReadonlySet<string>>(() => new Set());

	const mark = useCallback((id: string, isRunning: boolean) => {
		setRunning((prev) => {
			if (prev.has(id) === isRunning) return prev;
			const next = new Set(prev);
			if (isRunning) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);

	const value = useMemo(() => ({ running, mark }), [running, mark]);
	return (
		<RunningContext.Provider value={value}>{children}</RunningContext.Provider>
	);
}

export function useRunningRegistry() {
	return useContext(RunningContext);
}

export function useRunningCount() {
	return useContext(RunningContext)?.running.size ?? 0;
}
