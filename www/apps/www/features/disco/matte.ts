const VERTEX = `
attribute vec2 corner;
varying vec2 at;

void main() {
	at = corner * 0.5 + 0.5;
	gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D film;
uniform float texel;
varying vec2 at;

void main() {
	vec2 left = vec2(clamp(at.x * 0.5, texel, 0.5 - texel), 1.0 - at.y);
	vec3 color = texture2D(film, left).rgb;
	float matte = texture2D(film, left + vec2(0.5, 0.0)).g;
	float alpha = smoothstep(0.38, 0.74, matte);
	vec3 lit = color * (alpha / max(matte, 0.06));

	gl_FragColor = vec4(min(lit, vec3(alpha)), alpha);
}`;

function shader(gl: WebGLRenderingContext, kind: number, source: string) {
	const made = gl.createShader(kind);

	if (!made) throw new Error("no shader");

	gl.shaderSource(made, source);
	gl.compileShader(made);

	if (!gl.getShaderParameter(made, gl.COMPILE_STATUS))
		throw new Error(gl.getShaderInfoLog(made) ?? "shader failed");

	return made;
}

function program(gl: WebGLRenderingContext) {
	const made = gl.createProgram();

	gl.attachShader(made, shader(gl, gl.VERTEX_SHADER, VERTEX));
	gl.attachShader(made, shader(gl, gl.FRAGMENT_SHADER, FRAGMENT));
	gl.linkProgram(made);

	if (!gl.getProgramParameter(made, gl.LINK_STATUS))
		throw new Error(gl.getProgramInfoLog(made) ?? "program failed");

	gl.useProgram(made);

	return made;
}

function square(gl: WebGLRenderingContext, made: WebGLProgram) {
	const corner = gl.getAttribLocation(made, "corner");

	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
		gl.STATIC_DRAW,
	);
	gl.enableVertexAttribArray(corner);
	gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
}

function texture(gl: WebGLRenderingContext) {
	gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

export class Cutter {
	private canvas = document.createElement("canvas");
	private gl: WebGLRenderingContext | null;
	private texel: WebGLUniformLocation | null = null;

	constructor() {
		this.gl = this.canvas.getContext("webgl", { premultipliedAlpha: true });

		if (!this.gl) return;

		try {
			const made = program(this.gl);

			square(this.gl, made);
			texture(this.gl);
			this.texel = this.gl.getUniformLocation(made, "texel");
		} catch {
			this.gl = null;
		}
	}

	get works() {
		return this.gl !== null;
	}

	cut(film: HTMLVideoElement, onto: HTMLCanvasElement) {
		const gl = this.gl;
		const ctx = onto.getContext("2d");

		if (!gl || !ctx || !film.videoWidth) return false;

		this.canvas.width = onto.width;
		this.canvas.height = onto.height;
		gl.viewport(0, 0, onto.width, onto.height);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, film);
		gl.uniform1f(this.texel, 0.5 / film.videoWidth);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		ctx.clearRect(0, 0, onto.width, onto.height);
		ctx.drawImage(this.canvas, 0, 0);

		return true;
	}
}
