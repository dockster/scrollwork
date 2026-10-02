// The little WebGL2 the effects need: one triangle that covers the canvas, a
// program per effect, and uniforms set by name.

export const VERTEX = `#version 300 es
in vec2 p;
out vec2 v_uv;
void main() {
  // (0,0) is the picture's top left, as CSS reads it
  v_uv = vec2((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/** Every fragment shader starts with these, so each file holds only its own work. */
export const FRAGMENT_HEAD = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_fit;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_k;
uniform float u_seed;
uniform float u_intensity;
uniform float u_speed;
in vec2 v_uv;
out vec4 o;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
/** the picture's uv for a point of the host, fitted as background-size: cover or contain would */
vec2 fitted(vec2 uv) { return (uv - 0.5) * u_fit + 0.5; }
vec4 pic(vec2 uv) { return texture(u_tex, fitted(uv)); }
`;

export interface Program {
  prog: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

const compile = (gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null => {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`[scrollwork/fx] shader did not compile: ${log}`);
  }
  return sh;
};

/** A program from the shared vertex shader and this fragment body, its uniforms looked up once. */
export function program(gl: WebGL2RenderingContext, fragment: string): Program | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_HEAD + fragment);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`[scrollwork/fx] program did not link: ${log}`);
  }
  const uniforms = new Map<string, WebGLUniformLocation>();
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const loc = info && gl.getUniformLocation(prog, info.name);
    if (info && loc) uniforms.set(info.name, loc);
  }
  return { prog, uniforms };
}

/** The triangle every program draws: three corners well past the canvas, so the whole of it is covered. */
export function triangle(gl: WebGL2RenderingContext): WebGLVertexArrayObject | null {
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  if (!vao || !buf) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

/** Set the uniforms a program has among those given; the rest are left alone. */
export function setUniforms(gl: WebGL2RenderingContext, p: Program, values: Record<string, number | [number, number]>): void {
  for (const name in values) {
    const loc = p.uniforms.get(name);
    if (!loc) continue;
    const v = values[name];
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else gl.uniform2f(loc, v[0], v[1]);
  }
}

/** A texture ready for a picture: clamped at its edges, filtered linearly, nothing uploaded yet. */
export function texture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}
