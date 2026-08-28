import { renderToStaticMarkup } from 'react-dom/server';

import type { ReportManifest } from '../contracts.js';
import { PACKAGE_ICON_PATHS, type PackageIconName } from '../iconography.js';
import { packageStrings, resolvePackageLocale } from '../localization.js';
import type { ReviewTargetManifest } from '../review/contract.js';
import type { ResolvedReviewArtifact } from '../review/binding.js';
import type { ReviewArtifact } from '../review/contract.js';

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly depth: 2;
}

export interface DocumentRenderOptions {
  readonly title: string;
  readonly description?: string;
  readonly language: string;
  readonly page: Pick<ReportManifest, 'preset' | 'theme' | 'layout' | 'tokens' | 'scrollProgress'>;
  readonly contentHtml: string;
  readonly navigation: readonly NavigationItem[];
  readonly contentSecurityPolicy: string;
  readonly styles: { readonly inline?: string; readonly href?: string };
  readonly runtime: DocumentRuntime;
  readonly reviewManifest: ReviewTargetManifest;
  readonly priorReview?: {
    readonly artifact: ReviewArtifact;
    readonly resolved: ResolvedReviewArtifact;
  };
}

export type DocumentRuntime =
  | { readonly inline: string; readonly src?: never }
  | { readonly src: string; readonly inline?: never };

