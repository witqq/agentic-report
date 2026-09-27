/**
 * Загрузчик манифестов расширений страницы. Поле `extensions` страницы перечисляет относительные пути к
 * манифестам (`.yaml`, `.yml`, `.json`); каждый путь ограничен корнем источника так же, как части и
 * ресурсы, а пути внутри манифеста (шаблон, модуль, вход острова, ресурсы, примеры, лицензии) — каталогом
 * самого манифеста. Манифест проверяется строго: неизвестное поле, пропуск обязательного, неверный тип,
 * совпадение имени со встроенной директивой или другим расширением — отказ `EXTENSION_*` с файлом и
 * диапазоном поля. Формат описан в docs/product/source-contract.md, раздел «Extensions».
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { isNode, parseDocument } from 'yaml';
import { z } from 'zod';

import { authoringRegistry } from '../authoring/registry.js';
import {
  blockStyleViolations,
  MAX_BLOCK_STYLE_BYTES,
  scopeBlockStyles,
} from '../authoring/style-rules.js';
import type { Diagnostic, SourceLocation } from '../contracts.js';
import { AgenticReportError } from '../diagnostics.js';
import { resolveLocalPath } from '../source/load-source.js';
import { sourceLocationFromOffsets } from '../source/source-map.js';
import { compileTemplate } from './template.js';
import type {
  BlockExtension,
  EffectExtension,
  EffectTarget,
  ExtensionAttribute,
  IslandExtension,
  PageExtension,
  ProviderExtension,
} from './types.js';

/** Имя директивы острова: оно встроено в словарь страницы, у которой есть острова. */
export const ISLAND_DIRECTIVE = 'island';

const MANIFEST_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);
const NAME_PATTERN = /^[a-z][a-z0-9-]{1,40}$/u;
const ATTRIBUTE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const ENUM_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const PROTOTYPE_LIKE = new Set(['__proto__', 'prototype', 'constructor']);
export const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
export const MAX_PROVIDER_TIMEOUT_MS = 120_000;
export const DEFAULT_EFFECT_BUDGET_BYTES = 80_000;
/** Примеров, без которых расширение не проверить `effect-check`: два непохожих. */
export const REQUIRED_EXAMPLES = 2;

const relativePath = z.string().trim().min(1).max(512);
const pathList = z.array(relativePath).max(64);
const attributeName = z
  .string()
  .regex(ATTRIBUTE_NAME_PATTERN, 'Attribute names are lowercase: ^[a-z][a-z0-9-]{0,31}$.')
  .refine((name) => !PROTOTYPE_LIKE.has(name), 'This attribute name is reserved.');
const attributeCommon = {
  description: z.string().trim().min(1).max(300).optional(),
  required: z.boolean().optional(),
};
const attributeSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('string'),
      maxLength: z.number().int().min(1).max(10_000).optional(),
      default: z.string().optional(),
      ...attributeCommon,
    }),
    z.strictObject({
      type: z.literal('number'),
      minimum: z.number().finite().optional(),
      maximum: z.number().finite().optional(),
      default: z.number().finite().optional(),
      ...attributeCommon,
    }),
    z.strictObject({
      type: z.literal('boolean'),
      default: z.boolean().optional(),
      ...attributeCommon,
    }),
    z.strictObject({
      type: z.literal('enum'),
      values: z
        .array(z.string().regex(ENUM_VALUE_PATTERN, 'Enum values are short tokens.'))
        .min(1)
        .max(64),
      default: z.string().optional(),
      ...attributeCommon,
    }),
  ])
  .superRefine((attribute, context) => {
    if (attribute.required === true && attribute.default !== undefined)
      context.addIssue({
        code: 'custom',
        message: 'A required attribute cannot have a default.',
        path: ['default'],
      });
    if (
      attribute.type === 'enum' &&
      attribute.default !== undefined &&
      !attribute.values.includes(attribute.default)
    )
      context.addIssue({
        code: 'custom',
        message: 'The default must be one of the values.',
        path: ['default'],
      });
    if (
      attribute.type === 'number' &&
      attribute.minimum !== undefined &&
      attribute.maximum !== undefined &&
      attribute.maximum < attribute.minimum
    )
      context.addIssue({
        code: 'custom',
        message: 'maximum is below minimum.',
        path: ['maximum'],
      });
  });
