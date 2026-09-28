# Write an effect module

An effect decorates existing page content. The page keeps its text, images and controls without the effect,
including in print and before scripts run. Use the [extension guide](extensions.md) to decide whether an
effect is warranted and to declare its manifest and target attributes. This reference covers the public
author API exported by `agentic-report/effect`; it does not expose the effect engine's internal helpers.
Import this subpath in the module named by the manifest's `module` field. The page builder bundles the
module and its local imports only when a declared target has a host. It accepts the effect subpath but not
other `agentic-report` imports inside an effect bundle.

## Public exports

The published effect entry has one function and these types. Import types with `import type` when they are
needed; `defineEffect` is the runtime value.

| Export                 | Contract                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `defineEffect`         | `(definition: EffectDefinition): EffectDefinition`; identity helper used as the default module export. |
| `EffectRender`         | `'live' \| 'still' \| 'static'`.                                                                       |
| `EffectFallbackReason` | `'reduced-motion' \| 'motion-level' \| 'no-webgl' \| 'slow' \| 'error' \| 'forced'`.                   |
| `EffectRect`           | A rectangle in CSS pixels; its coordinate space depends on the API returning it.                       |
| `EffectPinned`         | A fixed or sticky element and its viewport rectangle.                                                  |
| `EffectObstacles`      | Text, chrome, free-space and pinned-element layers.                                                    |
| `EffectLayout`         | Current layout mode and viewport measurements.                                                         |
| `EffectCanvasKind`     | `'2d' \| 'webgl'`.                                                                                     |
| `EffectCanvasOptions`  | The host, canvas kind and optional layer order.                                                        |
| `EffectCanvas`         | A viewport canvas, drawing context and coordinate helpers.                                             |
| `EffectContext`        | The services passed to `mount`.                                                                        |
| `EffectController`     | The drawing callback and optional lifecycle callbacks returned by `mount`.                             |
| `EffectDefinition`     | The mounted effect and its scroll, frame and pause declarations.                                       |

Export `default defineEffect({ mount(ctx) { return { at(t, progress) { /* draw */ } }; } })` from the
module. `mount` runs once per mounting and must return a controller. The engine owns the frame loop,
page clock, canvases and removal; do not start another animation loop or use a wall clock to draw frames.

## Render modes and lifecycle

The page chooses `live` when expressive motion and WebGL are available. Reduced motion or a page motion
level below `expressive` selects `still`; unavailable WebGL selects `static`. The page root exposes its
choice as `data-render`. An individual failing effect may be remounted in a lower mode, so use
`ctx.render` and `ctx.reason` from each new mount. `reason` is `undefined` in normal `live`; otherwise it
identifies the cause with an `EffectFallbackReason` value.

In `live`, `at(t, progress)` receives page-clock seconds and page scroll progress from 0 to 1. In `still`
and `static`, `t` is `Infinity`: compute the final animation state directly. Scroll progress remains a
real 0–1 value in those modes. `still` is the reduced-motion final state; `static` is the non-WebGL
rendering path. Produce the same meaningful visual state and page states in all modes. Keep the source
content useful when all canvases are hidden for print or scripts are unavailable.

The engine mounts after finding target hosts, calls `at` immediately, and later calls it on a page-clock
seek, scroll or scheduled frame. `continuous` defaults to `true`: while a host is visible in `live`, the
engine draws each frame unless motion is paused. Use `continuous: false` when scroll and the engine's
rebuild, theme, resize or clock-seek draws are enough. A `state.watch` or `events.on` callback does not
itself schedule a draw. For state-driven repaint, return a controller with `rebuild()`, cache the immediate
first `state.watch` value for the initial `at`, and call `ctx.rebuild('state-change')` only when a later
value actually changes. The engine then calls that same controller's `rebuild()` and schedules a draw.
Without `controller.rebuild()`, `ctx.rebuild()` remounts the effect; calling it from an immediately
notified watcher would reinstall the watcher and loop. Apply the same in-place rebuild rule to an event
callback that requests a draw. On geometry changes, the engine calls
`controller.rebuild()` if present; otherwise it unmounts and mounts again. The engine rescans hosts after
DOM children are added or removed and remounts when that changes the matching set. Treat target attributes
as fixed in the current DOM: changing only one of those attributes on an existing element does not trigger
a rescan. Release subscriptions, listeners and your own DOM details in
`unmount()`. Engine-owned canvases are removed automatically. A context cannot be used after its mount is
torn down.

