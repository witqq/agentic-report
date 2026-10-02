import { homedir } from 'node:os';
import path from 'node:path';

export interface RuntimeEnvironment {
  readonly ci: boolean;
  readonly noColor: boolean;
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  return {
    ci: process.env.CI === 'true',
    noColor: process.env.NO_COLOR !== undefined || !process.stderr.isTTY,
  };
}

/**
 * Окружение программы-поставщика расширения (`kind: provider`): только то, без чего программа не
 * найдёт себя и не прочитает текст, — путь поиска, домашний и временный каталоги, язык и кодировка.
 * Токены, ключи и прочие переменные сборки поставщику не передаются: всё, что ему нужно, он получает
 * на входе или читает сам из каталога расширения.
 */
const PROVIDER_ENVIRONMENT_NAMES = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'SYSTEMROOT',
  'PATHEXT',
  'COMSPEC',
] as const;

export function getProviderEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of PROVIDER_ENVIRONMENT_NAMES) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

/** Codex is the user's installed agent and retains its authentication and managed configuration. */
export function getAgentEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env };
}

/** Identity/endpoint of the existing author session; never starts a replacement agent. */
export function getCodexSessionEnvironment(): { threadId?: string; socketPath: string } {
  const threadId = process.env.CODEX_THREAD_ID ?? process.env.CODEX_SESSION_ID;
  return {
    ...(threadId ? { threadId } : {}),
    socketPath:
      process.env.CODEX_APP_SERVER_SOCKET ??
      path.join(
        process.env.CODEX_HOME ?? path.join(homedir(), '.codex'),
        'app-server-control',
        'app-server-control.sock',
      ),
  };
}
