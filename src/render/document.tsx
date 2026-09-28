import { renderToStaticMarkup } from 'react-dom/server';

import type { PageLocaleChoice } from '../authoring/registry.js';
import type { ResolvedTheme } from '../authoring/themes.js';
import type { ReportManifest } from '../contracts.js';
import { PACKAGE_ICON_PATHS, type PackageIconName } from '../iconography.js';
import { packageStrings, resolvePackageLocale, type PackageStrings } from '../localization.js';
import type { ResolvedReviewArtifact } from '../review/binding.js';
import type { ReviewArtifact, ReviewTargetManifest } from '../review/contract.js';
import type { NavigationItem } from './navigation.js';
import type { PublicPageMetadata } from './public-page.js';
import { themeRootAttributes } from './theme-css.js';

export type { NavigationItem } from './navigation.js';

export interface DocumentPageVariantOptions {
  readonly locale: PageLocaleChoice;
  readonly title: string;
  readonly description?: string;
  readonly language: string;
  readonly contentHtml: string;
  readonly navigation: readonly NavigationItem[];
  readonly reviewManifest: ReviewTargetManifest;
  readonly priorReview?: {
    readonly artifact: ReviewArtifact;
    readonly resolved: ResolvedReviewArtifact;
  };
}

export interface DocumentRenderOptions extends DocumentPageVariantOptions {
  readonly page: Pick<
    ReportManifest,
    | 'scheme'
    | 'layout'
    | 'progress'
    | 'opening'
    | 'attribution'
    | 'review'
    | 'schemeToggle'
    | 'motion'
  > & {
    readonly theme: ResolvedTheme;
    /** Темы переключателя вместе с темой страницы; пусто, когда переключателя нет. */
    readonly switchableThemes: readonly ResolvedTheme[];
  };
  readonly contentSecurityPolicy: string;
  readonly styles: { readonly inline?: string; readonly href?: string };
  readonly runtime: DocumentRuntime;
  /** Скрипты эффектов расширений: после рантайма, только на странице, где эффект используется. */
  readonly extensionScripts?: readonly DocumentRuntime[];
  readonly localizations?: readonly DocumentPageVariantOptions[];
  readonly publicPage?: PublicPageMetadata;
}

export type DocumentRuntime =
  | { readonly inline: string; readonly src?: never }
  | { readonly src: string; readonly inline?: never };