An exception in `live` remounts the effect in `static`; an exception in `static` remounts it in `still`;
an exception in `still` marks it failed. `ctx.fallback()` requests the same next step for an asynchronous
rendering failure, such as a lost WebGL context. Repeated slow frames can select `still` with reason
`slow`. `ctx.rebuild(reason)` is for changed geometry, not a failed rendering resource. The engine
coalesces rebuild requests, limits feedback loops and also rebuilds after width, font and entrance
changes or return to the tab. A height-only resize does not rebuild geometry.

## Context members

The paths in the first column are members of `EffectContext`. Nested paths name properties of its public
service objects. `readonly` properties are read rather than replaced.

| Member            | Signature or value                                                                                                       | Use                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | `readonly string`                                                                                                        | Effect name from the manifest.                                                                                                               |
| `hosts`           | `readonly HTMLElement[]`                                                                                                 | Elements with the effect's target attributes, in document order.                                                                             |
| `render`          | `readonly EffectRender`                                                                                                  | This mount's rendering mode.                                                                                                                 |
| `reason`          | `readonly EffectFallbackReason \| undefined`                                                                             | Why this mount is outside normal `live`.                                                                                                     |
| `attribute`       | `(host: Element, attribute: string): string \| undefined`                                                                | Reads `data-effect-<name>-<attribute>` on that host.                                                                                         |
| `tokens`          | `readonly { read, rgba, onChange }`                                                                                      | Theme-token service. Use tokens for the effect's appearance.                                                                                 |
| `tokens.read`     | `(token: \`--${string}\`): string`                                                                                       | Resolved public theme token. Colours are `rgb(r g b / a)` for CSS and 2D canvas. An unknown token throws.                                    |
| `tokens.rgba`     | `(token: \`--${string}\`): readonly [number, number, number, number]`                                                    | Colour channels from 0 to 1 for shaders. An unknown token throws.                                                                            |
| `tokens.onChange` | `(callback: () => void): () => void`                                                                                     | Runs on theme or scheme changes; returns an unsubscribe function. Re-read tokens in the callback.                                            |
| `clock`           | `readonly { now }`                                                                                                       | Page clock, also used for deterministic recording.                                                                                           |
| `clock.now`       | `(): number`                                                                                                             | Current page-clock seconds.                                                                                                                  |
| `random`          | `(seed: number \| string): () => number`                                                                                 | Seeded generator of values from 0 inclusive to 1 exclusive; retain its returned generator as needed.                                         |
| `measure`         | `readonly { lines, rect }`                                                                                               | Settled content geometry in page coordinates.                                                                                                |
| `measure.lines`   | `(element: Element): readonly EffectRect[]`                                                                              | Text-line rectangles; excludes fixed and sticky descendants.                                                                                 |
| `measure.rect`    | `(element: Element): EffectRect`                                                                                         | Element rectangle with entrance translation removed.                                                                                         |
| `obstacles`       | `(): EffectObstacles`                                                                                                    | Decoration avoidance layers; see the geometry table below.                                                                                   |
| `layout`          | `readonly EffectLayout`                                                                                                  | Current page layout and viewport dimensions.                                                                                                 |
| `pick`            | `<Value>(pair: { readonly wide: Value; readonly narrow: Value }): Value`                                                 | Selects `narrow` at 720 CSS pixels or below, otherwise `wide`.                                                                               |
| `progress`        | `(host: Element): number`                                                                                                | Host passage through the viewport, from 0 to 1, or its `data-clock-progress` override.                                                       |
| `canvas`          | `({ host, kind: '2d', layer? }): EffectCanvas<'2d'>`; `({ host, kind: 'webgl', layer? }): EffectCanvas<'webgl'> \| null` | Creates a canvas above content. A WebGL request can return `null`; use a 2D path.                                                            |
| `events`          | `readonly { on }`                                                                                                        | Host reach and leave event service.                                                                                                          |
| `events.on`       | `(type: 'reach' \| 'leave', host: Element, callback: () => void): () => void`                                            | Calls back as a host enters or leaves the middle of the viewport in every mode; returns an unsubscribe function.                             |
| `state`           | `readonly { set, watch }`                                                                                                | Host and page state service.                                                                                                                 |
| `state.set`       | `(name: string, value: string \| number \| boolean \| null, host?: Element): void`                                       | Sets `data-state-<name>` on one host or all effect hosts; `false` and `null` remove it. Pass `document.documentElement` to set a page state. |
| `state.watch`     | `(name: string, callback: (value: string \| undefined) => void): () => void`                                             | Immediately reports the root page state, then reports changes; returns an unsubscribe function.                                              |
| `rebuild`         | `(reason: string): void`                                                                                                 | Requests a coalesced geometry rebuild.                                                                                                       |
| `fallback`        | `(): void`                                                                                                               | Reports asynchronous drawing failure and requests the next safe render mode.                                                                 |

