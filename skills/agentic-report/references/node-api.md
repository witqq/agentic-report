# Use the Node API

Import the published ESM package root, `agentic-report`, from Node.js 24.18.0 or newer. The root import checks the installed package's Node engine requirement and throws `AgenticReportError` when it is not met. The package has a second public entry, `agentic-report/effect`, for code inside an effect extension; its contract is in [`effect-api.md`](effect-api.md). The command-line `snapshot` and `effect-check` operations are **not** root exports: use the [CLI reference](cli.md) for browser measurements and effect checks.

The source input accepted by page operations is a path to a page entry or source directory. Source references are confined to that source root. These calls work on local files; they do not fetch authored content from the network. `validateReport`, `inspectReport`, and `inspectReview` read and prepare source without writing an artifact. Preparation can **execute a declared provider extension**, so only prepare trusted sources. `buildReport` writes the output artifact; `fixReport` writes exact, computed replacements to authored source; `initProject`, `createBrandTheme`, and `generateSitemap` also write files. Review parsing, proposal checks, and discovery do not read page files.

## Public exports

Every name below is exported from the package root. The remaining sections explain signatures, behavior, and nested results.

| Name                                   | Kind and role                                                  |
| -------------------------------------- | -------------------------------------------------------------- |
| `buildReport`                          | Async function; compile and write a page.                      |
| `inspectReport`                        | Async function; inspect prepared source.                       |
| `validateReport`                       | Async function; validate prepared source.                      |
| `inspectReview`                        | Async function; bind a review to current source.               |
| `fixReport`                            | Async function; apply exact source repairs.                    |
| `generateSitemap`                      | Async function; write a sitemap and robots file.               |
| `initProject`                          | Async function; create a starter project.                      |
| `createBrandTheme`                     | Async function; write a brand theme.                           |
| `MULTILINGUAL_REVIEW_CONTRACT_VERSION` | Constant; multilingual review artifact version.                |
| `REVIEW_CONTRACT_VERSION`              | Constant; single-language review artifact version.             |
| `REVIEW_TARGET_MANIFEST_VERSION`       | Constant; review target manifest version.                      |
| `parseReviewArtifact`                  | Function; validate and normalize a review object.              |
| `parseReviewTargetManifest`            | Function; validate a target manifest object.                   |
| `serializeReviewArtifact`              | Function; serialize a validated review.                        |
| `AgenticReportError`                   | Error class carrying a diagnostic.                             |
| `EXTENSION_PROPOSAL_CONTRACT_VERSION`  | Constant; core proposal contract version.                      |
| `getExtensionProposalSchema`           | Function; return proposal JSON Schema.                         |
| `getExtensionProposalTemplate`         | Function; return proposal template.                            |
| `validateExtensionProposal`            | Function; check proposal structure.                            |
| `getAuthoringSchema`                   | Function; return an authoring JSON Schema.                     |
| `getSourceContract`                    | Function; return source discovery data.                        |
| `listExamples`                         | Function; list packaged examples.                              |
| `sourceContract`                       | Frozen source discovery value.                                 |
| `AppliedFix`                           | Type; one source repair written by `fixReport`.                |
| `BuildReportOptions`                   | Type; build input, output, review, format and sharing options. |
| `BuildReportResult`                    | Type; built artifact and diagnostics.                          |
| `BrandThemeRole`                       | Type; adjusted colour role.                                    |
| `CreateBrandThemeOptions`              | Type; brand colours and destination.                           |
| `CreateBrandThemeResult`               | Type; written theme and role adjustments.                      |
| `Diagnostic`                           | Type; structured warning or error.                             |
| `DiagnosticFix`                        | Type; exact replacement span.                                  |
| `FixReportOptions`                     | Type; source repair input.                                     |
| `FixReportResult`                      | Type; applied and remaining repairs.                           |
| `GenerateSitemapOptions`               | Type; static tree input.                                       |
| `GenerateSitemapResult`                | Type; generated index paths and URLs.                          |
| `InitProjectOptions`                   | Type; destination and starter ID.                              |
| `InitProjectResult`                    | Type; starter project paths and files.                         |
| `InspectReportOptions`                 | Type; source inspection input.                                 |
| `InspectReportResult`                  | Type; structure and observed contract data.                    |
| `InspectReviewOptions`                 | Type; source and review sidecar input.                         |
| `InspectReviewResult`                  | Type; bound review status and threads.                         |
| `OutputFormat`                         | Type; single-file or directory output.                         |
| `ReportManifest`                       | Type; validated page manifest.                                 |
| `ReportManifestInput`                  | Type; authored manifest input.                                 |
| `ValidateReportOptions`                | Type; validation input.                                        |
| `ValidateReportResult`                 | Type; resolved format and warnings.                            |
| `ReviewArtifact`                       | Type; single-language or multilingual review.                  |
| `MultilingualReviewArtifact`           | Type; review with locale.                                      |
| `SingleLanguageReviewArtifact`         | Type; review without locale.                                   |
| `ReviewBinding`                        | Type; review location binding status.                          |
| `ReviewMessage`                        | Type; one review message.                                      |
| `ReviewSelectionAnchor`                | Type; selected text span and quote.                            |
| `ReviewSelectionBoundary`              | Type; selected text boundary.                                  |
| `ReviewThread`                         | Type; review conversation.                                     |
| `ReviewThreadSegment`                  | Type; one revision's review target and messages.               |
| `ReviewTargetManifest`                 | Type; report revision and targets.                             |
| `ReviewTargetReference`                | Type; one source target.                                       |
| `ExtensionProposal`                    | Type; proposed universal capability.                           |
| `ExtensionTrustBoundary`               | Type; proposal security boundary.                              |
| `ExtensionProposalValidation`          | Type; structural proposal verdict.                             |
| `DirectiveName`                        | Type; built-in directive name.                                 |
| `ExampleContract`                      | Type; packaged example record.                                 |
| `SchemaScope`                          | Type; authoring schema choice.                                 |
| `SourceContract`                       | Type; installed source discovery data.                         |

