import {
	ClampToEdgeWrapping,
	Color,
	DataTexture,
	LinearFilter,
	LinearMipmapLinearFilter,
	type Material,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	RepeatWrapping,
	SRGBColorSpace,
	type Texture,
	Vector2,
} from "three";

export type Finish =
	| "dish"
	| "dishBack"
	| "kapton"
	| "gold"
	| "aluminum"
	| "silver"
	| "rtg"
	| "fin"
	| "record"
	| "recordEdge"
	| "lens"
	| "white"
	| "brass"
	| "strut"
	| "truss"
	| "anodized"
	| "mli"
	| "paint"
	| "glass"
	| "louver"
	| "plate"
	| "titanium";

export interface Look {
	fade: { value: number };
	ghost: { value: number };
	tint: { value: number };
}

export const createLook = (): Look => ({
	fade: { value: 0 },
	ghost: { value: 0 },
	tint: { value: 0 },
});

export interface Shade {
	ao: { value: Texture | null };
	aoOn: { value: number };
	aoTexel: { value: Vector2 };
}

export const createShade = (): Shade => ({
	ao: { value: null },
	aoOn: { value: 0 },
	aoTexel: { value: new Vector2(1, 1) },
});

const unlit = createShade();

type Lit = MeshStandardMaterial | MeshPhysicalMaterial;

const LUMA = "vec3(0.2126, 0.7152, 0.0722)";

const HEAD = `
uniform float vgFade;
uniform float vgGhost;
uniform float vgTint;
uniform sampler2D vgAO;
uniform float vgAOOn;
uniform vec2 vgAOTexel;
`;

const CRINKLE_VERTEX_HEAD = `
attribute vec3 vgRest;
varying vec3 vgRestV;
`;

const CRINKLE_FRAGMENT_HEAD = `
varying vec3 vgRestV;
vec3 vgHash(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.xxy + p.yxx) * p.zyx);
}
vec3 vgFacet(vec3 p) {
	vec3 i = floor(p);
	vec3 f = p - i;
	float best = 9.0;
	vec3 tilt = vec3(0.0);
	for (int z = -1; z <= 1; z++) {
		for (int y = -1; y <= 1; y++) {
			for (int x = -1; x <= 1; x++) {
				vec3 g = vec3(float(x), float(y), float(z));
				vec3 d = g + vgHash(i + g) - f;
				float e = dot(d, d);
				if (e < best) {
					best = e;
					tilt = vgHash(i + g + 19.19) - 0.5;
				}
			}
		}
	}
	return tilt;
}
`;

const SPECULAR_AA = `
{
	vec3 vgDn = fwidth(normal);
	roughnessFactor = sqrt(min(1.0, roughnessFactor * roughnessFactor + min(0.2, 0.5 * dot(vgDn, vgDn))));
}
`;

const OCCLUSION = `
{
	float vgOcc = mix(1.0, texture2D(vgAO, gl_FragCoord.xy * vgAOTexel).r, vgAOOn);
	float vgNV = saturate(dot(geometryNormal, geometryViewDir));
	reflectedLight.indirectDiffuse *= vgOcc;
	reflectedLight.indirectSpecular *= computeSpecularOcclusion(vgNV, vgOcc, material.roughness);
	reflectedLight.directDiffuse *= mix(1.0, vgOcc, 0.4);
	reflectedLight.directSpecular *= mix(1.0, vgOcc, 0.2);
	#if defined( USE_CLEARCOAT )
	clearcoatSpecularIndirect *= vgOcc;
	#endif
}
`;

const EMBER = `
{
	float vgRim = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
	totalEmissiveRadiance *= 0.1 + 1.9 * vgRim * vgRim * vgRim;
}
`;

const TAIL = `
vec3 vgColor = gl_FragColor.rgb;
float vgLuma = dot(vgColor, ${LUMA});
vec3 vgCast = mix(vec3(0.2, 0.198, 0.19), vec3(0.58, 0.572, 0.55), vgLuma);
vgColor = mix(vgColor, vgCast, vgGhost);
vec3 vgGold = vec3(vgLuma) * vec3(1.32, 0.96, 0.52) + vec3(0.05, 0.034, 0.012);
vgColor = mix(vgColor, vgGold, vgTint);
vgColor = mix(vgColor, vec3(0.0863, 0.0863, 0.0824), vgFade);
gl_FragColor.rgb = vgColor;
`;

