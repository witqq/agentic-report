# execution-core

An original MIT effect illustrating compilation as a solid opening core. Source slabs enter, the
enclosure separates, and a structured page unfolds and emerges. The original source file remains
visible while copies of its values enter the core. All three roles are present in the opening pose.
The camera is fixed; values, the enclosure and output move.
The model represents neither real hardware nor a recorded execution time.

Declare `extension.yaml`, then use `execution-core="report"` or `execution-core="decision"` on a native
section. Its first image must be the original supplied `assets/compile-core.svg` illustration. The effect
redraws only that image rectangle; text, code, controls, captions and screenshots remain native.
Give the original SVG explicit intrinsic width and height as well as its viewBox: a ratio-only SVG can
collapse its centred grid wrapper in a native scrub stage. The supplied illustration is900×560.
Use `assets/compile-core.svg` as the light/print source and
`{dark="assets/compile-core-dark.svg"}` for its geometry-identical dark variant.
Use normal sections for bounded scroll progress or native `scene="steps"` for a short explanation.
Beat states `compile-input`, `compile-process`, `compile-output` select input, processing and completed
poses. Each state change blends from the current pose to the selected pose over650ms on the page clock;
the effect engine owns frame scheduling. Reduced motion and fallback draw the completed pose immediately.
Normal-section progress is read through the public effect context. No effect-owned timers or frame loop
are used. All beat text stays in normal native reading order, with the full stage and its caption.

The viewport canvas uses opaque token materials, a static isometric projection, solid box meshes,
depth testing and shared face lighting. The 2D path projects the same geometry, normals and colours.
Its materials layer the original CSS theme colours over the page background, then apply the same
normal-based shading as WebGL. Alpha-bearing text and accent colours are composited over that base.
Source rows and output marks belong to their slab's front surface: the 2D painter draws the face, then
its attached marks, rather than sorting a whole page face past its lower rows by average depth.
Live text and controls in the native sticky stage remain protected; external pinned chrome is cut
at its current viewport position. Both backends round obstacle cuts outwards to physical pixels.
Reduced motion draws the complete model directly; print retains the original SVG with its caption.
No dependencies, textures, network reads, particles, input interception or camera keyframes are used.

The two examples differ in layout, theme, scheme, subject and scene behavior. Browser effect checks and
actual-page visual acceptance are required before this private extension is published or handed over.
