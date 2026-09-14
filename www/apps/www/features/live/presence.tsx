"use client";

import { createContext, type ReactNode, useContext } from "react";
import { useCrdt } from "@/lib/hooks/use-crdt";

export const HOME_DOC = "home";

type Presence = ReturnType<typeof useCrdt>;

const PresenceContext = createContext<Presence | null>(null);

export function PresenceProvider({ children }: { children: ReactNode }) {
	const crdt = useCrdt(HOME_DOC);
	return (
		<PresenceContext.Provider value={crdt}>{children}</PresenceContext.Provider>
	);
}

export function usePresence() {
	const ctx = useContext(PresenceContext);
	if (!ctx) throw new Error("usePresence must be used within PresenceProvider");
	return ctx;
}
