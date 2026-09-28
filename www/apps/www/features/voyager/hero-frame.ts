import type { PartId } from "./model";

export type BeatId = "title" | "life" | "parts" | "home";
export type Mode = "wide" | "tall";
export type V3 = readonly [number, number, number];

export interface Pose {
	yaw: number;
	pitch: number;
	explode: number;
	fold: number;
	stow: number;
	grow: number;
}

export interface Cam {
	scale: number;
	cx: number;
	cy: number;
}

export interface Box {
	l: number;
	t: number;
	r: number;
	b: number;
}

export interface Fit {
	w: number;
	h: number;
	inside: Box;
	avoid: readonly Box[];
	target: readonly [number, number];
	fill: number;
	cap: number;
	core: ReadonlySet<PartId>;
}

export interface Beat {
	id: BeatId;
	from: number;
	to: number;
}

export interface Pace {
	span: number;
	beats: readonly Beat[];
	cue: number;
}

export const MEDIA_TALL = "(max-width: 760px), (max-aspect-ratio: 4/5)";

export const PACE: Record<Mode, Pace> = {
	wide: {
		span: 330,
		cue: 6,
		beats: [
			{ id: "title", from: 0, to: 55 },
			{ id: "life", from: 80, to: 140 },
			{ id: "parts", from: 165, to: 245 },
			{ id: "home", from: 280, to: 330 },
		],
	},
	tall: {
		span: 360,
		cue: 6,
		beats: [
			{ id: "title", from: 0, to: 55 },
			{ id: "life", from: 80, to: 135 },
			{ id: "parts", from: 160, to: 265 },
			{ id: "home", from: 300, to: 360 },
		],
	},
};

export const MAG_ROOT: V3 = [-1.428, 0.523, 0.209];
export const MAG_TIP: V3 = [-12.059, 8.595, 1.829];
export const RIM: V3 = [0.007, 1.373, 0.039];
export const RIM_RADIUS = 1.825;

