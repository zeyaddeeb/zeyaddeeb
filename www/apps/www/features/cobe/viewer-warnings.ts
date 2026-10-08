const ignored = [
	"Unhandled egui viewport command: SetTheme(Dark) - not implemented in web backend",
	"Unhandled egui viewport command: RequestUserAttention(Informational) - not implemented in web backend",
];

let users = 0;
let restore: (() => void) | undefined;

export function quietViewerWarnings() {
	if (users++ === 0) {
		const warn = console.warn;
		const filtered: typeof console.warn = (...args: unknown[]) => {
			const message = args.filter((arg) => typeof arg === "string").join(" ");

			if (
				message.includes("eframe::web::app_runner") &&
				ignored.some((warning) => message.includes(warning))
			)
				return;

			warn.apply(console, args);
		};

		console.warn = filtered;
		restore = () => {
			if (console.warn === filtered) console.warn = warn;
		};
	}

	let released = false;

	return () => {
		if (released) return;
		released = true;
		if (--users === 0) {
			restore?.();
			restore = undefined;
		}
	};
}
