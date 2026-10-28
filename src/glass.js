import fragSource from "./glass.frag?raw";

const vertSource = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const MAX_DPR = 2;
const MAX_TEXTURE_EDGE = 2560;

// Critically-ish damped spring, integrated per frame
class Spring {
  constructor(value, { stiffness = 260, damping = 26 } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  step(dt) {
    const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
  }

  snap(value) {
    this.value = this.target = value;
    this.velocity = 0;
  }

  get settled() {
    return Math.abs(this.target - this.value) < 0.01 && Math.abs(this.velocity) < 0.01;
  }
}

export class LiquidGlass {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!this.gl) throw new Error("WebGL is not supported in this browser");

    this.params = {
      width: 280,
      height: 180,
      radius: 64,
      refraction: 40,
      frost: 2,
      chroma: 0.4,
      zoom: 1.08,
    };

    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.imageSize = [1, 1];
    this.dirty = true;

    // Lens position and shape, in CSS px relative to the canvas
    this.x = new Spring(canvas.clientWidth / 2);
    this.y = new Spring(canvas.clientHeight / 2);
    this.scale = new Spring(1, { stiffness: 320, damping: 18 });
    this.stretchX = new Spring(1, { stiffness: 180, damping: 14 });
    this.stretchY = new Spring(1, { stiffness: 180, damping: 14 });
    this.opacity = new Spring(0, { stiffness: 60, damping: 16 });
    this.springs = [this.x, this.y, this.scale, this.stretchX, this.stretchY, this.opacity];

    this.#initGl();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);

    this.last = performance.now();
    requestAnimationFrame((t) => this.#frame(t));
  }

  #initGl() {
    const { gl } = this;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader error: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program error: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const { name } = gl.getActiveUniform(program, i);
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.uniforms.uImage, 0);
  }

  get dpr() {
    return Math.min(devicePixelRatio || 1, MAX_DPR);
  }

  resize() {
    const { canvas, dpr } = this;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    this.dirty = true;
  }

  // Fades out, swaps the texture, fades back in. Pass { fade: false } to swap in place.
  async setImage(source, { fade = true } = {}) {
    if (fade) {
      this.opacity.target = 0;
      await new Promise((r) => setTimeout(r, this.reducedMotion ? 0 : 220));
    }

    const { gl } = this;
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    const fit = Math.min(1, MAX_TEXTURE_EDGE / Math.max(w, h));

    let upload = source;
    if (fit < 1) {
      upload = document.createElement("canvas");
      upload.width = Math.round(w * fit);
      upload.height = Math.round(h * fit);
      upload.getContext("2d").drawImage(source, 0, 0, upload.width, upload.height);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    this.imageSize = [upload.width, upload.height];

    if (this.reducedMotion || !fade) this.opacity.snap(1);
    else this.opacity.target = 1;
    this.dirty = true;
  }

  moveTo(x, y) {
    if (this.reducedMotion) {
      this.x.snap(x);
      this.y.snap(y);
    } else {
      this.x.target = x;
      this.y.target = y;
    }
    this.dirty = true;
  }

  press(down) {
    this.scale.target = down ? 1.12 : 1;
    if (this.reducedMotion) this.scale.snap(this.scale.target);
    this.dirty = true;
  }

  set(params) {
    Object.assign(this.params, params);
    this.dirty = true;
  }

  #frame(now) {
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;

    if (!this.reducedMotion) {
      // Squash and stretch along the direction of travel
      const vx = Math.abs(this.x.velocity);
      const vy = Math.abs(this.y.velocity);
      this.stretchX.target = 1 + Math.min(vx / 5000, 0.22) - Math.min(vy / 9000, 0.1);
      this.stretchY.target = 1 + Math.min(vy / 5000, 0.22) - Math.min(vx / 9000, 0.1);
    }

    const animating = this.springs.some((s) => !s.settled);
    for (const s of this.springs) s.step(dt);

    if (animating || this.dirty) this.#draw();
    this.dirty = false;
    requestAnimationFrame((t) => this.#frame(t));
  }

  #draw() {
    const { gl, uniforms: u, params, dpr, canvas } = this;
    const scale = this.scale.value * dpr;
    const radius = params.radius * scale;
    const halfW = (params.width / 2) * scale * this.stretchX.value;
    const halfH = (params.height / 2) * scale * this.stretchY.value;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uResolution, canvas.width, canvas.height);
    gl.uniform2f(u.uImageSize, ...this.imageSize);
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform2f(u.uCenter, this.x.value * dpr, canvas.height - this.y.value * dpr);
    gl.uniform2f(u.uSize, halfW, halfH);
    gl.uniform1f(u.uRadius, radius);
    gl.uniform1f(u.uBevel, Math.min(Math.max(radius * 0.55, 20 * dpr), Math.min(halfW, halfH)));
    gl.uniform1f(u.uRefraction, params.refraction * dpr);
    gl.uniform1f(u.uZoom, params.zoom);
    gl.uniform1f(u.uFrost, params.frost * dpr);
    gl.uniform1f(u.uChroma, params.chroma);
    gl.uniform1f(u.uOpacity, Math.max(0, Math.min(1, this.opacity.value)));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