const HULL: Record<string, string> = {
	bus: "117 82 6 2 64 28 27 34 55 23 -58 33 111 82 -39 2 110 81 -40 2 16 87 113 8 13 29 86 32 20 31 -69 33 29 55 -74 44 48 55 62 17 25 30 66 34 -83 59 11 13 -86 24 -49 22 -61 21 63 32 -94 25 14 36 -62 26 -23 31 -68 30 22 33 17 13 -90 26 49 -20 -51 34 13 -16 -90 30 -22 13 91 27 45 11 84 17 85 14 47 17 83 -84 -46 7 55 -99 -12 34 81 -80 -45 2 90 -85 20 17 87 -75 21 18 56 -94 5 20 57 -21 31 37 -49 -96 11 15 -49 -19 54 32 -56 -20 -31 36 -51 -88 -3 7 -12 -96 -47 15 3 -92 -49 9 -29 20 34 33 -4 -92 52 9 12 -96 50 15 33 24 24 33 29 19 -31 26 -34 24 -21 28 -14 -17 91 30 60 20 58 29 82 -13 46 13 57 -20 54 31 44 -13 83 13 -20 -17 -88 26 -85 26 -25 31 87 20 21 23 16 -22 90 25 -59 -20 19 26 -88 -16 17 27 -83 -16 -44 13 -24 -20 -60 26 -42 -16 -84 13 28 -24 -53 35 89 -16 -17 27 56 -25 -20 26 22 -20 61 28 21 -23 22 27 25 -17 -26 34 -30 -20 53 34 -20 29 68 32 -61 29 -61 33 -24 31 -67 31 -24 12 -87 27 68 30 -20 33 88 21 -18 29 -61 27 -83 30 -68 45 -65 25 -87 46 -61 9 -71 46 -82 7 95 60 14 23 77 43 17 14 72 46 -45 7 92 65 -42 15 96 65 -18 25 14 60 100 24 -83 45 -14 8 -74 41 43 2 -78 50 30 10 -42 8 83 15 52 -58 -28 40 57 -57 19 28 -48 -64 31 13 -47 -42 42 2 -53 -56 -20 26 -31 -68 -42 20 -38 -55 -39 5 -41 -51 -40 1 21 -61 -49 25 -21 -61 52 25 43 -47 42 9 32 -66 45 18 66 -57 -44 21 90 -88 -19 21 82 -75 -13 16 -41 -14 81 2 -58 -17 -57 27 -86 -14 -21 19 -23 -21 -21 27 87 -14 19 19 -20 -21 20 25 42 4 -81 2 16 49 16 28 17 48 -17 26 -17 50 16 26 -15 49 -17 24 -6 40 -41 3",
	hga: "17 92 103 30 4 220 5 17 20 184 16 34 4 219 -4 16 23 188 -13 32 -4 219 4 16 -16 188 22 33 -4 220 -4 17 -18 187 -20 35 -3 106 3 23 -3 105 -3 23 3 106 4 23 3 105 -3 22 19 72 19 28 -16 72 16 32 19 72 -19 27 -19 72 -19 27 -91 90 15 33 25 89 -91 37 52 96 64 35 16 132 173 26 57 135 169 22 -20 131 173 22 -56 134 169 24 -99 131 141 28 -128 136 128 11 -141 131 99 26 -169 135 58 23 -173 131 17 26 -173 132 -20 22 -170 135 -55 25 -141 131 -99 28 -128 136 -127 11 -99 131 -141 25 -57 135 -169 23 -17 132 -172 26 20 131 -172 19 56 135 -169 24 99 131 -140 28 128 136 -128 11 140 131 -99 25 169 135 -57 22 173 132 -17 25 172 132 21 20 169 135 57 24 141 131 100 28 128 136 128 11 99 131 141 26 19 72 57 32 -21 71 57 28 -21 91 99 28 -55 66 55 30 -64 87 62 27 -58 98 100 31 19 110 138 28 63 125 151 25 -61 125 152 23 -114 123 113 13 -151 125 62 26 -138 110 18 27 -133 114 60 26 -97 110 99 28 -59 113 133 25 -23 111 138 27 -100 98 59 31 -57 71 19 32 -99 91 -21 28 -57 71 -20 31 -99 98 -59 32 -19 71 -57 32 -55 66 -55 29 -63 87 -63 28 -99 110 -97 28 -18 91 -99 27 -59 98 -100 30 -60 114 -132 26 -18 110 -137 26 -62 125 -151 25 -114 124 -113 14 -152 126 -63 24 -132 114 -60 24 -138 110 -22 27 -91 118 -123 10 -126 118 -89 12 63 126 -151 24 151 126 -63 25 152 125 60 24 60 114 133 27 -90 118 126 11 -124 118 91 9 60 98 100 30 114 123 113 15 132 114 60 25 98 109 96 27 99 97 58 32 55 66 55 29 57 71 21 31 57 71 -19 32 99 91 -18 32 100 98 -59 30 138 110 -18 27 137 110 23 27 99 91 22 28 64 87 -62 26 59 98 -98 32 23 110 -137 28 59 114 -133 22 97 110 -99 25 87 118 -125 9 124 118 -90 10 133 114 -59 26 125 118 90 11 91 118 124 11 113 123 -113 14 54 65 -55 28 20 71 -57 32 -51 139 20 20 -72 108 12 38 -39 155 23 1 -54 140 -5 19 -41 163 -11 2 26 105 -70 33 17 137 -51 22 -1 155 -45 1 -3 163 -41 4 8 163 41 4 21 140 50 19 32 107 63 42 29 152 -36 4 43 128 43 4 41 140 35 7 39 151 28 13 -162 137 84 3 -83 137 -162 4 162 137 -83 3 83 137 162 3 -25 83 72 22 22 122 157 21 -25 122 156 20 -83 137 163 1 -156 122 23 22 -72 83 -24 22 -23 83 -71 23 -156 122 -26 22 -163 137 -82 1 -22 122 -156 21 82 137 -162 1 162 137 83 1 72 83 -23 23 72 83 25 23 157 122 -22 21 156 122 23 18 24 122 -156 20 85 64 21 19 85 64 -18 20 17 63 86 23 -21 64 85 21 -86 64 18 21 -86 64 -20 19 -18 64 -85 21 20 64 -85 19",
	boom: "117 82 6 4 95 32 -14 19 111 82 -37 10 110 82 -41 2 140 68 -20 29 140 90 -19 26 112 72 3 12 110 80 -42 1 104 60 -20 28 179 74 -26 22 295 90 -49 20 295 90 -34 22 295 75 -50 21 296 75 -34 21 218 90 -28 23 217 75 -29 21 232 90 -42 17 232 74 -42 18 261 90 -45 22 260 90 -31 21 261 75 -45 20 260 75 -31 17 180 90 -26 23 -144 21 17 33 -213 18 49 25 -175 29 47 26 -211 15 21 30 -145 32 46 32 -144 29 -8 36 -255 -13 20 14 -252 -15 52 10 -255 13 36 9 -99 -11 14 17 -72 -15 62 8 -82 -18 -42 2 -72 26 61 10 -83 24 -41 3 -108 62 20 31 -109 3 16 19 -230 -3 28 15 -237 -5 48 7 -248 14 41 2 -180 22 21 29 -103 20 54 29 -88 -5 59 2 -96 -9 -34 7 -103 23 -28 25 -89 44 43 9 -100 48 -10 17",
	rtg1: "-302 15 47 27 -261 14 33 23 -217 17 31 20 -261 6 49 20 -302 -16 53 25 -262 -15 51 22 -263 -16 28 21 -303 -14 29 27 -303 7 31 25",
	rtg2: "-335 -50 77 23 -318 -46 73 6 -354 -53 81 5 -362 -15 58 23 -313 -16 58 20 -331 -49 19 13 -363 -49 24 6 -365 -18 34 22 -316 -14 30 16 -363 16 52 23 -312 13 51 19 -341 15 54 29 -347 -20 64 34 -365 6 36 9 -315 7 32 10 -341 -19 31 26 -339 5 34 19",
	rtg3: "-418 14 59 30 -420 -17 86 22 -420 -16 60 32 -427 -16 35 23 -376 10 58 31 -375 -14 59 30 -375 -9 36 24 -375 5 37 23 -420 -41 60 17 -419 10 84 12 -424 6 36 15",
	mag: "-115 57 19 23 -142 57 20 33 -157 35 0 1 -136 34 17 28 -148 35 44 10 -751 525 110 28 -770 518 109 25 -781 539 108 33 -1185 852 173 22 -1202 850 171 17 -151 66 -8 12 -172 67 24 25 -168 62 -6 12 -113 32 16 18 -1026 732 148 24 -1037 743 160 1 -1055 744 151 29 -1049 752 161 10 -1068 767 163 10 -1071 766 146 16 -1098 786 165 28 -1118 805 169 10 -1101 781 153 27 -1129 792 162 13 -1137 816 154 27 -1086 759 156 7 -1173 832 170 21 -1178 849 159 10 -1145 816 168 24 -1164 838 157 9 -580 382 86 29 -589 402 92 15 -622 421 92 29 -610 398 87 12 -590 401 75 9 -571 384 74 32 -612 418 78 18 -649 429 93 20 -662 453 95 29 -694 469 100 27 -640 441 103 1 -759 532 121 1 -781 548 122 28 -737 503 106 29 -798 560 125 1 -820 576 126 27 -811 552 116 18 -822 573 112 25 -710 492 102 23 -941 663 135 28 -912 647 134 17 -927 638 133 12 -959 684 145 19 -980 695 141 31 -970 673 139 14 -1011 710 145 26 -867 611 131 20 -897 623 130 30 -854 588 125 25 -868 612 115 21 -891 630 118 14 -905 641 120 1 -848 594 113 15 -347 213 53 28 -376 228 54 27 -338 209 39 11 -389 248 57 19 -415 261 60 32 -404 238 59 3 -431 282 63 16 -461 300 67 30 -447 273 64 10 -506 339 83 25 -534 355 84 27 -551 372 88 21 -536 347 75 24 -504 331 69 24 -548 368 71 14 -562 359 81 3 -490 309 70 20 -477 316 80 1 -483 319 81 1 -229 128 43 12 -255 145 45 29 -217 106 29 28 -245 118 36 7 -257 138 33 27 -231 127 27 16 -272 161 48 12 -303 178 50 26 -290 153 42 10 -274 161 31 9 -301 180 34 26 -332 188 48 21 -186 91 28 30 -199 105 41 1 -213 116 41 18 -167 68 41 6 -158 83 24 10 -147 43 41 1 -1113 801 155 7 -1124 796 157 9 -808 558 121 8 -799 561 111 1 -285 159 36 5 -324 197 38 6",
	pws: "-105 19 21 15 -207 -191 405 2 -310 -188 -327 9 -110 6 51 8 -117 -7 73 8 -125 -23 102 15 -131 -36 127 11 -137 -48 148 15 -146 -66 180 14 -152 -78 203 2 -157 -89 222 18 -167 -109 259 14 -178 -131 298 21 -188 -152 336 16 -193 -164 354 8 -197 -171 370 16 -203 -182 389 9 -120 -16 91 2 -162 -97 236 3 -295 -173 -301 29 -282 -161 -280 2 -267 -144 -256 22 -249 -126 -227 19 -235 -112 -205 9 -218 -94 -176 21 -202 -78 -151 2 -190 -66 -131 14 -173 -48 -103 15 -159 -35 -82 3 -145 -19 -57 21 -129 -3 -32 2 -123 3 -22 2 -114 12 -7 8 -282 -159 -281 3 -163 -36 -85 9 -240 -115 -210 2 -283 -160 -280 1",
	scan: "351 94 -51 29 346 22 -53 36 375 -15 -29 25 375 10 -32 30 341 15 -30 30 349 -16 -29 36 385 -19 -54 39 384 20 -57 32 401 8 -45 12 308 18 -21 30 304 13 -51 34 318 -7 -25 25 308 -8 -57 20 306 46 -24 37 336 59 -33 26 348 62 -52 41 345 91 -39 18 317 92 -35 6 310 56 -60 31 315 91 -51 11 342 -15 -65 31 378 -18 -84 23 401 -4 -46 9 390 10 -81 9 317 28 -82 9 332 26 -83 15 354 -16 -83 13 335 41 -80 1",
	pls: "288 101 -30 22 268 102 -30 25 266 102 -50 26 288 100 -50 21",
	crs: "221 105 -29 22 228 99 -41 20",
	lecp: "224 60 -24 29 229 36 -16 13 248 45 -15 11 247 37 -16 9 234 75 -42 1",
	record: "15 9 90 16 14 -8 90 15 -1 -2 93 3 -2 5 93 5",
};

