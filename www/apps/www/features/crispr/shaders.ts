export const HELIX_COMMON = `
	uniform float uRise;
	uniform float uRadius;
	uniform float uTwist;
	uniform float uPhase;
	uniform float uPitch;
	uniform float uFlat;
	uniform float uCenter;
	uniform float uReach;
	uniform float uWave;
	uniform float uRails;
	uniform float uOpen;
	uniform float uOpenFrom;
	uniform float uOpenTo;
	uniform float uSwing;
	uniform float uFace;
	uniform float uCut;
	uniform float uPull;
	uniform float uGap;
	uniform float uRna;

	uniform vec3 uColors[4];
	uniform vec3 uRail;
	uniform vec3 uFaded;
	uniform vec3 uRnaTint;

	varying vec3 vColor;
	varying vec3 vNormal;
	varying float vGloss;
	varying float vFlat;
	varying float vDepth;

	float flatness(float index) {
		float reached = abs(index - uCenter) / max(uReach, 1.0);
		float start = reached * (1.0 - uWave);

		return smoothstep(start, start + uWave, uFlat);
	}

	float opened(float index) {
		if (uOpen <= 0.0) return 0.0;

		float edge = min(index - uOpenFrom, uOpenTo - index);

		return uOpen * smoothstep(-1.0, 2.5, edge);
	}

	// Only the non-target strand is pushed out of the duplex by the guide.
	float lift(float index, float strand) {
		return abs(strand - uFace) < 0.5 ? opened(index) * uSwing : 0.0;
	}

	float sliced(float index) {
		return uPull * step(uCut - 0.5, index);
	}

	vec3 strandPoint(float index, float strand, float swell) {
		float t = flatness(index);
		float angle = index * uTwist + (strand > 0.0 ? 0.0 : uPhase);
		float radius = uRadius + swell;

		vec3 coiled = vec3(
			index * uRise,
			cos(angle) * radius,
			sin(angle) * radius
		);

		vec3 flatRail = vec3(
			index * uPitch,
			(strand > 0.0 ? 1.0 : -1.0) * (uRails + swell),
			0.0
		);

		vec3 at = mix(coiled, flatRail, t);

		at.x += sliced(index) * uGap * mix(uRise, uPitch, t);

		return at;
	}

	vec3 pairMiddle(float index) {
		return 0.5 * (strandPoint(index, 1.0, 0.0) + strandPoint(index, -1.0, 0.0));
	}

	// Thin in the coil, chunkier once unrolled so the ladder still reads at tape scale.
	float girth(float index) {
		return 1.0 + 1.3 * flatness(index);
	}

	vec3 baseColor(float code) {
		int which = int(code + 0.5);

		if (which == 1) return uColors[1];
		if (which == 2) return uColors[2];
		if (which == 3) return uColors[3];

		return uColors[0];
	}

	vec3 receded(vec3 tint) {
		float light = dot(tint, vec3(0.2126, 0.7152, 0.0722));

		return mix(vec3(light), uFaded, 0.72);
	}

	void frameAlong(vec3 dir, out vec3 side, out vec3 up) {
		vec3 ref = abs(dir.x) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);

		side = normalize(cross(dir, ref));
		up = cross(dir, side);
	}

	void emit(vec3 at, vec3 modelNormal, float index) {
		vec4 mv = modelViewMatrix * vec4(at, 1.0);

		vNormal = normalize(normalMatrix * modelNormal);
		vFlat = flatness(index);
		vDepth = -mv.z;

		gl_Position = projectionMatrix * mv;
	}

	void hide() {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
	}
`;

const INSTANCE = `
	attribute float aIndex;
	attribute float aStrand;
	attribute float aRna;
	attribute float aBase;
	attribute float aState;
`;

// Sugar-phosphate nodes along each backbone.
export const NODE_VERTEX = `
	${INSTANCE}
	${HELIX_COMMON}

	uniform float uNode;
	uniform float uRnaNode;

	void main() {
		bool rna = aRna > 0.5;
		float shown = rna ? aState * uRna : step(0.5, aState);

		if (shown < 0.02) {
			hide();
			return;
		}

		float strand = rna ? uFace : aStrand;
		vec3 center = strandPoint(aIndex, strand, rna ? 0.0 : lift(aIndex, aStrand));
		float size = (rna ? uRnaNode : uNode) * girth(aIndex) * shown;
		bool dim = !rna && aState < 1.5;

		vColor = rna ? uRnaTint : dim ? mix(uRail, uFaded, 0.62) : uRail;
		vGloss = rna ? 0.7 : dim ? 0.16 : 0.55;

		emit(center + position * size, normal, aIndex);
	}
`;