const attributes = z.record(attributeName, attributeSchema).default({});
const forms = z
  .array(z.enum(['leaf', 'container']))
  .min(1)
  .refine((values) => new Set(values).size === values.length, 'Forms must be unique.');
const common = {
  name: z.string().regex(NAME_PATTERN, 'Extension names are lowercase: ^[a-z][a-z0-9-]{1,40}$.'),
  description: z.string().trim().min(1).max(300),
  staticEquivalent: z.string().trim().min(1).max(500),
  examples: pathList.default([]),
  licenses: pathList.default([]),
};

const manifestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('block'),
    ...common,
    forms,
    attributes,
    template: relativePath,
    styles: relativePath.optional(),
  }),
  z.strictObject({
    kind: z.literal('provider'),
    ...common,
    forms,
    attributes,
    command: z.array(z.string().min(1).max(4096)).min(1).max(64),
    timeoutMs: z
      .number()
      .int()
      .min(100)
      .max(MAX_PROVIDER_TIMEOUT_MS)
      .default(DEFAULT_PROVIDER_TIMEOUT_MS),
  }),
  z.strictObject({
    kind: z.literal('effect'),
    ...common,
    module: relativePath,
    targets: z
      .array(
        z.strictObject({
          directive: z.string().min(1),
          attribute: attributeName,
          values: z
            .array(z.string().regex(ENUM_VALUE_PATTERN, 'Target values are short tokens.'))
            .min(1)
            .max(64),
        }),
      )
      .min(1)
      .max(16),
    attributes,
    budgetBytes: z.number().int().min(1).max(2_000_000).default(DEFAULT_EFFECT_BUDGET_BYTES),
    ownsScroll: z.boolean().default(false),
  }),
  z.strictObject({
    kind: z.literal('island'),
    ...common,
    entry: relativePath,
    assets: pathList.default([]),
  }),
]);

/** Где страница объявила расширения: для ошибок, которые относятся к самому пути в списке. */
export interface ExtensionDeclaration {
  readonly location: SourceLocation;
}

export interface LoadedExtensions {
  readonly extensions: readonly PageExtension[];
  /** Файлы расширений: манифесты, шаблоны, модули, входы и ресурсы островов. */
  readonly files: readonly string[];
  readonly warnings: readonly Diagnostic[];
}

/**
 * Загружает все объявленные расширения. Отказы разных манифестов независимы: сборка сообщает обо всех
 * сразу, первым — самый ранний, остальные — в `related`.
 */
export async function loadExtensions(
  references: readonly string[],
  sourceRoot: string,
  declaration: ExtensionDeclaration,
): Promise<LoadedExtensions> {
  const extensions: PageExtension[] = [];
  const files: string[] = [];
  const warnings: Diagnostic[] = [];
  const failures: AgenticReportError[] = [];
  for (const reference of references) {
    try {
      const loaded = await loadExtension(reference, sourceRoot, declaration);
      extensions.push(loaded.extension);
      files.push(...loaded.files);
      if (loaded.extension.examples.length < REQUIRED_EXAMPLES)
        warnings.push({
          level: 'warning',
          code: 'EXTENSION_EXAMPLES_MISSING',
          message: `Extension ${loaded.extension.name} declares ${loaded.extension.examples.length} example page(s); ${REQUIRED_EXAMPLES} unlike examples are needed before it can be checked.`,
          remediation:
            'Add two example pages that use the extension differently to its examples list; the page builds either way.',
          source: { file: loaded.extension.manifestPath },
          details: { extension: loaded.extension.name },
        });
    } catch (error) {
      if (!(error instanceof AgenticReportError)) throw error;
      failures.push(error);
    }
  }
  const clashes = nameClashes(extensions);
  failures.push(...clashes);
  failures.push(...targetClashes(extensions));
  if (failures.length > 0) throw aggregate(failures);
  return { extensions, files: [...new Set(files)], warnings };
}

