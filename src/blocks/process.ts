import type { Element, ElementContent } from 'hast';

import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { DIAGRAM_MESSAGES, type DiagramMessages } from '../render/diagram-process.js';
import { element, round, text } from '../render/diagram-svg.js';
import {
  type BlockEnhancementContext,
  type BlockValidationContext,
  type BlockVerdict,
  defineBlock,
} from './define-block.js';
import { hastText, takeStringProperty } from './hast.js';
import type { DirectiveNode } from './mdast.js';

/**
 * Мини-схема процесса в строке текста или в карточке: шаги точками по порядку, дуги возвратов над
 * ними с кратностью «×N». Шаги до текущего — готовы, текущий — на проверке, после — не начаты.
 * Это знак, а не схема: имена шагов и возвраты произносятся скрытым текстом рядом, а полная схема
 * процесса — `diagram` со статусами узлов.
 */

export const PROCESS_BOUNDS = { minimumSteps: 2, maximumSteps: 12, maximumCount: 999 } as const;

export interface ProcessReturn {
  readonly from: number;
  readonly to: number;
  readonly count: number;
}

export interface ParsedProcess {
  readonly steps: readonly string[];
  /** Номер текущего шага; без `current` все шаги готовы. */
  readonly current: number | undefined;
  readonly returns: readonly ProcessReturn[];
}

/** Шаги из подписи: имена через `>`. */
export function processSteps(label: string): readonly string[] {
  return label
    .split('>')
    .map((step) => step.replace(/\s+/gu, ' ').trim())
    .filter((step) => step.length > 0);
}

const RETURN_FORM = /^(.+?)\s*>\s*(.+?)(?:(?:\s*×\s*|\s+x\s*)(\d{1,3}))?$/u;

/**
 * Читает мини-схему. Ошибка — строка для автора; разбор общий у проверки и у рисования, поэтому
 * нарисовано ровно то, что проверено.
 */
export function parseProcess(
  label: string,
  current: string | undefined,
  returns: string | undefined,
): ParsedProcess | string {
  const steps = processSteps(label);
  if (steps.length < PROCESS_BOUNDS.minimumSteps || steps.length > PROCESS_BOUNDS.maximumSteps) {
    return `A process names ${PROCESS_BOUNDS.minimumSteps} to ${PROCESS_BOUNDS.maximumSteps} steps separated by ">"; this one names ${steps.length}.`;
  }
  if (new Set(steps).size !== steps.length) return 'Every step of a process has its own name.';
  const position = current === undefined ? undefined : steps.indexOf(current.trim());
  if (position === -1) return `current names a step the process does not have: ${current}.`;
  const parsed: ProcessReturn[] = [];
  for (const item of (returns ?? '').split(',').map((part) => part.trim())) {
    if (item === '') continue;
    const match = RETURN_FORM.exec(item);
    const from = match === null ? -1 : steps.indexOf((match[1] ?? '').trim());
    const to = match === null ? -1 : steps.indexOf((match[2] ?? '').trim());
    if (from === -1 || to === -1) {
      return `A return is written "step>earlier step×N" with step names of the process: ${item}.`;
    }
    if (to > from) return `A return goes back to an earlier step or repeats one: ${item}.`;
    const count = Number(match?.[3] ?? '1');
    if (count < 1 || count > PROCESS_BOUNDS.maximumCount) {
      return `A return count lies between 1 and ${PROCESS_BOUNDS.maximumCount}: ${item}.`;
    }
    parsed.push({ from, to, count });
  }
  return { steps, current: position, returns: parsed };
}

function labelText(node: DirectiveNode): string {
  return (node.children ?? [])
    .map((child) => String((child as { value?: unknown }).value ?? ''))
    .join('');
}

function validateProcess(node: DirectiveNode, context: BlockValidationContext): BlockVerdict {
  const values = context.attributes(node);
  if (values === undefined) return 'refused';
  const parsed = parseProcess(
    labelText(node),
    values.current === undefined ? undefined : String(values.current),
    values.returns === undefined ? undefined : String(values.returns),
  );
  if (typeof parsed !== 'string') return 'accepted';
  context.report(
    context.violation(
      node,
      'INVALID_DIRECTIVE_ATTRIBUTE',
      parsed,
      'Write :process[Plan > Build > Review > Ship]{current="Review" returns="Review>Build×2"}.',
    ),
  );
  return 'refused';
}

const STEP = 18;
const EDGE = 7;
const BASE = 20;
const HEIGHT = 26;

type StepState = 'done' | 'review' | 'pending';

function stepState(index: number, current: number | undefined): StepState {
  if (current === undefined || index < current) return 'done';
  return index === current ? 'review' : 'pending';
}

