import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { enumAttribute, integerAttribute, titleAttribute } from './definitions.js';
import {
  type BlockEnhancementContext,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { actionButton, prependDirectiveTitle, stringProperty } from './hast.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';

/**
 * The demo block has two lives. Without `play` it is the package-owned counter: a titled card with a
 * button that adds `step` to `start`. With `play="time"` or `play="scroll"` it is a playable scene: the
 * product reconstructed from ordinary directives — code, a diagram, cards, a picture — placed before
 * its beats, and the beats played in order by the page clock or by the scroll. The scene has a play and
 * a pause button, stops on its final frame, and pins itself while the reader scrolls through its beats.
 * Without motion, without the runtime and in print the final frame is drawn directly: every beat is
 * there, in order, beside the stage.
 */

/** Beats a scene holds: two make a change, eight are the most a reader follows in one scene. */
export const DEMO_SCENE_BEATS = { minimum: 2, maximum: 8 } as const;
/** Seconds each beat of a timed scene stays current, at the calm theme pace. */
export const DEMO_BEAT_SECONDS = { minimum: 1, maximum: 10, default: 3 } as const;

function demoDefinition(): DirectiveDefinition {
  const attributes = [
    titleAttribute,
    integerAttribute('start', 'Initial counter value (counter demo only).', 0),
    integerAttribute('step', 'Amount added per activation (counter demo only).', 1),
    enumAttribute(
      'play',
      'none: a counter card. time: a playable scene whose beats advance by the page clock, with a play and a pause button, ending on its final frame. scroll: the scene is pinned while the reader scrolls through its beats.',
      ['none', 'time', 'scroll'],
      'none',
    ),
    {
      name: 'seconds',
      description: `Seconds each beat of a play="time" scene stays current (${DEMO_BEAT_SECONDS.minimum}–${DEMO_BEAT_SECONDS.maximum}); the theme pace scales it.`,
      required: false,
      default: DEMO_BEAT_SECONDS.default,
      constraint: {
        kind: 'integer',
        minimum: DEMO_BEAT_SECONDS.minimum,
        maximum: DEMO_BEAT_SECONDS.maximum,
        lexicalPattern: '^\\d{1,2}$',
      },
      renderProperty: 'dataSeconds',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const;
  return {
    name: 'demo',
    description:
      'Package-owned demo: a counter card, or with play a scene that reconstructs the product from ordinary directives (code, a diagram, cards, a picture) and plays its beats by time or by scroll; author code is never executed.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: {},
    behavior: {
      renderer: 'semantic-container',
      resource: 'none',
      runtime: 'package-owned-counter',
    },
    sanitizer: {
      tagName: 'section',
      className: 'semantic-demo',
      properties: [
        'dataSemantic',
        ...attributes.map((attribute) => attribute.renderProperty),
        'dataDemoCounter',
      ],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

interface DemoSceneSubject {
  readonly demo: DirectiveNode;
  readonly play: string;
  readonly beats: readonly DirectiveNode[];
  readonly stage: boolean;
  readonly counterAttributes: readonly string[];
  readonly secondsAuthored: boolean;
  readonly nodes: ReadonlySet<string>;
  readonly focus: (beat: DirectiveNode) => readonly string[];
  readonly fail: (node: DirectiveNode, message: string, remediation: string) => AgenticReportError;
}

const demoSceneRules = declareAuthoredRules<DemoSceneSubject>({
  subject: 'demo/scene',
  rules: [
    {
      id: 'beats-in-playing-demo',
      check: ({ demo, play, beats, fail }) =>
        play !== 'none' || beats.length === 0
          ? undefined
          : fail(
              demo,
              'beat directives inside a demo belong to a playable scene, and this demo has no play.',
              'Add play="time" or play="scroll" to the demo, or turn the beats into ordinary Markdown.',
            ),
    },
    {
      id: 'scene-beat-count',
      check: ({ demo, play, beats, fail }) =>
        play === 'none' ||
        (beats.length >= DEMO_SCENE_BEATS.minimum && beats.length <= DEMO_SCENE_BEATS.maximum)
          ? undefined
          : fail(
              demo,
              `A playable demo holds from ${DEMO_SCENE_BEATS.minimum} to ${DEMO_SCENE_BEATS.maximum} beats; this one has ${beats.length}.`,
              'Write each moment of the run as a :::beat container inside the demo, or split a long run into two scenes.',
            ),
    },
    {
      id: 'scene-stage',
      check: ({ demo, play, stage, fail }) =>
        play === 'none' || stage
          ? undefined
          : fail(
              demo,
              'A playable demo reconstructs the product on a stage, and this one has nothing before its beats.',
              'Put the code, diagram, cards or picture of the product before the first beat.',
            ),
    },
    {
      id: 'counter-attributes',
      check: ({ demo, play, counterAttributes, fail }) =>
        play === 'none' || counterAttributes.length === 0
          ? undefined
          : fail(
              demo,
              `A playable demo has no counter, so ${counterAttributes.join(' and ')} mean nothing here.`,
              'Remove start and step, or remove play to keep the counter.',
            ),
    },
    {
      id: 'seconds-with-time',
      check: ({ demo, play, secondsAuthored, fail }) =>
        !secondsAuthored || play === 'time'
          ? undefined
          : fail(
              demo,
              'seconds sets how long each beat of a timed scene lasts, and this demo is not play="time".',
              'Use play="time" with seconds, or remove seconds; a scroll scene follows the reader.',
            ),
    },
    {
      id: 'scene-focus-nodes',
      check: ({ beats, nodes, focus, fail }) =>
        beats.flatMap((beat) => {
          const missing = focus(beat).filter((id) => !nodes.has(id));
          return missing.length === 0
            ? []
            : [
                fail(
                  beat,
                  `beat focus names nodes or connections the demo's diagram does not have: ${missing.join(', ')}.`,
                  'Name node or connection ids of the diagram on the demo stage, or remove focus.',
                ),
              ];
        }),
    },
  ],
});

function validateDemo(demo: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const values = context.attributes(demo);
  const beats: DirectiveNode[] = [];
  let stage = false;
  for (const child of demo.children ?? []) {
    if (isDirectiveNode(child) && child.name === 'beat') beats.push(child);
    else stage = true;
  }
  const nodes = new Set<string>();
  visit(demo as unknown as MdastRoot, (node) => {
    // Как у сцены по шагам, фокус такта называет узлы и связи с `id` одним списком.
    if (
      isDirectiveNode(node) &&
      (node.name === 'node' || node.name === 'edge') &&
      typeof node.attributes?.id === 'string'
    )
      nodes.add(node.attributes.id);
  });
  const authored = demo.attributes ?? {};
  const found: AgenticReportError[] = [];
  runAuthoredRules(
    demoSceneRules,
    {
      demo,
      play: String(values?.play ?? 'none'),
      beats,
      stage,
      counterAttributes: ['start', 'step'].filter((name) => name in authored),
      secondsAuthored: 'seconds' in authored,
      nodes,
      focus: (beat) =>
        String(context.attributes(beat)?.focus ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      fail: (node, message, remediation) =>
        context.violation(node, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation),
    },
    found,
  );
  context.report(found);
  return 'accepted';
}

interface DemoMessages {
  readonly play: string;
  readonly pause: string;
  readonly replay: string;
  readonly controls: string;
}

const DEMO_MESSAGES: Readonly<Record<'en' | 'ru', DemoMessages>> = {
  en: { play: 'Play', pause: 'Pause', replay: 'Play again', controls: 'Scene playback' },
  ru: {
    play: 'Запустить',
    pause: 'Пауза',
    replay: 'Ещё раз',
    controls: 'Воспроизведение сцены',
  },
};

function isPlaying(node: Element): boolean {
  const play = stringProperty(node, 'dataPlay');
  return play === 'time' || play === 'scroll';
}

function enhanceDemo(node: Element, context: BlockEnhancementContext<DemoMessages>): void {
  prependDirectiveTitle(node);
  if (isPlaying(node)) {
    delete node.properties.dataDemoCounter;
    delete node.properties.dataStart;
    delete node.properties.dataStep;
    if (node.properties.dataPlay !== 'time') delete node.properties.dataSeconds;
    // The labels travel on the element: the scene is arranged in the document pass, and the runtime
    // switches the button between them.
    node.properties.dataLabelPlay = context.messages.play;
    node.properties.dataLabelPause = context.messages.pause;
    node.properties.dataLabelReplay = context.messages.replay;
    node.properties.dataLabelControls = context.messages.controls;
    return;
  }
  delete node.properties.dataPlay;
  delete node.properties.dataSeconds;
  if (!('dataDemoCounter' in node.properties)) return;
  const start = String(node.properties.dataStart ?? '0');
  node.children.push({
    type: 'element',
    tagName: 'div',
    properties: { className: ['semantic-demo-controls'] },
    children: [
      actionButton(context.strings.increment, { dataDemoIncrement: '' }, 'plus'),
      { type: 'text', value: ' ' },
      {
        type: 'element',
        tagName: 'output',
        properties: { dataDemoOutput: '', ariaLive: 'polite' },
        children: [{ type: 'text', value: start }],
      },
    ],
  });
}

/**
 * The scene is arranged after every element was enhanced, so its diagram is already drawn: the stage
 * holds what comes before the beats, the beats stand beside it in order, and a hidden control bar waits
 * for the runtime. Reading order stays the authored one — title, stage, beats.
 */
function finalizeDemoScenes(tree: HastRoot): void {
  visit(tree, 'element', (demo: Element) => {
    if (demo.properties.dataSemantic !== 'demo' || !isPlaying(demo)) return;
    const labels = {
      play: String(demo.properties.dataLabelPlay ?? ''),
      pause: String(demo.properties.dataLabelPause ?? ''),
      replay: String(demo.properties.dataLabelReplay ?? ''),
      controls: String(demo.properties.dataLabelControls ?? ''),
    };
    delete demo.properties.dataLabelControls;
    const title = demo.children.find(
      (child): child is Element =>
        child.type === 'element' &&
        child.tagName === 'h3' &&
        Array.isArray(child.properties.className) &&
        child.properties.className.includes('semantic-title'),
    );
    const beats: Element[] = [];
    const stage: ElementContent[] = [];
    for (const child of demo.children) {
      if (child === title) continue;
      if (child.type === 'element' && child.properties.dataSemantic === 'beat') beats.push(child);
      else stage.push(child);
    }
    for (const [index, beat] of beats.entries()) beat.properties.dataDemoBeat = String(index);
    const controls: Element = {
      type: 'element',
      tagName: 'div',
      properties: {
        className: ['demo-controls'],
        role: 'group',
        ariaLabel: labels.controls,
        hidden: '',
        dataDemoControls: '',
      },
      children: [
        {
          type: 'element',
          tagName: 'button',
          properties: { type: 'button', className: ['demo-toggle'], dataDemoToggle: '' },
          children: [{ type: 'text', value: labels.play }],
        },
        {
          type: 'element',
          tagName: 'span',
          properties: { className: ['demo-position', 'ui-meta'], dataDemoPosition: '' },
          children: [{ type: 'text', value: `${beats.length} / ${beats.length}` }],
        },
      ],
    };
    demo.properties.dataDemoScene = '';
    demo.properties.style = `--demo-beats: ${beats.length}`;
    demo.children = [
      ...(title === undefined ? [] : [title]),
      {
        type: 'element',
        tagName: 'div',
        properties: { className: ['demo-frame'], dataDemoFrame: '' },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['demo-stage'], dataDemoStage: '' },
            children: stage,
          },
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['demo-beats'] },
            children: beats,
          },
        ],
      },
      ...(demo.properties.dataPlay === 'time' ? [controls] : []),
    ];
    if (demo.properties.dataPlay !== 'time') {
      delete demo.properties.dataLabelPlay;
      delete demo.properties.dataLabelPause;
      delete demo.properties.dataLabelReplay;
    }
    return SKIP;
  });
}

const SCENE_EXAMPLE = [
  '::::::demo{title="One deploy, played" play="time" seconds="2"}',
  ':::::diagram{title="Pipeline" description="Build, then test, then ship."}',
  '::node{id="build" label="Build"}',
  '::node{id="test" label="Test"}',
  '::node{id="ship" label="Ship"}',
  '::edge{from="build" to="test"}',
  '::edge{from="test" to="ship"}',
  ':::::',
  '',
  ':::beat{title="Build" focus="build"}',
  'The bundle is written in 4 seconds.',
  ':::',
  '',
  ':::beat{title="Test" focus="test"}',
  '312 checks pass.',
  ':::',
  '',
  ':::beat{title="Ship" focus="ship"}',
  'The page is live.',
  ':::',
  '::::::',
  '',
].join('\n');

export const demo = defineBlock<undefined, DemoMessages>({
  definition: demoDefinition(),
  validate: validateDemo,
  enhance: enhanceDemo,
  finalize: finalizeDemoScenes,
  strings: DEMO_MESSAGES,
  feature: 'demo',
  staticEquivalent:
    'The titled content with a counter showing its start value; a playable scene shows its final frame — the stage with every beat beside it, in order, nothing pinned.',
  examples: [':::demo{title="Try it" start="2" step="3"}\nPress the button.\n:::\n', SCENE_EXAMPLE],
});