export interface Plate {
	rect: readonly [number, number, number, number];
	tone: readonly [number, number, number];
	roughness: number;
}

const glsl = (n: number) => n.toFixed(4);

function crinkleNormal(strength: number, cell: number) {
	return `
{
	vec3 vgP = vgRestV / ${glsl(cell)};
	vec3 vgRx = dFdx(vgRestV);
	vec3 vgRy = dFdy(vgRestV);
	float vgFoot = max(length(vgRx), length(vgRy)) / ${glsl(cell)};
	float vgKeep = 1.0 - smoothstep(0.07, 0.3, vgFoot);
	float vgFine = 1.0 - smoothstep(0.03, 0.12, vgFoot);
	vec3 vgT = vgFacet(vgP) + 0.6 * vgFine * vgFacet(vgP * 2.3 + 7.1);
	vec3 vgSx = dFdx(-vViewPosition);
	vec3 vgSy = dFdy(-vViewPosition);
	vec2 vgH = vec2(
		dot(vgT, vgRx) / max(length(vgSx), 1e-7),
		dot(vgT, vgRy) / max(length(vgSy), 1e-7)
	) * ${glsl(strength)} * vgKeep;
	vec3 vgX = normalize(vgSx);
	vec3 vgY = normalize(vgSy);
	vec3 vgR1 = cross(vgY, normal);
	vec3 vgR2 = cross(normal, vgX);
	float vgDet = dot(vgX, vgR1) * faceDirection;
	vec3 vgGrad = sign(vgDet) * (vgH.x * vgR1 + vgH.y * vgR2);
	normal = normalize(abs(vgDet) * normal - vgGrad);
	roughnessFactor = min(1.0, roughnessFactor + (1.0 - vgKeep) * 0.16);
}
`;
}

function recipe(material: Lit) {
	const data = material.userData;
	const gain = Number(data.gain ?? 1);
	const desat = Number(data.desat ?? 0);
	const floor = Number(data.floor ?? 0);
	const flat = material.map ? Number(data.flat ?? 0) : 0;
	const louver = Boolean(material.map && data.louver);
	const crinkle = Number(data.crinkle ?? 0);
	const cell = Number(data.cell ?? 0.035);
	const plate = data.plate as Plate | undefined;
	const ember = data.heat !== undefined;
	const map = ["float vgPlate = 0.0;", "float vgBlade = 1.0;"];
	if (gain !== 1)
		map.push(
			`diffuseColor.rgb = 0.84 * (1.0 - exp(-diffuseColor.rgb * ${glsl(gain * 1.1)}));`,
		);
	if (desat > 0)
		map.push(
			`diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, ${LUMA})), ${glsl(desat)});`,
		);
	if (floor > 0)
		map.push(
			`diffuseColor.rgb = mix(vec3(${glsl(floor)}), vec3(1.0), diffuseColor.rgb);`,
		);
	if (flat > 0)
		map.push(
			`float vgHi = dot(sampledDiffuseColor.rgb, ${LUMA});`,
			`float vgLo = dot(texture2D(map, vMapUv, 4.0).rgb, ${LUMA});`,
			`diffuseColor.rgb = diffuse * mix(1.0, clamp((vgHi + 0.03) / (vgLo + 0.03), 0.6, 1.4), ${glsl(flat)});`,
		);
	if (louver)
		map.push(
			`vgBlade = smoothstep(0.12, 0.42, dot(sampledDiffuseColor.rgb, ${LUMA}));`,
			"diffuseColor.rgb = mix(vec3(0.018), diffuse, vgBlade);",
		);
	if (plate && material.map) {
		const [u0, v0, u1, v1] = plate.rect.map(glsl);
		const [r, g, b] = plate.tone.map(glsl);
		map.push(
			`vgPlate = step(${u0}, vMapUv.x) * step(vMapUv.x, ${u1}) * step(${v0}, vMapUv.y) * step(vMapUv.y, ${v1});`,
			`diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, ${LUMA})) * vec3(${r}, ${g}, ${b}), vgPlate);`,
		);
	}
	const rough: string[] = [];
	if (plate && material.map)
		rough.push(
			`roughnessFactor = mix(roughnessFactor, ${glsl(plate.roughness)}, vgPlate);`,
		);
	if (louver)
		rough.push("roughnessFactor = mix(0.62, roughnessFactor, vgBlade);");
	const metal = louver
		? ["metalnessFactor = mix(0.0, metalnessFactor, vgBlade);"]
		: [];
	const normal = [crinkle > 0 ? crinkleNormal(crinkle, cell) : "", SPECULAR_AA];
	return {
		map: map.join("\n"),
		rough: rough.join("\n"),
		metal: metal.join("\n"),
		normal: normal.join("\n"),
		glow: ember ? EMBER : "",
		crinkle: crinkle > 0,
		key: [
			gain,
			desat,
			floor,
			flat,
			louver ? 1 : 0,
			ember ? 1 : 0,
			crinkle,
			cell,
			plate ? plate.rect.join(",") : "",
		].join("-"),
	};
}

