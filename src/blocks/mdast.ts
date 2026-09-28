import type { Code } from 'mdast';

/** Where an authored node starts and ends in the assembled Markdown. */
export interface SourcePosition {
  readonly start: {
    readonly line: number;
    readonly column: number;
    readonly offset?: number | undefined;
  };
  readonly end: {
    readonly line: number;
    readonly column: number;
    readonly offset?: number | undefined;
  };
}

/** Any authored node a diagnostic can point at. */
export interface LocatedNode {
  readonly position?: SourcePosition | undefined;
}

/** A `remark-directive` node: container, leaf, or text directive. */
export interface DirectiveNode extends LocatedNode {
  readonly type: string;
  readonly name: string;
  readonly attributes?: Readonly<Record<string, string | null>>;
  readonly children?: readonly unknown[];
  data?: {
    hName?: string;
    hProperties?: Readonly<Record<string, string | string[]>>;
  };
}

/** The part of an mdast node that a structural walk reads. */
export interface TraversableNode extends LocatedNode {
  readonly type?: string;
  readonly name?: string;
  readonly value?: string;
  readonly children?: readonly TraversableNode[];
}

export function isDirectiveNode(node: unknown): node is DirectiveNode {
  if (typeof node !== 'object' || node === null || !('type' in node) || !('name' in node)) {
    return false;
  }
  const candidate = node as { readonly type?: unknown; readonly name?: unknown };
  return (
    typeof candidate.type === 'string' &&
    candidate.type.endsWith('Directive') &&
    typeof candidate.name === 'string'
  );
}

export function isCodeNode(node: unknown): node is Code {
  return typeof node === 'object' && node !== null && 'type' in node && node.type === 'code';
}

export function isTraversableNode(value: unknown): value is TraversableNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}
