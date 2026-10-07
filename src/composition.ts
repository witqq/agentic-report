/** Declarative scene state, independent of the DOM and compiler. */
export const COMPOSITIONS = [
  'diagram-code',
  'pipeline',
  'before-after',
  'overview-detail',
  'ownership',
] as const;
export const COMPOSITION_ACTIONS = [
  'reveal',
  'focus',
  'connect',
  'transfer',
  'copy',
  'replace',
  'compare',
  'camera',
] as const;
export type CompositionAction = (typeof COMPOSITION_ACTIONS)[number];
export interface CompositionCue {
  readonly at: string;
  readonly action: CompositionAction;
  readonly target: string;
  readonly to?: string;
  readonly value?: string;
  readonly lines?: string;
  readonly duration: number;
}
export type CompositionContent =
  { readonly source: string } | { readonly text: string } | { readonly empty: true };
export interface CompositionObjectState {
  content: CompositionContent;
  visible: boolean;
  focus: boolean;
  lines?: string;
  entrance: number;
}
export interface CompositionConnection {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly progress: number;
}
export interface CompositionTravel {
  readonly from: string;
  readonly to: string;
  readonly content: CompositionContent;
  readonly progress: number;
}
export interface CompositionFrame {
  readonly objects: Map<string, CompositionObjectState>;
  readonly connections: CompositionConnection[];
  readonly travels: CompositionTravel[];
  camera?: { readonly target: string; readonly progress: number };
}
export const COMPOSITION_ANCHOR =
  /^(?:\d+(?:\.\d+)?s?|b[1-9]\d*(?:\.end)?(?:[+-]\d+(?:\.\d+)?)?)$/u;
export function compositionTime(anchor: string, starts: readonly number[] = [], end = 0): number {
  const match = /^b(\d+)(\.end)?([+-]\d+(?:\.\d+)?)?$/u.exec(anchor);
  if (match === null) return Number(anchor.replace(/s$/u, ''));
  const index = Number(match[1]) - 1;
  const base =
    starts.length === 0
      ? (index + (match[2] === undefined ? 0 : 1)) * 3
      : match[2] === undefined
        ? starts[index]
        : (starts[index + 1] ?? end);
  if (base === undefined) throw new Error(`Unknown composition speech anchor: ${anchor}`);
  return Math.max(0, base + Number(match[3] ?? 0));
}
/** Reconstruct from authored state: backward seeking cannot retain a later edit. */
export function compositionFrame(
  ids: readonly string[],
  cues: readonly CompositionCue[],
  time: number,
  resolve: (at: string) => number = compositionTime,
): CompositionFrame {
  const hidden = new Set(cues.filter((c) => c.action === 'reveal').map((c) => c.target));
  const frame: CompositionFrame = {
    objects: new Map(
      ids.map((id) => [
        id,
        {
          content: { source: id },
          visible: !hidden.has(id),
          focus: false,
          entrance: 1,
        },
      ]),
    ),
    connections: [],
    travels: [],
  };
  const sorted = cues
    .map((cue, order) => ({ cue, order, start: resolve(cue.at) }))
    .sort((a, b) => a.start - b.start || a.order - b.order);
  for (const { cue, start } of sorted) {
    if (time < start) continue;
    const target = frame.objects.get(cue.target);
    if (target === undefined) throw new Error(`Unknown composition object: ${cue.target}`);
    const raw = Math.min(1, Math.max(0, (time - start) / cue.duration));
    const progress = raw * raw * (3 - 2 * raw);
    const destination = cue.to === undefined ? undefined : frame.objects.get(cue.to);
    switch (cue.action) {
      case 'reveal':
        target.visible = true;
        target.entrance = progress;
        break;
      case 'focus':
      case 'compare':
        for (const object of frame.objects.values()) {
          object.focus = false;
          delete object.lines;
        }
        target.focus = true;
        if (cue.lines !== undefined) target.lines = cue.lines;
        if (destination !== undefined) destination.focus = true;
        break;
      case 'connect':
        if (cue.to !== undefined)
          frame.connections.push({
            from: cue.target,
            to: cue.to,
            label: cue.value ?? '',
            progress,
          });
        break;
      case 'copy':
      case 'transfer':
        if (destination === undefined || cue.to === undefined)
          throw new Error('Composition transfer needs a destination.');
        if (progress < 1)
          frame.travels.push({ from: cue.target, to: cue.to, content: target.content, progress });
        else {
          destination.content = target.content;
          destination.visible = true;
          if (cue.action === 'transfer') target.content = { empty: true };
        }
        break;
      case 'replace':
        target.content = { text: cue.value ?? '' };
        break;
      case 'camera':
        frame.camera = { target: cue.target, progress };
        break;
    }
  }
  return frame;
}

/** Rewrite only local references owned by a cloned object; external links stay intact. */
export function compositionReference(value: string, ids: ReadonlyMap<string, string>): string {
  const direct = value.startsWith('#') ? ids.get(value.slice(1)) : undefined;
  if (direct !== undefined) return `#${direct}`;
  return value.replace(
    /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gu,
    (original: string, quote: string, id: string) =>
      ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : original,
  );
}