export function dress<T extends Lit>(
	material: T,
	look: Look,
	shade: Shade = unlit,
): T {
	const r = recipe(material);
	material.onBeforeCompile = (shader) => {
		shader.uniforms.vgFade = look.fade;
		shader.uniforms.vgGhost = look.ghost;
		shader.uniforms.vgTint = look.tint;
		shader.uniforms.vgAO = shade.ao;
		shader.uniforms.vgAOOn = shade.aoOn;
		shader.uniforms.vgAOTexel = shade.aoTexel;
		if (r.crinkle)
			shader.vertexShader = shader.vertexShader
				.replace(
					"#include <common>",
					`#include <common>\n${CRINKLE_VERTEX_HEAD}`,
				)
				.replace(
					"#include <begin_vertex>",
					"#include <begin_vertex>\nvgRestV = vgRest;",
				);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`#include <common>\n${HEAD}${r.crinkle ? CRINKLE_FRAGMENT_HEAD : ""}`,
			)
			.replace("#include <map_fragment>", `#include <map_fragment>\n${r.map}`)
			.replace(
				"#include <roughnessmap_fragment>",
				`#include <roughnessmap_fragment>\n${r.rough}`,
			)
			.replace(
				"#include <metalnessmap_fragment>",
				`#include <metalnessmap_fragment>\n${r.metal}`,
			)
			.replace(
				"#include <normal_fragment_maps>",
				`#include <normal_fragment_maps>\n${r.normal}`,
			)
			.replace(
				"#include <emissivemap_fragment>",
				`#include <emissivemap_fragment>\n${r.glow}`,
			)
			.replace(
				"#include <aomap_fragment>",
				`#include <aomap_fragment>\n${OCCLUSION}`,
			)
			.replace(
				"#include <dithering_fragment>",
				`#include <dithering_fragment>\n${TAIL}`,
			);
	};
	material.customProgramCacheKey = () => `vg-look-${r.key}`;
	return material;
}

function random(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function dataTexture(
	data: Uint8Array,
	width: number,
	height: number,
	color = false,
) {
	const tex = new DataTexture(data, width, height);
	tex.wrapS = RepeatWrapping;
	tex.wrapT = RepeatWrapping;
	tex.magFilter = LinearFilter;
	tex.minFilter = LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 4;
	if (color) tex.colorSpace = SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
}

function crinkle(size: number, seed: number) {
	const rand = random(seed);
	const gx = new Float32Array(size * size);
	const gy = new Float32Array(size * size);
	const layers = [
		{ cells: 6, tilt: 0.3 },
		{ cells: 17, tilt: 0.14 },
	];
	for (const { cells, tilt } of layers) {
		const count = cells * cells;
		const jx = new Float32Array(count);
		const jy = new Float32Array(count);
		const tx = new Float32Array(count);
		const ty = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			jx[i] = 0.1 + rand() * 0.8;
			jy[i] = 0.1 + rand() * 0.8;
			tx[i] = (rand() - 0.5) * 2 * tilt;
			ty[i] = (rand() - 0.5) * 2 * tilt;
		}
		for (let y = 0; y < size; y++) {
			const py = (y / size) * cells;
			const cy = Math.floor(py);
			for (let x = 0; x < size; x++) {
				const px = (x / size) * cells;
				const cx = Math.floor(px);
				let best = Number.POSITIVE_INFINITY;
				let id = 0;
				for (let oy = -1; oy <= 1; oy++) {
					const ry = (((cy + oy) % cells) + cells) % cells;
					for (let ox = -1; ox <= 1; ox++) {
						const rx = (((cx + ox) % cells) + cells) % cells;
						const k = ry * cells + rx;
						const dx = px - (cx + ox + jx[k]);
						const dy = py - (cy + oy + jy[k]);
						const d = dx * dx + dy * dy;
						if (d < best) {
							best = d;
							id = k;
						}
					}
				}
				gx[y * size + x] += tx[id];
				gy[y * size + x] += ty[id];
			}
		}
	}
	const data = new Uint8Array(size * size * 4);
	for (let i = 0; i < size * size; i++) {
		const len = Math.hypot(gx[i], gy[i], 1);
		data[i * 4] = Math.round((gx[i] / len) * 127.5 + 127.5);
		data[i * 4 + 1] = Math.round((gy[i] / len) * 127.5 + 127.5);
		data[i * 4 + 2] = Math.round((1 / len) * 127.5 + 127.5);
		data[i * 4 + 3] = 255;
	}
	return dataTexture(data, size, size);
}