const CENTER: Record<PartId, V3> = {
	bus: [0.027, -0.088, 0.099],
	hga: [-0.002, 1.439, 0.004],
	boom: [0.268, 0.358, 0.054],
	rtg: [-3.167, -0.14, 0.557],
	mag: [-6.553, 4.416, 0.87],
	pws: [-2.076, -0.847, 0.374],
	scan: [3.451, 0.364, -0.473],
	pls: [2.761, 0.969, -0.394],
	crs: [2.22, 1.045, -0.315],
	lecp: [2.293, 0.541, -0.234],
	record: [0.128, 0.029, 0.902],
};

const EXPLODE: Record<PartId, V3> = {
	bus: [0, 0, 0],
	hga: [0, 1.3, 0],
	boom: [0, 0, 0],
	rtg: [-1.138, -0.05, 0.163],
	mag: [-0.653, 0.5, 0.093],
	pws: [-0.346, -0.7, 0.05],
	scan: [1.039, 0.3, -0.149],
	pls: [0.297, 1.2, -0.042],
	crs: [0, 0.72, 0],
	lecp: [0.3, 1.25, 0.021],
	record: [0.674, -0.55, 1.54],
};

const FOLD: Partial<Record<PartId, V3>> = {
	hga: [0, 1.6, 0],
	rtg: [-0.1, -0.75, 0.02],
	scan: [-0.25, -0.9, 0.05],
	crs: [0, 1.02, 0],
	pls: [0.3, 1.5, -0.04],
	lecp: [0.3, 1.55, 0.02],
};