## Typical consumer

The example uses only the published root entry. Pass an existing page entry as its first argument; it validates before creating `report.html`. A failed call carries a structured diagnostic, while successful analysis returns warnings separately.

```ts
import {
  AgenticReportError,
  buildReport,
  getAuthoringSchema,
  getSourceContract,
  inspectReport,
  validateReport,
  type BuildReportOptions,
  type Diagnostic,
} from 'agentic-report';

const input = process.argv[2];
if (input === undefined) throw new Error('Pass a page entry or source directory.');

const format: BuildReportOptions['format'] = 'single-file';
const reportDiagnostic = (diagnostic: Diagnostic): void => {
  console.error(`${diagnostic.code}: ${diagnostic.message}`);
  console.error(diagnostic.remediation);
};

try {
  const contract = getSourceContract();
  const schema = getAuthoringSchema('manifest');
  console.log(
    `Source contract ${contract.contractVersion}; schema keys ${Object.keys(schema).length}`,
  );

  const validation = await validateReport({ input, format });
  validation.warnings.forEach(reportDiagnostic);
  const inspection = await inspectReport({ input, format });
  console.log(inspection.structure.layout, inspection.observed.directives);

  const result = await buildReport({ input, output: 'report.html', format });
  result.warnings.forEach(reportDiagnostic);
  console.log(result.outputPath, result.contentHash);
} catch (error: unknown) {
  if (error instanceof AgenticReportError) reportDiagnostic(error.diagnostic);
  else throw error;
  process.exitCode = 1;
}
```

## Page and file operations

All functions below are asynchronous and take one options object; the types named in the table are exported from the root. `OutputFormat` is `'single-file' | 'directory'`. The source or manifest selects the default output format; `single-file` is the ordinary default. The optional `url` on build and analysis is an absolute public HTTP(S) page URL overriding the manifest URL. A `review` path is a confined review JSON sidecar, not an arbitrary external file.