function dishSurface(width: number, height: number, seed: number) {
	const rand = random(seed);
	const panels = 24;
	const rings = [0.34, 0.68];
	const tone = Array.from(
		{ length: panels * (rings.length + 1) },
		() => 0.975 + rand() * 0.035,
	);
	const color = new Uint8Array(width * height * 4);
	const normal = new Uint8Array(width * height * 4);
	const groove = (d: number, w: number) =>
		Math.abs(d) < w ? Math.sign(d) * (1 - Math.abs(d) / w) : 0;
	for (let y = 0; y < height; y++) {
		const v = (y + 0.5) / height;
		const band = rings.filter((r) => v > r).length;
		let ringD = Number.POSITIVE_INFINITY;
		for (const r of rings) {
			const d = (v - r) * height;
			if (Math.abs(d) < Math.abs(ringD)) ringD = d;
		}
		for (let x = 0; x < width; x++) {
			const u = (x + 0.5) / width;
			const cell = u * panels;
			const panel = Math.floor(cell) % panels;
			let seamD = (cell - Math.round(cell)) * (width / panels);
			if (Math.abs(seamD) > width) seamD = width;
			const nx = groove(seamD, 1.6) * 0.55;
			const ny = groove(ringD, 1.4) * 0.5;
			const seam = Math.max(
				1 - Math.min(1, Math.abs(seamD) / 1.2),
				1 - Math.min(1, Math.abs(ringD) / 1.1),
			);
			const shade = tone[band * panels + panel] * (1 - seam * 0.1);
			const i = (y * width + x) * 4;
			const c = Math.round(Math.min(1, shade) * 255);
			color[i] = c;
			color[i + 1] = c;
			color[i + 2] = c;
			color[i + 3] = 255;
			const len = Math.hypot(nx, ny, 1);
			normal[i] = Math.round((nx / len) * 127.5 + 127.5);
			normal[i + 1] = Math.round((ny / len) * 127.5 + 127.5);
			normal[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
			normal[i + 3] = 255;
		}
	}
	const map = dataTexture(color, width, height, true);
	const normalMap = dataTexture(normal, width, height);
	map.wrapT = ClampToEdgeWrapping;
	normalMap.wrapT = ClampToEdgeWrapping;
	return { map, normalMap };
}

function grooves(size: number) {
	const aniso = new Uint8Array(size * size * 4);
	const rough = new Uint8Array(size * size * 4);
	const c = size / 2;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dx = (x + 0.5 - c) / c;
			const dy = (y + 0.5 - c) / c;
			const r = Math.hypot(dx, dy) || 1e-4;
			const i = (y * size + x) * 4;
			const label = r < 0.3;
			aniso[i] = Math.round((-dy / r) * 127.5 + 127.5);
			aniso[i + 1] = Math.round((dx / r) * 127.5 + 127.5);
			aniso[i + 2] = label ? 30 : 255;
			aniso[i + 3] = 255;
			const ring = 0.5 + 0.5 * Math.sin(r * 420);
			const g = label ? 0.42 : 0.2 + ring * 0.08 + (r > 0.94 ? 0.12 : 0);
			rough[i] = 255;
			rough[i + 1] = Math.round(g * 255);
			rough[i + 2] = 255;
			rough[i + 3] = 255;
		}
	}
	const anisotropyMap = dataTexture(aniso, size, size);
	const roughnessMap = dataTexture(rough, size, size);
	for (const t of [anisotropyMap, roughnessMap]) {
		t.wrapS = ClampToEdgeWrapping;
		t.wrapT = ClampToEdgeWrapping;
	}
	return { anisotropyMap, roughnessMap };
}