async function loadExtension(
  reference: string,
  sourceRoot: string,
  declaration: ExtensionDeclaration,
): Promise<{ readonly extension: PageExtension; readonly files: readonly string[] }> {
  let manifestPath: string;
  try {
    manifestPath = await resolveLocalPath(sourceRoot, reference, 'EXTENSION_OUTSIDE_SOURCE');
  } catch (error) {
    throw declared(error, declaration, reference);
  }
  if (!MANIFEST_EXTENSIONS.has(path.extname(manifestPath).toLowerCase()))
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_UNSUPPORTED_TYPE',
      message: `An extension manifest must be a .yaml, .yml or .json file: ${reference}`,
      remediation: 'Point the extensions entry at the extension manifest file.',
      source: declaration.location,
      details: { reference },
    });
  let text: string;
  try {
    text = await readFile(manifestPath, 'utf8');
  } catch (error) {
    throw new AgenticReportError(
      {
        level: 'error',
        code: 'EXTENSION_READ_FAILED',
        message: `Could not read extension manifest: ${reference}`,
        remediation: 'Fix the path in extensions or add the manifest under the source directory.',
        source: declaration.location,
        details: { reference, target: manifestPath },
      },
      { cause: error },
    );
  }
  const document = parseDocument(text, { prettyErrors: false });
  const syntax = document.errors[0];
  if (syntax !== undefined || (manifestPath.endsWith('.json') && !isJson(text)))
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_PARSE_FAILED',
      message: `Extension manifest is not valid ${manifestPath.endsWith('.json') ? 'JSON' : 'YAML'}: ${reference}`,
      remediation: 'Fix the manifest syntax.',
      source:
        syntax === undefined
          ? { file: manifestPath }
          : sourceLocationFromOffsets(manifestPath, text, syntax.pos[0], syntax.pos[1]),
    });
  const parsed = manifestSchema.safeParse(document.toJS());
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const [first] = issues;
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_INVALID',
      message: `Extension manifest ${reference} is invalid: ${issueText(first)}`,
      remediation:
        'Follow the extension manifest format in docs/product/source-contract.md (section Extensions).',
      source: fieldLocation(manifestPath, text, document, [
        ...(first?.path ?? []),
        ...(first?.code === 'unrecognized_keys' && first.keys[0] !== undefined
          ? [first.keys[0]]
          : []),
      ]),
      details: {
        issues: issues.map((issue) => ({ path: issue.path.map(String), message: issue.message })),
      },
    });
  }
  const manifest = parsed.data;
  const directory = path.dirname(manifestPath);
  const locate = (fieldPath: readonly (string | number)[]): SourceLocation =>
    fieldLocation(manifestPath, text, document, fieldPath);
  const resolveFile = async (
    value: string,
    fieldPath: readonly (string | number)[],
  ): Promise<string> => {
    let resolved: string;
    try {
      resolved = await resolveLocalPath(directory, value, 'EXTENSION_PATH_OUTSIDE');
    } catch (error) {
      if (!(error instanceof AgenticReportError)) throw error;
      throw new AgenticReportError(
        {
          ...error.diagnostic,
          message: `${error.diagnostic.message} (paths in an extension manifest stay inside its directory)`,
          source: locate(fieldPath),
        },
        { cause: error },
      );
    }
    const info = await stat(resolved).catch(() => undefined);
    if (info?.isFile() !== true)
      throw new AgenticReportError({
        level: 'error',
        code: 'EXTENSION_FILE_MISSING',
        message: `Extension ${manifest.name} names a file that does not exist: ${value}`,
        remediation: 'Add the file next to the extension manifest or fix the path.',
        source: locate(fieldPath),
        details: { target: resolved },
      });
    return resolved;
  };
  const resolveList = (values: readonly string[], field: string): Promise<string[]> =>
    Promise.all(values.map((value, index) => resolveFile(value, [field, index])));

  const base = {
    name: manifest.name,
    description: manifest.description,
    staticEquivalent: manifest.staticEquivalent,
    manifestPath,
    examples: await resolveList(manifest.examples, 'examples'),
    licenses: await resolveList(manifest.licenses, 'licenses'),
  };
  switch (manifest.kind) {
    case 'block': {
      if (path.extname(manifest.template).toLowerCase() !== '.md')
        throw invalidField(manifest.name, 'template must be a .md file.', locate(['template']));
      const template = await resolveFile(manifest.template, ['template']);
      const templateText = await readFile(template, 'utf8');
      const compiled = compileTemplate(
        templateText,
        new Set(Object.keys(manifest.attributes)),
        manifest.forms.includes('container'),
      );
      const [problem, ...more] = compiled.problems;
      if (problem !== undefined)
        throw new AgenticReportError({
          level: 'error',
          code: 'EXTENSION_TEMPLATE_INVALID',
          message: `Template of ${manifest.name}, line ${problem.line}: ${problem.message}`,
          remediation:
            'Use {{attribute}} in Markdown text or inside a quoted directive attribute value, and {{content}} alone on a line of a container block.',
          source: { file: template, line: problem.line },
          ...(more.length === 0
            ? {}
            : {
                related: more.map((next) => ({
                  level: 'error' as const,
                  code: 'EXTENSION_TEMPLATE_INVALID',
                  message: `Template of ${manifest.name}, line ${next.line}: ${next.message}`,
                  remediation: 'Fix the placeholder as described.',
                  source: { file: template, line: next.line },
                })),
              }),
        });
      const styles =
        manifest.styles === undefined
          ? undefined
          : await loadBlockStyles(manifest.name, manifest.styles, resolveFile, locate);
      const extension: BlockExtension = {
        kind: 'block',
        ...base,
        forms: manifest.forms,
        attributes: extensionAttributes(manifest.attributes),
        template,
        templateText,
        ...(styles === undefined ? {} : { styles }),
      };
      return {
        extension,
        files: [manifestPath, template, ...(styles === undefined ? [] : [styles.file])],
      };
    }
    case 'provider': {
      const [program, ...args] = manifest.command;
      if (program === undefined)
        throw invalidField(manifest.name, 'command needs a program.', locate(['command']));
      const extension: ProviderExtension = {
        kind: 'provider',
        ...base,
        forms: manifest.forms,
        attributes: extensionAttributes(manifest.attributes),
        command: [program, ...args],
        timeoutMs: manifest.timeoutMs,
      };
      return { extension, files: [manifestPath] };
    }
    case 'effect': {
      const module = await resolveFile(manifest.module, ['module']);
      const targets: EffectTarget[] = [];
      for (const [index, target] of manifest.targets.entries()) {
        const directive = authoringRegistry.directives.find(
          (candidate) => candidate.name === target.directive,
        );
        if (directive === undefined)
          throw new AgenticReportError({
            level: 'error',
            code: 'EXTENSION_TARGET_INVALID',
            message: `Effect ${manifest.name} targets ${target.directive}, which is not a built-in directive.`,
            remediation: 'Target a built-in directive such as section, card or chart.',
            source: locate(['targets', index, 'directive']),
          });
        if (directive.attributes.some((attribute) => attribute.name === target.attribute))
          throw new AgenticReportError({
            level: 'error',
            code: 'EXTENSION_TARGET_INVALID',
            message: `Effect ${manifest.name} adds ${target.attribute} to ${target.directive}, which already has that attribute.`,
            remediation: 'Choose an attribute name the directive does not define.',
            source: locate(['targets', index, 'attribute']),
          });
        const [first, ...rest] = target.values;
        if (first === undefined) throw new Error('A validated target has no values.');
        targets.push({
          directive: target.directive,
          attribute: target.attribute,
          values: [first, ...rest],
        });
      }
      const extension: EffectExtension = {
        kind: 'effect',
        ...base,
        module,
        targets,
        attributes: extensionAttributes(manifest.attributes),
        budgetBytes: manifest.budgetBytes,
        ownsScroll: manifest.ownsScroll,
      };
      return { extension, files: [manifestPath, module] };
    }
    case 'island': {
      if (!/\.html?$/iu.test(manifest.entry))
        throw invalidField(manifest.name, 'entry must be an .html file.', locate(['entry']));
      const entry = await resolveFile(manifest.entry, ['entry']);
      const assets = await resolveList(manifest.assets, 'assets');
      const extension: IslandExtension = {
        kind: 'island',
        ...base,
        entry,
        assets,
      };
      return { extension, files: [manifestPath, entry, ...assets] };
    }
    default: {
      const exhaustive: never = manifest;
      return exhaustive;
    }
  }
}

