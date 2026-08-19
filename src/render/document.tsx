import { renderToStaticMarkup } from 'react-dom/server';

import type { ReportManifest } from '../contracts.js';

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly depth: 2 | 3;
}

export interface DocumentRenderOptions {
  readonly title: string;
  readonly description?: string;
  readonly language: string;
  readonly page: Pick<ReportManifest, 'preset' | 'theme' | 'layout' | 'tokens'>;
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
  const hasNavigation = options.navigation.length > 0;
  const usedIds = new Set(
    [...options.contentHtml.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1] ?? ''),
  );
  const contentId = allocateShellId('report-content', usedIds);
  const navigationId = allocateShellId('report-navigation', usedIds);
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
        <header className="topbar">
          {hasNavigation ? (
            <button
              className="nav-toggle"
              type="button"
              aria-controls={navigationId}
              aria-expanded="false"
              data-nav-toggle
            >
              Contents
            </button>
          ) : null}
          <a className="topbar-title" href={`#${contentId}`}>
            {options.title}
          </a>
          <button
            className="theme-toggle"
            type="button"
            aria-label="Toggle color theme"
            data-theme-toggle
          >
            Theme
          </button>
        </header>
        <div className="report-shell">
          {hasNavigation ? (
            <aside className="sidebar" id={navigationId} data-navigation>
              <nav aria-label="Document contents">
                <p className="sidebar-label">On this page</p>
                <ol>
                  {options.navigation.map((item) => (
                    <li key={item.id} data-depth={item.depth}>
                      <a href={`#${item.id}`}>{item.label}</a>
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
  if (explicitSections.length > 0) return explicitSections;
  const headingPattern = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  return [...html.matchAll(headingPattern)].map((match) => ({
    depth: Number(match[1]) as 2 | 3,
    id: match[2] ?? '',
    label: stripMarkup(match[3] ?? ''),
  }));
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
