import {
	BackSide,
	BufferAttribute,
	type BufferGeometry,
	Color,
	type Material,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	PMREMGenerator,
	Scene,
	SphereGeometry,
	type Texture,
	Vector3,
	type WebGLRenderer,
} from "three";

interface Panel {
	at: [number, number, number];
	size: [number, number];
	power: number;
	tint?: number;
	roll?: number;
}

const PANELS: Panel[] = [
	{ at: [-7, 8, 7], size: [9, 5], power: 5.2, tint: 0xfff4e8 },
	{ at: [1, 11, 1], size: [12, 5], power: 3.5, tint: 0xf4f6ff },
	{
		at: [10, 2.5, -4.5],
		size: [1.4, 13],
		power: 16,
		tint: 0xe8efff,
		roll: 0.08,
	},
	{ at: [-10, 1, -6], size: [1.1, 11], power: 9, tint: 0xffe2c2, roll: -0.1 },
	{ at: [1, -6, 9], size: [14, 5], power: 1.8, tint: 0xe6ebf4 },
	{ at: [2, 1.5, 13], size: [20, 9], power: 1.1, tint: 0xf1f3f7 },
	{ at: [0, -10, 0], size: [16, 16], power: 0.5, tint: 0xd8d2c8 },
];

function sky(): BufferGeometry {
	const geo = new SphereGeometry(30, 48, 24);
	const pos = geo.getAttribute("position");
	const colors = new Float32Array(pos.count * 3);
	const top = new Color(0x2a2c31).multiplyScalar(0.2);
	const low = new Color(0x0e0d0c).multiplyScalar(0.08);
	const c = new Color();

	for (let i = 0; i < pos.count; i++) {
		const t = (pos.getY(i) / 30 + 1) / 2;

		c.copy(low).lerp(top, t * t);
		colors[i * 3] = c.r;
		colors[i * 3 + 1] = c.g;
		colors[i * 3 + 2] = c.b;
	}

	geo.setAttribute("color", new BufferAttribute(colors, 3));

	return geo;
}

export interface Studio {
	texture: Texture;
	dispose(): void;
}

export function createStudio(renderer: WebGLRenderer): Studio {
	const scene = new Scene();
	const geometries: BufferGeometry[] = [];
	const materials: Material[] = [];
	const room = sky();
	const roomMat = new MeshBasicMaterial({ side: BackSide, vertexColors: true });

	geometries.push(room);
	materials.push(roomMat);
	scene.add(new Mesh(room, roomMat));

	const origin = new Vector3();

	for (const p of PANELS) {
		const geo = new PlaneGeometry(p.size[0], p.size[1]);
		const mat = new MeshBasicMaterial({ color: p.tint ?? 0xffffff });

		mat.color.multiplyScalar(p.power);

		const mesh = new Mesh(geo, mat);

		mesh.position.set(p.at[0], p.at[1], p.at[2]);
		mesh.lookAt(origin);
		mesh.rotateZ(p.roll ?? 0);
		geometries.push(geo);
		materials.push(mat);
		scene.add(mesh);
	}

	const pmrem = new PMREMGenerator(renderer);
	const target = pmrem.fromScene(scene, 0.02, 0.1, 80, { size: 256 });

	pmrem.dispose();

	for (const g of geometries) g.dispose();

	for (const m of materials) m.dispose();

	return {
		texture: target.texture,
		dispose: () => target.dispose(),
	};
}