| Call and options                                                                                                                                                                     | Result and effects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initProject(options: InitProjectOptions): Promise<InitProjectResult>` — `{ destination: string, starter?: string }`                                                                 | Creates an **absent** destination from a packaged starter; the parent must exist. Default starter is `document`; get other starter IDs from `listExamples()`. Returns `starterId`, `starterTitle`, resolved `projectPath`, `entryPath`, and written relative `files`. Existing destinations are refused.                                                                                                                                                                                                                                                     |
| `createBrandTheme(options: CreateBrandThemeOptions): Promise<CreateBrandThemeResult>` — `{ colors: string \| readonly string[], extends?: string, output?: string }`                 | Writes an **absent** `.yaml`, `.yml`, or `.json` file, by default `brand-theme.yaml`, in an existing directory. Supply one or two `#rgb`/`#rrggbb` colours, either as an array or a comma-separated string. `extends` names a built-in theme; absent means the default theme. Returns `themePath`, `name`, `extends`, `schemes`, and `roles`. Each `BrandThemeRole` reports `scheme`, `role`, source `from`, adjusted `value`, `lightnessShift`, and `hueShift`.                                                                                             |
| `validateReport(options: ValidateReportOptions): Promise<ValidateReportResult>` — `{ input: string, format?: OutputFormat, review?: string, url?: string }`                          | Prepares and validates without writing. Returns `contractVersion`, `projectPath`, `entryPath`, resolved `format`, `runtimePlacement` (`inline` or `external`), and `warnings`. Invalid source throws; warnings are not failures.                                                                                                                                                                                                                                                                                                                             |
| `inspectReport(options: InspectReportOptions): Promise<InspectReportResult>` — same options as `validateReport`                                                                      | Prepares without writing and reports resolved `output`, `sourceFiles`, `structure`, observed directives/resource counts, optional extension inventory, installed `catalog`, and `warnings`, plus the contract and source paths. `structure` records layout, motion, section recipes/media, independent moving elements, magnetic actions, and card groups without authored prose. `catalog` has commands, formats, starters, capabilities, and page metadata.                                                                                                |
| `buildReport(options: BuildReportOptions): Promise<BuildReportResult>` — `{ input: string, output?: string, format?: OutputFormat, review?: string, share?: boolean, url?: string }` | Validates and writes a built page. Without `output`, uses `report.html` or `report-artifact` in the working directory. `single-file` yields one HTML file; `directory` requires an absent or empty destination and writes an `index.html` plus assets. Returns `outputPath`, `format`, HTML `bytes`, `embeddedAssets`, `externalAssets`, artifact `contentHash` (SHA-256), `share`, `neutralizedSourceLinks`, `warnings`, and optional `extensions` (`name`, `kind`, `uses`, optional `bytes`, `notes`). `share: true` neutralizes workstation source links. |
| `fixReport(options: FixReportOptions): Promise<FixReportResult>` — `{ input: string, format?: OutputFormat }`                                                                        | Applies only diagnostics with exact `DiagnosticFix` replacements to authored files; no speculative content rewrite. Returns `contractVersion`, paths, `applied` (`file`, `line`, `column`, `code`, `replacement`) and `remaining` diagnostics. It can make several bounded validate-and-apply rounds; an empty `applied` array is a no-op. Inspect the diff after calling it.                                                                                                                                                                                |
| `inspectReview(options: InspectReviewOptions): Promise<InspectReviewResult>` — `{ input: string, review: string }`                                                                   | Reads and binds a confined review sidecar to the current report; writes nothing. Returns `contractVersion`, source paths, `reportRevision`, `reviewedRevision`, `reportStatus` (`exact` or `stale`), and resolved `threads`. A thread and its segments carry bindings (`exact`, `changed`, `missing`, `ambiguous`); selected-text boundaries can bind separately. Treat unresolved bindings as locations needing author review.                                                                                                                              |
| `generateSitemap(options: GenerateSitemapOptions): Promise<GenerateSitemapResult>` — `{ directory: string }`                                                                         | Scans a published static tree, indexes package-built HTML with canonical public URLs, then writes **absent** `sitemap.xml` and `robots.txt`. All indexed pages must share an origin and their URLs must match their tree paths. Returns `directory`, both output paths, sorted `urls`, and `skipped` HTML files not built by the package.                                                                                                                                                                                                                    |

