import type { DirectiveAttributeDefinition } from '../authoring/directive-contract.js';

/**
 * Состояния страницы (W-STATES): именованные флаги корня `data-state-<имя>`, которые ставит продвижение
 * читателя — секция с `state` достигнута, такт сцены с `state` стал текущим, — перемотка часов страницы
 * или эффект расширения (`ctx.state.set(имя, значение, document.documentElement)`). Блоки с `when`
 * загораются, пока их состояние стоит. Имя — то же, что принимает движок эффектов.
 */
export const PAGE_STATE_PATTERN = '^[a-z][a-z0-9-]{0,40}$';

function pageStateConstraint() {
  return {
    kind: 'string',
    normalization: 'trim',
    minLength: 1,
    maxLength: 41,
    pattern: PAGE_STATE_PATTERN,
  } as const;
}

/** `state` у секции или такта: какое состояние страницы ставит их достижение. */
export function stateAttribute(description: string): DirectiveAttributeDefinition {
  return {
    name: 'state',
    description,
    required: false,
    constraint: pageStateConstraint(),
    renderProperty: 'dataState',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}

/** `when` у блока-потребителя: какое состояние страницы его зажигает. */
export function whenAttribute(description: string): DirectiveAttributeDefinition {
  return {
    name: 'when',
    description,
    required: false,
    constraint: pageStateConstraint(),
    renderProperty: 'dataWhen',
    invalidDiagnostic: 'INVALID_DIRECTIVE_ATTRIBUTE',
  };
}