/** Рисунок мини-схемы: линия шагов, точки по состояниям и дуги возвратов с кратностью. */
export function processSvg(parsed: ParsedProcess): Element {
  const x = (index: number): number => EDGE + index * STEP;
  const width = EDGE * 2 + (parsed.steps.length - 1) * STEP;
  const children: ElementContent[] = [
    element('line', {
      x1: x(0),
      y1: BASE,
      x2: x(parsed.steps.length - 1),
      y2: BASE,
      className: ['visualization-process-line'],
    }),
  ];
  for (const item of parsed.returns) {
    const top = BASE - 4.5;
    if (item.from === item.to) {
      const at = x(item.from);
      children.push(
        element('path', {
          d: `M ${round(at - 2.5)} ${top} C ${round(at - 9)} ${top - 12} ${round(at + 9)} ${top - 12} ${round(at + 2.5)} ${top}`,
          className: ['visualization-process-return'],
        }),
        element('polygon', {
          points: `${round(at + 2.5)},${top + 0.5} ${round(at + 0.6)},${top - 3.6} ${round(at + 5)},${top - 2.6}`,
          className: ['visualization-process-arrow'],
        }),
      );
      if (item.count > 1) {
        children.push(
          element(
            'text',
            { x: round(at + 6), y: top - 7, className: ['visualization-process-count'] },
            [text(`×${item.count}`)],
          ),
        );
      }
      continue;
    }
    const start = x(item.from);
    const end = x(item.to);
    const rise = Math.min(12, 5 + 3 * (item.from - item.to));
    const middle = (start + end) / 2;
    children.push(
      element('path', {
        d: `M ${round(start)} ${top} Q ${round(middle)} ${round(top - rise * 2)} ${round(end)} ${top}`,
        className: ['visualization-process-return'],
      }),
      element('polygon', {
        points: `${round(end)},${top + 0.5} ${round(end - 1.2)},${top - 4} ${round(end + 3.2)},${top - 2.2}`,
        className: ['visualization-process-arrow'],
      }),
    );
    if (item.count > 1) {
      children.push(
        element(
          'text',
          {
            x: round(middle),
            y: round(top - rise - 1.5),
            textAnchor: 'middle',
            className: ['visualization-process-count'],
          },
          [text(`×${item.count}`)],
        ),
      );
    }
  }
  parsed.steps.forEach((_, index) => {
    const state = stepState(index, parsed.current);
    children.push(
      element('circle', {
        cx: x(index),
        cy: BASE,
        r: state === 'review' ? 4.4 : 3.6,
        className: ['visualization-process-step', `visualization-process-step-${state}`],
      }),
    );
  });
  return element(
    'svg',
    {
      viewBox: `0 0 ${round(width)} ${HEIGHT}`,
      className: ['visualization-process'],
      ariaHidden: 'true',
      focusable: 'false',
    },
    children,
  );
}

/** Мини-схема словами: шаги с состояниями и возвраты. */
export function processWords(parsed: ParsedProcess, messages: DiagramMessages): string {
  const words: Record<StepState, string> = {
    done: messages.statuses.done,
    review: messages.statuses.review,
    pending: messages.statuses.pending,
  };
  const steps = parsed.steps
    .map((step, index) => `${step} (${words[stepState(index, parsed.current)]})`)
    .join(' → ');
  const returns = parsed.returns.map((item) => {
    const from = parsed.steps[item.from] ?? '';
    const to = parsed.steps[item.to] ?? '';
    return item.from === item.to
      ? messages.process.repeated(from, item.count)
      : messages.process.returned(from, to, item.count);
  });
  return `${messages.process.steps}: ${steps}${returns.length === 0 ? '' : `; ${returns.join('; ')}`}.`;
}

function enhanceProcess(node: Element, context: BlockEnhancementContext<DiagramMessages>): void {
  const current = takeStringProperty(node, 'dataCurrent');
  const returns = takeStringProperty(node, 'dataReturns');
  const parsed = parseProcess(hastText(node), current, returns);
  if (typeof parsed === 'string') throw new Error(`Validated process failed to parse: ${parsed}`);
  node.properties.className = ['semantic-process'];
  node.children = [
    processSvg(parsed),
    element('span', { className: ['visually-hidden'] }, [
      text(processWords(parsed, context.messages)),
    ]),
  ];
}

function processDefinition(): DirectiveDefinition & { readonly name: 'process' } {
  const attributes = [
    {
      name: 'current',
      description:
        'The step the process stands at, in review; the steps before it are done and the ones after it not started. Without it every step is done.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 1, maxLength: 80 },
      renderProperty: 'dataCurrent',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
    {
      name: 'returns',
      description:
        'Returns drawn as arcs over the steps, separated by commas, each "step>earlier step×N"; a step returning to itself repeats.',
      required: false,
      constraint: { kind: 'string', normalization: 'trim', minLength: 3, maxLength: 400 },
      renderProperty: 'dataReturns',
      invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
    },
  ] as const satisfies DirectiveDefinition['attributes'];
  return {
    name: 'process',
    description:
      'A mini process in a line of text or a card: its steps, separated by ">" in the label, drawn as dots in order with arcs for the returns and their «×N»; the step names and returns are said in words for assistive technology.',
    forms: ['text'],
    attributes,
    children: 'label-or-generated-label',
    placement: {},
    behavior: { renderer: 'semantic-container', resource: 'none', runtime: 'none' },
    sanitizer: {
      tagName: 'span',
      className: 'semantic-process',
      properties: ['dataSemantic', ...attributes.map((attribute) => attribute.renderProperty)],
    },
    security: { authorCode: false, rawHtml: false, localResourceOnly: false },
    handoffs: ['semantic-document'],
  };
}

export const processBlock = defineBlock<undefined, DiagramMessages>({
  definition: processDefinition(),
  validate: validateProcess,
  enhance: enhanceProcess,
  strings: DIAGRAM_MESSAGES,
  styles: 'package',
  staticEquivalent:
    'The same dots and arcs drawn still, with the steps and returns in words beside them.',
  examples: [
    'The change is at :process[Plan > Build > Review > Ship]{current="Review" returns="Review>Build×2"} after two rounds.\n',
  ],
});