`InspectReportResult.structure` has `beforeFirstSection`, `sections`, `magneticActions`, `movingElements`, and `cardGroups`. `PageSectionStructure` contains `depth`, `recipe`, `place`, `surface`, `transition`, `scene`, `interaction`, `choreography`, and `media`; `PageMediaCounts` counts `images`, `videos`, `diagrams`, `charts`, `timelines`, and `code`. `PageCardGroup` contains `cards`, `shapes`, `plain`, and `linked`. `InspectReportResult.observed.resources` counts images, videos, downloads, and fonts. This is structural inspection, not a judgment about the meaning or quality of the text.

For `ReportManifestInput` and validated `ReportManifest`, ask `getAuthoringSchema('manifest')` or consult the [generated catalogue](catalog.md). The TypeScript names are exported for typed tooling, while the registry-generated schema is the exact installed field and constraint contract.

## Discovery without a page

| Export                                       | Use                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAuthoringSchema(scope: SchemaScope)`     | Returns the JSON Schema for `'manifest'`, `'directives'`, `'source'`, or `'theme'`; use the schema to inspect exact accepted fields. `SchemaScope` is that four-value union.                                                                                                                                                                                                |
| `getSourceContract(): SourceContract`        | Returns fresh source-contract data: `contractVersion`, `source`, `directives`, `outputs`, `page`, `visualizations`, `authoredRules`, `safety`, `capabilities`, and `commands`. Each directive includes forms, attributes and their constraints/descriptions, incompatible combinations when present, children, placement, resource/runtime/security behavior, and handoffs. |
| `sourceContract: SourceContract`             | Frozen snapshot of the same installed contract. Use `getSourceContract()` when a consumer needs its own mutable copy.                                                                                                                                                                                                                                                       |
| `listExamples(): readonly ExampleContract[]` | Returns fresh packaged example records: `id`, package-relative `path`, `entry`, `title`, `description`, `classes`, `category`, optional `subvariant`, and optional `starter.default`. These paths identify packaged examples; they are not URLs.                                                                                                                            |

`DirectiveName` is the exported union of built-in directive names. `ExampleContract` and `SourceContract` are exported result types. The CLI's `describe`, `schema`, and `examples` commands expose the same discovery for a shell agent; see [CLI results](cli.md#result-fields).

## Review artifacts

These helpers operate on in-memory data and do not read or write a sidecar. To compare a sidecar with current source, call `inspectReview` above. The exported constants are `REVIEW_CONTRACT_VERSION` (single-language artifact, 3), `MULTILINGUAL_REVIEW_CONTRACT_VERSION` (artifact with `report.locale`, 4), and `REVIEW_TARGET_MANIFEST_VERSION` (target manifest, 2).

| Call                                                                                    | Behavior                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseReviewArtifact(input: unknown): ReviewArtifact`                                   | Checks exact fields, version, bounded and unique thread/segment/message identities, revisions, targets and selections; returns a normalized artifact. Legacy version 2 can be read and is normalized to the current single-language shape. Invalid input throws a contract error. |
| `serializeReviewArtifact(input: ReviewArtifact): string`                                | Validates through the parser and returns compact JSON with a final newline and threads sorted by ID. It does not write a file.                                                                                                                                                    |
| `parseReviewTargetManifest(input: unknown, targetLimit?: number): ReviewTargetManifest` | Checks the versioned manifest and unique target IDs/stable keys. The optional limit defaults to 5000 targets. Invalid input throws a contract error.                                                                                                                              |

`ReviewArtifact` is `SingleLanguageReviewArtifact | MultilingualReviewArtifact`: `contractVersion`, `report.revision` (plus `locale: 'en' | 'ru'` for multilingual), and `threads`. A `ReviewThread` has `id` and `segments`. Each `ReviewThreadSegment` has `id`, `reportRevision`, `target`, optional `selection`, `resolved`, and `messages`. A `ReviewMessage` has `id`, `author: 'user' | 'agent'`, and `message`. `ReviewTargetReference` has `id`, `kind`, SHA-256 `fingerprint`, optional `stableKey`, and a source location (`file`, `line`, `column`, `endLine`, `endColumn`). A `ReviewSelectionAnchor` has `start` and `end` `ReviewSelectionBoundary` values (`target`, `offset`) and a `quote`. `ReviewBinding` is `'exact' | 'changed' | 'missing' | 'ambiguous'`. `ReviewTargetManifest` has `contractVersion`, `reportRevision`, and `targets`.

