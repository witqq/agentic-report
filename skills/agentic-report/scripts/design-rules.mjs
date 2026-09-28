// Design advice from the structure of a built page. Pure functions: no file system, no process.
// The input is the `structure` field of `agentic-report inspect`, which carries section properties and
// counts only, never the author's words. Each rule names its identifier in references/design-rules.md,
// and the comment above it names the defect it catches; tests/unit/design-check.test.ts proves each rule
// fires on its counterexample.

export const CHECKED_RULES = [
  'DR-OPENING-MEDIA',
  'DR-LANDING-ORDER',
  'DR-SURFACES',
  'DR-UNIFORM-ENTRANCE',
  'DR-ONE-EFFECT',
  'DR-CARD-SAMENESS',
  'DR-BRIEF',
  'DR-BRIEF-MATCH',
];

const MAXIMUM_SURFACES = 2;
const MINIMUM_SECTIONS_FOR_ENTRANCE = 3;
const MAXIMUM_EFFECTS = 1;
const LONG_CARD_SERIES = 8;
/** A brief motion answer that decides no motion at all: «None.», «none», «нет», «без движения». */
const NO_MOTION_ANSWER = /^(?:none|no motion|нет|без движения)\s*[.!]?$/iu;

function mediaTotal(media) {
  return (
    media.images +
    media.videos +
    media.diagrams +
    media.charts +
    (media.timelines ?? 0) +
    media.code
  );
}

function topSections(structure) {
  return structure.sections.filter((section) => section.depth === 0);
}

const RULES = {
  // Catches a landing whose first screen is only words: nothing of the product before the first chapter.
  'DR-OPENING-MEDIA': ({ structure }) => {
    if (structure.layout !== 'landing') return undefined;
    if (mediaTotal(structure.beforeFirstSection) > 0) return undefined;
    const first = topSections(structure)[0];
    const firstShows =
      first !== undefined &&
      (first.recipe === 'demo' || first.place === 'opening') &&
      mediaTotal(first.media) > 0;
    if (firstShows) return undefined;
    return {
      message:
        'The landing shows no image, video, diagram, chart, timeline, or code before its first section, and its first section is not a demo with one.',
      fix: 'Add recipe="demo" to the first section and put the product in it, or place a picture, clip, diagram, or code block right after the introduction.',
    };
  },
  // Catches a landing that kept the starter's skeleton instead of ordering chapters by its own argument.
  'DR-LANDING-ORDER': ({ structure, starterRecipes, isStarter }) => {
    if (structure.layout !== 'landing' || isStarter || starterRecipes === undefined)
      return undefined;
    const recipes = topSections(structure).map((section) => section.recipe ?? 'none');
    const same =
      recipes.length === starterRecipes.length &&
      recipes.every((recipe, index) => recipe === starterRecipes[index]);
    if (!same) return undefined;
    return {
      message: `The chapters use the landing starter's recipes in the starter's order: ${recipes.join(', ')}.`,
      fix: 'Order the chapters by the argument in the brief and use the recipes that argument needs.',
    };
  },
  // Catches a page where decorative surfaces are the norm, so none of them marks a change of mood.
  'DR-SURFACES': ({ structure }) => {
    const decorated = structure.sections.filter(
      (section) => section.surface !== 'plain' && section.surface !== 'none',
    );
    if (decorated.length <= MAXIMUM_SURFACES) return undefined;
    return {
      message: `${decorated.length} sections have a decorative surface; at most ${MAXIMUM_SURFACES} stay different.`,
      fix: 'Keep a surface on the one or two chapters that change the mood and set the rest to surface="plain".',
    };
  },
  // Catches the template tell of every chapter entering the same way.
  'DR-UNIFORM-ENTRANCE': ({ structure }) => {
    const sections = topSections(structure);
    if (sections.length < MINIMUM_SECTIONS_FOR_ENTRANCE) return undefined;
    const transitions = new Set(sections.map((section) => section.transition));
    const [only] = transitions;
    if (transitions.size !== 1 || only === 'none') return undefined;
    return {
      message: `Every one of the ${sections.length} chapters enters with transition="${only}".`,
      fix: 'Let most chapters simply be there (transition="none") and keep an entrance for the one or two where the story turns.',
    };
  },
  // Catches effects competing for attention: more than one pointer, WebGL or magnetic effect on a page.
  'DR-ONE-EFFECT': ({ structure }) => {
    const pointer = structure.sections.filter((section) => section.interaction !== 'none').length;
    const webgl = structure.sections.filter((section) => section.mediaEffect !== 'none').length;
    const effects = pointer + webgl + structure.magneticActions;
    if (effects <= MAXIMUM_EFFECTS) return undefined;
    return {
      message: `The page has ${effects} pointer or WebGL effects (${pointer} section interactions, ${webgl} WebGL media, ${structure.magneticActions} magnetic actions).`,
      fix: 'Keep the one effect that carries meaning, usually on the opening, and remove the rest.',
    };
  },
  // Catches a wall of repeats: a long run of cards that all share one form, so nothing but the words tells
  // them apart and the reader stops reading. A group of links (every card an href) is an index, not a wall.
  // Three plain cards stay a judgement: a form alone cannot tell interchangeable cards from distinct ones.
  // Reads forms and counts, never words.
  'DR-CARD-SAMENESS': ({ structure }) => {
    for (const group of structure.cardGroups ?? []) {
      if (group.cards < LONG_CARD_SERIES || group.shapes !== 1 || group.linked === group.cards)
        continue;
      return {
        message: `A group of ${group.cards} cards repeats one card form ${group.cards} times without grouping.`,
        fix: 'Split the series into titled groups, a table, or a list, and keep cards for the few items that carry their own fact — a status, a number, a picture.',
      };
    }
    return undefined;
  },
  // Catches a page that moves although its brief decided it would not: the brief answers motion «none»
  // and a section still enters, reacts to the pointer, runs a scene, a choreography or a WebGL effect, or
  // an action is magnetic, while the manifest has not stopped the page with motion: none.
  'DR-BRIEF-MATCH': ({ structure, brief }) => {
    if (!brief.present || structure.motion === 'none') return undefined;
    const answer = dimensionAnswer(brief.text ?? '', 'motion') ?? '';
    if (!NO_MOTION_ANSWER.test(answer)) return undefined;
    const moving = structure.sections.filter(
      (section) =>
        section.transition !== 'none' ||
        section.interaction !== 'none' ||
        section.scene !== 'none' ||
        section.choreography !== 'none' ||
        section.mediaEffect !== 'none',
    ).length;
    // Counts, played scenes, drawn diagrams and swapped or typed words move too, outside the sections' roles.
    const elements = structure.movingElements ?? 0;
    if (moving === 0 && structure.magneticActions === 0 && elements === 0) return undefined;
    return {
      message: `brief.md decides no motion, but ${moving} sections move, ${structure.magneticActions} actions are magnetic and ${elements} other elements move (counts, count-up charts, drawn, pulsing or zooming diagrams, played scenes, swapped, typed or marked words, spotlights, soft video seams).`,
      fix: "Write motion: none in the page manifest and drop the motion attributes, or change the brief's motion answer with its reason.",
    };
  },
  // Catches a page built without a filled brief. A brief with no dimension rows is not filled: an empty
  // table must not pass as «no row is missing an answer».
  'DR-BRIEF': ({ brief }) => {
    if (!brief.present) {
      return {
        message: 'There is no brief.md beside the page source.',
        fix: "Copy brief.md from the starter of the page's category and fill every row with its answer and source.",
      };
    }
    if (dimensionIds(brief.text ?? '').length === 0) {
      return {
        message: 'brief.md has no dimension rows to answer.',
        fix: "Copy brief.md from the starter of the page's category and fill every row with its answer and source.",
      };
    }
    const empty = unfilledDimensions(brief.text ?? '');
    if (empty.length === 0) return undefined;
    return {
      message: `brief.md leaves dimensions without an answer or a source: ${empty.join(', ')}.`,
      fix: "Copy brief.md from the starter of the page's category and fill every row with its answer and source.",
    };
  },
};

