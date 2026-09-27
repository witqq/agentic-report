/**
 * Где родился узел, которого автор не писал: разметка, развёрнутая из шаблона блока-расширения или
 * полученная от поставщика. Такой узел стоит в позиции директивы автора (диагностика указывает туда,
 * где автор может что-то исправить), а эта таблица добавляет к диагностике имя расширения и строку
 * шаблона или вывода поставщика, на которой родилась ошибка.
 */

export interface ExpansionOrigin {
  readonly extension: string;
  /** Шаблон относительно корня источника; у поставщика его нет. */
  readonly template?: string;
  /** Строка шаблона или вывода поставщика, 1 — первая. */
  readonly line: number;
  readonly producer: 'template' | 'provider';
}

const origins = new WeakMap<object, ExpansionOrigin>();

export function recordExpansionOrigin(node: object, origin: ExpansionOrigin): void {
  origins.set(node, origin);
}

/** Поля `details` диагностики для узла из развёртки; для узла автора — ничего. */
export function expansionDetails(node: object): Readonly<Record<string, unknown>> | undefined {
  const origin = origins.get(node);
  if (origin === undefined) return undefined;
  return origin.producer === 'template'
    ? {
        extension: origin.extension,
        ...(origin.template === undefined ? {} : { template: origin.template }),
        templateLine: origin.line,
      }
    : { extension: origin.extension, providerOutputLine: origin.line };
}