const SPREAD: Record<string, V3> = {
	rtg2: [-0.317, 0, 0.045],
	rtg3: [-0.634, 0, 0.091],
};

const SWING = 2.15;
const SWUNG_BY = 0.6;
const STOW = 0.8;
const STOW_FROM = 0.5;
const HALF = Math.tan((10.5 * Math.PI) / 180);
const STEP = 6;
const NONE: V3 = [0, 0, 0];

export const ORDER: readonly PartId[] = [
	"bus",
	"hga",
	"boom",
	"rtg",
	"mag",
	"pws",
	"scan",
	"pls",
	"crs",
	"lecp",
	"record",
];

interface Sphere {
	part: number;
	x: number;
	y: number;
	z: number;
	r: number;
	spread: V3;
	sleeve: number;
}

let cache: Sphere[] | null = null;

const MAG_AXIS = (() => {
	const d = [
		MAG_TIP[0] - MAG_ROOT[0],
		MAG_TIP[1] - MAG_ROOT[1],
		MAG_TIP[2] - MAG_ROOT[2],
	];
	const n = Math.hypot(d[0], d[1], d[2]);
	return [d[0] / n, d[1] / n, d[2] / n] as V3;
})();

function spheres(): Sphere[] {
	if (cache) return cache;
	const list: Sphere[] = [];
	for (const [key, text] of Object.entries(HULL)) {
		const name = key.replace(/\d+$/, "") as PartId;
		const part = ORDER.indexOf(name);
		const n = text.split(" ").map(Number);
		for (let i = 0; i + 3 < n.length; i += 4) {
			const x = n[i] / 100;
			const y = n[i + 1] / 100;
			const z = n[i + 2] / 100;
			const along =
				(x - MAG_ROOT[0]) * MAG_AXIS[0] +
				(y - MAG_ROOT[1]) * MAG_AXIS[1] +
				(z - MAG_ROOT[2]) * MAG_AXIS[2];
			list.push({
				part,
				x,
				y,
				z,
				r: n[i + 3] / 100,
				spread: SPREAD[key] ?? NONE,
				sleeve: name === "mag" && along > STOW_FROM ? along - STOW_FROM : 0,
			});
		}
	}
	cache = list;
	return list;
}

