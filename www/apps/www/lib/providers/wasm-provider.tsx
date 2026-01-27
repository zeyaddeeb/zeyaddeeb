"use client";

import type { ReactNode } from "react";
import { createContext, useEffect, useState } from "react";

const initial: IWASMContext = { loading: true };

export const WASMContext = createContext(initial);

export const WASMContextProvider = ({ children }: WASMContextProviderProps) => {
	const [state, setState] = useState<IWASMContext>(initial);

	useEffect(() => {
		let mounted = true;

		(async () => {
			try {
				const wasm = await import("@zeyaddeeb/wasm");
				await wasm.default();
				if (mounted) {
					setState({ wasm, loading: false });
				}
			} catch (err) {
				console.error("Failed to load WASM module:", err);
				if (mounted) {
					setState({ wasm: undefined, loading: false, error: String(err) });
				}
			}
		})();

		return () => {
			mounted = false;
		};
	}, []);

	return <WASMContext.Provider value={state}>{children}</WASMContext.Provider>;
};

interface IWASMContext {
	wasm?: typeof import("@zeyaddeeb/wasm");
	loading?: boolean;
	error?: string;
}

interface WASMContextProviderProps {
	children: ReactNode;
}
