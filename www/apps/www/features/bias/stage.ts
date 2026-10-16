import {
	BufferAttribute,
	BufferGeometry,
	Color,
	DoubleSide,
	FrontSide,
	Group,
	Matrix4,
	Mesh,
	type Object3D,
	OrthographicCamera,
	Quaternion,
	Scene,
	ShaderMaterial,
	Vector3,
	WebGLRenderer,
} from "three";
import type { Form } from "./forms";
import type { ClothMesh } from "./mesh";
import {
	clothFragment,
	clothVertex,
	formFragment,
	formVertex,
} from "./shaders";

export interface Palette {
	ground: string;
	form: string;
	shade: string;
	paper: string;
	ink: string;
	pieces: string[];
}

export interface Projected {
	x: number;
	y: number;
	front: boolean;
}

export const CHECK = 0.125;

const BASE = new Quaternion().setFromAxisAngle(
	new Vector3(1, 0, 0),
	-Math.PI / 2,
);
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);

export function clothMaterial(palette: Palette, flat: boolean) {
	return new ShaderMaterial({
		vertexShader: clothVertex,
		fragmentShader: clothFragment,
		transparent: true,
		depthWrite: true,
		side: flat ? DoubleSide : FrontSide,
		uniforms: {
			uColor: { value: new Color() },
			uPaper: { value: new Color(palette.paper) },
			uInk: { value: new Color(palette.ink) },
			uCheck: { value: CHECK },
			uReach: { value: 1e3 },
			uFlat: { value: flat ? 1 : 0 },
			uLoose: { value: 0 },
			uOpacity: { value: 1 },
		},
	});
}

export function clothGeometry(mesh: ClothMesh, flat: boolean) {
	const geometry = new BufferGeometry();

	geometry.setAttribute(
		"position",
		new BufferAttribute(flat ? mesh.flat : mesh.draped, 3),
	);
	geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
	geometry.setAttribute("cloth", new BufferAttribute(mesh.cloth, 2));
	geometry.setAttribute("margins", new BufferAttribute(mesh.margins, 3));
	geometry.setIndex(new BufferAttribute(mesh.index, 1));

	return geometry;
}

export interface Dressing {
	mesh: ClothMesh;
	color: string;
	loose: boolean;
	reach?: number;
}

export function drape(
	meshes: Mesh[],
	parent: Object3D,
	dressings: Dressing[],
	palette: Palette,
	flat: boolean,
) {
	while (meshes.length < dressings.length) {
		const mesh = new Mesh(new BufferGeometry(), clothMaterial(palette, flat));

		mesh.renderOrder = 1;
		parent.add(mesh);
		meshes.push(mesh);
	}

	meshes.forEach((mesh, i) => {
		const d = dressings[i];

		mesh.geometry.dispose();
		mesh.geometry = d ? clothGeometry(d.mesh, flat) : new BufferGeometry();
		mesh.visible = d !== undefined;

		if (!d) return;

		const u = (mesh.material as ShaderMaterial).uniforms;

		u.uColor.value.set(d.color);
		u.uLoose.value = d.loose ? 1 : 0;
		u.uReach.value = d.reach ?? 1e3;
	});
}

export class FormStage {
	private readonly renderer: WebGLRenderer;
	private readonly scene = new Scene();
	private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
	private readonly group = new Group();
	private readonly formMaterial: ShaderMaterial;
	private formMesh: Mesh | null = null;
	private cloth: Mesh[] = [];
	private palette: Palette;
	private width = 1;
	private height = 1;
	private span = 1.2;
	private frame = 0;
	private listeners = new Set<() => void>();
	yaw = -0.55;
	pitch = 0.42;

	constructor(
		readonly canvas: HTMLCanvasElement,
		palette: Palette,
	) {
		this.palette = palette;
		this.renderer = new WebGLRenderer({
			canvas,
			antialias: true,
			alpha: false,
			powerPreference: "high-performance",
		});
		this.renderer.setClearColor(new Color(palette.ground), 1);
		this.camera.position.set(0, 0, 20);
		this.camera.lookAt(0, 0, 0);
		this.formMaterial = new ShaderMaterial({
			vertexShader: formVertex,
			fragmentShader: formFragment,
			side: DoubleSide,
			uniforms: {
				uForm: { value: new Color(palette.form) },
				uShade: { value: new Color(palette.shade) },
			},
		});
		this.scene.add(this.group);
		this.orient();
	}

