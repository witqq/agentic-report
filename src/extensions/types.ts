/**
 * Договор расширений страницы: то, что загрузчик манифестов (`src/extensions/load.ts`) отдаёт сборке,
 * и то, что сборка отдаёт упаковщику эффектов (`src/extensions/effect-bundle.ts`). Уровни и поля описаны
 * в docs/ARCHITECTURE.md, раздел «Extensions».
 */

export const EXTENSION_KINDS = ['block', 'provider', 'effect', 'island'] as const;
export type ExtensionKind = (typeof EXTENSION_KINDS)[number];

export type ExtensionAttributeType =
  | { readonly type: 'string'; readonly maxLength?: number }
  | { readonly type: 'number'; readonly minimum?: number; readonly maximum?: number }
  | { readonly type: 'boolean' }
  | { readonly type: 'enum'; readonly values: readonly [string, ...string[]] };

export type ExtensionAttribute = ExtensionAttributeType & {
  readonly description?: string;
  readonly required?: boolean;
  readonly default?: string | number | boolean;
};

interface ExtensionBase {
  readonly kind: ExtensionKind;
  readonly name: string;
  readonly description: string;
  readonly staticEquivalent: string;
  /** Абсолютный путь манифеста, для диагностик и относительных путей. */
  readonly manifestPath: string;
  /** Абсолютные пути страниц-примеров; их не меньше двух. */
  readonly examples: readonly string[];
  readonly licenses: readonly string[];
}

export interface BlockExtension extends ExtensionBase {
  readonly kind: 'block';
  readonly forms: readonly ('leaf' | 'container')[];
  readonly attributes: Readonly<Record<string, ExtensionAttribute>>;
  /** Абсолютный путь Markdown-шаблона. */
  readonly template: string;
  /** Текст шаблона, прочитанный и проверенный загрузчиком. */
  readonly templateText: string;
  /**
   * Стили блока (`styles` в манифесте): абсолютный путь файла и CSS, проверенный на литералы и уже
   * вложенный в селектор `[data-extension-block="<имя>"]`. Едут только на страницу, где блок использован.
   */
  readonly styles?: { readonly file: string; readonly css: string };
}

export interface ProviderExtension extends ExtensionBase {
  readonly kind: 'provider';
  readonly forms: readonly ('leaf' | 'container')[];
  readonly attributes: Readonly<Record<string, ExtensionAttribute>>;
  readonly command: readonly [string, ...string[]];
  readonly timeoutMs: number;
}

export interface EffectTarget {
  readonly directive: string;
  readonly attribute: string;
  readonly values: readonly [string, ...string[]];
}

export interface EffectExtension extends ExtensionBase {
  readonly kind: 'effect';
  /** Абсолютный путь ES-модуля эффекта. */
  readonly module: string;
  readonly targets: readonly EffectTarget[];
  readonly attributes: Readonly<Record<string, ExtensionAttribute>>;
  readonly budgetBytes: number;
  /** Эффект ведёт прокрутку; таких на странице не больше одного. */
  readonly ownsScroll: boolean;
}

export interface IslandExtension extends ExtensionBase {
  readonly kind: 'island';
  /** Абсолютный путь HTML-входа острова. */
  readonly entry: string;
  readonly assets: readonly string[];
}

export type PageExtension = BlockExtension | ProviderExtension | EffectExtension | IslandExtension;

/** Результат упаковки эффекта: один скрипт без внешних импортов. */
export interface BundledEffect {
  readonly name: string;
  readonly code: string;
  readonly bytes: number;
}

/** Отчёт сборки о расширениях страницы — часть результата `build`. */
export interface ExtensionBuildReport {
  readonly name: string;
  readonly kind: ExtensionKind;
  readonly uses: number;
  readonly bytes?: number;
  readonly notes: readonly string[];
}