export class Library {
	readonly textures: Texture[] = [];
	private made = new Map<Finish, Lit>();
	private crinkleMap: Texture | null = null;
	private tiled = new Map<number, Texture>();
	private moved = new Map<number, Texture>();
	private dishMaps: { map: Texture; normalMap: Texture } | null = null;
	private recordMaps: { anisotropyMap: Texture; roughnessMap: Texture } | null =
		null;

	crinkle(repeat = 1) {
		if (!this.crinkleMap) {
			this.crinkleMap = crinkle(256, 7);
			this.textures.push(this.crinkleMap);
		}
		if (repeat === 1) return this.crinkleMap;
		const cached = this.tiled.get(repeat);
		if (cached) return cached;
		const tiled = this.crinkleMap.clone();
		tiled.repeat.set(repeat, repeat);
		tiled.needsUpdate = true;
		this.tiled.set(repeat, tiled);
		this.textures.push(tiled);
		return tiled;
	}

	grooves(channel = 0) {
		const map = this.record().anisotropyMap;
		if (channel === map.channel) return map;
		const cached = this.moved.get(channel);
		if (cached) return cached;
		const moved = map.clone();
		moved.channel = channel;
		moved.needsUpdate = true;
		this.moved.set(channel, moved);
		this.textures.push(moved);
		return moved;
	}

	private dish() {
		if (!this.dishMaps) {
			this.dishMaps = dishSurface(1024, 64, 3);
			this.textures.push(this.dishMaps.map, this.dishMaps.normalMap);
		}
		return this.dishMaps;
	}

	private record() {
		if (!this.recordMaps) {
			this.recordMaps = grooves(512);
			this.textures.push(
				this.recordMaps.anisotropyMap,
				this.recordMaps.roughnessMap,
			);
		}
		return this.recordMaps;
	}

	finish(kind: Finish): Lit {
		const cached = this.made.get(kind);
		if (cached) return cached;
		const made = this.build(kind);
		made.name = kind;
		this.made.set(kind, made);
		return made;
	}

