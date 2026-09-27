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