export const clamp = (t: number, lo = 0, hi = 1) =>
	Math.min(hi, Math.max(lo, t));

export const smooth = (t: number) => {
	const c = clamp(t);
	return c * c * (3 - 2 * c);
};

export const smoother = (t: number) => {
	const c = clamp(t);
	return c * c * c * (c * (c * 6 - 15) + 10);
};

export function place(pose: Pose): Float64Array {
	const list = spheres();
	const out = new Float64Array(list.length * 5);
	const angle = SWING * smooth(pose.explode / SWUNG_BY);
	const ca = Math.cos(angle);
	const sa = Math.sin(angle);
	const cy = Math.cos(pose.yaw);
	const sy = Math.sin(pose.yaw);
	const cp = Math.cos(pose.pitch);
	const sp = Math.sin(pose.pitch);
	const shrink = STOW * clamp(pose.stow);
	const fold = clamp(pose.fold);
	for (let i = 0; i < list.length; i++) {
		const s = list[i];
		const id = ORDER[s.part];
		let x = s.x;
		let y = s.y;
		let z = s.z;
		let r = s.r;
		if (s.sleeve > 0 && shrink > 0) {
			const back = s.sleeve * shrink;
			x -= MAG_AXIS[0] * back;
			y -= MAG_AXIS[1] * back;
			z -= MAG_AXIS[2] * back;
		}
		if (id === "record") {
			const c = CENTER.record;
			const g = Math.max(0.1, pose.grow);
			const dx = x - c[0];
			const dy = y - c[1];
			const dz = z - c[2];
			x = c[0] + (ca * dx + sa * dz) * g;
			y = c[1] + dy * g;
			z = c[2] + (-sa * dx + ca * dz) * g;
			r *= g;
		}
		const e = EXPLODE[id];
		const f = FOLD[id] ?? e;
		x += (e[0] + (f[0] - e[0]) * fold + s.spread[0]) * pose.explode;
		y += (e[1] + (f[1] - e[1]) * fold + s.spread[1]) * pose.explode;
		z += (e[2] + (f[2] - e[2]) * fold + s.spread[2]) * pose.explode;
		const x1 = cy * x - sy * z;
		const z1 = sy * x + cy * z;
		const o = i * 5;
		out[o] = x1;
		out[o + 1] = cp * y - sp * z1;
		out[o + 2] = sp * y + cp * z1;
		out[o + 3] = r;
		out[o + 4] = s.part;
	}
	return out;
}

export const focal = (w: number, h: number) => Math.min(w, h) / (2 * HALF);

export function turn(point: V3, pose: Pose): V3 {
	const cy = Math.cos(pose.yaw);
	const sy = Math.sin(pose.yaw);
	const cp = Math.cos(pose.pitch);
	const sp = Math.sin(pose.pitch);
	const x1 = cy * point[0] - sy * point[2];
	const z1 = sy * point[0] + cy * point[2];
	return [x1, cp * point[1] - sp * z1, sp * point[1] + cp * z1];
}

export function screen(
	turned: V3,
	cam: Cam,
	w: number,
	h: number,
): [number, number] {
	const f = focal(w, h);
	const d = Math.max(1e-3, f / cam.scale - turned[2]);
	return [cam.cx + (f * turned[0]) / d, cam.cy - (f * turned[1]) / d];
}

function extents(placed: Float64Array, f: number, scale: number) {
	const n = placed.length / 5;
	const out = new Float64Array(n * 4);
	const D = f / scale;
	for (let i = 0; i < n; i++) {
		const o = i * 5;
		const r = placed[o + 3];
		const d = Math.max(r + 0.05, D - placed[o + 2]);
		const k = f / d;
		const rr = (f * r) / Math.max(0.05, d - r);
		const x = placed[o] * k;
		const y = -placed[o + 1] * k;
		const q = i * 4;
		out[q] = x - rr;
		out[q + 1] = y - rr;
		out[q + 2] = x + rr;
		out[q + 3] = y + rr;
	}
	return out;
}

