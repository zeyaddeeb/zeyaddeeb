import {
	Color,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	ShaderMaterial,
	WebGLRenderer,
} from "three";
import { matFragment, matVertex } from "./shaders";
import { CHECK, type Dressing, drape, type Palette } from "./stage";

export interface Placed {
	x: number;
	y: number;
	width: number;
	height: number;
}

const GAP = 0.35;

export function arrange(
	sizes: { width: number; height: number }[],
	aspect: number,
) {
	if (sizes.length === 0)
		return { placed: [] as Placed[], width: 1, height: 1 };

	let best: { placed: Placed[]; width: number; height: number } | null = null;
	let bestScale = 0;
	const widest = Math.max(...sizes.map((s) => s.width));
	const total = sizes.reduce((sum, s) => sum + s.width + GAP, 0);

	for (let k = 0; k <= 24; k++) {
		const limit = widest + ((total - widest) * k) / 24;
		const placed: Placed[] = [];
		let x = 0;
		let y = 0;
		let row = 0;
		let width = 0;

		for (const s of sizes) {
			if (x > 0 && x + s.width > limit + 1e-9) {
				y += row + GAP;
				x = 0;
				row = 0;
			}

			placed.push({ x, y, width: s.width, height: s.height });
			x += s.width + GAP;
			row = Math.max(row, s.height);
			width = Math.max(width, x - GAP);
		}

		const height = y + row;
		const scale = Math.min(aspect / width, 1 / height);

		if (scale > bestScale) {
			bestScale = scale;
			best = { placed, width, height };
		}
	}

	return best ?? { placed: [], width: 1, height: 1 };
}

export class TableStage {
	private readonly renderer: WebGLRenderer;
	private readonly scene = new Scene();
	private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
	private readonly mat: Mesh;
	private pieces: Mesh[] = [];
	private placed: Placed[] = [];
	private bounds: [number, number, number, number][] = [];
	private extent = { width: 1, height: 1 };
	private width = 1;
	private height = 1;
	private frame = 0;

	constructor(
		readonly canvas: HTMLCanvasElement,
		private palette: Palette,
	) {
		this.renderer = new WebGLRenderer({
			canvas,
			antialias: true,
			alpha: false,
		});
		this.renderer.setClearColor(new Color(palette.ground), 1);
		this.camera.position.set(0, 0, 20);
		this.camera.lookAt(0, 0, 0);
		this.mat = new Mesh(
			new PlaneGeometry(400, 400),
			new ShaderMaterial({
				vertexShader: matVertex,
				fragmentShader: matFragment,
				uniforms: {
					uLine: { value: new Color(palette.shade) },
					uGround: { value: new Color(palette.ground) },
					uStep: { value: CHECK * 2 },
				},
			}),
		);
		this.mat.position.z = -1;
		this.scene.add(this.mat);
	}

	lay(dressings: Dressing[], bounds: [number, number, number, number][]) {
		this.bounds = bounds;
		drape(this.pieces, this.scene, dressings, this.palette, true);
		this.place();
	}

	private place() {
		const sizes = this.bounds.map(([u0, u1, v0, v1]) => ({
			width: Math.max(u1 - u0, CHECK),
			height: Math.max(v1 - v0, CHECK),
		}));
		const { placed, width, height } = arrange(sizes, this.width / this.height);

		this.placed = placed;
		this.extent = { width, height };
		this.bounds.forEach(([u0, , , v1], i) => {
			const at = placed[i];

			this.pieces[i]?.position.set(at.x - u0, -at.y - v1, 0);
		});
		this.frameView();
	}

	reach(index: number, value: number) {
		const mesh = this.pieces[index];

		if (!mesh) return;

		(mesh.material as ShaderMaterial).uniforms.uReach.value = value;
		this.request();
	}

	slots() {
		return this.placed;
	}

	resize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.renderer.setPixelRatio(Math.min(dpr, 2));
		this.renderer.setSize(this.width, this.height, false);
		this.place();
	}

	private frameView() {
		const aspect = this.width / this.height;
		const pad = 1.12;
		const w = Math.max(this.extent.width, 1);
		const h = Math.max(this.extent.height, 1);
		const half = Math.max(w / aspect, h) * 0.5 * pad;
		const cx = this.extent.width / 2;
		const cy = -this.extent.height / 2;

		this.camera.left = cx - half * aspect;
		this.camera.right = cx + half * aspect;
		this.camera.top = cy + half;
		this.camera.bottom = cy - half;
		this.camera.updateProjectionMatrix();
		this.request();
	}

	request() {
		if (this.frame) return;

		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			this.renderer.render(this.scene, this.camera);
		});
	}

	dispose() {
		cancelAnimationFrame(this.frame);

		for (const mesh of this.pieces) {
			mesh.geometry.dispose();
			(mesh.material as ShaderMaterial).dispose();
		}

		this.mat.geometry.dispose();
		(this.mat.material as ShaderMaterial).dispose();
		this.renderer.dispose();
	}
}