State names must match `^[a-z][a-z0-9-]{0,40}$`. A `true` state is an empty attribute; `0` and the
empty string remain set values. The engine cleans up registered token, event and state subscriptions on
unmount, but use their returned unsubscribe functions when your controller no longer needs them. A theme
change schedules another draw; re-read any cached token values in `tokens.onChange`.

## Canvas members

These are members of `EffectCanvas<Kind>`. For `Kind = '2d'`, `context` is a
`CanvasRenderingContext2D`; for `Kind = 'webgl'`, it is a `WebGLRenderingContext`.

| Member     | Signature or value                                                                 | Use                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `element`  | `readonly HTMLCanvasElement`                                                       | The engine-owned viewport canvas.                                                                                              |
| `kind`     | `readonly Kind`                                                                    | The requested `'2d'` or `'webgl'` kind.                                                                                        |
| `context`  | `readonly Kind extends 'webgl' ? WebGLRenderingContext : CanvasRenderingContext2D` | Drawing context of this canvas.                                                                                                |
| `ratio`    | `readonly number`                                                                  | Backing pixels per CSS pixel; can fall on slow frames. Read it on each draw.                                                   |
| `anchor`   | `(): EffectRect`                                                                   | Host rectangle in current viewport CSS coordinates.                                                                            |
| `toCanvas` | `(rect: EffectRect): EffectRect`                                                   | Converts a page-coordinate rectangle to viewport canvas CSS coordinates.                                                       |
| `details`  | `readonly HTMLElement`                                                             | Shared fixed DOM layer above the canvases; add only decorative, non-interactive details and remove your elements in `unmount`. |

The canvas fills the viewport, not its host; a drawing can extend beyond the host. Its bitmap is sized to
the viewport at the current `ratio` before each `at`. Scale 2D drawing by `ratio`, or multiply WebGL
viewport/scissor coordinates by it. `anchor()` and `toCanvas()` return CSS pixels, not backing pixels.
Canvas `layer` orders canvases from lower to higher, defaulting to 0; `details` sits above all canvases.
The layer does not receive pointer events and is hidden in print.

## Definition and controller members

| Member                        | Signature or value                           | Use                                                                                                            |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `EffectDefinition.mount`      | `(context: EffectContext): EffectController` | Allocate geometry and resources for this mount, then return callbacks.                                         |
| `EffectDefinition.ownsScroll` | `readonly boolean?`                          | Declares scroll ownership; a page permits at most one owner. The manifest can also request ownership.          |
| `EffectDefinition.continuous` | `readonly boolean?`                          | Defaults to `true`; set `false` when scroll and engine draws suffice, or use safe in-place rebuilds as above.  |
| `EffectDefinition.endless`    | `readonly boolean?`                          | Set `true` for motion running beyond five seconds without reader action so the page supplies its pause button. |
| `EffectController.at`         | `(t: number, progress: number): void`        | Draw a deterministic state for page-clock seconds and page scroll progress.                                    |
| `EffectController.rebuild`    | `(): void` (optional)                        | Recompute geometry in the current mount; without it the engine remounts.                                       |
| `EffectController.unmount`    | `(): void` (optional)                        | Remove own listeners, subscriptions and DOM details.                                                           |

The engine owns animation and its pause control. Do not create another `requestAnimationFrame` loop or a
separate pause button. A rebuild should recompute cached page-coordinate geometry; `at` converts it to
canvas coordinates at the current scroll. Set `endless` only when the effect has ongoing motion that
needs the reader's pause control.

## Geometry and options members