/**
 * Стили составного блока: `.css` в каталоге манифеста, только из токенов темы и шкал пакета (правила
 * `src/authoring/style-rules.ts`), вложенные в селектор элементов блока. Нарушение — отказ
 * `EXTENSION_STYLES_INVALID` со строкой файла стилей и всеми остальными нарушениями в `related`.
 */
async function loadBlockStyles(
  name: string,
  reference: string,
  resolveFile: (value: string, fieldPath: readonly (string | number)[]) => Promise<string>,
  locate: (fieldPath: readonly (string | number)[]) => SourceLocation,
): Promise<NonNullable<BlockExtension['styles']>> {
  if (path.extname(reference).toLowerCase() !== '.css')
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_STYLES_INVALID',
      message: `Extension manifest of ${name} is invalid: styles must be a .css file.`,
      remediation: 'Point styles at a .css file beside the extension manifest.',
      source: locate(['styles']),
    });
  const file = await resolveFile(reference, ['styles']);
  const css = await readFile(file, 'utf8');
  const bytes = Buffer.byteLength(css);
  if (bytes > MAX_BLOCK_STYLE_BYTES)
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_STYLES_OVER_BUDGET',
      message: `Styles of ${name} are ${bytes} bytes, above the ${MAX_BLOCK_STYLE_BYTES}-byte limit of a block.`,
      remediation:
        'A block needs a handful of rules on top of the package styles; move the look into the theme or drop rules the built-in blocks already give.',
      source: { file },
      details: { extension: name, bytes, budgetBytes: MAX_BLOCK_STYLE_BYTES },
    });
  const [first, ...more] = blockStyleViolations(css);
  const remediation =
    'Take colours, typefaces, weights, sizes and radii from theme tokens (agentic-report schema --scope theme) and the --text-* and --weight-* scales; keep the rules inside the block.';
  if (first !== undefined)
    throw new AgenticReportError({
      level: 'error',
      code: 'EXTENSION_STYLES_INVALID',
      message: `Styles of ${name}, line ${first.line}: ${first.message}.`,
      remediation,
      source: { file, line: first.line },
      details: { extension: name, violations: more.length + 1 },
      ...(more.length === 0
        ? {}
        : {
            related: more.map((next) => ({
              level: 'error' as const,
              code: 'EXTENSION_STYLES_INVALID',
              message: `Styles of ${name}, line ${next.line}: ${next.message}.`,
              remediation,
              source: { file, line: next.line },
            })),
          }),
    });
  return { file, css: scopeBlockStyles(name, css) };
}

