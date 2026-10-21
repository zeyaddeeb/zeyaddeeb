import {
	type BufferGeometry,
	CapsuleGeometry,
	Color,
	CylinderGeometry,
	Group,
	IcosahedronGeometry,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	Mesh,
	OrthographicCamera,
	Scene,
	ShaderMaterial,
	WebGLRenderer,
} from "three";
import {
	NODE_VERTEX,
	STUB_VERTEX,
	SURFACE_FRAGMENT,
	TUBE_VERTEX,
} from "./shaders";

export const RISE = 0.34;
export const RADIUS = 1;
export const TWIST = (34.29 * Math.PI) / 180;
export const PHASE = (140 * Math.PI) / 180;
export const PITCH = 1;
export const RAILS = 0.62;

export interface Palette {
	bases: [string, string, string, string];
	faded: string;
	rail: string;
	rna: string;
	back: string;
}

export interface Frame {
	bases: Uint8Array;
	live: Float32Array;
	paired: Float32Array;
	flat: number;
	focus: number;
	center: number;
	spin: number;
	open: readonly [number, number] | null;
	swing: number;
	face: number;
	rna: number;
	cut: number;
	pull: number;
	gap: number;
	wave: number;
}

export interface Layout {
	middle: number;
	focus: number;
	pitch: number;
	rails: number;
}

export const LETTER = 15;
export const COIL_ZOOM = 0.235;

const NODE = 0.105;
const RNA_NODE = 0.095;
const STUB = 0.072;
const BOND = 0.06;
const TUBE = 0.058;
const RNA_TUBE = 0.04;

export const SWING = 0.5;

function shared(palette: Palette, length: number) {
	const colors = palette.bases.map((hex) => new Color(hex));

	return {
		uRise: { value: RISE },
		uRadius: { value: RADIUS },
		uTwist: { value: TWIST },
		uPhase: { value: PHASE },
		uPitch: { value: PITCH },
		uFlat: { value: 0 },
		uCenter: { value: length / 2 },
		uReach: { value: length },
		uWave: { value: 0.4 },
		uRails: { value: RAILS },
		uOpen: { value: 0 },
		uOpenFrom: { value: 0 },
		uOpenTo: { value: 0 },
		uSwing: { value: 0 },
		uFace: { value: -1 },
		uCut: { value: 1e6 },
		uPull: { value: 0 },
		uGap: { value: 2.5 },
		uRna: { value: 0 },
		uColors: { value: colors },
		uRail: { value: new Color(palette.rail) },
		uFaded: { value: new Color(palette.faded) },
		uBack: { value: new Color(palette.back) },
		uRnaTint: { value: new Color(palette.rna) },
		uNode: { value: NODE },
		uRnaNode: { value: RNA_NODE },
		uStub: { value: STUB },
		uBond: { value: BOND },
		uTube: { value: TUBE },
		uRnaTube: { value: RNA_TUBE },
	};
}

function instanced(base: BufferGeometry, count: number) {
	const geometry = new InstancedBufferGeometry();

	geometry.index = base.index;
	geometry.setAttribute("position", base.attributes.position);
	geometry.setAttribute("normal", base.attributes.normal);
	geometry.instanceCount = count;

	return geometry;
}

function attributes(geometry: InstancedBufferGeometry, count: number) {
	const make = (name: string) => {
		const attribute = new InstancedBufferAttribute(new Float32Array(count), 1);

		geometry.setAttribute(name, attribute);

		return attribute;
	};

	return {
		index: make("aIndex"),
		strand: make("aStrand"),
		rna: make("aRna"),
		base: make("aBase"),
		state: make("aState"),
		next: make("aNext"),
	};
}

type Attributes = ReturnType<typeof attributes>;

function lanes(attr: Attributes, count: number, step: number) {
	for (let i = 0; i < count; i++) {
		attr.index.array[i] = i;
		attr.strand.array[i] = 1;
		attr.index.array[count + i] = i;
		attr.strand.array[count + i] = -1;
		attr.index.array[count * 2 + i] = i;
		attr.rna.array[count * 2 + i] = 1;

		for (let lane = 0; lane < 3; lane++)
			attr.next.array[count * lane + i] = i + step;
	}

	attr.index.needsUpdate = true;
	attr.strand.needsUpdate = true;
	attr.rna.needsUpdate = true;
	attr.next.needsUpdate = true;
}

export interface Helix {
	draw(frame: Frame): void;
	resize(width: number, height: number): void;
	layout(): Layout;
	dispose(): void;
}

