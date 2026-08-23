import { renderToStaticMarkup } from 'react-dom/server';

import type { ReportManifest } from '../contracts.js';
import { PACKAGE_ICON_PATHS, type PackageIconName } from '../iconography.js';

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
}

export type DocumentRuntime =
  | { readonly inline: string; readonly src?: never }
  | { readonly src: string; readonly inline?: never };

export function renderDocument(options: DocumentRenderOptions): string {
  const hasNavigation = options.navigation.length >= 2;
  const documentIdentity = compactDocumentIdentity(options.title);
  const usedIds = new Set(
    [...options.contentHtml.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1] ?? ''),
  );
  const contentId = allocateShellId('report-content', usedIds);
  const navigationId = allocateShellId('report-navigation', usedIds);
  const navigationHostId = allocateShellId('report-navigation-host', usedIds);
  const navigationDialogId = allocateShellId('report-navigation-dialog', usedIds);
  const navigationDialogTitleId = allocateShellId('report-navigation-dialog-title', usedIds);
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
          Skip to content
        </a>
        <header className="topbar" data-nav-outside>
          {hasNavigation ? (
            <button
              className="nav-toggle"
              type="button"
              aria-controls={navigationId}
              aria-expanded="true"
              aria-label="Hide contents"
              data-nav-toggle
            >
              <PackageIcon name="three-bars" />
              <span data-nav-toggle-label>Hide contents</span>
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
                <span className="topbar-current-prefix">Current / </span>
                <span data-topbar-current>{options.navigation[0]?.label}</span>
              </span>
            ) : null}
          </div>
          <button
            className="theme-toggle"
            type="button"
            aria-label="Toggle color theme"
            data-theme-toggle
          >
            <PackageIcon name="sun" />
            <span data-theme-toggle-label>Theme</span>
          </button>
        </header>
        <div className="report-shell" data-nav-outside>
          {hasNavigation ? (
            <aside className="sidebar" id={navigationHostId} data-nav-desktop-host>
              <nav id={navigationId} aria-label="Document contents" data-navigation>
                <p className="sidebar-label">On this page</p>
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
                <p id={navigationDialogTitleId}>Contents</p>
                <button type="button" className="nav-dialog-close" data-nav-close>
                  <PackageIcon name="x" />
                  Close
                </button>
              </div>
              <div data-nav-dialog-content />
            </div>
          </dialog>
        ) : null}
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
  const headingPattern = /<h2\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g;
  const legacySections = [...html.matchAll(headingPattern)].map((match) => ({
    depth: 2 as const,
    id: match[1] ?? '',
    label: stripMarkup(match[2] ?? ''),
  }));
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
