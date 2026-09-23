import type { PackageStrings } from '../localization.js';

/** Узел схемы так, как его называет описание. */
export interface DescribedNode {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  /** Смысл выделения узла из легенды, если автор его назвал. */
  readonly meaning?: string;
  readonly group?: string;
  readonly layer?: number;
}

export interface DescribedEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  /** Слова легенды для вида связи; нет — вид не различается и не называется. */
  readonly kind?: string;
  /** Связь идёт против потока: раскладка развернула её, чтобы разложить слои. */
  readonly backward?: boolean;
}

export interface DescriptionSection {
  readonly heading: string;
  readonly items: readonly string[];
  readonly ordered: boolean;
}

/**
 * Описание схемы словами: вводная фраза и разделы. Из него собираются и `<desc>` картинки, и
 * раскрываемый текст под схемой, поэтому оба говорят одно и то же.
 */
export interface DiagramDescription {
  readonly lead: string;
  readonly sections: readonly DescriptionSection[];
}

/** Имя узла в описании: подпись, а при совпадении подписей — ещё и идентификатор. */
function namer(nodes: readonly DescribedNode[]): (id: string) => string {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.label, (counts.get(node.label) ?? 0) + 1);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return (id) => {
    const node = byId.get(id);
    if (node === undefined) return id;
    return (counts.get(node.label) ?? 0) > 1 ? `${node.label} (${node.id})` : node.label;
  };
}

function nodeText(node: DescribedNode, name: (id: string) => string): string {
  const meaning = node.meaning === undefined ? '' : ` [${node.meaning}]`;
  const detail = node.detail === undefined ? '' : ` — ${node.detail}`;
  return `${name(node.id)}${detail}${meaning}`;
}

function edgeText(edge: DescribedEdge, name: (id: string) => string): string {
  const label = edge.label === undefined ? '' : `: ${edge.label}`;
  const kind = edge.kind === undefined ? '' : ` (${edge.kind})`;
  return `${name(edge.from)} → ${name(edge.to)}${label}${kind}`;
}

/** Флоу словами: группы с составом, слои по порядку потока, прямые связи и обратные отдельно. */
export function describeFlow(
  nodes: readonly DescribedNode[],
  groups: readonly { readonly id: string; readonly label: string }[],
  edges: readonly DescribedEdge[],
  strings: PackageStrings,
): DiagramDescription {
  const name = namer(nodes);
  const layerCount = Math.max(0, ...nodes.map((node) => (node.layer ?? 0) + 1));
  const sections: DescriptionSection[] = [];
  if (groups.length > 0) {
    sections.push({
      heading: strings.diagramText.groups,
      ordered: false,
      items: groups.map((group) =>
        strings.diagramText.group(
          group.label,
          nodes.filter((node) => node.group === group.id).map((node) => name(node.id)),
        ),
      ),
    });
  }
  sections.push({
    heading: strings.diagramText.layers,
    ordered: true,
    items: Array.from({ length: layerCount }, (_, layer) =>
      nodes
        .filter((node) => (node.layer ?? 0) === layer)
        .map((node) => nodeText(node, name))
        .join('; '),
    ),
  });
  const forward = edges.filter((edge) => edge.backward !== true);
  const backward = edges.filter((edge) => edge.backward === true);
  sections.push({
    heading: strings.diagramText.forward,
    ordered: false,
    items: forward.length === 0 ? [strings.none] : forward.map((edge) => edgeText(edge, name)),
  });
  if (backward.length > 0) {
    sections.push({
      heading: strings.diagramText.backward,
      ordered: false,
      items: backward.map((edge) => edgeText(edge, name)),
    });
  }
  return { lead: strings.diagramText.flowLead(nodes.length, layerCount), sections };
}

/** Последовательность словами: участники слева направо и сообщения по порядку. */
export function describeSequence(
  participants: readonly DescribedNode[],
  messages: readonly DescribedEdge[],
  strings: PackageStrings,
): DiagramDescription {
  const name = namer(participants);
  return {
    lead: strings.diagramText.sequenceLead(participants.length, messages.length),
    sections: [
      {
        heading: strings.diagramText.participants,
        ordered: false,
        items: participants.map((participant) => nodeText(participant, name)),
      },
      {
        heading: strings.messagesInOrder,
        ordered: true,
        items: messages.map((message) =>
          message.from === message.to
            ? `${name(message.from)}, ${strings.diagramText.insideItself}${message.label === undefined ? '' : `: ${message.label}`}${message.kind === undefined ? '' : ` (${message.kind})`}`
            : edgeText(message, name),
        ),
      },
    ],
  };
}

/**
 * Одна строка для `<desc>`: разделы подряд. Пункты списка идут через точку с запятой, нумерованные —
 * через точку: внутри слоя узлы уже разделены точкой с запятой.
 */
export function descriptionSentence(authored: string, description: DiagramDescription): string {
  const sections = description.sections.map((section) =>
    section.ordered
      ? `${section.heading}: ${section.items.map((item, index) => `${index + 1}. ${item}`).join('. ')}.`
      : `${section.heading}: ${section.items.join('; ')}.`,
  );
  return [authored, description.lead, ...sections].join(' ');
}