// Each nucleotide's base: a capsule from its backbone node to the pair's middle.
export const STUB_VERTEX = `
	${INSTANCE}
	${HELIX_COMMON}

	uniform float uStub;
	uniform float uBond;

	void main() {
		bool rna = aRna > 0.5;
		float shown = rna ? aState * uRna : step(0.5, aState);

		if (shown < 0.02) {
			hide();
			return;
		}

		float strand = rna ? uFace : aStrand;
		float swell = rna ? 0.0 : lift(aIndex, aStrand);
		vec3 root = strandPoint(aIndex, strand, swell);
		vec3 rest = strandPoint(aIndex, strand, 0.0);
		vec3 middle = pairMiddle(aIndex);

		vec3 toward = middle - root;
		vec3 dir = toward / max(length(toward), 0.0001);
		vec3 side;
		vec3 up;

		frameAlong(dir, side, up);

		float radius = uStub * girth(aIndex) * shown;
		float reach = max(length(middle - rest) - uBond * 0.5 - radius, 0.0);

		reach *= 1.0 - 0.72 * smoothstep(0.0, 0.5, swell);
		reach *= shown;

		float core = clamp(position.x, -0.5, 0.5);
		float cap = position.x - core;

		vec3 at = root
			+ dir * ((core + 0.5) * reach + cap * radius)
			+ side * position.y * radius
			+ up * position.z * radius;

		vec3 tint = baseColor(aBase);
		bool dim = !rna && aState < 1.5;

		vColor = dim ? receded(tint) : tint;
		vGloss = dim ? 0.14 : 0.6;

		emit(at, dir * normal.x + side * normal.y + up * normal.z, aIndex);
	}
`;

// Backbone tubes that follow the helix between consecutive nodes on a strand.
export const TUBE_VERTEX = `
	${INSTANCE}
	${HELIX_COMMON}

	attribute float aNext;

	uniform float uTube;
	uniform float uRnaTube;

	vec3 trace(float u, float strand, bool rna, bool straight, vec3 head, vec3 tail) {
		if (straight) return mix(head, tail, u);

		float index = mix(aIndex, aNext, u);

		return strandPoint(index, strand, rna ? 0.0 : lift(index, strand));
	}

	void main() {
		bool rna = aRna > 0.5;
		float shown = rna ? aState * uRna : step(0.5, aState);
		bool spans = aIndex < uCut && aNext >= uCut;

		// Cas9 breaks both DNA strands; the guide RNA stays whole.
		if (shown < 0.02 || (!rna && spans && uPull > 0.02 && uGap > 0.0)) {
			hide();
			return;
		}

		float strand = rna ? uFace : aStrand;
		vec3 head = strandPoint(aIndex, strand, rna ? 0.0 : lift(aIndex, strand));
		vec3 tail = strandPoint(aNext, strand, rna ? 0.0 : lift(aNext, strand));
		bool straight = spans || aNext - aIndex > 1.5;

		float u = position.x + 0.5;
		vec3 point = trace(u, strand, rna, straight, head, tail);
		vec3 ahead = trace(u + 0.02, strand, rna, straight, head, tail)
			- trace(u - 0.02, strand, rna, straight, head, tail);
		vec3 dir = ahead / max(length(ahead), 0.0001);
		vec3 side;
		vec3 up;

		frameAlong(dir, side, up);

		float radius = (rna ? uRnaTube : uTube) * girth(aIndex) * shown;
		vec3 at = point + side * position.y * radius + up * position.z * radius;

		bool dim = !rna && aState < 1.5;

		vColor = rna ? uRnaTint : dim ? mix(uRail, uFaded, 0.62) : uRail;
		vGloss = rna ? 0.6 : dim ? 0.12 : 0.45;

		emit(at, side * normal.y + up * normal.z, aIndex);
	}
`;

export const SURFACE_FRAGMENT = `
	uniform vec3 uBack;

	varying vec3 vColor;
	varying vec3 vNormal;
	varying float vGloss;
	varying float vFlat;
	varying float vDepth;

	const vec3 KEY = vec3(0.4472, 0.7155, 0.5367);
	const vec3 FILL = vec3(-0.7071, -0.3536, 0.6124);
	const vec3 VIEW = vec3(0.0, 0.0, 1.0);

	void main() {
		vec3 N = normalize(vNormal);
		float facing = max(dot(N, VIEW), 0.0);

		float wrap = max((dot(N, KEY) + 0.3) / 1.3, 0.0);
		float fill = max(dot(N, FILL), 0.0);
		float sky = 0.5 + 0.5 * N.y;

		vec3 H = normalize(KEY + VIEW);
		float nh = max(dot(N, H), 0.0);
		float spec = (pow(nh, 72.0) + 0.12 * pow(nh, 10.0)) * vGloss;
		float rim = pow(1.0 - facing, 3.0);

		vec3 lit = vColor * (0.06 + 0.1 * sky + 0.82 * wrap + 0.16 * fill)
			+ vec3(spec)
			+ rim * 0.2 * mix(vColor, vec3(1.0), 0.4);

		vec3 flatLit = vColor * (0.9 + 0.14 * max(dot(N, KEY), 0.0)) + vec3(spec * 0.25);
		vec3 shaded = mix(lit, flatLit, vFlat);

		float haze = smoothstep(9.7, 11.4, vDepth) * (1.0 - vFlat) * 0.58;

		gl_FragColor = vec4(mix(shaded, uBack, haze), 1.0);

		#include <colorspace_fragment>
	}
`;