interface Region {
	l: number;
	t: number;
	dx: number;
	dy: number;
	nx: number;
	ny: number;
	blocked: Int32Array;
	core: Box;
}

function coreMask(placed: Float64Array, core: ReadonlySet<PartId>) {
	const n = placed.length / 5;
	const mask = new Uint8Array(n);
	for (let i = 0; i < n; i++)
		mask[i] = core.has(ORDER[placed[i * 5 + 4]]) ? 1 : 0;
	return mask;
}

function region(
	placed: Float64Array,
	mask: Uint8Array,
	fit: Fit,
	scale: number,
): Region | null {
	const ext = extents(placed, focal(fit.w, fit.h), scale);
	const n = mask.length;
	let l = Number.NEGATIVE_INFINITY;
	let r = Number.POSITIVE_INFINITY;
	let t = Number.NEGATIVE_INFINITY;
	let b = Number.POSITIVE_INFINITY;
	const core: Box = {
		l: Number.POSITIVE_INFINITY,
		t: Number.POSITIVE_INFINITY,
		r: Number.NEGATIVE_INFINITY,
		b: Number.NEGATIVE_INFINITY,
	};
	for (let i = 0; i < n; i++) {
		if (!mask[i]) continue;
		const q = i * 4;
		l = Math.max(l, fit.inside.l - ext[q]);
		r = Math.min(r, fit.inside.r - ext[q + 2]);
		t = Math.max(t, fit.inside.t - ext[q + 1]);
		b = Math.min(b, fit.inside.b - ext[q + 3]);
		core.l = Math.min(core.l, ext[q]);
		core.t = Math.min(core.t, ext[q + 1]);
		core.r = Math.max(core.r, ext[q + 2]);
		core.b = Math.max(core.b, ext[q + 3]);
	}
	if (!(l <= r && t <= b)) return null;
	const nx = Math.max(1, Math.ceil((r - l) / STEP));
	const ny = Math.max(1, Math.ceil((b - t) / STEP));
	const dx = (r - l) / nx;
	const dy = (b - t) / ny;
	const W = nx + 2;
	const diff = new Int32Array(W * (ny + 2));
	for (const a of fit.avoid) {
		for (let i = 0; i < n; i++) {
			const q = i * 4;
			const x0 = a.l - ext[q + 2];
			const x1 = a.r - ext[q];
			const y0 = a.t - ext[q + 3];
			const y1 = a.b - ext[q + 1];
			const i0 = Math.max(0, Math.ceil((x0 - l) / dx - 1e-9));
			const i1 = Math.min(nx, Math.floor((x1 - l) / dx + 1e-9));
			const j0 = Math.max(0, Math.ceil((y0 - t) / dy - 1e-9));
			const j1 = Math.min(ny, Math.floor((y1 - t) / dy + 1e-9));
			if (i0 > i1 || j0 > j1) continue;
			diff[j0 * W + i0] += 1;
			diff[j0 * W + i1 + 1] -= 1;
			diff[(j1 + 1) * W + i0] -= 1;
			diff[(j1 + 1) * W + i1 + 1] += 1;
		}
	}
	const blocked = new Int32Array((nx + 1) * (ny + 1));
	for (let j = 0; j <= ny; j++) {
		let row = 0;
		for (let i = 0; i <= nx; i++) {
			row += diff[j * W + i];
			blocked[j * (nx + 1) + i] =
				row + (j > 0 ? blocked[(j - 1) * (nx + 1) + i] : 0);
		}
	}
	return { l, t, dx, dy, nx, ny, blocked, core };
}

const open = (g: Region) => g.blocked.some((v) => v === 0);

function nearest(g: Region, x: number, y: number): [number, number] | null {
	let best: [number, number] | null = null;
	let dist = Number.POSITIVE_INFINITY;
	for (let j = 0; j <= g.ny; j++) {
		const cy = g.t + j * g.dy;
		for (let i = 0; i <= g.nx; i++) {
			if (g.blocked[j * (g.nx + 1) + i] !== 0) continue;
			const cx = g.l + i * g.dx;
			const d = (cx - x) ** 2 + (cy - y) ** 2;
			if (d < dist) {
				dist = d;
				best = [cx, cy];
			}
		}
	}
	return best;
}

function merge(list: Float64Array[]) {
	let n = 0;
	for (const a of list) n += a.length;
	const out = new Float64Array(n);
	let at = 0;
	for (const a of list) {
		out.set(a, at);
		at += a.length;
	}
	return out;
}