const BRIEF_SOURCES = ['request', 'asked', 'inferred'];

function dimensionIds(briefText) {
  return [...briefText.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gmu)].map((match) => match[1]);
}

/** The answer cell of one dimension row of the brief table, or undefined when the row is absent. */
function dimensionAnswer(briefText, id) {
  for (const line of briefText.split(/\r?\n/u)) {
    const cells = line.split(/(?<!\\)\|/u).map((cell) => cell.trim());
    if (cells[1] === `\`${id}\`` && cells.length >= 6) return cells[3];
  }
  return undefined;
}

/** Dimension rows of the brief table (`| \`id\` | question | answer | source |`) left without an answer or a source. */
export function unfilledDimensions(briefText) {
  const empty = [];
  for (const line of briefText.split(/\r?\n/u)) {
    // An escaped `\\|` inside a cell is text, not a column boundary.
    const cells = line.split(/(?<!\\)\|/u).map((cell) => cell.trim());
    const id = /^`([a-z][a-z0-9-]*)`$/u.exec(cells[1] ?? '')?.[1];
    if (id === undefined || cells.length < 6) continue;
    const answer = cells[3] ?? '';
    const source = (cells[4] ?? '').replace(/`/gu, '').toLowerCase();
    if (answer.length === 0 || !BRIEF_SOURCES.some((known) => source.startsWith(known)))
      empty.push(id);
  }
  return empty;
}

/**
 * Reads the «Checks switched off» section of a brief. A line switches a rule off only when it names a
 * known rule and gives a reason: `- DR-SURFACES: the catalog shows every surface on purpose.`
 */
export function parseSwitchedOff(briefText) {
  const switchedOff = [];
  const rejected = [];
  if (typeof briefText !== 'string') return { switchedOff, rejected };
  const lines = briefText.split(/\r?\n/u);
  let inside = false;
  for (const line of lines) {
    if (/^#{1,6}\s/u.test(line)) {
      inside = /^#{1,6}\s+Checks switched off\s*$/iu.test(line);
      continue;
    }
    if (!inside) continue;
    const match = /^\s*[-*]\s+`?(DR-[A-Z0-9-]+)`?\s*(?:[:—–-]\s*(.*))?$/u.exec(line);
    if (match === null) continue;
    const rule = match[1];
    const reason = (match[2] ?? '').trim();
    if (!CHECKED_RULES.includes(rule)) rejected.push({ rule, problem: 'not a checked rule' });
    else if (reason.length === 0) rejected.push({ rule, problem: 'no reason given' });
    else switchedOff.push({ rule, reason });
  }
  return { switchedOff, rejected };
}

/**
 * @param {{ structure: object, starterRecipes?: string[], isStarter?: boolean,
 *           brief: { present: boolean, text?: string } }} input
 */
export function checkDesign(input) {
  const { switchedOff, rejected } = parseSwitchedOff(input.brief.text);
  const off = new Set(switchedOff.map((entry) => entry.rule));
  const advice = [];
  for (const rule of CHECKED_RULES) {
    const finding = RULES[rule](input);
    if (finding === undefined || off.has(rule)) continue;
    advice.push({ rule, reference: 'references/design-rules.md', ...finding });
  }
  return { advice, switchedOff, rejectedSwitches: rejected };
}
