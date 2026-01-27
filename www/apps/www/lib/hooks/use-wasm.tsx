import { useContext } from "react";

import { WASMContext } from "../providers/wasm-provider";

function useWasm() {
	const context = useContext(WASMContext);

	if (context === undefined) {
		throw new Error("useWasm must be used within a WASMContextProvider");
	}

	return {
		wasm: context.wasm,
		loading: context.loading ?? false,
		error: context.error,
	};
}

export { useWasm };
