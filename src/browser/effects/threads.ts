/**
 * Встроенный эффект «нити» (`media-effect="threads"` у секции): первая картинка секции распускается на
 * нити, пока уходит вверх за край экрана. Эффект идёт через движок эффектов наравне с эффектами
 * расширений и проверяется тем же `effect-check --built-in threads`.
 *
 * Режимы из одной геометрии нитей (`threadColumn`):
 * - `live` — WebGL на общем холсте страницы: картинка рисуется шейдером там, где она на экране;
 * - `static` — WebGL недоступен или видеокарта слабая: те же нити рисует 2D-холст полосами картинки;
 * - `still` — уменьшенное движение или медленные кадры: холста нет, читатель видит картинку целой.
 *
 * Состояние на картинке — `data-webgl-state`: `live`, `2d`, `static` или `static-slow`; стили прячут
 * картинку, пока её рисует холст, а печать всегда показывает саму картинку.
 */

import { defineEffect, type EffectContext, type EffectController } from '../../effect.js';
import { progressOverride } from '../clock.js';
import { fragmentPrecision } from '../webgl-policy.js';

export const THREADS = 96;
/** Большая сторона текстуры: нитям не нужно больше, а меньшая текстура загружается быстро. */
const TEXTURE_LIMIT = 1024;

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Геометрия нити повторяет `threadColumn`: 2D-режим рисует те же полосы.
const FRAGMENT_SHADER_BODY = `
uniform sampler2D u_image;
uniform float u_progress;
uniform float u_threads;
uniform vec3 u_edge;
varying vec2 v_uv;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float column = floor(v_uv.x * u_threads);
  float chance = hash(column);
  float pull = clamp(u_progress * (0.55 + chance * 0.9), 0.0, 1.0);
  float drift = pull * pull * (0.2 + chance * 0.55);
  float sway = sin(v_uv.y * 11.0 + chance * 6.2831) * 0.006 * pull;
  vec2 uv = vec2(v_uv.x + sway, v_uv.y + drift);
  float local = fract(v_uv.x * u_threads);
  float width = 1.0 - 0.72 * pull;
  float thread = 1.0 - smoothstep(width * 0.5 - 0.08, width * 0.5, abs(local - 0.5));
  float fade = 1.0 - smoothstep(0.6, 1.0, pull);
  float inside = step(uv.y, 1.0);
  vec4 color = texture2D(u_image, uv);
  // Рваный край нити окрашен акцентом темы: цвет приходит токеном, шейдер своих красок не знает.
  float edge = clamp(thread * (1.0 - thread) * 4.0, 0.0, 1.0) * pull;
  color.rgb = mix(color.rgb, u_edge * color.a, edge * 0.6);
  gl_FragColor = color * thread * fade * inside;
}`;