	private build(kind: Finish): Lit {
		switch (kind) {
			case "dish": {
				const { map, normalMap } = this.dish();
				return new MeshPhysicalMaterial({
					color: 0xf1eee7,
					map,
					normalMap,
					normalScale: new Vector2(0.7, 0.7),
					roughness: 0.5,
					metalness: 0,
					clearcoat: 0.12,
					clearcoatRoughness: 0.42,
				});
			}
			case "dishBack":
				return new MeshStandardMaterial({
					color: 0xd6d3cb,
					roughness: 0.66,
					metalness: 0,
				});
			case "kapton": {
				const n = this.crinkle();
				return new MeshPhysicalMaterial({
					color: 0x1a1a1c,
					roughness: 0.5,
					metalness: 0,
					normalMap: n,
					normalScale: new Vector2(0.3, 0.3),
					clearcoat: 0.45,
					clearcoatRoughness: 0.3,
					clearcoatNormalMap: n,
					clearcoatNormalScale: new Vector2(0.38, 0.38),
				});
			}
			case "gold": {
				const n = this.crinkle();
				return new MeshPhysicalMaterial({
					color: 0xe0a94a,
					roughness: 0.26,
					metalness: 1,
					normalMap: n,
					normalScale: new Vector2(0.5, 0.5),
					clearcoat: 0.4,
					clearcoatRoughness: 0.16,
					clearcoatNormalMap: n,
					clearcoatNormalScale: new Vector2(0.5, 0.5),
				});
			}
			case "aluminum":
				return new MeshStandardMaterial({
					color: 0xc8cbd0,
					roughness: 0.34,
					metalness: 1,
				});
			case "silver":
				return new MeshStandardMaterial({
					color: 0xe4e6ea,
					roughness: 0.14,
					metalness: 1,
				});
			case "rtg":
				return new MeshStandardMaterial({
					color: 0x3b3a3a,
					roughness: 0.44,
					metalness: 0.7,
				});
			case "fin":
				return new MeshStandardMaterial({
					color: 0x2d2d2e,
					roughness: 0.52,
					metalness: 0.6,
				});
			case "record": {
				const { anisotropyMap, roughnessMap } = this.record();
				return new MeshPhysicalMaterial({
					color: 0xe8b75e,
					roughness: 1,
					roughnessMap,
					metalness: 1,
					anisotropy: 0.85,
					anisotropyMap,
					clearcoat: 1,
					clearcoatRoughness: 0.05,
				});
			}
			case "recordEdge":
				return new MeshStandardMaterial({
					color: 0xbfc2c6,
					roughness: 0.3,
					metalness: 1,
				});
			case "lens":
				return new MeshPhysicalMaterial({
					color: 0x08090a,
					roughness: 0.12,
					metalness: 0,
					clearcoat: 1,
					clearcoatRoughness: 0.03,
				});
			case "white":
				return new MeshStandardMaterial({
					color: 0xe2dfd8,
					roughness: 0.58,
					metalness: 0,
				});
			case "brass":
				return new MeshStandardMaterial({
					color: 0xd7ad5e,
					roughness: 0.3,
					metalness: 1,
				});
			case "strut":
				return new MeshStandardMaterial({
					color: 0x303134,
					roughness: 0.42,
					metalness: 0.65,
				});
			case "truss":
				return new MeshStandardMaterial({
					color: 0xd8cfb8,
					roughness: 0.42,
					metalness: 0.55,
				});
			case "anodized":
				return new MeshPhysicalMaterial({
					color: 0x2b2c2f,
					roughness: 0.42,
					metalness: 0,
					envMapIntensity: 2.3,
				});
			case "mli":
				return new MeshPhysicalMaterial({
					color: 0x232325,
					roughness: 0.34,
					metalness: 0,
					envMapIntensity: 2,
				});
			case "paint":
				return new MeshPhysicalMaterial({
					color: 0xe8e5de,
					roughness: 0.5,
					metalness: 0,
					clearcoat: 0.1,
					clearcoatRoughness: 0.4,
				});
			case "glass":
				return new MeshPhysicalMaterial({
					color: 0x060708,
					roughness: 0.1,
					metalness: 0,
					clearcoat: 1,
					clearcoatRoughness: 0.03,
				});
			case "louver":
				return new MeshStandardMaterial({
					color: 0xdfe1e5,
					roughness: 0.2,
					metalness: 1,
				});
			case "plate":
				return new MeshStandardMaterial({
					color: 0x979795,
					roughness: 0.6,
					metalness: 0,
				});
			case "titanium":
				return new MeshStandardMaterial({
					color: 0x8f9297,
					roughness: 0.36,
					metalness: 1,
					envMapIntensity: 1.6,
				});
		}
	}

	dispose() {
		for (const m of this.made.values()) m.dispose();
		for (const t of this.textures) t.dispose();
		this.made.clear();
		this.tiled.clear();
		this.moved.clear();
		this.textures.length = 0;
	}
}

const PLATE: Plate = {
	rect: [0.447, 0.002, 0.631, 0.233],
	tone: [0.6, 0.59, 0.56],
	roughness: 0.8,
};

const FLOOR = 0.035;

const INSTRUMENTS = new Set(["scan", "crs", "lecp", "pls"]);

type Shape =
	| readonly [number, number, number, number]
	| readonly [number, number, number];

interface Zone {
	parts: readonly string[];
	shape: Shape;
	finish: Finish;
}

const SCIENCE = ["scan", "crs", "lecp", "pls"] as const;
const PARTICLES = ["crs", "lecp", "pls"] as const;