| Member                      | Signature or value        | Use                                                                                                            |
| --------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `EffectRect.x`              | `readonly number`         | Left coordinate in CSS pixels.                                                                                 |
| `EffectRect.y`              | `readonly number`         | Top coordinate in CSS pixels.                                                                                  |
| `EffectRect.width`          | `readonly number`         | Width in CSS pixels.                                                                                           |
| `EffectRect.height`         | `readonly number`         | Height in CSS pixels.                                                                                          |
| `EffectPinned.element`      | `readonly HTMLElement`    | Fixed or sticky element; measure its current viewport position before drawing.                                 |
| `EffectPinned.rect`         | `readonly EffectRect`     | Viewport rectangle at the time `obstacles()` was called.                                                       |
| `EffectObstacles.text`      | `readonly EffectRect[]`   | Text-line rectangles in page coordinates; do not draw decoration across them.                                  |
| `EffectObstacles.chrome`    | `readonly EffectRect[]`   | Headers, navigation and controls outside pinned elements, in page coordinates.                                 |
| `EffectObstacles.free`      | `readonly EffectRect[]`   | Free page-coordinate areas at least 24 CSS pixels across, with 8-pixel clearance from text; areas may overlap. |
| `EffectObstacles.pinned`    | `readonly EffectPinned[]` | Outermost fixed or sticky elements in viewport coordinates.                                                    |
| `EffectLayout.mode`         | `readonly string`         | Page layout: `document`, `dashboard`, `landing`, `mixed`, `slides` or `screens`.                               |
| `EffectLayout.narrow`       | `readonly boolean`        | Whether the viewport is at most 720 CSS pixels wide.                                                           |
| `EffectLayout.svh`          | `readonly number`         | Small-viewport height (`100svh`) in CSS pixels, measured once per rebuild.                                     |
| `EffectLayout.width`        | `readonly number`         | Viewport width in CSS pixels.                                                                                  |
| `EffectCanvasOptions.host`  | `readonly HTMLElement`    | Host whose geometry anchors this canvas.                                                                       |
| `EffectCanvasOptions.kind`  | `readonly Kind`           | `'2d'` or `'webgl'`.                                                                                           |
| `EffectCanvasOptions.layer` | `readonly number?`        | Draw order among page canvases; higher layers paint above lower ones.                                          |

`measure`, `obstacles().text`, `obstacles().chrome` and `obstacles().free` use page coordinates. The
canvas, `anchor()` and `obstacles().pinned` use viewport coordinates. Use `canvas.toCanvas(pageRect)`
before drawing a measured page rectangle. For pinned elements, read
`pinned.element.getBoundingClientRect()` when you draw because a sticky or fixed position can change
after the obstacle snapshot. Text inside pinned elements is omitted from the page-coordinate layers.
The geometry helpers subtract entrance translation so a decoration can use the settled layout. Read
`obstacles()` layers once per rebuild where possible; the free-space layer scans page text and can cost
more than a simple host measurement.

## A complete 2D effect

This TypeScript module uses the published subpath and can be named `module: effect.ts` in an effect
manifest whose `name` is `image-rule` and whose target is a `section` attribute named `image-rule`. A
marked section needs an image. The rule stays inside that image, so it cannot cover section prose. The
image and its alternative text remain the static and print equivalent; the line is decoration.

```ts
import { defineEffect, type EffectRect } from 'agentic-report/effect';

interface Mark {
  readonly host: HTMLElement;
  readonly rect: EffectRect;
}

export default defineEffect({
  continuous: false,
  mount(ctx) {
    const firstHost = ctx.hosts[0];
    if (firstHost === undefined) return { at() {} };
    const canvas = ctx.canvas({ host: firstHost, kind: '2d' });
    let colour = ctx.tokens.read('--color-accent');
    const stopTheme = ctx.tokens.onChange(() => {
      colour = ctx.tokens.read('--color-accent');
    });
    let marks: Mark[] = [];
    const images = ctx.hosts.flatMap((host) => {
      const image = host.querySelector('img');
      return image === null ? [] : [{ host, image }];
    });
    const rebuild = () => {
      marks = images.map(({ host, image }) => ({ host, rect: ctx.measure.rect(image) }));
    };
    const imageLoaded = () => ctx.rebuild('image-load');
    for (const { image } of images) image.addEventListener('load', imageLoaded);
    rebuild();

    return {
      at() {
        const paint = canvas.context;
        paint.setTransform(1, 0, 0, 1, 0, 0);
        paint.clearRect(0, 0, canvas.element.width, canvas.element.height);
        paint.setTransform(canvas.ratio, 0, 0, canvas.ratio, 0, 0);
        paint.fillStyle = colour;
        for (const { host, rect } of marks) {
          const box = canvas.toCanvas(rect);
          const progress = ctx.render === 'live' ? ctx.progress(host) : 1;
          paint.fillRect(box.x + 4, box.y + 4, Math.max(0, box.width - 8) * progress, 2);
        }
      },
      rebuild,
      unmount() {
        stopTheme();
        for (const { image } of images) image.removeEventListener('load', imageLoaded);
      },
    };
  },
});
```

The example needs no WebGL. For a WebGL variant, request `ctx.canvas({ host, kind: 'webgl' })` only in
`live`, handle its `null` result, and draw equivalent geometry with a 2D canvas in `static` and `still`.
If WebGL is essential to the live version and its context is lost later, call `ctx.fallback()` from that
failure listener; the engine remounts in the next safe mode. Keep effect colours in the theme vocabulary
(`agentic-report schema --scope theme`), then run `agentic-report effect-check <extension.yaml> --out
<directory>` on two unlike example pages before handing the extension over.