/** Геометрия одной нити при прогрессе 0–1: доля ширины, сдвиг вниз долей высоты, прозрачность. */
export interface ThreadColumn {
  readonly pull: number;
  readonly drift: number;
  readonly width: number;
  readonly fade: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function threadColumn(column: number, progress: number): ThreadColumn {
  const hashed = Math.sin(column * 127.1) * 43758.5453;
  const chance = hashed - Math.floor(hashed);
  const pull = Math.min(1, Math.max(0, progress * (0.55 + chance * 0.9)));
  return {
    pull,
    drift: pull * pull * (0.2 + chance * 0.55),
    width: 1 - 0.72 * pull,
    fade: 1 - smoothstep(0.6, 1, pull),
  };
}

/** Прогресс нитей картинки: по положению на экране или выставленный записью `data-clock-progress`. */
export function threadsProgress(image: HTMLImageElement): number {
  const override = progressOverride(image);
  if (override !== undefined) return override;
  const box = image.getBoundingClientRect();
  return Math.min(1, Math.max(0, -box.top / Math.max(1, box.height * 0.85)));
}

function loaded(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('image failed to load')), {
      once: true,
    });
  });
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function mountLive(context: EffectContext, images: readonly HTMLImageElement[]): EffectController {
  const first = images[0];
  if (first === undefined) return { at() {} };
  const surface = context.canvas({ host: first, kind: 'webgl' });
  if (surface === null) throw new Error('WebGL context is unavailable.');
  const gl = surface.context;
  const canvas = surface.element;
  const precision = fragmentPrecision(
    gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ?? 0,
  );
  canvas.dataset.precision = precision;
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(
    gl,
    gl.FRAGMENT_SHADER,
    `precision ${precision} float;\n${FRAGMENT_SHADER_BODY}`,
  );
  const program = gl.createProgram();
  if (vertex === null || fragment === null || program === null)
    throw new Error('Threads shaders did not compile.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error('Threads program did not link.');
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram is not a React hook.
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const progressLocation = gl.getUniformLocation(program, 'u_progress');
  const edgeLocation = gl.getUniformLocation(program, 'u_edge');
  gl.uniform1f(gl.getUniformLocation(program, 'u_threads'), THREADS);
  const readTheme = (): void => {
    const [r, g, b] = context.tokens.rgba('--color-accent');
    gl.uniform3f(edgeLocation, r, g, b);
    canvas.dataset.edge = [r, g, b].map((channel) => channel.toFixed(3)).join(' ');
  };
  readTheme();
  context.tokens.onChange(readTheme);

  const textures = new Map<HTMLImageElement, WebGLTexture>();
  let alive = true;
  let lost = false;
  let hasVisibleFrame = false;
  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
  });
  const draw = (): void => {
    if (lost) throw new Error('WebGL context was lost.');
    const ratio = surface.ratio;
    const visible: { texture: WebGLTexture; progress: number; box: DOMRect }[] = [];
    for (const image of images) {
      const texture = textures.get(image);
      if (texture === undefined) continue;
      const progress = threadsProgress(image);
      if (image === first) canvas.dataset.progress = progress.toFixed(3);
      const box = image.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= canvas.height / ratio || box.width === 0) continue;
      visible.push({ texture, progress, box });
    }
    // Clearing a viewport-sized WebGL surface on every scroll frame is expensive even when its
    // image is far outside the viewport. Clear once as the last image leaves, then leave it idle.
    if (visible.length === 0 && !hasVisibleFrame) return;
    hasVisibleFrame = visible.length > 0;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    canvas.dataset.pixelRatio = String(ratio);
    for (const { texture, progress, box } of visible) {
      gl.viewport(
        Math.round(box.left * ratio),
        Math.round(canvas.height - box.bottom * ratio),
        Math.max(1, Math.round(box.width * ratio)),
        Math.max(1, Math.round(box.height * ratio)),
      );
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1f(progressLocation, progress);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  };
  const upload = async (image: HTMLImageElement): Promise<void> => {
    // Текстура уменьшается и декодируется вне главного потока: крупная картинка не должна
    // останавливать прокрутку. Первая отрисовка — та же целая картинка, и лишь затем исходная прячется.
    await loaded(image);
    const scale = Math.min(1, TEXTURE_LIMIT / Math.max(image.naturalWidth, image.naturalHeight));
    const bitmap = await createImageBitmap(image, {
      resizeWidth: Math.max(1, Math.round(image.naturalWidth * scale)),
      resizeHeight: Math.max(1, Math.round(image.naturalHeight * scale)),
      resizeQuality: 'medium',
    });
    if (!alive || lost) return;
    const texture = gl.createTexture();
    if (texture === null) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    textures.set(image, texture);
    // Первая отрисовка текстурой — здесь, а не на прокрутке: видеокарта загружает текстуру при первом
    // использовании, и без этого задача длиной в десятки миллисекунд пришлась бы на момент, когда
    // картинка входит в экран. Кадр в одну точку сразу стирается следующим `draw`.
    gl.viewport(0, 0, 1, 1);
    gl.uniform1f(progressLocation, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // The prewarm writes one pixel even when the image is offscreen. Force the next draw to
    // clear it before the image becomes live.
    hasVisibleFrame = true;
    draw();
    gl.finish();
    image.dataset.webglState = 'live';
  };
  for (const image of images) {
    image.dataset.webglState = 'pending';
    // Картинка, которую нельзя загрузить в текстуру, остаётся на месте неподвижной.
    upload(image).catch(() => {
      image.dataset.webglState = 'static';
    });
  }
  return {
    at: draw,
    rebuild: draw,
    unmount() {
      alive = false;
      for (const image of images) delete image.dataset.webglState;
    },
  };
}

