import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { visit } from 'unist-util-visit';

import {
  type DirectiveAttributeDefinition,
  type DirectiveDefinition,
  SECTION_RECIPE_NAMES,
} from '../authoring/directive-contract.js';
import type { AgenticReportError } from '../diagnostics.js';
import type { PackageStrings } from '../localization.js';
import { PAGE_MOTION_POLICY } from '../page-motion.js';
import { declareAuthoredRules, runAuthoredRules } from '../render/authored-rules.js';
import { resolveSectionId } from '../render/section-identity.js';
import {
  booleanAttribute,
  enumAttribute,
  optionalIdentityAttribute,
  requiredTitleAttribute,
  textAttribute,
  titleAttribute,
} from './definitions.js';
import { checkMotionLevel } from './motion-level.js';
import { stateAttribute } from './page-state.js';
import {
  type BlockEnhancementContext,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { hasClassName, hastContainsTag, stringProperty, takeStringProperty } from './hast.js';
import { type DirectiveNode, isDirectiveNode } from './mdast.js';

/**
 * The section family: the labelled top-level section, its lead paragraph, the beats of a steps
 * scene, and the speaker notes of a slide. The section also owns the page-level passes that read
 * sections: openings, galleries, steps scenes, the first screen and slides.
 */

function sectionDefinition(): DirectiveDefinition {
  const attributes = [
    requiredTitleAttribute(),
    optionalIdentityAttribute('id', 'Optional stable section anchor.'),
    textAttribute('nav', 'Optional short primary-navigation label.', false),
    enumAttribute(
      'recipe',
      'High-level package-owned section composition; explicit detailed attributes override its roles.',
      SECTION_RECIPE_NAMES,
      'none',
    ),
    enumAttribute(
      'place',
      'Where the section stands: in the flow of the page, or as the first screen beside the page title (only the first section).',
      ['flow', 'opening'],
      'flow',
    ),
    enumAttribute('width', 'Section content track.', ['reading', 'standard', 'wide'], 'standard'),
    enumAttribute('align', 'Section content alignment.', ['start', 'center'], 'start'),
    enumAttribute(
      'tone',
      'Package-owned section surface tone.',
      ['plain', 'soft', 'accent', 'contrast'],
      'plain',
    ),
    enumAttribute(
      'composition',
      'Semantic arrangement for the section content; authored reading order is unchanged.',
      ['flow', 'stage', 'split', 'mosaic', 'story', 'stack'],
      'flow',
    ),
    enumAttribute(
      'viewport',
      'Bounded use of the available viewport without changing document order.',
      ['adaptive', 'full', 'bounded'],
      'adaptive',
    ),
    enumAttribute(
      'section-density',
      'Section-local content rhythm independent of the page density token.',
      ['compact', 'editorial', 'immersive'],
      'editorial',
    ),
    enumAttribute(
      'type',
      'Section-local typography role.',
      ['body', 'display', 'editorial'],
      'body',
    ),
    enumAttribute(
      'media',
      'Art direction for confined local images inside the section.',
      ['natural', 'mask', 'layers', 'gallery', 'bleed'],
      'natural',
    ),
    enumAttribute(
      'media-fit',
      'Section-local object fitting for confined images.',
      ['natural', 'contain', 'cover'],
      'natural',
    ),
    enumAttribute(
      'media-aspect',
      'Section-local aspect ratio for confined images.',
      ['natural', 'landscape', 'cinematic', 'portrait', 'square'],
      'natural',
    ),
    enumAttribute(
      'focal',
      'Package-owned object position for cropped local media.',
      ['center', 'top', 'right', 'bottom', 'left'],
      'center',
    ),
    enumAttribute(
      'surface',
      'Package-owned band behind the section: none, a one-colour tint, a fine grain, a drafting grid, or a blueprint grid with major and minor lines in the accent colour.',
      ['plain', 'tint', 'grain', 'grid', 'blueprint'],
      'plain',
    ),
    enumAttribute(
      'frame',
      'Section edge: a full-width band with no border, or a bordered rounded panel. browser puts the first picture of the section in a browser window whose bar shows the real address (address) or, for a mock-up, the label Illustration (illustration="true").',
      ['none', 'panel', 'browser'],
      'none',
    ),
    {
      name: 'address',
      description:
        'The real address of the page in the picture, shown in the bar of frame="browser": an absolute http or https URL.',
      required: false,
      constraint: {
        kind: 'string',
        normalization: 'trim',
        minLength: 1,
        maxLength: 300,
        format: 'absolute-http-url',
      },
      renderProperty: 'dataAddress',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
    booleanAttribute(
      'illustration',
      'The picture in frame="browser" is a mock-up, not a real page: its bar says Illustration.',
      false,
    ),
    enumAttribute(
      'transition',
      'Bounded package-owned entrance treatment: one section reveal, children in turn, the section title line by line, or log: every code block of the section prints line by line like a log, with its whole text in the page from the start; clip opens the chapter from its lower edge; staged, on the first screen (place="opening") only, brings in the page title by lines, then the eyebrow, the subtitle, the actions and the scene.',
      ['none', 'reveal', 'stagger', 'lines', 'log', 'clip', 'staged'],
      'none',
    ),
    enumAttribute(
      'scene',
      'Content-driven scroll scene without changing document order; steps pins the section media while its beats scroll past and switches the picture, the lit part of the diagram or the lit code lines with each beat; scrub pins the media for one screen per beat (two to four) and plays the beats as a timeline of the scroll.',
      ['none', 'progress', 'sticky', 'steps', 'scrub'],
      'none',
    ),
    enumAttribute(
      'slide-transition',
      'How this slide arrives in a presentation (layout slides): a fade, a push, a wipe, a zoom, or at once; the duration is fixed and published.',
      ['fade', 'push', 'wipe', 'zoom', 'none'],
      'fade',
    ),
    enumAttribute(
      'interaction',
      'Fine-pointer-only media interaction.',
      ['none', 'depth', 'tilt'],
      'none',
    ),
    enumAttribute(
      'choreography',
      'Semantic ordered emphasis for metrics and visualizations.',
      ['none', 'cascade'],
      'none',
    ),
    booleanAttribute(
      'reveal',
      'Enables one package-owned one-time section reveal in the normal-motion profile.',
      PAGE_MOTION_POLICY.sectionReveal.default,
    ),
    stateAttribute(
      'Page state set while the reader has reached this section (its top passed the middle of the screen) and cleared when they scroll back above it; blocks with the same when light.',
    ),
  ] as const;
  return {
    name: 'section',
    description: 'Labelled top-level page section containing Markdown.',
    forms: ['container'],
    attributes,
    incompatibleCombinations: [
      {
        attributes: {
          composition: ['mosaic', 'stack'],
          media: ['layers', 'gallery'],
        },
        message:
          'section composition mosaic or stack cannot be combined with layered or gallery media.',
        remediation:
          'Use composition flow, stage, split, or story with layered/gallery media, or use natural, mask, or bleed media with mosaic/stack composition.',
      },
      {
        attributes: {
          media: ['layers'],
          interaction: ['depth', 'tilt'],
        },
        message: 'Layered media cannot also own a pointer transform.',
        remediation: 'Use interaction="none" with layered media or another media treatment.',
      },
      {
        attributes: {
          scene: ['progress'],
          interaction: ['depth', 'tilt'],
        },
        message: 'A progress scene and pointer interaction cannot transform the same media.',
        remediation: 'Use either scene="progress" or a depth/tilt interaction.',
      },
      {
        attributes: {
          composition: ['story', 'stack'],
          scene: ['sticky'],
        },
        message: 'Story and stack compositions already own sticky positioning.',
        remediation: 'Use scene="none|progress" or a flow, stage, split, or mosaic composition.',
      },
      {
        attributes: {
          composition: ['story', 'stack', 'mosaic'],
          scene: ['steps', 'scrub'],
        },
        message: 'A steps or scrub scene arranges its own media and beats.',
        remediation: 'Use composition="flow" with scene="steps" or scene="scrub".',
      },
      {
        attributes: {
          scene: ['steps', 'scrub'],
          interaction: ['depth', 'tilt'],
        },
        message: 'A pinned scene and pointer interaction cannot move the same media.',
        remediation: 'Use interaction="none" with scene="steps" or scene="scrub".',
      },
    ],
    children: 'markdown',
    placement: { topLevelOnly: true },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'section',
      className: 'semantic-section',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function leadDefinition(): DirectiveDefinition {
  return {
    name: 'lead',
    description: 'One emphasized opening thesis paragraph inside a section.',
    forms: ['container'],
    attributes: [],
    children: 'markdown',
    placement: { requiredParent: 'section' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'div',
      className: 'semantic-lead',
      properties: ['dataSemantic'],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

function beatDefinition(): DirectiveDefinition & { readonly name: 'beat' } {
  const attributes = [
    titleAttribute,
    {
      name: 'focus',
      description:
        'Diagram node and connection identities lit while this beat is current, separated by commas; a connection lights when named by its id or when both its nodes are lit.',
      required: false,
      constraint: {
        kind: 'string',
        normalization: 'trim',
        minLength: 1,
        maxLength: 640,
      },
      renderProperty: 'dataFocus',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
    {
      name: 'lines',
      description:
        'Lines of the code block in the scene lit while this beat is current, such as 3, 2-4 or 1,5-7; the other lines dim.',
      required: false,
      constraint: {
        kind: 'string',
        normalization: 'trim',
        minLength: 1,
        maxLength: 120,
        pattern:
          '^[1-9][0-9]{0,3}(?:-[1-9][0-9]{0,3})?(?:, ?[1-9][0-9]{0,3}(?:-[1-9][0-9]{0,3})?)*$',
      },
      renderProperty: 'dataLines',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
    stateAttribute(
      'Page state set from the moment this beat becomes current; in a scrub scene it stays set for the later beats, so the last beat holds every state of the scene.',
    ),
  ] as const satisfies readonly DirectiveAttributeDefinition[];
  return {
    name: 'beat',
    description:
      'One step of a scene="steps" or scene="scrub" section or of a playable demo: Markdown that scrolls past the pinned media or plays in turn; the nth beat shows the nth picture, lights its focus nodes in the diagram or its lines of the code block.',
    forms: ['container'],
    attributes,
    children: 'markdown',
    placement: { requiredParent: ['section', 'demo'] },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'package-owned-scene' },
    sanitizer: {
      tagName: 'article',
      className: 'semantic-beat',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

function notesDefinition(): DirectiveDefinition & { readonly name: 'notes' } {
  return {
    name: 'notes',
    description:
      'Speaker notes of a slide: never shown to the audience, shown under the slide in the presenter view (?view=presenter).',
    forms: ['container'],
    attributes: [],
    children: 'markdown',
    placement: { requiredParent: 'section' },
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'package-owned-slides' },
    sanitizer: { tagName: 'aside', className: 'semantic-notes', properties: ['dataSemantic'] },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document', 'reader-runtime'],
  };
}

interface StepSceneSubject {
  readonly section: DirectiveNode;
  readonly beats: readonly DirectiveNode[];
  readonly steps: boolean;
  /** Сцена со скрабом: такт — экран, тактов от двух до четырёх. */
  readonly scrub: boolean;
  readonly media: boolean;
  /** В секции есть блок кода: такту есть чьи строки зажигать. */
  readonly code: boolean;
  readonly lines: (beat: DirectiveNode) => string | undefined;
  readonly nodes: ReadonlySet<string>;
  readonly focus: (beat: DirectiveNode) => readonly string[];
  readonly fail: (node: DirectiveNode, message: string, remediation: string) => AgenticReportError;
}

/**
 * Сцена по шагам: медиа, от двух до восьми тактов, фокус — на узлы своей схемы. Сцена со скрабом держит
 * такт на экран, поэтому тактов у неё не больше четырёх (SPEC 8.1: закреплённая сцена не длиннее четырёх
 * экранов); сцена по шагам укладывает свои такты в те же четыре экрана вёрсткой.
 */
const MAXIMUM_BEATS = 8;
const MAXIMUM_SCRUB_BEATS = PAGE_MOTION_POLICY.scrub.maximumScreens;
const MINIMUM_SCRUB_BEATS = PAGE_MOTION_POLICY.scrub.minimumScreens;
const stepSceneRules = declareAuthoredRules<StepSceneSubject>({
  subject: 'section/steps',
  rules: [
    {
      id: 'beats-in-steps-scene',
      check: ({ section, beats, steps, scrub, fail }) =>
        steps || scrub || beats.length === 0
          ? undefined
          : fail(
              section,
              'beat directives belong to a section with scene="steps" or scene="scrub".',
              'Add scene="steps" (or scene="scrub" for two to four screens) to the section or turn the beats into ordinary Markdown.',
            ),
    },
    {
      id: 'beat-count',
      check: ({ section, beats, steps, fail }) =>
        !steps || (beats.length >= 2 && beats.length <= MAXIMUM_BEATS)
          ? undefined
          : fail(
              section,
              `A steps scene holds from 2 to ${MAXIMUM_BEATS} beats; this one has ${beats.length}.`,
              'Write each step as a :::beat container, or split a long story into two sections.',
            ),
    },
    {
      id: 'scrub-screens',
      check: ({ section, beats, scrub, fail }) =>
        !scrub || (beats.length >= MINIMUM_SCRUB_BEATS && beats.length <= MAXIMUM_SCRUB_BEATS)
          ? undefined
          : fail(
              section,
              `A scrub scene holds one screen per beat, from ${MINIMUM_SCRUB_BEATS} to ${MAXIMUM_SCRUB_BEATS}; this one has ${beats.length}.`,
              'Keep the two to four beats that change the picture most, or use scene="steps" for a longer walkthrough.',
            ),
    },
    {
      id: 'stage-media',
      check: ({ section, steps, scrub, media, fail }) =>
        !(steps || scrub) || media
          ? undefined
          : fail(
              section,
              'A pinned scene pins its first image, video, diagram or code block, and this section has none.',
              'Put the pictures, the diagram or the code before the first beat.',
            ),
    },
    {
      id: 'beat-lines',
      check: ({ beats, code, lines, fail }) =>
        code
          ? undefined
          : beats.flatMap((beat) =>
              lines(beat) === undefined
                ? []
                : [
                    fail(
                      beat,
                      'beat lines names code lines, and the scene has no code block.',
                      'Put the code block before the first beat, or remove lines.',
                    ),
                  ],
            ),
    },
    {
      id: 'focus-nodes',
      check: ({ beats, nodes, focus, fail }) =>
        beats.flatMap((beat) => {
          const missing = focus(beat).filter((id) => !nodes.has(id));
          return missing.length === 0
            ? []
            : [
                fail(
                  beat,
                  `beat focus names nodes or connections the section's diagram does not have: ${missing.join(', ')}.`,
                  'Name node or connection ids of the diagram in the same section, or remove focus.',
                ),
              ];
        }),
    },
  ],
});

interface OpeningPlacementSubject {
  readonly section: DirectiveNode;
  readonly firstSection: boolean;
  readonly titled: boolean;
  readonly fail: (message: string, remediation: string) => AgenticReportError;
}

/** Первый экран — только первая секция страницы, и только когда у страницы есть заголовок `#`. */
const openingPlacementRules = declareAuthoredRules<OpeningPlacementSubject>({
  subject: 'section/place',
  rules: [
    {
      id: 'first-section',
      check: ({ firstSection, fail }) =>
        firstSection
          ? undefined
          : fail(
              'Only the first section of the page can stand beside the title as its first screen.',
              'Move this section to the top of the page or remove place="opening" (recipe="demo" sets it).',
            ),
    },
    {
      id: 'page-title',
      check: ({ titled, fail }) =>
        titled
          ? undefined
          : fail(
              'A first-screen section stands beside the page title, and this page has no # title before it.',
              'Start the page with a # heading or remove place="opening" (recipe="demo" sets it).',
            ),
    },
  ],
});

interface BrowserFrameSubject {
  readonly section: DirectiveNode;
  readonly browser: boolean;
  readonly address: boolean;
  readonly illustration: boolean;
  readonly picture: boolean;
  readonly fail: (message: string, remediation: string) => AgenticReportError;
}

/**
 * Рамка браузера — только с настоящим адресом страницы или с меткой «иллюстрация» у макета: скриншот в
 * выдуманном хроме браузера — клише, которое показывает продукт реквизитом. Адрес и метка без рамки ничего
 * не значат, а рамке нужна картинка, которую она обрамляет.
 */
const browserFrameRules = declareAuthoredRules<BrowserFrameSubject>({
  subject: 'section/browser-frame',
  rules: [
    {
      id: 'real-address-or-illustration',
      check: ({ browser, address, illustration, fail }) =>
        !browser || address || illustration
          ? undefined
          : fail(
              'A browser frame shows the real address of the page in the picture, and this section gives none.',
              'Add address="https://…" with the page\'s real address, or illustration="true" when the picture is a mock-up; otherwise remove frame="browser".',
            ),
    },
    {
      id: 'frame-for-address',
      check: ({ browser, address, illustration, fail }) =>
        browser || (!address && !illustration)
          ? undefined
          : fail(
              'address and illustration describe a browser frame, and this section has frame other than browser.',
              'Add frame="browser" or remove address and illustration.',
            ),
    },
    {
      id: 'framed-picture',
      check: ({ browser, picture, fail }) =>
        !browser || picture
          ? undefined
          : fail(
              'A browser frame holds the first picture of the section, and this section has no image or video of its own.',
              'Put the screenshot (an image or a video) directly in the section, or remove frame="browser".',
            ),
    },
  ],
});

/** A direct picture of the section: an image paragraph or a video directive. */
function hasDirectPicture(section: DirectiveNode): boolean {
  return (section.children ?? []).some((child) => {
    if (isDirectiveNode(child)) return child.name === 'video';
    const node = child as { type?: string; children?: readonly { type?: string }[] };
    return node.type === 'paragraph' && (node.children ?? []).some((part) => part.type === 'image');
  });
}

interface LeadSubject {
  readonly lead: DirectiveNode;
  readonly index: number;
  readonly siblings: NonNullable<DirectiveNode['children']>;
  readonly fail: (lead: DirectiveNode, message: string, remediation: string) => AgenticReportError;
}

/**
 * The rules of one lead paragraph. Shape and placement are independent questions — a lead holding
 * two blocks is still in the wrong place or the right one — so both answer for the same lead.
 */
const leadRules = declareAuthoredRules<LeadSubject>({
  subject: 'section/lead',
  rules: [
    {
      id: 'single-paragraph',
      check: ({ lead, fail }) => {
        const blocks = lead.children ?? [];
        const single =
          blocks.length === 1 &&
          typeof blocks[0] === 'object' &&
          blocks[0] !== null &&
          'type' in blocks[0] &&
          blocks[0].type === 'paragraph';
        return single
          ? undefined
          : fail(
              lead,
              'lead must contain exactly one Markdown paragraph.',
              'Keep one prose paragraph inside lead and move every other block outside it.',
            );
      },
    },
    {
      id: 'first-authored-block',
      check: ({ lead, index, siblings, fail }) =>
        index > 0 || siblings[0] !== lead
          ? fail(
              lead,
              'A section accepts one lead as its first authored block.',
              'Keep one lead first in the section and use ordinary paragraphs for the remaining prose.',
            )
          : undefined,
    },
  ],
});

/**
 * A top-level section answers for its first-screen placement and its steps scene; every section
 * answers for its lead paragraphs. The three are independent readings of the same section, reported
 * in that order.
 */
function validateSection(section: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const placement = (node: DirectiveNode, message: string, remediation: string) =>
    context.violation(node, 'INVALID_DIRECTIVE_PLACEMENT', message, remediation);
  const found: AgenticReportError[] = [];
  const root = context.document;
  if (context.parent === root) {
    const index = root.children.indexOf(section as unknown as MdastRoot['children'][number]);
    const earlier = root.children.slice(0, index);
    if (context.attributes(section)?.place === 'opening') {
      runAuthoredRules(
        openingPlacementRules,
        {
          section,
          firstSection: !earlier.some(
            (child) => isDirectiveNode(child) && child.name === section.name,
          ),
          titled: earlier.some((child) => child.type === 'heading' && child.depth === 1),
          fail: (message, remediation) => placement(section, message, remediation),
        },
        found,
      );
    }
    runAuthoredRules(stepSceneRules, stepSceneSubject(section, context, placement), found);
    // Поэтапный вход — вход первого экрана: он ведёт заголовок страницы, а он есть только рядом с ним.
    const own = context.attributes(section);
    if (own?.transition === 'staged' && own.place !== 'opening')
      found.push(
        context.violation(
          section,
          'INVALID_DIRECTIVE_ATTRIBUTE',
          'transition="staged" brings in the first screen with the page title, and this section is not the first screen.',
          'Add place="opening" to the first section (recipe="demo" sets it), or use transition="reveal".',
        ),
      );
  }
  checkMotionLevel(context, found);
  const values = context.attributes(section);
  if (values !== undefined) {
    runAuthoredRules(
      browserFrameRules,
      {
        section,
        browser: values.frame === 'browser',
        address: typeof values.address === 'string',
        illustration: values.illustration === true,
        picture: hasDirectPicture(section),
        fail: (message, remediation) =>
          context.violation(section, 'INVALID_DIRECTIVE_ATTRIBUTE', message, remediation),
      },
      found,
    );
  }
  context.report(found);
  const children = section.children ?? [];
  const leads = children.filter(
    (child): child is DirectiveNode => isDirectiveNode(child) && child.name === 'lead',
  );
  const leadViolations: AgenticReportError[] = [];
  // Each lead is its own subject: a malformed one says nothing about the next, so the section
  // answers for every lead it holds.
  for (const [index, lead] of leads.entries()) {
    runAuthoredRules(
      leadRules,
      { lead, index, siblings: children, fail: placement },
      leadViolations,
    );
  }
  context.report(leadViolations);
  return leadViolations.length === 0 ? 'accepted' : 'refused';
}

function stepSceneSubject(
  section: DirectiveNode,
  context: BlockValidationContext,
  fail: StepSceneSubject['fail'],
): StepSceneSubject {
  const beats: DirectiveNode[] = [];
  for (const node of section.children ?? []) {
    if (isDirectiveNode(node) && node.name === 'beat') beats.push(node);
  }
  const nodes = new Set<string>();
  let media = false;
  let code = false;
  visit(section as unknown as MdastRoot, (node) => {
    if ((node as { type?: string }).type === 'image') media = true;
    if ((node as { type?: string }).type === 'code') {
      media = true;
      code = true;
    }
    if (!isDirectiveNode(node)) return;
    if (node.name === 'diagram' || node.name === 'video') media = true;
    // Фокус такта называет узлы и связи одним списком: связь с `id` загорается по имени.
    if ((node.name === 'node' || node.name === 'edge') && typeof node.attributes?.id === 'string')
      nodes.add(node.attributes.id);
  });
  return {
    section,
    beats,
    steps: context.attributes(section)?.scene === 'steps',
    scrub: context.attributes(section)?.scene === 'scrub',
    media,
    code,
    lines: (beat) => {
      const value = context.attributes(beat)?.lines;
      return typeof value === 'string' ? value : undefined;
    },
    nodes,
    focus: (beat) =>
      String(context.attributes(beat)?.focus ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    fail,
  };
}

interface SectionMessages {
  readonly illustration: string;
  readonly address: string;
}

const SECTION_MESSAGES: Readonly<Record<'en' | 'ru', SectionMessages>> = {
  en: { illustration: 'Illustration', address: 'Address of the page in the picture' },
  ru: { illustration: 'Иллюстрация', address: 'Адрес страницы на картинке' },
};

/**
 * Рамка браузера обнимает первую картинку секции — абзац с картинкой или видео. В полосе рамки стоит
 * настоящий адрес страницы или, у макета, метка «Иллюстрация»; кнопок окна и выдуманных вкладок нет.
 */
function frameFirstPicture(node: Element, messages: SectionMessages): void {
  const address = takeStringProperty(node, 'dataAddress');
  const illustration = takeStringProperty(node, 'dataIllustration') === 'true';
  if (node.properties.dataFrame !== 'browser') return;
  const index = node.children.findIndex(
    (child) =>
      child.type === 'element' &&
      (hasClassName(child, 'semantic-video') ||
        (child.tagName === 'p' && hastContainsTag(child, 'img'))),
  );
  const picture = node.children[index];
  if (picture === undefined || picture.type !== 'element') return;
  const bar: Element = {
    type: 'element',
    tagName: 'div',
    properties: { className: ['browser-frame-bar'] },
    children: [
      ...(address === undefined
        ? []
        : [
            {
              type: 'element' as const,
              tagName: 'span',
              properties: {
                className: ['browser-frame-address'],
                title: messages.address,
                translate: 'no',
              },
              children: [{ type: 'text' as const, value: address }],
            },
          ]),
      ...(illustration
        ? [
            {
              type: 'element' as const,
              tagName: 'span',
              properties: { className: ['browser-frame-illustration', 'ui-label'] },
              children: [{ type: 'text' as const, value: messages.illustration }],
            },
          ]
        : []),
    ],
  };
  node.children[index] = {
    type: 'element',
    tagName: 'div',
    properties: {
      className: ['browser-frame'],
      dataBrowserFrame: illustration ? 'illustration' : 'address',
    },
    children: [bar, picture],
  };
}

function enhanceSection(node: Element, context: BlockEnhancementContext<SectionMessages>): void {
  frameFirstPicture(node, context.messages);
  const title = takeStringProperty(node, 'dataDirectiveTitle');
  const transportedId = takeStringProperty(node, 'dataId');
  if (title === undefined || transportedId === undefined) {
    throw new Error('Validated section is missing its title or id.');
  }
  const sectionId = resolveSectionId(transportedId, context.allocateId);
  const titleId = context.allocateId(`${sectionId}-title`);
  node.properties.id = sectionId;
  node.properties.ariaLabelledBy = [titleId];
  node.children.unshift({
    type: 'element',
    tagName: 'h2',
    properties: { id: titleId, className: ['semantic-section-title'] },
    children: [{ type: 'text', value: title }],
  });
}

function enhanceLead(node: Element): void {
  const paragraphs = node.children.filter(
    (child): child is Element => child.type === 'element' && child.tagName === 'p',
  );
  const paragraph = paragraphs[0];
  if (paragraph === undefined || paragraphs.length !== 1) {
    throw new Error('Validated lead is missing its single paragraph.');
  }
  node.tagName = 'p';
  node.properties = { ...paragraph.properties, ...node.properties };
  node.children = paragraph.children;
}

function finalizeSections(
  tree: HastRoot,
  context: { readonly strings: PackageStrings; readonly layout: string | undefined },
): void {
  enhanceGalleryRails(tree);
  enhanceSectionOpenings(tree);
  enhanceStepScenes(tree);
  enhancePageOpening(tree);
  if (context.layout === 'slides') enhanceSlides(tree, context.strings);
  if (context.layout === 'screens') enhanceScreens(tree, context.strings);
}

function isSection(node: Element): boolean {
  return node.properties.dataSemantic === 'section';
}

function enhanceGalleryRails(tree: HastRoot): void {
  visit(tree, 'element', (section: Element) => {
    if (!isSection(section) || stringProperty(section, 'dataMedia') !== 'gallery') {
      return;
    }
    for (const rail of section.children.filter(
      (child): child is Element =>
        child.type === 'element' && hasClassName(child, 'semantic-cards'),
    )) {
      const trackItems = rail.children.filter((child) => child.type === 'element');
      if (trackItems.length < 2) continue;
      rail.properties.dataGalleryRail = '';
    }
  });
}

/**
 * Direct section children that read well in half of the section track beside a split title. Beside a stage
 * picture only the short opening stays: the lead, plain paragraphs, and actions.
 */
const STAGE_OPENING_TEXT_CLASSES = ['semantic-lead', 'semantic-actions'] as const;
const SECTION_OPENING_TEXT_CLASSES = [
  'semantic-lead',
  'semantic-callout',
  'semantic-actions',
  'semantic-decision',
  'semantic-glossary',
  'semantic-copyable',
  'semantic-asset',
  'semantic-modal',
  'semantic-popover',
] as const;

type SectionOpeningPart = 'text' | 'media';

function sectionOpeningPart(
  child: Element,
  composition: 'split' | 'stage',
  media: string | undefined,
): SectionOpeningPart | undefined {
  const elements = child.children.filter((node): node is Element => node.type === 'element');
  if (hasClassName(child, 'semantic-video')) return 'media';
  if (
    child.tagName === 'p' &&
    elements.length > 0 &&
    elements.every((node) => node.tagName === 'img')
  ) {
    return 'media';
  }
  if (
    (media === 'gallery' || media === 'layers') &&
    hasClassName(child, 'semantic-cards') &&
    hastContainsTag(child, 'img')
  ) {
    return 'media';
  }
  const textClasses =
    composition === 'stage' ? STAGE_OPENING_TEXT_CLASSES : SECTION_OPENING_TEXT_CLASSES;
  if (textClasses.some((className) => hasClassName(child, className))) return 'text';
  if (composition === 'split' && ['ul', 'ol', 'blockquote'].includes(child.tagName)) return 'text';
  if (child.tagName === 'p' && !hastContainsTag(child, 'img')) return 'text';
  return undefined;
}

/**
 * Сцена по шагам: первое медиа секции — картинки, схема или ролик — становится закреплённой сценой, а
 * её такты идут рядом. Порядок чтения прежний: заголовок, сцена, такты; без рантайма и при
 * уменьшенном движении сцена не закрепляется, и такты читаются подряд.
 */
function enhanceStepScenes(tree: HastRoot): void {
  visit(tree, 'element', (section: Element) => {
    const scene = section.properties.dataScene;
    if (!isSection(section) || (scene !== 'steps' && scene !== 'scrub')) return;
    const beats = section.children.filter(
      (child): child is Element =>
        child.type === 'element' && child.properties.dataSemantic === 'beat',
    );
    // Подсветка кода ставит на место блока свой фрагмент — узел `root` с `pre` внутри.
    const stage = section.children.find(
      (child) =>
        ((child as { readonly type: string }).type === 'root' &&
          hastContainsTag(child as unknown as Element, 'pre')) ||
        (child.type === 'element' &&
          child.properties.dataSemantic !== 'beat' &&
          !hasClassName(child, 'semantic-section-title') &&
          (hastContainsTag(child, 'img') ||
            hastContainsTag(child, 'video') ||
            hastContainsTag(child, 'pre') ||
            child.properties.dataSemantic === 'diagram')),
    );
    if (stage === undefined || beats.length === 0) return;
    let frame = 0;
    visit(stage, 'element', (media: Element) => {
      if (media.tagName !== 'img') return;
      media.properties.dataSceneFrame = String(frame);
      frame += 1;
    });
    for (const [index, beat] of beats.entries()) beat.properties.dataBeat = String(index);
    const stageIndex = section.children.indexOf(stage);
    const wrappedStage: Element = {
      type: 'element',
      tagName: 'div',
      properties: { className: ['scene-stage'], dataSceneStage: '' },
      children: [stage],
    };
    const beatList: Element = {
      type: 'element',
      tagName: 'div',
      properties: { className: ['scene-beats'] },
      children: beats,
    };
    section.children = section.children.filter(
      (child) => child.type !== 'element' || child.properties.dataSemantic !== 'beat',
    );
    const stageAt = section.children.indexOf(stage);
    // Сцена со скрабом закрепляет сцену и подписи вместе: одна рама на экран, пока идут её экраны.
    const replacement: ElementContent[] =
      scene === 'scrub'
        ? [
            {
              type: 'element',
              tagName: 'div',
              properties: { className: ['scene-track'] },
              children: [
                {
                  type: 'element',
                  tagName: 'div',
                  properties: { className: ['scene-pin'], dataScenePin: '' },
                  children: [wrappedStage, beatList],
                },
              ],
            },
          ]
        : [wrappedStage, beatList];
    section.children.splice(stageAt < 0 ? stageIndex : stageAt, 1, ...replacement);
    section.properties.dataSceneFrames = String(frame);
    section.properties.dataSceneBeats = String(beats.length);
    const style =
      typeof section.properties.style === 'string' ? `${section.properties.style}; ` : '';
    section.properties.style = `${style}--scene-beats: ${beats.length}`;
  });
}

/**
 * Режим экранов (`layout: screens`): каждая секция верхнего уровня — экран, а всё до первой секции
 * (заголовок страницы и вступление) собирается в первый экран. Без рантайма, в печати и при уменьшенном
 * движении экраны — обычные главы документа.
 */
function enhanceScreens(tree: HastRoot, strings: PackageStrings): void {
  const first = tree.children.findIndex((child) => child.type === 'element' && isSection(child));
  const lead = tree.children.slice(0, first < 0 ? tree.children.length : first);
  if (lead.some((child) => child.type === 'element')) {
    const cover: Element = {
      type: 'element',
      tagName: 'section',
      properties: {
        className: ['semantic-section', 'screen-cover'],
        dataSemantic: 'section',
        dataScreenCover: '',
        ariaLabel: strings.titleScreen,
      },
      children: lead as ElementContent[],
    };
    tree.children.splice(0, lead.length, cover);
  }
  let screen = 0;
  for (const child of tree.children) {
    if (child.type !== 'element' || !isSection(child)) continue;
    child.properties.dataScreen = String(screen);
    screen += 1;
  }
}

/**
 * Презентация: каждая секция верхнего уровня — слайд, а всё, что стоит до первой секции (заголовок
 * страницы и вступление), собирается в титульный слайд. Шаги слайда — его блоки `appear` по порядку.
 * Без рантайма, в печати и при уменьшенном движении слайды идут подряд и показаны целиком.
 */
function enhanceSlides(tree: HastRoot, strings: PackageStrings): void {
  const first = tree.children.findIndex((child) => child.type === 'element' && isSection(child));
  const lead = tree.children.slice(0, first < 0 ? tree.children.length : first);
  if (lead.some((child) => child.type === 'element')) {
    const cover: Element = {
      type: 'element',
      tagName: 'section',
      properties: {
        className: ['semantic-section', 'slide-cover'],
        dataSemantic: 'section',
        dataSlideCover: '',
        dataSlideTransition: 'fade',
        ariaLabel: strings.titleSlide,
      },
      children: lead as ElementContent[],
    };
    tree.children.splice(0, lead.length, cover);
  }
  let slide = 0;
  for (const child of tree.children) {
    if (child.type !== 'element' || !isSection(child)) continue;
    child.properties.dataSlide = String(slide);
    let step = 0;
    visit(child, 'element', (node: Element) => {
      if (node.properties.dataSemantic !== 'appear') return;
      step += 1;
      node.properties.dataStep = String(step);
    });
    child.properties.dataSlideSteps = String(step);
    slide += 1;
  }
}

/**
 * Секция с `place="opening"` — первый экран рядом с заголовком страницы: заголовок, вступление и
 * действия вместе с ней собираются в одну раму первого экрана. Порядок чтения прежний — заголовок,
 * вступление, затем секция; оболочка страницы не меняется.
 */
function enhancePageOpening(tree: HastRoot): void {
  const elements = tree.children.filter((child): child is Element => child.type === 'element');
  const title = elements.find((child) => child.tagName === 'h1');
  const stage = elements.find((child) => isSection(child));
  if (title === undefined || stage === undefined || stage.properties.dataPlace !== 'opening')
    return;
  const start = tree.children.indexOf(title);
  const end = tree.children.indexOf(stage);
  if (start < 0 || end <= start) return;
  const copy = tree.children.slice(start, end) as ElementContent[];
  // Секция первого экрана стоит колонкой рядом с заголовком: сцена, раскладка в две колонки, экран во
  // всю высоту и дисплейный шрифт рассчитаны на главу во всю ширину и здесь сжимают её. В колонке
  // первого экрана секция всегда течёт одним столбцом обычным шрифтом, а её медиа занимает всю ширину.
  Object.assign(stage.properties, {
    dataComposition: 'flow',
    dataViewport: 'adaptive',
    dataType: 'body',
    dataMedia: 'natural',
  });
  delete stage.properties.dataSectionOpeningLayout;
  delete stage.properties.style;
  const opening: Element = {
    type: 'element',
    tagName: 'div',
    properties: { className: ['page-opening'], dataPageOpening: '' },
    children: [
      {
        type: 'element',
        tagName: 'div',
        properties: { className: ['page-opening-copy'] },
        children: copy,
      },
      stage,
    ],
  };
  tree.children.splice(start, end - start + 1, opening);
}

/**
 * Marks the opening of every split and stage section: the run of blocks after the title that fits a half
 * track, with at most one picture. Package CSS places only this run beside the title or picture; every later
 * block takes the whole section track, so a long section never squeezes tables, code, or diagrams into a
 * column while the other column stays empty.
 */
function enhanceSectionOpenings(tree: HastRoot): void {
  visit(tree, 'element', (section: Element) => {
    if (!isSection(section)) return;
    const composition = stringProperty(section, 'dataComposition');
    if (composition !== 'split' && composition !== 'stage') return;
    const media = stringProperty(section, 'dataMedia');
    const opening: Array<{ readonly element: Element; readonly part: SectionOpeningPart }> = [];
    for (const child of section.children) {
      if (child.type === 'comment' || (child.type === 'text' && child.value.trim() === ''))
        continue;
      // Highlighted code is still an opaque node here; like any unknown block it ends the opening.
      if (child.type !== 'element') break;
      if (hasClassName(child, 'semantic-section-title')) continue;
      const part = sectionOpeningPart(child, composition, media);
      if (part === undefined) break;
      if (part === 'media' && opening.some((entry) => entry.part === 'media')) break;
      opening.push({ element: child, part });
    }
    const textCount = opening.filter((entry) => entry.part === 'text').length;
    const hasMedia = opening.some((entry) => entry.part === 'media');
    // A stage sets its opening picture against opening text; the gallery title may be that text.
    const staged = composition === 'stage' && hasMedia && (textCount > 0 || media === 'gallery');
    const layout = composition === 'split' ? opening.length > 0 : staged;
    if (!layout) return;
    for (const { element, part } of opening) element.properties.dataSectionOpening = part;
    section.properties.dataSectionOpeningLayout = 'true';
    const rows =
      composition === 'split'
        ? opening.length
        : media === 'gallery'
          ? textCount
          : Math.max(1, textCount);
    section.properties.style = `--section-opening-rows: ${rows}`;
  });
}

export const section = defineBlock<undefined, SectionMessages>({
  definition: sectionDefinition(),
  validate: validateSection,
  enhance: enhanceSection,
  strings: SECTION_MESSAGES,
  finalize: finalizeSections,
  styles: 'package',
  staticEquivalent:
    'A titled page section in reading order: entrances, scenes and pointer effects are off, and a steps scene reads as its picture followed by the beats.',
  examples: [
    '# Page\n\n::::section{title="Result" id="result" composition="split" transition="reveal"}\n:::lead\nThe change is ready.\n:::\n\nDetail in ordinary prose.\n::::\n',
    '# Page\n\n::::section{title="Pricing" frame="browser" address="https://example.com/pricing"}\n![The pricing page as it is live](before.png)\n::::\n',
    '# Page\n\n::::section{title="Install" transition="log"}\n```text\n$ npm install\nadded 12 packages\n```\n::::\n',
  ],
});

export const lead = defineBlock({
  definition: leadDefinition(),
  enhance: enhanceLead,
  styles: 'package',
  staticEquivalent: 'The first paragraph of a section, set larger.',
  examples: ['::::section{title="Result"}\n:::lead\nThe change is ready.\n:::\n::::\n'],
});

export const beat = defineBlock({
  definition: beatDefinition(),
  styles: 'package',
  staticEquivalent: 'A titled step read after the section picture, in order, nothing pinned.',
  examples: [
    '::::::section{title="How it works" scene="steps"}\n:::::diagram{title="Flow" description="Request to store."}\n::node{id="api" label="API"}\n::node{id="store" label="Store"}\n::edge{from="api" to="store"}\n:::::\n\n:::beat{title="One" focus="api"}\nThe request arrives.\n:::\n\n:::beat{title="Two" focus="store"}\nIt is stored.\n:::\n::::::\n',
  ],
});

export const notes = defineBlock({
  definition: notesDefinition(),
  styles: 'package',
  staticEquivalent:
    'Speaker notes that never appear on the page; only the presenter view shows them.',
  examples: ['::::section{title="Slide"}\nSlide text.\n\n:::notes\nSay this aloud.\n:::\n::::\n'],
});