## Propose a universal core capability

Use these in-memory helpers when a need seems common to many pages rather than specific to one design. They validate a **proposal document**, not an extension manifest and not a decision to add the feature. For a one-page block, provider, effect, or island, follow the [extension guide](extensions.md).

| Export                                                                   | Use                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXTENSION_PROPOSAL_CONTRACT_VERSION`                                    | Current proposal contract value, `1`.                                                                                                                                                                                                                               |
| `getExtensionProposalSchema()`                                           | Returns the proposal's JSON Schema.                                                                                                                                                                                                                                 |
| `getExtensionProposalTemplate(): ExtensionProposal`                      | Returns a new template with `contractVersion`, `id`, `summary`, `trustBoundary`, and all required evidence prompts. Replace its placeholders with real evidence.                                                                                                    |
| `validateExtensionProposal(input: unknown): ExtensionProposalValidation` | Returns `{ accepted: boolean, issues: readonly string[] }`; it checks shape, exact keys, required safe boundary values, and explanation lengths. `accepted` means this form passed structural validation, not that the capability has been approved or implemented. |

`ExtensionTrustBoundary` requires package-owned runtime, source-root confinement, offline and deterministic behavior, CSP compatibility, and forbids author code, callbacks, eval, dynamic imports, and network access **for a proposed core feature**. The proposal's evidence covers source grammar, execution capabilities, confinement, offline behavior, serialization, CSP/runtime, accessibility, byte/performance budgets, dependencies/licences, and compatibility. These restrictions do not redefine the separate author-code extension API.

## Errors and public types

Page and file operations reject with `AgenticReportError` for reported failures. Its `diagnostic: Diagnostic` has `level`, `code`, `message`, and `remediation`; optional `source` contains file and positions, `details` holds structured context, `related` lists other violations, and `fix` is an exact `DiagnosticFix`. `DiagnosticFix` identifies `file`, UTF-16 string offsets `start` and exclusive `end`, and `replacement`; do not treat offsets as byte positions. Diagnostic transport is sanitized, and a replacement that would be changed by credential redaction is withheld. Review parsers throw their contract error on invalid objects; that error class is not a root export.

The complete root **type-name inventory** is grouped here so a typed consumer can find each name without importing private modules:

| Group                     | Exported types                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build and source          | `BuildReportOptions`, `BuildReportResult`, `OutputFormat`, `ReportManifest`, `ReportManifestInput`                                                                                                                                                           |
| Validation and inspection | `ValidateReportOptions`, `ValidateReportResult`, `InspectReportOptions`, `InspectReportResult`, `FixReportOptions`, `FixReportResult`, `AppliedFix`, `InspectReviewOptions`, `InspectReviewResult`                                                           |
| Creation and indexing     | `InitProjectOptions`, `InitProjectResult`, `CreateBrandThemeOptions`, `CreateBrandThemeResult`, `BrandThemeRole`, `GenerateSitemapOptions`, `GenerateSitemapResult`                                                                                          |
| Diagnostics               | `Diagnostic`, `DiagnosticFix`                                                                                                                                                                                                                                |
| Review                    | `ReviewArtifact`, `SingleLanguageReviewArtifact`, `MultilingualReviewArtifact`, `ReviewBinding`, `ReviewMessage`, `ReviewSelectionAnchor`, `ReviewSelectionBoundary`, `ReviewThread`, `ReviewThreadSegment`, `ReviewTargetManifest`, `ReviewTargetReference` |
| Discovery and proposal    | `DirectiveName`, `ExampleContract`, `SchemaScope`, `SourceContract`, `ExtensionProposal`, `ExtensionTrustBoundary`, `ExtensionProposalValidation`                                                                                                            |

Only names exported by `agentic-report` are in this guide. Types for snapshots and effect checks exist in internal contracts but are not root imports; call their public CLI commands. Types and functions for effect code come from the separate [`agentic-report/effect` entry](effect-api.md).