function extensionAttributes(
  declared: Readonly<Record<string, z.infer<typeof attributeSchema>>>,
): Readonly<Record<string, ExtensionAttribute>> {
  const result: Record<string, ExtensionAttribute> = Object.create(null) as Record<
    string,
    ExtensionAttribute
  >;
  for (const [name, attribute] of Object.entries(declared)) {
    const shared = {
      ...(attribute.description === undefined ? {} : { description: attribute.description }),
      ...(attribute.required === undefined ? {} : { required: attribute.required }),
      ...(attribute.default === undefined ? {} : { default: attribute.default }),
    };
    switch (attribute.type) {
      case 'string':
        result[name] = {
          type: 'string',
          ...(attribute.maxLength === undefined ? {} : { maxLength: attribute.maxLength }),
          ...shared,
        };
        break;
      case 'number':
        result[name] = {
          type: 'number',
          ...(attribute.minimum === undefined ? {} : { minimum: attribute.minimum }),
          ...(attribute.maximum === undefined ? {} : { maximum: attribute.maximum }),
          ...shared,
        };
        break;
      case 'boolean':
        result[name] = { type: 'boolean', ...shared };
        break;
      case 'enum': {
        const [first, ...rest] = attribute.values;
        if (first === undefined) throw new Error('A validated enum has no values.');
        result[name] = { type: 'enum', values: [first, ...rest], ...shared };
        break;
      }
      default: {
        const exhaustive: never = attribute;
        return exhaustive;
      }
    }
  }
  return result;
}