function themeLabel(name: string): string {
  return name
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function renderDocument(options: DocumentRenderOptions): string {
  const variants = [options, ...(options.localizations ?? [])];
  const markup = renderToStaticMarkup(
    <html
      lang={options.language}
      {...themeRootAttributes(options.page.theme)}
      data-scheme={options.page.scheme}
      data-layout={options.page.layout}
      data-progress={options.page.progress === 'none' ? undefined : options.page.progress}
      data-opening={options.page.opening}
      data-motion-level={options.page.motion}
      data-package-locale={resolvePackageLocale(options.language)}
      data-active-locale={options.locale}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={options.description ?? options.title} />
        <meta name="generator" content="agentic-report" />
        <meta httpEquiv="Content-Security-Policy" content={options.contentSecurityPolicy} />
        <title>{options.title}</title>
        {options.publicPage === undefined ? null : (
          <PublicPageHead
            metadata={options.publicPage}
            title={options.title}
            description={options.description ?? options.title}
          />
        )}
        {options.styles.inline === undefined ? null : (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: CSS is the package-owned Vite build artifact.
          <style dangerouslySetInnerHTML={{ __html: options.styles.inline }} />
        )}
        {options.styles.href === undefined ? null : (
          <link rel="stylesheet" href={options.styles.href} />
        )}
      </head>
      <body>
        <div data-localized-page-host>
          <PageVariant
            options={options}
            variants={variants}
            attribution={options.page.attribution}
            review={options.page.review}
            schemeToggle={options.page.schemeToggle}
            switchableThemes={options.page.switchableThemes}
            theme={options.page.theme.name}
          />
        </div>
        {(options.localizations ?? []).map((variant) => (
          <template key={variant.locale} data-localized-page={variant.locale}>
            <PageVariant
              options={variant}
              variants={variants}
              attribution={options.page.attribution}
              review={options.page.review}
              schemeToggle={options.page.schemeToggle}
              switchableThemes={options.page.switchableThemes}
              theme={options.page.theme.name}
            />
          </template>
        ))}
        {options.runtime.inline === undefined ? null : (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JavaScript is the package-owned Vite build artifact.
          <script dangerouslySetInnerHTML={{ __html: options.runtime.inline }} />
        )}
        {options.runtime.src === undefined ? null : <script src={options.runtime.src} defer />}
        {(options.extensionScripts ?? []).map((script) =>
          script.inline === undefined ? (
            <script key={script.src} src={script.src} defer />
          ) : (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: the effect script is bundled by the package and allowed by its CSP hash.
            <script key={script.inline} dangerouslySetInnerHTML={{ __html: script.inline }} />
          ),
        )}
      </body>
    </html>,
  );
  return `<!doctype html>${markup}`;
}

/**
 * Canonical и карточки для поисковиков и мессенджеров. Они читают статичный `<head>` и не
 * исполняют переключение языка, поэтому заголовок и описание берутся у основного варианта.
 */
function PublicPageHead({
  metadata,
  title,
  description,
}: {
  readonly metadata: PublicPageMetadata;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <>
      <link rel="canonical" href={metadata.url} />
      {metadata.languages.map((language) => (
        <link key={language} rel="alternate" hrefLang={language} href={metadata.url} />
      ))}
      {metadata.languages.length === 0 ? null : (
        <link rel="alternate" hrefLang="x-default" href={metadata.url} />
      )}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={metadata.url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {metadata.locale === undefined ? null : (
        <meta property="og:locale" content={metadata.locale} />
      )}
      {metadata.alternateLocales.map((locale) => (
        <meta key={locale} property="og:locale:alternate" content={locale} />
      ))}
      {metadata.image === undefined ? null : <meta property="og:image" content={metadata.image} />}
      <meta
        name="twitter:card"
        content={metadata.image === undefined ? 'summary' : 'summary_large_image'}
      />
      {metadata.image === undefined ? null : <meta name="twitter:image" content={metadata.image} />}
    </>
  );
}

function PageVariant({
  options,
  variants,
  attribution,
  review,
  schemeToggle,
  switchableThemes,
  theme,
}: {
  readonly options: DocumentPageVariantOptions;
  readonly variants: readonly DocumentPageVariantOptions[];
  readonly attribution: boolean;
  readonly review: boolean;
  readonly schemeToggle: boolean;
  readonly switchableThemes: readonly ResolvedTheme[];
  readonly theme: string;
}) {
  const strings = packageStrings(options.language);
  const hasNavigation = options.navigation.length >= 2;
  // Рабочее место ревью ставится только по явному согласию автора страницы: наличие целей само по
  // себе означает лишь то, что комментировать есть что, а не то, что страницу заказали как ревью.
  const hasReviewTargets = review && options.reviewManifest.targets.length > 0;
  const documentIdentity = compactDocumentIdentity(options.title);
  const usedIds = new Set(
    [...options.contentHtml.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1] ?? ''),
  );
  const contentId = allocateShellId('report-content', usedIds);
  const navigationId = allocateShellId('report-navigation', usedIds);
  const navigationHostId = allocateShellId('report-navigation-host', usedIds);
  const navigationDialogId = allocateShellId('report-navigation-dialog', usedIds);
  const navigationDialogTitleId = allocateShellId('report-navigation-dialog-title', usedIds);
  const reviewDialogId = allocateShellId('report-review-dialog', usedIds);
  const reviewDialogTitleId = allocateShellId('report-review-dialog-title', usedIds);
  const reviewPopoverId = allocateShellId('report-review-popover', usedIds);
  const reviewTargetTitleId = allocateShellId('report-review-target-title', usedIds);
  const reviewThreadTitleId = allocateShellId('report-review-thread-title', usedIds);
  return (
    <div
      className="localized-page-variant"
      data-localized-page-variant={options.locale}
      data-page-language={options.language}
      data-page-package-locale={resolvePackageLocale(options.language)}
      data-page-title={options.title}
      data-page-description={options.description ?? options.title}
      data-page-multilingual={variants.length > 1 ? 'true' : 'false'}
    >
      <a className="skip-link" href={`#${contentId}`}>
        {strings.skipToContent}
      </a>
      <header className="topbar" data-nav-outside>
        {hasNavigation ? (
          <button
            className="nav-toggle ui-button"
            data-ui-variant="quiet"
            data-ui-size="md"
            data-ui-icon-only
            data-ui-toolbar
            type="button"
            aria-controls={navigationId}
            aria-expanded="true"
            aria-label={strings.hideContents}
            title={strings.hideContents}
            data-nav-toggle
          >
            <PackageIcon name="three-bars" />
            <span data-nav-toggle-label data-topbar-control-label>
              {strings.hideContents}
            </span>
          </button>
        ) : null}
        <div className="topbar-context">
          <a
            className="topbar-title"
            href={`#${contentId}`}
            aria-label={options.title}
            title={options.title}
          >
            <span className="topbar-title-full">{options.title}</span>
            <span className="topbar-title-short">{documentIdentity}</span>
          </a>
          {hasNavigation ? (
            <span className="topbar-current">
              <span className="topbar-current-prefix">{strings.current}</span>
              <span data-topbar-current>{options.navigation[0]?.label}</span>
            </span>
          ) : null}
        </div>
        <div className="topbar-tools">
          {hasReviewTargets ? (
            <button
              className="review-toggle ui-button"
              data-ui-variant="quiet"
              data-ui-size="md"
              data-ui-icon-only
              data-ui-toolbar
              type="button"
              aria-controls={reviewDialogId}
              aria-expanded="false"
              aria-label={strings.review}
              title={strings.review}
              data-review-toggle
            >
              <PackageIcon name="comment" size={20} />
              <span data-review-toggle-label data-topbar-control-label>
                {strings.review}
              </span>
              <span className="review-toggle-count" data-review-toggle-count hidden />
            </button>
          ) : null}
          {variants.length > 1 ? (
            <label
              className="language-select ui-button"
              data-ui-variant="quiet"
              data-ui-size="md"
              data-ui-icon-only
              data-ui-toolbar
              title={strings.language}
            >
              <PackageIcon name="language" size={20} />
              <span className="visually-hidden">{strings.language}</span>
              <select
                aria-label={strings.language}
                title={strings.language}
                defaultValue={options.locale}
                data-language-select
              >
                {variants.map((variant) => (
                  <option key={variant.locale} value={variant.locale}>
                    {strings.languageName(variant.locale)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {switchableThemes.length > 0 ? (
            <label
              className="theme-select ui-button"
              data-ui-variant="quiet"
              data-ui-size="md"
              data-ui-icon-only
              data-ui-toolbar
              title={strings.chooseTheme}
            >
              <PackageIcon name="palette" size={20} />
              <span className="visually-hidden">{strings.theme}</span>
              <select
                aria-label={strings.chooseTheme}
                title={strings.chooseTheme}
                defaultValue={theme}
                data-theme-select
              >
                {switchableThemes.map((candidate) => (
                  <option key={candidate.name} value={candidate.name}>
                    {themeLabel(candidate.name)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {schemeToggle ? (
            <button
              className="scheme-toggle ui-button"
              data-ui-variant="quiet"
              data-ui-size="md"
              data-ui-icon-only
              data-ui-toolbar
              type="button"
              aria-label={strings.toggleScheme}
              title={strings.toggleScheme}
              data-scheme-toggle
            >
              <PackageIcon name="sun" size={20} />
              <span data-scheme-toggle-label data-topbar-control-label>
                {strings.scheme}
              </span>
            </button>
          ) : null}
        </div>
      </header>
      <div
        className="report-shell"
        data-has-navigation={hasNavigation ? 'true' : 'false'}
        data-nav-outside
      >
        {hasNavigation ? (
          <aside className="sidebar" id={navigationHostId} data-nav-desktop-host>
            <nav id={navigationId} aria-label={strings.documentContents} data-navigation>
              <p className="sidebar-label ui-label">{strings.onThisPage}</p>
              <ol>
                {options.navigation.map((item, index) => (
                  <li key={item.id} data-depth={item.depth}>
                    <a href={`#${item.id}`} aria-current={index === 0 ? 'location' : undefined}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        ) : null}
        <main id={contentId} className="report-content">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content passed through rehype-sanitize before this trust boundary. */}
          <article dangerouslySetInnerHTML={{ __html: options.contentHtml }} />
        </main>
      </div>
      <VariantAttribution enabled={attribution} label={strings.reportAttribution} />
      {hasNavigation ? (
        <dialog
          className="nav-dialog"
          id={navigationDialogId}
          aria-labelledby={navigationDialogTitleId}
          data-nav-dialog
        >
          <div className="nav-dialog-panel">
            <div className="nav-dialog-header">
              <p className="ui-label" id={navigationDialogTitleId}>
                {strings.contents}
              </p>
              <button
                type="button"
                className="nav-dialog-close ui-button"
                data-ui-variant="secondary"
                data-ui-size="sm"
                data-nav-close
              >
                <PackageIcon name="x" />
                {strings.close}
              </button>
            </div>
            <div data-nav-dialog-content />
          </div>
        </dialog>
      ) : null}
      {hasReviewTargets ? (
        <ReviewMarkup
          strings={strings}
          ids={{
            dialog: reviewDialogId,
            dialogTitle: reviewDialogTitleId,
            popover: reviewPopoverId,
            targetTitle: reviewTargetTitleId,
            threadTitle: reviewThreadTitleId,
          }}
        />
      ) : null}
      {switchableThemes.length > 0 ? (
        <template data-theme-catalog>
          {JSON.stringify(
            Object.fromEntries(
              switchableThemes.map((candidate) => [candidate.name, themeRootAttributes(candidate)]),
            ),
          )}
        </template>
      ) : null}
      {hasReviewTargets ? (
        <template data-review-manifest>{JSON.stringify(options.reviewManifest)}</template>
      ) : null}
      {hasReviewTargets && options.priorReview !== undefined ? (
        <template data-prior-review>{JSON.stringify(options.priorReview)}</template>
      ) : null}
    </div>
  );
}

function ReviewMarkup({
  strings,
  ids,
}: {
  readonly strings: PackageStrings;
  readonly ids: {
    readonly dialog: string;
    readonly dialogTitle: string;
    readonly popover: string;
    readonly targetTitle: string;
    readonly threadTitle: string;
  };
}) {
  return (
    <>
      <dialog
        className="review-dialog"
        id={ids.dialog}
        aria-labelledby={ids.dialogTitle}
        data-review-dialog
      >
        <div className="review-panel">
          <header className="review-panel-header">
            <div>
              <p className="review-eyebrow ui-label">{strings.reviewWorkspace}</p>
              <h2 className="ui-title" id={ids.dialogTitle}>
                {strings.reviewThisReport}
              </h2>
            </div>
            <button
              type="button"
              className="review-close ui-button"
              data-ui-variant="secondary"
              data-ui-size="sm"
              data-review-close
            >
              <PackageIcon name="x" />
              <span>{strings.close}</span>
            </button>
          </header>
          <div className="review-panel-body">
            <p className="review-error" role="alert" data-review-error hidden />
            <output className="review-summary ui-meta" aria-live="polite" data-review-summary>
              {strings.noThreads}
            </output>
            <section className="review-form-section" data-review-current-section hidden>
              <h3 className="ui-label">{strings.currentNotes}</h3>
              <ol className="review-response-list" data-review-current-list />
            </section>
            <section className="review-form-section" data-review-prior-section hidden>
              <h3 className="ui-label">{strings.previousThreads}</h3>
              <ol className="review-response-list" data-review-prior-list />
            </section>
          </div>
          <footer className="review-panel-footer">
            <label
              className="review-file-action ui-button"
              data-ui-variant="secondary"
              data-ui-size="sm"
            >
              <PackageIcon name="upload" />
              <span>{strings.importReview}</span>
              <input type="file" accept="application/json,.json" data-review-import />
            </label>
            <button
              type="button"
              className="review-primary ui-button"
              data-ui-variant="primary"
              data-ui-size="sm"
              data-review-export
            >
              <PackageIcon name="download" />
              <span>{strings.exportReview}</span>
            </button>
          </footer>
        </div>
      </dialog>
      <section
        className="review-popover ui-panel"
        id={ids.popover}
        role="dialog"
        aria-labelledby={ids.targetTitle}
        data-review-popover
        hidden
      >
        <header className="review-popover-header">
          <div>
            <h2 className="ui-title" id={ids.targetTitle} data-review-editor-title>
              {strings.noteForSelection}
            </h2>
            <p className="review-target-label ui-meta" data-review-target-label />
          </div>
          <button
            type="button"
            className="review-close ui-button"
            data-ui-variant="secondary"
            data-ui-size="sm"
            data-review-popover-close
          >
            <PackageIcon name="x" />
            <span>{strings.close}</span>
          </button>
        </header>
        <p className="review-error" role="alert" data-review-popover-error hidden />
        <ol
          className="review-response-list review-thread-messages"
          aria-labelledby={ids.threadTitle}
          data-review-thread-messages
        />
        <p id={ids.threadTitle} data-review-thread-empty>
          {strings.noMessages}
        </p>
        <label className="review-field ui-field-group">
          <span className="ui-label">{strings.newMessage}</span>
          <textarea className="ui-field" rows={3} data-review-message />
        </label>
        <div className="review-inline-actions">
          <button
            type="button"
            className="review-primary ui-button"
            data-ui-variant="primary"
            data-ui-size="sm"
            data-review-add-message
          >
            <PackageIcon name="comment" />
            <span data-review-add-message-label>{strings.addMessage}</span>
          </button>
          <button
            type="button"
            className="ui-button"
            data-ui-variant="secondary"
            data-ui-size="sm"
            data-review-cancel-message-edit
            hidden
          >
            <PackageIcon name="x" />
            <span>{strings.cancelEdit}</span>
          </button>
          <button
            type="button"
            className="ui-button"
            data-ui-variant="secondary"
            data-ui-size="sm"
            data-review-resolve-thread
            hidden
          >
            <PackageIcon name="check" />
            <span data-review-resolve-thread-label>{strings.resolveThread}</span>
          </button>
        </div>
      </section>
      <button
        type="button"
        className="review-selection-action ui-button"
        data-ui-variant="primary"
        data-ui-size="sm"
        title={strings.createNote}
        data-review-selection-action
        hidden
      >
        <PackageIcon name="pencil" />
        <PackageIcon name="comment" />
        <span data-review-selection-action-label>{strings.createNote}</span>
      </button>
    </>
  );
}

function VariantAttribution({
  enabled,
  label,
}: {
  readonly enabled: boolean;
  readonly label: string;
}) {
  return enabled ? (
    <footer className="report-attribution" data-report-attribution>
      <a href="https://agentic-report.witqq.dev/">{label}</a>
    </footer>
  ) : null;
}

function compactDocumentIdentity(title: string): string {
  const segment = title.split(/\s+(?:—|–|\||·)\s+/u, 1)[0]?.trim() || title;
  if (!/^[\p{Ll}\d_-]+$/u.test(segment)) return segment;
  return segment
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function PackageIcon({
  name,
  size = 16,
}: {
  readonly name: PackageIconName;
  readonly size?: 16 | 20;
}) {
  return (
    <svg
      className="package-icon"
      data-package-icon={name}
      data-icon-size={size}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PACKAGE_ICON_PATHS[name]} />
    </svg>
  );
}

function allocateShellId(base: string, usedIds: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}
