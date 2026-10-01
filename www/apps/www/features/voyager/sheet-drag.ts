const SLOP = 6;
const DISTANCE = 80;
const FLICK = 0.5;
const STALE = 90;
const SETTLE = 280;

export function dragToClose(
	sheet: HTMLDialogElement,
	scroller: HTMLElement = sheet,
) {
	let y0 = 0;
	let dy = 0;
	let last = 0;
	let lastAt = 0;
	let speed = 0;
	let tracking = false;
	let dragging = false;
	let timer = 0;

	const place = (y: number) => {
		sheet.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : "";
	};

	const start = (e: TouchEvent) => {
		window.clearTimeout(timer);
		tracking = e.touches.length === 1 && scroller.scrollTop <= 0;
		dragging = false;

		if (!tracking) return;

		y0 = e.touches[0].clientY;
		last = y0;
		lastAt = performance.now();
		dy = 0;
		speed = 0;
	};

	const stop = (release: boolean) => {
		const was = dragging;

		tracking = false;
		dragging = false;

		if (!was) return;

		delete sheet.dataset.drag;

		const t = performance.now();
		const flick = dy > SLOP * 2 && speed > FLICK && t - lastAt < STALE;

		if (release && (dy > DISTANCE || flick)) {
			sheet.close();
			timer = window.setTimeout(() => place(0), SETTLE);

			return;
		}

		place(0);
	};

	const move = (e: TouchEvent) => {
		if (!tracking) return;

		if (e.touches.length !== 1) {
			stop(false);

			return;
		}

		const y = e.touches[0].clientY;
		const d = y - y0;

		if (!dragging) {
			if (d < -SLOP || scroller.scrollTop > 0) {
				tracking = false;

				return;
			}

			if (d <= SLOP) return;

			dragging = true;
			y0 += SLOP;
			sheet.dataset.drag = "true";
		}

		e.preventDefault();

		const t = performance.now();

		if (t > lastAt) speed = (y - last) / (t - lastAt);

		last = y;
		lastAt = t;
		dy = Math.max(0, y - y0);
		place(dy);
	};

	const end = () => stop(true);
	const cancel = () => stop(false);

	sheet.addEventListener("touchstart", start, { passive: true });
	sheet.addEventListener("touchmove", move, { passive: false });
	sheet.addEventListener("touchend", end);
	sheet.addEventListener("touchcancel", cancel);

	return () => {
		window.clearTimeout(timer);
		sheet.removeEventListener("touchstart", start);
		sheet.removeEventListener("touchmove", move);
		sheet.removeEventListener("touchend", end);
		sheet.removeEventListener("touchcancel", cancel);
		place(0);
		delete sheet.dataset.drag;
	};
}
