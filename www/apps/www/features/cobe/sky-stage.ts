import {
	BackSide,
	LinearFilter,
	Mesh,
	PerspectiveCamera,
	Scene,
	ShaderMaterial,
	SphereGeometry,
	type Texture,
	TextureLoader,
	Vector3,
	WebGLRenderer,
} from "three";
import type { Vec } from "./model";

export const FOV = 64;

const vertex = `
varying vec3 vDir;

void main() {
	vDir = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragment = `
precision highp float;

uniform sampler2D map;
uniform vec3 ink;
uniform vec3 deep;
uniform vec3 paper;
uniform vec3 glow;
uniform vec3 warm;
uniform vec3 cool;
uniform vec3 dipole;
uniform float reveal;
uniform float ready;
varying vec3 vDir;

const float PI = 3.14159265358979;

void main() {
	vec3 d = normalize(vDir);
	float l = atan(d.y, d.x);
	float b = asin(clamp(d.z, -1.0, 1.0));
	vec2 uv = vec2(0.5 - l / (2.0 * PI), 0.5 + b / PI);
	float level = texture2D(map, uv).r * ready;
	vec3 color = mix(ink, deep, smoothstep(0.05, 0.36, level));
	color = mix(color, paper, smoothstep(0.34, 0.88, level) * 0.88);
	color = mix(color, glow, smoothstep(0.9, 1.0, level) * 0.5);
	float lean = dot(d, dipole);
	vec3 tint = lean > 0.0 ? warm : cool;
	color = mix(color, tint, reveal * smoothstep(0.0, 1.0, abs(lean)) * 0.6);
	gl_FragColor = vec4(color, 1.0);
}
`;

export interface Palette {
	ink: string;
	deep: string;
	paper: string;
	glow: string;
	warm: string;
	cool: string;
}

export interface Projected {
	x: number;
	y: number;
	front: boolean;
}

export class SkyStage {
	private readonly renderer: WebGLRenderer;
	private readonly scene = new Scene();
	private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
	private readonly material: ShaderMaterial;
	private readonly mesh: Mesh;
	private texture: Texture | null = null;
	private width = 1;
	private height = 1;
	private dpr = 1;
	private frame = 0;

	constructor(
		readonly canvas: HTMLCanvasElement,
		src: string,
		palette: Palette,
		private readonly onReady: () => void,
	) {
		this.renderer = new WebGLRenderer({
			canvas,
			antialias: false,
			alpha: false,
			powerPreference: "low-power",
		});
		this.camera.up.set(0, 0, 1);
		this.material = new ShaderMaterial({
			vertexShader: vertex,
			fragmentShader: fragment,
			side: BackSide,
			depthWrite: false,
			uniforms: {
				map: { value: null },
				ink: { value: new Vector3() },
				deep: { value: new Vector3() },
				paper: { value: new Vector3() },
				glow: { value: new Vector3() },
				warm: { value: new Vector3() },
				cool: { value: new Vector3() },
				dipole: { value: new Vector3(0, 0, 1) },
				reveal: { value: 0 },
				ready: { value: 0 },
			},
		});
		this.setPalette(palette);
		this.mesh = new Mesh(new SphereGeometry(10, 96, 48), this.material);
		this.scene.add(this.mesh);

		new TextureLoader().load(src, (texture) => {
			texture.generateMipmaps = false;
			texture.minFilter = LinearFilter;
			this.texture = texture;
			this.material.uniforms.map.value = texture;
			this.material.uniforms.ready.value = 1;
			this.request();
			this.onReady();
		});
	}

	setPalette(p: Palette) {
		const u = this.material.uniforms;

		toVec(p.ink, u.ink.value);
		toVec(p.deep, u.deep.value);
		toVec(p.paper, u.paper.value);
		toVec(p.glow, u.glow.value);
		toVec(p.warm, u.warm.value);
		toVec(p.cool, u.cool.value);
		this.request();
	}

	look(dir: Vec) {
		this.camera.lookAt(dir[0], dir[1], dir[2]);
		this.request();
	}

	reveal(amount: number, dipole: Vec) {
		this.material.uniforms.reveal.value = amount;
		this.material.uniforms.dipole.value.set(dipole[0], dipole[1], dipole[2]);
		this.request();
	}

	resize(width: number, height: number, dpr: number) {
		if (width === this.width && height === this.height && dpr === this.dpr) {
			return;
		}

		this.width = width;
		this.height = height;
		this.dpr = dpr;
		this.renderer.setPixelRatio(dpr);
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.fov = height < 520 ? 44 : FOV;
		this.camera.updateProjectionMatrix();
		this.draw();
	}

	degreesPerPixel() {
		return this.camera.fov / this.height;
	}

	beamRadius(beamDeg: number) {
		const f =
			this.height / 2 / Math.tan(((this.camera.fov / 2) * Math.PI) / 180);

		return f * Math.tan(((beamDeg / 2) * Math.PI) / 180);
	}

	project(v: Vec): Projected {
		const p = new Vector3(v[0], v[1], v[2]).multiplyScalar(5);
		const view = p.clone().applyMatrix4(this.camera.matrixWorldInverse);

		p.project(this.camera);

		return {
			x: ((p.x + 1) / 2) * this.width,
			y: ((1 - p.y) / 2) * this.height,
			front: view.z < 0,
		};
	}

	request() {
		if (this.frame) return;

		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			this.draw();
		});
	}

	draw() {
		this.camera.updateMatrixWorld();
		this.renderer.render(this.scene, this.camera);
	}

	dispose() {
		cancelAnimationFrame(this.frame);
		this.texture?.dispose();
		this.material.dispose();
		this.mesh.geometry.dispose();
		this.renderer.dispose();
	}
}

function toVec(css: string, out: Vector3) {
	const hex = css.trim().replace("#", "");
	const full =
		hex.length === 3
			? hex
					.split("")
					.map((c) => c + c)
					.join("")
			: hex.slice(0, 6);
	const n = Number.parseInt(full, 16);

	out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