function mountStatic(
  context: EffectContext,
  images: readonly HTMLImageElement[],
): EffectController {
  const first = images[0];
  if (first === undefined) return { at() {} };
  const surface = context.canvas({ host: first, kind: '2d' });
  const paint = surface.context;
  const canvas = surface.element;
  let edge = context.tokens.read('--color-accent');
  context.tokens.onChange(() => {
    edge = context.tokens.read('--color-accent');
  });
  const ready = new Set<HTMLImageElement>();
  let alive = true;
  let hasVisibleFrame = false;
  const draw = (): void => {
    const ratio = surface.ratio;
    const visible: { image: HTMLImageElement; progress: number; box: DOMRect }[] = [];
    for (const image of images) {
      if (!ready.has(image)) continue;
      const progress = threadsProgress(image);
      if (image === first) canvas.dataset.progress = progress.toFixed(3);
      const box = image.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= canvas.height / ratio || box.width === 0) continue;
      visible.push({ image, progress, box });
    }
    if (visible.length === 0 && !hasVisibleFrame) return;
    hasVisibleFrame = visible.length > 0;
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const { image, progress, box } of visible) {
      const column = box.width / THREADS;
      const sourceColumn = image.naturalWidth / THREADS;
      for (let index = 0; index < THREADS; index += 1) {
        const thread = threadColumn(index, progress);
        if (thread.fade <= 0) continue;
        const inset = (1 - thread.width) / 2;
        const visible = 1 - thread.drift;
        paint.globalAlpha = thread.fade;
        paint.drawImage(
          image,
          (index + inset) * sourceColumn,
          0,
          sourceColumn * thread.width,
          image.naturalHeight * visible,
          box.left + (index + inset) * column,
          box.top + thread.drift * box.height,
          column * thread.width,
          box.height * visible,
        );
        if (thread.pull > 0) {
          // Край нити — акцентом темы, как в шейдере.
          paint.globalAlpha = thread.fade * thread.pull * 0.6;
          paint.fillStyle = edge;
          paint.fillRect(
            box.left + (index + inset) * column,
            box.top + thread.drift * box.height,
            Math.min(1, column * thread.width),
            box.height * visible,
          );
        }
      }
    }
    paint.globalAlpha = 1;
  };
  for (const image of images) {
    image.dataset.webglState = 'pending';
    loaded(image)
      .then(() => {
        if (!alive) return;
        ready.add(image);
        draw();
        image.dataset.webglState = '2d';
      })
      .catch(() => {
        image.dataset.webglState = 'static';
      });
  }
  return {
    at: draw,
    rebuild: draw,
    unmount() {
      alive = false;
      for (const image of images) delete image.dataset.webglState;
    },
  };
}

export const threadsEffect = defineEffect({
  // Нити идут за прокруткой: кадр нужен только при прокрутке, пересборке и перемотке часов.
  continuous: false,
  mount(context) {
    const images = context.hosts.filter(
      (host): host is HTMLImageElement => host instanceof HTMLImageElement,
    );
    if (context.render === 'live') return mountLive(context, images);
    if (context.render === 'static') return mountStatic(context, images);
    const state = context.reason === 'slow' ? 'static-slow' : 'static';
    for (const image of images) image.dataset.webglState = state;
    // Без движения картинка — сама себе итог: рисовать и пересобирать нечего.
    return { at() {}, rebuild() {} };
  },
});

export const THREADS_SELECTOR = 'img[data-webgl="threads"]';