	setForm(form: Form) {
		if (this.formMesh) {
			this.group.remove(this.formMesh);
			this.formMesh.geometry.dispose();
		}

		const geometry = new BufferGeometry();

		geometry.setAttribute(
			"position",
			new BufferAttribute(form.mesh.positions, 3),
		);
		geometry.setAttribute("normal", new BufferAttribute(form.mesh.normals, 3));
		geometry.setIndex(new BufferAttribute(form.mesh.index, 1));
		this.formMesh = new Mesh(geometry, this.formMaterial);
		this.formMesh.renderOrder = 0;
		this.group.add(this.formMesh);
		this.span = form.radius * 1.14;
		this.resize(this.width, this.height);
	}

	dress(dressings: Dressing[]) {
		drape(this.cloth, this.group, dressings, this.palette, false);
		this.request();
	}

	reach(index: number, value: number) {
		const mesh = this.cloth[index];

		if (!mesh) return;

		(mesh.material as ShaderMaterial).uniforms.uReach.value = value;
		this.request();
	}

	turn(dx: number, dy: number) {
		this.yaw += dx;
		this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + dy));
		this.orient();
		this.request();
	}

	view(yaw: number, pitch: number) {
		this.yaw = yaw;
		this.pitch = pitch;
		this.orient();
		this.request();
	}

	private orient() {
		const q = new Quaternion()
			.setFromAxisAngle(X, this.pitch)
			.multiply(BASE)
			.multiply(new Quaternion().setFromAxisAngle(Z, this.yaw));

		this.group.quaternion.copy(q);
		this.group.updateMatrixWorld(true);
	}

	resize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.renderer.setPixelRatio(Math.min(dpr, 2));
		this.renderer.setSize(this.width, this.height, false);

		const aspect = this.width / this.height;
		const sx = aspect >= 1 ? this.span * aspect : this.span;
		const sy = aspect >= 1 ? this.span : this.span / aspect;

		this.camera.left = -sx;
		this.camera.right = sx;
		this.camera.top = sy;
		this.camera.bottom = -sy;
		this.camera.updateProjectionMatrix();
		this.request();
	}

	private worldAt(x: number, y: number) {
		const nx = (x / this.width) * 2 - 1;
		const ny = 1 - (y / this.height) * 2;

		return [nx * this.camera.right, ny * this.camera.top] as const;
	}

	ray(x: number, y: number) {
		const [wx, wy] = this.worldAt(x, y);
		const inverse = new Matrix4().copy(this.group.matrixWorld).invert();
		const origin = new Vector3(wx, wy, 10).applyMatrix4(inverse);
		const direction = new Vector3(0, 0, -1)
			.transformDirection(inverse)
			.normalize();

		return { origin, direction };
	}

	project(p: readonly number[]): Projected {
		const v = new Vector3(p[0], p[1], p[2]).applyMatrix4(
			this.group.matrixWorld,
		);

		return {
			x: ((v.x / this.camera.right + 1) / 2) * this.width,
			y: ((1 - v.y / this.camera.top) / 2) * this.height,
			front: v.z > -1e-3,
		};
	}

	facing(n: readonly number[]) {
		return new Vector3(n[0], n[1], n[2]).transformDirection(
			this.group.matrixWorld,
		).z;
	}

	request() {
		if (this.frame) return;

		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			this.renderer.render(this.scene, this.camera);

			for (const listener of this.listeners) listener();
		});
	}

	listen(listener: () => void) {
		this.listeners.add(listener);

		return () => {
			this.listeners.delete(listener);
		};
	}

	dispose() {
		cancelAnimationFrame(this.frame);
		this.listeners.clear();

		for (const mesh of this.cloth) {
			mesh.geometry.dispose();
			(mesh.material as ShaderMaterial).dispose();
		}

		this.formMesh?.geometry.dispose();
		this.formMaterial.dispose();
		this.renderer.dispose();
	}
}
