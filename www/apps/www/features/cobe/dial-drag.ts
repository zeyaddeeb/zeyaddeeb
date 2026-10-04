export interface DialPoint {
	x: number;
	y: number;
}

const DEG_PER_PX = 1.2;

export function dialDrag(
	from: DialPoint,
	to: DialPoint,
	center: DialPoint,
	radius: number,
	rotary: boolean,
) {
	if (!rotary) return (to.x - from.x + from.y - to.y) * DEG_PER_PX;

	const distance = (p: DialPoint) => Math.hypot(p.x - center.x, p.y - center.y);
	if (Math.min(distance(from), distance(to)) < radius * 0.3) return 0;

	const angle = (p: DialPoint) =>
		(Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
	const delta = angle(to) - angle(from);

	return ((delta + 540) % 360) - 180;
}