export function renderDocument(options: DocumentRenderOptions): string {
  const strings = packageStrings(options.language);
  const hasNavigation = options.navigation.length >= 2;
  const hasReviewTargets = options.reviewManifest.targets.length > 0;
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
  const reviewTargetTitleId = allocateShellId('report-review-target-title', usedIds);
  const reviewThreadTitleId = allocateShellId('report-review-thread-title', usedIds);
  const markup = renderToStaticMarkup(
    <html
      lang={options.language}
      data-preset={options.page.preset}
      data-theme={options.page.theme}
      data-layout={options.page.layout}
      data-density={options.page.tokens.density}
      data-font={options.page.tokens.font}
      data-accent={options.page.tokens.accent}
      data-width={options.page.tokens.width}
      data-radius={options.page.tokens.radius}
      data-scroll-progress={options.page.scrollProgress ? 'true' : undefined}
      data-package-locale={resolvePackageLocale(options.language)}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={options.description ?? options.title} />
        <meta name="generator" content="agentic-report" />
        <meta httpEquiv="Content-Security-Policy" content={options.contentSecurityPolicy} />
        <title>{options.title}</title>
        {options.styles.inline === undefined ? null : (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: CSS is the package-owned Vite build artifact.
          <style dangerouslySetInnerHTML={{ __html: options.styles.inline }} />
        )}
        {options.styles.href === undefined ? null : (
          <link rel="stylesheet" href={options.styles.href} />
        )}
      </head>
      <body>
        <a className="skip-link" href={`#${contentId}`}>
          {strings.skipToContent}
        </a>
        <header className="topbar" data-nav-outside>
          {hasNavigation ? (
            <button
              className="nav-toggle"
              type="button"
              aria-controls={navigationId}
              aria-expanded="true"
              aria-label={strings.hideContents}
              data-nav-toggle
            >
              <PackageIcon name="three-bars" />
              <span data-nav-toggle-label>{strings.hideContents}</span>
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
          {hasReviewTargets ? (
            <button
              className="review-toggle"
              type="button"
              aria-controls={reviewDialogId}
              aria-expanded="false"
              data-review-toggle
            >
              <span data-review-toggle-label>{strings.review}</span>
              <span className="review-toggle-count" data-review-toggle-count hidden />
            </button>
          ) : null}
          <button
            className="theme-toggle"
            type="button"
            aria-label={strings.toggleTheme}
            data-theme-toggle
          >
            <PackageIcon name="sun" />
            <span data-theme-toggle-label>{strings.theme}</span>
          </button>
        </header>
        <div className="report-shell" data-nav-outside>
          {hasNavigation ? (
            <aside className="sidebar" id={navigationHostId} data-nav-desktop-host>
              <nav id={navigationId} aria-label={strings.documentContents} data-navigation>
                <p className="sidebar-label">{strings.onThisPage}</p>
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
        {hasNavigation ? (
          <dialog
            className="nav-dialog"
            id={navigationDialogId}
            aria-labelledby={navigationDialogTitleId}
            data-nav-dialog
          >
            <div className="nav-dialog-panel">
              <div className="nav-dialog-header">
                <p id={navigationDialogTitleId}>{strings.contents}</p>
                <button type="button" className="nav-dialog-close" data-nav-close>
                  <PackageIcon name="x" />
                  {strings.close}
                </button>
              </div>
              <div data-nav-dialog-content />
            </div>
          </dialog>
        ) : null}
        {hasReviewTargets ? (
          <dialog
            className="review-dialog"
            id={reviewDialogId}
            aria-labelledby={reviewDialogTitleId}
            data-review-dialog
          >
            <div className="review-panel">
              <header className="review-panel-header">
                <div>
                  <p className="review-eyebrow">{strings.reviewWorkspace}</p>
                  <h2 id={reviewDialogTitleId}>{strings.reviewThisReport}</h2>
                </div>
                <button type="button" className="review-close" data-review-close>
                  {strings.close}
                </button>
              </header>
              <div className="review-panel-body">
                <p className="review-error" role="alert" data-review-error hidden />
                <output className="review-summary" aria-live="polite" data-review-summary>
                  {strings.noThreads}
                </output>
                <section
                  className="review-form-section review-target-editor"
                  aria-labelledby={reviewTargetTitleId}
                  data-review-target-editor
                  hidden
                >
                  <h3 id={reviewTargetTitleId}>{strings.discussionSelected}</h3>
                  <p className="review-target-label" data-review-target-label />
                  <ol
                    className="review-response-list"
                    aria-labelledby={reviewThreadTitleId}
                    data-review-thread-messages
                  />
                  <p id={reviewThreadTitleId} data-review-thread-empty>
                    {strings.noMessages}
                  </p>
                  <label className="review-field">
                    <span>{strings.newMessage}</span>
                    <textarea rows={4} data-review-message />
                  </label>
                  <div className="review-inline-actions">
                    <button type="button" className="review-primary" data-review-add-message>
                      {strings.addMessage}
                    </button>
                    <button type="button" data-review-cancel-message-edit hidden>
                      {strings.cancelEdit}
                    </button>
                    <button type="button" data-review-resolve-thread hidden>
                      {strings.resolveThread}
                    </button>
                  </div>
                </section>
                <section className="review-form-section" data-review-prior-section hidden>
                  <h3>{strings.previousThreads}</h3>
                  <ol className="review-response-list" data-review-prior-list />
                </section>
              </div>
              <footer className="review-panel-footer">
                <label className="review-file-action">
                  {strings.importReview}
                  <input type="file" accept="application/json,.json" data-review-import />
                </label>
                <button type="button" className="review-primary" data-review-export>
                  {strings.exportReview}
                </button>
                <button type="button" data-review-exit>
                  {strings.exitReview}
                </button>
              </footer>
            </div>
          </dialog>
        ) : null}
        <template data-review-manifest>{JSON.stringify(options.reviewManifest)}</template>
        {options.priorReview === undefined ? null : (
          <template data-prior-review>{JSON.stringify(options.priorReview)}</template>
        )}
        {options.runtime.inline === undefined ? null : (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JavaScript is the package-owned Vite build artifact.
          <script dangerouslySetInnerHTML={{ __html: options.runtime.inline }} />
        )}
        {options.runtime.src === undefined ? null : <script src={options.runtime.src} defer />}
      </body>
    </html>,
  );
  return `<!doctype html>${markup}`;
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

function PackageIcon({ name }: { readonly name: PackageIconName }) {
  return (
    <svg
      className="package-icon"
      data-package-icon={name}
      viewBox="0 0 16 16"
      width="16"
      height="16"
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

export function extractNavigation(html: string): readonly NavigationItem[] {
  const explicitSections = [
    ...html.matchAll(
      /<section\s+([^>]*\bdata-semantic="section"[^>]*)>\s*<h2\s+[^>]*>([\s\S]*?)<\/h2>/g,
    ),
  ].map((match) => {
    const attributes = match[1] ?? '';
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1] ?? '';
    const nav = /\bdata-nav="([^"]+)"/u.exec(attributes)?.[1];
    return { depth: 2 as const, id, label: stripMarkup(nav ?? match[2] ?? '') };
  });
  if (explicitSections.length > 0) {
    return explicitSections.length >= 2 ? explicitSections : [];
  }
  const headingPattern = /<h2\s+([^>]*)>([\s\S]*?)<\/h2>/g;
  const legacySections = [...html.matchAll(headingPattern)]
    .filter((match) => !/\bdata-navigation-exclude(?:="")?/u.test(match[1] ?? ''))
    .map((match) => ({
      depth: 2 as const,
      id: /\bid="([^"]+)"/u.exec(match[1] ?? '')?.[1] ?? '',
      label: stripMarkup(match[2] ?? ''),
    }))
    .filter((item) => item.id.length > 0);
  return legacySections.length >= 2 ? legacySections : [];
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .trim();
}
