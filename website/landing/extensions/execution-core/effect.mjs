/*! execution-core — Copyright (c) 2026 witqq, MIT; see LICENSE. */
import { defineEffect } from 'agentic-report/effect';

// Original MIT geometry. The camera never moves: source, enclosure and page move.
const clamp = (n) => Math.max(0, Math.min(1, n));
const ease = (n) => {
  const p = clamp(n);
  return p * p * (3 - 2 * p);
};
const mix = (a, b, p) => a.map((n, i) => n + (b[i] - n) * p);
const yaw = -0.57,
  pitch = 0.37;
function view([x, y, z]) {
  const u = x * Math.cos(yaw) + z * Math.sin(yaw);
  const d = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [u, y * Math.cos(pitch) + d * Math.sin(pitch), -y * Math.sin(pitch) + d * Math.cos(pitch)];
}
const sides = [
  { ids: [0, 1, 2, 3], normal: [0, 0, -1] },
  { ids: [4, 7, 6, 5], normal: [0, 0, 1] },
  { ids: [0, 4, 5, 1], normal: [0, -1, 0] },
  { ids: [3, 2, 6, 7], normal: [0, 1, 0] },
  { ids: [0, 3, 7, 4], normal: [-1, 0, 0] },
  { ids: [1, 5, 6, 2], normal: [1, 0, 0] },
];
function box(faces, centre, size, material, rotation = 0) {
  let front;
  const vertices = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ].map(([x, y, z]) => {
    const a = (x * size[0]) / 2,
      b = (y * size[1]) / 2;
    return view([
      centre[0] + a * Math.cos(rotation) - b * Math.sin(rotation),
      centre[1] + a * Math.sin(rotation) + b * Math.cos(rotation),
      centre[2] + (z * size[2]) / 2,
    ]);
  });
  for (const face of sides) {
    const [x, y, z] = face.normal;
    const normal = view([
      x * Math.cos(rotation) - y * Math.sin(rotation),
      x * Math.sin(rotation) + y * Math.cos(rotation),
      z,
    ]);
    if (normal[2] >= 0) continue;
    const drawable = { points: face.ids.map((i) => vertices[i]), normal, material };
    faces.push(drawable);
    if (face.ids === sides[0].ids) front = drawable;
  }
  return front;
}
function attachedMark(faces, owner, centre, size, material) {
  const start = faces.length;
  box(faces, centre, size, material);
  owner.details ??= [];
  for (const face of faces.slice(start)) {
    face.detailOwner = owner;
    owner.details.push(face);
  }
}
function model(progress, variant) {
  const p = clamp(progress),
    faces = [];
  const enter = ease(p / 0.38),
    open = ease((p - 0.18) / 0.3),
    exit = ease((p - 0.58) / 0.36);
  // The source remains readable as a file; copies of its values enter the core.
  const source = box(faces, [-2.28, 0.05, 0.12], [1.02, 1.85, 0.16], 'paper');
  attachedMark(faces, source, [-2.28, 0.64, 0.01], [0.74, 0.13, 0.045], 'signal');
  for (let row = 0; row < 6; row++) {
    attachedMark(faces, source, [-2.49, 0.37 - row * 0.18, 0.01], [0.1, 0.045, 0.04], 'signal');
    attachedMark(
      faces,
      source,
      [-2.14, 0.37 - row * 0.18, 0.01],
      [row % 3 === 0 ? 0.3 : 0.48, 0.045, 0.04],
      'ink',
    );
  }
  // The processing chamber opens, exposing solid vanes rather than a background frame.
  box(faces, [0, -0.86, 0], [2.15, 0.18, 1.65], 'ink');
  box(faces, [0, -0.47, 0], [1.6, 0.5, 1.3], 'body');
  box(faces, [0, 0.3 + open * 0.83, -open * 0.5], [1.74, 0.55, 1.36], 'body');
  box(faces, [0, 0, -0.3], [1.37, 0.14, 0.64], 'signal');
  for (let i = 0; i < 5; i++)
    box(faces, [-0.53 + i * 0.265, 0.14, -0.3], [0.12, 0.28 + open * 0.15, 0.54], 'signal');
  for (let i = 0; i < 3; i++) {
    const x = -1.65 + enter * 1.72 - i * 0.1 * (1 - enter);
    box(faces, [x, -0.28 + i * 0.22, -0.04], [0.5, 0.1, 0.66], i === 1 ? 'signal' : 'paper');
  }
  // Keep all three roles visible on arrival: output starts folded, then opens into a page.
  const pageX = 1.52 + exit * 0.86,
    pageY = -0.1;
  const pageHeight = 1.85;
  const page = box(faces, [pageX, pageY, 0.17], [0.76 + exit * 0.3, pageHeight, 0.13], 'paper');
  attachedMark(
    faces,
    page,
    [pageX - 0.05, pageY + pageHeight * 0.28, 0.08],
    [0.7, 0.13, 0.035],
    'signal',
  );
  for (let i = 0; i < 4; i++)
    attachedMark(
      faces,
      page,
      [pageX - 0.04, pageY + pageHeight * 0.05 - i * 0.18, 0.08],
      [i === 3 ? 0.4 : 0.72, 0.042, 0.035],
      'ink',
    );
  if (variant === 'decision')
    attachedMark(
      faces,
      page,
      [pageX + 0.23, pageY - pageHeight * 0.28, 0.06],
      [0.27, 0.19, 0.035],
      'signal',
    );
  else
    for (let i = 0; i < 4; i++)
      attachedMark(
        faces,
        page,
        [pageX - 0.29 + i * 0.17, pageY - pageHeight * 0.3 + i * 0.055, 0.06],
        [0.1, 0.17 + i * 0.11, 0.035],
        'signal',
      );
  return faces.sort(
    (a, b) => b.points.reduce((n, v) => n + v[2], 0) - a.points.reduce((n, v) => n + v[2], 0),
  );
}
function colour(face, palette) {
  return mix(palette.bg, palette[face.material], lighting(face));
}
function lighting(face) {
  const light = Math.max(
    0,
    (face.normal[0] * -0.38 + face.normal[1] * 0.68 + face.normal[2] * -0.62) /
      Math.hypot(0.38, 0.68, 0.62),
  );
  return 0.47 + light * 0.53;
}
// Opaque material composition uses this model's fixed view.
// Canvas uses the original CSS colours; WebGL resolves the same alpha-over-base layers.
function materials(ctx) {
  const bg = ctx.tokens.rgba('--color-bg').slice(0, 3);
  const over = (value) => mix(bg, value.slice(0, 3), value[3]);
  const text = over(ctx.tokens.rgba('--color-text'));
  return {
    bg,
    ink: mix(bg, text, 0.2),
    body: mix(bg, text, 0.62),
    paper: mix(bg, text, 0.92),
    signal: over(ctx.tokens.rgba('--color-accent')),
    css: {
      bg: ctx.tokens.read('--color-bg'),
      text: ctx.tokens.read('--color-text'),
      signal: ctx.tokens.read('--color-accent'),
    },
    layers: {
      ink: { name: 'text', amount: 0.2 },
      body: { name: 'text', amount: 0.62 },
      paper: { name: 'text', amount: 0.92 },
      signal: { name: 'signal', amount: 1 },
    },
  };
}
function fillFace(paint, face, palette) {
  const layer = palette.layers[face.material];
  paint.globalAlpha = 1;
  paint.fillStyle = palette.css.bg;
  paint.fill();
  paint.globalAlpha = layer.amount;
  paint.fillStyle = palette.css[layer.name];
  paint.fill();
  paint.globalAlpha = 1 - lighting(face);
  paint.fillStyle = palette.css.bg;
  paint.fill();
  paint.globalAlpha = 1;
}
function livePinnedCuts(ctx, surface, element) {
  const cuts = ctx.measure.lines(element).map((rect) => surface.toCanvas(rect));
  for (const control of element.querySelectorAll(
    'header,nav,[role="toolbar"],button,select,input,[data-scheme-toggle]',
  )) {
    if (!visibleContent(control)) continue;
    const rect = control.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0)
      cuts.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  }
  return cuts;
}
function visibleContent(node) {
  const element = node instanceof Element ? node : node.parentElement;
  if (!element) return false;
  let branch = node;
  for (let parent = branch.parentElement; parent !== null; parent = branch.parentElement) {
    if (
      parent instanceof HTMLDetailsElement &&
      !parent.open &&
      branch !== [...parent.children].find((child) => child.tagName === 'SUMMARY')
    )
      return false;
    branch = parent;
  }
  if (
    typeof element.checkVisibility === 'function' &&
    !element.checkVisibility({ visibilityProperty: true })
  )
    return false;
  for (let parent = element; parent !== null; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.contentVisibility === 'hidden') return false;
  }
  return !['hidden', 'collapse'].includes(getComputedStyle(element).visibility);
}
function project(face, rect) {
  const scale = Math.min(rect.width / 6.1, rect.height / 3.1);
  return face.points.map(([x, y, z]) => [
    rect.x + rect.width / 2 + x * scale,
    rect.y + rect.height * 0.56 - y * scale,
    z / 10,
  ]);
}
function shader(gl, kind, source) {
  const item = gl.createShader(kind);
  if (item === null) throw new Error('Unable to allocate execution-core shader.');
  gl.shaderSource(item, source);
  gl.compileShader(item);
  if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) {
    gl.deleteShader(item);
    throw new Error('Unable to compile execution-core shader.');
  }
  return item;
}
function renderer(gl) {
  const vertex = shader(
    gl,
    gl.VERTEX_SHADER,
    'attribute vec3 position;attribute vec3 colour;varying vec3 tint;void main(){gl_Position=vec4(position,1.0);tint=colour;}',
  );
  const fragment = shader(
    gl,
    gl.FRAGMENT_SHADER,
    'precision mediump float;varying vec3 tint;void main(){gl_FragColor=vec4(tint,1.0);}',
  );
  const program = gl.createProgram(),
    buffer = gl.createBuffer();
  if (program === null || buffer === null)
    throw new Error('Unable to allocate execution-core mesh.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error('Unable to link execution-core mesh.');
  const position = gl.getAttribLocation(program, 'position'),
    colourAt = gl.getAttribLocation(program, 'colour');
  const setProgram = gl.useProgram.bind(gl);
  return {
    paint(faces, rect, palette, width, height) {
      const values = [];
      for (const face of faces) {
        const points = project(face, rect),
          rgb = colour(face, palette);
        for (const i of [0, 1, 2, 0, 2, 3])
          values.push(
            (points[i][0] / width) * 2 - 1,
            1 - (points[i][1] / height) * 2,
            points[i][2],
            ...rgb.slice(0, 3),
          );
      }
      setProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(colourAt);
      gl.vertexAttribPointer(colourAt, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, values.length / 6);
    },
    destroy() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}
function opaqueHost(element) {
  for (let node = element; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.98)
      return false;
  }
  return true;
}
export default defineEffect({
  continuous: true,
  mount(ctx) {
    const host = ctx.hosts[0];
    if (host === undefined) return { at() {} };
    const webgl = ctx.render === 'live' ? ctx.canvas({ host, kind: 'webgl' }) : null;
    if (ctx.render === 'live' && webgl === null) {
      ctx.fallback();
      return { at() {} };
    }
    const surface = webgl ?? ctx.canvas({ host, kind: '2d' });
    const mesh = webgl === null ? null : renderer(webgl.context);
    let palette,
      pictures = [];
    function rebuild() {
      palette = materials(ctx);
      pictures = ctx.hosts.flatMap((section) => {
        const image = section.querySelector('img');
        return image === null
          ? []
          : [{ section, image, variant: ctx.attribute(section, 'execution-core') }];
      });
    }
    rebuild();
    const unsubscribe = ctx.tokens.onChange(() => ctx.rebuild('execution-core-theme'));
    const states = ['compile-input', 'compile-process', 'compile-output'];
    const active = new Map();
    let transition = { from: 0, to: 0, start: ctx.clock.now() };
    const stepProgress = (time) =>
      transition.from + (transition.to - transition.from) * ease((time - transition.start) / 0.65);
    const stopStates = states.map((name) =>
      ctx.state.watch(name, (value) => {
        active.set(name, value !== undefined);
        const index = states.reduce((current, key, i) => (active.get(key) ? i : current), 0);
        const next = index / 2;
        if (next === transition.to) return;
        const now = ctx.clock.now();
        transition = { from: stepProgress(now), to: next, start: now };
        ctx.rebuild('execution-core-beat');
      }),
    );
    const lost = (event) => {
      event.preventDefault();
      ctx.fallback();
    };
    if (webgl !== null) surface.element.addEventListener('webglcontextlost', lost);
    const onLoad = () => ctx.rebuild('execution-core-image');
    for (const { image } of pictures) image.addEventListener('load', onLoad);
    return {
      at(time) {
        const ratio = surface.ratio,
          width = surface.element.width / ratio,
          height = surface.element.height / ratio;
        const gl = webgl?.context,
          paint = webgl === null ? surface.context : null;
        if (gl !== undefined) {
          gl.viewport(0, 0, surface.element.width, surface.element.height);
          gl.disable(gl.SCISSOR_TEST);
          gl.clearColor(0, 0, 0, 0);
          gl.clearDepth(1);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.enable(gl.DEPTH_TEST);
          gl.depthFunc(gl.LEQUAL);
          gl.disable(gl.BLEND);
          gl.enable(gl.SCISSOR_TEST);
        } else {
          paint.setTransform(1, 0, 0, 1, 0, 0);
          paint.clearRect(0, 0, surface.element.width, surface.element.height);
          paint.setTransform(ratio, 0, 0, ratio, 0, 0);
        }
        for (const { section, image, variant } of pictures) {
          if (!image.complete || !opaqueHost(image)) continue;
          // Live bounds follow native scene pinning; only the original illustration is redrawn.
          const b = image.getBoundingClientRect(),
            rect = { x: b.left, y: b.top, width: b.width, height: b.height };
          if (rect.width < 1 || rect.height < 1 || rect.y >= height || rect.y + rect.height <= 0)
            continue;
          const p =
            ctx.render !== 'live'
              ? 1
              : section.dataset.scene === 'steps'
                ? stepProgress(time)
                : ctx.progress(section);
          const faces = model(p, variant);
          const left = Math.ceil(rect.x * ratio),
            right = Math.floor((rect.x + rect.width) * ratio);
          const top = Math.ceil(rect.y * ratio),
            bottom = Math.floor((rect.y + rect.height) * ratio);
          if (gl !== undefined) {
            gl.scissor(
              left,
              surface.element.height - bottom,
              Math.max(0, right - left),
              Math.max(0, bottom - top),
            );
            gl.clearColor(...palette.bg, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            mesh.paint(faces, rect, palette, width, height);
          } else {
            paint.save();
            paint.beginPath();
            paint.rect(left / ratio, top / ratio, (right - left) / ratio, (bottom - top) / ratio);
            paint.clip();
            paint.globalAlpha = 1;
            paint.fillStyle = palette.css.bg;
            paint.fillRect(rect.x, rect.y, rect.width, rect.height);
            const draw = (face) => {
              const vertices = project(face, rect);
              paint.beginPath();
              vertices.forEach(([x, y], i) => {
                if (i === 0) paint.moveTo(x, y);
                else paint.lineTo(x, y);
              });
              paint.closePath();
              fillFace(paint, face, palette);
            };
            for (const face of faces) {
              if (face.detailOwner) continue;
              draw(face);
              // Front-face marks belong to their slab: never paint a lower row behind its owner.
              for (const detail of (face.details ?? []).sort(
                (a, b) =>
                  b.points.reduce((n, v) => n + v[2], 0) - a.points.reduce((n, v) => n + v[2], 0),
              ))
                draw(detail);
            }
            paint.restore();
          }
        }
        const obstacles = ctx.obstacles();
        const cuts = [...obstacles.text, ...obstacles.chrome].map((r) => surface.toCanvas(r));
        for (const { element } of obstacles.pinned) {
          // Our native sticky stage owns the illustration. Protect its live prose and controls,
          // rather than clearing the complete stage or exempting all its content.
          if (pictures.some(({ image }) => element.contains(image)))
            cuts.push(...livePinnedCuts(ctx, surface, element));
          else {
            const b = element.getBoundingClientRect();
            cuts.push({ x: b.left, y: b.top, width: b.width, height: b.height });
          }
        }
        for (const cut of cuts) {
          const l = Math.floor(cut.x * ratio),
            r = Math.ceil((cut.x + cut.width) * ratio),
            t = Math.floor(cut.y * ratio),
            b = Math.ceil((cut.y + cut.height) * ratio);
          if (gl !== undefined) {
            gl.scissor(l, surface.element.height - b, Math.max(0, r - l), Math.max(0, b - t));
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          } else paint.clearRect(l / ratio, t / ratio, (r - l) / ratio, (b - t) / ratio);
        }
        if (gl !== undefined) gl.disable(gl.SCISSOR_TEST);
      },
      rebuild,
      unmount() {
        unsubscribe();
        for (const stop of stopStates) stop();
        for (const { image } of pictures) image.removeEventListener('load', onLoad);
        if (webgl !== null) surface.element.removeEventListener('webglcontextlost', lost);
        mesh?.destroy();
      },
    };
  },
});