const ZONES: readonly Zone[] = [
	{ parts: ["scan"], shape: [0.197, 0.437, 0.017], finish: "glass" },
	{ parts: ["scan"], shape: [0.197, 0.437, 0.03], finish: "aluminum" },
	{ parts: ["scan"], shape: [0.31, 0.68, 0.021], finish: "glass" },
	{ parts: ["scan"], shape: [0.31, 0.68, 0.034], finish: "anodized" },
	{ parts: ["scan"], shape: [0.305, 0.765, 0.026], finish: "glass" },
	{ parts: ["scan"], shape: [0.305, 0.765, 0.044], finish: "anodized" },
	{ parts: ["scan"], shape: [0.56, 0.66, 0.108], finish: "glass" },
	{ parts: ["scan"], shape: [0.037, 0.553, 0.037], finish: "anodized" },
	{ parts: ["scan"], shape: [0.68, 0.405, 0.96, 0.58], finish: "paint" },
	{ parts: ["scan"], shape: [0.845, 0.15, 0.9, 0.32], finish: "aluminum" },
	{ parts: ["scan"], shape: [0.66, 0.15, 0.845, 0.4], finish: "mli" },
	{ parts: SCIENCE, shape: [0, 0, 0.21, 0.16], finish: "anodized" },
	{ parts: PARTICLES, shape: [0.005, 0.795, 0.13, 0.9], finish: "anodized" },
	{ parts: PARTICLES, shape: [0.225, 0.35, 0.38, 0.54], finish: "titanium" },
	{ parts: PARTICLES, shape: [0.19, 0.8, 0.48, 1], finish: "aluminum" },
	{ parts: PARTICLES, shape: [0.28, 0.1, 0.44, 0.29], finish: "anodized" },
	{ parts: SCIENCE, shape: [0.58, 0, 0.675, 0.25], finish: "titanium" },
	{ parts: ["rtg"], shape: [0.76, 0.1, 0.1], finish: "titanium" },
	{ parts: ["rtg"], shape: [0.93, 0, 1, 0.6], finish: "titanium" },
	{ parts: ["rtg"], shape: [0.215, 0, 0.265, 0.4], finish: "titanium" },
	{ parts: ["rtg"], shape: [0, 0, 0.215, 0.16], finish: "anodized" },
	{ parts: ["rtg"], shape: [0.44, 0.23, 0.64, 0.33], finish: "anodized" },
	{ parts: ["rtg"], shape: [0.23, 0.53, 0.77, 0.57], finish: "anodized" },
	{ parts: ["bus"], shape: [0.445, 0, 0.635, 0.235], finish: "plate" },
	{ parts: ["bus"], shape: [0.26, 0.11, 0.445, 0.29], finish: "louver" },
	{ parts: ["bus"], shape: [0.445, 0.33, 0.625, 0.54], finish: "louver" },
	{ parts: ["bus"], shape: [0.76, 0.1, 0.095], finish: "mli" },
	{ parts: ["bus"], shape: [0.005, 0.88, 0.19, 1], finish: "mli" },
	{ parts: ["bus"], shape: [0.215, 0, 0.262, 0.4], finish: "titanium" },
	{ parts: ["bus"], shape: [0.05, 0.39, 0.17, 0.62], finish: "titanium" },
	{ parts: ["bus"], shape: [0.635, 0, 0.675, 0.25], finish: "titanium" },
	{ parts: ["bus"], shape: [0, 0, 0.215, 0.16], finish: "anodized" },
	{ parts: ["bus"], shape: [0.262, 0, 0.44, 0.11], finish: "anodized" },
	{ parts: ["bus"], shape: [0, 0.39, 0.05, 0.52], finish: "anodized" },
	{ parts: ["bus"], shape: [0.175, 0.59, 0.35, 0.73], finish: "anodized" },
	{ parts: ["bus"], shape: [0.38, 0.43, 0.445, 0.52], finish: "anodized" },
	{ parts: ["bus"], shape: [0.005, 0.795, 0.13, 0.88], finish: "anodized" },
];

export const ZONED: ReadonlySet<string> = new Set(
	ZONES.flatMap((z) => z.parts),
);

const inside = (shape: Shape, u: number, v: number) =>
	shape.length === 3
		? Math.hypot(u - shape[0], v - shape[1]) <= shape[2]
		: u >= shape[0] && u <= shape[2] && v >= shape[1] && v <= shape[3];

export function zoneOf(part: string, u: number, v: number): Finish | null {
	for (const zone of ZONES)
		if (zone.parts.includes(part) && inside(zone.shape, u, v))
			return zone.finish;
	return null;
}