export function createHelix(
	canvas: HTMLCanvasElement,
	palette: Palette,
	length: number,
): Helix {
	const renderer = new WebGLRenderer({
		canvas,
		alpha: true,
		antialias: true,
	});

	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

	const scene = new Scene();
	const group = new Group();

	scene.add(group);

	const camera = new OrthographicCamera(-1, 1, 1, -1, -100, 100);

	scene.add(camera);

	const uniforms = shared(palette, length);

	const surface = (vertexShader: string) =>
		new ShaderMaterial({
			vertexShader,
			fragmentShader: SURFACE_FRAGMENT,
			uniforms,
		});

	const nodeMaterial = surface(NODE_VERTEX);
	const stubMaterial = surface(STUB_VERTEX);
	const tubeMaterial = surface(TUBE_VERTEX);

	const nodeBase = new IcosahedronGeometry(1, 3);
	const stubBase = new CapsuleGeometry(1, 1, 6, 14);
	const tubeBase = new CylinderGeometry(1, 1, 1, 16, 12, true);

	stubBase.rotateZ(-Math.PI / 2);
	tubeBase.rotateZ(-Math.PI / 2);

	const links = Math.max(length - 1, 0);

	const nodeGeometry = instanced(nodeBase, length * 3);
	const stubGeometry = instanced(stubBase, length * 3);
	const tubeGeometry = instanced(tubeBase, links * 3);

	const nodeAttr = attributes(nodeGeometry, length * 3);
	const stubAttr = attributes(stubGeometry, length * 3);
	const tubeAttr = attributes(tubeGeometry, links * 3);

	lanes(nodeAttr, length, 0);
	lanes(stubAttr, length, 0);
	lanes(tubeAttr, links, 1);

	const tubes = new Mesh(tubeGeometry, tubeMaterial);
	const stubs = new Mesh(stubGeometry, stubMaterial);
	const nodes = new Mesh(nodeGeometry, nodeMaterial);

	for (const mesh of [tubes, stubs, nodes]) {
		mesh.frustumCulled = false;
		group.add(mesh);
	}

	const following = new Int32Array(length);

	let width = 1;
	let height = 1;
	let view: Layout = { middle: 0, focus: 0, pitch: 1, rails: 1 };

	function frame(flat: number, focus: number, swing: number) {
		const ratio = height / Math.max(width, 1);
		const wide = (width / LETTER / 2) * PITCH;
		const want = Math.max(wide * (COIL_ZOOM + (1 - COIL_ZOOM) * flat), PITCH);
		const fits =
			(RADIUS * (1.42 + swing * 1.1 + flat)) / Math.max(ratio, 0.0001);
		const half = Math.max(want, fits);
		const tall = half * ratio;

		camera.left = -half;
		camera.right = half;
		camera.top = tall;
		camera.bottom = -tall;
		camera.position.set(0, 0, 10);
		camera.lookAt(0, 0, 0);
		camera.updateProjectionMatrix();

		group.position.x = -focus * (RISE + (PITCH - RISE) * flat);

		const scale = width / (half * 2);

		view = {
			middle: width / 2,
			focus,
			pitch: PITCH * scale,
			rails: RAILS * scale,
		};
	}

	return {
		draw(next) {
			const { bases, live, paired } = next;
			const rnaLane = length * 2;
			const tubeLane = links * 2;

			let after = -1;

			for (let i = length - 1; i >= 0; i--) {
				following[i] = after;
				if ((live[i] ?? 1) > 0) after = i;
			}

			for (let i = 0; i < length; i++) {
				const code = bases[i] ?? 0;
				const state = live[i] ?? 1;
				const bound = paired[i] ?? 0;
				const guide = next.face > 0 ? code : 3 - code;

				for (const attr of [nodeAttr, stubAttr]) {
					attr.base.array[i] = code;
					attr.base.array[length + i] = 3 - code;
					attr.base.array[rnaLane + i] = guide;
					attr.state.array[i] = state;
					attr.state.array[length + i] = state;
					attr.state.array[rnaLane + i] = bound;
				}

				if (i < links) {
					const to = state > 0 ? following[i] : -1;
					const joined = to >= 0 ? Math.min(state, live[to] ?? 1) : 0;
					const reach = to >= 0 ? to : i + 1;

					tubeAttr.state.array[i] = joined;
					tubeAttr.state.array[links + i] = joined;
					tubeAttr.next.array[i] = reach;
					tubeAttr.next.array[links + i] = reach;
					tubeAttr.state.array[tubeLane + i] = Math.min(
						bound,
						paired[i + 1] ?? 0,
					);
				}
			}

			for (const attr of [nodeAttr, stubAttr, tubeAttr]) {
				attr.base.needsUpdate = true;
				attr.state.needsUpdate = true;
			}

			tubeAttr.next.needsUpdate = true;

			uniforms.uFlat.value = next.flat;
			uniforms.uCenter.value = next.center;
			uniforms.uWave.value = next.wave;
			uniforms.uOpen.value = next.open ? 1 : 0;
			uniforms.uOpenFrom.value = next.open ? next.open[0] : 0;
			uniforms.uOpenTo.value = next.open ? next.open[1] : 0;
			uniforms.uSwing.value = next.swing;
			uniforms.uFace.value = next.face;
			uniforms.uCut.value = next.cut;
			uniforms.uPull.value = next.pull;
			uniforms.uGap.value = next.gap;
			uniforms.uRna.value = next.rna;

			group.rotation.x = next.spin * (1 - next.flat);

			frame(next.flat, next.focus, next.swing * (1 - next.flat));
			renderer.render(scene, camera);
		},
		resize(w, h) {
			width = Math.max(1, Math.round(w));
			height = Math.max(1, Math.round(h));
			renderer.setSize(width, height, false);
		},
		layout() {
			return view;
		},
		dispose() {
			for (const geometry of [
				nodeBase,
				stubBase,
				tubeBase,
				nodeGeometry,
				stubGeometry,
				tubeGeometry,
			])
				geometry.dispose();

			for (const material of [nodeMaterial, stubMaterial, tubeMaterial])
				material.dispose();

			renderer.dispose();
		},
	};
}
