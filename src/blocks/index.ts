import type { DirectiveDefinition } from '../authoring/directive-contract.js';
import { action, actions } from './actions.js';
import { appear } from './appear.js';
import { asset } from './asset.js';
import { callout } from './callout.js';
import { card, cards } from './cards.js';
import { chart, point, series } from './chart.js';
import { compare } from './compare.js';
import { contents } from './contents.js';
import { copyable } from './copyable.js';
import { count } from './count.js';
import { dataEach, dataExpectation } from './data.js';
import { deck, slide } from './deck.js';
import { checkItem, checklist, decision, decisionOption } from './decision.js';
import type { Block } from './define-block.js';
import { demo } from './demo.js';
import { diagram, edge, group, legend, legendItem, node } from './diagram.js';
import { diff } from './diff.js';
import { disclosure } from './disclosure.js';
import { filter } from './filter.js';
import { finding, findings } from './findings.js';
import { font } from './font.js';
import { glossary, term } from './glossary.js';
import { conversation, message } from './message.js';
import { modal } from './modal.js';
import { plural, time } from './number-and-time.js';
import { popover } from './popover.js';
import { processBlock } from './process.js';
import { bucket, item, option, question, response } from './response.js';
import { beat, lead, notes, section } from './section.js';
import { sourceLink } from './source-link.js';
import { sourceLine } from './source-line.js';
import { spotlight } from './spotlight.js';
import { steps } from './steps.js';
import { table } from './table.js';
import { tab, tabs } from './tabs.js';
import { eyebrow, meta, muted } from './text-roles.js';
import { event, timeline } from './timeline.js';
import { toggle } from './toggle.js';
import { mark, swap, typing } from './typography.js';
import { video } from './video.js';
import { zoom } from './zoom.js';

/**
 * The built-in blocks in registry order. The order is part of the published contract: the
 * directive list of the source contract, the directive schema and the catalogue follow it.
 */
export const BUILT_IN_BLOCKS: readonly [Block, ...Block[]] = [
  // Its page pass must run before the section passes: it moves an eyebrow above the section title.
  eyebrow,
  section,
  contents,
  lead,
  muted,
  meta,
  actions,
  action,
  sourceLink,
  callout,
  sourceLine,
  beat,
  count,
  plural,
  time,
  swap,
  typing,
  mark,
  processBlock,
  appear,
  notes,
  deck,
  slide,
  decision,
  decisionOption,
  checklist,
  checkItem,
  cards,
  card,
  steps,
  diff,
  findings,
  finding,
  conversation,
  message,
  response,
  question,
  bucket,
  option,
  item,
  copyable,
  table,
  glossary,
  term,
  disclosure,
  tabs,
  tab,
  modal,
  popover,
  filter,
  toggle,
  compare,
  spotlight,
  chart,
  series,
  point,
  diagram,
  group,
  node,
  edge,
  legend,
  legendItem,
  zoom,
  timeline,
  event,
  demo,
  asset,
  video,
  font,
  dataEach,
  dataExpectation,
];

/** The registry's directive list, assembled from the blocks. */
export const BLOCK_DIRECTIVES: readonly [DirectiveDefinition, ...DirectiveDefinition[]] = [
  BUILT_IN_BLOCKS[0].definition,
  ...BUILT_IN_BLOCKS.slice(1).map((block) => block.definition),
];

export const blockByName: ReadonlyMap<string, Block> = new Map(
  BUILT_IN_BLOCKS.map((block) => [block.name, block]),
);