export function zoned(
	finish: Finish,
	source: Material,
	lib: Library,
	part: string,
): Lit {
	const std = source as MeshStandardMaterial;
	const made = lib.finish(finish).clone() as Lit;
	made.name = `${part}.${finish}`;
	made.side = source.side;
	const bumps = std.normalMap ?? null;
	const flip = Math.sign(std.normalScale?.y ?? 1) || 1;
	const scaled = (s: number) => new Vector2(s, s * flip);
	switch (finish) {
		case "anodized":
			made.map = std.map ?? null;
			made.userData.flat = 0.3;
			break;
		case "mli":
			made.map = std.map ?? null;
			made.normalMap = bumps;
			made.normalScale = scaled(0.45);
			made.userData.flat = 0.1;
			made.userData.crinkle = 0.06;
			made.userData.cell = 0.045;
			break;
		case "paint":
			made.map = std.map ?? null;
			made.normalMap = bumps;
			made.normalScale = scaled(0.6);
			made.userData.flat = 0.22;
			break;
		case "plate":
			made.map = std.map ?? null;
			made.normalMap = bumps;
			made.normalScale = scaled(0.6);
			made.userData.flat = 0.6;
			break;
		case "aluminum":
		case "titanium":
			made.map = std.map ?? null;
			made.userData.flat = 0.25;
			break;
		case "louver":
			made.map = std.map ?? null;
			made.normalMap = bumps;
			made.normalScale = scaled(0.9);
			made.userData.louver = true;
			break;
		default:
			break;
	}
	return made;
}

function textured(std: MeshStandardMaterial, source: Material) {
	return {
		map: std.map ?? null,
		normalMap: std.normalMap ?? null,
		normalScale: std.normalScale?.clone() ?? new Vector2(1, 1),
		roughnessMap: std.roughnessMap ?? null,
		metalnessMap: std.metalnessMap ?? null,
		side: source.side,
	};
}

export function upgrade(source: Material, part: string, lib: Library): Lit {
	const name = source.name.toLowerCase();
	const std = source as MeshStandardMaterial;
	if (name.endsWith(".rim")) {
		return new MeshStandardMaterial({
			color: 0xd9b56a,
			roughness: 0.18,
			metalness: 1,
			side: source.side,
		});
	}
	if (name.includes("krinkle") || name.includes("blanket")) {
		const made = new MeshPhysicalMaterial({
			color: new Color(0x202022),
			roughness: 0.4,
			metalness: 0,
			normalMap: std.normalMap ?? null,
			normalScale: new Vector2(0.2, 0.2),
			envMapIntensity: 1.5,
			side: source.side,
		});
		made.userData.crinkle = 0.24;
		made.userData.cell = 0.036;
		return made;
	}
	if (name.includes("brass")) {
		return new MeshStandardMaterial({
			color: new Color().setRGB(0.4, 0.28, 0.18),
			roughness: 0.5,
			metalness: 1,
			side: source.side,
		});
	}
	if (name.startsWith("tex_02") || name.includes("dish")) {
		const dark = name.includes("other") || name.includes("back");
		const dish = new MeshPhysicalMaterial({
			map: std.map,
			color: new Color(dark ? 0xe6e5e1 : 0xf6f5f1),
			roughness: dark ? 0.62 : 0.48,
			metalness: 0,
			clearcoat: dark ? 0 : 0.12,
			clearcoatRoughness: 0.4,
			side: source.side,
		});
		dish.userData.gain = dark ? 1.9 : 3.4;
		return dish;
	}
	if (part === "record") {
		return new MeshPhysicalMaterial({
			...textured(std, source),
			map: null,
			color: new Color().setRGB(1, 0.68, 0.26),
			roughness: 0.8,
			metalness: 1,
			anisotropy: 0.5,
			anisotropyMap: lib.grooves(1),
			envMapIntensity: 0.85,
		});
	}
	if (INSTRUMENTS.has(part)) {
		const made = new MeshPhysicalMaterial({
			...textured(std, source),
			color: new Color(0xd2d2d6),
			roughness: 1.15,
			metalness: 0.6,
			clearcoat: 0.1,
			clearcoatRoughness: 0.4,
		});
		made.userData.desat = 0.75;
		made.userData.floor = FLOOR;
		return made;
	}
	if (part === "rtg") {
		const made = new MeshPhysicalMaterial({
			...textured(std, source),
			color: std.color ? std.color.clone() : new Color(0xffffff),
			roughness: std.roughness ?? 0.5,
			metalness: std.metalness ?? 0,
			clearcoat: 0.25,
			clearcoatRoughness: 0.35,
		});
		made.userData.floor = FLOOR;
		return made;
	}
	const made = (source as Lit).clone() as Lit;
	if (made.map) made.userData.floor = FLOOR;
	if (made.map && (part === "bus" || part === "boom")) {
		made.userData.desat = 0.6;
		made.userData.plate = PLATE;
	}
	return made;
}
