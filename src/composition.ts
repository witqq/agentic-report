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
  'trace',
  'annotate',
] as const;
export const COMPOSITION_EMPHASIS = [
  'outline',
  'halo',
  'brackets',
  'underline',
  'dim',
  'none',
] as const;
export const COMPOSITION_TRACE_EFFECTS = ['beam', 'pulse', 'packet'] as const;
export const COMPOSITION_RELATIONS = [
  'relation',
  'call',
  'data',
  'event',
  'dependency',
  'ownership',
] as const;
export type CompositionAction = (typeof COMPOSITION_ACTIONS)[number];
export interface CompositionCue {
  readonly at: string;
  readonly action: CompositionAction;
  readonly target: string;
  readonly to?: string;
  /** A named dynamic region inside a stable object. */
  readonly slot?: string;
  readonly toSlot?: string;
  readonly value?: string;
  readonly lines?: string;
  readonly emphasis?: (typeof COMPOSITION_EMPHASIS)[number];
  readonly effect?: (typeof COMPOSITION_TRACE_EFFECTS)[number];
  readonly until?: string;
  readonly relation?: (typeof COMPOSITION_RELATIONS)[number];
  readonly duration: number;
}
export type CompositionContent =
  { readonly source: string } | { readonly text: string } | { readonly empty: true };
export interface CompositionObjectState {
  content: CompositionContent;
  visible: boolean;
  focus: boolean;
  focusAmount: number;
  emphasis?: (typeof COMPOSITION_EMPHASIS)[number];
  lines?: string;
  entrance: number;
}
export interface CompositionConnection {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly progress: number;
  readonly relation?: (typeof COMPOSITION_RELATIONS)[number];
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
  readonly traces: Array<{
    readonly from: string;
    readonly to: string;
    readonly progress: number;
    readonly effect: (typeof COMPOSITION_TRACE_EFFECTS)[number];
  }>;
  readonly annotations: Map<
    string,
    {
      readonly text: string;
      readonly lines?: string;
      readonly to?: string;
      readonly progress: number;
    }
  >;
  dim: boolean;
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
export function compositionLineLabel(lines: string, lineStart = 1): string {
  return `L${lines
    .split(',')
    .map((part) =>
      part
        .trim()
        .split('-')
        .map((n) => Number(n) + lineStart - 1)
        .join('–'),
    )
    .join(', ')}`;
}
export function compositionAddress(object: string, slot?: string): string {
  return slot === undefined ? object : `${object}:${slot}`;
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
          focusAmount: 0,
          entrance: 1,
        },
      ]),
    ),
    connections: [],
    travels: [],
    traces: [],
    annotations: new Map(),
    dim: false,
  };
  const sorted = cues
    .map((cue, order) => {
      const start = resolve(cue.at);
      if (
        cue.until !== undefined &&
        (resolve !== compositionTime || (!cue.at.startsWith('b') && !cue.until.startsWith('b'))) &&
        resolve(cue.until) <= start
      )
        throw new Error('An annotation until anchor must follow its start.');
      return { cue, order, start };
    })
    .sort((a, b) => a.start - b.start || a.order - b.order);
  for (const { cue, start } of sorted) {
    if (time < start) continue;
    const targetId = compositionAddress(cue.target, cue.slot);
    const destinationId = cue.to === undefined ? undefined : compositionAddress(cue.to, cue.toSlot);
    const target = frame.objects.get(targetId);
    if (target === undefined) throw new Error(`Unknown composition object: ${cue.target}`);
    const raw = Math.min(1, Math.max(0, (time - start) / cue.duration));
    const progress = raw * raw * (3 - 2 * raw);
    const destination = destinationId === undefined ? undefined : frame.objects.get(destinationId);
    switch (cue.action) {
      case 'reveal':
        target.visible = true;
        target.entrance = progress;
        break;
      case 'focus':
      case 'compare': {
        const previousTarget = target.focusAmount,
          previousDestination = destination?.focusAmount ?? 0;
        for (const object of frame.objects.values()) {
          object.focus = false;
          object.focusAmount *= 1 - progress;
          delete object.lines;
        }
        frame.dim = cue.emphasis === 'dim';
        if (cue.emphasis !== 'none') {
          target.focus = true;
          target.focusAmount = previousTarget + (1 - previousTarget) * progress;
          target.emphasis = cue.emphasis ?? 'outline';
          if (cue.lines !== undefined) target.lines = cue.lines;
          if (destination !== undefined) {
            destination.focus = true;
            destination.focusAmount = previousDestination + (1 - previousDestination) * progress;
            destination.emphasis = cue.emphasis ?? 'outline';
          }
        }
        break;
      }
      case 'connect':
        if (cue.to !== undefined)
          frame.connections.push({
            from: cue.target,
            to: cue.to,
            label: cue.value ?? '',
            progress,
            ...(cue.relation === undefined ? {} : { relation: cue.relation }),
          });
        break;
      case 'copy':
      case 'transfer':
        if (destination === undefined || destinationId === undefined)
          throw new Error('Composition transfer needs a destination.');
        if (progress < 1)
          frame.travels.push({
            from: targetId,
            to: destinationId,
            content: target.content,
            progress,
          });
        else {
          destination.content = target.content;
          destination.visible = true;
          if (cue.action === 'transfer') target.content = { empty: true };
        }
        break;
      case 'replace':
        target.content = { text: cue.value ?? '' };
        break;
      case 'annotate':
        if (cue.until === undefined || time < resolve(cue.until))
          frame.annotations.set(cue.target, {
            text: cue.value ?? '',
            progress,
            ...(cue.lines === undefined ? {} : { lines: cue.lines }),
            ...(cue.to === undefined ? {} : { to: cue.to }),
          });
        else frame.annotations.delete(cue.target);
        break;
      case 'trace':
        if (cue.to !== undefined && time < start + cue.duration)
          frame.traces.push({
            from: cue.target,
            to: cue.to,
            progress,
            effect: cue.effect ?? 'beam',
          });
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
