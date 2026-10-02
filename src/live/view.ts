export interface LiveViewSettings {
  readonly scheme?: 'system' | 'light' | 'dark';
  readonly theme?: string;
  readonly highlights: boolean;
}

export const LIVE_THEME_TOKENS = [
  '--color-bg',
  '--color-surface',
  '--color-surface-raised',
  '--color-text',
  '--color-text-muted',
  '--color-border',
  '--color-border-strong',
  '--color-accent',
  '--color-focus',
  '--radius-control',
  '--radius-card',
  '--font-body',
  '--font-mono',
  '--font-code',
  '--shadow-raised',
] as const;