function nameClashes(extensions: readonly PageExtension[]): AgenticReportError[] {
  const builtIn = new Set<string>([
    ...authoringRegistry.directives.map((directive) => directive.name),
    ISLAND_DIRECTIVE,
  ]);
  const seen = new Map<string, PageExtension>();
  const clashes: AgenticReportError[] = [];
  for (const extension of extensions) {
    const earlier = seen.get(extension.name);
    if (builtIn.has(extension.name) || earlier !== undefined)
      clashes.push(
        new AgenticReportError({
          level: 'error',
          code: 'EXTENSION_NAME_CLASH',
          message:
            earlier === undefined
              ? `Extension name ${extension.name} is a built-in directive.`
              : `Two extensions are named ${extension.name}.`,
          remediation:
            'Rename the extension; names of built-in directives and other extensions are taken.',
          source: { file: extension.manifestPath },
          details: {
            name: extension.name,
            ...(earlier === undefined ? {} : { other: earlier.manifestPath }),
          },
        }),
      );
    seen.set(extension.name, extension);
  }
  return clashes;
}

/** Два эффекта, добавляющие одно и то же имя атрибута одной директиве, не различимы у автора. */
function targetClashes(extensions: readonly PageExtension[]): AgenticReportError[] {
  const owners = new Map<string, string>();
  const clashes: AgenticReportError[] = [];
  for (const extension of extensions) {
    if (extension.kind !== 'effect') continue;
    for (const target of extension.targets) {
      const key = `${target.directive}.${target.attribute}`;
      const owner = owners.get(key);
      if (owner !== undefined && owner !== extension.name)
        clashes.push(
          new AgenticReportError({
            level: 'error',
            code: 'EXTENSION_TARGET_INVALID',
            message: `Effects ${owner} and ${extension.name} both add ${target.attribute} to ${target.directive}.`,
            remediation: 'Give one of the effects a different attribute name.',
            source: { file: extension.manifestPath },
          }),
        );
      owners.set(key, extension.name);
    }
  }
  return clashes;
}

function invalidField(name: string, message: string, source: SourceLocation): AgenticReportError {
  return new AgenticReportError({
    level: 'error',
    code: 'EXTENSION_INVALID',
    message: `Extension manifest of ${name} is invalid: ${message}`,
    remediation:
      'Follow the extension manifest format in docs/product/source-contract.md (section Extensions).',
    source,
  });
}

function declared(
  error: unknown,
  declaration: ExtensionDeclaration,
  reference: string,
): AgenticReportError {
  if (!(error instanceof AgenticReportError)) throw error;
  return new AgenticReportError(
    {
      ...error.diagnostic,
      source: declaration.location,
      details: { ...error.diagnostic.details, reference },
    },
    { cause: error },
  );
}

function issueText(issue: z.core.$ZodIssue | undefined): string {
  if (issue === undefined) return 'unknown problem.';
  const where = issue.path.length === 0 ? '' : `${issue.path.map(String).join('.')}: `;
  if (issue.code === 'unrecognized_keys') return `${where}unknown field ${issue.keys.join(', ')}.`;
  return `${where}${issue.message}`;
}

/** Диапазон поля в тексте манифеста; поле, которого нет, — диапазон ближайшего родителя. */
function fieldLocation(
  file: string,
  text: string,
  document: ReturnType<typeof parseDocument>,
  fieldPath: readonly PropertyKey[],
): SourceLocation {
  const keys = fieldPath.filter(
    (key): key is string | number => typeof key === 'string' || typeof key === 'number',
  );
  for (let length = keys.length; length >= 0; length -= 1) {
    const node = length === 0 ? document.contents : document.getIn(keys.slice(0, length), true);
    if (isNode(node) && node.range !== undefined && node.range !== null) {
      const [start, end] = node.range;
      return sourceLocationFromOffsets(file, text, start, end);
    }
  }
  return { file };
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function aggregate(failures: readonly AgenticReportError[]): AgenticReportError {
  const [first, ...rest] = failures;
  if (first === undefined) throw new Error('Aggregate requested without a failure.');
  if (rest.length === 0) return first;
  return new AgenticReportError(
    { ...first.diagnostic, related: rest.map((failure) => failure.diagnostic) },
    { cause: first },
  );
}