export function solve(poses: readonly Pose[], fit: Fit): Cam {
	const placed = merge(poses.map(place));
	const mask = coreMask(placed, fit.core);
	const fallback = (scale: number): Cam => ({
		scale,
		cx: fit.target[0],
		cy: fit.target[1],
	});
	let lo = 4;
	let hi = Math.max(lo, fit.cap);
	const top = region(placed, mask, fit, hi);
	let best = hi;
	if (!top || !open(top)) {
		const bottom = region(placed, mask, fit, lo);
		if (!bottom || !open(bottom)) return fallback(lo);
		for (let k = 0; k < 18; k++) {
			const mid = Math.sqrt(lo * hi);
			const g = region(placed, mask, fit, mid);
			if (g && open(g)) lo = mid;
			else hi = mid;
		}
		best = lo * fit.fill;
	}
	const scale = Math.max(4, best);
	const g = region(placed, mask, fit, scale);
	if (!g) return fallback(scale);
	const x = fit.target[0] - (g.core.l + g.core.r) / 2;
	const y = fit.target[1] - (g.core.t + g.core.b) / 2;
	const at = nearest(g, x, y);
	return at ? { scale, cx: at[0], cy: at[1] } : fallback(scale);
}

export function clear(pose: Pose, cam: Cam, fit: Fit, slack = 0): boolean {
	const placed = place(pose);
	const ext = extents(placed, focal(fit.w, fit.h), cam.scale);
	const n = placed.length / 5;
	for (let i = 0; i < n; i++) {
		const q = i * 4;
		const l = cam.cx + ext[q];
		const t = cam.cy + ext[q + 1];
		const r = cam.cx + ext[q + 2];
		const b = cam.cy + ext[q + 3];
		if (fit.core.has(ORDER[placed[i * 5 + 4]])) {
			if (
				l < fit.inside.l - slack ||
				r > fit.inside.r + slack ||
				t < fit.inside.t - slack ||
				b > fit.inside.b + slack
			)
				return false;
		}
		for (const a of fit.avoid) {
			if (l < a.r && r > a.l && t < a.b && b > a.t) return false;
		}
	}
	return true;
}

export function reach(
	pose: Pose,
	cam: Cam,
	fit: Fit,
	limit: number,
	step = 0.04,
): [number, number] {
	const walk = (sign: number) => {
		let ok = 0;
		for (let a = step; a <= limit + 1e-9; a += step) {
			if (!clear({ ...pose, yaw: pose.yaw + sign * a }, cam, fit, 8)) break;
			ok = a;
		}
		return ok;
	};
	return [-walk(-1), walk(1)];
}

export function beatAt(
	u: number,
	beats: readonly Beat[],
	current: BeatId | null,
	keep = 2,
): BeatId | null {
	if (current) {
		const b = beats.find((x) => x.id === current);
		if (b && u >= b.from - keep && u <= b.to + keep) return current;
	}
	const inside = beats.find(
		(b, i) =>
			u >= b.from && (u <= b.to || (i === beats.length - 1 && u > b.to)),
	);
	if (inside) return inside.id;
	if (u < beats[0].from) return beats[0].id;
	return null;
}

export function nearestBeat(u: number, beats: readonly Beat[]): number {
	let best = 0;
	let dist = Number.POSITIVE_INFINITY;
	beats.forEach((b, i) => {
		const d = u < b.from ? b.from - u : u > b.to ? u - b.to : 0;
		if (d < dist) {
			dist = d;
			best = i;
		}
	});
	return best;
}

export function slots(
	want: readonly number[],
	top: number,
	bottom: number,
	gap: number,
): number[] {
	const n = want.length;
	if (n === 0) return [];
	const order = want.map((_, i) => i).sort((a, b) => want[a] - want[b]);
	const shifted = order.map((i, k) => want[i] - k * gap);
	const blocks: { sum: number; count: number }[] = [];
	for (const v of shifted) {
		blocks.push({ sum: v, count: 1 });
		while (blocks.length > 1) {
			const a = blocks[blocks.length - 2];
			const b = blocks[blocks.length - 1];
			if (a.sum / a.count <= b.sum / b.count) break;
			a.sum += b.sum;
			a.count += b.count;
			blocks.pop();
		}
	}
	const fitted: number[] = [];
	for (const b of blocks)
		for (let k = 0; k < b.count; k++) fitted.push(b.sum / b.count);
	const placed = fitted.map((v, k) => v + k * gap);
	for (let k = 0; k < n; k++) placed[k] = Math.max(placed[k], top + k * gap);
	for (let k = n - 1; k >= 0; k--)
		placed[k] = Math.min(placed[k], bottom - (n - 1 - k) * gap);
	const out = new Array<number>(n);
	order.forEach((i, k) => {
		out[i] = placed[k];
	});
	return out;
}

