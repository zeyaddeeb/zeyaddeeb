export const clothVertex = `
attribute vec2 cloth;
attribute vec3 margins;

varying vec2 vCloth;
varying vec3 vMargins;
varying vec3 vNormal;

void main() {
	vCloth = cloth;
	vMargins = margins;
	vNormal = normalize(normalMatrix * normal);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const clothFragment = `
precision highp float;

uniform vec3 uColor;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uCheck;
uniform float uReach;
uniform float uFlat;
uniform float uLoose;
uniform float uOpacity;

varying vec2 vCloth;
varying vec3 vMargins;
varying vec3 vNormal;

float inside(float x) {
	float w = max(fwidth(x), 1e-6);

	return clamp(x / w + 0.5, 0.0, 1.0);
}

float line(float x, float px) {
	float w = max(fwidth(x), 1e-6);

	return 1.0 - clamp(abs(x) / w - px + 0.5, 0.0, 1.0);
}

void main() {
	float seam = vMargins.x;
	float jam = vMargins.y;
	float rim = vMargins.z;
	float alpha =
		inside(uReach - length(vCloth)) *
		inside(seam + 0.002) *
		inside(jam) *
		inside(rim) *
		uOpacity;

	if (alpha < 0.01) discard;

	vec2 k = floor(vCloth / uCheck);
	float tone = (mod(k.x, 2.0) + mod(k.y, 2.0)) * 0.5;
	vec3 color = mix(uPaper, uColor, tone * tone * 0.55 + tone * 0.45);
	float edge = max(line(seam, 0.7), line(jam, 0.7));

	color = mix(color, uInk, edge * 0.85);

	float hem = 1.0 - smoothstep(0.0, 0.7, rim);

	color = mix(color, color * 0.62, hem);

	float axes = max(line(vCloth.x, 0.6), line(vCloth.y, 0.6));

	color = mix(color, uInk, axes * (0.35 + 0.45 * uLoose));

	float shade = 1.0;

	if (uFlat < 0.5) {
		vec3 n = normalize(vNormal);
		vec3 light = normalize(vec3(-0.45, 0.6, 0.66));

		shade = 0.7 + 0.3 * max(dot(n, light), 0.0);
		shade *= mix(0.82, 1.0, smoothstep(0.0, 0.55, n.z));
	}

	gl_FragColor = vec4(color * shade, alpha);
}
`;

export const formVertex = `
varying vec3 vNormal;
varying vec3 vView;

void main() {
	vNormal = normalize(normalMatrix * normal);
	vec4 view = modelViewMatrix * vec4(position, 1.0);
	vView = view.xyz;
	gl_Position = projectionMatrix * view;
}
`;

export const formFragment = `
precision highp float;

uniform vec3 uForm;
uniform vec3 uShade;

varying vec3 vNormal;
varying vec3 vView;

void main() {
	vec3 n = normalize(vNormal);

	if (!gl_FrontFacing) n = -n;

	vec3 light = normalize(vec3(-0.45, 0.6, 0.66));
	float diffuse = max(dot(n, light), 0.0);
	float rim = smoothstep(0.0, 0.5, n.z);
	vec3 color = mix(uShade, uForm, 0.35 + 0.65 * diffuse);

	color = mix(uShade, color, mix(0.6, 1.0, rim));

	if (!gl_FrontFacing) color = mix(color, uShade, 0.45);

	gl_FragColor = vec4(color, 1.0);
}
`;

export const matVertex = `
varying vec2 vAt;

void main() {
	vAt = position.xy;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const matFragment = `
precision highp float;

uniform vec3 uLine;
uniform vec3 uGround;
uniform float uStep;

varying vec2 vAt;

void main() {
	vec2 g = abs(fract(vAt / uStep - 0.5) - 0.5) / max(fwidth(vAt / uStep), vec2(1e-6));
	float minor = 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
	vec2 G = abs(fract(vAt / (uStep * 5.0) - 0.5) - 0.5) / max(fwidth(vAt / (uStep * 5.0)), vec2(1e-6));
	float major = 1.0 - clamp(min(G.x, G.y), 0.0, 1.0);
	vec3 color = mix(uGround, uLine, max(minor * 0.35, major * 0.7));

	gl_FragColor = vec4(color, 1.0);
}
`;
