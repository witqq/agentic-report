import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { booleanAttribute, enumAttribute, pathAttribute } from './definitions.js';
import { type BlockValidationContext, type BlockVerdict, defineBlock } from './define-block.js';
import type { DirectiveNode } from './mdast.js';

/** The furthest a looping clip may start into its recording, in seconds. */
export const VIDEO_START_MAXIMUM = 3600;

function videoDefinition(): DirectiveDefinition {
  return {
    name: 'video',
    description:
      'Embedded local video (webm, mp4, m4v, or ogv) as a looping muted clip, a background with a pause control, or a manually started video with sound; directory output ships every source for the browser to choose from, one file ships the most compatible.',
    forms: ['leaf'],
    attributes: [
      pathAttribute(
        'src',
        'Relative local video path: .webm, .mp4, .m4v, or .ogv. Give the most compatible encoding (H.264 MP4) here.',
        'dataVideoSource',
      ),
      {
        name: 'sources',
        description:
          'Further encodings of the same video, separated by commas, in order of preference (for example AV1 and VP9 from agentic-screencast web); directory output offers all of them before src, one file embeds only the most compatible.',
        required: false,
        constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 600 },
        renderProperty: 'dataVideoSources',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
      enumAttribute(
        'mode',
        'clip: muted, looping, plays while visible, with controls. background: muted and looping without controls, with a pause button; a poster is required. manual: starts only when the reader presses play, with sound.',
        ['clip', 'background', 'manual'],
        'clip',
      ),
      pathAttribute(
        'chapters',
        'Relative WebVTT chapters file (.vtt), such as the one agentic-screencast web writes; the chapters appear as buttons under the video that jump to each chapter.',
        'dataVideoChapters',
        false,
      ),
      pathAttribute(
        'poster',
        'Relative local image shown before playback and in print: .png, .jpg, .jpeg, .webp, .gif, or .avif.',
        'dataVideoPoster',
        false,
      ),
      {
        name: 'caption',
        description:
          'Visible caption under the video; it also names the video for assistive technology.',
        required: false,
        constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 300 },
        renderProperty: 'dataVideoCaption',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
      {
        name: 'start',
        description: `Second of the recording where a looping clip or background starts and every loop returns (0–${VIDEO_START_MAXIMUM}, up to two decimals): the useful part of a recording without re-encoding it.`,
        required: false,
        constraint: {
          kind: 'number',
          minimum: 0,
          maximum: VIDEO_START_MAXIMUM,
          lexicalPattern: '^\\d{1,4}(?:\\.\\d{1,2})?$',
        },
        renderProperty: 'dataVideoStart',
        invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
      },
      enumAttribute(
        'seam',
        'How a looping clip or background joins its end to its start: cut jumps back at once, fade dims the last half-second and brightens the first, so the loop has no visible jump.',
        ['cut', 'fade'],
        'cut',
      ),
      booleanAttribute(
        'expand',
        'Adds an Expand button to a clip that opens it large in a dialog with the full player controls and sound.',
        false,
      ),
    ],
    children: 'none',
    placement: {},
    behavior: {
      renderer: 'embedded-video',
      resource: 'video',
      runtime: 'none',
    },
    sanitizer: {
      tagName: 'figure',
      className: 'semantic-video',
      properties: [
        'dataVideoSource',
        'dataVideoSources',
        'dataMode',
        'dataVideoChapters',
        'dataVideoPoster',
        'dataVideoCaption',
        'dataVideoStart',
        'dataSeam',
        'dataExpand',
      ],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: true },
    handoffs: ['resource-graph'],
  };
}

interface VideoLoopSubject {
  readonly mode: string;
  readonly authored: ReadonlySet<string>;
  readonly expand: boolean;
  readonly fail: (message: string, remediation: string) => AgenticReportError;
}

/** Начало и стык — свойства петли, «Развернуть» — у ролика-клипа: у ручного видео свои полные контролы. */
const videoLoopRules = declareAuthoredRules<VideoLoopSubject>({
  subject: 'video/loop',
  rules: [
    {
      id: 'loop-only-start-and-seam',
      check: ({ mode, authored, fail }) => {
        const loopOnly = ['start', 'seam'].filter((name) => authored.has(name));
        return mode !== 'manual' || loopOnly.length === 0
          ? undefined
          : fail(
              `${loopOnly.join(' and ')} shape a looping clip, and a manual video does not loop.`,
              'Use mode="clip" or mode="background" with start and seam, or remove them.',
            );
      },
    },
    {
      id: 'expand-on-clip',
      check: ({ mode, expand, fail }) =>
        !expand || mode === 'clip'
          ? undefined
          : fail(
              `expand opens a clip large with its controls; a ${mode} video does not take it.`,
              'Use expand="true" with mode="clip", or remove it.',
            ),
    },
  ],
});

function validateVideo(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const values = context.attributes(node);
  if (values === undefined) return 'accepted';
  const found: AgenticReportError[] = [];
  runAuthoredRules(
    videoLoopRules,
    {
      mode: String(values.mode ?? 'clip'),
      authored: new Set(Object.keys(node.attributes ?? {})),
      expand: values.expand === true,
      fail: (message, remediation) =>
        context.violation(node, 'INVALID_DIRECTIVE_ATTRIBUTE', message, remediation),
    },
    found,
  );
  context.report(found);
  return 'accepted';
}

/** The player markup is built by the resource step after sanitization, not by an enhancement. */
export const video = defineBlock({
  definition: videoDefinition(),
  validate: validateVideo,
  styles: 'package',
  staticEquivalent: 'The poster image with the caption; nothing plays until the reader asks.',
  examples: [
    '::video{src="clip.webm" poster="clip-poster.png" caption="The flow in motion."}\n',
    '::video{src="clip.webm" poster="clip-poster.png" caption="The run, from the first command." start="1.5" seam="fade" expand="true"}\n',
  ],
});