export interface Shot {
	pose: Pose;
	cam: Cam;
	drift: number;
	approach: number;
}

export interface Plan {
	pose: Pose;
	drift: number;
	approach: number;
}

const pose = (
	yaw: number,
	pitch: number,
	explode = 0,
	fold = 0,
	grow = 1,
): Pose => ({ yaw, pitch, explode, fold, stow: 0, grow });

export const ARRIVE = 0.3;

export const PLANS: Record<Mode, Record<BeatId, Plan>> = {
	wide: {
		title: { pose: pose(2.2, 0.4), drift: 0, approach: 1 },
		life: { pose: pose(3.15, 0.12), drift: 0.2, approach: 1 },
		parts: { pose: pose(2.05, 0.32, 1), drift: 0.16, approach: 1 },
		home: { pose: pose(4.8, 1.3), drift: 0, approach: 1.3 },
	},
	tall: {
		title: { pose: pose(2.5, 0.45), drift: 0, approach: 1 },
		life: { pose: pose(1.75, 0.12), drift: 0.14, approach: 1 },
		parts: { pose: pose(2.3, 0.3, 1, 1, 1.8), drift: 0.12, approach: 1 },
		home: { pose: pose(3.2, 1.3), drift: 0, approach: 1.25 },
	},
};

export function drifted(plan: Plan | Shot, at: number): Pose {
	return { ...plan.pose, yaw: plan.pose.yaw + plan.drift * at };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function blendPose(a: Pose, b: Pose, t: number): Pose {
	return {
		yaw: mix(a.yaw, b.yaw, t),
		pitch: mix(a.pitch, b.pitch, t),
		explode: mix(a.explode, b.explode, t),
		fold: mix(a.fold, b.fold, t),
		stow: mix(a.stow, b.stow, t),
		grow: mix(a.grow, b.grow, t),
	};
}

function blendCam(a: Cam, b: Cam, t: number): Cam {
	return {
		scale: Math.exp(mix(Math.log(a.scale), Math.log(b.scale), t)),
		cx: mix(a.cx, b.cx, t),
		cy: mix(a.cy, b.cy, t),
	};
}

export interface Take {
	pose: Pose;
	cam: Cam;
	hold: number;
}

export function track(
	u: number,
	beats: readonly Beat[],
	shots: readonly Shot[],
	snap: boolean,
): Take {
	if (snap) {
		const i = nearestBeat(u, beats);
		return { pose: drifted(shots[i], 0), cam: shots[i].cam, hold: i };
	}
	for (let i = 0; i < beats.length; i++) {
		const b = beats[i];
		const last = i === beats.length - 1;
		if (u <= b.to || last) {
			if (u >= b.from || i === 0) {
				const local = clamp((u - b.from) / Math.max(1e-6, b.to - b.from));
				return {
					pose: drifted(shots[i], local - 0.5),
					cam: shots[i].cam,
					hold: i,
				};
			}
			const a = beats[i - 1];
			const from = shots[i - 1];
			const to = shots[i];
			const t = clamp((u - a.to) / Math.max(1e-6, b.from - a.to));
			const start = drifted(from, 0.5);
			const end = drifted(to, -0.5);
			if (to.approach > 1) {
				const peak = { ...to.cam, scale: to.cam.scale * to.approach };
				const cam =
					t < 0.7
						? blendCam(from.cam, peak, smoother(t / 0.7))
						: blendCam(peak, to.cam, smoother((t - 0.7) / 0.3));
				return {
					pose: blendPose(start, end, smoother(Math.min(1, t / 0.7))),
					cam,
					hold: -1,
				};
			}
			return {
				pose: blendPose(start, end, smoother(t)),
				cam: blendCam(from.cam, to.cam, smoother(t)),
				hold: -1,
			};
		}
	}
	const i = beats.length - 1;
	return { pose: drifted(shots[i], 0.5), cam: shots[i].cam, hold: i };
}

export function soften(x: number, lo: number, hi: number): number {
	if (x > 0) {
		const k = Math.min(0.15, hi / 2);
		if (k <= 1e-4) return 0;
		return x > hi - k ? hi - k * Math.exp(-(x - (hi - k)) / k) : x;
	}
	const k = Math.min(0.15, -lo / 2);
	if (k <= 1e-4) return 0;
	return x < lo + k ? lo + k * Math.exp((x - (lo + k)) / k) : x;
}
